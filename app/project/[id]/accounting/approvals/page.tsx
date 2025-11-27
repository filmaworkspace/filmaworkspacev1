"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Receipt,
  AlertCircle,
  Clock,
  User,
  Calendar,
  DollarSign,
  Building2,
  MessageSquare,
  Eye,
  Check,
  X,
  Filter,
  Folder,
  RefreshCw,
  Package,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface ApprovalStepStatus {
  id: string;
  order: number;
  approverType: "fixed" | "role" | "hod" | "coordinator";
  approvers: string[];
  roles?: string[];
  department?: string;
  approvedBy: string[];
  rejectedBy: string[];
  status: "pending" | "approved" | "rejected";
  requireAll: boolean;
}

interface PendingApproval {
  id: string;
  type: "po" | "invoice";
  documentId: string;
  documentNumber: string;
  projectId: string;
  projectName: string;
  supplier: string;
  amount: number;
  description: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  currentApprovalStep: number;
  approvalSteps: ApprovalStepStatus[];
  attachmentUrl?: string;
  items?: any[];
  department?: string;
  poType?: string;
  currency?: string;
}

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];

export default function ApprovalsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userPosition, setUserPosition] = useState("");
  const [projectName, setProjectName] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [filteredApprovals, setFilteredApprovals] = useState<PendingApproval[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | "po" | "invoice">("all");
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
        console.log("✅ Usuario autenticado:", user.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Load data
  useEffect(() => {
    if (!userId || !id) return;
    loadPendingApprovals();
  }, [userId, id]);

  // Apply filters
  useEffect(() => {
    let filtered = [...pendingApprovals];

    if (typeFilter !== "all") {
      filtered = filtered.filter((a) => a.type === typeFilter);
    }

    setFilteredApprovals(filtered);
    setCurrentIndex(0);
  }, [typeFilter, pendingApprovals]);

  const loadPendingApprovals = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      console.log("🔄 Cargando aprobaciones pendientes...");

      const approvals: PendingApproval[] = [];

      // Load project name and user role
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load user member data
      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        setUserRole(memberData.role || "");
        setUserDepartment(memberData.department || "");
        setUserPosition(memberData.position || "");
        console.log(`ℹ️ Usuario es ${memberData.role || memberData.position} en ${memberData.department || "proyecto"}`);
      }

      // Load POs with status "pending"
      console.log("📄 Buscando POs pendientes...");
      const posRef = collection(db, `projects/${id}/pos`);
      const posQuery = query(
        posRef,
        where("status", "==", "pending")
      );
      const posSnap = await getDocs(posQuery);
      console.log(`  → ${posSnap.size} POs pendientes encontradas`);

      // Sort by createdAt in client
      const sortedPosDocs = posSnap.docs.sort((a, b) => {
        const aDate = a.data().createdAt?.toDate() || new Date(0);
        const bDate = b.data().createdAt?.toDate() || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

      for (const poDoc of sortedPosDocs) {
        const poData = poDoc.data();
        
        // Check if user can approve this PO
        if (canUserApprove(poData, userId!, userRole, userDepartment, userPosition)) {
          approvals.push({
            id: poDoc.id,
            type: "po",
            documentId: poDoc.id,
            documentNumber: poData.number,
            projectId: id,
            projectName: projectName,
            supplier: poData.supplier,
            amount: poData.totalAmount || poData.amount || 0,
            description: poData.generalDescription || poData.description || "",
            createdAt: poData.createdAt?.toDate() || new Date(),
            createdBy: poData.createdBy,
            createdByName: poData.createdByName || "Usuario",
            currentApprovalStep: poData.currentApprovalStep || 0,
            approvalSteps: poData.approvalSteps || [],
            attachmentUrl: poData.attachmentUrl,
            items: poData.items || [],
            department: poData.department,
            poType: poData.poType,
            currency: poData.currency || "EUR",
          });
        }
      }

      // Load Invoices with status "pending_approval"
      console.log("🧾 Buscando facturas pendientes de aprobación...");
      try {
        const invoicesRef = collection(db, `projects/${id}/invoices`);
        const invoicesQuery = query(
          invoicesRef,
          where("status", "==", "pending_approval")
        );
        const invoicesSnap = await getDocs(invoicesQuery);
        console.log(`  → ${invoicesSnap.size} facturas pendientes de aprobación encontradas`);

        // Sort by createdAt in client
        const sortedInvoicesDocs = invoicesSnap.docs.sort((a, b) => {
          const aDate = a.data().createdAt?.toDate() || new Date(0);
          const bDate = b.data().createdAt?.toDate() || new Date(0);
          return bDate.getTime() - aDate.getTime();
        });

        for (const invDoc of sortedInvoicesDocs) {
          const invData = invDoc.data();
          
          // Check if user can approve this Invoice
          if (canUserApprove(invData, userId!, userRole, userDepartment, userPosition)) {
            approvals.push({
              id: invDoc.id,
              type: "invoice",
              documentId: invDoc.id,
              documentNumber: invData.number,
              projectId: id,
              projectName: projectName,
              supplier: invData.supplier,
              amount: invData.totalAmount || 0,
              description: invData.description || "",
              createdAt: invData.createdAt?.toDate() || new Date(),
              createdBy: invData.createdBy,
              createdByName: invData.createdByName || "Usuario",
              currentApprovalStep: invData.currentApprovalStep || 0,
              approvalSteps: invData.approvalSteps || [],
              attachmentUrl: invData.attachmentUrl,
              items: invData.items || [],
            });
          }
        }
      } catch (e) {
        console.log("ℹ️ No hay colección de facturas o está vacía");
      }

      // Sort by date
      approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      console.log(`✅ ${approvals.length} aprobaciones pendientes para este usuario`);
      setPendingApprovals(approvals);
      setFilteredApprovals(approvals);
      setLoading(false);
    } catch (error: any) {
      console.error("❌ Error cargando aprobaciones:", error);
      setErrorMessage(`Error al cargar: ${error.message}`);
      setLoading(false);
    }
  };

  const canUserApprove = (
    docData: any,
    userId: string,
    userRole: string,
    userDepartment: string,
    userPosition: string
  ): boolean => {
    if (!docData.approvalSteps || docData.currentApprovalStep === undefined) {
      return false;
    }

    const currentStep = docData.approvalSteps[docData.currentApprovalStep];
    if (!currentStep || currentStep.status !== "pending") {
      return false;
    }

    // Check if user already approved/rejected
    if (currentStep.approvedBy?.includes(userId) || currentStep.rejectedBy?.includes(userId)) {
      return false;
    }

    switch (currentStep.approverType) {
      case "fixed":
        return currentStep.approvers?.includes(userId) || false;

      case "role":
        return currentStep.roles?.includes(userRole) || false;

      case "hod":
        const hodDept = currentStep.department || docData.department;
        return userPosition === "HOD" && userDepartment === hodDept;

      case "coordinator":
        const coordDept = currentStep.department || docData.department;
        return userPosition === "Coordinator" && userDepartment === coordDept;

      default:
        return false;
    }
  };

  const handleApprove = async (approval: PendingApproval) => {
    if (!confirm(`¿Aprobar ${approval.type === "po" ? "la PO" : "la factura"} ${approval.documentNumber}?`)) {
      return;
    }

    setProcessing(true);
    try {
      console.log(`✅ Aprobando ${approval.type} ${approval.documentNumber}...`);
      
      const collectionName = approval.type === "po" ? "pos" : "invoices";
      const docRef = doc(db, `projects/${approval.projectId}/${collectionName}`, approval.documentId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        setErrorMessage("El documento ya no existe");
        setProcessing(false);
        return;
      }

      const docData = docSnap.data();
      const currentStepIndex = docData.currentApprovalStep || 0;
      const currentStep = docData.approvalSteps[currentStepIndex];

      // Add user to approvedBy
      const newApprovedBy = [...(currentStep.approvedBy || []), userId];

      // Determine if step is complete
      let isStepComplete = false;
      if (currentStep.requireAll) {
        // Need all approvers
        const totalApproversNeeded = currentStep.approverType === "fixed"
          ? currentStep.approvers.length
          : currentStep.approverType === "role"
          ? currentStep.roles?.length || 1
          : 1;
        isStepComplete = newApprovedBy.length >= totalApproversNeeded;
      } else {
        // Only need one
        isStepComplete = true;
      }

      const updatedSteps = [...docData.approvalSteps];
      updatedSteps[currentStepIndex] = {
        ...currentStep,
        approvedBy: newApprovedBy,
        status: isStepComplete ? "approved" : "pending",
      };

      // Check if all steps are complete
      const isLastStep = currentStepIndex === docData.approvalSteps.length - 1;
      const allStepsComplete = isStepComplete && isLastStep;

      const updates: any = {
        approvalSteps: updatedSteps,
      };

      if (isStepComplete && !isLastStep) {
        // Move to next step
        updates.currentApprovalStep = currentStepIndex + 1;
        console.log(`  → Avanzando a nivel ${currentStepIndex + 2}`);
      } else if (allStepsComplete) {
        // Fully approve document
        if (approval.type === "po") {
          updates.status = "approved";
        } else {
          // For invoices: approved means ready for payment (pending)
          updates.status = "pending";
          updates.approvalStatus = "approved";
        }
        updates.approvedAt = Timestamp.now();
        updates.approvedBy = userId;
        updates.approvedByName = userName;
        console.log(`  → Documento completamente aprobado`);

        // If PO, update budget commitment (using baseAmount, not total)
        if (approval.type === "po" && approval.items) {
          console.log(`  → Actualizando presupuesto comprometido (base imponible)...`);
          let totalBaseAmount = 0;
          
          for (const item of approval.items) {
            // Calculate base amount: quantity * unitPrice (WITHOUT VAT/IRPF)
            // If baseAmount exists and is different from totalAmount, use it
            // Otherwise calculate from quantity * unitPrice
            let itemBaseAmount = 0;
            
            if (item.baseAmount && item.baseAmount !== item.totalAmount) {
              // baseAmount exists and is different from total (correct)
              itemBaseAmount = item.baseAmount;
            } else if (item.quantity && item.unitPrice) {
              // Calculate from quantity * unitPrice
              itemBaseAmount = item.quantity * item.unitPrice;
            } else {
              // Fallback: estimate base from total (remove ~21% VAT approx)
              // This is a rough estimate for old POs without proper baseAmount
              itemBaseAmount = item.totalAmount ? item.totalAmount / 1.21 : 0;
            }
            
            console.log(`    Item: ${item.description || 'Sin descripción'}`);
            console.log(`      - quantity: ${item.quantity}, unitPrice: ${item.unitPrice}`);
            console.log(`      - baseAmount guardado: ${item.baseAmount}, totalAmount: ${item.totalAmount}`);
            console.log(`      - baseAmount calculado: ${itemBaseAmount}`);
            
            totalBaseAmount += itemBaseAmount;
            
            if (item.subAccountId) {
              // Find the subaccount and update committed with BASE amount
              const accountsRef = collection(db, `projects/${approval.projectId}/accounts`);
              const accountsSnap = await getDocs(accountsRef);
              
              for (const accountDoc of accountsSnap.docs) {
                try {
                  const subAccountRef = doc(
                    db,
                    `projects/${approval.projectId}/accounts/${accountDoc.id}/subaccounts`,
                    item.subAccountId
                  );
                  const subAccountSnap = await getDoc(subAccountRef);
                  
                  if (subAccountSnap.exists()) {
                    const currentCommitted = subAccountSnap.data().committed || 0;
                    await updateDoc(subAccountRef, {
                      committed: currentCommitted + itemBaseAmount,
                    });
                    console.log(`    → Subcuenta ${item.subAccountId}: +${itemBaseAmount} € (base)`);
                    break;
                  }
                } catch (e) {
                  // Continue to next account
                }
              }
            }
          }

          console.log(`  → Total base imponible a comprometer: ${totalBaseAmount} €`);
          
          // Update PO with committed amount (base imponible)
          updates.committedAmount = totalBaseAmount;
          updates.remainingAmount = totalBaseAmount;
        }
      }

      await updateDoc(docRef, updates);

      // Remove from pending list
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== approval.id));
      
      setSuccessMessage(
        allStepsComplete
          ? `${approval.type === "po" ? "PO" : "Factura"} aprobada completamente`
          : "Aprobación registrada. Pendiente de más aprobadores."
      );
      setTimeout(() => setSuccessMessage(""), 3000);

      // Adjust current index
      if (currentIndex >= filteredApprovals.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch (error: any) {
      console.error("❌ Error aprobando:", error);
      setErrorMessage(`Error al aprobar: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApproval || !rejectionReason.trim()) {
      setErrorMessage("Debes proporcionar un motivo de rechazo");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setProcessing(true);
    try {
      console.log(`❌ Rechazando ${selectedApproval.type} ${selectedApproval.documentNumber}...`);
      
      const collectionName = selectedApproval.type === "po" ? "pos" : "invoices";
      const docRef = doc(
        db,
        `projects/${selectedApproval.projectId}/${collectionName}`,
        selectedApproval.documentId
      );

      await updateDoc(docRef, {
        status: "rejected",
        rejectedAt: Timestamp.now(),
        rejectedBy: userId,
        rejectedByName: userName,
        rejectionReason: rejectionReason.trim(),
      });

      // Remove from pending list
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== selectedApproval.id));
      
      setSuccessMessage(`${selectedApproval.type === "po" ? "PO" : "Factura"} rechazada`);
      setTimeout(() => setSuccessMessage(""), 3000);

      setShowRejectionModal(false);
      setRejectionReason("");
      setSelectedApproval(null);

      // Adjust current index
      if (currentIndex >= filteredApprovals.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch (error: any) {
      console.error("❌ Error rechazando:", error);
      setErrorMessage(`Error al rechazar: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setProcessing(false);
    }
  };

  const currentApproval = filteredApprovals[currentIndex];

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatCurrency = (amount: number, currency: string = "EUR") => {
    const symbols: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
    return `${(amount || 0).toLocaleString()} ${symbols[currency] || currency}`;
  };

  const getApprovalProgress = (approval: PendingApproval) => {
    const totalSteps = approval.approvalSteps.length;
    const completedSteps = approval.approvalSteps.filter((s) => s.status === "approved").length;
    return { completed: completedSteps, total: totalSteps };
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando aprobaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-indigo-50 to-indigo-100 border-y border-indigo-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-indigo-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href={`/project/${id}/accounting`}
          className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
        >
          Volver a contabilidad
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <CheckCircle size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span>{errorMessage}</span>
              <button onClick={() => setErrorMessage("")} className="ml-auto">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <CheckCircle size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Mis aprobaciones
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    {filteredApprovals.length}{" "}
                    {filteredApprovals.length === 1 ? "documento pendiente" : "documentos pendientes"}
                    {userRole && <span className="text-indigo-600"> • {userRole}</span>}
                  </p>
                </div>
              </div>
              <button
                onClick={loadPendingApprovals}
                className="flex items-center gap-2 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw size={18} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
            >
              <option value="all">Todos los tipos</option>
              <option value="po">Solo POs</option>
              <option value="invoice">Solo Facturas</option>
            </select>

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Filter size={16} />
              <span>
                {pendingApprovals.filter((a) => a.type === "po").length} POs,{" "}
                {pendingApprovals.filter((a) => a.type === "invoice").length} Facturas
              </span>
            </div>
          </div>

          {/* Main Content */}
          {filteredApprovals.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <CheckCircle size={64} className="text-emerald-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                No hay aprobaciones pendientes
              </h3>
              <p className="text-slate-600">
                {typeFilter !== "all"
                  ? "Intenta ajustar los filtros"
                  : "¡Buen trabajo! Estás al día con todas tus aprobaciones"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Navigation Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Lista de aprobaciones
                  </h3>
                  <div className="space-y-2">
                    {filteredApprovals.map((approval, index) => {
                      const progress = getApprovalProgress(approval);
                      return (
                        <button
                          key={approval.id}
                          onClick={() => setCurrentIndex(index)}
                          className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                            index === currentIndex
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start gap-2 mb-1">
                            {approval.type === "po" ? (
                              <FileText size={16} className="text-indigo-600 mt-0.5" />
                            ) : (
                              <Receipt size={16} className="text-emerald-600 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {approval.type === "po" ? "PO" : "FAC"}-{approval.documentNumber}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {approval.supplier}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs font-bold text-slate-900">
                              {formatCurrency(approval.amount, approval.currency)}
                            </p>
                            <span className="text-xs text-slate-500">
                              {progress.completed}/{progress.total} niveles
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Main Approval Card */}
              <div className="lg:col-span-2">
                {currentApproval && (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {/* Header */}
                    <div
                      className={`p-6 ${
                        currentApproval.type === "po"
                          ? "bg-gradient-to-r from-indigo-500 to-indigo-700"
                          : "bg-gradient-to-r from-emerald-500 to-emerald-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {currentApproval.type === "po" ? (
                            <FileText size={32} className="text-white" />
                          ) : (
                            <Receipt size={32} className="text-white" />
                          )}
                          <div>
                            <h2 className="text-2xl font-bold text-white">
                              {currentApproval.type === "po" ? "PO" : "FAC"}-
                              {currentApproval.documentNumber}
                            </h2>
                            <p className="text-white/80 text-sm">
                              {currentApproval.department && `${currentApproval.department} • `}
                              {currentApproval.poType && `${currentApproval.poType}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white/80 text-xs">Importe total</p>
                          <p className="text-3xl font-bold text-white">
                            {formatCurrency(currentApproval.amount, currentApproval.currency)}
                          </p>
                        </div>
                      </div>

                      {/* Navigation */}
                      <div className="flex items-center justify-between text-white/90">
                        <button
                          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                          disabled={currentIndex === 0}
                          className="flex items-center gap-1 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                          <ChevronLeft size={20} />
                          Anterior
                        </button>
                        <span className="text-sm">
                          {currentIndex + 1} de {filteredApprovals.length}
                        </span>
                        <button
                          onClick={() =>
                            setCurrentIndex(
                              Math.min(filteredApprovals.length - 1, currentIndex + 1)
                            )
                          }
                          disabled={currentIndex === filteredApprovals.length - 1}
                          className="flex items-center gap-1 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                          Siguiente
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Proveedor</p>
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className="text-slate-400" />
                            <p className="text-sm font-semibold text-slate-900">
                              {currentApproval.supplier}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Fecha de creación</p>
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-slate-400" />
                            <p className="text-sm text-slate-900">
                              {formatDate(currentApproval.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Creado por</p>
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-slate-400" />
                            <p className="text-sm text-slate-900">
                              {currentApproval.createdByName}
                            </p>
                          </div>
                        </div>
                        {currentApproval.department && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Departamento</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {currentApproval.department}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      <div className="mb-6">
                        <p className="text-xs text-slate-500 mb-2">Descripción</p>
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                          {currentApproval.description || "Sin descripción"}
                        </p>
                      </div>

                      {/* Approval Progress */}
                      <div className="mb-6">
                        <p className="text-xs font-semibold text-slate-700 mb-3">
                          Progreso de aprobación
                        </p>
                        <div className="space-y-2">
                          {currentApproval.approvalSteps.map((step, index) => (
                            <div
                              key={step.id || index}
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
                                index === currentApproval.currentApprovalStep
                                  ? "border-indigo-300 bg-indigo-50"
                                  : step.status === "approved"
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                                  step.status === "approved"
                                    ? "bg-emerald-500 text-white"
                                    : index === currentApproval.currentApprovalStep
                                    ? "bg-indigo-500 text-white"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {step.status === "approved" ? (
                                  <Check size={16} />
                                ) : (
                                  step.order
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900">
                                  Nivel {step.order}
                                  {step.approverType === "role" && step.roles && (
                                    <span className="text-slate-500 font-normal">
                                      {" "}
                                      ({step.roles.join(", ")})
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-600">
                                  {(step.approvedBy || []).length} aprobación
                                  {(step.approvedBy || []).length !== 1 ? "es" : ""}
                                  {step.requireAll && " (se requieren todos)"}
                                </p>
                              </div>
                              {step.status === "approved" && (
                                <CheckCircle size={20} className="text-emerald-500" />
                              )}
                              {index === currentApproval.currentApprovalStep && step.status === "pending" && (
                                <Clock size={20} className="text-indigo-500" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Items Preview */}
                      {currentApproval.items && currentApproval.items.length > 0 && (
                        <div className="mb-6">
                          <p className="text-xs font-semibold text-slate-700 mb-2">
                            Ítems ({currentApproval.items.length})
                          </p>
                          <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                            {currentApproval.items.map((item: any, index: number) => (
                              <div
                                key={index}
                                className="flex items-start justify-between text-sm border-b border-slate-200 pb-2 last:border-0"
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-slate-900">
                                    {item.description}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {item.subAccountCode && `${item.subAccountCode} • `}
                                    {item.quantity || 0} × {(item.unitPrice || 0).toLocaleString()} €
                                  </p>
                                </div>
                                <p className="font-semibold text-slate-900">
                                  {(item.totalAmount || 0).toLocaleString()} €
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Attachment */}
                      {currentApproval.attachmentUrl && (
                        <div className="mb-6">
                          <a
                            href={currentApproval.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            <Eye size={16} />
                            Ver archivo adjunto
                          </a>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-6 border-t border-slate-200">
                        <button
                          onClick={() => handleApprove(currentApproval)}
                          disabled={processing}
                          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processing ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Procesando...
                            </>
                          ) : (
                            <>
                              <CheckCircle size={20} />
                              Aprobar
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setSelectedApproval(currentApproval);
                            setShowRejectionModal(true);
                          }}
                          disabled={processing}
                          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <XCircle size={20} />
                          Rechazar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rejection Modal */}
      {showRejectionModal && selectedApproval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Rechazar documento</h3>
                <p className="text-sm text-slate-600">
                  {selectedApproval.type === "po" ? "PO" : "FAC"}-
                  {selectedApproval.documentNumber}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Motivo del rechazo *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explica por qué rechazas este documento..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectionModal(false);
                  setRejectionReason("");
                  setSelectedApproval(null);
                }}
                className="flex-1 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={processing || !rejectionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? "Rechazando..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

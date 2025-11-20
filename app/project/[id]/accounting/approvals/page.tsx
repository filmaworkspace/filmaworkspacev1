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
  orderBy,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
}

interface ApprovalStepStatus {
  order: number;
  approvers: string[];
  approvedBy: string[];
  rejectedBy: string[];
  status: "pending" | "approved" | "rejected";
  requireAll: boolean;
}

export default function ApprovalsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [filteredApprovals, setFilteredApprovals] = useState<PendingApproval[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | "po" | "invoice">("all");
  const [showDetailModal, setShowDetailModal] = useState(false);
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
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Load project name and pending approvals
  useEffect(() => {
    if (!userId || !id) return;

    const loadPendingApprovals = async () => {
      try {
        setLoading(true);
        const approvals: PendingApproval[] = [];

        // Load project name
        const projectDoc = await getDoc(doc(db, "projects", id));
        if (projectDoc.exists()) {
          setProjectName(projectDoc.data().name || "Proyecto");
        }

        // Load POs
        const posRef = collection(db, `projects/${id}/pos`);
        const posQuery = query(posRef, where("status", "==", "pending"), orderBy("createdAt", "desc"));
        const posSnap = await getDocs(posQuery);

        for (const poDoc of posSnap.docs) {
          const poData = poDoc.data();
          
          // Check if user is an approver in current step
          if (poData.approvalSteps && poData.currentApprovalStep !== undefined) {
            const currentStep = poData.approvalSteps[poData.currentApprovalStep];
            
            if (currentStep && currentStep.approvers?.includes(userId)) {
              approvals.push({
                id: poDoc.id,
                type: "po",
                documentId: poDoc.id,
                documentNumber: poData.number,
                projectId: id,
                projectName: projectName,
                supplier: poData.supplier,
                amount: poData.totalAmount || poData.amount,
                description: poData.generalDescription || poData.description,
                createdAt: poData.createdAt?.toDate(),
                createdBy: poData.createdBy,
                createdByName: poData.createdByName,
                currentApprovalStep: poData.currentApprovalStep,
                approvalSteps: poData.approvalSteps,
                attachmentUrl: poData.attachmentUrl,
                items: poData.items,
                department: poData.department,
              });
            }
          }
        }

        // Load Invoices
        const invoicesRef = collection(db, `projects/${id}/invoices`);
        const invoicesQuery = query(
          invoicesRef,
          where("status", "==", "pending"),
          orderBy("createdAt", "desc")
        );
        const invoicesSnap = await getDocs(invoicesQuery);

        for (const invDoc of invoicesSnap.docs) {
          const invData = invDoc.data();
          
          // Check if user is an approver in current step
          if (invData.approvalSteps && invData.currentApprovalStep !== undefined) {
            const currentStep = invData.approvalSteps[invData.currentApprovalStep];
            
            if (currentStep && currentStep.approvers?.includes(userId)) {
              approvals.push({
                id: invDoc.id,
                type: "invoice",
                documentId: invDoc.id,
                documentNumber: invData.number,
                projectId: id,
                projectName: projectName,
                supplier: invData.supplier,
                amount: invData.totalAmount,
                description: invData.description,
                createdAt: invData.createdAt?.toDate(),
                createdBy: invData.createdBy,
                createdByName: invData.createdByName,
                currentApprovalStep: invData.currentApprovalStep,
                approvalSteps: invData.approvalSteps,
                attachmentUrl: invData.attachmentUrl,
                items: invData.items,
              });
            }
          }
        }

        // Sort by date
        approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        setPendingApprovals(approvals);
        setFilteredApprovals(approvals);
        setLoading(false);
      } catch (error) {
        console.error("Error cargando aprobaciones:", error);
        setErrorMessage("Error al cargar las aprobaciones pendientes");
        setLoading(false);
      }
    };

    loadPendingApprovals();
  }, [userId, id, router, projectName]);

  // Apply filters
  useEffect(() => {
    let filtered = [...pendingApprovals];

    if (typeFilter !== "all") {
      filtered = filtered.filter((a) => a.type === typeFilter);
    }

    setFilteredApprovals(filtered);
    setCurrentIndex(0);
  }, [typeFilter, pendingApprovals]);

  const handleApprove = async (approval: PendingApproval) => {
    if (!confirm(`¿Aprobar ${approval.type === "po" ? "la PO" : "la factura"} ${approval.documentNumber}?`)) {
      return;
    }

    setProcessing(true);
    try {
      const docRef = doc(
        db,
        `projects/${approval.projectId}/${approval.type === "po" ? "pos" : "invoices"}`,
        approval.documentId
      );
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        setErrorMessage("El documento ya no existe");
        return;
      }

      const docData = docSnap.data();
      const currentStep = docData.approvalSteps[docData.currentApprovalStep];

      // Add user to approvedBy
      const newApprovedBy = [...(currentStep.approvedBy || []), userId];

      // Check if step is complete
      const isStepComplete = currentStep.requireAll
        ? newApprovedBy.length === currentStep.approvers.length
        : true;

      const updatedSteps = [...docData.approvalSteps];
      updatedSteps[docData.currentApprovalStep] = {
        ...currentStep,
        approvedBy: newApprovedBy,
        status: isStepComplete ? "approved" : "pending",
      };

      // Check if all steps are complete
      const isLastStep = docData.currentApprovalStep === docData.approvalSteps.length - 1;
      const allStepsComplete = isStepComplete && isLastStep;

      const updates: any = {
        approvalSteps: updatedSteps,
      };

      if (isStepComplete && !isLastStep) {
        // Move to next step
        updates.currentApprovalStep = docData.currentApprovalStep + 1;
      } else if (allStepsComplete) {
        // Approve document
        updates.status = "approved";
        updates.approvedAt = Timestamp.now();
        updates.approvedBy = userId;
        updates.approvedByName = userName;

        // If PO, update budget commitment
        if (approval.type === "po") {
          // Update subaccount committed amount
          for (const item of approval.items || []) {
            if (item.subAccountId) {
              const accountsRef = collection(db, `projects/${approval.projectId}/accounts`);
              const accountsSnap = await getDocs(accountsRef);
              
              for (const accountDoc of accountsSnap.docs) {
                const subAccountRef = doc(
                  db,
                  `projects/${approval.projectId}/accounts/${accountDoc.id}/subaccounts`,
                  item.subAccountId
                );
                const subAccountSnap = await getDoc(subAccountRef);
                
                if (subAccountSnap.exists()) {
                  const currentCommitted = subAccountSnap.data().committed || 0;
                  await updateDoc(subAccountRef, {
                    committed: currentCommitted + item.totalAmount,
                  });
                }
              }
            }
          }
        }
      }

      await updateDoc(docRef, updates);

      // Remove from pending list
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== approval.id));
      
      setSuccessMessage(
        allStepsComplete
          ? `${approval.type === "po" ? "PO" : "Factura"} aprobada completamente`
          : "Aprobación registrada correctamente"
      );
      setTimeout(() => setSuccessMessage(""), 3000);

      // Move to next approval
      if (currentIndex >= filteredApprovals.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch (error) {
      console.error("Error aprobando:", error);
      setErrorMessage("Error al aprobar el documento");
      setTimeout(() => setErrorMessage(""), 3000);
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
      const docRef = doc(
        db,
        `projects/${selectedApproval.projectId}/${selectedApproval.type === "po" ? "pos" : "invoices"}`,
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

      // Move to next approval
      if (currentIndex >= filteredApprovals.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch (error) {
      console.error("Error rechazando:", error);
      setErrorMessage("Error al rechazar el documento");
      setTimeout(() => setErrorMessage(""), 3000);
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
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
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
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="all">Todos los tipos</option>
              <option value="po">Solo POs</option>
              <option value="invoice">Solo Facturas</option>
            </select>
          </div>

          {/* Main Content */}
          {filteredApprovals.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <CheckCircle size={64} className="text-slate-300 mx-auto mb-4" />
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
                <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Lista de aprobaciones
                  </h3>
                  <div className="space-y-2">
                    {filteredApprovals.map((approval, index) => (
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
                              {approval.type === "po" ? "PO" : "INV"}-{approval.documentNumber}
                            </p>
                            <p className="text-xs text-slate-600 truncate">
                              {approval.projectName}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">{approval.supplier}</p>
                        <p className="text-xs font-semibold text-slate-900 mt-1">
                          {approval.amount.toLocaleString()} €
                        </p>
                      </button>
                    ))}
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
                              {currentApproval.type === "po" ? "PO" : "INV"}-
                              {currentApproval.documentNumber}
                            </h2>
                            <p className="text-white/80 text-sm">
                              {currentApproval.projectName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white/80 text-xs">Importe</p>
                          <p className="text-3xl font-bold text-white">
                            {currentApproval.amount.toLocaleString()} €
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
                          {currentApproval.description}
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
                              key={index}
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
                                </p>
                                <p className="text-xs text-slate-600">
                                  {step.approvedBy.length} de {step.approvers.length} aprobado
                                  {step.requireAll && " (se requieren todos)"}
                                </p>
                              </div>
                              {step.status === "approved" && (
                                <CheckCircle size={20} className="text-emerald-500" />
                              )}
                              {index === currentApproval.currentApprovalStep && (
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
                                className="flex items-start justify-between text-sm"
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-slate-900">
                                    {item.description}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {item.quantity} × {item.unitPrice.toLocaleString()} €
                                  </p>
                                </div>
                                <p className="font-semibold text-slate-900">
                                  {item.totalAmount.toLocaleString()} €
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

                        <button
                          onClick={() => {
                            setSelectedApproval(currentApproval);
                            setShowDetailModal(true);
                          }}
                          className="px-4 py-3 border-2 border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-medium transition-colors"
                          title="Ver detalles completos"
                        >
                          <Eye size={20} />
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
                  {selectedApproval.type === "po" ? "PO" : "INV"}-
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

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
  Building2,
  Eye,
  Check,
  X,
  ArrowLeft,
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

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      else {
        setUserId(u.uid);
        setUserName(u.displayName || u.email || "Usuario");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (userId && id) loadPendingApprovals();
  }, [userId, id]);

  useEffect(() => {
    let filtered = [...pendingApprovals];
    if (typeFilter !== "all") filtered = filtered.filter((a) => a.type === typeFilter);
    setFilteredApprovals(filtered);
    setCurrentIndex(0);
  }, [typeFilter, pendingApprovals]);

  const loadPendingApprovals = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      const approvals: PendingApproval[] = [];

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        const d = memberDoc.data();
        setUserRole(d.role || "");
        setUserDepartment(d.department || "");
        setUserPosition(d.position || "");
      }

      // Load POs
      const posSnap = await getDocs(
        query(collection(db, `projects/${id}/pos`), where("status", "==", "pending"))
      );
      for (const poDoc of posSnap.docs.sort(
        (a, b) => (b.data().createdAt?.toDate() || 0) - (a.data().createdAt?.toDate() || 0)
      )) {
        const d = poDoc.data();
        if (canUserApprove(d, userId!, userRole, userDepartment, userPosition)) {
          approvals.push({
            id: poDoc.id,
            type: "po",
            documentId: poDoc.id,
            documentNumber: d.number,
            projectId: id,
            projectName,
            supplier: d.supplier,
            amount: d.totalAmount || d.amount || 0,
            description: d.generalDescription || d.description || "",
            createdAt: d.createdAt?.toDate() || new Date(),
            createdBy: d.createdBy,
            createdByName: d.createdByName || "Usuario",
            currentApprovalStep: d.currentApprovalStep || 0,
            approvalSteps: d.approvalSteps || [],
            attachmentUrl: d.attachmentUrl,
            items: d.items || [],
            department: d.department,
            poType: d.poType,
            currency: d.currency || "EUR",
          });
        }
      }

      // Load Invoices
      try {
        const invoicesSnap = await getDocs(
          query(collection(db, `projects/${id}/invoices`), where("status", "==", "pending_approval"))
        );
        for (const invDoc of invoicesSnap.docs.sort(
          (a, b) => (b.data().createdAt?.toDate() || 0) - (a.data().createdAt?.toDate() || 0)
        )) {
          const d = invDoc.data();
          if (canUserApprove(d, userId!, userRole, userDepartment, userPosition)) {
            approvals.push({
              id: invDoc.id,
              type: "invoice",
              documentId: invDoc.id,
              documentNumber: d.number,
              projectId: id,
              projectName,
              supplier: d.supplier,
              amount: d.totalAmount || 0,
              description: d.description || "",
              createdAt: d.createdAt?.toDate() || new Date(),
              createdBy: d.createdBy,
              createdByName: d.createdByName || "Usuario",
              currentApprovalStep: d.currentApprovalStep || 0,
              approvalSteps: d.approvalSteps || [],
              attachmentUrl: d.attachmentUrl,
              items: d.items || [],
            });
          }
        }
      } catch (e) {}

      approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setPendingApprovals(approvals);
      setFilteredApprovals(approvals);
      setLoading(false);
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  const canUserApprove = (
    docData: any,
    uId: string,
    uRole: string,
    uDept: string,
    uPos: string
  ): boolean => {
    if (!docData.approvalSteps || docData.currentApprovalStep === undefined) return false;
    const step = docData.approvalSteps[docData.currentApprovalStep];
    if (!step || step.status !== "pending") return false;
    if (step.approvedBy?.includes(uId) || step.rejectedBy?.includes(uId)) return false;
    switch (step.approverType) {
      case "fixed":
        return step.approvers?.includes(uId) || false;
      case "role":
        return step.roles?.includes(uRole) || false;
      case "hod":
        return uPos === "HOD" && uDept === (step.department || docData.department);
      case "coordinator":
        return uPos === "Coordinator" && uDept === (step.department || docData.department);
      default:
        return false;
    }
  };

  const handleApprove = async (approval: PendingApproval) => {
    if (
      !confirm(
        `¿Aprobar ${approval.type === "po" ? "la PO" : "la factura"} ${approval.documentNumber}?`
      )
    )
      return;
    setProcessing(true);
    try {
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
      const newApprovedBy = [...(currentStep.approvedBy || []), userId];

      let isStepComplete = currentStep.requireAll
        ? newApprovedBy.length >=
          (currentStep.approverType === "fixed"
            ? currentStep.approvers.length
            : currentStep.roles?.length || 1)
        : true;

      const updatedSteps = [...docData.approvalSteps];
      updatedSteps[currentStepIndex] = {
        ...currentStep,
        approvedBy: newApprovedBy,
        status: isStepComplete ? "approved" : "pending",
      };

      const isLastStep = currentStepIndex === docData.approvalSteps.length - 1;
      const allStepsComplete = isStepComplete && isLastStep;

      const updates: any = { approvalSteps: updatedSteps };

      if (isStepComplete && !isLastStep) {
        updates.currentApprovalStep = currentStepIndex + 1;
      } else if (allStepsComplete) {
        if (approval.type === "po") updates.status = "approved";
        else {
          updates.status = "pending";
          updates.approvalStatus = "approved";
        }
        updates.approvedAt = Timestamp.now();
        updates.approvedBy = userId;
        updates.approvedByName = userName;

        if (approval.type === "po" && approval.items) {
          let totalBaseAmount = 0;
          for (const item of approval.items) {
            let itemBaseAmount =
              item.baseAmount && item.baseAmount !== item.totalAmount
                ? item.baseAmount
                : item.quantity && item.unitPrice
                ? item.quantity * item.unitPrice
                : item.totalAmount
                ? item.totalAmount / 1.21
                : 0;
            totalBaseAmount += itemBaseAmount;
            if (item.subAccountId) {
              const accountsSnap = await getDocs(
                collection(db, `projects/${approval.projectId}/accounts`)
              );
              for (const accountDoc of accountsSnap.docs) {
                try {
                  const subAccountRef = doc(
                    db,
                    `projects/${approval.projectId}/accounts/${accountDoc.id}/subaccounts`,
                    item.subAccountId
                  );
                  const subAccountSnap = await getDoc(subAccountRef);
                  if (subAccountSnap.exists()) {
                    await updateDoc(subAccountRef, {
                      committed: (subAccountSnap.data().committed || 0) + itemBaseAmount,
                    });
                    break;
                  }
                } catch (e) {}
              }
            }
          }
          updates.committedAmount = totalBaseAmount;
          updates.remainingAmount = totalBaseAmount;
        }
      }

      await updateDoc(docRef, updates);
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== approval.id));
      setSuccessMessage(
        allStepsComplete
          ? `${approval.type === "po" ? "PO" : "Factura"} aprobada`
          : "Aprobación registrada"
      );
      setTimeout(() => setSuccessMessage(""), 3000);
      if (currentIndex >= filteredApprovals.length - 1)
        setCurrentIndex(Math.max(0, currentIndex - 1));
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApproval || !rejectionReason.trim()) {
      setErrorMessage("Debes proporcionar un motivo");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    setProcessing(true);
    try {
      const collectionName = selectedApproval.type === "po" ? "pos" : "invoices";
      await updateDoc(
        doc(db, `projects/${selectedApproval.projectId}/${collectionName}`, selectedApproval.documentId),
        {
          status: "rejected",
          rejectedAt: Timestamp.now(),
          rejectedBy: userId,
          rejectedByName: userName,
          rejectionReason: rejectionReason.trim(),
        }
      );
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== selectedApproval.id));
      setSuccessMessage(`${selectedApproval.type === "po" ? "PO" : "Factura"} rechazada`);
      setTimeout(() => setSuccessMessage(""), 3000);
      setShowRejectionModal(false);
      setRejectionReason("");
      setSelectedApproval(null);
      if (currentIndex >= filteredApprovals.length - 1)
        setCurrentIndex(Math.max(0, currentIndex - 1));
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setProcessing(false);
    }
  };

  const currentApproval = filteredApprovals[currentIndex];

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(
      date
    );

  const formatCurrency = (amount: number, currency: string = "EUR") => {
    const s: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
    return `${new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0)} ${s[currency] || currency}`;
  };

  const getApprovalProgress = (a: PendingApproval) => ({
    completed: a.approvalSteps.filter((s) => s.status === "approved").length,
    total: a.approvalSteps.length,
  });

  if (loading)
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem] border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
          <Link
            href={`/project/${id}/accounting`}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6"
          >
            <ArrowLeft size={16} />
            Volver al Panel
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center">
                <CheckCircle size={24} className="text-teal-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Mis aprobaciones</h1>
                <p className="text-slate-500 text-sm">
                  {projectName}
                  {userRole && <span className="text-slate-400"> · {userRole}</span>}
                </p>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-1">
              {(["all", "po", "invoice"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === t
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t === "all" ? "Todos" : t === "po" ? "POs" : "Facturas"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <CheckCircle size={18} className="text-emerald-600" />
            <span className="text-sm text-emerald-700 font-medium">{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle size={18} className="text-red-600" />
            <span className="text-sm text-red-700">{errorMessage}</span>
            <button
              onClick={() => setErrorMessage("")}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {filteredApprovals.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No hay aprobaciones pendientes
            </h3>
            <p className="text-slate-500 text-sm">
              {typeFilter !== "all"
                ? "Prueba a ajustar los filtros"
                : "¡Estás al día con todas tus aprobaciones!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 px-1 font-semibold">
                  Documentos · {filteredApprovals.length}
                </p>
                <div className="space-y-2">
                  {filteredApprovals.map((approval, index) => {
                    const progress = getApprovalProgress(approval);
                    return (
                      <button
                        key={approval.id}
                        onClick={() => setCurrentIndex(index)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                          index === currentIndex
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-1">
                          {approval.type === "po" ? (
                            <FileText size={14} className="text-indigo-500 mt-0.5" />
                          ) : (
                            <Receipt size={14} className="text-emerald-500 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {approval.type === "po" ? "PO" : "FAC"}-{approval.documentNumber}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{approval.supplier}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatCurrency(approval.amount, approval.currency)}
                          </p>
                          <div className="flex items-center gap-0.5">
                            {approval.approvalSteps.map((s, i) => (
                              <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  s.status === "approved"
                                    ? "bg-emerald-500"
                                    : i === approval.currentApprovalStep
                                    ? "bg-amber-500"
                                    : "bg-slate-200"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Main Card */}
            <div className="lg:col-span-2">
              {currentApproval && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  {/* Card Header */}
                  <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {currentApproval.type === "po" ? (
                          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <FileText size={20} className="text-indigo-600" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <Receipt size={20} className="text-emerald-600" />
                          </div>
                        )}
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">
                            {currentApproval.type === "po" ? "PO" : "FAC"}-
                            {currentApproval.documentNumber}
                          </h2>
                          <p className="text-sm text-slate-500">
                            {currentApproval.department && `${currentApproval.department} · `}
                            {currentApproval.poType && currentApproval.poType}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Importe</p>
                        <p className="text-xl font-bold text-slate-900">
                          {formatCurrency(currentApproval.amount, currentApproval.currency)}
                        </p>
                      </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                      <button
                        onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                        disabled={currentIndex === 0}
                        className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                      >
                        <ChevronLeft size={16} />
                        Anterior
                      </button>
                      <span className="text-sm text-slate-500">
                        {currentIndex + 1} de {filteredApprovals.length}
                      </span>
                      <button
                        onClick={() =>
                          setCurrentIndex(Math.min(filteredApprovals.length - 1, currentIndex + 1))
                        }
                        disabled={currentIndex === filteredApprovals.length - 1}
                        className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600"
                      >
                        Siguiente
                        <ChevronRight size={16} />
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
                          <Building2 size={14} className="text-slate-400" />
                          <p className="text-sm font-medium text-slate-900">
                            {currentApproval.supplier}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Fecha</p>
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          <p className="text-sm text-slate-900">
                            {formatDate(currentApproval.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Creado por</p>
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-slate-400" />
                          <p className="text-sm text-slate-900">{currentApproval.createdByName}</p>
                        </div>
                      </div>
                      {currentApproval.department && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Departamento</p>
                          <p className="text-sm font-medium text-slate-900">
                            {currentApproval.department}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                      <p className="text-xs text-slate-500 mb-2">Descripción</p>
                      <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        {currentApproval.description || "Sin descripción"}
                      </p>
                    </div>

                    {/* Approval Progress */}
                    <div className="mb-6">
                      <p className="text-xs text-slate-500 mb-3">Progreso de aprobación</p>
                      <div className="space-y-2">
                        {currentApproval.approvalSteps.map((step, index) => (
                          <div
                            key={step.id || index}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${
                              index === currentApproval.currentApprovalStep
                                ? "border-amber-200 bg-amber-50"
                                : step.status === "approved"
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-slate-100 bg-slate-50"
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                                step.status === "approved"
                                  ? "bg-emerald-500 text-white"
                                  : index === currentApproval.currentApprovalStep
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {step.status === "approved" ? <Check size={12} /> : step.order}
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
                              <p className="text-xs text-slate-500">
                                {(step.approvedBy || []).length} aprobación
                                {(step.approvedBy || []).length !== 1 ? "es" : ""}
                                {step.requireAll && " (se requieren todos)"}
                              </p>
                            </div>
                            {step.status === "approved" && (
                              <CheckCircle size={16} className="text-emerald-500" />
                            )}
                            {index === currentApproval.currentApprovalStep &&
                              step.status === "pending" && (
                                <Clock size={16} className="text-amber-500" />
                              )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Items */}
                    {currentApproval.items && currentApproval.items.length > 0 && (
                      <div className="mb-6">
                        <p className="text-xs text-slate-500 mb-2">
                          Items ({currentApproval.items.length})
                        </p>
                        <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 max-h-48 overflow-y-auto space-y-2">
                          {currentApproval.items.map((item: any, index: number) => (
                            <div
                              key={index}
                              className="flex items-start justify-between text-sm border-b border-slate-200 pb-2 last:border-0 last:pb-0"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-slate-900">{item.description}</p>
                                <p className="text-xs text-slate-500">
                                  {item.subAccountCode && `${item.subAccountCode} · `}
                                  {item.quantity || 0} × {formatCurrency(item.unitPrice || 0)}
                                </p>
                              </div>
                              <p className="font-medium text-slate-900">
                                {formatCurrency(item.totalAmount || 0)}
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
                          className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 font-medium"
                        >
                          <Eye size={14} />
                          Ver archivo adjunto
                        </a>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-6 border-t border-slate-200">
                      <button
                        onClick={() => handleApprove(currentApproval)}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {processing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <CheckCircle size={18} />
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
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <XCircle size={18} />
                        Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Rejection Modal */}
      {showRejectionModal && selectedApproval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Rechazar documento</h3>
              <p className="text-sm text-slate-500">
                {selectedApproval.type === "po" ? "PO" : "FAC"}-{selectedApproval.documentNumber}
              </p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Motivo del rechazo *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explica el motivo del rechazo..."
                rows={4}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white resize-none text-sm"
              />

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    setRejectionReason("");
                    setSelectedApproval(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {processing ? "Rechazando..." : "Confirmar rechazo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

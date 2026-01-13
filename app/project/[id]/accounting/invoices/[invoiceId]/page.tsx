"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, getDoc, collection, getDocs, updateDoc, query, where, orderBy, Timestamp } from "firebase/firestore";
import { Receipt, Edit, Download, Lock, Unlock, XCircle, CheckCircle, Clock, Ban, Archive, Building2, Calendar, User, Hash, FileUp, ChevronLeft, ChevronRight, AlertTriangle, KeyRound, AlertCircle, ShieldAlert, ExternalLink, MoreHorizontal, CreditCard, FileText, Link as LinkIcon, Eye, EyeOff } from "lucide-react";
import { useAccountingPermissions } from "@/hooks/useAccountingPermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type InvoiceStatus = "draft" | "pending" | "pending_approval" | "approved" | "rejected" | "paid" | "cancelled";
type DocumentType = "invoice" | "proforma" | "autonomo" | "ticket";

interface InvoiceItem {
  description: string;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
  poItemId?: string;
  poItemIndex?: number;
  isNewItem?: boolean;
}

interface Payment {
  id: string;
  amount: number;
  date: Date;
  method: string;
  reference?: string;
}

interface Invoice {
  id: string;
  documentType: DocumentType;
  number: string;
  displayNumber: string;
  supplier: string;
  supplierId: string;
  department?: string;
  description: string;
  notes?: string;
  items: InvoiceItem[];
  baseAmount: number;
  vatAmount: number;
  irpfAmount: number;
  totalAmount: number;
  dueDate: Date;
  status: InvoiceStatus;
  approvalStatus?: string;
  attachmentUrl?: string;
  attachmentFileName?: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  approvedAt?: Date;
  approvedBy?: string;
  approvedByName?: string;
  paidAt?: Date;
  paidAmount?: number;
  cancelledAt?: Date;
  cancelledByName?: string;
  cancellationReason?: string;
  poId?: string;
  poNumber?: string;
  requiresReplacement?: boolean;
  replacedByInvoiceId?: string;
  isReplacement?: boolean;
  replacesDocumentId?: string;
  replacesDocumentNumber?: string;
}

interface LinkedPO {
  id: string;
  number: string;
  supplier: string;
  baseAmount: number;
  invoicedAmount: number;
  status: string;
}

const STATUS_CONFIG: Record<InvoiceStatus, { bg: string; text: string; label: string; icon: typeof Clock }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador", icon: Edit },
  pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente pago", icon: Clock },
  pending_approval: { bg: "bg-amber-50", text: "text-amber-700", label: "Pend. aprobación", icon: Clock },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada", icon: CheckCircle },
  rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada", icon: XCircle },
  paid: { bg: "bg-blue-50", text: "text-blue-700", label: "Pagada", icon: CreditCard },
  cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada", icon: Ban },
};

const DOC_TYPE_CONFIG: Record<DocumentType, { label: string; code: string; color: string }> = {
  invoice: { label: "Factura", code: "FAC", color: "text-indigo-600" },
  proforma: { label: "Proforma", code: "PRF", color: "text-violet-600" },
  autonomo: { label: "Autónomo", code: "AUT", color: "text-amber-600" },
  ticket: { label: "Ticket", code: "TKT", color: "text-emerald-600" },
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const invoiceId = params?.invoiceId as string;

  const { loading: permissionsLoading, error: permissionsError, permissions } = useAccountingPermissions(projectId);

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [linkedPO, setLinkedPO] = useState<LinkedPO | null>(null);
  const [allInvoiceIds, setAllInvoiceIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [subAccountsBudget, setSubAccountsBudget] = useState<Record<string, { committed: number; actual: number; budgeted: number }>>({});

  useEffect(() => {
    if (projectId && invoiceId && !permissionsLoading) loadData();
  }, [projectId, invoiceId, permissionsLoading]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const invoiceDoc = await getDoc(doc(db, `projects/${projectId}/invoices`, invoiceId));
      if (!invoiceDoc.exists()) {
        router.push(`/project/${projectId}/accounting/invoices`);
        return;
      }

      const data = invoiceDoc.data();
      const invoiceData: Invoice = {
        id: invoiceDoc.id,
        documentType: data.documentType || "invoice",
        number: data.number || "",
        displayNumber: data.displayNumber || `FAC-${data.number}`,
        supplier: data.supplier || "",
        supplierId: data.supplierId || "",
        department: data.department,
        description: data.description || "",
        notes: data.notes,
        items: data.items || [],
        baseAmount: data.baseAmount || 0,
        vatAmount: data.vatAmount || 0,
        irpfAmount: data.irpfAmount || 0,
        totalAmount: data.totalAmount || 0,
        dueDate: data.dueDate?.toDate() || new Date(),
        status: data.status || "pending",
        approvalStatus: data.approvalStatus,
        attachmentUrl: data.attachmentUrl,
        attachmentFileName: data.attachmentFileName,
        createdAt: data.createdAt?.toDate() || new Date(),
        createdBy: data.createdBy || "",
        createdByName: data.createdByName || "",
        approvedAt: data.approvedAt?.toDate(),
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName,
        paidAt: data.paidAt?.toDate(),
        paidAmount: data.paidAmount,
        cancelledAt: data.cancelledAt?.toDate(),
        cancelledByName: data.cancelledByName,
        cancellationReason: data.cancellationReason,
        poId: data.poId,
        poNumber: data.poNumber,
        requiresReplacement: data.requiresReplacement,
        replacedByInvoiceId: data.replacedByInvoiceId,
        isReplacement: data.isReplacement,
        replacesDocumentId: data.replacesDocumentId,
        replacesDocumentNumber: data.replacesDocumentNumber,
      };

      setInvoice(invoiceData);

      // Load linked PO if exists
      if (data.poId) {
        try {
          const poDoc = await getDoc(doc(db, `projects/${projectId}/pos`, data.poId));
          if (poDoc.exists()) {
            const poData = poDoc.data();
            setLinkedPO({
              id: poDoc.id,
              number: poData.number,
              supplier: poData.supplier,
              baseAmount: poData.baseAmount || 0,
              invoicedAmount: poData.invoicedAmount || 0,
              status: poData.status,
            });
          }
        } catch (e) {}
      }

      // Load all invoice IDs for navigation
      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${projectId}/invoices`), orderBy("createdAt", "asc")));
      const ids = invoicesSnapshot.docs.map((d) => d.id);
      setAllInvoiceIds(ids);
      setCurrentIndex(ids.indexOf(invoiceId));

      // Load subaccounts budget info
      const subAccountIds = new Set<string>();
      (data.items || []).forEach((item: any) => { if (item.subAccountId) subAccountIds.add(item.subAccountId); });
      if (subAccountIds.size > 0) {
        const accountsSnapshot = await getDocs(collection(db, `projects/${projectId}/accounts`));
        const budgetInfo: Record<string, { committed: number; actual: number; budgeted: number }> = {};
        for (const accountDoc of accountsSnapshot.docs) {
          const subAccountsSnapshot = await getDocs(collection(db, `projects/${projectId}/accounts/${accountDoc.id}/subaccounts`));
          for (const subDoc of subAccountsSnapshot.docs) {
            if (subAccountIds.has(subDoc.id)) {
              const subData = subDoc.data();
              budgetInfo[subDoc.id] = { committed: subData.committed || 0, actual: subData.actual || 0, budgeted: subData.budgeted || 0 };
            }
          }
        }
        setSubAccountsBudget(budgetInfo);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const verifyPassword = async (): Promise<boolean> => {
    if (!passwordInput.trim()) {
      setPasswordError("Introduce tu contraseña");
      return false;
    }
    const user = auth.currentUser;
    if (!user || !user.email) {
      setPasswordError("No hay usuario autenticado");
      return false;
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordInput);
      await reauthenticateWithCredential(user, credential);
      setPasswordError("");
      return true;
    } catch (error: any) {
      setPasswordError(error.code === "auth/wrong-password" || error.code === "auth/invalid-credential" ? "Contraseña incorrecta" : "Error de autenticación");
      return false;
    }
  };

  const resetModals = () => {
    setPasswordInput("");
    setPasswordError("");
    setCancellationReason("");
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  const formatDate = (date: Date) => (date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "long", year: "numeric" }).format(date) : "-");
  const formatDateTime = (date: Date) => (date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "-");

  const navigateInvoice = (direction: "prev" | "next") => {
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < allInvoiceIds.length) {
      router.push(`/project/${projectId}/accounting/invoices/${allInvoiceIds[newIndex]}`);
    }
  };

  const handleCancelInvoice = async () => {
    if (!invoice || !cancellationReason.trim()) return;
    const verified = await verifyPassword();
    if (!verified) return;
    setProcessing(true);
    try {
      // If invoice was approved/paid, revert budget changes
      if (invoice.status === "approved" || invoice.status === "paid" || invoice.status === "pending") {
        const accountsSnapshot = await getDocs(collection(db, `projects/${projectId}/accounts`));
        for (const item of invoice.items) {
          if (item.subAccountId) {
            for (const accountDoc of accountsSnapshot.docs) {
              try {
                const subAccountRef = doc(db, `projects/${projectId}/accounts/${accountDoc.id}/subaccounts`, item.subAccountId);
                const subAccountSnap = await getDoc(subAccountRef);
                if (subAccountSnap.exists()) {
                  const currentActual = subAccountSnap.data().actual || 0;
                  const currentCommitted = subAccountSnap.data().committed || 0;
                  const updates: any = { actual: Math.max(0, currentActual - (item.baseAmount || 0)) };
                  // If had PO, restore committed
                  if (invoice.poId) {
                    updates.committed = currentCommitted + (item.baseAmount || 0);
                  }
                  await updateDoc(subAccountRef, updates);
                  break;
                }
              } catch (e) {}
            }
          }
        }

        // If had PO, restore PO invoiced amount
        if (invoice.poId) {
          try {
            const poRef = doc(db, `projects/${projectId}/pos`, invoice.poId);
            const poSnap = await getDoc(poRef);
            if (poSnap.exists()) {
              const currentInvoiced = poSnap.data().invoicedAmount || 0;
              await updateDoc(poRef, {
                invoicedAmount: Math.max(0, currentInvoiced - invoice.baseAmount),
                remainingAmount: (poSnap.data().baseAmount || 0) - Math.max(0, currentInvoiced - invoice.baseAmount),
              });
            }
          } catch (e) {}
        }
      }

      await updateDoc(doc(db, `projects/${projectId}/invoices`, invoice.id), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: permissions.userId,
        cancelledByName: permissions.userName,
        cancellationReason: cancellationReason.trim(),
      });
      setShowCancelModal(false);
      resetModals();
      await loadData();
    } catch (error) {
      alert("Error al anular la factura");
    } finally {
      setProcessing(false);
    }
  };

  const canCancel = () => {
    if (!invoice) return false;
    if (invoice.status === "cancelled") return false;
    if (invoice.status === "paid") return false;
    return permissions.isProjectRole;
  };

  const canEdit = () => {
    if (!invoice) return false;
    return invoice.status === "draft" || invoice.status === "rejected";
  };

  const isPDF = (url?: string) => {
    if (!url) return false;
    return url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('application/pdf');
  };

  if (permissionsLoading || loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (permissionsError || !permissions.hasAccountingAccess || accessDenied) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-500 mb-6">{permissionsError || "No tienes permisos para ver esta factura"}</p>
          <Link href={`/project/${projectId}/accounting/invoices`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
            <ChevronLeft size={16} />
            Volver a Facturas
          </Link>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const config = STATUS_CONFIG[invoice.status];
  const docConfig = DOC_TYPE_CONFIG[invoice.documentType];
  const StatusIcon = config.icon;

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      <div className="mt-[4.5rem]">
        <div className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-3">
              <Receipt size={24} className="text-slate-400" />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">{docConfig.label}</h1>
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-mono font-medium">
                    {invoice.displayNumber}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium text-sm ${config.bg} ${config.text}`}>
                    <StatusIcon size={14} />
                    {config.label}
                  </span>
                  {invoice.poNumber && (
                    <Link href={`/project/${projectId}/accounting/pos/${invoice.poId}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors">
                      <LinkIcon size={12} />
                      PO-{invoice.poNumber}
                    </Link>
                  )}
                </div>
                <p className="text-slate-500 text-sm mt-1">
                  {invoice.supplier}
                  {invoice.department && <span className="ml-2 text-slate-400">· {invoice.department}</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Navegación entre facturas */}
              <div className="flex items-center gap-1 mr-2">
                <button onClick={() => navigateInvoice("prev")} disabled={currentIndex <= 0} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs text-slate-500 px-2">{currentIndex + 1} / {allInvoiceIds.length}</span>
                <button onClick={() => navigateInvoice("next")} disabled={currentIndex >= allInvoiceIds.length - 1} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30">
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Botón principal según estado */}
              {canEdit() && (
                <Link href={`/project/${projectId}/accounting/invoices/${invoice.id}/edit`} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-sm font-medium">
                  <Edit size={16} />
                  Editar
                </Link>
              )}

              {invoice.status === "pending" && (
                <Link href={`/project/${projectId}/accounting/payments?invoice=${invoice.id}`} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-sm font-medium">
                  <CreditCard size={16} />
                  Ir a pagar
                </Link>
              )}

              {/* Menú de acciones */}
              <div className="relative">
                <button 
                  onClick={() => setShowActionsMenu(!showActionsMenu)} 
                  className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium"
                >
                  <MoreHorizontal size={18} />
                </button>
                
                {showActionsMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
                      {invoice.attachmentUrl && (
                        <a 
                          href={invoice.attachmentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={() => setShowActionsMenu(false)}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <Download size={16} className="text-slate-400" />
                          Descargar documento
                        </a>
                      )}

                      {canCancel() && (
                        <>
                          <div className="border-t border-slate-100 my-1" />
                          <button 
                            onClick={() => { resetModals(); setShowCancelModal(true); setShowActionsMenu(false); }} 
                            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                          >
                            <XCircle size={16} className="text-red-400" />
                            Anular factura
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Columna izquierda - Vista previa del documento */}
          <div className="space-y-6">
            {/* Descripción - arriba */}
            {invoice.description && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <h3 className="font-semibold text-slate-900 mb-2">Descripción</h3>
                <p className="text-slate-700">{invoice.description}</p>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Documento</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPreview ? "Ocultar" : "Mostrar"}
                  </button>
                  {invoice.attachmentUrl && (
                    <a
                      href={invoice.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <ExternalLink size={14} />
                      Abrir
                    </a>
                  )}
                </div>
              </div>
              
              {showPreview && (
                <div className="p-4">
                  {invoice.attachmentUrl ? (
                    isPDF(invoice.attachmentUrl) ? (
                      <iframe
                        src={`${invoice.attachmentUrl}#toolbar=0&navpanes=0`}
                        className="w-full h-[600px] rounded-xl border border-slate-200"
                        title="Vista previa del documento"
                      />
                    ) : (
                      <div className="relative">
                        <img
                          src={invoice.attachmentUrl}
                          alt="Documento"
                          className="w-full rounded-xl border border-slate-200"
                        />
                      </div>
                    )
                  ) : (
                    <div className="h-[400px] bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <FileUp size={24} className="text-slate-400" />
                        </div>
                        <p className="text-slate-500 font-medium">Sin documento adjunto</p>
                        <p className="text-sm text-slate-400 mt-1">No se ha subido ningún archivo</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notas */}
            {invoice.notes && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="font-semibold text-slate-900 mb-3">Notas</h3>
                <p className="text-sm text-slate-600">{invoice.notes}</p>
              </div>
            )}
          </div>

          {/* Columna derecha - Información y detalles */}
          <div className="space-y-6">
            {/* Resumen financiero */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Resumen</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Base imponible</span>
                  <span className="font-medium text-slate-900">{formatCurrency(invoice.baseAmount)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IVA</span>
                  <span className="font-medium text-slate-700">+{formatCurrency(invoice.vatAmount)} €</span>
                </div>
                {invoice.irpfAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">IRPF</span>
                    <span className="font-medium text-red-600">-{formatCurrency(invoice.irpfAmount)} €</span>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-200 flex justify-between">
                  <span className="font-medium text-slate-700">Total</span>
                  <span className="text-xl font-bold text-slate-900">{formatCurrency(invoice.totalAmount)} €</span>
                </div>
              </div>
            </div>

            {/* PO vinculada */}
            {linkedPO && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-indigo-900">PO Vinculada</h3>
                  <Link href={`/project/${projectId}/accounting/pos/${linkedPO.id}`} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    Ver PO <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-700">Número</span>
                    <span className="font-medium text-indigo-900">PO-{linkedPO.number}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-700">Base PO</span>
                    <span className="font-medium text-indigo-900">{formatCurrency(linkedPO.baseAmount)} €</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-700">Facturado</span>
                    <span className="font-medium text-indigo-900">{formatCurrency(linkedPO.invoicedAmount)} €</span>
                  </div>
                  <div className="pt-3 border-t border-indigo-200">
                    <div className="flex items-center justify-between text-xs text-indigo-600 mb-1">
                      <span>Uso de la PO</span>
                      <span>{linkedPO.baseAmount > 0 ? Math.round((linkedPO.invoicedAmount / linkedPO.baseAmount) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full transition-all" 
                        style={{ width: `${Math.min(100, linkedPO.baseAmount > 0 ? (linkedPO.invoicedAmount / linkedPO.baseAmount) * 100 : 0)}%` }} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Items</h3>
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">{invoice.items.length}</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {invoice.items.map((item, index) => {
                  const budget = subAccountsBudget[item.subAccountId];
                  return (
                    <div key={index} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{item.description}</p>
                          <p className="text-sm text-slate-500 mt-0.5">{item.subAccountCode} · {item.subAccountDescription}</p>
                        </div>
                        <p className="font-bold text-slate-900">{formatCurrency(item.baseAmount)} €</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{item.quantity} × {formatCurrency(item.unitPrice)} €</span>
                        {item.vatRate > 0 && <span>IVA {item.vatRate}%</span>}
                        {item.irpfRate > 0 && <span className="text-red-500">IRPF {item.irpfRate}%</span>}
                        {item.isNewItem && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Extra</span>}
                      </div>
                      {budget && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs">
                          <span className="text-slate-400">Partida:</span>
                          <span className="text-amber-600">Comprometido: {formatCurrency(budget.committed)} €</span>
                          <span className="text-emerald-600">Realizado: {formatCurrency(budget.actual)} €</span>
                          <span className="text-slate-500">Presup: {formatCurrency(budget.budgeted)} €</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Totales por tipo */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Total base imponible (coste)</span>
                  <span className="font-bold text-slate-900">{formatCurrency(invoice.baseAmount)} €</span>
                </div>
              </div>
            </div>

            {/* Detalles */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Detalles</h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Building2 size={16} className="text-slate-400" />
                  <div>
                    <p className="text-slate-500">Proveedor</p>
                    <p className="font-medium text-slate-900">{invoice.supplier}</p>
                  </div>
                </div>
                {invoice.department && (
                  <div className="flex items-center gap-3">
                    <Hash size={16} className="text-slate-400" />
                    <div>
                      <p className="text-slate-500">Departamento</p>
                      <p className="font-medium text-slate-900">{invoice.department}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-slate-400" />
                  <div>
                    <p className="text-slate-500">Fecha de creación</p>
                    <p className="font-medium text-slate-900">{formatDate(invoice.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-amber-500" />
                  <div>
                    <p className="text-slate-500">Fecha de vencimiento</p>
                    <p className="font-medium text-slate-900">{formatDate(invoice.dueDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User size={16} className="text-slate-400" />
                  <div>
                    <p className="text-slate-500">Creado por</p>
                    <p className="font-medium text-slate-900">{invoice.createdByName}</p>
                  </div>
                </div>
                {invoice.approvedAt && (
                  <div className="flex items-center gap-3">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <div>
                      <p className="text-slate-500">Aprobada</p>
                      <p className="font-medium text-slate-900">{formatDate(invoice.approvedAt)}</p>
                    </div>
                  </div>
                )}
                {invoice.paidAt && (
                  <div className="flex items-center gap-3">
                    <CreditCard size={16} className="text-blue-500" />
                    <div>
                      <p className="text-slate-500">Pagada</p>
                      <p className="font-medium text-slate-900">{formatDate(invoice.paidAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Factura de reemplazo / Original */}
            {invoice.isReplacement && invoice.replacesDocumentNumber && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6">
                <h3 className="font-semibold text-violet-900 mb-2">Factura de reemplazo</h3>
                <p className="text-sm text-violet-700">
                  Esta factura reemplaza a <span className="font-medium">{invoice.replacesDocumentNumber}</span>
                </p>
              </div>
            )}

            {invoice.requiresReplacement && !invoice.replacedByInvoiceId && invoice.status === "paid" && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900">Pendiente de factura definitiva</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      Este documento requiere que se suba la factura definitiva.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Motivo de anulación */}
            {invoice.status === "cancelled" && invoice.cancellationReason && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                <h3 className="font-semibold text-red-900 mb-3">Motivo de anulación</h3>
                <p className="text-sm text-red-700">{invoice.cancellationReason}</p>
                <p className="text-xs text-red-500 mt-2">Por {invoice.cancelledByName} · {formatDateTime(invoice.cancelledAt!)}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowCancelModal(false); resetModals(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <XCircle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Anular {invoice.displayNumber}</h3>
                <p className="text-xs text-slate-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="p-6">
              {(invoice.status === "approved" || invoice.status === "pending") && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Se revertirán los cambios presupuestarios</p>
                      <p className="text-xs mt-1">El importe realizado se devolverá{invoice.poId ? " y se restaurará el comprometido de la PO" : ""}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de anulación *</label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explica por qué se anula esta factura..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <KeyRound size={14} />
                  Confirma tu contraseña
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                  placeholder="Tu contraseña"
                  className={`w-full px-4 py-3 border ${passwordError ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`}
                />
                {passwordError && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{passwordError}</p>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowCancelModal(false); resetModals(); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium">
                  Cancelar
                </button>
                <button onClick={handleCancelInvoice} disabled={processing || !cancellationReason.trim() || !passwordInput.trim()} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {processing ? "Anulando..." : "Anular"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

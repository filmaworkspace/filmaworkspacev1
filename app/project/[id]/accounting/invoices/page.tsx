"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, deleteDoc, query, orderBy, updateDoc, Timestamp } from "firebase/firestore";
import { Receipt, Plus, Search, Download, Trash2, X, CheckCircle, XCircle, Calendar, FileText, Eye, ArrowLeft, MoreHorizontal, Shield, FileCheck, AlertTriangle, Link as LinkIcon, Clock, HelpCircle, Building2 } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const DOCUMENT_TYPES = {
  invoice: { code: "FAC", label: "Factura", icon: Receipt, bgColor: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-emerald-200" },
  proforma: { code: "PRF", label: "Proforma", icon: FileText, bgColor: "bg-violet-50", textColor: "text-violet-700", borderColor: "border-violet-200" },
  budget: { code: "PRS", label: "Presupuesto", icon: FileCheck, bgColor: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-amber-200" },
  guarantee: { code: "FNZ", label: "Fianza", icon: Shield, bgColor: "bg-slate-100", textColor: "text-slate-700", borderColor: "border-slate-300" },
};

type DocumentType = keyof typeof DOCUMENT_TYPES;

interface InvoiceItem { id: string; description: string; subAccountId: string; subAccountCode: string; subAccountDescription: string; quantity: number; unitPrice: number; baseAmount: number; vatRate: number; vatAmount: number; irpfRate: number; irpfAmount: number; totalAmount: number; }

interface Invoice { id: string; documentType: DocumentType; number: string; displayNumber: string; supplier: string; supplierId: string; poId?: string; poNumber?: string; description: string; items: InvoiceItem[]; baseAmount: number; vatAmount: number; irpfAmount: number; totalAmount: number; status: "pending_approval" | "pending" | "paid" | "overdue" | "cancelled" | "rejected"; approvalSteps?: any[]; currentApprovalStep?: number; dueDate: Date; paymentDate?: Date; attachmentUrl: string; createdAt: Date; createdByName: string; paidByName?: string; notes?: string; rejectedAt?: Date; rejectedByName?: string; rejectionReason?: string; requiresReplacement?: boolean; replacedByInvoiceId?: string; linkedDocumentId?: string; }

interface CompanyData { fiscalName: string; taxId: string; address: string; postalCode: string; city: string; province: string; country: string; email?: string; phone?: string; }

export default function InvoicesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [pendingReplacementCount, setPendingReplacementCount] = useState(0);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [showCompanyTooltip, setShowCompanyTooltip] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setUserId(user.uid);
      else router.push("/");
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => { if (userId && id) loadData(); }, [userId, id]);
  useEffect(() => { filterInvoices(); }, [searchTerm, statusFilter, typeFilter, invoices]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.menu-container')) { setOpenMenuId(null); setMenuPosition(null); }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const companyDoc = await getDoc(doc(db, `projects/${id}/config`, "company"));
      if (companyDoc.exists()) setCompanyData(companyDoc.data() as CompanyData);

      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc")));
      const invoicesData = invoicesSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return { id: docSnap.id, ...data, documentType: data.documentType || "invoice", displayNumber: data.displayNumber || `FAC-${data.number}`, createdAt: data.createdAt?.toDate() || new Date(), dueDate: data.dueDate?.toDate() || new Date(), paymentDate: data.paymentDate?.toDate(), rejectedAt: data.rejectedAt?.toDate() };
      }) as Invoice[];

      const now = new Date();
      let pendingCount = 0;
      for (const invoice of invoicesData) {
        if (invoice.status === "pending" && invoice.dueDate < now) {
          await updateDoc(doc(db, `projects/${id}/invoices`, invoice.id), { status: "overdue" });
          invoice.status = "overdue";
        }
        if (invoice.requiresReplacement && invoice.status === "paid" && !invoice.replacedByInvoiceId) pendingCount++;
      }
      setPendingReplacementCount(pendingCount);
      setInvoices(invoicesData);
    } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
  };

  const filterInvoices = () => {
    let filtered = [...invoices];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter((inv) => inv.number.toLowerCase().includes(s) || inv.displayNumber.toLowerCase().includes(s) || inv.supplier.toLowerCase().includes(s) || inv.description.toLowerCase().includes(s) || (inv.poNumber && inv.poNumber.toLowerCase().includes(s)));
    }
    if (statusFilter !== "all") filtered = filtered.filter((inv) => inv.status === statusFilter);
    if (typeFilter !== "all") filtered = filtered.filter((inv) => inv.documentType === typeFilter);
    setFilteredInvoices(filtered);
  };

  const closeMenu = () => { setOpenMenuId(null); setMenuPosition(null); };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "paid" || !confirm(`¿Eliminar ${invoice.displayNumber}?`)) return;
    try { await deleteDoc(doc(db, `projects/${id}/invoices`, invoiceId)); loadData(); } catch (error) { console.error("Error:", error); }
    closeMenu();
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "pending_approval" || !confirm(`¿Marcar ${invoice.displayNumber} como pagada?`)) return;
    try {
      await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), { status: "paid", paidAt: Timestamp.now(), paidBy: userId, paidByName: auth.currentUser?.displayName || "Usuario", paymentDate: Timestamp.now() });
      if (invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (item.subAccountId) {
            const accountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts`));
            for (const accountDoc of accountsSnapshot.docs) {
              const subAccountRef = doc(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`, item.subAccountId);
              const subAccountSnap = await getDoc(subAccountRef);
              if (subAccountSnap.exists()) { await updateDoc(subAccountRef, { actual: (subAccountSnap.data().actual || 0) + (item.baseAmount || 0) }); break; }
            }
          }
        }
      }
      loadData();
    } catch (error) { console.error("Error:", error); }
    closeMenu();
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "paid") return;
    const reason = prompt(`¿Motivo de cancelación de ${invoice.displayNumber}?`);
    if (!reason) return;
    try { await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), { status: "cancelled", cancelledAt: Timestamp.now(), cancelledBy: userId, cancellationReason: reason }); loadData(); } catch (error) { console.error("Error:", error); }
    closeMenu();
  };

  const getDocumentTypeBadge = (docType: DocumentType) => {
    const config = DOCUMENT_TYPES[docType] || DOCUMENT_TYPES.invoice;
    const Icon = config.icon;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${config.bgColor} ${config.textColor}`}><Icon size={12} />{config.code}</span>;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Pte. aprobación" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pte. pago" },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      overdue: { bg: "bg-red-50", text: "text-red-700", label: "Vencida" },
      cancelled: { bg: "bg-slate-100", text: "text-slate-700", label: "Cancelada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
    };
    const c = config[status] || config.pending;
    return <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const getApprovalProgress = (invoice: Invoice) => {
    if (!invoice.approvalSteps?.length) return null;
    const approved = invoice.approvalSteps.filter((s) => s.status === "approved").length;
    return (
      <div className="flex items-center gap-1 mt-1">
        {invoice.approvalSteps.map((step, idx) => (<div key={idx} className={`w-2 h-2 rounded-full ${step.status === "approved" ? "bg-emerald-500" : step.status === "rejected" ? "bg-red-500" : idx === invoice.currentApprovalStep ? "bg-amber-500" : "bg-slate-300"}`} />))}
        <span className="text-xs text-slate-500 ml-1">{approved}/{invoice.approvalSteps.length}</span>
      </div>
    );
  };

  const formatDate = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";
  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  const getDaysUntilDue = (dueDate: Date) => Math.ceil((dueDate.getTime() - Date.now()) / 86400000);

  const exportInvoices = () => {
    const rows = [["TIPO", "NÚMERO", "PROVEEDOR", "PO", "IMPORTE", "ESTADO", "VENCIMIENTO"]];
    filteredInvoices.forEach((inv) => {
      const docType = DOCUMENT_TYPES[inv.documentType] || DOCUMENT_TYPES.invoice;
      rows.push([docType.code, inv.displayNumber, inv.supplier, inv.poNumber ? `PO-${inv.poNumber}` : "-", inv.totalAmount.toString(), inv.status, formatDate(inv.dueDate)]);
    });
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Documentos_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const stats = { total: invoices.length, invoices: invoices.filter((i) => i.documentType === "invoice").length, proformas: invoices.filter((i) => i.documentType === "proforma").length, budgets: invoices.filter((i) => i.documentType === "budget").length, guarantees: invoices.filter((i) => i.documentType === "guarantee").length };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>;

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          {/* Breadcrumb with company tooltip */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting`} className="hover:text-slate-900 transition-colors">Panel</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
              
              {/* Company Info Tooltip */}
              <div className="relative ml-1">
                <button
                  onMouseEnter={() => setShowCompanyTooltip(true)}
                  onMouseLeave={() => setShowCompanyTooltip(false)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${companyData ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200" : "bg-slate-200 text-slate-400 hover:bg-slate-300"}`}
                >
                  <HelpCircle size={12} />
                </button>
                
                {showCompanyTooltip && (
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Building2 size={16} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Datos fiscales</p>
                        <p className="text-sm font-semibold text-slate-900">Nuestra empresa</p>
                      </div>
                    </div>
                    
                    {companyData ? (
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{companyData.fiscalName}</p>
                          <p className="text-xs font-mono text-slate-600">{companyData.taxId}</p>
                        </div>
                        <div className="text-xs text-slate-600">
                          <p>{companyData.address}</p>
                          <p>{companyData.postalCode} {companyData.city}</p>
                          {companyData.province && <p>{companyData.province}, {companyData.country}</p>}
                        </div>
                        {(companyData.email || companyData.phone) && (
                          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                            {companyData.email && <p>{companyData.email}</p>}
                            {companyData.phone && <p>{companyData.phone}</p>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-xs text-slate-500 mb-2">No hay datos fiscales configurados</p>
                        <Link href={`/project/${id}/config`} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                          Configurar en ajustes →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center">
                <Receipt size={24} className="text-emerald-600" />
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">Facturas</h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={exportInvoices} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                <Download size={16} />Exportar
              </button>
              <Link href={`/project/${id}/accounting/invoices/new`} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                <Plus size={18} />Nuevo documento
              </Link>
            </div>
          </div>

          {/* Type Stats */}
          <div className="grid grid-cols-4 gap-3 mt-6">
            {(Object.entries(DOCUMENT_TYPES) as [DocumentType, typeof DOCUMENT_TYPES.invoice][]).map(([key, config]) => {
              const Icon = config.icon;
              const count = key === "invoice" ? stats.invoices : key === "proforma" ? stats.proformas : key === "budget" ? stats.budgets : stats.guarantees;
              return (
                <button key={key} onClick={() => setTypeFilter(typeFilter === key ? "all" : key)} className={`p-3 rounded-xl border transition-all ${typeFilter === key ? `${config.borderColor} ${config.bgColor}` : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-2">
                    <Icon size={16} className={typeFilter === key ? config.textColor : "text-slate-400"} />
                    <span className={`text-sm font-medium ${typeFilter === key ? config.textColor : "text-slate-700"}`}>{config.label}</span>
                    <span className={`ml-auto text-sm font-semibold ${typeFilter === key ? config.textColor : "text-slate-900"}`}>{count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {pendingReplacementCount > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0"><AlertTriangle size={20} className="text-amber-600" /></div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">{pendingReplacementCount} documento{pendingReplacementCount > 1 ? "s" : ""} pendiente{pendingReplacementCount > 1 ? "s" : ""} de factura definitiva</h3>
                <p className="text-sm text-amber-700 mt-1">Hay proformas o presupuestos pagados que necesitan su factura definitiva del proveedor.</p>
              </div>
              <Link href={`/project/${id}/accounting/invoices/new`} className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 flex-shrink-0">Subir factura</Link>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por número, proveedor, PO..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-sm" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-sm min-w-[180px]">
            <option value="all">Todos los estados</option>
            <option value="pending_approval">Pte. aprobación</option>
            <option value="pending">Pte. pago</option>
            <option value="paid">Pagadas</option>
            <option value="overdue">Vencidas</option>
            <option value="rejected">Rechazadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
          {typeFilter !== "all" && (
            <button onClick={() => setTypeFilter("all")} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"><X size={14} />Limpiar filtro</button>
          )}
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Receipt size={28} className="text-slate-400" /></div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{searchTerm || statusFilter !== "all" || typeFilter !== "all" ? "No se encontraron resultados" : "Sin documentos"}</h3>
            <p className="text-slate-500 text-sm mb-6">{searchTerm || statusFilter !== "all" || typeFilter !== "all" ? "Prueba a ajustar los filtros de búsqueda" : "Sube tu primer documento para empezar"}</p>
            {!searchTerm && statusFilter === "all" && typeFilter === "all" && (
              <Link href={`/project/${id}/accounting/invoices/new`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><Plus size={18} />Nuevo documento</Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl">
            <div className="overflow-x-auto rounded-2xl">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Documento</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proveedor</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Importe</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencimiento</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => {
                    const daysUntilDue = getDaysUntilDue(invoice.dueDate);
                    const isDueSoon = daysUntilDue <= 7 && daysUntilDue > 0 && invoice.status === "pending";
                    const needsReplacement = invoice.requiresReplacement && invoice.status === "paid" && !invoice.replacedByInvoiceId;
                    return (
                      <tr key={invoice.id} className={`hover:bg-slate-50 transition-colors ${needsReplacement ? "bg-amber-50/50" : ""}`}>
                        <td className="px-6 py-4">
                          <button onClick={() => { setSelectedInvoice(invoice); setShowDetailModal(true); }} className="text-left hover:text-emerald-600 transition-colors">
                            <div className="flex items-center gap-2">
                              {getDocumentTypeBadge(invoice.documentType)}
                              <p className="font-semibold text-slate-900">{invoice.displayNumber}</p>
                              {needsReplacement && <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded"><Clock size={10} />Pte. factura</span>}
                            </div>
                            {invoice.poNumber && <p className="text-xs text-slate-500 mt-0.5">PO-{invoice.poNumber}</p>}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-900 font-medium">{invoice.supplier}</p>
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{invoice.description}</p>
                        </td>
                        <td className="px-6 py-4 text-right"><p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p></td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            {getStatusBadge(invoice.status)}
                            {invoice.status === "pending_approval" && getApprovalProgress(invoice)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className="text-slate-400" />
                            <span className={`text-xs ${invoice.status === "overdue" ? "text-red-600 font-semibold" : isDueSoon ? "text-amber-600 font-semibold" : "text-slate-600"}`}>{formatDate(invoice.dueDate)}</span>
                            {isDueSoon && <span className="text-xs text-amber-600">({daysUntilDue}d)</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="relative menu-container">
                            <button onClick={(e) => { e.stopPropagation(); if (openMenuId === invoice.id) { setOpenMenuId(null); setMenuPosition(null); } else { const rect = e.currentTarget.getBoundingClientRect(); const menuHeight = 220; const spaceBelow = window.innerHeight - rect.bottom; const showAbove = spaceBelow < menuHeight; setMenuPosition({ top: showAbove ? rect.top - menuHeight : rect.bottom + 4, left: rect.right - 192 }); setOpenMenuId(invoice.id); } }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                              <MoreHorizontal size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Floating menu */}
        {openMenuId && menuPosition && (
          <div className="fixed w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] py-1" style={{ top: menuPosition.top, left: menuPosition.left }}>
            {(() => {
              const invoice = filteredInvoices.find(i => i.id === openMenuId);
              if (!invoice) return null;
              const needsReplacement = invoice.requiresReplacement && invoice.status === "paid" && !invoice.replacedByInvoiceId;
              return (
                <>
                  <button onClick={() => { setSelectedInvoice(invoice); setShowDetailModal(true); closeMenu(); }} className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"><Eye size={15} className="text-slate-400" />Ver detalles</button>
                  {invoice.attachmentUrl && <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer" onClick={closeMenu} className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"><FileText size={15} className="text-slate-400" />Ver adjunto</a>}
                  {needsReplacement && (<><div className="border-t border-slate-100 my-1" /><Link href={`/project/${id}/accounting/invoices/new?linkTo=${invoice.id}`} onClick={closeMenu} className="w-full px-4 py-2.5 text-left text-sm text-violet-600 hover:bg-violet-50 flex items-center gap-3"><LinkIcon size={15} />Subir factura definitiva</Link></>)}
                  {(invoice.status === "pending" || invoice.status === "overdue") && (<><div className="border-t border-slate-100 my-1" /><button onClick={() => handleMarkAsPaid(invoice.id)} className="w-full px-4 py-2.5 text-left text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-3"><CheckCircle size={15} />Marcar pagada</button><button onClick={() => handleCancelInvoice(invoice.id)} className="w-full px-4 py-2.5 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-3"><XCircle size={15} />Cancelar</button></>)}
                  {invoice.status !== "paid" && invoice.status !== "cancelled" && (<><div className="border-t border-slate-100 my-1" /><button onClick={() => handleDeleteInvoice(invoice.id)} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"><Trash2 size={15} />Eliminar</button></>)}
                </>
              );
            })()}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowDetailModal(false); setSelectedInvoice(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">{getDocumentTypeBadge(selectedInvoice.documentType)}<h2 className="text-lg font-semibold text-slate-900">{selectedInvoice.displayNumber}</h2></div>
                <p className="text-sm text-slate-500">{selectedInvoice.supplier}</p>
              </div>
              <button onClick={() => { setShowDetailModal(false); setSelectedInvoice(null); }} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {selectedInvoice.requiresReplacement && selectedInvoice.status === "paid" && !selectedInvoice.replacedByInvoiceId && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                    <div className="flex-1"><p className="text-sm font-semibold text-amber-800">Pendiente de factura definitiva</p><p className="text-sm text-amber-700 mt-1">Este documento ha sido pagado. Recuerda subir la factura definitiva del proveedor.</p></div>
                    <Link href={`/project/${id}/accounting/invoices/new?linkTo=${selectedInvoice.id}`} className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700">Subir factura</Link>
                  </div>
                </div>
              )}
              {selectedInvoice.linkedDocumentId && (
                <div className="mb-6 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                  <div className="flex items-center gap-3"><LinkIcon size={18} className="text-violet-600" /><div><p className="text-sm font-semibold text-violet-800">Factura vinculada</p><p className="text-sm text-violet-700">Esta factura sustituye un documento previo.</p></div></div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Importe total</p><p className="text-lg font-bold text-slate-900">{formatCurrency(selectedInvoice.totalAmount)} €</p></div>
                <div className="bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Vencimiento</p><p className="text-lg font-bold text-slate-900">{formatDate(selectedInvoice.dueDate)}</p></div>
                <div className="bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Estado</p><div className="mt-1">{getStatusBadge(selectedInvoice.status)}</div></div>
              </div>
              {selectedInvoice.status === "rejected" && selectedInvoice.rejectionReason && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3"><XCircle size={18} className="text-red-600 mt-0.5" /><div><p className="text-sm font-semibold text-red-800">Motivo de rechazo</p><p className="text-sm text-red-700 mt-1">{selectedInvoice.rejectionReason}</p>{selectedInvoice.rejectedByName && <p className="text-xs text-red-600 mt-2">Rechazada por {selectedInvoice.rejectedByName} el {formatDate(selectedInvoice.rejectedAt!)}</p>}</div></div>
                </div>
              )}
              {selectedInvoice.poNumber && (<div className="mb-6 bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">PO Asociada</p><p className="text-sm font-mono text-slate-700">PO-{selectedInvoice.poNumber}</p></div>)}
              {selectedInvoice.description && (<div className="mb-6"><p className="text-xs text-slate-500 uppercase mb-2">Descripción</p><p className="text-sm text-slate-900 bg-slate-50 p-4 rounded-xl">{selectedInvoice.description}</p></div>)}
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Items ({selectedInvoice.items?.length || 0})</p>
                <div className="space-y-2">
                  {selectedInvoice.items?.map((item, index) => (
                    <div key={item.id || index} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="flex items-start justify-between"><div className="flex-1"><p className="text-sm font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500 mt-1">{item.subAccountCode} · {item.quantity} × {formatCurrency(item.unitPrice)} €</p></div><p className="text-sm font-semibold text-slate-900">{formatCurrency(item.totalAmount)} €</p></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-6 bg-slate-50 rounded-xl p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-slate-600">Base imponible</span><span className="font-semibold text-slate-900">{formatCurrency(selectedInvoice.baseAmount)} €</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600">IVA</span><span className="font-semibold text-emerald-600">+{formatCurrency(selectedInvoice.vatAmount)} €</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600">IRPF</span><span className="font-semibold text-red-600">-{formatCurrency(selectedInvoice.irpfAmount)} €</span></div>
                  <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2"><span>Total</span><span className="text-slate-900">{formatCurrency(selectedInvoice.totalAmount)} €</span></div>
                </div>
              </div>
              {selectedInvoice.notes && (<div className="mb-6"><p className="text-xs text-slate-500 uppercase mb-2">Notas</p><p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl">{selectedInvoice.notes}</p></div>)}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              {(selectedInvoice.status === "pending" || selectedInvoice.status === "overdue") && <button onClick={() => { handleMarkAsPaid(selectedInvoice.id); setShowDetailModal(false); }} className="px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors">Marcar como pagada</button>}
              {selectedInvoice.attachmentUrl && <a href={selectedInvoice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors">Ver adjunto</a>}
              <button onClick={() => { setShowDetailModal(false); setSelectedInvoice(null); }} className="px-4 py-2 text-sm border border-slate-200 text-slate-700 hover:bg-white rounded-lg transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

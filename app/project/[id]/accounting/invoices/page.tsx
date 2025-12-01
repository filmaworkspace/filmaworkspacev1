"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  Receipt,
  Plus,
  Search,
  Download,
  Trash2,
  X,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  FileText,
  Eye,
  TrendingUp,
  Building2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

interface InvoiceItem {
  id: string;
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
}

interface Invoice {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  poId?: string;
  poNumber?: string;
  description: string;
  items: InvoiceItem[];
  baseAmount: number;
  vatAmount: number;
  irpfAmount: number;
  totalAmount: number;
  status: "pending_approval" | "pending" | "paid" | "overdue" | "cancelled" | "rejected";
  approvalSteps?: any[];
  currentApprovalStep?: number;
  dueDate: Date;
  paymentDate?: Date;
  attachmentUrl: string;
  createdAt: Date;
  createdByName: string;
  paidByName?: string;
  notes?: string;
  rejectedAt?: Date;
  rejectedByName?: string;
  rejectionReason?: string;
}

export default function InvoicesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "dueDate">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);

  const [stats, setStats] = useState({ total: 0, pendingApproval: 0, pending: 0, paid: 0, overdue: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0 });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setUserId(user.uid);
      else router.push("/");
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    filterAndSortInvoices();
  }, [searchTerm, statusFilter, supplierFilter, sortBy, sortOrder, invoices]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc")));
      const invoicesData = invoicesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        dueDate: doc.data().dueDate?.toDate() || new Date(),
        paymentDate: doc.data().paymentDate?.toDate(),
        rejectedAt: doc.data().rejectedAt?.toDate(),
      })) as Invoice[];

      const now = new Date();
      for (const invoice of invoicesData) {
        if (invoice.status === "pending" && invoice.dueDate < now) {
          await updateDoc(doc(db, `projects/${id}/invoices`, invoice.id), { status: "overdue" });
          invoice.status = "overdue";
        }
      }

      setInvoices(invoicesData);
      setStats({
        total: invoicesData.length,
        pendingApproval: invoicesData.filter((inv) => inv.status === "pending_approval").length,
        pending: invoicesData.filter((inv) => inv.status === "pending").length,
        paid: invoicesData.filter((inv) => inv.status === "paid").length,
        overdue: invoicesData.filter((inv) => inv.status === "overdue").length,
        paidAmount: invoicesData.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + (inv.totalAmount || 0), 0),
        pendingAmount: invoicesData.filter((inv) => inv.status === "pending" || inv.status === "pending_approval").reduce((sum, inv) => sum + (inv.totalAmount || 0), 0),
        overdueAmount: invoicesData.filter((inv) => inv.status === "overdue").reduce((sum, inv) => sum + (inv.totalAmount || 0), 0),
      });

      const suppliersSnapshot = await getDocs(collection(db, `projects/${id}/suppliers`));
      setSuppliers(suppliersSnapshot.docs.map((doc) => ({ id: doc.id, name: doc.data().fiscalName || doc.data().commercialName })));
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortInvoices = () => {
    let filtered = [...invoices];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter((inv) => inv.number.toLowerCase().includes(s) || inv.supplier.toLowerCase().includes(s) || inv.description.toLowerCase().includes(s) || (inv.poNumber && inv.poNumber.toLowerCase().includes(s)));
    }
    if (statusFilter !== "all") filtered = filtered.filter((inv) => inv.status === statusFilter);
    if (supplierFilter !== "all") filtered = filtered.filter((inv) => inv.supplierId === supplierFilter);

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = a.createdAt.getTime() - b.createdAt.getTime();
      else if (sortBy === "amount") cmp = a.totalAmount - b.totalAmount;
      else if (sortBy === "dueDate") cmp = a.dueDate.getTime() - b.dueDate.getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });
    setFilteredInvoices(filtered);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "paid" || !confirm(`¿Eliminar FAC-${invoice.number}?`)) return;
    try {
      await deleteDoc(doc(db, `projects/${id}/invoices`, invoiceId));
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "pending_approval" || !confirm(`¿Marcar FAC-${invoice.number} como pagada?`)) return;
    try {
      await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), { status: "paid", paidAt: Timestamp.now(), paidBy: userId, paidByName: auth.currentUser?.displayName || "Usuario", paymentDate: Timestamp.now() });

      if (invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (item.subAccountId) {
            const accountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts`));
            for (const accountDoc of accountsSnapshot.docs) {
              const subAccountRef = doc(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`, item.subAccountId);
              const subAccountSnap = await getDoc(subAccountRef);
              if (subAccountSnap.exists()) {
                await updateDoc(subAccountRef, { actual: (subAccountSnap.data().actual || 0) + (item.baseAmount || 0) });
                break;
              }
            }
          }
        }
      }
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "paid") return;
    const reason = prompt(`¿Motivo de cancelación de FAC-${invoice.number}?`);
    if (!reason) return;
    try {
      await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), { status: "cancelled", cancelledAt: Timestamp.now(), cancelledBy: userId, cancellationReason: reason });
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = { pending_approval: "bg-purple-100 text-purple-700", pending: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700", overdue: "bg-red-100 text-red-700", cancelled: "bg-slate-100 text-slate-700", rejected: "bg-red-100 text-red-700" };
    const labels: Record<string, string> = { pending_approval: "Pte. aprobación", pending: "Pte. pago", paid: "Pagada", overdue: "Vencida", cancelled: "Cancelada", rejected: "Rechazada" };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${styles[status] || styles.pending}`}>{labels[status] || status}</span>;
  };

  const getApprovalProgress = (invoice: Invoice) => {
    if (!invoice.approvalSteps?.length) return null;
    const approved = invoice.approvalSteps.filter((s) => s.status === "approved").length;
    return (
      <div className="flex items-center gap-1 mt-1">
        {invoice.approvalSteps.map((step, idx) => (
          <div key={idx} className={`w-2 h-2 rounded-full ${step.status === "approved" ? "bg-emerald-500" : step.status === "rejected" ? "bg-red-500" : idx === invoice.currentApprovalStep ? "bg-amber-500" : "bg-slate-300"}`} />
        ))}
        <span className="text-xs text-slate-500 ml-1">{approved}/{invoice.approvalSteps.length}</span>
      </div>
    );
  };

  const formatDate = (date: Date) => (date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-");
  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  const getDaysUntilDue = (dueDate: Date) => Math.ceil((dueDate.getTime() - Date.now()) / 86400000);

  const exportInvoices = () => {
    const rows = [["NÚMERO", "PROVEEDOR", "PO", "IMPORTE", "ESTADO", "VENCIMIENTO"]];
    filteredInvoices.forEach((inv) => rows.push([`FAC-${inv.number}`, inv.supplier, inv.poNumber ? `PO-${inv.poNumber}` : "-", inv.totalAmount.toString(), inv.status, formatDate(inv.dueDate)]));
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Facturas_${projectName}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/project/${id}/accounting`} className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1">
              <Folder size={14} />
              {projectName}
              <ChevronRight size={14} />
              <span>Contabilidad</span>
            </Link>
            <button onClick={loadData} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-sm transition-colors border border-white/10">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                <Receipt size={24} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Facturas</h1>
                <p className="text-slate-400 text-sm">Gestión de facturas del proyecto</p>
              </div>
            </div>
            <Link href={`/project/${id}/accounting/invoices/new`} className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl font-medium transition-all hover:bg-slate-100 shadow-lg">
              <Plus size={18} />
              Nueva factura
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Receipt size={18} className="text-blue-400" />
                <span className="text-2xl font-bold">{stats.total}</span>
              </div>
              <p className="text-sm text-slate-400">Total facturas</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-400" />
                <span className="text-2xl font-bold">{stats.pending + stats.pendingApproval}</span>
              </div>
              <p className="text-sm text-slate-400">Pendientes</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold">{stats.paid}</span>
              </div>
              <p className="text-sm text-slate-400">Pagadas</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle size={18} className="text-red-400" />
                <span className="text-2xl font-bold">{stats.overdue}</span>
              </div>
              <p className="text-sm text-slate-400">Vencidas</p>
            </div>
          </div>

          {/* Amount Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={18} className="text-emerald-400" />
                <span className="text-lg font-bold">{formatCurrency(stats.paidAmount)} €</span>
              </div>
              <p className="text-sm text-slate-400">Total pagado</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign size={18} className="text-amber-400" />
                <span className="text-lg font-bold">{formatCurrency(stats.pendingAmount)} €</span>
              </div>
              <p className="text-sm text-slate-400">Pendiente pago</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle size={18} className="text-red-400" />
                <span className="text-lg font-bold">{formatCurrency(stats.overdueAmount)} €</span>
              </div>
              <p className="text-sm text-slate-400">Vencido</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por número, proveedor, PO..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50">
                <option value="all">Todos los estados</option>
                <option value="pending_approval">Pte. aprobación</option>
                <option value="pending">Pte. pago</option>
                <option value="paid">Pagadas</option>
                <option value="overdue">Vencidas</option>
                <option value="rejected">Rechazadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
              <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50">
                <option value="all">Todos los proveedores</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button onClick={exportInvoices} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors">
                <Download size={16} />
                Exportar
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{filteredInvoices.length}</span> de <span className="font-semibold">{stats.total}</span> facturas
            </p>
            <div className="flex items-center gap-2">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="date">Fecha</option>
                <option value="dueDate">Vencimiento</option>
                <option value="amount">Importe</option>
              </select>
              <button onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">
                {sortOrder === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>

          {/* Table */}
          {filteredInvoices.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Receipt size={32} className="text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{searchTerm || statusFilter !== "all" || supplierFilter !== "all" ? "No se encontraron facturas" : "No hay facturas"}</h3>
              <p className="text-slate-500 mb-6">{searchTerm || statusFilter !== "all" || supplierFilter !== "all" ? "Intenta ajustar los filtros" : "Comienza creando tu primera factura"}</p>
              {!searchTerm && statusFilter === "all" && supplierFilter === "all" && (
                <Link href={`/project/${id}/accounting/invoices/new`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium">
                  <Plus size={18} />
                  Crear primera factura
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Número</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Proveedor</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">PO</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Importe</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Vencimiento</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase w-40">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((invoice) => {
                      const daysUntilDue = getDaysUntilDue(invoice.dueDate);
                      const isDueSoon = daysUntilDue <= 7 && daysUntilDue > 0 && invoice.status === "pending";

                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900">FAC-{invoice.number}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[150px]">{invoice.description}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Building2 size={14} className="text-slate-400" />
                              <span className="text-sm text-slate-900">{invoice.supplier}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">{invoice.poNumber ? <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">PO-{invoice.poNumber}</span> : <span className="text-xs text-slate-400">-</span>}</td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              {getStatusBadge(invoice.status)}
                              {invoice.status === "pending_approval" && getApprovalProgress(invoice)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="text-slate-400" />
                              <span className={`text-xs ${invoice.status === "overdue" ? "text-red-600 font-semibold" : isDueSoon ? "text-amber-600 font-semibold" : "text-slate-600"}`}>{formatDate(invoice.dueDate)}</span>
                              {isDueSoon && <span className="text-xs text-amber-600">({daysUntilDue}d)</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setSelectedInvoice(invoice); setShowDetailModal(true); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                <Eye size={16} />
                              </button>
                              {(invoice.status === "pending" || invoice.status === "overdue") && (
                                <>
                                  <button onClick={() => handleMarkAsPaid(invoice.id)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                    <CheckCircle size={16} />
                                  </button>
                                  <button onClick={() => handleCancelInvoice(invoice.id)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}
                              {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                                <button onClick={() => handleDeleteInvoice(invoice.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 size={16} />
                                </button>
                              )}
                              {invoice.attachmentUrl && (
                                <a href={invoice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                  <FileText size={16} />
                                </a>
                              )}
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
        </div>
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">FAC-{selectedInvoice.number}</h2>
              <button onClick={() => { setShowDetailModal(false); setSelectedInvoice(null); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] space-y-6">
              {/* Status and Amount */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusBadge(selectedInvoice.status)}
                  {selectedInvoice.status === "pending_approval" && getApprovalProgress(selectedInvoice)}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency(selectedInvoice.totalAmount)} €</p>
                  <p className="text-xs text-slate-500">Importe total</p>
                </div>
              </div>

              {/* Rejection reason */}
              {selectedInvoice.status === "rejected" && selectedInvoice.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <XCircle size={18} className="text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Motivo de rechazo</p>
                      <p className="text-sm text-red-700 mt-1">{selectedInvoice.rejectionReason}</p>
                      {selectedInvoice.rejectedByName && <p className="text-xs text-red-600 mt-2">Rechazada por {selectedInvoice.rejectedByName} el {formatDate(selectedInvoice.rejectedAt!)}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Proveedor</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedInvoice.supplier}</p>
                </div>
                {selectedInvoice.poNumber && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PO Asociada</p>
                    <p className="text-sm font-mono text-slate-700">PO-{selectedInvoice.poNumber}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Vencimiento</p>
                  <p className="text-sm text-slate-900">{formatDate(selectedInvoice.dueDate)}</p>
                </div>
                {selectedInvoice.paymentDate && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Fecha de pago</p>
                    <p className="text-sm text-emerald-600">{formatDate(selectedInvoice.paymentDate)}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Descripción</p>
                <p className="text-sm text-slate-900 bg-slate-50 p-3 rounded-xl">{selectedInvoice.description}</p>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Items ({selectedInvoice.items?.length || 0})</p>
                <div className="space-y-2">
                  {selectedInvoice.items?.map((item, index) => (
                    <div key={item.id || index} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.description}</p>
                          <p className="text-xs text-slate-500 mt-1">{item.subAccountCode} - {item.subAccountDescription}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.totalAmount)} €</p>
                          <p className="text-xs text-slate-500">{item.quantity} × {formatCurrency(item.unitPrice)} €</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount Summary */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Base imponible</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(selectedInvoice.baseAmount)} €</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IVA</span>
                    <span className="font-semibold text-emerald-600">+{formatCurrency(selectedInvoice.vatAmount)} €</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IRPF</span>
                    <span className="font-semibold text-red-600">-{formatCurrency(selectedInvoice.irpfAmount)} €</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total</span>
                    <span className="text-slate-900">{formatCurrency(selectedInvoice.totalAmount)} €</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedInvoice.notes && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Notas</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">{selectedInvoice.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="border-t pt-4 flex justify-end gap-3">
                {(selectedInvoice.status === "pending" || selectedInvoice.status === "overdue") && (
                  <button onClick={() => { handleMarkAsPaid(selectedInvoice.id); setShowDetailModal(false); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors">
                    Marcar como pagada
                  </button>
                )}
                {selectedInvoice.attachmentUrl && (
                  <a href={selectedInvoice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors">
                    Ver archivo adjunto
                  </a>
                )}
                <button onClick={() => { setShowDetailModal(false); setSelectedInvoice(null); }} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

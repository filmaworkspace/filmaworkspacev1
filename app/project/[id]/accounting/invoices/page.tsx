"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useRef } from "react";
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
  Receipt,
  Plus,
  Search,
  Download,
  Trash2,
  X,
  CheckCircle,
  XCircle,
  Calendar,
  FileText,
  Eye,
  ArrowLeft,
  MoreHorizontal,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    filterInvoices();
  }, [searchTerm, statusFilter, invoices]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc")));
      const invoicesData = invoicesSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate() || new Date(),
        dueDate: docSnap.data().dueDate?.toDate() || new Date(),
        paymentDate: docSnap.data().paymentDate?.toDate(),
        rejectedAt: docSnap.data().rejectedAt?.toDate(),
      })) as Invoice[];

      const now = new Date();
      for (const invoice of invoicesData) {
        if (invoice.status === "pending" && invoice.dueDate < now) {
          await updateDoc(doc(db, `projects/${id}/invoices`, invoice.id), { status: "overdue" });
          invoice.status = "overdue";
        }
      }

      setInvoices(invoicesData);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterInvoices = () => {
    let filtered = [...invoices];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter((inv) =>
        inv.number.toLowerCase().includes(s) ||
        inv.supplier.toLowerCase().includes(s) ||
        inv.description.toLowerCase().includes(s) ||
        (inv.poNumber && inv.poNumber.toLowerCase().includes(s))
      );
    }
    if (statusFilter !== "all") filtered = filtered.filter((inv) => inv.status === statusFilter);
    setFilteredInvoices(filtered);
  };

  const handleMenuClick = (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    if (openMenuId === invoiceId) {
      setOpenMenuId(null);
      setMenuPosition(null);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 192,
      });
      setOpenMenuId(invoiceId);
    }
  };

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
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
    closeMenu();
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "pending_approval" || !confirm(`¿Marcar FAC-${invoice.number} como pagada?`)) return;
    try {
      await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), {
        status: "paid",
        paidAt: Timestamp.now(),
        paidBy: userId,
        paidByName: auth.currentUser?.displayName || "Usuario",
        paymentDate: Timestamp.now(),
      });

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
    closeMenu();
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status === "paid") return;
    const reason = prompt(`¿Motivo de cancelación de FAC-${invoice.number}?`);
    if (!reason) return;
    try {
      await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: userId,
        cancellationReason: reason,
      });
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
    closeMenu();
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
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const getApprovalProgress = (invoice: Invoice) => {
    if (!invoice.approvalSteps?.length) return null;
    const approved = invoice.approvalSteps.filter((s) => s.status === "approved").length;
    return (
      <div className="flex items-center gap-1 mt-1">
        {invoice.approvalSteps.map((step, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full ${
              step.status === "approved"
                ? "bg-emerald-500"
                : step.status === "rejected"
                ? "bg-red-500"
                : idx === invoice.currentApprovalStep
                ? "bg-amber-500"
                : "bg-slate-300"
            }`}
          />
        ))}
        <span className="text-xs text-slate-500 ml-1">
          {approved}/{invoice.approvalSteps.length}
        </span>
      </div>
    );
  };

  const formatDate = (date: Date) =>
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const getDaysUntilDue = (dueDate: Date) => Math.ceil((dueDate.getTime() - Date.now()) / 86400000);

  const exportInvoices = () => {
    const rows = [["NÚMERO", "PROVEEDOR", "PO", "IMPORTE", "ESTADO", "VENCIMIENTO"]];
    filteredInvoices.forEach((inv) =>
      rows.push([
        `FAC-${inv.number}`,
        inv.supplier,
        inv.poNumber ? `PO-${inv.poNumber}` : "-",
        inv.totalAmount.toString(),
        inv.status,
        formatDate(inv.dueDate),
      ])
    );
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Facturas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const renderContextMenu = (invoice: Invoice) => {
    if (openMenuId !== invoice.id || !menuPosition) return null;

    return (
      <div
        ref={menuRef}
        className="fixed w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden"
        style={{ top: menuPosition.top, left: menuPosition.left }}
      >
        <button
          onClick={() => {
            setSelectedInvoice(invoice);
            setShowDetailModal(true);
            closeMenu();
          }}
          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
        >
          <Eye size={15} className="text-slate-400" />
          Ver detalles
        </button>
        {invoice.attachmentUrl && (
          <a
            href={invoice.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
          >
            <FileText size={15} className="text-slate-400" />
            Ver adjunto
          </a>
        )}
        {(invoice.status === "pending" || invoice.status === "overdue") && (
          <>
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => handleMarkAsPaid(invoice.id)}
              className="w-full px-4 py-2.5 text-left text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-3"
            >
              <CheckCircle size={15} />
              Marcar pagada
            </button>
            <button
              onClick={() => handleCancelInvoice(invoice.id)}
              className="w-full px-4 py-2.5 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-3"
            >
              <XCircle size={15} />
              Cancelar
            </button>
          </>
        )}
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <>
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => handleDeleteInvoice(invoice.id)}
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
            >
              <Trash2 size={15} />
              Eliminar
            </button>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Cargando facturas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-16 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link
            href={`/project/${id}/accounting`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ArrowLeft size={14} />
            Volver al dashboard
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Receipt size={20} className="text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Facturas</h1>
                <p className="text-sm text-slate-500">
                  {invoices.length} {invoices.length === 1 ? "factura" : "facturas"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportInvoices}
                className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <Download size={16} />
                Exportar
              </button>
              <Link
                href={`/project/${id}/accounting/invoices/new`}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Plus size={16} />
                Nueva factura
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por número, proveedor, PO..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm"
          >
            <option value="all">Todos los estados</option>
            <option value="pending_approval">Pte. aprobación</option>
            <option value="pending">Pte. pago</option>
            <option value="paid">Pagadas</option>
            <option value="overdue">Vencidas</option>
            <option value="rejected">Rechazadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>

        {/* Table or Empty State */}
        {filteredInvoices.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt size={24} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {searchTerm || statusFilter !== "all" ? "No se encontraron facturas" : "No hay facturas"}
            </h3>
            <p className="text-slate-500 text-sm mb-4">
              {searchTerm || statusFilter !== "all" ? "Intenta ajustar los filtros" : "Comienza creando tu primera factura"}
            </p>
            {!searchTerm && statusFilter === "all" && (
              <Link
                href={`/project/${id}/accounting/invoices/new`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
              >
                <Plus size={16} />
                Crear primera factura
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-visible">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Número</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Proveedor</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase">Importe</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Estado</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Vencimiento</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((invoice) => {
                  const daysUntilDue = getDaysUntilDue(invoice.dueDate);
                  const isDueSoon = daysUntilDue <= 7 && daysUntilDue > 0 && invoice.status === "pending";

                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50 transition-colors relative">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowDetailModal(true);
                          }}
                          className="text-left hover:text-emerald-600 transition-colors"
                        >
                          <p className="font-medium text-slate-900">FAC-{invoice.number}</p>
                          {invoice.poNumber && <p className="text-xs text-slate-500">PO-{invoice.poNumber}</p>}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-900">{invoice.supplier}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{invoice.description}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          {getStatusBadge(invoice.status)}
                          {invoice.status === "pending_approval" && getApprovalProgress(invoice)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-slate-400" />
                          <span
                            className={`text-xs ${
                              invoice.status === "overdue"
                                ? "text-red-600 font-semibold"
                                : isDueSoon
                                ? "text-amber-600 font-semibold"
                                : "text-slate-600"
                            }`}
                          >
                            {formatDate(invoice.dueDate)}
                          </span>
                          {isDueSoon && <span className="text-xs text-amber-600">({daysUntilDue}d)</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <button
                            onClick={(e) => handleMenuClick(e, invoice.id)}
                            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {renderContextMenu(invoice)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowDetailModal(false);
            setSelectedInvoice(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">FAC-{selectedInvoice.number}</h2>
                <p className="text-sm text-slate-500">{selectedInvoice.supplier}</p>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedInvoice(null);
                }}
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Status and Amount */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Importe total</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(selectedInvoice.totalAmount)} €</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Vencimiento</p>
                  <p className="text-lg font-bold text-slate-900">{formatDate(selectedInvoice.dueDate)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Estado</p>
                  <div className="mt-1">{getStatusBadge(selectedInvoice.status)}</div>
                </div>
              </div>

              {/* Rejection reason */}
              {selectedInvoice.status === "rejected" && selectedInvoice.rejectionReason && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <XCircle size={18} className="text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Motivo de rechazo</p>
                      <p className="text-sm text-red-700 mt-1">{selectedInvoice.rejectionReason}</p>
                      {selectedInvoice.rejectedByName && (
                        <p className="text-xs text-red-600 mt-2">
                          Rechazada por {selectedInvoice.rejectedByName} el {formatDate(selectedInvoice.rejectedAt!)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PO Link */}
              {selectedInvoice.poNumber && (
                <div className="mb-6 bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">PO Asociada</p>
                  <p className="text-sm font-mono text-slate-700">PO-{selectedInvoice.poNumber}</p>
                </div>
              )}

              {/* Description */}
              {selectedInvoice.description && (
                <div className="mb-6">
                  <p className="text-xs text-slate-500 uppercase mb-2">Descripción</p>
                  <p className="text-sm text-slate-900 bg-slate-50 p-3 rounded-lg">{selectedInvoice.description}</p>
                </div>
              )}

              {/* Items */}
              <div className="mb-6">
                <p className="text-xs font-medium text-slate-700 uppercase mb-3">
                  Items ({selectedInvoice.items?.length || 0})
                </p>
                <div className="space-y-2">
                  {selectedInvoice.items?.map((item, index) => (
                    <div key={item.id || index} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.description}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {item.subAccountCode} · {item.quantity} × {formatCurrency(item.unitPrice)} €
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.totalAmount)} €</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount Summary */}
              <div className="mb-6 bg-slate-50 rounded-lg p-4">
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
                  <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2">
                    <span>Total</span>
                    <span className="text-slate-900">{formatCurrency(selectedInvoice.totalAmount)} €</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedInvoice.notes && (
                <div className="mb-6">
                  <p className="text-xs text-slate-500 uppercase mb-2">Notas</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              {(selectedInvoice.status === "pending" || selectedInvoice.status === "overdue") && (
                <button
                  onClick={() => {
                    handleMarkAsPaid(selectedInvoice.id);
                    setShowDetailModal(false);
                  }}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Marcar como pagada
                </button>
              )}
              {selectedInvoice.attachmentUrl && (
                <a
                  href={selectedInvoice.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Ver adjunto
                </a>
              )}
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedInvoice(null);
                }}
                className="px-4 py-2 text-sm border border-slate-200 text-slate-700 hover:bg-white rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import {
  CreditCard,
  Plus,
  Search,
  Download,
  Trash2,
  X,
  CheckCircle2,
  Calendar,
  FileText,
  ArrowLeft,
  MoreHorizontal,
  Receipt,
  Building2,
  GripVertical,
  Upload,
  Clock,
  Banknote,
  FileCheck,
  Shield,
  Landmark,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  Eye,
  Edit3,
  Copy,
  Send,
  Filter,
  LayoutGrid,
  List,
  TrendingUp,
  Wallet,
  PiggyBank,
  BadgeEuro,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Paperclip,
  ExternalLink,
  Users,
  FolderOpen,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Tipos de pago disponibles
const PAYMENT_TYPES = {
  invoice: { label: "Pago de factura", icon: Receipt, color: "emerald", description: "Pago completo de una factura" },
  partial: { label: "Pago parcial", icon: CircleDollarSign, color: "blue", description: "Pago parcial de una factura" },
  proforma: { label: "Pago de proforma", icon: FileText, color: "violet", description: "Pago anticipado por proforma" },
  budget: { label: "Pago de presupuesto", icon: Wallet, color: "amber", description: "Pago según presupuesto aprobado" },
  deposit: { label: "Pago de depósito", icon: PiggyBank, color: "indigo", description: "Depósito con facturas asociadas" },
  guarantee: { label: "Pago de fianza", icon: Shield, color: "slate", description: "Fianza o garantía" },
};

type PaymentType = keyof typeof PAYMENT_TYPES;

interface Invoice {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  description: string;
  totalAmount: number;
  baseAmount: number;
  status: string;
  dueDate: Date;
  createdAt: Date;
  createdByName: string;
  department?: string;
}

interface PaymentItem {
  id: string;
  type: PaymentType;
  invoiceId?: string;
  invoiceNumber?: string;
  supplier: string;
  description: string;
  amount: number;
  partialAmount?: number;
  department?: string;
  addedBy: string;
  addedByName: string;
  addedAt: Date;
  linkedInvoices?: string[]; // Para depósitos
}

interface PaymentForecast {
  id: string;
  name: string;
  paymentDate: Date;
  type: "remesa" | "fuera_remesa";
  status: "draft" | "pending" | "processing" | "completed" | "cancelled";
  items: PaymentItem[];
  totalAmount: number;
  bankReceipt?: string;
  bankReceiptName?: string;
  notes?: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  completedAt?: Date;
  completedBy?: string;
}

export default function PaymentsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Data
  const [forecasts, setForecasts] = useState<PaymentForecast[]>([]);
  const [availableInvoices, setAvailableInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showForecastDetail, setShowForecastDetail] = useState<PaymentForecast | null>(null);
  const [showUploadReceipt, setShowUploadReceipt] = useState<PaymentForecast | null>(null);

  // Forms
  const [newForecast, setNewForecast] = useState({ name: "", paymentDate: "", type: "remesa" as "remesa" | "fuera_remesa" });
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState({
    type: "invoice" as PaymentType,
    invoiceId: "",
    supplier: "",
    description: "",
    amount: 0,
    partialAmount: 0,
  });

  // Drag and drop
  const [draggedInvoice, setDraggedInvoice] = useState<Invoice | null>(null);
  const [dragOverForecast, setDragOverForecast] = useState<string | null>(null);

  // Menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".menu-container")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Project info
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load forecasts
      const forecastsSnap = await getDocs(
        query(collection(db, `projects/${id}/paymentForecasts`), orderBy("paymentDate", "asc"))
      );
      const forecastsData = forecastsSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          paymentDate: data.paymentDate?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          completedAt: data.completedAt?.toDate(),
          items: data.items || [],
        } as PaymentForecast;
      });
      setForecasts(forecastsData);

      // Load available invoices (pending or overdue, not yet in any forecast)
      const invoicesSnap = await getDocs(
        query(collection(db, `projects/${id}/invoices`), orderBy("dueDate", "asc"))
      );

      const assignedInvoiceIds = new Set<string>();
      forecastsData.forEach((f) => {
        f.items.forEach((item) => {
          if (item.invoiceId) assignedInvoiceIds.add(item.invoiceId);
        });
      });

      const invoicesData = invoicesSnap.docs
        .filter((docSnap) => {
          const data = docSnap.data();
          const status = data.status;
          return (status === "pending" || status === "overdue" || status === "pending_approval") && !assignedInvoiceIds.has(docSnap.id);
        })
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          dueDate: docSnap.data().dueDate?.toDate() || new Date(),
          createdAt: docSnap.data().createdAt?.toDate() || new Date(),
        })) as Invoice[];

      setAvailableInvoices(invoicesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateForecast = async () => {
    if (!newForecast.name.trim() || !newForecast.paymentDate) return;

    try {
      const forecastData = {
        name: newForecast.name.trim(),
        paymentDate: Timestamp.fromDate(new Date(newForecast.paymentDate)),
        type: newForecast.type,
        status: "draft",
        items: [],
        totalAmount: 0,
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
      };

      await addDoc(collection(db, `projects/${id}/paymentForecasts`), forecastData);
      setShowCreateModal(false);
      setNewForecast({ name: "", paymentDate: "", type: "remesa" });
      loadData();
    } catch (error) {
      console.error("Error creating forecast:", error);
    }
  };

  const handleAddPaymentToForecast = async (forecastId: string, invoice?: Invoice) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast) return;

    const paymentItem: PaymentItem = {
      id: `item_${Date.now()}`,
      type: invoice ? "invoice" : newPayment.type,
      invoiceId: invoice?.id || newPayment.invoiceId || undefined,
      invoiceNumber: invoice?.number || undefined,
      supplier: invoice?.supplier || newPayment.supplier,
      description: invoice?.description || newPayment.description,
      amount: invoice?.totalAmount || newPayment.amount,
      department: invoice?.department,
      addedBy: userId!,
      addedByName: userName,
      addedAt: new Date(),
    };

    if (newPayment.type === "partial" && newPayment.partialAmount > 0) {
      paymentItem.partialAmount = newPayment.partialAmount;
      paymentItem.amount = newPayment.partialAmount;
    }

    const updatedItems = [...forecast.items, paymentItem];
    const totalAmount = updatedItems.reduce((sum, item) => sum + (item.partialAmount || item.amount), 0);

    try {
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), {
        items: updatedItems,
        totalAmount,
      });

      setShowAddPaymentModal(false);
      setSelectedForecastId(null);
      setNewPayment({ type: "invoice", invoiceId: "", supplier: "", description: "", amount: 0, partialAmount: 0 });
      loadData();
    } catch (error) {
      console.error("Error adding payment:", error);
    }
  };

  const handleRemovePaymentItem = async (forecastId: string, itemId: string) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast) return;

    const updatedItems = forecast.items.filter((item) => item.id !== itemId);
    const totalAmount = updatedItems.reduce((sum, item) => sum + (item.partialAmount || item.amount), 0);

    try {
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), {
        items: updatedItems,
        totalAmount,
      });
      loadData();
    } catch (error) {
      console.error("Error removing item:", error);
    }
  };

  const handleUpdateForecastStatus = async (forecastId: string, status: PaymentForecast["status"]) => {
    try {
      const updateData: any = { status };
      if (status === "completed") {
        updateData.completedAt = Timestamp.now();
        updateData.completedBy = userId;

        // Mark invoices as paid
        const forecast = forecasts.find((f) => f.id === forecastId);
        if (forecast) {
          for (const item of forecast.items) {
            if (item.invoiceId && item.type !== "partial") {
              await updateDoc(doc(db, `projects/${id}/invoices`, item.invoiceId), {
                status: "paid",
                paidAt: Timestamp.now(),
                paymentForecastId: forecastId,
              });
            }
          }
        }
      }

      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), updateData);
      loadData();
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleDeleteForecast = async (forecastId: string) => {
    if (!confirm("¿Eliminar esta previsión de pago?")) return;

    try {
      await deleteDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId));
      loadData();
    } catch (error) {
      console.error("Error deleting forecast:", error);
    }
  };

  const handleDragStart = (invoice: Invoice) => {
    setDraggedInvoice(invoice);
  };

  const handleDragOver = (e: React.DragEvent, forecastId: string) => {
    e.preventDefault();
    setDragOverForecast(forecastId);
  };

  const handleDragLeave = () => {
    setDragOverForecast(null);
  };

  const handleDrop = async (e: React.DragEvent, forecastId: string) => {
    e.preventDefault();
    setDragOverForecast(null);

    if (draggedInvoice) {
      await handleAddPaymentToForecast(forecastId, draggedInvoice);
      setDraggedInvoice(null);
    }
  };

  // Helpers
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const formatDate = (date: Date) =>
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";

  const formatDateShort = (date: Date) =>
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date) : "-";

  const getStatusConfig = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string; icon: any }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador", icon: Edit3 },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente", icon: Clock },
      processing: { bg: "bg-blue-50", text: "text-blue-700", label: "Procesando", icon: Send },
      completed: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completada", icon: CheckCircle2 },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Cancelada", icon: X },
    };
    return config[status] || config.draft;
  };

  const getTypeConfig = (type: "remesa" | "fuera_remesa") => {
    return type === "remesa"
      ? { bg: "bg-indigo-50", text: "text-indigo-700", label: "Remesa", icon: Landmark }
      : { bg: "bg-violet-50", text: "text-violet-700", label: "Fuera de remesa", icon: Banknote };
  };

  const getDaysUntilPayment = (date: Date) => Math.ceil((date.getTime() - Date.now()) / 86400000);

  const filteredForecasts = forecasts.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.items.some((item) => item.supplier.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: forecasts.reduce((sum, f) => sum + f.totalAmount, 0),
    pending: forecasts.filter((f) => f.status === "pending" || f.status === "draft").reduce((sum, f) => sum + f.totalAmount, 0),
    completed: forecasts.filter((f) => f.status === "completed").reduce((sum, f) => sum + f.totalAmount, 0),
    thisWeek: forecasts
      .filter((f) => {
        const days = getDaysUntilPayment(f.paymentDate);
        return days >= 0 && days <= 7 && f.status !== "completed" && f.status !== "cancelled";
      })
      .reduce((sum, f) => sum + f.totalAmount, 0),
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem] bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-8">
          <Link
            href={`/project/${id}/accounting`}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6"
          >
            <ArrowLeft size={16} />
            Volver al Panel
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200">
                <CreditCard size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Previsiones de pago</h1>
                <p className="text-slate-500 text-sm">{projectName}</p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
            >
              <Plus size={18} />
              Nueva previsión
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <BadgeEuro size={18} className="text-slate-600" />
                </div>
                <span className="text-xs font-medium text-slate-500 uppercase">Total previsto</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.total)} €</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Clock size={18} className="text-amber-600" />
                </div>
                <span className="text-xs font-medium text-amber-600 uppercase">Pendiente</span>
              </div>
              <p className="text-2xl font-bold text-amber-700">{formatCurrency(stats.pending)} €</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-4 border border-emerald-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-600 uppercase">Completado</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(stats.completed)} €</p>
            </div>

            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl p-4 border border-violet-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <TrendingUp size={18} className="text-violet-600" />
                </div>
                <span className="text-xs font-medium text-violet-600 uppercase">Esta semana</span>
              </div>
              <p className="text-2xl font-bold text-violet-700">{formatCurrency(stats.thisWeek)} €</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 md:px-12 py-8">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar previsión o proveedor..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="pending">Pendiente</option>
              <option value="processing">Procesando</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
            </select>

            <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-4 py-3 text-sm transition-colors ${viewMode === "kanban" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-4 py-3 text-sm transition-colors border-l border-slate-200 ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Available Invoices Sidebar */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden sticky top-24">
              <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Receipt size={16} className="text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">Facturas disponibles</h3>
                    <p className="text-xs text-slate-500">{availableInvoices.length} pendientes de asignar</p>
                  </div>
                </div>
              </div>

              <div className="p-3 max-h-[600px] overflow-y-auto">
                {availableInvoices.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">Todas las facturas asignadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableInvoices.map((invoice) => {
                      const daysUntilDue = getDaysUntilPayment(invoice.dueDate);
                      const isOverdue = daysUntilDue < 0;
                      const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7;

                      return (
                        <div
                          key={invoice.id}
                          draggable
                          onDragStart={() => handleDragStart(invoice)}
                          onDragEnd={() => setDraggedInvoice(null)}
                          className={`p-3 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-grab active:cursor-grabbing transition-all border-2 border-transparent hover:border-emerald-200 group ${
                            draggedInvoice?.id === invoice.id ? "opacity-50 scale-95" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical size={14} className="text-slate-300 mt-1 group-hover:text-slate-400" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-slate-900">FAC-{invoice.number}</p>
                                <p className="text-sm font-bold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                              </div>
                              <p className="text-xs text-slate-600 truncate mt-0.5">{invoice.supplier}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                                    isOverdue
                                      ? "bg-red-100 text-red-700"
                                      : isDueSoon
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-200 text-slate-600"
                                  }`}
                                >
                                  {isOverdue ? "Vencida" : formatDateShort(invoice.dueDate)}
                                </span>
                                {invoice.department && (
                                  <span className="text-xs text-slate-400">{invoice.department}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Forecasts */}
          <div className="flex-1">
            {filteredForecasts.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CreditCard size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {searchTerm || statusFilter !== "all" ? "No se encontraron resultados" : "Sin previsiones de pago"}
                </h3>
                <p className="text-slate-500 text-sm mb-6">
                  {searchTerm || statusFilter !== "all"
                    ? "Prueba a ajustar los filtros"
                    : "Crea tu primera previsión para organizar los pagos"}
                </p>
                {!searchTerm && statusFilter === "all" && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"
                  >
                    <Plus size={18} />
                    Nueva previsión
                  </button>
                )}
              </div>
            ) : viewMode === "kanban" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredForecasts.map((forecast) => {
                  const statusConfig = getStatusConfig(forecast.status);
                  const typeConfig = getTypeConfig(forecast.type);
                  const daysUntil = getDaysUntilPayment(forecast.paymentDate);
                  const StatusIcon = statusConfig.icon;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <div
                      key={forecast.id}
                      onDragOver={(e) => handleDragOver(e, forecast.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, forecast.id)}
                      className={`bg-white border rounded-2xl overflow-hidden transition-all ${
                        dragOverForecast === forecast.id
                          ? "border-emerald-400 ring-2 ring-emerald-100 scale-[1.02]"
                          : "border-slate-200 hover:shadow-lg"
                      }`}
                    >
                      {/* Card Header */}
                      <div className="px-5 py-4 border-b border-slate-100">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 line-clamp-1">{forecast.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Calendar size={12} className="text-slate-400" />
                              <span className={`text-xs ${daysUntil < 0 ? "text-red-600 font-semibold" : daysUntil <= 3 ? "text-amber-600 font-semibold" : "text-slate-500"}`}>
                                {formatDate(forecast.paymentDate)}
                                {daysUntil >= 0 && daysUntil <= 7 && ` (${daysUntil}d)`}
                              </span>
                            </div>
                          </div>

                          <div className="relative menu-container">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === forecast.id ? null : forecast.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                            >
                              <MoreHorizontal size={16} />
                            </button>

                            {openMenuId === forecast.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
                                <button
                                  onClick={() => {
                                    setShowForecastDetail(forecast);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Eye size={14} /> Ver detalles
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedForecastId(forecast.id);
                                    setShowAddPaymentModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Plus size={14} /> Añadir pago
                                </button>
                                {forecast.status === "draft" && (
                                  <button
                                    onClick={() => {
                                      handleUpdateForecastStatus(forecast.id, "pending");
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
                                  >
                                    <Send size={14} /> Enviar a revisión
                                  </button>
                                )}
                                {forecast.status === "pending" && (
                                  <button
                                    onClick={() => {
                                      handleUpdateForecastStatus(forecast.id, "processing");
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                  >
                                    <Clock size={14} /> Marcar procesando
                                  </button>
                                )}
                                {(forecast.status === "pending" || forecast.status === "processing") && (
                                  <button
                                    onClick={() => {
                                      setShowUploadReceipt(forecast);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"
                                  >
                                    <CheckCircle2 size={14} /> Completar pago
                                  </button>
                                )}
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  onClick={() => {
                                    handleDeleteForecast(forecast.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <Trash2 size={14} /> Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                            <StatusIcon size={12} />
                            {statusConfig.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${typeConfig.bg} ${typeConfig.text}`}>
                            <TypeIcon size={12} />
                            {typeConfig.label}
                          </span>
                        </div>
                      </div>

                      {/* Card Body - Items */}
                      <div className="p-3 min-h-[120px] max-h-[280px] overflow-y-auto bg-slate-50/50">
                        {forecast.items.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-center py-6">
                            <div>
                              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <FolderOpen size={18} className="text-slate-400" />
                              </div>
                              <p className="text-xs text-slate-400">Arrastra facturas aquí</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {forecast.items.map((item) => {
                              const typeInfo = PAYMENT_TYPES[item.type];
                              const ItemIcon = typeInfo.icon;

                              return (
                                <div
                                  key={item.id}
                                  className="bg-white p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors group"
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`w-7 h-7 rounded-lg bg-${typeInfo.color}-100 flex items-center justify-center flex-shrink-0`}>
                                      <ItemIcon size={14} className={`text-${typeInfo.color}-600`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-slate-900 truncate">
                                          {item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description}
                                        </p>
                                        <button
                                          onClick={() => handleRemovePaymentItem(forecast.id, item.id)}
                                          className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                      <p className="text-xs text-slate-500 truncate">{item.supplier}</p>
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-slate-400">{typeInfo.label}</span>
                                        <span className="text-sm font-semibold text-slate-900">
                                          {formatCurrency(item.partialAmount || item.amount)} €
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="px-5 py-3 border-t border-slate-100 bg-white">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">{forecast.items.length} pagos</span>
                          <span className="text-lg font-bold text-slate-900">{formatCurrency(forecast.totalAmount)} €</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // List view
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Previsión</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Fecha pago</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Pagos</th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Importe</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredForecasts.map((forecast) => {
                      const statusConfig = getStatusConfig(forecast.status);
                      const typeConfig = getTypeConfig(forecast.type);
                      const StatusIcon = statusConfig.icon;
                      const TypeIcon = typeConfig.icon;

                      return (
                        <tr key={forecast.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setShowForecastDetail(forecast)}
                              className="text-left hover:text-violet-600"
                            >
                              <p className="font-semibold text-slate-900">{forecast.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Creada {formatDate(forecast.createdAt)}</p>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={14} className="text-slate-400" />
                              <span className="text-sm text-slate-700">{formatDate(forecast.paymentDate)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${typeConfig.bg} ${typeConfig.text}`}>
                              <TypeIcon size={12} />
                              {typeConfig.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                              <StatusIcon size={12} />
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-medium text-slate-700">{forecast.items.length}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-bold text-slate-900">{formatCurrency(forecast.totalAmount)} €</span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setShowForecastDetail(forecast)}
                              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Forecast Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Nueva previsión de pago</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre de la previsión</label>
                <input
                  type="text"
                  value={newForecast.name}
                  onChange={(e) => setNewForecast({ ...newForecast, name: e.target.value })}
                  placeholder="Ej: Remesa Semana 23"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de pago</label>
                <input
                  type="date"
                  value={newForecast.paymentDate}
                  onChange={(e) => setNewForecast({ ...newForecast, paymentDate: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de pago</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewForecast({ ...newForecast, type: "remesa" })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      newForecast.type === "remesa" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Landmark size={20} className={newForecast.type === "remesa" ? "text-indigo-600" : "text-slate-400"} />
                    <p className="font-semibold text-slate-900 mt-2">Remesa</p>
                    <p className="text-xs text-slate-500 mt-1">Pago bancario agrupado</p>
                  </button>

                  <button
                    onClick={() => setNewForecast({ ...newForecast, type: "fuera_remesa" })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      newForecast.type === "fuera_remesa" ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Banknote size={20} className={newForecast.type === "fuera_remesa" ? "text-violet-600" : "text-slate-400"} />
                    <p className="font-semibold text-slate-900 mt-2">Fuera de remesa</p>
                    <p className="text-xs text-slate-500 mt-1">Transferencia individual</p>
                  </button>
                </div>
              </div>

              <button
                onClick={handleCreateForecast}
                disabled={!newForecast.name.trim() || !newForecast.paymentDate}
                className="w-full mt-4 px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors"
              >
                Crear previsión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {showAddPaymentModal && selectedForecastId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAddPaymentModal(false); setSelectedForecastId(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Añadir pago</h3>
              <button onClick={() => { setShowAddPaymentModal(false); setSelectedForecastId(null); }} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PAYMENT_TYPES).map(([key, value]) => {
                    const Icon = value.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setNewPayment({ ...newPayment, type: key as PaymentType })}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${
                          newPayment.type === key ? `border-${value.color}-500 bg-${value.color}-50` : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <Icon size={16} className={newPayment.type === key ? `text-${value.color}-600` : "text-slate-400"} />
                        <p className="font-medium text-slate-900 text-sm mt-1">{value.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(newPayment.type === "invoice" || newPayment.type === "partial") && availableInvoices.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Seleccionar factura</label>
                  <select
                    value={newPayment.invoiceId}
                    onChange={(e) => {
                      const inv = availableInvoices.find((i) => i.id === e.target.value);
                      if (inv) {
                        setNewPayment({
                          ...newPayment,
                          invoiceId: inv.id,
                          supplier: inv.supplier,
                          description: inv.description,
                          amount: inv.totalAmount,
                        });
                      }
                    }}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">Seleccionar...</option>
                    {availableInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        FAC-{inv.number} · {inv.supplier} · {formatCurrency(inv.totalAmount)} €
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newPayment.type === "partial" && newPayment.invoiceId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Importe parcial (de {formatCurrency(newPayment.amount)} €)
                  </label>
                  <input
                    type="number"
                    value={newPayment.partialAmount || ""}
                    onChange={(e) => setNewPayment({ ...newPayment, partialAmount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              )}

              {newPayment.type !== "invoice" && newPayment.type !== "partial" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Proveedor</label>
                    <input
                      type="text"
                      value={newPayment.supplier}
                      onChange={(e) => setNewPayment({ ...newPayment, supplier: e.target.value })}
                      placeholder="Nombre del proveedor"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                    <input
                      type="text"
                      value={newPayment.description}
                      onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })}
                      placeholder="Concepto del pago"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Importe</label>
                    <input
                      type="number"
                      value={newPayment.amount || ""}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </>
              )}

              <button
                onClick={() => handleAddPaymentToForecast(selectedForecastId)}
                disabled={
                  (newPayment.type === "invoice" && !newPayment.invoiceId) ||
                  (newPayment.type === "partial" && (!newPayment.invoiceId || !newPayment.partialAmount)) ||
                  (newPayment.type !== "invoice" && newPayment.type !== "partial" && (!newPayment.supplier || !newPayment.amount))
                }
                className="w-full mt-4 px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors"
              >
                Añadir pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Detail Modal */}
      {showForecastDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForecastDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{showForecastDetail.name}</h3>
                <p className="text-sm text-slate-500">Creada por {showForecastDetail.createdByName}</p>
              </div>
              <button onClick={() => setShowForecastDetail(null)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Fecha de pago</p>
                  <p className="text-lg font-bold text-slate-900">{formatDate(showForecastDetail.paymentDate)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Total</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(showForecastDetail.totalAmount)} €</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Estado</p>
                  <div className="mt-1">
                    {(() => {
                      const config = getStatusConfig(showForecastDetail.status);
                      const Icon = config.icon;
                      return (
                        <span className={`inline-flex items-center gap-1 text-sm px-2 py-1 rounded-lg font-medium ${config.bg} ${config.text}`}>
                          <Icon size={14} />
                          {config.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Bank receipt */}
              {showForecastDetail.bankReceipt && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileCheck size={20} className="text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Justificante adjunto</p>
                        <p className="text-xs text-emerald-700">{showForecastDetail.bankReceiptName || "Documento bancario"}</p>
                      </div>
                    </div>
                    
                      href={showForecastDetail.bankReceipt}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
                    >
                      Ver
                    </a>
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 uppercase mb-3">
                  Pagos incluidos ({showForecastDetail.items.length})
                </h4>
                <div className="space-y-2">
                  {showForecastDetail.items.map((item) => {
                    const typeInfo = PAYMENT_TYPES[item.type];
                    const ItemIcon = typeInfo.icon;

                    return (
                      <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-${typeInfo.color}-100 flex items-center justify-center flex-shrink-0`}>
                            <ItemIcon size={18} className={`text-${typeInfo.color}-600`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description}
                                </p>
                                <p className="text-sm text-slate-600">{item.supplier}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {typeInfo.label} · Añadido por {item.addedByName}
                                </p>
                              </div>
                              <p className="text-lg font-bold text-slate-900">
                                {formatCurrency(item.partialAmount || item.amount)} €
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              {showForecastDetail.notes && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">Notas</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl">{showForecastDetail.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              {showForecastDetail.status === "draft" && (
                <button
                  onClick={() => {
                    handleUpdateForecastStatus(showForecastDetail.id, "pending");
                    setShowForecastDetail(null);
                  }}
                  className="px-4 py-2 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg"
                >
                  Enviar a revisión
                </button>
              )}
              {(showForecastDetail.status === "pending" || showForecastDetail.status === "processing") && (
                <button
                  onClick={() => {
                    setShowUploadReceipt(showForecastDetail);
                    setShowForecastDetail(null);
                  }}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg"
                >
                  Completar pago
                </button>
              )}
              <button
                onClick={() => setShowForecastDetail(null)}
                className="px-4 py-2 text-sm border border-slate-200 text-slate-700 hover:bg-white rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Receipt Modal */}
      {showUploadReceipt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowUploadReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Completar pago</h3>
              <button onClick={() => setShowUploadReceipt(null)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6 p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-500 mb-1">Previsión</p>
                <p className="font-semibold text-slate-900">{showUploadReceipt.name}</p>
                <p className="text-lg font-bold text-slate-900 mt-2">{formatCurrency(showUploadReceipt.totalAmount)} €</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Justificante bancario (opcional)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors cursor-pointer">
                  <Upload size={24} className="text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Arrastra o haz clic para subir</p>
                  <p className="text-xs text-slate-400 mt-1">PDF, PNG o JPG hasta 10MB</p>
                </div>
              </div>

              <button
                onClick={async () => {
                  await handleUpdateForecastStatus(showUploadReceipt.id, "completed");
                  setShowUploadReceipt(null);
                }}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                Marcar como completada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
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
  where,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  Receipt,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  X,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  FileText,
  ChevronDown,
  Eye,
  TrendingUp,
  Building2,
  AlertTriangle,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface InvoiceItem {
  id: string;
  description: string;
  poItemId?: string;
  isNewItem: boolean;
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
  status: "pending" | "paid" | "overdue" | "cancelled";
  dueDate: Date;
  paymentDate?: Date;
  attachmentUrl: string;
  attachmentFileName: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  paidAt?: Date;
  paidBy?: string;
  paidByName?: string;
  notes?: string;
}

interface InvoiceStats {
  total: number;
  pending: number;
  paid: number;
  overdue: number;
  cancelled: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
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
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [sortBy, setSortBy] = useState<"date" | "amount" | "dueDate" | "number">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  const [stats, setStats] = useState<InvoiceStats>({
    total: 0,
    pending: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueAmount: 0,
  });

  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id) {
      loadData();
    }
  }, [userId, id]);

  useEffect(() => {
    filterAndSortInvoices();
  }, [searchTerm, statusFilter, supplierFilter, dateRange, sortBy, sortOrder, invoices]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Check user role
      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        setUserRole(memberDoc.data().role || "");
      }

      // Load invoices
      const invoicesQuery = query(
        collection(db, `projects/${id}/invoices`),
        orderBy("createdAt", "desc")
      );
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoicesData = invoicesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        dueDate: doc.data().dueDate?.toDate(),
        paymentDate: doc.data().paymentDate?.toDate(),
        paidAt: doc.data().paidAt?.toDate(),
      })) as Invoice[];

      // Update overdue status
      const now = new Date();
      for (const invoice of invoicesData) {
        if (invoice.status === "pending" && invoice.dueDate < now) {
          await updateDoc(doc(db, `projects/${id}/invoices`, invoice.id), {
            status: "overdue",
          });
          invoice.status = "overdue";
        }
      }

      setInvoices(invoicesData);

      // Calculate stats
      const newStats: InvoiceStats = {
        total: invoicesData.length,
        pending: invoicesData.filter((inv) => inv.status === "pending").length,
        paid: invoicesData.filter((inv) => inv.status === "paid").length,
        overdue: invoicesData.filter((inv) => inv.status === "overdue").length,
        cancelled: invoicesData.filter((inv) => inv.status === "cancelled").length,
        totalAmount: invoicesData.reduce((sum, inv) => sum + inv.totalAmount, 0),
        paidAmount: invoicesData
          .filter((inv) => inv.status === "paid")
          .reduce((sum, inv) => sum + inv.totalAmount, 0),
        pendingAmount: invoicesData
          .filter((inv) => inv.status === "pending")
          .reduce((sum, inv) => sum + inv.totalAmount, 0),
        overdueAmount: invoicesData
          .filter((inv) => inv.status === "overdue")
          .reduce((sum, inv) => sum + inv.totalAmount, 0),
      };
      setStats(newStats);

      // Load suppliers for filter
      const suppliersSnapshot = await getDocs(
        collection(db, `projects/${id}/suppliers`)
      );
      const suppliersData = suppliersSnapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().fiscalName || doc.data().commercialName,
      }));
      setSuppliers(suppliersData);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortInvoices = () => {
    let filtered = [...invoices];

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.number.toLowerCase().includes(searchLower) ||
          inv.supplier.toLowerCase().includes(searchLower) ||
          inv.description.toLowerCase().includes(searchLower) ||
          (inv.poNumber && inv.poNumber.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((inv) => inv.status === statusFilter);
    }

    // Supplier filter
    if (supplierFilter !== "all") {
      filtered = filtered.filter((inv) => inv.supplierId === supplierFilter);
    }

    // Date range filter
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from);
      filtered = filtered.filter((inv) => inv.createdAt >= fromDate);
    }
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((inv) => inv.createdAt <= toDate);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date":
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case "amount":
          comparison = a.totalAmount - b.totalAmount;
          break;
        case "dueDate":
          comparison = a.dueDate.getTime() - b.dueDate.getTime();
          break;
        case "number":
          comparison = a.number.localeCompare(b.number);
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    setFilteredInvoices(filtered);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;

    if (invoice.status === "paid") {
      alert("No se puede eliminar una factura pagada.");
      return;
    }

    if (
      !confirm(
        `¿Estás seguro de que deseas eliminar la factura ${invoice.number}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, `projects/${id}/invoices`, invoiceId));
      loadData();
    } catch (error) {
      console.error("Error eliminando factura:", error);
      alert("Error al eliminar la factura");
    }
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;

    if (
      !confirm(
        `¿Marcar la factura ${invoice.number} como pagada? Se registrará la fecha de pago.`
      )
    ) {
      return;
    }

    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      await updateDoc(doc(db, `projects/${id}/invoices`, invoiceId), {
        status: "paid",
        paidAt: Timestamp.now(),
        paidBy: userId,
        paidByName: userName,
        paymentDate: Timestamp.now(),
      });

      // Update actual amount in budget
      for (const item of invoice.items) {
        if (item.subAccountId) {
          const poDoc = await getDoc(doc(db, `projects/${id}/pos`, invoice.poId!));
          if (poDoc.exists()) {
            const poData = poDoc.data();
            const budgetAccountId = poData.budgetAccountId;
            
            const subAccountRef = doc(
              db,
              `projects/${id}/accounts/${budgetAccountId}/subaccounts`,
              item.subAccountId
            );
            const subAccountSnap = await getDoc(subAccountRef);
            if (subAccountSnap.exists()) {
              const currentActual = subAccountSnap.data().actual || 0;
              await updateDoc(subAccountRef, {
                actual: currentActual + item.totalAmount,
              });
            }
          }
        }
      }

      loadData();
    } catch (error) {
      console.error("Error marcando factura como pagada:", error);
      alert("Error al marcar la factura como pagada");
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;

    const reason = prompt(`¿Por qué cancelas la factura ${invoice.number}?`);
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
      console.error("Error cancelando factura:", error);
      alert("Error al cancelar la factura");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
      overdue: "bg-red-100 text-red-700 border-red-200",
      cancelled: "bg-slate-100 text-slate-700 border-slate-200",
    };

    const labels = {
      pending: "Pendiente",
      paid: "Pagada",
      overdue: "Vencida",
      cancelled: "Cancelada",
    };

    const icons = {
      pending: <Clock size={12} />,
      paid: <CheckCircle size={12} />,
      overdue: <AlertTriangle size={12} />,
      cancelled: <XCircle size={12} />,
    };

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${
          styles[status as keyof typeof styles]
        }`}
      >
        {icons[status as keyof typeof icons]}
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const getDaysUntilDue = (dueDate: Date) => {
    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const exportInvoices = () => {
    const rows = [
      [
        "NÚMERO",
        "PROVEEDOR",
        "PO ASOCIADA",
        "DESCRIPCIÓN",
        "IMPORTE",
        "ESTADO",
        "FECHA VENCIMIENTO",
        "FECHA CREACIÓN",
        "FECHA PAGO",
        "CREADO POR",
      ],
    ];

    filteredInvoices.forEach((inv) => {
      rows.push([
        inv.number,
        inv.supplier,
        inv.poNumber || "Sin PO",
        inv.description,
        inv.totalAmount.toString(),
        inv.status,
        formatDate(inv.dueDate),
        formatDate(inv.createdAt),
        inv.paymentDate ? formatDate(inv.paymentDate) : "",
        inv.createdByName,
      ]);
    });

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Facturas_${projectName}_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSupplierFilter("all");
    setDateRange({ from: "", to: "" });
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-emerald-50 to-emerald-100 border-y border-emerald-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-emerald-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${id}/accounting`}
            className="text-emerald-600 hover:text-emerald-900 transition-colors text-sm font-medium"
          >
            Volver a contabilidad
          </Link>
          <span className="text-emerald-300">|</span>
          <Link
            href="/dashboard"
            className="text-emerald-600 hover:text-emerald-900 transition-colors text-sm font-medium"
          >
            Dashboard
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 rounded-xl shadow-lg">
                  <Receipt size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Facturas
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Gestión de facturas del proyecto
                  </p>
                </div>
              </div>
              <Link href={`/project/${id}/accounting/invoices/new`}>
                <button className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105">
                  <Plus size={20} />
                  Nueva factura
                </button>
              </Link>
            </div>
          </header>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-blue-700 font-medium">Total</p>
                <Receipt size={16} className="text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-amber-700 font-medium">Pendientes</p>
                <Clock size={16} className="text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-900">{stats.pending}</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-emerald-700 font-medium">Pagadas</p>
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-900">{stats.paid}</p>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-red-700 font-medium">Vencidas</p>
                <AlertTriangle size={16} className="text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-900">{stats.overdue}</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-purple-700 font-medium">Importe total</p>
                <DollarSign size={16} className="text-purple-600" />
              </div>
              <p className="text-xl font-bold text-purple-900">
                {stats.totalAmount.toLocaleString()} €
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-green-700 font-medium">Pagado</p>
                <TrendingUp size={16} className="text-green-600" />
              </div>
              <p className="text-xl font-bold text-green-900">
                {stats.paidAmount.toLocaleString()} €
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-amber-700 font-medium">Pendiente</p>
                <Clock size={16} className="text-amber-600" />
              </div>
              <p className="text-xl font-bold text-amber-900">
                {stats.pendingAmount.toLocaleString()} €
              </p>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-red-700 font-medium">Vencido</p>
                <AlertCircle size={16} className="text-red-600" />
              </div>
              <p className="text-xl font-bold text-red-900">
                {stats.overdueAmount.toLocaleString()} €
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Filter size={20} className="text-slate-600" />
                Filtros y búsqueda
              </h3>
              <button
                onClick={clearFilters}
                className="text-sm text-emerald-600 hover:text-emerald-800 font-medium"
              >
                Limpiar filtros
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Buscar
                </label>
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Número, proveedor, PO..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Estado
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pendientes</option>
                  <option value="paid">Pagadas</option>
                  <option value="overdue">Vencidas</option>
                  <option value="cancelled">Canceladas</option>
                </select>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Proveedor
                </label>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                >
                  <option value="all">Todos</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Ordenar por
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  >
                    <option value="date">Fecha</option>
                    <option value="dueDate">Vencimiento</option>
                    <option value="amount">Importe</option>
                    <option value="number">Número</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
              </div>
            </div>
          </div>

          {/* Results summary and export */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{filteredInvoices.length}</span> de{" "}
              <span className="font-semibold">{stats.total}</span> facturas
            </p>
            <button
              onClick={exportInvoices}
              className="flex items-center gap-2 px-4 py-2 border-2 border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors text-sm font-medium"
            >
              <Download size={16} />
              Exportar
            </button>
          </div>

          {/* Invoices Table */}
          {filteredInvoices.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <Receipt size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm || statusFilter !== "all" || supplierFilter !== "all"
                  ? "No se encontraron facturas"
                  : "No hay facturas"}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm || statusFilter !== "all" || supplierFilter !== "all"
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Comienza creando tu primera factura"}
              </p>
              {!searchTerm && statusFilter === "all" && supplierFilter === "all" && (
                <Link href={`/project/${id}/accounting/invoices/new`}>
                  <button className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-lg">
                    <Plus size={20} />
                    Crear primera factura
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Número
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Proveedor
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        PO Asociada
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Importe
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Vencimiento
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredInvoices.map((invoice) => {
                      const daysUntilDue = getDaysUntilDue(invoice.dueDate);
                      const isDueSoon = daysUntilDue <= 7 && daysUntilDue > 0 && invoice.status === "pending";

                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-emerald-600">
                              INV-{invoice.number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Building2 size={14} className="text-slate-400" />
                              <span className="text-sm text-slate-900">{invoice.supplier}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {invoice.poNumber ? (
                              <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                                PO-{invoice.poNumber}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Sin PO</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-slate-900">
                              {invoice.totalAmount.toLocaleString()} €
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(invoice.status)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="text-slate-400" />
                              <span className={`text-xs ${
                                invoice.status === "overdue" ? "text-red-600 font-semibold" :
                                isDueSoon ? "text-amber-600 font-semibold" :
                                "text-slate-600"
                              }`}>
                                {formatDate(invoice.dueDate)}
                              </span>
                              {isDueSoon && (
                                <span className="text-xs text-amber-600">
                                  ({daysUntilDue}d)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setShowDetailModal(true);
                                }}
                                className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Ver detalles"
                              >
                                <Eye size={16} />
                              </button>

                              {invoice.status === "pending" || invoice.status === "overdue" ? (
                                <>
                                  <button
                                    onClick={() => handleMarkAsPaid(invoice.id)}
                                    className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                    title="Marcar como pagada"
                                  >
                                    <CheckCircle size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleCancelInvoice(invoice.id)}
                                    className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                    title="Cancelar"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              ) : null}

                              {invoice.status !== "paid" && (
                                <button
                                  onClick={() => handleDeleteInvoice(invoice.id)}
                                  className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}

                              {invoice.attachmentUrl && (
                                <a
                                  href={invoice.attachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Ver archivo adjunto"
                                >
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-xl font-bold text-white">
                Detalles de INV-{selectedInvoice.number}
              </h2>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedInvoice(null);
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status and Amount */}
              <div className="flex items-center justify-between">
                <div>{getStatusBadge(selectedInvoice.status)}</div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    {selectedInvoice.totalAmount.toLocaleString()} €
                  </p>
                  <p className="text-xs text-slate-500">Importe total</p>
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Proveedor
                  </label>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedInvoice.supplier}
                  </p>
                </div>
                {selectedInvoice.poNumber && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      PO Asociada
                    </label>
                    <p className="text-sm font-mono text-indigo-600">
                      PO-{selectedInvoice.poNumber}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Fecha de vencimiento
                  </label>
                  <p className="text-sm text-slate-900">
                    {formatDate(selectedInvoice.dueDate)}
                  </p>
                </div>
                {selectedInvoice.paymentDate && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Fecha de pago
                    </label>
                    <p className="text-sm text-emerald-600">
                      {formatDate(selectedInvoice.paymentDate)}
                    </p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Descripción
                </label>
                <p className="text-sm text-slate-900">{selectedInvoice.description}</p>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Ítems de la factura ({selectedInvoice.items.length})
                </h3>
                <div className="space-y-2">
                  {selectedInvoice.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {item.description}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {item.subAccountCode} - {item.subAccountDescription}
                          </p>
                          {item.isNewItem && (
                            <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mt-1">
                              Ítem nuevo
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.totalAmount.toLocaleString()} €
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.quantity} × {item.unitPrice.toLocaleString()} €
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-600">
                        <span>Base: {item.baseAmount.toFixed(2)} €</span>
                        <span>IVA ({item.vatRate}%): {item.vatAmount.toFixed(2)} €</span>
                        {item.irpfRate > 0 && (
                          <span>IRPF ({item.irpfRate}%): -{item.irpfAmount.toFixed(2)} €</span>
                        )}
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
                    <span className="font-semibold text-slate-900">
                      {selectedInvoice.baseAmount.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IVA</span>
                    <span className="font-semibold text-emerald-600">
                      +{selectedInvoice.vatAmount.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IRPF</span>
                    <span className="font-semibold text-red-600">
                      -{selectedInvoice.irpfAmount.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total</span>
                    <span className="text-emerald-600">
                      {selectedInvoice.totalAmount.toFixed(2)} €
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedInvoice.notes && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Notas
                  </label>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                    {selectedInvoice.notes}
                  </p>
                </div>
              )}

              {/* Timeline */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Historial
                </h3>
                <div className="space-y-3">
                  {/* Created */}
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg mt-1">
                      <Receipt size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Factura creada
                      </p>
                      <p className="text-xs text-slate-600">
                        {formatDate(selectedInvoice.createdAt)} por{" "}
                        {selectedInvoice.createdByName}
                      </p>
                    </div>
                  </div>

                  {/* Paid */}
                  {selectedInvoice.status === "paid" && selectedInvoice.paidAt && (
                    <div className="flex items-start gap-3">
                      <div className="bg-emerald-100 p-2 rounded-lg mt-1">
                        <CheckCircle size={16} className="text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          Factura pagada
                        </p>
                        <p className="text-xs text-slate-600">
                          {formatDate(selectedInvoice.paidAt)} por{" "}
                          {selectedInvoice.paidByName}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t pt-4 flex justify-end gap-3">
                {(selectedInvoice.status === "pending" || selectedInvoice.status === "overdue") && (
                  <button
                    onClick={() => {
                      handleMarkAsPaid(selectedInvoice.id);
                      setShowDetailModal(false);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Marcar como pagada
                  </button>
                )}

                {selectedInvoice.attachmentUrl && (
                  <a
                    href={selectedInvoice.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Ver archivo adjunto
                  </a>
                )}

                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedInvoice(null);
                  }}
                  className="px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
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
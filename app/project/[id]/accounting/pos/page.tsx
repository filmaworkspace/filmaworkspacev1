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
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  User,
  ChevronDown,
  FileCheck,
  TrendingUp,
  Building2,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface PO {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  description: string;
  budgetAccount: string;
  budgetAccountId: string;
  subAccountId: string;
  amount: number;
  status: "draft" | "pending" | "approved" | "rejected";
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  approvedAt?: Date;
  approvedBy?: string;
  approvedByName?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectionReason?: string;
  notes?: string;
  attachments?: string[];
}

interface POStats {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  totalAmount: number;
  approvedAmount: number;
}

export default function POsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [pos, setPOs] = useState<PO[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [sortBy, setSortBy] = useState<"date" | "amount" | "number">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  const [stats, setStats] = useState<POStats>({
    total: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    totalAmount: 0,
    approvedAmount: 0,
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
    filterAndSortPOs();
  }, [searchTerm, statusFilter, supplierFilter, dateRange, sortBy, sortOrder, pos]);

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

      // Load POs
      const posQuery = query(
        collection(db, `projects/${id}/pos`),
        orderBy("createdAt", "desc")
      );
      const posSnapshot = await getDocs(posQuery);
      const posData = posSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        approvedAt: doc.data().approvedAt?.toDate(),
        rejectedAt: doc.data().rejectedAt?.toDate(),
      })) as PO[];

      setPOs(posData);

      // Calculate stats
      const newStats: POStats = {
        total: posData.length,
        draft: posData.filter((po) => po.status === "draft").length,
        pending: posData.filter((po) => po.status === "pending").length,
        approved: posData.filter((po) => po.status === "approved").length,
        rejected: posData.filter((po) => po.status === "rejected").length,
        totalAmount: posData.reduce((sum, po) => sum + po.amount, 0),
        approvedAmount: posData
          .filter((po) => po.status === "approved")
          .reduce((sum, po) => sum + po.amount, 0),
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

  const filterAndSortPOs = () => {
    let filtered = [...pos];

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (po) =>
          po.number.toLowerCase().includes(searchLower) ||
          po.supplier.toLowerCase().includes(searchLower) ||
          po.description.toLowerCase().includes(searchLower) ||
          po.budgetAccount.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((po) => po.status === statusFilter);
    }

    // Supplier filter
    if (supplierFilter !== "all") {
      filtered = filtered.filter((po) => po.supplierId === supplierFilter);
    }

    // Date range filter
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from);
      filtered = filtered.filter((po) => po.createdAt >= fromDate);
    }
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((po) => po.createdAt <= toDate);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date":
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case "amount":
          comparison = a.amount - b.amount;
          break;
        case "number":
          comparison = a.number.localeCompare(b.number);
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    setFilteredPOs(filtered);
  };

  const handleDeletePO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    if (po.status === "approved") {
      alert("No se puede eliminar una PO aprobada. Primero debe ser rechazada.");
      return;
    }

    if (
      !confirm(
        `¿Estás seguro de que deseas eliminar la PO ${po.number}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, `projects/${id}/pos`, poId));
      loadData();
    } catch (error) {
      console.error("Error eliminando PO:", error);
      alert("Error al eliminar la PO");
    }
  };

  const handleApprovePO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    if (
      !confirm(
        `¿Aprobar la PO ${po.number} por ${po.amount.toLocaleString()} €? Esto comprometerá el presupuesto.`
      )
    ) {
      return;
    }

    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      await updateDoc(doc(db, `projects/${id}/pos`, poId), {
        status: "approved",
        approvedAt: Timestamp.now(),
        approvedBy: userId,
        approvedByName: userName,
      });

      // Update budget commitment
      if (po.subAccountId && po.budgetAccountId) {
        const subAccountRef = doc(
          db,
          `projects/${id}/accounts/${po.budgetAccountId}/subaccounts`,
          po.subAccountId
        );
        const subAccountSnap = await getDoc(subAccountRef);
        if (subAccountSnap.exists()) {
          const currentCommitted = subAccountSnap.data().committed || 0;
          await updateDoc(subAccountRef, {
            committed: currentCommitted + po.amount,
          });
        }
      }

      loadData();
    } catch (error) {
      console.error("Error aprobando PO:", error);
      alert("Error al aprobar la PO");
    }
  };

  const handleRejectPO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    const reason = prompt(`¿Por qué rechazas la PO ${po.number}?`);
    if (!reason) return;

    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      await updateDoc(doc(db, `projects/${id}/pos`, poId), {
        status: "rejected",
        rejectedAt: Timestamp.now(),
        rejectedBy: userId,
        rejectedByName: userName,
        rejectionReason: reason,
      });

      loadData();
    } catch (error) {
      console.error("Error rechazando PO:", error);
      alert("Error al rechazar la PO");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: "bg-slate-100 text-slate-700 border-slate-200",
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
    };

    const labels = {
      draft: "Borrador",
      pending: "Pendiente",
      approved: "Aprobada",
      rejected: "Rechazada",
    };

    const icons = {
      draft: <Edit size={12} />,
      pending: <Clock size={12} />,
      approved: <CheckCircle size={12} />,
      rejected: <XCircle size={12} />,
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

  const exportPOs = () => {
    const rows = [
      [
        "NÚMERO",
        "PROVEEDOR",
        "DESCRIPCIÓN",
        "CUENTA",
        "IMPORTE",
        "ESTADO",
        "FECHA CREACIÓN",
        "CREADO POR",
        "FECHA APROBACIÓN",
        "APROBADO POR",
      ],
    ];

    filteredPOs.forEach((po) => {
      rows.push([
        po.number,
        po.supplier,
        po.description,
        po.budgetAccount,
        po.amount.toString(),
        po.status,
        formatDate(po.createdAt),
        po.createdByName,
        po.approvedAt ? formatDate(po.approvedAt) : "",
        po.approvedByName || "",
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
      `POs_${projectName}_${new Date().toISOString().split("T")[0]}.csv`
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
            <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
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
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${id}/accounting`}
            className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
          >
            Volver a contabilidad
          </Link>
          <span className="text-indigo-300">|</span>
          <Link
            href="/dashboard"
            className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
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
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <FileText size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Órdenes de compra
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Gestión de purchase orders del proyecto
                  </p>
                </div>
              </div>
              <Link href={`/project/${id}/accounting/pos/new`}>
                <button className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105">
                  <Plus size={20} />
                  Nueva PO
                </button>
              </Link>
            </div>
          </header>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-blue-700 font-medium">Total POs</p>
                <FileText size={16} className="text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-700 font-medium">Borradores</p>
                <Edit size={16} className="text-slate-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats.draft}</p>
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
                <p className="text-xs text-emerald-700 font-medium">Aprobadas</p>
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-900">{stats.approved}</p>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-red-700 font-medium">Rechazadas</p>
                <XCircle size={16} className="text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-900">{stats.rejected}</p>
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
                <p className="text-xs text-green-700 font-medium">Comprometido</p>
                <TrendingUp size={16} className="text-green-600" />
              </div>
              <p className="text-xl font-bold text-green-900">
                {stats.approvedAmount.toLocaleString()} €
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
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
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
                    placeholder="Número, proveedor, descripción..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="draft">Borradores</option>
                  <option value="pending">Pendientes</option>
                  <option value="approved">Aprobadas</option>
                  <option value="rejected">Rechazadas</option>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
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
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  >
                    <option value="date">Fecha</option>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                />
              </div>
            </div>
          </div>

          {/* Results summary and export */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{filteredPOs.length}</span> de{" "}
              <span className="font-semibold">{stats.total}</span> órdenes de compra
            </p>
            <button
              onClick={exportPOs}
              className="flex items-center gap-2 px-4 py-2 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-medium"
            >
              <Download size={16} />
              Exportar
            </button>
          </div>

          {/* POs Table */}
          {filteredPOs.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <FileText size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm || statusFilter !== "all" || supplierFilter !== "all"
                  ? "No se encontraron POs"
                  : "No hay órdenes de compra"}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm || statusFilter !== "all" || supplierFilter !== "all"
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Comienza creando tu primera orden de compra"}
              </p>
              {!searchTerm && statusFilter === "all" && supplierFilter === "all" && (
                <Link href={`/project/${id}/accounting/pos/new`}>
                  <button className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg">
                    <Plus size={20} />
                    Crear primera PO
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
                        Descripción
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Cuenta
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Importe
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPOs.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-indigo-600">
                            PO-{po.number}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-slate-400" />
                            <span className="text-sm text-slate-900">{po.supplier}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-900 truncate max-w-xs">
                            {po.description}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate-600">
                            {po.budgetAccount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-slate-900">
                            {po.amount.toLocaleString()} €
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(po.status)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs text-slate-600">
                            <Calendar size={12} />
                            {formatDate(po.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedPO(po);
                                setShowDetailModal(true);
                              }}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Ver detalles"
                            >
                              <Eye size={16} />
                            </button>

                            {(po.status === "draft" || po.status === "rejected") && (
                              <Link href={`/project/${id}/accounting/pos/edit/${po.id}`}>
                                <button
                                  className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                              </Link>
                            )}

                            {po.status === "pending" &&
                              ["EP", "PM", "Controller"].includes(userRole) && (
                                <>
                                  <button
                                    onClick={() => handleApprovePO(po.id)}
                                    className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                    title="Aprobar"
                                  >
                                    <CheckCircle size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleRejectPO(po.id)}
                                    className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Rechazar"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}

                            {po.status !== "approved" && (
                              <button
                                onClick={() => handleDeletePO(po.id)}
                                className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-xl font-bold text-white">
                Detalles de PO-{selectedPO.number}
              </h2>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedPO(null);
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <div>{getStatusBadge(selectedPO.status)}</div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    {selectedPO.amount.toLocaleString()} €
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
                    {selectedPO.supplier}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Cuenta presupuestaria
                  </label>
                  <p className="text-sm font-mono text-slate-900">
                    {selectedPO.budgetAccount}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Descripción
                </label>
                <p className="text-sm text-slate-900">{selectedPO.description}</p>
              </div>

              {/* Notes */}
              {selectedPO.notes && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Notas adicionales
                  </label>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                    {selectedPO.notes}
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
                      <FileText size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        PO creada
                      </p>
                      <p className="text-xs text-slate-600">
                        {formatDate(selectedPO.createdAt)} por{" "}
                        {selectedPO.createdByName}
                      </p>
                    </div>
                  </div>

                  {/* Approved */}
                  {selectedPO.status === "approved" && selectedPO.approvedAt && (
                    <div className="flex items-start gap-3">
                      <div className="bg-emerald-100 p-2 rounded-lg mt-1">
                        <CheckCircle size={16} className="text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          PO aprobada
                        </p>
                        <p className="text-xs text-slate-600">
                          {formatDate(selectedPO.approvedAt)} por{" "}
                          {selectedPO.approvedByName}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Rejected */}
                  {selectedPO.status === "rejected" && selectedPO.rejectedAt && (
                    <div className="flex items-start gap-3">
                      <div className="bg-red-100 p-2 rounded-lg mt-1">
                        <XCircle size={16} className="text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          PO rechazada
                        </p>
                        <p className="text-xs text-slate-600">
                          {formatDate(selectedPO.rejectedAt)} por{" "}
                          {selectedPO.rejectedByName}
                        </p>
                        {selectedPO.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 p-2 rounded">
                            Motivo: {selectedPO.rejectionReason}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t pt-4 flex justify-end gap-3">
                {(selectedPO.status === "draft" || selectedPO.status === "rejected") && (
                  <Link href={`/project/${id}/accounting/pos/edit/${selectedPO.id}`}>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                      Editar PO
                    </button>
                  </Link>
                )}

                {selectedPO.status === "pending" &&
                  ["EP", "PM", "Controller"].includes(userRole) && (
                    <>
                      <button
                        onClick={() => {
                          handleApprovePO(selectedPO.id);
                          setShowDetailModal(false);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => {
                          handleRejectPO(selectedPO.id);
                          setShowDetailModal(false);
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Rechazar
                      </button>
                    </>
                  )}

                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedPO(null);
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
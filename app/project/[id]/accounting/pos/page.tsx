"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, getDoc, collection, getDocs, updateDoc, deleteDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { 
  FileText, Plus, Search, Eye, Edit, Trash2, X, FileEdit, Download, Receipt, 
  ArrowLeft, MoreHorizontal, Lock, Unlock, XCircle, ExternalLink, AlertTriangle, 
  ArrowUp, ArrowDown, Clock, CheckCircle2, Ban, Archive, LayoutGrid, List, 
  Calendar, Building2, Hash, KeyRound, AlertCircle, ShieldAlert, User
} from "lucide-react";
import jsPDF from "jspdf";
import { useAccountingPermissions, type POData } from "@/hooks/useAccountingPermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type POStatus = "draft" | "pending" | "approved" | "closed" | "cancelled";
type SortOrder = "desc" | "asc";
type ViewMode = "table" | "cards";

interface POItem {
  id?: string;
  description: string;
  subAccountId?: string;
  subAccountCode?: string;
  quantity: number;
  unitPrice: number;
  baseAmount?: number;
  totalAmount: number;
}

interface PO extends POData {
  number: string;
  version: number;
  supplier: string;
  supplierId: string;
  department?: string;
  generalDescription: string;
  description?: string;
  totalAmount: number;
  baseAmount?: number;
  vatAmount?: number;
  irpfAmount?: number;
  items: POItem[];
  committedAmount: number;
  invoicedAmount: number;
  createdAt: Date;
  createdByName: string;
  modificationHistory?: any[];
}

const STATUS_CONFIG: Record<POStatus, { bg: string; text: string; label: string; icon: typeof Clock; gradient: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador", icon: Edit, gradient: "from-slate-500 to-slate-600" },
  pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente", icon: Clock, gradient: "from-amber-500 to-orange-500" },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada", icon: CheckCircle2, gradient: "from-emerald-500 to-teal-500" },
  closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada", icon: Archive, gradient: "from-blue-500 to-indigo-500" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada", icon: Ban, gradient: "from-red-500 to-rose-500" },
};

export default function POsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  
  // Hook de permisos
  const { 
    loading: permissionsLoading, 
    error: permissionsError, 
    permissions,
    filterPOsByPermission,
    getPOPermissions,
    canEditPO,
  } = useAccountingPermissions(id);

  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<PO[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | POStatus>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [stats, setStats] = useState({ total: 0, draft: 0, pending: 0, approved: 0, closed: 0, cancelled: 0, totalBase: 0, totalInvoiced: 0 });
  const [previewPO, setPreviewPO] = useState<PO | null>(null);

  // Action modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);

  // Form state
  const [cancellationReason, setCancellationReason] = useState("");
  const [modificationReason, setModificationReason] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [processing, setProcessing] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => { if (id && !permissionsLoading) loadData(); }, [id, permissionsLoading]);
  useEffect(() => { filterAndSortPOs(); }, [searchTerm, statusFilter, pos, sortOrder]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".menu-container")) setOpenMenuId(null);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const posSnapshot = await getDocs(query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc")));
      const allPosData = posSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        version: docSnap.data().version || 1,
        committedAmount: docSnap.data().committedAmount || 0,
        invoicedAmount: docSnap.data().invoicedAmount || 0,
        items: docSnap.data().items || [],
        modificationHistory: docSnap.data().modificationHistory || [],
      })) as PO[];

      // Filtrar POs según permisos del usuario
      const accessiblePOs = filterPOsByPermission(allPosData);
      setPos(accessiblePOs);

      // Calcular estadísticas solo de las POs accesibles
      const newStats = accessiblePOs.reduce((acc, po) => {
        acc.total++;
        acc[po.status]++;
        if (po.status !== "cancelled") {
          acc.totalBase += po.baseAmount || po.totalAmount || 0;
          acc.totalInvoiced += po.invoicedAmount || 0;
        }
        return acc;
      }, { total: 0, draft: 0, pending: 0, approved: 0, closed: 0, cancelled: 0, totalBase: 0, totalInvoiced: 0 });
      setStats(newStats);
    } catch (error) {
      console.error("Error cargando POs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortPOs = () => {
    let filtered = [...pos];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((po) => 
        po.number.toLowerCase().includes(term) || 
        po.supplier.toLowerCase().includes(term) || 
        (po.generalDescription || po.description || "").toLowerCase().includes(term) ||
        (po.department || "").toLowerCase().includes(term)
      );
    }
    if (statusFilter !== "all") filtered = filtered.filter((po) => po.status === statusFilter);
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.getTime() || 0;
      const dateB = b.createdAt?.getTime() || 0;
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
    setFilteredPOs(filtered);
  };

  const toggleSortOrder = () => setSortOrder(sortOrder === "desc" ? "asc" : "desc");

  // Password verification
  const verifyPassword = async (): Promise<boolean> => {
    if (!passwordInput.trim()) { setPasswordError("Introduce tu contraseña"); return false; }
    const user = auth.currentUser;
    if (!user || !user.email) { setPasswordError("No hay usuario autenticado"); return false; }
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordInput);
      await reauthenticateWithCredential(user, credential);
      setPasswordError("");
      return true;
    } catch (error: any) {
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        setPasswordError("Contraseña incorrecta");
      } else {
        setPasswordError("Error de autenticación");
      }
      return false;
    }
  };

  const resetModalState = () => {
    setPasswordInput("");
    setPasswordError("");
    setCancellationReason("");
    setModificationReason("");
    setSelectedPO(null);
  };

  const formatCurrency = (amount: number): string => 
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  
  const formatDate = (date: Date) => 
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";
  
  const formatDateTime = (date: Date) => 
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "-";
  
  const formatDateRelative = (date: Date) => {
    if (!date) return "-";
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Ayer";
    if (diff < 7) return `Hace ${diff} días`;
    return formatDate(date);
  };

  const getStatusBadge = (status: POStatus, size: "sm" | "md" = "sm") => {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;
    const sizeClasses = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-lg font-medium ${config.bg} ${config.text} ${sizeClasses}`}>
        <Icon size={size === "sm" ? 12 : 14} />
        {config.label}
      </span>
    );
  };

  const getMenuPosition = (poId: string) => {
    const button = menuButtonRefs.current.get(poId);
    if (!button) return { top: 0, left: 0 };
    const rect = button.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.right - 192 };
  };

  const closeMenu = () => setOpenMenuId(null);

  // Actions - ahora verifican permisos
  const handleEditDraft = (po: PO) => {
    if (!canEditPO(po)) return;
    closeMenu();
    router.push(`/project/${id}/accounting/pos/${po.id}/edit`);
  };

  const handleCreateInvoice = (po: PO) => {
    const poPerms = getPOPermissions(po);
    if (!poPerms.canCreateInvoice) return;
    closeMenu();
    router.push(`/project/${id}/accounting/invoices/new?poId=${po.id}`);
  };

  const handleClosePO = (po: PO) => {
    const poPerms = getPOPermissions(po);
    if (!poPerms.canClose) return;
    closeMenu();
    setSelectedPO(po);
    resetModalState();
    setShowCloseModal(true);
  };

  const confirmClosePO = async () => {
    if (!selectedPO) return;
    const verified = await verifyPassword();
    if (!verified) return;
    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        status: "closed",
        closedAt: Timestamp.now(),
        closedBy: permissions.userId,
        closedByName: permissions.userName,
      });
      setShowCloseModal(false);
      resetModalState();
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al cerrar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleReopenPO = (po: PO) => {
    const poPerms = getPOPermissions(po);
    if (!poPerms.canReopen) return;
    closeMenu();
    setSelectedPO(po);
    resetModalState();
    setShowReopenModal(true);
  };

  const confirmReopenPO = async () => {
    if (!selectedPO) return;
    const verified = await verifyPassword();
    if (!verified) return;
    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        status: "approved",
        closedAt: null,
        closedBy: null,
        closedByName: null,
      });
      setShowReopenModal(false);
      resetModalState();
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al reabrir la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelPO = (po: PO) => {
    const poPerms = getPOPermissions(po);
    if (!poPerms.canCancel) return;
    closeMenu();
    setSelectedPO(po);
    resetModalState();
    setShowCancelModal(true);
  };

  const confirmCancelPO = async () => {
    if (!selectedPO || !cancellationReason.trim()) return;
    const verified = await verifyPassword();
    if (!verified) return;
    setProcessing(true);
    try {
      if (selectedPO.status === "approved") {
        for (const item of selectedPO.items) {
          if (item.subAccountId) {
            const itemBaseAmount = item.baseAmount || item.quantity * item.unitPrice || 0;
            const accountsSnap = await getDocs(collection(db, `projects/${id}/accounts`));
            for (const accountDoc of accountsSnap.docs) {
              try {
                const subAccountRef = doc(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`, item.subAccountId);
                const subAccountSnap = await getDoc(subAccountRef);
                if (subAccountSnap.exists()) {
                  await updateDoc(subAccountRef, {
                    committed: Math.max(0, (subAccountSnap.data().committed || 0) - itemBaseAmount),
                  });
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
      }
      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: permissions.userId,
        cancelledByName: permissions.userName,
        cancellationReason: cancellationReason.trim(),
        committedAmount: 0,
      });
      setShowCancelModal(false);
      resetModalState();
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al anular la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleModifyPO = (po: PO) => {
    const poPerms = getPOPermissions(po);
    if (po.status !== "approved" || !permissions.isProjectRole) return;
    closeMenu();
    setSelectedPO(po);
    resetModalState();
    setShowModifyModal(true);
  };

  const confirmModifyPO = async () => {
    if (!selectedPO || !modificationReason.trim()) return;
    setProcessing(true);
    try {
      const newVersion = (selectedPO.version || 1) + 1;
      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        version: newVersion,
        status: "draft",
        modificationHistory: [
          ...(selectedPO.modificationHistory || []),
          {
            date: Timestamp.now(),
            userId: permissions.userId || "",
            userName: permissions.userName,
            reason: modificationReason.trim(),
            previousVersion: selectedPO.version || 1,
          },
        ],
        approvedAt: null,
        approvedBy: null,
        approvedByName: null,
        approvalSteps: null,
        currentApprovalStep: null,
      });
      setShowModifyModal(false);
      router.push(`/project/${id}/accounting/pos/${selectedPO.id}/edit`);
    } catch (error) {
      console.error("Error:", error);
      alert("Error al modificar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteDraft = (po: PO) => {
    const poPerms = getPOPermissions(po);
    if (!poPerms.canDelete) return;
    closeMenu();
    setSelectedPO(po);
    setShowDeleteModal(true);
  };

  const confirmDeleteDraft = async () => {
    if (!selectedPO) return;
    setProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/pos`, selectedPO.id));
      setShowDeleteModal(false);
      resetModalState();
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al eliminar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const generatePDF = (po: PO) => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, pageWidth, 45, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    pdf.text("ORDEN DE COMPRA", margin, 20);
    pdf.setFontSize(32);
    pdf.text("PO-" + po.number, margin, 35);
    if (po.version > 1) {
      pdf.setFontSize(12);
      pdf.text("V" + String(po.version).padStart(2, "0"), margin + pdf.getTextWidth("PO-" + po.number) + 5, 35);
    }

    y = 55;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 25, 3, 3, "F");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("PROVEEDOR", margin + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(12);
    pdf.text(po.supplier, margin + 5, y + 18);

    y += 35;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 25, 3, 3, "F");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("IMPORTE TOTAL", margin + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(16);
    pdf.text(formatCurrency(po.totalAmount) + " €", margin + 5, y + 18);

    y += 35;
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("ITEMS (" + po.items.length + ")", margin, y);
    y += 8;

    po.items.forEach((item, index) => {
      pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, 12, 0, 0, "F");
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      const desc = (item.description || "").substring(0, 50) + ((item.description || "").length > 50 ? "..." : "");
      pdf.text(desc, margin + 5, y + 8);
      pdf.setFont("helvetica", "bold");
      pdf.text(formatCurrency(item.totalAmount) + " €", pageWidth - margin - 25, y + 8);
      y += 12;
    });

    y += 10;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Generado el " + formatDateTime(new Date()), margin, y);
    pdf.save("PO-" + po.number + (po.version > 1 ? "-V" + String(po.version).padStart(2, "0") : "") + ".pdf");
    closeMenu();
  };

  // Mostrar mensaje de permisos o error
  if (permissionsLoading || loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (permissionsError || !permissions.hasAccountingAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-500 mb-6">{permissionsError || "No tienes permisos para acceder a esta sección"}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"
          >
            <ArrowLeft size={16} />
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }

  // Indicador de permisos del usuario
  const getPermissionsBadge = () => {
    if (permissions.isProjectRole) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium">
          <User size={12} />
          {permissions.role} · Todo el proyecto
        </span>
      );
    }
    if (permissions.isDepartmentRole) {
      if (permissions.position === "Crew") {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
            <User size={12} />
            {permissions.position} · Solo mis POs
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
          <Building2 size={12} />
          {permissions.position} · {permissions.department}
        </span>
      );
    }
    return null;
  };

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                <ArrowLeft size={12} />
                Proyectos
              </Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting`} className="hover:text-slate-900 transition-colors">
                Panel
              </Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <FileText size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Órdenes de compra</h1>
                <div className="mt-1">
                  {getPermissionsBadge()}
                </div>
              </div>
            </div>
            {permissions.canCreatePO && (
              <Link
                href={`/project/${id}/accounting/pos/new`}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Plus size={18} />
                Nueva PO
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {(["draft", "pending", "approved", "closed", "cancelled"] as POStatus[]).map((status) => {
            const config = STATUS_CONFIG[status];
            const Icon = config.icon;
            const count = stats[status];
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(isActive ? "all" : status)}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left group overflow-hidden ${
                  isActive ? "border-slate-900 bg-slate-50" : "border-slate-100 hover:border-slate-200 bg-white"
                }`}
              >
                <div className={`absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-20 bg-gradient-to-br ${config.gradient} group-hover:opacity-30 transition-opacity`} />
                <div className="relative">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${config.bg}`}>
                    <Icon size={16} className={config.text} />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500">{config.label}</p>
                </div>
                {isActive && <div className="absolute top-2 right-2 w-2 h-2 bg-slate-900 rounded-full" />}
              </button>
            );
          })}
        </div>

        {/* Filters & Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por número, proveedor, descripción o departamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleSortOrder}
              className="flex items-center gap-2 px-4 py-3 border border-slate-200 rounded-xl hover:border-slate-300 bg-white text-sm transition-colors group"
              title={sortOrder === "desc" ? "Más recientes primero" : "Más antiguas primero"}
            >
              <div className="relative w-4 h-4">
                <ArrowUp size={14} className={`absolute inset-0 transition-all ${sortOrder === "asc" ? "opacity-100 text-slate-900" : "opacity-30 text-slate-400"}`} />
                <ArrowDown size={14} className={`absolute inset-0 transition-all ${sortOrder === "desc" ? "opacity-100 text-slate-900" : "opacity-30 text-slate-400"}`} />
              </div>
              <span className="text-slate-700 hidden sm:inline">{sortOrder === "desc" ? "Recientes" : "Antiguas"}</span>
            </button>
            <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                onClick={() => setViewMode("table")}
                className={`px-4 py-3 text-sm transition-colors ${viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`px-4 py-3 text-sm transition-colors border-l border-slate-200 ${viewMode === "cards" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <LayoutGrid size={18} />
              </button>
            </div>
            {(statusFilter !== "all" || searchTerm) && (
              <button
                onClick={() => { setStatusFilter("all"); setSearchTerm(""); }}
                className="flex items-center gap-2 px-4 py-3 border border-slate-200 rounded-xl hover:border-red-300 hover:bg-red-50 text-sm text-slate-600 hover:text-red-600 transition-colors"
              >
                <X size={16} />
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {(statusFilter !== "all" || searchTerm) && filteredPOs.length > 0 && (
          <div className="mb-4 text-sm text-slate-500">
            Mostrando {filteredPOs.length} de {stats.total} órdenes
          </div>
        )}

        {/* Content */}
        {filteredPOs.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {searchTerm || statusFilter !== "all" ? "No se encontraron resultados" : "Sin órdenes de compra"}
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              {searchTerm || statusFilter !== "all"
                ? "Prueba a ajustar los filtros de búsqueda"
                : permissions.canCreatePO
                ? "Crea tu primera orden de compra para empezar"
                : "No tienes POs asignadas aún"}
            </p>
            {!searchTerm && statusFilter === "all" && permissions.canCreatePO && (
              <Link
                href={`/project/${id}/accounting/pos/new`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Plus size={18} />
                Nueva PO
              </Link>
            )}
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <Hash size={12} />
                      Número
                    </div>
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <Building2 size={12} />
                      Proveedor / Dpto
                    </div>
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Importe</th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-2">
                      <Calendar size={12} />
                      Fecha
                    </div>
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPOs.map((po) => {
                  const baseAmount = po.baseAmount || po.totalAmount || 0;
                  const invoiceProgress = po.status === "approved" && baseAmount > 0 ? Math.min(100, (po.invoicedAmount / baseAmount) * 100) : 0;
                  const poPerms = getPOPermissions(po);
                  const isOwnPO = po.createdBy === permissions.userId;

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <button onClick={() => setPreviewPO(po)} className="text-left hover:text-indigo-600 transition-colors">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 group-hover:text-indigo-600">PO-{po.number}</p>
                            {po.version > 1 && (
                              <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md font-medium">
                                V{String(po.version).padStart(2, "0")}
                              </span>
                            )}
                            {isOwnPO && !permissions.isProjectRole && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md font-medium">
                                Mía
                              </span>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-900 font-medium">{po.supplier}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {po.department && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {po.department}
                            </span>
                          )}
                          <p className="text-xs text-slate-500 line-clamp-1 max-w-[150px]">
                            {po.generalDescription || po.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(baseAmount)} €</p>
                        {po.status === "approved" && po.invoicedAmount > 0 && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${invoiceProgress}%` }} />
                              </div>
                              <span className="text-xs text-emerald-600 font-medium">{Math.round(invoiceProgress)}%</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">{getStatusBadge(po.status)}</td>
                      <td className="px-6 py-4 text-center">
                        <p className="text-sm text-slate-600">{formatDateRelative(po.createdAt)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative menu-container">
                          <button
                            ref={(el) => { if (el) menuButtonRefs.current.set(po.id, el); }}
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === po.id ? null : po.id); }}
                            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPOs.map((po) => {
              const baseAmount = po.baseAmount || po.totalAmount || 0;
              const invoiceProgress = po.status === "approved" && baseAmount > 0 ? Math.min(100, (po.invoicedAmount / baseAmount) * 100) : 0;
              const config = STATUS_CONFIG[po.status];
              const isOwnPO = po.createdBy === permissions.userId;

              return (
                <div
                  key={po.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-slate-300 transition-all group relative overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradient}`} />
                  <div className="flex items-start justify-between mb-4">
                    <button onClick={() => setPreviewPO(po)} className="text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">PO-{po.number}</p>
                        {po.version > 1 && (
                          <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md font-medium">
                            V{String(po.version).padStart(2, "0")}
                          </span>
                        )}
                        {isOwnPO && !permissions.isProjectRole && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md font-medium">
                            Mía
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 font-medium">{po.supplier}</p>
                      {po.department && (
                        <span className="inline-block mt-1 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {po.department}
                        </span>
                      )}
                    </button>
                    <div className="relative menu-container">
                      <button
                        ref={(el) => { if (el) menuButtonRefs.current.set(po.id, el); }}
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === po.id ? null : po.id); }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                  {(po.generalDescription || po.description) && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-4">{po.generalDescription || po.description}</p>
                  )}
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Base imponible</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(baseAmount)} €</p>
                    </div>
                    {getStatusBadge(po.status)}
                  </div>
                  {po.status === "approved" && po.invoicedAmount > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500">Facturado</span>
                        <span className="text-emerald-600 font-medium">{formatCurrency(po.invoicedAmount)} €</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all" style={{ width: `${invoiceProgress}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatDateRelative(po.createdAt)}</span>
                    <span>{po.items?.length || 0} items</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Menu - con verificación de permisos */}
        {openMenuId && (
          <div
            className="fixed w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] py-1"
            style={getMenuPosition(openMenuId)}
          >
            {(() => {
              const po = filteredPOs.find((p) => p.id === openMenuId);
              if (!po) return null;
              const poPerms = getPOPermissions(po);

              return (
                <>
                  <Link
                    href={`/project/${id}/accounting/pos/${po.id}`}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                    onClick={closeMenu}
                  >
                    <Eye size={15} className="text-slate-400" />
                    Ver detalle
                  </Link>
                  <button
                    onClick={() => generatePDF(po)}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <Download size={15} className="text-slate-400" />
                    Descargar PDF
                  </button>

                  {po.status === "draft" && poPerms.canEdit && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => handleEditDraft(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <Edit size={15} className="text-slate-400" />
                        Editar borrador
                      </button>
                      {poPerms.canDelete && (
                        <button
                          onClick={() => handleDeleteDraft(po)}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                        >
                          <Trash2 size={15} />
                          Eliminar
                        </button>
                      )}
                    </>
                  )}

                  {po.status === "approved" && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      {poPerms.canCreateInvoice && (
                        <button
                          onClick={() => handleCreateInvoice(po)}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <Receipt size={15} className="text-slate-400" />
                          Crear factura
                        </button>
                      )}
                      {permissions.isProjectRole && (
                        <button
                          onClick={() => handleModifyPO(po)}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <FileEdit size={15} className="text-slate-400" />
                          Modificar PO
                        </button>
                      )}
                      {poPerms.canClose && (
                        <button
                          onClick={() => handleClosePO(po)}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <Lock size={15} className="text-slate-400" />
                          Cerrar PO
                        </button>
                      )}
                      {poPerms.canCancel && (
                        <button
                          onClick={() => handleCancelPO(po)}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                        >
                          <XCircle size={15} />
                          Anular PO
                        </button>
                      )}
                    </>
                  )}

                  {po.status === "closed" && poPerms.canReopen && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => handleReopenPO(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <Unlock size={15} className="text-slate-400" />
                        Reabrir PO
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </main>

      {/* Quick Preview Modal */}
      {previewPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewPO(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`bg-gradient-to-r ${STATUS_CONFIG[previewPO.status].gradient} px-6 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-lg">PO-{previewPO.number}</h3>
                    {previewPO.version > 1 && (
                      <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-lg backdrop-blur-sm">
                        V{String(previewPO.version).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <p className="text-white/80 text-sm mt-0.5">{previewPO.supplier}</p>
                </div>
                <button onClick={() => setPreviewPO(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Base imponible</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(previewPO.baseAmount || previewPO.totalAmount)} €</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Total con IVA</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(previewPO.totalAmount)} €</p>
                </div>
              </div>

              {previewPO.status === "approved" && (
                <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-emerald-700 font-medium">Progreso de facturación</span>
                    <span className="text-sm text-emerald-700 font-bold">
                      {formatCurrency(previewPO.invoicedAmount)} / {formatCurrency(previewPO.baseAmount || previewPO.totalAmount)} €
                    </span>
                  </div>
                  <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((previewPO.invoicedAmount || 0) / (previewPO.baseAmount || previewPO.totalAmount || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {(previewPO.generalDescription || previewPO.description) && (
                <div className="mb-6">
                  <p className="text-xs text-slate-500 uppercase mb-2 font-medium">Descripción</p>
                  <p className="text-sm text-slate-700 line-clamp-3">{previewPO.generalDescription || previewPO.description}</p>
                </div>
              )}

              <div className="mb-6 flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <FileText size={16} className="text-indigo-600" />
                  </div>
                  <span className="text-sm text-slate-600">Items incluidos</span>
                </div>
                <span className="font-bold text-slate-900">{previewPO.items?.length || 0}</span>
              </div>

              <div className="text-xs text-slate-500 space-y-2">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span>Fecha de creación</span>
                  <span className="text-slate-700 font-medium">{formatDate(previewPO.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span>Creado por</span>
                  <span className="text-slate-700 font-medium">{previewPO.createdByName}</span>
                </div>
                {previewPO.department && (
                  <div className="flex justify-between items-center py-2">
                    <span>Departamento</span>
                    <span className="text-slate-700 font-medium">{previewPO.department}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
              <Link
                href={`/project/${id}/accounting/pos/${previewPO.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
                onClick={() => setPreviewPO(null)}
              >
                <ExternalLink size={16} />
                Ver detalle completo
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Close PO Modal */}
      {showCloseModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowCloseModal(false); resetModalState(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Lock size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Cerrar PO-{selectedPO.number}</h3>
                <p className="text-xs text-slate-500">Esta acción requiere confirmación</p>
              </div>
            </div>
            <div className="p-6">
              {(selectedPO.baseAmount || selectedPO.totalAmount) - selectedPO.invoicedAmount > 0 && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Esta PO tiene importe sin facturar</p>
                      <p className="text-xs mt-1">Pendiente: {formatCurrency((selectedPO.baseAmount || selectedPO.totalAmount) - selectedPO.invoicedAmount)} €</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <KeyRound size={14} />
                  Confirma tu contraseña
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                  placeholder="Tu contraseña de usuario"
                  className={`w-full px-4 py-3 border ${passwordError ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`}
                  autoFocus
                />
                {passwordError && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{passwordError}</p>}
                <p className="text-xs text-slate-500 mt-2">Usuario: {permissions.userEmail}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowCloseModal(false); resetModalState(); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmClosePO} disabled={processing || !passwordInput.trim()} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {processing ? "Cerrando..." : "Cerrar PO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reopen PO Modal */}
      {showReopenModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowReopenModal(false); resetModalState(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Unlock size={20} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Reabrir PO-{selectedPO.number}</h3>
                <p className="text-xs text-slate-500">Volverá al estado "Aprobada"</p>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <KeyRound size={14} />
                  Confirma tu contraseña
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                  placeholder="Tu contraseña de usuario"
                  className={`w-full px-4 py-3 border ${passwordError ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`}
                  autoFocus
                />
                {passwordError && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{passwordError}</p>}
                <p className="text-xs text-slate-500 mt-2">Usuario: {permissions.userEmail}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowReopenModal(false); resetModalState(); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmReopenPO} disabled={processing || !passwordInput.trim()} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {processing ? "Reabriendo..." : "Reabrir PO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel PO Modal */}
      {showCancelModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowCancelModal(false); resetModalState(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <XCircle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Anular PO-{selectedPO.number}</h3>
                <p className="text-xs text-slate-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="p-6">
              {selectedPO.status === "approved" && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Se liberará el presupuesto comprometido</p>
                      <p className="text-xs mt-1">{formatCurrency(selectedPO.committedAmount)} € volverán a estar disponibles</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de anulación *</label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explica por qué se anula esta PO..."
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
                  placeholder="Tu contraseña de usuario"
                  className={`w-full px-4 py-3 border ${passwordError ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`}
                />
                {passwordError && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{passwordError}</p>}
                <p className="text-xs text-slate-500 mt-2">Usuario: {permissions.userEmail}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowCancelModal(false); resetModalState(); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmCancelPO} disabled={processing || !cancellationReason.trim() || !passwordInput.trim()} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {processing ? "Anulando..." : "Anular PO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modify Modal */}
      {showModifyModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModifyModal(false); resetModalState(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <FileEdit size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Modificar PO-{selectedPO.number}</h3>
                <p className="text-xs text-slate-500">Crear nueva versión para editar</p>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Pasará a V{String((selectedPO.version || 1) + 1).padStart(2, "0")} en borrador</p>
                    <p className="text-xs mt-1">Deberás editarla y enviarla nuevamente para aprobación.</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de la modificación *</label>
                <textarea
                  value={modificationReason}
                  onChange={(e) => setModificationReason(e.target.value)}
                  placeholder="Explica por qué se modifica esta PO..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowModifyModal(false); resetModalState(); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmModifyPO} disabled={processing || !modificationReason.trim()} className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {processing ? "Modificando..." : "Modificar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Draft Modal */}
      {showDeleteModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowDeleteModal(false); resetModalState(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Eliminar PO-{selectedPO.number}</h3>
                <p className="text-xs text-slate-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-6">¿Estás seguro de que quieres eliminar este borrador? Esta acción es permanente.</p>

              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteModal(false); resetModalState(); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmDeleteDraft} disabled={processing} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {processing ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

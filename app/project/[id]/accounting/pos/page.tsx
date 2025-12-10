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
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  FileText,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
  FileEdit,
  Download,
  Receipt,
  ArrowLeft,
  MoreHorizontal,
  Lock,
  Unlock,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import jsPDF from "jspdf";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type POStatus = "draft" | "pending" | "approved" | "closed" | "cancelled";

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

interface PO {
  id: string;
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
  status: POStatus;
  committedAmount: number;
  invoicedAmount: number;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
}

export default function POsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [pos, setPos] = useState<PO[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | POStatus>("all");

  // Quick preview modal (minimal)
  const [previewPO, setPreviewPO] = useState<PO | null>(null);

  // Action modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [modificationReason, setModificationReason] = useState("");
  const [processing, setProcessing] = useState(false);

  // Menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  useEffect(() => {
    filterPOs();
  }, [searchTerm, statusFilter, pos]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".menu-container")) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const posSnapshot = await getDocs(
        query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc"))
      );

      const posData = posSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        version: docSnap.data().version || 1,
        committedAmount: docSnap.data().committedAmount || 0,
        invoicedAmount: docSnap.data().invoicedAmount || 0,
        items: docSnap.data().items || [],
      })) as PO[];

      setPos(posData);
    } catch (error) {
      console.error("Error cargando POs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterPOs = () => {
    let filtered = [...pos];

    if (searchTerm) {
      filtered = filtered.filter(
        (po) =>
          po.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          po.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (po.generalDescription || po.description || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((po) => po.status === statusFilter);
    }

    setFilteredPOs(filtered);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatDate = (date: Date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatDateTime = (date: Date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getStatusBadge = (status: POStatus) => {
    const config: Record<POStatus, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada" },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada" },
    };
    const c = config[status];
    return (
      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  // Actions
  const handleEditDraft = (po: PO) => {
    closeMenu();
    router.push(`/project/${id}/accounting/pos/${po.id}/edit`);
  };

  const handleCreateInvoice = (po: PO) => {
    closeMenu();
    router.push(`/project/${id}/accounting/invoices/new?poId=${po.id}`);
  };

  const handleClosePO = async (po: PO) => {
    if (po.status !== "approved") return;
    closeMenu();

    const pendingBase = (po.baseAmount || po.totalAmount) - po.invoicedAmount;
    if (
      pendingBase > 0 &&
      !confirm(`Esta PO tiene ${formatCurrency(pendingBase)} € sin facturar. ¿Cerrarla igualmente?`)
    ) {
      return;
    }

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, po.id), {
        status: "closed",
        closedAt: Timestamp.now(),
        closedBy: userId,
        closedByName: userName,
      });
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al cerrar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleReopenPO = async (po: PO) => {
    if (po.status !== "closed") return;
    closeMenu();

    if (!confirm("¿Reabrir esta PO? Volverá al estado 'Aprobada'.")) return;

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, po.id), {
        status: "approved",
        closedAt: null,
        closedBy: null,
        closedByName: null,
      });
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al reabrir la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelPO = (po: PO) => {
    if ((po.status !== "approved" && po.status !== "draft") || po.invoicedAmount > 0) return;
    setSelectedPO(po);
    setShowCancelModal(true);
    closeMenu();
  };

  const confirmCancelPO = async () => {
    if (!selectedPO || !cancellationReason.trim()) return;

    setProcessing(true);
    try {
      // Release committed budget if approved
      if (selectedPO.status === "approved") {
        for (const item of selectedPO.items) {
          if (item.subAccountId) {
            const itemBaseAmount = item.baseAmount || item.quantity * item.unitPrice || 0;
            const accountsSnap = await getDocs(collection(db, `projects/${id}/accounts`));

            for (const accountDoc of accountsSnap.docs) {
              try {
                const subAccountRef = doc(
                  db,
                  `projects/${id}/accounts/${accountDoc.id}/subaccounts`,
                  item.subAccountId
                );
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
        cancelledBy: userId,
        cancelledByName: userName,
        cancellationReason: cancellationReason.trim(),
        committedAmount: 0,
      });

      await loadData();
      setShowCancelModal(false);
      setSelectedPO(null);
      setCancellationReason("");
    } catch (error) {
      console.error("Error:", error);
      alert("Error al anular la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleModifyPO = (po: PO) => {
    if (po.status !== "approved") return;
    setSelectedPO(po);
    setModificationReason("");
    setShowModifyModal(true);
    closeMenu();
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
          ...(selectedPO as any).modificationHistory || [],
          {
            date: Timestamp.now(),
            userId: userId || "",
            userName: userName,
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

  const handleDeleteDraft = async (po: PO) => {
    if (po.status !== "draft") return;
    closeMenu();

    if (!confirm(`¿Eliminar PO-${po.number}? Esta acción no se puede deshacer.`)) return;

    setProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/pos`, po.id));
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al eliminar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  // PDF Generation (simplified)
  const generatePDF = (po: PO) => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header
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

    // Supplier
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

    // Amount
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

    // Items
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

    // Footer
    y += 10;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Generado el " + formatDateTime(new Date()), margin, y);

    pdf.save("PO-" + po.number + (po.version > 1 ? "-V" + String(po.version).padStart(2, "0") : "") + ".pdf");
    closeMenu();
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

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

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <FileText size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Órdenes de compra</h1>
                <p className="text-slate-500 text-sm mt-0.5">{projectName}</p>
              </div>
            </div>

            <Link
              href={`/project/${id}/accounting/pos/new`}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus size={18} />
              Nueva PO
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar por número, proveedor o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm min-w-[180px]"
          >
            <option value="all">Todos los estados</option>
            <option value="draft">Borradores</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="closed">Cerradas</option>
            <option value="cancelled">Anuladas</option>
          </select>
        </div>

        {/* Table or Empty State */}
        {filteredPOs.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {searchTerm || statusFilter !== "all"
                ? "No se encontraron resultados"
                : "Sin órdenes de compra"}
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              {searchTerm || statusFilter !== "all"
                ? "Prueba a ajustar los filtros de búsqueda"
                : "Crea tu primera orden de compra para empezar"}
            </p>
            {!searchTerm && statusFilter === "all" && (
              <Link
                href={`/project/${id}/accounting/pos/new`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Plus size={18} />
                Nueva PO
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Importe
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPOs.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setPreviewPO(po)}
                        className="text-left hover:text-indigo-600 transition-colors"
                      >
                        <p className="font-semibold text-slate-900 group-hover:text-indigo-600">
                          PO-{po.number}
                          {po.version > 1 && (
                            <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md font-medium">
                              V{String(po.version).padStart(2, "0")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatDate(po.createdAt)}</p>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-900 font-medium">{po.supplier}</p>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                        {po.generalDescription || po.description}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(po.totalAmount)} €
                      </p>
                      {po.status === "approved" && po.invoicedAmount > 0 && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          Fact: {formatCurrency(po.invoicedAmount)} €
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(po.status)}</td>
                    <td className="px-6 py-4">
                      <div className="relative menu-container">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === po.id) {
                              closeMenu();
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuHeight = 200;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const showAbove = spaceBelow < menuHeight;

                              setMenuPosition({
                                top: showAbove ? rect.top - menuHeight : rect.bottom + 4,
                                left: rect.right - 192,
                              });
                              setOpenMenuId(po.id);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Floating Menu */}
        {openMenuId && menuPosition && (
          <div
            className="fixed w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] py-1"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {(() => {
              const po = filteredPOs.find((p) => p.id === openMenuId);
              if (!po) return null;
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

                  {po.status === "draft" && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => handleEditDraft(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <Edit size={15} className="text-slate-400" />
                        Editar borrador
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                      >
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </>
                  )}

                  {po.status === "approved" && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => handleCreateInvoice(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <Receipt size={15} className="text-slate-400" />
                        Crear factura
                      </button>
                      <button
                        onClick={() => handleModifyPO(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <FileEdit size={15} className="text-slate-400" />
                        Modificar PO
                      </button>
                      <button
                        onClick={() => handleClosePO(po)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <Lock size={15} className="text-slate-400" />
                        Cerrar PO
                      </button>
                      {po.invoicedAmount === 0 && (
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

                  {po.status === "closed" && (
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

      {/* Quick Preview Modal (minimal) */}
      {previewPO && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPO(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">
                  PO-{previewPO.number}
                  {previewPO.version > 1 && (
                    <span className="ml-2 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg">
                      V{String(previewPO.version).padStart(2, "0")}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500">{previewPO.supplier}</p>
              </div>
              <button
                onClick={() => setPreviewPO(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Importe total</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatCurrency(previewPO.totalAmount)} €
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Estado</p>
                  <div className="mt-1">{getStatusBadge(previewPO.status)}</div>
                </div>
              </div>

              {/* Description preview */}
              {(previewPO.generalDescription || previewPO.description) && (
                <div className="mb-6">
                  <p className="text-xs text-slate-500 uppercase mb-2">Descripción</p>
                  <p className="text-sm text-slate-700 line-clamp-3">
                    {previewPO.generalDescription || previewPO.description}
                  </p>
                </div>
              )}

              {/* Items count */}
              <div className="mb-6 flex items-center justify-between text-sm">
                <span className="text-slate-500">Items</span>
                <span className="font-medium text-slate-900">{previewPO.items?.length || 0}</span>
              </div>

              {/* Quick info */}
              <div className="text-xs text-slate-500 space-y-1 mb-6">
                <div className="flex justify-between">
                  <span>Fecha</span>
                  <span className="text-slate-700">{formatDate(previewPO.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Creado por</span>
                  <span className="text-slate-700">{previewPO.createdByName}</span>
                </div>
                {previewPO.department && (
                  <div className="flex justify-between">
                    <span>Departamento</span>
                    <span className="text-slate-700">{previewPO.department}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
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

      {/* Cancel Modal */}
      {showCancelModal && selectedPO && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowCancelModal(false);
            setSelectedPO(null);
            setCancellationReason("");
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Anular PO-{selectedPO.number}</h3>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Motivo de anulación *
                </label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explica por qué se anula esta PO..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm"
                />
                {selectedPO.status === "approved" && (
                  <p className="text-xs text-slate-500 mt-2">
                    Se liberará el presupuesto comprometido ({formatCurrency(selectedPO.committedAmount)} €)
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedPO(null);
                    setCancellationReason("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCancelPO}
                  disabled={processing || !cancellationReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {processing ? "Anulando..." : "Confirmar anulación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modify Modal */}
      {showModifyModal && selectedPO && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowModifyModal(false);
            setSelectedPO(null);
            setModificationReason("");
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Modificar PO-{selectedPO.number}</h3>
            </div>
            <div className="p-6">
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">
                      Pasará a V{String((selectedPO.version || 1) + 1).padStart(2, "0")} en borrador
                    </p>
                    <p className="text-xs mt-1">
                      Deberás editarla y enviarla nuevamente para aprobación.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Motivo de la modificación *
                </label>
                <textarea
                  value={modificationReason}
                  onChange={(e) => setModificationReason(e.target.value)}
                  placeholder="Explica por qué se modifica esta PO..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowModifyModal(false);
                    setSelectedPO(null);
                    setModificationReason("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModifyPO}
                  disabled={processing || !modificationReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {processing ? "Modificando..." : "Modificar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

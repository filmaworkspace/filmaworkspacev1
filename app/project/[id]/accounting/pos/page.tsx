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
  addDoc,
} from "firebase/firestore";
import {
  Folder,
  FileText,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  X,
  FileEdit,
  ArrowRight,
  Calendar,
  DollarSign,
  User,
  Building2,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

type POStatus = 
  | "draft"
  | "pending"
  | "approved"
  | "closed"
  | "cancelled"
  | "modified";

interface POItem {
  description: string;
  budgetAccount: string;
  subAccountId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

interface PO {
  id: string;
  number: string;
  version: number;
  originalPOId?: string;
  previousVersionId?: string;
  nextVersionId?: string;
  supplier: string;
  supplierId: string;
  generalDescription: string;
  totalAmount: number;
  items: POItem[];
  attachmentUrl?: string;
  status: POStatus;
  committedAmount: number;
  invoicedAmount: number;
  remainingAmount: number;
  approvalSteps?: any[];
  currentApprovalStep?: number;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  approvedAt?: Date;
  approvedBy?: string;
  approvedByName?: string;
  closedAt?: Date;
  closedBy?: string;
  closedByName?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelledByName?: string;
  cancellationReason?: string;
}

export default function POsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [pos, setPos] = useState<PO[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | POStatus>("all");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    filterPOs();
  }, [searchTerm, statusFilter, pos]);

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

      const posData = posSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        approvedAt: doc.data().approvedAt?.toDate(),
        closedAt: doc.data().closedAt?.toDate(),
        cancelledAt: doc.data().cancelledAt?.toDate(),
        version: doc.data().version || 1,
        committedAmount: doc.data().committedAmount || 0,
        invoicedAmount: doc.data().invoicedAmount || 0,
        remainingAmount: doc.data().remainingAmount || 0,
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
          po.generalDescription.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((po) => po.status === statusFilter);
    }

    setFilteredPOs(filtered);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: POStatus) => {
    switch (status) {
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <Edit size={12} />
            Borrador
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
            <Clock size={12} />
            Pendiente aprobación
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
            <CheckCircle size={12} />
            Aprobada
          </span>
        );
      case "closed":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
            <CheckCircle size={12} />
            Cerrada
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
            <XCircle size={12} />
            Anulada
          </span>
        );
      case "modified":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
            <ArrowRight size={12} />
            Modificada
          </span>
        );
      default:
        return null;
    }
  };

  const handleClosePO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    if (po.status !== "approved") {
      alert("Solo se pueden cerrar POs aprobadas");
      return;
    }

    if (po.invoicedAmount < po.totalAmount) {
      const pendingAmount = formatCurrency(po.totalAmount - po.invoicedAmount);
      if (!confirm(`Esta PO aún tiene ${pendingAmount} € sin facturar.\n¿Deseas cerrarla de todas formas?`)) {
        return;
      }
    }

    setProcessing(true);
    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      await updateDoc(doc(db, `projects/${id}/pos`, poId), {
        status: "closed",
        closedAt: Timestamp.now(),
        closedBy: userId,
        closedByName: userName,
      });

      await loadData();
      alert("PO cerrada correctamente");
    } catch (error) {
      console.error("Error cerrando PO:", error);
      alert("Error al cerrar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelPO = (po: PO) => {
    if (po.status !== "approved") {
      alert("Solo se pueden anular POs aprobadas");
      return;
    }

    if (po.invoicedAmount > 0) {
      alert("No se puede anular una PO que ya tiene facturas asociadas. Ciérrela en su lugar.");
      return;
    }

    setSelectedPO(po);
    setShowCancelModal(true);
  };

  const confirmCancelPO = async () => {
    if (!selectedPO || !cancellationReason.trim()) {
      alert("Debe proporcionar un motivo de anulación");
      return;
    }

    setProcessing(true);
    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      for (const item of selectedPO.items) {
        if (item.subAccountId) {
          const accountsRef = collection(db, `projects/${id}/accounts`);
          const accountsSnap = await getDocs(accountsRef);

          for (const accountDoc of accountsSnap.docs) {
            try {
              const subAccountRef = doc(
                db,
                `projects/${id}/accounts/${accountDoc.id}/subaccounts`,
                item.subAccountId
              );
              const subAccountSnap = await getDoc(subAccountRef);

              if (subAccountSnap.exists()) {
                const currentCommitted = subAccountSnap.data().committed || 0;
                await updateDoc(subAccountRef, {
                  committed: Math.max(0, currentCommitted - item.totalAmount),
                });
                break;
              }
            } catch (e) {
              continue;
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
      alert("PO anulada correctamente. El presupuesto ha sido liberado.");
    } catch (error) {
      console.error("Error anulando PO:", error);
      alert("Error al anular la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleModifyPO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    if (po.status !== "approved") {
      alert("Solo se pueden modificar POs aprobadas");
      return;
    }

    const newVersion = po.version + 1;
    if (!confirm(`¿Crear nueva versión de PO-${po.number}?\n\nSe creará PO-${po.number}-V${String(newVersion).padStart(2, "0")} y la versión actual quedará marcada como "modificada".`)) {
      return;
    }

    setProcessing(true);
    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      const newPOData = {
        number: po.number,
        version: newVersion,
        originalPOId: po.originalPOId || po.id,
        previousVersionId: po.id,
        supplier: po.supplier,
        supplierId: po.supplierId,
        generalDescription: po.generalDescription + ` (Modificación V${String(newVersion).padStart(2, "0")})`,
        totalAmount: po.totalAmount,
        items: po.items,
        attachmentUrl: po.attachmentUrl,
        status: "draft",
        committedAmount: 0,
        invoicedAmount: 0,
        remainingAmount: po.totalAmount,
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
      };

      const newPORef = await addDoc(collection(db, `projects/${id}/pos`), newPOData);

      await updateDoc(doc(db, `projects/${id}/pos`, poId), {
        status: "modified",
        nextVersionId: newPORef.id,
      });

      await loadData();
      alert(`Nueva versión creada: PO-${po.number}-V${String(newVersion).padStart(2, "0")}\n\nPuedes editarla desde borradores.`);
    } catch (error) {
      console.error("Error modificando PO:", error);
      alert("Error al crear nueva versión de la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteDraft = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    if (po.status !== "draft") {
      alert("Solo se pueden eliminar POs en estado borrador");
      return;
    }

    if (!confirm(`¿Eliminar el borrador PO-${po.number}?`)) {
      return;
    }

    setProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/pos`, poId));
      await loadData();
    } catch (error) {
      console.error("Error eliminando borrador:", error);
      alert("Error al eliminar el borrador");
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
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
      <div className="mt-[4.5rem] bg-gradient-to-r from-indigo-50 to-indigo-100 border-y border-indigo-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-indigo-900 tracking-tight">{projectName}</h1>
        </div>
        <Link href={`/project/${id}/accounting`} className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium">
          Volver a contabilidad
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <FileText size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">Órdenes de compra</h1>
                  <p className="text-slate-600 text-sm mt-1">Gestión de purchase orders del proyecto</p>
                </div>
              </div>
              <Link href={`/project/${id}/accounting/pos/new`} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105">
                <Plus size={20} />
                Nueva PO
              </Link>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-700 font-medium mb-1">Total POs</p>
              <p className="text-3xl font-bold text-blue-900">{pos.length}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700 font-medium mb-1">Borradores</p>
              <p className="text-3xl font-bold text-slate-900">{pos.filter((p) => p.status === "draft").length}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-700 font-medium mb-1">Pendientes</p>
              <p className="text-3xl font-bold text-amber-900">{pos.filter((p) => p.status === "pending").length}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm text-emerald-700 font-medium mb-1">Aprobadas</p>
              <p className="text-3xl font-bold text-emerald-900">{pos.filter((p) => p.status === "approved").length}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-700 font-medium mb-1">Cerradas</p>
              <p className="text-3xl font-bold text-blue-900">{pos.filter((p) => p.status === "closed").length}</p>
            </div>
          </div>

          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por número, proveedor o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="all">Todos los estados</option>
                <option value="draft">Borradores</option>
                <option value="pending">Pendientes aprobación</option>
                <option value="approved">Aprobadas</option>
                <option value="closed">Cerradas</option>
                <option value="cancelled">Anuladas</option>
                <option value="modified">Modificadas</option>
              </select>
            </div>
          </div>

          {filteredPOs.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <FileText size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm || statusFilter !== "all" ? "No se encontraron POs" : "No hay órdenes de compra"}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm || statusFilter !== "all" ? "Intenta ajustar los filtros de búsqueda" : "Comienza creando tu primera orden de compra"}
              </p>
              {!searchTerm && statusFilter === "all" && (
                <Link href={`/project/${id}/accounting/pos/new`} className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg">
                  <Plus size={20} />
                  Crear primera PO
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">Número</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">Proveedor</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">Descripción</th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">Importe</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">Estado</th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPOs.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-semibold text-slate-900">
                              PO-{po.number}
                              {po.version > 1 && <span className="ml-2 text-xs text-purple-600">V{String(po.version).padStart(2, "0")}</span>}
                            </p>
                            <p className="text-xs text-slate-500">{formatDate(po.createdAt)}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900">{po.supplier}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-700 line-clamp-2">{po.generalDescription}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                            {po.status === "approved" && (
                              <p className="text-xs text-slate-500">Facturado: {formatCurrency(po.invoicedAmount)} €</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">{getStatusBadge(po.status)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setSelectedPO(po); setShowDetailModal(true); }} className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Ver detalles">
                              <Eye size={18} />
                            </button>
                            {po.status === "draft" && (
                              <button onClick={() => router.push(`/project/${id}/accounting/pos/${po.id}/edit`)} className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar borrador">
                                <Edit size={18} />
                              </button>
                            )}
                            {po.status === "approved" && (
                              <button onClick={() => handleModifyPO(po.id)} disabled={processing} className="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50" title="Crear nueva versión">
                                <FileEdit size={18} />
                              </button>
                            )}
                            {po.status === "approved" && (
                              <button onClick={() => handleClosePO(po.id)} disabled={processing} className="p-2 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50" title="Cerrar PO">
                                <CheckCircle size={18} />
                              </button>
                            )}
                            {po.status === "approved" && po.invoicedAmount === 0 && (
                              <button onClick={() => handleCancelPO(po)} disabled={processing} className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Anular PO">
                                <XCircle size={18} />
                              </button>
                            )}
                            {po.status === "draft" && (
                              <button onClick={() => handleDeleteDraft(po.id)} disabled={processing} className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Eliminar borrador">
                                <Trash2 size={18} />
                              </button>
                            )}
                            {po.status === "modified" && po.nextVersionId && (
                              <button onClick={() => { const nextPO = pos.find((p) => p.id === po.nextVersionId); if (nextPO) { setSelectedPO(nextPO); setShowDetailModal(true); }}} className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Ver versión actual">
                                <ArrowRight size={18} />
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

      {showDetailModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 px-6 py-4 flex items-center justify-between sticky top-0">
              <h2 className="text-xl font-bold text-white">
                PO-{selectedPO.number}
                {selectedPO.version > 1 && <span className="ml-2 text-sm">V{String(selectedPO.version).padStart(2, "0")}</span>}
              </h2>
              <button onClick={() => setShowDetailModal(false)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {(selectedPO.version > 1 || selectedPO.status === "modified" || selectedPO.previousVersionId) && (
                <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Información de versión</p>
                  <p className="text-sm text-purple-900"><strong>Versión:</strong> V{String(selectedPO.version).padStart(2, "0")}</p>
                  {selectedPO.previousVersionId && <p className="text-sm text-purple-800 mt-1">Modificación de una PO anterior</p>}
                  {selectedPO.status === "modified" && selectedPO.nextVersionId && (
                    <div className="mt-2 p-2 bg-purple-100 rounded">
                      <p className="text-xs text-purple-800 mb-1">⚠️ Esta PO ha sido modificada. Existe una versión más nueva.</p>
                      <button onClick={() => { const nextPO = pos.find((p) => p.id === selectedPO.nextVersionId); if (nextPO) { setSelectedPO(nextPO); }}} className="text-xs text-purple-700 font-medium underline">Ver versión actual →</button>
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Building2 size={14} />Proveedor</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedPO.supplier}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={14} />Importe total</p>
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(selectedPO.totalAmount)} €</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Calendar size={14} />Fecha de creación</p>
                  <p className="text-sm text-slate-900">{formatDate(selectedPO.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><User size={14} />Creado por</p>
                  <p className="text-sm text-slate-900">{selectedPO.createdByName}</p>
                </div>
              </div>
              {selectedPO.status === "approved" && (
                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Control presupuestario</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Comprometido</p>
                      <p className="text-sm font-bold text-amber-700">{formatCurrency(selectedPO.committedAmount)} €</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Facturado</p>
                      <p className="text-sm font-bold text-emerald-700">{formatCurrency(selectedPO.invoicedAmount)} €</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Pendiente</p>
                      <p className="text-sm font-bold text-blue-700">{formatCurrency(selectedPO.remainingAmount)} €</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-6">
                <p className="text-xs text-slate-500 mb-2">Descripción general</p>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{selectedPO.generalDescription}</p>
              </div>
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Items ({selectedPO.items.length})</p>
                <div className="space-y-2">
                  {selectedPO.items.map((item, index) => (
                    <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.description}</p>
                          <p className="text-xs text-slate-600 mt-1">Cuenta: {item.budgetAccount} • {item.quantity} × {formatCurrency(item.unitPrice)} €</p>
                        </div>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(item.totalAmount)} €</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {selectedPO.status === "cancelled" && selectedPO.cancellationReason && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-semibold text-red-800 uppercase mb-2">Motivo de anulación</p>
                  <p className="text-sm text-red-700">{selectedPO.cancellationReason}</p>
                  <p className="text-xs text-red-600 mt-2">Anulada por {selectedPO.cancelledByName} el {selectedPO.cancelledAt && formatDate(selectedPO.cancelledAt)}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div>
                  <p className="text-xs text-slate-500 mb-2">Estado</p>
                  {getStatusBadge(selectedPO.status)}
                </div>
                {selectedPO.approvedAt && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Aprobada</p>
                    <p className="text-sm text-slate-700">{formatDate(selectedPO.approvedAt)}</p>
                    <p className="text-xs text-slate-600">por {selectedPO.approvedByName}</p>
                  </div>
                )}
                {selectedPO.closedAt && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Cerrada</p>
                    <p className="text-sm text-slate-700">{formatDate(selectedPO.closedAt)}</p>
                    <p className="text-xs text-slate-600">por {selectedPO.closedByName}</p>
                  </div>
                )}
              </div>
              {selectedPO.attachmentUrl && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <a href={selectedPO.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                    <Eye size={16} />
                    Ver archivo adjunto
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCancelModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Anular orden de compra</h3>
                <p className="text-sm text-slate-600">PO-{selectedPO.number}</p>
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de anulación *</label>
              <textarea value={cancellationReason} onChange={(e) => setCancellationReason(e.target.value)} placeholder="Explica por qué se anula esta PO..." rows={4} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none text-sm" />
              <p className="text-xs text-slate-500 mt-2">⚠️ Al anular esta PO se liberará el presupuesto comprometido ({formatCurrency(selectedPO.committedAmount)} €)</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowCancelModal(false); setSelectedPO(null); setCancellationReason(""); }} className="flex-1 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">Cancelar</button>
              <button onClick={confirmCancelPO} disabled={processing || !cancellationReason.trim()} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{processing ? "Anulando..." : "Confirmar anulación"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

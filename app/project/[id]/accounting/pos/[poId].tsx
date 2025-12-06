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
  query,
  orderBy,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  FileText,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Building2,
  DollarSign,
  Calendar,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Edit,
  Package,
  ShoppingCart,
  Wrench,
  Shield,
  FileCheck,
  Hash,
  Percent,
  CreditCard,
  Info,
  MessageSquare,
  Activity,
  Eye,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface POItem {
  description: string;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  date: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
}

interface PO {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  department: string;
  poType: "rental" | "purchase" | "service" | "deposit";
  currency: string;
  generalDescription: string;
  paymentTerms: string;
  notes: string;
  items: POItem[];
  baseAmount: number;
  vatAmount: number;
  irpfAmount: number;
  totalAmount: number;
  status: "draft" | "pending" | "approved" | "rejected";
  attachmentUrl?: string;
  attachmentFileName?: string;
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
}

const PO_TYPES = {
  rental: { label: "Alquiler", icon: ShoppingCart, color: "blue" },
  purchase: { label: "Compra", icon: Package, color: "green" },
  service: { label: "Servicio", icon: Wrench, color: "purple" },
  deposit: { label: "Fianza", icon: Shield, color: "amber" },
};

export default function ViewPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const poId = params?.poId as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [po, setPO] = useState<PO | null>(null);
  const [allPOIds, setAllPOIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("");
  const [processing, setProcessing] = useState(false);

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
    if (userId && id && poId) {
      loadData();
    }
  }, [userId, id, poId]);

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

      // Load all PO IDs for navigation
      const posQuery = query(
        collection(db, `projects/${id}/pos`),
        orderBy("createdAt", "desc")
      );
      const posSnapshot = await getDocs(posQuery);
      const ids = posSnapshot.docs.map((doc) => doc.id);
      setAllPOIds(ids);
      
      const currentIdx = ids.indexOf(poId);
      setCurrentIndex(currentIdx);

      // Load current PO
      const poDoc = await getDoc(doc(db, `projects/${id}/pos`, poId));
      if (poDoc.exists()) {
        const poData = {
          id: poDoc.id,
          ...poDoc.data(),
          createdAt: poDoc.data().createdAt?.toDate(),
          approvedAt: poDoc.data().approvedAt?.toDate(),
          rejectedAt: poDoc.data().rejectedAt?.toDate(),
        } as PO;
        setPO(poData);
      } else {
        alert("PO no encontrada");
        router.push(`/project/${id}/accounting/pos`);
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const navigateToPO = (direction: "prev" | "next") => {
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < allPOIds.length) {
      router.push(`/project/${id}/accounting/pos/view/${allPOIds[newIndex]}`);
    }
  };

  const handleApprovePO = async () => {
    if (!po) return;

    if (
      !confirm(
        `¿Aprobar la PO ${po.number} por ${po.totalAmount.toLocaleString()} ${po.currency}? Esto comprometerá el presupuesto de forma permanente.`
      )
    ) {
      return;
    }

    setProcessing(true);
    try {
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || "Usuario";

      await updateDoc(doc(db, `projects/${id}/pos`, poId), {
        status: "approved",
        approvedAt: Timestamp.now(),
        approvedBy: userId,
        approvedByName: userName,
      });

      // Update budget commitment for each item
      for (const item of po.items) {
        if (item.subAccountId) {
          const accountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts`));
          
          for (const accountDoc of accountsSnapshot.docs) {
            const subAccountRef = doc(
              db,
              `projects/${id}/accounts/${accountDoc.id}/subaccounts`,
              item.subAccountId
            );
            
            try {
              const subAccountSnap = await getDoc(subAccountRef);
              if (subAccountSnap.exists()) {
                const currentCommitted = subAccountSnap.data().committed || 0;
                await updateDoc(subAccountRef, {
                  committed: currentCommitted + item.totalAmount,
                });
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      loadData();
    } catch (error) {
      console.error("Error aprobando PO:", error);
      alert("Error al aprobar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectPO = async () => {
    if (!po) return;

    const reason = prompt(`¿Por qué rechazas la PO ${po.number}?`);
    if (!reason) return;

    setProcessing(true);
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
    } finally {
      setProcessing(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs = {
      draft: {
        bg: "bg-slate-100",
        text: "text-slate-700",
        border: "border-slate-200",
        icon: Edit,
        label: "Borrador",
      },
      pending: {
        bg: "bg-amber-100",
        text: "text-amber-700",
        border: "border-amber-200",
        icon: Clock,
        label: "Pendiente de aprobación",
      },
      approved: {
        bg: "bg-emerald-100",
        text: "text-emerald-700",
        border: "border-emerald-200",
        icon: CheckCircle,
        label: "Aprobada",
      },
      rejected: {
        bg: "bg-red-100",
        text: "text-red-700",
        border: "border-red-200",
        icon: XCircle,
        label: "Rechazada",
      },
    };
    return configs[status as keyof typeof configs] || configs.draft;
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateString));
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

  if (!po) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <AlertCircle size={64} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">PO no encontrada</h2>
            <Link
              href={`/project/${id}/accounting/pos`}
              className="text-indigo-600 hover:underline"
            >
              Volver al listado de POs
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const statusConfig = getStatusConfig(po.status);
  const StatusIcon = statusConfig.icon;
  const typeConfig = PO_TYPES[po.poType];
  const TypeIcon = typeConfig.icon;

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
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
        <Link
          href={`/project/${id}/accounting/pos`}
          className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
        >
          Volver a POs
        </Link>
      </div>

      {/* Navigation Bar */}
      <div className="bg-white border-b-2 border-slate-200 px-6 md:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href={`/project/${id}/accounting/pos`}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al listado
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              PO {currentIndex + 1} de {allPOIds.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => navigateToPO("prev")}
                disabled={currentIndex === 0}
                className="p-2 border-2 border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="PO anterior"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => navigateToPO("next")}
                disabled={currentIndex === allPOIds.length - 1}
                className="p-2 border-2 border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="PO siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header Card */}
              <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 px-6 py-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-2">
                        PO-{po.number}
                      </h1>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}
                        >
                          <StatusIcon size={14} />
                          {statusConfig.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-white/20 text-white border border-white/30`}
                        >
                          <TypeIcon size={14} />
                          {typeConfig.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-indigo-100 text-sm mb-1">Importe total</p>
                      <p className="text-4xl font-bold text-white">
                        {po.totalAmount.toLocaleString()} {po.currency}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {/* Audit Info */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Activity size={14} />
                      Información de auditoría
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-600 text-xs mb-1">Creado por</p>
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-slate-400" />
                          <span className="font-medium text-slate-900">
                            {po.createdByName}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs mb-1">Fecha y hora</p>
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-slate-400" />
                          <span className="font-medium text-slate-900">
                            {formatDateTime(po.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs mb-1">Departamento</p>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium">
                          {po.department}
                        </span>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs mb-1">Moneda</p>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-200 text-slate-700 rounded-md text-xs font-medium">
                          {po.currency}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Supplier Info */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <Building2 size={18} className="text-indigo-600" />
                      Proveedor
                    </h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="font-semibold text-blue-900 text-lg">
                        {po.supplier}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <FileText size={18} className="text-indigo-600" />
                      Descripción general
                    </h3>
                    <p className="text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-4">
                      {po.generalDescription}
                    </p>
                  </div>

                  {/* Payment Terms */}
                  {po.paymentTerms && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <CreditCard size={18} className="text-indigo-600" />
                        Condiciones de pago
                      </h3>
                      <p className="text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
                        {po.paymentTerms}
                      </p>
                    </div>
                  )}

                  {/* Notes */}
                  {po.notes && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <MessageSquare size={18} className="text-indigo-600" />
                        Notas internas
                      </h3>
                      <p className="text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        {po.notes}
                      </p>
                    </div>
                  )}

                  {/* Attachment */}
                  {po.attachmentUrl && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <FileCheck size={18} className="text-indigo-600" />
                        Documento adjunto
                      </h3>
                      <a
                        href={po.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors text-indigo-700 font-medium"
                      >
                        <Download size={18} />
                        {po.attachmentFileName || "Descargar documento"}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Card */}
              <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Package size={22} className="text-indigo-600" />
                  Ítems de la orden ({po.items.length})
                </h2>

                <div className="space-y-4">
                  {po.items.map((item, index) => (
                    <div
                      key={index}
                      className="border-2 border-slate-200 rounded-xl p-5 hover:border-indigo-200 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-sm">
                              {index + 1}
                            </span>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {item.description}
                            </h3>
                          </div>
                          <p className="text-sm font-mono text-slate-600 ml-10">
                            {item.subAccountCode} - {item.subAccountDescription}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-indigo-600">
                            {item.totalAmount.toFixed(2)} {po.currency}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            <Calendar size={12} className="inline mr-1" />
                            {formatDate(item.date)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-600 mb-1">Cantidad</p>
                          <p className="text-lg font-bold text-slate-900">
                            {item.quantity}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-600 mb-1">Precio unitario</p>
                          <p className="text-lg font-bold text-slate-900">
                            {item.unitPrice.toFixed(2)} {po.currency}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-600 mb-1">IVA ({item.vatRate}%)</p>
                          <p className="text-lg font-bold text-emerald-600">
                            +{item.vatAmount.toFixed(2)} {po.currency}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-600 mb-1">IRPF ({item.irpfRate}%)</p>
                          <p className="text-lg font-bold text-red-600">
                            -{item.irpfAmount.toFixed(2)} {po.currency}
                          </p>
                        </div>
                      </div>

                      <div className="border-t-2 border-slate-200 pt-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Base imponible:</span>
                          <span className="font-semibold text-slate-900">
                            {item.baseAmount.toFixed(2)} {po.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals Summary */}
                <div className="mt-6 bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-200 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-indigo-900 mb-4 uppercase tracking-wider">
                    Resumen de importes
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-700">Base imponible total</span>
                      <span className="text-lg font-semibold text-slate-900">
                        {po.baseAmount.toFixed(2)} {po.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-700">IVA total</span>
                      <span className="text-lg font-semibold text-emerald-600">
                        +{po.vatAmount.toFixed(2)} {po.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-700">IRPF total</span>
                      <span className="text-lg font-semibold text-red-600">
                        -{po.irpfAmount.toFixed(2)} {po.currency}
                      </span>
                    </div>
                    <div className="border-t-2 border-indigo-300 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-bold text-indigo-900">
                          TOTAL
                        </span>
                        <span className="text-3xl font-bold text-indigo-600">
                          {po.totalAmount.toFixed(2)} {po.currency}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Actions Card */}
                {po.status === "pending" && ["EP", "PM", "Controller"].includes(userRole) && (
                  <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Acciones de aprobación
                    </h3>
                    <div className="space-y-3">
                      <button
                        onClick={handleApprovePO}
                        disabled={processing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle size={20} />
                        Aprobar PO
                      </button>
                      <button
                        onClick={handleRejectPO}
                        disabled={processing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XCircle size={20} />
                        Rechazar PO
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit Card */}
                {(po.status === "draft" || po.status === "rejected") && (
                  <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Modificar PO
                    </h3>
                    <Link href={`/project/${id}/accounting/pos/edit/${po.id}`}>
                      <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-md">
                        <Edit size={20} />
                        Editar PO
                      </button>
                    </Link>
                  </div>
                )}

                {/* Timeline Card */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock size={20} className="text-slate-600" />
                    Historial
                  </h3>
                  <div className="space-y-4">
                    {/* Created */}
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="bg-blue-100 p-2 rounded-full">
                          <FileText size={16} className="text-blue-600" />
                        </div>
                        {(po.approvedAt || po.rejectedAt) && (
                          <div className="w-0.5 h-full bg-slate-200 mt-2"></div>
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-semibold text-slate-900">
                          PO creada
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {formatDateTime(po.createdAt)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          por {po.createdByName}
                        </p>
                      </div>
                    </div>

                    {/* Approved */}
                    {po.status === "approved" && po.approvedAt && (
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="bg-emerald-100 p-2 rounded-full">
                            <CheckCircle size={16} className="text-emerald-600" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-emerald-700">
                            PO aprobada
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {formatDateTime(po.approvedAt)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            por {po.approvedByName}
                          </p>
                          <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <p className="text-xs text-emerald-800">
                              ✓ Presupuesto comprometido
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rejected */}
                    {po.status === "rejected" && po.rejectedAt && (
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="bg-red-100 p-2 rounded-full">
                            <XCircle size={16} className="text-red-600" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-700">
                            PO rechazada
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {formatDateTime(po.rejectedAt)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            por {po.rejectedByName}
                          </p>
                          {po.rejectionReason && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                              <p className="text-xs text-red-800 font-medium mb-1">
                                Motivo:
                              </p>
                              <p className="text-xs text-red-700">
                                {po.rejectionReason}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-2">
                    <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold mb-2">Información</p>
                      <ul className="space-y-1">
                        <li>• Esta PO tiene {po.items.length} {po.items.length === 1 ? "ítem" : "ítems"}</li>
                        <li>• Tipo: {typeConfig.label}</li>
                        <li>• Moneda: {po.currency}</li>
                        {po.status === "approved" && (
                          <li className="text-emerald-700 font-medium">
                            ✓ Presupuesto comprometido
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
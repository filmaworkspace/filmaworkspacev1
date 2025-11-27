"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import {
  Folder,
  FileText,
  Receipt,
  DollarSign,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  User,
  Settings,
  Bell,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface PO {
  id: string;
  number: string;
  supplier: string;
  totalAmount: number;
  status: "draft" | "pending" | "approved" | "rejected";
  createdAt: Date | null;
}

interface Invoice {
  id: string;
  number: string;
  supplier: string;
  totalAmount: number;
  status: "pending_approval" | "pending" | "paid" | "overdue" | "rejected" | "cancelled";
  dueDate: Date | null;
  createdAt: Date | null;
}

interface POStats {
  total: number;
  pending: number;
  approved: number;
}

interface InvoiceStats {
  total: number;
  pending: number;
  paid: number;
}

export default function AccountingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [recentPOs, setRecentPOs] = useState<PO[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [posLimit, setPosLimit] = useState(5);
  const [invoicesLimit, setInvoicesLimit] = useState(5);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("");
  const [hasApprovals, setHasApprovals] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const [poStats, setPoStats] = useState<POStats>({
    total: 0,
    pending: 0,
    approved: 0,
  });

  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats>({
    total: 0,
    pending: 0,
    paid: 0,
  });

  // Auth listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Cargar datos del proyecto y estadísticas
  useEffect(() => {
    const loadProjectData = async () => {
      if (!userId || !id) return;

      try {
        const projectDoc = await getDoc(doc(db, "projects", id));
        if (projectDoc.exists()) {
          setProjectName(projectDoc.data().name || "Proyecto");
        }

        // Get user role
        const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId));
        if (memberDoc.exists()) {
          const role = memberDoc.data().role || "";
          setUserRole(role);
        }

        // Check if user has pending approvals
        let approvalCount = 0;

        // Check POs
        const posRef = collection(db, `projects/${id}/pos`);
        const posQuery = query(posRef, where("status", "==", "pending"));
        const posSnapshot = await getDocs(posQuery);

        for (const poDoc of posSnapshot.docs) {
          const poData = poDoc.data();
          if (poData.approvalSteps && poData.currentApprovalStep !== undefined) {
            const currentStep = poData.approvalSteps[poData.currentApprovalStep];
            if (currentStep && currentStep.approvers?.includes(userId)) {
              approvalCount++;
            }
          }
        }

        // Check Invoices - ahora busca pending_approval
        const invoicesRef = collection(db, `projects/${id}/invoices`);
        const invoicesQuery = query(invoicesRef, where("status", "==", "pending_approval"));
        const invoicesSnapshot = await getDocs(invoicesQuery);

        for (const invDoc of invoicesSnapshot.docs) {
          const invData = invDoc.data();
          if (invData.approvalSteps && invData.currentApprovalStep !== undefined) {
            const currentStep = invData.approvalSteps[invData.currentApprovalStep];
            if (currentStep && currentStep.approvers?.includes(userId)) {
              approvalCount++;
            }
          }
        }

        setHasApprovals(approvalCount > 0);
        setPendingApprovalsCount(approvalCount);

        // Cargar POs recientes
        const posRecentQuery = query(
          collection(db, `projects/${id}/pos`),
          orderBy("createdAt", "desc"),
          limit(posLimit)
        );
        const posRecentSnapshot = await getDocs(posRecentQuery);
        const posData = posRecentSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            number: data.number || "",
            supplier: data.supplier || "",
            totalAmount: data.totalAmount || 0,
            status: data.status || "draft",
            createdAt: data.createdAt?.toDate() || null,
          };
        }) as PO[];
        setRecentPOs(posData);

        // Calcular estadísticas de POs
        const allPosSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
        const allPOs = allPosSnapshot.docs.map(doc => doc.data());
        setPoStats({
          total: allPOs.length,
          pending: allPOs.filter(po => po.status === "pending").length,
          approved: allPOs.filter(po => po.status === "approved").length,
        });

        // Cargar facturas recientes
        const invoicesRecentQuery = query(
          collection(db, `projects/${id}/invoices`),
          orderBy("createdAt", "desc"),
          limit(invoicesLimit)
        );
        const invoicesRecentSnapshot = await getDocs(invoicesRecentQuery);
        const invoicesData = invoicesRecentSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            number: data.number || "",
            supplier: data.supplier || "",
            totalAmount: data.totalAmount || 0,
            status: data.status || "pending",
            createdAt: data.createdAt?.toDate() || null,
            dueDate: data.dueDate?.toDate() || null,
          };
        }) as Invoice[];
        setRecentInvoices(invoicesData);

        // Calcular estadísticas de facturas
        const allInvoicesSnapshot = await getDocs(collection(db, `projects/${id}/invoices`));
        const allInvoices = allInvoicesSnapshot.docs.map(doc => doc.data());
        setInvoiceStats({
          total: allInvoices.length,
          pending: allInvoices.filter(inv => inv.status === "pending" || inv.status === "pending_approval").length,
          paid: allInvoices.filter(inv => inv.status === "paid").length,
        });

      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProjectData();
  }, [id, posLimit, invoicesLimit, userId]);

  const getStatusBadge = (status: string, type: "po" | "invoice") => {
    const styles = {
      po: {
        draft: "bg-slate-100 text-slate-700 border-slate-200",
        pending: "bg-amber-100 text-amber-700 border-amber-200",
        approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
        rejected: "bg-red-100 text-red-700 border-red-200",
      },
      invoice: {
        pending_approval: "bg-purple-100 text-purple-700 border-purple-200",
        pending: "bg-amber-100 text-amber-700 border-amber-200",
        paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
        overdue: "bg-red-100 text-red-700 border-red-200",
        rejected: "bg-red-100 text-red-700 border-red-200",
        cancelled: "bg-slate-100 text-slate-700 border-slate-200",
      },
    };

    const labels = {
      po: {
        draft: "Borrador",
        pending: "Pendiente",
        approved: "Aprobada",
        rejected: "Rechazada",
      },
      invoice: {
        pending_approval: "Pend. aprob.",
        pending: "Pend. pago",
        paid: "Pagada",
        overdue: "Vencida",
        rejected: "Rechazada",
        cancelled: "Cancelada",
      },
    };

    const styleMap = type === "po" ? styles.po : styles.invoice;
    const labelMap = type === "po" ? labels.po : labels.invoice;
    
    const style = styleMap[status as keyof typeof styleMap] || styleMap[type === "po" ? "draft" : "pending"];
    const label = labelMap[status as keyof typeof labelMap] || status;

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${style}`}>
        {label}
      </span>
    );
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Sin fecha";
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
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
          href="/dashboard"
          className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
        >
          Volver a proyectos
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <DollarSign size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Panel de contabilidad
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Resumen financiero y gestión de documentos
                  </p>
                </div>
              </div>

              {/* Botones discretos a la derecha */}
              <div className="flex items-center gap-2">
                {/* Botón de Aprobaciones */}
                {hasApprovals && (
                  <Link href={`/project/${id}/accounting/approvals`}>
                    <button
                      className="relative flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium transition-colors border border-amber-300"
                      title="Aprobaciones pendientes"
                    >
                      <Bell size={16} />
                      <span>Aprobaciones</span>
                      {pendingApprovalsCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                          {pendingApprovalsCount}
                        </span>
                      )}
                    </button>
                  </Link>
                )}

                {/* Botón de Configuración */}
                {(userRole === "EP" || userRole === "PM" || userRole === "Controller") && (
                  <Link href={`/project/${id}/accounting/approvalsconfig`}>
                    <button
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-300"
                      title="Configurar aprobaciones"
                    >
                      <Settings size={16} />
                      <span>Configuración</span>
                    </button>
                  </Link>
                )}
              </div>
            </div>
          </header>

          {/* Paneles de POs y Facturas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel de POs */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                      <FileText size={28} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Órdenes de compra
                      </h2>
                      <p className="text-indigo-100 text-sm">
                        Purchase orders del proyecto
                      </p>
                    </div>
                  </div>
                  <select
                    value={posLimit}
                    onChange={(e) => setPosLimit(Number(e.target.value))}
                    className="bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    <option value={5} className="text-slate-900">Últimas 5</option>
                    <option value={10} className="text-slate-900">Últimas 10</option>
                    <option value={20} className="text-slate-900">Últimas 20</option>
                  </select>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      {poStats.total}
                    </div>
                    <p className="text-xs text-slate-600 font-medium">Total</p>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="text-2xl font-bold text-amber-600 mb-1">
                      {poStats.pending}
                    </div>
                    <p className="text-xs text-amber-700 font-medium">Pendientes</p>
                  </div>
                  <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="text-2xl font-bold text-emerald-600 mb-1">
                      {poStats.approved}
                    </div>
                    <p className="text-xs text-emerald-700 font-medium">Aprobadas</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Clock size={16} className="text-slate-600" />
                    Actividad reciente
                  </h3>
                  
                  {recentPOs.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 text-center">
                      <FileText size={48} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500 font-medium">
                        No hay órdenes de compra creadas todavía
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Crea tu primera PO para empezar
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentPOs.map((po) => (
                        <div
                          key={po.id}
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg p-4 transition-all group cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-indigo-100 text-indigo-700 p-2 rounded-lg">
                                <FileText size={16} />
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">
                                  PO-{po.number}
                                </h4>
                                <p className="text-xs text-slate-600 flex items-center gap-1">
                                  <User size={12} />
                                  {po.supplier || "Sin proveedor"}
                                </p>
                              </div>
                            </div>
                            {getStatusBadge(po.status, "po")}
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {formatDate(po.createdAt)}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {(po.totalAmount || 0).toLocaleString()} €
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Link href={`/project/${id}/accounting/pos`}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-md hover:shadow-lg">
                    Gestionar órdenes de compra
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>

            {/* Panel de Facturas */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-emerald-300 hover:shadow-xl transition-all">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                      <Receipt size={28} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Facturas</h2>
                      <p className="text-emerald-100 text-sm">
                        Gestión de facturas del proyecto
                      </p>
                    </div>
                  </div>
                  <select
                    value={invoicesLimit}
                    onChange={(e) => setInvoicesLimit(Number(e.target.value))}
                    className="bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    <option value={5} className="text-slate-900">Últimas 5</option>
                    <option value={10} className="text-slate-900">Últimas 10</option>
                    <option value={20} className="text-slate-900">Últimas 20</option>
                  </select>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      {invoiceStats.total}
                    </div>
                    <p className="text-xs text-slate-600 font-medium">Total</p>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="text-2xl font-bold text-amber-600 mb-1">
                      {invoiceStats.pending}
                    </div>
                    <p className="text-xs text-amber-700 font-medium">Pendientes</p>
                  </div>
                  <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="text-2xl font-bold text-emerald-600 mb-1">
                      {invoiceStats.paid}
                    </div>
                    <p className="text-xs text-emerald-700 font-medium">Pagadas</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Clock size={16} className="text-slate-600" />
                    Facturas recientes
                  </h3>
                  
                  {recentInvoices.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 text-center">
                      <Receipt size={48} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500 font-medium">
                        No hay facturas registradas todavía
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Sube tu primera factura para empezar
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentInvoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg p-4 transition-all group cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
                                <Receipt size={16} />
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">
                                  INV-{invoice.number}
                                </h4>
                                <p className="text-xs text-slate-600 flex items-center gap-1">
                                  <User size={12} />
                                  {invoice.supplier || "Sin proveedor"}
                                </p>
                              </div>
                            </div>
                            {getStatusBadge(invoice.status, "invoice")}
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              Vence: {formatDate(invoice.dueDate)}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {(invoice.totalAmount || 0).toLocaleString()} €
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Link href={`/project/${id}/accounting/invoices`}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-md hover:shadow-lg">
                    Gestionar facturas
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

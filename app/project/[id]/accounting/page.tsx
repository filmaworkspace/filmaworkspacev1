"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import {
  Folder,
  FileText,
  Receipt,
  ArrowRight,
  Clock,
  Settings,
  Bell,
  TrendingUp,
  ChevronRight,
  BarChart3,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadProjectData = async () => {
      if (!userId || !id) return;

      try {
        const projectDoc = await getDoc(doc(db, "projects", id));
        if (projectDoc.exists()) {
          setProjectName(projectDoc.data().name || "Proyecto");
        }

        const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId));
        if (memberDoc.exists()) {
          const role = memberDoc.data().role || "";
          setUserRole(role);
        }

        let approvalCount = 0;

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

        const posRecentQuery = query(
          collection(db, `projects/${id}/pos`),
          orderBy("createdAt", "desc"),
          limit(5)
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

        const allPosSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
        const allPOs = allPosSnapshot.docs.map(doc => doc.data());
        setPoStats({
          total: allPOs.length,
          pending: allPOs.filter(po => po.status === "pending").length,
          approved: allPOs.filter(po => po.status === "approved").length,
        });

        const invoicesRecentQuery = query(
          collection(db, `projects/${id}/invoices`),
          orderBy("createdAt", "desc"),
          limit(5)
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
  }, [id, userId]);

  const getStatusBadge = (status: string, type: "po" | "invoice") => {
    const styles = {
      po: {
        draft: "bg-slate-100 text-slate-600",
        pending: "bg-amber-100 text-amber-700",
        approved: "bg-emerald-100 text-emerald-700",
        rejected: "bg-red-100 text-red-700",
      },
      invoice: {
        pending_approval: "bg-purple-100 text-purple-700",
        pending: "bg-amber-100 text-amber-700",
        paid: "bg-emerald-100 text-emerald-700",
        overdue: "bg-red-100 text-red-700",
        rejected: "bg-red-100 text-red-700",
        cancelled: "bg-slate-100 text-slate-600",
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
      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
        {label}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
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
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1"
            >
              <Folder size={14} />
              {projectName}
            </Link>
            <div className="flex items-center gap-2">
              {hasApprovals && (
                <Link href={`/project/${id}/accounting/approvals`}>
                  <button className="relative flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors border border-amber-500/30">
                    <Bell size={14} />
                    <span>Aprobaciones</span>
                    {pendingApprovalsCount > 0 && (
                      <span className="w-5 h-5 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {pendingApprovalsCount}
                      </span>
                    )}
                  </button>
                </Link>
              )}
              {(userRole === "EP" || userRole === "PM" || userRole === "Controller") && (
                <Link href={`/project/${id}/accounting/approvalsconfig`}>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-sm font-medium transition-colors border border-white/10">
                    <Settings size={14} />
                  </button>
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                Contabilidad
              </h1>
              <p className="text-slate-400 text-sm">Gestión financiera del proyecto</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <FileText size={18} className="text-indigo-400" />
                <span className="text-2xl font-bold">{poStats.total}</span>
              </div>
              <p className="text-sm text-slate-400">Total POs</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-400" />
                <span className="text-2xl font-bold">{poStats.pending}</span>
              </div>
              <p className="text-sm text-slate-400">POs pendientes</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Receipt size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold">{invoiceStats.total}</span>
              </div>
              <p className="text-sm text-slate-400">Total facturas</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold">{invoiceStats.paid}</span>
              </div>
              <p className="text-sm text-slate-400">Facturas pagadas</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Action Cards - Acceso rápido */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* POs Card */}
            <Link href={`/project/${id}/accounting/pos`}>
              <div className="group bg-white border-2 border-slate-200 hover:border-indigo-400 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <FileText size={28} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        Órdenes de compra
                      </h2>
                      <p className="text-sm text-slate-500">
                        {poStats.total} órdenes · {poStats.pending} pendientes
                      </p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-slate-100 group-hover:bg-indigo-100 rounded-full flex items-center justify-center transition-colors">
                    <ArrowRight size={20} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              </div>
            </Link>

            {/* Invoices Card */}
            <Link href={`/project/${id}/accounting/invoices`}>
              <div className="group bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Receipt size={28} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        Facturas
                      </h2>
                      <p className="text-sm text-slate-500">
                        {invoiceStats.total} facturas · {invoiceStats.paid} pagadas
                      </p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-slate-100 group-hover:bg-emerald-100 rounded-full flex items-center justify-center transition-colors">
                    <ArrowRight size={20} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Recent Activity */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Recent POs */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    POs recientes
                  </h3>
                  <Link
                    href={`/project/${id}/accounting/pos`}
                    className="text-sm text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1 transition-colors"
                  >
                    Ver todas
                    <ChevronRight size={14} />
                  </Link>
                </div>

                {recentPOs.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <FileText size={24} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">Sin órdenes de compra</p>
                    <Link
                      href={`/project/${id}/accounting/pos/new`}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-2 inline-block"
                    >
                      Crear primera PO
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentPOs.map((po) => (
                      <Link key={po.id} href={`/project/${id}/accounting/pos`}>
                        <div className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                              <FileText size={16} className="text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">PO-{po.number}</p>
                              <p className="text-xs text-slate-500">{po.supplier || "Sin proveedor"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                              {getStatusBadge(po.status, "po")}
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Invoices */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    Facturas recientes
                  </h3>
                  <Link
                    href={`/project/${id}/accounting/invoices`}
                    className="text-sm text-slate-500 hover:text-emerald-600 font-medium flex items-center gap-1 transition-colors"
                  >
                    Ver todas
                    <ChevronRight size={14} />
                  </Link>
                </div>

                {recentInvoices.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Receipt size={24} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">Sin facturas</p>
                    <Link
                      href={`/project/${id}/accounting/invoices/new`}
                      className="text-sm text-emerald-600 hover:text-emerald-700 font-medium mt-2 inline-block"
                    >
                      Registrar primera factura
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentInvoices.map((invoice) => (
                      <Link key={invoice.id} href={`/project/${id}/accounting/invoices`}>
                        <div className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
                              <Receipt size={16} className="text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">FAC-{invoice.number}</p>
                              <p className="text-xs text-slate-500">{invoice.supplier || "Sin proveedor"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                              {getStatusBadge(invoice.status, "invoice")}
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}



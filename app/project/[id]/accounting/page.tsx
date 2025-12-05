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
  ArrowRight,
  ArrowLeft,
  Clock,
  Settings,
  Bell,
  ChevronRight,
  BarChart3,
  Plus,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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

export default function AccountingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [recentPOs, setRecentPOs] = useState<PO[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("");
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [poStats, setPoStats] = useState({ total: 0, pending: 0, approved: 0 });
  const [invoiceStats, setInvoiceStats] = useState({ total: 0, pending: 0, paid: 0 });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setUserId(user.uid);
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
          setUserRole(memberDoc.data().role || "");
        }

        // Count pending approvals
        let approvalCount = 0;
        const posRef = collection(db, `projects/${id}/pos`);
        const posQuery = query(posRef, where("status", "==", "pending"));
        const posSnapshot = await getDocs(posQuery);

        for (const poDoc of posSnapshot.docs) {
          const poData = poDoc.data();
          if (poData.approvalSteps && poData.currentApprovalStep !== undefined) {
            const currentStep = poData.approvalSteps[poData.currentApprovalStep];
            if (currentStep?.approvers?.includes(userId)) approvalCount++;
          }
        }

        const invoicesRef = collection(db, `projects/${id}/invoices`);
        const invoicesQuery = query(invoicesRef, where("status", "==", "pending_approval"));
        const invoicesSnapshot = await getDocs(invoicesQuery);

        for (const invDoc of invoicesSnapshot.docs) {
          const invData = invDoc.data();
          if (invData.approvalSteps && invData.currentApprovalStep !== undefined) {
            const currentStep = invData.approvalSteps[invData.currentApprovalStep];
            if (currentStep?.approvers?.includes(userId)) approvalCount++;
          }
        }
        setPendingApprovalsCount(approvalCount);

        // Recent POs
        const posRecentQuery = query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc"), limit(5));
        const posRecentSnapshot = await getDocs(posRecentQuery);
        setRecentPOs(posRecentSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, number: data.number || "", supplier: data.supplier || "", totalAmount: data.totalAmount || 0, status: data.status || "draft", createdAt: data.createdAt?.toDate() || null };
        }));

        // PO Stats
        const allPosSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
        const allPOs = allPosSnapshot.docs.map(doc => doc.data());
        setPoStats({
          total: allPOs.length,
          pending: allPOs.filter(po => po.status === "pending").length,
          approved: allPOs.filter(po => po.status === "approved").length,
        });

        // Recent Invoices
        const invoicesRecentQuery = query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc"), limit(5));
        const invoicesRecentSnapshot = await getDocs(invoicesRecentQuery);
        setRecentInvoices(invoicesRecentSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, number: data.number || "", supplier: data.supplier || "", totalAmount: data.totalAmount || 0, status: data.status || "pending", createdAt: data.createdAt?.toDate() || null, dueDate: data.dueDate?.toDate() || null };
        }));

        // Invoice Stats
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
    const config: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-600", label: "Borrador" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
      pending_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Pend. aprob." },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      overdue: { bg: "bg-red-50", text: "text-red-700", label: "Vencida" },
      cancelled: { bg: "bg-slate-100", text: "text-slate-600", label: "Cancelada" },
    };
    const c = config[status] || config.pending;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text} border border-current/10`}>{c.label}</span>;
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

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
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6">
            <ArrowLeft size={16} />
            Volver al dashboard
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <BarChart3 size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{projectName}</h1>
                <p className="text-slate-500 text-sm mt-1">Contabilidad del proyecto</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {pendingApprovalsCount > 0 && (
                <Link href={`/project/${id}/accounting/approvals`}>
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors border border-amber-200">
                    <Bell size={16} />
                    Aprobaciones
                    <span className="w-5 h-5 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{pendingApprovalsCount}</span>
                  </button>
                </Link>
              )}
              {(userRole === "EP" || userRole === "PM" || userRole === "Controller") && (
                <Link href={`/project/${id}/accounting/approvalsconfig`}>
                  <button className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
                    <Settings size={18} />
                  </button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* POs Card */}
          <Link href={`/project/${id}/accounting/pos`}>
            <div className="group bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-colors">
                    <FileText size={24} className="text-indigo-600 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Órdenes de compra</h2>
                    <p className="text-sm text-slate-500">{poStats.total} órdenes · {poStats.pending} pendientes</p>
                  </div>
                </div>
                <div className="w-10 h-10 bg-slate-100 group-hover:bg-indigo-100 rounded-full flex items-center justify-center transition-colors">
                  <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                </div>
              </div>
            </div>
          </Link>

          {/* Invoices Card */}
          <Link href={`/project/${id}/accounting/invoices`}>
            <div className="group bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-500 transition-colors">
                    <Receipt size={24} className="text-emerald-600 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Facturas</h2>
                    <p className="text-sm text-slate-500">{invoiceStats.total} facturas · {invoiceStats.paid} pagadas</p>
                  </div>
                </div>
                <div className="w-10 h-10 bg-slate-100 group-hover:bg-emerald-100 rounded-full flex items-center justify-center transition-colors">
                  <ArrowRight size={18} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400 uppercase">Total POs</span>
              <FileText size={14} className="text-indigo-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{poStats.total}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400 uppercase">POs Pendientes</span>
              <Clock size={14} className="text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{poStats.pending}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400 uppercase">Total Facturas</span>
              <Receipt size={14} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{invoiceStats.total}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400 uppercase">Pagadas</span>
              <TrendingUp size={14} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{invoiceStats.paid}</p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Recent POs */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  POs recientes
                </h3>
                <Link href={`/project/${id}/accounting/pos`} className="text-sm text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1">
                  Ver todas <ChevronRight size={14} />
                </Link>
              </div>

              {recentPOs.length === 0 ? (
                <div className="text-center py-10">
                  <FileText size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 mb-2">Sin órdenes de compra</p>
                  <Link href={`/project/${id}/accounting/pos/new`} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-medium hover:text-indigo-700">
                    <Plus size={14} /> Crear primera PO
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentPOs.map((po) => (
                    <Link key={po.id} href={`/project/${id}/accounting/pos/${po.id}`}>
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
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" />
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
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Facturas recientes
                </h3>
                <Link href={`/project/${id}/accounting/invoices`} className="text-sm text-slate-500 hover:text-emerald-600 font-medium flex items-center gap-1">
                  Ver todas <ChevronRight size={14} />
                </Link>
              </div>

              {recentInvoices.length === 0 ? (
                <div className="text-center py-10">
                  <Receipt size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 mb-2">Sin facturas</p>
                  <Link href={`/project/${id}/accounting/invoices/new`} className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium hover:text-emerald-700">
                    <Plus size={14} /> Registrar primera factura
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentInvoices.map((invoice) => (
                    <Link key={invoice.id} href={`/project/${id}/accounting/invoices/${invoice.id}`}>
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
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

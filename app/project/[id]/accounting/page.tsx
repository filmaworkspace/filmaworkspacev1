"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { FileText, Receipt, ArrowRight, ArrowLeft, Settings, Bell, ChevronRight, BarChart3, Plus, Upload, Clock, AlertCircle, CreditCard } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface PO { id: string; number: string; supplier: string; totalAmount: number; status: "draft" | "pending" | "approved" | "rejected" | "closed" | "cancelled"; createdAt: Date | null; }
interface Invoice { id: string; number: string; supplier: string; totalAmount: number; status: "pending_approval" | "pending" | "paid" | "overdue" | "rejected" | "cancelled"; dueDate: Date | null; createdAt: Date | null; }

export default function AccountingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [recentPOs, setRecentPOs] = useState<PO[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState("");
  const [accountingAccessLevel, setAccountingAccessLevel] = useState<string>("");
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => { if (user) setUserId(user.uid); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadProjectData = async () => {
      if (!userId || !id) return;
      try {
        const projectDoc = await getDoc(doc(db, "projects", id));
        if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

        const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId));
        if (memberDoc.exists()) {
          const memberData = memberDoc.data();
          setUserRole(memberData.role || "");
          setAccountingAccessLevel(memberData.accountingAccessLevel || "user");
        }

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

        const posRecentQuery = query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc"), limit(5));
        const posRecentSnapshot = await getDocs(posRecentQuery);
        setRecentPOs(posRecentSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, number: data.number || "", supplier: data.supplier || "", totalAmount: data.totalAmount || 0, status: data.status || "draft", createdAt: data.createdAt?.toDate() || null };
        }));

        const invoicesRecentQuery = query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc"), limit(5));
        const invoicesRecentSnapshot = await getDocs(invoicesRecentQuery);
        setRecentInvoices(invoicesRecentSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, number: data.number || "", supplier: data.supplier || "", totalAmount: data.totalAmount || 0, status: data.status || "pending", createdAt: data.createdAt?.toDate() || null, dueDate: data.dueDate?.toDate() || null };
        }));
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProjectData();
  }, [id, userId]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-600", label: "Borrador" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
      closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada" },
      cancelled: { bg: "bg-slate-100", text: "text-slate-600", label: "Anulada" },
      pending_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Pend. aprob." },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      overdue: { bg: "bg-red-50", text: "text-red-700", label: "Vencida" },
    };
    const c = config[status] || config.pending;
    return <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  const hasExtendedAccess = accountingAccessLevel === "accounting_extended";

  if (loading) {
    return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          {/* Breadcrumb */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <BarChart3 size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Panel de contabilidad</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/project/${id}/accounting/pos/new`}>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
                  <Plus size={16} />Nueva PO
                </button>
              </Link>
              <Link href={`/project/${id}/accounting/invoices/new`}>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
                  <Upload size={16} />Subir factura
                </button>
              </Link>
              {pendingApprovalsCount > 0 && (
                <Link href={`/project/${id}/accounting/approvals`}>
                  <button className="relative p-2.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors border border-amber-200">
                    <Bell size={18} />
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{pendingApprovalsCount}</span>
                  </button>
                </Link>
              )}
              {(userRole === "EP" || userRole === "PM" || userRole === "Controller") && (
                <Link href={`/project/${id}/accounting/approvalsconfig`}>
                  <button className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"><Settings size={18} /></button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Pending Approvals Alert */}
        {pendingApprovalsCount > 0 && (
          <Link href={`/project/${id}/accounting/approvals`}>
            <div className="mb-8 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                    <Clock size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{pendingApprovalsCount} {pendingApprovalsCount === 1 ? "documento pendiente" : "documentos pendientes"} de tu aprobación</h3>
                    <p className="text-white/80 text-sm">Revisa y aprueba para continuar el flujo</p>
                  </div>
                </div>
                <ArrowRight size={24} className="text-white/80" />
              </div>
            </div>
          </Link>
        )}

        {/* Recent Activity - Con más espacio */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Recent POs */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <FileText size={18} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Últimas POs</h3>
                  <p className="text-xs text-slate-500">Órdenes de compra recientes</p>
                </div>
              </div>
              <Link href={`/project/${id}/accounting/pos`} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                Ver todas <ChevronRight size={14} />
              </Link>
            </div>

            <div className="p-5">
              {recentPOs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText size={24} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 mb-4">Sin órdenes de compra</p>
                  <Link href={`/project/${id}/accounting/pos/new`} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors">
                    <Plus size={16} /> Crear primera PO
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentPOs.map((po) => (
                    <Link key={po.id} href={`/project/${id}/accounting/pos/${po.id}`} className="block">
                      <div className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group border border-transparent hover:border-slate-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0">
                            <p className="text-sm font-bold text-slate-900">PO-{po.number}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[160px]">{po.supplier || "Sin proveedor"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                            <div className="mt-1">{getStatusBadge(po.status)}</div>
                          </div>
                          <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Receipt size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Últimas facturas</h3>
                  <p className="text-xs text-slate-500">Facturas recientes</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasExtendedAccess && (
                  <Link href={`/project/${id}/accounting/payments`}>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-sm font-medium transition-colors">
                      <CreditCard size={14} />Pagos
                    </button>
                  </Link>
                )}
                <Link href={`/project/${id}/accounting/invoices`} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                  Ver todas <ChevronRight size={14} />
                </Link>
              </div>
            </div>

            <div className="p-5">
              {recentInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Receipt size={24} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 mb-4">Sin facturas</p>
                  <Link href={`/project/${id}/accounting/invoices/new`} className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors">
                    <Upload size={16} /> Subir primera factura
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentInvoices.map((invoice) => {
                    const isOverdue = invoice.status === "overdue" || (invoice.dueDate && invoice.dueDate < new Date() && invoice.status === "pending");
                    return (
                      <Link key={invoice.id} href={`/project/${id}/accounting/invoices/${invoice.id}`} className="block">
                        <div className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group border border-transparent hover:border-slate-200">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold text-slate-900">FAC-{invoice.number}</p>
                                {isOverdue && <AlertCircle size={14} className="text-red-500" />}
                              </div>
                              <p className="text-xs text-slate-500 truncate max-w-[160px]">{invoice.supplier || "Sin proveedor"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                              <div className="mt-1">{getStatusBadge(invoice.status)}</div>
                            </div>
                            <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-500 flex-shrink-0 transition-colors" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

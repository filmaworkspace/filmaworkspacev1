"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc, deleteDoc, updateDoc, query, orderBy, where } from "firebase/firestore";
import {
  ArrowLeft, Shield, Briefcase, FileText, Receipt, Users, Building2, Wallet,
  Trash2, AlertTriangle, CheckCircle, AlertCircle, X, RefreshCw, ExternalLink,
  ChevronRight, Eye, TrendingUp, TrendingDown, Clock, Ban, Package,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface ProjectData {
  id: string;
  name: string;
  phase: string;
  description?: string;
}

interface POSummary {
  id: string;
  number: string;
  supplier: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
  hasInvoices: boolean;
}

interface InvoiceSummary {
  id: string;
  number: string;
  displayNumber: string;
  supplier: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
  poId?: string;
}

interface SupplierSummary {
  id: string;
  name: string;
  taxId: string;
  totalPOs: number;
  totalInvoices: number;
  totalAmount: number;
}

interface MemberSummary {
  id: string;
  name: string;
  email: string;
  role?: string;
  position?: string;
  department?: string;
  accountingAccess: boolean;
}

interface BudgetSummary {
  totalBudget: number;
  totalCommitted: number;
  totalActual: number;
  accountsCount: number;
}

export default function AdminProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;
  const { user: contextUser, isLoading: userLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [pos, setPOs] = useState<POSummary[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [budget, setBudget] = useState<BudgetSummary>({ totalBudget: 0, totalCommitted: 0, totalActual: 0, accountsCount: 0 });

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "po" | "invoice"; id: string; number: string } | null>(null);
  const [canResetNumber, setCanResetNumber] = useState(false);
  const [resetNumber, setResetNumber] = useState(false);

  useEffect(() => {
    if (!userLoading && (!contextUser || contextUser.role !== "admin")) {
      router.push("/dashboard");
    }
  }, [contextUser, userLoading, router]);

  useEffect(() => {
    if (projectId && contextUser?.role === "admin") loadData();
  }, [projectId, contextUser]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // Project info
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (!projectDoc.exists()) {
        router.push("/admindashboard");
        return;
      }
      setProject({ id: projectDoc.id, ...projectDoc.data() } as ProjectData);

      // POs
      const posSnap = await getDocs(query(collection(db, `projects/${projectId}/pos`), orderBy("number", "desc")));
      const posData: POSummary[] = [];
      for (const poDoc of posSnap.docs) {
        const data = poDoc.data();
        // Check if PO has invoices
        const invoicesForPO = await getDocs(query(collection(db, `projects/${projectId}/invoices`), where("poId", "==", poDoc.id)));
        posData.push({
          id: poDoc.id,
          number: data.number,
          supplier: data.supplier,
          totalAmount: data.totalAmount || 0,
          status: data.status,
          createdAt: data.createdAt?.toDate() || new Date(),
          hasInvoices: !invoicesForPO.empty,
        });
      }
      setPOs(posData);

      // Invoices
      const invoicesSnap = await getDocs(query(collection(db, `projects/${projectId}/invoices`), orderBy("number", "desc")));
      const invoicesData: InvoiceSummary[] = invoicesSnap.docs.map((invDoc) => {
        const data = invDoc.data();
        return {
          id: invDoc.id,
          number: data.number,
          displayNumber: data.displayNumber || `FAC-${data.number}`,
          supplier: data.supplier,
          totalAmount: data.totalAmount || 0,
          status: data.status,
          createdAt: data.createdAt?.toDate() || new Date(),
          poId: data.poId,
        };
      });
      setInvoices(invoicesData);

      // Suppliers
      const suppliersSnap = await getDocs(collection(db, `projects/${projectId}/suppliers`));
      const suppliersData: SupplierSummary[] = suppliersSnap.docs.map((supDoc) => {
        const data = supDoc.data();
        const supplierPOs = posData.filter((p) => p.supplier === data.name);
        const supplierInvoices = invoicesData.filter((i) => i.supplier === data.name);
        return {
          id: supDoc.id,
          name: data.name,
          taxId: data.taxId || "-",
          totalPOs: supplierPOs.length,
          totalInvoices: supplierInvoices.length,
          totalAmount: supplierInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0),
        };
      });
      setSuppliers(suppliersData);

      // Members
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`));
      const membersData: MemberSummary[] = membersSnap.docs.map((memDoc) => {
        const data = memDoc.data();
        return {
          id: memDoc.id,
          name: data.name,
          email: data.email,
          role: data.role,
          position: data.position,
          department: data.department,
          accountingAccess: data.permissions?.accounting || false,
        };
      });
      setMembers(membersData);

      // Budget
      const accountsSnap = await getDocs(collection(db, `projects/${projectId}/accounts`));
      let totalBudget = 0;
      let totalCommitted = 0;
      let totalActual = 0;
      for (const accDoc of accountsSnap.docs) {
        const subaccountsSnap = await getDocs(collection(db, `projects/${projectId}/accounts/${accDoc.id}/subaccounts`));
        for (const subDoc of subaccountsSnap.docs) {
          const subData = subDoc.data();
          totalBudget += subData.budget || 0;
          totalCommitted += subData.committed || 0;
          totalActual += subData.actual || 0;
        }
      }
      setBudget({ totalBudget, totalCommitted, totalActual, accountsCount: accountsSnap.size });

      setLoading(false);
    } catch (error) {
      console.error("Error loading data:", error);
      showToast("error", "Error al cargar los datos");
      setLoading(false);
    }
  };

  const handleDeletePO = (po: POSummary) => {
    // Check if this is the last PO (highest number)
    const isLastPO = pos.length === 0 || pos[0].number === po.number;
    setCanResetNumber(isLastPO && !po.hasInvoices);
    setResetNumber(isLastPO && !po.hasInvoices);
    setDeleteTarget({ type: "po", id: po.id, number: po.number });
    setShowDeleteModal(true);
  };

  const handleDeleteInvoice = (invoice: InvoiceSummary) => {
    // Check if this is the last invoice (highest number)
    const isLastInvoice = invoices.length === 0 || invoices[0].number === invoice.number;
    setCanResetNumber(isLastInvoice);
    setResetNumber(isLastInvoice);
    setDeleteTarget({ type: "invoice", id: invoice.id, number: invoice.number });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setProcessing(true);

    try {
      if (deleteTarget.type === "po") {
        // Delete PO
        await deleteDoc(doc(db, `projects/${projectId}/pos`, deleteTarget.id));

        // If resetting number, update the counter
        if (resetNumber) {
          const counterRef = doc(db, `projects/${projectId}/counters`, "pos");
          const counterSnap = await getDoc(counterRef);
          if (counterSnap.exists()) {
            const currentCount = counterSnap.data().count || 0;
            if (currentCount > 0) {
              await updateDoc(counterRef, { count: currentCount - 1 });
            }
          }
        }

        showToast("success", `PO-${deleteTarget.number} eliminada${resetNumber ? " (numeración ajustada)" : ""}`);
      } else {
        // Delete Invoice
        await deleteDoc(doc(db, `projects/${projectId}/invoices`, deleteTarget.id));

        // If resetting number, update the counter
        if (resetNumber) {
          const counterRef = doc(db, `projects/${projectId}/counters`, "invoices");
          const counterSnap = await getDoc(counterRef);
          if (counterSnap.exists()) {
            const currentCount = counterSnap.data().count || 0;
            if (currentCount > 0) {
              await updateDoc(counterRef, { count: currentCount - 1 });
            }
          }
        }

        showToast("success", `Factura ${deleteTarget.number} eliminada${resetNumber ? " (numeración ajustada)" : ""}`);
      }

      setShowDeleteModal(false);
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      console.error("Error deleting:", error);
      showToast("error", "Error al eliminar");
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date);

  const getStatusBadge = (status: string, type: "po" | "invoice") => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-600", label: "Borrador" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente" },
      pending_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Pte. aprob." },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada" },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
      overdue: { bg: "bg-red-50", text: "text-red-700", label: "Vencida" },
    };
    const config = configs[status] || configs.pending;
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>{config.label}</span>;
  };

  if (loading || userLoading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) return null;

  const activePOs = pos.filter((p) => p.status !== "cancelled").length;
  const activeInvoices = invoices.filter((i) => !["cancelled", "rejected"].includes(i.status)).length;
  const pendingInvoices = invoices.filter((i) => ["pending", "pending_approval", "overdue"].includes(i.status)).length;
  const budgetUsage = budget.totalBudget > 0 ? ((budget.totalActual / budget.totalBudget) * 100).toFixed(1) : 0;

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mt-[4.5rem] bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
              <Shield size={12} />
              <Link href="/admindashboard" className="inline-flex items-center gap-1 hover:text-purple-900 transition-colors">
                <ArrowLeft size={12} />
                Admin Dashboard
              </Link>
              <span className="text-purple-400">·</span>
              <span className="uppercase">{project.name}</span>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center">
                <Briefcase size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
                <p className="text-sm text-slate-500">{project.phase} · Vista de administrador</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={loadData} className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
                <RefreshCw size={18} />
              </button>
              <Link
                href={`/project/${projectId}/accounting`}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <ExternalLink size={16} />
                Ir al proyecto
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <FileText size={18} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{pos.length}</p>
                <p className="text-xs text-slate-500">POs ({activePOs} activas)</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Receipt size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{invoices.length}</p>
                <p className="text-xs text-slate-500">Facturas ({pendingInvoices} ptes.)</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Building2 size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{suppliers.length}</p>
                <p className="text-xs text-slate-500">Proveedores</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Users size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{members.length}</p>
                <p className="text-xs text-slate-500">Miembros</p>
              </div>
            </div>
          </div>
        </div>

        {/* Budget Overview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Wallet size={18} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Presupuesto</h2>
                <p className="text-xs text-slate-500">{budget.accountsCount} cuentas</p>
              </div>
            </div>
            <span className="text-sm font-medium text-slate-600">{budgetUsage}% ejecutado</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Presupuesto</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(budget.totalBudget)} €</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-xs text-amber-600 mb-1">Comprometido</p>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(budget.totalCommitted)} €</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-xs text-emerald-600 mb-1">Ejecutado</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(budget.totalActual)} €</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(Number(budgetUsage), 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* POs List */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                <h2 className="text-sm font-semibold text-slate-900">Órdenes de Compra</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{pos.length}</span>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {pos.length === 0 ? (
                <div className="p-8 text-center">
                  <Package size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay POs</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pos.map((po) => (
                    <div key={po.id} className="px-5 py-3 hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">PO-{po.number}</span>
                            {getStatusBadge(po.status, "po")}
                            {po.hasInvoices && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Con fact.</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{po.supplier}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                            <p className="text-xs text-slate-400">{formatDate(po.createdAt)}</p>
                          </div>
                          <button
                            onClick={() => handleDeletePO(po)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            title="Eliminar PO (Admin)"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Invoices List */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900">Facturas</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{invoices.length}</span>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {invoices.length === 0 ? (
                <div className="p-8 text-center">
                  <Receipt size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay facturas</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="px-5 py-3 hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{invoice.displayNumber}</span>
                            {getStatusBadge(invoice.status, "invoice")}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{invoice.supplier}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                            <p className="text-xs text-slate-400">{formatDate(invoice.createdAt)}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteInvoice(invoice)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            title="Eliminar Factura (Admin)"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Suppliers List */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-amber-600" />
                <h2 className="text-sm font-semibold text-slate-900">Proveedores</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{suppliers.length}</span>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {suppliers.length === 0 ? (
                <div className="p-8 text-center">
                  <Building2 size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay proveedores</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {suppliers.slice(0, 10).map((supplier) => (
                    <div key={supplier.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{supplier.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{supplier.taxId}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(supplier.totalAmount)} €</p>
                          <p className="text-xs text-slate-400">{supplier.totalPOs} POs · {supplier.totalInvoices} fact.</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {suppliers.length > 10 && (
                    <div className="px-5 py-3 text-center">
                      <p className="text-xs text-slate-500">+{suppliers.length - 10} más</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Members List */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-purple-600" />
                <h2 className="text-sm font-semibold text-slate-900">Miembros</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{members.length}</span>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {members.length === 0 ? (
                <div className="p-8 text-center">
                  <Users size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay miembros</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <div key={member.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-600 text-xs font-medium">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{member.name}</p>
                            <p className="text-xs text-slate-500">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.role && (
                            <span className="text-xs bg-slate-900 text-white px-2 py-0.5 rounded">{member.role}</span>
                          )}
                          {member.department && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{member.department}</span>
                          )}
                          {member.accountingAccess && (
                            <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">💰</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Eliminar {deleteTarget.type === "po" ? "PO" : "Factura"}</h3>
                <p className="text-xs text-slate-500">Acción de administrador de plataforma</p>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium">¿Eliminar {deleteTarget.type === "po" ? `PO-${deleteTarget.number}` : deleteTarget.number}?</p>
                    <p className="text-xs mt-1">Esta acción es permanente y no se puede deshacer. Solo los administradores de plataforma pueden realizar esta acción.</p>
                  </div>
                </div>
              </div>

              {canResetNumber && (
                <div className="mb-6">
                  <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={resetNumber}
                      onChange={(e) => setResetNumber(e.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Ajustar numeración</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        La próxima {deleteTarget.type === "po" ? "PO" : "factura"} usará el número {deleteTarget.number} en lugar de continuar la secuencia.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {!canResetNumber && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">No se puede ajustar la numeración</p>
                      <p className="text-xs mt-1">
                        {deleteTarget.type === "po" && pos[0]?.number !== deleteTarget.number
                          ? "Hay POs con números posteriores."
                          : deleteTarget.type === "po" && pos.find(p => p.number === deleteTarget.number)?.hasInvoices
                          ? "Esta PO tiene facturas asociadas."
                          : "Hay facturas con números posteriores."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
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

"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import {
  Folder,
  BarChart3,
  Download,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  FileText,
  Receipt,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  ChevronRight,
  RefreshCw,
  PiggyBank,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

interface ReportStats {
  totalBudget: number;
  totalCommitted: number;
  totalActual: number;
  totalAvailable: number;
  totalPOs: number;
  totalInvoices: number;
  totalSuppliers: number;
}

export default function ReportsPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [stats, setStats] = useState<ReportStats>({
    totalBudget: 0,
    totalCommitted: 0,
    totalActual: 0,
    totalAvailable: 0,
    totalPOs: 0,
    totalInvoices: 0,
    totalSuppliers: 0,
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const accountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts`));
      let totalBudgeted = 0;

      for (const accountDoc of accountsSnapshot.docs) {
        const subAccountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`));
        subAccountsSnapshot.docs.forEach((subDoc) => {
          totalBudgeted += subDoc.data().budgeted || 0;
        });
      }

      const posSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
      let totalCommitted = 0;
      posSnapshot.docs.forEach((doc) => {
        if (doc.data().status === "approved") {
          totalCommitted += doc.data().amount || 0;
        }
      });

      const invoicesSnapshot = await getDocs(collection(db, `projects/${id}/invoices`));
      let totalActual = 0;
      invoicesSnapshot.docs.forEach((doc) => {
        if (doc.data().status === "paid") {
          totalActual += doc.data().amount || 0;
        }
      });

      const suppliersSnapshot = await getDocs(collection(db, `projects/${id}/suppliers`));

      setStats({
        totalBudget: totalBudgeted,
        totalCommitted,
        totalActual,
        totalAvailable: totalBudgeted - totalCommitted - totalActual,
        totalPOs: posSnapshot.size,
        totalInvoices: invoicesSnapshot.size,
        totalSuppliers: suppliersSnapshot.size,
      });
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateBudgetReport = async () => {
    setGenerating("budget");
    try {
      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));

      const rows = [["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO", "COMPROMETIDO", "REALIZADO", "DISPONIBLE", "% EJECUTADO"]];

      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));

        let accountBudgeted = 0;
        let accountCommitted = 0;
        let accountActual = 0;

        subAccountsSnapshot.docs.forEach((subDoc) => {
          const subData = subDoc.data();
          const budgeted = subData.budgeted || 0;
          const committed = subData.committed || 0;
          const actual = subData.actual || 0;
          const available = budgeted - committed - actual;
          const percentage = budgeted > 0 ? ((actual / budgeted) * 100).toFixed(2) : "0.00";

          accountBudgeted += budgeted;
          accountCommitted += committed;
          accountActual += actual;

          rows.push([subData.code, subData.description, "SUBCUENTA", budgeted.toString(), committed.toString(), actual.toString(), available.toString(), percentage + "%"]);
        });

        const accountAvailable = accountBudgeted - accountCommitted - accountActual;
        const accountPercentage = accountBudgeted > 0 ? ((accountActual / accountBudgeted) * 100).toFixed(2) : "0.00";

        rows.splice(rows.length - subAccountsSnapshot.size, 0, [accountData.code, accountData.description, "CUENTA", accountBudgeted.toString(), accountCommitted.toString(), accountActual.toString(), accountAvailable.toString(), accountPercentage + "%"]);
      }

      rows.push([]);
      rows.push(["", "TOTAL PROYECTO", "", stats.totalBudget.toString(), stats.totalCommitted.toString(), stats.totalActual.toString(), stats.totalAvailable.toString(), stats.totalBudget > 0 ? ((stats.totalActual / stats.totalBudget) * 100).toFixed(2) + "%" : "0.00%"]);

      downloadCSV(rows, `Presupuesto_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generatePOsReport = async () => {
    setGenerating("pos");
    try {
      const posSnapshot = await getDocs(query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc")));

      const rows = [["NÚMERO PO", "PROVEEDOR", "DESCRIPCIÓN", "CUENTA PRESUPUESTARIA", "IMPORTE", "ESTADO", "FECHA CREACIÓN", "FECHA APROBACIÓN", "COMPROMETIDO"]];

      posSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleDateString("es-ES") : "";
        const approvedAt = data.approvedAt?.toDate ? new Date(data.approvedAt.toDate()).toLocaleDateString("es-ES") : "";

        rows.push([data.number || "", data.supplier || "", data.description || "", data.budgetAccount || "", (data.amount || 0).toString(), data.status || "", createdAt, approvedAt, data.status === "approved" ? "SÍ" : "NO"]);
      });

      rows.push([]);
      rows.push(["RESUMEN"]);
      rows.push(["Total POs", posSnapshot.size.toString()]);
      rows.push(["Total Comprometido", stats.totalCommitted.toFixed(2) + " €"]);

      downloadCSV(rows, `Ordenes_Compra_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateInvoicesReport = async () => {
    setGenerating("invoices");
    try {
      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc")));

      const rows = [["NÚMERO FACTURA", "PROVEEDOR", "DESCRIPCIÓN", "PO ASOCIADA", "CUENTA PRESUPUESTARIA", "IMPORTE", "ESTADO", "FECHA EMISIÓN", "FECHA VENCIMIENTO", "FECHA PAGO"]];

      invoicesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const issueDate = data.issueDate?.toDate ? new Date(data.issueDate.toDate()).toLocaleDateString("es-ES") : "";
        const dueDate = data.dueDate?.toDate ? new Date(data.dueDate.toDate()).toLocaleDateString("es-ES") : "";
        const paymentDate = data.paymentDate?.toDate ? new Date(data.paymentDate.toDate()).toLocaleDateString("es-ES") : "";

        rows.push([data.number || "", data.supplier || "", data.description || "", data.poNumber || "", data.budgetAccount || "", (data.amount || 0).toString(), data.status || "", issueDate, dueDate, paymentDate]);
      });

      rows.push([]);
      rows.push(["RESUMEN"]);
      rows.push(["Total Facturas", invoicesSnapshot.size.toString()]);
      rows.push(["Total Pagado", stats.totalActual.toFixed(2) + " €"]);

      downloadCSV(rows, `Facturas_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateSuppliersReport = async () => {
    setGenerating("suppliers");
    try {
      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));

      const rows = [["NOMBRE FISCAL", "NOMBRE COMERCIAL", "NIF/CIF", "PAÍS", "MÉTODO DE PAGO", "CUENTA BANCARIA", "CERT. BANCARIO", "CERT. CONTRATISTA", "ESTADO CERTIFICADOS"]];

      suppliersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const bankCertStatus = data.certificates?.bankOwnership?.uploaded ? "SUBIDO" : "PENDIENTE";
        const contractorCertStatus = data.certificates?.contractorsCertificate?.uploaded ? "SUBIDO" : "PENDIENTE";
        const certStatus = data.certificates?.bankOwnership?.uploaded && data.certificates?.contractorsCertificate?.uploaded ? "COMPLETO" : "INCOMPLETO";

        rows.push([data.fiscalName || "", data.commercialName || "", data.taxId || "", data.country || "", data.paymentMethod || "", data.bankAccount || "", bankCertStatus, contractorCertStatus, certStatus]);
      });

      rows.push([]);
      rows.push(["RESUMEN"]);
      rows.push(["Total Proveedores", suppliersSnapshot.size.toString()]);

      downloadCSV(rows, `Proveedores_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateCostControlReport = async () => {
    setGenerating("cost-control");
    try {
      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));

      const rows = [
        ["INFORME DE COST CONTROL - " + projectName.toUpperCase()],
        ["Fecha de generación: " + new Date().toLocaleString("es-ES")],
        [],
        ["CÓDIGO", "DESCRIPCIÓN", "PRESUPUESTADO", "COMPROMETIDO (POs)", "% COMPROMETIDO", "DISPONIBLE PARA COMPROMETER", "REALIZADO (Facturas)", "% REALIZADO", "DISPONIBLE TOTAL", "ESTADO"],
      ];

      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));

        let accountBudgeted = 0;
        let accountCommitted = 0;
        let accountActual = 0;

        subAccountsSnapshot.docs.forEach((subDoc) => {
          const subData = subDoc.data();
          const budgeted = subData.budgeted || 0;
          const committed = subData.committed || 0;
          const actual = subData.actual || 0;
          const availableToCommit = budgeted - committed;
          const availableTotal = budgeted - committed - actual;
          const committedPercent = budgeted > 0 ? ((committed / budgeted) * 100).toFixed(2) : "0.00";
          const actualPercent = budgeted > 0 ? ((actual / budgeted) * 100).toFixed(2) : "0.00";

          let status = "OK";
          if (availableTotal < 0) status = "SOBREPASADO";
          else if (availableTotal < budgeted * 0.1) status = "ALERTA";

          accountBudgeted += budgeted;
          accountCommitted += committed;
          accountActual += actual;

          rows.push([subData.code, subData.description, budgeted.toFixed(2), committed.toFixed(2), committedPercent + "%", availableToCommit.toFixed(2), actual.toFixed(2), actualPercent + "%", availableTotal.toFixed(2), status]);
        });

        const accountAvailableToCommit = accountBudgeted - accountCommitted;
        const accountAvailableTotal = accountBudgeted - accountCommitted - accountActual;
        const accountCommittedPercent = accountBudgeted > 0 ? ((accountCommitted / accountBudgeted) * 100).toFixed(2) : "0.00";
        const accountActualPercent = accountBudgeted > 0 ? ((accountActual / accountBudgeted) * 100).toFixed(2) : "0.00";

        let accountStatus = "OK";
        if (accountAvailableTotal < 0) accountStatus = "SOBREPASADO";
        else if (accountAvailableTotal < accountBudgeted * 0.1) accountStatus = "ALERTA";

        rows.splice(rows.length - subAccountsSnapshot.size, 0, [accountData.code, accountData.description + " (TOTAL)", accountBudgeted.toFixed(2), accountCommitted.toFixed(2), accountCommittedPercent + "%", accountAvailableToCommit.toFixed(2), accountActual.toFixed(2), accountActualPercent + "%", accountAvailableTotal.toFixed(2), accountStatus]);
        rows.push([]);
      }

      const availableToCommit = stats.totalBudget - stats.totalCommitted;

      rows.push(["", "TOTAL PROYECTO", stats.totalBudget.toFixed(2), stats.totalCommitted.toFixed(2), stats.totalBudget > 0 ? ((stats.totalCommitted / stats.totalBudget) * 100).toFixed(2) + "%" : "0%", availableToCommit.toFixed(2), stats.totalActual.toFixed(2), stats.totalBudget > 0 ? ((stats.totalActual / stats.totalBudget) * 100).toFixed(2) + "%" : "0%", stats.totalAvailable.toFixed(2), stats.totalAvailable < 0 ? "SOBREPASADO" : stats.totalAvailable < stats.totalBudget * 0.1 ? "ALERTA" : "OK"]);

      downloadCSV(rows, `Cost_Control_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateExecutiveSummary = async () => {
    setGenerating("executive");
    try {
      const rows = [
        ["RESUMEN EJECUTIVO - " + projectName.toUpperCase()],
        ["Fecha de generación: " + new Date().toLocaleString("es-ES")],
        [],
        ["PRESUPUESTO"],
        ["Total Presupuestado", stats.totalBudget.toFixed(2) + " €"],
        ["Total Comprometido", stats.totalCommitted.toFixed(2) + " €"],
        ["Total Realizado", stats.totalActual.toFixed(2) + " €"],
        ["Disponible", stats.totalAvailable.toFixed(2) + " €"],
        ["% Ejecutado", stats.totalBudget > 0 ? ((stats.totalActual / stats.totalBudget) * 100).toFixed(2) + "%" : "0%"],
        [],
        ["ÓRDENES DE COMPRA"],
        ["Total POs", stats.totalPOs.toString()],
        ["Importe Comprometido", stats.totalCommitted.toFixed(2) + " €"],
        [],
        ["FACTURAS"],
        ["Total Facturas", stats.totalInvoices.toString()],
        ["Importe Pagado", stats.totalActual.toFixed(2) + " €"],
        [],
        ["PROVEEDORES"],
        ["Total Proveedores", stats.totalSuppliers.toString()],
      ];

      downloadCSV(rows, `Resumen_Ejecutivo_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando resumen:", error);
    } finally {
      setGenerating(null);
    }
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCurrentDate = () => new Date().toISOString().split("T")[0];

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

  const budgetedPercent = stats.totalBudget > 0 ? ((stats.totalCommitted + stats.totalActual) / stats.totalBudget) * 100 : 0;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/project/${id}/accounting`} className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1">
              <Folder size={14} />
              {projectName}
              <ChevronRight size={14} />
              <span>Contabilidad</span>
            </Link>
            <button onClick={loadData} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-sm font-medium transition-colors border border-white/10">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Informes</h1>
              <p className="text-slate-400 text-sm">Descarga informes financieros y de cost control</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <PiggyBank size={18} className="text-blue-400" />
                <span className="text-xl font-bold">{stats.totalBudget.toLocaleString()} €</span>
              </div>
              <p className="text-sm text-slate-400">Presupuestado</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-400" />
                <span className="text-xl font-bold">{stats.totalCommitted.toLocaleString()} €</span>
              </div>
              <p className="text-sm text-slate-400">Comprometido</p>
              <div className="mt-2 text-xs text-amber-400">{stats.totalBudget > 0 ? `${((stats.totalCommitted / stats.totalBudget) * 100).toFixed(1)}%` : "0%"}</div>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-400" />
                <span className="text-xl font-bold">{stats.totalActual.toLocaleString()} €</span>
              </div>
              <p className="text-sm text-slate-400">Realizado</p>
              <div className="mt-2 text-xs text-emerald-400">{stats.totalBudget > 0 ? `${((stats.totalActual / stats.totalBudget) * 100).toFixed(1)}%` : "0%"}</div>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={18} className="text-purple-400" />
                <span className="text-xl font-bold">{stats.totalAvailable.toLocaleString()} €</span>
              </div>
              <p className="text-sm text-slate-400">Disponible</p>
              <div className="mt-2 text-xs text-purple-400">{stats.totalBudget > 0 ? `${((stats.totalAvailable / stats.totalBudget) * 100).toFixed(1)}%` : "0%"}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Ejecución del presupuesto</span>
              <span>{budgetedPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all" style={{ width: `${Math.min(budgetedPercent, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Reports Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Presupuesto */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <DollarSign size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Informe de presupuesto</h3>
                  <p className="text-xs text-slate-500">Detalle de cuentas</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Todas las cuentas y subcuentas con presupuestado, comprometido, realizado y disponible.</p>
              <button
                onClick={generateBudgetReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {generating === "budget" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Descargar CSV
                  </>
                )}
              </button>
            </div>

            {/* POs */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Órdenes de compra</h3>
                  <p className="text-xs text-slate-500">{stats.totalPOs} POs registradas</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Detalle de todas las POs con importes comprometidos y estado de aprobación.</p>
              <button
                onClick={generatePOsReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {generating === "pos" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Descargar CSV
                  </>
                )}
              </button>
            </div>

            {/* Facturas */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  <Receipt size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Facturas</h3>
                  <p className="text-xs text-slate-500">{stats.totalInvoices} facturas registradas</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Listado completo de facturas con importes, vencimientos y estado de pago.</p>
              <button
                onClick={generateInvoicesReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {generating === "invoices" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Descargar CSV
                  </>
                )}
              </button>
            </div>

            {/* Proveedores */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Proveedores</h3>
                  <p className="text-xs text-slate-500">{stats.totalSuppliers} proveedores</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Base de datos de proveedores con información fiscal y estado de certificados.</p>
              <button
                onClick={generateSuppliersReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {generating === "suppliers" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Descargar CSV
                  </>
                )}
              </button>
            </div>

            {/* Cost Control */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Cost Control</h3>
                  <p className="text-xs text-slate-500">Análisis completo</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Informe detallado con presupuesto vs. comprometido vs. realizado con alertas.</p>
              <button
                onClick={generateCostControlReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {generating === "cost-control" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Descargar CSV
                  </>
                )}
              </button>
            </div>

            {/* Resumen Ejecutivo */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center group-hover:bg-slate-800 group-hover:text-white transition-all">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Resumen ejecutivo</h3>
                  <p className="text-xs text-slate-500">Vista global</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Resumen condensado con las métricas clave del proyecto para presentaciones.</p>
              <button
                onClick={generateExecutiveSummary}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {generating === "executive" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Descargar CSV
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Nota informativa */}
          <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <div className="flex gap-3">
              <AlertCircle size={20} className="text-slate-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Información sobre los informes</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• Los informes se generan en formato CSV (compatible con Excel)</li>
                  <li>• Todos los importes se muestran en euros (€)</li>
                  <li>• Los datos son en tiempo real del estado actual del proyecto</li>
                  <li>• El informe de Cost Control incluye alertas automáticas cuando el disponible es menor al 10%</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


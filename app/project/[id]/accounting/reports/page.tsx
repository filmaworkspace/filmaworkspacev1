"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  FileText,
  Receipt,
  Building2,
  ArrowLeft,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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

  const reports = [
    {
      id: "budget",
      icon: DollarSign,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Informe de presupuesto",
      description: "Todas las cuentas y subcuentas con presupuestado, comprometido, realizado y disponible.",
      action: generateBudgetReport,
    },
    {
      id: "pos",
      icon: FileText,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      title: "Órdenes de compra",
      description: "Detalle de todas las POs con importes comprometidos y estado de aprobación.",
      meta: `${stats.totalPOs} registradas`,
      action: generatePOsReport,
    },
    {
      id: "invoices",
      icon: Receipt,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      title: "Facturas",
      description: "Listado completo de facturas con importes, vencimientos y estado de pago.",
      meta: `${stats.totalInvoices} registradas`,
      action: generateInvoicesReport,
    },
    {
      id: "suppliers",
      icon: Building2,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
      title: "Proveedores",
      description: "Base de datos de proveedores con información fiscal y estado de certificados.",
      meta: `${stats.totalSuppliers} proveedores`,
      action: generateSuppliersReport,
    },
    {
      id: "cost-control",
      icon: TrendingUp,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      title: "Cost Control",
      description: "Informe detallado con presupuesto vs. comprometido vs. realizado con alertas.",
      action: generateCostControlReport,
    },
    {
      id: "executive",
      icon: FileSpreadsheet,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      title: "Resumen ejecutivo",
      description: "Resumen condensado con las métricas clave del proyecto para presentaciones.",
      action: generateExecutiveSummary,
    },
  ];

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
          <Link href={`/project/${id}/accounting`} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6">
            <ArrowLeft size={16} />
            Volver al Panel
          </Link>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <BarChart3 size={24} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Informes</h1>
              <p className="text-slate-500 text-sm">{projectName}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Reports List */}
        <div className="space-y-3">
          {reports.map((report) => {
            const Icon = report.icon;
            const isGenerating = generating === report.id;

            return (
              <div key={report.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all flex items-center gap-4">
                <div className={`w-12 h-12 ${report.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon size={22} className={report.iconColor} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{report.title}</h3>
                    {report.meta && (
                      <span className="text-xs text-slate-400">• {report.meta}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{report.description}</p>
                </div>

                <button
                  onClick={report.action}
                  disabled={generating !== null}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Descargar
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Note */}
        <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-600">
            Los informes se generan en formato CSV compatible con Excel. Todos los importes en euros (€) y los datos son en tiempo real.
          </p>
        </div>
      </main>
    </div>
  );
}


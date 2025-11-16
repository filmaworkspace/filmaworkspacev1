"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import {
  Folder,
  BarChart3,
  Download,
  FileSpreadsheet,
  Calendar,
  Filter,
  TrendingUp,
  DollarSign,
  FileText,
  Receipt,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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

  const [dateRange, setDateRange] = useState({
    from: "",
    to: "",
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

      // Load budget data
      const accountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts`));
      let totalBudgeted = 0;

      for (const accountDoc of accountsSnapshot.docs) {
        const subAccountsSnapshot = await getDocs(
          collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`)
        );
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          totalBudgeted += data.budgeted || 0;
        });
      }

      // Load POs
      const posSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
      const totalPOs = posSnapshot.size;
      let totalCommitted = 0;
      posSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === "approved") {
          totalCommitted += data.amount || 0;
        }
      });

      // Load Invoices
      const invoicesSnapshot = await getDocs(collection(db, `projects/${id}/invoices`));
      const totalInvoices = invoicesSnapshot.size;
      let totalActual = 0;
      invoicesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === "paid") {
          totalActual += data.amount || 0;
        }
      });

      // Load Suppliers
      const suppliersSnapshot = await getDocs(collection(db, `projects/${id}/suppliers`));
      const totalSuppliers = suppliersSnapshot.size;

      setStats({
        totalBudget: totalBudgeted,
        totalCommitted,
        totalActual,
        totalAvailable: totalBudgeted - totalCommitted - totalActual,
        totalPOs,
        totalInvoices,
        totalSuppliers,
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
      // Load all accounts and subaccounts
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );

      const rows = [
        [
          "CÓDIGO",
          "DESCRIPCIÓN",
          "TIPO",
          "PRESUPUESTADO",
          "COMPROMETIDO",
          "REALIZADO",
          "DISPONIBLE",
          "% EJECUTADO",
        ],
      ];

      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();

        // Load subaccounts
        const subAccountsSnapshot = await getDocs(
          query(
            collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`),
            orderBy("code", "asc")
          )
        );

        let accountBudgeted = 0;
        let accountCommitted = 0;
        let accountActual = 0;

        // Add subaccounts
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

          rows.push([
            subData.code,
            subData.description,
            "SUBCUENTA",
            budgeted.toString(),
            committed.toString(),
            actual.toString(),
            available.toString(),
            percentage + "%",
          ]);
        });

        // Add account totals
        const accountAvailable = accountBudgeted - accountCommitted - accountActual;
        const accountPercentage =
          accountBudgeted > 0 ? ((accountActual / accountBudgeted) * 100).toFixed(2) : "0.00";

        rows.splice(rows.length - subAccountsSnapshot.size, 0, [
          accountData.code,
          accountData.description,
          "CUENTA",
          accountBudgeted.toString(),
          accountCommitted.toString(),
          accountActual.toString(),
          accountAvailable.toString(),
          accountPercentage + "%",
        ]);
      }

      // Add totals row
      rows.push([]);
      rows.push([
        "",
        "TOTAL PROYECTO",
        "",
        stats.totalBudget.toString(),
        stats.totalCommitted.toString(),
        stats.totalActual.toString(),
        stats.totalAvailable.toString(),
        stats.totalBudget > 0
          ? ((stats.totalActual / stats.totalBudget) * 100).toFixed(2) + "%"
          : "0.00%",
      ]);

      downloadCSV(rows, `Presupuesto_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe de presupuesto:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generatePOsReport = async () => {
    setGenerating("pos");
    try {
      const posSnapshot = await getDocs(
        query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc"))
      );

      const rows = [
        [
          "NÚMERO PO",
          "PROVEEDOR",
          "DESCRIPCIÓN",
          "CUENTA PRESUPUESTARIA",
          "IMPORTE",
          "ESTADO",
          "FECHA CREACIÓN",
          "FECHA APROBACIÓN",
          "COMPROMETIDO",
        ],
      ];

      posSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate
          ? new Date(data.createdAt.toDate()).toLocaleDateString("es-ES")
          : "";
        const approvedAt = data.approvedAt?.toDate
          ? new Date(data.approvedAt.toDate()).toLocaleDateString("es-ES")
          : "";
        const committed = data.status === "approved" ? "SÍ" : "NO";

        rows.push([
          data.number || "",
          data.supplier || "",
          data.description || "",
          data.budgetAccount || "",
          (data.amount || 0).toString(),
          data.status || "",
          createdAt,
          approvedAt,
          committed,
        ]);
      });

      // Add summary
      rows.push([]);
      rows.push(["RESUMEN"]);
      rows.push(["Total POs", posSnapshot.size.toString()]);
      rows.push([
        "Total Comprometido",
        stats.totalCommitted.toFixed(2) + " €",
      ]);

      downloadCSV(rows, `Ordenes_Compra_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe de POs:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateInvoicesReport = async () => {
    setGenerating("invoices");
    try {
      const invoicesSnapshot = await getDocs(
        query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc"))
      );

      const rows = [
        [
          "NÚMERO FACTURA",
          "PROVEEDOR",
          "DESCRIPCIÓN",
          "PO ASOCIADA",
          "CUENTA PRESUPUESTARIA",
          "IMPORTE",
          "ESTADO",
          "FECHA EMISIÓN",
          "FECHA VENCIMIENTO",
          "FECHA PAGO",
        ],
      ];

      invoicesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const issueDate = data.issueDate?.toDate
          ? new Date(data.issueDate.toDate()).toLocaleDateString("es-ES")
          : "";
        const dueDate = data.dueDate?.toDate
          ? new Date(data.dueDate.toDate()).toLocaleDateString("es-ES")
          : "";
        const paymentDate = data.paymentDate?.toDate
          ? new Date(data.paymentDate.toDate()).toLocaleDateString("es-ES")
          : "";

        rows.push([
          data.number || "",
          data.supplier || "",
          data.description || "",
          data.poNumber || "",
          data.budgetAccount || "",
          (data.amount || 0).toString(),
          data.status || "",
          issueDate,
          dueDate,
          paymentDate,
        ]);
      });

      // Add summary
      rows.push([]);
      rows.push(["RESUMEN"]);
      rows.push(["Total Facturas", invoicesSnapshot.size.toString()]);

      const paidInvoices = invoicesSnapshot.docs.filter(
        (doc) => doc.data().status === "paid"
      ).length;
      const pendingInvoices = invoicesSnapshot.docs.filter(
        (doc) => doc.data().status === "pending"
      ).length;
      const overdueInvoices = invoicesSnapshot.docs.filter(
        (doc) => doc.data().status === "overdue"
      ).length;

      rows.push(["Facturas Pagadas", paidInvoices.toString()]);
      rows.push(["Facturas Pendientes", pendingInvoices.toString()]);
      rows.push(["Facturas Vencidas", overdueInvoices.toString()]);
      rows.push(["Total Pagado", stats.totalActual.toFixed(2) + " €"]);

      downloadCSV(rows, `Facturas_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe de facturas:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateSuppliersReport = async () => {
    setGenerating("suppliers");
    try {
      const suppliersSnapshot = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc"))
      );

      const rows = [
        [
          "NOMBRE FISCAL",
          "NOMBRE COMERCIAL",
          "NIF/CIF",
          "PAÍS",
          "MÉTODO DE PAGO",
          "CUENTA BANCARIA",
          "CERT. BANCARIO",
          "CERT. CONTRATISTA",
          "ESTADO CERTIFICADOS",
        ],
      ];

      suppliersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const bankCertStatus = data.certificates?.bankOwnership?.uploaded
          ? "SUBIDO"
          : "PENDIENTE";
        const contractorCertStatus = data.certificates?.contractorsCertificate?.uploaded
          ? "SUBIDO"
          : "PENDIENTE";

        let certStatus = "COMPLETO";
        if (!data.certificates?.bankOwnership?.uploaded || !data.certificates?.contractorsCertificate?.uploaded) {
          certStatus = "INCOMPLETO";
        }

        rows.push([
          data.fiscalName || "",
          data.commercialName || "",
          data.taxId || "",
          data.country || "",
          data.paymentMethod || "",
          data.bankAccount || "",
          bankCertStatus,
          contractorCertStatus,
          certStatus,
        ]);
      });

      // Add summary
      rows.push([]);
      rows.push(["RESUMEN"]);
      rows.push(["Total Proveedores", suppliersSnapshot.size.toString()]);

      const completeCerts = suppliersSnapshot.docs.filter(
        (doc) =>
          doc.data().certificates?.bankOwnership?.uploaded &&
          doc.data().certificates?.contractorsCertificate?.uploaded
      ).length;

      rows.push(["Proveedores con Certificados Completos", completeCerts.toString()]);
      rows.push([
        "Proveedores con Certificados Incompletos",
        (suppliersSnapshot.size - completeCerts).toString(),
      ]);

      downloadCSV(rows, `Proveedores_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe de proveedores:", error);
    } finally {
      setGenerating(null);
    }
  };

  const generateCostControlReport = async () => {
    setGenerating("cost-control");
    try {
      // Comprehensive cost control report
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );

      const rows = [
        ["INFORME DE COST CONTROL - " + projectName.toUpperCase()],
        ["Fecha de generación: " + new Date().toLocaleString("es-ES")],
        [],
        [
          "CÓDIGO",
          "DESCRIPCIÓN",
          "PRESUPUESTADO",
          "COMPROMETIDO (POs)",
          "% COMPROMETIDO",
          "DISPONIBLE PARA COMPROMETER",
          "REALIZADO (Facturas)",
          "% REALIZADO",
          "DISPONIBLE TOTAL",
          "ESTADO",
        ],
      ];

      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();

        const subAccountsSnapshot = await getDocs(
          query(
            collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`),
            orderBy("code", "asc")
          )
        );

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

          rows.push([
            subData.code,
            subData.description,
            budgeted.toFixed(2),
            committed.toFixed(2),
            committedPercent + "%",
            availableToCommit.toFixed(2),
            actual.toFixed(2),
            actualPercent + "%",
            availableTotal.toFixed(2),
            status,
          ]);
        });

        // Account summary
        const accountAvailableToCommit = accountBudgeted - accountCommitted;
        const accountAvailableTotal = accountBudgeted - accountCommitted - accountActual;
        const accountCommittedPercent =
          accountBudgeted > 0 ? ((accountCommitted / accountBudgeted) * 100).toFixed(2) : "0.00";
        const accountActualPercent =
          accountBudgeted > 0 ? ((accountActual / accountBudgeted) * 100).toFixed(2) : "0.00";

        let accountStatus = "OK";
        if (accountAvailableTotal < 0) accountStatus = "SOBREPASADO";
        else if (accountAvailableTotal < accountBudgeted * 0.1) accountStatus = "ALERTA";

        rows.splice(rows.length - subAccountsSnapshot.size, 0, [
          accountData.code,
          accountData.description + " (TOTAL)",
          accountBudgeted.toFixed(2),
          accountCommitted.toFixed(2),
          accountCommittedPercent + "%",
          accountAvailableToCommit.toFixed(2),
          accountActual.toFixed(2),
          accountActualPercent + "%",
          accountAvailableTotal.toFixed(2),
          accountStatus,
        ]);

        rows.push([]);
      }

      // Global totals
      const globalCommittedPercent =
        stats.totalBudget > 0
          ? ((stats.totalCommitted / stats.totalBudget) * 100).toFixed(2)
          : "0.00";
      const globalActualPercent =
        stats.totalBudget > 0 ? ((stats.totalActual / stats.totalBudget) * 100).toFixed(2) : "0.00";
      const availableToCommit = stats.totalBudget - stats.totalCommitted;

      let globalStatus = "OK";
      if (stats.totalAvailable < 0) globalStatus = "SOBREPASADO";
      else if (stats.totalAvailable < stats.totalBudget * 0.1) globalStatus = "ALERTA";

      rows.push([
        "",
        "TOTAL PROYECTO",
        stats.totalBudget.toFixed(2),
        stats.totalCommitted.toFixed(2),
        globalCommittedPercent + "%",
        availableToCommit.toFixed(2),
        stats.totalActual.toFixed(2),
        globalActualPercent + "%",
        stats.totalAvailable.toFixed(2),
        globalStatus,
      ]);

      rows.push([]);
      rows.push(["RESUMEN EJECUTIVO"]);
      rows.push(["Total Presupuestado", stats.totalBudget.toFixed(2) + " €"]);
      rows.push(["Total Comprometido (POs)", stats.totalCommitted.toFixed(2) + " €"]);
      rows.push(["Total Realizado (Facturas)", stats.totalActual.toFixed(2) + " €"]);
      rows.push(["Disponible para Comprometer", availableToCommit.toFixed(2) + " €"]);
      rows.push(["Disponible Total", stats.totalAvailable.toFixed(2) + " €"]);
      rows.push(["Estado Global", globalStatus]);

      downloadCSV(rows, `Cost_Control_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe de cost control:", error);
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
        [
          "% Ejecutado",
          stats.totalBudget > 0
            ? ((stats.totalActual / stats.totalBudget) * 100).toFixed(2) + "%"
            : "0%",
        ],
        [
          "% Comprometido",
          stats.totalBudget > 0
            ? ((stats.totalCommitted / stats.totalBudget) * 100).toFixed(2) + "%"
            : "0%",
        ],
        [],
        ["ÓRDENES DE COMPRA"],
        ["Total POs", stats.totalPOs.toString()],
        ["Importe Total Comprometido", stats.totalCommitted.toFixed(2) + " €"],
        [],
        ["FACTURAS"],
        ["Total Facturas", stats.totalInvoices.toString()],
        ["Importe Total Pagado", stats.totalActual.toFixed(2) + " €"],
        [],
        ["PROVEEDORES"],
        ["Total Proveedores", stats.totalSuppliers.toString()],
      ];

      downloadCSV(rows, `Resumen_Ejecutivo_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando resumen ejecutivo:", error);
    } finally {
      setGenerating(null);
    }
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const BOM = "\uFEFF"; // UTF-8 BOM para que Excel abra correctamente los acentos
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCurrentDate = () => {
    return new Date().toISOString().split("T")[0];
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
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-purple-500 to-purple-700 p-3 rounded-xl shadow-lg">
                <BarChart3 size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                  Informes y reportes
                </h1>
                <p className="text-slate-600 text-sm mt-1">
                  Descarga informes financieros y de cost control
                </p>
              </div>
            </div>
          </header>

          {/* Resumen financiero */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-blue-700 font-medium">Presupuestado</p>
                <DollarSign size={20} className="text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-900">
                {stats.totalBudget.toLocaleString()} €
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-amber-700 font-medium">Comprometido</p>
                <Clock size={20} className="text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-900">
                {stats.totalCommitted.toLocaleString()} €
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {stats.totalBudget > 0
                  ? `${((stats.totalCommitted / stats.totalBudget) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-emerald-700 font-medium">Realizado</p>
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-900">
                {stats.totalActual.toLocaleString()} €
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                {stats.totalBudget > 0
                  ? `${((stats.totalActual / stats.totalBudget) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-purple-700 font-medium">Disponible</p>
                <TrendingUp size={20} className="text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-900">
                {stats.totalAvailable.toLocaleString()} €
              </p>
              <p className="text-xs text-purple-700 mt-1">
                {stats.totalBudget > 0
                  ? `${((stats.totalAvailable / stats.totalBudget) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>
          </div>

          {/* Informes disponibles */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Informe de Presupuesto */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-blue-400 hover:shadow-xl transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 text-blue-700 p-4 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <DollarSign size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Informe de presupuesto
                  </h3>
                  <p className="text-sm text-slate-600">
                    Detalle completo de cuentas
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Incluye todas las cuentas y subcuentas con presupuestado, comprometido,
                realizado y disponible.
              </p>
              <button
                onClick={generateBudgetReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {generating === "budget" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Descargar Excel
                  </>
                )}
              </button>
            </div>

            {/* Informe de POs */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-xl transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-indigo-100 text-indigo-700 p-4 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <FileText size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Informe de órdenes de compra
                  </h3>
                  <p className="text-sm text-slate-600">{stats.totalPOs} POs registradas</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Detalle de todas las POs con importes comprometidos y estado de
                aprobación.
              </p>
              <button
                onClick={generatePOsReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {generating === "pos" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Descargar Excel
                  </>
                )}
              </button>
            </div>

            {/* Informe de Facturas */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-emerald-400 hover:shadow-xl transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-emerald-100 text-emerald-700 p-4 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  <Receipt size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Informe de facturas
                  </h3>
                  <p className="text-sm text-slate-600">
                    {stats.totalInvoices} facturas registradas
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Listado completo de facturas con importes, vencimientos y estado de
                pago.
              </p>
              <button
                onClick={generateInvoicesReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {generating === "invoices" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Descargar Excel
                  </>
                )}
              </button>
            </div>

            {/* Informe de Proveedores */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-purple-400 hover:shadow-xl transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-purple-100 text-purple-700 p-4 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-all">
                  <Building2 size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Informe de proveedores
                  </h3>
                  <p className="text-sm text-slate-600">
                    {stats.totalSuppliers} proveedores registrados
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Base de datos completa de proveedores con información fiscal y estado
                de certificados.
              </p>
              <button
                onClick={generateSuppliersReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {generating === "suppliers" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Descargar Excel
                  </>
                )}
              </button>
            </div>

            {/* Informe Cost Control */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-amber-400 hover:shadow-xl transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-amber-100 text-amber-700 p-4 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all">
                  <TrendingUp size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Cost control</h3>
                  <p className="text-sm text-slate-600">Análisis completo</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Informe detallado con presupuesto vs. comprometido vs. realizado por
                cuenta con alertas.
              </p>
              <button
                onClick={generateCostControlReport}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {generating === "cost-control" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Descargar Excel
                  </>
                )}
              </button>
            </div>

            {/* Resumen Ejecutivo */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-slate-400 hover:shadow-xl transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-slate-100 text-slate-700 p-4 rounded-xl group-hover:bg-slate-800 group-hover:text-white transition-all">
                  <FileSpreadsheet size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Resumen ejecutivo
                  </h3>
                  <p className="text-sm text-slate-600">Vista global del proyecto</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Resumen condensado con las métricas clave del proyecto para presentaciones.
              </p>
              <button
                onClick={generateExecutiveSummary}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {generating === "executive" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Descargar Excel
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Nota informativa */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex gap-3">
              <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900 mb-2">
                  Información sobre los informes
                </h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Los informes se generan en formato CSV (compatible con Excel)</li>
                  <li>• Todos los importes se muestran en euros (€)</li>
                  <li>• Los datos son en tiempo real del estado actual del proyecto</li>
                  <li>
                    • El informe de Cost Control incluye alertas automáticas cuando el
                    disponible es menor al 10%
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

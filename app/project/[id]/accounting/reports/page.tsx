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
  ArrowLeft,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function ReportsPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pos: 0, invoices: 0, suppliers: 0, accounts: 0 });

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

      const [posSnap, invoicesSnap, suppliersSnap, accountsSnap] = await Promise.all([
        getDocs(collection(db, `projects/${id}/pos`)),
        getDocs(collection(db, `projects/${id}/invoices`)),
        getDocs(collection(db, `projects/${id}/suppliers`)),
        getDocs(collection(db, `projects/${id}/accounts`)),
      ]);

      setCounts({
        pos: posSnap.size,
        invoices: invoicesSnap.size,
        suppliers: suppliersSnap.size,
        accounts: accountsSnap.size,
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

      const rows = [["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO", "COMPROMETIDO", "REALIZADO", "DISPONIBLE"]];

      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));

        let accountBudgeted = 0;
        let accountCommitted = 0;
        let accountActual = 0;

        const subRows: string[][] = [];
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const subData = subDoc.data();
          const budgeted = subData.budgeted || 0;
          const committed = subData.committed || 0;
          const actual = subData.actual || 0;
          const available = budgeted - committed - actual;

          accountBudgeted += budgeted;
          accountCommitted += committed;
          accountActual += actual;

          subRows.push([subData.code, subData.description, "SUBCUENTA", budgeted.toString(), committed.toString(), actual.toString(), available.toString()]);
        });

        const accountAvailable = accountBudgeted - accountCommitted - accountActual;
        rows.push([accountData.code, accountData.description, "CUENTA", accountBudgeted.toString(), accountCommitted.toString(), accountActual.toString(), accountAvailable.toString()]);
        rows.push(...subRows);
      }

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

      const rows = [["NÚMERO", "PROVEEDOR", "DESCRIPCIÓN", "IMPORTE", "ESTADO", "FECHA"]];

      posSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleDateString("es-ES") : "";
        rows.push([
          data.number || "",
          data.supplier || "",
          data.description || "",
          (data.totalAmount || data.amount || 0).toString(),
          data.status || "",
          createdAt
        ]);
      });

      downloadCSV(rows, `POs_${projectName}_${getCurrentDate()}.csv`);
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

      const rows = [["NÚMERO", "PROVEEDOR", "DESCRIPCIÓN", "IMPORTE", "ESTADO", "VENCIMIENTO"]];

      invoicesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const dueDate = data.dueDate?.toDate ? new Date(data.dueDate.toDate()).toLocaleDateString("es-ES") : "";
        rows.push([
          data.number || "",
          data.supplier || "",
          data.description || "",
          (data.totalAmount || data.amount || 0).toString(),
          data.status || "",
          dueDate
        ]);
      });

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

      const rows = [["NOMBRE FISCAL", "NOMBRE COMERCIAL", "NIF/CIF", "CONTACTO", "EMAIL", "TELÉFONO", "MÉTODO PAGO", "IBAN"]];

      suppliersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        rows.push([
          data.fiscalName || "",
          data.commercialName || "",
          data.taxId || "",
          data.contact?.name || "",
          data.contact?.email || "",
          data.contact?.phone || "",
          data.paymentMethod || "",
          data.bankAccount || ""
        ]);
      });

      downloadCSV(rows, `Proveedores_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) {
      console.error("Error generando informe:", error);
    } finally {
      setGenerating(null);
    }
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map((row) => row.map(cell => `"${cell}"`).join(",")).join("\n");
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
    { id: "budget", title: "Presupuesto", count: `${counts.accounts} cuentas`, action: generateBudgetReport },
    { id: "pos", title: "Órdenes de compra", count: `${counts.pos} registros`, action: generatePOsReport },
    { id: "invoices", title: "Facturas", count: `${counts.invoices} registros`, action: generateInvoicesReport },
    { id: "suppliers", title: "Proveedores", count: `${counts.suppliers} registros`, action: generateSuppliersReport },
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
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          {/* Project context badge */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link
                href={`/project/${id}/accounting`}
                className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft size={12} />
                Panel
              </Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">
                {projectName}
              </span>
            </div>
          </div>
      
          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <BarChart3 size={24} className="text-indigo-600" />
              </div>
      
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Informes
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Informe</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Registros</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => {
                const isGenerating = generating === report.id;
                return (
                  <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{report.title}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500">{report.count}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={report.action}
                        disabled={generating !== null}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            CSV
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}


"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import { BarChart3, Download, ArrowLeft, FileText, Receipt, Building2, Wallet } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function ReportsPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pos: 0, invoices: 0, suppliers: 0, accounts: 0 });

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");
      const [posSnap, invoicesSnap, suppliersSnap, accountsSnap] = await Promise.all([
        getDocs(collection(db, `projects/${id}/pos`)),
        getDocs(collection(db, `projects/${id}/invoices`)),
        getDocs(collection(db, `projects/${id}/suppliers`)),
        getDocs(collection(db, `projects/${id}/accounts`)),
      ]);
      setCounts({ pos: posSnap.size, invoices: invoicesSnap.size, suppliers: suppliersSnap.size, accounts: accountsSnap.size });
    } catch (error) { console.error("Error cargando datos:", error); } finally { setLoading(false); }
  };

  const generateBudgetReport = async () => {
    setGenerating("budget");
    try {
      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const rows = [["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO", "COMPROMETIDO", "REALIZADO", "DISPONIBLE"]];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));
        let accountBudgeted = 0, accountCommitted = 0, accountActual = 0;
        const subRows: string[][] = [];
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const subData = subDoc.data();
          const budgeted = subData.budgeted || 0, committed = subData.committed || 0, actual = subData.actual || 0;
          accountBudgeted += budgeted; accountCommitted += committed; accountActual += actual;
          subRows.push([subData.code, subData.description, "SUBCUENTA", budgeted.toString(), committed.toString(), actual.toString(), (budgeted - committed - actual).toString()]);
        });
        rows.push([accountData.code, accountData.description, "CUENTA", accountBudgeted.toString(), accountCommitted.toString(), accountActual.toString(), (accountBudgeted - accountCommitted - accountActual).toString()]);
        rows.push(...subRows);
      }
      downloadCSV(rows, `Presupuesto_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error generando informe:", error); } finally { setGenerating(null); }
  };

  const generatePOsReport = async () => {
    setGenerating("pos");
    try {
      const posSnapshot = await getDocs(query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc")));
      const rows = [["NÚMERO", "PROVEEDOR", "DESCRIPCIÓN", "IMPORTE", "ESTADO", "FECHA"]];
      posSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        rows.push([data.number || "", data.supplier || "", data.description || "", (data.totalAmount || 0).toString(), data.status || "", data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleDateString("es-ES") : ""]);
      });
      downloadCSV(rows, `POs_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error generando informe:", error); } finally { setGenerating(null); }
  };

  const generateInvoicesReport = async () => {
    setGenerating("invoices");
    try {
      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc")));
      const rows = [["NÚMERO", "PROVEEDOR", "DESCRIPCIÓN", "IMPORTE", "ESTADO", "VENCIMIENTO"]];
      invoicesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        rows.push([data.number || "", data.supplier || "", data.description || "", (data.totalAmount || 0).toString(), data.status || "", data.dueDate?.toDate ? new Date(data.dueDate.toDate()).toLocaleDateString("es-ES") : ""]);
      });
      downloadCSV(rows, `Facturas_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error generando informe:", error); } finally { setGenerating(null); }
  };

  const generateSuppliersReport = async () => {
    setGenerating("suppliers");
    try {
      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      const rows = [["NOMBRE FISCAL", "NOMBRE COMERCIAL", "NIF/CIF", "CONTACTO", "EMAIL", "TELÉFONO", "MÉTODO PAGO", "IBAN"]];
      suppliersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        rows.push([data.fiscalName || "", data.commercialName || "", data.taxId || "", data.contact?.name || "", data.contact?.email || "", data.contact?.phone || "", data.paymentMethod || "", data.bankAccount || ""]);
      });
      downloadCSV(rows, `Proveedores_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error generando informe:", error); } finally { setGenerating(null); }
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map((row) => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCurrentDate = () => new Date().toISOString().split("T")[0];

  const reports = [
    { id: "budget", title: "Presupuesto", description: "Cuentas, subcuentas y ejecución", count: counts.accounts, icon: Wallet, color: "bg-indigo-100 text-indigo-600", action: generateBudgetReport },
    { id: "pos", title: "Órdenes de compra", description: "Listado completo de POs", count: counts.pos, icon: FileText, color: "bg-blue-100 text-blue-600", action: generatePOsReport },
    { id: "invoices", title: "Facturas", description: "Listado de facturas recibidas", count: counts.invoices, icon: Receipt, color: "bg-emerald-100 text-emerald-600", action: generateInvoicesReport },
    { id: "suppliers", title: "Proveedores", description: "Directorio de proveedores", count: counts.suppliers, icon: Building2, color: "bg-purple-100 text-purple-600", action: generateSuppliersReport },
  ];

  if (loading) { return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>); }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting`} className="hover:text-slate-900 transition-colors">Panel</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <BarChart3 size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Informes</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((report) => {
            const isGenerating = generating === report.id;
            const Icon = report.icon;
            return (
              <div key={report.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${report.color}`}>
                    <Icon size={22} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{report.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{report.description}</p>
                    <p className="text-xs text-slate-400 mt-2">{report.count} registros</p>
                  </div>
                  <button
                    onClick={report.action}
                    disabled={generating !== null}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generando...</>
                    ) : (
                      <><Download size={14} />CSV</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

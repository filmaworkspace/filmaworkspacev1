"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import { BarChart3, Download, ArrowLeft, FileText, Receipt, Building2, Wallet, Settings2, ChevronDown, Check, X, Save, Trash2, BookMarked, Layers } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type ReportType = "budget" | "pos_list" | "pos_items" | "invoices" | "suppliers";

interface ReportColumn {
  id: string;
  label: string;
  enabled: boolean;
  locked?: boolean;
}

interface ReportPreset {
  id: string;
  name: string;
  reportType: ReportType;
  columns: string[];
  createdAt: string;
}

const REPORT_COLUMNS: Record<ReportType, ReportColumn[]> = {
  budget: [
    { id: "code", label: "Código", enabled: true, locked: true },
    { id: "description", label: "Descripción", enabled: true },
    { id: "type", label: "Tipo", enabled: true },
    { id: "budgeted", label: "Presupuestado", enabled: true },
    { id: "committed", label: "Comprometido", enabled: true },
    { id: "actual", label: "Realizado", enabled: true },
    { id: "available", label: "Disponible", enabled: true },
    { id: "percentUsed", label: "% Utilizado", enabled: false },
  ],
  pos_list: [
    { id: "number", label: "Nº PO", enabled: true, locked: true },
    { id: "supplier", label: "Proveedor", enabled: true },
    { id: "description", label: "Descripción", enabled: true },
    { id: "baseAmount", label: "Base imponible", enabled: true },
    { id: "taxAmount", label: "IVA", enabled: false },
    { id: "totalAmount", label: "Total", enabled: true },
    { id: "status", label: "Estado", enabled: true },
    { id: "isOpen", label: "Abierta/Cerrada", enabled: true },
    { id: "createdAt", label: "Fecha creación", enabled: true },
    { id: "createdBy", label: "Creado por", enabled: false },
    { id: "approvedAt", label: "Fecha aprobación", enabled: false },
    { id: "approvedBy", label: "Aprobado por", enabled: false },
    { id: "itemCount", label: "Nº ítems", enabled: false },
  ],
  pos_items: [
    { id: "poNumber", label: "Nº PO", enabled: true, locked: true },
    { id: "poDescription", label: "Descripción PO", enabled: true },
    { id: "supplier", label: "Proveedor", enabled: true },
    { id: "itemNumber", label: "Nº Ítem", enabled: true },
    { id: "itemDescription", label: "Descripción ítem", enabled: true },
    { id: "accountCode", label: "Código cuenta", enabled: true },
    { id: "accountDescription", label: "Cuenta", enabled: false },
    { id: "subaccountCode", label: "Código subcuenta", enabled: true },
    { id: "subaccountDescription", label: "Subcuenta", enabled: false },
    { id: "baseCommittedOriginal", label: "Base comprometido orig.", enabled: true },
    { id: "totalCommittedOriginal", label: "Total comprometido orig.", enabled: true },
    { id: "baseActual", label: "Base realizado", enabled: true },
    { id: "totalActual", label: "Total realizado", enabled: false },
    { id: "baseAvailable", label: "Base disponible", enabled: true },
    { id: "totalAvailable", label: "Total disponible", enabled: true },
    { id: "poStatus", label: "Estado PO", enabled: true },
    { id: "isOpen", label: "Abierta/Cerrada", enabled: true },
    { id: "taxRate", label: "% IVA", enabled: false },
    { id: "irpfRate", label: "% IRPF", enabled: false },
  ],
  invoices: [
    { id: "number", label: "Nº Factura", enabled: true, locked: true },
    { id: "supplier", label: "Proveedor", enabled: true },
    { id: "supplierTaxId", label: "NIF Proveedor", enabled: false },
    { id: "description", label: "Descripción", enabled: true },
    { id: "poNumber", label: "Nº PO asociada", enabled: true },
    { id: "baseAmount", label: "Base imponible", enabled: true },
    { id: "taxAmount", label: "IVA", enabled: false },
    { id: "irpfAmount", label: "IRPF", enabled: false },
    { id: "totalAmount", label: "Total", enabled: true },
    { id: "status", label: "Estado", enabled: true },
    { id: "dueDate", label: "Vencimiento", enabled: true },
    { id: "createdAt", label: "Fecha registro", enabled: true },
    { id: "paidAt", label: "Fecha pago", enabled: false },
    { id: "accountCode", label: "Cuenta", enabled: false },
  ],
  suppliers: [
    { id: "fiscalName", label: "Nombre fiscal", enabled: true, locked: true },
    { id: "commercialName", label: "Nombre comercial", enabled: true },
    { id: "taxId", label: "NIF/CIF", enabled: true },
    { id: "contactName", label: "Contacto", enabled: true },
    { id: "contactEmail", label: "Email", enabled: true },
    { id: "contactPhone", label: "Teléfono", enabled: true },
    { id: "address", label: "Dirección", enabled: false },
    { id: "city", label: "Ciudad", enabled: false },
    { id: "postalCode", label: "CP", enabled: false },
    { id: "paymentMethod", label: "Método pago", enabled: true },
    { id: "iban", label: "IBAN", enabled: true },
    { id: "paymentTerms", label: "Plazo pago", enabled: false },
    { id: "totalPOs", label: "Total POs", enabled: false },
    { id: "totalInvoiced", label: "Total facturado", enabled: false },
  ],
};

const REPORT_INFO: Record<ReportType, { title: string; description: string; icon: any; color: string }> = {
  budget: { title: "Presupuesto", description: "Cuentas, subcuentas y ejecución presupuestaria", icon: Wallet, color: "bg-indigo-100 text-indigo-600" },
  pos_list: { title: "Listado de POs", description: "Órdenes de compra con totales", icon: FileText, color: "bg-blue-100 text-blue-600" },
  pos_items: { title: "POs por ítems", description: "Desglose detallado de cada ítem de PO", icon: Layers, color: "bg-sky-100 text-sky-600" },
  invoices: { title: "Facturas", description: "Listado de facturas recibidas", icon: Receipt, color: "bg-emerald-100 text-emerald-600" },
  suppliers: { title: "Proveedores", description: "Directorio completo de proveedores", icon: Building2, color: "bg-purple-100 text-purple-600" },
};

export default function ReportsPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pos: 0, invoices: 0, suppliers: 0, accounts: 0 });
  
  const [showConfig, setShowConfig] = useState(false);
  const [configReportType, setConfigReportType] = useState<ReportType | null>(null);
  const [tempColumns, setTempColumns] = useState<ReportColumn[]>([]);
  
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [expandedReport, setExpandedReport] = useState<ReportType | null>(null);

  useEffect(() => {
    const savedPresets = localStorage.getItem(`report_presets_${id}`);
    if (savedPresets) setPresets(JSON.parse(savedPresets));
  }, [id]);

  const savePresetsToStorage = (newPresets: ReportPreset[]) => {
    localStorage.setItem(`report_presets_${id}`, JSON.stringify(newPresets));
    setPresets(newPresets);
  };

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
    } catch (error) { 
      console.error("Error cargando datos:", error); 
    } finally { 
      setLoading(false); 
    }
  };

  const openConfig = (reportType: ReportType) => {
    setConfigReportType(reportType);
    setTempColumns([...REPORT_COLUMNS[reportType]]);
    setShowConfig(true);
  };

  const toggleColumn = (columnId: string) => {
    setTempColumns(tempColumns.map(col => 
      col.id === columnId && !col.locked ? { ...col, enabled: !col.enabled } : col
    ));
  };

  const getEnabledColumns = (reportType: ReportType): string[] => {
    return REPORT_COLUMNS[reportType].filter(col => col.enabled).map(col => col.id);
  };

  const savePreset = () => {
    if (!newPresetName.trim() || !configReportType) return;
    const newPreset: ReportPreset = {
      id: `preset_${Date.now()}`,
      name: newPresetName.trim(),
      reportType: configReportType,
      columns: tempColumns.filter(col => col.enabled).map(col => col.id),
      createdAt: new Date().toISOString(),
    };
    savePresetsToStorage([...presets, newPreset]);
    setNewPresetName("");
    setShowSavePreset(false);
  };

  const deletePreset = (presetId: string) => {
    savePresetsToStorage(presets.filter(p => p.id !== presetId));
  };

  const loadPreset = (preset: ReportPreset) => {
    setTempColumns(REPORT_COLUMNS[preset.reportType].map(col => ({
      ...col,
      enabled: preset.columns.includes(col.id)
    })));
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  const formatDate = (date: any) => date?.toDate ? new Date(date.toDate()).toLocaleDateString("es-ES") : "";
  const getCurrentDate = () => new Date().toISOString().split("T")[0];

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map(row => row.map(cell => `"${(cell || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateBudgetReport = async (columns: string[]) => {
    setGenerating("budget");
    try {
      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const columnDefs = REPORT_COLUMNS.budget.filter(col => columns.includes(col.id));
      const rows: string[][] = [columnDefs.map(col => col.label)];
      
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));
        
        let accountBudgeted = 0, accountCommitted = 0, accountActual = 0;
        const subRows: any[] = [];
        
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const subData = subDoc.data();
          const budgeted = subData.budgeted || 0, committed = subData.committed || 0, actual = subData.actual || 0;
          accountBudgeted += budgeted; accountCommitted += committed; accountActual += actual;
          const available = budgeted - committed - actual;
          const percentUsed = budgeted > 0 ? ((committed + actual) / budgeted * 100).toFixed(1) : "0";
          
          subRows.push({
            code: subData.code, description: subData.description, type: "SUBCUENTA",
            budgeted, committed, actual, available, percentUsed: `${percentUsed}%`
          });
        });
        
        const accountAvailable = accountBudgeted - accountCommitted - accountActual;
        const accountPercentUsed = accountBudgeted > 0 ? ((accountCommitted + accountActual) / accountBudgeted * 100).toFixed(1) : "0";
        
        const accountRow: any = {
          code: accountData.code, description: accountData.description, type: "CUENTA",
          budgeted: accountBudgeted, committed: accountCommitted, actual: accountActual,
          available: accountAvailable, percentUsed: `${accountPercentUsed}%`
        };
        
        rows.push(columnDefs.map(col => {
          const val = accountRow[col.id];
          return typeof val === "number" ? formatCurrency(val) : val;
        }));
        
        subRows.forEach(subRow => {
          rows.push(columnDefs.map(col => {
            const val = subRow[col.id];
            return typeof val === "number" ? formatCurrency(val) : val;
          }));
        });
      }
      
      downloadCSV(rows, `Presupuesto_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error:", error); } finally { setGenerating(null); }
  };

  const generatePOsListReport = async (columns: string[]) => {
    setGenerating("pos_list");
    try {
      const posSnapshot = await getDocs(query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc")));
      const columnDefs = REPORT_COLUMNS.pos_list.filter(col => columns.includes(col.id));
      const rows: string[][] = [columnDefs.map(col => col.label)];
      
      for (const docSnap of posSnapshot.docs) {
        const data = docSnap.data();
        const items = data.items || [];
        
        const rowData: any = {
          number: data.number || data.displayNumber || "",
          supplier: data.supplier || "",
          description: data.description || "",
          baseAmount: data.baseAmount || 0,
          taxAmount: data.taxAmount || 0,
          totalAmount: data.totalAmount || 0,
          status: data.status || "",
          isOpen: data.isOpen !== false ? "Abierta" : "Cerrada",
          createdAt: formatDate(data.createdAt),
          createdBy: data.createdByName || "",
          approvedAt: formatDate(data.approvedAt),
          approvedBy: data.approvedByName || "",
          itemCount: items.length,
        };
        
        rows.push(columnDefs.map(col => {
          const val = rowData[col.id];
          return typeof val === "number" ? formatCurrency(val) : val?.toString() || "";
        }));
      }
      
      downloadCSV(rows, `POs_Listado_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error:", error); } finally { setGenerating(null); }
  };

  const generatePOsItemsReport = async (columns: string[]) => {
    setGenerating("pos_items");
    try {
      const posSnapshot = await getDocs(query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc")));
      const columnDefs = REPORT_COLUMNS.pos_items.filter(col => columns.includes(col.id));
      const rows: string[][] = [columnDefs.map(col => col.label)];
      
      for (const docSnap of posSnapshot.docs) {
        const poData = docSnap.data();
        const items = poData.items || [];
        
        items.forEach((item: any, index: number) => {
          const baseCommitted = item.amount || 0;
          const taxRate = item.taxRate || 21;
          const irpfRate = item.irpfRate || 0;
          const taxAmount = baseCommitted * (taxRate / 100);
          const irpfAmount = baseCommitted * (irpfRate / 100);
          const totalCommitted = baseCommitted + taxAmount - irpfAmount;
          
          const baseActual = item.actualAmount || 0;
          const totalActual = baseActual + (baseActual * taxRate / 100) - (baseActual * irpfRate / 100);
          
          const baseAvailable = baseCommitted - baseActual;
          const totalAvailable = totalCommitted - totalActual;
          
          const rowData: any = {
            poNumber: poData.number || poData.displayNumber || "",
            poDescription: poData.description || "",
            supplier: poData.supplier || "",
            itemNumber: index + 1,
            itemDescription: item.description || "",
            accountCode: item.accountCode || "",
            accountDescription: item.accountDescription || "",
            subaccountCode: item.subaccountCode || "",
            subaccountDescription: item.subaccountDescription || "",
            baseCommittedOriginal: baseCommitted,
            totalCommittedOriginal: totalCommitted,
            baseActual: baseActual,
            totalActual: totalActual,
            baseAvailable: baseAvailable,
            totalAvailable: totalAvailable,
            poStatus: poData.status || "",
            isOpen: poData.isOpen !== false ? "Abierta" : "Cerrada",
            taxRate: `${taxRate}%`,
            irpfRate: `${irpfRate}%`,
          };
          
          rows.push(columnDefs.map(col => {
            const val = rowData[col.id];
            if (typeof val === "number") return formatCurrency(val);
            return val?.toString() || "";
          }));
        });
      }
      
      downloadCSV(rows, `POs_Items_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error:", error); } finally { setGenerating(null); }
  };

  const generateInvoicesReport = async (columns: string[]) => {
    setGenerating("invoices");
    try {
      const invoicesSnapshot = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("createdAt", "desc")));
      const columnDefs = REPORT_COLUMNS.invoices.filter(col => columns.includes(col.id));
      const rows: string[][] = [columnDefs.map(col => col.label)];
      
      invoicesSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        
        const rowData: any = {
          number: data.number || data.displayNumber || "",
          supplier: data.supplier || "",
          supplierTaxId: data.supplierTaxId || "",
          description: data.description || "",
          poNumber: data.poNumber || "",
          baseAmount: data.baseAmount || 0,
          taxAmount: data.taxAmount || 0,
          irpfAmount: data.irpfAmount || 0,
          totalAmount: data.totalAmount || 0,
          status: data.status || "",
          dueDate: formatDate(data.dueDate),
          createdAt: formatDate(data.createdAt),
          paidAt: formatDate(data.paidAt),
          accountCode: data.accountCode || "",
        };
        
        rows.push(columnDefs.map(col => {
          const val = rowData[col.id];
          return typeof val === "number" ? formatCurrency(val) : val?.toString() || "";
        }));
      });
      
      downloadCSV(rows, `Facturas_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error:", error); } finally { setGenerating(null); }
  };

  const generateSuppliersReport = async (columns: string[]) => {
    setGenerating("suppliers");
    try {
      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      const columnDefs = REPORT_COLUMNS.suppliers.filter(col => columns.includes(col.id));
      const rows: string[][] = [columnDefs.map(col => col.label)];
      
      suppliersSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        
        const rowData: any = {
          fiscalName: data.fiscalName || "",
          commercialName: data.commercialName || "",
          taxId: data.taxId || "",
          contactName: data.contact?.name || "",
          contactEmail: data.contact?.email || "",
          contactPhone: data.contact?.phone || "",
          address: data.address || "",
          city: data.city || "",
          postalCode: data.postalCode || "",
          paymentMethod: data.paymentMethod || "",
          iban: data.bankAccount || data.iban || "",
          paymentTerms: data.paymentTerms || "",
          totalPOs: data.totalPOs || 0,
          totalInvoiced: data.totalInvoiced || 0,
        };
        
        rows.push(columnDefs.map(col => {
          const val = rowData[col.id];
          return typeof val === "number" ? formatCurrency(val) : val?.toString() || "";
        }));
      });
      
      downloadCSV(rows, `Proveedores_${projectName}_${getCurrentDate()}.csv`);
    } catch (error) { console.error("Error:", error); } finally { setGenerating(null); }
  };

  const generateReport = (reportType: ReportType, columns?: string[]) => {
    const cols = columns || getEnabledColumns(reportType);
    switch (reportType) {
      case "budget": return generateBudgetReport(cols);
      case "pos_list": return generatePOsListReport(cols);
      case "pos_items": return generatePOsItemsReport(cols);
      case "invoices": return generateInvoicesReport(cols);
      case "suppliers": return generateSuppliersReport(cols);
    }
  };

  const getReportCount = (reportType: ReportType) => {
    switch (reportType) {
      case "budget": return counts.accounts;
      case "pos_list": 
      case "pos_items": return counts.pos;
      case "invoices": return counts.invoices;
      case "suppliers": return counts.suppliers;
    }
  };

  const reportTypes: ReportType[] = ["budget", "pos_list", "pos_items", "invoices", "suppliers"];

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
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                <ArrowLeft size={12} />Proyectos
              </Link>
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
        <div className="space-y-4">
          {reportTypes.map((reportType) => {
            const info = REPORT_INFO[reportType];
            const Icon = info.icon;
            const isExpanded = expandedReport === reportType;
            const reportPresets = presets.filter(p => p.reportType === reportType);
            const count = getReportCount(reportType);
            
            return (
              <div key={reportType} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-all">
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${info.color}`}>
                      <Icon size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900">{info.title}</h3>
                      <p className="text-sm text-slate-500">{info.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{count} registros</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openConfig(reportType)}
                        className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        title="Configurar columnas"
                      >
                        <Settings2 size={18} />
                      </button>
                      <button
                        onClick={() => generateReport(reportType)}
                        disabled={generating !== null}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {generating === reportType ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            Exportar CSV
                          </>
                        )}
                      </button>
                      {reportPresets.length > 0 && (
                        <button
                          onClick={() => setExpandedReport(isExpanded ? null : reportType)}
                          className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                          <ChevronDown size={18} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && reportPresets.length > 0 && (
                  <div className="px-5 pb-5 pt-0">
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-xs font-medium text-slate-500 mb-3 flex items-center gap-1.5">
                        <BookMarked size={12} />
                        Plantillas guardadas
                      </p>
                      <div className="space-y-2">
                        {reportPresets.map((preset) => (
                          <div key={preset.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl group">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-700">{preset.name}</p>
                              <p className="text-xs text-slate-400">{preset.columns.length} columnas</p>
                            </div>
                            <button
                              onClick={() => generateReport(reportType, preset.columns)}
                              disabled={generating !== null}
                              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                              <Download size={12} className="inline mr-1" />
                              Usar
                            </button>
                            <button
                              onClick={() => deletePreset(preset.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Modal de configuración */}
      {showConfig && configReportType && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowConfig(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Configurar columnas</h3>
                <p className="text-sm text-slate-500">{REPORT_INFO[configReportType].title}</p>
              </div>
              <button onClick={() => setShowConfig(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {presets.filter(p => p.reportType === configReportType).length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-medium text-slate-500 mb-2">Cargar plantilla</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.filter(p => p.reportType === configReportType).map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => loadPreset(preset)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {tempColumns.map((column) => (
                  <div
                    key={column.id}
                    onClick={() => !column.locked && toggleColumn(column.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                      column.enabled 
                        ? "bg-slate-900 text-white" 
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    } ${column.locked ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                      column.enabled ? "bg-white/20" : "bg-slate-200"
                    }`}>
                      {column.enabled && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium flex-1">{column.label}</span>
                    {column.locked && <span className="text-xs opacity-60">Requerido</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              {!showSavePreset ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSavePreset(true)}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <Save size={14} />
                    Guardar plantilla
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowConfig(false)}
                    className="px-4 py-2.5 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      generateReport(configReportType, tempColumns.filter(c => c.enabled).map(c => c.id));
                      setShowConfig(false);
                    }}
                    disabled={generating !== null}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Download size={14} />
                    Exportar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Nombre de la plantilla..."
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && savePreset()}
                  />
                  <button
                    onClick={() => { setShowSavePreset(false); setNewPresetName(""); }}
                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <X size={18} />
                  </button>
                  <button
                    onClick={savePreset}
                    disabled={!newPresetName.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Check size={14} />
                    Guardar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


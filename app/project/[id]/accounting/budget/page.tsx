"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  DollarSign,
  Plus,
  ChevronDown,
  ChevronRight,
  Edit,
  Trash2,
  X,
  Search,
  Download,
  Upload,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Filter,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface SubAccount {
  id: string;
  code: string;
  description: string;
  budgeted: number;
  committed: number;
  actual: number;
  accountId: string;
  createdAt: Date;
}

interface Account {
  id: string;
  code: string;
  description: string;
  subAccounts: SubAccount[];
  createdAt: Date;
}

interface BudgetSummary {
  totalBudgeted: number;
  totalCommitted: number;
  totalActual: number;
  totalAvailable: number;
}

export default function BudgetPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"account" | "subaccount">("account");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedSubAccount, setSelectedSubAccount] = useState<SubAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    description: "",
    budgeted: 0,
  });

  const [summary, setSummary] = useState<BudgetSummary>({
    totalBudgeted: 0,
    totalCommitted: 0,
    totalActual: 0,
    totalAvailable: 0,
  });

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    calculateSummary();
  }, [accounts]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Cargar cuentas
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );

      const accountsData = await Promise.all(
        accountsSnapshot.docs.map(async (accountDoc) => {
          // Cargar subcuentas para cada cuenta
          const subAccountsSnapshot = await getDocs(
            query(
              collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`),
              orderBy("code", "asc")
            )
          );

          const subAccounts = subAccountsSnapshot.docs.map((subDoc) => ({
            id: subDoc.id,
            ...subDoc.data(),
            createdAt: subDoc.data().createdAt?.toDate(),
          })) as SubAccount[];

          return {
            id: accountDoc.id,
            ...accountDoc.data(),
            subAccounts,
            createdAt: accountDoc.data().createdAt?.toDate(),
          } as Account;
        })
      );

      setAccounts(accountsData);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = () => {
    let totalBudgeted = 0;
    let totalCommitted = 0;
    let totalActual = 0;

    accounts.forEach((account) => {
      account.subAccounts.forEach((sub) => {
        totalBudgeted += sub.budgeted;
        totalCommitted += sub.committed;
        totalActual += sub.actual;
      });
    });

    setSummary({
      totalBudgeted,
      totalCommitted,
      totalActual,
      totalAvailable: totalBudgeted - totalCommitted - totalActual,
    });
  };

  const getAccountTotals = (account: Account) => {
    const budgeted = account.subAccounts.reduce((sum, sub) => sum + sub.budgeted, 0);
    const committed = account.subAccounts.reduce((sum, sub) => sum + sub.committed, 0);
    const actual = account.subAccounts.reduce((sum, sub) => sum + sub.actual, 0);
    const available = budgeted - committed - actual;

    return { budgeted, committed, actual, available };
  };

  const toggleAccount = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  const handleCreateAccount = async () => {
    try {
      await addDoc(collection(db, `projects/${id}/accounts`), {
        code: formData.code.padStart(2, "0"),
        description: formData.description,
        createdAt: Timestamp.now(),
        createdBy: auth.currentUser?.uid || "",
      });

      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error creando cuenta:", error);
    }
  };

  const handleCreateSubAccount = async () => {
    if (!selectedAccount) return;

    try {
      await addDoc(
        collection(db, `projects/${id}/accounts/${selectedAccount.id}/subaccounts`),
        {
          code: formData.code,
          description: formData.description,
          budgeted: formData.budgeted,
          committed: 0,
          actual: 0,
          accountId: selectedAccount.id,
          createdAt: Timestamp.now(),
          createdBy: auth.currentUser?.uid || "",
        }
      );

      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error creando subcuenta:", error);
    }
  };

  const handleUpdateSubAccount = async () => {
    if (!selectedAccount || !selectedSubAccount) return;

    try {
      await updateDoc(
        doc(
          db,
          `projects/${id}/accounts/${selectedAccount.id}/subaccounts`,
          selectedSubAccount.id
        ),
        {
          description: formData.description,
          budgeted: formData.budgeted,
        }
      );

      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error actualizando subcuenta:", error);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (account && account.subAccounts.length > 0) {
      alert("No se puede eliminar una cuenta con subcuentas. Elimina primero las subcuentas.");
      return;
    }

    if (confirm("¿Estás seguro de que quieres eliminar esta cuenta?")) {
      try {
        await deleteDoc(doc(db, `projects/${id}/accounts`, accountId));
        loadData();
      } catch (error) {
        console.error("Error eliminando cuenta:", error);
      }
    }
  };

  const handleDeleteSubAccount = async (accountId: string, subAccountId: string) => {
    if (confirm("¿Estás seguro de que quieres eliminar esta subcuenta?")) {
      try {
        await deleteDoc(
          doc(db, `projects/${id}/accounts/${accountId}/subaccounts`, subAccountId)
        );
        loadData();
      } catch (error) {
        console.error("Error eliminando subcuenta:", error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      description: "",
      budgeted: 0,
    });
    setSelectedAccount(null);
    setSelectedSubAccount(null);
  };

  const openCreateAccountModal = () => {
    resetForm();
    setModalMode("account");
    setShowModal(true);
  };

  const openCreateSubAccountModal = (account: Account) => {
    resetForm();
    setSelectedAccount(account);
    
    // Generar siguiente código de subcuenta
    const subCount = account.subAccounts.length;
    const nextCode = `${account.code}-${String(subCount + 1).padStart(2, "0")}-01`;
    setFormData({ ...formData, code: nextCode });
    
    setModalMode("subaccount");
    setShowModal(true);
  };

  const openEditSubAccountModal = (account: Account, subAccount: SubAccount) => {
    setSelectedAccount(account);
    setSelectedSubAccount(subAccount);
    setFormData({
      code: subAccount.code,
      description: subAccount.description,
      budgeted: subAccount.budgeted,
    });
    setModalMode("subaccount");
    setShowModal(true);
  };

  const downloadTemplate = () => {
    const template = [
      ["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO"],
      ["01", "GUION Y MÚSICA", "CUENTA", ""],
      ["01-01-01", "Derechos de autor", "SUBCUENTA", "5000"],
      ["01-01-02", "Revisiones de guion", "SUBCUENTA", "2000"],
      ["02", "PREPRODUCCIÓN", "CUENTA", ""],
      ["02-01-01", "Casting", "SUBCUENTA", "3000"],
      ["", "", "", ""],
      ["INSTRUCCIONES:", "", "", ""],
      ["- Las CUENTAS solo necesitan CÓDIGO y DESCRIPCIÓN", "", "", ""],
      ["- Las SUBCUENTAS deben tener un código derivado de su cuenta padre", "", "", ""],
      ["- El PRESUPUESTADO solo se aplica a las SUBCUENTAS", "", "", ""],
      ["- Formato de código de cuenta: 01, 02, 03...", "", "", ""],
      ["- Formato de código de subcuenta: 01-01-01, 01-01-02...", "", "", ""],
    ];

    const csvContent = template.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_presupuesto.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").slice(1); // Skip header

      try {
        const accountsMap = new Map<string, string>();

        for (const line of lines) {
          const [code, description, type, budgeted] = line.split(",").map((s) => s.trim());
          
          if (!code || !description || !type) continue;
          if (type.toUpperCase() === "INSTRUCCIONES:") break;

          if (type.toUpperCase() === "CUENTA") {
            // Crear cuenta
            const accountRef = await addDoc(collection(db, `projects/${id}/accounts`), {
              code: code.padStart(2, "0"),
              description,
              createdAt: Timestamp.now(),
              createdBy: auth.currentUser?.uid || "",
            });
            accountsMap.set(code, accountRef.id);
          } else if (type.toUpperCase() === "SUBCUENTA") {
            // Encontrar cuenta padre
            const accountCode = code.split("-")[0];
            const accountId = accountsMap.get(accountCode);
            
            if (accountId) {
              await addDoc(
                collection(db, `projects/${id}/accounts/${accountId}/subaccounts`),
                {
                  code,
                  description,
                  budgeted: parseFloat(budgeted) || 0,
                  committed: 0,
                  actual: 0,
                  accountId,
                  createdAt: Timestamp.now(),
                  createdBy: auth.currentUser?.uid || "",
                }
              );
            }
          }
        }

        setShowImportModal(false);
        loadData();
        alert("Presupuesto importado correctamente");
      } catch (error) {
        console.error("Error importando presupuesto:", error);
        alert("Error al importar el presupuesto. Verifica el formato del archivo.");
      }
    };
    reader.readAsText(file);
  };

  const exportBudget = () => {
    const rows = [["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO", "COMPROMETIDO", "REALIZADO", "DISPONIBLE"]];

    accounts.forEach((account) => {
      const totals = getAccountTotals(account);
      rows.push([
        account.code,
        account.description,
        "CUENTA",
        totals.budgeted.toString(),
        totals.committed.toString(),
        totals.actual.toString(),
        totals.available.toString(),
      ]);

      account.subAccounts.forEach((sub) => {
        const available = sub.budgeted - sub.committed - sub.actual;
        rows.push([
          sub.code,
          sub.description,
          "SUBCUENTA",
          sub.budgeted.toString(),
          sub.committed.toString(),
          sub.actual.toString(),
          available.toString(),
        ]);
      });
    });

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `presupuesto_${projectName}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAccounts = accounts.filter((account) => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const accountMatch = 
      account.code.toLowerCase().includes(searchLower) ||
      account.description.toLowerCase().includes(searchLower);
    
    const subAccountMatch = account.subAccounts.some(
      (sub) =>
        sub.code.toLowerCase().includes(searchLower) ||
        sub.description.toLowerCase().includes(searchLower)
    );

    return accountMatch || subAccountMatch;
  });

  const expandAll = () => {
    setExpandedAccounts(new Set(accounts.map((a) => a.id)));
  };

  const collapseAll = () => {
    setExpandedAccounts(new Set());
  };

  const getAvailableColor = (available: number, budgeted: number) => {
    if (budgeted === 0) return "text-slate-600";
    const percentage = (available / budgeted) * 100;
    if (percentage < 10) return "text-red-600 font-bold";
    if (percentage < 25) return "text-amber-600 font-semibold";
    return "text-emerald-600";
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-3 rounded-xl shadow-lg">
                  <DollarSign size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Presupuesto
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Gestión de cuentas y control financiero
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl"
                >
                  <Upload size={20} />
                  Importar
                </button>
                <button
                  onClick={openCreateAccountModal}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <Plus size={20} />
                  Nueva cuenta
                </button>
              </div>
            </div>
          </header>

          {/* Resumen financiero */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-blue-700 font-medium">Presupuestado</p>
                <DollarSign size={20} className="text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-900">
                {summary.totalBudgeted.toLocaleString()} €
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-amber-700 font-medium">Comprometido</p>
                <AlertCircle size={20} className="text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-900">
                {summary.totalCommitted.toLocaleString()} €
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {summary.totalBudgeted > 0
                  ? `${((summary.totalCommitted / summary.totalBudgeted) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-emerald-700 font-medium">Realizado</p>
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-900">
                {summary.totalActual.toLocaleString()} €
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                {summary.totalBudgeted > 0
                  ? `${((summary.totalActual / summary.totalBudgeted) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-purple-700 font-medium">Disponible</p>
                <TrendingUp size={20} className="text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-900">
                {summary.totalAvailable.toLocaleString()} €
              </p>
              <p className="text-xs text-purple-700 mt-1">
                {summary.totalBudgeted > 0
                  ? `${((summary.totalAvailable / summary.totalBudgeted) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>
          </div>

          {/* Barra de búsqueda y controles */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex-1 relative w-full">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Buscar por código o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={expandAll}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Eye size={16} />
                  Expandir todo
                </button>
                <button
                  onClick={collapseAll}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <EyeOff size={16} />
                  Colapsar todo
                </button>
                <button
                  onClick={exportBudget}
                  className="px-4 py-2.5 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2 font-medium"
                >
                  <Download size={18} />
                  Exportar
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de presupuesto */}
          {filteredAccounts.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <FileSpreadsheet size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm ? "No se encontraron cuentas" : "No hay cuentas presupuestarias"}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Comienza creando tu primera cuenta o importa un presupuesto"}
              </p>
              {!searchTerm && (
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={openCreateAccountModal}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-lg"
                  >
                    <Plus size={20} />
                    Crear primera cuenta
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-lg"
                  >
                    <Upload size={20} />
                    Importar presupuesto
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider w-12"></th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Código
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Descripción
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Presupuestado
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Comprometido
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Realizado
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Disponible
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAccounts.map((account) => {
                      const totals = getAccountTotals(account);
                      const isExpanded = expandedAccounts.has(account.id);

                      return (
                        <>
                          {/* Fila de cuenta */}
                          <tr
                            key={account.id}
                            className="bg-blue-50 hover:bg-blue-100 transition-colors font-medium"
                          >
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleAccount(account.id)}
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDown size={18} />
                                ) : (
                                  <ChevronRight size={18} />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 font-semibold text-blue-900">
                              {account.code}
                            </td>
                            <td className="px-4 py-3 font-semibold text-blue-900">
                              {account.description}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-blue-900">
                              {totals.budgeted.toLocaleString()} €
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-amber-700">
                              {totals.committed.toLocaleString()} €
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">
                              {totals.actual.toLocaleString()} €
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-bold ${getAvailableColor(
                                totals.available,
                                totals.budgeted
                              )}`}
                            >
                              {totals.available.toLocaleString()} €
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openCreateSubAccountModal(account)}
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                                  title="Añadir subcuenta"
                                >
                                  <Plus size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(account.id)}
                                  className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Eliminar cuenta"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Filas de subcuentas */}
                          {isExpanded &&
                            account.subAccounts.map((subAccount) => {
                              const available =
                                subAccount.budgeted -
                                subAccount.committed -
                                subAccount.actual;

                              return (
                                <tr
                                  key={subAccount.id}
                                  className="hover:bg-slate-50 transition-colors"
                                >
                                  <td className="px-4 py-2.5"></td>
                                  <td className="px-4 py-2.5 pl-12 text-slate-700">
                                    {subAccount.code}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-900">
                                    {subAccount.description}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-slate-900">
                                    {subAccount.budgeted.toLocaleString()} €
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-amber-700">
                                    {subAccount.committed.toLocaleString()} €
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-emerald-700">
                                    {subAccount.actual.toLocaleString()} €
                                  </td>
                                  <td
                                    className={`px-4 py-2.5 text-right ${getAvailableColor(
                                      available,
                                      subAccount.budgeted
                                    )}`}
                                  >
                                    {available.toLocaleString()} €
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() =>
                                          openEditSubAccountModal(account, subAccount)
                                        }
                                        className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Editar subcuenta"
                                      >
                                        <Edit size={16} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteSubAccount(account.id, subAccount.id)
                                        }
                                        className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Eliminar subcuenta"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal de crear/editar cuenta/subcuenta */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="bg-gradient-to-r from-blue-500 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">
                {modalMode === "account"
                  ? "Nueva cuenta"
                  : selectedSubAccount
                  ? "Editar subcuenta"
                  : "Nueva subcuenta"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Código
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    disabled={modalMode === "subaccount"}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-600"
                    placeholder={modalMode === "account" ? "01" : "01-01-01"}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {modalMode === "account"
                      ? "Formato: 01, 02, 03..."
                      : "El código se genera automáticamente"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={
                      modalMode === "account"
                        ? "GUION Y MÚSICA"
                        : "Derechos de autor"
                    }
                  />
                </div>

                {modalMode === "subaccount" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Presupuesto (€)
                    </label>
                    <input
                      type="number"
                      value={formData.budgeted}
                      onChange={(e) =>
                        setFormData({ ...formData, budgeted: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="5000"
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}

                {modalMode === "account" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Nota:</strong> Las cuentas agrupan subcuentas y su presupuesto
                      se calcula automáticamente como la suma de todas sus subcuentas.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-6 border-t border-slate-200">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={
                    modalMode === "account"
                      ? handleCreateAccount
                      : selectedSubAccount
                      ? handleUpdateSubAccount
                      : handleCreateSubAccount
                  }
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg"
                >
                  {modalMode === "account"
                    ? "Crear cuenta"
                    : selectedSubAccount
                    ? "Guardar cambios"
                    : "Crear subcuenta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de importación */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0">
              <h2 className="text-xl font-bold text-white">
                Importar presupuesto
              </h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">
                    Paso 1: Descarga la plantilla
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Descarga nuestra plantilla CSV y complétala con tu presupuesto.
                    La plantilla incluye ejemplos e instrucciones.
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all shadow-md"
                  >
                    <Download size={20} />
                    Descargar plantilla CSV
                  </button>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">
                    Paso 2: Sube tu archivo
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Una vez completada la plantilla, súbela aquí para importar tu
                    presupuesto.
                  </p>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-400 transition-colors">
                    <FileSpreadsheet size={48} className="text-slate-400 mx-auto mb-3" />
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-all shadow-md">
                        <Upload size={20} />
                        Seleccionar archivo CSV
                      </span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleImportCSV}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-slate-500 mt-3">
                      Formatos aceptados: CSV
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900 mb-1">
                        Importante
                      </p>
                      <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                        <li>Las cuentas deben crearse antes que sus subcuentas</li>
                        <li>El código de subcuenta debe derivar del código de su cuenta</li>
                        <li>Solo las subcuentas tienen presupuesto asignado</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 border-t border-slate-200 pt-4 flex-shrink-0">
              <button
                onClick={() => setShowImportModal(false)}
                className="w-full px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

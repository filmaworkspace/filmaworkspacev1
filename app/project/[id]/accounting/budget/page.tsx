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
  Plus,
  ChevronDown,
  ChevronRight,
  Edit,
  Trash2,
  X,
  Search,
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Wallet,
  ArrowLeft,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"account" | "subaccount">("account");
  const [editMode, setEditMode] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedSubAccount, setSelectedSubAccount] = useState<SubAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

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
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setUserId(user.uid);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    calculateSummary();
  }, [accounts]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      // Cargar nombre del proyecto
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const accountsRef = collection(db, `projects/${id}/accounts`);
      const accountsQuery = query(accountsRef, orderBy("code", "asc"));
      const accountsSnapshot = await getDocs(accountsQuery);

      const accountsData = await Promise.all(
        accountsSnapshot.docs.map(async (accountDoc) => {
          const subAccountsRef = collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`);
          const subAccountsQuery = query(subAccountsRef, orderBy("code", "asc"));
          const subAccountsSnapshot = await getDocs(subAccountsQuery);

          const subAccounts = subAccountsSnapshot.docs.map((subDoc) => ({
            id: subDoc.id,
            ...subDoc.data(),
            budgeted: subDoc.data().budgeted || 0,
            committed: subDoc.data().committed || 0,
            actual: subDoc.data().actual || 0,
            createdAt: subDoc.data().createdAt?.toDate() || new Date(),
          })) as SubAccount[];

          return {
            id: accountDoc.id,
            code: accountDoc.data().code || "",
            description: accountDoc.data().description || "",
            subAccounts,
            createdAt: accountDoc.data().createdAt?.toDate() || new Date(),
          } as Account;
        })
      );

      setAccounts(accountsData);
    } catch (error: any) {
      setErrorMessage(`Error cargando datos: ${error.message}`);
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
        totalBudgeted += sub.budgeted || 0;
        totalCommitted += sub.committed || 0;
        totalActual += sub.actual || 0;
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
    const budgeted = account.subAccounts.reduce((sum, sub) => sum + (sub.budgeted || 0), 0);
    const committed = account.subAccounts.reduce((sum, sub) => sum + (sub.committed || 0), 0);
    const actual = account.subAccounts.reduce((sum, sub) => sum + (sub.actual || 0), 0);
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
    if (!formData.code.trim() || !formData.description.trim()) {
      setErrorMessage("El código y la descripción son obligatorios");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await addDoc(collection(db, `projects/${id}/accounts`), {
        code: formData.code.trim(),
        description: formData.description.trim(),
        createdAt: Timestamp.now(),
        createdBy: userId || "",
      });

      setSuccessMessage("Cuenta creada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      resetForm();
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error creando cuenta: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAccount = async () => {
    if (!selectedAccount) return;
    
    if (!formData.code.trim() || !formData.description.trim()) {
      setErrorMessage("El código y la descripción son obligatorios");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await updateDoc(doc(db, `projects/${id}/accounts`, selectedAccount.id), {
        code: formData.code.trim(),
        description: formData.description.trim(),
      });

      setSuccessMessage("Cuenta actualizada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      resetForm();
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error actualizando cuenta: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSubAccount = async () => {
    if (!selectedAccount) {
      setErrorMessage("Debes seleccionar una cuenta padre");
      return;
    }

    if (!formData.code.trim() || !formData.description.trim()) {
      setErrorMessage("El código y la descripción son obligatorios");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await addDoc(collection(db, `projects/${id}/accounts/${selectedAccount.id}/subaccounts`), {
        code: formData.code.trim(),
        description: formData.description.trim(),
        budgeted: formData.budgeted || 0,
        committed: 0,
        actual: 0,
        accountId: selectedAccount.id,
        createdAt: Timestamp.now(),
        createdBy: userId || "",
      });

      setSuccessMessage("Subcuenta creada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      resetForm();
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error creando subcuenta: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSubAccount = async () => {
    if (!selectedAccount || !selectedSubAccount) {
      setErrorMessage("Error: No se encontró la subcuenta");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await updateDoc(doc(db, `projects/${id}/accounts/${selectedAccount.id}/subaccounts`, selectedSubAccount.id), {
        code: formData.code.trim(),
        description: formData.description.trim(),
        budgeted: formData.budgeted || 0,
      });

      setSuccessMessage("Subcuenta actualizada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      resetForm();
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error actualizando subcuenta: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (account && account.subAccounts.length > 0) {
      setErrorMessage("No se puede eliminar una cuenta con subcuentas");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    if (!confirm("¿Eliminar esta cuenta?")) return;

    try {
      await deleteDoc(doc(db, `projects/${id}/accounts`, accountId));
      setSuccessMessage("Cuenta eliminada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error eliminando cuenta: ${error.message}`);
    }
  };

  const handleDeleteSubAccount = async (accountId: string, subAccountId: string) => {
    if (!confirm("¿Eliminar esta subcuenta?")) return;

    try {
      await deleteDoc(doc(db, `projects/${id}/accounts/${accountId}/subaccounts`, subAccountId));
      setSuccessMessage("Subcuenta eliminada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error eliminando subcuenta: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", description: "", budgeted: 0 });
    setSelectedAccount(null);
    setSelectedSubAccount(null);
    setEditMode(false);
    setErrorMessage("");
  };

  const openCreateAccountModal = () => {
    resetForm();
    setModalMode("account");
    setEditMode(false);
    setShowModal(true);
  };

  const openEditAccountModal = (account: Account) => {
    setSelectedAccount(account);
    setFormData({
      code: account.code,
      description: account.description,
      budgeted: 0,
    });
    setModalMode("account");
    setEditMode(true);
    setShowModal(true);
  };

  const openCreateSubAccountModal = (account: Account) => {
    resetForm();
    setSelectedAccount(account);
    setFormData({ code: "", description: "", budgeted: 0 });
    setModalMode("subaccount");
    setEditMode(false);
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
    setEditMode(true);
    setShowModal(true);
  };

  const downloadTemplate = () => {
    const template = [
      ["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO"],
      ["01", "GUION Y MÚSICA", "CUENTA", ""],
      ["01.01", "Derechos de autor", "SUBCUENTA", "5000"],
      ["01.02", "Música original", "SUBCUENTA", "3000"],
      ["02", "PRODUCCIÓN", "CUENTA", ""],
      ["02.01", "Equipo técnico", "SUBCUENTA", "10000"],
    ];
    const csvContent = template.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "plantilla_presupuesto.csv");
    link.click();
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSaving(true);
    setErrorMessage("");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").slice(1);

      try {
        const accountsMap = new Map<string, string>();
        let accountsCreated = 0;
        let subAccountsCreated = 0;

        for (const line of lines) {
          const [code, description, type, budgeted] = line.split(",").map((s) => s.trim());
          if (!code || !description || !type) continue;

          if (type.toUpperCase() === "CUENTA") {
            const accountRef = await addDoc(collection(db, `projects/${id}/accounts`), {
              code: code.trim(),
              description,
              createdAt: Timestamp.now(),
              createdBy: userId || "",
            });
            accountsMap.set(code, accountRef.id);
            accountsCreated++;
          } else if (type.toUpperCase() === "SUBCUENTA") {
            // Buscar la cuenta padre por el código base (antes del primer punto o guión)
            const accountCode = code.split(/[.\-]/)[0];
            let accountId = accountsMap.get(accountCode);

            // Si no está en el mapa, buscar en las cuentas existentes
            if (!accountId) {
              const existingAccount = accounts.find(a => a.code === accountCode);
              if (existingAccount) {
                accountId = existingAccount.id;
              }
            }

            if (accountId) {
              await addDoc(collection(db, `projects/${id}/accounts/${accountId}/subaccounts`), {
                code: code.trim(),
                description,
                budgeted: parseFloat(budgeted) || 0,
                committed: 0,
                actual: 0,
                accountId,
                createdAt: Timestamp.now(),
                createdBy: userId || "",
              });
              subAccountsCreated++;
            }
          }
        }

        setSuccessMessage(`Importación completada: ${accountsCreated} cuentas y ${subAccountsCreated} subcuentas`);
        setTimeout(() => setSuccessMessage(""), 5000);

        setShowImportModal(false);
        await loadData();
      } catch (error: any) {
        setErrorMessage(`Error al importar: ${error.message}`);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsText(file);
  };

  const exportBudget = () => {
    const rows = [["CÓDIGO", "DESCRIPCIÓN", "TIPO", "PRESUPUESTADO", "COMPROMETIDO", "REALIZADO", "DISPONIBLE"]];

    accounts.forEach((account) => {
      const totals = getAccountTotals(account);
      rows.push([account.code, account.description, "CUENTA", totals.budgeted.toString(), totals.committed.toString(), totals.actual.toString(), totals.available.toString()]);

      account.subAccounts.forEach((sub) => {
        const available = sub.budgeted - sub.committed - sub.actual;
        rows.push([sub.code, sub.description, "SUBCUENTA", sub.budgeted.toString(), sub.committed.toString(), sub.actual.toString(), available.toString()]);
      });
    });

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `presupuesto_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
  };

  const filteredAccounts = accounts.filter((account) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const accountMatch = account.code.toLowerCase().includes(searchLower) || account.description.toLowerCase().includes(searchLower);
    const subAccountMatch = account.subAccounts.some((sub) => sub.code.toLowerCase().includes(searchLower) || sub.description.toLowerCase().includes(searchLower));
    return accountMatch || subAccountMatch;
  });

  const expandAll = () => setExpandedAccounts(new Set(accounts.map((a) => a.id)));
  const collapseAll = () => setExpandedAccounts(new Set());

  const getAvailableColor = (available: number, budgeted: number) => {
    if (budgeted === 0) return "text-slate-600";
    const percentage = (available / budgeted) * 100;
    if (percentage < 10) return "text-red-600 font-bold";
    if (percentage < 25) return "text-amber-600 font-semibold";
    return "text-emerald-600";
  };

  const budgetedPercent = summary.totalBudgeted > 0 ? ((summary.totalCommitted + summary.totalActual) / summary.totalBudgeted) * 100 : 0;

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
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
          <Link href={`/project/${id}/accounting`} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6">
            <ArrowLeft size={16} />
            Volver al Panel
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <Wallet size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Presupuesto</h1>
                <p className="text-slate-500 text-sm">{projectName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                <Upload size={16} />
                Importar
              </button>
              <button onClick={openCreateAccountModal} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                <Plus size={18} />
                Nueva cuenta
              </button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Presupuestado</p>
              <p className="text-lg font-bold text-slate-900">{(summary.totalBudgeted || 0).toLocaleString()} €</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Comprometido</p>
              <p className="text-lg font-bold text-amber-600">{(summary.totalCommitted || 0).toLocaleString()} €</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Realizado</p>
              <p className="text-lg font-bold text-emerald-600">{(summary.totalActual || 0).toLocaleString()} €</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Disponible</p>
              <p className="text-lg font-bold text-blue-600">{(summary.totalAvailable || 0).toLocaleString()} €</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Ejecución del presupuesto</span>
              <span>{budgetedPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(budgetedPercent, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Messages */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle size={20} />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage("")}><X size={16} /></button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700">
            <CheckCircle size={20} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
          <div className="flex-1 relative w-full">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={expandAll} className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm">
              <Eye size={14} />
              Expandir
            </button>
            <button onClick={collapseAll} className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm">
              <EyeOff size={14} />
              Colapsar
            </button>
            <button onClick={exportBudget} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 font-medium">
              <Download size={16} />
              Exportar
            </button>
          </div>
        </div>

        {/* Budget Table */}
        {filteredAccounts.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
            <FileSpreadsheet size={32} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {searchTerm ? "No se encontraron cuentas" : "No hay cuentas presupuestarias"}
            </h3>
            <p className="text-slate-500 text-sm mb-4">
              {searchTerm ? "Intenta ajustar la búsqueda" : "Crea tu primera cuenta o importa un presupuesto"}
            </p>
            {!searchTerm && (
              <div className="flex gap-3 justify-center">
                <button onClick={openCreateAccountModal} className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
                  <Plus size={16} />
                  Crear cuenta
                </button>
                <button onClick={() => setShowImportModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50">
                  <Upload size={16} />
                  Importar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-10"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Descripción</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Presupuestado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Comprometido</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Realizado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Disponible</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((account) => {
                  const totals = getAccountTotals(account);
                  const isExpanded = expandedAccounts.has(account.id);

                  return (
                    <>
                      <tr key={account.id} className="bg-slate-50 hover:bg-slate-100 transition-colors font-medium">
                        <td className="px-4 py-3">
                          <button onClick={() => toggleAccount(account.id)} className="text-slate-600 hover:text-slate-900">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{account.code}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{account.description}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{(totals.budgeted || 0).toLocaleString()} €</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">{(totals.committed || 0).toLocaleString()} €</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">{(totals.actual || 0).toLocaleString()} €</td>
                        <td className={`px-4 py-3 text-right font-bold ${getAvailableColor(totals.available || 0, totals.budgeted || 0)}`}>
                          {(totals.available || 0).toLocaleString()} €
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openCreateSubAccountModal(account)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg" title="Añadir subcuenta">
                              <Plus size={14} />
                            </button>
                            <button onClick={() => openEditAccountModal(account)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar">
                              <Edit size={14} />
                            </button>
                            <button onClick={() => handleDeleteAccount(account.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && account.subAccounts.map((subAccount) => {
                        const available = subAccount.budgeted - subAccount.committed - subAccount.actual;

                        return (
                          <tr key={subAccount.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5"></td>
                            <td className="px-4 py-2.5 pl-10 text-slate-600">{subAccount.code}</td>
                            <td className="px-4 py-2.5 text-slate-700">{subAccount.description}</td>
                            <td className="px-4 py-2.5 text-right text-slate-900">{(subAccount.budgeted || 0).toLocaleString()} €</td>
                            <td className="px-4 py-2.5 text-right text-amber-600">{(subAccount.committed || 0).toLocaleString()} €</td>
                            <td className="px-4 py-2.5 text-right text-emerald-600">{(subAccount.actual || 0).toLocaleString()} €</td>
                            <td className={`px-4 py-2.5 text-right ${getAvailableColor(available || 0, subAccount.budgeted || 0)}`}>
                              {(available || 0).toLocaleString()} €
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditSubAccountModal(account, subAccount)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar">
                                  <Edit size={14} />
                                </button>
                                <button onClick={() => handleDeleteSubAccount(account.id, subAccount.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                                  <Trash2 size={14} />
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
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {modalMode === "account" 
                  ? (editMode ? "Editar cuenta" : "Nueva cuenta")
                  : (editMode ? "Editar subcuenta" : "Nueva subcuenta")
                }
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {errorMessage}
                </div>
              )}

              {modalMode === "subaccount" && selectedAccount && (
                <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs text-slate-500">Cuenta padre</p>
                  <p className="text-sm font-medium text-slate-900">{selectedAccount.code} - {selectedAccount.description}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Código</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder={modalMode === "account" ? "Ej: 01, 02, A1..." : "Ej: 01.01, 02-A, 1.1.1..."}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-xs text-slate-500 mt-1">Puedes usar cualquier formato de código</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Nombre de la cuenta o subcuenta"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {modalMode === "subaccount" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Presupuesto (€)</label>
                    <input
                      type="number"
                      value={formData.budgeted}
                      onChange={(e) => setFormData({ ...formData, budgeted: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-6 border-t border-slate-200">
                <button onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium">
                  Cancelar
                </button>
                <button
                  onClick={
                    modalMode === "account"
                      ? (editMode ? handleUpdateAccount : handleCreateAccount)
                      : (editMode ? handleUpdateSubAccount : handleCreateSubAccount)
                  }
                  disabled={saving}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {editMode ? "Guardar cambios" : (modalMode === "account" ? "Crear cuenta" : "Crear subcuenta")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Importar presupuesto</h2>
              <button onClick={() => setShowImportModal(false)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-medium text-slate-900 mb-2">1. Descarga la plantilla</h3>
                <p className="text-sm text-slate-500 mb-3">La plantilla incluye ejemplos de formato. Puedes usar cualquier sistema de códigos.</p>
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
                  <Download size={16} />
                  Descargar plantilla
                </button>
              </div>

              <div>
                <h3 className="font-medium text-slate-900 mb-2">2. Sube tu archivo</h3>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                  <FileSpreadsheet size={32} className="text-slate-400 mx-auto mb-2" />
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
                      <Upload size={16} />
                      {saving ? "Importando..." : "Seleccionar archivo"}
                    </span>
                    <input type="file" accept=".csv" onChange={handleImportCSV} disabled={saving} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  <strong>Formato libre:</strong> Puedes usar códigos como 01, 01.01, 01-01-01, A1, etc. El sistema detectará automáticamente la cuenta padre basándose en el primer segmento del código.
                </p>
              </div>
            </div>

            <div className="px-6 pb-6">
              <button onClick={() => setShowImportModal(false)} className="w-full px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

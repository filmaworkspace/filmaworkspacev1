"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  FileText,
  ArrowLeft,
  Save,
  Send,
  Building2,
  DollarSign,
  FileCheck,
  AlertCircle,
  Info,
  Upload,
  X,
  Check,
} from "lucide-react";


interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  country: string;
  taxId: string;
}

interface Account {
  id: string;
  code: string;
  description: string;
}

interface SubAccount {
  id: string;
  code: string;
  description: string;
  budgeted: number;
  committed: number;
  actual: number;
  available: number;
  accountId: string;
}

export default function NewPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [filteredSubAccounts, setFilteredSubAccounts] = useState<SubAccount[]>([]);
  const [nextPONumber, setNextPONumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");

  const [formData, setFormData] = useState({
    supplier: "",
    account: "",
    subAccount: "",
    description: "",
    amount: "",
    notes: "",
  });

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedSubAccount, setSelectedSubAccount] = useState<SubAccount | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id) {
      loadData();
    }
  }, [userId, id]);

  useEffect(() => {
    if (formData.account) {
      const filtered = subAccounts.filter((sub) => sub.accountId === formData.account);
      setFilteredSubAccounts(filtered);
    } else {
      setFilteredSubAccounts([]);
    }
  }, [formData.account, subAccounts]);

  useEffect(() => {
    if (formData.subAccount) {
      const selected = subAccounts.find((sub) => sub.id === formData.subAccount);
      setSelectedSubAccount(selected || null);
    } else {
      setSelectedSubAccount(null);
    }
  }, [formData.subAccount, subAccounts]);

  useEffect(() => {
    if (formData.supplier) {
      const selected = suppliers.find((sup) => sup.id === formData.supplier);
      setSelectedSupplier(selected || null);
    } else {
      setSelectedSupplier(null);
    }
  }, [formData.supplier, suppliers]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load suppliers
      const suppliersSnapshot = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc"))
      );
      const suppliersData = suppliersSnapshot.docs.map((doc) => ({
        id: doc.id,
        fiscalName: doc.data().fiscalName,
        commercialName: doc.data().commercialName,
        country: doc.data().country,
        taxId: doc.data().taxId,
      })) as Supplier[];
      setSuppliers(suppliersData);

      // Load accounts
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );
      const accountsData = accountsSnapshot.docs.map((doc) => ({
        id: doc.id,
        code: doc.data().code,
        description: doc.data().description,
      })) as Account[];
      setAccounts(accountsData);

      // Load all subaccounts
      const allSubAccounts: SubAccount[] = [];
      for (const account of accountsData) {
        const subAccountsSnapshot = await getDocs(
          query(
            collection(db, `projects/${id}/accounts/${account.id}/subaccounts`),
            orderBy("code", "asc")
          )
        );
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          const available = data.budgeted - data.committed - data.actual;
          allSubAccounts.push({
            id: subDoc.id,
            code: data.code,
            description: data.description,
            budgeted: data.budgeted,
            committed: data.committed,
            actual: data.actual,
            available,
            accountId: account.id,
          });
        });
      }
      setSubAccounts(allSubAccounts);

      // Generate next PO number
      const posSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
      const nextNumber = String(posSnapshot.size + 1).padStart(4, "0");
      setNextPONumber(nextNumber);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.supplier) {
      newErrors.supplier = "Debes seleccionar un proveedor";
    }

    if (!formData.subAccount) {
      newErrors.subAccount = "Debes seleccionar una cuenta presupuestaria";
    }

    if (!formData.description.trim()) {
      newErrors.description = "La descripción es obligatoria";
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = "El importe debe ser mayor a 0";
    }

    // Check if amount exceeds available budget
    if (selectedSubAccount && formData.amount) {
      const amount = parseFloat(formData.amount);
      if (amount > selectedSubAccount.available) {
        newErrors.amount = `El importe excede el presupuesto disponible (${selectedSubAccount.available.toLocaleString()} €)`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveDraft = async () => {
    if (!formData.supplier || !formData.subAccount || !formData.amount) {
      alert("Completa al menos proveedor, cuenta y importe para guardar el borrador");
      return;
    }

    await savePO("draft");
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    await savePO("pending");
  };

  const savePO = async (status: "draft" | "pending") => {
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => s.id === formData.supplier);
      const subAccount = subAccounts.find((s) => s.id === formData.subAccount);
      const account = accounts.find((a) => a.id === formData.account);

      if (!supplier || !subAccount || !account) {
        throw new Error("Datos incompletos");
      }

      const poData = {
        number: nextPONumber,
        supplier: supplier.fiscalName,
        supplierId: supplier.id,
        description: formData.description.trim(),
        budgetAccount: subAccount.code,
        budgetAccountId: account.id,
        subAccountId: subAccount.id,
        amount: parseFloat(formData.amount),
        status,
        notes: formData.notes.trim(),
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
      };

      await addDoc(collection(db, `projects/${id}/pos`), poData);

      setSuccessMessage(
        status === "draft"
          ? "Borrador guardado correctamente"
          : "PO enviada para aprobación"
      );

      setTimeout(() => {
        router.push(`/project/${id}/accounting/pos`);
      }, 1500);
    } catch (error) {
      console.error("Error guardando PO:", error);
      alert("Error al guardar la PO");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white `}>
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
    <div className={`flex flex-col min-h-screen bg-white `}>
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
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${id}/accounting/pos`}
            className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
          >
            Volver a POs
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Link
              href={`/project/${id}/accounting/pos`}
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4 text-sm font-medium"
            >
              <ArrowLeft size={16} />
              Volver a órdenes de compra
            </Link>
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                <FileText size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                  Nueva orden de compra
                </h1>
                <p className="text-slate-600 text-sm mt-1">PO-{nextPONumber}</p>
              </div>
            </div>
          </header>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <Check size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 space-y-6">
              {/* Supplier Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Proveedor *
                </label>
                <select
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className={`w-full px-4 py-3 border ${
                    errors.supplier ? "border-red-300" : "border-slate-300"
                  } rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none`}
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.fiscalName} - {supplier.taxId}
                    </option>
                  ))}
                </select>
                {errors.supplier && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.supplier}
                  </p>
                )}
                {selectedSupplier && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Building2 size={16} className="text-blue-600 mt-0.5" />
                      <div className="flex-1 text-xs text-blue-800">
                        <p>
                          <strong>Nombre comercial:</strong>{" "}
                          {selectedSupplier.commercialName}
                        </p>
                        <p>
                          <strong>País:</strong> {selectedSupplier.country}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Account Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Cuenta presupuestaria *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-2">
                      Cuenta principal
                    </label>
                    <select
                      value={formData.account}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: e.target.value,
                          subAccount: "",
                        })
                      }
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      <option value="">Seleccionar cuenta</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-2">
                      Subcuenta
                    </label>
                    <select
                      value={formData.subAccount}
                      onChange={(e) =>
                        setFormData({ ...formData, subAccount: e.target.value })
                      }
                      disabled={!formData.account}
                      className={`w-full px-4 py-2.5 border ${
                        errors.subAccount ? "border-red-300" : "border-slate-300"
                      } rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400`}
                    >
                      <option value="">Seleccionar subcuenta</option>
                      {filteredSubAccounts.map((subAccount) => (
                        <option key={subAccount.id} value={subAccount.id}>
                          {subAccount.code} - {subAccount.description}
                        </option>
                      ))}
                    </select>
                    {errors.subAccount && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {errors.subAccount}
                      </p>
                    )}
                  </div>
                </div>

                {selectedSubAccount && (
                  <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <h4 className="text-xs font-semibold text-slate-900 mb-2">
                      Estado del presupuesto
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-slate-600">Presupuestado</p>
                        <p className="text-sm font-bold text-slate-900">
                          {selectedSubAccount.budgeted.toLocaleString()} €
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Comprometido</p>
                        <p className="text-sm font-bold text-amber-600">
                          {selectedSubAccount.committed.toLocaleString()} €
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Realizado</p>
                        <p className="text-sm font-bold text-emerald-600">
                          {selectedSubAccount.actual.toLocaleString()} €
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Disponible</p>
                        <p
                          className={`text-sm font-bold ${
                            selectedSubAccount.available < 0
                              ? "text-red-600"
                              : selectedSubAccount.available <
                                selectedSubAccount.budgeted * 0.1
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {selectedSubAccount.available.toLocaleString()} €
                        </p>
                      </div>
                    </div>
                    {selectedSubAccount.available < selectedSubAccount.budgeted * 0.1 && (
                      <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-600 mt-0.5" />
                        <p className="text-xs text-amber-800">
                          {selectedSubAccount.available < 0
                            ? "Esta cuenta está sobrepasada. No se recomienda comprometer más presupuesto."
                            : "El presupuesto disponible es inferior al 10%. Revisa antes de aprobar."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Importe *
                </label>
                <div className="relative">
                  <DollarSign
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className={`w-full pl-10 pr-12 py-3 border ${
                      errors.amount ? "border-red-300" : "border-slate-300"
                    } rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-lg font-semibold`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                    EUR
                  </span>
                </div>
                {errors.amount && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.amount}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Descripción *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe el concepto de esta orden de compra..."
                  rows={4}
                  className={`w-full px-4 py-3 border ${
                    errors.description ? "border-red-300" : "border-slate-300"
                  } rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none`}
                />
                {errors.description && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.description}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  {formData.description.length}/500 caracteres
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Notas adicionales (opcional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Añade notas, observaciones o información adicional..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">
                      Proceso de aprobación
                    </h4>
                    <ul className="text-xs text-blue-800 space-y-1">
                      <li>
                        • <strong>Borrador:</strong> Guarda la PO sin enviar para continuar
                        más tarde
                      </li>
                      <li>
                        • <strong>Enviar:</strong> La PO pasará a estado "Pendiente" y
                        requerirá aprobación
                      </li>
                      <li>
                        • Una vez aprobada, el importe se comprometerá en el presupuesto
                      </li>
                      <li>
                        • Las POs aprobadas no se pueden eliminar, solo rechazar si es
                        necesario
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t-2 border-slate-200 p-6 bg-slate-50 flex justify-between items-center">
              <Link href={`/project/${id}/accounting/pos`}>
                <button className="px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-white font-medium transition-colors">
                  Cancelar
                </button>
              </Link>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={18} />
                  Guardar borrador
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Enviar para aprobación
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Tips */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <FileCheck size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    Verifica el proveedor
                  </h4>
                  <p className="text-xs text-slate-600">
                    Asegúrate de que el proveedor tenga certificados válidos antes de
                    crear la PO
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <DollarSign size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    Controla el presupuesto
                  </h4>
                  <p className="text-xs text-slate-600">
                    Verifica que hay presupuesto disponible en la cuenta antes de enviar
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-amber-100 p-2 rounded-lg">
                  <Info size={20} className="text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    Descripción clara
                  </h4>
                  <p className="text-xs text-slate-600">
                    Una descripción detallada facilita la aprobación y el seguimiento
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
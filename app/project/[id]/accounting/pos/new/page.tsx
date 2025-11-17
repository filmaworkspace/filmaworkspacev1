"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  Timestamp,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Folder,
  FileText,
  ArrowLeft,
  Save,
  Send,
  Building2,
  DollarSign,
  AlertCircle,
  Info,
  Upload,
  X,
  Check,
  Plus,
  Trash2,
  Search,
  Calendar,
  Hash,
  Percent,
  FileUp,
  User,
  Briefcase,
  ShoppingCart,
  Package,
  Wrench,
  Shield,
  Eye,
  Edit3,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  country: string;
  taxId: string;
  paymentMethod: string;
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
  accountCode: string;
  accountDescription: string;
}

interface POItem {
  id: string;
  description: string;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  date: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
}

interface Department {
  name: string;
}

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart, color: "blue" },
  { value: "purchase", label: "Compra", icon: Package, color: "green" },
  { value: "service", label: "Servicio", icon: Wrench, color: "purple" },
  { value: "deposit", label: "Fianza", icon: Shield, color: "amber" },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
];

const VAT_RATES = [
  { value: 0, label: "0% (Exento)" },
  { value: 4, label: "4% (Superreducido)" },
  { value: 10, label: "10% (Reducido)" },
  { value: 21, label: "21% (General)" },
];

const IRPF_RATES = [
  { value: 0, label: "0% (Sin retención)" },
  { value: 7, label: "7%" },
  { value: 15, label: "15%" },
  { value: 19, label: "19%" },
  { value: 21, label: "21%" },
];

export default function NewPOAdvancedPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userRole, setUserRole] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [nextPONumber, setNextPONumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  
  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);

  // File upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [formData, setFormData] = useState({
    supplier: "",
    supplierName: "",
    department: "",
    poType: "purchase" as "rental" | "purchase" | "service" | "deposit",
    currency: "EUR",
    generalDescription: "",
    paymentTerms: "",
    notes: "",
  });

  const [items, setItems] = useState<POItem[]>([
    {
      id: "1",
      description: "",
      subAccountId: "",
      subAccountCode: "",
      subAccountDescription: "",
      date: new Date().toISOString().split("T")[0],
      quantity: 1,
      unitPrice: 0,
      baseAmount: 0,
      vatRate: 21,
      vatAmount: 0,
      irpfRate: 0,
      irpfAmount: 0,
      totalAmount: 0,
    },
  ]);

  const [totals, setTotals] = useState({
    baseAmount: 0,
    vatAmount: 0,
    irpfAmount: 0,
    totalAmount: 0,
  });

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
    calculateTotals();
  }, [items]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        const depts = projectDoc.data().departments || [];
        setDepartments(depts.map((d: string) => ({ name: d })));
      }

      // Load user member data
      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        setUserRole(memberData.role || "");
        setUserDepartment(memberData.department || "");
        
        // Auto-set department if user has one
        if (memberData.department) {
          setFormData(prev => ({ ...prev, department: memberData.department }));
        }
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
        paymentMethod: doc.data().paymentMethod,
      })) as Supplier[];
      setSuppliers(suppliersData);

      // Load accounts and subaccounts
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );

      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(
          query(
            collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`),
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
            accountId: accountDoc.id,
            accountCode: accountData.code,
            accountDescription: accountData.description,
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

  const calculateItemTotal = (item: POItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    const totalAmount = baseAmount + vatAmount - irpfAmount;

    return {
      baseAmount,
      vatAmount,
      irpfAmount,
      totalAmount,
    };
  };

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Recalculate amounts
    const calculated = calculateItemTotal(newItems[index]);
    newItems[index] = {
      ...newItems[index],
      baseAmount: calculated.baseAmount,
      vatAmount: calculated.vatAmount,
      irpfAmount: calculated.irpfAmount,
      totalAmount: calculated.totalAmount,
    };

    setItems(newItems);
  };

  const addItem = () => {
    const newItem: POItem = {
      id: String(items.length + 1),
      description: "",
      subAccountId: "",
      subAccountCode: "",
      subAccountDescription: "",
      date: new Date().toISOString().split("T")[0],
      quantity: 1,
      unitPrice: 0,
      baseAmount: 0,
      vatRate: 21,
      vatAmount: 0,
      irpfRate: 0,
      irpfAmount: 0,
      totalAmount: 0,
    };
    setItems([...items, newItem]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      alert("Debe haber al menos un ítem en la PO");
      return;
    }
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const calculateTotals = () => {
    const baseAmount = items.reduce((sum, item) => sum + item.baseAmount, 0);
    const vatAmount = items.reduce((sum, item) => sum + item.vatAmount, 0);
    const irpfAmount = items.reduce((sum, item) => sum + item.irpfAmount, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    setTotals({ baseAmount, vatAmount, irpfAmount, totalAmount });
  };

  const selectSupplier = (supplier: Supplier) => {
    setFormData({
      ...formData,
      supplier: supplier.id,
      supplierName: supplier.fiscalName,
      paymentTerms: supplier.paymentMethod,
    });
    setShowSupplierModal(false);
    setSupplierSearch("");
  };

  const selectAccount = (subAccount: SubAccount) => {
    if (currentItemIndex !== null) {
      updateItem(currentItemIndex, "subAccountId", subAccount.id);
      updateItem(currentItemIndex, "subAccountCode", subAccount.code);
      updateItem(currentItemIndex, "subAccountDescription", subAccount.description);
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  const openAccountModal = (index: number) => {
    setCurrentItemIndex(index);
    setShowAccountModal(true);
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.commercialName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.taxId.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredSubAccounts = subAccounts.filter(
    (s) =>
      s.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.accountDescription.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.supplier) {
      newErrors.supplier = "Debes seleccionar un proveedor";
    }

    if (!formData.department) {
      newErrors.department = "Debes seleccionar un departamento";
    }

    if (!formData.generalDescription.trim()) {
      newErrors.generalDescription = "La descripción general es obligatoria";
    }

    // Validate items
    items.forEach((item, index) => {
      if (!item.description.trim()) {
        newErrors[`item_${index}_description`] = "Descripción obligatoria";
      }
      if (!item.subAccountId) {
        newErrors[`item_${index}_account`] = "Cuenta obligatoria";
      }
      if (item.quantity <= 0) {
        newErrors[`item_${index}_quantity`] = "Cantidad debe ser mayor a 0";
      }
      if (item.unitPrice <= 0) {
        newErrors[`item_${index}_unitPrice`] = "Precio debe ser mayor a 0";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!validTypes.includes(file.type)) {
        alert("Solo se permiten archivos PDF o imágenes (JPG, PNG)");
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert("El archivo no puede superar los 10MB");
        return;
      }

      setUploadedFile(file);
    }
  };

  const handleSaveDraft = async () => {
    if (!formData.supplier || !formData.department || items.length === 0) {
      alert("Completa al menos proveedor, departamento y un ítem para guardar el borrador");
      return;
    }

    await savePO("draft");
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      alert("Por favor, completa todos los campos obligatorios");
      return;
    }

    await savePO("pending");
  };

  const savePO = async (status: "draft" | "pending") => {
    setSaving(true);
    try {
      let fileUrl = "";
      
      // Upload file if exists
      if (uploadedFile) {
        const fileRef = ref(
          storage,
          `projects/${id}/pos/${nextPONumber}/${uploadedFile.name}`
        );
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      // Prepare items data
      const itemsData = items.map((item) => ({
        description: item.description,
        subAccountId: item.subAccountId,
        subAccountCode: item.subAccountCode,
        subAccountDescription: item.subAccountDescription,
        date: item.date,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        baseAmount: item.baseAmount,
        vatRate: item.vatRate,
        vatAmount: item.vatAmount,
        irpfRate: item.irpfRate,
        irpfAmount: item.irpfAmount,
        totalAmount: item.totalAmount,
      }));

      const poData = {
        number: nextPONumber,
        supplier: formData.supplierName,
        supplierId: formData.supplier,
        department: formData.department,
        poType: formData.poType,
        currency: formData.currency,
        generalDescription: formData.generalDescription.trim(),
        paymentTerms: formData.paymentTerms,
        notes: formData.notes.trim(),
        items: itemsData,
        baseAmount: totals.baseAmount,
        vatAmount: totals.vatAmount,
        irpfAmount: totals.irpfAmount,
        totalAmount: totals.totalAmount,
        status,
        attachmentUrl: fileUrl,
        attachmentFileName: uploadedFile?.name || "",
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

  const getCurrencySymbol = () => {
    return CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";
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
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
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
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Link
              href={`/project/${id}/accounting/pos`}
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4 text-sm font-medium"
            >
              <ArrowLeft size={16} />
              Volver a órdenes de compra
            </Link>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <FileText size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Nueva orden de compra
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    PO-{nextPONumber} • {userName}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700">
              <Check size={20} />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Info Card */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Info size={20} className="text-indigo-600" />
                  Información básica
                </h2>

                <div className="space-y-4">
                  {/* Supplier Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Proveedor *
                    </label>
                    <button
                      onClick={() => setShowSupplierModal(true)}
                      className={`w-full px-4 py-3 border-2 ${
                        errors.supplier ? "border-red-300" : "border-slate-300"
                      } rounded-lg hover:border-indigo-400 transition-colors text-left flex items-center justify-between group`}
                    >
                      {formData.supplierName ? (
                        <div className="flex items-center gap-2">
                          <Building2 size={18} className="text-indigo-600" />
                          <span className="font-medium text-slate-900">
                            {formData.supplierName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Seleccionar proveedor...</span>
                      )}
                      <Search
                        size={18}
                        className="text-slate-400 group-hover:text-indigo-600"
                      />
                    </button>
                    {errors.supplier && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {errors.supplier}
                      </p>
                    )}
                  </div>

                  {/* Department and PO Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Departamento *
                      </label>
                      <select
                        value={formData.department}
                        onChange={(e) =>
                          setFormData({ ...formData, department: e.target.value })
                        }
                        disabled={!!userDepartment && userRole !== "EP" && userRole !== "PM"}
                        className={`w-full px-4 py-3 border ${
                          errors.department ? "border-red-300" : "border-slate-300"
                        } rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50`}
                      >
                        <option value="">Seleccionar departamento</option>
                        {departments.map((dept) => (
                          <option key={dept.name} value={dept.name}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                      {errors.department && (
                        <p className="text-xs text-red-600 mt-1">
                          {errors.department}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Tipo de PO *
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {PO_TYPES.map((type) => {
                          const Icon = type.icon;
                          const isSelected = formData.poType === type.value;
                          return (
                            <button
                              key={type.value}
                              onClick={() =>
                                setFormData({ ...formData, poType: type.value as any })
                              }
                              className={`px-3 py-2 rounded-lg border-2 transition-all flex items-center gap-2 text-sm font-medium ${
                                isSelected
                                  ? `border-${type.color}-500 bg-${type.color}-50 text-${type.color}-700`
                                  : "border-slate-200 hover:border-slate-300 text-slate-600"
                              }`}
                            >
                              <Icon size={16} />
                              {type.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Currency */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Moneda *
                    </label>
                    <div className="flex gap-2">
                      {CURRENCIES.map((currency) => (
                        <button
                          key={currency.value}
                          onClick={() =>
                            setFormData({ ...formData, currency: currency.value })
                          }
                          className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all font-semibold ${
                            formData.currency === currency.value
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 hover:border-slate-300 text-slate-600"
                          }`}
                        >
                          {currency.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* General Description */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Descripción general de la PO *
                    </label>
                    <textarea
                      value={formData.generalDescription}
                      onChange={(e) =>
                        setFormData({ ...formData, generalDescription: e.target.value })
                      }
                      placeholder="Describe el propósito general de esta orden de compra..."
                      rows={3}
                      className={`w-full px-4 py-3 border ${
                        errors.generalDescription ? "border-red-300" : "border-slate-300"
                      } rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none`}
                    />
                    {errors.generalDescription && (
                      <p className="text-xs text-red-600 mt-1">
                        {errors.generalDescription}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Items Card */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Package size={20} className="text-indigo-600" />
                    Ítems de la orden ({items.length})
                  </h2>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus size={16} />
                    Añadir ítem
                  </button>
                </div>

                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="border-2 border-slate-200 rounded-xl p-4 hover:border-indigo-200 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                          <Hash size={16} className="text-slate-400" />
                          Ítem {index + 1}
                        </h3>
                        {items.length > 1 && (
                          <button
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {/* Description */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Descripción del ítem *
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) =>
                              updateItem(index, "description", e.target.value)
                            }
                            placeholder="Ej: Alquiler cámara RED..."
                            className={`w-full px-3 py-2 border ${
                              errors[`item_${index}_description`]
                                ? "border-red-300"
                                : "border-slate-300"
                            } rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none`}
                          />
                        </div>

                        {/* Account Selection */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Cuenta presupuestaria *
                          </label>
                          <button
                            onClick={() => openAccountModal(index)}
                            className={`w-full px-3 py-2 border ${
                              errors[`item_${index}_account`]
                                ? "border-red-300"
                                : "border-slate-300"
                            } rounded-lg text-sm text-left flex items-center justify-between hover:border-indigo-400 transition-colors`}
                          >
                            {item.subAccountCode ? (
                              <span className="font-mono text-slate-900">
                                {item.subAccountCode} - {item.subAccountDescription}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                Seleccionar cuenta...
                              </span>
                            )}
                            <Search size={14} className="text-slate-400" />
                          </button>
                        </div>

                        {/* Date, Quantity, Unit Price */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Fecha
                            </label>
                            <input
                              type="date"
                              value={item.date}
                              onChange={(e) => updateItem(index, "date", e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Cantidad
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(index, "quantity", parseFloat(e.target.value))
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Precio unitario
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateItem(index, "unitPrice", parseFloat(e.target.value))
                                }
                                className="w-full pl-6 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                                {getCurrencySymbol()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* VAT and IRPF */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              IVA
                            </label>
                            <select
                              value={item.vatRate}
                              onChange={(e) =>
                                updateItem(index, "vatRate", parseFloat(e.target.value))
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                              {VAT_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              IRPF
                            </label>
                            <select
                              value={item.irpfRate}
                              onChange={(e) =>
                                updateItem(index, "irpfRate", parseFloat(e.target.value))
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                              {IRPF_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Amounts Summary */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-slate-600">Base</p>
                              <p className="font-semibold text-slate-900">
                                {item.baseAmount.toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">IVA</p>
                              <p className="font-semibold text-emerald-600">
                                +{item.vatAmount.toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">IRPF</p>
                              <p className="font-semibold text-red-600">
                                -{item.irpfAmount.toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Total</p>
                              <p className="font-bold text-indigo-600 text-sm">
                                {item.totalAmount.toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Info Card */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Edit3 size={20} className="text-indigo-600" />
                  Información adicional
                </h2>

                <div className="space-y-4">
                  {/* Payment Terms */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Condiciones de pago
                    </label>
                    <input
                      type="text"
                      value={formData.paymentTerms}
                      onChange={(e) =>
                        setFormData({ ...formData, paymentTerms: e.target.value })
                      }
                      placeholder="Ej: Transferencia 30 días, Tarjeta..."
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Notas internas
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      placeholder="Añade notas, observaciones o información adicional..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Adjuntar presupuesto
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                      {uploadedFile ? (
                        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <FileUp size={20} className="text-indigo-600" />
                            <span className="text-sm font-medium text-indigo-900">
                              {uploadedFile.name}
                            </span>
                            <span className="text-xs text-indigo-600">
                              ({(uploadedFile.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <button
                            onClick={() => setUploadedFile(null)}
                            className="p-1 text-indigo-600 hover:bg-indigo-100 rounded transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <Upload size={32} className="text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600 mb-1">
                            Haz clic para seleccionar un archivo
                          </p>
                          <p className="text-xs text-slate-400">
                            PDF, JPG, PNG (máx. 10MB)
                          </p>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar - Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Totals Card */}
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-lg p-6 text-white">
                  <h3 className="text-sm font-medium text-indigo-100 mb-4">
                    Total de la orden
                  </h3>
                  
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-indigo-100">Base imponible</span>
                      <span className="font-semibold">
                        {totals.baseAmount.toFixed(2)} {getCurrencySymbol()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-indigo-100">IVA</span>
                      <span className="font-semibold text-emerald-300">
                        +{totals.vatAmount.toFixed(2)} {getCurrencySymbol()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-indigo-100">IRPF</span>
                      <span className="font-semibold text-red-300">
                        -{totals.irpfAmount.toFixed(2)} {getCurrencySymbol()}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-indigo-400 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total</span>
                      <span className="text-3xl font-bold">
                        {totals.totalAmount.toFixed(2)} {getCurrencySymbol()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Card */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">
                    Acciones
                  </h3>
                  
                  <div className="space-y-3">
                    <button
                      onClick={handleSubmit}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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

                    <button
                      onClick={handleSaveDraft}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={18} />
                      Guardar borrador
                    </button>

                    <Link href={`/project/${id}/accounting/pos`}>
                      <button className="w-full px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">
                        Cancelar
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-2">
                    <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold mb-1">Proceso de aprobación</p>
                      <ul className="space-y-1">
                        <li>• Los borradores no comprometen presupuesto</li>
                        <li>• Las POs pendientes requieren aprobación</li>
                        <li>• Una vez aprobada, se compromete el presupuesto</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">Seleccionar proveedor</h2>
              <button
                onClick={() => {
                  setShowSupplierModal(false);
                  setSupplierSearch("");
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Buscar por nombre o NIF..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSuppliers.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No se encontraron proveedores
                  </p>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      onClick={() => selectSupplier(supplier)}
                      className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900 group-hover:text-indigo-700">
                            {supplier.fiscalName}
                          </p>
                          <p className="text-sm text-slate-600">
                            {supplier.commercialName}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Hash size={12} />
                              {supplier.taxId}
                            </span>
                            <span>{supplier.country}</span>
                          </div>
                        </div>
                        <Building2 size={20} className="text-slate-400 group-hover:text-indigo-600" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">
                Seleccionar cuenta presupuestaria
              </h2>
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  setAccountSearch("");
                  setCurrentItemIndex(null);
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Buscar por código o descripción..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No se encontraron cuentas
                  </p>
                ) : (
                  filteredSubAccounts.map((subAccount) => (
                    <button
                      key={subAccount.id}
                      onClick={() => selectAccount(subAccount)}
                      className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-mono font-semibold text-slate-900 group-hover:text-emerald-700">
                            {subAccount.code}
                          </p>
                          <p className="text-sm text-slate-700">
                            {subAccount.description}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {subAccount.accountCode} - {subAccount.accountDescription}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-slate-600">Presupuestado</p>
                          <p className="font-semibold text-slate-900">
                            {subAccount.budgeted.toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Comprometido</p>
                          <p className="font-semibold text-amber-600">
                            {subAccount.committed.toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Realizado</p>
                          <p className="font-semibold text-emerald-600">
                            {subAccount.actual.toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Disponible</p>
                          <p
                            className={`font-bold ${
                              subAccount.available < 0
                                ? "text-red-600"
                                : subAccount.available < subAccount.budgeted * 0.1
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {subAccount.available.toLocaleString()} €
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

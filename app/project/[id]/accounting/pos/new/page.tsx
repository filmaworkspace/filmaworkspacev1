"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
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
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Folder,
  FileText,
  ArrowLeft,
  Save,
  Send,
  Building2,
  AlertCircle,
  Info,
  Upload,
  X,
  Plus,
  Trash2,
  Search,
  Hash,
  FileUp,
  ShoppingCart,
  Package,
  Wrench,
  Shield,
  CheckCircle,
  ChevronRight,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

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

interface ApprovalStep {
  id: string;
  order: number;
  approverType: "fixed" | "role" | "hod" | "coordinator";
  approvers?: string[];
  roles?: string[];
  department?: string;
  requireAll: boolean;
}

interface ApprovalStepStatus {
  id: string;
  order: number;
  approverType: "fixed" | "role" | "hod" | "coordinator";
  approvers: string[];
  roles?: string[];
  department?: string;
  approvedBy: string[];
  rejectedBy: string[];
  status: "pending" | "approved" | "rejected";
  requireAll: boolean;
}

interface Member {
  userId: string;
  role?: string;
  department?: string;
  position?: string;
}

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart },
  { value: "purchase", label: "Compra", icon: Package },
  { value: "service", label: "Servicio", icon: Wrench },
  { value: "deposit", label: "Fianza", icon: Shield },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
];

const VAT_RATES = [
  { value: 0, label: "0%" },
  { value: 4, label: "4%" },
  { value: 10, label: "10%" },
  { value: 21, label: "21%" },
];

const IRPF_RATES = [
  { value: 0, label: "0%" },
  { value: 7, label: "7%" },
  { value: 15, label: "15%" },
  { value: 19, label: "19%" },
];

export default function NewPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userRole, setUserRole] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [nextPONumber, setNextPONumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    supplier: "",
    supplierName: "",
    department: "",
    poType: "service" as "rental" | "purchase" | "service" | "deposit",
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

  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });

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
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    calculateTotals();
  }, [items]);

  const loadData = async () => {
    try {
      setLoading(true);

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        setDepartments(projectDoc.data().departments || []);
      }

      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        const data = memberDoc.data();
        setUserRole(data.role || "");
        setUserDepartment(data.department || "");
        if (data.department) setFormData((prev) => ({ ...prev, department: data.department }));
      }

      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      setMembers(membersSnapshot.docs.map((doc) => ({ userId: doc.id, ...doc.data() } as Member)));

      const approvalConfigDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (approvalConfigDoc.exists()) {
        setApprovalConfig(approvalConfigDoc.data().poApprovals || []);
      } else {
        setApprovalConfig([{ id: "default-1", order: 1, approverType: "role", roles: ["PM", "EP"], requireAll: false }]);
      }

      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      setSuppliers(suppliersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Supplier)));

      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          allSubAccounts.push({
            id: subDoc.id,
            code: data.code,
            description: data.description,
            budgeted: data.budgeted || 0,
            committed: data.committed || 0,
            actual: data.actual || 0,
            available: (data.budgeted || 0) - (data.committed || 0) - (data.actual || 0),
            accountId: accountDoc.id,
            accountCode: accountData.code,
            accountDescription: accountData.description,
          });
        });
      }
      setSubAccounts(allSubAccounts);

      const posSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
      setNextPONumber(String(posSnapshot.size + 1).padStart(4, "0"));
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const resolveApprovers = (step: ApprovalStep, dept?: string): string[] => {
    switch (step.approverType) {
      case "fixed":
        return step.approvers || [];
      case "role":
        return members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId);
      case "hod":
        return members.filter((m) => m.position === "HOD" && m.department === (step.department || dept)).map((m) => m.userId);
      case "coordinator":
        return members.filter((m) => m.position === "Coordinator" && m.department === (step.department || dept)).map((m) => m.userId);
      default:
        return [];
    }
  };

  const generateApprovalSteps = (dept?: string): ApprovalStepStatus[] => {
    if (approvalConfig.length === 0) return [];
    return approvalConfig.map((step) => ({
      id: step.id || "",
      order: step.order || 0,
      approverType: step.approverType || "fixed",
      approvers: resolveApprovers(step, dept),
      roles: step.roles || [],
      department: step.department || "",
      approvedBy: [],
      rejectedBy: [],
      status: "pending" as const,
      requireAll: step.requireAll ?? false,
    }));
  };

  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean => {
    return steps.length === 0 || steps.every((step) => step.approvers.length === 0);
  };

  const calculateItemTotal = (item: POItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    return { baseAmount, vatAmount, irpfAmount, totalAmount: baseAmount + vatAmount - irpfAmount };
  };

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    const calc = calculateItemTotal(newItems[index]);
    newItems[index] = { ...newItems[index], ...calc };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
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
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    setTotals({
      baseAmount: items.reduce((sum, item) => sum + item.baseAmount, 0),
      vatAmount: items.reduce((sum, item) => sum + item.vatAmount, 0),
      irpfAmount: items.reduce((sum, item) => sum + item.irpfAmount, 0),
      totalAmount: items.reduce((sum, item) => sum + item.totalAmount, 0),
    });
  };

  const selectSupplier = (supplier: Supplier) => {
    setFormData({ ...formData, supplier: supplier.id, supplierName: supplier.fiscalName, paymentTerms: supplier.paymentMethod });
    setShowSupplierModal(false);
    setSupplierSearch("");
  };

  const selectAccount = (subAccount: SubAccount) => {
    if (currentItemIndex !== null) {
      const newItems = [...items];
      newItems[currentItemIndex] = { ...newItems[currentItemIndex], subAccountId: subAccount.id, subAccountCode: subAccount.code, subAccountDescription: subAccount.description };
      setItems(newItems);
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplier) newErrors.supplier = "Selecciona un proveedor";
    if (!formData.department) newErrors.department = "Selecciona un departamento";
    if (!formData.generalDescription.trim()) newErrors.generalDescription = "Descripción obligatoria";
    items.forEach((item, index) => {
      if (!item.description.trim()) newErrors[`item_${index}_description`] = "Obligatorio";
      if (!item.subAccountId) newErrors[`item_${index}_account`] = "Obligatorio";
      if (item.quantity <= 0) newErrors[`item_${index}_quantity`] = "Debe ser > 0";
      if (item.unitPrice <= 0) newErrors[`item_${index}_unitPrice`] = "Debe ser > 0";
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) {
        alert("Solo PDF o imágenes hasta 10MB");
        return;
      }
      setUploadedFile(file);
    }
  };

  const savePO = async (status: "draft" | "pending") => {
    if (status === "pending" && !validateForm()) return;
    setSaving(true);
    try {
      let fileUrl = "";
      if (uploadedFile) {
        const fileRef = ref(storage, `projects/${id}/pos/${nextPONumber}/${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      const itemsData = items.map((item) => ({
        description: item.description.trim(),
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

      const poData: any = {
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
        attachmentUrl: fileUrl,
        attachmentFileName: uploadedFile?.name || "",
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
        version: 1,
      };

      if (status === "pending") {
        const approvalSteps = generateApprovalSteps(formData.department);
        if (shouldAutoApprove(approvalSteps)) {
          poData.status = "approved";
          poData.approvedAt = Timestamp.now();
          poData.approvedBy = userId;
          poData.approvedByName = userName;
          poData.autoApproved = true;
        } else {
          poData.status = "pending";
          poData.approvalSteps = approvalSteps;
          poData.currentApprovalStep = 0;
        }
      } else {
        poData.status = "draft";
      }

      await addDoc(collection(db, `projects/${id}/pos`), poData);
      setSuccessMessage(poData.status === "approved" ? "PO aprobada automáticamente" : poData.status === "pending" ? "PO enviada para aprobación" : "Borrador guardado");
      setTimeout(() => router.push(`/project/${id}/accounting/pos`), 1500);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getCurrencySymbol = () => CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";
  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) return { autoApprove: true, message: "Se aprobará automáticamente" };
    const steps = generateApprovalSteps(formData.department);
    if (steps.every((s) => s.approvers.length === 0)) return { autoApprove: true, message: "Se aprobará automáticamente" };
    return { autoApprove: false, message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`, steps };
  };

  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()));
  const approvalPreview = getApprovalPreview();

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/project/${id}/accounting/pos`} className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1">
              <Folder size={14} />
              {projectName}
              <ChevronRight size={14} />
              <span>POs</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
              <FileText size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Nueva orden de compra</h1>
              <p className="text-slate-400 text-sm">PO-{nextPONumber} • {userName}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-4">
        <div className="max-w-7xl mx-auto">
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700">
              <CheckCircle size={20} />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Info */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Información básica</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Proveedor *</label>
                    <button onClick={() => setShowSupplierModal(true)} className={`w-full px-4 py-3 border ${errors.supplier ? "border-red-300" : "border-slate-200"} rounded-xl hover:border-slate-400 transition-colors text-left flex items-center justify-between bg-slate-50`}>
                      {formData.supplierName ? (
                        <div className="flex items-center gap-2">
                          <Building2 size={18} className="text-slate-600" />
                          <span className="font-medium text-slate-900">{formData.supplierName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Seleccionar proveedor...</span>
                      )}
                      <Search size={18} className="text-slate-400" />
                    </button>
                    {errors.supplier && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.supplier}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Departamento *</label>
                      <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} disabled={!!userDepartment && userRole !== "EP" && userRole !== "PM"} className={`w-full px-4 py-3 border ${errors.department ? "border-red-300" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 disabled:bg-slate-100`}>
                        <option value="">Seleccionar...</option>
                        {departments.map((dept) => (<option key={dept} value={dept}>{dept}</option>))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de PO *</label>
                      <div className="grid grid-cols-2 gap-2">
                        {PO_TYPES.map((type) => {
                          const Icon = type.icon;
                          const isSelected = formData.poType === type.value;
                          return (
                            <button key={type.value} onClick={() => setFormData({ ...formData, poType: type.value as any })} className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-2 text-sm font-medium ${isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50"}`}>
                              <Icon size={16} />
                              {type.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Moneda</label>
                    <div className="flex gap-2">
                      {CURRENCIES.map((currency) => (
                        <button key={currency.value} onClick={() => setFormData({ ...formData, currency: currency.value })} className={`flex-1 px-4 py-2.5 rounded-xl border transition-all font-medium text-sm ${formData.currency === currency.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50"}`}>
                          {currency.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Descripción general *</label>
                    <textarea value={formData.generalDescription} onChange={(e) => setFormData({ ...formData, generalDescription: e.target.value })} placeholder="Describe el propósito de esta orden de compra..." rows={3} className={`w-full px-4 py-3 border ${errors.generalDescription ? "border-red-300" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 resize-none`} />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Items ({items.length})</p>
                  <button onClick={addItem} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors">
                    <Plus size={14} />
                    Añadir
                  </button>
                </div>

                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Hash size={12} />Item {index + 1}</span>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} placeholder="Descripción del item..." className={`w-full px-3 py-2.5 border ${errors[`item_${index}_description`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white`} />

                        <button onClick={() => { setCurrentItemIndex(index); setShowAccountModal(true); }} className={`w-full px-3 py-2.5 border ${errors[`item_${index}_account`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm text-left flex items-center justify-between hover:border-slate-400 transition-colors bg-white`}>
                          {item.subAccountCode ? <span className="font-mono text-slate-900">{item.subAccountCode} - {item.subAccountDescription}</span> : <span className="text-slate-400">Seleccionar cuenta...</span>}
                          <Search size={14} className="text-slate-400" />
                        </button>

                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Fecha</label>
                            <input type="date" value={item.date} onChange={(e) => updateItem(index, "date", e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Cantidad</label>
                            <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Precio unit.</label>
                            <div className="relative">
                              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} className="w-full pl-6 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{getCurrencySymbol()}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Base</label>
                            <div className="px-3 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-900">{formatCurrency(item.baseAmount)} {getCurrencySymbol()}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">IVA</label>
                            <select value={item.vatRate} onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                              {VAT_RATES.map((rate) => (<option key={rate.value} value={rate.value}>{rate.label}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">IRPF</label>
                            <select value={item.irpfRate} onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                              {IRPF_RATES.map((rate) => (<option key={rate.value} value={rate.value}>{rate.label}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">+IVA</label>
                            <div className="px-3 py-2 bg-emerald-50 rounded-lg text-sm font-medium text-emerald-700">+{formatCurrency(item.vatAmount)}</div>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">-IRPF</label>
                            <div className="px-3 py-2 bg-red-50 rounded-lg text-sm font-medium text-red-700">-{formatCurrency(item.irpfAmount)}</div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <div className="bg-slate-900 text-white px-4 py-2 rounded-lg">
                            <span className="text-xs text-slate-400">Total item:</span>
                            <span className="ml-2 font-bold">{formatCurrency(item.totalAmount)} {getCurrencySymbol()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Información adicional</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Condiciones de pago</label>
                    <input type="text" value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} placeholder="Ej: Transferencia 30 días..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Notas internas</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notas adicionales..." rows={2} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 resize-none" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Adjuntar presupuesto</label>
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-slate-400 transition-colors bg-slate-50">
                      {uploadedFile ? (
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <FileUp size={18} className="text-slate-600" />
                            <span className="text-sm font-medium text-slate-900">{uploadedFile.name}</span>
                            <span className="text-xs text-slate-500">({(uploadedFile.size / 1024).toFixed(0)} KB)</span>
                          </div>
                          <button onClick={() => setUploadedFile(null)} className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"><X size={16} /></button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <Upload size={28} className="text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">Haz clic para seleccionar</p>
                          <p className="text-xs text-slate-400">PDF, JPG, PNG (máx. 10MB)</p>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Totals */}
                <div className="bg-slate-900 rounded-2xl shadow-lg p-6 text-white">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">Total de la orden</p>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Base imponible</span>
                      <span className="font-semibold">{formatCurrency(totals.baseAmount)} {getCurrencySymbol()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">IVA</span>
                      <span className="font-semibold text-emerald-400">+{formatCurrency(totals.vatAmount)} {getCurrencySymbol()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">IRPF</span>
                      <span className="font-semibold text-red-400">-{formatCurrency(totals.irpfAmount)} {getCurrencySymbol()}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total</span>
                      <span className="text-2xl font-bold">{formatCurrency(totals.totalAmount)} {getCurrencySymbol()}</span>
                    </div>
                  </div>
                </div>

                {/* Approval Preview */}
                <div className={`border rounded-xl p-4 ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-start gap-3">
                    {approvalPreview.autoApprove ? <CheckCircle size={18} className="text-emerald-600 mt-0.5" /> : <AlertCircle size={18} className="text-amber-600 mt-0.5" />}
                    <div>
                      <p className={`font-semibold text-sm ${approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"}`}>{approvalPreview.autoApprove ? "Aprobación automática" : "Requiere aprobación"}</p>
                      <p className={`text-xs mt-1 ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>{approvalPreview.message}</p>
                      {!approvalPreview.autoApprove && approvalPreview.steps && (
                        <div className="mt-2 space-y-1">
                          {approvalPreview.steps.map((step, idx) => (
                            <div key={step.id} className="text-xs text-amber-700 flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-semibold text-[10px]">{idx + 1}</span>
                              <span>{step.approverType === "role" && step.roles ? step.roles.join(", ") : step.approverType}{step.approvers.length > 0 && ` (${step.approvers.length})`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Acciones</p>

                  <div className="space-y-3">
                    <button onClick={() => savePO("pending")} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                      {saving ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Guardando...</>) : (<><Send size={18} />{approvalPreview.autoApprove ? "Crear PO" : "Enviar para aprobación"}</>)}
                    </button>

                    <button onClick={() => savePO("draft")} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors disabled:opacity-50">
                      <Save size={18} />
                      Guardar borrador
                    </button>

                    <Link href={`/project/${id}/accounting/pos`} className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 font-medium transition-colors">
                      <ArrowLeft size={18} />
                      Cancelar
                    </Link>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex gap-2">
                    <Info size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600">
                      <p className="font-semibold mb-1">Proceso de aprobación</p>
                      <ul className="space-y-1 text-slate-500">
                        <li>• Borradores no comprometen presupuesto</li>
                        <li>• POs pendientes requieren aprobación</li>
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Seleccionar proveedor</h2>
              <button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar por nombre o NIF..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" autoFocus />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSuppliers.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No se encontraron proveedores</p>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <button key={supplier.id} onClick={() => selectSupplier(supplier)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{supplier.fiscalName}</p>
                          {supplier.commercialName && <p className="text-sm text-slate-500">{supplier.commercialName}</p>}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Hash size={12} />{supplier.taxId}</span>
                            <span>{supplier.country}</span>
                          </div>
                        </div>
                        <Building2 size={18} className="text-slate-400 group-hover:text-slate-600" />
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Seleccionar cuenta presupuestaria</h2>
              <button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar por código o descripción..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" autoFocus />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No se encontraron cuentas</p>
                ) : (
                  filteredSubAccounts.map((subAccount) => (
                    <button key={subAccount.id} onClick={() => selectAccount(subAccount)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-mono font-semibold text-slate-900">{subAccount.code}</p>
                          <p className="text-sm text-slate-700">{subAccount.description}</p>
                          <p className="text-xs text-slate-500 mt-1">{subAccount.accountCode} - {subAccount.accountDescription}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-slate-500">Presupuestado</p>
                          <p className="font-semibold text-slate-900">{formatCurrency(subAccount.budgeted)} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Comprometido</p>
                          <p className="font-semibold text-amber-600">{formatCurrency(subAccount.committed)} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Realizado</p>
                          <p className="font-semibold text-emerald-600">{formatCurrency(subAccount.actual)} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Disponible</p>
                          <p className={`font-bold ${subAccount.available < 0 ? "text-red-600" : subAccount.available < subAccount.budgeted * 0.1 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(subAccount.available)} €</p>
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

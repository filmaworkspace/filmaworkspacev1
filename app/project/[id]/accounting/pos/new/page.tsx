"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
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
  CheckCircle2,
  Clock,
  Users,
  ChevronRight,
  AlertTriangle,
  Circle,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
  approverNames: string[];
  roles?: string[];
  department?: string;
  approvedBy: string[];
  rejectedBy: string[];
  status: "pending" | "approved" | "rejected";
  requireAll: boolean;
}

interface Member {
  userId: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  position?: string;
}

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart, description: "Equipos, vehículos, espacios" },
  { value: "purchase", label: "Compra", icon: Package, description: "Material, consumibles" },
  { value: "service", label: "Servicio", icon: Wrench, description: "Trabajos, honorarios" },
  { value: "deposit", label: "Fianza", icon: Shield, description: "Depósitos de garantía" },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR", symbol: "€" },
  { value: "USD", label: "USD", symbol: "$" },
  { value: "GBP", label: "GBP", symbol: "£" },
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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    calculateTotals();
  }, [items]);

  // Real-time validation
  useEffect(() => {
    if (Object.keys(touched).length > 0) {
      validateForm(true);
    }
  }, [formData, items, uploadedFile]);

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
      const membersData: Member[] = [];
      for (const memberDocSnap of membersSnapshot.docs) {
        const memberData = memberDocSnap.data();
        // Try to get user name from users collection
        let name = memberData.name || memberData.email || memberDocSnap.id;
        try {
          const userDoc = await getDoc(doc(db, "users", memberDocSnap.id));
          if (userDoc.exists()) {
            name = userDoc.data().displayName || userDoc.data().email || name;
          }
        } catch (e) {
          // Use fallback name
        }
        membersData.push({
          userId: memberDocSnap.id,
          name,
          email: memberData.email,
          role: memberData.role,
          department: memberData.department,
          position: memberData.position,
        });
      }
      setMembers(membersData);

      const approvalConfigDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (approvalConfigDoc.exists()) {
        setApprovalConfig(approvalConfigDoc.data().poApprovals || []);
      } else {
        setApprovalConfig([
          { id: "default-1", order: 1, approverType: "role", roles: ["PM", "EP"], requireAll: false },
        ]);
      }

      const suppliersSnapshot = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc"))
      );
      setSuppliers(
        suppliersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Supplier))
      );

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

  const resolveApprovers = (step: ApprovalStep, dept?: string): { ids: string[]; names: string[] } => {
    let approverIds: string[] = [];
    switch (step.approverType) {
      case "fixed":
        approverIds = step.approvers || [];
        break;
      case "role":
        approverIds = members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId);
        break;
      case "hod":
        approverIds = members
          .filter((m) => m.position === "HOD" && m.department === (step.department || dept))
          .map((m) => m.userId);
        break;
      case "coordinator":
        approverIds = members
          .filter((m) => m.position === "Coordinator" && m.department === (step.department || dept))
          .map((m) => m.userId);
        break;
    }
    const approverNames = approverIds.map((id) => {
      const member = members.find((m) => m.userId === id);
      return member?.name || member?.email || id;
    });
    return { ids: approverIds, names: approverNames };
  };

  const generateApprovalSteps = (dept?: string): ApprovalStepStatus[] => {
    if (approvalConfig.length === 0) return [];
    return approvalConfig.map((step) => {
      const { ids, names } = resolveApprovers(step, dept);
      return {
        id: step.id || "",
        order: step.order || 0,
        approverType: step.approverType || "fixed",
        approvers: ids,
        approverNames: names,
        roles: step.roles || [],
        department: step.department || "",
        approvedBy: [],
        rejectedBy: [],
        status: "pending" as const,
        requireAll: step.requireAll ?? false,
      };
    });
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
    setTouched((prev) => ({ ...prev, [`item_${index}_${field}`]: true }));
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
    setFormData({
      ...formData,
      supplier: supplier.id,
      supplierName: supplier.fiscalName,
      paymentTerms: supplier.paymentMethod,
    });
    setTouched((prev) => ({ ...prev, supplier: true }));
    setShowSupplierModal(false);
    setSupplierSearch("");
  };

  const selectAccount = (subAccount: SubAccount) => {
    if (currentItemIndex !== null) {
      const newItems = [...items];
      newItems[currentItemIndex] = {
        ...newItems[currentItemIndex],
        subAccountId: subAccount.id,
        subAccountCode: subAccount.code,
        subAccountDescription: subAccount.description,
      };
      setItems(newItems);
      setTouched((prev) => ({ ...prev, [`item_${currentItemIndex}_account`]: true }));
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  const validateForm = (silent = false) => {
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
    if (!silent) setErrors(newErrors);
    else setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleFileUpload = (file: File) => {
    if (
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      alert("Solo PDF o imágenes hasta 10MB");
      return;
    }
    setUploadedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

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
      setSuccessMessage(
        poData.status === "approved"
          ? "PO aprobada automáticamente"
          : poData.status === "pending"
          ? "PO enviada para aprobación"
          : "Borrador guardado"
      );
      setTimeout(() => router.push(`/project/${id}/accounting/pos`), 1500);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getCurrencySymbol = () =>
    CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0)
      return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    const steps = generateApprovalSteps(formData.department);
    if (steps.every((s) => s.approvers.length === 0))
      return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    return {
      autoApprove: false,
      message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`,
      steps,
    };
  };

  // Calculate form completion percentage
  const getCompletionPercentage = () => {
    let completed = 0;
    let total = 4; // supplier, department, description, at least one valid item

    if (formData.supplier) completed++;
    if (formData.department) completed++;
    if (formData.generalDescription.trim()) completed++;
    
    const validItems = items.filter(
      (item) => item.description.trim() && item.subAccountId && item.quantity > 0 && item.unitPrice > 0
    );
    if (validItems.length > 0) completed++;

    return Math.round((completed / total) * 100);
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.taxId.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredSubAccounts = subAccounts.filter(
    (s) =>
      s.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const approvalPreview = getApprovalPreview();
  const completionPercentage = getCompletionPercentage();

  // Check if field has error and was touched
  const hasError = (field: string) => touched[field] && errors[field];
  const isValid = (field: string) => touched[field] && !errors[field];

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
                href="/dashboard"
                className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft size={12} />
                Proyectos
              </Link>
              <span className="text-slate-300">·</span>
              <Link
                href={`/project/${id}/accounting/pos`}
                className="hover:text-slate-900 transition-colors"
              >
                Órdenes de compra
              </Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <FileText size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Nueva orden de compra</h1>
                <p className="text-slate-500 text-sm mt-0.5">PO-{nextPONumber} · {userName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => savePO("draft")}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save size={16} />
                Borrador
              </button>
              <button
                onClick={() => savePO("pending")}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    {approvalPreview.autoApprove ? <CheckCircle size={16} /> : <Send size={16} />}
                    {approvalPreview.autoApprove ? "Crear PO" : "Enviar"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
            <CheckCircle size={18} className="text-emerald-600" />
            <span className="text-sm text-emerald-700 font-medium">{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Información básica</h2>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Proveedor *
                  </label>
                  <button
                    onClick={() => setShowSupplierModal(true)}
                    onBlur={() => handleBlur("supplier")}
                    className={`w-full px-4 py-3 border ${
                      hasError("supplier")
                        ? "border-red-300 bg-red-50"
                        : isValid("supplier")
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200"
                    } rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between bg-white`}
                  >
                    {formData.supplierName ? (
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 ${isValid("supplier") ? "bg-emerald-100" : "bg-slate-100"} rounded-lg flex items-center justify-center`}>
                          {isValid("supplier") ? (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          ) : (
                            <Building2 size={16} className="text-slate-500" />
                          )}
                        </div>
                        <span className="font-medium text-slate-900">{formData.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Seleccionar proveedor...</span>
                    )}
                    <Search size={16} className="text-slate-400" />
                  </button>
                  {hasError("supplier") && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.supplier}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Departamento *
                    </label>
                    <div className="relative">
                      <select
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        onBlur={() => handleBlur("department")}
                        disabled={!!userDepartment && userRole !== "EP" && userRole !== "PM"}
                        className={`w-full px-4 py-3 border ${
                          hasError("department")
                            ? "border-red-300 bg-red-50"
                            : isValid("department")
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200"
                        } rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white disabled:bg-slate-50 text-sm pr-10`}
                      >
                        <option value="">Seleccionar...</option>
                        {departments.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                      {isValid("department") && (
                        <CheckCircle2 size={16} className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-600" />
                      )}
                    </div>
                    {hasError("department") && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {errors.department}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Tipo de PO
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PO_TYPES.map((type) => {
                        const Icon = type.icon;
                        const isSelected = formData.poType === type.value;
                        return (
                          <button
                            key={type.value}
                            onClick={() => setFormData({ ...formData, poType: type.value as any })}
                            className={`px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm ${
                              isSelected
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                            }`}
                            title={type.description}
                          >
                            <Icon size={14} />
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
                      <button
                        key={currency.value}
                        onClick={() => setFormData({ ...formData, currency: currency.value })}
                        className={`flex-1 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${
                          formData.currency === currency.value
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                        }`}
                      >
                        {currency.symbol} {currency.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Descripción general *
                  </label>
                  <div className="relative">
                    <textarea
                      value={formData.generalDescription}
                      onChange={(e) =>
                        setFormData({ ...formData, generalDescription: e.target.value })
                      }
                      onBlur={() => handleBlur("generalDescription")}
                      placeholder="Describe el propósito de esta orden de compra..."
                      rows={3}
                      className={`w-full px-4 py-3 border ${
                        hasError("generalDescription")
                          ? "border-red-300 bg-red-50"
                          : isValid("generalDescription")
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200"
                      } rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white resize-none text-sm pr-10`}
                    />
                    {isValid("generalDescription") && (
                      <CheckCircle2 size={16} className="absolute right-4 top-4 text-emerald-600" />
                    )}
                  </div>
                  {hasError("generalDescription") && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.generalDescription}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-900">Items</h2>
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                    {items.length}
                  </span>
                </div>
                <button
                  onClick={addItem}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <Plus size={14} />
                  Añadir
                </button>
              </div>

              <div className="p-6 space-y-4">
                {items.map((item, index) => {
                  const itemHasAllFields = item.description.trim() && item.subAccountId && item.quantity > 0 && item.unitPrice > 0;
                  
                  return (
                    <div
                      key={item.id}
                      className={`border rounded-xl p-5 transition-all ${
                        itemHasAllFields
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-slate-200 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            {itemHasAllFields ? (
                              <CheckCircle2 size={12} className="text-emerald-600" />
                            ) : (
                              <Hash size={12} />
                            )}
                            Item {index + 1}
                          </span>
                          {itemHasAllFields && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-medium">
                              Completo
                            </span>
                          )}
                        </div>
                        {items.length > 1 && (
                          <button
                            onClick={() => removeItem(index)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value)}
                          onBlur={() => handleBlur(`item_${index}_description`)}
                          placeholder="Descripción del item..."
                          className={`w-full px-4 py-3 border ${
                            hasError(`item_${index}_description`)
                              ? "border-red-300 bg-red-50"
                              : item.description.trim()
                              ? "border-emerald-200"
                              : "border-slate-200"
                          } rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white`}
                        />

                        <button
                          onClick={() => {
                            setCurrentItemIndex(index);
                            setShowAccountModal(true);
                          }}
                          className={`w-full px-4 py-3 border ${
                            hasError(`item_${index}_account`)
                              ? "border-red-300 bg-red-50"
                              : item.subAccountCode
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200"
                          } rounded-xl text-sm text-left flex items-center justify-between hover:border-slate-300 transition-colors bg-white`}
                        >
                          {item.subAccountCode ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={14} className="text-emerald-600" />
                              <span className="font-mono text-slate-900">
                                {item.subAccountCode} - {item.subAccountDescription}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Seleccionar cuenta...</span>
                          )}
                          <Search size={14} className="text-slate-400" />
                        </button>

                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">Fecha</label>
                            <input
                              type="date"
                              value={item.date}
                              onChange={(e) => updateItem(index, "date", e.target.value)}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">Cantidad</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(index, "quantity", parseFloat(e.target.value) || 0)
                              }
                              className={`w-full px-3 py-2.5 border ${
                                item.quantity > 0 ? "border-emerald-200" : "border-slate-200"
                              } rounded-xl text-sm bg-white`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">Precio unit.</label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)
                                }
                                className={`w-full pl-6 pr-3 py-2.5 border ${
                                  item.unitPrice > 0 ? "border-emerald-200" : "border-slate-200"
                                } rounded-xl text-sm bg-white`}
                              />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                                {getCurrencySymbol()}
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">Base</label>
                            <div className="px-3 py-2.5 bg-slate-100 rounded-xl text-sm font-medium text-slate-900">
                              {formatCurrency(item.baseAmount)} {getCurrencySymbol()}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">IVA</label>
                            <select
                              value={item.vatRate}
                              onChange={(e) =>
                                updateItem(index, "vatRate", parseFloat(e.target.value))
                              }
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                            >
                              {VAT_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">IRPF</label>
                            <select
                              value={item.irpfRate}
                              onChange={(e) =>
                                updateItem(index, "irpfRate", parseFloat(e.target.value))
                              }
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                            >
                              {IRPF_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">+IVA</label>
                            <div className="px-3 py-2.5 bg-emerald-50 rounded-xl text-sm font-medium text-emerald-700">
                              +{formatCurrency(item.vatAmount)}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">-IRPF</label>
                            <div className="px-3 py-2.5 bg-red-50 rounded-xl text-sm font-medium text-red-700">
                              -{formatCurrency(item.irpfAmount)}
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm">
                            <span className="text-slate-400">Total:</span>
                            <span className="ml-2 font-semibold">
                              {formatCurrency(item.totalAmount)} {getCurrencySymbol()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* File Upload */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Adjuntar presupuesto</h2>
                <p className="text-xs text-slate-500 mt-0.5">Opcional - PDF, JPG o PNG hasta 10MB</p>
              </div>

              <div className="p-6">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-50"
                      : uploadedFile
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {uploadedFile ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <FileUp size={18} className="text-emerald-600" />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-medium text-slate-900 block">
                            {uploadedFile.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {(uploadedFile.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Upload size={20} className="text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-700">Arrastra o haz clic para subir</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG (máx. 10MB)</p>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Información adicional</h2>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Condiciones de pago
                  </label>
                  <input
                    type="text"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    placeholder="Ej: Transferencia 30 días..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notas internas
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales..."
                    rows={2}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white resize-none text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 space-y-4">
              {/* Progress */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">Progreso</span>
                  <span className={`text-sm font-bold ${completionPercentage === 100 ? "text-emerald-600" : "text-slate-900"}`}>
                    {completionPercentage}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      completionPercentage === 100 ? "bg-emerald-500" : "bg-indigo-500"
                    }`}
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    {formData.supplier ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <Circle size={12} className="text-slate-300" />
                    )}
                    <span className={formData.supplier ? "text-slate-700" : "text-slate-400"}>Proveedor</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {formData.department ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <Circle size={12} className="text-slate-300" />
                    )}
                    <span className={formData.department ? "text-slate-700" : "text-slate-400"}>Departamento</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {formData.generalDescription.trim() ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <Circle size={12} className="text-slate-300" />
                    )}
                    <span className={formData.generalDescription.trim() ? "text-slate-700" : "text-slate-400"}>Descripción</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0) ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <Circle size={12} className="text-slate-300" />
                    )}
                    <span className={items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0) ? "text-slate-700" : "text-slate-400"}>
                      Items válidos
                    </span>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Total de la orden</h2>
                </div>

                <div className="p-6">
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Base imponible</span>
                      <span className="font-medium text-slate-900">
                        {formatCurrency(totals.baseAmount)} {getCurrencySymbol()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">IVA</span>
                      <span className="font-medium text-emerald-600">
                        +{formatCurrency(totals.vatAmount)} {getCurrencySymbol()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">IRPF</span>
                      <span className="font-medium text-red-600">
                        -{formatCurrency(totals.irpfAmount)} {getCurrencySymbol()}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-slate-900">Total</span>
                      <span className="text-xl font-bold text-slate-900">
                        {formatCurrency(totals.totalAmount)} {getCurrencySymbol()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Approval Preview */}
              <div
                className={`border rounded-2xl overflow-hidden ${
                  approvalPreview.autoApprove
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-amber-50 border-amber-200"
                }`}
              >
                <div className="px-5 py-4 border-b border-opacity-50" style={{ borderColor: approvalPreview.autoApprove ? "#a7f3d0" : "#fcd34d" }}>
                  <div className="flex items-center gap-3">
                    {approvalPreview.autoApprove ? (
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <CheckCircle size={20} className="text-emerald-600" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                        <Clock size={20} className="text-amber-600" />
                      </div>
                    )}
                    <div>
                      <p className={`font-semibold ${approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"}`}>
                        {approvalPreview.autoApprove ? "Aprobación automática" : "Requiere aprobación"}
                      </p>
                      <p className={`text-sm ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>
                        {approvalPreview.message}
                      </p>
                    </div>
                  </div>
                </div>

                {!approvalPreview.autoApprove && approvalPreview.steps && approvalPreview.steps.length > 0 && (
                  <div className="px-5 py-4">
                    <div className="space-y-3">
                      {approvalPreview.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </div>
                            {idx < approvalPreview.steps!.length - 1 && (
                              <div className="w-0.5 h-8 bg-amber-200 mt-1" />
                            )}
                          </div>
                          <div className="flex-1 pt-0.5">
                            <p className="text-sm font-medium text-amber-900">
                              {step.approverType === "role" && step.roles
                                ? step.roles.join(", ")
                                : step.approverType === "hod"
                                ? "Jefe de departamento"
                                : step.approverType === "coordinator"
                                ? "Coordinador"
                                : "Aprobador fijo"}
                            </p>
                            {step.approverNames.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {step.approverNames.slice(0, 3).map((name, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg"
                                  >
                                    <Users size={10} />
                                    {name.split(" ")[0]}
                                  </span>
                                ))}
                                {step.approverNames.length > 3 && (
                                  <span className="text-xs text-amber-700">
                                    +{step.approverNames.length - 3} más
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-amber-700 mt-1">
                              {step.requireAll
                                ? "Todos deben aprobar"
                                : `1 de ${step.approvers.length} debe aprobar`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Info size={14} className="text-slate-500" />
                  </div>
                  <div className="text-sm text-slate-600">
                    <p className="font-medium text-slate-700 mb-2">Proceso de la PO</p>
                    <ul className="space-y-1.5 text-slate-500">
                      <li className="flex items-start gap-2">
                        <ChevronRight size={12} className="mt-0.5 flex-shrink-0" />
                        <span>Los borradores no comprometen presupuesto</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <ChevronRight size={12} className="mt-0.5 flex-shrink-0" />
                        <span>Una vez aprobada, se compromete el presupuesto</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <ChevronRight size={12} className="mt-0.5 flex-shrink-0" />
                        <span>Las facturas se vinculan a la PO aprobada</span>
                      </li>
                    </ul>
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h2>
              <button
                onClick={() => {
                  setShowSupplierModal(false);
                  setSupplierSearch("");
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Buscar por nombre o NIF..."
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
                  autoFocus
                />
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredSuppliers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Building2 size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No se encontraron proveedores</p>
                  </div>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      onClick={() => selectSupplier(supplier)}
                      className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{supplier.fiscalName}</p>
                          {supplier.commercialName && (
                            <p className="text-sm text-slate-500">{supplier.commercialName}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                            <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                              <Hash size={10} />
                              {supplier.taxId}
                            </span>
                            <span>{supplier.country}</span>
                          </div>
                        </div>
                        <Building2 size={16} className="text-slate-300 group-hover:text-slate-400" />
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Seleccionar cuenta presupuestaria
              </h2>
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  setAccountSearch("");
                  setCurrentItemIndex(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Buscar por código o descripción..."
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
                  autoFocus
                />
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Hash size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No se encontraron cuentas</p>
                  </div>
                ) : (
                  filteredSubAccounts.map((subAccount) => {
                    const isLowBudget = subAccount.available < subAccount.budgeted * 0.1;
                    const isOverBudget = subAccount.available < 0;
                    
                    return (
                      <button
                        key={subAccount.id}
                        onClick={() => selectAccount(subAccount)}
                        className={`w-full text-left p-4 border rounded-xl hover:bg-slate-50 transition-all ${
                          isOverBudget
                            ? "border-red-200 bg-red-50/50"
                            : isLowBudget
                            ? "border-amber-200 bg-amber-50/50"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-mono font-semibold text-slate-900">{subAccount.code}</p>
                              {isOverBudget && (
                                <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg">
                                  <AlertTriangle size={10} />
                                  Sin presupuesto
                                </span>
                              )}
                              {!isOverBudget && isLowBudget && (
                                <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg">
                                  <AlertTriangle size={10} />
                                  Bajo
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-700">{subAccount.description}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {subAccount.accountCode} - {subAccount.accountDescription}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-xs">
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-slate-500">Presupuestado</p>
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(subAccount.budgeted)} €
                            </p>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-2">
                            <p className="text-amber-600">Comprometido</p>
                            <p className="font-semibold text-amber-700">
                              {formatCurrency(subAccount.committed)} €
                            </p>
                          </div>
                          <div className="bg-emerald-50 rounded-lg p-2">
                            <p className="text-emerald-600">Realizado</p>
                            <p className="font-semibold text-emerald-700">
                              {formatCurrency(subAccount.actual)} €
                            </p>
                          </div>
                          <div className={`rounded-lg p-2 ${
                            isOverBudget
                              ? "bg-red-50"
                              : isLowBudget
                              ? "bg-amber-50"
                              : "bg-emerald-50"
                          }`}>
                            <p className={`${
                              isOverBudget
                                ? "text-red-600"
                                : isLowBudget
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}>Disponible</p>
                            <p className={`font-semibold ${
                              isOverBudget
                                ? "text-red-700"
                                : isLowBudget
                                ? "text-amber-700"
                                : "text-emerald-700"
                            }`}>
                              {formatCurrency(subAccount.available)} €
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, addDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  FileText, ArrowLeft, Save, Send, Building2, AlertCircle, Info, Upload, X, Plus,
  Trash2, Search, Hash, FileUp, ShoppingCart, Package, Wrench, Shield, CheckCircle,
  CheckCircle2, Clock, Users, ChevronRight, AlertTriangle, Circle, ShieldAlert, Lock
} from "lucide-react";
import { useAccountingPermissions } from "@/hooks/useAccountingPermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Supplier { id: string; fiscalName: string; commercialName: string; country: string; taxId: string; paymentMethod: string; }
interface SubAccount { id: string; code: string; description: string; budgeted: number; committed: number; actual: number; available: number; accountId: string; accountCode: string; accountDescription: string; }
interface POItem { id: string; description: string; subAccountId: string; subAccountCode: string; subAccountDescription: string; date: string; quantity: number; unitPrice: number; baseAmount: number; vatRate: number; vatAmount: number; irpfRate: number; irpfAmount: number; totalAmount: number; }
interface ApprovalStep { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers?: string[]; roles?: string[]; department?: string; requireAll: boolean; hasAmountThreshold?: boolean; amountThreshold?: number; amountCondition?: "above" | "below" | "between"; amountThresholdMax?: number; }
interface ApprovalStepStatus { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers: string[]; approverNames: string[]; roles?: string[]; department?: string; approvedBy: string[]; rejectedBy: string[]; status: "pending" | "approved" | "rejected"; requireAll: boolean; }
interface Member { userId: string; name?: string; email?: string; role?: string; department?: string; position?: string; }

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart, description: "Equipos, vehículos, espacios" },
  { value: "purchase", label: "Compra", icon: Package, description: "Material, consumibles" },
  { value: "service", label: "Servicio", icon: Wrench, description: "Trabajos, honorarios" },
  { value: "deposit", label: "Fianza", icon: Shield, description: "Depósitos de garantía" },
];
const CURRENCIES = [{ value: "EUR", label: "EUR", symbol: "€" }, { value: "USD", label: "USD", symbol: "$" }, { value: "GBP", label: "GBP", symbol: "£" }];
const VAT_RATES = [{ value: 0, label: "0%" }, { value: 4, label: "4%" }, { value: 10, label: "10%" }, { value: 21, label: "21%" }];
const IRPF_RATES = [{ value: 0, label: "0%" }, { value: 7, label: "7%" }, { value: 15, label: "15%" }, { value: 19, label: "19%" }];

export default function NewPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { loading: permissionsLoading, error: permissionsError, permissions, getDepartmentForNewPO, getAvailableDepartments } = useAccountingPermissions(id);

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const [formData, setFormData] = useState({ supplier: "", supplierName: "", department: "", poType: "service" as "rental" | "purchase" | "service" | "deposit", currency: "EUR", generalDescription: "", paymentTerms: "", notes: "" });
  const [items, setItems] = useState<POItem[]>([{ id: "1", description: "", subAccountId: "", subAccountCode: "", subAccountDescription: "", date: new Date().toISOString().split("T")[0], quantity: 1, unitPrice: 0, baseAmount: 0, vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0 }]);
  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });

  useEffect(() => { if (!permissionsLoading && permissions.fixedDepartment) setFormData(prev => ({ ...prev, department: permissions.fixedDepartment || "" })); }, [permissionsLoading, permissions.fixedDepartment]);
  useEffect(() => { if (!permissionsLoading && id) loadData(); }, [permissionsLoading, id]);
  useEffect(() => { calculateTotals(); }, [items]);
  useEffect(() => { if (Object.keys(touched).length > 0) validateForm(true); }, [formData, items]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) { setProjectName(projectDoc.data().name || "Proyecto"); setDepartments(projectDoc.data().departments || []); }

      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      const membersData: Member[] = [];
      for (const memberDocSnap of membersSnapshot.docs) {
        const memberData = memberDocSnap.data();
        let name = memberData.name || memberData.email || memberDocSnap.id;
        try { const userDoc = await getDoc(doc(db, "users", memberDocSnap.id)); if (userDoc.exists()) name = userDoc.data().displayName || userDoc.data().email || name; } catch (e) {}
        membersData.push({ userId: memberDocSnap.id, name, email: memberData.email, role: memberData.role, department: memberData.department, position: memberData.position });
      }
      setMembers(membersData);

      const approvalConfigDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      setApprovalConfig(approvalConfigDoc.exists() ? approvalConfigDoc.data().poApprovals || [] : [{ id: "default-1", order: 1, approverType: "role", roles: ["PM", "EP"], requireAll: false }]);

      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      setSuppliers(suppliersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Supplier)));

      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          allSubAccounts.push({ id: subDoc.id, code: data.code, description: data.description, budgeted: data.budgeted || 0, committed: data.committed || 0, actual: data.actual || 0, available: (data.budgeted || 0) - (data.committed || 0) - (data.actual || 0), accountId: accountDoc.id, accountCode: accountData.code, accountDescription: accountData.description });
        });
      }
      setSubAccounts(allSubAccounts);

      const posSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
      setNextPONumber(String(posSnapshot.size + 1).padStart(4, "0"));
    } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
  };

  const resolveApprovers = (step: ApprovalStep, dept?: string): { ids: string[]; names: string[] } => {
    let approverIds: string[] = [];
    switch (step.approverType) {
      case "fixed": approverIds = step.approvers || []; break;
      case "role": approverIds = members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId); break;
      case "hod": approverIds = members.filter((m) => m.position === "HOD" && m.department === (step.department || dept)).map((m) => m.userId); break;
      case "coordinator": approverIds = members.filter((m) => m.position === "Coordinator" && m.department === (step.department || dept)).map((m) => m.userId); break;
    }
    return { ids: approverIds, names: approverIds.map((uid) => members.find((m) => m.userId === uid)?.name || uid) };
  };

  const generateApprovalSteps = (dept?: string, amount?: number): ApprovalStepStatus[] => {
    if (approvalConfig.length === 0) return [];
    const applicableSteps = approvalConfig.filter(step => {
      if (!step.hasAmountThreshold || !step.amountThreshold) return true;
      if (!amount) return true;
      switch (step.amountCondition) {
        case "above": return amount > step.amountThreshold;
        case "below": return amount < step.amountThreshold;
        case "between": return amount >= step.amountThreshold && amount <= (step.amountThresholdMax || Infinity);
        default: return true;
      }
    });
    return applicableSteps.map((step) => { const { ids, names } = resolveApprovers(step, dept); return { id: step.id || "", order: step.order || 0, approverType: step.approverType || "fixed", approvers: ids, approverNames: names, roles: step.roles || [], department: step.department || "", approvedBy: [], rejectedBy: [], status: "pending" as const, requireAll: step.requireAll ?? false }; });
  };

  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean => steps.length === 0 || steps.every((step) => step.approvers.length === 0);

  const calculateItemTotal = (item: POItem) => { const baseAmount = item.quantity * item.unitPrice; const vatAmount = baseAmount * (item.vatRate / 100); const irpfAmount = baseAmount * (item.irpfRate / 100); return { baseAmount, vatAmount, irpfAmount, totalAmount: baseAmount + vatAmount - irpfAmount }; };

  const updateItem = (index: number, field: keyof POItem, value: any) => { const newItems = [...items]; newItems[index] = { ...newItems[index], [field]: value }; const calc = calculateItemTotal(newItems[index]); newItems[index] = { ...newItems[index], ...calc }; setItems(newItems); setTouched((prev) => ({ ...prev, [`item_${index}_${field}`]: true })); };

  const addItem = () => { setItems([...items, { id: String(items.length + 1), description: "", subAccountId: "", subAccountCode: "", subAccountDescription: "", date: new Date().toISOString().split("T")[0], quantity: 1, unitPrice: 0, baseAmount: 0, vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0 }]); };

  const removeItem = (index: number) => { if (items.length === 1) return; setItems(items.filter((_, i) => i !== index)); };

  const calculateTotals = () => { setTotals({ baseAmount: items.reduce((sum, item) => sum + item.baseAmount, 0), vatAmount: items.reduce((sum, item) => sum + item.vatAmount, 0), irpfAmount: items.reduce((sum, item) => sum + item.irpfAmount, 0), totalAmount: items.reduce((sum, item) => sum + item.totalAmount, 0) }); };

  const selectSupplier = (supplier: Supplier) => { setFormData({ ...formData, supplier: supplier.id, supplierName: supplier.fiscalName, paymentTerms: supplier.paymentMethod }); setTouched((prev) => ({ ...prev, supplier: true })); setShowSupplierModal(false); setSupplierSearch(""); };

  const selectAccount = (subAccount: SubAccount) => { if (currentItemIndex !== null) { const newItems = [...items]; newItems[currentItemIndex] = { ...newItems[currentItemIndex], subAccountId: subAccount.id, subAccountCode: subAccount.code, subAccountDescription: subAccount.description }; setItems(newItems); setTouched((prev) => ({ ...prev, [`item_${currentItemIndex}_account`]: true })); } setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); };

  const validateForm = (silent = false) => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplier) newErrors.supplier = "Selecciona un proveedor";
    if (!formData.department) newErrors.department = "Selecciona un departamento";
    if (!formData.generalDescription.trim()) newErrors.generalDescription = "Descripción obligatoria";
    items.forEach((item, index) => { if (!item.description.trim()) newErrors[`item_${index}_description`] = "Obligatorio"; if (!item.subAccountId) newErrors[`item_${index}_account`] = "Obligatorio"; if (item.quantity <= 0) newErrors[`item_${index}_quantity`] = "Debe ser > 0"; if (item.unitPrice <= 0) newErrors[`item_${index}_unitPrice`] = "Debe ser > 0"; });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const handleFileUpload = (file: File) => { if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) { alert("Solo PDF o imágenes hasta 10MB"); return; } setUploadedFile(file); };

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }, []);

  const savePO = async (status: "draft" | "pending") => {
    if (status === "pending" && !validateForm()) return;
    setSaving(true);
    try {
      let fileUrl = "";
      if (uploadedFile) { const fileRef = ref(storage, `projects/${id}/pos/${nextPONumber}/${uploadedFile.name}`); await uploadBytes(fileRef, uploadedFile); fileUrl = await getDownloadURL(fileRef); }

      const itemsData = items.map((item) => ({ description: item.description.trim(), subAccountId: item.subAccountId, subAccountCode: item.subAccountCode, subAccountDescription: item.subAccountDescription, date: item.date, quantity: item.quantity, unitPrice: item.unitPrice, baseAmount: item.baseAmount, vatRate: item.vatRate, vatAmount: item.vatAmount, irpfRate: item.irpfRate, irpfAmount: item.irpfAmount, totalAmount: item.totalAmount }));

      const poData: any = { number: nextPONumber, supplier: formData.supplierName, supplierId: formData.supplier, department: formData.department, poType: formData.poType, currency: formData.currency, generalDescription: formData.generalDescription.trim(), paymentTerms: formData.paymentTerms, notes: formData.notes.trim(), items: itemsData, baseAmount: totals.baseAmount, vatAmount: totals.vatAmount, irpfAmount: totals.irpfAmount, totalAmount: totals.totalAmount, attachmentUrl: fileUrl, attachmentFileName: uploadedFile?.name || "", createdAt: Timestamp.now(), createdBy: permissions.userId, createdByName: permissions.userName, version: 1 };

      if (status === "pending") {
        const approvalSteps = generateApprovalSteps(formData.department, totals.baseAmount);
        if (shouldAutoApprove(approvalSteps)) { poData.status = "approved"; poData.approvedAt = Timestamp.now(); poData.approvedBy = permissions.userId; poData.approvedByName = permissions.userName; poData.autoApproved = true; }
        else { poData.status = "pending"; poData.approvalSteps = approvalSteps; poData.currentApprovalStep = 0; }
      } else { poData.status = "draft"; }

      await addDoc(collection(db, `projects/${id}/pos`), poData);
      setSuccessMessage(poData.status === "approved" ? "PO aprobada automáticamente" : poData.status === "pending" ? "PO enviada para aprobación" : "Borrador guardado");
      setTimeout(() => router.push(`/project/${id}/accounting/pos`), 1500);
    } catch (error: any) { alert(`Error: ${error.message}`); } finally { setSaving(false); }
  };

  const getCurrencySymbol = () => CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";
  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    const steps = generateApprovalSteps(formData.department, totals.baseAmount);
    if (steps.every((s) => s.approvers.length === 0)) return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    return { autoApprove: false, message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`, steps };
  };

  const getCompletionPercentage = () => { let completed = 0; if (formData.supplier) completed++; if (formData.department) completed++; if (formData.generalDescription.trim()) completed++; if (items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0)) completed++; return Math.round((completed / 4) * 100); };

  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()));

  const availableDepartments = getAvailableDepartments(departments);
  const approvalPreview = getApprovalPreview();
  const completionPercentage = getCompletionPercentage();
  const hasError = (field: string) => touched[field] && errors[field];
  const isValid = (field: string) => touched[field] && !errors[field];

  if (permissionsLoading || loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>;

  if (permissionsError || !permissions.hasAccountingAccess || !permissions.canCreatePO) return (
    <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4"><ShieldAlert size={28} className="text-red-500" /></div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
        <p className="text-slate-500 mb-6">{permissionsError || "No tienes permisos para crear órdenes de compra"}</p>
        <Link href={`/project/${id}/accounting/pos`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"><ArrowLeft size={16} />Volver a POs</Link>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting/pos`} className="hover:text-slate-900 transition-colors">Órdenes de compra</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center"><FileText size={24} className="text-indigo-600" /></div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Nueva orden de compra</h1>
                <p className="text-slate-500 text-sm mt-0.5">PO-{nextPONumber} · {permissions.userName}{permissions.fixedDepartment && <span className="ml-2 text-indigo-600">· {permissions.fixedDepartment}</span>}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => savePO("draft")} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"><Save size={16} />Borrador</button>
              <button onClick={() => savePO("pending")} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : <>{approvalPreview.autoApprove ? <CheckCircle size={16} /> : <Send size={16} />}{approvalPreview.autoApprove ? "Crear PO" : "Enviar"}</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {successMessage && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3"><CheckCircle size={18} className="text-emerald-600" /><span className="text-sm text-emerald-700 font-medium">{successMessage}</span></div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Información básica</h2></div>
              <div className="p-6 space-y-5">
                {/* Proveedor */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Proveedor *</label>
                  <button onClick={() => setShowSupplierModal(true)} onBlur={() => handleBlur("supplier")} className={`w-full px-4 py-3 border ${hasError("supplier") ? "border-red-300 bg-red-50" : isValid("supplier") ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between bg-white`}>
                    {formData.supplierName ? <div className="flex items-center gap-3"><div className={`w-8 h-8 ${isValid("supplier") ? "bg-emerald-100" : "bg-slate-100"} rounded-lg flex items-center justify-center`}>{isValid("supplier") ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Building2 size={16} className="text-slate-500" />}</div><span className="font-medium text-slate-900">{formData.supplierName}</span></div> : <span className="text-slate-400">Seleccionar proveedor...</span>}
                    <Search size={16} className="text-slate-400" />
                  </button>
                  {hasError("supplier") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.supplier}</p>}
                </div>

                {/* Departamento y Tipo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Departamento *{permissions.fixedDepartment && <span className="ml-2 text-xs text-slate-400">(asignado)</span>}</label>
                    <div className="relative">
                      <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} onBlur={() => handleBlur("department")} disabled={!!permissions.fixedDepartment} className={`w-full px-4 py-3 border ${hasError("department") ? "border-red-300 bg-red-50" : isValid("department") ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed text-sm pr-10`}>
                        <option value="">Seleccionar...</option>
                        {availableDepartments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                      </select>
                      {isValid("department") && <CheckCircle2 size={16} className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-600" />}
                      {permissions.fixedDepartment && <Lock size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />}
                    </div>
                    {hasError("department") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.department}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de PO</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PO_TYPES.map((type) => { const Icon = type.icon; const isSelected = formData.poType === type.value; return (
                        <button key={type.value} onClick={() => setFormData({ ...formData, poType: type.value as any })} className={`px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm ${isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"}`} title={type.description}><Icon size={14} />{type.label}</button>
                      ); })}
                    </div>
                  </div>
                </div>

                {/* Moneda */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Moneda</label>
                  <div className="flex gap-2">
                    {CURRENCIES.map((currency) => <button key={currency.value} onClick={() => setFormData({ ...formData, currency: currency.value })} className={`flex-1 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${formData.currency === currency.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"}`}>{currency.symbol} {currency.label}</button>)}
                  </div>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Descripción general *</label>
                  <div className="relative">
                    <textarea value={formData.generalDescription} onChange={(e) => setFormData({ ...formData, generalDescription: e.target.value })} onBlur={() => handleBlur("generalDescription")} placeholder="Describe el propósito de esta orden de compra..." rows={3} className={`w-full px-4 py-3 border ${hasError("generalDescription") ? "border-red-300 bg-red-50" : isValid("generalDescription") ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white resize-none text-sm pr-10`} />
                    {isValid("generalDescription") && <CheckCircle2 size={16} className="absolute right-4 top-4 text-emerald-600" />}
                  </div>
                  {hasError("generalDescription") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.generalDescription}</p>}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3"><h2 className="font-semibold text-slate-900">Items</h2><span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">{items.length}</span></div>
                <button onClick={addItem} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"><Plus size={14} />Añadir</button>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <div key={item.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">Item {index + 1}</span>
                      {items.length > 1 && <button onClick={() => removeItem(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>}
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">Descripción *</label>
                          <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} onBlur={() => handleBlur(`item_${index}_description`)} placeholder="Describe el item..." className={`w-full px-3 py-2.5 border ${hasError(`item_${index}_description`) ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">Cuenta presupuestaria *</label>
                          <button onClick={() => { setCurrentItemIndex(index); setShowAccountModal(true); }} className={`w-full px-3 py-2.5 border ${hasError(`item_${index}_account`) ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between text-sm bg-white`}>
                            {item.subAccountCode ? <span className="font-medium text-slate-900">{item.subAccountCode} - {item.subAccountDescription}</span> : <span className="text-slate-400">Seleccionar cuenta...</span>}
                            <Search size={14} className="text-slate-400" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">Cantidad *</label>
                          <input type="number" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} min="0" step="0.01" className={`w-full px-3 py-2.5 border ${hasError(`item_${index}_quantity`) ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">Precio unitario *</label>
                          <div className="relative">
                            <input type="number" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} min="0" step="0.01" className={`w-full px-3 py-2.5 pr-8 border ${hasError(`item_${index}_unitPrice`) ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{getCurrencySymbol()}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">IVA</label>
                          <select value={item.vatRate} onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm bg-white">
                            {VAT_RATES.map((rate) => <option key={rate.value} value={rate.value}>{rate.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">IRPF</label>
                          <select value={item.irpfRate} onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm bg-white">
                            {IRPF_RATES.map((rate) => <option key={rate.value} value={rate.value}>{rate.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-6 pt-2 border-t border-slate-100">
                        <div className="text-right"><p className="text-xs text-slate-500">Base</p><p className="font-semibold text-slate-900">{formatCurrency(item.baseAmount)} {getCurrencySymbol()}</p></div>
                        {item.vatAmount > 0 && <div className="text-right"><p className="text-xs text-slate-500">IVA ({item.vatRate}%)</p><p className="font-medium text-slate-700">+{formatCurrency(item.vatAmount)} {getCurrencySymbol()}</p></div>}
                        {item.irpfAmount > 0 && <div className="text-right"><p className="text-xs text-slate-500">IRPF ({item.irpfRate}%)</p><p className="font-medium text-red-600">-{formatCurrency(item.irpfAmount)} {getCurrencySymbol()}</p></div>}
                        <div className="text-right pl-4 border-l border-slate-200"><p className="text-xs text-slate-500">Total item</p><p className="font-bold text-slate-900">{formatCurrency(item.totalAmount)} {getCurrencySymbol()}</p></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Attachment */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Adjunto</h2></div>
              <div className="p-6">
                {uploadedFile ? (
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3"><div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center"><FileUp size={18} className="text-indigo-600" /></div><div><p className="font-medium text-slate-900 text-sm">{uploadedFile.name}</p><p className="text-xs text-slate-500">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p></div></div>
                    <button onClick={() => setUploadedFile(null)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X size={18} /></button>
                  </div>
                ) : (
                  <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`border-2 border-dashed ${isDragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200"} rounded-xl p-8 text-center transition-colors`}>
                    <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-sm text-slate-600 mb-1">Arrastra un archivo aquí o</p>
                    <label className="cursor-pointer"><span className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">selecciona un archivo</span><input type="file" accept=".pdf,image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} className="hidden" /></label>
                    <p className="text-xs text-slate-400 mt-2">PDF o imágenes, máximo 10MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Notas adicionales</h2></div>
              <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-2">Condiciones de pago</label><input type="text" value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} placeholder="ej: 30 días fecha factura" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-2">Notas internas</label><textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notas adicionales para el equipo..." rows={3} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm" /></div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-slate-900">Progreso</h3><span className="text-2xl font-bold text-slate-900">{completionPercentage}%</span></div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4"><div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width: `${completionPercentage}%` }} /></div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">{formData.supplier ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-slate-300" />}<span className={formData.supplier ? "text-slate-700" : "text-slate-400"}>Proveedor seleccionado</span></div>
                <div className="flex items-center gap-2 text-sm">{formData.department ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-slate-300" />}<span className={formData.department ? "text-slate-700" : "text-slate-400"}>Departamento asignado</span></div>
                <div className="flex items-center gap-2 text-sm">{formData.generalDescription.trim() ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-slate-300" />}<span className={formData.generalDescription.trim() ? "text-slate-700" : "text-slate-400"}>Descripción completada</span></div>
                <div className="flex items-center gap-2 text-sm">{items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0) ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-slate-300" />}<span className={items.some((i) => i.description.trim() && i.subAccountId) ? "text-slate-700" : "text-slate-400"}>Items válidos</span></div>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Resumen</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Base imponible</span><span className="font-medium text-slate-900">{formatCurrency(totals.baseAmount)} {getCurrencySymbol()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">IVA</span><span className="font-medium text-slate-700">+{formatCurrency(totals.vatAmount)} {getCurrencySymbol()}</span></div>
                {totals.irpfAmount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">IRPF</span><span className="font-medium text-red-600">-{formatCurrency(totals.irpfAmount)} {getCurrencySymbol()}</span></div>}
                <div className="pt-3 border-t border-slate-200 flex justify-between"><span className="font-medium text-slate-700">Total</span><span className="text-xl font-bold text-slate-900">{formatCurrency(totals.totalAmount)} {getCurrencySymbol()}</span></div>
              </div>
            </div>

            {/* Approval Preview */}
            <div className={`border rounded-2xl p-6 ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${approvalPreview.autoApprove ? "bg-emerald-100" : "bg-amber-100"}`}>
                  {approvalPreview.autoApprove ? <CheckCircle size={20} className="text-emerald-600" /> : <Clock size={20} className="text-amber-600" />}
                </div>
                <div><h3 className={`font-semibold ${approvalPreview.autoApprove ? "text-emerald-900" : "text-amber-900"}`}>{approvalPreview.autoApprove ? "Auto-aprobación" : "Requiere aprobación"}</h3><p className={`text-sm ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>{approvalPreview.message}</p></div>
              </div>
              {!approvalPreview.autoApprove && approvalPreview.steps.length > 0 && (
                <div className="space-y-2 mt-4 pt-4 border-t border-amber-200">
                  {approvalPreview.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm text-amber-800">
                      <span className="w-5 h-5 bg-amber-200 rounded-full flex items-center justify-center text-xs font-medium">{i + 1}</span>
                      <span>{step.approverNames.length > 0 ? step.approverNames.join(", ") : "Sin aprobadores definidos"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h3><button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={18} /></button></div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar por nombre o CIF..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus /></div>
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {filteredSuppliers.length === 0 ? (
                <div className="p-8 text-center"><Building2 size={32} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500 text-sm">{supplierSearch ? "No se encontraron proveedores" : "No hay proveedores registrados"}</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSuppliers.map((supplier) => (
                    <button key={supplier.id} onClick={() => selectSupplier(supplier)} className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0"><Building2 size={18} className="text-slate-500" /></div>
                      <div className="flex-1 min-w-0"><p className="font-medium text-slate-900 truncate">{supplier.fiscalName}</p>{supplier.commercialName && supplier.commercialName !== supplier.fiscalName && <p className="text-xs text-slate-500 truncate">{supplier.commercialName}</p>}<p className="text-xs text-slate-400">{supplier.taxId} · {supplier.country}</p></div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">Seleccionar cuenta</h3><button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={18} /></button></div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar por código o descripción..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus /></div>
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {filteredSubAccounts.length === 0 ? (
                <div className="p-8 text-center"><Hash size={32} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500 text-sm">{accountSearch ? "No se encontraron cuentas" : "No hay cuentas registradas"}</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSubAccounts.map((account) => {
                    const availablePercent = account.budgeted > 0 ? Math.round((account.available / account.budgeted) * 100) : 0;
                    const isLowBudget = availablePercent < 20;
                    return (
                      <button key={account.id} onClick={() => selectAccount(account)} className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0"><p className="font-medium text-slate-900">{account.code}</p><p className="text-sm text-slate-600 truncate">{account.description}</p><p className="text-xs text-slate-400 mt-1">{account.accountCode} · {account.accountDescription}</p></div>
                          <div className="text-right flex-shrink-0">
                            <p className={`font-semibold ${isLowBudget ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(account.available)} {getCurrencySymbol()}</p>
                            <p className="text-xs text-slate-400">disponible</p>
                            {isLowBudget && <div className="flex items-center gap-1 mt-1 text-amber-600"><AlertTriangle size={12} /><span className="text-xs">{availablePercent}%</span></div>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

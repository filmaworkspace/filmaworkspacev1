"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  FileText, ArrowLeft, Save, Send, Building2, AlertCircle, Upload, X, Plus, Trash2, Search,
  Hash, FileUp, ShoppingCart, Package, Wrench, Shield, CheckCircle, CheckCircle2, Clock,
  ChevronRight, ChevronDown, AlertTriangle, Circle, ShieldAlert, Lock, Euro, DollarSign, PoundSterling,
} from "lucide-react";
import { useAccountingPermissions } from "@/hooks/useAccountingPermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Supplier { id: string; fiscalName: string; commercialName: string; country: string; taxId: string; paymentMethod: string; }
interface SubAccount { id: string; code: string; description: string; budgeted: number; committed: number; actual: number; available: number; accountId: string; accountCode: string; accountDescription: string; }
interface POItem { id: string; description: string; subAccountId: string; subAccountCode: string; subAccountDescription: string; date: string; quantity: number; unitPrice: number; baseAmount: number; vatRate: number; vatAmount: number; irpfRate: number; irpfAmount: number; totalAmount: number; }
interface ApprovalStep { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers?: string[]; roles?: string[]; department?: string; requireAll: boolean; hasAmountThreshold?: boolean; amountThreshold?: number; amountCondition?: "above" | "below" | "between"; amountThresholdMax?: number; }
interface ApprovalStepStatus { id: string; order: number; approverType: string; approvers: string[]; approverNames: string[]; roles?: string[]; department?: string; approvedBy: string[]; rejectedBy: string[]; status: "pending" | "approved" | "rejected"; requireAll: boolean; }
interface Member { userId: string; name?: string; email?: string; role?: string; department?: string; position?: string; }
interface ExistingPO { id: string; number: string; version: number; supplier: string; supplierId: string; department?: string; poType: string; currency: string; generalDescription: string; paymentTerms?: string; notes?: string; items: any[]; status: string; attachmentUrl?: string; attachmentFileName?: string; createdBy: string; createdByName: string; }

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart },
  { value: "purchase", label: "Compra", icon: Package },
  { value: "service", label: "Servicio", icon: Wrench },
  { value: "deposit", label: "Fianza", icon: Shield },
];
const CURRENCIES = [
  { value: "EUR", label: "EUR", symbol: "€", icon: Euro },
  { value: "USD", label: "USD", symbol: "$", icon: DollarSign },
  { value: "GBP", label: "GBP", symbol: "£", icon: PoundSterling },
];
const VAT_RATES = [{ value: 0, label: "0%" }, { value: 4, label: "4%" }, { value: 10, label: "10%" }, { value: 21, label: "21%" }];
const IRPF_RATES = [{ value: 0, label: "0%" }, { value: 7, label: "7%" }, { value: 15, label: "15%" }, { value: 19, label: "19%" }];

const createEmptyItem = (id: string): POItem => ({
  id, description: "", subAccountId: "", subAccountCode: "", subAccountDescription: "",
  date: new Date().toISOString().split("T")[0], quantity: 1, unitPrice: 0, baseAmount: 0,
  vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0,
});

export default function EditPOPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const poId = params?.poId as string;

  const { loading: permissionsLoading, error: permissionsError, permissions, canEditPO, getAvailableDepartments } = useAccountingPermissions(projectId);

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [existingPO, setExistingPO] = useState<ExistingPO | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  const [formData, setFormData] = useState({ supplier: "", supplierName: "", department: "", poType: "service" as any, currency: "EUR", generalDescription: "", paymentTerms: "", notes: "" });
  const [items, setItems] = useState<POItem[]>([createEmptyItem("1")]);
  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState("");

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<{ url: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(["1"]));

  useEffect(() => { if (!permissionsLoading && projectId && poId) loadData(); }, [permissionsLoading, projectId, poId]);
  useEffect(() => { calculateTotals(); }, [items]);
  useEffect(() => { if (Object.keys(touched).length > 0) validateForm(); }, [formData, items]);


  const loadData = async () => {
    try {
      setLoading(true);

      // Cargar PO existente primero
      const poDoc = await getDoc(doc(db, `projects/${projectId}/pos`, poId));
      if (!poDoc.exists()) { router.push(`/project/${projectId}/accounting/pos`); return; }

      const poData = { id: poDoc.id, ...poDoc.data() } as ExistingPO;

      // Verificar permisos de edición
      if (!canEditPO(poData as any)) { setAccessDenied(true); setLoading(false); return; }

      // Verificar estado editable
      if (poData.status !== "draft" && poData.status !== "rejected") {
        router.push(`/project/${projectId}/accounting/pos/${poId}`);
        return;
      }

      setExistingPO(poData);

      // Cargar datos del formulario
      setFormData({
        supplier: poData.supplierId,
        supplierName: poData.supplier,
        department: poData.department || "",
        poType: poData.poType as any,
        currency: poData.currency,
        generalDescription: poData.generalDescription,
        paymentTerms: poData.paymentTerms || "",
        notes: poData.notes || "",
      });

      // Cargar items
      if (poData.items?.length > 0) {
        const loadedItems = poData.items.map((item: any, index: number) => ({
          id: String(index + 1),
          description: item.description || "",
          subAccountId: item.subAccountId || "",
          subAccountCode: item.subAccountCode || "",
          subAccountDescription: item.subAccountDescription || "",
          date: item.date || new Date().toISOString().split("T")[0],
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          baseAmount: item.baseAmount || 0,
          vatRate: item.vatRate ?? 21,
          vatAmount: item.vatAmount || 0,
          irpfRate: item.irpfRate || 0,
          irpfAmount: item.irpfAmount || 0,
          totalAmount: item.totalAmount || 0,
        }));
        setItems(loadedItems);
        setExpandedItems(new Set(loadedItems.map((i: POItem) => i.id)));
      }

      // Cargar attachment existente
      if (poData.attachmentUrl) {
        setExistingAttachment({ url: poData.attachmentUrl, name: poData.attachmentFileName || "Archivo adjunto" });
      }

      // Cargar proyecto
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        setDepartments(projectDoc.data().departments || []);
      }

      // Cargar miembros
      const membersSnapshot = await getDocs(collection(db, `projects/${projectId}/members`));
      const membersData: Member[] = [];
      for (const memberDocSnap of membersSnapshot.docs) {
        const memberData = memberDocSnap.data();
        let name = memberData.name || memberData.email || memberDocSnap.id;
        try { const userDoc = await getDoc(doc(db, "users", memberDocSnap.id)); if (userDoc.exists()) name = userDoc.data().displayName || userDoc.data().email || name; } catch (e) {}
        membersData.push({ userId: memberDocSnap.id, name, email: memberData.email, role: memberData.role, department: memberData.department, position: memberData.position });
      }
      setMembers(membersData);

      // Cargar configuración de aprobaciones
      const approvalConfigDoc = await getDoc(doc(db, `projects/${projectId}/config/approvals`));
      setApprovalConfig(approvalConfigDoc.exists() ? approvalConfigDoc.data().poApprovals || [] : []);

      // Cargar proveedores
      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${projectId}/suppliers`), orderBy("fiscalName", "asc")));
      setSuppliers(suppliersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier)));

      // Cargar cuentas
      const accountsSnapshot = await getDocs(query(collection(db, `projects/${projectId}/accounts`), orderBy("code", "asc")));
      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${projectId}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          allSubAccounts.push({
            id: subDoc.id, code: data.code, description: data.description,
            budgeted: data.budgeted || 0, committed: data.committed || 0, actual: data.actual || 0,
            available: (data.budgeted || 0) - (data.committed || 0) - (data.actual || 0),
            accountId: accountDoc.id, accountCode: accountData.code, accountDescription: accountData.description,
          });
        });
      }
      setSubAccounts(allSubAccounts);
    } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
  };

  // Funciones de aprobación
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
    const applicableSteps = approvalConfig.filter((step) => {
      if (!step.hasAmountThreshold || !step.amountThreshold) return true;
      if (!amount) return true;
      switch (step.amountCondition) {
        case "above": return amount > step.amountThreshold;
        case "below": return amount < step.amountThreshold;
        case "between": return amount >= step.amountThreshold && amount <= (step.amountThresholdMax || Infinity);
        default: return true;
      }
    });
    return applicableSteps.map((step) => {
      const { ids, names } = resolveApprovers(step, dept);
      return { id: step.id || "", order: step.order || 0, approverType: step.approverType || "fixed", approvers: ids, approverNames: names, roles: step.roles || [], department: step.department || "", approvedBy: [], rejectedBy: [], status: "pending" as const, requireAll: step.requireAll ?? false };
    });
  };

  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean => steps.length === 0 || steps.every((step) => step.approvers.length === 0);

  // Funciones de cálculo
  const calculateItemTotal = (item: POItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    return { baseAmount, vatAmount, irpfAmount, totalAmount: baseAmount + vatAmount - irpfAmount };
  };

  const calculateTotals = () => {
    setTotals({
      baseAmount: items.reduce((sum, item) => sum + item.baseAmount, 0),
      vatAmount: items.reduce((sum, item) => sum + item.vatAmount, 0),
      irpfAmount: items.reduce((sum, item) => sum + item.irpfAmount, 0),
      totalAmount: items.reduce((sum, item) => sum + item.totalAmount, 0),
    });
  };

  // Funciones de items
  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    const calc = calculateItemTotal(newItems[index]);
    newItems[index] = { ...newItems[index], ...calc };
    setItems(newItems);
    setTouched((prev) => ({ ...prev, [`item_${index}_${field}`]: true }));
  };

  const addItem = () => {
    const newId = String(items.length + 1);
    setItems([...items, createEmptyItem(newId)]);
    setExpandedItems((prev) => new Set([...prev, newId]));
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) newSet.delete(itemId);
      else newSet.add(itemId);
      return newSet;
    });
  };

  // Funciones de selección
  const selectSupplier = (supplier: Supplier) => {
    setFormData({ ...formData, supplier: supplier.id, supplierName: supplier.fiscalName, paymentTerms: supplier.paymentMethod || formData.paymentTerms });
    setTouched((prev) => ({ ...prev, supplier: true }));
    setShowSupplierModal(false);
    setSupplierSearch("");
  };

  const selectAccount = (subAccount: SubAccount) => {
    if (currentItemIndex !== null) {
      const newItems = [...items];
      newItems[currentItemIndex] = { ...newItems[currentItemIndex], subAccountId: subAccount.id, subAccountCode: subAccount.code, subAccountDescription: subAccount.description };
      setItems(newItems);
      setTouched((prev) => ({ ...prev, [`item_${currentItemIndex}_account`]: true }));
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  // Validación
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplier) newErrors.supplier = "Selecciona un proveedor";
    if (!formData.department) newErrors.department = "Selecciona un departamento";
    if (!formData.generalDescription.trim()) newErrors.generalDescription = "La descripción es obligatoria";
    items.forEach((item, index) => {
      if (!item.description.trim()) newErrors[`item_${index}_description`] = "Obligatorio";
      if (!item.subAccountId) newErrors[`item_${index}_account`] = "Selecciona una cuenta";
      if (item.quantity <= 0) newErrors[`item_${index}_quantity`] = "Debe ser mayor que 0";
      if (item.unitPrice <= 0) newErrors[`item_${index}_unitPrice`] = "Debe ser mayor que 0";
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  // Manejo de archivos
  const handleFileUpload = (file: File) => {
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      alert("Solo PDF o imágenes hasta 10MB");
      return;
    }
    setUploadedFile(file);
    setExistingAttachment(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);


  // Guardar PO
  const savePO = async (status: "draft" | "pending") => {
    if (!existingPO) return;
    if (status === "pending" && !validateForm()) {
      const allTouched: Record<string, boolean> = { supplier: true, department: true, generalDescription: true };
      items.forEach((_, index) => {
        allTouched[`item_${index}_description`] = true;
        allTouched[`item_${index}_account`] = true;
        allTouched[`item_${index}_quantity`] = true;
        allTouched[`item_${index}_unitPrice`] = true;
      });
      setTouched(allTouched);
      return;
    }

    setSaving(true);
    try {
      let fileUrl = existingAttachment?.url || "";
      let fileName = existingAttachment?.name || "";

      if (uploadedFile) {
        const fileRef = ref(storage, `projects/${projectId}/pos/${existingPO.number}/${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
        fileName = uploadedFile.name;
      }

      const itemsData = items.map((item) => ({
        description: item.description.trim(), subAccountId: item.subAccountId, subAccountCode: item.subAccountCode,
        subAccountDescription: item.subAccountDescription, date: item.date, quantity: item.quantity, unitPrice: item.unitPrice,
        baseAmount: item.baseAmount, vatRate: item.vatRate, vatAmount: item.vatAmount, irpfRate: item.irpfRate,
        irpfAmount: item.irpfAmount, totalAmount: item.totalAmount,
      }));

      const poUpdate: any = {
        supplier: formData.supplierName, supplierId: formData.supplier, department: formData.department,
        poType: formData.poType, currency: formData.currency, generalDescription: formData.generalDescription.trim(),
        paymentTerms: formData.paymentTerms, notes: formData.notes.trim(), items: itemsData,
        baseAmount: totals.baseAmount, vatAmount: totals.vatAmount, irpfAmount: totals.irpfAmount,
        totalAmount: totals.totalAmount, attachmentUrl: fileUrl, attachmentFileName: fileName,
        updatedAt: Timestamp.now(),
      };

      if (status === "pending") {
        const approvalSteps = generateApprovalSteps(formData.department, totals.baseAmount);
        if (shouldAutoApprove(approvalSteps)) {
          poUpdate.status = "approved";
          poUpdate.approvedAt = Timestamp.now();
          poUpdate.approvedBy = permissions.userId;
          poUpdate.approvedByName = permissions.userName;
          poUpdate.autoApproved = true;
          poUpdate.committedAmount = totals.baseAmount;
        } else {
          poUpdate.status = "pending";
          poUpdate.approvalSteps = approvalSteps;
          poUpdate.currentApprovalStep = 0;
        }
      } else {
        poUpdate.status = "draft";
      }

      await updateDoc(doc(db, `projects/${projectId}/pos`, poId), poUpdate);
      
      const message = poUpdate.status === "approved" ? "PO aprobada automáticamente" : poUpdate.status === "pending" ? "PO enviada para aprobación" : "Cambios guardados";
      setSuccessMessage(message);
      setTimeout(() => router.push(`/project/${projectId}/accounting/pos`), 1500);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Utilidades
  const getCurrencySymbol = () => CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";
  const formatCurrency = (amount: number): string => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    const steps = generateApprovalSteps(formData.department, totals.baseAmount);
    if (steps.every((s) => s.approvers.length === 0)) return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    return { autoApprove: false, message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`, steps };
  };

  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()));

  const availableDepartments = getAvailableDepartments(departments);
  const approvalPreview = getApprovalPreview();
  const hasError = (field: string) => touched[field] && errors[field];
  const getFieldClass = (field: string, base: string) => {
    if (hasError(field)) return `${base} border-red-300 bg-red-50`;
    return `${base} border-slate-200`;
  };

  // Loading y errores
  if (permissionsLoading || loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (permissionsError || !permissions.hasAccountingAccess || accessDenied) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-500 mb-6 text-sm">{permissionsError || "No tienes permisos para editar esta PO"}</p>
          <Link href={`/project/${projectId}/accounting/pos`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
            <ArrowLeft size={16} />Volver
          </Link>
        </div>
      </div>
    );
  }

  if (!existingPO) return null;


  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href={`/project/${projectId}/accounting`} className="text-slate-500 hover:text-slate-700">{projectName}</Link>
            <span className="text-slate-300">/</span>
            <Link href={`/project/${projectId}/accounting/pos`} className="text-slate-500 hover:text-slate-700">POs</Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-medium">Editar PO-{existingPO.number}</span>
          </nav>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/project/${projectId}/accounting/pos/${poId}`} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl">
                <ArrowLeft size={20} />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">Editar PO-{existingPO.number}</h1>
                  {existingPO.version > 1 && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">V{String(existingPO.version).padStart(2, "0")}</span>}
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">{existingPO.status === "draft" ? "Borrador" : "Rechazada"}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">Creada por {existingPO.createdByName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => savePO("draft")} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium disabled:opacity-50">
                <Save size={16} />Guardar
              </button>
              <button onClick={() => savePO("pending")} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</> : approvalPreview.autoApprove ? <><CheckCircle size={16} />Aprobar</> : <><Send size={16} />Enviar</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-600" />
            <p className="text-sm text-emerald-700 font-medium">{successMessage}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Info básica */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="font-semibold text-slate-900">Información básica</h2>
              </div>
              <div className="p-6 space-y-6">
                {/* Proveedor */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Proveedor *</label>
                  <button type="button" onClick={() => setShowSupplierModal(true)} className={getFieldClass("supplier", "w-full px-4 py-3.5 border rounded-xl text-left flex items-center justify-between hover:border-slate-300")}>
                    {formData.supplierName ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><Building2 size={18} className="text-slate-500" /></div>
                        <div><p className="font-medium text-slate-900">{formData.supplierName}</p><p className="text-xs text-slate-500">Click para cambiar</p></div>
                      </div>
                    ) : <span className="text-slate-400">Seleccionar proveedor...</span>}
                    <Search size={18} className="text-slate-400" />
                  </button>
                  {hasError("supplier") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.supplier}</p>}
                </div>

                {/* Departamento y Tipo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Departamento *{permissions.fixedDepartment && <span className="ml-2 text-xs text-slate-400">(asignado)</span>}</label>
                    <div className="relative">
                      <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} disabled={!!permissions.fixedDepartment} className={getFieldClass("department", "w-full px-4 py-3.5 border rounded-xl bg-white disabled:bg-slate-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm appearance-none pr-10")}>
                        <option value="">Seleccionar...</option>
                        {availableDepartments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                      </select>
                      {permissions.fixedDepartment && <Lock size={14} className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400" />}
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {hasError("department") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.department}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de orden</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PO_TYPES.map((type) => { const Icon = type.icon; const isSelected = formData.poType === type.value; return (
                        <button key={type.value} type="button" onClick={() => setFormData({ ...formData, poType: type.value })} className={`px-3 py-2.5 rounded-xl border-2 transition-all flex items-center gap-2 text-sm ${isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300 text-slate-600"}`}>
                          <Icon size={16} /><span className="font-medium">{type.label}</span>
                        </button>
                      ); })}
                    </div>
                  </div>
                </div>

                {/* Moneda */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Moneda</label>
                  <div className="flex gap-2">
                    {CURRENCIES.map((currency) => { const Icon = currency.icon; const isSelected = formData.currency === currency.value; return (
                      <button key={currency.value} type="button" onClick={() => setFormData({ ...formData, currency: currency.value })} className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-sm font-medium ${isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300 text-slate-600"}`}>
                        <Icon size={16} />{currency.label}
                      </button>
                    ); })}
                  </div>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Descripción general *</label>
                  <textarea value={formData.generalDescription} onChange={(e) => setFormData({ ...formData, generalDescription: e.target.value })} onBlur={() => handleBlur("generalDescription")} placeholder="Describe el propósito..." rows={3} className={getFieldClass("generalDescription", "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm")} />
                  {hasError("generalDescription") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.generalDescription}</p>}
                </div>
              </div>
            </section>


            {/* Items */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-900">Items</h2>
                  <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium">{items.length}</span>
                </div>
                <button type="button" onClick={addItem} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium">
                  <Plus size={16} />Añadir
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const isExpanded = expandedItems.has(item.id);
                  const selectedAccount = subAccounts.find((a) => a.id === item.subAccountId);
                  return (
                    <div key={item.id}>
                      <div className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50" onClick={() => toggleItemExpanded(item.id)}>
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm font-medium text-slate-600">{index + 1}</span>
                          <div>
                            <p className="font-medium text-slate-900">{item.description || "Sin descripción"}</p>
                            <p className="text-sm text-slate-500">{item.subAccountCode ? `${item.subAccountCode} · ${item.subAccountDescription}` : "Sin cuenta"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {item.totalAmount > 0 && <span className="font-semibold text-slate-900">{formatCurrency(item.totalAmount)} {getCurrencySymbol()}</span>}
                          <ChevronDown size={20} className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-6 pb-6 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Descripción *</label>
                              <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} onBlur={() => handleBlur(`item_${index}_description`)} placeholder="Describe..." className={getFieldClass(`item_${index}_description`, "w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm")} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Cuenta *</label>
                              <button type="button" onClick={() => { setCurrentItemIndex(index); setShowAccountModal(true); }} className={getFieldClass(`item_${index}_account`, "w-full px-3 py-2.5 border rounded-xl text-left flex items-center justify-between text-sm hover:border-slate-300")}>
                                {item.subAccountCode ? <span className="text-slate-900 truncate">{item.subAccountCode} - {item.subAccountDescription}</span> : <span className="text-slate-400">Seleccionar...</span>}
                                <Search size={14} className="text-slate-400 flex-shrink-0" />
                              </button>
                              {permissions.isProjectRole && selectedAccount && (
                                <div className="mt-2 p-2 bg-slate-50 rounded-lg text-xs flex justify-between">
                                  <span className="text-slate-500">Disponible:</span>
                                  <span className={selectedAccount.available < item.baseAmount ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>{formatCurrency(selectedAccount.available)} {getCurrencySymbol()}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Fecha</label>
                              <input type="date" value={item.date} onChange={(e) => updateItem(index, "date", e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Cantidad *</label>
                              <input type="number" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} min="0" step="0.01" className={getFieldClass(`item_${index}_quantity`, "w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm")} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Precio unit. *</label>
                              <div className="relative">
                                <input type="number" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} min="0" step="0.01" className={getFieldClass(`item_${index}_unitPrice`, "w-full px-3 py-2.5 pr-8 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm")} />
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

                          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-30">
                              <Trash2 size={16} />Eliminar
                            </button>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="text-right"><p className="text-slate-500">Base</p><p className="font-medium">{formatCurrency(item.baseAmount)} {getCurrencySymbol()}</p></div>
                              {item.vatAmount > 0 && <div className="text-right"><p className="text-slate-500">IVA</p><p className="font-medium">+{formatCurrency(item.vatAmount)}</p></div>}
                              {item.irpfAmount > 0 && <div className="text-right"><p className="text-slate-500">IRPF</p><p className="font-medium text-red-600">-{formatCurrency(item.irpfAmount)}</p></div>}
                              <div className="text-right pl-4 border-l"><p className="text-slate-500">Total</p><p className="font-bold">{formatCurrency(item.totalAmount)} {getCurrencySymbol()}</p></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Adjunto */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50"><h2 className="font-semibold text-slate-900">Archivo adjunto</h2></div>
              <div className="p-6">
                {(uploadedFile || existingAttachment) ? (
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center"><FileUp size={20} className="text-indigo-600" /></div>
                      <div>
                        <p className="font-medium text-slate-900">{uploadedFile?.name || existingAttachment?.name}</p>
                        <p className="text-sm text-slate-500">{uploadedFile ? formatFileSize(uploadedFile.size) : "Archivo existente"}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setUploadedFile(null); setExistingAttachment(null); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><X size={20} /></button>
                  </div>
                ) : (
                  <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-8 text-center ${isDragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
                    <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-slate-600 mb-1">Arrastra un archivo o <label className="text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">selecciona<input type="file" accept=".pdf,image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} className="hidden" /></label></p>
                    <p className="text-xs text-slate-400">PDF o imágenes, máx 10MB</p>
                  </div>
                )}
              </div>
            </section>

            {/* Notas */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50"><h2 className="font-semibold text-slate-900">Información adicional</h2></div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Condiciones de pago</label>
                  <input type="text" value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} placeholder="Ej: 30 días fecha factura" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Notas internas</label>
                  <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notas adicionales..." rows={3} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm" />
                </div>
              </div>
            </section>
          </div>


          {/* Sidebar */}
          <div className="space-y-6">
            {/* Resumen */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Resumen</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Base imponible</span><span className="font-medium text-slate-900">{formatCurrency(totals.baseAmount)} {getCurrencySymbol()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">IVA</span><span className="font-medium text-slate-700">+{formatCurrency(totals.vatAmount)} {getCurrencySymbol()}</span></div>
                {totals.irpfAmount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">IRPF</span><span className="font-medium text-red-600">-{formatCurrency(totals.irpfAmount)} {getCurrencySymbol()}</span></div>}
                <div className="pt-3 border-t border-slate-200 flex justify-between"><span className="font-medium text-slate-700">Total</span><span className="text-xl font-bold text-slate-900">{formatCurrency(totals.totalAmount)} {getCurrencySymbol()}</span></div>
              </div>
            </div>

            {/* Preview aprobación */}
            <div className={`rounded-2xl border p-6 ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${approvalPreview.autoApprove ? "bg-emerald-100" : "bg-amber-100"}`}>
                  {approvalPreview.autoApprove ? <CheckCircle size={20} className="text-emerald-600" /> : <Clock size={20} className="text-amber-600" />}
                </div>
                <div>
                  <h3 className={`font-semibold ${approvalPreview.autoApprove ? "text-emerald-900" : "text-amber-900"}`}>{approvalPreview.autoApprove ? "Auto-aprobación" : "Requiere aprobación"}</h3>
                  <p className={`text-sm ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>{approvalPreview.message}</p>
                </div>
              </div>
              {!approvalPreview.autoApprove && approvalPreview.steps.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-amber-200">
                  {approvalPreview.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm text-amber-800">
                      <span className="w-5 h-5 bg-amber-200 rounded-full flex items-center justify-center text-xs font-medium">{i + 1}</span>
                      <span>{step.approverNames.length > 0 ? step.approverNames.join(", ") : "Sin aprobadores"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal Proveedor */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h3>
              <button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {filteredSuppliers.length === 0 ? (
                <div className="p-8 text-center"><Building2 size={40} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500">No hay proveedores</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSuppliers.map((supplier) => (
                    <button key={supplier.id} onClick={() => selectSupplier(supplier)} className="w-full px-6 py-4 text-left hover:bg-slate-50 flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center"><Building2 size={20} className="text-slate-500" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{supplier.fiscalName}</p>
                        <p className="text-xs text-slate-400">{supplier.taxId} · {supplier.country}</p>
                      </div>
                      <ChevronRight size={18} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Cuenta */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Seleccionar cuenta</h3>
              <button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {filteredSubAccounts.length === 0 ? (
                <div className="p-8 text-center"><Hash size={40} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500">No hay cuentas</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSubAccounts.map((account) => {
                    const availablePercent = account.budgeted > 0 ? Math.round((account.available / account.budgeted) * 100) : 0;
                    const isLow = availablePercent < 20 && account.budgeted > 0;
                    return (
                      <button key={account.id} onClick={() => selectAccount(account)} className="w-full px-6 py-4 text-left hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900">{account.code}</p>
                            <p className="text-sm text-slate-600 truncate">{account.description}</p>
                            <p className="text-xs text-slate-400 mt-1">{account.accountCode} · {account.accountDescription}</p>
                          </div>
                          {permissions.isProjectRole && (
                            <div className="text-right">
                              <p className={`font-semibold ${account.available < 0 ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(account.available)} {getCurrencySymbol()}</p>
                              <p className="text-xs text-slate-400">disponible</p>
                            </div>
                          )}
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

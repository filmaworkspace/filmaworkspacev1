"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { FileText, ArrowLeft, Save, Send, Building2, AlertCircle, Info, Upload, X, Check, Plus, Trash2, Search, FileUp, ShoppingCart, Package, Wrench, Shield, CheckCircle, Clock, XCircle, AlertTriangle, ChevronDown, Hash, Calendar, DollarSign, Percent, FileCheck, Eye, ExternalLink } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Supplier { id: string; fiscalName: string; commercialName: string; country: string; taxId: string; paymentMethod: string; }
interface SubAccount { id: string; code: string; description: string; budgeted: number; committed: number; actual: number; available: number; accountId: string; accountCode: string; accountDescription: string; }
interface POItem { id: string; description: string; subAccountId: string; subAccountCode: string; subAccountDescription: string; date: string; quantity: number; unitPrice: number; baseAmount: number; vatRate: number; vatAmount: number; irpfRate: number; irpfAmount: number; totalAmount: number; }
interface Department { name: string; }
interface Member { userId: string; role?: string; department?: string; position?: string; }
interface ApprovalStep { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers?: string[]; roles?: string[]; department?: string; requireAll: boolean; }
interface ApprovalStepStatus { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers: string[]; roles?: string[]; department?: string; approvedBy: string[]; rejectedBy: string[]; status: "pending" | "approved" | "rejected"; requireAll: boolean; }

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart, color: "blue" },
  { value: "purchase", label: "Compra", icon: Package, color: "emerald" },
  { value: "service", label: "Servicio", icon: Wrench, color: "violet" },
  { value: "deposit", label: "Fianza", icon: Shield, color: "amber" },
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
  { value: 21, label: "21%" },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; icon: typeof Clock; gradient: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador", icon: FileText, gradient: "from-slate-500 to-slate-600" },
  pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente", icon: Clock, gradient: "from-amber-500 to-orange-500" },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada", icon: CheckCircle, gradient: "from-emerald-500 to-teal-500" },
  rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada", icon: XCircle, gradient: "from-red-500 to-rose-500" },
  closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada", icon: FileCheck, gradient: "from-blue-500 to-indigo-500" },
};

export default function EditPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const poId = params?.poId as string;

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
  const [members, setMembers] = useState<Member[]>([]);
  const [poNumber, setPONumber] = useState("");
  const [poVersion, setPOVersion] = useState(1);
  const [poStatus, setPOStatus] = useState<string>("draft");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [originalData, setOriginalData] = useState<any>(null);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);

  // File upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState("");
  const [existingFileName, setExistingFileName] = useState("");

  // Expanded items
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(["1"]));

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

  const [items, setItems] = useState<POItem[]>([]);
  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) { setUserId(user.uid); setUserName(user.displayName || user.email || "Usuario"); }
      else { router.push("/"); }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => { if (userId && id && poId) loadData(); }, [userId, id, poId]);
  useEffect(() => { calculateTotals(); }, [items]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        const depts = projectDoc.data().departments || [];
        setDepartments(depts.map((d: string) => ({ name: d })));
      }

      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        setUserRole(memberData.role || "");
        setUserDepartment(memberData.department || "");
      }

      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      const membersData = membersSnapshot.docs.map((doc) => ({ userId: doc.id, role: doc.data().role, department: doc.data().department, position: doc.data().position }));
      setMembers(membersData);

      const approvalConfigDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (approvalConfigDoc.exists()) {
        const config = approvalConfigDoc.data();
        setApprovalConfig(config.poApprovals || []);
      }

      const suppliersSnapshot = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      const suppliersData = suppliersSnapshot.docs.map((doc) => ({ id: doc.id, fiscalName: doc.data().fiscalName, commercialName: doc.data().commercialName || "", country: doc.data().country, taxId: doc.data().taxId, paymentMethod: doc.data().paymentMethod })) as Supplier[];
      setSuppliers(suppliersData);

      const accountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc")));
        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          const budgeted = data.budgeted || 0;
          const committed = data.committed || 0;
          const actual = data.actual || 0;
          const available = budgeted - committed - actual;
          allSubAccounts.push({ id: subDoc.id, code: data.code, description: data.description, budgeted, committed, actual, available, accountId: accountDoc.id, accountCode: accountData.code, accountDescription: accountData.description });
        });
      }
      setSubAccounts(allSubAccounts);

      const poDoc = await getDoc(doc(db, `projects/${id}/pos`, poId));
      if (!poDoc.exists()) { setErrorMessage("PO no encontrada"); setLoading(false); return; }

      const poData = poDoc.data();
      setOriginalData(poData);
      setPONumber(poData.number || "");
      setPOVersion(poData.version || 1);
      setPOStatus(poData.status || "draft");
      setExistingFileUrl(poData.attachmentUrl || "");
      setExistingFileName(poData.attachmentFileName || "");

      setFormData({
        supplier: poData.supplierId || "",
        supplierName: poData.supplier || "",
        department: poData.department || "",
        poType: poData.poType || "purchase",
        currency: poData.currency || "EUR",
        generalDescription: poData.description || poData.generalDescription || "",
        paymentTerms: poData.paymentTerms || "",
        notes: poData.notes || "",
      });

      const loadedItems = (poData.items || []).map((item: any, idx: number) => ({
        id: item.id || String(idx + 1),
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

      if (loadedItems.length === 0) {
        loadedItems.push({ id: "1", description: "", subAccountId: "", subAccountCode: "", subAccountDescription: "", date: new Date().toISOString().split("T")[0], quantity: 1, unitPrice: 0, baseAmount: 0, vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0 });
      }

      setItems(loadedItems);
      setExpandedItems(new Set([loadedItems[0]?.id || "1"]));
    } catch (error: any) {
      console.error("Error cargando datos:", error);
      setErrorMessage(`Error al cargar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Approval functions
  const resolveApprovers = (step: ApprovalStep, documentDepartment?: string): string[] => {
    switch (step.approverType) {
      case "fixed": return step.approvers || [];
      case "role": return members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId);
      case "hod": const hodDept = step.department || documentDepartment; return members.filter((m) => m.position === "HOD" && m.department === hodDept).map((m) => m.userId);
      case "coordinator": const coordDept = step.department || documentDepartment; return members.filter((m) => m.position === "Coordinator" && m.department === coordDept).map((m) => m.userId);
      default: return [];
    }
  };

  const generateApprovalSteps = (documentDepartment?: string): ApprovalStepStatus[] => {
    if (approvalConfig.length === 0) return [];
    return approvalConfig.map((step) => ({ id: step.id || "", order: step.order || 0, approverType: step.approverType || "fixed", approvers: resolveApprovers(step, documentDepartment), roles: step.roles || [], department: step.department || "", approvedBy: [], rejectedBy: [], status: "pending" as const, requireAll: step.requireAll ?? false }));
  };

  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean => {
    if (steps.length === 0) return true;
    return steps.every((step) => step.approvers.length === 0);
  };

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) return { levels: 0, autoApprove: true, message: "Se aprobará automáticamente" };
    const steps = generateApprovalSteps(formData.department);
    const hasApprovers = steps.some((s) => s.approvers.length > 0);
    if (!hasApprovers) return { levels: 0, autoApprove: true, message: "Se aprobará automáticamente" };
    return { levels: steps.length, autoApprove: false, message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`, steps };
  };

  // Item management
  const calculateItemTotal = (item: POItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    const totalAmount = baseAmount + vatAmount - irpfAmount;
    return { baseAmount, vatAmount, irpfAmount, totalAmount };
  };

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    const calculated = calculateItemTotal(newItems[index]);
    newItems[index] = { ...newItems[index], ...calculated };
    setItems(newItems);
  };

  const addItem = () => {
    const newId = String(Date.now());
    const newItem: POItem = { id: newId, description: "", subAccountId: "", subAccountCode: "", subAccountDescription: "", date: new Date().toISOString().split("T")[0], quantity: 1, unitPrice: 0, baseAmount: 0, vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0 };
    setItems([...items, newItem]);
    setExpandedItems(new Set([...expandedItems, newId]));
  };

  const removeItem = (index: number) => {
    if (items.length === 1) { alert("Debe haber al menos un ítem en la PO"); return; }
    const itemId = items[index].id;
    setItems(items.filter((_, i) => i !== index));
    const newExpanded = new Set(expandedItems);
    newExpanded.delete(itemId);
    setExpandedItems(newExpanded);
  };

  const toggleItemExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) newExpanded.delete(itemId);
    else newExpanded.add(itemId);
    setExpandedItems(newExpanded);
  };

  const calculateTotals = () => {
    const baseAmount = items.reduce((sum, item) => sum + item.baseAmount, 0);
    const vatAmount = items.reduce((sum, item) => sum + item.vatAmount, 0);
    const irpfAmount = items.reduce((sum, item) => sum + item.irpfAmount, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
    setTotals({ baseAmount, vatAmount, irpfAmount, totalAmount });
  };

  // Selection
  const selectSupplier = (supplier: Supplier) => { setFormData({ ...formData, supplier: supplier.id, supplierName: supplier.fiscalName }); setShowSupplierModal(false); setSupplierSearch(""); };
  const selectAccount = (subAccount: SubAccount) => {
    if (currentItemIndex !== null) {
      const newItems = [...items];
      newItems[currentItemIndex] = { ...newItems[currentItemIndex], subAccountId: subAccount.id, subAccountCode: subAccount.code, subAccountDescription: subAccount.description };
      setItems(newItems);
    }
    setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null);
  };
  const openAccountModal = (index: number) => { setCurrentItemIndex(index); setShowAccountModal(true); };

  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()) || s.accountDescription.toLowerCase().includes(accountSearch.toLowerCase()));

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { if (file.size > 10 * 1024 * 1024) { alert("El archivo no puede superar los 10MB"); return; } setUploadedFile(file); } };
  const removeFile = () => setUploadedFile(null);
  const removeExistingFile = () => { setExistingFileUrl(""); setExistingFileName(""); };

  // Validation
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplier) newErrors.supplier = "Selecciona un proveedor";
    if (!formData.department) newErrors.department = "Selecciona un departamento";
    if (!formData.generalDescription.trim()) newErrors.generalDescription = "La descripción es obligatoria";
    items.forEach((item, index) => {
      if (!item.description.trim()) newErrors[`item_${index}_description`] = "Descripción obligatoria";
      if (!item.subAccountId) newErrors[`item_${index}_account`] = "Cuenta obligatoria";
      if (item.quantity <= 0) newErrors[`item_${index}_quantity`] = "Cantidad debe ser mayor a 0";
      if (item.unitPrice <= 0) newErrors[`item_${index}_unitPrice`] = "Precio debe ser mayor a 0";
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save
  const savePO = async (sendForApproval: boolean = false) => {
    if (!validateForm()) { setErrorMessage("Por favor, completa todos los campos obligatorios"); setTimeout(() => setErrorMessage(""), 5000); return; }
    if (poStatus === "approved") { setErrorMessage("No se puede editar una PO aprobada"); setTimeout(() => setErrorMessage(""), 5000); return; }

    setSaving(true);
    setErrorMessage("");

    try {
      let fileUrl = existingFileUrl;
      let fileName = existingFileName;

      if (uploadedFile) {
        const fileRef = ref(storage, `projects/${id}/pos/${poNumber}/${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
        fileName = uploadedFile.name;
      }

      const itemsData = items.map((item) => ({ id: item.id || "", description: (item.description || "").trim(), subAccountId: item.subAccountId || "", subAccountCode: item.subAccountCode || "", subAccountDescription: item.subAccountDescription || "", date: item.date || new Date().toISOString().split("T")[0], quantity: item.quantity || 0, unitPrice: item.unitPrice || 0, baseAmount: item.baseAmount || 0, vatRate: item.vatRate ?? 21, vatAmount: item.vatAmount || 0, irpfRate: item.irpfRate ?? 0, irpfAmount: item.irpfAmount || 0, totalAmount: item.totalAmount || 0 }));

      const poData: any = {
        supplier: formData.supplierName || "",
        supplierId: formData.supplier || "",
        department: formData.department || "",
        poType: formData.poType || "service",
        currency: formData.currency || "EUR",
        description: (formData.generalDescription || "").trim(),
        generalDescription: (formData.generalDescription || "").trim(),
        paymentTerms: (formData.paymentTerms || "").trim(),
        notes: (formData.notes || "").trim(),
        items: itemsData,
        baseAmount: totals.baseAmount || 0,
        vatAmount: totals.vatAmount || 0,
        irpfAmount: totals.irpfAmount || 0,
        totalAmount: totals.totalAmount || 0,
        attachmentUrl: fileUrl || "",
        attachmentFileName: fileName || "",
        updatedAt: Timestamp.now(),
        updatedBy: userId || "",
        updatedByName: userName || "",
      };

      if (sendForApproval && (poStatus === "draft" || poStatus === "rejected")) {
        const approvalSteps = generateApprovalSteps(formData.department);
        if (shouldAutoApprove(approvalSteps)) {
          poData.status = "approved";
          poData.approvedAt = Timestamp.now();
          poData.approvedBy = userId || "";
          poData.approvedByName = userName || "";
          poData.autoApproved = true;
        } else {
          poData.status = "pending";
          poData.approvalSteps = approvalSteps;
          poData.currentApprovalStep = 0;
        }
      } else if (!sendForApproval && poStatus === "draft") {
        poData.status = "draft";
      }

      await updateDoc(doc(db, `projects/${id}/pos`, poId), poData);

      if (sendForApproval) {
        setSuccessMessage(poData.autoApproved ? "PO guardada y aprobada automáticamente" : "PO enviada para aprobación");
      } else {
        setSuccessMessage("Cambios guardados correctamente");
      }

      setTimeout(() => router.push(`/project/${id}/accounting/pos`), 1500);
    } catch (error: any) {
      console.error("Error guardando PO:", error);
      setErrorMessage(`Error al guardar: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Helpers
  const canEdit = () => poStatus === "draft" || poStatus === "rejected";
  const canSendForApproval = () => poStatus === "draft" || poStatus === "rejected";
  const getCurrencySymbol = () => CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";
  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.text}`}>
        <Icon size={14} />
        {config.label}
      </span>
    );
  };

  const approvalPreview = getApprovalPreview();

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
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-6">
          {/* Project context badge */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                <ArrowLeft size={12} />
                Proyectos
              </Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting`} className="hover:text-slate-900 transition-colors">Panel</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting/pos`} className="hover:text-slate-900 transition-colors">Órdenes de compra</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${STATUS_CONFIG[poStatus]?.gradient || "from-indigo-500 to-indigo-600"}`}>
                <FileText size={24} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">
                    PO-{poNumber}
                    {poVersion > 1 && (
                      <span className="ml-2 text-sm bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-medium">
                        V{String(poVersion).padStart(2, "0")}
                      </span>
                    )}
                  </h1>
                  {getStatusBadge(poStatus)}
                </div>
                <p className="text-slate-500 text-sm mt-0.5">
                  {formData.supplierName || "Sin proveedor"} · {formatCurrency(totals.totalAmount)} {getCurrencySymbol()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canEdit() && poStatus === "draft" && (
                <button onClick={() => savePO(false)} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                  {saving ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                  Guardar
                </button>
              )}
              {canSendForApproval() && (
                <button onClick={() => savePO(true)} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50">
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : approvalPreview.autoApprove ? <Check size={16} /> : <Send size={16} />}
                  {approvalPreview.autoApprove ? "Aprobar" : "Enviar"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 md:px-12 py-8">
        {/* Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle size={20} className="text-emerald-600" />
            </div>
            <span className="font-medium text-emerald-800">{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <span className="font-medium text-red-800">{errorMessage}</span>
          </div>
        )}

        {!canEdit() && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-amber-800">Modo solo lectura</p>
              <p className="text-sm text-amber-700">Esta PO está {poStatus === "pending" ? "pendiente de aprobación" : poStatus === "approved" ? "aprobada" : poStatus}.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* General Info */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-600" />
                  Información general
                </h2>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Supplier */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Proveedor *</label>
                    <button onClick={() => canEdit() && setShowSupplierModal(true)} disabled={!canEdit()} className={`w-full px-4 py-3 border ${errors.supplier ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl text-left flex items-center justify-between ${canEdit() ? "hover:border-slate-300" : "bg-slate-50 cursor-not-allowed"} transition-colors`}>
                      {formData.supplierName ? <span className="text-sm font-medium text-slate-900">{formData.supplierName}</span> : <span className="text-sm text-slate-400">Seleccionar proveedor...</span>}
                      {canEdit() && <Search size={16} className="text-slate-400" />}
                    </button>
                    {errors.supplier && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.supplier}</p>}
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Departamento *</label>
                    <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} disabled={!canEdit()} className={`w-full px-4 py-3 border ${errors.department ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-50 disabled:cursor-not-allowed appearance-none bg-white`}>
                      <option value="">Seleccionar...</option>
                      {departments.map((dept) => <option key={dept.name} value={dept.name}>{dept.name}</option>)}
                    </select>
                    {errors.department && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.department}</p>}
                  </div>
                </div>

                {/* PO Type */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Tipo de orden</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PO_TYPES.map((type) => {
                      const Icon = type.icon;
                      const isSelected = formData.poType === type.value;
                      return (
                        <button key={type.value} onClick={() => canEdit() && setFormData({ ...formData, poType: type.value as any })} disabled={!canEdit()} className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${isSelected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"} ${!canEdit() && "opacity-50 cursor-not-allowed"}`}>
                          <Icon size={20} className={isSelected ? "text-slate-900" : "text-slate-400"} />
                          <span className={`text-xs font-medium ${isSelected ? "text-slate-900" : "text-slate-600"}`}>{type.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Currency & Payment Terms */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Moneda</label>
                    <div className="flex gap-2">
                      {CURRENCIES.map((curr) => (
                        <button key={curr.value} onClick={() => canEdit() && setFormData({ ...formData, currency: curr.value })} disabled={!canEdit()} className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${formData.currency === curr.value ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300"} ${!canEdit() && "opacity-50 cursor-not-allowed"}`}>
                          {curr.symbol} {curr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Condiciones de pago</label>
                    <input type="text" value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} disabled={!canEdit()} placeholder="Ej: 30 días" className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-50 disabled:cursor-not-allowed" />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Descripción general *</label>
                  <textarea value={formData.generalDescription} onChange={(e) => setFormData({ ...formData, generalDescription: e.target.value })} disabled={!canEdit()} placeholder="Describe el propósito de esta orden..." rows={3} className={`w-full px-4 py-3 border ${errors.generalDescription ? "border-red-300 bg-red-50" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none disabled:bg-slate-50 disabled:cursor-not-allowed`} />
                  {errors.generalDescription && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.generalDescription}</p>}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Hash size={18} className="text-indigo-600" />
                  Líneas de pedido
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-1">{items.length}</span>
                </h2>
                {canEdit() && (
                  <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                    <Plus size={14} />
                    Añadir línea
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const isExpanded = expandedItems.has(item.id);
                  const hasErrors = errors[`item_${index}_description`] || errors[`item_${index}_account`] || errors[`item_${index}_quantity`] || errors[`item_${index}_unitPrice`];

                  return (
                    <div key={item.id} className={`${hasErrors ? "bg-red-50/30" : ""}`}>
                      {/* Collapsed Header */}
                      <div className={`px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? "border-b border-slate-100" : ""}`} onClick={() => toggleItemExpanded(item.id)}>
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${hasErrors ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-600"}`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {item.description || <span className="text-slate-400 italic">Sin descripción</span>}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {item.subAccountCode ? <span className="font-mono">{item.subAccountCode}</span> : <span className="text-slate-400">Sin cuenta</span>}
                              {item.quantity > 0 && item.unitPrice > 0 && <span className="ml-2">· {item.quantity} × {formatCurrency(item.unitPrice)} {getCurrencySymbol()}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(item.totalAmount)} {getCurrencySymbol()}</p>
                            <p className="text-xs text-slate-500">Base: {formatCurrency(item.baseAmount)}</p>
                          </div>
                          <ChevronDown size={18} className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-6 py-5 bg-slate-50/30 space-y-4">
                          {/* Description & Account */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Descripción *</label>
                              <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} disabled={!canEdit()} placeholder="Descripción del ítem..." className={`w-full px-3 py-2.5 border ${errors[`item_${index}_description`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:cursor-not-allowed`} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Cuenta presupuestaria *</label>
                              <button onClick={() => canEdit() && openAccountModal(index)} disabled={!canEdit()} className={`w-full px-3 py-2.5 border ${errors[`item_${index}_account`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm text-left flex items-center justify-between ${canEdit() ? "hover:border-slate-300 bg-white" : "bg-slate-100 cursor-not-allowed"} transition-colors`}>
                                {item.subAccountCode ? <span className="font-mono text-slate-900">{item.subAccountCode}</span> : <span className="text-slate-400">Seleccionar...</span>}
                                {canEdit() && <Search size={14} className="text-slate-400" />}
                              </button>
                            </div>
                          </div>

                          {/* Date, Qty, Price */}
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Fecha</label>
                              <input type="date" value={item.date} onChange={(e) => updateItem(index, "date", e.target.value)} disabled={!canEdit()} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:cursor-not-allowed" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Cantidad</label>
                              <input type="number" min="1" step="any" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} disabled={!canEdit()} className={`w-full px-3 py-2.5 border ${errors[`item_${index}_quantity`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:cursor-not-allowed`} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Precio unit. ({getCurrencySymbol()})</label>
                              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} disabled={!canEdit()} className={`w-full px-3 py-2.5 border ${errors[`item_${index}_unitPrice`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:cursor-not-allowed`} />
                            </div>
                          </div>

                          {/* VAT & IRPF */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">IVA</label>
                              <div className="flex gap-1">
                                {VAT_RATES.map((rate) => (
                                  <button key={rate.value} onClick={() => canEdit() && updateItem(index, "vatRate", rate.value)} disabled={!canEdit()} className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all ${item.vatRate === rate.value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-slate-300"} ${!canEdit() && "opacity-50 cursor-not-allowed"}`}>
                                    {rate.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">IRPF</label>
                              <div className="flex gap-1">
                                {IRPF_RATES.slice(0, 4).map((rate) => (
                                  <button key={rate.value} onClick={() => canEdit() && updateItem(index, "irpfRate", rate.value)} disabled={!canEdit()} className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all ${item.irpfRate === rate.value ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:border-slate-300"} ${!canEdit() && "opacity-50 cursor-not-allowed"}`}>
                                    {rate.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Item Totals */}
                          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                            <div className="flex gap-6 text-xs">
                              <div><span className="text-slate-500">Base:</span> <span className="font-semibold text-slate-900">{formatCurrency(item.baseAmount)} {getCurrencySymbol()}</span></div>
                              <div><span className="text-slate-500">IVA:</span> <span className="font-semibold text-emerald-600">+{formatCurrency(item.vatAmount)}</span></div>
                              <div><span className="text-slate-500">IRPF:</span> <span className="font-semibold text-red-600">-{formatCurrency(item.irpfAmount)}</span></div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-slate-900">{formatCurrency(item.totalAmount)} {getCurrencySymbol()}</span>
                              {canEdit() && items.length > 1 && (
                                <button onClick={(e) => { e.stopPropagation(); removeItem(index); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes & File */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Notes */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Info size={18} className="text-indigo-600" />
                    Notas
                  </h2>
                </div>
                <div className="p-6">
                  <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} disabled={!canEdit()} placeholder="Notas internas, instrucciones especiales..." rows={4} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none disabled:bg-slate-50 disabled:cursor-not-allowed" />
                </div>
              </div>

              {/* File Upload */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Upload size={18} className="text-indigo-600" />
                    Adjunto
                  </h2>
                </div>
                <div className="p-6">
                  {existingFileUrl && !uploadedFile && (
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                          <FileText size={20} className="text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{existingFileName}</p>
                          <a href={existingFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                            <ExternalLink size={12} /> Ver archivo
                          </a>
                        </div>
                      </div>
                      {canEdit() && (
                        <button onClick={removeExistingFile} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  )}

                  {canEdit() && (
                    <>
                      {uploadedFile ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                              <FileUp size={20} className="text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-emerald-900">{uploadedFile.name}</p>
                              <p className="text-xs text-emerald-600">{(uploadedFile.size / 1024).toFixed(0)} KB · Listo para subir</p>
                            </div>
                          </div>
                          <button onClick={removeFile} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                            <X size={16} />
                          </button>
                        </div>
                      ) : !existingFileUrl && (
                        <label className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-all block">
                          <Upload size={28} className="text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">Arrastra o haz clic</p>
                          <p className="text-xs text-slate-400 mt-1">PDF, imágenes · Máx. 10MB</p>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Totals Card */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <h3 className="text-sm font-medium text-slate-400 mb-5">Resumen</h3>

                  <div className="space-y-3 mb-5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Base imponible</span>
                      <span className="font-medium">{formatCurrency(totals.baseAmount)} {getCurrencySymbol()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">IVA</span>
                      <span className="font-medium text-emerald-400">+{formatCurrency(totals.vatAmount)} {getCurrencySymbol()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">IRPF</span>
                      <span className="font-medium text-red-400">-{formatCurrency(totals.irpfAmount)} {getCurrencySymbol()}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-300">Total</span>
                      <span className="text-3xl font-bold">{formatCurrency(totals.totalAmount)} {getCurrencySymbol()}</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
                    <span>{items.length} línea{items.length !== 1 ? "s" : ""}</span>
                    <span>{formData.currency}</span>
                  </div>
                </div>
              </div>

              {/* Approval Preview */}
              {canSendForApproval() && (
                <div className={`border rounded-2xl p-5 ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${approvalPreview.autoApprove ? "bg-emerald-100" : "bg-amber-100"}`}>
                      {approvalPreview.autoApprove ? <CheckCircle size={20} className="text-emerald-600" /> : <Clock size={20} className="text-amber-600" />}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"}`}>
                        {approvalPreview.autoApprove ? "Aprobación automática" : "Requiere aprobación"}
                      </p>
                      <p className={`text-xs mt-1 ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>
                        {approvalPreview.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Acciones rápidas</h3>

                <div className="space-y-2">
                  <Link href={`/project/${id}/accounting/pos/${poId}`} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                    <Eye size={16} />
                    Ver detalle
                  </Link>

                  <Link href={`/project/${id}/accounting/pos`} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors">
                    <ArrowLeft size={16} />
                    Volver al listado
                  </Link>
                </div>
              </div>

              {/* Status Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex gap-3">
                  <Info size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-600 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Estado:</span>
                      {getStatusBadge(poStatus)}
                    </div>
                    {poStatus === "draft" && <p>Puedes editar y guardar como borrador o enviar para aprobación.</p>}
                    {poStatus === "rejected" && <p>Puedes corregir y reenviar para aprobación.</p>}
                    {poStatus === "pending" && <p>Esperando aprobación. No se puede editar.</p>}
                    {poStatus === "approved" && <p>PO aprobada. No se puede editar.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h2>
              <button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar por nombre o NIF..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" autoFocus />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredSuppliers.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No se encontraron proveedores</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSuppliers.map((supplier) => (
                    <button key={supplier.id} onClick={() => selectSupplier(supplier)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group">
                      <p className="font-medium text-slate-900 group-hover:text-indigo-600">{supplier.fiscalName}</p>
                      {supplier.commercialName && <p className="text-xs text-slate-600 mt-0.5">{supplier.commercialName}</p>}
                      <p className="text-xs text-slate-500 mt-1 font-mono">NIF: {supplier.taxId}</p>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Seleccionar cuenta</h2>
              <button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar por código o descripción..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" autoFocus />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredSubAccounts.length === 0 ? (
                <div className="text-center py-12">
                  <Hash size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No se encontraron cuentas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSubAccounts.map((subAccount) => (
                    <button key={subAccount.id} onClick={() => selectAccount(subAccount)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-mono font-bold text-slate-900 group-hover:text-indigo-600">{subAccount.code}</p>
                          <p className="text-sm text-slate-700 mt-0.5">{subAccount.description}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{subAccount.accountCode} - {subAccount.accountDescription}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-slate-100">
                        <div>
                          <p className="text-slate-500">Presupuesto</p>
                          <p className="font-semibold text-slate-900">{subAccount.budgeted.toLocaleString()} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Comprometido</p>
                          <p className="font-semibold text-amber-600">{subAccount.committed.toLocaleString()} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Realizado</p>
                          <p className="font-semibold text-emerald-600">{subAccount.actual.toLocaleString()} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Disponible</p>
                          <p className={`font-bold ${subAccount.available < 0 ? "text-red-600" : subAccount.available < subAccount.budgeted * 0.1 ? "text-amber-600" : "text-emerald-600"}`}>
                            {subAccount.available.toLocaleString()} €
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
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
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Folder,
  Receipt,
  ArrowLeft,
  Save,
  Building2,
  AlertCircle,
  Info,
  Upload,
  X,
  Plus,
  Trash2,
  Search,
  Calendar,
  Hash,
  FileText,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  Send,
  ChevronRight,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

interface PO { id: string; number: string; supplier: string; supplierId: string; totalAmount: number; items: POItem[]; }
interface POItem { id?: string; description: string; subAccountId: string; subAccountCode: string; subAccountDescription: string; quantity: number; unitPrice: number; baseAmount: number; vatRate: number; vatAmount: number; irpfRate: number; irpfAmount: number; totalAmount: number; }
interface InvoiceItem { id: string; description: string; poItemId?: string; isNewItem: boolean; subAccountId: string; subAccountCode: string; subAccountDescription: string; quantity: number; unitPrice: number; baseAmount: number; vatRate: number; vatAmount: number; irpfRate: number; irpfAmount: number; totalAmount: number; }
interface SubAccount { id: string; code: string; description: string; budgeted: number; committed: number; actual: number; available: number; accountId: string; accountCode: string; accountDescription: string; }
interface Supplier { id: string; fiscalName: string; commercialName: string; taxId: string; }
interface Member { userId: string; role?: string; department?: string; position?: string; }
interface ApprovalStep { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers?: string[]; roles?: string[]; department?: string; requireAll: boolean; }
interface ApprovalStepStatus { id: string; order: number; approverType: "fixed" | "role" | "hod" | "coordinator"; approvers: string[]; roles?: string[]; department?: string; approvedBy: string[]; rejectedBy: string[]; status: "pending" | "approved" | "rejected"; requireAll: boolean; }

const VAT_RATES = [{ value: 0, label: "0%" }, { value: 4, label: "4%" }, { value: 10, label: "10%" }, { value: 21, label: "21%" }];
const IRPF_RATES = [{ value: 0, label: "0%" }, { value: 7, label: "7%" }, { value: 15, label: "15%" }, { value: 19, label: "19%" }];

export default function NewInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);
  const [showPOModal, setShowPOModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [poSearch, setPOSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPOs] = useState<PO[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [formData, setFormData] = useState({ invoiceType: "with-po" as "with-po" | "without-po", supplier: "", supplierName: "", description: "", dueDate: "", notes: "" });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });
  const [poStats, setPOStats] = useState({ totalAmount: 0, invoicedAmount: 0, percentageInvoiced: 0, isOverInvoiced: false });

  useEffect(() => { const unsub = auth.onAuthStateChanged((u) => { if (u) { setUserId(u.uid); setUserName(u.displayName || u.email || "Usuario"); } else router.push("/"); }); return () => unsub(); }, [router]);
  useEffect(() => { if (userId && id) loadData(); }, [userId, id]);
  useEffect(() => { calculateTotals(); }, [items]);
  useEffect(() => { if (selectedPO) calculatePOStats(); }, [selectedPO, totals]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");
      const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
      setMembers(membersSnap.docs.map((d) => ({ userId: d.id, ...d.data() } as Member)));
      const approvalDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      setApprovalConfig(approvalDoc.exists() ? approvalDoc.data().invoiceApprovals || [] : [{ id: "default-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false }]);
      const posSnap = await getDocs(query(collection(db, `projects/${id}/pos`), where("status", "==", "approved"), orderBy("createdAt", "desc")));
      setPOs(posSnap.docs.map((d) => ({ id: d.id, number: d.data().number, supplier: d.data().supplier, supplierId: d.data().supplierId, totalAmount: d.data().totalAmount || 0, items: (d.data().items || []).map((item: any, idx: number) => ({ ...item, id: item.id || `item-${idx}` })) })));
      const suppSnap = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      setSuppliers(suppSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier)));
      const accsSnap = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const allSubs: SubAccount[] = [];
      for (const accDoc of accsSnap.docs) {
        const accData = accDoc.data();
        const subsSnap = await getDocs(query(collection(db, `projects/${id}/accounts/${accDoc.id}/subaccounts`), orderBy("code", "asc")));
        subsSnap.docs.forEach((s) => { const d = s.data(); allSubs.push({ id: s.id, code: d.code, description: d.description, budgeted: d.budgeted || 0, committed: d.committed || 0, actual: d.actual || 0, available: (d.budgeted || 0) - (d.committed || 0) - (d.actual || 0), accountId: accDoc.id, accountCode: accData.code, accountDescription: accData.description }); });
      }
      setSubAccounts(allSubs);
      const invSnap = await getDocs(collection(db, `projects/${id}/invoices`));
      setNextInvoiceNumber(String(invSnap.size + 1).padStart(4, "0"));
      const dd = new Date(); dd.setDate(dd.getDate() + 30);
      setFormData((p) => ({ ...p, dueDate: dd.toISOString().split("T")[0] }));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const resolveApprovers = (step: ApprovalStep, dept?: string): string[] => { switch (step.approverType) { case "fixed": return step.approvers || []; case "role": return members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId); case "hod": return members.filter((m) => m.position === "HOD" && m.department === (step.department || dept)).map((m) => m.userId); case "coordinator": return members.filter((m) => m.position === "Coordinator" && m.department === (step.department || dept)).map((m) => m.userId); default: return []; } };
  const generateApprovalSteps = (dept?: string): ApprovalStepStatus[] => approvalConfig.length === 0 ? [] : approvalConfig.map((s) => ({ id: s.id || "", order: s.order || 0, approverType: s.approverType || "fixed", approvers: resolveApprovers(s, dept), roles: s.roles || [], department: s.department || "", approvedBy: [], rejectedBy: [], status: "pending" as const, requireAll: s.requireAll ?? false }));
  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean => steps.length === 0 || steps.every((s) => s.approvers.length === 0);
  const getApprovalPreview = () => { if (approvalConfig.length === 0) return { autoApprove: true, message: "Irá a pendiente de pago" }; const steps = generateApprovalSteps(); if (steps.every((s) => s.approvers.length === 0)) return { autoApprove: true, message: "Irá a pendiente de pago" }; return { autoApprove: false, message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`, steps }; };
  const calculateItemTotal = (item: InvoiceItem) => { const base = item.quantity * item.unitPrice; const vat = base * (item.vatRate / 100); const irpf = base * (item.irpfRate / 100); return { baseAmount: base, vatAmount: vat, irpfAmount: irpf, totalAmount: base + vat - irpf }; };
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => { const n = [...items]; n[i] = { ...n[i], [field]: value }; const c = calculateItemTotal(n[i]); n[i] = { ...n[i], ...c }; setItems(n); };
  const addNewItem = () => setItems([...items, { id: String(items.length + 1), description: "", isNewItem: true, subAccountId: "", subAccountCode: "", subAccountDescription: "", quantity: 1, unitPrice: 0, baseAmount: 0, vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0 }]);
  const removeItem = (i: number) => { if (items.length === 1) return; setItems(items.filter((_, idx) => idx !== i)); };
  const calculateTotals = () => setTotals({ baseAmount: items.reduce((s, i) => s + i.baseAmount, 0), vatAmount: items.reduce((s, i) => s + i.vatAmount, 0), irpfAmount: items.reduce((s, i) => s + i.irpfAmount, 0), totalAmount: items.reduce((s, i) => s + i.totalAmount, 0) });
  const calculatePOStats = async () => { if (!selectedPO) return; try { const invSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("poId", "==", selectedPO.id), where("status", "in", ["pending", "approved", "paid", "overdue"]))); const invoiced = invSnap.docs.reduce((s, d) => s + (d.data().totalAmount || 0), 0); const total = invoiced + totals.totalAmount; setPOStats({ totalAmount: selectedPO.totalAmount, invoicedAmount: total, percentageInvoiced: selectedPO.totalAmount > 0 ? (total / selectedPO.totalAmount) * 100 : 0, isOverInvoiced: total > selectedPO.totalAmount }); } catch (e) { console.error(e); } };
  const selectPO = (po: PO) => { setSelectedPO(po); setFormData({ ...formData, supplier: po.supplierId, supplierName: po.supplier, description: `Factura para PO-${po.number}` }); setShowPOModal(false); setPOSearch(""); };
  const selectSupplier = (s: Supplier) => { setFormData({ ...formData, supplier: s.id, supplierName: s.fiscalName }); setShowSupplierModal(false); setSupplierSearch(""); };
  const addPOItem = (poItem: POItem) => { if (items.find((i) => i.poItemId === poItem.id)) return; setItems([...items, { id: String(items.length + 1), description: poItem.description, poItemId: poItem.id, isNewItem: false, subAccountId: poItem.subAccountId, subAccountCode: poItem.subAccountCode, subAccountDescription: poItem.subAccountDescription, quantity: poItem.quantity, unitPrice: poItem.unitPrice, baseAmount: poItem.baseAmount, vatRate: poItem.vatRate, vatAmount: poItem.vatAmount, irpfRate: poItem.irpfRate, irpfAmount: poItem.irpfAmount, totalAmount: poItem.totalAmount }]); };
  const selectAccount = (sub: SubAccount) => { if (currentItemIndex !== null) { const n = [...items]; n[currentItemIndex] = { ...n[currentItemIndex], subAccountId: sub.id, subAccountCode: sub.code, subAccountDescription: sub.description }; setItems(n); } setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); };
  const handleFileUpload = (file: File) => { if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) { alert("Solo PDF o imágenes hasta 10MB"); return; } setUploadedFile(file); };
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }, []);
  const validateForm = () => { const e: Record<string, string> = {}; if (!uploadedFile) e.file = "Adjunta el archivo"; if (formData.invoiceType === "with-po" && !selectedPO) e.po = "Selecciona una PO"; if (formData.invoiceType === "without-po" && !formData.supplier) e.supplier = "Selecciona un proveedor"; if (!formData.description.trim()) e.description = "Obligatorio"; if (!formData.dueDate) e.dueDate = "Obligatorio"; if (items.length === 0) e.items = "Añade al menos un ítem"; items.forEach((it, i) => { if (!it.description.trim()) e[`item_${i}_description`] = "Obligatorio"; if (!it.subAccountId) e[`item_${i}_account`] = "Obligatorio"; if (it.quantity <= 0) e[`item_${i}_quantity`] = "> 0"; if (it.unitPrice <= 0) e[`item_${i}_unitPrice`] = "> 0"; }); setErrors(e); return Object.keys(e).length === 0; };
  const handleSubmit = async () => { if (!validateForm()) return; setSaving(true); try { let fileUrl = ""; if (uploadedFile) { const fileRef = ref(storage, `projects/${id}/invoices/${nextInvoiceNumber}/${uploadedFile.name}`); await uploadBytes(fileRef, uploadedFile); fileUrl = await getDownloadURL(fileRef); } const itemsData = items.map((i) => ({ description: i.description.trim(), poItemId: i.poItemId || null, isNewItem: i.isNewItem, subAccountId: i.subAccountId, subAccountCode: i.subAccountCode, subAccountDescription: i.subAccountDescription, quantity: i.quantity, unitPrice: i.unitPrice, baseAmount: i.baseAmount, vatRate: i.vatRate, vatAmount: i.vatAmount, irpfRate: i.irpfRate, irpfAmount: i.irpfAmount, totalAmount: i.totalAmount })); const invoiceData: any = { number: nextInvoiceNumber, supplier: formData.supplierName, supplierId: formData.supplier, poId: selectedPO?.id || null, poNumber: selectedPO?.number || null, description: formData.description.trim(), notes: formData.notes.trim(), items: itemsData, baseAmount: totals.baseAmount, vatAmount: totals.vatAmount, irpfAmount: totals.irpfAmount, totalAmount: totals.totalAmount, dueDate: Timestamp.fromDate(new Date(formData.dueDate)), attachmentUrl: fileUrl, attachmentFileName: uploadedFile?.name || "", createdAt: Timestamp.now(), createdBy: userId, createdByName: userName }; const steps = generateApprovalSteps(); if (shouldAutoApprove(steps)) { invoiceData.status = "pending"; invoiceData.approvalStatus = "approved"; invoiceData.autoApproved = true; } else { invoiceData.status = "pending_approval"; invoiceData.approvalStatus = "pending"; invoiceData.approvalSteps = steps; invoiceData.currentApprovalStep = 0; } await addDoc(collection(db, `projects/${id}/invoices`), invoiceData); setSuccessMessage(invoiceData.autoApproved ? "Factura creada y pendiente de pago" : "Factura enviada para aprobación"); setTimeout(() => router.push(`/project/${id}/accounting/invoices`), 1500); } catch (e: any) { alert(`Error: ${e.message}`); } finally { setSaving(false); } };
  const formatCurrency = (a: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a);
  const filteredPOs = pos.filter((p) => p.number.toLowerCase().includes(poSearch.toLowerCase()) || p.supplier.toLowerCase().includes(poSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()));
  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));
  const approvalPreview = getApprovalPreview();

  if (loading) return <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}><main className="pt-28 pb-16 flex-grow flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-600 text-sm">Cargando...</p></div></main></div>;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/project/${id}/accounting/invoices`} className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1"><Folder size={14} />{projectName}<ChevronRight size={14} /><span>Facturas</span></Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center"><Receipt size={24} className="text-white" /></div>
            <div><h1 className={`text-2xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Nueva factura</h1><p className="text-slate-400 text-sm">FAC-{nextInvoiceNumber} • {userName}</p></div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-4">
        <div className="max-w-7xl mx-auto">
          {successMessage && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700"><CheckCircle size={20} /><span className="font-medium">{successMessage}</span></div>}
          {Object.keys(errors).length > 0 && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700"><AlertCircle size={20} /><span className="font-medium">Hay errores en el formulario</span></div>}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Tipo de factura</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => { setFormData({ ...formData, invoiceType: "with-po", supplier: "", supplierName: "" }); setItems([]); setSelectedPO(null); }} className={`p-5 rounded-xl border-2 transition-all text-left ${formData.invoiceType === "with-po" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center justify-between mb-2"><FileText size={22} className={formData.invoiceType === "with-po" ? "text-slate-900" : "text-slate-400"} />{formData.invoiceType === "with-po" && <CheckCircle size={18} className="text-slate-900" />}</div>
                    <h3 className="font-semibold text-slate-900 mb-1">Con PO asociada</h3><p className="text-sm text-slate-500">Vinculada a una orden de compra</p>
                  </button>
                  <button onClick={() => { setFormData({ ...formData, invoiceType: "without-po", supplier: "", supplierName: "" }); setItems([]); setSelectedPO(null); }} className={`p-5 rounded-xl border-2 transition-all text-left ${formData.invoiceType === "without-po" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center justify-between mb-2"><Receipt size={22} className={formData.invoiceType === "without-po" ? "text-slate-900" : "text-slate-400"} />{formData.invoiceType === "without-po" && <CheckCircle size={18} className="text-slate-900" />}</div>
                    <h3 className="font-semibold text-slate-900 mb-1">Sin PO</h3><p className="text-sm text-slate-500">Factura independiente</p>
                  </button>
                </div>
              </div>

              {formData.invoiceType === "with-po" && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Orden de compra</p>
                  <button onClick={() => setShowPOModal(true)} className={`w-full px-4 py-3 border ${errors.po ? "border-red-300" : "border-slate-200"} rounded-xl hover:border-slate-400 transition-colors text-left flex items-center justify-between bg-slate-50`}>
                    {selectedPO ? <div className="flex items-center gap-2"><FileText size={18} className="text-slate-600" /><div><p className="font-medium text-slate-900">PO-{selectedPO.number}</p><p className="text-sm text-slate-500">{selectedPO.supplier}</p></div></div> : <span className="text-slate-400">Seleccionar PO...</span>}<Search size={18} className="text-slate-400" />
                  </button>
                  {selectedPO && <div className={`mt-4 p-4 rounded-xl border ${poStats.isOverInvoiced ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}><div className="flex items-start gap-3">{poStats.isOverInvoiced ? <AlertTriangle size={18} className="text-red-600 mt-0.5" /> : <Info size={18} className="text-slate-500 mt-0.5" />}<div className="flex-1"><p className={`text-sm font-semibold mb-2 ${poStats.isOverInvoiced ? "text-red-800" : "text-slate-700"}`}>{poStats.isOverInvoiced ? "Excede PO" : "Estado de facturación"}</p><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-500">Total PO</p><p className="font-semibold text-slate-900">{formatCurrency(poStats.totalAmount)} €</p></div><div><p className="text-slate-500">Facturado</p><p className={`font-semibold ${poStats.isOverInvoiced ? "text-red-600" : "text-emerald-600"}`}>{formatCurrency(poStats.invoicedAmount)} €</p></div></div><div className="mt-3 w-full bg-slate-200 rounded-full h-2 overflow-hidden"><div className={`h-full transition-all ${poStats.percentageInvoiced > 100 ? "bg-red-500" : poStats.percentageInvoiced > 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(poStats.percentageInvoiced, 100)}%` }} /></div></div></div></div>}
                  {selectedPO && selectedPO.items.length > 0 && <div className="mt-4"><p className="text-xs font-semibold text-slate-700 mb-2">Items de la PO</p><div className="space-y-2 max-h-64 overflow-y-auto">{selectedPO.items.map((poItem, idx) => { const added = items.find((i) => i.poItemId === poItem.id); return <div key={poItem.id || idx} className={`flex items-center justify-between p-3 rounded-xl border ${added ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}><div className="flex-1"><p className="text-sm font-medium text-slate-900">{poItem.description || "Sin descripción"}</p><p className="text-xs text-slate-500">{poItem.quantity} × {formatCurrency(poItem.unitPrice)} € = {formatCurrency(poItem.totalAmount)} €</p></div>{added ? <span className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg">Agregado</span> : <button onClick={() => addPOItem(poItem)} className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">Agregar</button>}</div>; })}</div></div>}
                </div>
              )}

              {formData.invoiceType === "without-po" && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Proveedor</p>
                  <button onClick={() => setShowSupplierModal(true)} className={`w-full px-4 py-3 border ${errors.supplier ? "border-red-300" : "border-slate-200"} rounded-xl hover:border-slate-400 transition-colors text-left flex items-center justify-between bg-slate-50`}>
                    {formData.supplierName ? <div className="flex items-center gap-2"><Building2 size={18} className="text-slate-600" /><span className="font-medium text-slate-900">{formData.supplierName}</span></div> : <span className="text-slate-400">Seleccionar proveedor...</span>}<Search size={18} className="text-slate-400" />
                  </button>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Información básica</p>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-2">Descripción *</label><textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Concepto de la factura..." rows={3} className={`w-full px-4 py-3 border ${errors.description ? "border-red-300" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 resize-none`} /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-2">Fecha de vencimiento *</label><div className="relative"><Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} className={`w-full pl-10 pr-4 py-3 border ${errors.dueDate ? "border-red-300" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50`} /></div></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-2">Notas</label><textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notas..." rows={2} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 resize-none" /></div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Items ({items.length})</p><button onClick={addNewItem} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"><Plus size={14} />Nuevo</button></div>
                {items.length === 0 ? <div className="text-center py-8 text-slate-500"><ShoppingCart size={32} className="mx-auto mb-2 text-slate-300" /><p className="text-sm">No hay ítems</p></div> : (
                  <div className="space-y-4">{items.map((item, index) => (
                    <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Hash size={12} />Item {index + 1}</span>{item.isNewItem ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">Nuevo</span> : <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">De PO</span>}</div>{items.length > 1 && <button onClick={() => removeItem(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>}</div>
                      <div className="space-y-3">
                        <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} disabled={!item.isNewItem} placeholder="Descripción..." className={`w-full px-3 py-2.5 border ${errors[`item_${index}_description`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white disabled:bg-slate-100`} />
                        {item.isNewItem && <button onClick={() => { setCurrentItemIndex(index); setShowAccountModal(true); }} className={`w-full px-3 py-2.5 border ${errors[`item_${index}_account`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm text-left flex items-center justify-between hover:border-slate-400 transition-colors bg-white`}>{item.subAccountCode ? <span className="font-mono text-slate-900">{item.subAccountCode} - {item.subAccountDescription}</span> : <span className="text-slate-400">Seleccionar cuenta...</span>}<Search size={14} className="text-slate-400" /></button>}
                        <div className="grid grid-cols-4 gap-3"><div><label className="block text-xs text-slate-500 mb-1">Cantidad</label><input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} disabled={!item.isNewItem} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-100" /></div><div><label className="block text-xs text-slate-500 mb-1">Precio</label><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} disabled={!item.isNewItem} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-100" /></div><div><label className="block text-xs text-slate-500 mb-1">IVA</label><select value={item.vatRate} onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))} disabled={!item.isNewItem} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-100">{VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div><div><label className="block text-xs text-slate-500 mb-1">IRPF</label><select value={item.irpfRate} onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))} disabled={!item.isNewItem} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-100">{IRPF_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div></div>
                        <div className="flex justify-end"><div className="bg-slate-900 text-white px-4 py-2 rounded-lg"><span className="text-xs text-slate-400">Total:</span><span className="ml-2 font-bold">{formatCurrency(item.totalAmount)} €</span></div></div>
                      </div>
                    </div>
                  ))}</div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Archivo de la factura *</p>
                <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }} className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging ? "border-slate-400 bg-slate-50" : errors.file ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-400 bg-slate-50"}`}>
                  {uploadedFile ? <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4"><div className="flex items-center gap-3"><div className="bg-slate-100 p-2 rounded-lg"><FileText size={22} className="text-slate-600" /></div><div className="text-left"><p className="text-sm font-medium text-slate-900">{uploadedFile.name}</p><p className="text-xs text-slate-500">{(uploadedFile.size / 1024).toFixed(0)} KB</p></div></div><button onClick={() => setUploadedFile(null)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-colors"><X size={18} /></button></div> : <label className="cursor-pointer block"><Upload size={40} className={`mx-auto mb-3 ${errors.file ? "text-red-400" : "text-slate-400"}`} /><p className={`text-sm font-medium mb-1 ${errors.file ? "text-red-700" : "text-slate-700"}`}>Arrastra o haz clic</p><p className="text-xs text-slate-500">PDF, JPG, PNG (máx. 10MB)</p><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" /></label>}
                </div>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                <div className="bg-slate-900 rounded-2xl shadow-lg p-6 text-white">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">Total de la factura</p>
                  <div className="space-y-3 mb-4"><div className="flex justify-between items-center"><span className="text-sm text-slate-400">Base</span><span className="font-semibold">{formatCurrency(totals.baseAmount)} €</span></div><div className="flex justify-between items-center"><span className="text-sm text-slate-400">IVA</span><span className="font-semibold text-emerald-400">+{formatCurrency(totals.vatAmount)} €</span></div><div className="flex justify-between items-center"><span className="text-sm text-slate-400">IRPF</span><span className="font-semibold text-red-400">-{formatCurrency(totals.irpfAmount)} €</span></div></div>
                  <div className="border-t border-slate-700 pt-3"><div className="flex justify-between items-center"><span className="text-lg font-semibold">Total</span><span className="text-2xl font-bold">{formatCurrency(totals.totalAmount)} €</span></div></div>
                </div>

                <div className={`border rounded-xl p-4 ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-start gap-3">{approvalPreview.autoApprove ? <CheckCircle size={18} className="text-emerald-600 mt-0.5" /> : <AlertCircle size={18} className="text-amber-600 mt-0.5" />}<div><p className={`font-semibold text-sm ${approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"}`}>{approvalPreview.autoApprove ? "Sin aprobación" : "Requiere aprobación"}</p><p className={`text-xs mt-1 ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>{approvalPreview.message}</p>{!approvalPreview.autoApprove && approvalPreview.steps && <div className="mt-2 space-y-1">{approvalPreview.steps.map((s, i) => <div key={s.id} className="text-xs text-amber-700 flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-semibold text-[10px]">{i + 1}</span><span>{s.approverType === "role" && s.roles ? s.roles.join(", ") : s.approverType}{s.approvers.length > 0 && ` (${s.approvers.length})`}</span></div>)}</div>}</div></div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Acciones</p>
                  <div className="space-y-3">
                    <button onClick={handleSubmit} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50">{saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Guardando...</> : <>{approvalPreview.autoApprove ? <Save size={18} /> : <Send size={18} />}{approvalPreview.autoApprove ? "Crear factura" : "Enviar para aprobación"}</>}</button>
                    <Link href={`/project/${id}/accounting/invoices`} className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 font-medium transition-colors"><ArrowLeft size={18} />Cancelar</Link>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4"><div className="flex gap-2"><Info size={16} className="text-slate-500 flex-shrink-0 mt-0.5" /><div className="text-xs text-slate-600"><p className="font-semibold mb-1">Importante</p><ul className="space-y-1 text-slate-500"><li>• Archivo obligatorio</li><li>• Items de PO no editables</li><li>• Puedes añadir nuevos items</li></ul></div></div></div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showPOModal && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden"><div className="bg-slate-900 px-6 py-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Seleccionar PO</h2><button onClick={() => { setShowPOModal(false); setPOSearch(""); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button></div><div className="p-6"><div className="relative mb-4"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={poSearch} onChange={(e) => setPOSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" autoFocus /></div><div className="max-h-96 overflow-y-auto space-y-2">{filteredPOs.length === 0 ? <p className="text-center text-slate-500 py-8">No hay POs aprobadas</p> : filteredPOs.map((po) => <button key={po.id} onClick={() => selectPO(po)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all group"><div className="flex items-start justify-between"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><p className="font-semibold text-slate-900">PO-{po.number}</p><span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">Aprobada</span></div><p className="text-sm text-slate-600">{po.supplier}</p><p className="text-xs text-slate-500 mt-1">{po.items.length} ítems</p></div><p className="font-bold text-slate-900">{formatCurrency(po.totalAmount)} €</p></div></button>)}</div></div></div></div>}

      {showSupplierModal && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden"><div className="bg-slate-900 px-6 py-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Seleccionar proveedor</h2><button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button></div><div className="p-6"><div className="relative mb-4"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" autoFocus /></div><div className="max-h-96 overflow-y-auto space-y-2">{filteredSuppliers.length === 0 ? <p className="text-center text-slate-500 py-8">No encontrado</p> : filteredSuppliers.map((s) => <button key={s.id} onClick={() => selectSupplier(s)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all group"><div className="flex items-start justify-between"><div className="flex-1"><p className="font-semibold text-slate-900">{s.fiscalName}</p>{s.commercialName && <p className="text-sm text-slate-500">{s.commercialName}</p>}<p className="text-xs text-slate-500 mt-1">NIF: {s.taxId}</p></div><Building2 size={18} className="text-slate-400 group-hover:text-slate-600" /></div></button>)}</div></div></div></div>}

      {showAccountModal && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden"><div className="bg-slate-900 px-6 py-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Seleccionar cuenta</h2><button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button></div><div className="p-6"><div className="relative mb-4"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" autoFocus /></div><div className="max-h-96 overflow-y-auto space-y-2">{filteredSubAccounts.length === 0 ? <p className="text-center text-slate-500 py-8">No encontrado</p> : filteredSubAccounts.map((sub) => <button key={sub.id} onClick={() => selectAccount(sub)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-all group"><div className="flex items-start justify-between mb-2"><div className="flex-1"><p className="font-mono font-semibold text-slate-900">{sub.code}</p><p className="text-sm text-slate-700">{sub.description}</p></div></div><div className="grid grid-cols-4 gap-2 text-xs"><div><p className="text-slate-500">Presupuestado</p><p className="font-semibold text-slate-900">{formatCurrency(sub.budgeted)} €</p></div><div><p className="text-slate-500">Comprometido</p><p className="font-semibold text-amber-600">{formatCurrency(sub.committed)} €</p></div><div><p className="text-slate-500">Realizado</p><p className="font-semibold text-emerald-600">{formatCurrency(sub.actual)} €</p></div><div><p className="text-slate-500">Disponible</p><p className={`font-bold ${sub.available < 0 ? "text-red-600" : sub.available < sub.budgeted * 0.1 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(sub.available)} €</p></div></div></button>)}</div></div></div></div>}
    </div>
  );
}

"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, collection, getDocs, addDoc, query, orderBy, Timestamp, where, updateDoc } from "firebase/firestore";
import { Receipt, ArrowLeft, Building2, AlertCircle, Info, Upload, X, Plus, Trash2, Search, Calendar, Hash, FileText, ShoppingCart, CheckCircle, CheckCircle2, AlertTriangle, Send, Shield, FileCheck, Clock, Users, ChevronRight, Circle, ShieldAlert, RefreshCw, ArrowRight, Lock } from "lucide-react";
import { useAccountingPermissions } from "@/hooks/useAccountingPermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const DOCUMENT_TYPES = {
  invoice: { code: "FAC", label: "Factura", icon: Receipt, bgColor: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-emerald-200", requiresReplacement: false },
  proforma: { code: "PRF", label: "Proforma", icon: FileText, bgColor: "bg-violet-50", textColor: "text-violet-700", borderColor: "border-violet-200", requiresReplacement: true },
  budget: { code: "PRS", label: "Presupuesto", icon: FileCheck, bgColor: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-amber-200", requiresReplacement: true },
  guarantee: { code: "FNZ", label: "Fianza", icon: Shield, bgColor: "bg-slate-100", textColor: "text-slate-700", borderColor: "border-slate-300", requiresReplacement: false },
};

type DocumentType = keyof typeof DOCUMENT_TYPES;

interface PO {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  department?: string;
  totalAmount: number;
  baseAmount?: number;
  items: POItem[];
}

interface POItem {
  id?: string;
  description: string;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
}

interface POItemWithInvoiced extends POItem {
  invoicedAmount: number;
  availableAmount: number;
}

interface InvoiceItem {
  id: string;
  description: string;
  poItemId?: string;
  poItemIndex?: number;
  isNewItem: boolean;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
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

interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  taxId: string;
}

interface Member {
  userId: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  position?: string;
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

interface PendingDocument {
  id: string;
  documentType: DocumentType;
  number: string;
  displayNumber: string;
  supplier: string;
  supplierId: string;
  department?: string;
  totalAmount: number;
  baseAmount: number;
  paidAt: Date;
  poId?: string;
  poNumber?: string;
  items: any[];
  description: string;
}

const VAT_RATES = [{ value: 0, label: "0%" }, { value: 4, label: "4%" }, { value: 10, label: "10%" }, { value: 21, label: "21%" }];
const IRPF_RATES = [{ value: 0, label: "0%" }, { value: 7, label: "7%" }, { value: 15, label: "15%" }, { value: 19, label: "19%" }];

export default function NewInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { loading: permissionsLoading, error: permissionsError, permissions } = useAccountingPermissions(id);

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nextNumber, setNextNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>("");
  const [showPOModal, setShowPOModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPOItemsModal, setShowPOItemsModal] = useState(false);
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
  const [poItemsWithInvoiced, setPOItemsWithInvoiced] = useState<POItemWithInvoiced[]>([]);
  const [formData, setFormData] = useState({ invoiceType: "with-po" as "with-po" | "without-po", supplier: "", supplierName: "", department: "", description: "", dueDate: "", notes: "" });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });
  const [poStats, setPOStats] = useState({ totalAmount: 0, invoicedAmount: 0, percentageInvoiced: 0, isOverInvoiced: false });
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [selectedPendingDoc, setSelectedPendingDoc] = useState<PendingDocument | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [sameAmount, setSameAmount] = useState(true);
  const [amountDifference, setAmountDifference] = useState(0);
  const [differenceReason, setDifferenceReason] = useState("");

  const currentDocType = DOCUMENT_TYPES[documentType];
  const getDocumentNumber = () => `${currentDocType.code}-${nextNumber}`;

  useEffect(() => { if (!permissionsLoading && permissions.userId && id) loadData(); }, [permissionsLoading, permissions.userId, id]);
  useEffect(() => { calculateTotals(); }, [items]);
  useEffect(() => { if (selectedPO) { calculatePOStats(); loadPOItemsInvoiced(); } }, [selectedPO]);
  useEffect(() => { if (selectedPO && poItemsWithInvoiced.length > 0) updateAvailableWithCurrentItems(); }, [items, poItemsWithInvoiced.length]);
  useEffect(() => { if (id) updateNextNumber(); }, [documentType, id]);
  useEffect(() => { if (Object.keys(touched).length > 0) validateForm(); }, [formData, items, uploadedFile, selectedPO]);
  useEffect(() => { if (replaceMode && selectedPendingDoc) { const diff = totals.totalAmount - selectedPendingDoc.totalAmount; setAmountDifference(diff); setSameAmount(Math.abs(diff) < 0.01); } }, [totals.totalAmount, selectedPendingDoc, replaceMode]);

  const updateNextNumber = async () => {
    try {
      const snap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("documentType", "==", documentType)));
      setNextNumber(String(snap.size + 1).padStart(4, "0"));
    } catch {
      setNextNumber("0001");
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
      const membersData: Member[] = [];
      for (const mDoc of membersSnap.docs) {
        const mData = mDoc.data();
        let name = mData.name || mData.email || mDoc.id;
        try {
          const uDoc = await getDoc(doc(db, "users", mDoc.id));
          if (uDoc.exists()) name = uDoc.data().displayName || uDoc.data().email || name;
        } catch {}
        membersData.push({ userId: mDoc.id, name, email: mData.email, role: mData.role, department: mData.department, position: mData.position });
      }
      setMembers(membersData);

      const approvalDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      setApprovalConfig(approvalDoc.exists() ? approvalDoc.data().invoiceApprovals || [] : [{ id: "default-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false }]);

      const posSnap = await getDocs(query(collection(db, `projects/${id}/pos`), where("status", "==", "approved"), orderBy("createdAt", "desc")));
      const allPOs = posSnap.docs.map((d) => ({
        id: d.id,
        number: d.data().number,
        supplier: d.data().supplier,
        supplierId: d.data().supplierId,
        department: d.data().department || "",
        totalAmount: d.data().totalAmount || 0,
        baseAmount: d.data().baseAmount || d.data().totalAmount || 0,
        items: (d.data().items || []).map((item: any, idx: number) => ({ ...item, id: item.id || `item-${idx}` })),
      }));
      const filteredPOs = allPOs.filter((po) => {
        if (permissions.canViewAllPOs) return true;
        if (permissions.canViewDepartmentPOs && po.department === permissions.department) return true;
        return false;
      });
      setPOs(filteredPOs);

      const suppSnap = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      setSuppliers(suppSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier)));

      const accsSnap = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const allSubs: SubAccount[] = [];
      for (const accDoc of accsSnap.docs) {
        const accData = accDoc.data();
        const subsSnap = await getDocs(query(collection(db, `projects/${id}/accounts/${accDoc.id}/subaccounts`), orderBy("code", "asc")));
        subsSnap.docs.forEach((s) => {
          const d = s.data();
          allSubs.push({
            id: s.id,
            code: d.code,
            description: d.description,
            budgeted: d.budgeted || 0,
            committed: d.committed || 0,
            actual: d.actual || 0,
            available: (d.budgeted || 0) - (d.committed || 0) - (d.actual || 0),
            accountId: accDoc.id,
            accountCode: accData.code,
            accountDescription: accData.description,
          });
        });
      }
      setSubAccounts(allSubs);

      const pendingSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("status", "==", "paid"), where("requiresReplacement", "==", true)));
      const pendingDocs = pendingSnap.docs
        .filter((d) => !d.data().replacedByInvoiceId)
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            documentType: data.documentType || "proforma",
            number: data.number,
            displayNumber: data.displayNumber || `${DOCUMENT_TYPES[data.documentType as DocumentType]?.code || "PRF"}-${data.number}`,
            supplier: data.supplier,
            supplierId: data.supplierId,
            department: data.department || "",
            totalAmount: data.totalAmount,
            baseAmount: data.baseAmount || data.totalAmount,
            paidAt: data.paidAt?.toDate() || new Date(),
            poId: data.poId || null,
            poNumber: data.poNumber || null,
            items: data.items || [],
            description: data.description || "",
          };
        })
        .filter((pd) => {
          if (permissions.canViewAllPOs) return true;
          if (permissions.canViewDepartmentPOs && pd.department === permissions.department) return true;
          return false;
        });
      setPendingDocuments(pendingDocs);

      const invSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("documentType", "==", "invoice")));
      setNextNumber(String(invSnap.size + 1).padStart(4, "0"));

      const dd = new Date();
      dd.setDate(dd.getDate() + 30);
      setFormData((p) => ({ ...p, dueDate: dd.toISOString().split("T")[0], department: permissions.fixedDepartment || "" }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadPOItemsInvoiced = async () => {
    if (!selectedPO) return;
    try {
      const invSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("poId", "==", selectedPO.id), where("status", "in", ["pending", "pending_approval", "approved", "paid", "overdue"])));
      const invoicedByItem: Record<string, number> = {};
      invSnap.docs.forEach((invDoc) => {
        (invDoc.data().items || []).forEach((invItem: any) => {
          if (invItem.poItemId || invItem.poItemIndex !== undefined) {
            const key = invItem.poItemId || `index-${invItem.poItemIndex}`;
            invoicedByItem[key] = (invoicedByItem[key] || 0) + (invItem.totalAmount || 0);
          }
        });
      });
      setPOItemsWithInvoiced(
        selectedPO.items.map((item, idx) => {
          const key = item.id || `index-${idx}`;
          const invoicedAmount = invoicedByItem[key] || 0;
          return { ...item, id: item.id || `item-${idx}`, invoicedAmount, availableAmount: item.totalAmount - invoicedAmount };
        })
      );
    } catch (e) {
      console.error(e);
    }
  };

  const updateAvailableWithCurrentItems = () => {
    const currentByItem: Record<string, number> = {};
    items.forEach((item) => {
      if (item.poItemId) currentByItem[item.poItemId] = (currentByItem[item.poItemId] || 0) + item.totalAmount;
    });
    setPOItemsWithInvoiced((prev) => prev.map((poItem) => ({ ...poItem, availableAmount: poItem.totalAmount - poItem.invoicedAmount - (currentByItem[poItem.id!] || 0) })));
  };

  const resolveApprovers = (step: ApprovalStep): { ids: string[]; names: string[] } => {
    let ids: string[] = [];
    if (step.approverType === "fixed") ids = step.approvers || [];
    else if (step.approverType === "role") ids = members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId);
    else if (step.approverType === "hod") ids = members.filter((m) => m.position === "HOD" && m.department === step.department).map((m) => m.userId);
    else if (step.approverType === "coordinator") ids = members.filter((m) => m.position === "Coordinator" && m.department === step.department).map((m) => m.userId);
    return { ids, names: ids.map((uid) => { const m = members.find((x) => x.userId === uid); return m?.name || m?.email || uid; }) };
  };

  const generateApprovalSteps = (): ApprovalStepStatus[] =>
    approvalConfig.map((s) => {
      const { ids, names } = resolveApprovers(s);
      return { id: s.id, order: s.order, approverType: s.approverType, approvers: ids, approverNames: names, roles: s.roles, department: s.department, approvedBy: [], rejectedBy: [], status: "pending", requireAll: s.requireAll };
    });

  const shouldAutoApprove = (steps: ApprovalStepStatus[]) => steps.length === 0 || steps.every((s) => s.approvers.length === 0);

  const getApprovalPreview = () => {
    const steps = generateApprovalSteps();
    if (shouldAutoApprove(steps)) return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    return { autoApprove: false, message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`, steps };
  };

  const calculateItemTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    const vat = base * (item.vatRate / 100);
    const irpf = base * (item.irpfRate / 100);
    return { baseAmount: base, vatAmount: vat, irpfAmount: irpf, totalAmount: base + vat - irpf };
  };

  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => {
    const n = [...items];
    n[i] = { ...n[i], [field]: value, ...calculateItemTotal({ ...n[i], [field]: value }) };
    setItems(n);
    setTouched((p) => ({ ...p, [`item_${i}_${field}`]: true }));
  };

  const addNewItem = () =>
    setItems([
      ...items,
      { id: String(Date.now()), description: "", isNewItem: true, subAccountId: "", subAccountCode: "", subAccountDescription: "", quantity: 1, unitPrice: 0, baseAmount: 0, vatRate: 21, vatAmount: 0, irpfRate: 0, irpfAmount: 0, totalAmount: 0 },
    ]);

  const addPOItemToInvoice = (poItem: POItemWithInvoiced, idx: number) => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: poItem.description,
        poItemId: poItem.id,
        poItemIndex: idx,
        isNewItem: false,
        subAccountId: poItem.subAccountId,
        subAccountCode: poItem.subAccountCode,
        subAccountDescription: poItem.subAccountDescription,
        quantity: poItem.quantity,
        unitPrice: poItem.unitPrice,
        baseAmount: poItem.baseAmount,
        vatRate: poItem.vatRate,
        vatAmount: poItem.vatAmount,
        irpfRate: poItem.irpfRate,
        irpfAmount: poItem.irpfAmount,
        totalAmount: poItem.totalAmount,
      },
    ]);
    setShowPOItemsModal(false);
  };

  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const calculateTotals = () =>
    setTotals({
      baseAmount: items.reduce((s, i) => s + i.baseAmount, 0),
      vatAmount: items.reduce((s, i) => s + i.vatAmount, 0),
      irpfAmount: items.reduce((s, i) => s + i.irpfAmount, 0),
      totalAmount: items.reduce((s, i) => s + i.totalAmount, 0),
    });

  const calculatePOStats = async () => {
    if (!selectedPO) return;
    try {
      const invSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("poId", "==", selectedPO.id), where("status", "in", ["pending", "pending_approval", "approved", "paid", "overdue"])));
      const invoiced = invSnap.docs.reduce((s, d) => s + (d.data().totalAmount || 0), 0) + totals.totalAmount;
      setPOStats({
        totalAmount: selectedPO.totalAmount,
        invoicedAmount: invoiced,
        percentageInvoiced: selectedPO.totalAmount > 0 ? (invoiced / selectedPO.totalAmount) * 100 : 0,
        isOverInvoiced: invoiced > selectedPO.totalAmount,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const selectPO = (po: PO) => {
    setSelectedPO(po);
    setFormData({ ...formData, supplier: po.supplierId, supplierName: po.supplier, department: po.department || formData.department, description: `${currentDocType.label} para PO-${po.number}` });
    setItems([]);
    setShowPOModal(false);
    setPOSearch("");
    setTouched((p) => ({ ...p, po: true }));
  };

  const selectSupplier = (s: Supplier) => {
    setFormData({ ...formData, supplier: s.id, supplierName: s.fiscalName });
    setShowSupplierModal(false);
    setSupplierSearch("");
    setTouched((p) => ({ ...p, supplier: true }));
  };

  const selectAccount = (sub: SubAccount) => {
    if (currentItemIndex !== null) {
      const n = [...items];
      n[currentItemIndex] = { ...n[currentItemIndex], subAccountId: sub.id, subAccountCode: sub.code, subAccountDescription: sub.description };
      setItems(n);
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  const startReplacement = (pd: PendingDocument) => {
    setSelectedPendingDoc(pd);
    setReplaceMode(true);
    setDocumentType("invoice");
    setLinkedDocumentId(pd.id);
    setFormData({ ...formData, invoiceType: pd.poId ? "with-po" : "without-po", supplier: pd.supplierId, supplierName: pd.supplier, department: pd.department || formData.department, description: `Factura definitiva para ${pd.displayNumber}` });
    if (pd.poId) {
      const po = pos.find((p) => p.id === pd.poId);
      if (po) setSelectedPO(po);
    }
    if (pd.items && pd.items.length > 0) {
      setItems(
        pd.items.map((item: any, idx: number) => ({
          id: String(Date.now() + idx),
          description: item.description || "",
          poItemId: item.poItemId || null,
          poItemIndex: item.poItemIndex ?? null,
          isNewItem: item.isNewItem ?? true,
          subAccountId: item.subAccountId || "",
          subAccountCode: item.subAccountCode || "",
          subAccountDescription: item.subAccountDescription || "",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          baseAmount: item.baseAmount || 0,
          vatRate: item.vatRate ?? 21,
          vatAmount: item.vatAmount || 0,
          irpfRate: item.irpfRate || 0,
          irpfAmount: item.irpfAmount || 0,
          totalAmount: item.totalAmount || 0,
        }))
      );
    }
    setSameAmount(true);
    setAmountDifference(0);
    setDifferenceReason("");
    setShowReplaceModal(false);
  };

  const cancelReplacement = () => {
    setReplaceMode(false);
    setSelectedPendingDoc(null);
    setLinkedDocumentId("");
    setFormData({ invoiceType: "with-po", supplier: "", supplierName: "", department: permissions.fixedDepartment || "", description: "", dueDate: formData.dueDate, notes: "" });
    setItems([]);
    setSelectedPO(null);
    setSameAmount(true);
    setAmountDifference(0);
    setDifferenceReason("");
  };

  const handleFileUpload = (file: File) => {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      alert("Solo PDF o imágenes hasta 10MB");
      return;
    }
    setUploadedFile(file);
    setTouched((p) => ({ ...p, file: true }));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileUpload(f);
  }, []);

  const handleBlur = (field: string) => setTouched((p) => ({ ...p, [field]: true }));

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!uploadedFile) e.file = "Adjunta el archivo";
    if (formData.invoiceType === "with-po" && !selectedPO && !replaceMode) e.po = "Selecciona una PO";
    if (formData.invoiceType === "without-po" && !formData.supplier && !linkedDocumentId) e.supplier = "Selecciona proveedor";
    if (!formData.description.trim()) e.description = "Obligatorio";
    if (!formData.dueDate) e.dueDate = "Obligatorio";
    if (items.length === 0) e.items = "Añade al menos un ítem";
    items.forEach((it, i) => {
      if (!it.description.trim()) e[`item_${i}_description`] = "Obligatorio";
      if (!it.subAccountId) e[`item_${i}_account`] = "Obligatorio";
      if (it.quantity <= 0) e[`item_${i}_quantity`] = "> 0";
      if (it.unitPrice <= 0) e[`item_${i}_unitPrice`] = "> 0";
    });
    if (replaceMode && !sameAmount && !differenceReason.trim()) e.differenceReason = "Explica la diferencia";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ============ NUEVA FUNCIÓN: Actualizar presupuesto de subcuentas al crear factura ============
  const updateSubAccountsBudget = async (invoiceItems: InvoiceItem[], hasPO: boolean) => {
    // Agrupar items por subAccountId para minimizar operaciones
    const updatesBySubAccount: Record<string, { baseAmount: number; accountId?: string }> = {};

    for (const item of invoiceItems) {
      if (item.subAccountId && item.baseAmount > 0) {
        if (!updatesBySubAccount[item.subAccountId]) {
          updatesBySubAccount[item.subAccountId] = { baseAmount: 0 };
        }
        updatesBySubAccount[item.subAccountId].baseAmount += item.baseAmount;
      }
    }

    // Buscar las subcuentas y actualizar
    const accountsSnapshot = await getDocs(collection(db, `projects/${id}/accounts`));

    for (const [subAccountId, data] of Object.entries(updatesBySubAccount)) {
      for (const accountDoc of accountsSnapshot.docs) {
        try {
          const subAccountRef = doc(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`, subAccountId);
          const subAccountSnap = await getDoc(subAccountRef);

          if (subAccountSnap.exists()) {
            const currentCommitted = subAccountSnap.data().committed || 0;
            const currentActual = subAccountSnap.data().actual || 0;

            // Si tiene PO: restar de committed y sumar a actual
            // Si no tiene PO: solo sumar a actual
            const updates: { committed?: number; actual: number } = {
              actual: currentActual + data.baseAmount,
            };

            if (hasPO) {
              updates.committed = Math.max(0, currentCommitted - data.baseAmount);
            }

            await updateDoc(subAccountRef, updates);
            break; // Encontramos la subcuenta, salir del loop de accounts
          }
        } catch (e) {
          console.error(`Error updating budget for subaccount ${subAccountId}:`, e);
        }
      }
    }
  };

  // ============ NUEVA FUNCIÓN: Actualizar invoicedAmount en la PO ============
  const updatePOInvoicedAmount = async (poId: string, invoiceBaseAmount: number) => {
    try {
      const poRef = doc(db, `projects/${id}/pos`, poId);
      const poSnap = await getDoc(poRef);

      if (poSnap.exists()) {
        const currentInvoiced = poSnap.data().invoicedAmount || 0;
        const poBaseAmount = poSnap.data().baseAmount || poSnap.data().totalAmount || 0;
        const newInvoiced = currentInvoiced + invoiceBaseAmount;

        await updateDoc(poRef, {
          invoicedAmount: newInvoiced,
          remainingAmount: Math.max(0, poBaseAmount - newInvoiced),
        });
      }
    } catch (e) {
      console.error("Error updating PO invoiced amount:", e);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      let fileUrl = "";
      if (uploadedFile) {
        const fileRef = ref(storage, `projects/${id}/invoices/${getDocumentNumber()}/${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      const itemsData = items.map((i) => ({
        description: i.description.trim(),
        poItemId: i.poItemId || null,
        poItemIndex: i.poItemIndex ?? null,
        isNewItem: i.isNewItem,
        subAccountId: i.subAccountId,
        subAccountCode: i.subAccountCode,
        subAccountDescription: i.subAccountDescription,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        baseAmount: i.baseAmount,
        vatRate: i.vatRate,
        vatAmount: i.vatAmount,
        irpfRate: i.irpfRate,
        irpfAmount: i.irpfAmount,
        totalAmount: i.totalAmount,
      }));

      const invoiceData: any = {
        documentType,
        number: nextNumber,
        displayNumber: getDocumentNumber(),
        supplier: formData.supplierName,
        supplierId: formData.supplier,
        department: formData.department || selectedPO?.department || permissions.fixedDepartment || "",
        poId: selectedPO?.id || null,
        poNumber: selectedPO?.number || null,
        description: formData.description.trim(),
        notes: formData.notes.trim(),
        items: itemsData,
        baseAmount: totals.baseAmount,
        vatAmount: totals.vatAmount,
        irpfAmount: totals.irpfAmount,
        totalAmount: totals.totalAmount,
        dueDate: Timestamp.fromDate(new Date(formData.dueDate)),
        attachmentUrl: fileUrl,
        attachmentFileName: uploadedFile?.name || "",
        createdAt: Timestamp.now(),
        createdBy: permissions.userId,
        createdByName: permissions.userName,
        requiresReplacement: currentDocType.requiresReplacement,
        replacedByInvoiceId: null,
        linkedDocumentId: linkedDocumentId || null,
      };

      if (replaceMode && selectedPendingDoc) {
        invoiceData.isReplacement = true;
        invoiceData.replacesDocumentId = selectedPendingDoc.id;
        invoiceData.replacesDocumentNumber = selectedPendingDoc.displayNumber;
        invoiceData.originalAmount = selectedPendingDoc.totalAmount;
        invoiceData.amountDifference = amountDifference;
        invoiceData.hasDifference = !sameAmount;
        if (!sameAmount) {
          invoiceData.differenceReason = differenceReason.trim();
          invoiceData.pendingAmount = amountDifference;
        }
      }

      const steps = generateApprovalSteps();
      if (shouldAutoApprove(steps)) {
        invoiceData.status = "pending";
        invoiceData.approvalStatus = "approved";
        invoiceData.autoApproved = true;
      } else {
        invoiceData.status = "pending_approval";
        invoiceData.approvalStatus = "pending";
        invoiceData.approvalSteps = steps;
        invoiceData.currentApprovalStep = 0;
      }

      const docRef = await addDoc(collection(db, `projects/${id}/invoices`), invoiceData);

      // ============ NUEVO: Actualizar presupuesto de subcuentas ============
      // Solo actualizar si la factura está aprobada automáticamente o es una factura definitiva
      if (invoiceData.autoApproved || documentType === "invoice") {
        const hasPO = !!selectedPO;
        await updateSubAccountsBudget(items, hasPO);

        // Si tiene PO, actualizar el invoicedAmount de la PO
        if (selectedPO) {
          await updatePOInvoicedAmount(selectedPO.id, totals.baseAmount);
        }
      }

      if (linkedDocumentId || (replaceMode && selectedPendingDoc)) {
        const docToUpdate = linkedDocumentId || selectedPendingDoc?.id;
        if (docToUpdate) {
          await updateDoc(doc(db, `projects/${id}/invoices`, docToUpdate), {
            replacedByInvoiceId: docRef.id,
            replacedAt: Timestamp.now(),
          });
        }
      }

      setSuccessMessage(invoiceData.autoApproved ? `${currentDocType.label} creada` : `${currentDocType.label} enviada para aprobación`);
      setTimeout(() => router.push(`/project/${id}/accounting/invoices`), 1500);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (a: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a);
  const formatDate = (d: Date) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(d);

  const getCompletionPercentage = () => {
    let c = 0;
    if (uploadedFile) c++;
    if (formData.invoiceType === "with-po" ? selectedPO : formData.supplier || linkedDocumentId) c++;
    if (formData.description.trim()) c++;
    if (formData.dueDate) c++;
    if (items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0)) c++;
    return Math.round((c / 5) * 100);
  };

  const filteredPOs = pos.filter((p) => p.number.toLowerCase().includes(poSearch.toLowerCase()) || p.supplier.toLowerCase().includes(poSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()));
  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));

  const approvalPreview = getApprovalPreview();
  const completionPercentage = getCompletionPercentage();
  const DocIcon = currentDocType.icon;
  const hasError = (f: string) => touched[f] && errors[f];

  if (permissionsLoading || loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (permissionsError || !permissions.hasAccountingAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-500 mb-6">{permissionsError || "No tienes permisos para crear facturas"}</p>
          <Link href={`/project/${id}/accounting/invoices`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
            <ArrowLeft size={16} />
            Volver a facturas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                <ArrowLeft size={12} />
                Proyectos
              </Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting/invoices`} className="hover:text-slate-900 transition-colors">
                Facturas
              </Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 ${currentDocType.bgColor} rounded-2xl flex items-center justify-center`}>
                <DocIcon size={24} className={currentDocType.textColor} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">{replaceMode ? "Factura definitiva" : `Subir ${currentDocType.label.toLowerCase()}`}</h1>
                  {replaceMode && (
                    <span className="px-2.5 py-1 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                      <RefreshCw size={12} />
                      Sustitución
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-sm mt-0.5">
                  {getDocumentNumber()} · {permissions.userName}
                  {permissions.fixedDepartment && <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">{permissions.fixedDepartment}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {replaceMode && (
                <button onClick={cancelReplacement} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50">
                  <X size={16} />
                  Cancelar
                </button>
              )}
              <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    {approvalPreview.autoApprove ? <CheckCircle size={16} /> : <Send size={16} />}
                    {approvalPreview.autoApprove ? `Crear ${currentDocType.label.toLowerCase()}` : "Enviar"}
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

        {replaceMode && selectedPendingDoc && (
          <div className="mb-6 p-4 bg-violet-50 border border-violet-200 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <RefreshCw size={18} className="text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-violet-800">Sustituyendo {selectedPendingDoc.displayNumber}</p>
                <p className="text-sm text-violet-700 mt-0.5">Esta factura definitiva reemplazará al documento original de {formatCurrency(selectedPendingDoc.totalAmount)} €</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Document Type */}
            {!replaceMode && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Tipo de documento</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(Object.entries(DOCUMENT_TYPES) as [DocumentType, typeof DOCUMENT_TYPES.invoice][]).map(([key, config]) => {
                      const Icon = config.icon;
                      const isSelected = documentType === key;
                      return (
                        <button
                          key={key}
                          onClick={() => { setDocumentType(key); setLinkedDocumentId(""); }}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${isSelected ? `${config.borderColor} ${config.bgColor}` : "border-slate-200 hover:border-slate-300"}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Icon size={20} className={isSelected ? config.textColor : "text-slate-400"} />
                            {isSelected && <CheckCircle2 size={16} className={config.textColor} />}
                          </div>
                          <p className="font-semibold text-slate-900 text-sm">{config.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{config.code}</p>
                        </button>
                      );
                    })}
                  </div>
                  {currentDocType.requiresReplacement && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">Requiere factura definitiva</p>
                          <p className="text-sm text-amber-700 mt-1">Una vez pagado, deberás subir la factura definitiva.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Botón sustituir */}
            {!replaceMode && pendingDocuments.length > 0 && documentType === "invoice" && (
              <button onClick={() => setShowReplaceModal(true)} className="w-full p-4 border border-dashed border-violet-300 rounded-2xl bg-violet-50/50 hover:bg-violet-50 hover:border-violet-400 transition-all text-left group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                      <RefreshCw size={18} className="text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-violet-800">¿Tienes la factura definitiva?</p>
                      <p className="text-xs text-violet-600">{pendingDocuments.length} proforma{pendingDocuments.length !== 1 ? "s" : ""}/presupuesto{pendingDocuments.length !== 1 ? "s" : ""} pendiente{pendingDocuments.length !== 1 ? "s" : ""} de factura</p>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-violet-400 group-hover:text-violet-600 transition-colors" />
                </div>
              </button>
            )}

            {/* PO Association */}
            {!replaceMode && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Asociación a PO</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => { setFormData({ ...formData, invoiceType: "with-po", supplier: "", supplierName: "" }); setItems([]); setSelectedPO(null); }} className={`p-5 rounded-xl border-2 transition-all text-left ${formData.invoiceType === "with-po" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <FileText size={20} className={formData.invoiceType === "with-po" ? "text-indigo-600" : "text-indigo-400"} />
                        </div>
                        {formData.invoiceType === "with-po" && <CheckCircle2 size={20} className="text-slate-900" />}
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-1">Con PO asociada</h3>
                      <p className="text-sm text-slate-500">Vinculada a una orden de compra</p>
                    </button>
                    <button onClick={() => { setFormData({ ...formData, invoiceType: "without-po", supplier: "", supplierName: "" }); setItems([]); setSelectedPO(null); }} className={`p-5 rounded-xl border-2 transition-all text-left ${formData.invoiceType === "without-po" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Receipt size={20} className={formData.invoiceType === "without-po" ? "text-emerald-600" : "text-emerald-400"} />
                        </div>
                        {formData.invoiceType === "without-po" && <CheckCircle2 size={20} className="text-slate-900" />}
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-1">Sin PO</h3>
                      <p className="text-sm text-slate-500">Documento independiente</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PO Selection */}
            {formData.invoiceType === "with-po" && !replaceMode && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Orden de compra *</h2>
                </div>
                <div className="p-6">
                  <button onClick={() => setShowPOModal(true)} onBlur={() => handleBlur("po")} className={`w-full px-4 py-3 border ${hasError("po") ? "border-red-300 bg-red-50" : selectedPO ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between`}>
                    {selectedPO ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <CheckCircle2 size={18} className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">PO-{selectedPO.number}</p>
                          <p className="text-sm text-slate-500">{selectedPO.supplier}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Seleccionar PO...</span>
                    )}
                    <Search size={16} className="text-slate-400" />
                  </button>
                  {hasError("po") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.po}</p>}
                  {selectedPO && (
                    <div className={`mt-4 p-4 rounded-xl border ${poStats.isOverInvoiced ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 ${poStats.isOverInvoiced ? "bg-red-100" : "bg-slate-200"} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          {poStats.isOverInvoiced ? <AlertTriangle size={16} className="text-red-600" /> : <Info size={16} className="text-slate-500" />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold mb-2 ${poStats.isOverInvoiced ? "text-red-800" : "text-slate-700"}`}>{poStats.isOverInvoiced ? "Excede el total de la PO" : "Estado de facturación"}</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-slate-500">Total PO</p>
                              <p className="font-semibold text-slate-900">{formatCurrency(poStats.totalAmount)} €</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Facturado</p>
                              <p className={`font-semibold ${poStats.isOverInvoiced ? "text-red-600" : "text-emerald-600"}`}>{formatCurrency(poStats.invoicedAmount)} €</p>
                            </div>
                          </div>
                          <div className="mt-3 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div className={`h-full ${poStats.percentageInvoiced > 100 ? "bg-red-500" : poStats.percentageInvoiced > 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(poStats.percentageInvoiced, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PO en modo sustitución */}
            {replaceMode && selectedPO && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <Lock size={16} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Orden de compra vinculada</h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <FileText size={18} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">PO-{selectedPO.number}</p>
                      <p className="text-sm text-slate-500">{selectedPO.supplier}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Supplier Selection */}
            {formData.invoiceType === "without-po" && !linkedDocumentId && !replaceMode && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Proveedor *</h2>
                </div>
                <div className="p-6">
                  <button onClick={() => setShowSupplierModal(true)} onBlur={() => handleBlur("supplier")} className={`w-full px-4 py-3 border ${hasError("supplier") ? "border-red-300 bg-red-50" : formData.supplier ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between`}>
                    {formData.supplierName ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <CheckCircle2 size={18} className="text-emerald-600" />
                        </div>
                        <span className="font-medium text-slate-900">{formData.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Seleccionar proveedor...</span>
                    )}
                    <Search size={16} className="text-slate-400" />
                  </button>
                  {hasError("supplier") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.supplier}</p>}
                </div>
              </div>
            )}

            {/* Proveedor en modo sustitución */}
            {replaceMode && formData.supplierName && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <Lock size={16} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Proveedor</h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                      <Building2 size={18} className="text-slate-600" />
                    </div>
                    <span className="font-medium text-slate-900">{formData.supplierName}</span>
                  </div>
                </div>
              </div>
            )}

            {/* File Upload */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Archivo del documento *</h2>
                <p className="text-xs text-slate-500 mt-0.5">PDF, JPG o PNG hasta 10MB</p>
              </div>
              <div className="p-6">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging ? "border-indigo-400 bg-indigo-50" : uploadedFile ? "border-emerald-300 bg-emerald-50" : hasError("file") ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  {uploadedFile ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <CheckCircle2 size={18} className="text-emerald-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-slate-900">{uploadedFile.name}</p>
                          <p className="text-xs text-slate-500">{(uploadedFile.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                      <button onClick={() => setUploadedFile(null)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className={`w-12 h-12 ${hasError("file") ? "bg-red-100" : "bg-slate-100"} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                        <Upload size={20} className={hasError("file") ? "text-red-400" : "text-slate-400"} />
                      </div>
                      <p className={`text-sm font-medium mb-1 ${hasError("file") ? "text-red-700" : "text-slate-700"}`}>Arrastra o haz clic para subir</p>
                      <p className="text-xs text-slate-500">PDF, JPG, PNG (máx. 10MB)</p>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" />
                    </label>
                  )}
                </div>
                {hasError("file") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.file}</p>}
              </div>
            </div>

            {/* Basic Info */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Información básica</h2>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Descripción *</label>
                  <div className="relative">
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      onBlur={() => handleBlur("description")}
                      placeholder={`Concepto de la ${currentDocType.label.toLowerCase()}...`}
                      rows={2}
                      className={`w-full px-4 py-3 border ${hasError("description") ? "border-red-300 bg-red-50" : formData.description.trim() ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm pr-10`}
                    />
                    {formData.description.trim() && <CheckCircle2 size={16} className="absolute right-4 top-4 text-emerald-600" />}
                  </div>
                  {hasError("description") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.description}</p>}
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      <span className="flex items-center gap-2"><Calendar size={14} />Fecha de vencimiento *</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                        onBlur={() => handleBlur("dueDate")}
                        className={`w-full px-4 py-3 border ${hasError("dueDate") ? "border-red-300 bg-red-50" : formData.dueDate ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`}
                      />
                      {formData.dueDate && <CheckCircle2 size={16} className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-600" />}
                    </div>
                    {hasError("dueDate") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.dueDate}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
                    <input
                      type="text"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Notas opcionales..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Diferencia de importe en modo sustitución */}
            {replaceMode && selectedPendingDoc && (
              <div className={`bg-white border rounded-2xl overflow-hidden ${!sameAmount ? "border-amber-300" : "border-slate-200"}`}>
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Verificación de importe</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <p className="text-xs text-slate-500 mb-1">Importe original</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(selectedPendingDoc.totalAmount)} €</p>
                      <p className="text-xs text-slate-400 mt-1">{selectedPendingDoc.displayNumber}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl">
                      <p className="text-xs text-emerald-600 mb-1">Importe factura</p>
                      <p className="text-lg font-bold text-emerald-700">{formatCurrency(totals.totalAmount)} €</p>
                      <p className="text-xs text-emerald-500 mt-1">Este documento</p>
                    </div>
                    <div className={`p-4 rounded-xl ${Math.abs(amountDifference) < 0.01 ? "bg-slate-50" : amountDifference > 0 ? "bg-amber-50" : "bg-blue-50"}`}>
                      <p className={`text-xs mb-1 ${Math.abs(amountDifference) < 0.01 ? "text-slate-500" : amountDifference > 0 ? "text-amber-600" : "text-blue-600"}`}>Diferencia</p>
                      <p className={`text-lg font-bold ${Math.abs(amountDifference) < 0.01 ? "text-slate-400" : amountDifference > 0 ? "text-amber-700" : "text-blue-700"}`}>
                        {amountDifference > 0 ? "+" : ""}{formatCurrency(amountDifference)} €
                      </p>
                      <p className={`text-xs mt-1 ${Math.abs(amountDifference) < 0.01 ? "text-slate-400" : amountDifference > 0 ? "text-amber-500" : "text-blue-500"}`}>
                        {Math.abs(amountDifference) < 0.01 ? "Sin diferencia" : amountDifference > 0 ? "Pendiente de cobro" : "Pendiente de devolución"}
                      </p>
                    </div>
                  </div>
                  {!sameAmount && (
                    <div className="mt-4">
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              {amountDifference > 0 ? `La factura es ${formatCurrency(amountDifference)} € mayor que el documento original` : `La factura es ${formatCurrency(Math.abs(amountDifference))} € menor que el documento original`}
                            </p>
                            <p className="text-xs text-amber-700 mt-1">
                              {amountDifference > 0 ? "Se registrará un importe pendiente de cobro al proveedor." : "Se registrará un importe pendiente de devolución del proveedor."}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de la diferencia *</label>
                        <textarea
                          value={differenceReason}
                          onChange={(e) => setDifferenceReason(e.target.value)}
                          onBlur={() => handleBlur("differenceReason")}
                          placeholder="Explica por qué hay diferencia de importe..."
                          rows={2}
                          className={`w-full px-4 py-3 border ${hasError("differenceReason") ? "border-red-300 bg-red-50" : differenceReason.trim() ? "border-emerald-300 bg-emerald-50" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm`}
                        />
                        {hasError("differenceReason") && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{errors.differenceReason}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-900">Items</h2>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${items.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{items.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  {formData.invoiceType === "with-po" && selectedPO && (
                    <button onClick={() => setShowPOItemsModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium">
                      <Plus size={14} />De PO
                    </button>
                  )}
                  <button onClick={addNewItem} className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">
                    <Plus size={14} />Nuevo
                  </button>
                </div>
              </div>
              <div className="p-6">
                {items.length === 0 ? (
                  <div className={`text-center py-12 border-2 border-dashed rounded-xl ${hasError("items") ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
                    <div className={`w-12 h-12 ${hasError("items") ? "bg-red-100" : "bg-slate-100"} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                      <ShoppingCart size={20} className={hasError("items") ? "text-red-400" : "text-slate-400"} />
                    </div>
                    <p className={`text-sm font-medium ${hasError("items") ? "text-red-700" : "text-slate-700"}`}>No hay ítems</p>
                    <p className="text-xs text-slate-400 mt-1">{formData.invoiceType === "with-po" && selectedPO ? "Añade items de la PO o crea uno nuevo" : `Añade items a la ${currentDocType.label.toLowerCase()}`}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, index) => {
                      const itemComplete = item.description.trim() && item.subAccountId && item.quantity > 0 && item.unitPrice > 0;
                      return (
                        <div key={item.id} className={`border rounded-xl p-5 ${itemComplete ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-slate-50/50"}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                {itemComplete ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Hash size={12} />}Item {index + 1}
                              </span>
                              {item.isNewItem ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg font-medium">Nuevo</span> : <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg font-medium">De PO</span>}
                              {itemComplete && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-medium">Completo</span>}
                            </div>
                            <button onClick={() => removeItem(index)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                          </div>
                          <div className="space-y-4">
                            <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} onBlur={() => handleBlur(`item_${index}_description`)} placeholder="Descripción..." className={`w-full px-4 py-3 border ${hasError(`item_${index}_description`) ? "border-red-300 bg-red-50" : item.description.trim() ? "border-emerald-200" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white`} />
                            {item.isNewItem ? (
                              <button onClick={() => { setCurrentItemIndex(index); setShowAccountModal(true); }} className={`w-full px-4 py-3 border ${hasError(`item_${index}_account`) ? "border-red-300 bg-red-50" : item.subAccountCode ? "border-emerald-200 bg-emerald-50" : "border-slate-200"} rounded-xl text-sm text-left flex items-center justify-between hover:border-slate-300 bg-white`}>
                                {item.subAccountCode ? <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-600" /><span className="font-mono text-slate-900">{item.subAccountCode} - {item.subAccountDescription}</span></div> : <span className="text-slate-400">Seleccionar cuenta...</span>}
                                <Search size={14} className="text-slate-400" />
                              </button>
                            ) : (
                              <div className="px-4 py-3 bg-slate-100 rounded-xl text-sm flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-600" /><span className="font-mono text-slate-700">{item.subAccountCode} - {item.subAccountDescription}</span></div>
                            )}
                            <div className="grid grid-cols-4 gap-3">
                              <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Cantidad</label><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} className={`w-full px-3 py-2.5 border ${item.quantity > 0 ? "border-emerald-200" : "border-slate-200"} rounded-xl text-sm bg-white`} /></div>
                              <div><label className="block text-xs font-medium text-slate-500 mb-1.5">Precio</label><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} className={`w-full px-3 py-2.5 border ${item.unitPrice > 0 ? "border-emerald-200" : "border-slate-200"} rounded-xl text-sm bg-white`} /></div>
                              <div><label className="block text-xs font-medium text-slate-500 mb-1.5">IVA</label><select value={item.vatRate} onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">{VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                              <div><label className="block text-xs font-medium text-slate-500 mb-1.5">IRPF</label><select value={item.irpfRate} onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">{IRPF_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                            </div>
                            <div className="flex justify-end"><div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm"><span className="text-slate-400">Total:</span><span className="ml-2 font-semibold">{formatCurrency(item.totalAmount)} €</span></div></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-4">
              {/* Progress */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3"><span className="text-sm font-medium text-slate-700">Progreso</span><span className={`text-sm font-bold ${completionPercentage === 100 ? "text-emerald-600" : "text-slate-900"}`}>{completionPercentage}%</span></div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full transition-all duration-300 ${completionPercentage === 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${completionPercentage}%` }} /></div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">{uploadedFile ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Circle size={12} className="text-slate-300" />}<span className={uploadedFile ? "text-slate-700" : "text-slate-400"}>Archivo</span></div>
                  <div className="flex items-center gap-2 text-xs">{(formData.invoiceType === "with-po" ? selectedPO : formData.supplier || linkedDocumentId) ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Circle size={12} className="text-slate-300" />}<span className={(formData.invoiceType === "with-po" ? selectedPO : formData.supplier || linkedDocumentId) ? "text-slate-700" : "text-slate-400"}>{formData.invoiceType === "with-po" ? "PO" : "Proveedor"}</span></div>
                  <div className="flex items-center gap-2 text-xs">{formData.description.trim() ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Circle size={12} className="text-slate-300" />}<span className={formData.description.trim() ? "text-slate-700" : "text-slate-400"}>Descripción</span></div>
                  <div className="flex items-center gap-2 text-xs">{formData.dueDate ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Circle size={12} className="text-slate-300" />}<span className={formData.dueDate ? "text-slate-700" : "text-slate-400"}>Fecha vencimiento</span></div>
                  <div className="flex items-center gap-2 text-xs">{items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0) ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Circle size={12} className="text-slate-300" />}<span className={items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0) ? "text-slate-700" : "text-slate-400"}>Items válidos</span></div>
                </div>
              </div>

              {/* Document Badge */}
              <div className={`${currentDocType.bgColor} border ${currentDocType.borderColor} rounded-2xl p-5`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center"><DocIcon size={20} className={currentDocType.textColor} /></div>
                  <div><p className={`font-semibold ${currentDocType.textColor}`}>{currentDocType.label}</p><p className="text-sm text-slate-600">{getDocumentNumber()}</p></div>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Total del documento</h2></div>
                <div className="p-6">
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center"><span className="text-sm text-slate-500">Base</span><span className="font-medium text-slate-900">{formatCurrency(totals.baseAmount)} €</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-slate-500">IVA</span><span className="font-medium text-emerald-600">+{formatCurrency(totals.vatAmount)} €</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-slate-500">IRPF</span><span className="font-medium text-red-600">-{formatCurrency(totals.irpfAmount)} €</span></div>
                  </div>
                  <div className="border-t border-slate-200 pt-4"><div className="flex justify-between items-center"><span className="text-base font-semibold text-slate-900">Total</span><span className="text-xl font-bold text-slate-900">{formatCurrency(totals.totalAmount)} €</span></div></div>
                </div>
              </div>

              {/* Approval */}
              <div className={`border rounded-2xl overflow-hidden ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="px-5 py-4 border-b" style={{ borderColor: approvalPreview.autoApprove ? "#a7f3d0" : "#fcd34d" }}>
                  <div className="flex items-center gap-3">
                    {approvalPreview.autoApprove ? <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><CheckCircle size={20} className="text-emerald-600" /></div> : <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Clock size={20} className="text-amber-600" /></div>}
                    <div><p className={`font-semibold ${approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"}`}>{approvalPreview.autoApprove ? "Aprobación automática" : "Requiere aprobación"}</p><p className={`text-sm ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>{approvalPreview.message}</p></div>
                  </div>
                </div>
                {!approvalPreview.autoApprove && approvalPreview.steps.length > 0 && (
                  <div className="px-5 py-4">
                    <div className="space-y-3">
                      {approvalPreview.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                            {idx < approvalPreview.steps.length - 1 && <div className="w-0.5 h-8 bg-amber-200 mt-1" />}
                          </div>
                          <div className="flex-1 pt-0.5">
                            <p className="text-sm font-medium text-amber-900">{step.approverType === "role" && step.roles ? step.roles.join(", ") : step.approverType === "hod" ? "Jefe de departamento" : step.approverType === "coordinator" ? "Coordinador" : "Aprobador fijo"}</p>
                            {step.approverNames.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {step.approverNames.slice(0, 3).map((name, i) => <span key={i} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg"><Users size={10} />{name.split(" ")[0]}</span>)}
                                {step.approverNames.length > 3 && <span className="text-xs text-amber-700">+{step.approverNames.length - 3} más</span>}
                              </div>
                            )}
                            <p className="text-xs text-amber-700 mt-1">{step.requireAll ? "Todos deben aprobar" : `1 de ${step.approvers.length} debe aprobar`}</p>
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
                  <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0"><Info size={14} className="text-slate-500" /></div>
                  <div className="text-sm text-slate-600">
                    <p className="font-medium text-slate-700 mb-2">Importante</p>
                    <ul className="space-y-1.5 text-slate-500">
                      <li className="flex items-start gap-2"><ChevronRight size={12} className="mt-0.5 flex-shrink-0" /><span>Archivo del documento obligatorio</span></li>
                      <li className="flex items-start gap-2"><ChevronRight size={12} className="mt-0.5 flex-shrink-0" /><span>Fecha de vencimiento obligatoria</span></li>
                      {currentDocType.requiresReplacement && <li className="flex items-start gap-2 text-amber-600"><ChevronRight size={12} className="mt-0.5 flex-shrink-0" /><span>Requiere factura definitiva tras pago</span></li>}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal para seleccionar documento a sustituir */}
      {showReplaceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div><h2 className="text-lg font-semibold text-slate-900">Sustituir por factura definitiva</h2><p className="text-sm text-slate-500">Selecciona el documento a sustituir</p></div>
              <button onClick={() => setShowReplaceModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {pendingDocuments.length === 0 ? (
                <div className="text-center py-12"><div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3"><CheckCircle size={20} className="text-slate-400" /></div><p className="text-sm text-slate-500">No hay documentos pendientes de factura definitiva</p></div>
              ) : (
                <div className="space-y-3">
                  {pendingDocuments.map((pd) => {
                    const dc = DOCUMENT_TYPES[pd.documentType];
                    const DI = dc.icon;
                    return (
                      <button key={pd.id} onClick={() => startReplacement(pd)} className={`w-full text-left p-4 border rounded-xl hover:bg-slate-50 transition-all ${dc.borderColor} hover:shadow-md`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-12 h-12 ${dc.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}><DI size={20} className={dc.textColor} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1"><p className="font-semibold text-slate-900">{pd.displayNumber}</p><span className={`text-xs px-2 py-0.5 rounded-lg ${dc.bgColor} ${dc.textColor}`}>{dc.label}</span></div>
                            <p className="text-sm text-slate-600 truncate">{pd.supplier}</p>
                            <p className="text-sm text-slate-500 truncate mt-0.5">{pd.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500"><span>Pagado el {formatDate(pd.paidAt)}</span>{pd.poNumber && <span className="bg-slate-100 px-2 py-0.5 rounded">PO-{pd.poNumber}</span>}</div>
                          </div>
                          <div className="text-right flex-shrink-0"><p className="font-bold text-slate-900 text-lg">{formatCurrency(pd.totalAmount)} €</p><p className="text-xs text-violet-600 mt-1 flex items-center gap-1 justify-end"><ArrowRight size={12} />Sustituir</p></div>
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

      {/* PO Modal */}
      {showPOModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Seleccionar PO</h2><button onClick={() => { setShowPOModal(false); setPOSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button></div>
            <div className="p-6">
              <div className="relative mb-4"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={poSearch} onChange={(e) => setPOSearch(e.target.value)} placeholder="Buscar por número o proveedor..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus /></div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredPOs.length === 0 ? <div className="text-center py-12"><div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3"><FileText size={20} className="text-slate-400" /></div><p className="text-sm text-slate-500">No hay POs aprobadas</p></div> : filteredPOs.map((po) => (
                  <button key={po.id} onClick={() => selectPO(po)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1"><div className="flex items-center gap-2 mb-1"><p className="font-semibold text-slate-900">PO-{po.number}</p><span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-medium">Aprobada</span></div><p className="text-sm text-slate-600">{po.supplier}</p><p className="text-xs text-slate-500 mt-1">{po.items.length} ítems</p></div>
                      <p className="font-semibold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PO Items Modal */}
      {showPOItemsModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Items de PO-{selectedPO.number}</h2><p className="text-sm text-slate-500">Selecciona el item a facturar</p></div><button onClick={() => setShowPOItemsModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button></div>
            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                {poItemsWithInvoiced.map((poItem, idx) => {
                  const isOver = poItem.availableAmount < 0;
                  return (
                    <button key={poItem.id || idx} onClick={() => addPOItemToInvoice(poItem, idx)} className={`w-full text-left p-4 border rounded-xl ${isOver ? "border-red-200 bg-red-50 hover:border-red-300" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1"><p className="font-medium text-slate-900">{poItem.description || "Sin descripción"}</p><p className="text-xs text-slate-500 font-mono mt-1">{poItem.subAccountCode} - {poItem.subAccountDescription}</p></div>
                        <div className="text-right"><p className="font-semibold text-slate-900">{formatCurrency(poItem.totalAmount)} €</p><p className="text-xs text-slate-500">Total PO</p></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm mt-3 pt-3 border-t border-slate-100">
                        <div><p className="text-slate-500 text-xs">Facturado</p><p className="font-medium text-slate-700">{formatCurrency(poItem.invoicedAmount)} €</p></div>
                        <div><p className="text-slate-500 text-xs">Disponible</p><p className={`font-medium ${isOver ? "text-red-600" : poItem.availableAmount < poItem.totalAmount * 0.1 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(poItem.availableAmount)} €</p></div>
                        <div className="text-right"><span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg"><Plus size={12} />Añadir</span></div>
                      </div>
                      {isOver && <div className="flex items-center gap-2 mt-3 text-xs text-red-600"><AlertTriangle size={12} />Este item ya está sobre-facturado</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h2><button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button></div>
            <div className="p-6">
              <div className="relative mb-4"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar por nombre o NIF..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus /></div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredSuppliers.length === 0 ? <div className="text-center py-12"><div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3"><Building2 size={20} className="text-slate-400" /></div><p className="text-sm text-slate-500">No encontrado</p></div> : filteredSuppliers.map((s) => (
                  <button key={s.id} onClick={() => selectSupplier(s)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1"><p className="font-medium text-slate-900">{s.fiscalName}</p>{s.commercialName && <p className="text-sm text-slate-500">{s.commercialName}</p>}<p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Hash size={10} />{s.taxId}</p></div>
                      <Building2 size={16} className="text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Seleccionar cuenta</h2><button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button></div>
            <div className="p-6">
              <div className="relative mb-4"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar por código o descripción..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus /></div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? <div className="text-center py-12"><div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3"><Hash size={20} className="text-slate-400" /></div><p className="text-sm text-slate-500">No encontrado</p></div> : filteredSubAccounts.map((sub) => {
                  const isLow = sub.available < sub.budgeted * 0.1;
                  const isOver = sub.available < 0;
                  return (
                    <button key={sub.id} onClick={() => selectAccount(sub)} className={`w-full text-left p-4 border rounded-xl hover:bg-slate-50 ${isOver ? "border-red-200 bg-red-50/50" : isLow ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-semibold text-slate-900">{sub.code}</p>
                            {isOver && <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg"><AlertTriangle size={10} />Sin presupuesto</span>}
                            {!isOver && isLow && <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg"><AlertTriangle size={10} />Bajo</span>}
                          </div>
                          <p className="text-sm text-slate-700">{sub.description}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">Presupuestado</p><p className="font-semibold text-slate-900">{formatCurrency(sub.budgeted)} €</p></div>
                        <div className="bg-amber-50 rounded-lg p-2"><p className="text-amber-600">Comprometido</p><p className="font-semibold text-amber-700">{formatCurrency(sub.committed)} €</p></div>
                        <div className="bg-emerald-50 rounded-lg p-2"><p className="text-emerald-600">Realizado</p><p className="font-semibold text-emerald-700">{formatCurrency(sub.actual)} €</p></div>
                        <div className={`rounded-lg p-2 ${isOver ? "bg-red-50" : isLow ? "bg-amber-50" : "bg-emerald-50"}`}><p className={isOver ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600"}>Disponible</p><p className={`font-semibold ${isOver ? "text-red-700" : isLow ? "text-amber-700" : "text-emerald-700"}`}>{formatCurrency(sub.available)} €</p></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

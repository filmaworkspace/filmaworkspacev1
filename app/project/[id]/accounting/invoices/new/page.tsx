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
  where,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
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
  Shield,
  FileCheck,
  Link as LinkIcon,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Document types configuration
const DOCUMENT_TYPES = {
  invoice: {
    code: "FAC",
    label: "Factura",
    description: "Factura definitiva del proveedor",
    icon: Receipt,
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    requiresReplacement: false,
  },
  proforma: {
    code: "PRF",
    label: "Proforma",
    description: "Requiere factura definitiva tras el pago",
    icon: FileText,
    bgColor: "bg-violet-50",
    textColor: "text-violet-700",
    borderColor: "border-violet-200",
    requiresReplacement: true,
  },
  budget: {
    code: "PRS",
    label: "Presupuesto",
    description: "Requiere factura definitiva tras el pago",
    icon: FileCheck,
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    requiresReplacement: true,
  },
  guarantee: {
    code: "FNZ",
    label: "Fianza",
    description: "Fianza o depósito de garantía",
    icon: Shield,
    bgColor: "bg-slate-100",
    textColor: "text-slate-700",
    borderColor: "border-slate-300",
    requiresReplacement: false,
  },
};

type DocumentType = keyof typeof DOCUMENT_TYPES;

interface PO {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  totalAmount: number;
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
  totalAmount: number;
  paidAt: Date;
}

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

export default function NewInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [nextNumber, setNextNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  // Document type
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");

  // Pending documents for linking
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>("");
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Modals
  const [showPOModal, setShowPOModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPOItemsModal, setShowPOItemsModal] = useState(false);

  // Search
  const [poSearch, setPOSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Data
  const [pos, setPOs] = useState<PO[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [poItemsWithInvoiced, setPOItemsWithInvoiced] = useState<POItemWithInvoiced[]>([]);

  const [formData, setFormData] = useState({
    invoiceType: "with-po" as "with-po" | "without-po",
    supplier: "",
    supplierName: "",
    description: "",
    dueDate: "",
    notes: "",
  });

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [totals, setTotals] = useState({
    baseAmount: 0,
    vatAmount: 0,
    irpfAmount: 0,
    totalAmount: 0,
  });

  const [poStats, setPOStats] = useState({
    totalAmount: 0,
    invoicedAmount: 0,
    percentageInvoiced: 0,
    isOverInvoiced: false,
  });

  const currentDocType = DOCUMENT_TYPES[documentType];
  const getDocumentNumber = () => `${currentDocType.code}-${nextNumber}`;

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        setUserId(u.uid);
        setUserName(u.displayName || u.email || "Usuario");
      } else router.push("/");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    calculateTotals();
  }, [items]);

  useEffect(() => {
    if (selectedPO) {
      calculatePOStats();
      loadPOItemsInvoiced();
    }
  }, [selectedPO]);

  useEffect(() => {
    if (selectedPO && poItemsWithInvoiced.length > 0) {
      updateAvailableWithCurrentItems();
    }
  }, [items, poItemsWithInvoiced.length]);

  useEffect(() => {
    if (id) updateNextNumber();
  }, [documentType, id]);

  const updateNextNumber = async () => {
    try {
      const invSnap = await getDocs(
        query(collection(db, `projects/${id}/invoices`), where("documentType", "==", documentType))
      );
      setNextNumber(String(invSnap.size + 1).padStart(4, "0"));
    } catch (e) {
      setNextNumber("0001");
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
      setMembers(membersSnap.docs.map((d) => ({ userId: d.id, ...d.data() } as Member)));

      const approvalDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      setApprovalConfig(
        approvalDoc.exists()
          ? approvalDoc.data().invoiceApprovals || []
          : [{ id: "default-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false }]
      );

      const posSnap = await getDocs(
        query(collection(db, `projects/${id}/pos`), where("status", "==", "approved"), orderBy("createdAt", "desc"))
      );
      setPOs(
        posSnap.docs.map((d) => ({
          id: d.id,
          number: d.data().number,
          supplier: d.data().supplier,
          supplierId: d.data().supplierId,
          totalAmount: d.data().totalAmount || 0,
          items: (d.data().items || []).map((item: any, idx: number) => ({ ...item, id: item.id || `item-${idx}` })),
        }))
      );

      const suppSnap = await getDocs(query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc")));
      setSuppliers(suppSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier)));

      const accsSnap = await getDocs(query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc")));
      const allSubs: SubAccount[] = [];
      for (const accDoc of accsSnap.docs) {
        const accData = accDoc.data();
        const subsSnap = await getDocs(
          query(collection(db, `projects/${id}/accounts/${accDoc.id}/subaccounts`), orderBy("code", "asc"))
        );
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

      // Load pending documents (proformas/budgets paid but without definitive invoice)
      const pendingSnap = await getDocs(
        query(collection(db, `projects/${id}/invoices`), where("status", "==", "paid"), where("requiresReplacement", "==", true))
      );
      const pending: PendingDocument[] = pendingSnap.docs
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
            totalAmount: data.totalAmount,
            paidAt: data.paidAt?.toDate() || new Date(),
          };
        });
      setPendingDocuments(pending);

      const invSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), where("documentType", "==", "invoice")));
      setNextNumber(String(invSnap.size + 1).padStart(4, "0"));

      const dd = new Date();
      dd.setDate(dd.getDate() + 30);
      setFormData((p) => ({ ...p, dueDate: dd.toISOString().split("T")[0] }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadPOItemsInvoiced = async () => {
    if (!selectedPO) return;
    try {
      const invSnap = await getDocs(
        query(
          collection(db, `projects/${id}/invoices`),
          where("poId", "==", selectedPO.id),
          where("status", "in", ["pending", "pending_approval", "approved", "paid", "overdue"])
        )
      );
      const invoicedByItem: Record<string, number> = {};
      invSnap.docs.forEach((invDoc) => {
        const invData = invDoc.data();
        (invData.items || []).forEach((invItem: any) => {
          if (invItem.poItemId || invItem.poItemIndex !== undefined) {
            const key = invItem.poItemId || `index-${invItem.poItemIndex}`;
            invoicedByItem[key] = (invoicedByItem[key] || 0) + (invItem.totalAmount || 0);
          }
        });
      });
      const itemsWithInvoiced: POItemWithInvoiced[] = selectedPO.items.map((item, idx) => {
        const key = item.id || `index-${idx}`;
        const invoicedAmount = invoicedByItem[key] || 0;
        return { ...item, id: item.id || `item-${idx}`, invoicedAmount, availableAmount: item.totalAmount - invoicedAmount };
      });
      setPOItemsWithInvoiced(itemsWithInvoiced);
    } catch (e) {
      console.error("Error loading PO items invoiced:", e);
    }
  };

  const updateAvailableWithCurrentItems = () => {
    const currentInvoiceByItem: Record<string, number> = {};
    items.forEach((item) => {
      if (item.poItemId) {
        currentInvoiceByItem[item.poItemId] = (currentInvoiceByItem[item.poItemId] || 0) + item.totalAmount;
      }
    });
    setPOItemsWithInvoiced((prev) =>
      prev.map((poItem) => {
        const currentAmount = currentInvoiceByItem[poItem.id!] || 0;
        return { ...poItem, availableAmount: poItem.totalAmount - poItem.invoicedAmount - currentAmount };
      })
    );
  };

  const resolveApprovers = (step: ApprovalStep, dept?: string): string[] => {
    switch (step.approverType) {
      case "fixed": return step.approvers || [];
      case "role": return members.filter((m) => m.role && step.roles?.includes(m.role)).map((m) => m.userId);
      case "hod": return members.filter((m) => m.position === "HOD" && m.department === (step.department || dept)).map((m) => m.userId);
      case "coordinator": return members.filter((m) => m.position === "Coordinator" && m.department === (step.department || dept)).map((m) => m.userId);
      default: return [];
    }
  };

  const generateApprovalSteps = (dept?: string): ApprovalStepStatus[] =>
    approvalConfig.length === 0
      ? []
      : approvalConfig.map((s) => ({
          id: s.id || "",
          order: s.order || 0,
          approverType: s.approverType || "fixed",
          approvers: resolveApprovers(s, dept),
          roles: s.roles || [],
          department: s.department || "",
          approvedBy: [],
          rejectedBy: [],
          status: "pending" as const,
          requireAll: s.requireAll ?? false,
        }));

  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean =>
    steps.length === 0 || steps.every((s) => s.approvers.length === 0);

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) return { autoApprove: true, message: "Irá a pendiente de pago" };
    const steps = generateApprovalSteps();
    if (steps.every((s) => s.approvers.length === 0)) return { autoApprove: true, message: "Irá a pendiente de pago" };
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
    n[i] = { ...n[i], [field]: value };
    const c = calculateItemTotal(n[i]);
    n[i] = { ...n[i], ...c };
    setItems(n);
  };

  const addNewItem = () =>
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: "",
        isNewItem: true,
        subAccountId: "",
        subAccountCode: "",
        subAccountDescription: "",
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

  const addPOItemToInvoice = (poItem: POItemWithInvoiced, index: number) => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: poItem.description,
        poItemId: poItem.id,
        poItemIndex: index,
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
      const invSnap = await getDocs(
        query(
          collection(db, `projects/${id}/invoices`),
          where("poId", "==", selectedPO.id),
          where("status", "in", ["pending", "pending_approval", "approved", "paid", "overdue"])
        )
      );
      const invoiced = invSnap.docs.reduce((s, d) => s + (d.data().totalAmount || 0), 0);
      const total = invoiced + totals.totalAmount;
      setPOStats({
        totalAmount: selectedPO.totalAmount,
        invoicedAmount: total,
        percentageInvoiced: selectedPO.totalAmount > 0 ? (total / selectedPO.totalAmount) * 100 : 0,
        isOverInvoiced: total > selectedPO.totalAmount,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const selectPO = (po: PO) => {
    setSelectedPO(po);
    setFormData({ ...formData, supplier: po.supplierId, supplierName: po.supplier, description: `${currentDocType.label} para PO-${po.number}` });
    setItems([]);
    setShowPOModal(false);
    setPOSearch("");
  };

  const selectSupplier = (s: Supplier) => {
    setFormData({ ...formData, supplier: s.id, supplierName: s.fiscalName });
    setShowSupplierModal(false);
    setSupplierSearch("");
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

  const selectLinkedDocument = (pendingDoc: PendingDocument) => {
    setLinkedDocumentId(pendingDoc.id);
    setFormData({
      ...formData,
      supplier: pendingDoc.supplierId,
      supplierName: pendingDoc.supplier,
      description: `Factura definitiva para ${pendingDoc.displayNumber}`,
    });
    setShowLinkModal(false);
  };

  const handleFileUpload = (file: File) => {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      alert("Solo PDF o imágenes hasta 10MB");
      return;
    }
    setUploadedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileUpload(f);
  }, []);

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!uploadedFile) e.file = "Adjunta el archivo";
    if (documentType === "invoice" && formData.invoiceType === "with-po" && !selectedPO) e.po = "Selecciona una PO";
    if ((documentType !== "invoice" || formData.invoiceType === "without-po") && !formData.supplier && !linkedDocumentId) e.supplier = "Selecciona un proveedor";
    if (!formData.description.trim()) e.description = "Obligatorio";
    if (!formData.dueDate) e.dueDate = "Fecha de vencimiento obligatoria";
    if (items.length === 0) e.items = "Añade al menos un ítem";
    items.forEach((it, i) => {
      if (!it.description.trim()) e[`item_${i}_description`] = "Obligatorio";
      if (!it.subAccountId) e[`item_${i}_account`] = "Obligatorio";
      if (it.quantity <= 0) e[`item_${i}_quantity`] = "> 0";
      if (it.unitPrice <= 0) e[`item_${i}_unitPrice`] = "> 0";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      let fileUrl = "";
      if (uploadedFile) {
        const fileRef = ref(storage, `projects/${id}/invoices/${currentDocType.code}-${nextNumber}/${uploadedFile.name}`);
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
        documentType: documentType,
        number: nextNumber,
        displayNumber: getDocumentNumber(),
        supplier: formData.supplierName,
        supplierId: formData.supplier,
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
        createdBy: userId,
        createdByName: userName,
        requiresReplacement: currentDocType.requiresReplacement,
        replacedByInvoiceId: null,
        linkedDocumentId: linkedDocumentId || null,
      };

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

      // Update linked document if exists
      if (linkedDocumentId) {
        await updateDoc(doc(db, `projects/${id}/invoices`, linkedDocumentId), {
          replacedByInvoiceId: docRef.id,
          replacedAt: Timestamp.now(),
        });
      }

      setSuccessMessage(invoiceData.autoApproved ? `${currentDocType.label} creada y pendiente de pago` : `${currentDocType.label} enviada para aprobación`);
      setTimeout(() => router.push(`/project/${id}/accounting/invoices`), 1500);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (a: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a);
  const formatDate = (date: Date) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);

  const filteredPOs = pos.filter((p) => p.number.toLowerCase().includes(poSearch.toLowerCase()) || p.supplier.toLowerCase().includes(poSearch.toLowerCase()));
  const filteredSubAccounts = subAccounts.filter((s) => s.code.toLowerCase().includes(accountSearch.toLowerCase()) || s.description.toLowerCase().includes(accountSearch.toLowerCase()));
  const filteredSuppliers = suppliers.filter((s) => s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) || s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) || s.taxId.toLowerCase().includes(supplierSearch.toLowerCase()));

  const approvalPreview = getApprovalPreview();
  const DocIcon = currentDocType.icon;

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
          <Link href={`/project/${id}/accounting/invoices`} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6">
            <ArrowLeft size={16} />
            Volver a Documentos
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 ${currentDocType.bgColor} rounded-2xl flex items-center justify-center`}>
                <DocIcon size={24} className={currentDocType.textColor} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Subir {currentDocType.label.toLowerCase()}</h1>
                <p className="text-slate-500 text-sm mt-0.5">{getDocumentNumber()} · {userName}</p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
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
                  {approvalPreview.autoApprove ? <Save size={16} /> : <Send size={16} />}
                  {approvalPreview.autoApprove ? `Crear ${currentDocType.label.toLowerCase()}` : "Enviar"}
                </>
              )}
            </button>
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

        {Object.keys(errors).length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
            <AlertCircle size={18} className="text-red-600" />
            <span className="text-sm text-red-700 font-medium">Hay errores en el formulario</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Document Type Selection */}
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
                        onClick={() => {
                          setDocumentType(key);
                          setLinkedDocumentId("");
                          if (key !== "invoice") {
                            setFormData({ ...formData, invoiceType: "without-po" });
                            setSelectedPO(null);
                          }
                        }}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${isSelected ? `${config.borderColor} ${config.bgColor}` : "border-slate-200 hover:border-slate-300"}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon size={20} className={isSelected ? config.textColor : "text-slate-400"} />
                          {isSelected && <CheckCircle size={16} className={config.textColor} />}
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
                        <p className="text-sm text-amber-700 mt-1">Una vez pagado este documento, deberás subir la factura definitiva del proveedor.</p>
                      </div>
                    </div>
                  </div>
                )}

                {documentType === "invoice" && pendingDocuments.length > 0 && (
                  <div className="mt-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <LinkIcon size={18} className="text-violet-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-violet-800">{pendingDocuments.length} documento{pendingDocuments.length > 1 ? "s" : ""} pendiente{pendingDocuments.length > 1 ? "s" : ""} de factura</p>
                          <p className="text-sm text-violet-700 mt-1">Hay proformas o presupuestos pagados esperando factura definitiva.</p>
                        </div>
                      </div>
                      <button onClick={() => setShowLinkModal(true)} className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
                        Vincular
                      </button>
                    </div>
                    {linkedDocumentId && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-violet-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-violet-900">Vinculada a: {pendingDocuments.find((d) => d.id === linkedDocumentId)?.displayNumber}</p>
                            <p className="text-xs text-violet-600">{pendingDocuments.find((d) => d.id === linkedDocumentId)?.supplier}</p>
                          </div>
                          <button onClick={() => setLinkedDocumentId("")} className="p-1 text-violet-400 hover:text-violet-600">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Invoice Type (with/without PO) - Only for invoices */}
            {documentType === "invoice" && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Tipo de factura</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => { setFormData({ ...formData, invoiceType: "with-po", supplier: "", supplierName: "" }); setItems([]); setSelectedPO(null); }}
                      className={`p-5 rounded-xl border-2 transition-all text-left ${formData.invoiceType === "with-po" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <FileText size={20} className={formData.invoiceType === "with-po" ? "text-indigo-600" : "text-indigo-400"} />
                        </div>
                        {formData.invoiceType === "with-po" && <CheckCircle size={20} className="text-slate-900" />}
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-1">Con PO asociada</h3>
                      <p className="text-sm text-slate-500">Vinculada a una orden de compra</p>
                    </button>

                    <button
                      onClick={() => { setFormData({ ...formData, invoiceType: "without-po", supplier: "", supplierName: "" }); setItems([]); setSelectedPO(null); }}
                      className={`p-5 rounded-xl border-2 transition-all text-left ${formData.invoiceType === "without-po" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Receipt size={20} className={formData.invoiceType === "without-po" ? "text-emerald-600" : "text-emerald-400"} />
                        </div>
                        {formData.invoiceType === "without-po" && <CheckCircle size={20} className="text-slate-900" />}
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-1">Sin PO</h3>
                      <p className="text-sm text-slate-500">Factura independiente</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PO Selection */}
            {documentType === "invoice" && formData.invoiceType === "with-po" && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Orden de compra</h2>
                </div>
                <div className="p-6">
                  <button
                    onClick={() => setShowPOModal(true)}
                    className={`w-full px-4 py-3 border ${errors.po ? "border-red-300" : "border-slate-200"} rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between`}
                  >
                    {selectedPO ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <FileText size={18} className="text-indigo-600" />
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

                  {selectedPO && (
                    <div className={`mt-4 p-4 rounded-xl border ${poStats.isOverInvoiced ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 ${poStats.isOverInvoiced ? "bg-red-100" : "bg-slate-200"} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          {poStats.isOverInvoiced ? <AlertTriangle size={16} className="text-red-600" /> : <Info size={16} className="text-slate-500" />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold mb-2 ${poStats.isOverInvoiced ? "text-red-800" : "text-slate-700"}`}>
                            {poStats.isOverInvoiced ? "Excede el total de la PO" : "Estado de facturación"}
                          </p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-slate-500">Total PO</p>
                              <p className="font-semibold text-slate-900">{formatCurrency(poStats.totalAmount)} €</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Facturado (inc. esta)</p>
                              <p className={`font-semibold ${poStats.isOverInvoiced ? "text-red-600" : "text-emerald-600"}`}>{formatCurrency(poStats.invoicedAmount)} €</p>
                            </div>
                          </div>
                          <div className="mt-3 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div className={`h-full transition-all ${poStats.percentageInvoiced > 100 ? "bg-red-500" : poStats.percentageInvoiced > 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(poStats.percentageInvoiced, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Supplier Selection */}
            {(documentType !== "invoice" || formData.invoiceType === "without-po") && !linkedDocumentId && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Proveedor</h2>
                </div>
                <div className="p-6">
                  <button
                    onClick={() => setShowSupplierModal(true)}
                    className={`w-full px-4 py-3 border ${errors.supplier ? "border-red-300" : "border-slate-200"} rounded-xl hover:border-slate-300 transition-colors text-left flex items-center justify-between`}
                  >
                    {formData.supplierName ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Building2 size={18} className="text-slate-600" />
                        </div>
                        <span className="font-medium text-slate-900">{formData.supplierName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Seleccionar proveedor...</span>
                    )}
                    <Search size={16} className="text-slate-400" />
                  </button>
                </div>
              </div>
            )}

            {/* Basic Info */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Información básica</h2>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Descripción *</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={`Concepto de la ${currentDocType.label.toLowerCase()}...`}
                    rows={2}
                    className={`w-full px-4 py-3 border ${errors.description ? "border-red-300" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      <span className="flex items-center gap-2">
                        <Calendar size={14} />
                        Fecha de vencimiento *
                      </span>
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className={`w-full px-4 py-3 border ${errors.dueDate ? "border-red-300" : "border-slate-200"} rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm`}
                    />
                    {errors.dueDate && <p className="text-xs text-red-600 mt-1">{errors.dueDate}</p>}
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

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-900">Items</h2>
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">{items.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  {documentType === "invoice" && formData.invoiceType === "with-po" && selectedPO && (
                    <button onClick={() => setShowPOItemsModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors">
                      <Plus size={14} />
                      De PO
                    </button>
                  )}
                  <button onClick={addNewItem} className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors">
                    <Plus size={14} />
                    Nuevo
                  </button>
                </div>
              </div>

              <div className="p-6">
                {items.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <ShoppingCart size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No hay ítems</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {documentType === "invoice" && formData.invoiceType === "with-po" && selectedPO ? "Añade items de la PO o crea uno nuevo" : `Añade items a la ${currentDocType.label.toLowerCase()}`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div key={item.id} className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <Hash size={12} />
                              Item {index + 1}
                            </span>
                            {item.isNewItem ? (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg font-medium">Nuevo</span>
                            ) : (
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg font-medium">De PO</span>
                            )}
                          </div>
                          <button onClick={() => removeItem(index)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder="Descripción..."
                            className={`w-full px-4 py-3 border ${errors[`item_${index}_description`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white`}
                          />

                          {item.isNewItem ? (
                            <button
                              onClick={() => { setCurrentItemIndex(index); setShowAccountModal(true); }}
                              className={`w-full px-4 py-3 border ${errors[`item_${index}_account`] ? "border-red-300" : "border-slate-200"} rounded-xl text-sm text-left flex items-center justify-between hover:border-slate-300 transition-colors bg-white`}
                            >
                              {item.subAccountCode ? (
                                <span className="font-mono text-slate-900">{item.subAccountCode} - {item.subAccountDescription}</span>
                              ) : (
                                <span className="text-slate-400">Seleccionar cuenta...</span>
                              )}
                              <Search size={14} className="text-slate-400" />
                            </button>
                          ) : (
                            <div className="px-4 py-3 bg-slate-100 rounded-xl text-sm">
                              <span className="font-mono text-slate-700">{item.subAccountCode} - {item.subAccountDescription}</span>
                            </div>
                          )}

                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Cantidad</label>
                              <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Precio</label>
                              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">IVA</label>
                              <select value={item.vatRate} onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
                                {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">IRPF</label>
                              <select value={item.irpfRate} onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
                                {IRPF_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm">
                              <span className="text-slate-400">Total:</span>
                              <span className="ml-2 font-semibold">{formatCurrency(item.totalAmount)} €</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* File Upload */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Archivo del documento *</h2>
              </div>
              <div className="p-6">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging ? "border-slate-400 bg-slate-50" : errors.file ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  {uploadedFile ? (
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${currentDocType.bgColor} rounded-lg flex items-center justify-center`}>
                          <DocIcon size={18} className={currentDocType.textColor} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-slate-900">{uploadedFile.name}</p>
                          <p className="text-xs text-slate-500">{(uploadedFile.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                      <button onClick={() => setUploadedFile(null)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Upload size={20} className={errors.file ? "text-red-400" : "text-slate-400"} />
                      </div>
                      <p className={`text-sm font-medium mb-1 ${errors.file ? "text-red-700" : "text-slate-700"}`}>Arrastra o haz clic para subir</p>
                      <p className="text-xs text-slate-500">PDF, JPG, PNG (máx. 10MB)</p>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 space-y-4">
              {/* Document Type Badge */}
              <div className={`${currentDocType.bgColor} border ${currentDocType.borderColor} rounded-2xl p-5`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                    <DocIcon size={20} className={currentDocType.textColor} />
                  </div>
                  <div>
                    <p className={`font-semibold ${currentDocType.textColor}`}>{currentDocType.label}</p>
                    <p className="text-sm text-slate-600">{getDocumentNumber()}</p>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Total del documento</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Base</span>
                      <span className="font-medium text-slate-900">{formatCurrency(totals.baseAmount)} €</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">IVA</span>
                      <span className="font-medium text-emerald-600">+{formatCurrency(totals.vatAmount)} €</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">IRPF</span>
                      <span className="font-medium text-red-600">-{formatCurrency(totals.irpfAmount)} €</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-slate-900">Total</span>
                      <span className="text-xl font-bold text-slate-900">{formatCurrency(totals.totalAmount)} €</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Approval Preview */}
              <div className={`border rounded-2xl p-5 ${approvalPreview.autoApprove ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 ${approvalPreview.autoApprove ? "bg-emerald-100" : "bg-amber-100"} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    {approvalPreview.autoApprove ? <CheckCircle size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-amber-600" />}
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"}`}>
                      {approvalPreview.autoApprove ? "Sin aprobación" : "Requiere aprobación"}
                    </p>
                    <p className={`text-sm mt-1 ${approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"}`}>{approvalPreview.message}</p>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Info size={14} className="text-slate-500" />
                  </div>
                  <div className="text-sm text-slate-600">
                    <p className="font-medium text-slate-700 mb-2">Importante</p>
                    <ul className="space-y-1 text-slate-500">
                      <li>• Archivo obligatorio</li>
                      <li>• Fecha de vencimiento obligatoria</li>
                      {currentDocType.requiresReplacement && <li className="text-amber-600">• Requiere factura definitiva tras pago</li>}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Link to Pending Document Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Vincular a documento pagado</h2>
                <p className="text-sm text-slate-500">Selecciona la proforma o presupuesto a sustituir</p>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {pendingDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={20} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">No hay documentos pendientes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingDocuments.map((pendingDoc) => {
                    const docConfig = DOCUMENT_TYPES[pendingDoc.documentType];
                    const DocTypeIcon = docConfig.icon;
                    return (
                      <button
                        key={pendingDoc.id}
                        onClick={() => selectLinkedDocument(pendingDoc)}
                        className={`w-full text-left p-4 border rounded-xl hover:bg-slate-50 transition-all ${linkedDocumentId === pendingDoc.id ? `${docConfig.borderColor} ${docConfig.bgColor}` : "border-slate-200"}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 ${docConfig.bgColor} rounded-lg flex items-center justify-center`}>
                            <DocTypeIcon size={18} className={docConfig.textColor} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">{pendingDoc.displayNumber}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-lg ${docConfig.bgColor} ${docConfig.textColor}`}>{docConfig.label}</span>
                            </div>
                            <p className="text-sm text-slate-600">{pendingDoc.supplier}</p>
                            <p className="text-xs text-slate-500 mt-1">Pagado el {formatDate(pendingDoc.paidAt)}</p>
                          </div>
                          <p className="font-semibold text-slate-900">{formatCurrency(pendingDoc.totalAmount)} €</p>
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

      {/* PO Selection Modal */}
      {showPOModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Seleccionar PO</h2>
              <button onClick={() => { setShowPOModal(false); setPOSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={poSearch} onChange={(e) => setPOSearch(e.target.value)} placeholder="Buscar por número o proveedor..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus />
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredPOs.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <FileText size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No hay POs aprobadas</p>
                  </div>
                ) : (
                  filteredPOs.map((po) => (
                    <button key={po.id} onClick={() => selectPO(po)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-slate-900">PO-{po.number}</p>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-medium">Aprobada</span>
                          </div>
                          <p className="text-sm text-slate-600">{po.supplier}</p>
                          <p className="text-xs text-slate-500 mt-1">{po.items.length} ítems</p>
                        </div>
                        <p className="font-semibold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PO Items Selection Modal */}
      {showPOItemsModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Items de PO-{selectedPO.number}</h2>
                <p className="text-sm text-slate-500">Selecciona el item a facturar</p>
              </div>
              <button onClick={() => setShowPOItemsModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                {poItemsWithInvoiced.map((poItem, idx) => {
                  const isOverInvoiced = poItem.availableAmount < 0;
                  return (
                    <button
                      key={poItem.id || idx}
                      onClick={() => addPOItemToInvoice(poItem, idx)}
                      className={`w-full text-left p-4 border rounded-xl transition-all ${isOverInvoiced ? "border-red-200 bg-red-50 hover:border-red-300" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{poItem.description || "Sin descripción"}</p>
                          <p className="text-xs text-slate-500 font-mono mt-1">{poItem.subAccountCode} - {poItem.subAccountDescription}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{formatCurrency(poItem.totalAmount)} €</p>
                          <p className="text-xs text-slate-500">Total PO</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm mt-3 pt-3 border-t border-slate-100">
                        <div>
                          <p className="text-slate-500 text-xs">Facturado</p>
                          <p className="font-medium text-slate-700">{formatCurrency(poItem.invoicedAmount)} €</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Disponible</p>
                          <p className={`font-medium ${isOverInvoiced ? "text-red-600" : poItem.availableAmount < poItem.totalAmount * 0.1 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrency(poItem.availableAmount)} €</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                            <Plus size={12} />
                            Añadir
                          </span>
                        </div>
                      </div>
                      {isOverInvoiced && (
                        <div className="flex items-center gap-2 mt-3 text-xs text-red-600">
                          <AlertTriangle size={12} />
                          Este item ya está sobre-facturado
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Selection Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h2>
              <button onClick={() => { setShowSupplierModal(false); setSupplierSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar por nombre o NIF..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus />
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredSuppliers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Building2 size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No encontrado</p>
                  </div>
                ) : (
                  filteredSuppliers.map((s) => (
                    <button key={s.id} onClick={() => selectSupplier(s)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{s.fiscalName}</p>
                          {s.commercialName && <p className="text-sm text-slate-500">{s.commercialName}</p>}
                          <p className="text-xs text-slate-500 mt-1">NIF: {s.taxId}</p>
                        </div>
                        <Building2 size={16} className="text-slate-300" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Selection Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Seleccionar cuenta</h2>
              <button onClick={() => { setShowAccountModal(false); setAccountSearch(""); setCurrentItemIndex(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar por código o descripción..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" autoFocus />
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Hash size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No encontrado</p>
                  </div>
                ) : (
                  filteredSubAccounts.map((sub) => (
                    <button key={sub.id} onClick={() => selectAccount(sub)} className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="font-mono font-semibold text-slate-900">{sub.code}</p>
                          <p className="text-sm text-slate-700">{sub.description}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-50 rounded-lg p-2">
                          <p className="text-slate-500">Presupuestado</p>
                          <p className="font-semibold text-slate-900">{formatCurrency(sub.budgeted)} €</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-2">
                          <p className="text-amber-600">Comprometido</p>
                          <p className="font-semibold text-amber-700">{formatCurrency(sub.committed)} €</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-2">
                          <p className="text-emerald-600">Realizado</p>
                          <p className="font-semibold text-emerald-700">{formatCurrency(sub.actual)} €</p>
                        </div>
                        <div className={`rounded-lg p-2 ${sub.available < 0 ? "bg-red-50" : sub.available < sub.budgeted * 0.1 ? "bg-amber-50" : "bg-emerald-50"}`}>
                          <p className={sub.available < 0 ? "text-red-600" : sub.available < sub.budgeted * 0.1 ? "text-amber-600" : "text-emerald-600"}>Disponible</p>
                          <p className={`font-semibold ${sub.available < 0 ? "text-red-700" : sub.available < sub.budgeted * 0.1 ? "text-amber-700" : "text-emerald-700"}`}>{formatCurrency(sub.available)} €</p>
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

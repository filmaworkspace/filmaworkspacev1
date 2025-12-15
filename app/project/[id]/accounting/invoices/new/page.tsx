"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
import {
  Receipt,
  ArrowLeft,
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
  CheckCircle2,
  AlertTriangle,
  Send,
  Shield,
  FileCheck,
  Link as LinkIcon,
  Clock,
  Users,
  ChevronRight,
  Circle,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  const [documentType, setDocumentType] = useState<DocumentType>("invoice");
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>("");
  const [showLinkModal, setShowLinkModal] = useState(false);

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

  useEffect(() => {
    if (Object.keys(touched).length > 0) {
      validateForm(true);
    }
  }, [formData, items, uploadedFile, selectedPO]);

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
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
      const membersData: Member[] = [];
      for (const memberDocSnap of membersSnap.docs) {
        const memberData = memberDocSnap.data();
        let name = memberData.name || memberData.email || memberDocSnap.id;
        try {
          const userDoc = await getDoc(doc(db, "users", memberDocSnap.id));
          if (userDoc.exists()) {
            name = userDoc.data().displayName || userDoc.data().email || name;
          }
        } catch (e) {}
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

      const approvalDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (approvalDoc.exists()) {
        setApprovalConfig(approvalDoc.data().invoiceApprovals || []);
      } else {
        setApprovalConfig([
          { id: "default-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false },
        ]);
      }

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
          items: (d.data().items || []).map((item: any, idx: number) => ({
            ...item,
            id: item.id || `item-${idx}`,
          })),
        }))
      );

      const suppSnap = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc"))
      );
      setSuppliers(suppSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier)));

      const accsSnap = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );
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

      const pendingSnap = await getDocs(
        query(
          collection(db, `projects/${id}/invoices`),
          where("status", "==", "paid"),
          where("requiresReplacement", "==", true)
        )
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

      const invSnap = await getDocs(
        query(collection(db, `projects/${id}/invoices`), where("documentType", "==", "invoice"))
      );
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
        return {
          ...item,
          id: item.id || `item-${idx}`,
          invoicedAmount,
          availableAmount: item.totalAmount - invoicedAmount,
        };
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
        return {
          ...poItem,
          availableAmount: poItem.totalAmount - poItem.invoicedAmount - currentAmount,
        };
      })
    );
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

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) {
      return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    }
    const steps = generateApprovalSteps();
    if (steps.every((s) => s.approvers.length === 0)) {
      return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    }
    return {
      autoApprove: false,
      message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`,
      steps,
    };
  };

  const calculateItemTotal = (item: InvoiceItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    return {
      baseAmount,
      vatAmount,
      irpfAmount,
      totalAmount: baseAmount + vatAmount - irpfAmount,
    };
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    const calc = calculateItemTotal(newItems[index]);
    newItems[index] = { ...newItems[index], ...calc };
    setItems(newItems);
    setTouched((prev) => ({ ...prev, [`item_${index}_${field}`]: true }));
  };

  const addNewItem = () => {
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
  };

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

  const removeItem = (index: number) => {
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
      const invoiced = invSnap.docs.reduce((sum, d) => sum + (d.data().totalAmount || 0), 0);
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
    setFormData({
      ...formData,
      supplier: po.supplierId,
      supplierName: po.supplier,
      description: `${currentDocType.label} para PO-${po.number}`,
    });
    setItems([]);
    setShowPOModal(false);
    setPOSearch("");
    setTouched((prev) => ({ ...prev, po: true }));
  };

  const selectSupplier = (supplier: Supplier) => {
    setFormData({
      ...formData,
      supplier: supplier.id,
      supplierName: supplier.fiscalName,
    });
    setShowSupplierModal(false);
    setSupplierSearch("");
    setTouched((prev) => ({ ...prev, supplier: true }));
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

  const selectLinkedDocument = (pendingDoc: PendingDocument) => {
    setLinkedDocumentId(pendingDoc.id);
    setFormData({
      ...formData,
      supplier: pendingDoc.supplierId,
      supplierName: pendingDoc.supplier,
      description: `Factura definitiva para ${pendingDoc.displayNumber}`,
    });
    setShowLinkModal(false);
    setTouched((prev) => ({ ...prev, linkedDocument: true }));
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
    setTouched((prev) => ({ ...prev, file: true }));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const validateForm = (silent = false) => {
    const newErrors: Record<string, string> = {};

    if (!uploadedFile) newErrors.file = "Adjunta el archivo del documento";
    if (formData.invoiceType === "with-po" && !selectedPO) newErrors.po = "Selecciona una PO";
    if (formData.invoiceType === "without-po" && !formData.supplier && !linkedDocumentId) {
      newErrors.supplier = "Selecciona un proveedor";
    }
    if (!formData.description.trim()) newErrors.description = "Descripción obligatoria";
    if (!formData.dueDate) newErrors.dueDate = "Fecha de vencimiento obligatoria";
    if (items.length === 0) newErrors.items = "Añade al menos un ítem";

    items.forEach((item, index) => {
      if (!item.description.trim()) newErrors[`item_${index}_description`] = "Obligatorio";
      if (!item.subAccountId) newErrors[`item_${index}_account`] = "Obligatorio";
      if (item.quantity <= 0) newErrors[`item_${index}_quantity`] = "Debe ser > 0";
      if (item.unitPrice <= 0) newErrors[`item_${index}_unitPrice`] = "Debe ser > 0";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSaving(true);

    try {
      let fileUrl = "";
      if (uploadedFile) {
        const fileRef = ref(
          storage,
          `projects/${id}/invoices/${currentDocType.code}-${nextNumber}/${uploadedFile.name}`
        );
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      const itemsData = items.map((item) => ({
        description: item.description.trim(),
        poItemId: item.poItemId || null,
        poItemIndex: item.poItemIndex ?? null,
        isNewItem: item.isNewItem,
        subAccountId: item.subAccountId,
        subAccountCode: item.subAccountCode,
        subAccountDescription: item.subAccountDescription,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        baseAmount: item.baseAmount,
        vatRate: item.vatRate,
        vatAmount: item.vatAmount,
        irpfRate: item.irpfRate,
        irpfAmount: item.irpfAmount,
        totalAmount: item.totalAmount,
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

      if (linkedDocumentId) {
        await updateDoc(doc(db, `projects/${id}/invoices`, linkedDocumentId), {
          replacedByInvoiceId: docRef.id,
          replacedAt: Timestamp.now(),
        });
      }

      setSuccessMessage(
        invoiceData.autoApproved
          ? `${currentDocType.label} creada y pendiente de pago`
          : `${currentDocType.label} enviada para aprobación`
      );
      setTimeout(() => router.push(`/project/${id}/accounting/invoices`), 1500);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);

  const getCompletionPercentage = () => {
    let completed = 0;
    const total = 5;

    if (uploadedFile) completed++;
    if (formData.invoiceType === "with-po" ? selectedPO : formData.supplier || linkedDocumentId) completed++;
    if (formData.description.trim()) completed++;
    if (formData.dueDate) completed++;
    const validItems = items.filter(
      (item) => item.description.trim() && item.subAccountId && item.quantity > 0 && item.unitPrice > 0
    );
    if (validItems.length > 0) completed++;

    return Math.round((completed / total) * 100);
  };

  const filteredPOs = pos.filter(
    (p) =>
      p.number.toLowerCase().includes(poSearch.toLowerCase()) ||
      p.supplier.toLowerCase().includes(poSearch.toLowerCase())
  );

  const filteredSubAccounts = subAccounts.filter(
    (s) =>
      s.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.taxId.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const approvalPreview = getApprovalPreview();
  const completionPercentage = getCompletionPercentage();
  const DocIcon = currentDocType.icon;

  const hasError = (field: string) => touched[field] && errors[field];
  const isValid = (field: string) => touched[field] && !errors[field];

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }
}

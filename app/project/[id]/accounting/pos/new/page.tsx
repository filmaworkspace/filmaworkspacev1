"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, addDoc, query, orderBy, Timestamp } from "firebase/firestore";
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
  ChevronDown,
  AlertTriangle,
  Circle,
  ShieldAlert,
  Lock,
  Euro,
  DollarSign,
  PoundSterling,
  Calendar,
  Percent,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAccountingPermissions } from "@/hooks/useAccountingPermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Interfaces
interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  country: string;
  taxId: string;
  paymentMethod: string;
  email?: string;
  phone?: string;
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
  hasAmountThreshold?: boolean;
  amountThreshold?: number;
  amountCondition?: "above" | "below" | "between";
  amountThresholdMax?: number;
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

// Constantes
const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart, description: "Equipos, vehículos, espacios", color: "bg-blue-500" },
  { value: "purchase", label: "Compra", icon: Package, description: "Material, consumibles", color: "bg-emerald-500" },
  { value: "service", label: "Servicio", icon: Wrench, description: "Trabajos, honorarios", color: "bg-purple-500" },
  { value: "deposit", label: "Fianza", icon: Shield, description: "Depósitos de garantía", color: "bg-amber-500" },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR", symbol: "€", icon: Euro },
  { value: "USD", label: "USD", symbol: "$", icon: DollarSign },
  { value: "GBP", label: "GBP", symbol: "£", icon: PoundSterling },
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

const createEmptyItem = (id: string): POItem => ({
  id,
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
});

export default function NewPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // Hook de permisos
  const {
    loading: permissionsLoading,
    error: permissionsError,
    permissions,
    getDepartmentForNewPO,
    getAvailableDepartments,
  } = useAccountingPermissions(id);

  // Estados principales
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [nextPONumber, setNextPONumber] = useState<string>("");
  const [approvalConfig, setApprovalConfig] = useState<ApprovalStep[]>([]);

  // Estados del formulario
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

  const [items, setItems] = useState<POItem[]>([createEmptyItem("1")]);
  const [totals, setTotals] = useState({ baseAmount: 0, vatAmount: 0, irpfAmount: 0, totalAmount: 0 });

  // Estados de validación
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState("");

  // Estados de modales
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);

  // Estados de archivo
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Estados de UI
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(["1"]));

  // Efecto para establecer departamento fijo si es rol de departamento
  useEffect(() => {
    if (!permissionsLoading && permissions.fixedDepartment) {
      setFormData((prev) => ({ ...prev, department: permissions.fixedDepartment || "" }));
    }
  }, [permissionsLoading, permissions.fixedDepartment]);

  // Efecto para cargar datos
  useEffect(() => {
    if (!permissionsLoading && id) {
      loadData();
    }
  }, [permissionsLoading, id]);

  // Efecto para calcular totales
  useEffect(() => {
    calculateTotals();
  }, [items]);

  // Efecto para validación en tiempo real
  useEffect(() => {
    if (Object.keys(touched).length > 0) {
      validateForm(true);
    }
  }, [formData, items]);

  // Función para cargar datos
  const loadData = async () => {
    try {
      setLoading(true);

      // Cargar proyecto
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        setDepartments(projectDoc.data().departments || []);
      }

      // Cargar miembros
      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      const membersData: Member[] = [];
      for (const memberDocSnap of membersSnapshot.docs) {
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

      // Cargar configuración de aprobaciones
      const approvalConfigDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (approvalConfigDoc.exists()) {
        setApprovalConfig(approvalConfigDoc.data().poApprovals || []);
      } else {
        setApprovalConfig([]);
      }

      // Cargar proveedores
      const suppliersSnapshot = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc"))
      );
      setSuppliers(suppliersSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Supplier)));

      // Cargar cuentas presupuestarias
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );
      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(
          query(collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`), orderBy("code", "asc"))
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

      // Obtener próximo número de PO
      const posSnapshot = await getDocs(collection(db, `projects/${id}/pos`));
      setNextPONumber(String(posSnapshot.size + 1).padStart(4, "0"));
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };


  // Funciones de aprobación
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
    const approverNames = approverIds.map((uid) => {
      const member = members.find((m) => m.userId === uid);
      return member?.name || member?.email || uid;
    });
    return { ids: approverIds, names: approverNames };
  };

  const generateApprovalSteps = (dept?: string, amount?: number): ApprovalStepStatus[] => {
    if (approvalConfig.length === 0) return [];

    const applicableSteps = approvalConfig.filter((step) => {
      if (!step.hasAmountThreshold || !step.amountThreshold) return true;
      if (!amount) return true;

      switch (step.amountCondition) {
        case "above":
          return amount > step.amountThreshold;
        case "below":
          return amount < step.amountThreshold;
        case "between":
          return amount >= step.amountThreshold && amount <= (step.amountThresholdMax || Infinity);
        default:
          return true;
      }
    });

    return applicableSteps.map((step) => {
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

  // Funciones de cálculo
  const calculateItemTotal = (item: POItem) => {
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
    const itemId = items[index].id;
    setItems(items.filter((_, i) => i !== index));
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Funciones de selección
  const selectSupplier = (supplier: Supplier) => {
    setFormData({
      ...formData,
      supplier: supplier.id,
      supplierName: supplier.fiscalName,
      paymentTerms: supplier.paymentMethod || formData.paymentTerms,
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

  // Validación
  const validateForm = (silent = false): boolean => {
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

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Manejo de archivos
  const handleFileUpload = (file: File) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      alert("Solo se permiten archivos PDF o imágenes (JPG, PNG, WebP)");
      return;
    }
    if (file.size > maxSize) {
      alert("El archivo no puede superar los 10MB");
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);


  // Guardar PO
  const savePO = async (status: "draft" | "pending") => {
    if (status === "pending" && !validateForm()) {
      // Marcar todos los campos como tocados para mostrar errores
      const allTouched: Record<string, boolean> = {
        supplier: true,
        department: true,
        generalDescription: true,
      };
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
      // Subir archivo si existe
      let fileUrl = "";
      let fileName = "";
      if (uploadedFile) {
        const fileRef = ref(storage, `projects/${id}/pos/${nextPONumber}/${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
        fileName = uploadedFile.name;
      }

      // Preparar items
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

      // Preparar datos de la PO
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
        attachmentFileName: fileName,
        createdAt: Timestamp.now(),
        createdBy: permissions.userId,
        createdByName: permissions.userName,
        version: 1,
        committedAmount: 0,
        invoicedAmount: 0,
      };

      // Determinar estado y aprobaciones
      if (status === "pending") {
        const approvalSteps = generateApprovalSteps(formData.department, totals.baseAmount);

        if (shouldAutoApprove(approvalSteps)) {
          poData.status = "approved";
          poData.approvedAt = Timestamp.now();
          poData.approvedBy = permissions.userId;
          poData.approvedByName = permissions.userName;
          poData.autoApproved = true;
          poData.committedAmount = totals.baseAmount;
        } else {
          poData.status = "pending";
          poData.approvalSteps = approvalSteps;
          poData.currentApprovalStep = 0;
        }
      } else {
        poData.status = "draft";
      }

      // Guardar en Firestore
      await addDoc(collection(db, `projects/${id}/pos`), poData);

      // Mostrar mensaje de éxito
      const message =
        poData.status === "approved"
          ? "PO creada y aprobada automáticamente"
          : poData.status === "pending"
          ? "PO enviada para aprobación"
          : "Borrador guardado correctamente";

      setSuccessMessage(message);

      // Redirigir después de un momento
      setTimeout(() => {
        router.push(`/project/${id}/accounting/pos`);
      }, 1500);
    } catch (error: any) {
      console.error("Error guardando PO:", error);
      alert(`Error al guardar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Utilidades
  const getCurrencySymbol = () => CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  // Calcular preview de aprobación
  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) {
      return { autoApprove: true, message: "Se aprobará automáticamente", steps: [] };
    }

    const steps = generateApprovalSteps(formData.department, totals.baseAmount);

    if (steps.every((s) => s.approvers.length === 0)) {
      return { autoApprove: true, message: "Se aprobará automáticamente (sin aprobadores configurados)", steps: [] };
    }

    return {
      autoApprove: false,
      message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`,
      steps,
    };
  };

  // Calcular progreso de completitud
  const getCompletionPercentage = (): number => {
    let completed = 0;
    const total = 4;

    if (formData.supplier) completed++;
    if (formData.department) completed++;
    if (formData.generalDescription.trim()) completed++;
    if (items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0)) completed++;

    return Math.round((completed / total) * 100);
  };

  // Filtros
  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.commercialName?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.taxId.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredSubAccounts = subAccounts.filter(
    (s) =>
      s.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.accountCode.toLowerCase().includes(accountSearch.toLowerCase())
  );

  // Variables calculadas
  const availableDepartments = getAvailableDepartments(departments);
  const approvalPreview = getApprovalPreview();
  const completionPercentage = getCompletionPercentage();

  // Helpers de validación visual
  const hasError = (field: string) => touched[field] && errors[field];
  const isValid = (field: string) => touched[field] && !errors[field];
  const getFieldClass = (field: string, base: string) => {
    if (hasError(field)) return `${base} border-red-300 bg-red-50`;
    if (isValid(field)) return `${base} border-emerald-300 bg-emerald-50/30`;
    return `${base} border-slate-200`;
  };


  // Estados de carga y error
  if (permissionsLoading || loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Cargando...</p>
        </div>
      </div>
    );
  }

  if (permissionsError || !permissions.hasAccountingAccess || !permissions.canCreatePO) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-500 mb-6 text-sm">
            {permissionsError || "No tienes permisos para crear órdenes de compra"}
          </p>
          <Link
            href={`/project/${id}/accounting/pos`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver a POs
          </Link>
        </div>
      </div>
    );
  }

  // Render principal
  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Breadcrumb */}
          <div className="mb-4">
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/dashboard" className="text-slate-500 hover:text-slate-700 transition-colors">
                Proyectos
              </Link>
              <span className="text-slate-300">/</span>
              <Link href={`/project/${id}/accounting`} className="text-slate-500 hover:text-slate-700 transition-colors">
                {projectName}
              </Link>
              <span className="text-slate-300">/</span>
              <Link href={`/project/${id}/accounting/pos`} className="text-slate-500 hover:text-slate-700 transition-colors">
                Órdenes de compra
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-slate-900 font-medium">Nueva</span>
            </nav>
          </div>

          {/* Título y acciones */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/project/${id}/accounting/pos`}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">Nueva orden de compra</h1>
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">
                    PO-{nextPONumber}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {permissions.userName}
                  {permissions.fixedDepartment && (
                    <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs font-medium">
                      {permissions.fixedDepartment}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => savePO("draft")}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                Guardar borrador
              </button>
              <button
                onClick={() => savePO("pending")}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : approvalPreview.autoApprove ? (
                  <>
                    <CheckCircle size={16} />
                    Crear PO
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Enviar para aprobación
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje de éxito */}
      {successMessage && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna principal - Formulario */}
          <div className="lg:col-span-2 space-y-6">

            {/* Sección: Información básica */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="font-semibold text-slate-900">Información básica</h2>
              </div>

              <div className="p-6 space-y-6">
                {/* Proveedor */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Proveedor <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(true)}
                    onBlur={() => handleBlur("supplier")}
                    className={getFieldClass(
                      "supplier",
                      "w-full px-4 py-3.5 border rounded-xl text-left flex items-center justify-between transition-colors hover:border-slate-300"
                    )}
                  >
                    {formData.supplierName ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                          <Building2 size={18} className="text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{formData.supplierName}</p>
                          <p className="text-xs text-slate-500">Click para cambiar</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Seleccionar proveedor...</span>
                    )}
                    <Search size={18} className="text-slate-400" />
                  </button>
                  {hasError("supplier") && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.supplier}
                    </p>
                  )}
                </div>

                {/* Departamento y Tipo de PO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Departamento */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Departamento <span className="text-red-500">*</span>
                      {permissions.fixedDepartment && (
                        <span className="ml-2 text-xs text-slate-400 font-normal">(asignado automáticamente)</span>
                      )}
                    </label>
                    <div className="relative">
                      <select
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        onBlur={() => handleBlur("department")}
                        disabled={!!permissions.fixedDepartment}
                        className={getFieldClass(
                          "department",
                          "w-full px-4 py-3.5 border rounded-xl bg-white disabled:bg-slate-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm appearance-none pr-10"
                        )}
                      >
                        <option value="">Seleccionar departamento...</option>
                        {availableDepartments.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2">
                        {permissions.fixedDepartment && <Lock size={14} className="text-slate-400" />}
                        <ChevronDown size={16} className="text-slate-400" />
                      </div>
                    </div>
                    {hasError("department") && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {errors.department}
                      </p>
                    )}
                  </div>

                  {/* Tipo de PO */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de orden</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PO_TYPES.map((type) => {
                        const Icon = type.icon;
                        const isSelected = formData.poType === type.value;
                        return (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, poType: type.value as any })}
                            className={`px-3 py-2.5 rounded-xl border-2 transition-all flex items-center gap-2 text-sm ${
                              isSelected
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 hover:border-slate-300 text-slate-600"
                            }`}
                            title={type.description}
                          >
                            <Icon size={16} />
                            <span className="font-medium">{type.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Moneda */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Moneda</label>
                  <div className="flex gap-2">
                    {CURRENCIES.map((currency) => {
                      const Icon = currency.icon;
                      const isSelected = formData.currency === currency.value;
                      return (
                        <button
                          key={currency.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, currency: currency.value })}
                          className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-sm font-medium ${
                            isSelected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 hover:border-slate-300 text-slate-600"
                          }`}
                        >
                          <Icon size={16} />
                          {currency.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Descripción general */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Descripción general <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.generalDescription}
                    onChange={(e) => setFormData({ ...formData, generalDescription: e.target.value })}
                    onBlur={() => handleBlur("generalDescription")}
                    placeholder="Describe el propósito de esta orden de compra..."
                    rows={3}
                    className={getFieldClass(
                      "generalDescription",
                      "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm"
                    )}
                  />
                  {hasError("generalDescription") && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.generalDescription}
                    </p>
                  )}
                </div>
              </div>
            </section>


            {/* Sección: Items */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-900">Items</h2>
                  <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium">
                    {items.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  Añadir item
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const isExpanded = expandedItems.has(item.id);
                  const hasItemErrors =
                    hasError(`item_${index}_description`) ||
                    hasError(`item_${index}_account`) ||
                    hasError(`item_${index}_quantity`) ||
                    hasError(`item_${index}_unitPrice`);

                  // Buscar info de la cuenta seleccionada
                  const selectedAccount = subAccounts.find((a) => a.id === item.subAccountId);

                  return (
                    <div key={item.id} className={`${hasItemErrors ? "bg-red-50/30" : ""}`}>
                      {/* Header del item (siempre visible) */}
                      <div
                        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                        onClick={() => toggleItemExpanded(item.id)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm font-medium text-slate-600">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-slate-900">
                              {item.description || "Sin descripción"}
                            </p>
                            <p className="text-sm text-slate-500">
                              {item.subAccountCode
                                ? `${item.subAccountCode} · ${item.subAccountDescription}`
                                : "Sin cuenta asignada"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {item.totalAmount > 0 && (
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(item.totalAmount)} {getCurrencySymbol()}
                            </span>
                          )}
                          {hasItemErrors && (
                            <span className="w-2 h-2 bg-red-500 rounded-full" title="Tiene errores" />
                          )}
                          <ChevronDown
                            size={20}
                            className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </div>
                      </div>

                      {/* Contenido expandible */}
                      {isExpanded && (
                        <div className="px-6 pb-6 space-y-4">
                          {/* Descripción y Cuenta */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                                Descripción <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateItem(index, "description", e.target.value)}
                                onBlur={() => handleBlur(`item_${index}_description`)}
                                placeholder="Describe este item..."
                                className={getFieldClass(
                                  `item_${index}_description`,
                                  "w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                                )}
                              />
                              {hasError(`item_${index}_description`) && (
                                <p className="text-xs text-red-600 mt-1">{errors[`item_${index}_description`]}</p>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                                Cuenta presupuestaria <span className="text-red-500">*</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentItemIndex(index);
                                  setShowAccountModal(true);
                                }}
                                className={getFieldClass(
                                  `item_${index}_account`,
                                  "w-full px-3 py-2.5 border rounded-xl text-left flex items-center justify-between text-sm hover:border-slate-300 transition-colors"
                                )}
                              >
                                {item.subAccountCode ? (
                                  <span className="text-slate-900 truncate">
                                    {item.subAccountCode} - {item.subAccountDescription}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Seleccionar cuenta...</span>
                                )}
                                <Search size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                              </button>
                              {hasError(`item_${index}_account`) && (
                                <p className="text-xs text-red-600 mt-1">{errors[`item_${index}_account`]}</p>
                              )}
                              {/* Info de presupuesto - SOLO PARA ROLES DE PROYECTO */}
                              {permissions.isProjectRole && selectedAccount && (
                                <div className="mt-2 p-2 bg-slate-50 rounded-lg">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Disponible:</span>
                                    <span
                                      className={`font-medium ${
                                        selectedAccount.available < item.baseAmount
                                          ? "text-red-600"
                                          : selectedAccount.available < selectedAccount.budgeted * 0.2
                                          ? "text-amber-600"
                                          : "text-emerald-600"
                                      }`}
                                    >
                                      {formatCurrency(selectedAccount.available)} {getCurrencySymbol()}
                                    </span>
                                  </div>
                                  {selectedAccount.available < item.baseAmount && item.baseAmount > 0 && (
                                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                      <AlertTriangle size={10} />
                                      Supera el presupuesto disponible
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Fecha, Cantidad, Precio, IVA, IRPF */}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">Fecha</label>
                              <input
                                type="date"
                                value={item.date}
                                onChange={(e) => updateItem(index, "date", e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                                Cantidad <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                                onBlur={() => handleBlur(`item_${index}_quantity`)}
                                min="0"
                                step="0.01"
                                className={getFieldClass(
                                  `item_${index}_quantity`,
                                  "w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                                )}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                                Precio unit. <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                                  onBlur={() => handleBlur(`item_${index}_unitPrice`)}
                                  min="0"
                                  step="0.01"
                                  className={getFieldClass(
                                    `item_${index}_unitPrice`,
                                    "w-full px-3 py-2.5 pr-8 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                                  )}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                                  {getCurrencySymbol()}
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1.5">IVA</label>
                              <select
                                value={item.vatRate}
                                onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm bg-white"
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
                                onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm bg-white"
                              >
                                {IRPF_RATES.map((rate) => (
                                  <option key={rate.value} value={rate.value}>
                                    {rate.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Resumen del item */}
                          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              disabled={items.length === 1}
                              className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={16} />
                              Eliminar item
                            </button>

                            <div className="flex items-center gap-6 text-sm">
                              <div className="text-right">
                                <p className="text-slate-500">Base</p>
                                <p className="font-medium text-slate-900">
                                  {formatCurrency(item.baseAmount)} {getCurrencySymbol()}
                                </p>
                              </div>
                              {item.vatAmount > 0 && (
                                <div className="text-right">
                                  <p className="text-slate-500">IVA ({item.vatRate}%)</p>
                                  <p className="font-medium text-slate-700">
                                    +{formatCurrency(item.vatAmount)} {getCurrencySymbol()}
                                  </p>
                                </div>
                              )}
                              {item.irpfAmount > 0 && (
                                <div className="text-right">
                                  <p className="text-slate-500">IRPF ({item.irpfRate}%)</p>
                                  <p className="font-medium text-red-600">
                                    -{formatCurrency(item.irpfAmount)} {getCurrencySymbol()}
                                  </p>
                                </div>
                              )}
                              <div className="text-right pl-4 border-l border-slate-200">
                                <p className="text-slate-500">Total</p>
                                <p className="font-bold text-slate-900">
                                  {formatCurrency(item.totalAmount)} {getCurrencySymbol()}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>


            {/* Sección: Adjunto */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="font-semibold text-slate-900">Archivo adjunto</h2>
              </div>

              <div className="p-6">
                {uploadedFile ? (
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <FileUp size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{uploadedFile.name}</p>
                        <p className="text-sm text-slate-500">{formatFileSize(uploadedFile.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadedFile(null)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                      isDragging
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-slate-600 mb-1">
                      Arrastra un archivo aquí o{" "}
                      <label className="text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">
                        selecciona un archivo
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                          className="hidden"
                        />
                      </label>
                    </p>
                    <p className="text-xs text-slate-400">PDF o imágenes, máximo 10MB</p>
                  </div>
                )}
              </div>
            </section>

            {/* Sección: Notas */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="font-semibold text-slate-900">Información adicional</h2>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Condiciones de pago
                  </label>
                  <input
                    type="text"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    placeholder="Ej: 30 días fecha factura, transferencia bancaria..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notas internas
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales para el equipo..."
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none text-sm"
                  />
                </div>
              </div>
            </section>
          </div>


          {/* Columna lateral - Resumen */}
          <div className="space-y-6">
            {/* Progreso */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Progreso</h3>
                <span className="text-2xl font-bold text-slate-900">{completionPercentage}%</span>
              </div>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {formData.supplier ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <Circle size={16} className="text-slate-300" />
                  )}
                  <span className={formData.supplier ? "text-slate-700" : "text-slate-400"}>
                    Proveedor seleccionado
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {formData.department ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <Circle size={16} className="text-slate-300" />
                  )}
                  <span className={formData.department ? "text-slate-700" : "text-slate-400"}>
                    Departamento asignado
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {formData.generalDescription.trim() ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <Circle size={16} className="text-slate-300" />
                  )}
                  <span className={formData.generalDescription.trim() ? "text-slate-700" : "text-slate-400"}>
                    Descripción completada
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {items.some((i) => i.description.trim() && i.subAccountId && i.quantity > 0 && i.unitPrice > 0) ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <Circle size={16} className="text-slate-300" />
                  )}
                  <span
                    className={
                      items.some((i) => i.description.trim() && i.subAccountId)
                        ? "text-slate-700"
                        : "text-slate-400"
                    }
                  >
                    Items válidos
                  </span>
                </div>
              </div>
            </div>

            {/* Resumen de importes */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Resumen</h3>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Base imponible</span>
                  <span className="font-medium text-slate-900">
                    {formatCurrency(totals.baseAmount)} {getCurrencySymbol()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IVA</span>
                  <span className="font-medium text-slate-700">
                    +{formatCurrency(totals.vatAmount)} {getCurrencySymbol()}
                  </span>
                </div>
                {totals.irpfAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">IRPF</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(totals.irpfAmount)} {getCurrencySymbol()}
                    </span>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-200 flex justify-between">
                  <span className="font-medium text-slate-700">Total</span>
                  <span className="text-xl font-bold text-slate-900">
                    {formatCurrency(totals.totalAmount)} {getCurrencySymbol()}
                  </span>
                </div>
              </div>
            </div>

            {/* Preview de aprobación */}
            <div
              className={`rounded-2xl border p-6 ${
                approvalPreview.autoApprove
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    approvalPreview.autoApprove ? "bg-emerald-100" : "bg-amber-100"
                  }`}
                >
                  {approvalPreview.autoApprove ? (
                    <CheckCircle size={20} className="text-emerald-600" />
                  ) : (
                    <Clock size={20} className="text-amber-600" />
                  )}
                </div>
                <div>
                  <h3
                    className={`font-semibold ${
                      approvalPreview.autoApprove ? "text-emerald-900" : "text-amber-900"
                    }`}
                  >
                    {approvalPreview.autoApprove ? "Auto-aprobación" : "Requiere aprobación"}
                  </h3>
                  <p
                    className={`text-sm ${
                      approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {approvalPreview.message}
                  </p>
                </div>
              </div>

              {!approvalPreview.autoApprove && approvalPreview.steps.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-amber-200">
                  {approvalPreview.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm text-amber-800">
                      <span className="w-5 h-5 bg-amber-200 rounded-full flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      <span>
                        {step.approverNames.length > 0
                          ? step.approverNames.join(", ")
                          : "Sin aprobadores definidos"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Información del creador */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Información</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Creado por</span>
                  <span className="font-medium text-slate-900">{permissions.userName}</span>
                </div>
                {permissions.isProjectRole ? (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rol</span>
                    <span className="font-medium text-slate-900">{permissions.role}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Departamento</span>
                      <span className="font-medium text-slate-900">{permissions.department}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Posición</span>
                      <span className="font-medium text-slate-900">{permissions.position}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>


      {/* Modal: Seleccionar proveedor */}
      {showSupplierModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowSupplierModal(false);
            setSupplierSearch("");
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Seleccionar proveedor</h3>
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

            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Buscar por nombre, nombre comercial o CIF..."
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[50vh]">
              {filteredSuppliers.length === 0 ? (
                <div className="p-8 text-center">
                  <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500">
                    {supplierSearch ? "No se encontraron proveedores" : "No hay proveedores registrados"}
                  </p>
                  <Link
                    href={`/project/${id}/accounting/suppliers/new`}
                    className="inline-flex items-center gap-2 mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <Plus size={16} />
                    Crear nuevo proveedor
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      onClick={() => selectSupplier(supplier)}
                      className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors flex items-center gap-4"
                    >
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Building2 size={20} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{supplier.fiscalName}</p>
                        {supplier.commercialName && supplier.commercialName !== supplier.fiscalName && (
                          <p className="text-sm text-slate-500 truncate">{supplier.commercialName}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {supplier.taxId} · {supplier.country}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Seleccionar cuenta presupuestaria */}
      {showAccountModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowAccountModal(false);
            setAccountSearch("");
            setCurrentItemIndex(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Seleccionar cuenta presupuestaria</h3>
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

            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Buscar por código o descripción..."
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[50vh]">
              {filteredSubAccounts.length === 0 ? (
                <div className="p-8 text-center">
                  <Hash size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500">
                    {accountSearch ? "No se encontraron cuentas" : "No hay cuentas registradas"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSubAccounts.map((account) => {
                    const availablePercent =
                      account.budgeted > 0 ? Math.round((account.available / account.budgeted) * 100) : 0;
                    const isLowBudget = availablePercent < 20 && account.budgeted > 0;
                    const isOverBudget = account.available < 0;

                    return (
                      <button
                        key={account.id}
                        onClick={() => selectAccount(account)}
                        className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900">{account.code}</p>
                              {isOverBudget && (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                  Sin presupuesto
                                </span>
                              )}
                              {isLowBudget && !isOverBudget && (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                                  Bajo
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 truncate">{account.description}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {account.accountCode} · {account.accountDescription}
                            </p>
                          </div>

                          {/* Info de presupuesto - SOLO PARA ROLES DE PROYECTO */}
                          {permissions.isProjectRole && (
                            <div className="text-right flex-shrink-0">
                              <p
                                className={`font-semibold ${
                                  isOverBudget
                                    ? "text-red-600"
                                    : isLowBudget
                                    ? "text-amber-600"
                                    : "text-emerald-600"
                                }`}
                              >
                                {formatCurrency(account.available)} {getCurrencySymbol()}
                              </p>
                              <p className="text-xs text-slate-400">disponible</p>
                              {account.budgeted > 0 && (
                                <div className="mt-1.5 w-20">
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        isOverBudget
                                          ? "bg-red-500"
                                          : isLowBudget
                                          ? "bg-amber-500"
                                          : "bg-emerald-500"
                                      }`}
                                      style={{ width: `${Math.max(0, Math.min(100, availablePercent))}%` }}
                                    />
                                  </div>
                                </div>
                              )}
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

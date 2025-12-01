"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
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
  DollarSign,
  AlertCircle,
  Info,
  Upload,
  X,
  Check,
  Plus,
  Trash2,
  Search,
  Calendar,
  Hash,
  Percent,
  FileUp,
  User,
  Briefcase,
  ShoppingCart,
  Package,
  Wrench,
  Shield,
  Eye,
  Edit3,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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

interface Department {
  name: string;
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

const PO_TYPES = [
  { value: "rental", label: "Alquiler", icon: ShoppingCart, color: "blue" },
  { value: "purchase", label: "Compra", icon: Package, color: "green" },
  { value: "service", label: "Servicio", icon: Wrench, color: "purple" },
  { value: "deposit", label: "Fianza", icon: Shield, color: "amber" },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
];

const VAT_RATES = [
  { value: 0, label: "0% (Exento)" },
  { value: 4, label: "4% (Superreducido)" },
  { value: 10, label: "10% (Reducido)" },
  { value: 21, label: "21% (General)" },
];

const IRPF_RATES = [
  { value: 0, label: "0% (Sin retención)" },
  { value: 7, label: "7%" },
  { value: 15, label: "15%" },
  { value: 19, label: "19%" },
  { value: 21, label: "21%" },
];

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
  const [poStatus, setPOStatus] = useState<string>("draft");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  
  // Original data for comparison
  const [originalData, setOriginalData] = useState<any>(null);
  
  // Approval config
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
        console.log("✅ Usuario autenticado:", user.uid);
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id && poId) {
      loadData();
    }
  }, [userId, id, poId]);

  useEffect(() => {
    calculateTotals();
  }, [items]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log("🔄 Cargando datos para editar PO...");

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        const depts = projectDoc.data().departments || [];
        setDepartments(depts.map((d: string) => ({ name: d })));
        console.log("✅ Proyecto cargado:", projectDoc.data().name);
      }

      // Load user member data
      const memberDoc = await getDoc(doc(db, `projects/${id}/members`, userId!));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        setUserRole(memberData.role || "");
        setUserDepartment(memberData.department || "");
        console.log("✅ Rol de usuario:", memberData.role || "Sin rol");
      }

      // Load all members (for approval resolution)
      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      const membersData = membersSnapshot.docs.map((doc) => ({
        userId: doc.id,
        role: doc.data().role,
        department: doc.data().department,
        position: doc.data().position,
      }));
      setMembers(membersData);
      console.log(`✅ ${membersData.length} miembros cargados`);

      // Load approval configuration
      const approvalConfigDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (approvalConfigDoc.exists()) {
        const config = approvalConfigDoc.data();
        setApprovalConfig(config.poApprovals || []);
        console.log(`✅ Configuración de aprobaciones: ${(config.poApprovals || []).length} niveles`);
      }

      // Load suppliers
      const suppliersSnapshot = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("fiscalName", "asc"))
      );
      const suppliersData = suppliersSnapshot.docs.map((doc) => ({
        id: doc.id,
        fiscalName: doc.data().fiscalName,
        commercialName: doc.data().commercialName || "",
        country: doc.data().country,
        taxId: doc.data().taxId,
        paymentMethod: doc.data().paymentMethod,
      })) as Supplier[];
      setSuppliers(suppliersData);
      console.log(`✅ ${suppliersData.length} proveedores cargados`);

      // Load accounts and subaccounts
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
          const budgeted = data.budgeted || 0;
          const committed = data.committed || 0;
          const actual = data.actual || 0;
          const available = budgeted - committed - actual;
          allSubAccounts.push({
            id: subDoc.id,
            code: data.code,
            description: data.description,
            budgeted,
            committed,
            actual,
            available,
            accountId: accountDoc.id,
            accountCode: accountData.code,
            accountDescription: accountData.description,
          });
        });
      }
      setSubAccounts(allSubAccounts);
      console.log(`✅ ${allSubAccounts.length} subcuentas cargadas`);

      // Load existing PO data
      const poDoc = await getDoc(doc(db, `projects/${id}/pos`, poId));
      if (!poDoc.exists()) {
        setErrorMessage("PO no encontrada");
        setLoading(false);
        return;
      }

      const poData = poDoc.data();
      setOriginalData(poData);
      setPONumber(poData.number || "");
      setPOStatus(poData.status || "draft");
      setExistingFileUrl(poData.attachmentUrl || "");
      setExistingFileName(poData.attachmentFileName || "");

      // Set form data
      setFormData({
        supplier: poData.supplierId || "",
        supplierName: poData.supplier || "",
        department: poData.department || "",
        poType: poData.poType || "purchase",
        currency: poData.currency || "EUR",
        generalDescription: poData.description || "",
        paymentTerms: poData.paymentTerms || "",
        notes: poData.notes || "",
      });

      // Set items
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
        loadedItems.push({
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
        });
      }

      setItems(loadedItems);
      console.log(`✅ PO ${poData.number} cargada (estado: ${poData.status})`);

    } catch (error: any) {
      console.error("❌ Error cargando datos:", error);
      setErrorMessage(`Error al cargar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // APPROVAL SYSTEM FUNCTIONS
  // ==========================================

  const resolveApprovers = (
    step: ApprovalStep,
    documentDepartment?: string
  ): string[] => {
    switch (step.approverType) {
      case "fixed":
        return step.approvers || [];

      case "role":
        const roleApprovers = members
          .filter((m) => m.role && step.roles?.includes(m.role))
          .map((m) => m.userId);
        return roleApprovers;

      case "hod":
        const hodDepartment = step.department || documentDepartment;
        const hods = members
          .filter((m) => m.position === "HOD" && m.department === hodDepartment)
          .map((m) => m.userId);
        return hods;

      case "coordinator":
        const coordDepartment = step.department || documentDepartment;
        const coordinators = members
          .filter((m) => m.position === "Coordinator" && m.department === coordDepartment)
          .map((m) => m.userId);
        return coordinators;

      default:
        return [];
    }
  };

  const generateApprovalSteps = (documentDepartment?: string): ApprovalStepStatus[] => {
    if (approvalConfig.length === 0) {
      console.log("ℹ️ Sin niveles de aprobación configurados");
      return [];
    }

    const steps: ApprovalStepStatus[] = approvalConfig.map((step) => {
      const resolvedApprovers = resolveApprovers(step, documentDepartment);

      return {
        id: step.id || "",
        order: step.order || 0,
        approverType: step.approverType || "fixed",
        approvers: resolvedApprovers || [],
        roles: step.roles || [],
        department: step.department || "",
        approvedBy: [],
        rejectedBy: [],
        status: "pending" as const,
        requireAll: step.requireAll ?? false,
      };
    });

    console.log(`✅ Generados ${steps.length} pasos de aprobación`);
    return steps;
  };

  const shouldAutoApprove = (steps: ApprovalStepStatus[]): boolean => {
    if (steps.length === 0) {
      return true;
    }
    return steps.every((step) => step.approvers.length === 0);
  };

  const getApprovalPreview = () => {
    if (approvalConfig.length === 0) {
      return { levels: 0, autoApprove: true, message: "Se aprobará automáticamente" };
    }

    const steps = generateApprovalSteps(formData.department);
    const hasApprovers = steps.some((s) => s.approvers.length > 0);

    if (!hasApprovers) {
      return { levels: 0, autoApprove: true, message: "Se aprobará automáticamente (sin aprobadores asignados)" };
    }

    return {
      levels: steps.length,
      autoApprove: false,
      message: `${steps.length} nivel${steps.length > 1 ? "es" : ""} de aprobación`,
      steps,
    };
  };

  // ==========================================
  // ITEM MANAGEMENT
  // ==========================================

  const calculateItemTotal = (item: POItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    const totalAmount = baseAmount + vatAmount - irpfAmount;

    return {
      baseAmount,
      vatAmount,
      irpfAmount,
      totalAmount,
    };
  };

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    const calculated = calculateItemTotal(newItems[index]);
    newItems[index] = {
      ...newItems[index],
      baseAmount: calculated.baseAmount,
      vatAmount: calculated.vatAmount,
      irpfAmount: calculated.irpfAmount,
      totalAmount: calculated.totalAmount,
    };

    setItems(newItems);
  };

  const addItem = () => {
    const newItem: POItem = {
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
    };
    setItems([...items, newItem]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      alert("Debe haber al menos un ítem en la PO");
      return;
    }
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const calculateTotals = () => {
    const baseAmount = items.reduce((sum, item) => sum + item.baseAmount, 0);
    const vatAmount = items.reduce((sum, item) => sum + item.vatAmount, 0);
    const irpfAmount = items.reduce((sum, item) => sum + item.irpfAmount, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    setTotals({ baseAmount, vatAmount, irpfAmount, totalAmount });
  };

  // ==========================================
  // SUPPLIER AND ACCOUNT SELECTION
  // ==========================================

  const selectSupplier = (supplier: Supplier) => {
    setFormData({
      ...formData,
      supplier: supplier.id,
      supplierName: supplier.fiscalName,
    });
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
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  const openAccountModal = (index: number) => {
    setCurrentItemIndex(index);
    setShowAccountModal(true);
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.fiscalName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.commercialName.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.taxId.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredSubAccounts = subAccounts.filter(
    (s) =>
      s.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.accountDescription.toLowerCase().includes(accountSearch.toLowerCase())
  );

  // ==========================================
  // FILE HANDLING
  // ==========================================

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("El archivo no puede superar los 10MB");
        return;
      }
      setUploadedFile(file);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
  };

  const removeExistingFile = () => {
    setExistingFileUrl("");
    setExistingFileName("");
  };

  // ==========================================
  // VALIDATION
  // ==========================================

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.supplier) {
      newErrors.supplier = "Selecciona un proveedor";
    }

    if (!formData.department) {
      newErrors.department = "Selecciona un departamento";
    }

    if (!formData.generalDescription.trim()) {
      newErrors.generalDescription = "La descripción es obligatoria";
    }

    items.forEach((item, index) => {
      if (!item.description.trim()) {
        newErrors[`item_${index}_description`] = "Descripción obligatoria";
      }
      if (!item.subAccountId) {
        newErrors[`item_${index}_account`] = "Cuenta obligatoria";
      }
      if (item.quantity <= 0) {
        newErrors[`item_${index}_quantity`] = "Cantidad debe ser mayor a 0";
      }
      if (item.unitPrice <= 0) {
        newErrors[`item_${index}_unitPrice`] = "Precio debe ser mayor a 0";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ==========================================
  // SAVE FUNCTIONS
  // ==========================================

  const savePO = async (sendForApproval: boolean = false) => {
    if (!validateForm()) {
      setErrorMessage("Por favor, completa todos los campos obligatorios");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    // Check if PO can be edited
    if (poStatus === "approved") {
      setErrorMessage("No se puede editar una PO aprobada");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      console.log("💾 Guardando cambios en PO...");

      let fileUrl = existingFileUrl;
      let fileName = existingFileName;

      // Upload new file if provided
      if (uploadedFile) {
        console.log("📤 Subiendo nuevo archivo...");
        const fileRef = ref(storage, `projects/${id}/pos/${poNumber}/${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
        fileName = uploadedFile.name;
        console.log("✅ Archivo subido");
      }

      // Prepare items data - protect against undefined
      const itemsData = items.map((item) => ({
        id: item.id || "",
        description: (item.description || "").trim(),
        subAccountId: item.subAccountId || "",
        subAccountCode: item.subAccountCode || "",
        subAccountDescription: item.subAccountDescription || "",
        date: item.date || new Date().toISOString().split("T")[0],
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        baseAmount: item.baseAmount || 0,
        vatRate: item.vatRate ?? 21,
        vatAmount: item.vatAmount || 0,
        irpfRate: item.irpfRate ?? 0,
        irpfAmount: item.irpfAmount || 0,
        totalAmount: item.totalAmount || 0,
      }));

      // Base PO data - protect against undefined
      const poData: any = {
        supplier: formData.supplierName || "",
        supplierId: formData.supplier || "",
        department: formData.department || "",
        poType: formData.poType || "Servicio",
        currency: formData.currency || "EUR",
        description: (formData.generalDescription || "").trim(),
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

      // Handle status change
      if (sendForApproval && (poStatus === "draft" || poStatus === "rejected")) {
        console.log("🔄 Enviando para aprobación...");
        const approvalSteps = generateApprovalSteps(formData.department);

        if (shouldAutoApprove(approvalSteps)) {
          console.log("✅ Auto-aprobación: sin aprobadores configurados");
          poData.status = "approved";
          poData.approvedAt = Timestamp.now();
          poData.approvedBy = userId || "";
          poData.approvedByName = userName || "";
          poData.autoApproved = true;
        } else {
          console.log(`📋 PO requiere aprobación: ${approvalSteps.length} niveles`);
          poData.status = "pending";
          poData.approvalSteps = approvalSteps;
          poData.currentApprovalStep = 0;
        }
      } else if (!sendForApproval && poStatus === "draft") {
        // Keep as draft
        poData.status = "draft";
      }

      // Update in Firebase
      const poRef = doc(db, `projects/${id}/pos`, poId);
      await updateDoc(poRef, poData);
      console.log("✅ PO actualizada");

      // Set success message
      if (sendForApproval) {
        if (poData.autoApproved) {
          setSuccessMessage("PO guardada y aprobada automáticamente");
        } else {
          setSuccessMessage("PO enviada para aprobación");
        }
      } else {
        setSuccessMessage("Cambios guardados correctamente");
      }

      setTimeout(() => {
        router.push(`/project/${id}/accounting/pos`);
      }, 1500);

    } catch (error: any) {
      console.error("❌ Error guardando PO:", error);
      setErrorMessage(`Error al guardar: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // STATUS HELPERS
  // ==========================================

  const canEdit = () => {
    return poStatus === "draft" || poStatus === "rejected";
  };

  const canSendForApproval = () => {
    return poStatus === "draft" || poStatus === "rejected";
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-slate-100 text-slate-700 border-slate-200",
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
    };

    const labels: Record<string, string> = {
      draft: "Borrador",
      pending: "Pendiente",
      approved: "Aprobada",
      rejected: "Rechazada",
    };

    const icons: Record<string, JSX.Element> = {
      draft: <Edit3 size={14} />,
      pending: <Clock size={14} />,
      approved: <CheckCircle size={14} />,
      rejected: <XCircle size={14} />,
    };

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${styles[status] || styles.draft}`}>
        {icons[status] || icons.draft}
        {labels[status] || status}
      </span>
    );
  };

  const getCurrencySymbol = () => {
    return CURRENCIES.find((c) => c.value === formData.currency)?.symbol || "€";
  };

  const approvalPreview = getApprovalPreview();

  // ==========================================
  // RENDER
  // ==========================================

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando PO...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4rem] bg-gradient-to-r from-emerald-50 to-emerald-100 border-y border-emerald-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-emerald-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${id}/accounting/pos`}
            className="text-emerald-600 hover:text-emerald-900 transition-colors text-sm font-medium"
          >
            Volver a POs
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Link
              href={`/project/${id}/accounting/pos`}
              className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-800 mb-4 text-sm font-medium"
            >
              <ArrowLeft size={16} />
              Volver a órdenes de compra
            </Link>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 rounded-xl shadow-lg">
                  <FileText size={28} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                      Editar PO-{poNumber}
                    </h1>
                    {getStatusBadge(poStatus)}
                  </div>
                  <p className="text-slate-600 text-sm mt-1">
                    {formData.supplierName || "Sin proveedor"} • {userName}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700">
              <CheckCircle size={20} />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Read-only warning for non-editable states */}
          {!canEdit() && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700">
              <AlertTriangle size={20} />
              <span className="font-medium">
                Esta PO está {poStatus === "pending" ? "pendiente de aprobación" : poStatus === "approved" ? "aprobada" : poStatus}. No se puede editar.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Supplier and Department */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Building2 size={20} className="text-emerald-600" />
                  Información general
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Supplier */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Proveedor *
                    </label>
                    <button
                      onClick={() => canEdit() && setShowSupplierModal(true)}
                      disabled={!canEdit()}
                      className={`w-full px-4 py-3 border ${
                        errors.supplier ? "border-red-300" : "border-slate-300"
                      } rounded-lg ${canEdit() ? "hover:border-emerald-400" : "bg-slate-50 cursor-not-allowed"} transition-colors text-left flex items-center justify-between group`}
                    >
                      {formData.supplierName ? (
                        <div className="flex items-center gap-2">
                          <Building2 size={18} className="text-emerald-600" />
                          <span className="font-medium">{formData.supplierName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Seleccionar proveedor...</span>
                      )}
                      {canEdit() && <Search size={18} className="text-slate-400 group-hover:text-emerald-600" />}
                    </button>
                    {errors.supplier && (
                      <p className="text-xs text-red-600 mt-1">{errors.supplier}</p>
                    )}
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Departamento *
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      disabled={!canEdit()}
                      className={`w-full px-4 py-3 border ${
                        errors.department ? "border-red-300" : "border-slate-300"
                      } rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-slate-50`}
                    >
                      <option value="">Seleccionar departamento...</option>
                      {departments.map((dept) => (
                        <option key={dept.name} value={dept.name}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                    {errors.department && (
                      <p className="text-xs text-red-600 mt-1">{errors.department}</p>
                    )}
                  </div>
                </div>

                {/* PO Type */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Tipo de PO
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {PO_TYPES.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.value}
                          onClick={() => canEdit() && setFormData({ ...formData, poType: type.value as any })}
                          disabled={!canEdit()}
                          className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                            formData.poType === type.value
                              ? "border-emerald-500 bg-emerald-50"
                              : "border-slate-200 hover:border-slate-300"
                          } ${!canEdit() && "opacity-50 cursor-not-allowed"}`}
                        >
                          <Icon
                            size={20}
                            className={formData.poType === type.value ? "text-emerald-600" : "text-slate-400"}
                          />
                          <span
                            className={`text-xs font-medium ${
                              formData.poType === type.value ? "text-emerald-700" : "text-slate-600"
                            }`}
                          >
                            {type.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Currency */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Moneda
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      disabled={!canEdit()}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-slate-50"
                    >
                      {CURRENCIES.map((curr) => (
                        <option key={curr.value} value={curr.value}>
                          {curr.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Condiciones de pago
                    </label>
                    <input
                      type="text"
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      disabled={!canEdit()}
                      placeholder="Ej: 30 días, a la entrega..."
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-slate-50"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Descripción general *
                  </label>
                  <textarea
                    value={formData.generalDescription}
                    onChange={(e) => setFormData({ ...formData, generalDescription: e.target.value })}
                    disabled={!canEdit()}
                    placeholder="Describe el propósito general de esta orden de compra..."
                    rows={3}
                    className={`w-full px-4 py-3 border ${
                      errors.generalDescription ? "border-red-300" : "border-slate-300"
                    } rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none disabled:bg-slate-50`}
                  />
                  {errors.generalDescription && (
                    <p className="text-xs text-red-600 mt-1">{errors.generalDescription}</p>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Hash size={20} className="text-emerald-600" />
                    Ítems de la PO ({items.length})
                  </h2>
                  {canEdit() && (
                    <button
                      onClick={addItem}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Plus size={16} />
                      Añadir ítem
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="border-2 border-slate-200 rounded-xl p-4 hover:border-emerald-200 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-900">Ítem {index + 1}</h3>
                        {canEdit() && items.length > 1 && (
                          <button
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {/* Description */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Descripción *
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            disabled={!canEdit()}
                            placeholder="Descripción del ítem..."
                            className={`w-full px-3 py-2 border ${
                              errors[`item_${index}_description`] ? "border-red-300" : "border-slate-300"
                            } rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50`}
                          />
                        </div>

                        {/* Account */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Cuenta presupuestaria *
                          </label>
                          <button
                            onClick={() => canEdit() && openAccountModal(index)}
                            disabled={!canEdit()}
                            className={`w-full px-3 py-2 border ${
                              errors[`item_${index}_account`] ? "border-red-300" : "border-slate-300"
                            } rounded-lg text-sm text-left flex items-center justify-between ${canEdit() ? "hover:border-emerald-400" : "bg-slate-50 cursor-not-allowed"} transition-colors`}
                          >
                            {item.subAccountCode ? (
                              <span className="font-mono text-slate-900">
                                {item.subAccountCode} - {item.subAccountDescription}
                              </span>
                            ) : (
                              <span className="text-slate-400">Seleccionar cuenta...</span>
                            )}
                            {canEdit() && <Search size={14} className="text-slate-400" />}
                          </button>
                        </div>

                        {/* Date, Quantity, Unit Price */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Fecha
                            </label>
                            <input
                              type="date"
                              value={item.date}
                              onChange={(e) => updateItem(index, "date", e.target.value)}
                              disabled={!canEdit()}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Cantidad
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                              disabled={!canEdit()}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Precio unit. ({getCurrencySymbol()})
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                              disabled={!canEdit()}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            />
                          </div>
                        </div>

                        {/* VAT and IRPF */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              IVA
                            </label>
                            <select
                              value={item.vatRate}
                              onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value))}
                              disabled={!canEdit()}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            >
                              {VAT_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              IRPF
                            </label>
                            <select
                              value={item.irpfRate}
                              onChange={(e) => updateItem(index, "irpfRate", parseFloat(e.target.value))}
                              disabled={!canEdit()}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            >
                              {IRPF_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Amounts Summary */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-slate-600">Base</p>
                              <p className="font-semibold text-slate-900">
                                {(item.baseAmount || 0).toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">IVA</p>
                              <p className="font-semibold text-emerald-600">
                                +{(item.vatAmount || 0).toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">IRPF</p>
                              <p className="font-semibold text-red-600">
                                -{(item.irpfAmount || 0).toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Total</p>
                              <p className="font-bold text-emerald-600 text-sm">
                                {(item.totalAmount || 0).toFixed(2)} {getCurrencySymbol()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Info size={20} className="text-emerald-600" />
                  Notas adicionales
                </h2>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  disabled={!canEdit()}
                  placeholder="Notas internas, instrucciones especiales..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none disabled:bg-slate-50"
                />
              </div>

              {/* File Upload */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Upload size={20} className="text-emerald-600" />
                  Documento adjunto
                </h2>

                {/* Existing file */}
                {existingFileUrl && !uploadedFile && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <FileText size={24} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-blue-900">{existingFileName}</p>
                        <a
                          href={existingFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Ver archivo actual
                        </a>
                      </div>
                    </div>
                    {canEdit() && (
                      <button
                        onClick={removeExistingFile}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                )}

                {/* New file upload */}
                {canEdit() && (
                  <>
                    {uploadedFile ? (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-emerald-100 p-2 rounded-lg">
                            <FileUp size={24} className="text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-emerald-900">{uploadedFile.name}</p>
                            <p className="text-xs text-emerald-600">
                              {(uploadedFile.size / 1024).toFixed(0)} KB - Nuevo archivo
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={removeFile}
                          className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 transition-colors block">
                        <Upload size={40} className="text-slate-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-600 font-medium">
                          {existingFileUrl ? "Subir nuevo archivo" : "Arrastra un archivo o haz clic"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">PDF, imágenes (máx. 10MB)</p>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Totals */}
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl shadow-lg p-6 text-white">
                  <h3 className="text-sm font-medium text-emerald-100 mb-4">Total de la PO</h3>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-100">Base imponible</span>
                      <span className="font-semibold">{(totals.baseAmount || 0).toFixed(2)} {getCurrencySymbol()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-100">IVA</span>
                      <span className="font-semibold text-emerald-200">+{(totals.vatAmount || 0).toFixed(2)} {getCurrencySymbol()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-100">IRPF</span>
                      <span className="font-semibold text-red-300">-{(totals.irpfAmount || 0).toFixed(2)} {getCurrencySymbol()}</span>
                    </div>
                  </div>

                  <div className="border-t border-emerald-400 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total</span>
                      <span className="text-3xl font-bold">{(totals.totalAmount || 0).toFixed(2)} {getCurrencySymbol()}</span>
                    </div>
                  </div>
                </div>

                {/* Approval Preview (only for draft/rejected) */}
                {canSendForApproval() && (
                  <div className={`border rounded-xl p-4 ${
                    approvalPreview.autoApprove 
                      ? "bg-emerald-50 border-emerald-200" 
                      : "bg-amber-50 border-amber-200"
                  }`}>
                    <div className="flex items-start gap-3">
                      {approvalPreview.autoApprove ? (
                        <CheckCircle size={20} className="text-emerald-600 mt-0.5" />
                      ) : (
                        <AlertCircle size={20} className="text-amber-600 mt-0.5" />
                      )}
                      <div>
                        <p className={`font-semibold text-sm ${
                          approvalPreview.autoApprove ? "text-emerald-800" : "text-amber-800"
                        }`}>
                          {approvalPreview.autoApprove ? "Auto-aprobación" : "Requiere aprobación"}
                        </p>
                        <p className={`text-xs mt-1 ${
                          approvalPreview.autoApprove ? "text-emerald-700" : "text-amber-700"
                        }`}>
                          {approvalPreview.message}
                        </p>
                        {!approvalPreview.autoApprove && approvalPreview.steps && (
                          <div className="mt-2 space-y-1">
                            {approvalPreview.steps.map((step, idx) => (
                              <div key={step.id} className="text-xs text-amber-700 flex items-center gap-1">
                                <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-semibold text-[10px]">
                                  {idx + 1}
                                </span>
                                <span>
                                  {step.approverType === "role" && step.roles
                                    ? step.roles.join(", ")
                                    : step.approverType === "fixed"
                                    ? `${step.approvers.length} usuario(s)`
                                    : step.approverType}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">Acciones</h3>

                  <div className="space-y-3">
                    {canEdit() && (
                      <>
                        {/* Save as draft (only if currently draft) */}
                        {poStatus === "draft" && (
                          <button
                            onClick={() => savePO(false)}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors disabled:opacity-50"
                          >
                            {saving ? (
                              <>
                                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                Guardando...
                              </>
                            ) : (
                              <>
                                <Save size={18} />
                                Guardar borrador
                              </>
                            )}
                          </button>
                        )}

                        {/* Send for approval */}
                        {canSendForApproval() && (
                          <button
                            onClick={() => savePO(true)}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50"
                          >
                            {saving ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Guardando...
                              </>
                            ) : (
                              <>
                                {approvalPreview.autoApprove ? <Check size={18} /> : <Send size={18} />}
                                {approvalPreview.autoApprove ? "Guardar y aprobar" : "Enviar para aprobación"}
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )}

                    <Link href={`/project/${id}/accounting/pos`}>
                      <button className="w-full px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">
                        {canEdit() ? "Cancelar" : "Volver"}
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-2">
                    <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold mb-1">Estado: {poStatus}</p>
                      <ul className="space-y-1">
                        {poStatus === "draft" && <li>• Puedes editar y guardar como borrador</li>}
                        {poStatus === "rejected" && <li>• Puedes corregir y reenviar para aprobación</li>}
                        {poStatus === "pending" && <li>• Esperando aprobación</li>}
                        {poStatus === "approved" && <li>• PO aprobada y en ejecución</li>}
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">Seleccionar proveedor</h2>
              <button
                onClick={() => {
                  setShowSupplierModal(false);
                  setSupplierSearch("");
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Buscar por nombre o NIF..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSuppliers.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No se encontraron proveedores</p>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      onClick={() => selectSupplier(supplier)}
                      className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900 group-hover:text-emerald-700">
                            {supplier.fiscalName}
                          </p>
                          {supplier.commercialName && (
                            <p className="text-sm text-slate-600">{supplier.commercialName}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">
                            NIF: {supplier.taxId} • {supplier.country}
                          </p>
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

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">Seleccionar cuenta presupuestaria</h2>
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  setAccountSearch("");
                  setCurrentItemIndex(null);
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Buscar por código o descripción..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No se encontraron cuentas</p>
                ) : (
                  filteredSubAccounts.map((subAccount) => (
                    <button
                      key={subAccount.id}
                      onClick={() => selectAccount(subAccount)}
                      className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-mono font-semibold text-slate-900 group-hover:text-emerald-700">
                            {subAccount.code}
                          </p>
                          <p className="text-sm text-slate-700">{subAccount.description}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {subAccount.accountCode} - {subAccount.accountDescription}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-slate-600">Presupuestado</p>
                          <p className="font-semibold text-slate-900">
                            {(subAccount.budgeted || 0).toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Comprometido</p>
                          <p className="font-semibold text-amber-600">
                            {(subAccount.committed || 0).toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Realizado</p>
                          <p className="font-semibold text-emerald-600">
                            {(subAccount.actual || 0).toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Disponible</p>
                          <p className={`font-bold ${
                            (subAccount.available || 0) < 0 ? "text-red-600" : 
                            (subAccount.available || 0) < (subAccount.budgeted || 0) * 0.1 ? "text-amber-600" : 
                            "text-emerald-600"
                          }`}>
                            {(subAccount.available || 0).toLocaleString()} €
                          </p>
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

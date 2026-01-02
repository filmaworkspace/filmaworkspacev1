"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Settings,
  Save,
  AlertCircle,
  CheckCircle2,
  FileText,
  Receipt,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Info,
  ChevronRight,
  ChevronDown,
  Users,
  UserCheck,
  Briefcase,
  Shield,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Zap,
  FileCheck,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Member {
  userId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  position?: string;
}

interface ApprovalStep {
  id: string;
  order: number;
  approverType: "fixed" | "hod" | "coordinator" | "role";
  approvers?: string[];
  roles?: string[];
  department?: string;
  requireAll: boolean;
  hasAmountThreshold: boolean;
  amountThreshold?: number;
  amountCondition?: "above" | "below" | "between";
  amountThresholdMax?: number;
}

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const APPROVER_TYPE_LABELS: Record<string, string> = {
  fixed: "Usuarios específicos",
  role: "Por rol",
  hod: "Head of Department",
  coordinator: "Coordinator",
};
const APPROVER_TYPE_ICONS: Record<string, any> = {
  fixed: Users,
  role: Shield,
  hod: Briefcase,
  coordinator: UserCheck,
};

const AMOUNT_CONDITIONS: Record<string, { label: string; description: string }> = {
  above: { label: "Superior a", description: "Se activa cuando el importe supera el umbral" },
  below: { label: "Inferior a", description: "Se activa cuando el importe es menor al umbral" },
  between: { label: "Entre", description: "Se activa cuando el importe está en el rango" },
};

const PRESET_THRESHOLDS = [1000, 2500, 5000, 10000, 25000, 50000];

// Secciones de configuración
const CONFIG_SECTIONS = [
  { id: "approvals", label: "Aprobaciones", icon: FileCheck, description: "Flujos de aprobación para POs y facturas" },
  { id: "permissions", label: "Permisos", icon: Shield, description: "Quién puede realizar cada acción" },
];

// Configuración de permisos por defecto
interface PermissionConfig {
  id: string;
  label: string;
  description: string;
  category: "po" | "invoice" | "general";
  defaultRoles: string[];
  allowCustomUsers: boolean;
}

const PERMISSION_CONFIGS: PermissionConfig[] = [
  // PO permissions
  { id: "po_cancel", label: "Anular POs", description: "Anular órdenes de compra aprobadas", category: "po", defaultRoles: ["EP", "PM"], allowCustomUsers: true },
  { id: "po_close", label: "Cerrar POs", description: "Cerrar órdenes de compra completadas", category: "po", defaultRoles: ["EP", "PM", "Controller"], allowCustomUsers: true },
  { id: "po_reopen", label: "Reabrir POs", description: "Reabrir órdenes de compra cerradas", category: "po", defaultRoles: ["EP", "PM"], allowCustomUsers: true },
  { id: "po_modify", label: "Modificar POs aprobadas", description: "Crear nuevas versiones de POs aprobadas", category: "po", defaultRoles: ["EP", "PM"], allowCustomUsers: true },
  { id: "po_delete_draft", label: "Eliminar borradores de PO", description: "Eliminar POs en estado borrador", category: "po", defaultRoles: ["EP", "PM", "Controller", "PC"], allowCustomUsers: false },
  
  // Invoice permissions
  { id: "invoice_void", label: "Anular facturas", description: "Anular facturas registradas", category: "invoice", defaultRoles: ["EP", "PM", "Controller"], allowCustomUsers: true },
  { id: "invoice_mark_paid", label: "Marcar como pagada", description: "Cambiar estado de factura a pagada", category: "invoice", defaultRoles: ["EP", "PM", "Controller"], allowCustomUsers: true },
  { id: "invoice_replace", label: "Sustituir proformas", description: "Subir factura definitiva para sustituir proforma", category: "invoice", defaultRoles: ["EP", "PM", "Controller", "PC"], allowCustomUsers: false },
  { id: "invoice_delete_draft", label: "Eliminar borradores", description: "Eliminar facturas en estado borrador", category: "invoice", defaultRoles: ["EP", "PM", "Controller", "PC"], allowCustomUsers: false },
  
  // General permissions
  { id: "view_all_departments", label: "Ver todos los departamentos", description: "Acceso a documentos de cualquier departamento", category: "general", defaultRoles: ["EP", "PM", "Controller"], allowCustomUsers: true },
  { id: "export_data", label: "Exportar datos", description: "Descargar informes y exportar a PDF/Excel", category: "general", defaultRoles: ["EP", "PM", "Controller", "PC"], allowCustomUsers: false },
  { id: "manage_suppliers", label: "Gestionar proveedores", description: "Crear, editar y eliminar proveedores", category: "general", defaultRoles: ["EP", "PM", "Controller"], allowCustomUsers: true },
  { id: "manage_payments", label: "Gestionar previsiones de pago", description: "Crear y gestionar remesas de pago", category: "general", defaultRoles: ["EP", "PM", "Controller"], allowCustomUsers: true },
];

interface PermissionSettings {
  [permissionId: string]: {
    roles: string[];
    users: string[];
  };
}

export default function AccountingConfigPage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  
  // Sección activa
  const [activeSection, setActiveSection] = useState("approvals");
  
  // Tab de aprobaciones (PO vs Invoice)
  const [activeTab, setActiveTab] = useState<"po" | "invoice">("po");
  const [poApprovals, setPoApprovals] = useState<ApprovalStep[]>([]);
  const [invoiceApprovals, setInvoiceApprovals] = useState<ApprovalStep[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  
  // Permisos
  const [permissionSettings, setPermissionSettings] = useState<PermissionSettings>({});
  const [expandedPermissions, setExpandedPermissions] = useState<Set<string>>(new Set());
  
  // Auditoría
  const [auditLog, setAuditLog] = useState<{
    approvals?: { updatedAt: any; updatedBy: string; updatedByName?: string };
    permissions?: { updatedAt: any; updatedBy: string; updatedByName?: string };
  }>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      else setUserId(u.uid);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (userId && id) loadData();
  }, [userId, id]);

  const toggleExpanded = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) newExpanded.delete(stepId);
    else newExpanded.add(stepId);
    setExpandedSteps(newExpanded);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const userProjectRef = doc(db, `userProjects/${userId}/projects/${id}`);
      const userProjectSnap = await getDoc(userProjectRef);
      if (!userProjectSnap.exists()) {
        setErrorMessage("No tienes acceso a este proyecto");
        setLoading(false);
        return;
      }

      const userProjectData = userProjectSnap.data();
      const hasAccountingAccess = userProjectData.permissions?.accounting || false;
      const accountingLevel = userProjectData.accountingAccessLevel;

      const memberRef = doc(db, `projects/${id}/members`, userId!);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.exists() ? memberSnap.data() : null;
      const isEPorPM = memberData && ["EP", "PM"].includes(memberData.role);
      const hasExtendedAccess = accountingLevel === "accounting_extended";

      setHasAccess(hasAccountingAccess && (isEPorPM || hasExtendedAccess));
      if (!hasAccountingAccess || (!isEPorPM && !hasExtendedAccess)) {
        setErrorMessage("No tienes permisos para acceder a la configuración de contabilidad");
        setLoading(false);
        return;
      }

      const projectRef = doc(db, "projects", id as string);
      const projectSnap = await getDoc(projectRef);
      if (projectSnap.exists()) {
        const d = projectSnap.data();
        setProjectName(d.name);
        setDepartments(d.departments || []);
      }

      const membersRef = collection(db, `projects/${id}/members`);
      const membersSnap = await getDocs(membersRef);
      setMembers(
        membersSnap.docs.map((d) => ({
          userId: d.id,
          name: d.data().name || d.data().email,
          email: d.data().email,
          role: d.data().role,
          department: d.data().department,
          position: d.data().position,
        }))
      );

      const approvalConfigRef = doc(db, `projects/${id}/config/approvals`);
      const approvalConfigSnap = await getDoc(approvalConfigRef);
      if (approvalConfigSnap.exists()) {
        const c = approvalConfigSnap.data();
        const migrateSteps = (steps: any[]): ApprovalStep[] =>
          steps.map((s) => ({
            ...s,
            hasAmountThreshold: s.hasAmountThreshold || false,
            amountThreshold: s.amountThreshold || undefined,
            amountCondition: s.amountCondition || "above",
            amountThresholdMax: s.amountThresholdMax || undefined,
          }));
        setPoApprovals(migrateSteps(c.poApprovals || []));
        setInvoiceApprovals(migrateSteps(c.invoiceApprovals || []));
        
        // Guardar info de auditoría
        if (c.updatedAt && c.updatedBy) {
          // Buscar nombre del usuario
          let updatedByName = c.updatedByName;
          if (!updatedByName) {
            const updaterMember = membersSnap.docs.find(d => d.id === c.updatedBy);
            updatedByName = updaterMember?.data()?.name || updaterMember?.data()?.email || "Usuario desconocido";
          }
          setAuditLog(prev => ({
            ...prev,
            approvals: { updatedAt: c.updatedAt, updatedBy: c.updatedBy, updatedByName }
          }));
        }
      } else {
        setPoApprovals([
          { id: "default-po-1", order: 1, approverType: "role", roles: ["PM", "EP"], requireAll: false, hasAmountThreshold: false },
        ]);
        setInvoiceApprovals([
          { id: "default-inv-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false, hasAmountThreshold: false },
        ]);
      }

      // Cargar configuración de permisos
      const permissionsConfigRef = doc(db, `projects/${id}/config/permissions`);
      const permissionsConfigSnap = await getDoc(permissionsConfigRef);
      if (permissionsConfigSnap.exists()) {
        const permData = permissionsConfigSnap.data();
        setPermissionSettings(permData.settings || {});
        
        // Guardar info de auditoría
        if (permData.updatedAt && permData.updatedBy) {
          let updatedByName = permData.updatedByName;
          if (!updatedByName) {
            const updaterMember = membersSnap.docs.find(d => d.id === permData.updatedBy);
            updatedByName = updaterMember?.data()?.name || updaterMember?.data()?.email || "Usuario desconocido";
          }
          setAuditLog(prev => ({
            ...prev,
            permissions: { updatedAt: permData.updatedAt, updatedBy: permData.updatedBy, updatedByName }
          }));
        }
      } else {
        // Inicializar con valores por defecto
        const defaultSettings: PermissionSettings = {};
        PERMISSION_CONFIGS.forEach((config) => {
          defaultSettings[config.id] = {
            roles: [...config.defaultRoles],
            users: [],
          };
        });
        setPermissionSettings(defaultSettings);
      }

      setLoading(false);
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  const addApprovalStep = (type: "po" | "invoice", withThreshold: boolean = false) => {
    const current = type === "po" ? poApprovals : invoiceApprovals;
    const newStep: ApprovalStep = {
      id: `step-${Date.now()}`,
      order: current.length + 1,
      approverType: "fixed",
      approvers: [],
      requireAll: false,
      hasAmountThreshold: withThreshold,
      amountThreshold: withThreshold ? 5000 : undefined,
      amountCondition: "above",
    };
    if (type === "po") setPoApprovals([...current, newStep]);
    else setInvoiceApprovals([...current, newStep]);
    setExpandedSteps(new Set([...expandedSteps, newStep.id]));
  };

  const removeApprovalStep = (type: "po" | "invoice", stepId: string) => {
    const current = type === "po" ? poApprovals : invoiceApprovals;
    const reordered = current.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order: i + 1 }));
    if (type === "po") setPoApprovals(reordered);
    else setInvoiceApprovals(reordered);
  };

  const moveStep = (type: "po" | "invoice", stepId: string, direction: "up" | "down") => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const index = current.findIndex((s) => s.id === stepId);
    if ((direction === "up" && index <= 0) || (direction === "down" && index >= current.length - 1)) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [current[index], current[swapIndex]] = [current[swapIndex], current[index]];
    const reordered = current.map((s, i) => ({ ...s, order: i + 1 }));
    if (type === "po") setPoApprovals(reordered);
    else setInvoiceApprovals(reordered);
  };

  const updateStep = (type: "po" | "invoice", stepId: string, field: keyof ApprovalStep, value: any) => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const idx = current.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    current[idx] = { ...current[idx], [field]: value };
    if (field === "approverType") {
      current[idx].approvers = [];
      current[idx].roles = [];
      current[idx].department = undefined;
    }
    if (field === "hasAmountThreshold" && value === false) {
      current[idx].amountThreshold = undefined;
      current[idx].amountCondition = "above";
      current[idx].amountThresholdMax = undefined;
    }
    if (field === "amountCondition" && value !== "between") {
      current[idx].amountThresholdMax = undefined;
    }
    if (type === "po") setPoApprovals(current);
    else setInvoiceApprovals(current);
  };

  const toggleApprover = (type: "po" | "invoice", stepId: string, approverId: string) => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const idx = current.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    const approvers = current[idx].approvers || [];
    current[idx] = {
      ...current[idx],
      approvers: approvers.includes(approverId)
        ? approvers.filter((i) => i !== approverId)
        : [...approvers, approverId],
    };
    if (type === "po") setPoApprovals(current);
    else setInvoiceApprovals(current);
  };

  const toggleRole = (type: "po" | "invoice", stepId: string, role: string) => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const idx = current.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    const roles = current[idx].roles || [];
    current[idx] = {
      ...current[idx],
      roles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role],
    };
    if (type === "po") setPoApprovals(current);
    else setInvoiceApprovals(current);
  };

  const cleanApprovalSteps = (steps: ApprovalStep[]): any[] =>
    steps.map((s) => {
      const clean: any = {
        id: s.id,
        order: s.order,
        approverType: s.approverType,
        requireAll: s.requireAll,
        hasAmountThreshold: s.hasAmountThreshold,
      };
      if (s.approverType === "fixed") clean.approvers = s.approvers || [];
      if (s.approverType === "role") clean.roles = s.roles || [];
      if ((s.approverType === "hod" || s.approverType === "coordinator") && s.department)
        clean.department = s.department;
      if (s.hasAmountThreshold) {
        clean.amountThreshold = s.amountThreshold;
        clean.amountCondition = s.amountCondition;
        if (s.amountCondition === "between") clean.amountThresholdMax = s.amountThresholdMax;
      }
      return clean;
    });

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const currentUserName = members.find(m => m.userId === userId)?.name || "Usuario";
      const now = Timestamp.now();
      
      // Guardar aprobaciones
      await setDoc(doc(db, `projects/${id}/config/approvals`), {
        poApprovals: cleanApprovalSteps(poApprovals),
        invoiceApprovals: cleanApprovalSteps(invoiceApprovals),
        updatedAt: now,
        updatedBy: userId,
        updatedByName: currentUserName,
      });
      
      // Guardar permisos
      await setDoc(doc(db, `projects/${id}/config/permissions`), {
        settings: permissionSettings,
        updatedAt: now,
        updatedBy: userId,
        updatedByName: currentUserName,
      });
      
      // Actualizar auditoría local
      setAuditLog({
        approvals: { updatedAt: now, updatedBy: userId!, updatedByName: currentUserName },
        permissions: { updatedAt: now, updatedBy: userId!, updatedByName: currentUserName },
      });
      
      setSuccessMessage("Configuración guardada");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e: any) {
      setErrorMessage(`Error: ${e.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  const getMembersByRole = (role: string) => members.filter((m) => m.role === role);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const formatRelativeDate = (timestamp: any): string => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "hace un momento";
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays === 1) return "ayer";
    if (diffDays < 7) return `hace ${diffDays} días`;
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  const getStepSummary = (step: ApprovalStep): string => {
    let base = "";
    if (step.approverType === "role" && step.roles?.length) base = step.roles.join(", ");
    else if (step.approverType === "fixed" && step.approvers?.length)
      base = `${step.approvers.length} usuario${step.approvers.length > 1 ? "s" : ""}`;
    else if (step.approverType === "hod") base = step.department ? `HOD de ${step.department}` : "HOD del solicitante";
    else if (step.approverType === "coordinator")
      base = step.department ? `Coord. de ${step.department}` : "Coord. del solicitante";
    else base = "Sin configurar";

    if (step.hasAmountThreshold && step.amountThreshold) {
      if (step.amountCondition === "above") return `${base} · >${formatCurrency(step.amountThreshold)}€`;
      if (step.amountCondition === "below") return `${base} · <${formatCurrency(step.amountThreshold)}€`;
      if (step.amountCondition === "between" && step.amountThresholdMax)
        return `${base} · ${formatCurrency(step.amountThreshold)}-${formatCurrency(step.amountThresholdMax)}€`;
    }
    return base;
  };

  const getThresholdBadge = (step: ApprovalStep) => {
    if (!step.hasAmountThreshold || !step.amountThreshold) return null;
    
    let text = "";
    if (step.amountCondition === "above") text = `> ${formatCurrency(step.amountThreshold)} €`;
    else if (step.amountCondition === "below") text = `< ${formatCurrency(step.amountThreshold)} €`;
    else if (step.amountCondition === "between" && step.amountThresholdMax)
      text = `${formatCurrency(step.amountThreshold)} - ${formatCurrency(step.amountThresholdMax)} €`;
    
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-medium">
        <DollarSign size={10} />
        {text}
      </span>
    );
  };

  const renderApprovalStep = (step: ApprovalStep, type: "po" | "invoice", index: number) => {
    const currentSteps = type === "po" ? poApprovals : invoiceApprovals;
    const isExpanded = expandedSteps.has(step.id);
    const Icon = APPROVER_TYPE_ICONS[step.approverType] || Users;

    return (
      <div
        key={step.id}
        className={`border rounded-2xl overflow-hidden transition-all ${
          isExpanded ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        {/* Header colapsado */}
        <div
          className="flex items-center gap-3 px-5 py-4 cursor-pointer"
          onClick={() => toggleExpanded(step.id)}
        >
          <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>

          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            step.hasAmountThreshold ? "bg-amber-500 text-white" : "bg-slate-900 text-white"
          }`}>
            {step.order}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon size={14} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-900">
                {APPROVER_TYPE_LABELS[step.approverType]}
              </span>
              {getThresholdBadge(step)}
              <span className="text-slate-300">•</span>
              <span className="text-sm text-slate-500 truncate">{getStepSummary(step)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => moveStep(type, step.id, "up")}
              disabled={index === 0}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={() => moveStep(type, step.id, "down")}
              disabled={index === currentSteps.length - 1}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={() => removeApprovalStep(type, step.id)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Contenido expandido */}
        {isExpanded && (
          <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-5">
            {/* Umbral por importe */}
            <div className={`p-4 rounded-xl border-2 transition-all ${
              step.hasAmountThreshold ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
            }`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.hasAmountThreshold}
                  onChange={(e) => updateStep(type, step.id, "hasAmountThreshold", e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className={step.hasAmountThreshold ? "text-amber-600" : "text-slate-400"} />
                    <span className={`text-sm font-medium ${step.hasAmountThreshold ? "text-amber-800" : "text-slate-700"}`}>
                      Activar solo por importe
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Este nivel solo se activará cuando el documento cumpla la condición de importe
                  </p>
                </div>
              </label>

              {step.hasAmountThreshold && (
                <div className="mt-4 space-y-4 pl-7">
                  {/* Condición */}
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Condición
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.entries(AMOUNT_CONDITIONS) as [string, { label: string; description: string }][]).map(
                        ([key, { label }]) => (
                          <button
                            key={key}
                            onClick={() => updateStep(type, step.id, "amountCondition", key)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                              step.amountCondition === key
                                ? "border-amber-500 bg-amber-100 text-amber-800"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Importe */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                        {step.amountCondition === "between" ? "Importe mínimo" : "Importe"}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={step.amountThreshold || ""}
                          onChange={(e) => updateStep(type, step.id, "amountThreshold", parseFloat(e.target.value) || 0)}
                          placeholder="5000"
                          className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white text-sm"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                      </div>
                    </div>

                    {step.amountCondition === "between" && (
                      <div>
                        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                          Importe máximo
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={step.amountThresholdMax || ""}
                            onChange={(e) => updateStep(type, step.id, "amountThresholdMax", parseFloat(e.target.value) || 0)}
                            placeholder="10000"
                            className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white text-sm"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Presets */}
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Importes predefinidos
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_THRESHOLDS.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => updateStep(type, step.id, "amountThreshold", amount)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            step.amountThreshold === amount
                              ? "bg-amber-500 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {formatCurrency(amount)} €
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="p-3 bg-amber-100 rounded-lg border border-amber-200">
                    <div className="flex items-start gap-2">
                      <Zap size={14} className="text-amber-600 mt-0.5" />
                      <p className="text-xs text-amber-800">
                        {step.amountCondition === "above" && step.amountThreshold && (
                          <>Este nivel se activará para {type === "po" ? "POs" : "facturas"} con importe <strong>superior a {formatCurrency(step.amountThreshold)} €</strong></>
                        )}
                        {step.amountCondition === "below" && step.amountThreshold && (
                          <>Este nivel se activará para {type === "po" ? "POs" : "facturas"} con importe <strong>inferior a {formatCurrency(step.amountThreshold)} €</strong></>
                        )}
                        {step.amountCondition === "between" && step.amountThreshold && step.amountThresholdMax && (
                          <>Este nivel se activará para {type === "po" ? "POs" : "facturas"} con importe <strong>entre {formatCurrency(step.amountThreshold)} € y {formatCurrency(step.amountThresholdMax)} €</strong></>
                        )}
                        {!step.amountThreshold && "Configura un importe para activar este nivel"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tipo de aprobador */}
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                Tipo de aprobador
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(["fixed", "role", "hod", "coordinator"] as const).map((t) => {
                  const TIcon = APPROVER_TYPE_ICONS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => updateStep(type, step.id, "approverType", t)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                        step.approverType === t
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <TIcon
                        size={16}
                        className={step.approverType === t ? "text-slate-900" : "text-slate-400"}
                      />
                      <span
                        className={`text-sm ${
                          step.approverType === t ? "font-medium text-slate-900" : "text-slate-600"
                        }`}
                      >
                        {APPROVER_TYPE_LABELS[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Por rol */}
            {step.approverType === "role" && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Roles que pueden aprobar
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PROJECT_ROLES.map((role) => {
                    const count = getMembersByRole(role).length;
                    return (
                      <label
                        key={role}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          step.roles?.includes(role)
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={step.roles?.includes(role) || false}
                          onChange={() => toggleRole(type, step.id, role)}
                          className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{role}</p>
                          <p className="text-xs text-slate-500">
                            {count} usuario{count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {step.roles && step.roles.length > 0 && (
                  <div className="mt-3 bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-2">Usuarios que podrán aprobar:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.roles.flatMap((r) =>
                        getMembersByRole(r).map((m) => (
                          <span
                            key={m.userId}
                            className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-lg"
                          >
                            {m.name} ({r})
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Usuarios específicos */}
            {step.approverType === "fixed" && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Seleccionar aprobadores
                </label>
                <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1 bg-slate-50">
                  {members.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No hay miembros</p>
                  ) : (
                    members.map((m) => (
                      <label
                        key={m.userId}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                          step.approvers?.includes(m.userId)
                            ? "bg-white border border-slate-200"
                            : "hover:bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={step.approvers?.includes(m.userId) || false}
                          onChange={() => toggleApprover(type, step.id, m.userId)}
                          className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {m.role || m.position || "Sin rol"}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* HOD / Coordinator */}
            {(step.approverType === "hod" || step.approverType === "coordinator") && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Departamento
                </label>
                <select
                  value={step.department || ""}
                  onChange={(e) => updateStep(type, step.id, "department", e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-sm"
                >
                  <option value="">Departamento del solicitante</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  {step.department
                    ? `El ${step.approverType === "hod" ? "HOD" : "Coordinator"} de "${step.department}" aprobará`
                    : `Se asignará automáticamente según el departamento del solicitante`}
                </p>
              </div>
            )}

            {/* Require All */}
            {(step.approverType === "fixed" || step.approverType === "role") && (
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.requireAll}
                  onChange={(e) => updateStep(type, step.id, "requireAll", e.target.checked)}
                  className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Requiere aprobación de todos</p>
                  <p className="text-xs text-slate-500">
                    {step.requireAll
                      ? "Todos deben aprobar para pasar al siguiente nivel"
                      : "Con una aprobación es suficiente"}
                  </p>
                </div>
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render de la sección de aprobaciones
  const renderApprovalsSection = () => (
    <div className="space-y-6">
      {/* Info box */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex gap-3">
          <Info size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-700 mb-1">Cómo funcionan las aprobaciones</p>
            <p className="text-slate-500">
              Las aprobaciones se procesan en orden secuencial. Puedes configurar niveles que solo se activen a partir de cierto importe 
              (ej: POs mayores de 5.000€ requieren aprobación del EP). Si no hay niveles configurados, los documentos se aprueban automáticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs PO/Invoice */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("po")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "po"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText size={16} />
          Órdenes de compra
          {poApprovals.length > 0 && (
            <span className="px-2 py-0.5 rounded-lg text-xs bg-slate-100 text-slate-600">
              {poApprovals.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("invoice")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "invoice"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Receipt size={16} />
          Facturas
          {invoiceApprovals.length > 0 && (
            <span className="px-2 py-0.5 rounded-lg text-xs bg-slate-100 text-slate-600">
              {invoiceApprovals.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-3">
        {activeTab === "po" ? (
          <>
            {poApprovals.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                <AlertCircle size={28} className="text-amber-600 mx-auto mb-3" />
                <p className="text-amber-800 font-medium">Sin niveles de aprobación</p>
                <p className="text-amber-700 text-sm mt-1">Las POs se aprobarán automáticamente</p>
              </div>
            ) : (
              poApprovals.map((step, i) => renderApprovalStep(step, "po", i))
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => addApprovalStep("po", false)}
                className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-slate-300 rounded-2xl hover:border-slate-400 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors text-sm"
              >
                <Plus size={18} />
                Añadir nivel de aprobación
              </button>
              <button
                onClick={() => addApprovalStep("po", true)}
                className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-amber-300 rounded-2xl hover:border-amber-400 hover:bg-amber-50 text-amber-600 hover:text-amber-700 transition-colors text-sm"
              >
                <DollarSign size={18} />
                Añadir nivel por importe
              </button>
            </div>
          </>
        ) : (
          <>
            {invoiceApprovals.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                <AlertCircle size={28} className="text-amber-600 mx-auto mb-3" />
                <p className="text-amber-800 font-medium">Sin niveles de aprobación</p>
                <p className="text-amber-700 text-sm mt-1">Las facturas se aprobarán automáticamente</p>
              </div>
            ) : (
              invoiceApprovals.map((step, i) => renderApprovalStep(step, "invoice", i))
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => addApprovalStep("invoice", false)}
                className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-slate-300 rounded-2xl hover:border-slate-400 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors text-sm"
              >
                <Plus size={18} />
                Añadir nivel de aprobación
              </button>
              <button
                onClick={() => addApprovalStep("invoice", true)}
                className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-amber-300 rounded-2xl hover:border-amber-400 hover:bg-amber-50 text-amber-600 hover:text-amber-700 transition-colors text-sm"
              >
                <DollarSign size={18} />
                Añadir nivel por importe
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Funciones para permisos
  const togglePermissionRole = (permissionId: string, role: string) => {
    setPermissionSettings((prev) => {
      const current = prev[permissionId] || { roles: [], users: [] };
      const roles = current.roles.includes(role)
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role];
      return { ...prev, [permissionId]: { ...current, roles } };
    });
  };

  const togglePermissionUser = (permissionId: string, usrId: string) => {
    setPermissionSettings((prev) => {
      const current = prev[permissionId] || { roles: [], users: [] };
      const users = current.users.includes(usrId)
        ? current.users.filter((u) => u !== usrId)
        : [...current.users, usrId];
      return { ...prev, [permissionId]: { ...current, users } };
    });
  };

  const resetPermissionToDefault = (permissionId: string) => {
    const config = PERMISSION_CONFIGS.find((c) => c.id === permissionId);
    if (!config) return;
    setPermissionSettings((prev) => ({
      ...prev,
      [permissionId]: { roles: [...config.defaultRoles], users: [] },
    }));
  };

  const toggleExpandedPermission = (permissionId: string) => {
    setExpandedPermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) newSet.delete(permissionId);
      else newSet.add(permissionId);
      return newSet;
    });
  };

  const getPermissionSummary = (permissionId: string): string => {
    const setting = permissionSettings[permissionId];
    if (!setting) return "Sin configurar";
    
    const parts: string[] = [];
    if (setting.roles.length > 0) {
      parts.push(setting.roles.join(", "));
    }
    if (setting.users.length > 0) {
      parts.push(`+${setting.users.length} usuario${setting.users.length > 1 ? "s" : ""}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Ninguno";
  };

  // Render de la sección de permisos
  const renderPermissionsSection = () => {
    const poPermissions = PERMISSION_CONFIGS.filter((p) => p.category === "po");
    const invoicePermissions = PERMISSION_CONFIGS.filter((p) => p.category === "invoice");
    const generalPermissions = PERMISSION_CONFIGS.filter((p) => p.category === "general");

    const renderPermissionItem = (config: PermissionConfig) => {
      const setting = permissionSettings[config.id] || { roles: [], users: [] };
      const isExpanded = expandedPermissions.has(config.id);
      const isDefault = JSON.stringify(setting.roles.sort()) === JSON.stringify([...config.defaultRoles].sort()) && setting.users.length === 0;

      return (
        <div
          key={config.id}
          className={`border rounded-xl overflow-hidden transition-all ${
            isExpanded ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
            onClick={() => toggleExpandedPermission(config.id)}
          >
            <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{config.label}</span>
                {isDefault && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Por defecto</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{getPermissionSummary(config.id)}</p>
            </div>
          </div>

          {isExpanded && (
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-4">
              <p className="text-xs text-slate-500">{config.description}</p>

              {/* Roles */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Roles con este permiso
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_ROLES.map((role) => {
                    const isSelected = setting.roles.includes(role);
                    const count = getMembersByRole(role).length;
                    return (
                      <button
                        key={role}
                        onClick={() => togglePermissionRole(config.id, role)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          isSelected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {role}
                        <span className={`ml-1.5 text-xs ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Usuarios adicionales */}
              {config.allowCustomUsers && (
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Usuarios adicionales (sin el rol requerido)
                  </label>
                  <div className="border border-slate-200 rounded-xl p-2 max-h-36 overflow-y-auto space-y-1 bg-slate-50">
                    {members
                      .filter((m) => !setting.roles.includes(m.role || ""))
                      .map((m) => (
                        <label
                          key={m.userId}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                            setting.users.includes(m.userId) ? "bg-white border border-slate-200" : "hover:bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={setting.users.includes(m.userId)}
                            onChange={() => togglePermissionUser(config.id, m.userId)}
                            className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                            <p className="text-xs text-slate-500">{m.role || "Sin rol"}</p>
                          </div>
                        </label>
                      ))}
                    {members.filter((m) => !setting.roles.includes(m.role || "")).length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-3">
                        Todos los usuarios ya tienen permiso por su rol
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Botón restaurar */}
              {!isDefault && (
                <button
                  onClick={() => resetPermissionToDefault(config.id)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Restaurar valores por defecto
                </button>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-8">
        {/* Info */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex gap-3">
            <Info size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-700 mb-1">Permisos por acción</p>
              <p className="text-slate-500">
                Configura qué roles o usuarios pueden realizar cada acción. Los usuarios con rol EP o PM siempre tienen acceso completo.
              </p>
            </div>
          </div>
        </div>

        {/* PO Permissions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText size={18} className="text-slate-600" />
            <h3 className="font-semibold text-slate-900">Órdenes de compra</h3>
          </div>
          <div className="space-y-2">
            {poPermissions.map(renderPermissionItem)}
          </div>
        </div>

        {/* Invoice Permissions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Receipt size={18} className="text-slate-600" />
            <h3 className="font-semibold text-slate-900">Facturas</h3>
          </div>
          <div className="space-y-2">
            {invoicePermissions.map(renderPermissionItem)}
          </div>
        </div>

        {/* General Permissions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Settings size={18} className="text-slate-600" />
            <h3 className="font-semibold text-slate-900">General</h3>
          </div>
          <div className="space-y-2">
            {generalPermissions.map(renderPermissionItem)}
          </div>
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );

  if (errorMessage && !hasAccess)
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-600" />
          </div>
          <p className="text-slate-700 mb-6">{errorMessage}</p>
          <Link
            href={`/project/${id}/accounting`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al Panel
          </Link>
        </div>
      </div>
    );

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-6">
          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
            </div>

            <button
              onClick={handleSave}
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
                  <Save size={16} />
                  Guardar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-8">
        {/* Mensajes */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <span className="text-sm text-emerald-700 font-medium">{successMessage}</span>
          </div>
        )}

        {errorMessage && hasAccess && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle size={18} className="text-red-600" />
            <span className="text-sm text-red-700">{errorMessage}</span>
            <button onClick={() => setErrorMessage("")} className="ml-auto text-red-400 hover:text-red-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Layout con sidebar de secciones */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar de secciones */}
          <div className="lg:w-64 flex-shrink-0">
            <nav className="flex lg:flex-col gap-2 lg:space-y-1 lg:sticky lg:top-24 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
              {CONFIG_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isActive ? "text-white" : ""}`}>{section.label}</p>
                    </div>
                    {!isActive && (
                      <ChevronRight size={16} className="text-slate-300 hidden lg:block" />
                    )}
                  </button>
                );
              })}
            </nav>
            
            {/* Auditoría - Solo visible en desktop */}
            {(auditLog.approvals || auditLog.permissions) && (
              <div className="hidden lg:block mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-slate-400" />
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Últimos cambios</p>
                </div>
                <div className="space-y-3">
                  {auditLog.approvals && (
                    <div className="text-xs">
                      <p className="text-slate-600 font-medium">Aprobaciones</p>
                      <p className="text-slate-500">
                        {auditLog.approvals.updatedByName} · {formatRelativeDate(auditLog.approvals.updatedAt)}
                      </p>
                    </div>
                  )}
                  {auditLog.permissions && (
                    <div className="text-xs">
                      <p className="text-slate-600 font-medium">Permisos</p>
                      <p className="text-slate-500">
                        {auditLog.permissions.updatedByName} · {formatRelativeDate(auditLog.permissions.updatedAt)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">
            {activeSection === "approvals" && renderApprovalsSection()}
            {activeSection === "permissions" && renderPermissionsSection()}
          </div>
        </div>
      </main>
    </div>
  );
}

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
  // Nuevos campos para umbral por importe
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

export default function ConfigApprovals() {
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
  const [activeTab, setActiveTab] = useState<"po" | "invoice">("po");
  const [poApprovals, setPoApprovals] = useState<ApprovalStep[]>([]);
  const [invoiceApprovals, setInvoiceApprovals] = useState<ApprovalStep[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

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
        setErrorMessage("No tienes permisos para acceder a la configuración de aprobaciones");
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
        // Asegurar que los pasos antiguos tengan los nuevos campos
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
      } else {
        setPoApprovals([
          { id: "default-po-1", order: 1, approverType: "role", roles: ["PM", "EP"], requireAll: false, hasAmountThreshold: false },
        ]);
        setInvoiceApprovals([
          { id: "default-inv-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false, hasAmountThreshold: false },
        ]);
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
      await setDoc(doc(db, `projects/${id}/config/approvals`), {
        poApprovals: cleanApprovalSteps(poApprovals),
        invoiceApprovals: cleanApprovalSteps(invoiceApprovals),
        updatedAt: Timestamp.now(),
        updatedBy: userId,
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
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
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
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center">
                <Settings size={24} className="text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Configuración de aprobaciones</h1>
                <p className="text-slate-500 text-sm mt-0.5">Define los flujos de aprobación para POs y facturas</p>
              </div>
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

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
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

        {/* Info box */}
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
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

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-200">
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
              
              {/* Botones para añadir */}
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
              
              {/* Botones para añadir */}
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

        {/* Ejemplo visual */}
        <div className="mt-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-2xl">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Info size={16} />
            Ejemplo de configuración por importes
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">1</div>
              <div className="flex-1">
                <p className="text-sm text-slate-700"><strong>PM o Controller</strong> - Todas las POs</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-amber-200">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">2</div>
              <div className="flex-1">
                <p className="text-sm text-slate-700"><strong>EP</strong> - Solo POs <span className="text-amber-600 font-medium">&gt; 5.000 €</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-amber-200">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">3</div>
              <div className="flex-1">
                <p className="text-sm text-slate-700"><strong>Director financiero</strong> - Solo POs <span className="text-amber-600 font-medium">&gt; 25.000 €</span></p>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Con esta configuración, una PO de 3.000€ solo requiere aprobación del PM, mientras que una de 30.000€ necesita PM + EP + Director financiero.
          </p>
        </div>
      </main>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Settings,
  Save,
  AlertCircle,
  CheckCircle2,
  Folder,
  FileText,
  Receipt,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Info,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Users,
  UserCheck,
  Briefcase,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

interface Member { userId: string; name: string; email: string; role?: string; department?: string; position?: string; }
interface ApprovalStep { id: string; order: number; approverType: "fixed" | "hod" | "coordinator" | "role"; approvers?: string[]; roles?: string[]; department?: string; requireAll: boolean; }

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const APPROVER_TYPE_LABELS: Record<string, string> = { fixed: "Usuarios específicos", role: "Por rol", hod: "Head of Department", coordinator: "Coordinator" };
const APPROVER_TYPE_ICONS: Record<string, any> = { fixed: Users, role: Shield, hod: Briefcase, coordinator: UserCheck };

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

  useEffect(() => { const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/"); else setUserId(u.uid); }); return () => unsub(); }, [router]);
  useEffect(() => { if (userId && id) loadData(); }, [userId, id]);

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
      if (!userProjectSnap.exists()) { setErrorMessage("No tienes acceso a este proyecto"); setLoading(false); return; }

      const userProjectData = userProjectSnap.data();
      const hasAccountingAccess = userProjectData.permissions?.accounting || false;
      const accountingLevel = userProjectData.accountingAccessLevel;

      const memberRef = doc(db, `projects/${id}/members`, userId!);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.exists() ? memberSnap.data() : null;
      const isEPorPM = memberData && ["EP", "PM"].includes(memberData.role);
      const hasExtendedAccess = accountingLevel === "accounting_extended";

      setHasAccess(hasAccountingAccess && (isEPorPM || hasExtendedAccess));
      if (!hasAccountingAccess || (!isEPorPM && !hasExtendedAccess)) { setErrorMessage("No tienes permisos para acceder a la configuración de aprobaciones"); setLoading(false); return; }

      const projectRef = doc(db, "projects", id as string);
      const projectSnap = await getDoc(projectRef);
      if (projectSnap.exists()) { const d = projectSnap.data(); setProjectName(d.name); setDepartments(d.departments || []); }

      const membersRef = collection(db, `projects/${id}/members`);
      const membersSnap = await getDocs(membersRef);
      setMembers(membersSnap.docs.map((d) => ({ userId: d.id, name: d.data().name || d.data().email, email: d.data().email, role: d.data().role, department: d.data().department, position: d.data().position })));

      const approvalConfigRef = doc(db, `projects/${id}/config/approvals`);
      const approvalConfigSnap = await getDoc(approvalConfigRef);
      if (approvalConfigSnap.exists()) { const c = approvalConfigSnap.data(); setPoApprovals(c.poApprovals || []); setInvoiceApprovals(c.invoiceApprovals || []); }
      else { setPoApprovals([{ id: "default-po-1", order: 1, approverType: "role", roles: ["PM", "EP"], requireAll: false }]); setInvoiceApprovals([{ id: "default-inv-1", order: 1, approverType: "role", roles: ["Controller", "PM", "EP"], requireAll: false }]); }

      setLoading(false);
    } catch (error: any) { setErrorMessage(`Error: ${error.message}`); setLoading(false); }
  };

  const addApprovalStep = (type: "po" | "invoice") => {
    const current = type === "po" ? poApprovals : invoiceApprovals;
    const newStep: ApprovalStep = { id: `step-${Date.now()}`, order: current.length + 1, approverType: "fixed", approvers: [], requireAll: false };
    if (type === "po") setPoApprovals([...current, newStep]); else setInvoiceApprovals([...current, newStep]);
    setExpandedSteps(new Set([...expandedSteps, newStep.id]));
  };

  const removeApprovalStep = (type: "po" | "invoice", stepId: string) => {
    const current = type === "po" ? poApprovals : invoiceApprovals;
    const reordered = current.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order: i + 1 }));
    if (type === "po") setPoApprovals(reordered); else setInvoiceApprovals(reordered);
  };

  const moveStep = (type: "po" | "invoice", stepId: string, direction: "up" | "down") => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const index = current.findIndex((s) => s.id === stepId);
    if ((direction === "up" && index <= 0) || (direction === "down" && index >= current.length - 1)) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [current[index], current[swapIndex]] = [current[swapIndex], current[index]];
    const reordered = current.map((s, i) => ({ ...s, order: i + 1 }));
    if (type === "po") setPoApprovals(reordered); else setInvoiceApprovals(reordered);
  };

  const updateStep = (type: "po" | "invoice", stepId: string, field: keyof ApprovalStep, value: any) => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const idx = current.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    current[idx] = { ...current[idx], [field]: value };
    if (field === "approverType") { current[idx].approvers = []; current[idx].roles = []; current[idx].department = undefined; }
    if (type === "po") setPoApprovals(current); else setInvoiceApprovals(current);
  };

  const toggleApprover = (type: "po" | "invoice", stepId: string, approverId: string) => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const idx = current.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    const approvers = current[idx].approvers || [];
    current[idx] = { ...current[idx], approvers: approvers.includes(approverId) ? approvers.filter((i) => i !== approverId) : [...approvers, approverId] };
    if (type === "po") setPoApprovals(current); else setInvoiceApprovals(current);
  };

  const toggleRole = (type: "po" | "invoice", stepId: string, role: string) => {
    const current = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const idx = current.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    const roles = current[idx].roles || [];
    current[idx] = { ...current[idx], roles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role] };
    if (type === "po") setPoApprovals(current); else setInvoiceApprovals(current);
  };

  const cleanApprovalSteps = (steps: ApprovalStep[]): any[] => steps.map((s) => {
    const clean: any = { id: s.id, order: s.order, approverType: s.approverType, requireAll: s.requireAll };
    if (s.approverType === "fixed") clean.approvers = s.approvers || [];
    if (s.approverType === "role") clean.roles = s.roles || [];
    if ((s.approverType === "hod" || s.approverType === "coordinator") && s.department) clean.department = s.department;
    return clean;
  });

  const handleSave = async () => {
    setSaving(true); setErrorMessage(""); setSuccessMessage("");
    try {
      await setDoc(doc(db, `projects/${id}/config/approvals`), { poApprovals: cleanApprovalSteps(poApprovals), invoiceApprovals: cleanApprovalSteps(invoiceApprovals), updatedAt: Timestamp.now(), updatedBy: userId });
      setSuccessMessage("Configuración guardada"); setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e: any) { setErrorMessage(`Error: ${e.message}`); setTimeout(() => setErrorMessage(""), 5000); }
    finally { setSaving(false); }
  };

  const getApproverName = (id: string) => { const m = members.find((m) => m.userId === id); return m?.name || m?.email || "Usuario"; };
  const getMembersByRole = (role: string) => members.filter((m) => m.role === role);

  const getStepSummary = (step: ApprovalStep): string => {
    if (step.approverType === "role" && step.roles?.length) return step.roles.join(", ");
    if (step.approverType === "fixed" && step.approvers?.length) return `${step.approvers.length} usuario${step.approvers.length > 1 ? "s" : ""}`;
    if (step.approverType === "hod") return step.department ? `HOD de ${step.department}` : "HOD del solicitante";
    if (step.approverType === "coordinator") return step.department ? `Coord. de ${step.department}` : "Coord. del solicitante";
    return "Sin configurar";
  };

  const renderApprovalStep = (step: ApprovalStep, type: "po" | "invoice", index: number) => {
    const currentSteps = type === "po" ? poApprovals : invoiceApprovals;
    const isExpanded = expandedSteps.has(step.id);
    const Icon = APPROVER_TYPE_ICONS[step.approverType] || Users;

    return (
      <div key={step.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
        {/* Header colapsado */}
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpanded(step.id)}>
          <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          
          <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">{step.order}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Icon size={14} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-900">{APPROVER_TYPE_LABELS[step.approverType]}</span>
              <span className="text-slate-300">•</span>
              <span className="text-sm text-slate-500 truncate">{getStepSummary(step)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => moveStep(type, step.id, "up")} disabled={index === 0} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"><ArrowUp size={14} /></button>
            <button onClick={() => moveStep(type, step.id, "down")} disabled={index === currentSteps.length - 1} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"><ArrowDown size={14} /></button>
            <button onClick={() => removeApprovalStep(type, step.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
          </div>
        </div>

        {/* Contenido expandido */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-4">
            {/* Tipo de aprobador */}
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Tipo de aprobador</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(["fixed", "role", "hod", "coordinator"] as const).map((t) => {
                  const TIcon = APPROVER_TYPE_ICONS[t];
                  return (
                    <button key={t} onClick={() => updateStep(type, step.id, "approverType", t)} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${step.approverType === t ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <TIcon size={16} className={step.approverType === t ? "text-slate-900" : "text-slate-400"} />
                      <span className={`text-sm ${step.approverType === t ? "font-medium text-slate-900" : "text-slate-600"}`}>{APPROVER_TYPE_LABELS[t]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Por rol */}
            {step.approverType === "role" && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Roles que pueden aprobar</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PROJECT_ROLES.map((role) => {
                    const count = getMembersByRole(role).length;
                    return (
                      <label key={role} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${step.roles?.includes(role) ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                        <input type="checkbox" checked={step.roles?.includes(role) || false} onChange={() => toggleRole(type, step.id, role)} className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{role}</p>
                          <p className="text-xs text-slate-500">{count} usuario{count !== 1 ? "s" : ""}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {step.roles && step.roles.length > 0 && (
                  <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-2">Usuarios que podrán aprobar:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.roles.flatMap((r) => getMembersByRole(r).map((m) => <span key={m.userId} className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-md">{m.name} ({r})</span>))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Usuarios específicos */}
            {step.approverType === "fixed" && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Seleccionar aprobadores</label>
                <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1 bg-slate-50">
                  {members.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No hay miembros</p> : members.map((m) => (
                    <label key={m.userId} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${step.approvers?.includes(m.userId) ? "bg-white border border-slate-200" : "hover:bg-white"}`}>
                      <input type="checkbox" checked={step.approvers?.includes(m.userId) || false} onChange={() => toggleApprover(type, step.id, m.userId)} className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                        <p className="text-xs text-slate-500 truncate">{m.role || m.position || "Sin rol"}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* HOD / Coordinator */}
            {(step.approverType === "hod" || step.approverType === "coordinator") && (
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Departamento</label>
                <select value={step.department || ""} onChange={(e) => updateStep(type, step.id, "department", e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 text-sm">
                  <option value="">Departamento del solicitante</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  {step.department ? `El ${step.approverType === "hod" ? "HOD" : "Coordinator"} de "${step.department}" aprobará` : `Se asignará automáticamente según el departamento del solicitante`}
                </p>
              </div>
            )}

            {/* Require All */}
            {(step.approverType === "fixed" || step.approverType === "role") && (
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input type="checkbox" checked={step.requireAll} onChange={(e) => updateStep(type, step.id, "requireAll", e.target.checked)} className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Requiere aprobación de todos</p>
                  <p className="text-xs text-slate-500">{step.requireAll ? "Todos deben aprobar para pasar al siguiente nivel" : "Con una aprobación es suficiente"}</p>
                </div>
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-600 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !hasAccess) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-md"><AlertCircle size={48} className="mx-auto text-red-500 mb-4" /><p className="text-slate-700 mb-4">{errorMessage}</p><Link href={`/project/${id}/accounting`} className="text-slate-900 hover:underline font-medium">Volver a contabilidad</Link></div></div>;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/project/${id}/accounting`} className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1">
              <Folder size={14} />{projectName}<ChevronRight size={14} /><span>Contabilidad</span>
            </Link>
            <button onClick={loadData} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><RefreshCw size={18} /></button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center"><Settings size={24} className="text-white" /></div>
            <div>
              <h1 className={`text-2xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Configuración de aprobaciones</h1>
              <p className="text-slate-400 text-sm">Define el flujo de aprobación para POs y facturas</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-4">
        <div className="max-w-5xl mx-auto">
          {successMessage && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700"><CheckCircle2 size={20} /><span className="font-medium">{successMessage}</span></div>}
          {errorMessage && hasAccess && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700"><AlertCircle size={20} /><span>{errorMessage}</span><button onClick={() => setErrorMessage("")} className="ml-auto"><X size={16} /></button></div>}

          {/* Info */}
          <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex gap-3">
              <Info size={18} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">Cómo funcionan las aprobaciones</p>
                <ul className="space-y-0.5 text-slate-500">
                  <li>• Las aprobaciones se procesan en orden (nivel 1 → nivel 2 → etc.)</li>
                  <li>• Si no hay niveles configurados, se aprueba automáticamente</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setActiveTab("po")} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === "po" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <FileText size={16} />Órdenes de compra
              {poApprovals.length > 0 && <span className={`px-2 py-0.5 rounded-md text-xs ${activeTab === "po" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"}`}>{poApprovals.length}</span>}
            </button>
            <button onClick={() => setActiveTab("invoice")} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === "invoice" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <Receipt size={16} />Facturas
              {invoiceApprovals.length > 0 && <span className={`px-2 py-0.5 rounded-md text-xs ${activeTab === "invoice" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"}`}>{invoiceApprovals.length}</span>}
            </button>
          </div>

          {/* Content */}
          <div className="space-y-3">
            {activeTab === "po" ? (
              <>
                {poApprovals.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <AlertCircle size={28} className="text-amber-600 mx-auto mb-2" />
                    <p className="text-amber-800 font-medium">Sin niveles de aprobación</p>
                    <p className="text-amber-700 text-sm">Las POs se aprobarán automáticamente</p>
                  </div>
                ) : poApprovals.map((step, i) => renderApprovalStep(step, "po", i))}
                <button onClick={() => addApprovalStep("po")} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-slate-400 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors">
                  <Plus size={18} />Añadir nivel de aprobación
                </button>
              </>
            ) : (
              <>
                {invoiceApprovals.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <AlertCircle size={28} className="text-amber-600 mx-auto mb-2" />
                    <p className="text-amber-800 font-medium">Sin niveles de aprobación</p>
                    <p className="text-amber-700 text-sm">Las facturas se aprobarán automáticamente</p>
                  </div>
                ) : invoiceApprovals.map((step, i) => renderApprovalStep(step, "invoice", i))}
                <button onClick={() => addApprovalStep("invoice")} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-slate-400 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors">
                  <Plus size={18} />Añadir nivel de aprobación
                </button>
              </>
            )}
          </div>

          {/* Save */}
          <div className="mt-8 flex justify-end">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
              {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Guardando...</> : <><Save size={18} />Guardar configuración</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

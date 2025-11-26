"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
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
  Shield,
  UserCheck,
  Info,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
  approvers?: string[]; // userIds for fixed approvers
  roles?: string[]; // roles for role-based approval
  department?: string; // for HOD/Coordinator
  requireAll: boolean; // Si se requieren todos los aprobadores o solo uno
  minAmount?: number; // Monto mínimo para este nivel (opcional)
  maxAmount?: number; // Monto máximo para este nivel (opcional)
}

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];

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

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
        console.log("✅ Usuario autenticado:", user.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Load data
  useEffect(() => {
    if (!userId || !id) return;
    loadData();
  }, [userId, id]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      console.log("🔄 Cargando configuración de aprobaciones...");

      // Check permissions - must have accounting access
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

      // Also check if user is EP or PM
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

      // Load project
      const projectRef = doc(db, "projects", id as string);
      const projectSnap = await getDoc(projectRef);

      if (projectSnap.exists()) {
        const projectData = projectSnap.data();
        setProjectName(projectData.name);
        setDepartments(projectData.departments || []);
        console.log("✅ Proyecto cargado:", projectData.name);
      }

      // Load members
      const membersRef = collection(db, `projects/${id}/members`);
      const membersSnap = await getDocs(membersRef);
      const membersData: Member[] = membersSnap.docs.map((doc) => ({
        userId: doc.id,
        name: doc.data().name || doc.data().email,
        email: doc.data().email,
        role: doc.data().role,
        department: doc.data().department,
        position: doc.data().position,
      }));
      setMembers(membersData);
      console.log(`✅ ${membersData.length} miembros cargados`);

      // Load approval configurations
      const approvalConfigRef = doc(db, `projects/${id}/config/approvals`);
      const approvalConfigSnap = await getDoc(approvalConfigRef);

      if (approvalConfigSnap.exists()) {
        const config = approvalConfigSnap.data();
        setPoApprovals(config.poApprovals || []);
        setInvoiceApprovals(config.invoiceApprovals || []);
        console.log("✅ Configuración de aprobaciones cargada");
      } else {
        console.log("ℹ️ No hay configuración de aprobaciones, usando valores por defecto");
        // Crear configuración por defecto
        const defaultPOApprovals: ApprovalStep[] = [
          {
            id: "default-po-1",
            order: 1,
            approverType: "role",
            roles: ["PM", "EP"],
            requireAll: false,
          },
        ];
        const defaultInvoiceApprovals: ApprovalStep[] = [
          {
            id: "default-inv-1",
            order: 1,
            approverType: "role",
            roles: ["Controller", "PM", "EP"],
            requireAll: false,
          },
        ];
        setPoApprovals(defaultPOApprovals);
        setInvoiceApprovals(defaultInvoiceApprovals);
      }

      setLoading(false);
    } catch (error: any) {
      console.error("❌ Error cargando datos:", error);
      setErrorMessage(`Error al cargar los datos: ${error.message}`);
      setLoading(false);
    }
  };

  const addApprovalStep = (type: "po" | "invoice") => {
    const currentSteps = type === "po" ? poApprovals : invoiceApprovals;
    const newStep: ApprovalStep = {
      id: `step-${Date.now()}`,
      order: currentSteps.length + 1,
      approverType: "fixed",
      approvers: [],
      requireAll: false,
    };

    if (type === "po") {
      setPoApprovals([...currentSteps, newStep]);
    } else {
      setInvoiceApprovals([...currentSteps, newStep]);
    }
  };

  const removeApprovalStep = (type: "po" | "invoice", stepId: string) => {
    const currentSteps = type === "po" ? poApprovals : invoiceApprovals;
    const filtered = currentSteps.filter((s) => s.id !== stepId);
    // Reorder
    const reordered = filtered.map((step, index) => ({
      ...step,
      order: index + 1,
    }));

    if (type === "po") {
      setPoApprovals(reordered);
    } else {
      setInvoiceApprovals(reordered);
    }
  };

  const moveStepUp = (type: "po" | "invoice", stepId: string) => {
    const currentSteps = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const index = currentSteps.findIndex((s) => s.id === stepId);
    
    if (index <= 0) return;

    [currentSteps[index - 1], currentSteps[index]] = [
      currentSteps[index],
      currentSteps[index - 1],
    ];

    // Reorder
    const reordered = currentSteps.map((step, idx) => ({
      ...step,
      order: idx + 1,
    }));

    if (type === "po") {
      setPoApprovals(reordered);
    } else {
      setInvoiceApprovals(reordered);
    }
  };

  const moveStepDown = (type: "po" | "invoice", stepId: string) => {
    const currentSteps = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const index = currentSteps.findIndex((s) => s.id === stepId);
    
    if (index >= currentSteps.length - 1) return;

    [currentSteps[index], currentSteps[index + 1]] = [
      currentSteps[index + 1],
      currentSteps[index],
    ];

    // Reorder
    const reordered = currentSteps.map((step, idx) => ({
      ...step,
      order: idx + 1,
    }));

    if (type === "po") {
      setPoApprovals(reordered);
    } else {
      setInvoiceApprovals(reordered);
    }
  };

  const updateStep = (
    type: "po" | "invoice",
    stepId: string,
    field: keyof ApprovalStep,
    value: any
  ) => {
    const currentSteps = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const stepIndex = currentSteps.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) return;

    currentSteps[stepIndex] = {
      ...currentSteps[stepIndex],
      [field]: value,
    };

    // Reset dependent fields when approverType changes
    if (field === "approverType") {
      currentSteps[stepIndex].approvers = [];
      currentSteps[stepIndex].roles = [];
      currentSteps[stepIndex].department = undefined;
    }

    if (type === "po") {
      setPoApprovals(currentSteps);
    } else {
      setInvoiceApprovals(currentSteps);
    }
  };

  const toggleApprover = (type: "po" | "invoice", stepId: string, approverId: string) => {
    const currentSteps = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const stepIndex = currentSteps.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) return;

    const currentApprovers = currentSteps[stepIndex].approvers || [];
    const newApprovers = currentApprovers.includes(approverId)
      ? currentApprovers.filter((id) => id !== approverId)
      : [...currentApprovers, approverId];

    currentSteps[stepIndex] = {
      ...currentSteps[stepIndex],
      approvers: newApprovers,
    };

    if (type === "po") {
      setPoApprovals(currentSteps);
    } else {
      setInvoiceApprovals(currentSteps);
    }
  };

  const toggleRole = (type: "po" | "invoice", stepId: string, role: string) => {
    const currentSteps = type === "po" ? [...poApprovals] : [...invoiceApprovals];
    const stepIndex = currentSteps.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) return;

    const currentRoles = currentSteps[stepIndex].roles || [];
    const newRoles = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];

    currentSteps[stepIndex] = {
      ...currentSteps[stepIndex],
      roles: newRoles,
    };

    if (type === "po") {
      setPoApprovals(currentSteps);
    } else {
      setInvoiceApprovals(currentSteps);
    }
  };

  // Función para limpiar los datos antes de guardar (eliminar undefined)
  const cleanApprovalSteps = (steps: ApprovalStep[]): any[] => {
    return steps.map((step) => {
      const cleanStep: any = {
        id: step.id || `step-${Date.now()}`,
        order: step.order || 1,
        approverType: step.approverType || "fixed",
        requireAll: step.requireAll || false,
      };

      // Solo incluir campos que tengan valores válidos
      if (step.approverType === "fixed" && step.approvers && step.approvers.length > 0) {
        cleanStep.approvers = step.approvers;
      } else if (step.approverType === "fixed") {
        cleanStep.approvers = [];
      }

      if (step.approverType === "role" && step.roles && step.roles.length > 0) {
        cleanStep.roles = step.roles;
      } else if (step.approverType === "role") {
        cleanStep.roles = [];
      }

      if ((step.approverType === "hod" || step.approverType === "coordinator") && step.department) {
        cleanStep.department = step.department;
      }

      return cleanStep;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      console.log("💾 Guardando configuración de aprobaciones...");
      
      // Limpiar los datos antes de guardar
      const cleanedPOApprovals = cleanApprovalSteps(poApprovals);
      const cleanedInvoiceApprovals = cleanApprovalSteps(invoiceApprovals);

      console.log("📤 PO Approvals a guardar:", cleanedPOApprovals);
      console.log("📤 Invoice Approvals a guardar:", cleanedInvoiceApprovals);

      const approvalConfigRef = doc(db, `projects/${id}/config/approvals`);
      
      await setDoc(approvalConfigRef, {
        poApprovals: cleanedPOApprovals,
        invoiceApprovals: cleanedInvoiceApprovals,
        updatedAt: Timestamp.now(),
        updatedBy: userId,
      });

      console.log("✅ Configuración guardada");
      setSuccessMessage("Configuración guardada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error: any) {
      console.error("❌ Error guardando configuración:", error);
      setErrorMessage(`Error al guardar: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  const getApproverName = (approverId: string) => {
    const member = members.find((m) => m.userId === approverId);
    return member?.name || member?.email || "Usuario desconocido";
  };

  const getMembersByRole = (role: string) => {
    return members.filter((m) => m.role === role);
  };

  const renderApprovalStep = (step: ApprovalStep, type: "po" | "invoice", index: number) => {
    const currentSteps = type === "po" ? poApprovals : invoiceApprovals;

    return (
      <div key={step.id} className="border-2 border-slate-200 rounded-xl p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm">
              {step.order}
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              Nivel de aprobación {step.order}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => moveStepUp(type, step.id)}
              disabled={index === 0}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30"
              title="Subir"
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() => moveStepDown(type, step.id)}
              disabled={index === currentSteps.length - 1}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30"
              title="Bajar"
            >
              <ArrowDown size={16} />
            </button>
            <button
              onClick={() => removeApprovalStep(type, step.id)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Approver Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tipo de aprobador
            </label>
            <select
              value={step.approverType}
              onChange={(e) =>
                updateStep(type, step.id, "approverType", e.target.value as any)
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="fixed">Usuarios específicos</option>
              <option value="role">Por rol (EP, PM, Controller, PC)</option>
              <option value="hod">Head of Department (HOD)</option>
              <option value="coordinator">Coordinator del departamento</option>
            </select>
          </div>

          {/* Role-based Approvers */}
          {step.approverType === "role" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Seleccionar roles que pueden aprobar
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PROJECT_ROLES.map((role) => {
                  const membersWithRole = getMembersByRole(role);
                  return (
                    <label
                      key={role}
                      className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        step.roles?.includes(role)
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={step.roles?.includes(role) || false}
                        onChange={() => toggleRole(type, step.id, role)}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{role}</p>
                        <p className="text-xs text-slate-500">
                          {membersWithRole.length} usuario{membersWithRole.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Show members with selected roles */}
              {step.roles && step.roles.length > 0 && (
                <div className="mt-3 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-xs font-medium text-slate-700 mb-2">
                    Usuarios que podrán aprobar:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {step.roles.flatMap((role) =>
                      getMembersByRole(role).map((member) => (
                        <span
                          key={member.userId}
                          className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium"
                        >
                          {member.name} ({role})
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Require All */}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.requireAll}
                  onChange={(e) =>
                    updateStep(type, step.id, "requireAll", e.target.checked)
                  }
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700">
                  Requiere aprobación de todos los roles seleccionados
                </span>
              </label>
            </div>
          )}

          {/* Fixed Approvers */}
          {step.approverType === "fixed" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Seleccionar aprobadores
              </label>
              <div className="border border-slate-300 rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                {members.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No hay miembros en el proyecto
                  </p>
                ) : (
                  members.map((member) => (
                    <label
                      key={member.userId}
                      className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={step.approvers?.includes(member.userId) || false}
                        onChange={() => toggleApprover(type, step.id, member.userId)}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-500">
                          {member.role || member.position || "Sin rol"} • {member.email}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>

              {/* Require All */}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.requireAll}
                  onChange={(e) =>
                    updateStep(type, step.id, "requireAll", e.target.checked)
                  }
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700">
                  Requiere aprobación de todos (si está desmarcado, con uno es suficiente)
                </span>
              </label>
            </div>
          )}

          {/* Department Selection for HOD/Coordinator */}
          {(step.approverType === "hod" || step.approverType === "coordinator") && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Departamento
              </label>
              <select
                value={step.department || ""}
                onChange={(e) => updateStep(type, step.id, "department", e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="">-- Departamento del solicitante --</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-2">
                {step.department
                  ? `El ${step.approverType === "hod" ? "HOD" : "Coordinator"} del departamento "${step.department}" aprobará`
                  : `El ${step.approverType === "hod" ? "HOD" : "Coordinator"} del departamento del solicitante aprobará automáticamente`}
              </p>
            </div>
          )}

          {/* Preview for fixed approvers */}
          {step.approverType === "fixed" && step.approvers && step.approvers.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-xs font-medium text-slate-700 mb-2">Vista previa:</p>
              <div className="flex flex-wrap gap-2">
                {step.approvers.map((approverId) => (
                  <span
                    key={approverId}
                    className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium"
                  >
                    {getApproverName(approverId)}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {step.requireAll
                  ? "Se requiere aprobación de todos"
                  : "Con la aprobación de uno es suficiente"}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !hasAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-slate-700 mb-4">{errorMessage}</p>
          <Link href={`/project/${id}/accounting`} className="text-indigo-600 hover:underline font-medium">
            Volver a contabilidad
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-indigo-50 to-indigo-100 border-y border-indigo-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-indigo-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href={`/project/${id}/accounting`}
          className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
        >
          Volver a contabilidad
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-5xl mx-auto">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && hasAccess && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span>{errorMessage}</span>
              <button onClick={() => setErrorMessage("")} className="ml-auto">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <Settings size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Configuración de aprobaciones
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Define el flujo de aprobación para POs y facturas
                  </p>
                </div>
              </div>
              <button
                onClick={loadData}
                className="p-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                title="Recargar"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </div>

          {/* Info Card */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex gap-3">
              <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Cómo funcionan las aprobaciones</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Las aprobaciones se procesan en el orden definido (nivel 1, luego nivel 2, etc.)</li>
                  <li><strong>Por rol:</strong> Cualquier usuario con ese rol puede aprobar</li>
                  <li><strong>Usuarios específicos:</strong> Solo los usuarios seleccionados pueden aprobar</li>
                  <li><strong>HOD/Coordinator:</strong> El jefe/coordinador del departamento aprueba automáticamente</li>
                  <li>Si no hay ningún nivel configurado, las POs/Facturas se aprueban automáticamente</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("po")}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 ${
                activeTab === "po"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileText size={18} />
              Órdenes de compra (PO)
              {poApprovals.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {poApprovals.length} nivel{poApprovals.length !== 1 ? "es" : ""}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("invoice")}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 ${
                activeTab === "invoice"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <Receipt size={18} />
              Facturas
              {invoiceApprovals.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {invoiceApprovals.length} nivel{invoiceApprovals.length !== 1 ? "es" : ""}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {activeTab === "po" ? (
              <>
                {poApprovals.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <AlertCircle size={32} className="text-amber-600 mx-auto mb-2" />
                    <p className="text-amber-800 font-medium">No hay niveles de aprobación configurados</p>
                    <p className="text-amber-700 text-sm mt-1">
                      Las POs se aprobarán automáticamente sin revisión
                    </p>
                  </div>
                ) : (
                  poApprovals.map((step, index) => renderApprovalStep(step, "po", index))
                )}
                
                <button
                  onClick={() => addApprovalStep("po")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  <Plus size={20} />
                  Añadir nivel de aprobación
                </button>
              </>
            ) : (
              <>
                {invoiceApprovals.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <AlertCircle size={32} className="text-amber-600 mx-auto mb-2" />
                    <p className="text-amber-800 font-medium">No hay niveles de aprobación configurados</p>
                    <p className="text-amber-700 text-sm mt-1">
                      Las facturas se aprobarán automáticamente sin revisión
                    </p>
                  </div>
                ) : (
                  invoiceApprovals.map((step, index) =>
                    renderApprovalStep(step, "invoice", index)
                  )
                )}
                
                <button
                  onClick={() => addApprovalStep("invoice")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  <Plus size={20} />
                  Añadir nivel de aprobación
                </button>
              </>
            )}
          </div>

          {/* Save Button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Guardar configuración
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Settings,
  Folder,
  Edit2,
  Save,
  X,
  UserPlus,
  Trash2,
  Shield,
  Users,
  CheckCircle2,
  AlertCircle,
  Plus,
  Briefcase,
  Filter,
  AlertTriangle,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

const PHASES = [
  "Desarrollo",
  "Preproducción",
  "Rodaje",
  "Postproducción",
  "Finalizado",
];

const PROJECT_ROLES = ["PM", "Controller", "PC"];
const DEPARTMENT_POSITIONS = ["HOD", "Coordinator", "Crew"];

const PHASE_COLORS: Record<string, string> = {
  Desarrollo: "from-sky-400 to-sky-600",
  Preproducción: "from-amber-400 to-amber-600",
  Rodaje: "from-indigo-400 to-indigo-600",
  Postproducción: "from-purple-400 to-purple-600",
  Finalizado: "from-emerald-400 to-emerald-600",
};

interface ProjectData {
  name: string;
  phase: string;
  description?: string;
  departments?: string[];
  createdAt: Timestamp | Date;
}

interface Member {
  userId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  position?: string;
  permissions: {
    config: boolean;
    accounting: boolean;
    team: boolean;
  };
  addedAt: Timestamp | Date;
}

interface PendingInvitation {
  id: string;
  invitedEmail: string;
  invitedName: string;
  roleType: "project" | "department";
  role?: string;
  department?: string;
  position?: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Timestamp | Date;
}

interface ConfirmModal {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type: "danger" | "warning";
}

export default function ProjectConfig() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [hasConfigAccess, setHasConfigAccess] = useState(false);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [editingProject, setEditingProject] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "danger",
  });

  const [projectForm, setProjectForm] = useState({
    name: "",
    phase: "",
    description: "",
  });

  const [newDepartment, setNewDepartment] = useState("");

  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    roleType: "project" as "project" | "department",
    role: "",
    department: "",
    position: "",
    permissions: {
      accounting: false,
      team: false,
    },
  });

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Load project data
  useEffect(() => {
    if (!userId || !id) return;

    const loadProjectData = async () => {
      try {
        const userProjectRef = doc(db, `userProjects/${userId}/projects/${id}`);
        const userProjectSnap = await getDoc(userProjectRef);

        if (!userProjectSnap.exists()) {
          setErrorMessage("No tienes acceso a este proyecto");
          setLoading(false);
          return;
        }

        const userProjectData = userProjectSnap.data();
        const hasConfig = userProjectData.permissions?.config || false;

        setHasConfigAccess(hasConfig);

        if (!hasConfig) {
          setErrorMessage("No tienes permisos para acceder a la configuración");
          setLoading(false);
          return;
        }

        const projectRef = doc(db, "projects", id as string);
        const projectSnap = await getDoc(projectRef);

        if (projectSnap.exists()) {
          const projectData = projectSnap.data();
          const project: ProjectData = {
            name: projectData.name,
            phase: projectData.phase,
            description: projectData.description || "",
            departments: projectData.departments || [],
            createdAt: projectData.createdAt,
          };
          setProject(project);
          setProjectForm({
            name: project.name,
            phase: project.phase,
            description: project.description || "",
          });
        }

        // Load members
        const membersRef = collection(db, `projects/${id}/members`);
        const membersSnap = await getDocs(membersRef);
        const membersData: Member[] = membersSnap.docs.map((memberDoc) => {
          const data = memberDoc.data();
          return {
            userId: memberDoc.id,
            name: data.name,
            email: data.email,
            role: data.role,
            department: data.department,
            position: data.position,
            permissions: data.permissions || {
              config: false,
              accounting: false,
              team: false,
            },
            addedAt: data.addedAt,
          };
        });

        setMembers(membersData);

        // Load pending invitations
        const invitationsRef = collection(db, "invitations");
        const q = query(
          invitationsRef,
          where("projectId", "==", id),
          where("status", "==", "pending")
        );

        const invitationsSnap = await getDocs(q);
        const invitationsData: PendingInvitation[] = invitationsSnap.docs.map((invDoc) => {
          const data = invDoc.data();
          return {
            id: invDoc.id,
            invitedEmail: data.invitedEmail,
            invitedName: data.invitedName,
            roleType: data.roleType || "project",
            role: data.role,
            department: data.department,
            position: data.position,
            status: data.status,
            createdAt: data.createdAt,
          };
        });

        setPendingInvitations(invitationsData);
      } catch (error) {
        console.error("Error cargando proyecto:", error);
        setErrorMessage("Error al cargar el proyecto");
      } finally {
        setLoading(false);
      }
    };

    loadProjectData();
  }, [userId, id, router]);

  const handleSaveProject = async () => {
    if (!id) return;
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const projectRef = doc(db, "projects", id as string);
      await updateDoc(projectRef, {
        name: projectForm.name,
        phase: projectForm.phase,
        description: projectForm.description,
      });

      setProject({
        ...project!,
        name: projectForm.name,
        phase: projectForm.phase,
        description: projectForm.description,
      });

      setEditingProject(false);
      setSuccessMessage("Proyecto actualizado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error actualizando proyecto:", error);
      setErrorMessage("Error al actualizar el proyecto");
    } finally {
      setSaving(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;
    setSaving(true);
    setErrorMessage("");

    try {
      const projectRef = doc(db, "projects", id as string);
      await updateDoc(projectRef, {
        departments: arrayUnion(newDepartment.trim()),
      });

      setProject({
        ...project!,
        departments: [...(project?.departments || []), newDepartment.trim()],
      });

      setNewDepartment("");
      setShowAddDepartment(false);
      setSuccessMessage("Departamento agregado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error agregando departamento:", error);
      setErrorMessage("Error al agregar el departamento");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDepartment = async (dept: string) => {
    if (!id) return;

    const usersInDept = members.filter((m) => m.department === dept);

    if (usersInDept.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: "No se puede eliminar",
        message: `No puedes eliminar el departamento "${dept}" porque tiene ${usersInDept.length} ${
          usersInDept.length === 1 ? "usuario asignado" : "usuarios asignados"
        }. Primero debes reasignar o eliminar estos usuarios.`,
        type: "warning",
        onConfirm: () => {
          setConfirmModal({ ...confirmModal, isOpen: false });
        },
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Eliminar departamento",
      message: `¿Estás seguro de que deseas eliminar el departamento "${dept}"? Esta acción no se puede deshacer.`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          const projectRef = doc(db, "projects", id as string);
          await updateDoc(projectRef, {
            departments: arrayRemove(dept),
          });

          setProject({
            ...project!,
            departments: (project?.departments || []).filter((d) => d !== dept),
          });

          setSuccessMessage("Departamento eliminado correctamente");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (error) {
          console.error("Error eliminando departamento:", error);
          setErrorMessage("Error al eliminar el departamento");
        } finally {
          setSaving(false);
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      },
    });
  };

  const handleSendInvitation = async () => {
    if (!id || !inviteForm.email.trim() || !inviteForm.name.trim()) {
      setErrorMessage("Email y nombre son obligatorios");
      return;
    }

    if (inviteForm.roleType === "department" && (!inviteForm.department || !inviteForm.position)) {
      setErrorMessage("Debes seleccionar departamento y posición para roles de departamento");
      return;
    }

    if (inviteForm.roleType === "project" && !inviteForm.role) {
      setErrorMessage("Debes seleccionar un rol de proyecto");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const email = inviteForm.email.trim().toLowerCase();

      const existingMember = members.find((m) => m.email === email);
      if (existingMember) {
        setErrorMessage("Este usuario ya es miembro del proyecto");
        setSaving(false);
        return;
      }

      const existingInvite = pendingInvitations.find((inv) => inv.invitedEmail === email);
      if (existingInvite) {
        setErrorMessage("Ya existe una invitación pendiente para este email");
        setSaving(false);
        return;
      }

      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const usersSnap = await getDocs(q);

      let invitedUserId: string | null = null;
      if (!usersSnap.empty) {
        invitedUserId = usersSnap.docs[0].id;
      }

      const inviteData: Record<string, unknown> = {
        projectId: id,
        projectName: project?.name || "",
        invitedEmail: email,
        invitedName: inviteForm.name.trim(),
        invitedUserId: invitedUserId,
        invitedBy: userId,
        invitedByName: userName,
        status: "pending",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        roleType: inviteForm.roleType,
      };

      if (inviteForm.roleType === "project") {
        inviteData.role = inviteForm.role;
        inviteData.permissions = {
          config: ["PM", "Controller", "PC"].includes(inviteForm.role),
          accounting: inviteForm.permissions.accounting,
          team: inviteForm.permissions.team,
        };
      } else {
        inviteData.department = inviteForm.department;
        inviteData.position = inviteForm.position;
        inviteData.permissions = {
          config: false,
          accounting: inviteForm.permissions.accounting,
          team: inviteForm.permissions.team,
        };
      }

      await setDoc(doc(collection(db, "invitations")), inviteData);

      setSuccessMessage(`Invitación enviada correctamente a ${inviteForm.name}`);
      setTimeout(() => setSuccessMessage(""), 3000);

      // Reload invitations
      const invitationsRef = collection(db, "invitations");
      const invQuery = query(
        invitationsRef,
        where("projectId", "==", id),
        where("status", "==", "pending")
      );

      const invitationsSnap = await getDocs(invQuery);
      const invitationsData: PendingInvitation[] = invitationsSnap.docs.map((invDoc) => {
        const data = invDoc.data();
        return {
          id: invDoc.id,
          invitedEmail: data.invitedEmail,
          invitedName: data.invitedName,
          roleType: data.roleType || "project",
          role: data.role,
          department: data.department,
          position: data.position,
          status: data.status,
          createdAt: data.createdAt,
        };
      });

      setPendingInvitations(invitationsData);

      setInviteForm({
        email: "",
        name: "",
        roleType: "project",
        role: "",
        department: "",
        position: "",
        permissions: {
          accounting: false,
          team: false,
        },
      });
      setShowInviteModal(false);
    } catch (error) {
      console.error("Error enviando invitación:", error);
      setErrorMessage("Error al enviar la invitación");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancelar invitación",
      message: "¿Estás seguro de que deseas cancelar esta invitación?",
      type: "warning",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "invitations", invitationId));
          setPendingInvitations(pendingInvitations.filter((inv) => inv.id !== invitationId));
          setSuccessMessage("Invitación cancelada correctamente");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (error) {
          console.error("Error cancelando invitación:", error);
          setErrorMessage("Error al cancelar la invitación");
        } finally {
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      },
    });
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!id) return;

    const member = members.find((m) => m.userId === memberId);
    setConfirmModal({
      isOpen: true,
      title: "Eliminar miembro",
      message: `¿Estás seguro de que deseas eliminar a ${member?.name || member?.email} del proyecto? Esta acción no se puede deshacer.`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          const memberRef = doc(db, `projects/${id}/members`, memberId);
          await deleteDoc(memberRef);

          const userProjectRef = doc(db, `userProjects/${memberId}/projects`, id as string);
          await deleteDoc(userProjectRef);

          setMembers(members.filter((m) => m.userId !== memberId));

          setSuccessMessage("Miembro eliminado correctamente");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (error) {
          console.error("Error eliminando miembro:", error);
          setErrorMessage("Error al eliminar el miembro");
        } finally {
          setSaving(false);
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      },
    });
  };

  const filteredMembers = members.filter((member) => {
    if (departmentFilter === "all") return true;
    if (departmentFilter === "project") {
      return PROJECT_ROLES.includes(member.role || "");
    }
    if (departmentFilter === "unassigned") {
      return !member.department && !member.role;
    }
    return member.department === departmentFilter;
  });

  const uniqueDepartments = Array.from(
    new Set(members.map((m) => m.department).filter(Boolean))
  ) as string[];

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !project) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-slate-700 mb-4">{errorMessage}</p>
          <Link href="/dashboard" className="text-slate-900 hover:underline font-medium">
            Volver al panel principal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className={`p-3 rounded-full ${confirmModal.type === "danger" ? "bg-red-100" : "bg-amber-100"}`}>
                <AlertTriangle size={24} className={confirmModal.type === "danger" ? "text-red-600" : "text-amber-600"} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {confirmModal.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModal.onConfirm}
                disabled={saving}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  confirmModal.type === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {saving ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Invitar miembro</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteForm({
                    email: "",
                    name: "",
                    roleType: "project",
                    role: "",
                    department: "",
                    position: "",
                    permissions: { accounting: false, team: false },
                  });
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email del usuario</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="usuario@ejemplo.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del usuario</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Nombre completo"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de rol</label>
                <select
                  value={inviteForm.roleType}
                  onChange={(e) => setInviteForm({ ...inviteForm, roleType: e.target.value as "project" | "department" })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                >
                  <option value="project">Rol de proyecto (PM, Controller, PC)</option>
                  <option value="department">Rol de departamento (HOD, Coordinator, Crew)</option>
                </select>
              </div>

              {inviteForm.roleType === "project" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Rol de proyecto</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                  >
                    <option value="">Seleccionar rol</option>
                    {PROJECT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Departamento</label>
                    <select
                      value={inviteForm.department}
                      onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="">Seleccionar</option>
                      {project?.departments?.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Posición</label>
                    <select
                      value={inviteForm.position}
                      onChange={(e) => setInviteForm({ ...inviteForm, position: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="">Seleccionar</option>
                      {DEPARTMENT_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Permisos adicionales</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.accounting}
                      onChange={(e) =>
                        setInviteForm({
                          ...inviteForm,
                          permissions: { ...inviteForm.permissions, accounting: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">Contabilidad</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.team}
                      onChange={(e) =>
                        setInviteForm({
                          ...inviteForm,
                          permissions: { ...inviteForm.permissions, team: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">Gestión de equipo</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleSendInvitation}
                disabled={saving}
                className="w-full mt-4 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Enviando invitación..." : "Enviar invitación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-slate-50 to-slate-100 border-y border-slate-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-700 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-slate-900 tracking-tight">{project?.name}</h1>
        </div>
        <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium">
          Volver a proyectos
        </Link>
      </div>

      <main className="flex-grow p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && project && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Project Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                    <Settings size={20} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-slate-900">Información del proyecto</h1>
                    <p className="text-sm text-slate-500">Gestiona la información y configuración</p>
                  </div>
                </div>
                {!editingProject && (
                  <button
                    onClick={() => setEditingProject(true)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Edit2 size={16} />
                    Editar
                  </button>
                )}
              </div>

              {!editingProject ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del proyecto</label>
                    <p className="text-slate-900">{project?.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fase actual</label>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white bg-gradient-to-r ${
                        PHASE_COLORS[project?.phase || ""]
                      }`}
                    >
                      {project?.phase}
                    </span>
                  </div>
                  {project?.description && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                      <p className="text-slate-600">{project.description}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del proyecto</label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Fase actual</label>
                    <select
                      value={projectForm.phase}
                      onChange={(e) => setProjectForm({ ...projectForm, phase: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    >
                      {PHASES.map((phase) => (
                        <option key={phase} value={phase}>
                          {phase}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                    <textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none resize-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveProject}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Save size={16} />
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button
                      onClick={() => setEditingProject(false)}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      <X size={16} />
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Departments Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
                    <Briefcase size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Departamentos</h2>
                    <p className="text-sm text-slate-500">Organiza tu equipo por áreas</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddDepartment(!showAddDepartment)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  Agregar departamento
                </button>
              </div>

              {showAddDepartment && (
                <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      placeholder="Nombre del departamento"
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    />
                    <button
                      onClick={handleAddDepartment}
                      disabled={saving || !newDepartment.trim()}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Agregar
                    </button>
                    <button
                      onClick={() => {
                        setShowAddDepartment(false);
                        setNewDepartment("");
                      }}
                      className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {!project?.departments || project.departments.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No hay departamentos configurados</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {project.departments.map((dept) => (
                    <div
                      key={dept}
                      className="group flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-700">{dept}</span>
                      <button
                        onClick={() => handleRemoveDepartment(dept)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-all p-1"
                        title="Eliminar departamento"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Team Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                    <Users size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Equipo</h2>
                    <p className="text-sm text-slate-500">Gestiona los miembros del proyecto</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <UserPlus size={16} />
                  Invitar miembro
                </button>
              </div>

              {/* Pending Invitations */}
              {pendingInvitations.length > 0 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-900">
                      Invitaciones pendientes ({pendingInvitations.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {pendingInvitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{inv.invitedName}</p>
                          <p className="text-xs text-slate-600">{inv.invitedEmail}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {inv.roleType === "project" ? `Rol: ${inv.role}` : `${inv.position} - ${inv.department}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCancelInvitation(inv.id)}
                          className="ml-3 px-3 py-1.5 text-amber-700 hover:bg-amber-100 rounded text-xs font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter */}
              <div className="flex items-center gap-3 mb-6">
                <Filter size={16} className="text-slate-400" />
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                >
                  <option value="all">Todos los miembros</option>
                  <option value="project">Roles de proyecto (PM, Controller, PC)</option>
                  {uniqueDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                  <option value="unassigned">Sin asignar</option>
                </select>
                <span className="text-sm text-slate-500">
                  {filteredMembers.length} {filteredMembers.length === 1 ? "miembro" : "miembros"}
                </span>
              </div>

              {/* Members Table */}
              {filteredMembers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  {departmentFilter === "all" ? "No hay miembros en el equipo aún" : "No hay miembros en este filtro"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Miembro
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Rol / Departamento
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Permisos
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((member) => {
                        const isProjectRole = PROJECT_ROLES.includes(member.role || "");

                        return (
                          <tr key={member.userId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full ${
                                    isProjectRole ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                                  } flex items-center justify-center text-xs font-semibold`}
                                >
                                  {member.name?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-slate-900">{member.name || member.email}</p>
                                    {isProjectRole && <Shield size={12} className="text-slate-900" />}
                                  </div>
                                  {member.email && member.name && <p className="text-xs text-slate-500">{member.email}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {isProjectRole ? (
                                <span className="text-sm font-medium text-slate-900">{member.role}</span>
                              ) : (
                                <div className="text-sm text-slate-600">
                                  {member.department && member.position ? (
                                    <>
                                      <span className="font-medium text-slate-900">{member.position}</span>
                                      <span className="text-slate-400"> · </span>
                                      <span>{member.department}</span>
                                    </>
                                  ) : (
                                    <span className="text-slate-400">Sin asignar</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-1.5 flex-wrap">
                                {member.permissions.config && (
                                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                                    Configuración
                                  </span>
                                )}
                                {member.permissions.accounting && (
                                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium">
                                    Contabilidad
                                  </span>
                                )}
                                {member.permissions.team && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">
                                    Equipo
                                  </span>
                                )}
                                {!member.permissions.config && !member.permissions.accounting && !member.permissions.team && (
                                  <span className="text-xs text-slate-400">Sin permisos</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {member.userId !== userId && (
                                <button
                                  onClick={() => handleRemoveMember(member.userId)}
                                  className="text-slate-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded"
                                  title="Eliminar permanentemente"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

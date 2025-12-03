"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  Shield,
  X,
  AlertCircle,
  CheckCircle,
  UserCheck,
  UserX,
  Clock,
  Folder,
  Mail,
  ArrowLeft,
  Briefcase,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const DEPARTMENT_POSITIONS = ["HOD", "Coordinator", "Crew"];

const roleColors: Record<string, { bg: string; text: string; border: string }> = {
  EP: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  PM: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  Controller: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  PC: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
};

interface Member {
  userId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  position?: string;
  permissions: { config: boolean; accounting: boolean; team: boolean };
}

interface PendingInvitation {
  id: string;
  invitedEmail: string;
  invitedName: string;
  roleType: "project" | "department";
  role?: string;
  department?: string;
  position?: string;
}

interface Department {
  name: string;
}

export default function ConfigUsers() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [hasConfigAccess, setHasConfigAccess] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [foundUser, setFoundUser] = useState<{ name: string; email: string } | null>(null);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    roleType: "project" as "project" | "department",
    role: "",
    department: "",
    position: "",
    permissions: { accounting: false, team: false }
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      else {
        setUserId(u.uid);
        setUserName(u.displayName || u.email || "Usuario");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!userId || !id) return;
    const loadData = async () => {
      try {
        const userProjectSnap = await getDoc(doc(db, `userProjects/${userId}/projects/${id}`));
        if (!userProjectSnap.exists()) {
          setErrorMessage("No tienes acceso a este proyecto");
          setLoading(false);
          return;
        }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) {
          setErrorMessage("No tienes permisos de configuración");
          setLoading(false);
          return;
        }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) {
          setProjectName(projectSnap.data().name);
          setDepartments((projectSnap.data().departments || []).map((d: string) => ({ name: d })));
        }

        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMembers(membersSnap.docs.map((d) => ({
          userId: d.id,
          name: d.data().name,
          email: d.data().email,
          role: d.data().role,
          department: d.data().department,
          position: d.data().position,
          permissions: d.data().permissions || { config: false, accounting: false, team: false }
        })));

        const invSnap = await getDocs(query(
          collection(db, "invitations"),
          where("projectId", "==", id),
          where("status", "==", "pending")
        ));
        setPendingInvitations(invSnap.docs.map((d) => ({
          id: d.id,
          invitedEmail: d.data().invitedEmail,
          invitedName: d.data().invitedName,
          roleType: d.data().roleType || "project",
          role: d.data().role,
          department: d.data().department,
          position: d.data().position
        })));
        setLoading(false);
      } catch (error) {
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };
    loadData();
  }, [userId, id, router]);

  useEffect(() => {
    const checkUser = async () => {
      if (!inviteForm.email || inviteForm.email.length < 3) {
        setUserExists(null);
        setFoundUser(null);
        return;
      }
      try {
        const snap = await getDocs(query(
          collection(db, "users"),
          where("email", "==", inviteForm.email.toLowerCase().trim())
        ));
        if (!snap.empty) {
          const d = snap.docs[0].data();
          setUserExists(true);
          setFoundUser({ name: d.name || d.email, email: d.email });
          setInviteForm((p) => ({ ...p, name: d.name || d.email }));
        } else {
          setUserExists(false);
          setFoundUser(null);
        }
      } catch (e) {}
    };
    const t = setTimeout(checkUser, 500);
    return () => clearTimeout(t);
  }, [inviteForm.email]);

  const handleSendInvitation = async () => {
    if (!id || !inviteForm.email.trim() || !inviteForm.name.trim()) {
      setErrorMessage("Email y nombre son obligatorios");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    if (inviteForm.roleType === "department" && (!inviteForm.department || !inviteForm.position)) {
      setErrorMessage("Selecciona departamento y posición");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    if (inviteForm.roleType === "project" && !inviteForm.role) {
      setErrorMessage("Selecciona un rol de proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    setSaving(true);
    try {
      const email = inviteForm.email.trim().toLowerCase();
      if (members.find((m) => m.email === email)) {
        setErrorMessage("Este usuario ya es miembro del proyecto");
        setSaving(false);
        return;
      }
      if (pendingInvitations.find((i) => i.invitedEmail === email)) {
        setErrorMessage("Ya existe una invitación pendiente para este email");
        setSaving(false);
        return;
      }

      const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      const inviteData: any = {
        projectId: id,
        projectName,
        invitedEmail: email,
        invitedName: inviteForm.name.trim(),
        invitedUserId: usersSnap.empty ? null : usersSnap.docs[0].id,
        invitedBy: userId,
        invitedByName: userName,
        status: "pending",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        roleType: inviteForm.roleType
      };

      if (inviteForm.roleType === "project") {
        inviteData.role = inviteForm.role;
        inviteData.permissions = {
          config: ["EP", "PM"].includes(inviteForm.role),
          accounting: inviteForm.permissions.accounting,
          team: inviteForm.permissions.team
        };
      } else {
        inviteData.department = inviteForm.department;
        inviteData.position = inviteForm.position;
        inviteData.permissions = {
          config: false,
          accounting: inviteForm.permissions.accounting,
          team: inviteForm.permissions.team
        };
      }

      await setDoc(doc(collection(db, "invitations")), inviteData);
      setSuccessMessage("Invitación enviada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      const invSnap = await getDocs(query(
        collection(db, "invitations"),
        where("projectId", "==", id),
        where("status", "==", "pending")
      ));
      setPendingInvitations(invSnap.docs.map((d) => ({
        id: d.id,
        invitedEmail: d.data().invitedEmail,
        invitedName: d.data().invitedName,
        roleType: d.data().roleType || "project",
        role: d.data().role,
        department: d.data().department,
        position: d.data().position
      })));

      setInviteForm({
        email: "",
        name: "",
        roleType: "project",
        role: "",
        department: "",
        position: "",
        permissions: { accounting: false, team: false }
      });
      setUserExists(null);
      setFoundUser(null);
      setShowInviteModal(false);
    } catch (e) {
      setErrorMessage("Error al enviar la invitación");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvitation = async (invId: string) => {
    if (!confirm("¿Estás seguro de cancelar esta invitación?")) return;
    try {
      await deleteDoc(doc(db, "invitations", invId));
      setPendingInvitations(pendingInvitations.filter((i) => i.id !== invId));
      setSuccessMessage("Invitación cancelada");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e) {
      setErrorMessage("Error al cancelar");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const m = members.find((m) => m.userId === memberId);
    if (!confirm(`¿Eliminar a ${m?.name} del proyecto?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/members`, memberId));
      await deleteDoc(doc(db, `userProjects/${memberId}/projects`, id as string));
      setMembers(members.filter((m) => m.userId !== memberId));
      setSuccessMessage("Miembro eliminado");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e) {
      setErrorMessage("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowInviteModal(false);
    setInviteForm({
      email: "",
      name: "",
      roleType: "project",
      role: "",
      department: "",
      position: "",
      permissions: { accounting: false, team: false }
    });
    setUserExists(null);
    setFoundUser(null);
  };

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const projectMembers = filteredMembers.filter((m) => PROJECT_ROLES.includes(m.role || ""));
  const deptMembers = filteredMembers.filter((m) => !PROJECT_ROLES.includes(m.role || "") && m.department);

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !hasConfigAccess) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-600 text-sm mb-6">{errorMessage}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <Folder size={14} />
              <span>{projectName}</span>
            </Link>
          </div>

          {/* Title & Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center">
                <Users size={26} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                  Usuarios
                </h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {members.length} miembro{members.length !== 1 ? "s" : ""} · {pendingInvitations.length} pendiente{pendingInvitations.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all shadow-lg shadow-white/10"
            >
              <UserPlus size={16} />
              Invitar
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Crown size={18} className="text-violet-400" />
                <span className="text-2xl font-bold">{projectMembers.length}</span>
              </div>
              <p className="text-sm text-slate-400">Roles de proyecto</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Briefcase size={18} className="text-amber-400" />
                <span className="text-2xl font-bold">{deptMembers.length}</span>
              </div>
              <p className="text-sm text-slate-400">Departamentos</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-sky-400" />
                <span className="text-2xl font-bold">{pendingInvitations.length}</span>
              </div>
              <p className="text-sm text-slate-400">Invitaciones</p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-grow px-6 md:px-12 py-8 -mt-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Messages */}
          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-emerald-700">{successMessage}</span>
            </div>
          )}

          {errorMessage && hasConfigAccess && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle size={16} className="text-red-600" />
              </div>
              <span className="text-sm font-medium text-red-700">{errorMessage}</span>
            </div>
          )}

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-200/50 flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Clock size={18} className="text-amber-600" />
                </div>
                <div>
                  <h3 className={`font-semibold text-amber-900 ${spaceGrotesk.className}`}>
                    Invitaciones pendientes
                  </h3>
                  <p className="text-xs text-amber-700/70">
                    {pendingInvitations.length} usuario{pendingInvitations.length !== 1 ? "s" : ""} esperando respuesta
                  </p>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between bg-white p-4 rounded-xl border border-amber-100 hover:border-amber-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-semibold text-sm">
                        {inv.invitedName?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{inv.invitedName}</p>
                        <p className="text-xs text-slate-500">
                          {inv.invitedEmail} · {inv.roleType === "project" ? inv.role : `${inv.position} en ${inv.department}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvitation(inv.id)}
                      className="px-3 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm transition-all shadow-sm"
            />
          </div>

          {/* Project Roles */}
          {projectMembers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Shield size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Roles de proyecto
                  </h3>
                  <p className="text-xs text-slate-500">Equipo principal con acceso administrativo</p>
                </div>
                <span className="text-sm font-semibold text-slate-400">{projectMembers.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {projectMembers.map((m) => {
                  const roleStyle = roleColors[m.role || ""] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
                  return (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center text-sm font-bold shadow-md">
                          {m.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{m.name}</p>
                          <p className="text-sm text-slate-500">{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${roleStyle.bg} ${roleStyle.text} border ${roleStyle.border}`}>
                          {m.role}
                        </span>
                        {m.userId !== userId && (
                          <button
                            onClick={() => handleRemoveMember(m.userId)}
                            className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Department Members */}
          {deptMembers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Briefcase size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Departamentos
                  </h3>
                  <p className="text-xs text-slate-500">Equipo organizado por áreas de trabajo</p>
                </div>
                <span className="text-sm font-semibold text-slate-400">{deptMembers.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {deptMembers.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600 flex items-center justify-center text-sm font-bold">
                        {m.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{m.name}</p>
                        <p className="text-sm text-slate-500">
                          {m.position} · <span className="text-slate-400">{m.department}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        {m.permissions.accounting && (
                          <span className="px-2 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-md border border-indigo-100">
                            ACC
                          </span>
                        )}
                        {m.permissions.team && (
                          <span className="px-2 py-1 text-[10px] font-bold text-amber-600 bg-amber-50 rounded-md border border-amber-100">
                            TEAM
                          </span>
                        )}
                      </div>
                      {m.userId !== userId && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredMembers.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users size={28} className="text-slate-300" />
              </div>
              <p className="font-semibold text-slate-900 mb-1">
                {searchTerm ? "Sin resultados" : "Sin miembros"}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                {searchTerm ? "Prueba con otro término de búsqueda" : "Invita al primer miembro del equipo"}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  <UserPlus size={14} />
                  Invitar usuario
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <UserPlus size={18} className="text-white" />
                </div>
                <div>
                  <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Invitar usuario
                  </h3>
                  <p className="text-xs text-slate-500">Añade un nuevo miembro al equipo</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="usuario@ejemplo.com"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm transition-all"
                />
                {userExists === true && foundUser && (
                  <div className="mt-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                    <UserCheck size={14} className="text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700">
                      Usuario registrado: {foundUser.name}
                    </span>
                  </div>
                )}
                {userExists === false && inviteForm.email.length > 3 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
                    <UserX size={14} className="text-amber-600" />
                    <span className="text-xs font-medium text-amber-700">
                      Se enviará invitación para registrarse
                    </span>
                  </div>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Nombre completo"
                  disabled={userExists === true}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm transition-all disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              {/* Role Type */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Tipo de rol
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setInviteForm({ ...inviteForm, roleType: "project", department: "", position: "" })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      inviteForm.roleType === "project"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Crown size={14} className={inviteForm.roleType === "project" ? "text-slate-900" : "text-slate-400"} />
                      <span className={`text-sm font-semibold ${inviteForm.roleType === "project" ? "text-slate-900" : "text-slate-600"}`}>
                        Proyecto
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">EP, PM, Controller, PC</p>
                  </button>
                  <button
                    onClick={() => setInviteForm({ ...inviteForm, roleType: "department", role: "" })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      inviteForm.roleType === "department"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase size={14} className={inviteForm.roleType === "department" ? "text-slate-900" : "text-slate-400"} />
                      <span className={`text-sm font-semibold ${inviteForm.roleType === "department" ? "text-slate-900" : "text-slate-600"}`}>
                        Departamento
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">HOD, Coord, Crew</p>
                  </button>
                </div>
              </div>

              {/* Project Role Selection */}
              {inviteForm.roleType === "project" && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                    Rol de proyecto
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PROJECT_ROLES.map((r) => {
                      const style = roleColors[r];
                      const isSelected = inviteForm.role === r;
                      return (
                        <button
                          key={r}
                          onClick={() => setInviteForm({ ...inviteForm, role: r })}
                          className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                            isSelected
                              ? `${style.border} ${style.bg} ${style.text}`
                              : "border-slate-200 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Department Selection */}
              {inviteForm.roleType === "department" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                      Departamento
                    </label>
                    <select
                      value={inviteForm.department}
                      onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm transition-all bg-white"
                    >
                      <option value="">Seleccionar departamento...</option>
                      {departments.map((d) => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                      Posición
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPARTMENT_POSITIONS.map((p) => (
                        <button
                          key={p}
                          onClick={() => setInviteForm({ ...inviteForm, position: p })}
                          className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                            inviteForm.position === p
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Permissions */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Permisos adicionales
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      inviteForm.permissions.accounting
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.accounting}
                      onChange={(e) => setInviteForm({
                        ...inviteForm,
                        permissions: { ...inviteForm.permissions, accounting: e.target.checked }
                      })}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className={`text-sm font-medium ${inviteForm.permissions.accounting ? "text-indigo-700" : "text-slate-600"}`}>
                      Contabilidad
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      inviteForm.permissions.team
                        ? "border-amber-300 bg-amber-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.team}
                      onChange={(e) => setInviteForm({
                        ...inviteForm,
                        permissions: { ...inviteForm.permissions, team: e.target.checked }
                      })}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                    />
                    <span className={`text-sm font-medium ${inviteForm.permissions.team ? "text-amber-700" : "text-slate-600"}`}>
                      Equipo
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-slate-50">
              <button
                onClick={closeModal}
                className="flex-1 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl text-sm font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendInvitation}
                disabled={saving}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
              >
                {saving ? "Enviando..." : "Enviar invitación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

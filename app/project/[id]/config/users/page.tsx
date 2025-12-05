"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  X,
  AlertCircle,
  ChevronRight,
  Clock,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: ["400"] });

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const DEPARTMENT_POSITIONS = ["HOD", "Coordinator", "Crew"];

const roleColors: Record<string, string> = {
  EP: "#8b5cf6",
  PM: "#3b82f6",
  Controller: "#10b981",
  PC: "#f59e0b",
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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [foundUser, setFoundUser] = useState<{ name: string; email: string } | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    roleType: "project" as "project" | "department",
    role: "",
    department: "",
    position: "",
    permissions: { accounting: false, team: false }
  });

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  };

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
          setLoading(false);
          return;
        }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) {
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
      } catch {
        showToast("error", "Error al cargar");
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
      } catch {}
    };
    const t = setTimeout(checkUser, 500);
    return () => clearTimeout(t);
  }, [inviteForm.email]);

  const handleSendInvitation = async () => {
    if (!id || !inviteForm.email.trim() || !inviteForm.name.trim()) {
      showToast("error", "Email y nombre requeridos");
      return;
    }
    if (inviteForm.roleType === "department" && (!inviteForm.department || !inviteForm.position)) {
      showToast("error", "Selecciona departamento y posición");
      return;
    }
    if (inviteForm.roleType === "project" && !inviteForm.role) {
      showToast("error", "Selecciona un rol");
      return;
    }
    setSaving(true);
    try {
      const email = inviteForm.email.trim().toLowerCase();
      if (members.find((m) => m.email === email)) {
        showToast("error", "Usuario ya es miembro");
        setSaving(false);
        return;
      }
      if (pendingInvitations.find((i) => i.invitedEmail === email)) {
        showToast("error", "Invitación ya existe");
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
      showToast("success", "Invitación enviada");

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

      closeModal();
    } catch {
      showToast("error", "Error al enviar");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvitation = async (invId: string) => {
    try {
      await deleteDoc(doc(db, "invitations", invId));
      setPendingInvitations(pendingInvitations.filter((i) => i.id !== invId));
      showToast("success", "Invitación cancelada");
    } catch {
      showToast("error", "Error");
    }
    setActiveMenu(null);
  };

  const handleRemoveMember = async (memberId: string) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/members`, memberId));
      await deleteDoc(doc(db, `userProjects/${memberId}/projects`, id as string));
      setMembers(members.filter((m) => m.userId !== memberId));
      showToast("success", "Miembro eliminado");
    } catch {
      showToast("error", "Error");
    } finally {
      setSaving(false);
      setActiveMenu(null);
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

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${dmSans.className}`}>
        <div className="w-5 h-5 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasConfigAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${dmSans.className}`}>
        <div className="text-center">
          <AlertCircle size={32} className="text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm">Sin acceso</p>
          <Link href="/dashboard" className="text-sm text-neutral-900 underline mt-4 inline-block">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${dmSans.className}`}>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg transition-all animate-in slide-in-from-top-2 ${
            toast.type === "success" ? "bg-neutral-900 text-white" : "bg-red-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Link href="/dashboard" className="hover:text-neutral-600 transition-colors">
              Proyectos
            </Link>
            <ChevronRight size={14} />
            <Link href={`/proyecto/${id}/config`} className="hover:text-neutral-600 transition-colors">
              {projectName}
            </Link>
            <ChevronRight size={14} />
            <span className="text-neutral-900">Equipo</span>
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center justify-between mb-10">
          <h1 className={`text-4xl text-neutral-900 ${instrumentSerif.className}`}>
            Equipo
          </h1>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            <UserPlus size={16} />
            Invitar
          </button>
        </div>

        {/* Search */}
        {(members.length > 0 || searchTerm) && (
          <div className="relative mb-6">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400 text-sm transition-colors"
            />
          </div>
        )}

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-amber-500" />
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Pendientes ({pendingInvitations.length})
              </span>
            </div>
            <div className="space-y-2">
              {pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-100 rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-xs font-semibold">
                      {inv.invitedName?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{inv.invitedName}</p>
                      <p className="text-xs text-neutral-500">
                        {inv.roleType === "project" ? inv.role : `${inv.position} · ${inv.department}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Cancelar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members List */}
        {filteredMembers.length > 0 ? (
          <div className="space-y-1">
            {filteredMembers.map((m) => {
              const isProjectRole = PROJECT_ROLES.includes(m.role || "");
              const roleColor = roleColors[m.role || ""] || "#64748b";
              
              return (
                <div
                  key={m.userId}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: isProjectRole ? roleColor : "#94a3b8" }}
                    >
                      {m.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-neutral-900">{m.name}</p>
                        {m.userId === userId && (
                          <span className="text-[10px] text-neutral-400">(tú)</span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500">{m.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isProjectRole ? (
                      <span 
                        className="px-2.5 py-1 rounded text-xs font-semibold"
                        style={{ 
                          backgroundColor: `${roleColor}15`,
                          color: roleColor 
                        }}
                      >
                        {m.role}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        {m.position} · {m.department}
                      </span>
                    )}

                    {/* Permissions badges */}
                    <div className="flex gap-1">
                      {m.permissions.accounting && (
                        <span className="w-6 h-6 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                          $
                        </span>
                      )}
                      {m.permissions.team && (
                        <span className="w-6 h-6 rounded bg-amber-50 text-amber-600 flex items-center justify-center">
                          <Users size={10} />
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    {m.userId !== userId && (
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenu(activeMenu === m.userId ? null : m.userId)}
                          className="p-1.5 text-neutral-300 hover:text-neutral-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {activeMenu === m.userId && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 z-20">
                              <button
                                onClick={() => handleRemoveMember(m.userId)}
                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                              >
                                <Trash2 size={14} />
                                Eliminar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <Users size={32} className="text-neutral-200 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">
              {searchTerm ? "Sin resultados" : "Sin miembros aún"}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="mt-4 text-sm text-neutral-900 underline"
              >
                Invitar al primer miembro
              </button>
            )}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className={`text-xl ${instrumentSerif.className}`}>Invitar</h3>
              <button
                onClick={closeModal}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="usuario@ejemplo.com"
                  className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400 text-sm"
                />
                {userExists === true && foundUser && (
                  <p className="mt-1.5 text-xs text-emerald-600">
                    ✓ Usuario registrado
                  </p>
                )}
                {userExists === false && inviteForm.email.length > 3 && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    Se enviará invitación para registrarse
                  </p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                  Nombre
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Nombre completo"
                  disabled={userExists === true}
                  className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400 text-sm disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </div>

              {/* Role Type Toggle */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                  Tipo
                </label>
                <div className="flex p-1 bg-neutral-100 rounded-lg">
                  <button
                    onClick={() => setInviteForm({ ...inviteForm, roleType: "project", department: "", position: "" })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      inviteForm.roleType === "project"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500"
                    }`}
                  >
                    Proyecto
                  </button>
                  <button
                    onClick={() => setInviteForm({ ...inviteForm, roleType: "department", role: "" })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      inviteForm.roleType === "department"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-500"
                    }`}
                  >
                    Departamento
                  </button>
                </div>
              </div>

              {/* Project Role Selection */}
              {inviteForm.roleType === "project" && (
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                    Rol
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PROJECT_ROLES.map((r) => {
                      const color = roleColors[r];
                      const isSelected = inviteForm.role === r;
                      return (
                        <button
                          key={r}
                          onClick={() => setInviteForm({ ...inviteForm, role: r })}
                          className="py-2.5 rounded-lg text-sm font-semibold transition-all border-2"
                          style={{
                            borderColor: isSelected ? color : "#e5e5e5",
                            backgroundColor: isSelected ? `${color}10` : "transparent",
                            color: isSelected ? color : "#737373"
                          }}
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
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                      Departamento
                    </label>
                    <select
                      value={inviteForm.department}
                      onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400 text-sm bg-white"
                    >
                      <option value="">Seleccionar...</option>
                      {departments.map((d) => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                      Posición
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPARTMENT_POSITIONS.map((p) => (
                        <button
                          key={p}
                          onClick={() => setInviteForm({ ...inviteForm, position: p })}
                          className={`py-2.5 rounded-lg text-sm font-medium transition-all border-2 ${
                            inviteForm.position === p
                              ? "border-neutral-900 bg-neutral-900 text-white"
                              : "border-neutral-200 text-neutral-600 hover:border-neutral-300"
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
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                  Permisos
                </label>
                <div className="flex gap-3">
                  <label
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      inviteForm.permissions.accounting
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-neutral-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.accounting}
                      onChange={(e) => setInviteForm({
                        ...inviteForm,
                        permissions: { ...inviteForm.permissions, accounting: e.target.checked }
                      })}
                      className="sr-only"
                    />
                    <span className={`text-sm ${inviteForm.permissions.accounting ? "text-indigo-700" : "text-neutral-500"}`}>
                      Contabilidad
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      inviteForm.permissions.team
                        ? "border-amber-300 bg-amber-50"
                        : "border-neutral-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.team}
                      onChange={(e) => setInviteForm({
                        ...inviteForm,
                        permissions: { ...inviteForm.permissions, team: e.target.checked }
                      })}
                      className="sr-only"
                    />
                    <span className={`text-sm ${inviteForm.permissions.team ? "text-amber-700" : "text-neutral-500"}`}>
                      Equipo
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendInvitation}
                disabled={saving}
                className="flex-1 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

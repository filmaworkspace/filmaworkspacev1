"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Clock,
  MoreHorizontal,
  Mail,
  Shield,
  Briefcase,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
    setTimeout(() => setToast(null), 3000);
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
        if (!userProjectSnap.exists()) { setLoading(false); return; }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setLoading(false); return; }

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

        const invSnap = await getDocs(query(collection(db, "invitations"), where("projectId", "==", id), where("status", "==", "pending")));
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
      } catch { showToast("error", "Error al cargar"); setLoading(false); }
    };
    loadData();
  }, [userId, id, router]);

  useEffect(() => {
    const checkUser = async () => {
      if (!inviteForm.email || inviteForm.email.length < 3) { setUserExists(null); setFoundUser(null); return; }
      try {
        const snap = await getDocs(query(collection(db, "users"), where("email", "==", inviteForm.email.toLowerCase().trim())));
        if (!snap.empty) {
          const d = snap.docs[0].data();
          setUserExists(true);
          setFoundUser({ name: d.name || d.email, email: d.email });
          setInviteForm((p) => ({ ...p, name: d.name || d.email }));
        } else { setUserExists(false); setFoundUser(null); }
      } catch {}
    };
    const t = setTimeout(checkUser, 500);
    return () => clearTimeout(t);
  }, [inviteForm.email]);

  const handleSendInvitation = async () => {
    if (!id || !inviteForm.email.trim() || !inviteForm.name.trim()) { showToast("error", "Email y nombre requeridos"); return; }
    if (inviteForm.roleType === "department" && (!inviteForm.department || !inviteForm.position)) { showToast("error", "Selecciona departamento y posición"); return; }
    if (inviteForm.roleType === "project" && !inviteForm.role) { showToast("error", "Selecciona un rol"); return; }
    setSaving(true);
    try {
      const email = inviteForm.email.trim().toLowerCase();
      if (members.find((m) => m.email === email)) { showToast("error", "Ya es miembro"); setSaving(false); return; }
      if (pendingInvitations.find((i) => i.invitedEmail === email)) { showToast("error", "Invitación pendiente"); setSaving(false); return; }

      const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      const inviteData: any = {
        projectId: id, projectName, invitedEmail: email, invitedName: inviteForm.name.trim(),
        invitedUserId: usersSnap.empty ? null : usersSnap.docs[0].id,
        invitedBy: userId, invitedByName: userName, status: "pending",
        createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        roleType: inviteForm.roleType
      };

      if (inviteForm.roleType === "project") {
        inviteData.role = inviteForm.role;
        inviteData.permissions = { config: ["EP", "PM"].includes(inviteForm.role), accounting: inviteForm.permissions.accounting, team: inviteForm.permissions.team };
      } else {
        inviteData.department = inviteForm.department;
        inviteData.position = inviteForm.position;
        inviteData.permissions = { config: false, accounting: inviteForm.permissions.accounting, team: inviteForm.permissions.team };
      }

      await setDoc(doc(collection(db, "invitations")), inviteData);
      showToast("success", "Invitación enviada");

      const invSnap = await getDocs(query(collection(db, "invitations"), where("projectId", "==", id), where("status", "==", "pending")));
      setPendingInvitations(invSnap.docs.map((d) => ({ id: d.id, invitedEmail: d.data().invitedEmail, invitedName: d.data().invitedName, roleType: d.data().roleType || "project", role: d.data().role, department: d.data().department, position: d.data().position })));
      closeModal();
    } catch { showToast("error", "Error al enviar"); } finally { setSaving(false); }
  };

  const handleCancelInvitation = async (invId: string) => {
    try {
      await deleteDoc(doc(db, "invitations", invId));
      setPendingInvitations(pendingInvitations.filter((i) => i.id !== invId));
      showToast("success", "Invitación cancelada");
    } catch { showToast("error", "Error"); }
  };

  const handleRemoveMember = async (memberId: string) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/members`, memberId));
      await deleteDoc(doc(db, `userProjects/${memberId}/projects`, id as string));
      setMembers(members.filter((m) => m.userId !== memberId));
      showToast("success", "Miembro eliminado");
    } catch { showToast("error", "Error"); } finally { setSaving(false); setActiveMenu(null); }
  };

  const closeModal = () => {
    setShowInviteModal(false);
    setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } });
    setUserExists(null); setFoundUser(null);
  };

  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase()));
  const projectMembers = filteredMembers.filter((m) => PROJECT_ROLES.includes(m.role || ""));
  const deptMembers = filteredMembers.filter((m) => !PROJECT_ROLES.includes(m.role || "") && m.department);

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>;

  if (!hasConfigAccess) return (
    <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
      <div className="text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={28} className="text-slate-400" /></div>
        <p className="text-slate-600 text-sm mb-4">No tienes acceso a esta configuración</p>
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><ArrowLeft size={16} />Volver al dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {toast && <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>{toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}{toast.message}</div>}

      {/* Header */}
      <div className="mt-[4.5rem] border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6"><ArrowLeft size={16} />Volver al dashboard</Link>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center"><UserCog size={24} className="text-slate-600" /></div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{projectName}</h1>
                <p className="text-slate-500 text-sm mt-1">Usuarios del proyecto · {members.length} usuario{members.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><UserPlus size={16} />Invitar</button>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><Mail size={18} className="text-white" /></div>
              <h2 className="text-base font-semibold text-white">{pendingInvitations.length} invitación{pendingInvitations.length !== 1 ? "es" : ""} pendiente{pendingInvitations.length !== 1 ? "s" : ""}</h2>
            </div>
            <div className="grid gap-2">
              {pendingInvitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between bg-white rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold text-sm">{inv.invitedName?.[0]?.toUpperCase()}</div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{inv.invitedName}</p>
                      <p className="text-xs text-slate-500">{inv.roleType === "project" ? inv.role : `${inv.position} · ${inv.department}`}</p>
                    </div>
                  </div>
                  <button onClick={() => handleCancelInvitation(inv.id)} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        {members.length > 0 && (
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Buscar miembro..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm bg-slate-50" />
          </div>
        )}

        {/* Project Roles */}
        {projectMembers.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <Shield size={18} className="text-slate-400" />
              <h3 className="font-semibold text-slate-900">Roles de proyecto</h3>
              <span className="ml-auto text-xs text-slate-400">{projectMembers.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {projectMembers.map((m) => {
                const roleStyle = roleColors[m.role || ""] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
                return (
                  <div key={m.userId} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-semibold text-sm">{m.name?.[0]?.toUpperCase()}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{m.name}</p>
                          {m.userId === userId && <span className="text-xs text-slate-400">(tú)</span>}
                        </div>
                        <p className="text-sm text-slate-500">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${roleStyle.bg} ${roleStyle.text} border ${roleStyle.border}`}>{m.role}</span>
                      {m.userId !== userId && (
                        <div className="relative">
                          <button onClick={() => setActiveMenu(activeMenu === m.userId ? null : m.userId)} className="p-2 text-slate-300 hover:text-slate-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><MoreHorizontal size={16} /></button>
                          {activeMenu === m.userId && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                              <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20">
                                <button onClick={() => handleRemoveMember(m.userId)} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={14} />Eliminar</button>
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
          </div>
        )}

        {/* Department Members */}
        {deptMembers.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <Briefcase size={18} className="text-slate-400" />
              <h3 className="font-semibold text-slate-900">Departamentos</h3>
              <span className="ml-auto text-xs text-slate-400">{deptMembers.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {deptMembers.map((m) => (
                <div key={m.userId} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-semibold text-sm">{m.name?.[0]?.toUpperCase()}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{m.name}</p>
                        {m.userId === userId && <span className="text-xs text-slate-400">(tú)</span>}
                      </div>
                      <p className="text-sm text-slate-500">{m.position} · {m.department}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {m.permissions.accounting && <span className="px-2 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded border border-indigo-100">ACC</span>}
                      {m.permissions.team && <span className="px-2 py-1 text-[10px] font-bold text-amber-600 bg-amber-50 rounded border border-amber-100">TEAM</span>}
                    </div>
                    {m.userId !== userId && (
                      <div className="relative">
                        <button onClick={() => setActiveMenu(activeMenu === m.userId ? null : m.userId)} className="p-2 text-slate-300 hover:text-slate-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><MoreHorizontal size={16} /></button>
                        {activeMenu === m.userId && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20">
                              <button onClick={() => handleRemoveMember(m.userId)} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={14} />Eliminar</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredMembers.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <Users size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 text-sm font-medium mb-1">{searchTerm ? "Sin resultados" : "Sin miembros"}</p>
            <p className="text-slate-400 text-xs mb-4">{searchTerm ? "Prueba con otro término" : "Invita al primer miembro del equipo"}</p>
            {!searchTerm && <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><UserPlus size={14} />Invitar</button>}
          </div>
        )}
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Invitar usuario</h3>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Email</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm bg-slate-50" />
                {userExists === true && <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={12} />Usuario registrado</p>}
                {userExists === false && inviteForm.email.length > 3 && <p className="mt-2 text-xs text-amber-600 flex items-center gap-1"><Clock size={12} />Se enviará invitación para registrarse</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Nombre</label>
                <input type="text" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} disabled={userExists === true} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Tipo</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setInviteForm({ ...inviteForm, roleType: "project", department: "", position: "" })} className={`p-3 rounded-xl border text-sm font-medium transition-all ${inviteForm.roleType === "project" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>Proyecto</button>
                  <button onClick={() => setInviteForm({ ...inviteForm, roleType: "department", role: "" })} className={`p-3 rounded-xl border text-sm font-medium transition-all ${inviteForm.roleType === "department" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>Departamento</button>
                </div>
              </div>
              {inviteForm.roleType === "project" && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Rol</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PROJECT_ROLES.map((r) => {
                      const style = roleColors[r];
                      const isSelected = inviteForm.role === r;
                      return <button key={r} onClick={() => setInviteForm({ ...inviteForm, role: r })} className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${isSelected ? `${style.border} ${style.bg} ${style.text}` : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>{r}</button>;
                    })}
                  </div>
                </div>
              )}
              {inviteForm.roleType === "department" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Departamento</label>
                    <select value={inviteForm.department} onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm bg-slate-50">
                      <option value="">Seleccionar...</option>
                      {departments.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Posición</label>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPARTMENT_POSITIONS.map((p) => <button key={p} onClick={() => setInviteForm({ ...inviteForm, position: p })} className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${inviteForm.position === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{p}</button>)}
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Permisos adicionales</label>
                <div className="flex gap-3">
                  <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${inviteForm.permissions.accounting ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="checkbox" checked={inviteForm.permissions.accounting} onChange={(e) => setInviteForm({ ...inviteForm, permissions: { ...inviteForm.permissions, accounting: e.target.checked } })} className="sr-only" />
                    <span className={`text-sm font-medium ${inviteForm.permissions.accounting ? "text-indigo-700" : "text-slate-500"}`}>Contabilidad</span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${inviteForm.permissions.team ? "border-amber-300 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="checkbox" checked={inviteForm.permissions.team} onChange={(e) => setInviteForm({ ...inviteForm, permissions: { ...inviteForm.permissions, team: e.target.checked } })} className="sr-only" />
                    <span className={`text-sm font-medium ${inviteForm.permissions.team ? "text-amber-700" : "text-slate-500"}`}>Equipo</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-slate-50">
              <button onClick={closeModal} className="flex-1 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
              <button onClick={handleSendInvitation} disabled={saving} className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{saving ? "Enviando..." : "Enviar invitación"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

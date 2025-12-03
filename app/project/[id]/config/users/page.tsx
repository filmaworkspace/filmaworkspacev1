"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Users,
  UserPlus,
  Search,
  Grid3x3,
  List,
  Trash2,
  Shield,
  X,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  UserX,
  Clock,
  UserCircle,
  Folder,
  ChevronRight,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const DEPARTMENT_POSITIONS = ["HOD", "Coordinator", "Crew"];

interface Member { userId: string; name: string; email: string; role?: string; department?: string; position?: string; permissions: { config: boolean; accounting: boolean; team: boolean }; addedAt: any; addedBy?: string; addedByName?: string; }
interface PendingInvitation { id: string; invitedEmail: string; invitedName: string; roleType: "project" | "department"; role?: string; department?: string; position?: string; status: string; createdAt: any; invitedBy: string; invitedByName: string; }
interface Department { name: string; }

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
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [foundUser, setFoundUser] = useState<{ name: string; email: string } | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", roleType: "project" as "project" | "department", role: "", department: "", position: "", permissions: { accounting: false, team: false } });

  useEffect(() => { const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/"); else { setUserId(u.uid); setUserName(u.displayName || u.email || "Usuario"); } }); return () => unsub(); }, [router]);

  useEffect(() => {
    if (!userId || !id) return;
    const loadData = async () => {
      try {
        const userProjectRef = doc(db, `userProjects/${userId}/projects/${id}`);
        const userProjectSnap = await getDoc(userProjectRef);
        if (!userProjectSnap.exists()) { setErrorMessage("No tienes acceso"); setLoading(false); return; }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setErrorMessage("Sin permisos de configuración"); setLoading(false); return; }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) { setProjectName(projectSnap.data().name); setDepartments((projectSnap.data().departments || []).map((d: string) => ({ name: d }))); }

        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMembers(membersSnap.docs.map((d) => ({ userId: d.id, name: d.data().name, email: d.data().email, role: d.data().role, department: d.data().department, position: d.data().position, permissions: d.data().permissions || { config: false, accounting: false, team: false }, addedAt: d.data().addedAt, addedBy: d.data().addedBy, addedByName: d.data().addedByName })));

        const invSnap = await getDocs(query(collection(db, "invitations"), where("projectId", "==", id), where("status", "==", "pending")));
        setPendingInvitations(invSnap.docs.map((d) => ({ id: d.id, invitedEmail: d.data().invitedEmail, invitedName: d.data().invitedName, roleType: d.data().roleType || "project", role: d.data().role, department: d.data().department, position: d.data().position, status: d.data().status, createdAt: d.data().createdAt, invitedBy: d.data().invitedBy, invitedByName: d.data().invitedByName })));
        setLoading(false);
      } catch (error) { setErrorMessage("Error al cargar"); setLoading(false); }
    };
    loadData();
  }, [userId, id, router]);

  useEffect(() => {
    const checkUser = async () => {
      if (!inviteForm.email || inviteForm.email.length < 3) { setUserExists(null); setFoundUser(null); return; }
      try {
        const snap = await getDocs(query(collection(db, "users"), where("email", "==", inviteForm.email.toLowerCase().trim())));
        if (!snap.empty) { const d = snap.docs[0].data(); setUserExists(true); setFoundUser({ name: d.name || d.email, email: d.email }); setInviteForm((p) => ({ ...p, name: d.name || d.email })); }
        else { setUserExists(false); setFoundUser(null); }
      } catch (e) {}
    };
    const t = setTimeout(checkUser, 500);
    return () => clearTimeout(t);
  }, [inviteForm.email]);

  const handleSendInvitation = async () => {
    if (!id || !inviteForm.email.trim() || !inviteForm.name.trim()) { setErrorMessage("Email y nombre obligatorios"); setTimeout(() => setErrorMessage(""), 3000); return; }
    if (inviteForm.roleType === "department" && (!inviteForm.department || !inviteForm.position)) { setErrorMessage("Selecciona departamento y posición"); setTimeout(() => setErrorMessage(""), 3000); return; }
    if (inviteForm.roleType === "project" && !inviteForm.role) { setErrorMessage("Selecciona un rol"); setTimeout(() => setErrorMessage(""), 3000); return; }
    setSaving(true);
    try {
      const email = inviteForm.email.trim().toLowerCase();
      if (members.find((m) => m.email === email)) { setErrorMessage("Ya es miembro"); setSaving(false); return; }
      if (pendingInvitations.find((i) => i.invitedEmail === email)) { setErrorMessage("Ya invitado"); setSaving(false); return; }

      const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      const inviteData: any = { projectId: id, projectName, invitedEmail: email, invitedName: inviteForm.name.trim(), invitedUserId: usersSnap.empty ? null : usersSnap.docs[0].id, invitedBy: userId, invitedByName: userName, status: "pending", createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), roleType: inviteForm.roleType };
      if (inviteForm.roleType === "project") { inviteData.role = inviteForm.role; inviteData.permissions = { config: ["EP", "PM"].includes(inviteForm.role), accounting: inviteForm.permissions.accounting, team: inviteForm.permissions.team }; }
      else { inviteData.department = inviteForm.department; inviteData.position = inviteForm.position; inviteData.permissions = { config: false, accounting: inviteForm.permissions.accounting, team: inviteForm.permissions.team }; }

      await setDoc(doc(collection(db, "invitations")), inviteData);
      setSuccessMessage(`Invitación enviada a ${inviteForm.name}`);
      setTimeout(() => setSuccessMessage(""), 3000);

      const invSnap = await getDocs(query(collection(db, "invitations"), where("projectId", "==", id), where("status", "==", "pending")));
      setPendingInvitations(invSnap.docs.map((d) => ({ id: d.id, invitedEmail: d.data().invitedEmail, invitedName: d.data().invitedName, roleType: d.data().roleType || "project", role: d.data().role, department: d.data().department, position: d.data().position, status: d.data().status, createdAt: d.data().createdAt, invitedBy: d.data().invitedBy, invitedByName: d.data().invitedByName })));
      setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } });
      setUserExists(null); setFoundUser(null); setShowInviteModal(false);
    } catch (e) { setErrorMessage("Error al invitar"); }
    finally { setSaving(false); }
  };

  const handleCancelInvitation = async (invId: string) => {
    if (!confirm("¿Cancelar invitación?")) return;
    try { await deleteDoc(doc(db, "invitations", invId)); setPendingInvitations(pendingInvitations.filter((i) => i.id !== invId)); setSuccessMessage("Invitación cancelada"); setTimeout(() => setSuccessMessage(""), 3000); }
    catch (e) { setErrorMessage("Error"); }
  };

  const handleRemoveMember = async (memberId: string) => {
    const m = members.find((m) => m.userId === memberId);
    if (!confirm(`¿Eliminar a ${m?.name}?`)) return;
    setSaving(true);
    try { await deleteDoc(doc(db, `projects/${id}/members`, memberId)); await deleteDoc(doc(db, `userProjects/${memberId}/projects`, id as string)); setMembers(members.filter((m) => m.userId !== memberId)); setSuccessMessage("Miembro eliminado"); setTimeout(() => setSuccessMessage(""), 3000); }
    catch (e) { setErrorMessage("Error"); }
    finally { setSaving(false); }
  };

  const filteredMembers = members.filter((m) => {
    const match = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase());
    if (roleFilter === "all") return match;
    if (roleFilter === "project") return match && PROJECT_ROLES.includes(m.role || "");
    if (roleFilter === "unassigned") return match && !m.department && !m.role;
    return match && m.department === roleFilter;
  });

  const uniqueDepts = Array.from(new Set(members.map((m) => m.department).filter(Boolean))) as string[];

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-600 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !hasConfigAccess) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-md"><AlertCircle size={48} className="mx-auto text-red-500 mb-4" /><p className="text-slate-700 mb-4">{errorMessage}</p><Link href="/dashboard" className="text-slate-900 hover:underline font-medium">Volver</Link></div></div>;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between mb-2">
            <div className="text-slate-400 text-sm flex items-center gap-1"><Folder size={14} />{projectName}<ChevronRight size={14} /><span>Configuración</span></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center"><Users size={24} className="text-white" /></div>
            <div>
              <h1 className={`text-2xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Usuarios del proyecto</h1>
              <p className="text-slate-400 text-sm">{members.length} usuario{members.length !== 1 ? "s" : ""} • {pendingInvitations.length} pendiente{pendingInvitations.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {successMessage && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700"><CheckCircle2 size={20} /><span className="font-medium">{successMessage}</span></div>}
          {errorMessage && hasConfigAccess && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700"><AlertCircle size={20} /><span>{errorMessage}</span></div>}

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4"><Clock size={18} className="text-amber-600" /><h3 className="text-sm font-semibold text-amber-900">Invitaciones pendientes ({pendingInvitations.length})</h3></div>
              <div className="space-y-2">
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between bg-white p-4 rounded-xl border border-amber-200">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{inv.invitedName}</p>
                      <p className="text-xs text-slate-500">{inv.invitedEmail}</p>
                      <p className="text-xs text-slate-500 mt-1">{inv.roleType === "project" ? inv.role : `${inv.position} • ${inv.department}`}</p>
                    </div>
                    <button onClick={() => handleCancelInvitation(inv.id)} className="px-3 py-1.5 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-medium transition-colors">Cancelar</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Users size={20} className="text-slate-600" /></div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Miembros del equipo</h2>
                    <p className="text-sm text-slate-500">{filteredMembers.length} usuario{filteredMembers.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"><UserPlus size={16} />Invitar</button>
              </div>

              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 text-sm" />
                </div>
                <div className="flex gap-2">
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 text-sm">
                    <option value="all">Todos</option>
                    <option value="project">Roles de proyecto</option>
                    {uniqueDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="unassigned">Sin asignar</option>
                  </select>
                  <div className="flex border border-slate-200 rounded-xl overflow-hidden">
                    <button onClick={() => setViewMode("cards")} className={`px-3 py-2.5 transition-colors ${viewMode === "cards" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}><Grid3x3 size={16} /></button>
                    <button onClick={() => setViewMode("table")} className={`px-3 py-2.5 transition-colors border-l border-slate-200 ${viewMode === "table" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}><List size={16} /></button>
                  </div>
                </div>
              </div>

              {/* Members */}
              {filteredMembers.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                  <Users size={40} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium mb-1">No hay usuarios</p>
                  <p className="text-sm text-slate-500">{searchTerm || roleFilter !== "all" ? "Ajusta los filtros" : "Invita al primer miembro"}</p>
                </div>
              ) : viewMode === "cards" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMembers.map((m) => {
                    const isProject = PROJECT_ROLES.includes(m.role || "");
                    return (
                      <div key={m.userId} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all bg-white">
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-11 h-11 rounded-xl ${isProject ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"} flex items-center justify-center text-lg font-semibold`}>{m.name?.[0]?.toUpperCase()}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-900 truncate">{m.name}</p>{isProject && <Shield size={14} className="text-slate-900 flex-shrink-0" />}</div>
                            <p className="text-xs text-slate-500 truncate">{m.email}</p>
                          </div>
                        </div>
                        <div className="mb-3">
                          {isProject ? <span className="inline-block text-xs font-medium bg-slate-900 text-white px-2.5 py-1 rounded-lg">{m.role}</span>
                          : m.department && m.position ? <p className="text-sm text-slate-600"><span className="font-medium text-slate-900">{m.position}</span><span className="text-slate-400"> • </span>{m.department}</p>
                          : <span className="text-xs text-slate-400">Sin asignar</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {m.permissions.config && <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">Config</span>}
                          {m.permissions.accounting && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">Accounting</span>}
                          {m.permissions.team && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">Team</span>}
                        </div>
                        {m.userId !== userId && <button onClick={() => handleRemoveMember(m.userId)} disabled={saving} className="w-full flex items-center justify-center gap-2 text-sm text-red-600 hover:bg-red-50 py-2 rounded-lg transition-colors"><Trash2 size={14} />Eliminar</button>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-200"><th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th><th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol / Dpto</th><th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Permisos</th><th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24"></th></tr></thead>
                    <tbody>
                      {filteredMembers.map((m) => {
                        const isProject = PROJECT_ROLES.includes(m.role || "");
                        return (
                          <tr key={m.userId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg ${isProject ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"} flex items-center justify-center text-xs font-semibold`}>{m.name?.[0]?.toUpperCase()}</div><div><div className="flex items-center gap-2"><p className="text-sm font-medium text-slate-900">{m.name}</p>{isProject && <Shield size={12} className="text-slate-900" />}</div><p className="text-xs text-slate-500">{m.email}</p></div></div></td>
                            <td className="py-3 px-4">{isProject ? <span className="text-sm font-medium text-slate-900">{m.role}</span> : m.department && m.position ? <span className="text-sm text-slate-600"><span className="font-medium text-slate-900">{m.position}</span> • {m.department}</span> : <span className="text-xs text-slate-400">Sin asignar</span>}</td>
                            <td className="py-3 px-4"><div className="flex gap-1.5 flex-wrap">{m.permissions.config && <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">Config</span>}{m.permissions.accounting && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">Accounting</span>}{m.permissions.team && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">Team</span>}{!m.permissions.config && !m.permissions.accounting && !m.permissions.team && <span className="text-xs text-slate-400">—</span>}</div></td>
                            <td className="py-3 px-4 text-right">{m.userId !== userId && <button onClick={() => handleRemoveMember(m.userId)} className="text-slate-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>}</td>
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

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Invitar usuario</h3>
              <button onClick={() => { setShowInviteModal(false); setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } }); setUserExists(null); setFoundUser(null); }} className="text-white/60 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Email */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Email</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="usuario@ejemplo.com" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 text-sm" />
                {userExists === true && foundUser && <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2"><UserCheck size={16} className="text-emerald-600" /><div><p className="text-xs font-medium text-emerald-900">Usuario registrado</p><p className="text-xs text-emerald-700">{foundUser.name}</p></div></div>}
                {userExists === false && inviteForm.email.length > 3 && <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2"><UserX size={16} className="text-amber-600" /><p className="text-xs text-amber-700">Se enviará invitación para crear cuenta</p></div>}
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                <input type="text" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Nombre completo" disabled={userExists === true} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 text-sm disabled:bg-slate-100" />
              </div>

              {/* Role Type */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Tipo de rol</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setInviteForm({ ...inviteForm, roleType: "project" })} className={`p-3 rounded-xl border-2 text-left transition-all ${inviteForm.roleType === "project" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}><p className={`text-sm font-medium ${inviteForm.roleType === "project" ? "text-slate-900" : "text-slate-600"}`}>Rol de proyecto</p><p className="text-xs text-slate-500">EP, PM, Controller, PC</p></button>
                  <button onClick={() => setInviteForm({ ...inviteForm, roleType: "department" })} className={`p-3 rounded-xl border-2 text-left transition-all ${inviteForm.roleType === "department" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}><p className={`text-sm font-medium ${inviteForm.roleType === "department" ? "text-slate-900" : "text-slate-600"}`}>Departamento</p><p className="text-xs text-slate-500">HOD, Coord, Crew</p></button>
                </div>
              </div>

              {/* Project Role */}
              {inviteForm.roleType === "project" ? (
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Rol</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PROJECT_ROLES.map((r) => <button key={r} onClick={() => setInviteForm({ ...inviteForm, role: r })} className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${inviteForm.role === r ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 hover:border-slate-300 text-slate-600"}`}>{r}</button>)}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Departamento</label>
                    <select value={inviteForm.department} onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 text-sm">
                      <option value="">Seleccionar</option>
                      {departments.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Posición</label>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPARTMENT_POSITIONS.map((p) => <button key={p} onClick={() => setInviteForm({ ...inviteForm, position: p })} className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${inviteForm.position === p ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 hover:border-slate-300 text-slate-600"}`}>{p}</button>)}
                    </div>
                  </div>
                </>
              )}

              {/* Permissions */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Permisos adicionales</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${inviteForm.permissions.accounting ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                    <input type="checkbox" checked={inviteForm.permissions.accounting} onChange={(e) => setInviteForm({ ...inviteForm, permissions: { ...inviteForm.permissions, accounting: e.target.checked } })} className="w-4 h-4 text-slate-900 border-slate-300 rounded" />
                    <span className="text-sm text-slate-700">Contabilidad</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${inviteForm.permissions.team ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                    <input type="checkbox" checked={inviteForm.permissions.team} onChange={(e) => setInviteForm({ ...inviteForm, permissions: { ...inviteForm.permissions, team: e.target.checked } })} className="w-4 h-4 text-slate-900 border-slate-300 rounded" />
                    <span className="text-sm text-slate-700">Equipo</span>
                  </label>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowInviteModal(false); setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } }); setUserExists(null); setFoundUser(null); }} className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors">Cancelar</button>
                <button onClick={handleSendInvitation} disabled={saving} className="flex-1 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50">{saving ? "Enviando..." : "Enviar invitación"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

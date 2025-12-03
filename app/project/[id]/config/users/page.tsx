"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
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
  ChevronRight,
  ChevronDown,
  Mail,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const DEPARTMENT_POSITIONS = ["HOD", "Coordinator", "Crew"];

interface Member { userId: string; name: string; email: string; role?: string; department?: string; position?: string; permissions: { config: boolean; accounting: boolean; team: boolean }; }
interface PendingInvitation { id: string; invitedEmail: string; invitedName: string; roleType: "project" | "department"; role?: string; department?: string; position?: string; }
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
  const [searchTerm, setSearchTerm] = useState("");
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
        const userProjectSnap = await getDoc(doc(db, `userProjects/${userId}/projects/${id}`));
        if (!userProjectSnap.exists()) { setErrorMessage("No tienes acceso"); setLoading(false); return; }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setErrorMessage("Sin permisos"); setLoading(false); return; }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) { setProjectName(projectSnap.data().name); setDepartments((projectSnap.data().departments || []).map((d: string) => ({ name: d }))); }

        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMembers(membersSnap.docs.map((d) => ({ userId: d.id, name: d.data().name, email: d.data().email, role: d.data().role, department: d.data().department, position: d.data().position, permissions: d.data().permissions || { config: false, accounting: false, team: false } })));

        const invSnap = await getDocs(query(collection(db, "invitations"), where("projectId", "==", id), where("status", "==", "pending")));
        setPendingInvitations(invSnap.docs.map((d) => ({ id: d.id, invitedEmail: d.data().invitedEmail, invitedName: d.data().invitedName, roleType: d.data().roleType || "project", role: d.data().role, department: d.data().department, position: d.data().position })));
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
      setSuccessMessage(`Invitación enviada`);
      setTimeout(() => setSuccessMessage(""), 3000);

      const invSnap = await getDocs(query(collection(db, "invitations"), where("projectId", "==", id), where("status", "==", "pending")));
      setPendingInvitations(invSnap.docs.map((d) => ({ id: d.id, invitedEmail: d.data().invitedEmail, invitedName: d.data().invitedName, roleType: d.data().roleType || "project", role: d.data().role, department: d.data().department, position: d.data().position })));
      setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } });
      setUserExists(null); setFoundUser(null); setShowInviteModal(false);
    } catch (e) { setErrorMessage("Error al invitar"); }
    finally { setSaving(false); }
  };

  const handleCancelInvitation = async (invId: string) => {
    if (!confirm("¿Cancelar invitación?")) return;
    try { await deleteDoc(doc(db, "invitations", invId)); setPendingInvitations(pendingInvitations.filter((i) => i.id !== invId)); setSuccessMessage("Cancelada"); setTimeout(() => setSuccessMessage(""), 3000); }
    catch (e) { setErrorMessage("Error"); }
  };

  const handleRemoveMember = async (memberId: string) => {
    const m = members.find((m) => m.userId === memberId);
    if (!confirm(`¿Eliminar a ${m?.name}?`)) return;
    setSaving(true);
    try { await deleteDoc(doc(db, `projects/${id}/members`, memberId)); await deleteDoc(doc(db, `userProjects/${memberId}/projects`, id as string)); setMembers(members.filter((m) => m.userId !== memberId)); setSuccessMessage("Eliminado"); setTimeout(() => setSuccessMessage(""), 3000); }
    catch (e) { setErrorMessage("Error"); }
    finally { setSaving(false); }
  };

  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase()));
  const projectMembers = filteredMembers.filter((m) => PROJECT_ROLES.includes(m.role || ""));
  const deptMembers = filteredMembers.filter((m) => !PROJECT_ROLES.includes(m.role || "") && m.department);
  const unassigned = filteredMembers.filter((m) => !m.role && !m.department);

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-10 h-10 border-[3px] border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3"></div><p className="text-slate-400 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !hasConfigAccess) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-sm"><div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-slate-400" /></div><p className="text-slate-600 mb-4">{errorMessage}</p><Link href="/dashboard" className="text-slate-900 hover:underline text-sm font-medium">Volver</Link></div></div>;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem] bg-slate-900">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center gap-2 text-[13px] mb-3">
            <Link href={`/project/${id}`} className="text-slate-500 hover:text-white transition-colors">{projectName}</Link>
            <ChevronRight size={12} className="text-slate-600" />
            <span className="text-slate-500">Configuración</span>
            <ChevronRight size={12} className="text-slate-600" />
            <span className="text-white font-medium">Usuarios</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[17px] font-semibold text-white">Equipo del proyecto</h1>
              <p className="text-slate-500 text-xs mt-0.5">{members.length} miembro{members.length !== 1 ? "s" : ""} • {pendingInvitations.length} pendiente{pendingInvitations.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-3.5 py-2 bg-white text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
              <UserPlus size={15} />Invitar
            </button>
          </div>
        </div>
      </div>

      <main className="flex-grow px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {successMessage && <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3"><CheckCircle size={16} className="text-emerald-600" /><span className="text-sm text-emerald-700">{successMessage}</span></div>}
          {errorMessage && hasConfigAccess && <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"><AlertCircle size={16} className="text-red-600" /><span className="text-sm text-red-700">{errorMessage}</span></div>}

          {/* Pending */}
          {pendingInvitations.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-800">Invitaciones pendientes</span>
              </div>
              <div className="space-y-2">
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between bg-white p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <Mail size={14} className="text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{inv.invitedName}</p>
                        <p className="text-xs text-slate-500">{inv.invitedEmail} • {inv.roleType === "project" ? inv.role : `${inv.position} en ${inv.department}`}</p>
                      </div>
                    </div>
                    <button onClick={() => handleCancelInvitation(inv.id)} className="text-xs text-amber-700 hover:text-amber-900 font-medium">Cancelar</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Buscar por nombre o email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm" />
          </div>

          {/* Project Roles */}
          {projectMembers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Shield size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles de proyecto</span>
                <span className="text-xs text-slate-400 ml-auto">{projectMembers.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {projectMembers.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">{m.name?.[0]?.toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">{m.role}</span>
                      {m.userId !== userId && <button onClick={() => handleRemoveMember(m.userId)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department Members */}
          {deptMembers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Users size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Departamentos</span>
                <span className="text-xs text-slate-400 ml-auto">{deptMembers.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {deptMembers.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-semibold">{m.name?.[0]?.toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.position} • {m.department}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {m.permissions.accounting && <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ACC</span>}
                        {m.permissions.team && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">TEAM</span>}
                      </div>
                      {m.userId !== userId && <button onClick={() => handleRemoveMember(m.userId)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty */}
          {filteredMembers.length === 0 && (
            <div className="text-center py-16 bg-slate-50 rounded-2xl">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">{searchTerm ? "Sin resultados" : "Sin miembros"}</p>
              <p className="text-xs text-slate-500">{searchTerm ? "Prueba con otro término" : "Invita al primer miembro del equipo"}</p>
            </div>
          )}
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900">Invitar usuario</h3>
              <button onClick={() => { setShowInviteModal(false); setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } }); setUserExists(null); setFoundUser(null); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="usuario@ejemplo.com" className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" />
                {userExists === true && foundUser && <div className="mt-2 p-2.5 bg-emerald-50 rounded-lg flex items-center gap-2"><UserCheck size={14} className="text-emerald-600" /><span className="text-xs text-emerald-700">Usuario registrado: {foundUser.name}</span></div>}
                {userExists === false && inviteForm.email.length > 3 && <div className="mt-2 p-2.5 bg-amber-50 rounded-lg flex items-center gap-2"><UserX size={14} className="text-amber-600" /><span className="text-xs text-amber-700">Se enviará invitación para registrarse</span></div>}
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Nombre</label>
                <input type="text" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Nombre completo" disabled={userExists === true} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setInviteForm({ ...inviteForm, roleType: "project", department: "", position: "" })} className={`p-3 rounded-xl border text-left transition-all ${inviteForm.roleType === "project" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <p className={`text-sm font-medium ${inviteForm.roleType === "project" ? "text-slate-900" : "text-slate-600"}`}>Proyecto</p>
                    <p className="text-[10px] text-slate-500">EP, PM, Controller...</p>
                  </button>
                  <button onClick={() => setInviteForm({ ...inviteForm, roleType: "department", role: "" })} className={`p-3 rounded-xl border text-left transition-all ${inviteForm.roleType === "department" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <p className={`text-sm font-medium ${inviteForm.roleType === "department" ? "text-slate-900" : "text-slate-600"}`}>Departamento</p>
                    <p className="text-[10px] text-slate-500">HOD, Coord, Crew</p>
                  </button>
                </div>
              </div>

              {inviteForm.roleType === "project" ? (
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Rol</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PROJECT_ROLES.map((r) => (
                      <button key={r} onClick={() => setInviteForm({ ...inviteForm, role: r })} className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${inviteForm.role === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{r}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Departamento</label>
                    <select value={inviteForm.department} onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm">
                      <option value="">Seleccionar...</option>
                      {departments.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Posición</label>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPARTMENT_POSITIONS.map((p) => (
                        <button key={p} onClick={() => setInviteForm({ ...inviteForm, position: p })} className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${inviteForm.position === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{p}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Permisos adicionales</label>
                <div className="flex gap-2">
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${inviteForm.permissions.accounting ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                    <input type="checkbox" checked={inviteForm.permissions.accounting} onChange={(e) => setInviteForm({ ...inviteForm, permissions: { ...inviteForm.permissions, accounting: e.target.checked } })} className="w-4 h-4 text-slate-900 rounded" />
                    <span className="text-xs text-slate-700">Contabilidad</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${inviteForm.permissions.team ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                    <input type="checkbox" checked={inviteForm.permissions.team} onChange={(e) => setInviteForm({ ...inviteForm, permissions: { ...inviteForm.permissions, team: e.target.checked } })} className="w-4 h-4 text-slate-900 rounded" />
                    <span className="text-xs text-slate-700">Equipo</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => { setShowInviteModal(false); setInviteForm({ email: "", name: "", roleType: "project", role: "", department: "", position: "", permissions: { accounting: false, team: false } }); setUserExists(null); setFoundUser(null); }} className="flex-1 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
              <button onClick={handleSendInvitation} disabled={saving} className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{saving ? "Enviando..." : "Enviar invitación"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

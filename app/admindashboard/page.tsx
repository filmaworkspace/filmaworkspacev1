"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import {
  LayoutDashboard, FolderPlus, Users, Building2, Search, X, Edit2, Trash2, UserPlus, Briefcase,
  CheckCircle, AlertCircle, Shield, Plus, Eye, ExternalLink, ChevronDown, ChevronUp, RefreshCw,
  Clock, LayoutGrid, List, FolderOpen, Folder,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];

const phaseColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Desarrollo: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", dot: "bg-sky-500" },
  Preproducción: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  Rodaje: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500" },
  Postproducción: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  Finalizado: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC", "Supervisor"];

const DEFAULT_DEPARTMENTS = [
  { name: "Producción", color: "#3B82F6" }, { name: "Dirección", color: "#8B5CF6" },
  { name: "Fotografía", color: "#F59E0B" }, { name: "Arte", color: "#10B981" },
  { name: "Sonido", color: "#EC4899" }, { name: "Vestuario", color: "#6366F1" },
  { name: "Maquillaje", color: "#14B8A6" }, { name: "Localizaciones", color: "#F97316" },
];

interface Project { id: string; name: string; phase: string; description?: string; producers?: string[]; producerNames?: string[]; createdAt: Timestamp; memberCount: number; members?: Member[]; }
interface Member { odId: string; name: string; email: string; role?: string; position?: string; }
interface User { id: string; name: string; email: string; role: string; projectCount: number; projects: UserProject[]; }
interface UserProject { id: string; name: string; role?: string; position?: string; }
interface Producer { id: string; name: string; createdAt: Timestamp; projectCount: number; }

export default function AdminDashboard() {
  const router = useRouter();
  const { user: contextUser, isLoading: userLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"projects" | "users" | "producers">("projects");

  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);

  const [projectSearch, setProjectSearch] = useState("");
  const [projectPhaseFilter, setProjectPhaseFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [producerSearch, setProducerSearch] = useState("");
  const [producerModalSearch, setProducerModalSearch] = useState("");

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateProducer, setShowCreateProducer] = useState(false);
  const [showEditProducer, setShowEditProducer] = useState<string | null>(null);
  const [showUserDetails, setShowUserDetails] = useState<string | null>(null);
  const [showAssignUser, setShowAssignUser] = useState<string | null>(null);
  const [showEditProject, setShowEditProject] = useState<string | null>(null);

  const [newProject, setNewProject] = useState({ name: "", description: "", phase: "Desarrollo", producers: [] as string[] });
  const [newProducer, setNewProducer] = useState({ name: "" });
  const [assignUserForm, setAssignUserForm] = useState({ odId: "", role: "" });
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Allow admin role OR specific admin email
  const isAdmin = contextUser?.role === "admin" || contextUser?.email === "admin@filmaworkspace.com";

  useEffect(() => {
    if (!userLoading && !isAdmin) {
      router.push("/dashboard");
    }
  }, [contextUser, userLoading, router, isAdmin]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    if (!contextUser?.uid) return;
    try {
      const producersSnap = await getDocs(collection(db, "producers"));
      const producersData: Producer[] = producersSnap.docs.map((d) => ({ id: d.id, name: d.data().name, createdAt: d.data().createdAt, projectCount: 0 }));

      const projectsSnap = await getDocs(collection(db, "projects"));
      const projectsData: Project[] = await Promise.all(
        projectsSnap.docs.map(async (projectDoc) => {
          const data = projectDoc.data();
          const producerIds = data.producers || [];
          const producerNames = producerIds.map((pid: string) => producersData.find((p) => p.id === pid)?.name || "Eliminada");
          const membersSnap = await getDocs(collection(db, `projects/${projectDoc.id}/members`));
          const members: Member[] = membersSnap.docs.map((m) => ({ odId: m.id, name: m.data().name, email: m.data().email, role: m.data().role, position: m.data().position }));
          return { id: projectDoc.id, name: data.name, phase: data.phase, description: data.description || "", producers: producerIds, producerNames, createdAt: data.createdAt, memberCount: membersSnap.size, members };
        })
      );

      producersData.forEach((p) => { p.projectCount = projectsData.filter((pr) => pr.producers?.includes(p.id)).length; });
      setProjects(projectsData);
      setProducers(producersData);

      const usersSnap = await getDocs(collection(db, "users"));
      const usersData: User[] = await Promise.all(
        usersSnap.docs.map(async (userDoc) => {
          const data = userDoc.data();
          const userProjectsSnap = await getDocs(collection(db, `userProjects/${userDoc.id}/projects`));
          const userProjects: UserProject[] = await Promise.all(
            userProjectsSnap.docs.map(async (upDoc) => {
              const upData = upDoc.data();
              const projectDoc = await getDoc(doc(db, "projects", upDoc.id));
              return { id: upDoc.id, name: projectDoc.exists() ? projectDoc.data().name : "Eliminado", role: upData.role, position: upData.position };
            })
          );
          return { id: userDoc.id, name: data.name || data.email, email: data.email, role: data.role || "user", projectCount: userProjectsSnap.size, projects: userProjects };
        })
      );
      setUsers(usersData);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error(error);
      showToast("error", "Error al cargar los datos");
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { if (contextUser?.uid && isAdmin) loadData(); }, [contextUser?.uid, isAdmin]);

  const handleRefresh = async () => { setRefreshing(true); await loadData(); showToast("success", "Datos actualizados"); };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) { showToast("error", "El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const projectRef = doc(collection(db, "projects"));
      await setDoc(projectRef, { name: newProject.name.trim(), description: newProject.description.trim(), phase: newProject.phase, producers: newProject.producers, createdAt: serverTimestamp() });
      for (const dept of DEFAULT_DEPARTMENTS) {
        const deptRef = doc(collection(db, `projects/${projectRef.id}/departments`));
        await setDoc(deptRef, { name: dept.name, color: dept.color, createdAt: serverTimestamp() });
      }
      setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
      setShowCreateProject(false);
      showToast("success", "Proyecto creado correctamente");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al crear el proyecto"); } finally { setSaving(false); }
  };

  const handleEditProject = async () => {
    if (!showEditProject) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", showEditProject), { name: newProject.name.trim(), description: newProject.description.trim(), phase: newProject.phase, producers: newProject.producers });
      setShowEditProject(null);
      showToast("success", "Proyecto actualizado");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al actualizar"); } finally { setSaving(false); }
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!confirm(`¿Eliminar "${project.name}"? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `userProjects/${memberDoc.id}/projects/${projectId}`));
        await deleteDoc(memberDoc.ref);
      }
      const deptsSnap = await getDocs(collection(db, `projects/${projectId}/departments`));
      for (const deptDoc of deptsSnap.docs) { await deleteDoc(deptDoc.ref); }
      await deleteDoc(doc(db, "projects", projectId));
      showToast("success", "Proyecto eliminado");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al eliminar"); } finally { setSaving(false); }
  };

  const handleCreateProducer = async () => {
    if (!newProducer.name.trim()) { showToast("error", "El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const producerRef = doc(collection(db, "producers"));
      await setDoc(producerRef, { name: newProducer.name.trim(), createdAt: serverTimestamp() });
      setNewProducer({ name: "" });
      setShowCreateProducer(false);
      showToast("success", "Productora creada");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al crear"); } finally { setSaving(false); }
  };

  const handleEditProducer = async () => {
    if (!showEditProducer) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "producers", showEditProducer), { name: newProducer.name.trim() });
      setShowEditProducer(null);
      setNewProducer({ name: "" });
      showToast("success", "Productora actualizada");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al actualizar"); } finally { setSaving(false); }
  };

  const handleDeleteProducer = async (producerId: string) => {
    const producer = producers.find((p) => p.id === producerId);
    if (!producer) return;
    if (producer.projectCount > 0) { showToast("error", `"${producer.name}" tiene proyectos asignados`); return; }
    if (!confirm(`¿Eliminar "${producer.name}"?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "producers", producerId));
      showToast("success", "Productora eliminada");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al eliminar"); } finally { setSaving(false); }
  };

  const handleAssignUser = async () => {
    if (!assignUserForm.odId || !assignUserForm.role || !showAssignUser) { showToast("error", "Selecciona usuario y rol"); return; }
    setSaving(true);
    try {
      const user = users.find((u) => u.id === assignUserForm.odId);
      const project = projects.find((p) => p.id === showAssignUser);
      if (!user || !project) return;
      if (project.members?.some((m) => m.odId === user.id)) { showToast("error", "Usuario ya asignado a este proyecto"); setSaving(false); return; }
      await setDoc(doc(db, `projects/${showAssignUser}/members`, user.id), { odId: user.id, name: user.name, email: user.email, role: assignUserForm.role, permissions: { config: true, accounting: true, team: true }, accountingAccessLevel: "accounting_extended", addedAt: serverTimestamp() });
      await setDoc(doc(db, `userProjects/${user.id}/projects/${showAssignUser}`), { projectId: showAssignUser, role: assignUserForm.role, permissions: { config: true, accounting: true, team: true }, accountingAccessLevel: "accounting_extended", addedAt: serverTimestamp() });
      setAssignUserForm({ odId: "", role: "" });
      setShowAssignUser(null);
      showToast("success", "Usuario asignado correctamente");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al asignar"); } finally { setSaving(false); }
  };

  const handleRemoveUserFromProject = async (projectId: string, odId: string) => {
    if (!confirm("¿Eliminar este usuario del proyecto?")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/members`, odId));
      await deleteDoc(doc(db, `userProjects/${odId}/projects/${projectId}`));
      showToast("success", "Usuario eliminado del proyecto");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al eliminar"); } finally { setSaving(false); }
  };

  const handleToggleUserRole = async (odId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`¿Cambiar rol a ${newRole === "admin" ? "Administrador" : "Usuario"}?`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", odId), { role: newRole });
      showToast("success", "Rol actualizado");
      await loadData();
    } catch (error) { console.error(error); showToast("error", "Error al actualizar"); } finally { setSaving(false); }
  };

  const toggleProjectExpand = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) newExpanded.delete(projectId);
    else newExpanded.add(projectId);
    setExpandedProjects(newExpanded);
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(projectSearch.toLowerCase());
    const matchesPhase = projectPhaseFilter === "all" || p.phase === projectPhaseFilter;
    return matchesSearch && matchesPhase;
  });

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredProducers = producers.filter((p) => p.name.toLowerCase().includes(producerSearch.toLowerCase()));

  if (loading || userLoading) {
    return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  const activeProjects = projects.filter((p) => p.phase !== "Finalizado").length;
  const adminUsers = users.filter((u) => u.role === "admin").length;

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
              <Shield size={12} />
              <span>Administración de plataforma</span>
            </div>
          </div>

          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center">
                <Shield size={24} className="text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Panel de administración</h1>
                <p className="text-sm text-slate-500 mt-0.5">Gestión global de proyectos, usuarios y productoras</p>
              </div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "..." : "Refrescar"}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Briefcase size={16} className="text-blue-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{projects.length}</span>
              </div>
              <p className="text-sm text-slate-500">Proyectos</p>
              <p className="text-xs text-emerald-600 mt-1">{activeProjects} activos</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center"><Users size={16} className="text-purple-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{users.length}</span>
              </div>
              <p className="text-sm text-slate-500">Usuarios</p>
              <p className="text-xs text-purple-600 mt-1">{adminUsers} admins</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center"><Building2 size={16} className="text-amber-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{producers.length}</span>
              </div>
              <p className="text-sm text-slate-500">Productoras</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center"><Users size={16} className="text-emerald-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{projects.reduce((acc, p) => acc + p.memberCount, 0)}</span>
              </div>
              <p className="text-sm text-slate-500">Asignaciones</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
          {[
            { id: "projects", label: "Proyectos", icon: Briefcase, count: projects.length },
            { id: "users", label: "Usuarios", icon: Users, count: users.length },
            { id: "producers", label: "Productoras", icon: Building2, count: producers.length },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
              <tab.icon size={16} />
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded text-xs ${activeTab === tab.id ? "bg-slate-100" : "bg-slate-200/50"}`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Projects Tab */}
        {activeTab === "projects" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
                <div className="relative flex-1 max-w-md">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Buscar proyectos..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm" />
                </div>
                <select value={projectPhaseFilter} onChange={(e) => setProjectPhaseFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm">
                  <option value="all">Todas las fases</option>
                  {PHASES.map((phase) => (<option key={phase} value={phase}>{phase}</option>))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                  <button onClick={() => setViewMode("grid")} className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><LayoutGrid size={16} /></button>
                  <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><List size={16} /></button>
                </div>
                <button onClick={() => setShowCreateProject(true)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors">
                  <FolderPlus size={16} />Crear proyecto
                </button>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-16">
                <FolderOpen size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium mb-2">No hay proyectos</p>
                <button onClick={() => setShowCreateProject(true)} className="text-sm text-slate-700 hover:text-slate-900 font-medium underline">Crear el primero</button>
              </div>
            ) : (
              <div className="p-4">
                <p className="text-xs text-slate-500 mb-4">{filteredProjects.length} proyectos</p>

                {viewMode === "grid" ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProjects.map((project) => {
                      const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];
                      return (
                        <div key={project.id} className="group bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-all hover:shadow-md">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${phaseStyle.dot}`}></div>
                              <h2 className="text-base font-semibold text-slate-900">{project.name}</h2>
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${phaseStyle.bg} ${phaseStyle.text} border ${phaseStyle.border}`}>{project.phase}</span>
                          </div>
                          {project.description && (<p className="text-xs text-slate-600 mb-3 line-clamp-2">{project.description}</p>)}
                          {project.producerNames && project.producerNames.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-3">
                              <Building2 size={12} className="text-amber-600" />
                              <span className="text-xs text-slate-600">{project.producerNames.join(", ")}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-4">
                            <span className="text-xs text-slate-500 flex items-center gap-1"><Users size={12} />{project.memberCount} miembros</span>
                          </div>
                          <div className="flex gap-2 pt-3 border-t border-slate-200">
                            <Link href={`/admindashboard/project/${project.id}`} className="flex-1">
                              <div className="flex items-center justify-center gap-2 p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
                                <Eye size={14} />
                                <span className="text-xs font-medium">Entrar</span>
                              </div>
                            </Link>
                            <Link href={`/project/${project.id}/config`} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors" title="Config proyecto">
                              <ExternalLink size={14} />
                            </Link>
                            <button onClick={() => { setNewProject({ name: project.name, description: project.description || "", phase: project.phase, producers: project.producers || [] }); setShowEditProject(project.id); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors"><Edit2 size={14} /></button>
                            <button onClick={() => setShowAssignUser(project.id)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 rounded-lg transition-colors"><UserPlus size={14} /></button>
                            <button onClick={() => handleDeleteProject(project.id)} disabled={saving} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredProjects.map((project) => {
                      const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];
                      const isExpanded = expandedProjects.has(project.id);
                      return (
                        <div key={project.id}>
                          <div className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all hover:shadow-sm">
                            <div className="flex items-center gap-4">
                              {project.memberCount > 0 && (
                                <button onClick={() => toggleProjectExpand(project.id)} className="text-slate-400 hover:text-slate-600">
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                              )}
                              <div className={`w-2 h-10 rounded-full ${phaseStyle.dot}`}></div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h2 className="text-sm font-semibold text-slate-900">{project.name}</h2>
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${phaseStyle.bg} ${phaseStyle.text}`}>{project.phase}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  {project.producerNames && (<span className="text-xs text-slate-500">{project.producerNames.join(", ")}</span>)}
                                  <span className="text-xs text-slate-400 flex items-center gap-1"><Users size={11} />{project.memberCount}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Link href={`/admindashboard/project/${project.id}`} className="p-2 text-white bg-slate-900 hover:bg-slate-800 rounded-lg"><Eye size={16} /></Link>
                              <Link href={`/project/${project.id}/config`} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><ExternalLink size={16} /></Link>
                              <button onClick={() => { setNewProject({ name: project.name, description: project.description || "", phase: project.phase, producers: project.producers || [] }); setShowEditProject(project.id); }} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                              <button onClick={() => setShowAssignUser(project.id)} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><UserPlus size={16} /></button>
                              <button onClick={() => handleDeleteProject(project.id)} disabled={saving} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                          </div>
                          {isExpanded && project.members && project.members.length > 0 && (
                            <div className="ml-12 mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
                              <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Miembros</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {project.members.map((member) => (
                                  <div key={member.odId} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-600 text-xs font-medium">{member.name.charAt(0).toUpperCase()}</div>
                                      <div><p className="text-sm font-medium text-slate-900">{member.name}</p><p className="text-xs text-slate-500">{member.email}</p></div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">{member.role || member.position}</span>
                                      <button onClick={() => handleRemoveUserFromProject(project.id, member.odId)} disabled={saving} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-start md:items-center">
              <div className="relative flex-1 max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar usuarios..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm" />
              </div>
              <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm">
                <option value="all">Todos los roles</option>
                <option value="admin">Administradores</option>
                <option value="user">Usuarios</option>
              </select>
            </div>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-16"><Users size={32} className="text-slate-300 mx-auto mb-3" /><p className="text-slate-500 text-sm font-medium">No hay usuarios</p></div>
            ) : (
              <div className="p-4">
                <p className="text-xs text-slate-500 mb-4">{filteredUsers.length} usuarios</p>
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <div key={user.id} className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all hover:shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center text-slate-600 font-medium">{user.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">{user.name}</h3>
                            {user.role === "admin" && (<span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">Admin</span>)}
                          </div>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setShowUserDetails(user.id)} className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline">{user.projectCount} proyectos</button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setShowUserDetails(user.id)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><Eye size={16} /></button>
                          <button onClick={() => handleToggleUserRole(user.id, user.role)} disabled={saving} className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title={user.role === "admin" ? "Quitar admin" : "Hacer admin"}><Shield size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Producers Tab */}
        {activeTab === "producers" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar productoras..." value={producerSearch} onChange={(e) => setProducerSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm" />
              </div>
              <button onClick={() => setShowCreateProducer(true)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"><Plus size={16} />Nueva productora</button>
            </div>
            {filteredProducers.length === 0 ? (
              <div className="text-center py-16"><Building2 size={32} className="text-slate-300 mx-auto mb-3" /><p className="text-slate-500 text-sm font-medium mb-2">No hay productoras</p><button onClick={() => setShowCreateProducer(true)} className="text-sm text-slate-700 hover:text-slate-900 font-medium underline">Crear la primera</button></div>
            ) : (
              <div className="p-4">
                <p className="text-xs text-slate-500 mb-4">{filteredProducers.length} productoras</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducers.map((producer) => (
                    <div key={producer.id} className="group bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-all hover:shadow-md">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Building2 size={20} className="text-amber-600" /></div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setNewProducer({ name: producer.name }); setShowEditProducer(producer.id); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteProducer(producer.id)} disabled={saving || producer.projectCount > 0} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" title={producer.projectCount > 0 ? "Tiene proyectos asignados" : "Eliminar"}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1">{producer.name}</h3>
                      <p className="text-sm text-slate-500">{producer.projectCount} {producer.projectCount === 1 ? "proyecto" : "proyectos"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create/Edit Project Modal */}
      {(showCreateProject || showEditProject) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-slate-900">{showEditProject ? "Editar proyecto" : "Nuevo proyecto"}</h3>
              <button onClick={() => { setShowCreateProject(false); setShowEditProject(null); setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] }); setProducerModalSearch(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label><input type="text" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="Nombre del proyecto" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label><textarea value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} placeholder="Descripción del proyecto" rows={3} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none resize-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Fase</label><select value={newProject.phase} onChange={(e) => setNewProject({ ...newProject, phase: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none">{PHASES.map((phase) => (<option key={phase} value={phase}>{phase}</option>))}</select></div>
              
              {/* Productoras con búsqueda */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Productoras</label>
                
                {/* Selected producers */}
                {newProject.producers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {newProject.producers.map((prodId) => {
                      const prod = producers.find(p => p.id === prodId);
                      if (!prod) return null;
                      return (
                        <span key={prodId} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm">
                          <Building2 size={14} />
                          {prod.name}
                          <button onClick={() => setNewProject({ ...newProject, producers: newProject.producers.filter(id => id !== prodId) })} className="ml-1 text-amber-500 hover:text-amber-700">
                            <X size={14} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                
                {/* Search input */}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={producerModalSearch}
                    onChange={(e) => setProducerModalSearch(e.target.value)}
                    placeholder="Buscar productora..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                  />
                </div>
                
                {/* Search results */}
                {producerModalSearch.length >= 2 && (
                  <div className="mt-2 border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
                    {producers
                      .filter(p => p.name.toLowerCase().includes(producerModalSearch.toLowerCase()) && !newProject.producers.includes(p.id))
                      .slice(0, 5)
                      .map((producer) => (
                        <button
                          key={producer.id}
                          onClick={() => {
                            setNewProject({ ...newProject, producers: [...newProject.producers, producer.id] });
                            setProducerModalSearch("");
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 last:border-b-0"
                        >
                          <Building2 size={14} className="text-amber-600" />
                          <span className="text-slate-700">{producer.name}</span>
                          <span className="text-xs text-slate-400 ml-auto">{producer.projectCount} proyectos</span>
                        </button>
                      ))}
                    {producers.filter(p => p.name.toLowerCase().includes(producerModalSearch.toLowerCase()) && !newProject.producers.includes(p.id)).length === 0 && (
                      <div className="px-4 py-3 text-sm text-slate-500 text-center">No se encontraron productoras</div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={showEditProject ? handleEditProject : handleCreateProject} disabled={saving || !newProject.name.trim()} className="w-full px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{saving ? "Guardando..." : showEditProject ? "Guardar cambios" : "Crear proyecto"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Producer Modal */}
      {(showCreateProducer || showEditProducer) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{showEditProducer ? "Editar productora" : "Nueva productora"}</h3>
              <button onClick={() => { setShowCreateProducer(false); setShowEditProducer(null); setNewProducer({ name: "" }); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label><input type="text" value={newProducer.name} onChange={(e) => setNewProducer({ ...newProducer, name: e.target.value })} placeholder="Nombre de la productora" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" /></div>
              <button onClick={showEditProducer ? handleEditProducer : handleCreateProducer} disabled={saving || !newProducer.name.trim()} className="w-full px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{saving ? "Guardando..." : showEditProducer ? "Guardar cambios" : "Crear productora"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign User Modal */}
      {showAssignUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Asignar usuario</h3>
              <button onClick={() => { setShowAssignUser(null); setAssignUserForm({ odId: "", role: "" }); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Usuario *</label><select value={assignUserForm.odId} onChange={(e) => setAssignUserForm({ ...assignUserForm, odId: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"><option value="">Seleccionar usuario</option>{users.map((user) => (<option key={user.id} value={user.id}>{user.name} ({user.email})</option>))}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Rol *</label><select value={assignUserForm.role} onChange={(e) => setAssignUserForm({ ...assignUserForm, role: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"><option value="">Seleccionar rol</option>{PROJECT_ROLES.map((role) => (<option key={role} value={role}>{role}</option>))}</select></div>
              <button onClick={handleAssignUser} disabled={saving || !assignUserForm.odId || !assignUserForm.role} className="w-full px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{saving ? "Asignando..." : "Asignar usuario"}</button>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showUserDetails && (() => {
        const user = users.find((u) => u.id === showUserDetails);
        if (!user) return null;
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
                <h3 className="text-lg font-semibold text-slate-900">Detalles del usuario</h3>
                <button onClick={() => setShowUserDetails(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                  <div className="w-14 h-14 bg-slate-200 rounded-2xl flex items-center justify-center text-slate-600 text-xl font-medium">{user.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">{user.name}</h4>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    {user.role === "admin" && (<span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">Administrador</span>)}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Proyectos asignados ({user.projectCount})</p>
                  {user.projects && user.projects.length > 0 ? (
                    <div className="space-y-2">
                      {user.projects.map((project) => (<div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"><span className="text-sm text-slate-900 font-medium">{project.name}</span><span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">{project.role || project.position}</span></div>))}
                    </div>
                  ) : (<div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl"><p className="text-sm text-slate-500">Sin proyectos asignados</p></div>)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

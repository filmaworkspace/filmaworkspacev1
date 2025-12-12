"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { LayoutDashboard, FolderPlus, Users, Building2, Search, X, Edit2, Trash2, UserPlus, Briefcase, CheckCircle, AlertCircle, Shield, Plus, Eye, ExternalLink, ChevronDown, ChevronUp, RefreshCw, Clock } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];
const PHASE_COLORS: Record<string, string> = {
  Desarrollo: "bg-sky-100 text-sky-700 border-sky-200",
  Preproducción: "bg-amber-100 text-amber-700 border-amber-200",
  Rodaje: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Postproducción: "bg-purple-100 text-purple-700 border-purple-200",
  Finalizado: "bg-emerald-100 text-emerald-700 border-emerald-200",
};
const PHASE_DOT_COLORS: Record<string, string> = {
  Desarrollo: "bg-sky-500",
  Preproducción: "bg-amber-500",
  Rodaje: "bg-indigo-500",
  Postproducción: "bg-purple-500",
  Finalizado: "bg-emerald-500",
};
const PROJECT_ROLES = ["EP", "PM", "Controller", "PC", "Supervisor"];
const DEFAULT_DEPARTMENTS = [
  { name: "Producción", color: "#3B82F6" },
  { name: "Dirección", color: "#8B5CF6" },
  { name: "Fotografía", color: "#F59E0B" },
  { name: "Arte", color: "#10B981" },
  { name: "Sonido", color: "#EC4899" },
  { name: "Vestuario", color: "#6366F1" },
  { name: "Maquillaje", color: "#14B8A6" },
  { name: "Localizaciones", color: "#F97316" },
];

interface Project {
  id: string;
  name: string;
  phase: string;
  description?: string;
  producers?: string[];
  producerNames?: string[];
  createdAt: Timestamp;
  memberCount: number;
  members?: Member[];
}
interface Member {
  odId: string;
  name: string;
  email: string;
  role?: string;
  position?: string;
}
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  projectCount: number;
  projects: UserProject[];
}
interface UserProject {
  id: string;
  name: string;
  role?: string;
  position?: string;
}
interface Producer {
  id: string;
  name: string;
  createdAt: Timestamp;
  projectCount: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "projects" | "users" | "producers">("overview");

  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);

  const [projectSearch, setProjectSearch] = useState("");
  const [projectPhaseFilter, setProjectPhaseFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [producerSearch, setProducerSearch] = useState("");

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

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/"); return; }
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        if (userData?.role !== "admin") { router.push("/dashboard"); return; }
        setUserId(user.uid);
        setUserName(userData?.name || user.email || "Admin");
      } catch (error) {
        console.error(error);
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const loadData = async () => {
    if (!userId) return;
    try {
      // Load producers
      const producersSnap = await getDocs(collection(db, "producers"));
      const producersData: Producer[] = producersSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        createdAt: d.data().createdAt,
        projectCount: 0,
      }));

      // Load projects
      const projectsSnap = await getDocs(collection(db, "projects"));
      const projectsData: Project[] = await Promise.all(
        projectsSnap.docs.map(async (projectDoc) => {
          const data = projectDoc.data();
          const producerIds = data.producers || [];
          const producerNames = producerIds.map((pid: string) => producersData.find((p) => p.id === pid)?.name || "Eliminada");
          const membersSnap = await getDocs(collection(db, `projects/${projectDoc.id}/members`));
          const members: Member[] = membersSnap.docs.map((m) => ({
            odId: m.id,
            name: m.data().name,
            email: m.data().email,
            role: m.data().role,
            position: m.data().position,
          }));
          return {
            id: projectDoc.id,
            name: data.name,
            phase: data.phase,
            description: data.description || "",
            producers: producerIds,
            producerNames,
            createdAt: data.createdAt,
            memberCount: membersSnap.size,
            members,
          };
        })
      );

      // Update producer project counts
      producersData.forEach((p) => {
        p.projectCount = projectsData.filter((pr) => pr.producers?.includes(p.id)).length;
      });

      setProjects(projectsData);
      setProducers(producersData);

      // Load users
      const usersSnap = await getDocs(collection(db, "users"));
      const usersData: User[] = await Promise.all(
        usersSnap.docs.map(async (userDoc) => {
          const data = userDoc.data();
          const userProjectsSnap = await getDocs(collection(db, `userProjects/${userDoc.id}/projects`));
          const userProjects: UserProject[] = await Promise.all(
            userProjectsSnap.docs.map(async (upDoc) => {
              const upData = upDoc.data();
              const projectDoc = await getDoc(doc(db, "projects", upDoc.id));
              return {
                id: upDoc.id,
                name: projectDoc.exists() ? projectDoc.data().name : "Eliminado",
                role: upData.role,
                position: upData.position,
              };
            })
          );
          return {
            id: userDoc.id,
            name: data.name || data.email,
            email: data.email,
            role: data.role || "user",
            projectCount: userProjectsSnap.size,
            projects: userProjects,
          };
        })
      );
      setUsers(usersData);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error(error);
      setErrorMessage("Error al cargar los datos");
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 5000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    showSuccess("Datos actualizados");
  };

  // Project handlers
  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      showError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const projectRef = doc(collection(db, "projects"));
      await setDoc(projectRef, {
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        phase: newProject.phase,
        producers: newProject.producers,
        createdAt: serverTimestamp(),
      });
      // Create default departments
      for (const dept of DEFAULT_DEPARTMENTS) {
        const deptRef = doc(collection(db, `projects/${projectRef.id}/departments`));
        await setDoc(deptRef, { name: dept.name, color: dept.color, createdAt: serverTimestamp() });
      }
      setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
      setShowCreateProject(false);
      showSuccess("Proyecto creado correctamente");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al crear el proyecto");
    } finally {
      setSaving(false);
    }
  };

  const handleEditProject = async () => {
    if (!showEditProject) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", showEditProject), {
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        phase: newProject.phase,
        producers: newProject.producers,
      });
      setShowEditProject(null);
      showSuccess("Proyecto actualizado");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!confirm(`¿Eliminar "${project.name}"? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      // Remove members from userProjects
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `userProjects/${memberDoc.id}/projects/${projectId}`));
        await deleteDoc(memberDoc.ref);
      }
      // Delete departments
      const deptsSnap = await getDocs(collection(db, `projects/${projectId}/departments`));
      for (const deptDoc of deptsSnap.docs) {
        await deleteDoc(deptDoc.ref);
      }
      await deleteDoc(doc(db, "projects", projectId));
      showSuccess("Proyecto eliminado");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  // Producer handlers
  const handleCreateProducer = async () => {
    if (!newProducer.name.trim()) {
      showError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const producerRef = doc(collection(db, "producers"));
      await setDoc(producerRef, { name: newProducer.name.trim(), createdAt: serverTimestamp() });
      setNewProducer({ name: "" });
      setShowCreateProducer(false);
      showSuccess("Productora creada");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleEditProducer = async () => {
    if (!showEditProducer) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "producers", showEditProducer), { name: newProducer.name.trim() });
      setShowEditProducer(null);
      setNewProducer({ name: "" });
      showSuccess("Productora actualizada");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProducer = async (producerId: string) => {
    const producer = producers.find((p) => p.id === producerId);
    if (!producer) return;
    if (producer.projectCount > 0) {
      showError(`"${producer.name}" tiene proyectos asignados`);
      return;
    }
    if (!confirm(`¿Eliminar "${producer.name}"?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "producers", producerId));
      showSuccess("Productora eliminada");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  // User handlers
  const handleAssignUser = async () => {
    if (!assignUserForm.odId || !assignUserForm.role || !showAssignUser) {
      showError("Selecciona usuario y rol");
      return;
    }
    setSaving(true);
    try {
      const user = users.find((u) => u.id === assignUserForm.odId);
      const project = projects.find((p) => p.id === showAssignUser);
      if (!user || !project) return;
      if (project.members?.some((m) => m.odId === user.id)) {
        showError("Usuario ya asignado a este proyecto");
        setSaving(false);
        return;
      }
      await setDoc(doc(db, `projects/${showAssignUser}/members`, user.id), {
        odId: user.id,
        name: user.name,
        email: user.email,
        role: assignUserForm.role,
        permissions: { config: true, accounting: true, team: true },
        addedAt: serverTimestamp(),
      });
      await setDoc(doc(db, `userProjects/${user.id}/projects/${showAssignUser}`), {
        projectId: showAssignUser,
        role: assignUserForm.role,
        permissions: { config: true, accounting: true, team: true },
        addedAt: serverTimestamp(),
      });
      setAssignUserForm({ odId: "", role: "" });
      setShowAssignUser(null);
      showSuccess("Usuario asignado correctamente");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al asignar");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUserFromProject = async (projectId: string, odId: string) => {
    if (!confirm("¿Eliminar este usuario del proyecto?")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/members`, odId));
      await deleteDoc(doc(db, `userProjects/${odId}/projects/${projectId}`));
      showSuccess("Usuario eliminado del proyecto");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUserRole = async (odId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`¿Cambiar rol a ${newRole === "admin" ? "Administrador" : "Usuario"}?`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", odId), { role: newRole });
      showSuccess("Rol actualizado");
      await loadData();
    } catch (error) {
      console.error(error);
      showError("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const toggleProjectExpand = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) newExpanded.delete(projectId);
    else newExpanded.add(projectId);
    setExpandedProjects(newExpanded);
  };

  // Filters
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

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.phase !== "Finalizado").length;
  const adminUsers = users.filter((u) => u.role === "admin").length;

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center">
                <Shield size={28} className="text-white" />
              </div>
              <div>
                <p className="text-white/60 text-sm font-medium uppercase tracking-wider mb-1">Panel de administración</p>
                <h1 className="text-2xl font-semibold">Hola, {userName.split(" ")[0]}</h1>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur text-white rounded-xl text-sm font-medium transition-all border border-white/10 disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "..." : "Refrescar"}
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Briefcase size={20} className="text-blue-400" />
                </div>
                <span className="text-2xl font-bold text-white">{projects.length}</span>
              </div>
              <p className="text-sm text-white/60">Proyectos</p>
              <p className="text-xs text-emerald-400 mt-1">{activeProjects} activos</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Users size={20} className="text-purple-400" />
                </div>
                <span className="text-2xl font-bold text-white">{users.length}</span>
              </div>
              <p className="text-sm text-white/60">Usuarios</p>
              <p className="text-xs text-purple-400 mt-1">{adminUsers} admins</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <Building2 size={20} className="text-amber-400" />
                </div>
                <span className="text-2xl font-bold text-white">{producers.length}</span>
              </div>
              <p className="text-sm text-white/60">Productoras</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Users size={20} className="text-emerald-400" />
                </div>
                <span className="text-2xl font-bold text-white">{projects.reduce((acc, p) => acc + p.memberCount, 0)}</span>
              </div>
              <p className="text-sm text-white/60">Asignaciones</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8 -mt-6">
        {/* Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-700">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle size={18} />
            </div>
            <span className="font-medium">{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 mb-6 p-1.5 inline-flex gap-1 flex-wrap">
          {[
            { id: "overview", label: "Vista general", icon: LayoutDashboard },
            { id: "projects", label: "Proyectos", icon: Briefcase, count: projects.length },
            { id: "users", label: "Usuarios", icon: Users, count: users.length },
            { id: "producers", label: "Productoras", icon: Building2, count: producers.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-md text-xs ${activeTab === tab.id ? "bg-white/20" : "bg-slate-100"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Projects */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Clock size={18} className="text-slate-400" />
                      Últimos proyectos
                    </h3>
                    <button onClick={() => setActiveTab("projects")} className="text-sm text-slate-500 hover:text-slate-900 font-medium">
                      Ver todos →
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {projects.slice(0, 5).map((project) => (
                      <div key={project.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${PHASE_DOT_COLORS[project.phase]}`} />
                          <div>
                            <p className="text-sm font-medium text-slate-900">{project.name}</p>
                            <p className="text-xs text-slate-500">{project.producerNames?.join(", ") || "Sin productora"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${PHASE_COLORS[project.phase]}`}>
                            {project.phase}
                          </span>
                          <Link href={`/project/${project.id}/config`} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all">
                            <ExternalLink size={16} />
                          </Link>
                        </div>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Briefcase size={20} className="text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500">No hay proyectos todavía</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Users */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Users size={18} className="text-slate-400" />
                      Últimos usuarios
                    </h3>
                    <button onClick={() => setActiveTab("users")} className="text-sm text-slate-500 hover:text-slate-900 font-medium">
                      Ver todos →
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {users.slice(0, 5).map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center text-white text-sm font-medium">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{user.name}</p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.role === "admin" && (
                            <span className="text-xs font-medium px-2 py-1 rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                              Admin
                            </span>
                          )}
                          <span className="text-xs text-slate-500">{user.projectCount} proy.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Projects by Phase */}
              <div className="mt-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Distribución por fase</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-5 gap-4">
                    {PHASES.map((phase) => {
                      const count = projects.filter((p) => p.phase === phase).length;
                      const percentage = projects.length > 0 ? (count / projects.length) * 100 : 0;
                      return (
                        <div key={phase} className="text-center">
                          <div className="relative h-28 bg-slate-100 rounded-xl overflow-hidden mb-3">
                            <div
                              className={`absolute bottom-0 left-0 right-0 ${PHASE_DOT_COLORS[phase]} transition-all duration-500`}
                              style={{ height: `${Math.max(percentage, 8)}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-2xl font-bold text-slate-900">{count}</span>
                            </div>
                          </div>
                          <p className="text-xs font-medium text-slate-600">{phase}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Projects Tab */}
          {activeTab === "projects" && (
            <div>
              <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
                  <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar proyectos..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none text-sm"
                    />
                  </div>
                  <select
                    value={projectPhaseFilter}
                    onChange={(e) => setProjectPhaseFilter(e.target.value)}
                    className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                  >
                    <option value="all">Todas las fases</option>
                    {PHASES.map((phase) => (
                      <option key={phase} value={phase}>{phase}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setShowCreateProject(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <FolderPlus size={16} />
                  Crear proyecto
                </button>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Briefcase size={32} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay proyectos</h3>
                  <p className="text-slate-500 text-sm mb-6">
                    {projectSearch || projectPhaseFilter !== "all"
                      ? "No se encontraron proyectos con los filtros aplicados"
                      : "Crea tu primer proyecto para empezar"}
                  </p>
                  <button
                    onClick={() => setShowCreateProject(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    <FolderPlus size={16} />
                    Crear proyecto
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-8" />
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Proyecto</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Productoras</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Fase</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Miembros</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project) => {
                        const isExpanded = expandedProjects.has(project.id);
                        return (
                          <React.Fragment key={project.id}>
                            <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4">
                                {project.memberCount > 0 && (
                                  <button
                                    onClick={() => toggleProjectExpand(project.id)}
                                    className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{project.name}</p>
                                  {project.description && (
                                    <p className="text-xs text-slate-500 line-clamp-1">{project.description}</p>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {project.producerNames && project.producerNames.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {project.producerNames.slice(0, 2).map((name, idx) => (
                                      <span key={idx} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                                        {name}
                                      </span>
                                    ))}
                                    {project.producerNames.length > 2 && (
                                      <span className="text-xs text-slate-500">+{project.producerNames.length - 2}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">Sin productora</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${PHASE_COLORS[project.phase]}`}>
                                  {project.phase}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">
                                  {project.memberCount}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Link
                                    href={`/project/${project.id}/config`}
                                    className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Ver proyecto"
                                  >
                                    <ExternalLink size={16} />
                                  </Link>
                                  <button
                                    onClick={() => {
                                      setNewProject({
                                        name: project.name,
                                        description: project.description || "",
                                        phase: project.phase,
                                        producers: project.producers || [],
                                      });
                                      setShowEditProject(project.id);
                                    }}
                                    className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => setShowAssignUser(project.id)}
                                    className="text-slate-400 hover:text-emerald-600 p-2 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="Asignar usuario"
                                  >
                                    <UserPlus size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProject(project.id)}
                                    disabled={saving}
                                    className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && project.members && project.members.length > 0 && (
                              <tr>
                                <td colSpan={6} className="bg-slate-50 px-4 py-4">
                                  <div className="pl-8">
                                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Miembros del proyecto</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {project.members.map((member) => (
                                        <div key={member.odId} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                          <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-600 text-xs font-medium">
                                              {member.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                              <p className="text-sm font-medium text-slate-900">{member.name}</p>
                                              <p className="text-xs text-slate-500">{member.email}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">
                                              {member.role || member.position}
                                            </span>
                                            <button
                                              onClick={() => handleRemoveUserFromProject(project.id, member.odId)}
                                              disabled={saving}
                                              className="text-slate-400 hover:text-red-600 p-1"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div>
              <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-start md:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar usuarios..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                >
                  <option value="all">Todos los roles</option>
                  <option value="admin">Administradores</option>
                  <option value="user">Usuarios</option>
                </select>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Users size={32} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay usuarios</h3>
                  <p className="text-slate-500 text-sm">No se encontraron usuarios</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Usuario</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Rol</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Proyectos</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center text-white text-sm font-medium">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                                <p className="text-xs text-slate-500">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${
                              user.role === "admin"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-slate-50 text-slate-700 border-slate-200"
                            }`}>
                              {user.role === "admin" ? "Administrador" : "Usuario"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => setShowUserDetails(user.id)}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline"
                            >
                              {user.projectCount} {user.projectCount === 1 ? "proyecto" : "proyectos"}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setShowUserDetails(user.id)}
                                className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Ver detalles"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={() => handleToggleUserRole(user.id, user.role)}
                                disabled={saving}
                                className="text-slate-400 hover:text-purple-600 p-2 hover:bg-purple-50 rounded-lg transition-colors"
                                title={user.role === "admin" ? "Quitar admin" : "Hacer admin"}
                              >
                                <Shield size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Producers Tab */}
          {activeTab === "producers" && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar productoras..."
                      value={producerSearch}
                      onChange={(e) => setProducerSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateProducer(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  Nueva productora
                </button>
              </div>

              {filteredProducers.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Building2 size={32} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay productoras</h3>
                  <p className="text-slate-500 text-sm mb-6">Crea tu primera productora para empezar</p>
                  <button
                    onClick={() => setShowCreateProducer(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    <Plus size={16} />
                    Crear productora
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducers.map((producer) => (
                    <div key={producer.id} className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 hover:shadow-lg transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                          <Building2 size={24} className="text-amber-600" />
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setNewProducer({ name: producer.name });
                              setShowEditProducer(producer.id);
                            }}
                            className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-white rounded-lg transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteProducer(producer.id)}
                            disabled={saving || producer.projectCount > 0}
                            className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={producer.projectCount > 0 ? "Tiene proyectos asignados" : "Eliminar"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">{producer.name}</h3>
                      <p className="text-sm text-amber-700">
                        {producer.projectCount} {producer.projectCount === 1 ? "proyecto" : "proyectos"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Project Modal */}
      {(showCreateProject || showEditProject) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-slate-900">
                {showEditProject ? "Editar proyecto" : "Nuevo proyecto"}
              </h3>
              <button
                onClick={() => {
                  setShowCreateProject(false);
                  setShowEditProject(null);
                  setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="Nombre del proyecto"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Descripción del proyecto"
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fase</label>
                <select
                  value={newProject.phase}
                  onChange={(e) => setNewProject({ ...newProject, phase: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  {PHASES.map((phase) => (
                    <option key={phase} value={phase}>{phase}</option>
                  ))}
                </select>
              </div>
              {producers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Productoras</label>
                  <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                    {producers.map((producer) => (
                      <label
                        key={producer.id}
                        className="flex items-center gap-3 py-2 px-2 cursor-pointer hover:bg-slate-50 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={newProject.producers.includes(producer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewProject({ ...newProject, producers: [...newProject.producers, producer.id] });
                            } else {
                              setNewProject({
                                ...newProject,
                                producers: newProject.producers.filter((id) => id !== producer.id),
                              });
                            }
                          }}
                          className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                        />
                        <span className="text-sm text-slate-700">{producer.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={showEditProject ? handleEditProject : handleCreateProject}
                disabled={saving || !newProject.name.trim()}
                className="w-full px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Guardando..." : showEditProject ? "Guardar cambios" : "Crear proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Producer Modal */}
      {(showCreateProducer || showEditProducer) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {showEditProducer ? "Editar productora" : "Nueva productora"}
              </h3>
              <button
                onClick={() => {
                  setShowCreateProducer(false);
                  setShowEditProducer(null);
                  setNewProducer({ name: "" });
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={newProducer.name}
                  onChange={(e) => setNewProducer({ ...newProducer, name: e.target.value })}
                  placeholder="Nombre de la productora"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
              <button
                onClick={showEditProducer ? handleEditProducer : handleCreateProducer}
                disabled={saving || !newProducer.name.trim()}
                className="w-full px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Guardando..." : showEditProducer ? "Guardar cambios" : "Crear productora"}
              </button>
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
              <button
                onClick={() => {
                  setShowAssignUser(null);
                  setAssignUserForm({ odId: "", role: "" });
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Usuario *</label>
                <select
                  value={assignUserForm.odId}
                  onChange={(e) => setAssignUserForm({ ...assignUserForm, odId: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  <option value="">Seleccionar usuario</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol *</label>
                <select
                  value={assignUserForm.role}
                  onChange={(e) => setAssignUserForm({ ...assignUserForm, role: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  <option value="">Seleccionar rol</option>
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAssignUser}
                disabled={saving || !assignUserForm.odId || !assignUserForm.role}
                className="w-full px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Asignando..." : "Asignar usuario"}
              </button>
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
                <button
                  onClick={() => setShowUserDetails(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl flex items-center justify-center text-white text-2xl font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">{user.name}</h4>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <span className={`inline-block mt-2 text-xs font-medium px-2 py-1 rounded-lg ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                      {user.role === "admin" ? "Administrador" : "Usuario"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Proyectos asignados ({user.projectCount})</p>
                  {user.projects && user.projects.length > 0 ? (
                    <div className="space-y-2">
                      {user.projects.map((project) => (
                        <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                          <span className="text-sm text-slate-900 font-medium">{project.name}</span>
                          <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
                            {project.role || project.position}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm text-slate-500">Sin proyectos asignados</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

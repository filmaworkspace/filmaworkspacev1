"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import {
  LayoutDashboard,
  FolderPlus,
  Users,
  Building2,
  Search,
  X,
  Edit2,
  Trash2,
  UserPlus,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Shield,
  Plus,
  Eye,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
  Activity,
  TrendingUp,
  Clock,
  Star,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const PHASES = [
  "Desarrollo",
  "Preproducción",
  "Rodaje",
  "Postproducción",
  "Finalizado",
];

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

const PROJECT_ROLES = ["PM", "Controller", "PC"];

interface Project {
  id: string;
  name: string;
  phase: string;
  description?: string;
  producers?: string[];
  producerNames?: string[];
  departments?: string[];
  createdAt: Timestamp;
  memberCount: number;
  members?: Member[];
}

interface Member {
  userId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  position?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Timestamp;
  projectCount: number;
  projects: UserProject[];
}

interface UserProject {
  id: string;
  name: string;
  role?: string;
  department?: string;
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
  const [projectProducerFilter, setProjectProducerFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateProducer, setShowCreateProducer] = useState(false);
  const [showEditProducer, setShowEditProducer] = useState<string | null>(null);
  const [showUserDetails, setShowUserDetails] = useState<string | null>(null);
  const [showAssignUser, setShowAssignUser] = useState<string | null>(null);
  const [showEditProject, setShowEditProject] = useState<string | null>(null);

  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    phase: "Desarrollo",
    producers: [] as string[],
  });
  const [newProducer, setNewProducer] = useState("");
  const [editProducerName, setEditProducerName] = useState("");
  const [assignUserForm, setAssignUserForm] = useState({
    userId: "",
    role: "",
  });

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const userRole = userData?.role || "user";

        if (userRole !== "admin") {
          router.push("/dashboard");
          return;
        }

        setUserId(user.uid);
        setUserName(userData?.name || user.email || "Admin");
      } catch (error) {
        console.error("Error verificando usuario:", error);
        router.push("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadData = async () => {
    if (!userId) return;

    try {
      const producersSnap = await getDocs(collection(db, "producers"));
      const producersData: Producer[] = producersSnap.docs.map((prodDoc) => {
        const data = prodDoc.data();
        return {
          id: prodDoc.id,
          name: data.name,
          createdAt: data.createdAt,
          projectCount: 0,
        };
      });

      const projectsSnap = await getDocs(collection(db, "projects"));
      const projectsData: Project[] = await Promise.all(
        projectsSnap.docs.map(async (projectDoc) => {
          const data = projectDoc.data();
          const producerIds = data.producers || [];
          const producerNames = producerIds.map((prodId: string) => {
            const producer = producersData.find(p => p.id === prodId);
            return producer?.name || "Productora eliminada";
          });

          const membersSnap = await getDocs(collection(db, `projects/${projectDoc.id}/members`));
          const members: Member[] = membersSnap.docs.map(memberDoc => ({
            userId: memberDoc.id,
            name: memberDoc.data().name,
            email: memberDoc.data().email,
            role: memberDoc.data().role,
            department: memberDoc.data().department,
            position: memberDoc.data().position,
          }));

          return {
            id: projectDoc.id,
            name: data.name,
            phase: data.phase,
            description: data.description || "",
            producers: producerIds,
            producerNames,
            departments: data.departments || [],
            createdAt: data.createdAt,
            memberCount: membersSnap.size,
            members,
          };
        })
      );

      producersData.forEach(producer => {
        producer.projectCount = projectsData.filter(p => 
          p.producers?.includes(producer.id)
        ).length;
      });

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
              return {
                id: upDoc.id,
                name: projectDoc.exists() ? projectDoc.data().name : "Proyecto eliminado",
                role: upData.role,
                department: upData.department,
                position: upData.position,
              };
            })
          );

          return {
            id: userDoc.id,
            name: data.name || data.email,
            email: data.email,
            role: data.role || "user",
            createdAt: data.createdAt,
            projectCount: userProjectsSnap.size,
            projects: userProjects,
          };
        })
      );

      setUsers(usersData);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error("Error cargando datos:", error);
      setErrorMessage("Error al cargar los datos");
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setSuccessMessage("Datos actualizados");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      setErrorMessage("El nombre del proyecto es obligatorio");
      setTimeout(() => setErrorMessage(""), 3000);
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
        departments: [],
        createdAt: serverTimestamp(),
      });

      setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
      setShowCreateProject(false);
      setSuccessMessage("Proyecto creado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al crear el proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
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
      setSuccessMessage("Proyecto actualizado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al actualizar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProducer = async () => {
    if (!newProducer.trim()) {
      setErrorMessage("El nombre es obligatorio");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    try {
      const producerRef = doc(collection(db, "producers"));
      await setDoc(producerRef, {
        name: newProducer.trim(),
        createdAt: serverTimestamp(),
      });

      setNewProducer("");
      setShowCreateProducer(false);
      setSuccessMessage("Productora creada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al crear la productora");
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleEditProducer = async () => {
    if (!showEditProducer || !editProducerName.trim()) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "producers", showEditProducer), {
        name: editProducerName.trim(),
      });

      setShowEditProducer(null);
      setEditProducerName("");
      setSuccessMessage("Productora actualizada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al actualizar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProducer = async (producerId: string) => {
    const producer = producers.find(p => p.id === producerId);
    if (!producer) return;

    if (producer.projectCount > 0) {
      setErrorMessage(`No se puede eliminar "${producer.name}" porque tiene proyectos asignados`);
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    if (!confirm(`¿Eliminar la productora "${producer.name}"?`)) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, "producers", producerId));
      setSuccessMessage("Productora eliminada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al eliminar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignUser = async () => {
    if (!assignUserForm.userId || !assignUserForm.role || !showAssignUser) {
      setErrorMessage("Selecciona usuario y rol");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    try {
      const user = users.find(u => u.id === assignUserForm.userId);
      const project = projects.find(p => p.id === showAssignUser);
      if (!user || !project) return;

      if (project.members?.some(m => m.userId === user.id)) {
        setErrorMessage("Usuario ya asignado");
        setSaving(false);
        setTimeout(() => setErrorMessage(""), 3000);
        return;
      }

      await setDoc(doc(db, `projects/${showAssignUser}/members`, user.id), {
        userId: user.id,
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

      setAssignUserForm({ userId: "", role: "" });
      setShowAssignUser(null);
      setSuccessMessage("Usuario asignado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al asignar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUserFromProject = async (projectId: string, userId: string) => {
    if (!confirm("¿Eliminar este usuario del proyecto?")) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/members`, userId));
      await deleteDoc(doc(db, `userProjects/${userId}/projects/${projectId}`));
      setSuccessMessage("Usuario eliminado del proyecto");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al eliminar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (!confirm(`¿Eliminar "${project.name}"? Esta acción no se puede deshacer.`)) return;

    setSaving(true);
    try {
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `userProjects/${memberDoc.id}/projects/${projectId}`));
        await deleteDoc(memberDoc.ref);
      }
      await deleteDoc(doc(db, "projects", projectId));
      setSuccessMessage("Proyecto eliminado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al eliminar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (user.role === "admin") {
      setErrorMessage("No puedes eliminar administradores");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    if (!confirm(`¿Eliminar a "${user.name}"?`)) return;

    setSaving(true);
    try {
      for (const project of user.projects) {
        await deleteDoc(doc(db, `projects/${project.id}/members`, userId));
      }
      const userProjectsSnap = await getDocs(collection(db, `userProjects/${userId}/projects`));
      for (const upDoc of userProjectsSnap.docs) {
        await deleteDoc(upDoc.ref);
      }
      await deleteDoc(doc(db, "users", userId));
      setSuccessMessage("Usuario eliminado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al eliminar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`¿Cambiar a ${newRole === "admin" ? "Administrador" : "Usuario"}?`)) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      setSuccessMessage("Rol actualizado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error al actualizar");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const toggleProjectExpand = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(projectSearch.toLowerCase());
    const matchesPhase = projectPhaseFilter === "all" || p.phase === projectPhaseFilter;
    const matchesProducer = projectProducerFilter === "all" || p.producers?.includes(projectProducerFilter);
    return matchesSearch && matchesPhase && matchesProducer;
  });

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
                          u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando panel de administración...</p>
        </div>
      </div>
    );
  }

  const activeProjects = projects.filter(p => p.phase !== "Finalizado").length;
  const adminUsers = users.filter(u => u.role === "admin").length;

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4.5rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                  <Shield size={20} className="text-white" />
                </div>
                <span className={`text-sm font-medium text-white/60 uppercase tracking-wider ${spaceGrotesk.className}`}>
                  Panel de administración
                </span>
              </div>
              <h1 className={`text-3xl md:text-4xl font-semibold tracking-tight mb-2 ${spaceGrotesk.className}`}>
                Hola, {userName.split(' ')[0]}
              </h1>
              <p className="text-slate-400 text-sm">
                Gestiona proyectos, usuarios y productoras desde aquí
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur text-white rounded-xl text-sm font-medium transition-all border border-white/10 disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Actualizando..." : "Refrescar"}
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Briefcase size={20} className="text-blue-400" />
                </div>
                <span className="text-3xl font-bold text-white">{projects.length}</span>
              </div>
              <p className="text-sm text-white/60">Proyectos totales</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                <TrendingUp size={12} />
                <span>{activeProjects} activos</span>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users size={20} className="text-purple-400" />
                </div>
                <span className="text-3xl font-bold text-white">{users.length}</span>
              </div>
              <p className="text-sm text-white/60">Usuarios registrados</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-purple-400">
                <Shield size={12} />
                <span>{adminUsers} admins</span>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Building2 size={20} className="text-amber-400" />
                </div>
                <span className="text-3xl font-bold text-white">{producers.length}</span>
              </div>
              <p className="text-sm text-white/60">Productoras</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
                <Star size={12} />
                <span>Activas</span>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Activity size={20} className="text-emerald-400" />
                </div>
                <span className="text-3xl font-bold text-white">{projects.reduce((acc, p) => acc + p.memberCount, 0)}</span>
              </div>
              <p className="text-sm text-white/60">Asignaciones</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                <Zap size={12} />
                <span>Total miembros</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700 shadow-sm">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CheckCircle size={18} />
              </div>
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 shadow-sm">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle size={18} />
              </div>
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-6 p-1.5 inline-flex gap-1">
            {[
              { id: "overview", label: "Vista general", icon: LayoutDashboard },
              { id: "projects", label: `Proyectos (${projects.length})`, icon: Briefcase },
              { id: "users", label: `Usuarios (${users.length})`, icon: Users },
              { id: "producers", label: `Productoras (${producers.length})`, icon: Building2 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Projects */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Clock size={18} className="text-slate-400" />
                        Últimos proyectos
                      </h3>
                      <button
                        onClick={() => setActiveTab("projects")}
                        className="text-sm text-slate-500 hover:text-slate-900 font-medium"
                      >
                        Ver todos →
                      </button>
                    </div>
                    <div className="space-y-3">
                      {projects.slice(0, 5).map(project => (
                        <div key={project.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${PHASE_DOT_COLORS[project.phase]}`}></div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{project.name}</p>
                              <p className="text-xs text-slate-500">
                                {project.producerNames?.join(", ") || "Sin productora"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${PHASE_COLORS[project.phase]}`}>
                              {project.phase}
                            </span>
                            <Link
                              href={`/project/${project.id}/config`}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all"
                            >
                              <ExternalLink size={16} />
                            </Link>
                          </div>
                        </div>
                      ))}
                      {projects.length === 0 && (
                        <div className="text-center py-8 text-slate-500">
                          <Briefcase size={32} className="mx-auto mb-2 text-slate-300" />
                          <p className="text-sm">No hay proyectos todavía</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Users */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Users size={18} className="text-slate-400" />
                        Últimos usuarios
                      </h3>
                      <button
                        onClick={() => setActiveTab("users")}
                        className="text-sm text-slate-500 hover:text-slate-900 font-medium"
                      >
                        Ver todos →
                      </button>
                    </div>
                    <div className="space-y-3">
                      {users.slice(0, 5).map(user => (
                        <div key={user.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center text-white text-sm font-medium">
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
                            <span className="text-xs text-slate-500">
                              {user.projectCount} proy.
                            </span>
                          </div>
                        </div>
                      ))}
                      {users.length === 0 && (
                        <div className="text-center py-8 text-slate-500">
                          <Users size={32} className="mx-auto mb-2 text-slate-300" />
                          <p className="text-sm">No hay usuarios todavía</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Projects by Phase */}
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Distribución por fase</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {PHASES.map(phase => {
                      const count = projects.filter(p => p.phase === phase).length;
                      const percentage = projects.length > 0 ? (count / projects.length) * 100 : 0;
                      return (
                        <div key={phase} className="text-center">
                          <div className="relative h-24 bg-slate-100 rounded-xl overflow-hidden mb-2">
                            <div 
                              className={`absolute bottom-0 left-0 right-0 ${PHASE_DOT_COLORS[phase]} transition-all duration-500`}
                              style={{ height: `${Math.max(percentage, 5)}%` }}
                            ></div>
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
            )}

            {/* Projects Tab */}
            {activeTab === "projects" && (
              <div>
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                  <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
                    <div className="relative flex-1 max-w-md">
                      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar proyectos..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm bg-slate-50"
                      />
                    </div>
                    <select
                      value={projectPhaseFilter}
                      onChange={(e) => setProjectPhaseFilter(e.target.value)}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm bg-slate-50"
                    >
                      <option value="all">Todas las fases</option>
                      {PHASES.map(phase => (
                        <option key={phase} value={phase}>{phase}</option>
                      ))}
                    </select>
                    <select
                      value={projectProducerFilter}
                      onChange={(e) => setProjectProducerFilter(e.target.value)}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm bg-slate-50"
                    >
                      <option value="all">Todas las productoras</option>
                      {producers.map(producer => (
                        <option key={producer.id} value={producer.id}>{producer.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => setShowCreateProject(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                  >
                    <FolderPlus size={16} />
                    Crear proyecto
                  </button>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Briefcase size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay proyectos</h3>
                    <p className="text-slate-500 text-sm mb-4">
                      {projectSearch || projectPhaseFilter !== "all" || projectProducerFilter !== "all"
                        ? "No se encontraron proyectos con los filtros aplicados"
                        : "Crea tu primer proyecto para empezar"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-8"></th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Proyecto</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Productoras</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Fase</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Miembros</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.map(project => {
                          const isExpanded = expandedProjects.has(project.id);
                          return (
                            <>
                              <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
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
                                  <p className="text-sm font-medium text-slate-900">{project.name}</p>
                                  {project.description && (
                                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{project.description}</p>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {project.producerNames && project.producerNames.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {project.producerNames.map((name, idx) => (
                                        <span key={idx} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                                          {name}
                                        </span>
                                      ))}
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
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">
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
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {project.members.map(member => (
                                          <div key={member.userId} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
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
                                                {member.role || `${member.position}`}
                                              </span>
                                              <button
                                                onClick={() => handleRemoveUserFromProject(project.id, member.userId)}
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
                            </>
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
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar usuarios..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm bg-slate-50"
                    />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm bg-slate-50"
                  >
                    <option value="all">Todos los roles</option>
                    <option value="admin">Administradores</option>
                    <option value="user">Usuarios</option>
                  </select>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="p-12 text-center">
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
                        {filteredUsers.map(user => (
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
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={saving || user.role === "admin"}
                                  className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={user.role === "admin" ? "No se puede eliminar" : "Eliminar"}
                                >
                                  <Trash2 size={16} />
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
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Gestión de productoras</h2>
                    <p className="text-sm text-slate-500">Administra las productoras de la plataforma</p>
                  </div>
                  <button
                    onClick={() => setShowCreateProducer(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                  >
                    <Plus size={16} />
                    Nueva productora
                  </button>
                </div>

                {producers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Building2 size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay productoras</h3>
                    <p className="text-slate-500 text-sm mb-4">Crea tu primera productora para empezar</p>
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
                    {producers.map(producer => (
                      <div key={producer.id} className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 hover:shadow-lg transition-all group">
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                            <Building2 size={24} className="text-amber-600" />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditProducerName(producer.name);
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
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">{producer.name}</h3>
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
        </div>
      </main>

      {/* Modals */}
      {(showCreateProject || showEditProject) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                {showEditProject ? "Editar proyecto" : "Nuevo proyecto"}
              </h3>
              <button
                onClick={() => {
                  setShowCreateProject(false);
                  setShowEditProject(null);
                  setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="Nombre del proyecto"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Descripción del proyecto"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fase</label>
                <select
                  value={newProject.phase}
                  onChange={(e) => setNewProject({ ...newProject, phase: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none"
                >
                  {PHASES.map(phase => (
                    <option key={phase} value={phase}>{phase}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Productoras</label>
                {producers.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                    {producers.map(producer => (
                      <label key={producer.id} className="flex items-center gap-3 py-2 px-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                        <input
                          type="checkbox"
                          checked={newProject.producers.includes(producer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewProject({ ...newProject, producers: [...newProject.producers, producer.id] });
                            } else {
                              setNewProject({ ...newProject, producers: newProject.producers.filter(id => id !== producer.id) });
                            }
                          }}
                          className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                        />
                        <span className="text-sm text-slate-700">{producer.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-500 mb-2">No hay productoras disponibles</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateProject(false);
                        setShowEditProject(null);
                        setShowCreateProducer(true);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Crear productora
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={showEditProject ? handleEditProject : handleCreateProject}
                disabled={saving || !newProject.name.trim()}
                className="w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Guardando..." : showEditProject ? "Guardar cambios" : "Crear proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(showCreateProducer || showEditProducer) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                {showEditProducer ? "Editar productora" : "Nueva productora"}
              </h3>
              <button
                onClick={() => {
                  setShowCreateProducer(false);
                  setShowEditProducer(null);
                  setNewProducer("");
                  setEditProducerName("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={showEditProducer ? editProducerName : newProducer}
                  onChange={(e) => showEditProducer ? setEditProducerName(e.target.value) : setNewProducer(e.target.value)}
                  placeholder="Nombre de la productora"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none"
                  autoFocus
                />
              </div>

              <button
                onClick={showEditProducer ? handleEditProducer : handleCreateProducer}
                disabled={saving || (showEditProducer ? !editProducerName.trim() : !newProducer.trim())}
                className="w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Guardando..." : showEditProducer ? "Guardar cambios" : "Crear productora"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Asignar usuario</h3>
              <button
                onClick={() => {
                  setShowAssignUser(null);
                  setAssignUserForm({ userId: "", role: "" });
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Usuario *</label>
                <select
                  value={assignUserForm.userId}
                  onChange={(e) => setAssignUserForm({ ...assignUserForm, userId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none"
                >
                  <option value="">Seleccionar usuario</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol *</label>
                <select
                  value={assignUserForm.role}
                  onChange={(e) => setAssignUserForm({ ...assignUserForm, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none"
                >
                  <option value="">Seleccionar rol</option>
                  {PROJECT_ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleAssignUser}
                disabled={saving || !assignUserForm.userId || !assignUserForm.role}
                className="w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Asignando..." : "Asignar usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUserDetails && (() => {
        const user = users.find(u => u.id === showUserDetails);
        if (!user) return null;

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-slate-900">Detalles del usuario</h3>
                <button onClick={() => setShowUserDetails(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl flex items-center justify-center text-white text-2xl font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-slate-900">{user.name}</h4>
                  <p className="text-sm text-slate-500">{user.email}</p>
                  <span className={`inline-block mt-1 text-xs font-medium px-2 py-1 rounded-lg ${
                    user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"
                  }`}>
                    {user.role === "admin" ? "Administrador" : "Usuario"}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Proyectos asignados ({user.projectCount})</p>
                {user.projects && user.projects.length > 0 ? (
                  <div className="space-y-2">
                    {user.projects.map(project => (
                      <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm text-slate-900 font-medium">{project.name}</span>
                        <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
                          {project.role || project.position}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">Sin proyectos asignados</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

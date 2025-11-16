"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
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
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

const PHASES = [
  "Desarrollo",
  "Preproducción",
  "Rodaje",
  "Postproducción",
  "Finalizado",
];

const PHASE_COLORS: Record<string, string> = {
  Desarrollo: "bg-sky-100 text-sky-700",
  Preproducción: "bg-amber-100 text-amber-700",
  Rodaje: "bg-indigo-100 text-indigo-700",
  Postproducción: "bg-purple-100 text-purple-700",
  Finalizado: "bg-emerald-100 text-emerald-700",
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

  // Data states
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);

  // Filter states
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPhaseFilter, setProjectPhaseFilter] = useState("all");
  const [projectProducerFilter, setProjectProducerFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

  // Modal states
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateProducer, setShowCreateProducer] = useState(false);
  const [showEditProducer, setShowEditProducer] = useState<string | null>(null);
  const [showUserDetails, setShowUserDetails] = useState<string | null>(null);
  const [showAssignUser, setShowAssignUser] = useState<string | null>(null);
  const [showEditProject, setShowEditProject] = useState<string | null>(null);

  // Form states
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

  // Message states
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Expanded rows
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Auth check
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

  // Load data function
  const loadData = async () => {
    if (!userId) return;

    try {
      console.log("🔄 Iniciando carga de datos...");

      // Load producers first
      console.log("📦 Cargando productoras...");
      const producersSnap = await getDocs(collection(db, "producers"));
      console.log(`✅ Productoras encontradas: ${producersSnap.size}`);
      
      const producersData: Producer[] = producersSnap.docs.map((prodDoc) => {
        const data = prodDoc.data();
        console.log(`  - ${data.name} (${prodDoc.id})`);
        return {
          id: prodDoc.id,
          name: data.name,
          createdAt: data.createdAt,
          projectCount: 0,
        };
      });

      // Load projects
      console.log("📁 Cargando proyectos...");
      const projectsSnap = await getDocs(collection(db, "projects"));
      console.log(`✅ Proyectos encontrados: ${projectsSnap.size}`);
      
      const projectsData: Project[] = await Promise.all(
        projectsSnap.docs.map(async (projectDoc) => {
          const data = projectDoc.data();
          console.log(`  - ${data.name} (${projectDoc.id})`);
          
          // Get producer names
          const producerIds = data.producers || [];
          const producerNames = producerIds.map((prodId: string) => {
            const producer = producersData.find(p => p.id === prodId);
            return producer?.name || "Productora eliminada";
          });

          // Load members
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

      // Update producer project counts
      producersData.forEach(producer => {
        producer.projectCount = projectsData.filter(p => 
          p.producers?.includes(producer.id)
        ).length;
      });

      setProjects(projectsData);
      setProducers(producersData);

      // Load users
      console.log("👥 Cargando usuarios...");
      const usersSnap = await getDocs(collection(db, "users"));
      console.log(`✅ Usuarios encontrados: ${usersSnap.size}`);
      
      const usersData: User[] = await Promise.all(
        usersSnap.docs.map(async (userDoc) => {
          const data = userDoc.data();
          console.log(`  - ${data.name || data.email} (${userDoc.id})`);
          
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
      
      console.log("✅ Carga completada");
      console.log(`📊 Resumen: ${projectsData.length} proyectos, ${usersData.length} usuarios, ${producersData.length} productoras`);
      
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error("❌ Error cargando datos:", error);
      setErrorMessage("Error al cargar los datos. Revisa la consola.");
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [userId]);

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setSuccessMessage("Datos actualizados correctamente");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  // Create project
  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      setErrorMessage("El nombre del proyecto es obligatorio");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      console.log("📝 Creando proyecto:", newProject);
      
      const projectRef = doc(collection(db, "projects"));
      await setDoc(projectRef, {
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        phase: newProject.phase,
        producers: newProject.producers,
        departments: [],
        createdAt: serverTimestamp(),
      });

      console.log("✅ Proyecto creado:", projectRef.id);

      setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
      setShowCreateProject(false);
      setSuccessMessage("Proyecto creado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      await loadData();
    } catch (error) {
      console.error("❌ Error creando proyecto:", error);
      setErrorMessage("Error al crear el proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Edit project
  const handleEditProject = async () => {
    if (!showEditProject) return;

    setSaving(true);
    setErrorMessage("");

    try {
      console.log("📝 Actualizando proyecto:", showEditProject);
      
      await updateDoc(doc(db, "projects", showEditProject), {
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        phase: newProject.phase,
        producers: newProject.producers,
      });

      console.log("✅ Proyecto actualizado");

      setShowEditProject(null);
      setSuccessMessage("Proyecto actualizado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      await loadData();
    } catch (error) {
      console.error("❌ Error actualizando proyecto:", error);
      setErrorMessage("Error al actualizar el proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Create producer
  const handleCreateProducer = async () => {
    if (!newProducer.trim()) {
      setErrorMessage("El nombre de la productora es obligatorio");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      console.log("🏢 Creando productora:", newProducer);
      
      const producerRef = doc(collection(db, "producers"));
      await setDoc(producerRef, {
        name: newProducer.trim(),
        createdAt: serverTimestamp(),
      });

      console.log("✅ Productora creada:", producerRef.id);

      setNewProducer("");
      setShowCreateProducer(false);
      setSuccessMessage("Productora creada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      await loadData();
    } catch (error) {
      console.error("❌ Error creando productora:", error);
      setErrorMessage(`Error al crear la productora: ${error}`);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Edit producer
  const handleEditProducer = async () => {
    if (!showEditProducer || !editProducerName.trim()) return;

    setSaving(true);
    setErrorMessage("");

    try {
      console.log("📝 Actualizando productora:", showEditProducer);
      
      await updateDoc(doc(db, "producers", showEditProducer), {
        name: editProducerName.trim(),
      });

      console.log("✅ Productora actualizada");

      setShowEditProducer(null);
      setEditProducerName("");
      setSuccessMessage("Productora actualizada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      await loadData();
    } catch (error) {
      console.error("❌ Error actualizando productora:", error);
      setErrorMessage("Error al actualizar la productora");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Delete producer
  const handleDeleteProducer = async (producerId: string) => {
    const producer = producers.find(p => p.id === producerId);
    if (!producer) return;

    if (producer.projectCount > 0) {
      setErrorMessage(`No se puede eliminar "${producer.name}" porque tiene ${producer.projectCount} proyecto(s) asignado(s)`);
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar la productora "${producer.name}"?`)) {
      return;
    }

    setSaving(true);
    try {
      console.log("🗑️ Eliminando productora:", producerId);
      
      await deleteDoc(doc(db, "producers", producerId));

      console.log("✅ Productora eliminada");

      setSuccessMessage("Productora eliminada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
      
      await loadData();
    } catch (error) {
      console.error("❌ Error eliminando productora:", error);
      setErrorMessage("Error al eliminar la productora");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Assign user to project
  const handleAssignUser = async () => {
    if (!assignUserForm.userId || !assignUserForm.role || !showAssignUser) {
      setErrorMessage("Selecciona un usuario y un rol");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const user = users.find(u => u.id === assignUserForm.userId);
      const project = projects.find(p => p.id === showAssignUser);
      if (!user || !project) return;

      if (project.members?.some(m => m.userId === user.id)) {
        setErrorMessage("Este usuario ya está asignado al proyecto");
        setSaving(false);
        setTimeout(() => setErrorMessage(""), 3000);
        return;
      }

      console.log("👤 Asignando usuario al proyecto:", user.name, "→", project.name);

      await setDoc(doc(db, `projects/${showAssignUser}/members`, user.id), {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: assignUserForm.role,
        permissions: {
          config: true,
          accounting: true,
          team: true,
        },
        addedAt: serverTimestamp(),
      });

      await setDoc(doc(db, `userProjects/${user.id}/projects/${showAssignUser}`), {
        projectId: showAssignUser,
        role: assignUserForm.role,
        permissions: {
          config: true,
          accounting: true,
          team: true,
        },
        addedAt: serverTimestamp(),
      });

      console.log("✅ Usuario asignado correctamente");

      setAssignUserForm({ userId: "", role: "" });
      setShowAssignUser(null);
      setSuccessMessage("Usuario asignado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      await loadData();
    } catch (error) {
      console.error("❌ Error asignando usuario:", error);
      setErrorMessage("Error al asignar el usuario");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Remove user from project
  const handleRemoveUserFromProject = async (projectId: string, userId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este usuario del proyecto?")) {
      return;
    }

    setSaving(true);
    try {
      console.log("🗑️ Eliminando usuario del proyecto");
      
      await deleteDoc(doc(db, `projects/${projectId}/members`, userId));
      await deleteDoc(doc(db, `userProjects/${userId}/projects/${projectId}`));

      console.log("✅ Usuario eliminado del proyecto");

      setSuccessMessage("Usuario eliminado del proyecto");
      setTimeout(() => setSuccessMessage(""), 3000);

      await loadData();
    } catch (error) {
      console.error("❌ Error eliminando usuario del proyecto:", error);
      setErrorMessage("Error al eliminar el usuario del proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Delete project
  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar el proyecto "${project.name}"? Se eliminarán todos sus miembros. Esta acción no se puede deshacer.`)) {
      return;
    }

    setSaving(true);
    try {
      console.log("🗑️ Eliminando proyecto:", projectId);
      
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `userProjects/${memberDoc.id}/projects/${projectId}`));
        await deleteDoc(memberDoc.ref);
      }

      await deleteDoc(doc(db, "projects", projectId));

      console.log("✅ Proyecto eliminado");

      setSuccessMessage("Proyecto eliminado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
      
      await loadData();
    } catch (error) {
      console.error("❌ Error eliminando proyecto:", error);
      setErrorMessage("Error al eliminar el proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (user.role === "admin") {
      setErrorMessage("No puedes eliminar usuarios administradores");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario "${user.name}"? Se eliminará de todos sus proyectos.`)) {
      return;
    }

    setSaving(true);
    try {
      console.log("🗑️ Eliminando usuario:", userId);
      
      for (const project of user.projects) {
        await deleteDoc(doc(db, `projects/${project.id}/members`, userId));
      }

      const userProjectsSnap = await getDocs(collection(db, `userProjects/${userId}/projects`));
      for (const upDoc of userProjectsSnap.docs) {
        await deleteDoc(upDoc.ref);
      }

      await deleteDoc(doc(db, "users", userId));

      console.log("✅ Usuario eliminado");

      setSuccessMessage("Usuario eliminado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
      
      await loadData();
    } catch (error) {
      console.error("❌ Error eliminando usuario:", error);
      setErrorMessage("Error al eliminar el usuario");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Toggle user role
  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    
    if (!confirm(`¿Cambiar rol de ${currentRole === "admin" ? "Administrador" : "Usuario"} a ${newRole === "admin" ? "Administrador" : "Usuario"}?`)) {
      return;
    }

    setSaving(true);
    try {
      console.log("🔄 Cambiando rol de usuario:", userId, "→", newRole);
      
      await updateDoc(doc(db, "users", userId), {
        role: newRole,
      });

      console.log("✅ Rol actualizado");

      setSuccessMessage("Rol actualizado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
      
      await loadData();
    } catch (error) {
      console.error("❌ Error actualizando rol:", error);
      setErrorMessage("Error al actualizar el rol");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Toggle expanded project
  const toggleProjectExpand = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  // Filtered data
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
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando panel de administración...</p>
          <p className="text-slate-500 text-xs mt-2">Revisa la consola para ver el progreso</p>
        </div>
      </div>
    );
  }

  const activeProjects = projects.filter(p => p.phase !== "Finalizado").length;
  const finishedProjects = projects.filter(p => p.phase === "Finalizado").length;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-2">
                  Panel de administración
                </h1>
                <p className="text-slate-600">
                  Gestión completa de la plataforma
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                title="Refrescar datos"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Actualizando..." : "Refrescar"}
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-blue-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Briefcase size={24} />
                  </div>
                  <div className="text-3xl font-bold text-blue-700">{projects.length}</div>
                </div>
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Proyectos totales</h3>
                <p className="text-xs text-blue-700">En la plataforma</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-emerald-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Zap size={24} />
                  </div>
                  <div className="text-3xl font-bold text-emerald-700">{activeProjects}</div>
                </div>
                <h3 className="text-sm font-semibold text-emerald-900 mb-1">Activos</h3>
                <p className="text-xs text-emerald-700">En producción</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-purple-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Users size={24} />
                  </div>
                  <div className="text-3xl font-bold text-purple-700">{users.length}</div>
                </div>
                <h3 className="text-sm font-semibold text-purple-900 mb-1">Usuarios</h3>
                <p className="text-xs text-purple-700">Registrados</p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-amber-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Building2 size={24} />
                  </div>
                  <div className="text-3xl font-bold text-amber-700">{producers.length}</div>
                </div>
                <h3 className="text-sm font-semibold text-amber-900 mb-1">Productoras</h3>
                <p className="text-xs text-amber-700">Registradas</p>
              </div>
            </div>
          </header>

          {/* Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <CheckCircle size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-200 mb-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "overview"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard size={16} />
                Vista general
              </div>
            </button>
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "projects"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Briefcase size={16} />
                Proyectos ({projects.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "users"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={16} />
                Usuarios ({users.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab("producers")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "producers"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 size={16} />
                Productoras ({producers.length})
              </div>
            </button>
          </div>

          {/* Content */}
          <div>
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Últimos proyectos</h3>
                    <div className="space-y-3">
                      {projects.slice(0, 5).map(project => (
                        <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">{project.name}</p>
                            <p className="text-xs text-slate-600">
                              {project.producerNames && project.producerNames.length > 0
                                ? project.producerNames.join(", ")
                                : "Sin productora"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-1 rounded ${PHASE_COLORS[project.phase]}`}>
                              {project.phase}
                            </span>
                            <span className="text-xs text-slate-500">
                              {project.memberCount} {project.memberCount === 1 ? "miembro" : "miembros"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {projects.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">No hay proyectos todavía</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Últimos usuarios</h3>
                    <div className="space-y-3">
                      {users.slice(0, 5).map(user => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">{user.name}</p>
                            <p className="text-xs text-slate-600">{user.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-1 rounded ${
                              user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"
                            }`}>
                              {user.role === "admin" ? "Admin" : "Usuario"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {user.projectCount} {user.projectCount === 1 ? "proyecto" : "proyectos"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {users.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">No hay usuarios todavía</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Projects by phase */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Proyectos por fase</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {PHASES.map(phase => {
                      const count = projects.filter(p => p.phase === phase).length;
                      return (
                        <div key={phase} className="text-center p-4 bg-slate-50 rounded-lg">
                          <div className={`text-2xl font-bold mb-1 ${PHASE_COLORS[phase].split(' ')[1]}`}>
                            {count}
                          </div>
                          <div className="text-xs text-slate-600">{phase}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === "projects" && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                  <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
                    <div className="relative flex-1 max-w-md">
                      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar proyectos..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                      />
                    </div>
                    <select
                      value={projectPhaseFilter}
                      onChange={(e) => setProjectPhaseFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="all">Todas las fases</option>
                      {PHASES.map(phase => (
                        <option key={phase} value={phase}>{phase}</option>
                      ))}
                    </select>
                    <select
                      value={projectProducerFilter}
                      onChange={(e) => setProjectProducerFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="all">Todas las productoras</option>
                      {producers.map(producer => (
                        <option key={producer.id} value={producer.id}>{producer.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => setShowCreateProject(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <FolderPlus size={16} />
                    Crear proyecto
                  </button>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                    <Briefcase size={48} className="text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      No hay proyectos
                    </h3>
                    <p className="text-slate-600 text-sm">
                      {projectSearch || projectPhaseFilter !== "all" || projectProducerFilter !== "all"
                        ? "No se encontraron proyectos con los filtros aplicados"
                        : "Crea tu primer proyecto para empezar"}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-8"></th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Proyecto</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Productoras</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Fase</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Miembros</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.map(project => {
                          const isExpanded = expandedProjects.has(project.id);
                          
                          return (
                            <>
                              <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-3 px-4">
                                  {project.memberCount > 0 && (
                                    <button
                                      onClick={() => toggleProjectExpand(project.id)}
                                      className="text-slate-400 hover:text-slate-600"
                                    >
                                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="text-sm font-medium text-slate-900">{project.name}</p>
                                  {project.description && (
                                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{project.description}</p>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {project.producerNames && project.producerNames.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {project.producerNames.map((name, idx) => (
                                        <span key={idx} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-slate-400">Sin productora</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`text-xs font-medium px-2 py-1 rounded ${PHASE_COLORS[project.phase]}`}>
                                    {project.phase}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="text-sm text-slate-700">{project.memberCount}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center justify-end gap-1">
                                    <Link
                                      href={`/project/${project.id}/config`}
                                      className="text-slate-600 hover:text-slate-900 p-1.5 hover:bg-slate-100 rounded transition-colors"
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
                                      className="text-blue-600 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded transition-colors"
                                      title="Editar proyecto"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button
                                      onClick={() => setShowAssignUser(project.id)}
                                      className="text-emerald-600 hover:text-emerald-700 p-1.5 hover:bg-emerald-50 rounded transition-colors"
                                      title="Asignar usuario"
                                    >
                                      <UserPlus size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteProject(project.id)}
                                      disabled={saving}
                                      className="text-red-600 hover:text-red-700 p-1.5 hover:bg-red-50 rounded transition-colors"
                                      title="Eliminar proyecto"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && project.members && project.members.length > 0 && (
                                <tr>
                                  <td colSpan={6} className="bg-slate-50 px-4 py-3">
                                    <div className="pl-8">
                                      <p className="text-xs font-semibold text-slate-600 uppercase mb-2">
                                        Miembros del proyecto
                                      </p>
                                      <div className="space-y-2">
                                        {project.members.map(member => (
                                          <div key={member.userId} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                                            <div>
                                              <p className="text-sm font-medium text-slate-900">{member.name}</p>
                                              <p className="text-xs text-slate-600">{member.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                                                {member.role || `${member.position} - ${member.department}`}
                                              </span>
                                              <button
                                                onClick={() => handleRemoveUserFromProject(project.id, member.userId)}
                                                disabled={saving}
                                                className="text-red-600 hover:text-red-700 p-1"
                                                title="Eliminar del proyecto"
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
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                  <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
                    <div className="relative flex-1 max-w-md">
                      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar usuarios..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                      />
                    </div>
                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="all">Todos los roles</option>
                      <option value="admin">Administradores</option>
                      <option value="user">Usuarios</option>
                    </select>
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                    <Users size={48} className="text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      No hay usuarios
                    </h3>
                    <p className="text-slate-600 text-sm">
                      No se encontraron usuarios con los filtros aplicados
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Usuario</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Rol</th>
                          <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Proyectos</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(user => (
                          <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <p className="text-sm font-medium text-slate-900">{user.name}</p>
                              <p className="text-xs text-slate-600">{user.email}</p>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`text-xs font-medium px-2 py-1 rounded ${
                                user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"
                              }`}>
                                {user.role === "admin" ? "Administrador" : "Usuario"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setShowUserDetails(user.id)}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                              >
                                {user.projectCount} {user.projectCount === 1 ? "proyecto" : "proyectos"}
                              </button>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setShowUserDetails(user.id)}
                                  className="text-slate-600 hover:text-slate-900 p-1.5 hover:bg-slate-100 rounded transition-colors"
                                  title="Ver detalles"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={() => handleToggleUserRole(user.id, user.role)}
                                  disabled={saving}
                                  className="text-blue-600 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded transition-colors text-xs font-medium"
                                  title={user.role === "admin" ? "Quitar admin" : "Hacer admin"}
                                >
                                  <Shield size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={saving || user.role === "admin"}
                                  className="text-red-600 hover:text-red-700 p-1.5 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={user.role === "admin" ? "No se puede eliminar admin" : "Eliminar usuario"}
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
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Gestión de productoras
                  </h2>
                  <button
                    onClick={() => setShowCreateProducer(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus size={16} />
                    Crear productora
                  </button>
                </div>

                {producers.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                    <Building2 size={48} className="text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      No hay productoras
                    </h3>
                    <p className="text-slate-600 text-sm mb-4">
                      Crea tu primera productora para empezar
                    </p>
                    <button
                      onClick={() => setShowCreateProducer(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Plus size={16} />
                      Crear productora
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {producers.map(producer => (
                      <div key={producer.id} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition-shadow group">
                        <div className="flex items-center justify-between mb-3">
                          <Building2 size={24} className="text-amber-600" />
                          <span className="text-2xl font-bold text-slate-900">{producer.projectCount}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-1">{producer.name}</h3>
                        <p className="text-xs text-slate-600 mb-4">
                          {producer.projectCount} {producer.projectCount === 1 ? "proyecto" : "proyectos"}
                        </p>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditProducerName(producer.name);
                              setShowEditProducer(producer.id);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit2 size={14} />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteProducer(producer.id)}
                            disabled={saving || producer.projectCount > 0}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={producer.projectCount > 0 ? "No se puede eliminar (tiene proyectos)" : "Eliminar"}
                          >
                            <Trash2 size={14} />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals continuarán en el siguiente mensaje... */}
      
      {/* Create/Edit Project Modal */}
      {(showCreateProject || showEditProject) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                {showEditProject ? "Editar proyecto" : "Crear nuevo proyecto"}
              </h3>
              <button
                onClick={() => {
                  setShowCreateProject(false);
                  setShowEditProject(null);
                  setNewProject({ name: "", description: "", phase: "Desarrollo", producers: [] });
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del proyecto *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="Nombre del proyecto"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Descripción del proyecto"
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fase inicial</label>
                <select
                  value={newProject.phase}
                  onChange={(e) => setNewProject({ ...newProject, phase: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                >
                  {PHASES.map(phase => (
                    <option key={phase} value={phase}>{phase}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Productoras (puedes seleccionar varias)
                </label>
                {producers.length > 0 ? (
                  <div className="border border-slate-300 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {producers.map(producer => (
                      <label key={producer.id} className="flex items-center gap-2 py-2 cursor-pointer hover:bg-slate-50 px-2 rounded">
                        <input
                          type="checkbox"
                          checked={newProject.producers.includes(producer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewProject({
                                ...newProject,
                                producers: [...newProject.producers, producer.id]
                              });
                            } else {
                              setNewProject({
                                ...newProject,
                                producers: newProject.producers.filter(id => id !== producer.id)
                              });
                            }
                          }}
                          className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                        />
                        <span className="text-sm text-slate-700">{producer.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="border border-slate-300 rounded-lg p-4 text-center">
                    <p className="text-sm text-slate-500 mb-3">
                      No hay productoras disponibles. Crea una primero.
                    </p>
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
                className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">
                {showEditProducer ? "Editar productora" : "Crear productora"}
              </h3>
              <button
                onClick={() => {
                  setShowCreateProducer(false);
                  setShowEditProducer(null);
                  setNewProducer("");
                  setEditProducerName("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre de la productora *</label>
                <input
                  type="text"
                  value={showEditProducer ? editProducerName : newProducer}
                  onChange={(e) => showEditProducer ? setEditProducerName(e.target.value) : setNewProducer(e.target.value)}
                  placeholder="Nombre de la productora"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                  autoFocus
                />
              </div>

              <button
                onClick={showEditProducer ? handleEditProducer : handleCreateProducer}
                disabled={saving || (showEditProducer ? !editProducerName.trim() : !newProducer.trim())}
                className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Asignar usuario al proyecto</h3>
              <button
                onClick={() => {
                  setShowAssignUser(null);
                  setAssignUserForm({ userId: "", role: "" });
                }}
                className="text-slate-400 hover:text-slate-600"
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
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                >
                  <option value="">Seleccionar usuario</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol en el proyecto *</label>
                <select
                  value={assignUserForm.role}
                  onChange={(e) => setAssignUserForm({ ...assignUserForm, role: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
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
                className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Asignando..." : "Asignar usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showUserDetails && (() => {
        const user = users.find(u => u.id === showUserDetails);
        if (!user) return null;

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-slate-900">Detalles del usuario</h3>
                <button onClick={() => setShowUserDetails(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-700">Nombre</p>
                  <p className="text-slate-900">{user.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Email</p>
                  <p className="text-slate-900">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Rol</p>
                  <span className={`inline-block text-xs font-medium px-2 py-1 rounded ${
                    user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"
                  }`}>
                    {user.role === "admin" ? "Administrador" : "Usuario"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Proyectos asignados</p>
                  {user.projects && user.projects.length > 0 ? (
                    <div className="space-y-2">
                      {user.projects.map(project => (
                        <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-sm text-slate-900">{project.name}</span>
                          <span className="text-xs text-slate-600">
                            {project.role || `${project.position} - ${project.department}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">Sin proyectos asignados</p>
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

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  query,
  where,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import {
  LayoutDashboard,
  FolderPlus,
  Users,
  Building2,
  Search,
  Filter,
  X,
  Edit2,
  Trash2,
  UserPlus,
  Briefcase,
  Calendar,
  CheckCircle,
  AlertCircle,
  Shield,
  Plus,
  FileText,
  Clock,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

const PHASES = [
  "Desarrollo",
  "Preproducción",
  "Rodaje",
  "Postproducción",
  "Finalizado",
];

const PROJECT_ROLES = ["PM", "Controller", "PC"];

interface Project {
  id: string;
  name: string;
  phase: string;
  description?: string;
  producer?: string;
  departments?: string[];
  createdAt: Timestamp | Date;
  memberCount?: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Timestamp | Date;
  projectCount?: number;
  projects?: { id: string; name: string; role?: string }[];
}

interface Producer {
  id: string;
  name: string;
  createdAt: Timestamp | Date;
  projectCount?: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
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
  const [showProjectDetails, setShowProjectDetails] = useState<string | null>(null);
  const [showUserDetails, setShowUserDetails] = useState<string | null>(null);
  const [showAssignUser, setShowAssignUser] = useState<string | null>(null);

  // Form states
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    phase: "Desarrollo",
    producer: "",
  });
  const [newProducer, setNewProducer] = useState("");
  const [assignUserForm, setAssignUserForm] = useState({
    userId: "",
    role: "",
  });

  // Message states
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Auth check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userRole = userDoc.exists() ? userDoc.data().role : "user";

        if (userRole !== "admin") {
          router.push("/dashboard");
          return;
        }

        setUserId(user.uid);
      } catch (error) {
        console.error("Error verificando usuario:", error);
        router.push("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Load data
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      try {
        // Load projects
        const projectsSnap = await getDocs(collection(db, "projects"));
        const projectsData: Project[] = await Promise.all(
          projectsSnap.docs.map(async (projectDoc) => {
            const data = projectDoc.data();
            const membersSnap = await getDocs(collection(db, `projects/${projectDoc.id}/members`));
            
            return {
              id: projectDoc.id,
              name: data.name,
              phase: data.phase,
              description: data.description,
              producer: data.producer,
              departments: data.departments || [],
              createdAt: data.createdAt,
              memberCount: membersSnap.size,
            };
          })
        );
        setProjects(projectsData);

        // Load users
        const usersSnap = await getDocs(collection(db, "users"));
        const usersData: User[] = await Promise.all(
          usersSnap.docs.map(async (userDoc) => {
            const data = userDoc.data();
            const userProjectsSnap = await getDocs(collection(db, `userProjects/${userDoc.id}/projects`));
            
            const userProjects = await Promise.all(
              userProjectsSnap.docs.map(async (upDoc) => {
                const upData = upDoc.data();
                const projectDoc = await getDoc(doc(db, "projects", upDoc.id));
                return {
                  id: upDoc.id,
                  name: projectDoc.exists() ? projectDoc.data().name : "Proyecto eliminado",
                  role: upData.role || upData.department,
                };
              })
            );

            return {
              id: userDoc.id,
              name: data.name,
              email: data.email,
              role: data.role,
              createdAt: data.createdAt,
              projectCount: userProjectsSnap.size,
              projects: userProjects,
            };
          })
        );
        setUsers(usersData);

        // Load producers
        const producersSnap = await getDocs(collection(db, "producers"));
        const producersData: Producer[] = await Promise.all(
          producersSnap.docs.map(async (prodDoc) => {
            const data = prodDoc.data();
            const projectsWithProducer = projectsData.filter(p => p.producer === prodDoc.id);
            
            return {
              id: prodDoc.id,
              name: data.name,
              createdAt: data.createdAt,
              projectCount: projectsWithProducer.length,
            };
          })
        );
        setProducers(producersData);

        setLoading(false);
      } catch (error) {
        console.error("Error cargando datos:", error);
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };

    loadData();
  }, [userId]);

  // Create project
  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      setErrorMessage("El nombre del proyecto es obligatorio");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const projectRef = doc(collection(db, "projects"));
      await setDoc(projectRef, {
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        phase: newProject.phase,
        producer: newProject.producer || null,
        departments: [],
        createdAt: serverTimestamp(),
      });

      // Reload projects
      const projectsSnap = await getDocs(collection(db, "projects"));
      const projectsData: Project[] = await Promise.all(
        projectsSnap.docs.map(async (projectDoc) => {
          const data = projectDoc.data();
          const membersSnap = await getDocs(collection(db, `projects/${projectDoc.id}/members`));
          
          return {
            id: projectDoc.id,
            name: data.name,
            phase: data.phase,
            description: data.description,
            producer: data.producer,
            departments: data.departments || [],
            createdAt: data.createdAt,
            memberCount: membersSnap.size,
          };
        })
      );
      setProjects(projectsData);

      setNewProject({ name: "", description: "", phase: "Desarrollo", producer: "" });
      setShowCreateProject(false);
      setSuccessMessage("Proyecto creado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error creando proyecto:", error);
      setErrorMessage("Error al crear el proyecto");
    } finally {
      setSaving(false);
    }
  };

  // Create producer
  const handleCreateProducer = async () => {
    if (!newProducer.trim()) {
      setErrorMessage("El nombre de la productora es obligatorio");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const producerRef = doc(collection(db, "producers"));
      await setDoc(producerRef, {
        name: newProducer.trim(),
        createdAt: serverTimestamp(),
      });

      const producersSnap = await getDocs(collection(db, "producers"));
      const producersData: Producer[] = await Promise.all(
        producersSnap.docs.map(async (prodDoc) => {
          const data = prodDoc.data();
          const projectsWithProducer = projects.filter(p => p.producer === prodDoc.id);
          
          return {
            id: prodDoc.id,
            name: data.name,
            createdAt: data.createdAt,
            projectCount: projectsWithProducer.length,
          };
        })
      );
      setProducers(producersData);

      setNewProducer("");
      setShowCreateProducer(false);
      setSuccessMessage("Productora creada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error creando productora:", error);
      setErrorMessage("Error al crear la productora");
    } finally {
      setSaving(false);
    }
  };

  // Assign user to project
  const handleAssignUser = async () => {
    if (!assignUserForm.userId || !assignUserForm.role || !showAssignUser) {
      setErrorMessage("Selecciona un usuario y un rol");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const user = users.find(u => u.id === assignUserForm.userId);
      if (!user) return;

      // Add to project members
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

      // Add to user projects
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

      setAssignUserForm({ userId: "", role: "" });
      setShowAssignUser(null);
      setSuccessMessage("Usuario asignado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      // Reload data
      window.location.reload();
    } catch (error) {
      console.error("Error asignando usuario:", error);
      setErrorMessage("Error al asignar el usuario");
    } finally {
      setSaving(false);
    }
  };

  // Delete project
  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este proyecto? Esta acción no se puede deshacer.")) {
      return;
    }

    setSaving(true);
    try {
      // Delete project members
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `userProjects/${memberDoc.id}/projects/${projectId}`));
        await deleteDoc(memberDoc.ref);
      }

      // Delete project
      await deleteDoc(doc(db, "projects", projectId));

      setProjects(projects.filter(p => p.id !== projectId));
      setSuccessMessage("Proyecto eliminado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error eliminando proyecto:", error);
      setErrorMessage("Error al eliminar el proyecto");
    } finally {
      setSaving(false);
    }
  };

  // Toggle user role
  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    
    if (!confirm(`¿Cambiar rol de ${currentRole} a ${newRole}?`)) {
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", userId), {
        role: newRole,
      });

      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      setSuccessMessage("Rol actualizado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error actualizando rol:", error);
      setErrorMessage("Error al actualizar el rol");
    } finally {
      setSaving(false);
    }
  };

  // Filtered data
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(projectSearch.toLowerCase());
    const matchesPhase = projectPhaseFilter === "all" || p.phase === projectPhaseFilter;
    const matchesProducer = projectProducerFilter === "all" || p.producer === projectProducerFilter;
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
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-slate-700 to-slate-900 p-2 rounded-lg">
              <Shield size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Panel de administración</h1>
              <p className="text-sm text-slate-500">Gestión completa de la plataforma</p>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="max-w-7xl mx-auto px-6 mt-4">
        {successMessage && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
            <CheckCircle size={20} />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="flex gap-2 border-b border-slate-200">
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
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <Briefcase size={24} className="text-blue-600" />
                  <span className="text-3xl font-bold text-slate-900">{projects.length}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Proyectos totales</h3>
                <p className="text-xs text-slate-600 mt-1">En la plataforma</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <Users size={24} className="text-emerald-600" />
                  <span className="text-3xl font-bold text-slate-900">{users.length}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Usuarios totales</h3>
                <p className="text-xs text-slate-600 mt-1">Registrados</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <Shield size={24} className="text-purple-600" />
                  <span className="text-3xl font-bold text-slate-900">
                    {users.filter(u => u.role === "admin").length}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Administradores</h3>
                <p className="text-xs text-slate-600 mt-1">Con acceso total</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <Building2 size={24} className="text-amber-600" />
                  <span className="text-3xl font-bold text-slate-900">{producers.length}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Productoras</h3>
                <p className="text-xs text-slate-600 mt-1">Registradas</p>
              </div>
            </div>

            {/* Recent activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Últimos proyectos</h3>
                <div className="space-y-3">
                  {projects.slice(0, 5).map(project => (
                    <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{project.name}</p>
                        <p className="text-xs text-slate-600">{project.phase}</p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {project.memberCount} miembros
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Últimos usuarios</h3>
                <div className="space-y-3">
                  {users.slice(0, 5).map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-600">{user.email}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"
                      }`}>
                        {user.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {activeTab === "projects" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-3 flex-1">
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
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <FolderPlus size={16} />
                Crear proyecto
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Proyecto</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Productora</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Fase</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Miembros</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(project => {
                    const producer = producers.find(p => p.id === project.producer);
                    return (
                      <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <p className="text-sm font-medium text-slate-900">{project.name}</p>
                          {project.description && (
                            <p className="text-xs text-slate-600">{project.description}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-700">
                            {producer?.name || "Sin productora"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded">
                            {project.phase}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-700">{project.memberCount || 0}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setShowAssignUser(project.id)}
                              className="text-blue-600 hover:text-blue-700 p-1"
                              title="Asignar usuario"
                            >
                              <UserPlus size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteProject(project.id)}
                              disabled={saving}
                              className="text-red-600 hover:text-red-700 p-1"
                              title="Eliminar proyecto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-3 flex-1">
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

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Usuario</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Rol</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Proyectos</th>
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
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setShowUserDetails(user.id)}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          {user.projectCount || 0} {user.projectCount === 1 ? "proyecto" : "proyectos"}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleUserRole(user.id, user.role)}
                            disabled={saving}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
                          >
                            {user.role === "admin" ? "Quitar admin" : "Hacer admin"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {producers.map(producer => (
                <div key={producer.id} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <Building2 size={24} className="text-amber-600" />
                    <span className="text-2xl font-bold text-slate-900">{producer.projectCount || 0}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">{producer.name}</h3>
                  <p className="text-xs text-slate-600">{producer.projectCount || 0} {producer.projectCount === 1 ? "proyecto" : "proyectos"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {/* Create Project Modal */}
      {showCreateProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Crear nuevo proyecto</h3>
              <button onClick={() => setShowCreateProject(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del proyecto</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Productora</label>
                <select
                  value={newProject.producer}
                  onChange={(e) => setNewProject({ ...newProject, producer: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                >
                  <option value="">Sin productora</option>
                  {producers.map(producer => (
                    <option key={producer.id} value={producer.id}>{producer.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCreateProject}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Creando..." : "Crear proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Producer Modal */}
      {showCreateProducer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Crear productora</h3>
              <button onClick={() => setShowCreateProducer(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre de la productora</label>
                <input
                  type="text"
                  value={newProducer}
                  onChange={(e) => setNewProducer(e.target.value)}
                  placeholder="Nombre de la productora"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                />
              </div>

              <button
                onClick={handleCreateProducer}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Creando..." : "Crear productora"}
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
              <button onClick={() => setShowAssignUser(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Usuario</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol en el proyecto</label>
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
                disabled={saving}
                className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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
                        <div key={project.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <span className="text-sm text-slate-900">{project.name}</span>
                          <span className="text-xs text-slate-600">{project.role}</span>
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

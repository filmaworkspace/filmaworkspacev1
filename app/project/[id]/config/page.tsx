"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Info,
  Edit2,
  Save,
  X,
  Building2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Users,
  Briefcase,
  Calendar,
  Folder,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

const PHASES = [
  "Desarrollo",
  "Preproducción",
  "Rodaje",
  "Postproducción",
  "Finalizado",
];

const PHASE_COLORS: Record<string, string> = {
  Desarrollo: "from-sky-400 to-sky-600",
  Preproducción: "from-amber-400 to-amber-600",
  Rodaje: "from-indigo-400 to-indigo-600",
  Postproducción: "from-purple-400 to-purple-600",
  Finalizado: "from-emerald-400 to-emerald-600",
};

interface ProjectData {
  name: string;
  phase: string;
  description?: string;
  producers?: string[];
  departments?: string[];
  createdAt: Timestamp;
}

interface Producer {
  id: string;
  name: string;
}

export default function ConfigGeneral() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasConfigAccess, setHasConfigAccess] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [project, setProject] = useState<ProjectData | null>(null);
  const [allProducers, setAllProducers] = useState<Producer[]>([]);
  const [editingProject, setEditingProject] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [departmentCount, setDepartmentCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);

  const [projectForm, setProjectForm] = useState({
    name: "",
    phase: "",
    description: "",
  });

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Load data
  useEffect(() => {
    if (!userId || !id) return;

    const loadData = async () => {
      try {
        // Check permissions
        const userProjectRef = doc(db, `userProjects/${userId}/projects/${id}`);
        const userProjectSnap = await getDoc(userProjectRef);

        if (!userProjectSnap.exists()) {
          setErrorMessage("No tienes acceso a este proyecto");
          setLoading(false);
          return;
        }

        const userProjectData = userProjectSnap.data();
        const hasConfig = userProjectData.permissions?.config || false;

        setHasConfigAccess(hasConfig);

        if (!hasConfig) {
          setErrorMessage("No tienes permisos para acceder a la configuración");
          setLoading(false);
          return;
        }

        // Load project
        const projectRef = doc(db, "projects", id as string);
        const projectSnap = await getDoc(projectRef);

        if (projectSnap.exists()) {
          const projectData = projectSnap.data();
          setProjectName(projectData.name); // ✅ LÍNEA AGREGADA
          const project: ProjectData = {
            name: projectData.name,
            phase: projectData.phase,
            description: projectData.description || "",
            producers: projectData.producers || [],
            departments: projectData.departments || [],
            createdAt: projectData.createdAt,
          };
          setProject(project);
          setProjectForm({
            name: project.name,
            phase: project.phase,
            description: project.description || "",
          });
          setDepartmentCount(project.departments?.length || 0);
        }

        // Load all producers
        const producersSnap = await getDocs(collection(db, "producers"));
        const producersData: Producer[] = producersSnap.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
        }));
        setAllProducers(producersData);

        // Load member count
        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMemberCount(membersSnap.size);

        // Load invitation count
        const invitationsSnap = await getDocs(collection(db, "invitations"));
        const pendingInvitations = invitationsSnap.docs.filter(
          (doc) => doc.data().projectId === id && doc.data().status === "pending"
        );
        setInvitationCount(pendingInvitations.length);

        setLoading(false);
      } catch (error) {
        console.error("Error cargando datos:", error);
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };

    loadData();
  }, [userId, id, router]);

  const handleSaveProject = async () => {
    if (!id) return;
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const projectRef = doc(db, "projects", id as string);
      await updateDoc(projectRef, {
        name: projectForm.name,
        phase: projectForm.phase,
        description: projectForm.description,
      });

      setProject({
        ...project!,
        name: projectForm.name,
        phase: projectForm.phase,
        description: projectForm.description,
      });

      setProjectName(projectForm.name); // ✅ También actualiza el banner al guardar

      setEditingProject(false);
      setSuccessMessage("Proyecto actualizado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error actualizando proyecto:", error);
      setErrorMessage("Error al actualizar el proyecto");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProducer = async (producerId: string) => {
    if (!id) return;
    setSaving(true);

    try {
      const projectRef = doc(db, "projects", id as string);
      const isCurrentlyAssigned = project?.producers?.includes(producerId);

      if (isCurrentlyAssigned) {
        await updateDoc(projectRef, {
          producers: arrayRemove(producerId),
        });
        setProject({
          ...project!,
          producers: project?.producers?.filter((p) => p !== producerId) || [],
        });
      } else {
        await updateDoc(projectRef, {
          producers: arrayUnion(producerId),
        });
        setProject({
          ...project!,
          producers: [...(project?.producers || []), producerId],
        });
      }

      setSuccessMessage(
        isCurrentlyAssigned ? "Productora eliminada" : "Productora agregada"
      );
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error actualizando productoras:", error);
      setErrorMessage("Error al actualizar las productoras");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Hace 1 día";
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
    return `Hace ${Math.floor(diffDays / 365)} años`;
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !project) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-slate-700 mb-4">{errorMessage}</p>
          <Link href="/dashboard" className="text-slate-900 hover:underline font-medium">
            Volver al panel principal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-slate-50 to-slate-100 border-y border-slate-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-700 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-slate-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          Volver a proyectos
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && project && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Project Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                    <Info size={20} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-slate-900">Información del proyecto</h1>
                    <p className="text-sm text-slate-500">Gestiona los datos básicos</p>
                  </div>
                </div>
                {!editingProject && (
                  <button
                    onClick={() => setEditingProject(true)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Edit2 size={16} />
                    Editar
                  </button>
                )}
              </div>

              {!editingProject ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre del proyecto
                    </label>
                    <p className="text-slate-900 text-lg">{project?.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fase actual
                    </label>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white bg-gradient-to-r ${
                        PHASE_COLORS[project?.phase || ""]
                      }`}
                    >
                      {project?.phase}
                    </span>
                  </div>
                  {project?.description && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Descripción
                      </label>
                      <p className="text-slate-600">{project.description}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Nombre del proyecto
                    </label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Fase actual
                    </label>
                    <select
                      value={projectForm.phase}
                      onChange={(e) => setProjectForm({ ...projectForm, phase: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    >
                      {PHASES.map((phase) => (
                        <option key={phase} value={phase}>
                          {phase}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={projectForm.description}
                      onChange={(e) =>
                        setProjectForm({ ...projectForm, description: e.target.value })
                      }
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none resize-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveProject}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Save size={16} />
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingProject(false);
                        setProjectForm({
                          name: project?.name || "",
                          phase: project?.phase || "",
                          description: project?.description || "",
                        });
                      }}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      <X size={16} />
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Producers Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
                  <Building2 size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Productoras asignadas</h2>
                  <p className="text-sm text-slate-500">
                    {project?.producers?.length || 0} productora{project?.producers?.length !== 1 ? 's' : ''} vinculada{project?.producers?.length !== 1 ? 's' : ''} al proyecto
                  </p>
                </div>
              </div>

              {project?.producers && project.producers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {project.producers.map((producerId) => {
                    const producer = allProducers.find(p => p.id === producerId);
                    if (!producer) return null;
                    
                    return (
                      <div
                        key={producer.id}
                        className="p-4 rounded-lg border border-slate-200 bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <Building2 size={20} className="text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">
                              {producer.name}
                            </h3>
                            <p className="text-xs text-slate-500">Productora activa</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                  <Building2 size={48} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium mb-1">No hay productoras asignadas</p>
                  <p className="text-sm text-slate-500">
                    Este proyecto aún no tiene productoras vinculadas
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

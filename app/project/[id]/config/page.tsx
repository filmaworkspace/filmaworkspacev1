"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Edit2,
  Save,
  Building2,
  AlertCircle,
  CheckCircle,
  Folder,
  Calendar,
  Clock,
  ArrowLeft,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, Timestamp } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];

const phaseColors: Record<string, { gradient: string; bg: string; border: string; text: string; dot: string; ring: string }> = {
  Desarrollo: {
    gradient: "from-sky-400 to-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    dot: "bg-sky-500",
    ring: "ring-sky-500/20"
  },
  Preproducción: {
    gradient: "from-amber-400 to-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
    ring: "ring-amber-500/20"
  },
  Rodaje: {
    gradient: "from-indigo-400 to-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    ring: "ring-indigo-500/20"
  },
  Postproducción: {
    gradient: "from-purple-400 to-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    dot: "bg-purple-500",
    ring: "ring-purple-500/20"
  },
  Finalizado: {
    gradient: "from-emerald-400 to-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20"
  },
};

interface ProjectData {
  name: string;
  phase: string;
  description?: string;
  producers?: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
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
  const [projectForm, setProjectForm] = useState({ name: "", phase: "", description: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/");
      else setUserId(u.uid);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!userId || !id) return;
    const loadData = async () => {
      try {
        const userProjectSnap = await getDoc(doc(db, `userProjects/${userId}/projects/${id}`));
        if (!userProjectSnap.exists()) {
          setErrorMessage("No tienes acceso a este proyecto");
          setLoading(false);
          return;
        }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) {
          setErrorMessage("No tienes permisos de configuración");
          setLoading(false);
          return;
        }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) {
          const d = projectSnap.data();
          setProjectName(d.name);
          setProject({
            name: d.name,
            phase: d.phase,
            description: d.description || "",
            producers: d.producers || [],
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          });
          setProjectForm({ name: d.name, phase: d.phase, description: d.description || "" });
        }

        const producersSnap = await getDocs(collection(db, "producers"));
        setAllProducers(producersSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
        setLoading(false);
      } catch (error) {
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };
    loadData();
  }, [userId, id, router]);

  const handleSaveProject = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), {
        name: projectForm.name,
        phase: projectForm.phase,
        description: projectForm.description,
        updatedAt: Timestamp.now()
      });
      setProject({
        ...project!,
        name: projectForm.name,
        phase: projectForm.phase,
        description: projectForm.description,
        updatedAt: Timestamp.now()
      });
      setProjectName(projectForm.name);
      setEditingProject(false);
      setSuccessMessage("Cambios guardados correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setErrorMessage("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts: Timestamp) => {
    if (!ts) return "—";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(ts.toDate());
  };

  const formatRelativeTime = (ts: Timestamp) => {
    if (!ts) return "";
    const diff = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
    if (diff < 60) return "hace unos segundos";
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
    return formatDate(ts);
  };

  const currentPhaseStyle = phaseColors[project?.phase || "Desarrollo"];

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !project) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-600 text-sm mb-6">{errorMessage}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm group"
            >
              <Folder size={14} />
              <span>{projectName}</span>
            </Link>
            {project?.updatedAt && (
              <span className="text-slate-500 text-xs flex items-center gap-1.5">
                <Clock size={12} />
                Actualizado {formatRelativeTime(project.updatedAt)}
              </span>
            )}
          </div>

          {/* Title */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center">
              <Settings size={26} className="text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                Configuración
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">Información general del proyecto</p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-grow px-6 md:px-12 py-8 -mt-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Success Message */}
          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-emerald-700">{successMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && project && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle size={16} className="text-red-600" />
              </div>
              <span className="text-sm font-medium text-red-700">{errorMessage}</span>
            </div>
          )}

          {/* Main Project Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${currentPhaseStyle.gradient} flex items-center justify-center shadow-lg`}>
                  <div className="w-3 h-3 bg-white rounded-full"></div>
                </div>
                <div>
                  <h2 className={`text-xl font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Datos del proyecto
                  </h2>
                  <p className="text-sm text-slate-500">Nombre, fase y descripción</p>
                </div>
              </div>
              {!editingProject && (
                <button
                  onClick={() => setEditingProject(true)}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all group"
                >
                  <Edit2 size={14} className="group-hover:rotate-12 transition-transform" />
                  Editar
                </button>
              )}
            </div>

            {/* Card Content */}
            <div className="p-8">
              {!editingProject ? (
                <div className="space-y-8">
                  {/* Project Name Display */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Nombre del proyecto
                      </label>
                      <p className={`text-2xl font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                        {project?.name}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Fase actual
                      </label>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${currentPhaseStyle.bg} ${currentPhaseStyle.border} border`}>
                          <span className={`w-2 h-2 rounded-full ${currentPhaseStyle.dot}`}></span>
                          <span className={`text-sm font-semibold ${currentPhaseStyle.text}`}>
                            {project?.phase}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {project?.description && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Descripción
                      </label>
                      <p className="text-slate-600 leading-relaxed max-w-2xl">
                        {project.description}
                      </p>
                    </div>
                  )}

                  {/* Metadata Footer */}
                  <div className="pt-6 border-t border-slate-100 flex items-center gap-6">
                    <span className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar size={14} />
                      Creado el {formatDate(project?.createdAt!)}
                    </span>
                  </div>
                </div>
              ) : (
                /* Edit Mode */
                <div className="space-y-6">
                  {/* Project Name Input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                      Nombre del proyecto
                    </label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-lg font-medium transition-all"
                      placeholder="Nombre del proyecto"
                    />
                  </div>

                  {/* Phase Selector */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                      Fase del proyecto
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {PHASES.map((phase) => {
                        const style = phaseColors[phase];
                        const isSelected = projectForm.phase === phase;
                        return (
                          <button
                            key={phase}
                            onClick={() => setProjectForm({ ...projectForm, phase })}
                            className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
                              isSelected
                                ? `${style.border} ${style.bg} ring-4 ${style.ring}`
                                : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-full transition-all ${
                              isSelected ? style.dot : "bg-slate-300"
                            }`}></div>
                            <span className={`text-xs font-semibold transition-colors ${
                              isSelected ? style.text : "text-slate-500"
                            }`}>
                              {phase}
                            </span>
                            {isSelected && (
                              <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full ${style.dot} flex items-center justify-center`}>
                                <CheckCircle size={10} className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Description Textarea */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      rows={4}
                      placeholder="Describe brevemente el proyecto, su objetivo y características principales..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm resize-none transition-all"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 pt-4">
                    <button
                      onClick={handleSaveProject}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
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
                          description: project?.description || ""
                        });
                      }}
                      disabled={saving}
                      className="px-6 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Producers Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                  <Building2 size={22} className="text-white" />
                </div>
                <div>
                  <h2 className={`text-xl font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Productoras
                  </h2>
                  <p className="text-sm text-slate-500">
                    {project?.producers?.length || 0} productora{project?.producers?.length !== 1 ? "s" : ""} asociada{project?.producers?.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8">
              {project?.producers && project.producers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {project.producers.map((producerId) => {
                    const producer = allProducers.find((p) => p.id === producerId);
                    if (!producer) return null;
                    return (
                      <div
                        key={producer.id}
                        className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Building2 size={20} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{producer.name}</p>
                          <p className="text-xs text-slate-400">Productora asociada</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Building2 size={28} className="text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium mb-1">Sin productoras asociadas</p>
                  <p className="text-sm text-slate-400">Las productoras aparecerán aquí cuando se asocien al proyecto</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

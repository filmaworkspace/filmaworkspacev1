"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Edit2,
  Save,
  Building2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Settings,
  Archive,
  Copy,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Calendar,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, Timestamp, deleteDoc } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];

const phaseColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Desarrollo: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", dot: "bg-sky-500" },
  Preproducción: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  Rodaje: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500" },
  Postproducción: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  Finalizado: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
};

interface ProjectData {
  name: string;
  phase: string;
  description?: string;
  producers?: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  archived?: boolean;
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
  const [project, setProject] = useState<ProjectData | null>(null);
  const [allProducers, setAllProducers] = useState<Producer[]>([]);
  const [editingProject, setEditingProject] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [projectForm, setProjectForm] = useState({ name: "", phase: "", description: "" });
  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

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
          setLoading(false);
          return;
        }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) {
          setLoading(false);
          return;
        }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) {
          const d = projectSnap.data();
          setProject({
            name: d.name,
            phase: d.phase,
            description: d.description || "",
            producers: d.producers || [],
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            archived: d.archived || false,
          });
          setProjectForm({ name: d.name, phase: d.phase, description: d.description || "" });
        }

        const producersSnap = await getDocs(collection(db, "producers"));
        setAllProducers(producersSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
        setLoading(false);
      } catch {
        showToast("error", "Error al cargar los datos");
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
      setEditingProject(false);
      showToast("success", "Cambios guardados");
    } catch {
      showToast("error", "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const copyProjectId = () => {
    navigator.clipboard.writeText(id as string);
    showToast("success", "ID copiado al portapapeles");
    setShowActions(false);
  };

  const archiveProject = async () => {
    if (!id || !project) return;
    try {
      await updateDoc(doc(db, "projects", id as string), {
        archived: !project.archived,
        updatedAt: Timestamp.now(),
      });
      setProject({ ...project, archived: !project.archived });
      showToast("success", project.archived ? "Proyecto restaurado" : "Proyecto archivado");
      setShowActions(false);
    } catch {
      showToast("error", "Error");
    }
  };

  const deleteProject = async () => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, "projects", id as string));
      router.push("/dashboard");
    } catch {
      showToast("error", "Error al eliminar");
    }
  };

  const formatDate = (ts: Timestamp) => {
    if (!ts) return "—";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(ts.toDate());
  };

  const currentPhaseStyle = phaseColors[project?.phase || "Desarrollo"];

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasConfigAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-600 text-sm mb-4">No tienes acceso a esta configuración</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver a Proyectos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${
          toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">¿Eliminar proyecto?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acción no se puede deshacer. Se eliminarán todos los datos del proyecto.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={deleteProject}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          {/* Project context badge */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft size={12} />
                Proyectos
              </Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">
                {project?.name} {/* CORREGIDO: Usar project?.name en lugar de projectName */}
              </span>
            </div>
          </div>
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* Icono gris */}
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Settings size={24} className="text-slate-600" />
            </div>
      
            {/* Título principal */}
            <h1 className="text-2xl font-semibold text-slate-900">Configuración general</h1>
          </div>
      
          {/* Acciones */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <MoreHorizontal size={20} className="text-slate-500" />
            </button>
      
            {showActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
      
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-20">
                  <button
                    onClick={copyProjectId}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700"
                  >
                    <Copy size={15} className="text-slate-400" /> Copiar ID
                  </button>
                  <button
                    onClick={archiveProject}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700"
                  >
                    <Archive size={15} className="text-slate-400" /> {project?.archived ? "Restaurar" : "Archivar"}
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    onClick={() => { setShowActions(false); setShowDeleteConfirm(true); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                  >
                    <Trash2 size={15} /> Eliminar proyecto
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="space-y-6">
          {/* Project Info Card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Información del proyecto</h2>
              {!editingProject && (
                <button
                  onClick={() => setEditingProject(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
                >
                  <Edit2 size={14} />
                  Editar
                </button>
              )}
            </div>

            <div className="p-6">
              {!editingProject ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Nombre</label>
                      <p className="text-lg font-semibold text-slate-900">{project?.name}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Fase</label>
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${currentPhaseStyle.bg} ${currentPhaseStyle.text} border ${currentPhaseStyle.border}`}>
                        <span className={`w-2 h-2 rounded-full ${currentPhaseStyle.dot}`} />
                        {project?.phase}
                      </span>
                    </div>
                  </div>
                  {project?.description && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Descripción</label>
                      <p className="text-slate-600 leading-relaxed">{project.description}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-6 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Calendar size={14} />
                      Creado {formatDate(project?.createdAt!)}
                    </div>
                    {project?.updatedAt && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <RefreshCw size={14} />
                        Actualizado {formatDate(project.updatedAt)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Nombre</label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Fase</label>
                    <div className="flex flex-wrap gap-2">
                      {PHASES.map((phase) => {
                        const style = phaseColors[phase];
                        const isSelected = projectForm.phase === phase;
                        return (
                          <button
                            key={phase}
                            onClick={() => setProjectForm({ ...projectForm, phase })}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                              isSelected
                                ? `${style.bg} ${style.text} ${style.border}`
                                : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"
                            }`}
                          >
                            {phase}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Descripción</label>
                    <textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm resize-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveProject}
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      <Save size={16} />
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingProject(false);
                        setProjectForm({ name: project?.name || "", phase: project?.phase || "", description: project?.description || "" });
                      }}
                      className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Producers Card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Productoras asociadas</h2>
            </div>
            <div className="p-6">
              {project?.producers && project.producers.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {project.producers.map((producerId) => {
                    const producer = allProducers.find((p) => p.id === producerId);
                    if (!producer) return null;
                    return (
                      <div key={producer.id} className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <Building2 size={16} className="text-amber-600" />
                        <span className="text-sm font-medium text-slate-700">{producer.name}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Sin productoras asociadas</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-4">
            <Link
              href={`/project/${id}/config/users`}
              className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors group"
            >
              <span className="text-sm font-medium text-slate-700">Usuarios</span>
              <ExternalLink size={16} className="text-slate-400 group-hover:text-slate-600" />
            </Link>
            <Link
              href={`/project/${id}/config/departments`}
              className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors group"
            >
              <span className="text-sm font-medium text-slate-700">Departamentos</span>
              <ExternalLink size={16} className="text-slate-400 group-hover:text-slate-600" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

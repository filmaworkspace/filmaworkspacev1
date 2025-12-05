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
    showToast("success", "ID copiado");
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

  const currentPhaseStyle = phaseColors[project?.phase || "Desarrollo"];

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="w-10 h-10 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasConfigAccess) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <AlertCircle size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm mb-4">Sin acceso a configuración</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">¿Eliminar proyecto?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acción no se puede deshacer.</p>
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
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-6"
          >
            <ArrowLeft size={16} />
            Dashboard
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                <Settings size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">{project?.name}</h1>
                <p className="text-slate-400 text-sm">Configuración general</p>
              </div>
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setShowActions(!showActions)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <MoreHorizontal size={20} />
              </button>
              {showActions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-lg py-1 z-20 text-slate-900">
                    <button onClick={copyProjectId} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-3">
                      <Copy size={15} className="text-slate-400" /> Copiar ID
                    </button>
                    <button onClick={archiveProject} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-3">
                      <Archive size={15} className="text-slate-400" /> {project?.archived ? "Restaurar" : "Archivar"}
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button onClick={() => { setShowActions(false); setShowDeleteConfirm(true); }} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3">
                      <Trash2 size={15} /> Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {project?.archived && (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
            Este proyecto está archivado
          </div>
        )}

        {/* Project Info Card */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Datos del proyecto</h2>
            {!editingProject && (
              <button
                onClick={() => setEditingProject(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
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
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Nombre</label>
                    <p className="text-lg font-semibold text-slate-900">{project?.name}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Fase</label>
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${currentPhaseStyle.bg} ${currentPhaseStyle.text} border ${currentPhaseStyle.border}`}>
                      <span className={`w-2 h-2 rounded-full ${currentPhaseStyle.dot}`} />
                      {project?.phase}
                    </span>
                  </div>
                </div>
                {project?.description && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Descripción</label>
                    <p className="text-slate-600">{project.description}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Nombre</label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm"
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
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                            isSelected
                              ? `${style.bg} ${style.text} ${style.border}`
                              : "border-slate-200 text-slate-500 hover:border-slate-300"
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveProject}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? "Guardando..." : "Guardar"}
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
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Productoras</h2>
          </div>
          <div className="p-6">
            {project?.producers && project.producers.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {project.producers.map((producerId) => {
                  const producer = allProducers.find((p) => p.id === producerId);
                  if (!producer) return null;
                  return (
                    <div key={producer.id} className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                      <Building2 size={16} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">{producer.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Sin productoras asociadas</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

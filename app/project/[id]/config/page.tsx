"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import {
  Pencil,
  Check,
  Building2,
  AlertCircle,
  ChevronRight,
  Archive,
  Copy,
  Trash2,
  MoreHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, Timestamp, deleteDoc } from "firebase/firestore";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: ["400"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];

const phaseConfig: Record<string, { color: string; bg: string }> = {
  Desarrollo: { color: "#0ea5e9", bg: "#f0f9ff" },
  Preproducción: { color: "#f59e0b", bg: "#fffbeb" },
  Rodaje: { color: "#6366f1", bg: "#eef2ff" },
  Postproducción: { color: "#a855f7", bg: "#faf5ff" },
  Finalizado: { color: "#10b981", bg: "#ecfdf5" },
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
  const [editingField, setEditingField] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [tempValue, setTempValue] = useState("");
  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
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
        }

        const producersSnap = await getDocs(collection(db, "producers"));
        setAllProducers(producersSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
        setLoading(false);
      } catch {
        showToast("error", "Error al cargar");
        setLoading(false);
      }
    };
    loadData();
  }, [userId, id, router]);

  const saveField = async (field: string, value: string) => {
    if (!id || !project) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), {
        [field]: value,
        updatedAt: Timestamp.now(),
      });
      setProject({ ...project, [field]: value, updatedAt: Timestamp.now() });
      setEditingField(null);
      showToast("success", "Guardado");
    } catch {
      showToast("error", "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (field: string, currentValue: string) => {
    setEditingField(field);
    setTempValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setTempValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveField(field, tempValue);
    }
    if (e.key === "Escape") {
      cancelEditing();
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

  const phaseStyle = phaseConfig[project?.phase || "Desarrollo"];

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${dmSans.className}`}>
        <div className="w-5 h-5 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasConfigAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${dmSans.className}`}>
        <div className="text-center">
          <AlertCircle size={32} className="text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm">Sin acceso</p>
          <Link href="/dashboard" className="text-sm text-neutral-900 underline mt-4 inline-block">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${dmSans.className}`}>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg transition-all animate-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-neutral-900 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">¿Eliminar proyecto?</h3>
            <p className="text-sm text-neutral-500 mb-6">
              Esta acción no se puede deshacer. Se eliminarán todos los datos asociados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={deleteProject}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 pt-28 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Link href="/dashboard" className="hover:text-neutral-600 transition-colors">
              Proyectos
            </Link>
            <ChevronRight size={14} />
            <span className="text-neutral-900">{project?.name}</span>
          </div>

          {/* Actions Menu */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <MoreHorizontal size={18} className="text-neutral-500" />
            </button>

            {showActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 z-20">
                  <button
                    onClick={copyProjectId}
                    className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-3"
                  >
                    <Copy size={15} className="text-neutral-400" />
                    Copiar ID
                  </button>
                  <button
                    onClick={archiveProject}
                    className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-3"
                  >
                    <Archive size={15} className="text-neutral-400" />
                    {project?.archived ? "Restaurar" : "Archivar"}
                  </button>
                  <div className="border-t border-neutral-100 my-1" />
                  <button
                    onClick={() => {
                      setShowActions(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                  >
                    <Trash2 size={15} />
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Project Name - Editable */}
        <div className="mb-12 group">
          {editingField === "name" ? (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "name")}
                autoFocus
                className={`text-4xl font-normal text-neutral-900 bg-transparent border-b-2 border-neutral-900 outline-none w-full ${instrumentSerif.className}`}
              />
              <button
                onClick={() => saveField("name", tempValue)}
                disabled={saving}
                className="p-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <Check size={16} />
              </button>
              <button
                onClick={cancelEditing}
                className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => startEditing("name", project?.name || "")}
              className="flex items-center gap-3 cursor-pointer"
            >
              <h1 className={`text-4xl text-neutral-900 ${instrumentSerif.className}`}>
                {project?.name}
              </h1>
              <Pencil
                size={16}
                className="text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          )}

          {project?.archived && (
            <span className="inline-block mt-3 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-full">
              Archivado
            </span>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-8">
          {/* Phase */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">
              Fase
            </label>
            <div className="flex flex-wrap gap-2">
              {PHASES.map((phase) => {
                const config = phaseConfig[phase];
                const isActive = project?.phase === phase;
                return (
                  <button
                    key={phase}
                    onClick={() => saveField("phase", phase)}
                    disabled={saving}
                    className="px-4 py-2 rounded-full text-sm font-medium transition-all"
                    style={{
                      backgroundColor: isActive ? config.bg : "transparent",
                      color: isActive ? config.color : "#a3a3a3",
                      border: isActive ? `1.5px solid ${config.color}` : "1.5px solid #e5e5e5",
                    }}
                  >
                    {phase}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="group">
            <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">
              Descripción
            </label>
            {editingField === "description" ? (
              <div>
                <textarea
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEditing();
                  }}
                  autoFocus
                  rows={3}
                  className="w-full text-neutral-700 bg-neutral-50 rounded-xl p-4 outline-none border-2 border-neutral-200 focus:border-neutral-400 resize-none transition-colors"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => saveField("description", tempValue)}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => startEditing("description", project?.description || "")}
                className="cursor-pointer group/desc"
              >
                {project?.description ? (
                  <p className="text-neutral-600 leading-relaxed">{project.description}</p>
                ) : (
                  <p className="text-neutral-300 italic">Añadir descripción...</p>
                )}
                <Pencil
                  size={14}
                  className="text-neutral-300 mt-2 opacity-0 group-hover/desc:opacity-100 transition-opacity"
                />
              </div>
            )}
          </div>

          {/* Producers */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">
              Productoras
            </label>
            {project?.producers && project.producers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {project.producers.map((producerId) => {
                  const producer = allProducers.find((p) => p.id === producerId);
                  if (!producer) return null;
                  return (
                    <div
                      key={producer.id}
                      className="flex items-center gap-2 px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-100"
                    >
                      <Building2 size={14} className="text-neutral-400" />
                      <span className="text-sm text-neutral-700">{producer.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-neutral-300 text-sm italic">Sin productoras</p>
            )}
          </div>

          {/* Danger Zone */}
          <div className="pt-8 mt-8 border-t border-neutral-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-700">Zona de peligro</p>
                <p className="text-xs text-neutral-400 mt-0.5">Acciones irreversibles</p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Eliminar proyecto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

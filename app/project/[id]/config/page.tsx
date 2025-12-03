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
  AlertCircle,
  CheckCircle,
  Folder,
  ChevronRight,
  Film,
  Clapperboard,
  Video,
  Sparkles,
  Calendar,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, Timestamp } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];
const PHASE_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
  Desarrollo: { color: "text-sky-600", bg: "bg-sky-50", icon: Sparkles },
  Preproducción: { color: "text-amber-600", bg: "bg-amber-50", icon: Clapperboard },
  Rodaje: { color: "text-rose-600", bg: "bg-rose-50", icon: Film },
  Postproducción: { color: "text-violet-600", bg: "bg-violet-50", icon: Video },
  Finalizado: { color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
};

interface ProjectData { name: string; phase: string; description?: string; producers?: string[]; createdAt: Timestamp; updatedAt?: Timestamp; }
interface Producer { id: string; name: string; }

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

  useEffect(() => { const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/"); else setUserId(u.uid); }); return () => unsub(); }, [router]);

  useEffect(() => {
    if (!userId || !id) return;
    const loadData = async () => {
      try {
        const userProjectSnap = await getDoc(doc(db, `userProjects/${userId}/projects/${id}`));
        if (!userProjectSnap.exists()) { setErrorMessage("No tienes acceso"); setLoading(false); return; }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setErrorMessage("Sin permisos de configuración"); setLoading(false); return; }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) {
          const d = projectSnap.data();
          setProjectName(d.name);
          setProject({ name: d.name, phase: d.phase, description: d.description || "", producers: d.producers || [], createdAt: d.createdAt, updatedAt: d.updatedAt });
          setProjectForm({ name: d.name, phase: d.phase, description: d.description || "" });
        }

        const producersSnap = await getDocs(collection(db, "producers"));
        setAllProducers(producersSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
        setLoading(false);
      } catch (error) { setErrorMessage("Error al cargar"); setLoading(false); }
    };
    loadData();
  }, [userId, id, router]);

  const handleSaveProject = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), { name: projectForm.name, phase: projectForm.phase, description: projectForm.description, updatedAt: Timestamp.now() });
      setProject({ ...project!, name: projectForm.name, phase: projectForm.phase, description: projectForm.description, updatedAt: Timestamp.now() });
      setProjectName(projectForm.name);
      setEditingProject(false);
      setSuccessMessage("Cambios guardados");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) { setErrorMessage("Error al guardar"); }
    finally { setSaving(false); }
  };

  const formatDate = (ts: Timestamp) => {
    if (!ts) return "—";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(ts.toDate());
  };

  const formatRelativeTime = (ts: Timestamp) => {
    if (!ts) return "";
    const diff = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
    if (diff < 60) return "hace unos segundos";
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`;
    return formatDate(ts);
  };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-10 h-10 border-[3px] border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3"></div><p className="text-slate-400 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !project) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-sm"><div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-slate-400" /></div><p className="text-slate-600 mb-4">{errorMessage}</p><Link href="/dashboard" className="text-slate-900 hover:underline text-sm font-medium">Volver al panel</Link></div></div>;

  const PhaseIcon = PHASE_CONFIG[project?.phase || ""]?.icon || Film;
  const phaseConfig = PHASE_CONFIG[project?.phase || ""] || { color: "text-slate-600", bg: "bg-slate-50" };

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4rem] bg-slate-900">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center gap-2 text-[13px] mb-3">
            <Link href={`/dashboard`} className="text-slate-500 hover:text-white transition-colors">{projectName}</Link>
            <ChevronRight size={12} className="text-slate-600" />
            <span className="text-slate-500">Configuración</span>
            <ChevronRight size={12} className="text-slate-600" />
            <span className="text-white font-medium">General</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-[17px] font-semibold text-white">Información del proyecto</h1>
            {project?.updatedAt && (
              <span className="text-slate-500 text-xs flex items-center gap-1.5">
                <Clock size={12} />
                {formatRelativeTime(project.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="flex-grow px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {successMessage && <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3"><CheckCircle size={16} className="text-emerald-600" /><span className="text-sm text-emerald-700">{successMessage}</span></div>}
          {errorMessage && project && <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"><AlertCircle size={16} className="text-red-600" /><span className="text-sm text-red-700">{errorMessage}</span></div>}

          {/* Project Card */}
          <div className="bg-white border border-slate-200 rounded-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${phaseConfig.bg} flex items-center justify-center`}>
                    <PhaseIcon size={20} className={phaseConfig.color} />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900">Datos del proyecto</h2>
                    <p className="text-xs text-slate-500">Nombre, fase y descripción</p>
                  </div>
                </div>
                {!editingProject && (
                  <button onClick={() => setEditingProject(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors">
                    <Edit2 size={12} />Editar
                  </button>
                )}
              </div>

              {!editingProject ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Nombre</p>
                      <p className="text-sm font-medium text-slate-900">{project?.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Fase</p>
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${phaseConfig.bg}`}>
                        <PhaseIcon size={13} className={phaseConfig.color} />
                        <span className={`text-xs font-medium ${phaseConfig.color}`}>{project?.phase}</span>
                      </div>
                    </div>
                  </div>
                  {project?.description && (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Descripción</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{project.description}</p>
                    </div>
                  )}
                  <div className="pt-4 border-t border-slate-100">
                    <span className="text-xs text-slate-400 flex items-center gap-1.5"><Calendar size={12} />Creado {formatDate(project?.createdAt!)}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Nombre</label>
                    <input type="text" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Fase</label>
                    <div className="grid grid-cols-5 gap-2">
                      {PHASES.map((phase) => {
                        const cfg = PHASE_CONFIG[phase];
                        const Icon = cfg.icon;
                        const isSelected = projectForm.phase === phase;
                        return (
                          <button key={phase} onClick={() => setProjectForm({ ...projectForm, phase })} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${isSelected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                            <Icon size={16} className={isSelected ? "text-slate-900" : "text-slate-400"} />
                            <span className={`text-[10px] ${isSelected ? "font-medium text-slate-900" : "text-slate-500"}`}>{phase}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Descripción</label>
                    <textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} rows={3} placeholder="Breve descripción del proyecto..." className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm resize-none" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSaveProject} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                      <Save size={14} />{saving ? "Guardando..." : "Guardar"}
                    </button>
                    <button onClick={() => { setEditingProject(false); setProjectForm({ name: project?.name || "", phase: project?.phase || "", description: project?.description || "" }); }} disabled={saving} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Producers Card */}
          <div className="bg-white border border-slate-200 rounded-2xl">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Building2 size={20} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">Productoras</h2>
                  <p className="text-xs text-slate-500">{project?.producers?.length || 0} asociada{project?.producers?.length !== 1 ? "s" : ""}</p>
                </div>
              </div>

              {project?.producers && project.producers.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {project.producers.map((producerId) => {
                    const producer = allProducers.find((p) => p.id === producerId);
                    if (!producer) return null;
                    return (
                      <div key={producer.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                          <Building2 size={16} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">{producer.name}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl bg-slate-50">
                  <Building2 size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Sin productoras asociadas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}



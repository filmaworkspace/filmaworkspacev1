"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Info,
  Edit2,
  Save,
  X,
  Building2,
  AlertCircle,
  CheckCircle2,
  Folder,
  ChevronRight,
  Settings,
  Film,
  Clapperboard,
  Video,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove, Timestamp } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];
const PHASE_CONFIG: Record<string, { color: string; icon: any; bg: string }> = {
  Desarrollo: { color: "text-sky-700", icon: Sparkles, bg: "bg-sky-100" },
  Preproducción: { color: "text-amber-700", icon: Clapperboard, bg: "bg-amber-100" },
  Rodaje: { color: "text-indigo-700", icon: Film, bg: "bg-indigo-100" },
  Postproducción: { color: "text-purple-700", icon: Video, bg: "bg-purple-100" },
  Finalizado: { color: "text-emerald-700", icon: CheckCircle, bg: "bg-emerald-100" },
};

interface ProjectData { name: string; phase: string; description?: string; producers?: string[]; departments?: string[]; createdAt: Timestamp; }
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
        const userProjectRef = doc(db, `userProjects/${userId}/projects/${id}`);
        const userProjectSnap = await getDoc(userProjectRef);
        if (!userProjectSnap.exists()) { setErrorMessage("No tienes acceso a este proyecto"); setLoading(false); return; }

        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setErrorMessage("No tienes permisos para acceder a la configuración"); setLoading(false); return; }

        const projectRef = doc(db, "projects", id as string);
        const projectSnap = await getDoc(projectRef);
        if (projectSnap.exists()) {
          const d = projectSnap.data();
          setProjectName(d.name);
          const proj: ProjectData = { name: d.name, phase: d.phase, description: d.description || "", producers: d.producers || [], departments: d.departments || [], createdAt: d.createdAt };
          setProject(proj);
          setProjectForm({ name: proj.name, phase: proj.phase, description: proj.description || "" });
        }

        const producersSnap = await getDocs(collection(db, "producers"));
        setAllProducers(producersSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
        setLoading(false);
      } catch (error) { setErrorMessage("Error al cargar los datos"); setLoading(false); }
    };
    loadData();
  }, [userId, id, router]);

  const handleSaveProject = async () => {
    if (!id) return;
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");
    try {
      await updateDoc(doc(db, "projects", id as string), { name: projectForm.name, phase: projectForm.phase, description: projectForm.description });
      setProject({ ...project!, name: projectForm.name, phase: projectForm.phase, description: projectForm.description });
      setProjectName(projectForm.name);
      setEditingProject(false);
      setSuccessMessage("Proyecto actualizado");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) { setErrorMessage("Error al actualizar"); }
    finally { setSaving(false); }
  };

  const handleToggleProducer = async (producerId: string) => {
    if (!id) return;
    setSaving(true);
    try {
      const projectRef = doc(db, "projects", id as string);
      const isAssigned = project?.producers?.includes(producerId);
      if (isAssigned) {
        await updateDoc(projectRef, { producers: arrayRemove(producerId) });
        setProject({ ...project!, producers: project?.producers?.filter((p) => p !== producerId) || [] });
      } else {
        await updateDoc(projectRef, { producers: arrayUnion(producerId) });
        setProject({ ...project!, producers: [...(project?.producers || []), producerId] });
      }
      setSuccessMessage(isAssigned ? "Productora eliminada" : "Productora agregada");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) { setErrorMessage("Error al actualizar"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-600 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !project) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-md"><AlertCircle size={48} className="mx-auto text-red-500 mb-4" /><p className="text-slate-700 mb-4">{errorMessage}</p><Link href="/dashboard" className="text-slate-900 hover:underline font-medium">Volver al panel</Link></div></div>;

  const PhaseIcon = PHASE_CONFIG[project?.phase || ""]?.icon || Film;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4.5rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1">
              <Folder size={14} />{projectName}<ChevronRight size={14} /><span>Configuración</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center"><Settings size={24} className="text-white" /></div>
            <div>
              <h1 className={`text-2xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Configuración general</h1>
              <p className="text-slate-400 text-sm">Información básica del proyecto</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-4">
        <div className="max-w-5xl mx-auto">
          {successMessage && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700"><CheckCircle2 size={20} /><span className="font-medium">{successMessage}</span></div>}
          {errorMessage && project && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700"><AlertCircle size={20} /><span>{errorMessage}</span></div>}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Project Info */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Info size={20} className="text-slate-600" /></div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Información del proyecto</h2>
                        <p className="text-sm text-slate-500">Datos básicos</p>
                      </div>
                    </div>
                    {!editingProject && (
                      <button onClick={() => setEditingProject(true)} className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">
                        <Edit2 size={14} />Editar
                      </button>
                    )}
                  </div>

                  {!editingProject ? (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Nombre</p>
                        <p className="text-lg font-semibold text-slate-900">{project?.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Fase actual</p>
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${PHASE_CONFIG[project?.phase || ""]?.bg || "bg-slate-100"}`}>
                          <PhaseIcon size={16} className={PHASE_CONFIG[project?.phase || ""]?.color || "text-slate-600"} />
                          <span className={`text-sm font-medium ${PHASE_CONFIG[project?.phase || ""]?.color || "text-slate-600"}`}>{project?.phase}</span>
                        </div>
                      </div>
                      {project?.description && (
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Descripción</p>
                          <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">{project.description}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                        <input type="text" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Fase actual</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {PHASES.map((phase) => {
                            const config = PHASE_CONFIG[phase];
                            const Icon = config?.icon || Film;
                            return (
                              <button key={phase} onClick={() => setProjectForm({ ...projectForm, phase })} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${projectForm.phase === phase ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                                <Icon size={16} className={projectForm.phase === phase ? "text-slate-900" : "text-slate-400"} />
                                <span className={`text-sm ${projectForm.phase === phase ? "font-medium text-slate-900" : "text-slate-600"}`}>{phase}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Descripción</label>
                        <textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} rows={3} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 resize-none" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button onClick={handleSaveProject} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                          <Save size={16} />{saving ? "Guardando..." : "Guardar"}
                        </button>
                        <button onClick={() => { setEditingProject(false); setProjectForm({ name: project?.name || "", phase: project?.phase || "", description: project?.description || "" }); }} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors">
                          <X size={16} />Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Producers */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Building2 size={20} className="text-amber-600" /></div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Productoras asignadas</h2>
                      <p className="text-sm text-slate-500">{project?.producers?.length || 0} productora{project?.producers?.length !== 1 ? "s" : ""} vinculada{project?.producers?.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>

                  {project?.producers && project.producers.length > 0 ? (
                    <div className="space-y-2">
                      {project.producers.map((producerId) => {
                        const producer = allProducers.find((p) => p.id === producerId);
                        if (!producer) return null;
                        return (
                          <div key={producer.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Building2 size={18} className="text-amber-600" /></div>
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">{producer.name}</h3>
                                <p className="text-xs text-slate-500">Productora activa</p>
                              </div>
                            </div>
                            <button onClick={() => handleToggleProducer(producer.id)} disabled={saving} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200">
                      <Building2 size={40} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium mb-1">No hay productoras</p>
                      <p className="text-sm text-slate-500">Este proyecto no tiene productoras vinculadas</p>
                    </div>
                  )}

                  {/* Add Producer */}
                  {allProducers.filter((p) => !project?.producers?.includes(p.id)).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Añadir productora</p>
                      <div className="flex flex-wrap gap-2">
                        {allProducers.filter((p) => !project?.producers?.includes(p.id)).map((producer) => (
                          <button key={producer.id} onClick={() => handleToggleProducer(producer.id)} disabled={saving} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50">
                            <Building2 size={14} />{producer.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Quick Links */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Otras secciones</p>
                  <div className="space-y-2">
                    <Link href={`/project/${id}/config/users`} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><Info size={16} className="text-slate-600" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Usuarios</p>
                        <p className="text-xs text-slate-500">Gestionar permisos</p>
                      </div>
                    </Link>
                    <Link href={`/project/${id}/config/departments`} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><Info size={16} className="text-slate-600" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Departamentos</p>
                        <p className="text-xs text-slate-500">Organización del equipo</p>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex gap-2">
                    <Info size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600">
                      <p className="font-semibold mb-1">Sobre esta sección</p>
                      <p className="text-slate-500">Aquí puedes modificar la información básica del proyecto, su fase actual y las productoras asociadas.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

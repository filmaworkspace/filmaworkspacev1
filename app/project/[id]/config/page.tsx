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
  Archive,
  Copy,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Calendar,
  RefreshCw,
  CreditCard,
  X,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, Timestamp, deleteDoc, setDoc } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const PHASES = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];

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

interface CompanyData {
  fiscalName: string;
  taxId: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  email?: string;
  phone?: string;
}

const emptyCompanyData: CompanyData = {
  fiscalName: "",
  taxId: "",
  address: "",
  postalCode: "",
  city: "",
  province: "",
  country: "España",
  email: "",
  phone: "",
};

export default function ConfigGeneral() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasConfigAccess, setHasConfigAccess] = useState(false);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [allProducers, setAllProducers] = useState<Producer[]>([]);
  const [editingProject, setEditingProject] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [projectForm, setProjectForm] = useState({ name: "", phase: "", description: "" });
  const [companyData, setCompanyData] = useState<CompanyData>(emptyCompanyData);
  const [companyForm, setCompanyForm] = useState<CompanyData>(emptyCompanyData);
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

        const companySnap = await getDoc(doc(db, `projects/${id}/config`, "company"));
        if (companySnap.exists()) {
          const data = companySnap.data() as CompanyData;
          setCompanyData(data);
          setCompanyForm(data);
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

  const handleSaveCompany = async () => {
    if (!id) return;
    setSavingCompany(true);
    try {
      await setDoc(doc(db, `projects/${id}/config`, "company"), {
        ...companyForm,
        updatedAt: Timestamp.now(),
      });
      setCompanyData(companyForm);
      setEditingCompany(false);
      showToast("success", "Datos fiscales guardados");
    } catch {
      showToast("error", "Error al guardar datos fiscales");
    } finally {
      setSavingCompany(false);
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
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Acceso denegado</h2>
          <p className="text-slate-500 mb-6">No tienes acceso a esta configuración</p>
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
        <div className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-2xl text-sm font-medium shadow-lg flex items-center gap-2 ${
          toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">¿Eliminar proyecto?</h3>
              <button onClick={() => setShowDeleteConfirm(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
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
        </div>
      )}

      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Configuración del proyecto</h1>
            </div>
      
            <div className="relative">
              <button
                onClick={() => setShowActions(!showActions)}
                className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
              >
                <MoreHorizontal size={20} className="text-slate-500" />
              </button>
      
              {showActions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-20">
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
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors border border-slate-200"
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
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-500">
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
                        const isSelected = projectForm.phase === phase;
                        return (
                          <button
                            key={phase}
                            onClick={() => setProjectForm({ ...projectForm, phase })}
                            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                              isSelected
                                ? "bg-slate-900 text-white border-slate-900"
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
                      className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors border border-slate-200"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Company Fiscal Data Card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Datos fiscales de la empresa</h2>
              {!editingCompany && (
                <button
                  onClick={() => setEditingCompany(true)}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors border border-slate-200"
                >
                  <Edit2 size={14} />
                  Editar
                </button>
              )}
            </div>

            <div className="p-6">
              {!editingCompany ? (
                companyData.fiscalName ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Razón social</label>
                        <p className="text-base font-semibold text-slate-900">{companyData.fiscalName}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">NIF/CIF</label>
                        <p className="text-base font-mono text-slate-900">{companyData.taxId}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Dirección fiscal</label>
                      <p className="text-sm text-slate-700">{companyData.address}</p>
                      <p className="text-sm text-slate-700">{companyData.postalCode} {companyData.city}, {companyData.province}</p>
                      <p className="text-sm text-slate-500">{companyData.country}</p>
                    </div>
                    {(companyData.email || companyData.phone) && (
                      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                        {companyData.email && (
                          <div>
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Email</label>
                            <p className="text-sm text-slate-700">{companyData.email}</p>
                          </div>
                        )}
                        {companyData.phone && (
                          <div>
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Teléfono</label>
                            <p className="text-sm text-slate-700">{companyData.phone}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <CreditCard size={24} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500 mb-4">No hay datos fiscales configurados</p>
                    <button
                      onClick={() => setEditingCompany(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
                    >
                      <Edit2 size={14} />
                      Añadir datos fiscales
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Razón social *</label>
                      <input
                        type="text"
                        value={companyForm.fiscalName}
                        onChange={(e) => setCompanyForm({ ...companyForm, fiscalName: e.target.value })}
                        placeholder="Nombre de la empresa"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">NIF/CIF *</label>
                      <input
                        type="text"
                        value={companyForm.taxId}
                        onChange={(e) => setCompanyForm({ ...companyForm, taxId: e.target.value.toUpperCase() })}
                        placeholder="B12345678"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm font-mono"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Dirección *</label>
                    <input
                      type="text"
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                      placeholder="Calle, número, piso..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">CP *</label>
                      <input
                        type="text"
                        value={companyForm.postalCode}
                        onChange={(e) => setCompanyForm({ ...companyForm, postalCode: e.target.value })}
                        placeholder="28001"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Ciudad *</label>
                      <input
                        type="text"
                        value={companyForm.city}
                        onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                        placeholder="Madrid"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Provincia</label>
                      <input
                        type="text"
                        value={companyForm.province}
                        onChange={(e) => setCompanyForm({ ...companyForm, province: e.target.value })}
                        placeholder="Madrid"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">País</label>
                      <input
                        type="text"
                        value={companyForm.country}
                        onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                        placeholder="España"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Email de contacto</label>
                      <input
                        type="email"
                        value={companyForm.email}
                        onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                        placeholder="facturacion@empresa.com"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Teléfono</label>
                      <input
                        type="tel"
                        value={companyForm.phone}
                        onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                        placeholder="+34 912 345 678"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveCompany}
                      disabled={savingCompany || !companyForm.fiscalName || !companyForm.taxId || !companyForm.address || !companyForm.postalCode || !companyForm.city}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      <Save size={16} />
                      {savingCompany ? "Guardando..." : "Guardar datos fiscales"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingCompany(false);
                        setCompanyForm(companyData);
                      }}
                      className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors border border-slate-200"
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
              <h2 className="font-semibold text-slate-900">Productoras</h2>
            </div>
            <div className="p-6">
              {project?.producers && project.producers.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {project.producers.map((producerId) => {
                    const producer = allProducers.find((p) => p.id === producerId);
                    if (!producer) return null;
                    return (
                      <div key={producer.id} className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 rounded-xl border border-amber-200">
                        <Building2 size={16} className="text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">{producer.name}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Building2 size={24} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">Sin productoras asociadas</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-4">
            <Link
              href={`/project/${id}/config/users`}
              className="flex items-center justify-between p-5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl transition-colors group"
            >
              <span className="text-sm font-medium text-slate-700">Usuarios del proyecto</span>
              <ExternalLink size={16} className="text-slate-400 group-hover:text-slate-600" />
            </Link>
            <Link
              href={`/project/${id}/config/departments`}
              className="flex items-center justify-between p-5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl transition-colors group"
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

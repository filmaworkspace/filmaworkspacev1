"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Briefcase,
  Plus,
  X,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Users,
  AlertTriangle,
  Folder,
  ChevronRight,
  ChevronDown,
  Info,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

interface Member { userId: string; name: string; email: string; department?: string; position?: string; }
interface DepartmentWithCount { name: string; memberCount: number; members: Member[]; }
interface ConfirmModal { isOpen: boolean; title: string; message: string; onConfirm: () => void; type: "danger" | "warning"; }

export default function ConfigDepartments() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasConfigAccess, setHasConfigAccess] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [departmentsWithCount, setDepartmentsWithCount] = useState<DepartmentWithCount[]>([]);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartment, setNewDepartment] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({ isOpen: false, title: "", message: "", onConfirm: () => {}, type: "danger" });

  useEffect(() => { const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/"); else setUserId(u.uid); }); return () => unsub(); }, [router]);

  useEffect(() => {
    if (!userId || !id) return;
    const loadData = async () => {
      try {
        const userProjectSnap = await getDoc(doc(db, `userProjects/${userId}/projects/${id}`));
        if (!userProjectSnap.exists()) { setErrorMessage("No tienes acceso"); setLoading(false); return; }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setErrorMessage("Sin permisos"); setLoading(false); return; }

        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) { setProjectName(projectSnap.data().name); setDepartments(projectSnap.data().departments || []); }

        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMembers(membersSnap.docs.map((d) => ({ userId: d.id, name: d.data().name, email: d.data().email, department: d.data().department, position: d.data().position })));
        setLoading(false);
      } catch (e) { setErrorMessage("Error al cargar"); setLoading(false); }
    };
    loadData();
  }, [userId, id, router]);

  useEffect(() => {
    const depts: DepartmentWithCount[] = departments.map((d) => {
      const m = members.filter((m) => m.department === d);
      return { name: d, memberCount: m.length, members: m };
    }).sort((a, b) => a.name.localeCompare(b.name));
    setDepartmentsWithCount(depts);
  }, [departments, members]);

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;
    if (departments.includes(newDepartment.trim())) { setErrorMessage("Ya existe"); setTimeout(() => setErrorMessage(""), 3000); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), { departments: arrayUnion(newDepartment.trim()) });
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
      setShowAddDepartment(false);
      setSuccessMessage("Departamento agregado");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e) { setErrorMessage("Error"); }
    finally { setSaving(false); }
  };

  const handleRemoveDepartment = async (dept: string) => {
    if (!id) return;
    const usersIn = members.filter((m) => m.department === dept);
    if (usersIn.length > 0) {
      setConfirmModal({ isOpen: true, title: "No se puede eliminar", message: `"${dept}" tiene ${usersIn.length} usuario${usersIn.length !== 1 ? "s" : ""}. Reasígnalos primero.`, type: "warning", onConfirm: () => setConfirmModal({ ...confirmModal, isOpen: false }) });
      return;
    }
    setConfirmModal({
      isOpen: true, title: "Eliminar departamento", message: `¿Eliminar "${dept}"? Esta acción no se puede deshacer.`, type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          await updateDoc(doc(db, "projects", id as string), { departments: arrayRemove(dept) });
          setDepartments(departments.filter((d) => d !== dept));
          setSuccessMessage("Departamento eliminado");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (e) { setErrorMessage("Error"); }
        finally { setSaving(false); setConfirmModal({ ...confirmModal, isOpen: false }); }
      }
    });
  };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-600 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !hasConfigAccess) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-md"><AlertCircle size={48} className="mx-auto text-red-500 mb-4" /><p className="text-slate-700 mb-4">{errorMessage}</p><Link href="/dashboard" className="text-slate-900 hover:underline font-medium">Volver</Link></div></div>;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between mb-2">
            <div className="text-slate-400 text-sm flex items-center gap-1"><Folder size={14} />{projectName}<ChevronRight size={14} /><span>Configuración</span></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center"><Briefcase size={24} className="text-white" /></div>
            <div>
              <h1 className={`text-2xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Departamentos</h1>
              <p className="text-slate-400 text-sm">{departments.length} departamento{departments.length !== 1 ? "s" : ""} • {members.filter((m) => m.department).length} asignado{members.filter((m) => m.department).length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-5xl mx-auto">
          {successMessage && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700"><CheckCircle2 size={20} /><span className="font-medium">{successMessage}</span></div>}
          {errorMessage && hasConfigAccess && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700"><AlertCircle size={20} /><span>{errorMessage}</span></div>}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Briefcase size={18} className="text-slate-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{departments.length}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Departamentos</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Users size={18} className="text-emerald-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{members.filter((m) => m.department).length}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Asignados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertCircle size={18} className="text-amber-600" /></div>
                <span className="text-2xl font-bold text-slate-900">{members.filter((m) => !m.department).length}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Sin asignar</p>
            </div>
          </div>

          {/* Departments Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Briefcase size={20} className="text-slate-600" /></div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Lista de departamentos</h2>
                    <p className="text-sm text-slate-500">Organiza tu equipo</p>
                  </div>
                </div>
                <button onClick={() => setShowAddDepartment(!showAddDepartment)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"><Plus size={16} />Nuevo</button>
              </div>

              {/* Add Form */}
              {showAddDepartment && (
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Nuevo departamento</p>
                  <div className="flex gap-2">
                    <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()} placeholder="Nombre del departamento" className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm" />
                    <button onClick={handleAddDepartment} disabled={saving || !newDepartment.trim()} className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{saving ? "..." : "Agregar"}</button>
                    <button onClick={() => { setShowAddDepartment(false); setNewDepartment(""); }} className="px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Departments List */}
              {departmentsWithCount.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                  <Briefcase size={40} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium mb-1">No hay departamentos</p>
                  <p className="text-sm text-slate-500">Crea el primero para organizar tu equipo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {departmentsWithCount.map((dept) => (
                    <div key={dept.name} className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-slate-300 transition-all">
                      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedDepartment(expandedDepartment === dept.name ? null : dept.name)}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Briefcase size={18} className="text-slate-600" /></div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">{dept.name}</h3>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><Users size={12} />{dept.memberCount} miembro{dept.memberCount !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {dept.memberCount === 0 && <button onClick={(e) => { e.stopPropagation(); handleRemoveDepartment(dept.name); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>}
                          <ChevronDown size={18} className={`text-slate-400 transition-transform ${expandedDepartment === dept.name ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {expandedDepartment === dept.name && (
                        <div className="border-t border-slate-200 bg-slate-50 p-4">
                          {dept.members.length > 0 ? (
                            <>
                              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Miembros</p>
                              <div className="space-y-2">
                                {dept.members.map((m) => (
                                  <div key={m.userId} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold">{m.name?.[0]?.toUpperCase()}</div>
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900">{m.name}</p>
                                      {m.position && <p className="text-xs text-slate-500">{m.position}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <p className="text-center text-sm text-slate-500 py-4">No hay miembros en este departamento</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Info Note */}
          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex gap-3">
              <Info size={18} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-600">
                <p className="font-medium mb-1">Sobre los departamentos</p>
                <p className="text-slate-500">Los departamentos organizan el equipo. Solo puedes eliminar departamentos vacíos. Los miembros se asignan desde la sección de Usuarios.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4">
              <h3 className="text-lg font-semibold text-white">{confirmModal.title}</h3>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 mb-6">
                <div className={`p-2 rounded-xl ${confirmModal.type === "danger" ? "bg-red-100" : "bg-amber-100"}`}>
                  <AlertTriangle size={20} className={confirmModal.type === "danger" ? "text-red-600" : "text-amber-600"} />
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors">Cancelar</button>
                <button onClick={confirmModal.onConfirm} disabled={saving} className={`flex-1 px-4 py-2.5 text-white rounded-xl font-medium transition-colors disabled:opacity-50 ${confirmModal.type === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>{saving ? "..." : "Confirmar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

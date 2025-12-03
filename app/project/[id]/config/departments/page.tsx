"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Briefcase,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Users,
  AlertTriangle,
  Folder,
  ChevronRight,
  ChevronDown,
  Info,
  User,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Member { userId: string; name: string; email: string; department?: string; position?: string; }
interface DepartmentData { name: string; members: Member[]; }

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
  const [departmentsData, setDepartmentsData] = useState<DepartmentData[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDepartment, setNewDepartment] = useState("");
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; action: () => void; type: "danger" | "warning" } | null>(null);

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
    const data: DepartmentData[] = departments.map((d) => ({ name: d, members: members.filter((m) => m.department === d) })).sort((a, b) => a.name.localeCompare(b.name));
    setDepartmentsData(data);
  }, [departments, members]);

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;
    if (departments.includes(newDepartment.trim())) { setErrorMessage("Ya existe"); setTimeout(() => setErrorMessage(""), 3000); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), { departments: arrayUnion(newDepartment.trim()) });
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
      setShowAddForm(false);
      setSuccessMessage("Departamento creado");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e) { setErrorMessage("Error"); }
    finally { setSaving(false); }
  };

  const handleRemoveDepartment = (dept: string) => {
    const usersIn = members.filter((m) => m.department === dept);
    if (usersIn.length > 0) {
      setConfirmModal({ open: true, title: "No se puede eliminar", message: `"${dept}" tiene ${usersIn.length} miembro${usersIn.length !== 1 ? "s" : ""}. Reasígnalos primero.`, type: "warning", action: () => setConfirmModal(null) });
      return;
    }
    setConfirmModal({
      open: true, title: "Eliminar departamento", message: `¿Eliminar "${dept}"?`, type: "danger",
      action: async () => {
        setSaving(true);
        try {
          await updateDoc(doc(db, "projects", id as string), { departments: arrayRemove(dept) });
          setDepartments(departments.filter((d) => d !== dept));
          setSuccessMessage("Eliminado");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (e) { setErrorMessage("Error"); }
        finally { setSaving(false); setConfirmModal(null); }
      }
    });
  };

  const assignedCount = members.filter((m) => m.department).length;
  const unassignedCount = members.filter((m) => !m.department).length;
  const coverage = members.length > 0 ? Math.round((assignedCount / members.length) * 100) : 0;

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center"><div className="w-10 h-10 border-[3px] border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3"></div><p className="text-slate-400 text-sm">Cargando...</p></div></div>;
  if (errorMessage && !hasConfigAccess) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="text-center max-w-sm"><div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-slate-400" /></div><p className="text-slate-600 mb-4">{errorMessage}</p><Link href="/dashboard" className="text-slate-900 hover:underline text-sm font-medium">Volver</Link></div></div>;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem] bg-slate-900">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center gap-2 text-[13px] mb-3">
            <Link href={`/project/${id}`} className="text-slate-500 hover:text-white transition-colors">{projectName}</Link>
            <ChevronRight size={12} className="text-slate-600" />
            <span className="text-slate-500">Configuración</span>
            <ChevronRight size={12} className="text-slate-600" />
            <span className="text-white font-medium">Departamentos</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[17px] font-semibold text-white">Departamentos</h1>
              <p className="text-slate-500 text-xs mt-0.5">{departments.length} departamento{departments.length !== 1 ? "s" : ""} • {assignedCount} asignado{assignedCount !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 px-3.5 py-2 bg-white text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
              <Plus size={15} />Nuevo
            </button>
          </div>
        </div>
      </div>

      <main className="flex-grow px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {successMessage && <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3"><CheckCircle size={16} className="text-emerald-600" /><span className="text-sm text-emerald-700">{successMessage}</span></div>}
          {errorMessage && hasConfigAccess && <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"><AlertCircle size={16} className="text-red-600" /><span className="text-sm text-red-700">{errorMessage}</span></div>}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Briefcase size={16} className="text-slate-400" />
                <span className="text-xl font-semibold text-slate-900">{departments.length}</span>
              </div>
              <p className="text-xs text-slate-500">Departamentos</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Users size={16} className="text-emerald-500" />
                <span className="text-xl font-semibold text-slate-900">{assignedCount}</span>
              </div>
              <p className="text-xs text-slate-500">Asignados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <User size={16} className="text-amber-500" />
                <span className="text-xl font-semibold text-slate-900">{unassignedCount}</span>
              </div>
              <p className="text-xs text-slate-500">Sin asignar</p>
            </div>
          </div>

          {/* Coverage */}
          {members.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Cobertura de asignación</span>
                <span className="text-xs font-semibold text-slate-700">{coverage}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${coverage === 100 ? "bg-emerald-500" : coverage > 50 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${coverage}%` }}></div>
              </div>
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Nuevo departamento</p>
              <div className="flex gap-2">
                <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()} placeholder="Nombre del departamento" autoFocus className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm" />
                <button onClick={handleAddDepartment} disabled={saving || !newDepartment.trim()} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50">{saving ? "..." : "Crear"}</button>
                <button onClick={() => { setShowAddForm(false); setNewDepartment(""); }} className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
              </div>
            </div>
          )}

          {/* Departments List */}
          {departmentsData.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Briefcase size={24} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">Sin departamentos</p>
              <p className="text-xs text-slate-500">Crea el primero para organizar el equipo</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {departmentsData.map((dept) => (
                <div key={dept.name}>
                  <div className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedDept(expandedDept === dept.name ? null : dept.name)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Briefcase size={18} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{dept.name}</p>
                        <p className="text-xs text-slate-500">{dept.members.length} miembro{dept.members.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dept.members.length === 0 && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveDepartment(dept.name); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedDept === dept.name ? "rotate-180" : ""}`} />
                    </div>
                  </div>

                  {expandedDept === dept.name && (
                    <div className="px-5 pb-4 pt-1 bg-slate-50">
                      {dept.members.length > 0 ? (
                        <div className="space-y-2">
                          {dept.members.map((m) => (
                            <div key={m.userId} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100">
                              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold">{m.name?.[0]?.toUpperCase()}</div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{m.name}</p>
                                {m.position && <p className="text-xs text-slate-500">{m.position}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-xs text-slate-500 py-4">Sin miembros asignados</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2.5 px-4 py-3 bg-slate-50 rounded-xl">
            <Info size={14} className="text-slate-400 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">Solo puedes eliminar departamentos vacíos. Asigna miembros desde la sección de Usuarios.</p>
          </div>
        </div>
      </main>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className={`p-2 rounded-xl ${confirmModal.type === "danger" ? "bg-red-50" : "bg-amber-50"}`}>
                  <AlertTriangle size={18} className={confirmModal.type === "danger" ? "text-red-600" : "text-amber-600"} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-slate-900 mb-1">{confirmModal.title}</p>
                  <p className="text-sm text-slate-600">{confirmModal.message}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmModal(null)} className="flex-1 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
                <button onClick={confirmModal.action} disabled={saving} className={`flex-1 py-2.5 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${confirmModal.type === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>{saving ? "..." : "Confirmar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

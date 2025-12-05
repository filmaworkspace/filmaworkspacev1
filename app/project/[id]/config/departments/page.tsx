"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Layers, Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft, ChevronDown, MoreHorizontal, Users, Briefcase } from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const deptColors = [
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", dot: "bg-cyan-500" },
];

interface Member { userId: string; name: string; email: string; department?: string; position?: string; }
interface DepartmentData { name: string; members: Member[]; colorIndex: number; }

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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
        if (!userProjectSnap.exists()) { setLoading(false); return; }
        const hasConfig = userProjectSnap.data().permissions?.config || false;
        setHasConfigAccess(hasConfig);
        if (!hasConfig) { setLoading(false); return; }
        const projectSnap = await getDoc(doc(db, "projects", id as string));
        if (projectSnap.exists()) {
          setProjectName(projectSnap.data().name);
          setDepartments(projectSnap.data().departments || []);
        }
        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMembers(membersSnap.docs.map((d) => ({ userId: d.id, name: d.data().name, email: d.data().email, department: d.data().department, position: d.data().position })));
        setLoading(false);
      } catch { showToast("error", "Error al cargar"); setLoading(false); }
    };
    loadData();
  }, [userId, id, router]);

  useEffect(() => {
    const data: DepartmentData[] = departments.map((d, i) => ({ name: d, members: members.filter((m) => m.department === d), colorIndex: i % deptColors.length })).sort((a, b) => a.name.localeCompare(b.name));
    setDepartmentsData(data);
  }, [departments, members]);

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;
    if (departments.includes(newDepartment.trim())) { showToast("error", "Ya existe este departamento"); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), { departments: arrayUnion(newDepartment.trim()) });
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
      setShowAddForm(false);
      showToast("success", "Departamento creado");
    } catch { showToast("error", "Error al crear"); } finally { setSaving(false); }
  };

  const handleRemoveDepartment = async (dept: string) => {
    const usersIn = members.filter((m) => m.department === dept);
    if (usersIn.length > 0) { showToast("error", `No se puede eliminar: tiene ${usersIn.length} miembro${usersIn.length !== 1 ? "s" : ""}`); setConfirmDelete(null); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), { departments: arrayRemove(dept) });
      setDepartments(departments.filter((d) => d !== dept));
      showToast("success", "Departamento eliminado");
    } catch { showToast("error", "Error"); } finally { setSaving(false); setConfirmDelete(null); setActiveMenu(null); }
  };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>;

  if (!hasConfigAccess) return (
    <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
      <div className="text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={28} className="text-slate-400" /></div>
        <p className="text-slate-600 text-sm mb-4">No tienes acceso a esta configuración</p>
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><ArrowLeft size={16} />Volver al dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {toast && <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>{toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}{toast.message}</div>}

      {/* Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">¿Eliminar departamento?</h3>
            <p className="text-sm text-slate-500 mb-6">Se eliminará "{confirmDelete}" del proyecto.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleRemoveDepartment(confirmDelete)} disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mt-[4.5rem] border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-6"><ArrowLeft size={16} />Volver al dashboard</Link>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center"><Briefcase size={24} className="text-slate-600" /></div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{projectName}</h1>
                <p className="text-slate-500 text-sm mt-1">Departamentos · {departments.length} departamento{departments.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><Plus size={16} />Nuevo</button>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Add Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex gap-3">
              <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()} placeholder="Nombre del departamento (ej: Producción, Arte, Sonido...)" autoFocus className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-sm bg-slate-50" />
              <button onClick={handleAddDepartment} disabled={saving || !newDepartment.trim()} className="px-5 py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50">Crear</button>
              <button onClick={() => { setShowAddForm(false); setNewDepartment(""); }} className="px-4 py-3 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
            </div>
          </div>
        )}

        {/* Departments List */}
        {departmentsData.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-visible divide-y divide-slate-100">
            {departmentsData.map((dept) => {
              const color = deptColors[dept.colorIndex];
              return (
                <div key={dept.name}>
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => setExpandedDept(expandedDept === dept.name ? null : dept.name)}>
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                      <div>
                        <p className="font-semibold text-slate-900">{dept.name}</p>
                        <p className="text-sm text-slate-500">{dept.members.length} miembro{dept.members.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${color.bg} ${color.text} border ${color.border}`}>{dept.members.length}</span>
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === dept.name ? null : dept.name); }} className="p-2 text-slate-300 hover:text-slate-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><MoreHorizontal size={16} /></button>
                        {activeMenu === dept.name && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20">
                              <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); if (dept.members.length > 0) showToast("error", "Tiene miembros asignados"); else setConfirmDelete(dept.name); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={14} />Eliminar</button>
                            </div>
                          </>
                        )}
                      </div>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ${expandedDept === dept.name ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                  {expandedDept === dept.name && (
                    <div className="px-6 pb-4 bg-slate-50/50">
                      {dept.members.length > 0 ? (
                        <div className="grid gap-2 md:grid-cols-2 pt-2">
                          {dept.members.map((m) => (
                            <div key={m.userId} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100">
                              <div className={`w-9 h-9 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-semibold text-sm`}>{m.name?.[0]?.toUpperCase()}</div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 truncate">{m.name}</p>
                                {m.position && <p className="text-xs text-slate-500">{m.position}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-slate-200 mt-2">
                          <Users size={20} className="text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">Sin miembros asignados</p>
                          <Link href={`/project/${id}/config/users`} className="text-xs text-slate-600 hover:text-slate-900 underline mt-1 inline-block">Asignar desde Usuarios</Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Briefcase size={28} className="text-slate-400" /></div>
            <p className="text-slate-600 text-sm font-medium mb-1">Sin departamentos</p>
            <p className="text-slate-400 text-xs mb-4">Crea el primer departamento para organizar tu equipo</p>
            <button onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><Plus size={14} />Crear departamento</button>
          </div>
        )}
      </main>
    </div>
  );
}

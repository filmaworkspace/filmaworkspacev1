"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Briefcase,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Users,
  AlertTriangle,
  Folder,
  ChevronDown,
  Info,
  User,
  ArrowLeft,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

// Colores para departamentos (se asignan cíclicamente)
const deptColors = [
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", icon: "bg-violet-100", iconText: "text-violet-600", gradient: "from-violet-500 to-purple-600" },
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "bg-blue-100", iconText: "text-blue-600", gradient: "from-blue-500 to-indigo-600" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: "bg-emerald-100", iconText: "text-emerald-600", gradient: "from-emerald-500 to-teal-600" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "bg-amber-100", iconText: "text-amber-600", gradient: "from-amber-500 to-orange-600" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", icon: "bg-rose-100", iconText: "text-rose-600", gradient: "from-rose-500 to-pink-600" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", icon: "bg-cyan-100", iconText: "text-cyan-600", gradient: "from-cyan-500 to-sky-600" },
];

interface Member {
  userId: string;
  name: string;
  email: string;
  department?: string;
  position?: string;
}

interface DepartmentData {
  name: string;
  members: Member[];
  colorIndex: number;
}

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
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => void;
    type: "danger" | "warning";
  } | null>(null);

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
          setProjectName(projectSnap.data().name);
          setDepartments(projectSnap.data().departments || []);
        }

        const membersSnap = await getDocs(collection(db, `projects/${id}/members`));
        setMembers(membersSnap.docs.map((d) => ({
          userId: d.id,
          name: d.data().name,
          email: d.data().email,
          department: d.data().department,
          position: d.data().position
        })));
        setLoading(false);
      } catch (e) {
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };
    loadData();
  }, [userId, id, router]);

  useEffect(() => {
    const data: DepartmentData[] = departments
      .map((d, i) => ({
        name: d,
        members: members.filter((m) => m.department === d),
        colorIndex: i % deptColors.length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setDepartmentsData(data);
  }, [departments, members]);

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;
    if (departments.includes(newDepartment.trim())) {
      setErrorMessage("Este departamento ya existe");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), {
        departments: arrayUnion(newDepartment.trim())
      });
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
      setShowAddForm(false);
      setSuccessMessage("Departamento creado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e) {
      setErrorMessage("Error al crear el departamento");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDepartment = (dept: string) => {
    const usersIn = members.filter((m) => m.department === dept);
    if (usersIn.length > 0) {
      setConfirmModal({
        open: true,
        title: "No se puede eliminar",
        message: `El departamento "${dept}" tiene ${usersIn.length} miembro${usersIn.length !== 1 ? "s" : ""} asignado${usersIn.length !== 1 ? "s" : ""}. Reasígnalos primero desde la sección de Usuarios.`,
        type: "warning",
        action: () => setConfirmModal(null)
      });
      return;
    }
    setConfirmModal({
      open: true,
      title: "Eliminar departamento",
      message: `¿Estás seguro de eliminar "${dept}"? Esta acción no se puede deshacer.`,
      type: "danger",
      action: async () => {
        setSaving(true);
        try {
          await updateDoc(doc(db, "projects", id as string), {
            departments: arrayRemove(dept)
          });
          setDepartments(departments.filter((d) => d !== dept));
          setSuccessMessage("Departamento eliminado");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (e) {
          setErrorMessage("Error al eliminar");
        } finally {
          setSaving(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const assignedCount = members.filter((m) => m.department).length;
  const unassignedCount = members.filter((m) => !m.department).length;
  const coverage = members.length > 0 ? Math.round((assignedCount / members.length) * 100) : 0;

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !hasConfigAccess) {
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
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <Folder size={14} />
              <span>{projectName}</span>
            </Link>
          </div>

          {/* Title & Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center">
                <Layers size={26} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                  Departamentos
                </h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {departments.length} departamento{departments.length !== 1 ? "s" : ""} · {assignedCount} asignado{assignedCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all shadow-lg shadow-white/10"
            >
              <Plus size={16} />
              Nuevo
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Briefcase size={18} className="text-violet-400" />
                <span className="text-2xl font-bold">{departments.length}</span>
              </div>
              <p className="text-sm text-slate-400">Departamentos</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Users size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold">{assignedCount}</span>
              </div>
              <p className="text-sm text-slate-400">Asignados</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <User size={18} className="text-amber-400" />
                <span className="text-2xl font-bold">{unassignedCount}</span>
              </div>
              <p className="text-sm text-slate-400">Sin asignar</p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-grow px-6 md:px-12 py-8 -mt-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Messages */}
          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-emerald-700">{successMessage}</span>
            </div>
          )}

          {errorMessage && hasConfigAccess && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle size={16} className="text-red-600" />
              </div>
              <span className="text-sm font-medium text-red-700">{errorMessage}</span>
            </div>
          )}

          {/* Coverage Progress */}
          {members.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Cobertura de asignación
                  </h3>
                  <p className="text-sm text-slate-500">
                    {assignedCount} de {members.length} miembros asignados a departamentos
                  </p>
                </div>
                <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                  coverage === 100 
                    ? "bg-emerald-50 text-emerald-700" 
                    : coverage > 50 
                      ? "bg-blue-50 text-blue-700" 
                      : "bg-amber-50 text-amber-700"
                }`}>
                  {coverage}%
                </div>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    coverage === 100 
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-600" 
                      : coverage > 50 
                        ? "bg-gradient-to-r from-blue-400 to-blue-600" 
                        : "bg-gradient-to-r from-amber-400 to-amber-600"
                  }`}
                  style={{ width: `${coverage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <Plus size={18} className="text-white" />
                </div>
                <div>
                  <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Nuevo departamento
                  </h3>
                  <p className="text-xs text-slate-500">Añade un área de trabajo al proyecto</p>
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
                  placeholder="Nombre del departamento (ej: Producción, Arte, Sonido...)"
                  autoFocus
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 bg-white text-sm transition-all"
                />
                <button
                  onClick={handleAddDepartment}
                  disabled={saving || !newDepartment.trim()}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
                >
                  {saving ? "Creando..." : "Crear"}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewDepartment(""); }}
                  className="px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Departments List */}
          {departmentsData.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Briefcase size={28} className="text-slate-300" />
              </div>
              <p className="font-semibold text-slate-900 mb-1">Sin departamentos</p>
              <p className="text-sm text-slate-500 mb-4">
                Crea el primer departamento para organizar tu equipo
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                <Plus size={14} />
                Crear departamento
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Layers size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Estructura organizativa
                  </h3>
                  <p className="text-xs text-slate-500">Departamentos y sus miembros</p>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {departmentsData.map((dept) => {
                  const color = deptColors[dept.colorIndex];
                  return (
                    <div key={dept.name}>
                      <div
                        className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                        onClick={() => setExpandedDept(expandedDept === dept.name ? null : dept.name)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl ${color.icon} flex items-center justify-center transition-transform group-hover:scale-105`}>
                            <Briefcase size={20} className={color.iconText} />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{dept.name}</p>
                            <p className="text-sm text-slate-500">
                              {dept.members.length} miembro{dept.members.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {dept.members.length === 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveDepartment(dept.name);
                              }}
                              className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <div className={`px-3 py-1 rounded-lg text-xs font-bold ${color.bg} ${color.text} border ${color.border}`}>
                            {dept.members.length}
                          </div>
                          <ChevronDown
                            size={18}
                            className={`text-slate-400 transition-transform duration-200 ${
                              expandedDept === dept.name ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </div>

                      {/* Expanded Members */}
                      {expandedDept === dept.name && (
                        <div className="px-6 pb-4 pt-1 bg-slate-50/50">
                          {dept.members.length > 0 ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              {dept.members.map((m) => (
                                <div
                                  key={m.userId}
                                  className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
                                >
                                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${color.gradient} text-white flex items-center justify-center text-sm font-bold shadow-md`}>
                                    {m.name?.[0]?.toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 truncate">{m.name}</p>
                                    {m.position && (
                                      <p className="text-xs text-slate-500">{m.position}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6 bg-white rounded-xl border-2 border-dashed border-slate-200">
                              <User size={20} className="text-slate-300 mx-auto mb-2" />
                              <p className="text-sm text-slate-500">Sin miembros asignados</p>
                              <p className="text-xs text-slate-400 mt-1">
                                Asigna miembros desde la sección de Usuarios
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="flex items-start gap-3 p-4 bg-slate-100 rounded-xl">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Info size={14} className="text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Nota sobre departamentos</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Solo puedes eliminar departamentos que no tienen miembros. Para reasignar o eliminar miembros, 
                ve a la sección de <Link href={`/project/${id}/config/users`} className="text-slate-900 font-medium hover:underline">Usuarios</Link>.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  confirmModal.type === "danger" ? "bg-red-50" : "bg-amber-50"
                }`}>
                  <AlertTriangle
                    size={22}
                    className={confirmModal.type === "danger" ? "text-red-600" : "text-amber-600"}
                  />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                    {confirmModal.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{confirmModal.message}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModal.action}
                  disabled={saving}
                  className={`flex-1 py-3 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-lg ${
                    confirmModal.type === "danger"
                      ? "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                      : "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                  }`}
                >
                  {saving ? "Procesando..." : confirmModal.type === "danger" ? "Eliminar" : "Entendido"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

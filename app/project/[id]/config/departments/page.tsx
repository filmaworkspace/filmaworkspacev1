"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
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
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface Member {
  userId: string;
  name: string;
  email: string;
  department?: string;
  position?: string;
}

interface DepartmentWithCount {
  name: string;
  memberCount: number;
  members: Member[];
}

interface ConfirmModal {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type: "danger" | "warning";
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
  const [departmentsWithCount, setDepartmentsWithCount] = useState<DepartmentWithCount[]>([]);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartment, setNewDepartment] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "danger",
  });

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Load data
  useEffect(() => {
    if (!userId || !id) return;

    const loadData = async () => {
      try {
        // Check permissions
        const userProjectRef = doc(db, `userProjects/${userId}/projects/${id}`);
        const userProjectSnap = await getDoc(userProjectRef);

        if (!userProjectSnap.exists()) {
          setErrorMessage("No tienes acceso a este proyecto");
          setLoading(false);
          return;
        }

        const userProjectData = userProjectSnap.data();
        const hasConfig = userProjectData.permissions?.config || false;

        setHasConfigAccess(hasConfig);

        if (!hasConfig) {
          setErrorMessage("No tienes permisos para acceder a la configuración");
          setLoading(false);
          return;
        }

        // Load project
        const projectRef = doc(db, "projects", id as string);
        const projectSnap = await getDoc(projectRef);

        if (projectSnap.exists()) {
          const projectData = projectSnap.data();
          setProjectName(projectData.name);
          setDepartments(projectData.departments || []);
        }

        // Load members
        const membersRef = collection(db, `projects/${id}/members`);
        const membersSnap = await getDocs(membersRef);
        const membersData: Member[] = membersSnap.docs.map((memberDoc) => {
          const data = memberDoc.data();
          return {
            userId: memberDoc.id,
            name: data.name,
            email: data.email,
            department: data.department,
            position: data.position,
          };
        });

        setMembers(membersData);
        setLoading(false);
      } catch (error) {
        console.error("Error cargando datos:", error);
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };

    loadData();
  }, [userId, id, router]);

  // Calculate departments with counts
  useEffect(() => {
    const deptsWithCount: DepartmentWithCount[] = departments.map((dept) => {
      const deptMembers = members.filter((m) => m.department === dept);
      return {
        name: dept,
        memberCount: deptMembers.length,
        members: deptMembers,
      };
    });

    // Sort by name
    deptsWithCount.sort((a, b) => a.name.localeCompare(b.name));

    setDepartmentsWithCount(deptsWithCount);
  }, [departments, members]);

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;

    // Check if department already exists
    if (departments.includes(newDepartment.trim())) {
      setErrorMessage("Este departamento ya existe");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const projectRef = doc(db, "projects", id as string);
      await updateDoc(projectRef, {
        departments: arrayUnion(newDepartment.trim()),
      });

      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
      setShowAddDepartment(false);
      setSuccessMessage("Departamento agregado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error agregando departamento:", error);
      setErrorMessage("Error al agregar el departamento");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDepartment = async (dept: string) => {
    if (!id) return;

    const usersInDept = members.filter((m) => m.department === dept);

    if (usersInDept.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: "No se puede eliminar",
        message: `No puedes eliminar el departamento "${dept}" porque tiene ${usersInDept.length} ${
          usersInDept.length === 1 ? "usuario asignado" : "usuarios asignados"
        }. Primero debes reasignar o eliminar estos usuarios.`,
        type: "warning",
        onConfirm: () => {
          setConfirmModal({ ...confirmModal, isOpen: false });
        },
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Eliminar departamento",
      message: `¿Estás seguro de que deseas eliminar el departamento "${dept}"? Esta acción no se puede deshacer.`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          const projectRef = doc(db, "projects", id as string);
          await updateDoc(projectRef, {
            departments: arrayRemove(dept),
          });

          setDepartments(departments.filter((d) => d !== dept));
          setSuccessMessage("Departamento eliminado correctamente");
          setTimeout(() => setSuccessMessage(""), 3000);
        } catch (error) {
          console.error("Error eliminando departamento:", error);
          setErrorMessage("Error al eliminar el departamento");
          setTimeout(() => setErrorMessage(""), 3000);
        } finally {
          setSaving(false);
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      },
    });
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando departamentos...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !hasConfigAccess) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-slate-700 mb-4">{errorMessage}</p>
          <Link href="/dashboard" className="text-slate-900 hover:underline font-medium">
            Volver al panel principal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
{/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-slate-50 to-slate-100 border-y border-slate-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-slate-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          Volver a proyectos
        </Link>
      </div>

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div
                className={`p-3 rounded-full ${
                  confirmModal.type === "danger" ? "bg-red-100" : "bg-amber-100"
                }`}
              >
                <AlertTriangle
                  size={24}
                  className={confirmModal.type === "danger" ? "text-red-600" : "text-amber-600"}
                />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{confirmModal.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModal.onConfirm}
                disabled={saving}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  confirmModal.type === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {saving ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && hasConfigAccess && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Departments Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
                    <Briefcase size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Departamentos</h2>
                    <p className="text-sm text-slate-500">
                      {departments.length} {departments.length === 1 ? "departamento" : "departamentos"}{" "}
                      configurados
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddDepartment(!showAddDepartment)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  Agregar departamento
                </button>
              </div>

              {/* Add Department Form */}
              {showAddDepartment && (
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddDepartment();
                        }
                      }}
                      placeholder="Nombre del departamento"
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    />
                    <button
                      onClick={handleAddDepartment}
                      disabled={saving || !newDepartment.trim()}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? "Agregando..." : "Agregar"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddDepartment(false);
                        setNewDepartment("");
                      }}
                      className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Departments List */}
              {departmentsWithCount.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No hay departamentos configurados
                </div>
              ) : (
                <div className="space-y-3">
                  {departmentsWithCount.map((dept) => (
                    <div
                      key={dept.name}
                      className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow"
                    >
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() =>
                          setExpandedDepartment(expandedDepartment === dept.name ? null : dept.name)
                        }
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                            <Briefcase size={18} className="text-slate-600" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">{dept.name}</h3>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Users size={12} />
                              {dept.memberCount} {dept.memberCount === 1 ? "miembro" : "miembros"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {dept.memberCount === 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveDepartment(dept.name);
                              }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar departamento"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}

                          <svg
                            className={`w-5 h-5 text-slate-400 transition-transform ${
                              expandedDepartment === dept.name ? "rotate-180" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded Members List */}
                      {expandedDepartment === dept.name && dept.members.length > 0 && (
                        <div className="border-t border-slate-200 bg-slate-50 p-4">
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                            Miembros del departamento
                          </h4>
                          <div className="space-y-2">
                            {dept.members.map((member) => (
                              <div
                                key={member.userId}
                                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200"
                              >
                                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold">
                                  {member.name?.[0]?.toUpperCase() ||
                                    member.email?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-slate-900">
                                    {member.name || member.email}
                                  </p>
                                  {member.position && (
                                    <p className="text-xs text-slate-600">{member.position}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {expandedDepartment === dept.name && dept.members.length === 0 && (
                        <div className="border-t border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                          No hay miembros asignados a este departamento
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Summary Card */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <Briefcase size={24} className="text-blue-600" />
                <span className="text-3xl font-bold text-blue-700">{departments.length}</span>
              </div>
              <h3 className="text-sm font-semibold text-blue-900">Total departamentos</h3>
              <p className="text-xs text-blue-700">Configurados en el proyecto</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <Users size={24} className="text-emerald-600" />
                <span className="text-3xl font-bold text-emerald-700">
                  {members.filter((m) => m.department).length}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-emerald-900">Miembros asignados</h3>
              <p className="text-xs text-emerald-700">Con departamento</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <AlertCircle size={24} className="text-amber-600" />
                <span className="text-3xl font-bold text-amber-700">
                  {members.filter((m) => !m.department).length}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-amber-900">Sin asignar</h3>
              <p className="text-xs text-amber-700">Miembros sin departamento</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

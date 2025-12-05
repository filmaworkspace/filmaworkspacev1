"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import {
  Plus,
  Trash2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  X,
  MoreHorizontal,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove } from "firebase/firestore";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: ["400"] });

const deptColors = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"
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
  color: string;
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
  const [newDepartment, setNewDepartment] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      } catch {
        showToast("error", "Error al cargar");
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
        color: deptColors[i % deptColors.length]
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setDepartmentsData(data);
  }, [departments, members]);

  const handleAddDepartment = async () => {
    if (!id || !newDepartment.trim()) return;
    if (departments.includes(newDepartment.trim())) {
      showToast("error", "Ya existe");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), {
        departments: arrayUnion(newDepartment.trim())
      });
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
      setIsAdding(false);
      showToast("success", "Departamento creado");
    } catch {
      showToast("error", "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDepartment = async (dept: string) => {
    const usersIn = members.filter((m) => m.department === dept);
    if (usersIn.length > 0) {
      showToast("error", `Tiene ${usersIn.length} miembro${usersIn.length !== 1 ? "s" : ""}`);
      setConfirmDelete(null);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "projects", id as string), {
        departments: arrayRemove(dept)
      });
      setDepartments(departments.filter((d) => d !== dept));
      showToast("success", "Eliminado");
    } catch {
      showToast("error", "Error");
    } finally {
      setSaving(false);
      setConfirmDelete(null);
      setActiveMenu(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddDepartment();
    if (e.key === "Escape") {
      setIsAdding(false);
      setNewDepartment("");
    }
  };

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
            toast.type === "success" ? "bg-neutral-900 text-white" : "bg-red-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">¿Eliminar departamento?</h3>
            <p className="text-sm text-neutral-500 mb-6">
              Se eliminará "{confirmDelete}" del proyecto.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRemoveDepartment(confirmDelete)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 pt-28 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Link href="/dashboard" className="hover:text-neutral-600 transition-colors">
              Proyectos
            </Link>
            <ChevronRight size={14} />
            <Link href={`/proyecto/${id}/config`} className="hover:text-neutral-600 transition-colors">
              {projectName}
            </Link>
            <ChevronRight size={14} />
            <span className="text-neutral-900">Departamentos</span>
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center justify-between mb-10">
          <h1 className={`text-4xl text-neutral-900 ${instrumentSerif.className}`}>
            Departamentos
          </h1>
          {!isAdding && departments.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors"
            >
              <Plus size={16} />
              Nuevo
            </button>
          )}
        </div>

        {/* Add Form */}
        {isAdding && (
          <div className="mb-6 flex gap-2">
            <input
              type="text"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nombre del departamento"
              autoFocus
              className="flex-1 px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400 text-sm"
            />
            <button
              onClick={handleAddDepartment}
              disabled={saving || !newDepartment.trim()}
              className="px-4 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              Crear
            </button>
            <button
              onClick={() => { setIsAdding(false); setNewDepartment(""); }}
              className="p-2.5 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Departments List */}
        {departmentsData.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <Plus size={20} className="text-neutral-400" />
            </div>
            <p className="text-neutral-500 text-sm mb-4">Sin departamentos</p>
            <button
              onClick={() => setIsAdding(true)}
              className="text-sm text-neutral-900 underline"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {departmentsData.map((dept) => (
              <div key={dept.name}>
                <div
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors group cursor-pointer"
                  onClick={() => setExpandedDept(expandedDept === dept.name ? null : dept.name)}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical size={14} className="text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: dept.color }}
                    />
                    <span className="text-sm font-medium text-neutral-900">{dept.name}</span>
                    <span className="text-xs text-neutral-400">
                      {dept.members.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Actions Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === dept.name ? null : dept.name);
                        }}
                        className="p-1.5 text-neutral-300 hover:text-neutral-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {activeMenu === dept.name && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                          <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null);
                                if (dept.members.length > 0) {
                                  showToast("error", "Tiene miembros asignados");
                                } else {
                                  setConfirmDelete(dept.name);
                                }
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 size={14} />
                              Eliminar
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <ChevronDown
                      size={16}
                      className={`text-neutral-400 transition-transform ${
                        expandedDept === dept.name ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Expanded Members */}
                {expandedDept === dept.name && (
                  <div className="ml-10 mb-2">
                    {dept.members.length > 0 ? (
                      <div className="space-y-1 py-2">
                        {dept.members.map((m) => (
                          <div
                            key={m.userId}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-50"
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium"
                              style={{ backgroundColor: dept.color }}
                            >
                              {m.name?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-neutral-900 truncate">{m.name}</p>
                              {m.position && (
                                <p className="text-xs text-neutral-400">{m.position}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400 py-3 px-3">
                        Sin miembros · <Link href={`/proyecto/${id}/config/users`} className="underline">Asignar</Link>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quick Add at bottom */}
        {!isAdding && departments.length > 0 && (
          <button
            onClick={() => setIsAdding(true)}
            className="mt-4 w-full p-3 border-2 border-dashed border-neutral-200 rounded-lg text-sm text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Añadir departamento
          </button>
        )}
      </div>
    </div>
  );
}

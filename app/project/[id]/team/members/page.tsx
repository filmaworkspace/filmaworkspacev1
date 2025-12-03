"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Folder,
  Users,
  Plus,
  Search,
  Download,
  Edit,
  Trash2,
  X,
  UserMinus,
  DollarSign,
  Briefcase,
  Phone,
  Eye,
  CheckCircle,
  Clock,
  ChevronRight,
  ArrowLeft,
  Building2,
  CreditCard,
  AlertTriangle,
  User,
  Mail,
  MapPin,
  FileText,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

interface TeamMember {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  role: "HOD" | "Coordinator" | "Crew";
  contractType: "indefinido" | "temporal" | "freelance";
  salary: number;
  salaryType: "monthly" | "daily" | "hourly" | "project";
  joinDate: Date;
  leaveDate?: Date;
  status: "active" | "on-leave" | "left";
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  taxId: string;
  bankAccount: string;
  notes: string;
  createdAt: Date;
  createdBy: string;
}

interface Department {
  name: string;
}

const CONTRACT_TYPES = [
  { value: "indefinido", label: "Indefinido" },
  { value: "temporal", label: "Temporal" },
  { value: "freelance", label: "Freelance" },
];

const SALARY_TYPES = [
  { value: "monthly", label: "Mensual" },
  { value: "daily", label: "Diario" },
  { value: "hourly", label: "Por hora" },
  { value: "project", label: "Por proyecto" },
];

const POSITIONS = [
  { value: "HOD", label: "HOD (Jefe de departamento)" },
  { value: "Coordinator", label: "Coordinador" },
  { value: "Crew", label: "Crew" },
];

const statusConfig = {
  active: { 
    bg: "bg-emerald-50", 
    text: "text-emerald-700", 
    border: "border-emerald-200",
    icon: CheckCircle,
    label: "Activo"
  },
  "on-leave": { 
    bg: "bg-amber-50", 
    text: "text-amber-700", 
    border: "border-amber-200",
    icon: Clock,
    label: "De baja"
  },
  left: { 
    bg: "bg-slate-50", 
    text: "text-slate-600", 
    border: "border-slate-200",
    icon: UserMinus,
    label: "Fuera"
  },
};

export default function TeamMembersPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<TeamMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    position: "Crew" as "HOD" | "Coordinator" | "Crew",
    contractType: "temporal" as "indefinido" | "temporal" | "freelance",
    salary: 0,
    salaryType: "monthly" as "monthly" | "daily" | "hourly" | "project",
    joinDate: new Date().toISOString().split("T")[0],
    leaveDate: "",
    status: "active" as "active" | "on-leave" | "left",
    address: "",
    emergencyContact: "",
    emergencyPhone: "",
    taxId: "",
    bankAccount: "",
    notes: "",
  });

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    onLeave: 0,
    left: 0,
    totalPayroll: 0,
  });

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    filterMembers();
  }, [searchTerm, departmentFilter, statusFilter, members]);

  const loadData = async () => {
    try {
      setLoading(true);

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        const depts = projectDoc.data().departments || [];
        setDepartments(depts.map((d: string) => ({ name: d })));
      }

      const membersQuery = query(
        collection(db, `projects/${id}/teamMembers`),
        orderBy("createdAt", "desc")
      );
      const membersSnapshot = await getDocs(membersQuery);
      const membersData = membersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        joinDate: doc.data().joinDate?.toDate(),
        leaveDate: doc.data().leaveDate?.toDate(),
        createdAt: doc.data().createdAt?.toDate(),
      })) as TeamMember[];

      setMembers(membersData);

      const active = membersData.filter((m) => m.status === "active").length;
      const onLeave = membersData.filter((m) => m.status === "on-leave").length;
      const left = membersData.filter((m) => m.status === "left").length;

      const totalPayroll = membersData
        .filter((m) => m.status === "active" && m.salaryType === "monthly")
        .reduce((sum, m) => sum + m.salary, 0);

      setStats({
        total: membersData.length,
        active,
        onLeave,
        left,
        totalPayroll,
      });
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterMembers = () => {
    let filtered = [...members];

    if (searchTerm) {
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.department.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (departmentFilter !== "all") {
      filtered = filtered.filter((m) => m.department === departmentFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((m) => m.status === statusFilter);
    }

    setFilteredMembers(filtered);
  };

  const handleCreateMember = async () => {
    setSaving(true);
    try {
      const memberData = {
        ...formData,
        joinDate: Timestamp.fromDate(new Date(formData.joinDate)),
        leaveDate: formData.leaveDate
          ? Timestamp.fromDate(new Date(formData.leaveDate))
          : null,
        createdAt: Timestamp.now(),
        createdBy: auth.currentUser?.uid || "",
      };

      await addDoc(collection(db, `projects/${id}/teamMembers`), memberData);

      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error creando miembro:", error);
      alert("Error al crear el miembro del equipo");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMember = async () => {
    if (!selectedMember) return;

    setSaving(true);
    try {
      const memberData = {
        ...formData,
        joinDate: Timestamp.fromDate(new Date(formData.joinDate)),
        leaveDate: formData.leaveDate
          ? Timestamp.fromDate(new Date(formData.leaveDate))
          : null,
      };

      await updateDoc(
        doc(db, `projects/${id}/teamMembers`, selectedMember.id),
        memberData
      );

      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error actualizando miembro:", error);
      alert("Error al actualizar el miembro del equipo");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      await deleteDoc(doc(db, `projects/${id}/teamMembers`, memberId));
      setShowDeleteConfirm(null);
      loadData();
    } catch (error) {
      console.error("Error eliminando miembro:", error);
      alert("Error al eliminar el miembro");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      department: "",
      position: "Crew",
      contractType: "temporal",
      salary: 0,
      salaryType: "monthly",
      joinDate: new Date().toISOString().split("T")[0],
      leaveDate: "",
      status: "active",
      address: "",
      emergencyContact: "",
      emergencyPhone: "",
      taxId: "",
      bankAccount: "",
      notes: "",
    });
    setSelectedMember(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalMode("create");
    setShowModal(true);
  };

  const openEditModal = (member: TeamMember) => {
    setSelectedMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      phone: member.phone,
      department: member.department,
      position: member.role,
      contractType: member.contractType,
      salary: member.salary,
      salaryType: member.salaryType,
      joinDate: member.joinDate.toISOString().split("T")[0],
      leaveDate: member.leaveDate ? member.leaveDate.toISOString().split("T")[0] : "",
      status: member.status,
      address: member.address,
      emergencyContact: member.emergencyContact,
      emergencyPhone: member.emergencyPhone,
      taxId: member.taxId,
      bankAccount: member.bankAccount,
      notes: member.notes,
    });
    setModalMode("edit");
    setShowModal(true);
  };

  const openViewModal = (member: TeamMember) => {
    setSelectedMember(member);
    setModalMode("view");
    setShowModal(true);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const exportMembers = () => {
    const rows = [
      [
        "NOMBRE",
        "EMAIL",
        "TELÉFONO",
        "DEPARTAMENTO",
        "POSICIÓN",
        "TIPO CONTRATO",
        "SALARIO",
        "TIPO SALARIO",
        "FECHA INCORPORACIÓN",
        "ESTADO",
      ],
    ];

    filteredMembers.forEach((member) => {
      rows.push([
        member.name,
        member.email,
        member.phone,
        member.department,
        member.role,
        member.contractType,
        member.salary.toString(),
        member.salaryType,
        formatDate(member.joinDate),
        member.status,
      ]);
    });

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Equipo_${projectName}_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-amber-100">
              <Link
                href="/dashboard"
                className="hover:text-white transition-colors"
              >
                <Folder size={14} />
              </Link>
              <ChevronRight size={14} className="text-amber-200" />
              <Link
                href={`/project/${id}/team`}
                className="text-sm hover:text-white transition-colors"
              >
                Team
              </Link>
              <ChevronRight size={14} className="text-amber-200" />
              <span className="text-sm text-white font-medium">Miembros</span>
            </div>
          </div>

          {/* Title & Actions */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                <Users size={26} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                  Gestión de equipo
                </h1>
                <p className="text-amber-100 text-sm mt-0.5">
                  Incorporaciones, bajas y datos del equipo
                </p>
              </div>
            </div>

            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-amber-700 rounded-xl text-sm font-semibold hover:bg-amber-50 transition-all shadow-lg"
            >
              <Plus size={16} />
              Añadir miembro
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Users size={18} className="text-white/80" />
                <span className="text-2xl font-bold">{stats.total}</span>
              </div>
              <p className="text-sm text-amber-100">Total</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-300" />
                <span className="text-2xl font-bold">{stats.active}</span>
              </div>
              <p className="text-sm text-amber-100">Activos</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-200" />
                <span className="text-2xl font-bold">{stats.onLeave}</span>
              </div>
              <p className="text-sm text-amber-100">De baja</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <UserMinus size={18} className="text-red-300" />
                <span className="text-2xl font-bold">{stats.left}</span>
              </div>
              <p className="text-sm text-amber-100">Fuera</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign size={18} className="text-emerald-300" />
                <span className="text-xl font-bold">{formatCurrency(stats.totalPayroll)} €</span>
              </div>
              <p className="text-sm text-amber-100">Nómina mensual</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Filters Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre, email o departamento..."
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-sm transition-all"
                />
              </div>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-sm transition-all min-w-[180px]"
              >
                <option value="all">Todos los departamentos</option>
                {departments.map((dept) => (
                  <option key={dept.name} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-sm transition-all min-w-[160px]"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="on-leave">De baja</option>
                <option value="left">Fuera del proyecto</option>
              </select>

              <button
                onClick={exportMembers}
                className="flex items-center justify-center gap-2 px-5 py-3 border-2 border-amber-500 text-amber-600 rounded-xl hover:bg-amber-50 transition-colors text-sm font-semibold"
              >
                <Download size={16} />
                Exportar
              </button>
            </div>
          </div>

          {/* Members List */}
          {filteredMembers.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users size={32} className="text-slate-300" />
              </div>
              <h3 className={`text-xl font-semibold text-slate-900 mb-2 ${spaceGrotesk.className}`}>
                {searchTerm || departmentFilter !== "all" || statusFilter !== "all"
                  ? "No se encontraron miembros"
                  : "No hay miembros en el equipo"}
              </h3>
              <p className="text-slate-500 mb-6">
                {searchTerm || departmentFilter !== "all" || statusFilter !== "all"
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Comienza añadiendo el primer miembro del equipo"}
              </p>
              {!searchTerm && departmentFilter === "all" && statusFilter === "all" && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold transition-all shadow-lg"
                >
                  <Plus size={18} />
                  Añadir primer miembro
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {filteredMembers.length} de {members.length} miembros
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Miembro
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Departamento
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Contrato
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Salario
                      </th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMembers.map((member) => {
                      const status = statusConfig[member.status];
                      const StatusIcon = status.icon;
                      return (
                        <tr key={member.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                {member.name?.[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{member.name}</p>
                                <p className="text-sm text-slate-500">{member.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{member.department}</p>
                              <p className="text-xs text-slate-500">{member.role}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-600 capitalize">
                              {member.contractType}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(member.salary)} €
                            </p>
                            <p className="text-xs text-slate-500 capitalize">
                              {member.salaryType === "monthly" && "mensual"}
                              {member.salaryType === "daily" && "diario"}
                              {member.salaryType === "hourly" && "por hora"}
                              {member.salaryType === "project" && "por proyecto"}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${status.bg} ${status.text} ${status.border}`}>
                              <StatusIcon size={12} />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openViewModal(member)}
                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Ver detalles"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={() => openEditModal(member)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(member.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={22} className="text-red-600" />
              </div>
              <div>
                <h3 className={`font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                  Eliminar miembro
                </h3>
                <p className="text-sm text-slate-600">
                  ¿Estás seguro de eliminar este miembro del equipo? Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteMember(showDeleteConfirm)}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-red-600/20"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit/View Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Users size={20} className="text-white" />
                </div>
                <div>
                  <h2 className={`text-xl font-semibold text-white ${spaceGrotesk.className}`}>
                    {modalMode === "create" && "Nuevo miembro"}
                    {modalMode === "edit" && "Editar miembro"}
                    {modalMode === "view" && "Detalles del miembro"}
                  </h2>
                  <p className="text-amber-100 text-sm">
                    {modalMode === "view" ? selectedMember?.name : "Completa la información"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="space-y-8">
                {/* Personal Info Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                      <User size={16} className="text-amber-600" />
                    </div>
                    <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      Información personal
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedMember?.name : formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="Juan García López"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={modalMode === "view" ? selectedMember?.email : formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="juan@ejemplo.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={modalMode === "view" ? selectedMember?.phone : formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="+34 600 000 000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        NIF/NIE
                      </label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedMember?.taxId : formData.taxId}
                        onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="12345678Z"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedMember?.address : formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="Calle Principal 123, Madrid"
                      />
                    </div>
                  </div>
                </div>

                {/* Work Info Section */}
                <div className="border-t border-slate-100 pt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Briefcase size={16} className="text-blue-600" />
                    </div>
                    <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      Información laboral
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Departamento *
                      </label>
                      <select
                        value={modalMode === "view" ? selectedMember?.department : formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                      >
                        <option value="">Seleccionar</option>
                        {departments.map((dept) => (
                          <option key={dept.name} value={dept.name}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Posición *
                      </label>
                      <select
                        value={modalMode === "view" ? selectedMember?.role : formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value as any })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos.value} value={pos.value}>{pos.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Tipo de contrato *
                      </label>
                      <select
                        value={modalMode === "view" ? selectedMember?.contractType : formData.contractType}
                        onChange={(e) => setFormData({ ...formData, contractType: e.target.value as any })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                      >
                        {CONTRACT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Estado *
                      </label>
                      <select
                        value={modalMode === "view" ? selectedMember?.status : formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                      >
                        <option value="active">Activo</option>
                        <option value="on-leave">De baja</option>
                        <option value="left">Fuera del proyecto</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Fecha de incorporación *
                      </label>
                      <input
                        type="date"
                        value={modalMode === "view" 
                          ? selectedMember?.joinDate?.toISOString().split("T")[0] 
                          : formData.joinDate
                        }
                        onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                      />
                    </div>
                    {(formData.status === "left" || selectedMember?.status === "left") && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Fecha de salida
                        </label>
                        <input
                          type="date"
                          value={modalMode === "view" 
                            ? selectedMember?.leaveDate?.toISOString().split("T")[0] || ""
                            : formData.leaveDate
                          }
                          onChange={(e) => setFormData({ ...formData, leaveDate: e.target.value })}
                          disabled={modalMode === "view"}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Salary Section */}
                <div className="border-t border-slate-100 pt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <DollarSign size={16} className="text-emerald-600" />
                    </div>
                    <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      Información salarial
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Salario (€) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={modalMode === "view" ? selectedMember?.salary : formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="2000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Tipo de salario *
                      </label>
                      <select
                        value={modalMode === "view" ? selectedMember?.salaryType : formData.salaryType}
                        onChange={(e) => setFormData({ ...formData, salaryType: e.target.value as any })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                      >
                        {SALARY_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Número de cuenta (IBAN)
                      </label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedMember?.bankAccount : formData.bankAccount}
                        onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="ES91 2100 0418 4502 0005 1332"
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contact Section */}
                <div className="border-t border-slate-100 pt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <Phone size={16} className="text-red-600" />
                    </div>
                    <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      Contacto de emergencia
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Nombre del contacto
                      </label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedMember?.emergencyContact : formData.emergencyContact}
                        onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="María García"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Teléfono de emergencia
                      </label>
                      <input
                        type="tel"
                        value={modalMode === "view" ? selectedMember?.emergencyPhone : formData.emergencyPhone}
                        onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all"
                        placeholder="+34 600 000 000"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="border-t border-slate-100 pt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                      <FileText size={16} className="text-slate-600" />
                    </div>
                    <h3 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      Notas adicionales
                    </h3>
                  </div>
                  <textarea
                    value={modalMode === "view" ? selectedMember?.notes : formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={modalMode === "view"}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600 text-sm transition-all resize-none"
                    placeholder="Información adicional relevante..."
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="px-6 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl font-medium transition-all"
              >
                {modalMode === "view" ? "Cerrar" : "Cancelar"}
              </button>
              {modalMode !== "view" && (
                <button
                  onClick={modalMode === "create" ? handleCreateMember : handleUpdateMember}
                  disabled={saving}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Guardando..." : modalMode === "create" ? "Crear miembro" : "Guardar cambios"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

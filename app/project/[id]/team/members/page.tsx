"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
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
  where,
} from "firebase/firestore";
import {
  Folder,
  Users,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  X,
  UserPlus,
  UserMinus,
  DollarSign,
  Briefcase,
  Calendar,
  Mail,
  Phone,
  MapPin,
  FileText,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
        const depts = projectDoc.data().departments || [];
        setDepartments(depts.map((d: string) => ({ name: d })));
      }

      // Load team members
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

      // Calculate stats
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
    if (!confirm("¿Estás seguro de que deseas eliminar este miembro del equipo?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, `projects/${id}/teamMembers`, memberId));
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

  const getStatusBadge = (status: string) => {
    const styles = {
      active: "bg-emerald-100 text-emerald-700 border-emerald-200",
      "on-leave": "bg-amber-100 text-amber-700 border-amber-200",
      left: "bg-slate-100 text-slate-700 border-slate-200",
    };

    const labels = {
      active: "Activo",
      "on-leave": "De baja",
      left: "Fuera del proyecto",
    };

    const icons = {
      active: <CheckCircle size={12} />,
      "on-leave": <Clock size={12} />,
      left: <UserMinus size={12} />,
    };

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${
          styles[status as keyof typeof styles]
        }`}
      >
        {icons[status as keyof typeof icons]}
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
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
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-amber-50 to-amber-100 border-y border-amber-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-amber-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-amber-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-amber-600 hover:text-amber-900 transition-colors text-sm font-medium"
          >
            Volver a proyectos
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 p-3 rounded-xl shadow-lg">
                  <Users size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Gestión de equipo
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Incorporaciones, bajas y datos del equipo
                  </p>
                </div>
              </div>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105"
              >
                <Plus size={20} />
                Añadir miembro
              </button>
            </div>
          </header>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-blue-700 font-medium">Total</p>
                <Users size={20} className="text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-900">{stats.total}</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-emerald-700 font-medium">Activos</p>
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <p className="text-3xl font-bold text-emerald-900">{stats.active}</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-amber-700 font-medium">De baja</p>
                <Clock size={20} className="text-amber-600" />
              </div>
              <p className="text-3xl font-bold text-amber-900">{stats.onLeave}</p>
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-700 font-medium">Fuera</p>
                <UserMinus size={20} className="text-slate-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">{stats.left}</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-purple-700 font-medium">Nómina</p>
                <DollarSign size={20} className="text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-900">
                {stats.totalPayroll.toLocaleString()} €
              </p>
              <p className="text-xs text-purple-600 mt-1">Mensual</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, email o departamento..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                >
                  <option value="all">Todos los departamentos</option>
                  {departments.map((dept) => (
                    <option key={dept.name} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activos</option>
                  <option value="on-leave">De baja</option>
                  <option value="left">Fuera del proyecto</option>
                </select>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={exportMembers}
              className="flex items-center gap-2 px-4 py-2 border-2 border-amber-600 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors text-sm font-medium"
            >
              <Download size={16} />
              Exportar
            </button>
          </div>

          {/* Members Table */}
          {filteredMembers.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <Users size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm || departmentFilter !== "all" || statusFilter !== "all"
                  ? "No se encontraron miembros"
                  : "No hay miembros en el equipo"}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm || departmentFilter !== "all" || statusFilter !== "all"
                  ? "Intenta ajustar los filtros"
                  : "Comienza añadiendo el primer miembro del equipo"}
              </p>
              {!searchTerm && departmentFilter === "all" && statusFilter === "all" && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-all shadow-lg"
                >
                  <Plus size={20} />
                  Añadir primer miembro
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Departamento
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Posición
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Contrato
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Salario
                      </th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-semibold text-slate-900">{member.name}</p>
                            <p className="text-sm text-slate-600">{member.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Briefcase size={14} className="text-slate-400" />
                            <span className="text-sm text-slate-900">{member.department}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-slate-900">
                            {member.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600 capitalize">
                            {member.contractType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {member.salary.toLocaleString()} €
                            </p>
                            <p className="text-xs text-slate-500 capitalize">
                              {member.salaryType === "monthly" && "mensual"}
                              {member.salaryType === "daily" && "diario"}
                              {member.salaryType === "hourly" && "por hora"}
                              {member.salaryType === "project" && "por proyecto"}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getStatusBadge(member.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openViewModal(member)}
                              className="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Ver detalles"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => openEditModal(member)}
                              className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteMember(member.id)}
                              className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal de crear/editar/ver miembro */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-amber-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {modalMode === "create" && "Nuevo miembro del equipo"}
                {modalMode === "edit" && "Editar miembro"}
                {modalMode === "view" && "Detalles del miembro"}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="space-y-6">
                {/* Información personal */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-amber-600" />
                    Información personal
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="Juan García López"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="juan@ejemplo.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="+34 600 000 000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        NIF/NIE
                      </label>
                      <input
                        type="text"
                        value={formData.taxId}
                        onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="12345678Z"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="Calle Principal 123, Madrid"
                      />
                    </div>
                  </div>
                </div>

                {/* Información laboral */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Briefcase size={20} className="text-amber-600" />
                    Información laboral
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Departamento *
                      </label>
                      <select
                        value={formData.department}
                        onChange={(e) =>
                          setFormData({ ...formData, department: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                      >
                        <option value="">Seleccionar</option>
                        {departments.map((dept) => (
                          <option key={dept.name} value={dept.name}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Posición *
                      </label>
                      <select
                        value={formData.position}
                        onChange={(e) =>
                          setFormData({ ...formData, position: e.target.value as any })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos.value} value={pos.value}>
                            {pos.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Tipo de contrato *
                      </label>
                      <select
                        value={formData.contractType}
                        onChange={(e) =>
                          setFormData({ ...formData, contractType: e.target.value as any })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                      >
                        {CONTRACT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Estado *
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) =>
                          setFormData({ ...formData, status: e.target.value as any })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                      >
                        <option value="active">Activo</option>
                        <option value="on-leave">De baja</option>
                        <option value="left">Fuera del proyecto</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Fecha de incorporación *
                      </label>
                      <input
                        type="date"
                        value={formData.joinDate}
                        onChange={(e) =>
                          setFormData({ ...formData, joinDate: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                      />
                    </div>

                    {formData.status === "left" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Fecha de salida
                        </label>
                        <input
                          type="date"
                          value={formData.leaveDate}
                          onChange={(e) =>
                            setFormData({ ...formData, leaveDate: e.target.value })
                          }
                          disabled={modalMode === "view"}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Información salarial */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <DollarSign size={20} className="text-amber-600" />
                    Información salarial
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Salario (€) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.salary}
                        onChange={(e) =>
                          setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="2000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Tipo de salario *
                      </label>
                      <select
                        value={formData.salaryType}
                        onChange={(e) =>
                          setFormData({ ...formData, salaryType: e.target.value as any })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                      >
                        {SALARY_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Número de cuenta (IBAN)
                      </label>
                      <input
                        type="text"
                        value={formData.bankAccount}
                        onChange={(e) =>
                          setFormData({ ...formData, bankAccount: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="ES91 2100 0418 4502 0005 1332"
                      />
                    </div>
                  </div>
                </div>

                {/* Contacto de emergencia */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Phone size={20} className="text-amber-600" />
                    Contacto de emergencia
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nombre del contacto
                      </label>
                      <input
                        type="text"
                        value={formData.emergencyContact}
                        onChange={(e) =>
                          setFormData({ ...formData, emergencyContact: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="María García"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Teléfono de emergencia
                      </label>
                      <input
                        type="tel"
                        value={formData.emergencyPhone}
                        onChange={(e) =>
                          setFormData({ ...formData, emergencyPhone: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
                        placeholder="+34 600 000 000"
                      />
                    </div>
                  </div>
                </div>

                {/* Notas */}
                <div className="border-t pt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notas adicionales
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={modalMode === "view"}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 resize-none"
                    placeholder="Información adicional relevante..."
                  />
                </div>
              </div>

              {/* Botones de acción */}
              <div className="mt-6 flex justify-end gap-3 pt-6 border-t border-slate-200">
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  {modalMode === "view" ? "Cerrar" : "Cancelar"}
                </button>
                {modalMode !== "view" && (
                  <button
                    onClick={modalMode === "create" ? handleCreateMember : handleUpdateMember}
                    disabled={saving}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : modalMode === "create" ? "Crear miembro" : "Guardar cambios"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


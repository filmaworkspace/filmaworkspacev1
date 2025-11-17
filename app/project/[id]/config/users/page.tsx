"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Users,
  UserPlus,
  Search,
  Grid3x3,
  List,
  Trash2,
  Shield,
  Filter,
  X,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  UserX,
  Mail,
  Clock,
  AlertTriangle,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

const PROJECT_ROLES = ["EP", "PM", "Controller", "PC"];
const DEPARTMENT_POSITIONS = ["HOD", "Coordinator", "Crew"];

interface Member {
  userId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  position?: string;
  permissions: {
    config: boolean;
    accounting: boolean;
    team: boolean;
  };
  addedAt: any;
  addedBy?: string;
  addedByName?: string;
}

interface PendingInvitation {
  id: string;
  invitedEmail: string;
  invitedName: string;
  roleType: "project" | "department";
  role?: string;
  department?: string;
  position?: string;
  status: string;
  createdAt: any;
  invitedBy: string;
  invitedByName: string;
}

interface Department {
  name: string;
}

export default function ConfigUsers() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [hasConfigAccess, setHasConfigAccess] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [foundUser, setFoundUser] = useState<{ name: string; email: string } | null>(null);

  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    roleType: "project" as "project" | "department",
    role: "",
    department: "",
    position: "",
    permissions: {
      accounting: false,
      team: false,
    },
  });

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
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
          const depts = projectData.departments || [];
          setDepartments(depts.map((d: string) => ({ name: d })));
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
            role: data.role,
            department: data.department,
            position: data.position,
            permissions: data.permissions || {
              config: false,
              accounting: false,
              team: false,
            },
            addedAt: data.addedAt,
            addedBy: data.addedBy,
            addedByName: data.addedByName,
          };
        });

        setMembers(membersData);

        // Load pending invitations
        const invitationsRef = collection(db, "invitations");
        const q = query(
          invitationsRef,
          where("projectId", "==", id),
          where("status", "==", "pending")
        );

        const invitationsSnap = await getDocs(q);
        const invitationsData: PendingInvitation[] = invitationsSnap.docs.map((invDoc) => {
          const data = invDoc.data();
          return {
            id: invDoc.id,
            invitedEmail: data.invitedEmail,
            invitedName: data.invitedName,
            roleType: data.roleType || "project",
            role: data.role,
            department: data.department,
            position: data.position,
            status: data.status,
            createdAt: data.createdAt,
            invitedBy: data.invitedBy,
            invitedByName: data.invitedByName,
          };
        });

        setPendingInvitations(invitationsData);
        setLoading(false);
      } catch (error) {
        console.error("Error cargando datos:", error);
        setErrorMessage("Error al cargar los datos");
        setLoading(false);
      }
    };

    loadData();
  }, [userId, id, router]);

  // Check if user exists when email changes
  useEffect(() => {
    const checkUserExists = async () => {
      if (!inviteForm.email || inviteForm.email.length < 3) {
        setUserExists(null);
        setFoundUser(null);
        return;
      }

      try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", inviteForm.email.toLowerCase().trim()));
        const usersSnap = await getDocs(q);

        if (!usersSnap.empty) {
          const userData = usersSnap.docs[0].data();
          setUserExists(true);
          setFoundUser({
            name: userData.name || userData.email,
            email: userData.email,
          });
          setInviteForm((prev) => ({
            ...prev,
            name: userData.name || userData.email,
          }));
        } else {
          setUserExists(false);
          setFoundUser(null);
        }
      } catch (error) {
        console.error("Error buscando usuario:", error);
      }
    };

    const debounce = setTimeout(() => {
      checkUserExists();
    }, 500);

    return () => clearTimeout(debounce);
  }, [inviteForm.email]);

  const handleSendInvitation = async () => {
    if (!id || !inviteForm.email.trim() || !inviteForm.name.trim()) {
      setErrorMessage("Email y nombre son obligatorios");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    if (inviteForm.roleType === "department" && (!inviteForm.department || !inviteForm.position)) {
      setErrorMessage("Debes seleccionar departamento y posición");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    if (inviteForm.roleType === "project" && !inviteForm.role) {
      setErrorMessage("Debes seleccionar un rol de proyecto");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const email = inviteForm.email.trim().toLowerCase();

      // Check if already member
      const existingMember = members.find((m) => m.email === email);
      if (existingMember) {
        setErrorMessage("Este usuario ya es miembro del proyecto");
        setSaving(false);
        setTimeout(() => setErrorMessage(""), 3000);
        return;
      }

      // Check if already invited
      const existingInvite = pendingInvitations.find((inv) => inv.invitedEmail === email);
      if (existingInvite) {
        setErrorMessage("Ya existe una invitación pendiente para este email");
        setSaving(false);
        setTimeout(() => setErrorMessage(""), 3000);
        return;
      }

      // Get userId if exists
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const usersSnap = await getDocs(q);

      let invitedUserId: string | null = null;
      if (!usersSnap.empty) {
        invitedUserId = usersSnap.docs[0].id;
      }

      const inviteData: any = {
        projectId: id,
        projectName: projectName,
        invitedEmail: email,
        invitedName: inviteForm.name.trim(),
        invitedUserId: invitedUserId,
        invitedBy: userId,
        invitedByName: userName,
        status: "pending",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        roleType: inviteForm.roleType,
      };

      if (inviteForm.roleType === "project") {
        inviteData.role = inviteForm.role;
        inviteData.permissions = {
          config: ["EP", "PM"].includes(inviteForm.role),
          accounting: inviteForm.permissions.accounting,
          team: inviteForm.permissions.team,
        };
      } else {
        inviteData.department = inviteForm.department;
        inviteData.position = inviteForm.position;
        inviteData.permissions = {
          config: false,
          accounting: inviteForm.permissions.accounting,
          team: inviteForm.permissions.team,
        };
      }

      await setDoc(doc(collection(db, "invitations")), inviteData);

      setSuccessMessage(`Invitación enviada correctamente a ${inviteForm.name}`);
      setTimeout(() => setSuccessMessage(""), 3000);

      // Reload invitations
      const invitationsRef = collection(db, "invitations");
      const invQuery = query(
        invitationsRef,
        where("projectId", "==", id),
        where("status", "==", "pending")
      );

      const invitationsSnap = await getDocs(invQuery);
      const invitationsData: PendingInvitation[] = invitationsSnap.docs.map((invDoc) => {
        const data = invDoc.data();
        return {
          id: invDoc.id,
          invitedEmail: data.invitedEmail,
          invitedName: data.invitedName,
          roleType: data.roleType || "project",
          role: data.role,
          department: data.department,
          position: data.position,
          status: data.status,
          createdAt: data.createdAt,
          invitedBy: data.invitedBy,
          invitedByName: data.invitedByName,
        };
      });

      setPendingInvitations(invitationsData);

      setInviteForm({
        email: "",
        name: "",
        roleType: "project",
        role: "",
        department: "",
        position: "",
        permissions: {
          accounting: false,
          team: false,
        },
      });
      setUserExists(null);
      setFoundUser(null);
      setShowInviteModal(false);
    } catch (error) {
      console.error("Error enviando invitación:", error);
      setErrorMessage("Error al enviar la invitación");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm("¿Estás seguro de que deseas cancelar esta invitación?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "invitations", invitationId));
      setPendingInvitations(pendingInvitations.filter((inv) => inv.id !== invitationId));
      setSuccessMessage("Invitación cancelada correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error cancelando invitación:", error);
      setErrorMessage("Error al cancelar la invitación");
      setTimeout(() => setErrorMessage(""), 3000);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const member = members.find((m) => m.userId === memberId);
    if (!confirm(`¿Estás seguro de que deseas eliminar a ${member?.name || member?.email}?`)) {
      return;
    }

    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/members`, memberId));
      await deleteDoc(doc(db, `userProjects/${memberId}/projects`, id as string));

      setMembers(members.filter((m) => m.userId !== memberId));
      setSuccessMessage("Miembro eliminado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error eliminando miembro:", error);
      setErrorMessage("Error al eliminar el miembro");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Filtered members
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase());

    if (roleFilter === "all") return matchesSearch;
    if (roleFilter === "project") return matchesSearch && PROJECT_ROLES.includes(member.role || "");
    if (roleFilter === "unassigned") return matchesSearch && !member.department && !member.role;
    return matchesSearch && member.department === roleFilter;
  });

  const uniqueDepartments = Array.from(
    new Set(members.map((m) => m.department).filter(Boolean))
  ) as string[];

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm font-medium">Cargando usuarios...</p>
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
      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-900">Invitar usuario</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteForm({
                    email: "",
                    name: "",
                    roleType: "project",
                    role: "",
                    department: "",
                    position: "",
                    permissions: { accounting: false, team: false },
                  });
                  setUserExists(null);
                  setFoundUser(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email del usuario
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="usuario@ejemplo.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                />

                {/* User Exists Feedback */}
                {userExists === true && foundUser && (
                  <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
                    <UserCheck size={18} className="text-emerald-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-900">Usuario registrado</p>
                      <p className="text-xs text-emerald-700">{foundUser.name}</p>
                    </div>
                  </div>
                )}

                {userExists === false && inviteForm.email.length > 3 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <UserX size={18} className="text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900">Usuario no registrado</p>
                      <p className="text-xs text-amber-700">
                        Se enviará invitación para crear cuenta en FILMA
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre del usuario
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Nombre completo"
                  disabled={userExists === true}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm disabled:bg-slate-50 disabled:text-slate-600"
                />
              </div>

              {/* Role Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de rol</label>
                <select
                  value={inviteForm.roleType}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, roleType: e.target.value as "project" | "department" })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                >
                  <option value="project">Rol de proyecto (EP, PM, Controller, PC)</option>
                  <option value="department">Rol de departamento (HOD, Coordinator, Crew)</option>
                </select>
              </div>

              {/* Project Role */}
              {inviteForm.roleType === "project" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Rol de proyecto
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                  >
                    <option value="">Seleccionar rol</option>
                    {PROJECT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  {/* Department */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Departamento
                    </label>
                    <select
                      value={inviteForm.department}
                      onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="">Seleccionar</option>
                      {departments.map((dept) => (
                        <option key={dept.name} value={dept.name}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Posición</label>
                    <select
                      value={inviteForm.position}
                      onChange={(e) => setInviteForm({ ...inviteForm, position: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                    >
                      <option value="">Seleccionar</option>
                      {DEPARTMENT_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Permisos adicionales
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.accounting}
                      onChange={(e) =>
                        setInviteForm({
                          ...inviteForm,
                          permissions: { ...inviteForm.permissions, accounting: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">Contabilidad</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteForm.permissions.team}
                      onChange={(e) =>
                        setInviteForm({
                          ...inviteForm,
                          permissions: { ...inviteForm.permissions, team: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">Gestión de equipo</span>
                  </label>
                </div>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSendInvitation}
                disabled={saving}
                className="w-full mt-4 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Enviando invitación..." : "Enviar invitación"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
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

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-900">
                  Invitaciones pendientes ({pendingInvitations.length})
                </h3>
              </div>
              <div className="space-y-2">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{inv.invitedName}</p>
                      <p className="text-xs text-slate-600">{inv.invitedEmail}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {inv.roleType === "project"
                          ? `Rol: ${inv.role}`
                          : `${inv.position} - ${inv.department}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <UserCircle size={12} />
                        Invitado por: {inv.invitedByName}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancelInvitation(inv.id)}
                      className="ml-3 px-3 py-1.5 text-amber-700 hover:bg-amber-100 rounded text-xs font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                    <Users size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Usuarios del proyecto</h2>
                    <p className="text-sm text-slate-500">
                      {members.length} {members.length === 1 ? "usuario" : "usuarios"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <UserPlus size={16} />
                  Invitar usuario
                </button>
              </div>

              {/* Filters and View Toggle */}
              <div className="flex flex-col md:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar usuario..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                  />
                </div>

                <div className="flex gap-3">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                  >
                    <option value="all">Todos</option>
                    <option value="project">Roles de proyecto</option>
                    {uniqueDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                    <option value="unassigned">Sin asignar</option>
                  </select>

                  <div className="flex border border-slate-300 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setViewMode("cards")}
                      className={`px-3 py-2 text-sm transition-colors ${
                        viewMode === "cards"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      title="Vista de cards"
                    >
                      <Grid3x3 size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode("table")}
                      className={`px-3 py-2 text-sm transition-colors border-l border-slate-300 ${
                        viewMode === "table"
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      title="Vista de tabla"
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Members Display */}
              {filteredMembers.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  {searchTerm || roleFilter !== "all"
                    ? "No se encontraron usuarios con los filtros aplicados"
                    : "No hay usuarios en el proyecto aún"}
                </div>
              ) : viewMode === "cards" ? (
                // Cards View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMembers.map((member) => {
                    const isProjectRole = PROJECT_ROLES.includes(member.role || "");

                    return (
                      <div
                        key={member.userId}
                        className="border border-slate-200 rounded-xl p-4 hover:shadow-lg transition-shadow bg-white"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-12 h-12 rounded-full ${
                                isProjectRole ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                              } flex items-center justify-center text-lg font-semibold`}
                            >
                              {member.name?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {member.name || member.email}
                                </p>
                                {isProjectRole && <Shield size={14} className="text-slate-900" />}
                              </div>
                              {member.email && member.name && (
                                <p className="text-xs text-slate-500">{member.email}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Role/Department */}
                        <div className="mb-3">
                          {isProjectRole ? (
                            <span className="inline-block text-xs font-medium bg-slate-900 text-white px-3 py-1 rounded-full">
                              {member.role}
                            </span>
                          ) : member.department && member.position ? (
                            <div className="text-sm text-slate-600">
                              <span className="font-medium text-slate-900">{member.position}</span>
                              <span className="text-slate-400"> · </span>
                              <span>{member.department}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Sin asignar</span>
                          )}
                        </div>

                        {/* Permissions */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {member.permissions.config && (
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                              Config
                            </span>
                          )}
                          {member.permissions.accounting && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium">
                              Accounting
                            </span>
                          )}
                          {member.permissions.team && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">
                              Team
                            </span>
                          )}
                        </div>

                        {/* Added By */}
                        {member.addedByName && (
                          <div className="mb-3 text-xs text-slate-400 flex items-center gap-1">
                            <UserCircle size={12} />
                            <span>Añadido por: {member.addedByName}</span>
                          </div>
                        )}

                        {/* Remove Button */}
                        {member.userId !== userId && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 text-sm text-red-600 hover:bg-red-50 py-2 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                            Eliminar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Table View
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Usuario
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Rol / Departamento
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Permisos
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Añadido por
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((member) => {
                        const isProjectRole = PROJECT_ROLES.includes(member.role || "");

                        return (
                          <tr
                            key={member.userId}
                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full ${
                                    isProjectRole
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-200 text-slate-600"
                                  } flex items-center justify-center text-xs font-semibold`}
                                >
                                  {member.name?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-slate-900">
                                      {member.name || member.email}
                                    </p>
                                    {isProjectRole && <Shield size={12} className="text-slate-900" />}
                                  </div>
                                  {member.email && member.name && (
                                    <p className="text-xs text-slate-500">{member.email}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {isProjectRole ? (
                                <span className="text-sm font-medium text-slate-900">{member.role}</span>
                              ) : (
                                <div className="text-sm text-slate-600">
                                  {member.department && member.position ? (
                                    <>
                                      <span className="font-medium text-slate-900">{member.position}</span>
                                      <span className="text-slate-400"> · </span>
                                      <span>{member.department}</span>
                                    </>
                                  ) : (
                                    <span className="text-slate-400">Sin asignar</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-1.5 flex-wrap">
                                {member.permissions.config && (
                                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                                    Config
                                  </span>
                                )}
                                {member.permissions.accounting && (
                                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium">
                                    Accounting
                                  </span>
                                )}
                                {member.permissions.team && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">
                                    Team
                                  </span>
                                )}
                                {!member.permissions.config &&
                                  !member.permissions.accounting &&
                                  !member.permissions.team && (
                                    <span className="text-xs text-slate-400">Sin permisos</span>
                                  )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {member.addedByName ? (
                                <span className="text-xs text-slate-600">{member.addedByName}</span>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {member.userId !== userId && (
                                <button
                                  onClick={() => handleRemoveMember(member.userId)}
                                  className="text-slate-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded"
                                  title="Eliminar permanentemente"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
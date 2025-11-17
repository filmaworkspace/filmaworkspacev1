"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  Folder,
  Search,
  Filter,
  Users,
  Settings,
  FileText,
  Calendar,
  Clock,
  Film,
  Zap,
  Mail,
  Check,
  X as XIcon,
  Sparkles,
  Building2,
  User,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  updateDoc,
  setDoc,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

const phaseColors: Record<string, string> = {
  Desarrollo: "from-sky-400 to-sky-600",
  Preproducción: "from-amber-400 to-amber-600",
  Rodaje: "from-indigo-400 to-indigo-600",
  Postproducción: "from-purple-400 to-purple-600",
  Finalizado: "from-emerald-400 to-emerald-600",
};

interface Project {
  id: string;
  name: string;
  phase: string;
  description?: string;
  producerId?: string;
  producerName?: string;
  role: string;
  department?: string;
  position?: string;
  permissions: {
    config: boolean;
    accounting: boolean;
    team: boolean;
  };
  createdAt: Timestamp | null;
  addedAt: Timestamp | null;
  memberCount?: number;
}

interface Invitation {
  id: string;
  projectId: string;
  projectName: string;
  invitedBy: string;
  invitedByName: string;
  roleType: "project" | "department";
  role?: string;
  department?: string;
  position?: string;
  permissions: {
    config?: boolean;
    accounting: boolean;
    team: boolean;
  };
  status: string;
  createdAt: Date | Timestamp;
  expiresAt: Date | Timestamp;
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("Usuario");
  const [userEmail, setUserEmail] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "phase">("recent");

  // Auth listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const userRole = userData?.role || "user";

        if (userRole === "admin") {
          router.push("/admindashboard");
          return;
        }

        setUserId(user.uid);
        setUserName(userData?.name || user.displayName || user.email?.split("@")[0] || "Usuario");
        setUserEmail(user.email || "");
      } catch (error) {
        console.error("Error verificando usuario:", error);
        setUserId(user.uid);
        setUserName(user.displayName || user.email?.split("@")[0] || "Usuario");
        setUserEmail(user.email || "");
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  // Load projects and invitations
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      try {
        // Load projects
        const userProjectsRef = collection(db, `userProjects/${userId}/projects`);
        const userProjectsSnapshot = await getDocs(userProjectsRef);

        const projectsData: Project[] = [];

        for (const userProjectDoc of userProjectsSnapshot.docs) {
          const userProjectData = userProjectDoc.data();
          const projectId = userProjectDoc.id;

          const projectRef = doc(db, "projects", projectId);
          const projectSnapshot = await getDoc(projectRef);

          if (projectSnapshot.exists()) {
            const projectData = projectSnapshot.data();

            // Get producer info if exists
            let producerName = undefined;
            if (projectData.producer) {
              const producerDoc = await getDoc(doc(db, "producers", projectData.producer));
              if (producerDoc.exists()) {
                producerName = producerDoc.data().name;
              }
            }

            // Get member count
            const membersSnapshot = await getDocs(collection(db, `projects/${projectId}/members`));

            projectsData.push({
              id: projectSnapshot.id,
              name: projectData.name,
              phase: projectData.phase,
              description: projectData.description || "",
              producerId: projectData.producer,
              producerName,
              role: userProjectData.role,
              department: userProjectData.department,
              position: userProjectData.position,
              permissions: userProjectData.permissions || {
                config: false,
                accounting: false,
                team: false,
              },
              createdAt: projectData.createdAt || null,
              addedAt: userProjectData.addedAt || null,
              memberCount: membersSnapshot.size,
            });
          }
        }

        // Sort by most recent
        projectsData.sort((a, b) => {
          const dateA = a.addedAt?.toMillis() || 0;
          const dateB = b.addedAt?.toMillis() || 0;
          return dateB - dateA;
        });

        setProjects(projectsData);
        setFilteredProjects(projectsData);

        // Load pending invitations
        const invitationsRef = collection(db, "invitations");
        const q = query(
          invitationsRef,
          where("invitedEmail", "==", userEmail),
          where("status", "==", "pending")
        );

        const invitationsSnapshot = await getDocs(q);
        const invitationsData: Invitation[] = invitationsSnapshot.docs.map(
          (invDoc: QueryDocumentSnapshot<DocumentData>) => {
            const data = invDoc.data();
            return {
              id: invDoc.id,
              projectId: data.projectId,
              projectName: data.projectName,
              invitedBy: data.invitedBy,
              invitedByName: data.invitedByName,
              roleType: data.roleType,
              role: data.role,
              department: data.department,
              position: data.position,
              permissions: data.permissions,
              status: data.status,
              createdAt: data.createdAt,
              expiresAt: data.expiresAt,
            };
          }
        );

        setInvitations(invitationsData);
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userId, userEmail]);

  // Filter and sort projects
  useEffect(() => {
    let filtered = [...projects];

    if (searchTerm) {
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.producerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedPhase !== "all") {
      filtered = filtered.filter((p) => p.phase === selectedPhase);
    }

    switch (sortBy) {
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "phase":
        filtered.sort((a, b) => a.phase.localeCompare(b.phase));
        break;
      case "recent":
      default:
        filtered.sort((a, b) => {
          const dateA = a.addedAt?.toMillis() || 0;
          const dateB = b.addedAt?.toMillis() || 0;
          return dateB - dateA;
        });
    }

    setFilteredProjects(filtered);
  }, [searchTerm, selectedPhase, sortBy, projects]);

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!userId) return;

    setProcessingInvite(invitation.id);

    try {
      // Update invitation status
      await updateDoc(doc(db, "invitations", invitation.id), {
        status: "accepted",
        respondedAt: new Date(),
      });

      // Add member to project
      await setDoc(
        doc(db, `projects/${invitation.projectId}/members`, userId),
        {
          userId,
          name: userName,
          email: userEmail,
          role: invitation.role || null,
          department: invitation.department || null,
          position: invitation.position || null,
          permissions: {
            config: invitation.permissions.config || false,
            accounting: invitation.permissions.accounting,
            team: invitation.permissions.team,
          },
          addedAt: new Date(),
        }
      );

      // Add project to user's projects
      await setDoc(
        doc(db, `userProjects/${userId}/projects/${invitation.projectId}`),
        {
          projectId: invitation.projectId,
          role: invitation.role || null,
          department: invitation.department || null,
          position: invitation.position || null,
          permissions: {
            config: invitation.permissions.config || false,
            accounting: invitation.permissions.accounting,
            team: invitation.permissions.team,
          },
          addedAt: new Date(),
        }
      );

      window.location.reload();
    } catch (error) {
      console.error("Error aceptando invitación:", error);
      alert("Error al aceptar la invitación");
      setProcessingInvite(null);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    if (!confirm("¿Estás seguro de que deseas rechazar esta invitación?")) {
      return;
    }

    setProcessingInvite(invitationId);

    try {
      await updateDoc(doc(db, "invitations", invitationId), {
        status: "rejected",
        respondedAt: new Date(),
      });

      setInvitations(invitations.filter((i) => i.id !== invitationId));
      setProcessingInvite(null);
    } catch (error) {
      console.error("Error rechazando invitación:", error);
      alert("Error al rechazar la invitación");
      setProcessingInvite(null);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">
              Cargando tus proyectos
            </p>
          </div>
        </main>
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.phase !== "Finalizado").length;
  const finishedProjects = projects.filter((p) => p.phase === "Finalizado").length;

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto">
          {/* Header with stats */}
          <header className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-2">
                  Hola, {userName}
                </h1>
                <p className="text-slate-600">
                  Gestiona todos tus proyectos desde aquí
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-blue-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Folder size={24} />
                  </div>
                  <div className="text-3xl font-bold text-blue-700">
                    {projects.length}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-blue-900 mb-1">
                  Total de proyectos
                </h3>
                <p className="text-xs text-blue-700">
                  Todos tus proyectos asignados
                </p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-emerald-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Zap size={24} />
                  </div>
                  <div className="text-3xl font-bold text-emerald-700">
                    {activeProjects}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-emerald-900 mb-1">
                  Proyectos activos
                </h3>
                <p className="text-xs text-emerald-700">
                  En desarrollo o producción
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-purple-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                    <Film size={24} />
                  </div>
                  <div className="text-3xl font-bold text-purple-700">
                    {finishedProjects}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-purple-900 mb-1">
                  Finalizados
                </h3>
                <p className="text-xs text-purple-700">Proyectos completados</p>
              </div>
            </div>
          </header>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Mail size={20} className="text-blue-600" />
                <h2 className="text-xl font-semibold text-slate-900">
                  Invitaciones pendientes
                </h2>
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {invitations.length}
                </span>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="relative group bg-gradient-to-br from-blue-50/50 to-indigo-50/50 backdrop-blur-sm border-2 border-dashed border-blue-300 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300"
                  >
                    <div className="absolute -top-3 left-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md flex items-center gap-1">
                      <Sparkles size={12} />
                      Nueva invitación
                    </div>

                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="bg-blue-600/60 text-white p-2 rounded-lg shadow-md">
                          <Folder size={18} />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {invitation.projectName}
                        </h2>
                      </div>

                      <div className="space-y-2 text-sm">
                        <p className="text-slate-700 flex items-center gap-2">
                          <User size={14} className="text-slate-500" />
                          <span className="font-medium">Invitado por:</span>{" "}
                          {invitation.invitedByName}
                        </p>
                        <p className="text-slate-700">
                          <span className="font-medium">Rol:</span>{" "}
                          {invitation.roleType === "project"
                            ? invitation.role
                            : `${invitation.position} - ${invitation.department}`}
                        </p>
                        {(invitation.permissions.accounting ||
                          invitation.permissions.team ||
                          invitation.permissions.config) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {invitation.permissions.config && (
                              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                                Config
                              </span>
                            )}
                            {invitation.permissions.accounting && (
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                                Accounting
                              </span>
                            )}
                            {invitation.permissions.team && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                                Team
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptInvitation(invitation)}
                        disabled={processingInvite === invitation.id}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-lg py-2.5 text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={16} />
                        {processingInvite === invitation.id ? "Procesando..." : "Aceptar"}
                      </button>
                      <button
                        onClick={() => handleRejectInvitation(invitation.id)}
                        disabled={processingInvite === invitation.id}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XIcon size={16} />
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state or projects list */}
          {projects.length === 0 && invitations.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center max-w-md">
                <div className="bg-slate-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Folder size={40} className="text-slate-400" />
                </div>
                <h2 className="text-2xl font-semibold text-slate-800 mb-3">
                  No tienes proyectos asignados
                </h2>
                <p className="text-slate-600 leading-relaxed mb-6">
                  Aún no has sido asignado a ningún proyecto. Contacta con tu
                  administrador para obtener acceso o espera a que te añadan a un equipo.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Clock size={16} />
                  <span>Los proyectos aparecerán aquí cuando seas añadido</span>
                </div>
              </div>
            </div>
          ) : (
            projects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Folder size={20} className="text-slate-600" />
                  <h2 className="text-xl font-semibold text-slate-900">
                    Tus proyectos
                  </h2>
                </div>

                {/* Filters and search */}
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Buscar por nombre o productora..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent outline-none text-sm"
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="relative">
                      <Filter
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                      <select
                        value={selectedPhase}
                        onChange={(e) => setSelectedPhase(e.target.value)}
                        className="pl-10 pr-8 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent outline-none text-sm appearance-none bg-white"
                      >
                        <option value="all">Todas las fases</option>
                        <option value="Desarrollo">Desarrollo</option>
                        <option value="Preproducción">Preproducción</option>
                        <option value="Rodaje">Rodaje</option>
                        <option value="Postproducción">Postproducción</option>
                        <option value="Finalizado">Finalizado</option>
                      </select>
                    </div>

                    <div className="relative">
                      <Calendar
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "phase")}
                        className="pl-10 pr-8 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent outline-none text-sm appearance-none bg-white"
                      >
                        <option value="recent">Más recientes</option>
                        <option value="name">Por nombre</option>
                        <option value="phase">Por fase</option>
                      </select>
                    </div>
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-slate-500">
                      No se encontraron proyectos con los filtros aplicados
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedPhase("all");
                      }}
                      className="mt-4 text-sm text-slate-700 hover:text-slate-900 underline"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-slate-600">
                        Mostrando {filteredProjects.length} de {projects.length}{" "}
                        {projects.length === 1 ? "proyecto" : "proyectos"}
                      </p>
                    </div>

                    {/* Projects grid */}
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {filteredProjects.map((project) => {
                        const hasConfig = project.permissions.config;
                        const hasAccounting = project.permissions.accounting;
                        const hasTeam = project.permissions.team;
                        const permissionsCount = [hasConfig, hasAccounting, hasTeam].filter(Boolean).length;

                        return (
                          <div
                            key={project.id}
                            className="group bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-slate-300 transition-all duration-300 hover:-translate-y-1"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="bg-slate-900 text-white p-2 rounded-lg shadow-md group-hover:scale-110 transition-transform">
                                    <Folder size={18} />
                                  </div>
                                  <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                                    {project.name}
                                  </h2>
                                </div>

                                {project.description && (
                                  <p className="text-xs text-slate-600 mb-3 line-clamp-2">
                                    {project.description}
                                  </p>
                                )}

                                {/* Producer info */}
                                {project.producerName && (
                                  <div className="flex items-center gap-1.5 mb-3">
                                    <Building2 size={14} className="text-amber-600" />
                                    <span className="text-xs text-slate-700 font-medium">
                                      {project.producerName}
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-center gap-2 flex-wrap">
                                  {project.role && (
                                    <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                                      {project.role}
                                    </span>
                                  )}
                                  {project.position && project.department && (
                                    <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                                      {project.position} · {project.department}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs font-medium text-white rounded-full px-3 py-1 bg-gradient-to-r ${phaseColors[project.phase]} shadow-sm`}
                                  >
                                    {project.phase}
                                  </span>
                                </div>

                                {/* Member count */}
                                {project.memberCount !== undefined && (
                                  <div className="flex items-center gap-1.5 mt-3">
                                    <Users size={14} className="text-slate-400" />
                                    <span className="text-xs text-slate-600">
                                      {project.memberCount} {project.memberCount === 1 ? "miembro" : "miembros"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div
                              className={`grid gap-3 ${
                                permissionsCount === 3
                                  ? "grid-cols-3"
                                  : permissionsCount === 2
                                  ? "grid-cols-2"
                                  : "grid-cols-1"
                              }`}
                            >
                              {hasConfig && (
                                <Link href={`/project/${project.id}/config`}>
                                  <div className="group/card border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer bg-white flex flex-col items-center justify-center h-24">
                                    <div className="bg-slate-100 text-slate-700 p-2.5 rounded-lg group-hover/card:bg-slate-200 group-hover/card:scale-110 transition-all">
                                      <Settings size={18} />
                                    </div>
                                    <h3 className="text-xs font-medium text-slate-800 mt-2">
                                      Config
                                    </h3>
                                  </div>
                                </Link>
                              )}

                              {hasAccounting && (
                                <Link href={`/project/${project.id}/accounting`}>
                                  <div className="group/card border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer bg-white flex flex-col items-center justify-center h-24">
                                    <div className="bg-indigo-100 text-indigo-700 p-2.5 rounded-lg group-hover/card:bg-indigo-200 group-hover/card:scale-110 transition-all">
                                      <FileText size={18} />
                                    </div>
                                    <h3 className="text-xs font-medium text-slate-800 mt-2">
                                      Accounting
                                    </h3>
                                  </div>
                                </Link>
                              )}

                              {hasTeam && (
                                <Link href={`/project/${project.id}/team`}>
                                  <div className="group/card border border-slate-200 rounded-xl p-4 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer bg-white flex flex-col items-center justify-center h-24">
                                    <div className="bg-amber-100 text-amber-700 p-2.5 rounded-lg group-hover/card:bg-amber-200 group-hover/card:scale-110 transition-all">
                                      <Users size={18} />
                                    </div>
                                    <h3 className="text-xs font-medium text-slate-800 mt-2">
                                      Team
                                    </h3>
                                  </div>
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}

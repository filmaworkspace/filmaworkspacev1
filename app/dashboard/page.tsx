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
  ChevronRight,
  TrendingUp,
  Star,
  Briefcase,
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

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const phaseColors: Record<string, { gradient: string; bg: string; border: string; text: string }> = {
  Desarrollo: {
    gradient: "from-sky-400 to-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700"
  },
  Preproducción: {
    gradient: "from-amber-400 to-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700"
  },
  Rodaje: {
    gradient: "from-indigo-400 to-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-700"
  },
  Postproducción: {
    gradient: "from-purple-400 to-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700"
  },
  Finalizado: {
    gradient: "from-emerald-400 to-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700"
  },
};

interface Project {
  id: string;
  name: string;
  phase: string;
  description?: string;
  producers?: string[];
  producerNames?: string[];
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

            // Get producer names if exists
            let producerNames: string[] = [];
            if (projectData.producers && Array.isArray(projectData.producers)) {
              for (const producerId of projectData.producers) {
                const producerDoc = await getDoc(doc(db, "producers", producerId));
                if (producerDoc.exists()) {
                  producerNames.push(producerDoc.data().name);
                }
              }
            }

            // Get member count
            const membersSnapshot = await getDocs(collection(db, `projects/${projectId}/members`));

            projectsData.push({
              id: projectSnapshot.id,
              name: projectData.name,
              phase: projectData.phase,
              description: projectData.description || "",
              producers: projectData.producers || [],
              producerNames: producerNames.length > 0 ? producerNames : undefined,
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
        p.producerNames?.some(name => name.toLowerCase().includes(searchTerm.toLowerCase()))
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
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">
              Cargando proyectos...
            </p>
          </div>
        </main>
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.phase !== "Finalizado").length;
  const finishedProjects = projects.filter((p) => p.phase === "Finalizado").length;

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto">
          {/* Header with welcome */}
          <header className="mb-10">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                Hola, {userName}
              </h1>
              <p className="text-sm text-slate-600">
                Resumen de proyectos
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-blue-600 text-white p-2 rounded-lg">
                    <Folder size={20} />
                  </div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {projects.length}
                  </div>
                </div>
                <h3 className="text-xs font-medium text-slate-600">
                  Total de proyectos
                </h3>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-emerald-600 text-white p-2 rounded-lg">
                    <Zap size={20} />
                  </div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {activeProjects}
                  </div>
                </div>
                <h3 className="text-xs font-medium text-slate-600">
                  Proyectos activos
                </h3>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="bg-purple-600 text-white p-2 rounded-lg">
                    <Star size={20} />
                  </div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {finishedProjects}
                  </div>
                </div>
                <h3 className="text-xs font-medium text-slate-600">
                  Proyectos completados
                </h3>
              </div>
            </div>
          </header>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Mail size={18} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Invitaciones pendientes
                </h2>
                <span className="bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {invitations.length}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="bg-white border-2 border-blue-200 rounded-xl p-5 hover:shadow-lg transition-all"
                  >
                    <div className="mb-4">
                      <div className="flex items-start gap-2 mb-3">
                        <div className="bg-blue-600 text-white p-1.5 rounded-lg">
                          <Folder size={16} />
                        </div>
                        <div className="flex-1">
                          <h2 className="text-base font-semibold text-slate-900 mb-0.5">
                            {invitation.projectName}
                          </h2>
                          <div className="flex items-center gap-1 text-xs text-slate-600">
                            <User size={11} />
                            <span>{invitation.invitedByName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Briefcase size={13} className="text-slate-500" />
                          <span className="font-medium text-slate-900">
                            {invitation.roleType === "project"
                              ? invitation.role
                              : `${invitation.position} - ${invitation.department}`}
                          </span>
                        </div>
                        
                        {(invitation.permissions.accounting ||
                          invitation.permissions.team ||
                          invitation.permissions.config) && (
                          <div className="flex flex-wrap gap-1.5">
                            {invitation.permissions.config && (
                              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                                Config
                              </span>
                            )}
                            {invitation.permissions.accounting && (
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">
                                Accounting
                              </span>
                            )}
                            {invitation.permissions.team && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
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
                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg py-2 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={14} />
                        {processingInvite === invitation.id ? "Procesando..." : "Aceptar"}
                      </button>
                      <button
                        onClick={() => handleRejectInvitation(invitation.id)}
                        disabled={processingInvite === invitation.id}
                        className="flex items-center justify-center gap-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg py-2 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XIcon size={14} />
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
                <div className="bg-slate-100 w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Folder size={32} className="text-slate-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800 mb-2">
                  No tienes proyectos asignados
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                  Contacta con tu administrador para obtener acceso
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <Clock size={14} />
                  <span>Los proyectos aparecerán aquí cuando seas añadido</span>
                </div>
              </div>
            </div>
          ) : (
            projects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Folder size={18} className="text-slate-600" />
                  <h2 className="text-lg font-semibold text-slate-900">
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
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                      <select
                        value={selectedPhase}
                        onChange={(e) => setSelectedPhase(e.target.value)}
                        className="pl-9 pr-8 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent outline-none text-sm appearance-none bg-white cursor-pointer"
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
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "phase")}
                        className="pl-9 pr-8 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent outline-none text-sm appearance-none bg-white cursor-pointer"
                      >
                        <option value="recent">Más recientes</option>
                        <option value="name">Por nombre</option>
                        <option value="phase">Por fase</option>
                      </select>
                    </div>
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="text-center py-16 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-slate-500 text-sm font-medium mb-2">
                      No se encontraron proyectos con los filtros aplicados
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedPhase("all");
                      }}
                      className="text-sm text-slate-700 hover:text-slate-900 font-medium underline"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs text-slate-600">
                        Mostrando <span className="text-slate-900 font-semibold">{filteredProjects.length}</span> de <span className="text-slate-900 font-semibold">{projects.length}</span>{" "}
                        {projects.length === 1 ? "proyecto" : "proyectos"}
                      </p>
                    </div>

                    {/* Projects grid */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredProjects.map((project) => {
                        const hasConfig = project.permissions.config;
                        const hasAccounting = project.permissions.accounting;
                        const hasTeam = project.permissions.team;
                        const phaseStyle = phaseColors[project.phase];

                        return (
                          <div
                            key={project.id}
                            className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-slate-300 transition-all"
                          >
                            {/* Project header */}
                            <div className="mb-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="bg-slate-900 text-white p-1.5 rounded-lg">
                                    <Folder size={16} />
                                  </div>
                                  <h2 className="text-base font-semibold text-slate-900">
                                    {project.name}
                                  </h2>
                                </div>
                                <span className={`text-xs font-medium text-white rounded-full px-2.5 py-1 bg-gradient-to-r ${phaseStyle.gradient}`}>
                                  {project.phase}
                                </span>
                              </div>

                              {project.description && (
                                <p className="text-xs text-slate-600 mb-3 line-clamp-2">
                                  {project.description}
                                </p>
                              )}

                              {/* Producers */}
                              {project.producerNames && project.producerNames.length > 0 && (
                                <div className="mb-3 space-y-1">
                                  {project.producerNames.map((producerName, index) => (
                                    <div key={index} className="flex items-center gap-1.5">
                                      <Building2 size={13} className="text-amber-600" />
                                      <span className="text-xs text-slate-700 font-medium">
                                        {producerName}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Role and member count */}
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                {project.role && (
                                  <span className="text-xs font-medium text-slate-700 bg-slate-100 rounded-md px-2 py-1">
                                    {project.role}
                                  </span>
                                )}
                                {project.position && project.department && (
                                  <span className="text-xs font-medium text-slate-700 bg-slate-100 rounded-md px-2 py-1">
                                    {project.position} · {project.department}
                                  </span>
                                )}
                              </div>

                              {project.memberCount !== undefined && (
                                <div className="flex items-center gap-1.5">
                                  <Users size={13} className="text-slate-400" />
                                  <span className="text-xs text-slate-600">
                                    {project.memberCount} {project.memberCount === 1 ? "miembro" : "miembros"}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Access cards */}
                            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
                              {hasConfig && (
                                <Link href={`/project/${project.id}/config`}>
                                  <div className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-slate-900 hover:shadow-md transition-all cursor-pointer">
                                    <div className="bg-slate-100 text-slate-700 p-2 rounded-lg mb-1">
                                      <Settings size={16} />
                                    </div>
                                    <span className="text-xs font-medium text-slate-700">
                                      Config
                                    </span>
                                  </div>
                                </Link>
                              )}

                              {hasAccounting && (
                                <Link href={`/project/${project.id}/accounting`}>
                                  <div className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer">
                                    <div className="bg-indigo-100 text-indigo-700 p-2 rounded-lg mb-1">
                                      <FileText size={16} />
                                    </div>
                                    <span className="text-xs font-medium text-slate-700">
                                      Accounting
                                    </span>
                                  </div>
                                </Link>
                              )}

                              {hasTeam && (
                                <Link href={`/project/${project.id}/team`}>
                                  <div className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-lg hover:border-amber-600 hover:shadow-md transition-all cursor-pointer">
                                    <div className="bg-amber-100 text-amber-700 p-2 rounded-lg mb-1">
                                      <Users size={16} />
                                    </div>
                                    <span className="text-xs font-medium text-slate-700">
                                      Team
                                    </span>
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

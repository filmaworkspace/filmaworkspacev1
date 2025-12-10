"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import {
  Folder,
  Search,
  Users,
  Settings,
  Clock,
  Mail,
  Check,
  X as XIcon,
  Building2,
  Sparkles,
  ArrowRight,
  LayoutGrid,
  List,
  BarChart3,
  Archive,
  ChevronDown,
  FolderOpen,
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
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const phaseColors: Record<string, { gradient: string; bg: string; border: string; text: string; dot: string }> = {
  Desarrollo: {
    gradient: "from-sky-400 to-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    dot: "bg-sky-500"
  },
  Preproducción: {
    gradient: "from-amber-400 to-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500"
  },
  Rodaje: {
    gradient: "from-indigo-400 to-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-700",
    dot: "bg-indigo-500"
  },
  Postproducción: {
    gradient: "from-purple-400 to-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    dot: "bg-purple-500"
  },
  Finalizado: {
    gradient: "from-emerald-400 to-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500"
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
  archived?: boolean;
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showArchived, setShowArchived] = useState(false);

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

  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      try {
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

            let producerNames: string[] = [];
            if (projectData.producers && Array.isArray(projectData.producers)) {
              for (const producerId of projectData.producers) {
                const producerDoc = await getDoc(doc(db, "producers", producerId));
                if (producerDoc.exists()) {
                  producerNames.push(producerDoc.data().name);
                }
              }
            }

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
              archived: projectData.archived || false,
            });
          }
        }

        projectsData.sort((a, b) => {
          const dateA = a.addedAt?.toMillis() || 0;
          const dateB = b.addedAt?.toMillis() || 0;
          return dateB - dateA;
        });

        setProjects(projectsData);
        setFilteredProjects(projectsData.filter(p => !p.archived));

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

  useEffect(() => {
    let filtered = [...projects].filter(p => !p.archived);

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

  const archivedProjects = projects.filter(p => p.archived);
  const activeProjectsCount = projects.filter(p => !p.archived).length;

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!userId) return;

    setProcessingInvite(invitation.id);

    try {
      await updateDoc(doc(db, "invitations", invitation.id), {
        status: "accepted",
        respondedAt: new Date(),
      });

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 20) return "Buenas tardes";
    return "Buenas noches";
  };

  const renderProjectCard = (project: Project, isArchived: boolean = false) => {
    const hasConfig = project.permissions.config;
    const hasAccounting = project.permissions.accounting;
    const hasTeam = project.permissions.team;
    const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];

    return (
      <div
        key={project.id}
        className={`group bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-all hover:shadow-md ${isArchived ? "opacity-75" : ""}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isArchived ? "bg-slate-400" : phaseStyle.dot}`}></div>
            <h2 className="text-base font-semibold text-slate-900 group-hover:text-slate-800">
              {project.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isArchived && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-slate-200 text-slate-600">
                Archivado
              </span>
            )}
            <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${phaseStyle.bg} ${phaseStyle.text} border ${phaseStyle.border}`}>
              {project.phase}
            </span>
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-slate-600 mb-3 line-clamp-2">
            {project.description}
          </p>
        )}

        {project.producerNames && project.producerNames.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 size={12} className="text-amber-600" />
            <span className="text-xs text-slate-600">
              {project.producerNames.join(", ")}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          {project.role && (
            <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1">
              {project.role}
            </span>
          )}
          {project.position && (
            <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1">
              {project.position}
            </span>
          )}
          {project.memberCount !== undefined && (
            <span className="text-xs text-slate-500 flex items-center gap-1 ml-auto">
              <Users size={12} />
              {project.memberCount}
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t border-slate-200">
          {hasConfig && (
            <Link href={`/project/${project.id}/config`} className="flex-1">
              <div className="flex items-center justify-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition-all text-slate-600 hover:text-slate-900">
                <Settings size={14} />
                <span className="text-xs font-medium">Config</span>
              </div>
            </Link>
          )}
          {hasAccounting && (
            <Link href={`/project/${project.id}/accounting`} className="flex-1">
              <div className="flex items-center justify-center gap-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:shadow-sm transition-all text-indigo-700">
                <BarChart3 size={14} />
                <span className="text-xs font-medium">Accounting</span>
              </div>
            </Link>
          )}
          {hasTeam && (
            <Link href={`/project/${project.id}/team`} className="flex-1">
              <div className="flex items-center justify-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:shadow-sm transition-all text-amber-700">
                <Users size={14} />
                <span className="text-xs font-medium">Team</span>
              </div>
            </Link>
          )}
        </div>
      </div>
    );
  };

  const renderProjectListItem = (project: Project, isArchived: boolean = false) => {
    const hasConfig = project.permissions.config;
    const hasAccounting = project.permissions.accounting;
    const hasTeam = project.permissions.team;
    const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];

    return (
      <div
        key={project.id}
        className={`group flex items-center justify-between p-4 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all hover:shadow-sm ${isArchived ? "opacity-75" : ""}`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-2 h-10 rounded-full ${isArchived ? "bg-slate-400" : phaseStyle.dot}`}></div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {project.name}
              </h2>
              {isArchived && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                  Archivado
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${phaseStyle.bg} ${phaseStyle.text}`}>
                {project.phase}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {project.producerNames && (
                <span className="text-xs text-slate-500">
                  {project.producerNames.join(", ")}
                </span>
              )}
              {project.role && (
                <span className="text-xs text-slate-600 font-medium">
                  {project.role}
                </span>
              )}
              {project.memberCount !== undefined && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Users size={11} />
                  {project.memberCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasConfig && (
            <Link
              href={`/project/${project.id}/config`}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Configuración"
            >
              <Settings size={16} />
            </Link>
          )}
          {hasAccounting && (
            <Link
              href={`/project/${project.id}/accounting`}
              className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Contabilidad"
            >
              <BarChart3 size={16} />
            </Link>
          )}
          {hasTeam && (
            <Link
              href={`/project/${project.id}/team`}
              className="p-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
              title="Equipo"
            >
              <Users size={16} />
            </Link>
          )}
          <ArrowRight size={16} className="text-slate-400 ml-2" />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4.5rem] bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">{getGreeting()},</p>
              <h1 className={`text-3xl font-semibold text-slate-900 tracking-tight ${spaceGrotesk.className}`}>
                {userName.split(' ')[0]}
              </h1>
            </div>


          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto -mt-6">
          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div className="mb-8">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                    <Mail size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Tienes {invitations.length} {invitations.length === 1 ? "invitación pendiente" : "invitaciones pendientes"}
                    </h2>
                    <p className="text-sm text-white/70">Te han invitado a unirte a nuevos proyectos</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="bg-white rounded-xl p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Folder size={18} className="text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 truncate">
                            {invitation.projectName}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Invitado por {invitation.invitedByName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-slate-700 bg-slate-100 rounded-lg px-2 py-1">
                          {invitation.roleType === "project"
                            ? invitation.role
                            : `${invitation.position}`}
                        </span>
                        {invitation.permissions.accounting && (
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg">
                            Accounting
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptInvitation(invitation)}
                          disabled={processingInvite === invitation.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg py-2 text-sm transition-all disabled:opacity-50"
                        >
                          <Check size={14} />
                          {processingInvite === invitation.id ? "..." : "Aceptar"}
                        </button>
                        <button
                          onClick={() => handleRejectInvitation(invitation.id)}
                          disabled={processingInvite === invitation.id}
                          className="flex items-center justify-center px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg py-2 transition-all disabled:opacity-50"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {projects.length === 0 && invitations.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl">
              <div className="flex items-center justify-center py-20">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Sparkles size={32} className="text-slate-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">
                    Bienvenido a tu espacio de trabajo
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    Aún no tienes proyectos asignados. Cuando un administrador te añada a un proyecto, 
                    aparecerá aquí automáticamente.
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <Clock size={14} />
                    <span>Las invitaciones a proyectos también aparecerán aquí</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Active Projects */}
              {activeProjectsCount > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                  {/* Filters */}
                  <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
                      <div className="relative flex-1 max-w-md">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar proyectos..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                        />
                      </div>

                      <div className="flex gap-2">
                        <select
                          value={selectedPhase}
                          onChange={(e) => setSelectedPhase(e.target.value)}
                          className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                        >
                          <option value="all">Todas las fases</option>
                          <option value="Desarrollo">Desarrollo</option>
                          <option value="Preproducción">Preproducción</option>
                          <option value="Rodaje">Rodaje</option>
                          <option value="Postproducción">Postproducción</option>
                          <option value="Finalizado">Finalizado</option>
                        </select>

                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "phase")}
                          className="px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm"
                        >
                          <option value="recent">Recientes</option>
                          <option value="name">Nombre</option>
                          <option value="phase">Fase</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                      <button
                        onClick={() => setViewMode("grid")}
                        className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        onClick={() => setViewMode("list")}
                        className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        <List size={16} />
                      </button>
                    </div>
                  </div>

                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-16">
                      <FolderOpen size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm font-medium mb-2">
                        No se encontraron proyectos
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
                    <div className="p-4">
                      <p className="text-xs text-slate-500 mb-4">
                        {filteredProjects.length} de {activeProjectsCount} proyectos
                      </p>

                      {viewMode === "grid" ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {filteredProjects.map((project) => renderProjectCard(project))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredProjects.map((project) => renderProjectListItem(project))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Archived Projects */}
              {archivedProjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Archive size={18} className="text-slate-500" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-slate-900">Proyectos archivados</h3>
                        <p className="text-sm text-slate-500">
                          {archivedProjects.length} proyecto{archivedProjects.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      size={20}
                      className={`text-slate-400 transition-transform ${showArchived ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showArchived && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      <div className="pt-4">
                        {viewMode === "grid" ? (
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {archivedProjects.map((project) => renderProjectCard(project, true))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {archivedProjects.map((project) => renderProjectListItem(project, true))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

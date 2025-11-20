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
  Mail,
  Check,
  X as XIcon,
  Building2,
  User,
  Briefcase,
  ChevronRight,
  LayoutGrid,
  List,
  Star,
  MoreVertical,
  ExternalLink,
  TrendingUp,
  Activity,
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

const phaseColors: Record<string, { gradient: string; bg: string; border: string; text: string; icon: string; dot: string }> = {
  Desarrollo: {
    gradient: "from-sky-500 to-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-300",
    text: "text-sky-700",
    icon: "bg-sky-500",
    dot: "bg-sky-500"
  },
  Preproducción: {
    gradient: "from-amber-500 to-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-700",
    icon: "bg-amber-500",
    dot: "bg-amber-500"
  },
  Rodaje: {
    gradient: "from-indigo-500 to-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-300",
    text: "text-indigo-700",
    icon: "bg-indigo-500",
    dot: "bg-indigo-500"
  },
  Postproducción: {
    gradient: "from-purple-500 to-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-300",
    text: "text-purple-700",
    icon: "bg-purple-500",
    dot: "bg-purple-500"
  },
  Finalizado: {
    gradient: "from-emerald-500 to-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-700",
    icon: "bg-emerald-500",
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
  isFavorite?: boolean;
  lastAccessed?: Timestamp | null;
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
  const [sortBy, setSortBy] = useState<"recent" | "name" | "phase" | "favorites">("favorites");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showDropdown, setShowDropdown] = useState<string | null>(null);

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
              isFavorite: userProjectData.isFavorite || false,
              lastAccessed: userProjectData.lastAccessed || null,
            });
          }
        }

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
      case "favorites":
        filtered.sort((a, b) => {
          if (a.isFavorite === b.isFavorite) {
            const dateA = a.lastAccessed?.toMillis() || a.addedAt?.toMillis() || 0;
            const dateB = b.lastAccessed?.toMillis() || b.addedAt?.toMillis() || 0;
            return dateB - dateA;
          }
          return a.isFavorite ? -1 : 1;
        });
        break;
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "phase":
        filtered.sort((a, b) => a.phase.localeCompare(b.phase));
        break;
      case "recent":
      default:
        filtered.sort((a, b) => {
          const dateA = a.lastAccessed?.toMillis() || a.addedAt?.toMillis() || 0;
          const dateB = b.lastAccessed?.toMillis() || b.addedAt?.toMillis() || 0;
          return dateB - dateA;
        });
    }

    setFilteredProjects(filtered);
  }, [searchTerm, selectedPhase, sortBy, projects]);

  const handleToggleFavorite = async (projectId: string, currentFavorite: boolean) => {
    if (!userId) return;

    try {
      await updateDoc(
        doc(db, `userProjects/${userId}/projects`, projectId),
        {
          isFavorite: !currentFavorite,
        }
      );

      setProjects(
        projects.map((p) =>
          p.id === projectId ? { ...p, isFavorite: !currentFavorite } : p
        )
      );
    } catch (error) {
      console.error("Error actualizando favorito:", error);
    }
  };

  const handleProjectClick = async (projectId: string) => {
    if (!userId) return;

    try {
      await updateDoc(
        doc(db, `userProjects/${userId}/projects`, projectId),
        {
          lastAccessed: Timestamp.now(),
        }
      );
    } catch (error) {
      console.error("Error actualizando último acceso:", error);
    }
  };

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
          isFavorite: false,
          lastAccessed: null,
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
            <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">
              Cargando proyectos...
            </p>
          </div>
        </main>
      </div>
    );
  }

  const favoriteProjects = projects.filter(p => p.isFavorite);
  const recentProjects = projects.filter(p => !p.isFavorite && p.lastAccessed).slice(0, 4);

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto">
          {/* Header simple y limpio */}
          <header className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">
              Inicio
            </h1>
            <p className="text-sm text-slate-500">
              {userName}
            </p>
          </header>

          {/* Pending invitations - más compacto */}
          {invitations.length > 0 && (
            <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Mail size={16} className="text-blue-600" />
                <h2 className="text-sm font-semibold text-blue-900">
                  {invitations.length} {invitations.length === 1 ? "invitación pendiente" : "invitaciones pendientes"}
                </h2>
              </div>

              <div className="space-y-2">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="bg-white border border-blue-200 rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {invitation.projectName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {invitation.invitedByName} · {invitation.roleType === "project" ? invitation.role : `${invitation.position} - ${invitation.department}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptInvitation(invitation)}
                        disabled={processingInvite === invitation.id}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() => handleRejectInvitation(invitation.id)}
                        disabled={processingInvite === invitation.id}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state or projects */}
          {projects.length === 0 && invitations.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center max-w-md">
                <div className="bg-slate-100 w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Folder size={32} className="text-slate-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  No tienes proyectos
                </h2>
                <p className="text-sm text-slate-500 mb-4">
                  Contacta con tu administrador para obtener acceso
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Favoritos */}
              {favoriteProjects.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Star size={18} className="text-amber-500 fill-amber-500" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Favoritos
                    </h2>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {favoriteProjects.map((project) => {
                      const phaseStyle = phaseColors[project.phase];

                      return (
                        <div
                          key={project.id}
                          className="group relative bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-slate-300 transition-all"
                        >
                          {/* Dropdown menu */}
                          <div className="absolute top-3 right-3 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdown(showDropdown === project.id ? null : project.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-all"
                            >
                              <MoreVertical size={16} className="text-slate-400" />
                            </button>

                            {showDropdown === project.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setShowDropdown(null)}
                                ></div>
                                <div className="absolute right-0 top-8 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-20">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFavorite(project.id, project.isFavorite || false);
                                      setShowDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <Star size={14} className={project.isFavorite ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
                                    {project.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Project info */}
                          <Link
                            href={project.permissions.accounting ? `/project/${project.id}/accounting` : project.permissions.team ? `/project/${project.id}/team` : `/project/${project.id}/config`}
                            onClick={() => handleProjectClick(project.id)}
                          >
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${phaseStyle.dot}`}></div>
                                <span className="text-xs font-medium text-slate-500">
                                  {project.phase}
                                </span>
                              </div>
                              <h3 className="text-sm font-semibold text-slate-900 mb-1 pr-6">
                                {project.name}
                              </h3>
                              {project.role && (
                                <p className="text-xs text-slate-500">
                                  {project.role}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              {project.memberCount !== undefined && (
                                <div className="flex items-center gap-1">
                                  <Users size={12} />
                                  <span>{project.memberCount}</span>
                                </div>
                              )}
                              {project.producerNames && project.producerNames.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Building2 size={12} />
                                  <span className="truncate">{project.producerNames[0]}</span>
                                </div>
                              )}
                            </div>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recientes */}
              {recentProjects.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={18} className="text-slate-500" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Recientes
                    </h2>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {recentProjects.map((project) => {
                      const phaseStyle = phaseColors[project.phase];

                      return (
                        <div
                          key={project.id}
                          className="group relative bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-slate-300 transition-all"
                        >
                          {/* Dropdown menu */}
                          <div className="absolute top-3 right-3 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdown(showDropdown === project.id ? null : project.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-all"
                            >
                              <MoreVertical size={16} className="text-slate-400" />
                            </button>

                            {showDropdown === project.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setShowDropdown(null)}
                                ></div>
                                <div className="absolute right-0 top-8 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-20">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFavorite(project.id, project.isFavorite || false);
                                      setShowDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <Star size={14} className={project.isFavorite ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
                                    {project.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Project info */}
                          <Link
                            href={project.permissions.accounting ? `/project/${project.id}/accounting` : project.permissions.team ? `/project/${project.id}/team` : `/project/${project.id}/config`}
                            onClick={() => handleProjectClick(project.id)}
                          >
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${phaseStyle.dot}`}></div>
                                <span className="text-xs font-medium text-slate-500">
                                  {project.phase}
                                </span>
                              </div>
                              <h3 className="text-sm font-semibold text-slate-900 mb-1 pr-6">
                                {project.name}
                              </h3>
                              {project.role && (
                                <p className="text-xs text-slate-500">
                                  {project.role}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              {project.memberCount !== undefined && (
                                <div className="flex items-center gap-1">
                                  <Users size={12} />
                                  <span>{project.memberCount}</span>
                                </div>
                              )}
                              {project.producerNames && project.producerNames.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Building2 size={12} />
                                  <span className="truncate">{project.producerNames[0]}</span>
                                </div>
                              )}
                            </div>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Todos los proyectos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Folder size={18} className="text-slate-500" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Todos los proyectos
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64 pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                      />
                    </div>

                    {/* Phase filter */}
                    <select
                      value={selectedPhase}
                      onChange={(e) => setSelectedPhase(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm appearance-none cursor-pointer"
                    >
                      <option value="all">Todas las fases</option>
                      <option value="Desarrollo">Desarrollo</option>
                      <option value="Preproducción">Preproducción</option>
                      <option value="Rodaje">Rodaje</option>
                      <option value="Postproducción">Postproducción</option>
                      <option value="Finalizado">Finalizado</option>
                    </select>

                    {/* View toggle */}
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <button
                        onClick={() => setViewMode("grid")}
                        className={`px-2 py-2 transition-colors ${
                          viewMode === "grid"
                            ? "bg-slate-100 text-slate-900"
                            : "bg-white text-slate-400 hover:bg-slate-50"
                        }`}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        onClick={() => setViewMode("list")}
                        className={`px-2 py-2 transition-colors border-l border-slate-200 ${
                          viewMode === "list"
                            ? "bg-slate-100 text-slate-900"
                            : "bg-white text-slate-400 hover:bg-slate-50"
                        }`}
                      >
                        <List size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-slate-500 text-sm">
                      No se encontraron proyectos
                    </p>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {filteredProjects.map((project) => {
                      const phaseStyle = phaseColors[project.phase];

                      return (
                        <div
                          key={project.id}
                          className="group relative bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-slate-300 transition-all"
                        >
                          {/* Star favorite indicator */}
                          {project.isFavorite && (
                            <div className="absolute top-3 left-3">
                              <Star size={14} className="text-amber-500 fill-amber-500" />
                            </div>
                          )}

                          {/* Dropdown menu */}
                          <div className="absolute top-3 right-3 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdown(showDropdown === project.id ? null : project.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-all"
                            >
                              <MoreVertical size={16} className="text-slate-400" />
                            </button>

                            {showDropdown === project.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setShowDropdown(null)}
                                ></div>
                                <div className="absolute right-0 top-8 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-20">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFavorite(project.id, project.isFavorite || false);
                                      setShowDropdown(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <Star size={14} className={project.isFavorite ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
                                    {project.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Project info */}
                          <Link
                            href={project.permissions.accounting ? `/project/${project.id}/accounting` : project.permissions.team ? `/project/${project.id}/team` : `/project/${project.id}/config`}
                            onClick={() => handleProjectClick(project.id)}
                          >
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${phaseStyle.dot}`}></div>
                                <span className="text-xs font-medium text-slate-500">
                                  {project.phase}
                                </span>
                              </div>
                              <h3 className="text-sm font-semibold text-slate-900 mb-1 pr-6">
                                {project.name}
                              </h3>
                              {project.role && (
                                <p className="text-xs text-slate-500">
                                  {project.role}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              {project.memberCount !== undefined && (
                                <div className="flex items-center gap-1">
                                  <Users size={12} />
                                  <span>{project.memberCount}</span>
                                </div>
                              )}
                              {project.producerNames && project.producerNames.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Building2 size={12} />
                                  <span className="truncate">{project.producerNames[0]}</span>
                                </div>
                              )}
                            </div>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // List view
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 w-8"></th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600">Nombre</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600">Fase</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600">Rol</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600">Miembros</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.map((project) => {
                          const phaseStyle = phaseColors[project.phase];

                          return (
                            <tr
                              key={project.id}
                              className="border-b border-slate-100 hover:bg-slate-50 transition-colors group"
                            >
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleToggleFavorite(project.id, project.isFavorite || false)}
                                  className="p-1 hover:bg-slate-100 rounded transition-all"
                                >
                                  <Star
                                    size={14}
                                    className={
                                      project.isFavorite
                                        ? "text-amber-500 fill-amber-500"
                                        : "text-slate-300 group-hover:text-slate-400"
                                    }
                                  />
                                </button>
                              </td>
                              <td className="py-3 px-4">
                                <Link
                                  href={project.permissions.accounting ? `/project/${project.id}/accounting` : project.permissions.team ? `/project/${project.id}/team` : `/project/${project.id}/config`}
                                  onClick={() => handleProjectClick(project.id)}
                                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                                >
                                  <Folder size={16} className="text-slate-400" />
                                  <span className="text-sm font-medium text-slate-900">
                                    {project.name}
                                  </span>
                                </Link>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${phaseStyle.dot}`}></div>
                                  <span className="text-sm text-slate-600">{project.phase}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm text-slate-600">
                                  {project.role || "-"}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1 text-sm text-slate-600">
                                  <Users size={14} />
                                  <span>{project.memberCount || 0}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdown(showDropdown === project.id ? null : project.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-all"
                                >
                                  <MoreVertical size={16} className="text-slate-400" />
                                </button>

                                {showDropdown === project.id && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-10"
                                      onClick={() => setShowDropdown(null)}
                                    ></div>
                                    <div className="absolute right-4 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-20">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleFavorite(project.id, project.isFavorite || false);
                                          setShowDropdown(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                      >
                                        <Star size={14} className={project.isFavorite ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
                                        {project.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                                      </button>
                                    </div>
                                  </>
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}

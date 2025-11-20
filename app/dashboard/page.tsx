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
  ArrowRight,
  LayoutGrid,
  List,
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

const phaseColors: Record<string, { gradient: string; bg: string; border: string; text: string; icon: string }> = {
  Desarrollo: {
    gradient: "from-sky-500 to-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-300",
    text: "text-sky-700",
    icon: "bg-sky-500"
  },
  Preproducción: {
    gradient: "from-amber-500 to-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-700",
    icon: "bg-amber-500"
  },
  Rodaje: {
    gradient: "from-indigo-500 to-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-300",
    text: "text-indigo-700",
    icon: "bg-indigo-500"
  },
  Postproducción: {
    gradient: "from-purple-500 to-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-300",
    text: "text-purple-700",
    icon: "bg-purple-500"
  },
  Finalizado: {
    gradient: "from-emerald-500 to-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-700",
    icon: "bg-emerald-500"
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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
            <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">
              Cargando proyectos...
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto">
          {/* Header with welcome */}
          <header className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-1">
                  Tus proyectos
                </h1>
                <p className="text-sm text-slate-600">
                  Hola, {userName} · {projects.length} {projects.length === 1 ? "proyecto" : "proyectos"}
                </p>
              </div>
            </div>
          </header>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Mail size={18} className="text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Invitaciones pendientes
                </h2>
                <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {invitations.length}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="bg-white border-2 border-blue-200 rounded-xl p-5 hover:shadow-xl transition-all"
                  >
                    <div className="mb-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-2 rounded-xl shadow-lg">
                          <Folder size={18} />
                        </div>
                        <div className="flex-1">
                          <h2 className="text-base font-bold text-slate-900 mb-1">
                            {invitation.projectName}
                          </h2>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <User size={12} />
                            <span>Invitado por {invitation.invitedByName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg p-2">
                          <Briefcase size={14} className="text-slate-500" />
                          <span className="font-semibold text-slate-900">
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
                              <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-semibold border border-slate-200">
                                Config
                              </span>
                            )}
                            {invitation.permissions.accounting && (
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold border border-indigo-200">
                                Accounting
                              </span>
                            )}
                            {invitation.permissions.team && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold border border-amber-200">
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
                        className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2.5 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                      >
                        <Check size={16} />
                        {processingInvite === invitation.id ? "Procesando..." : "Aceptar"}
                      </button>
                      <button
                        onClick={() => handleRejectInvitation(invitation.id)}
                        disabled={processingInvite === invitation.id}
                        className="flex items-center justify-center gap-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg py-2.5 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XIcon size={16} />
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
                <div className="bg-slate-100 w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Folder size={40} className="text-slate-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">
                  No tienes proyectos asignados
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Contacta con tu administrador para obtener acceso a proyectos
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <Clock size={16} />
                  <span>Los proyectos aparecerán aquí cuando seas añadido</span>
                </div>
              </div>
            </div>
          ) : (
            projects.length > 0 && (
              <div>
                {/* Filters and search */}
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Buscar proyectos o productoras..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-medium"
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
                        className="pl-10 pr-10 py-3 bg-white border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-medium appearance-none cursor-pointer"
                      >
                        <option value="all">Todas</option>
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
                        className="pl-10 pr-10 py-3 bg-white border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-medium appearance-none cursor-pointer"
                      >
                        <option value="recent">Recientes</option>
                        <option value="name">Nombre</option>
                        <option value="phase">Fase</option>
                      </select>
                    </div>

                    {/* View toggle */}
                    <div className="flex border-2 border-slate-200 rounded-xl overflow-hidden bg-white">
                      <button
                        onClick={() => setViewMode("grid")}
                        className={`px-3 py-2 transition-colors ${
                          viewMode === "grid"
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        title="Vista en cuadrícula"
                      >
                        <LayoutGrid size={18} />
                      </button>
                      <button
                        onClick={() => setViewMode("list")}
                        className={`px-3 py-2 transition-colors border-l-2 border-slate-200 ${
                          viewMode === "list"
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        title="Vista de lista"
                      >
                        <List size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <p className="text-slate-500 text-sm font-medium mb-3">
                      No se encontraron proyectos
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedPhase("all");
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold underline"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Projects display */}
                    {viewMode === "grid" ? (
                      // Grid View
                      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProjects.map((project) => {
                          const hasConfig = project.permissions.config;
                          const hasAccounting = project.permissions.accounting;
                          const hasTeam = project.permissions.team;
                          const phaseStyle = phaseColors[project.phase];

                          return (
                            <div
                              key={project.id}
                              className="group bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:shadow-2xl hover:border-slate-300 transition-all"
                            >
                              {/* Project header with gradient */}
                              <div className={`bg-gradient-to-r ${phaseStyle.gradient} p-6 relative`}>
                                <div className="absolute top-3 right-3">
                                  <span className="text-xs font-bold text-white/90 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                                    {project.phase}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl">
                                    <Film size={22} className="text-white" />
                                  </div>
                                  <h2 className="text-xl font-bold text-white pr-16">
                                    {project.name}
                                  </h2>
                                </div>

                                {project.memberCount !== undefined && (
                                  <div className="flex items-center gap-2 text-white/90">
                                    <Users size={14} />
                                    <span className="text-sm font-medium">
                                      {project.memberCount} {project.memberCount === 1 ? "miembro" : "miembros"}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Project content */}
                              <div className="p-6">
                                {project.description && (
                                  <p className="text-sm text-slate-600 mb-4 line-clamp-2 leading-relaxed">
                                    {project.description}
                                  </p>
                                )}

                                {/* Producers */}
                                {project.producerNames && project.producerNames.length > 0 && (
                                  <div className="mb-4 space-y-2">
                                    {project.producerNames.map((producerName, index) => (
                                      <div key={index} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                        <Building2 size={14} className="text-amber-600" />
                                        <span className="text-xs text-slate-700 font-semibold">
                                          {producerName}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Role */}
                                <div className="mb-4">
                                  {project.role && (
                                    <div className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                                      <Briefcase size={14} className="text-slate-600" />
                                      <span className="text-sm font-bold text-slate-900">
                                        {project.role}
                                      </span>
                                    </div>
                                  )}
                                  {project.position && project.department && (
                                    <div className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                                      <Briefcase size={14} className="text-slate-600" />
                                      <span className="text-sm font-bold text-slate-900">
                                        {project.position} · {project.department}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Access buttons */}
                                <div className="space-y-2 pt-4 border-t-2 border-slate-100">
                                  {hasConfig && (
                                    <Link href={`/project/${project.id}/config`}>
                                      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer group/button">
                                        <div className="flex items-center gap-3">
                                          <div className="bg-white p-2 rounded-lg">
                                            <Settings size={16} className="text-slate-700" />
                                          </div>
                                          <span className="text-sm font-semibold text-slate-900">
                                            Configuración
                                          </span>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-400 group-hover/button:text-slate-700 transition-colors" />
                                      </div>
                                    </Link>
                                  )}

                                  {hasAccounting && (
                                    <Link href={`/project/${project.id}/accounting`}>
                                      <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 hover:border-indigo-300 transition-all cursor-pointer group/button">
                                        <div className="flex items-center gap-3">
                                          <div className="bg-white p-2 rounded-lg">
                                            <FileText size={16} className="text-indigo-700" />
                                          </div>
                                          <span className="text-sm font-semibold text-slate-900">
                                            Contabilidad
                                          </span>
                                        </div>
                                        <ChevronRight size={16} className="text-indigo-400 group-hover/button:text-indigo-700 transition-colors" />
                                      </div>
                                    </Link>
                                  )}

                                  {hasTeam && (
                                    <Link href={`/project/${project.id}/team`}>
                                      <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 hover:border-amber-300 transition-all cursor-pointer group/button">
                                        <div className="flex items-center gap-3">
                                          <div className="bg-white p-2 rounded-lg">
                                            <Users size={16} className="text-amber-700" />
                                          </div>
                                          <span className="text-sm font-semibold text-slate-900">
                                            Equipo
                                          </span>
                                        </div>
                                        <ChevronRight size={16} className="text-amber-400 group-hover/button:text-amber-700 transition-colors" />
                                      </div>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // List View
                      <div className="space-y-3">
                        {filteredProjects.map((project) => {
                          const hasConfig = project.permissions.config;
                          const hasAccounting = project.permissions.accounting;
                          const hasTeam = project.permissions.team;
                          const phaseStyle = phaseColors[project.phase];

                          return (
                            <div
                              key={project.id}
                              className="bg-white border-2 border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-slate-300 transition-all"
                            >
                              <div className="flex items-center justify-between gap-4">
                                {/* Left: Project info */}
                                <div className="flex items-center gap-4 flex-1">
                                  <div className={`${phaseStyle.icon} p-3 rounded-xl`}>
                                    <Film size={20} className="text-white" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                      <h2 className="text-lg font-bold text-slate-900">
                                        {project.name}
                                      </h2>
                                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r ${phaseStyle.gradient} text-white`}>
                                        {project.phase}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-600">
                                      {project.role && (
                                        <div className="flex items-center gap-1">
                                          <Briefcase size={13} />
                                          <span className="font-medium">{project.role}</span>
                                        </div>
                                      )}
                                      {project.position && project.department && (
                                        <div className="flex items-center gap-1">
                                          <Briefcase size={13} />
                                          <span className="font-medium">{project.position} · {project.department}</span>
                                        </div>
                                      )}
                                      {project.memberCount !== undefined && (
                                        <div className="flex items-center gap-1">
                                          <Users size={13} />
                                          <span>{project.memberCount}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Right: Access buttons */}
                                <div className="flex items-center gap-2">
                                  {hasConfig && (
                                    <Link href={`/project/${project.id}/config`}>
                                      <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 transition-all">
                                        <Settings size={16} />
                                        <span className="hidden sm:inline">Config</span>
                                      </button>
                                    </Link>
                                  )}

                                  {hasAccounting && (
                                    <Link href={`/project/${project.id}/accounting`}>
                                      <button className="flex items-center gap-2 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-700 transition-all">
                                        <FileText size={16} />
                                        <span className="hidden sm:inline">Accounting</span>
                                      </button>
                                    </Link>
                                  )}

                                  {hasTeam && (
                                    <Link href={`/project/${project.id}/team`}>
                                      <button className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 border border-amber-200 rounded-lg text-sm font-semibold text-amber-700 transition-all">
                                        <Users size={16} />
                                        <span className="hidden sm:inline">Team</span>
                                      </button>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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

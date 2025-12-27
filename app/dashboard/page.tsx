"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Folder, Search, Users, Settings, Clock, Mail, Check, X as XIcon, Building2, BarChart3, Archive, ChevronDown, ChevronRight, FolderOpen, Clapperboard } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useUser } from "@/contexts/UserContext";
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc, Timestamp, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const phaseConfig: Record<string, { color: string; bg: string }> = {
  Desarrollo: { color: "text-sky-600", bg: "bg-sky-500" },
  Preproducción: { color: "text-amber-600", bg: "bg-amber-500" },
  Rodaje: { color: "text-rose-600", bg: "bg-rose-500" },
  Postproducción: { color: "text-violet-600", bg: "bg-violet-500" },
  Finalizado: { color: "text-emerald-600", bg: "bg-emerald-500" },
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
  permissions: { config: boolean; accounting: boolean; team: boolean };
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
  permissions: { config?: boolean; accounting: boolean; team: boolean };
  status: string;
  createdAt: Date | Timestamp;
  expiresAt: Date | Timestamp;
}

export default function Dashboard() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  const userId = user?.uid || null;
  const userName = user?.name || "Usuario";
  const userEmail = user?.email || "";

  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/");
      return;
    }
    if (!userLoading && user?.role === "admin") {
      router.push("/admindashboard");
    }
  }, [user, userLoading, router]);

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
                if (producerDoc.exists()) producerNames.push(producerDoc.data().name);
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
              permissions: userProjectData.permissions || { config: false, accounting: false, team: false },
              createdAt: projectData.createdAt || null,
              addedAt: userProjectData.addedAt || null,
              memberCount: membersSnapshot.size,
              archived: projectData.archived || false,
            });
          }
        }

        projectsData.sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0));
        setProjects(projectsData);
        setFilteredProjects(projectsData.filter((p) => !p.archived));

        const invitationsRef = collection(db, "invitations");
        const q = query(invitationsRef, where("invitedEmail", "==", userEmail), where("status", "==", "pending"));
        const invitationsSnapshot = await getDocs(q);
        const invitationsData: Invitation[] = invitationsSnapshot.docs.map((invDoc: QueryDocumentSnapshot<DocumentData>) => {
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
        });
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
    let filtered = [...projects].filter((p) => !p.archived);
    if (searchTerm) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.producerNames?.some((name) => name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (selectedPhase !== "all") {
      filtered = filtered.filter((p) => p.phase === selectedPhase);
    }
    setFilteredProjects(filtered);
  }, [searchTerm, selectedPhase, projects]);

  const archivedProjects = projects.filter((p) => p.archived);
  const activeProjectsCount = projects.filter((p) => !p.archived).length;

  const phases = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];
  const phaseCounts = phases.reduce((acc, phase) => {
    acc[phase] = projects.filter((p) => !p.archived && p.phase === phase).length;
    return acc;
  }, {} as Record<string, number>);

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!userId) return;
    setProcessingInvite(invitation.id);
    try {
      await updateDoc(doc(db, "invitations", invitation.id), { status: "accepted", respondedAt: new Date() });
      await setDoc(doc(db, `projects/${invitation.projectId}/members`, userId), {
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
      });
      await setDoc(doc(db, `userProjects/${userId}/projects/${invitation.projectId}`), {
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
      });
      window.location.reload();
    } catch (error) {
      console.error("Error aceptando invitación:", error);
      alert("Error al aceptar la invitación");
      setProcessingInvite(null);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    if (!confirm("¿Estás seguro de que deseas rechazar esta invitación?")) return;
    setProcessingInvite(invitationId);
    try {
      await updateDoc(doc(db, "invitations", invitationId), { status: "rejected", respondedAt: new Date() });
      setInvitations(invitations.filter((i) => i.id !== invitationId));
      setProcessingInvite(null);
    } catch (error) {
      console.error("Error rechazando invitación:", error);
      alert("Error al rechazar la invitación");
      setProcessingInvite(null);
    }
  };

  if (loading || userLoading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="w-10 h-10 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      <div className="mt-14">
        {/* Hero section */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <p className="text-sm text-slate-500 mb-1">Bienvenido de nuevo</p>
            <h1 className="text-2xl font-semibold text-slate-900">Tus proyectos</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Invitations */}
          {invitations.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Mail size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Invitaciones pendientes</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{invitations.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-50 rounded-lg flex items-center justify-center">
                        <Clapperboard size={18} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">{invitation.projectName}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">por {invitation.invitedByName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                        {invitation.roleType === "project" ? invitation.role : invitation.position}
                      </span>
                      {invitation.department && (
                        <span className="text-xs text-slate-500">{invitation.department}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptInvitation(invitation)}
                        disabled={processingInvite === invitation.id}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg py-2.5 transition-colors disabled:opacity-50"
                      >
                        <Check size={14} />
                        Aceptar
                      </button>
                      <button
                        onClick={() => handleRejectInvitation(invitation.id)}
                        disabled={processingInvite === invitation.id}
                        className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg py-2.5 transition-colors disabled:opacity-50"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {projects.length === 0 && invitations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FolderOpen size={28} className="text-slate-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Sin proyectos todavía</h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Cuando te añadan a un proyecto o recibas una invitación, aparecerá aquí.
              </p>
            </div>
          ) : (
            <>
              {/* Filters */}
              {activeProjectsCount > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  {/* Search */}
                  <div className="relative flex-1 max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>

                  {/* Phase pills */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <button
                      onClick={() => setSelectedPhase("all")}
                      className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        selectedPhase === "all"
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Todos ({activeProjectsCount})
                    </button>
                    {phases.map((phase) => {
                      const count = phaseCounts[phase];
                      if (count === 0) return null;
                      const config = phaseConfig[phase];
                      return (
                        <button
                          key={phase}
                          onClick={() => setSelectedPhase(phase)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                            selectedPhase === phase
                              ? "bg-slate-900 text-white"
                              : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {phase} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Projects grid */}
              {filteredProjects.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <p className="text-sm text-slate-500 mb-3">No hay proyectos con estos filtros</p>
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedPhase("all");
                    }}
                    className="text-sm text-slate-900 font-medium hover:underline"
                  >
                    Limpiar filtros
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProjects.map((project) => {
                    const phase = phaseConfig[project.phase] || phaseConfig["Desarrollo"];
                    const isHovered = hoveredProject === project.id;
                    const hasConfig = project.permissions.config;
                    const hasAccounting = project.permissions.accounting;
                    const hasTeam = project.permissions.team;

                    return (
                      <div
                        key={project.id}
                        className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all overflow-hidden"
                        onMouseEnter={() => setHoveredProject(project.id)}
                        onMouseLeave={() => setHoveredProject(null)}
                      >
                        {/* Header with phase indicator */}
                        <div className="p-4 pb-3">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-2 h-2 rounded-full ${phase.bg}`} />
                                <span className={`text-xs font-medium ${phase.color}`}>{project.phase}</span>
                              </div>
                              <h3 className="text-base font-semibold text-slate-900 truncate">{project.name}</h3>
                            </div>
                            {project.memberCount !== undefined && (
                              <div className="flex items-center gap-1 text-slate-400">
                                <Users size={12} />
                                <span className="text-xs">{project.memberCount}</span>
                              </div>
                            )}
                          </div>

                          {/* Role & Producer */}
                          <div className="space-y-1.5">
                            {(project.role || project.position) && (
                              <p className="text-xs text-slate-600">
                                {project.role || project.position}
                                {project.department && <span className="text-slate-400"> · {project.department}</span>}
                              </p>
                            )}
                            {project.producerNames && project.producerNames.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <Building2 size={11} className="text-slate-400" />
                                <p className="text-xs text-slate-500 truncate">{project.producerNames.join(", ")}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="px-4 pb-4">
                          <div className="flex gap-2 pt-3 border-t border-slate-100">
                            {hasConfig && (
                              <Link href={`/project/${project.id}/config`} className="flex-1">
                                <div className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 text-xs font-medium">
                                  <Settings size={13} />
                                  <span>Config</span>
                                </div>
                              </Link>
                            )}
                            {hasAccounting && (
                              <Link href={`/project/${project.id}/accounting`} className="flex-1">
                                <div className="flex items-center justify-center gap-1.5 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-600 text-xs font-medium">
                                  <BarChart3 size={13} />
                                  <span>Accounting</span>
                                </div>
                              </Link>
                            )}
                            {hasTeam && (
                              <Link href={`/project/${project.id}/team`} className="flex-1">
                                <div className="flex items-center justify-center gap-1.5 py-2 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors text-amber-600 text-xs font-medium">
                                  <Users size={13} />
                                  <span>Team</span>
                                </div>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Archived */}
              {archivedProjects.length > 0 && (
                <div className="mt-10">
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
                  >
                    <Archive size={14} />
                    <span>Archivados ({archivedProjects.length})</span>
                    <ChevronDown size={14} className={`transition-transform ${showArchived ? "rotate-180" : ""}`} />
                  </button>

                  {showArchived && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {archivedProjects.map((project) => {
                        const hasConfig = project.permissions.config;
                        const hasAccounting = project.permissions.accounting;
                        const hasTeam = project.permissions.team;

                        return (
                          <div key={project.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4 opacity-75 hover:opacity-100 transition-opacity">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-slate-500 font-medium">Archivado</span>
                                <h3 className="text-sm font-semibold text-slate-700 truncate mt-0.5">{project.name}</h3>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {hasConfig && (
                                <Link href={`/project/${project.id}/config`} className="flex-1">
                                  <div className="flex items-center justify-center gap-1.5 py-2 bg-white hover:bg-slate-100 rounded-lg transition-colors text-slate-500 text-xs font-medium border border-slate-200">
                                    <Settings size={12} />
                                  </div>
                                </Link>
                              )}
                              {hasAccounting && (
                                <Link href={`/project/${project.id}/accounting`} className="flex-1">
                                  <div className="flex items-center justify-center gap-1.5 py-2 bg-white hover:bg-slate-100 rounded-lg transition-colors text-slate-500 text-xs font-medium border border-slate-200">
                                    <BarChart3 size={12} />
                                  </div>
                                </Link>
                              )}
                              {hasTeam && (
                                <Link href={`/project/${project.id}/team`} className="flex-1">
                                  <div className="flex items-center justify-center gap-1.5 py-2 bg-white hover:bg-slate-100 rounded-lg transition-colors text-slate-500 text-xs font-medium border border-slate-200">
                                    <Users size={12} />
                                  </div>
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

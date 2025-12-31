"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Folder, Search, Users, Settings, Clock, Mail, Check, X as XIcon, Building2, Sparkles, BarChart3, Archive, ChevronDown, FolderOpen, Filter, ArrowUpDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useUser } from "@/contexts/UserContext";
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc, Timestamp, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const phaseColors: Record<string, { bg: string; border: string; text: string }> = {
  Desarrollo: { bg: "rgba(14, 165, 233, 0.1)", border: "rgba(14, 165, 233, 0.3)", text: "#0284c7" },
  Preproducción: { bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", text: "#d97706" },
  Rodaje: { bg: "rgba(99, 102, 241, 0.1)", border: "rgba(99, 102, 241, 0.3)", text: "#4f46e5" },
  Postproducción: { bg: "rgba(168, 85, 247, 0.1)", border: "rgba(168, 85, 247, 0.3)", text: "#9333ea" },
  Finalizado: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#16a34a" },
};

const PHASE_OPTIONS = [
  { value: "all", label: "Todas las fases" },
  { value: "Desarrollo", label: "Desarrollo" },
  { value: "Preproducción", label: "Preproducción" },
  { value: "Rodaje", label: "Rodaje" },
  { value: "Postproducción", label: "Postproducción" },
  { value: "Finalizado", label: "Finalizado" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Recientes" },
  { value: "name", label: "Nombre" },
  { value: "phase", label: "Fase" },
];

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
  const [sortBy, setSortBy] = useState<"recent" | "name" | "phase">("recent");
  const [showArchived, setShowArchived] = useState(false);
  const [showPhaseDropdown, setShowPhaseDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const phaseDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const userId = user?.uid || null;
  const userName = user?.name || "Usuario";
  const userEmail = user?.email || "";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(event.target as Node)) {
        setShowPhaseDropdown(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/");
      return;
    }
    if (!userLoading && user?.role === "admin") router.push("/admindashboard");
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
    switch (sortBy) {
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "phase":
        filtered.sort((a, b) => a.phase.localeCompare(b.phase));
        break;
      default:
        filtered.sort((a, b) => (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0));
    }
    setFilteredProjects(filtered);
  }, [searchTerm, selectedPhase, sortBy, projects]);

  const archivedProjects = projects.filter((p) => p.archived);
  const activeProjectsCount = projects.filter((p) => !p.archived).length;

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

  const getPhaseLabel = () => {
    const opt = PHASE_OPTIONS.find((o) => o.value === selectedPhase);
    return opt?.label || "Todas las fases";
  };

  const getSortLabel = () => {
    const opt = SORT_OPTIONS.find((o) => o.value === sortBy);
    return opt?.label || "Recientes";
  };

  const renderProjectCard = (project: Project) => {
    const hasConfig = project.permissions.config;
    const hasAccounting = project.permissions.accounting;
    const hasTeam = project.permissions.team;
    const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];

    return (
      <div key={project.id} className="group bg-white border rounded-2xl p-5 hover:shadow-lg transition-all" style={{ borderColor: 'rgba(31, 31, 31, 0.1)' }}>
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-semibold truncate flex-1 min-w-0" style={{ color: '#1F1F1F' }}>{project.name}</h2>
          <span 
            className="text-[10px] font-medium px-2 py-0.5 rounded-lg ml-2 flex-shrink-0"
            style={{ backgroundColor: phaseStyle.bg, color: phaseStyle.text }}
          >
            {project.phase}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {project.role && (
            <span className="text-[10px] rounded-lg px-2 py-0.5" style={{ color: 'rgba(31, 31, 31, 0.6)', backgroundColor: 'rgba(31, 31, 31, 0.05)' }}>{project.role}</span>
          )}
          {project.position && (
            <span className="text-[10px] rounded-lg px-2 py-0.5" style={{ color: 'rgba(31, 31, 31, 0.6)', backgroundColor: 'rgba(31, 31, 31, 0.05)' }}>{project.position}</span>
          )}
          {project.memberCount !== undefined && (
            <span className="text-[10px] flex items-center gap-1 ml-auto" style={{ color: 'rgba(31, 31, 31, 0.4)' }}>
              <Users size={10} />
              {project.memberCount}
            </span>
          )}
        </div>

        {project.producerNames && project.producerNames.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 size={11} style={{ color: 'rgba(31, 31, 31, 0.3)' }} />
            <span className="text-[11px] truncate" style={{ color: 'rgba(31, 31, 31, 0.5)' }}>{project.producerNames.join(", ")}</span>
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'rgba(31, 31, 31, 0.06)' }}>
          {hasConfig && (
            <Link href={`/project/${project.id}/config`} className="flex-1">
              <div 
                className="flex items-center justify-center gap-1.5 p-2 rounded-xl transition-all text-xs font-medium border"
                style={{ 
                  backgroundColor: 'rgba(31, 31, 31, 0.03)',
                  borderColor: 'rgba(31, 31, 31, 0.1)',
                  color: 'rgba(31, 31, 31, 0.7)'
                }}
              >
                <Settings size={12} />
                Config
              </div>
            </Link>
          )}
          {hasAccounting && (
            <Link href={`/project/${project.id}/accounting`} className="flex-1">
              <div 
                className="flex items-center justify-center gap-1.5 p-2 rounded-xl transition-all text-xs font-medium border"
                style={{ 
                  backgroundColor: 'rgba(47, 82, 224, 0.08)',
                  borderColor: 'rgba(47, 82, 224, 0.2)',
                  color: '#2F52E0'
                }}
              >
                <BarChart3 size={12} />
                Accounting
              </div>
            </Link>
          )}
          {hasTeam && (
            <Link href={`/project/${project.id}/team`} className="flex-1">
              <div 
                className="flex items-center justify-center gap-1.5 p-2 rounded-xl transition-all text-xs font-medium border"
                style={{ 
                  backgroundColor: 'rgba(137, 211, 34, 0.1)',
                  borderColor: 'rgba(137, 211, 34, 0.25)',
                  color: '#5C8A1A'
                }}
              >
                <Users size={12} />
                Team
              </div>
            </Link>
          )}
        </div>
      </div>
    );
  };

  const renderArchivedCard = (project: Project) => {
    const hasConfig = project.permissions.config;
    const hasAccounting = project.permissions.accounting;
    const hasTeam = project.permissions.team;
    const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];

    return (
      <div key={project.id} className="group border rounded-2xl p-5 hover:shadow-md transition-all" style={{ backgroundColor: 'rgba(31, 31, 31, 0.02)', borderColor: 'rgba(31, 31, 31, 0.08)' }}>
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-semibold truncate flex-1 min-w-0" style={{ color: 'rgba(31, 31, 31, 0.7)' }}>{project.name}</h2>
          <span 
            className="text-[10px] font-medium px-2 py-0.5 rounded-lg ml-2 flex-shrink-0"
            style={{ backgroundColor: 'rgba(31, 31, 31, 0.08)', color: 'rgba(31, 31, 31, 0.5)' }}
          >
            Archivado
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span 
            className="text-[10px] font-medium px-2 py-0.5 rounded-lg"
            style={{ backgroundColor: phaseStyle.bg, color: phaseStyle.text }}
          >
            {project.phase}
          </span>
          {project.role && (
            <span className="text-[10px] rounded-lg px-2 py-0.5" style={{ color: 'rgba(31, 31, 31, 0.5)', backgroundColor: 'rgba(31, 31, 31, 0.05)' }}>{project.role}</span>
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'rgba(31, 31, 31, 0.06)' }}>
          {hasConfig && (
            <Link href={`/project/${project.id}/config`} className="flex-1">
              <div className="flex items-center justify-center gap-1.5 p-2 bg-white border rounded-xl transition-all text-xs font-medium" style={{ borderColor: 'rgba(31, 31, 31, 0.1)', color: 'rgba(31, 31, 31, 0.5)' }}>
                <Settings size={12} />
                Config
              </div>
            </Link>
          )}
          {hasAccounting && (
            <Link href={`/project/${project.id}/accounting`} className="flex-1">
              <div className="flex items-center justify-center gap-1.5 p-2 bg-white border rounded-xl transition-all text-xs font-medium" style={{ borderColor: 'rgba(31, 31, 31, 0.1)', color: 'rgba(31, 31, 31, 0.5)' }}>
                <BarChart3 size={12} />
                Accounting
              </div>
            </Link>
          )}
          {hasTeam && (
            <Link href={`/project/${project.id}/team`} className="flex-1">
              <div className="flex items-center justify-center gap-1.5 p-2 bg-white border rounded-xl transition-all text-xs font-medium" style={{ borderColor: 'rgba(31, 31, 31, 0.1)', color: 'rgba(31, 31, 31, 0.5)' }}>
                <Users size={12} />
                Team
              </div>
            </Link>
          )}
        </div>
      </div>
    );
  };

  if (loading || userLoading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(31, 31, 31, 0.1)', borderTopColor: '#1F1F1F' }} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-6xl mx-auto px-6 md:px-12 pt-12 pb-8">
          <h1 className="text-2xl font-semibold" style={{ color: '#1F1F1F' }}>Proyectos</h1>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 md:px-12 pb-12">
        {/* Invitaciones */}
        {invitations.length > 0 && (
          <div className="mb-8">
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#1F1F1F' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <Mail size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {invitations.length} {invitations.length === 1 ? "invitación pendiente" : "invitaciones pendientes"}
                  </h2>
                  <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Te han invitado a unirte a nuevos proyectos</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="bg-white rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(31, 31, 31, 0.05)' }}>
                        <Folder size={16} style={{ color: '#1F1F1F' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: '#1F1F1F' }}>{invitation.projectName}</h3>
                        <p className="text-xs" style={{ color: 'rgba(31, 31, 31, 0.5)' }}>por {invitation.invitedByName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-medium rounded-lg px-2 py-1" style={{ backgroundColor: 'rgba(31, 31, 31, 0.05)', color: 'rgba(31, 31, 31, 0.7)' }}>
                        {invitation.roleType === "project" ? invitation.role : invitation.position}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => handleRejectInvitation(invitation.id)}
                        disabled={processingInvite === invitation.id}
                        className="text-xs transition-all disabled:opacity-50"
                        style={{ color: 'rgba(31, 31, 31, 0.4)' }}
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleAcceptInvitation(invitation)}
                        disabled={processingInvite === invitation.id}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 hover:opacity-80"
                        style={{ backgroundColor: '#1F1F1F' }}
                      >
                        {processingInvite === invitation.id ? (
                          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                        ) : (
                          <ArrowRight size={16} className="text-white" />
                        )}
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
          <div className="border-2 border-dashed rounded-2xl" style={{ borderColor: 'rgba(31, 31, 31, 0.1)' }}>
            <div className="flex items-center justify-center py-20">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: 'rgba(31, 31, 31, 0.05)' }}>
                  <Sparkles size={28} style={{ color: 'rgba(31, 31, 31, 0.3)' }} />
                </div>
                <h2 className="text-lg font-semibold mb-2" style={{ color: '#1F1F1F' }}>Bienvenido</h2>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(31, 31, 31, 0.5)' }}>
                  Aún no tienes proyectos asignados. Cuando un administrador te añada a un proyecto, aparecerá aquí.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs rounded-xl p-4" style={{ backgroundColor: 'rgba(31, 31, 31, 0.03)', color: 'rgba(31, 31, 31, 0.4)' }}>
                  <Clock size={14} />
                  <span>Las invitaciones aparecerán aquí</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Barra de filtros */}
            {activeProjectsCount > 0 && (
              <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: 'rgba(31, 31, 31, 0.02)', border: '1px solid rgba(31, 31, 31, 0.06)' }}>
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                  {/* Buscador */}
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(31, 31, 31, 0.3)' }} />
                    <input
                      type="text"
                      placeholder="Buscar proyectos"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F1F1F] focus:border-transparent text-sm bg-white"
                      style={{ borderColor: 'rgba(31, 31, 31, 0.1)', color: '#1F1F1F' }}
                    />
                  </div>

                  {/* Filtros */}
                  <div className="flex gap-2">
                    {/* Phase Dropdown */}
                    <div className="relative" ref={phaseDropdownRef}>
                      <button
                        onClick={() => {
                          setShowPhaseDropdown(!showPhaseDropdown);
                          setShowSortDropdown(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors min-w-[140px]"
                        style={{ 
                          borderColor: selectedPhase !== "all" ? '#1F1F1F' : 'rgba(31, 31, 31, 0.1)',
                          backgroundColor: selectedPhase !== "all" ? '#1F1F1F' : 'white',
                          color: selectedPhase !== "all" ? 'white' : 'rgba(31, 31, 31, 0.7)'
                        }}
                      >
                        <Filter size={14} />
                        <span className="flex-1 text-left truncate">{getPhaseLabel()}</span>
                        <ChevronDown size={14} className={`transition-transform ${showPhaseDropdown ? "rotate-180" : ""}`} />
                      </button>
                      {showPhaseDropdown && (
                        <div className="absolute top-full left-0 mt-2 bg-white border rounded-xl shadow-lg z-50 py-1 overflow-hidden min-w-full" style={{ borderColor: 'rgba(31, 31, 31, 0.1)' }}>
                          {PHASE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setSelectedPhase(option.value);
                                setShowPhaseDropdown(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm transition-colors whitespace-nowrap"
                              style={{ 
                                backgroundColor: selectedPhase === option.value ? 'rgba(31, 31, 31, 0.05)' : 'transparent',
                                color: selectedPhase === option.value ? '#1F1F1F' : 'rgba(31, 31, 31, 0.7)',
                                fontWeight: selectedPhase === option.value ? 500 : 400
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative" ref={sortDropdownRef}>
                      <button
                        onClick={() => {
                          setShowSortDropdown(!showSortDropdown);
                          setShowPhaseDropdown(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium bg-white transition-colors"
                        style={{ borderColor: 'rgba(31, 31, 31, 0.1)', color: 'rgba(31, 31, 31, 0.7)' }}
                      >
                        <ArrowUpDown size={14} />
                        <span>{getSortLabel()}</span>
                        <ChevronDown size={14} className={`transition-transform ${showSortDropdown ? "rotate-180" : ""}`} />
                      </button>
                      {showSortDropdown && (
                        <div className="absolute top-full right-0 mt-2 bg-white border rounded-xl shadow-lg z-50 py-1 overflow-hidden min-w-full" style={{ borderColor: 'rgba(31, 31, 31, 0.1)' }}>
                          {SORT_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setSortBy(option.value as "recent" | "name" | "phase");
                                setShowSortDropdown(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm transition-colors whitespace-nowrap"
                              style={{ 
                                backgroundColor: sortBy === option.value ? 'rgba(31, 31, 31, 0.05)' : 'transparent',
                                color: sortBy === option.value ? '#1F1F1F' : 'rgba(31, 31, 31, 0.7)',
                                fontWeight: sortBy === option.value ? 500 : 400
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Limpiar filtros */}
                    {(searchTerm || selectedPhase !== "all") && (
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setSelectedPhase("all");
                        }}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                        style={{ color: 'rgba(31, 31, 31, 0.5)' }}
                      >
                        <XIcon size={14} />
                        Limpiar
                      </button>
                    )}

                    {/* Archivados */}
                    {archivedProjects.length > 0 && (
                      <button
                        onClick={() => setShowArchived(!showArchived)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border"
                        style={{ 
                          backgroundColor: showArchived ? '#1F1F1F' : 'white',
                          borderColor: showArchived ? '#1F1F1F' : 'rgba(31, 31, 31, 0.1)',
                          color: showArchived ? 'white' : 'rgba(31, 31, 31, 0.6)'
                        }}
                      >
                        <Archive size={14} />
                        <span>{archivedProjects.length}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Proyectos activos */}
            {activeProjectsCount > 0 && (
              <>
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-16 border-2 border-dashed rounded-2xl" style={{ borderColor: 'rgba(31, 31, 31, 0.1)' }}>
                    <FolderOpen size={28} style={{ color: 'rgba(31, 31, 31, 0.2)' }} className="mx-auto mb-3" />
                    <p className="text-sm font-medium mb-2" style={{ color: 'rgba(31, 31, 31, 0.5)' }}>No se encontraron proyectos</p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedPhase("all");
                      }}
                      className="text-sm font-medium underline"
                      style={{ color: '#1F1F1F' }}
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProjects.map((project) => renderProjectCard(project))}
                  </div>
                )}
              </>
            )}

            {/* Archivados */}
            {showArchived && archivedProjects.length > 0 && (
              <div className="mt-10 pt-10 border-t" style={{ borderColor: 'rgba(31, 31, 31, 0.08)' }}>
                <div className="flex items-center gap-2 mb-5">
                  <Archive size={14} style={{ color: 'rgba(31, 31, 31, 0.4)' }} />
                  <span className="text-sm font-medium" style={{ color: 'rgba(31, 31, 31, 0.6)' }}>Archivados</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(31, 31, 31, 0.05)', color: 'rgba(31, 31, 31, 0.5)' }}>{archivedProjects.length}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {archivedProjects.map((project) => renderArchivedCard(project))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

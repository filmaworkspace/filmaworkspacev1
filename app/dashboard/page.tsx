"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Folder, Search, Users, Settings, Clock, Mail, Check, X as XIcon, Building2, Sparkles, ArrowRight, LayoutGrid, List, BarChart3, Archive, ChevronDown, FolderOpen, Bell, UserPlus, Trash2, Clapperboard, AlertCircle, FileText, Receipt, TrendingUp, Star, StarOff, ChevronRight, Plus, Upload, CreditCard, AlertTriangle, Zap } from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { useUser } from "@/contexts/UserContext";
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc, Timestamp, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const phaseColors: Record<string, { gradient: string; bg: string; border: string; text: string; dot: string }> = {
  Desarrollo: { gradient: "from-sky-400 to-sky-600", bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", dot: "bg-sky-500" },
  Preproducción: { gradient: "from-amber-400 to-amber-600", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  Rodaje: { gradient: "from-indigo-400 to-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500" },
  Postproducción: { gradient: "from-purple-400 to-purple-600", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  Finalizado: { gradient: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
};

interface ProjectAlerts {
  pendingApprovals: number;
  overdueInvoices: number;
  expiringCertificates: number;
  budgetAtRisk: number;
}

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
  alerts?: ProjectAlerts;
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
  permissions: { config?: boolean; accounting: boolean; team: boolean };
  status: string;
  createdAt: Date | Timestamp;
  expiresAt: Date | Timestamp;
}

interface Notification {
  id: string;
  type: "approval" | "overdue" | "phase_change" | "team_invite";
  title: string;
  message: string;
  projectId?: string;
  projectName?: string;
  timestamp: Date;
  read: boolean;
}

interface GlobalStats {
  activeProjects: number;
  totalPendingApprovals: number;
  totalOverdueInvoices: number;
  totalExpiringCerts: number;
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showArchived, setShowArchived] = useState(false);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ activeProjects: 0, totalPendingApprovals: 0, totalOverdueInvoices: 0, totalExpiringCerts: 0 });
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);

  const userId = user?.uid || null;
  const userName = user?.name || "Usuario";
  const userEmail = user?.email || "";
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = (id: string) => setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllAsRead = () => setNotifications(notifications.map(n => ({ ...n, read: true })));
  const deleteNotification = (id: string) => setNotifications(notifications.filter(n => n.id !== id));

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return "Ahora";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  useEffect(() => {
    if (!userLoading && !user) { router.push("/"); return; }
    if (!userLoading && user?.role === "admin") router.push("/admindashboard");
  }, [user, userLoading, router]);

  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      try {
        const userProjectsRef = collection(db, `userProjects/${userId}/projects`);
        const userProjectsSnapshot = await getDocs(userProjectsRef);
        const projectsData: Project[] = [];
        const newNotifications: Notification[] = [];
        let totalApprovals = 0, totalOverdue = 0, totalExpiring = 0;

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

            // Cargar alertas del proyecto
            let pendingApprovals = 0, overdueInvoices = 0, expiringCertificates = 0, budgetAtRisk = 0;

            if (userProjectData.permissions?.accounting) {
              // Contar aprobaciones pendientes
              const posRef = collection(db, `projects/${projectId}/pos`);
              const posQuery = query(posRef, where("status", "==", "pending"));
              const posSnapshot = await getDocs(posQuery);
              for (const poDoc of posSnapshot.docs) {
                const poData = poDoc.data();
                if (poData.approvalSteps && poData.currentApprovalStep !== undefined) {
                  const currentStep = poData.approvalSteps[poData.currentApprovalStep];
                  if (currentStep?.approvers?.includes(userId)) pendingApprovals++;
                }
              }

              const invoicesRef = collection(db, `projects/${projectId}/invoices`);
              const invoicesApprovalQuery = query(invoicesRef, where("status", "==", "pending_approval"));
              const invoicesApprovalSnapshot = await getDocs(invoicesApprovalQuery);
              for (const invDoc of invoicesApprovalSnapshot.docs) {
                const invData = invDoc.data();
                if (invData.approvalSteps && invData.currentApprovalStep !== undefined) {
                  const currentStep = invData.approvalSteps[invData.currentApprovalStep];
                  if (currentStep?.approvers?.includes(userId)) pendingApprovals++;
                }
              }

              // Contar facturas vencidas
              const allInvoicesSnapshot = await getDocs(invoicesRef);
              const now = new Date();
              allInvoicesSnapshot.docs.forEach(invDoc => {
                const invData = invDoc.data();
                if (invData.status === "pending" && invData.dueDate) {
                  const dueDate = invData.dueDate.toDate ? invData.dueDate.toDate() : new Date(invData.dueDate);
                  if (dueDate < now) overdueInvoices++;
                }
              });

              // Contar certificados por caducar
              const suppliersSnapshot = await getDocs(collection(db, `projects/${projectId}/suppliers`));
              const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              suppliersSnapshot.docs.forEach(supDoc => {
                const supData = supDoc.data();
                const certs = supData.certificates || {};
                [certs.bankOwnership, certs.contractorsCertificate].forEach(cert => {
                  if (cert?.uploaded && cert?.expiryDate) {
                    const expiry = cert.expiryDate.toDate ? cert.expiryDate.toDate() : new Date(cert.expiryDate);
                    if (expiry < thirtyDaysFromNow) expiringCertificates++;
                  }
                });
              });

              totalApprovals += pendingApprovals;
              totalOverdue += overdueInvoices;
              totalExpiring += expiringCertificates;

              // Generar notificaciones
              if (pendingApprovals > 0) {
                newNotifications.push({
                  id: `approval-${projectId}`,
                  type: "approval",
                  title: `${pendingApprovals} aprobación${pendingApprovals > 1 ? "es" : ""} pendiente${pendingApprovals > 1 ? "s" : ""}`,
                  message: projectData.name,
                  projectId,
                  projectName: projectData.name,
                  timestamp: new Date(),
                  read: false,
                });
              }
              if (overdueInvoices > 0) {
                newNotifications.push({
                  id: `overdue-${projectId}`,
                  type: "overdue",
                  title: `${overdueInvoices} factura${overdueInvoices > 1 ? "s" : ""} vencida${overdueInvoices > 1 ? "s" : ""}`,
                  message: projectData.name,
                  projectId,
                  projectName: projectData.name,
                  timestamp: new Date(),
                  read: false,
                });
              }
            }

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
              alerts: { pendingApprovals, overdueInvoices, expiringCertificates, budgetAtRisk },
              isFavorite: userProjectData.isFavorite || false,
              lastAccessed: userProjectData.lastAccessed || null,
            });
          }
        }

        projectsData.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          const dateA = a.addedAt?.toMillis() || 0;
          const dateB = b.addedAt?.toMillis() || 0;
          return dateB - dateA;
        });

        setProjects(projectsData);
        setFilteredProjects(projectsData.filter(p => !p.archived));
        setGlobalStats({
          activeProjects: projectsData.filter(p => !p.archived).length,
          totalPendingApprovals: totalApprovals,
          totalOverdueInvoices: totalOverdue,
          totalExpiringCerts: totalExpiring,
        });
        setNotifications(newNotifications);

        // Cargar invitaciones
        const invitationsRef = collection(db, "invitations");
        const q = query(invitationsRef, where("invitedEmail", "==", userEmail), where("status", "==", "pending"));
        const invitationsSnapshot = await getDocs(q);
        const invitationsData: Invitation[] = invitationsSnapshot.docs.map((invDoc: QueryDocumentSnapshot<DocumentData>) => {
          const data = invDoc.data();
          return { id: invDoc.id, projectId: data.projectId, projectName: data.projectName, invitedBy: data.invitedBy, invitedByName: data.invitedByName, roleType: data.roleType, role: data.role, department: data.department, position: data.position, permissions: data.permissions, status: data.status, createdAt: data.createdAt, expiresAt: data.expiresAt };
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
    let filtered = [...projects].filter(p => !p.archived);
    if (searchTerm) filtered = filtered.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.producerNames?.some(name => name.toLowerCase().includes(searchTerm.toLowerCase())));
    if (selectedPhase !== "all") filtered = filtered.filter((p) => p.phase === selectedPhase);
    switch (sortBy) {
      case "name": filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "phase": filtered.sort((a, b) => a.phase.localeCompare(b.phase)); break;
      case "recent":
      default:
        filtered.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0);
        });
    }
    setFilteredProjects(filtered);
  }, [searchTerm, selectedPhase, sortBy, projects]);

  const toggleFavorite = async (projectId: string) => {
    if (!userId) return;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const newFavorite = !project.isFavorite;
    try {
      await updateDoc(doc(db, `userProjects/${userId}/projects`, projectId), { isFavorite: newFavorite });
      setProjects(projects.map(p => p.id === projectId ? { ...p, isFavorite: newFavorite } : p));
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const archivedProjects = projects.filter(p => p.archived);
  const activeProjectsCount = projects.filter(p => !p.archived).length;
  const favoriteProjects = filteredProjects.filter(p => p.isFavorite);
  const recentProjects = filteredProjects.filter(p => !p.isFavorite).slice(0, 6);

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!userId) return;
    setProcessingInvite(invitation.id);
    try {
      await updateDoc(doc(db, "invitations", invitation.id), { status: "accepted", respondedAt: new Date() });
      await setDoc(doc(db, `projects/${invitation.projectId}/members`, userId), { userId, name: userName, email: userEmail, role: invitation.role || null, department: invitation.department || null, position: invitation.position || null, permissions: { config: invitation.permissions.config || false, accounting: invitation.permissions.accounting, team: invitation.permissions.team }, addedAt: new Date() });
      await setDoc(doc(db, `userProjects/${userId}/projects/${invitation.projectId}`), { projectId: invitation.projectId, role: invitation.role || null, department: invitation.department || null, position: invitation.position || null, permissions: { config: invitation.permissions.config || false, accounting: invitation.permissions.accounting, team: invitation.permissions.team }, addedAt: new Date() });
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "approval": return <FileText size={14} className="text-amber-600" />;
      case "overdue": return <AlertCircle size={14} className="text-red-600" />;
      case "phase_change": return <Clapperboard size={14} className="text-indigo-600" />;
      case "team_invite": return <UserPlus size={14} className="text-blue-600" />;
      default: return <Bell size={14} className="text-slate-600" />;
    }
  };

  const getNotificationBg = (type: string) => {
    switch (type) {
      case "approval": return "bg-amber-100";
      case "overdue": return "bg-red-100";
      case "phase_change": return "bg-indigo-100";
      case "team_invite": return "bg-blue-100";
      default: return "bg-slate-100";
    }
  };

  const renderProjectCard = (project: Project, isArchived: boolean = false) => {
    const hasConfig = project.permissions.config;
    const hasAccounting = project.permissions.accounting;
    const hasTeam = project.permissions.team;
    const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];
    const totalAlerts = (project.alerts?.pendingApprovals || 0) + (project.alerts?.overdueInvoices || 0);

    return (
      <div key={project.id} className={`group bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 transition-all hover:shadow-lg ${isArchived ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isArchived ? "bg-slate-400" : phaseStyle.dot}`}></div>
            <h2 className="text-sm font-semibold text-slate-900 truncate">{project.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {totalAlerts > 0 && !isArchived && (
              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                <AlertCircle size={10} />{totalAlerts}
              </span>
            )}
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(project.id); }} className={`p-1 rounded-lg transition-colors ${project.isFavorite ? "text-amber-500" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-500"}`}>
              {project.isFavorite ? <Star size={16} fill="currentColor" /> : <StarOff size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${phaseStyle.bg} ${phaseStyle.text}`}>{project.phase}</span>
          {project.role && <span className="text-xs text-slate-600 bg-slate-100 rounded-lg px-2 py-0.5">{project.role}</span>}
          {project.position && <span className="text-xs text-slate-600 bg-slate-100 rounded-lg px-2 py-0.5">{project.position}</span>}
        </div>

        {project.producerNames && project.producerNames.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 size={12} className="text-slate-400" />
            <span className="text-xs text-slate-500 truncate">{project.producerNames.join(", ")}</span>
          </div>
        )}

        {/* Alertas del proyecto */}
        {hasAccounting && !isArchived && (project.alerts?.pendingApprovals || project.alerts?.overdueInvoices || project.alerts?.expiringCertificates) ? (
          <div className="flex flex-wrap gap-2 mb-3 p-2 bg-slate-50 rounded-lg">
            {project.alerts.pendingApprovals > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                <Clock size={10} />{project.alerts.pendingApprovals} aprobación{project.alerts.pendingApprovals > 1 ? "es" : ""}
              </span>
            )}
            {project.alerts.overdueInvoices > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                <AlertTriangle size={10} />{project.alerts.overdueInvoices} vencida{project.alerts.overdueInvoices > 1 ? "s" : ""}
              </span>
            )}
            {project.alerts.expiringCertificates > 0 && (
              <span className="flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded">
                <FileText size={10} />{project.alerts.expiringCertificates} cert. por caducar
              </span>
            )}
          </div>
        ) : null}

        <div className="flex gap-2 pt-3 border-t border-slate-100">
          {hasConfig && (
            <Link href={`/project/${project.id}/config`} className="flex-1">
              <div className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all text-slate-600 text-xs font-medium">
                <Settings size={12} />Config
              </div>
            </Link>
          )}
          {hasAccounting && (
            <Link href={`/project/${project.id}/accounting`} className="flex-1">
              <div className="flex items-center justify-center gap-1.5 p-2 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all text-indigo-700 text-xs font-medium">
                <BarChart3 size={12} />Accounting
              </div>
            </Link>
          )}
          {hasTeam && (
            <Link href={`/project/${project.id}/team`} className="flex-1">
              <div className="flex items-center justify-center gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all text-amber-700 text-xs font-medium">
                <Users size={12} />Team
              </div>
            </Link>
          )}
        </div>
      </div>
    );
  };

  if (loading || userLoading) {
    return (<div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem] bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Panel de proyectos</h1>
              <p className="text-sm text-slate-500 mt-0.5">Bienvenido, {userName}</p>
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2.5 rounded-xl border transition-all ${showNotifications ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                <Bell size={20} />
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white">{unreadCount}</span>}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <p className="font-semibold text-slate-900 text-sm">Notificaciones</p>
                    {unreadCount > 0 && <button onClick={markAllAsRead} className="text-xs text-slate-500 hover:text-slate-700">Marcar como leídas</button>}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell size={28} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">Todo al día</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {notifications.map((notification) => (
                          <Link key={notification.id} href={notification.projectId ? `/project/${notification.projectId}/accounting/approvals` : "#"}>
                            <div className={`px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer group flex items-start gap-3 ${!notification.read ? "bg-blue-50/30" : ""}`} onClick={() => markAsRead(notification.id)}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotificationBg(notification.type)}`}>
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${!notification.read ? "font-semibold text-slate-900" : "text-slate-700"}`}>{notification.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{notification.message}</p>
                              </div>
                              <ChevronRight size={14} className="text-slate-300 mt-1" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          {globalStats.activeProjects > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Folder size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{globalStats.activeProjects}</p>
                    <p className="text-xs text-slate-500">Proyectos activos</p>
                  </div>
                </div>
              </div>
              <div className={`rounded-xl p-4 border ${globalStats.totalPendingApprovals > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${globalStats.totalPendingApprovals > 0 ? "bg-amber-100" : "bg-slate-100"}`}>
                    <Clock size={18} className={globalStats.totalPendingApprovals > 0 ? "text-amber-600" : "text-slate-400"} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${globalStats.totalPendingApprovals > 0 ? "text-amber-700" : "text-slate-900"}`}>{globalStats.totalPendingApprovals}</p>
                    <p className="text-xs text-slate-500">Aprobaciones pend.</p>
                  </div>
                </div>
              </div>
              <div className={`rounded-xl p-4 border ${globalStats.totalOverdueInvoices > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${globalStats.totalOverdueInvoices > 0 ? "bg-red-100" : "bg-slate-100"}`}>
                    <AlertCircle size={18} className={globalStats.totalOverdueInvoices > 0 ? "text-red-600" : "text-slate-400"} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${globalStats.totalOverdueInvoices > 0 ? "text-red-700" : "text-slate-900"}`}>{globalStats.totalOverdueInvoices}</p>
                    <p className="text-xs text-slate-500">Facturas vencidas</p>
                  </div>
                </div>
              </div>
              <div className={`rounded-xl p-4 border ${globalStats.totalExpiringCerts > 0 ? "bg-purple-50 border-purple-200" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${globalStats.totalExpiringCerts > 0 ? "bg-purple-100" : "bg-slate-100"}`}>
                    <FileText size={18} className={globalStats.totalExpiringCerts > 0 ? "text-purple-600" : "text-slate-400"} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${globalStats.totalExpiringCerts > 0 ? "text-purple-700" : "text-slate-900"}`}>{globalStats.totalExpiringCerts}</p>
                    <p className="text-xs text-slate-500">Cert. por caducar</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-7xl mx-auto py-6">
          {/* Invitaciones pendientes */}
          {invitations.length > 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                    <Mail size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{invitations.length} invitación{invitations.length > 1 ? "es" : ""} pendiente{invitations.length > 1 ? "s" : ""}</h2>
                    <p className="text-sm text-white/70">Te han invitado a nuevos proyectos</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="bg-white rounded-xl p-4 shadow-sm">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><Folder size={18} className="text-slate-600" /></div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 truncate">{invitation.projectName}</h3>
                          <p className="text-xs text-slate-500">Invitado por {invitation.invitedByName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-slate-700 bg-slate-100 rounded-lg px-2 py-1">{invitation.roleType === "project" ? invitation.role : invitation.position}</span>
                        {invitation.permissions.accounting && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg">Accounting</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAcceptInvitation(invitation)} disabled={processingInvite === invitation.id} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg py-2 text-sm transition-all disabled:opacity-50"><Check size={14} />{processingInvite === invitation.id ? "..." : "Aceptar"}</button>
                        <button onClick={() => handleRejectInvitation(invitation.id)} disabled={processingInvite === invitation.id} className="flex items-center justify-center px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg py-2 transition-all disabled:opacity-50"><XIcon size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {projects.length === 0 && invitations.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl">
              <div className="flex items-center justify-center py-20">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6"><Sparkles size={32} className="text-slate-400" /></div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">Bienvenido a tu espacio de trabajo</h2>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6">Aún no tienes proyectos asignados. Cuando un administrador te añada a un proyecto, aparecerá aquí.</p>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-4 border border-slate-200"><Clock size={14} /><span>Las invitaciones a proyectos también aparecerán aquí</span></div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Favoritos */}
              {favoriteProjects.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Star size={16} className="text-amber-500" fill="currentColor" />
                    <h2 className="text-sm font-semibold text-slate-900">Favoritos</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {favoriteProjects.map((project) => renderProjectCard(project))}
                  </div>
                </div>
              )}

              {/* Todos los proyectos */}
              {activeProjectsCount > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                  <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
                      <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Buscar proyectos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm">
                          <option value="all">Todas las fases</option>
                          <option value="Desarrollo">Desarrollo</option>
                          <option value="Preproducción">Preproducción</option>
                          <option value="Rodaje">Rodaje</option>
                          <option value="Postproducción">Postproducción</option>
                          <option value="Finalizado">Finalizado</option>
                        </select>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm">
                          <option value="recent">Recientes</option>
                          <option value="name">Nombre</option>
                          <option value="phase">Fase</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                      <button onClick={() => setViewMode("grid")} className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><LayoutGrid size={16} /></button>
                      <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><List size={16} /></button>
                    </div>
                  </div>

                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-16">
                      <FolderOpen size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm font-medium mb-2">No se encontraron proyectos</p>
                      <button onClick={() => { setSearchTerm(""); setSelectedPhase("all"); }} className="text-sm text-slate-700 hover:text-slate-900 font-medium underline">Limpiar filtros</button>
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="text-xs text-slate-500 mb-4">{filteredProjects.length} de {activeProjectsCount} proyectos</p>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProjects.map((project) => renderProjectCard(project))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Archivados */}
              {archivedProjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <button onClick={() => setShowArchived(!showArchived)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><Archive size={18} className="text-slate-500" /></div>
                      <div className="text-left">
                        <h3 className="font-semibold text-slate-900">Proyectos archivados</h3>
                        <p className="text-sm text-slate-500">{archivedProjects.length} proyecto{archivedProjects.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <ChevronDown size={20} className={`text-slate-400 transition-transform ${showArchived ? "rotate-180" : ""}`} />
                  </button>
                  {showArchived && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      <div className="pt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {archivedProjects.map((project) => renderProjectCard(project, true))}
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

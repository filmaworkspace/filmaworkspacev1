"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Folder, Search, Users, Settings, Clock, Mail, Check, X as XIcon, Building2, Sparkles, BarChart3, Archive, ChevronDown, FolderOpen, Bell, AlertCircle, FileText, Star, ChevronRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { useUser } from "@/contexts/UserContext";
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc, Timestamp, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const phaseColors: Record<string, { bg: string; text: string; dot: string }> = {
  Desarrollo: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  Preproducción: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  Rodaje: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  Postproducción: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  Finalizado: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

interface ProjectAlerts { pendingApprovals: number; overdueInvoices: number; expiringCertificates: number; }

interface Project {
  id: string; name: string; phase: string; description?: string; producerNames?: string[];
  role: string; department?: string; position?: string;
  permissions: { config: boolean; accounting: boolean; team: boolean };
  addedAt: Timestamp | null; memberCount?: number; archived?: boolean;
  alerts?: ProjectAlerts; isFavorite?: boolean;
}

interface Invitation {
  id: string; projectId: string; projectName: string; invitedByName: string;
  roleType: "project" | "department"; role?: string; department?: string; position?: string;
  permissions: { config?: boolean; accounting: boolean; team: boolean };
  status: string;
}

interface Notification {
  id: string; type: "approval" | "overdue" | "certificate";
  title: string; message: string; projectId?: string;
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);

  const userId = user?.uid || null;
  const userName = user?.name || "Usuario";
  const userEmail = user?.email || "";
  const unreadCount = notifications.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

        for (const userProjectDoc of userProjectsSnapshot.docs) {
          const userProjectData = userProjectDoc.data();
          const projectId = userProjectDoc.id;
          const projectSnapshot = await getDoc(doc(db, "projects", projectId));

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
            let pendingApprovals = 0, overdueInvoices = 0, expiringCertificates = 0;

            if (userProjectData.permissions?.accounting) {
              // Aprobaciones pendientes
              const posSnapshot = await getDocs(query(collection(db, `projects/${projectId}/pos`), where("status", "==", "pending")));
              for (const poDoc of posSnapshot.docs) {
                const poData = poDoc.data();
                if (poData.approvalSteps?.[poData.currentApprovalStep]?.approvers?.includes(userId)) pendingApprovals++;
              }
              const invoicesApprovalSnapshot = await getDocs(query(collection(db, `projects/${projectId}/invoices`), where("status", "==", "pending_approval")));
              for (const invDoc of invoicesApprovalSnapshot.docs) {
                const invData = invDoc.data();
                if (invData.approvalSteps?.[invData.currentApprovalStep]?.approvers?.includes(userId)) pendingApprovals++;
              }

              // Facturas vencidas
              const now = new Date();
              const allInvoicesSnapshot = await getDocs(collection(db, `projects/${projectId}/invoices`));
              allInvoicesSnapshot.docs.forEach(invDoc => {
                const invData = invDoc.data();
                if (invData.status === "pending" && invData.dueDate) {
                  const dueDate = invData.dueDate.toDate ? invData.dueDate.toDate() : new Date(invData.dueDate);
                  if (dueDate < now) overdueInvoices++;
                }
              });

              // Certificados por caducar
              const suppliersSnapshot = await getDocs(collection(db, `projects/${projectId}/suppliers`));
              const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              suppliersSnapshot.docs.forEach(supDoc => {
                const certs = supDoc.data().certificates || {};
                [certs.bankOwnership, certs.contractorsCertificate].forEach(cert => {
                  if (cert?.uploaded && cert?.expiryDate) {
                    const expiry = cert.expiryDate.toDate ? cert.expiryDate.toDate() : new Date(cert.expiryDate);
                    if (expiry < thirtyDaysFromNow) expiringCertificates++;
                  }
                });
              });

              if (pendingApprovals > 0) newNotifications.push({ id: `approval-${projectId}`, type: "approval", title: `${pendingApprovals} aprobación${pendingApprovals > 1 ? "es" : ""} pendiente${pendingApprovals > 1 ? "s" : ""}`, message: projectData.name, projectId });
              if (overdueInvoices > 0) newNotifications.push({ id: `overdue-${projectId}`, type: "overdue", title: `${overdueInvoices} factura${overdueInvoices > 1 ? "s" : ""} vencida${overdueInvoices > 1 ? "s" : ""}`, message: projectData.name, projectId });
              if (expiringCertificates > 0) newNotifications.push({ id: `cert-${projectId}`, type: "certificate", title: `${expiringCertificates} certificado${expiringCertificates > 1 ? "s" : ""} por caducar`, message: projectData.name, projectId });
            }

            projectsData.push({
              id: projectSnapshot.id, name: projectData.name, phase: projectData.phase,
              description: projectData.description || "", producerNames: producerNames.length > 0 ? producerNames : undefined,
              role: userProjectData.role, department: userProjectData.department, position: userProjectData.position,
              permissions: userProjectData.permissions || { config: false, accounting: false, team: false },
              addedAt: userProjectData.addedAt || null, memberCount: membersSnapshot.size,
              archived: projectData.archived || false,
              alerts: { pendingApprovals, overdueInvoices, expiringCertificates },
              isFavorite: userProjectData.isFavorite || false,
            });
          }
        }

        projectsData.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0);
        });

        setProjects(projectsData);
        setFilteredProjects(projectsData.filter(p => !p.archived));
        setNotifications(newNotifications);

        const invitationsSnapshot = await getDocs(query(collection(db, "invitations"), where("invitedEmail", "==", userEmail), where("status", "==", "pending")));
        setInvitations(invitationsSnapshot.docs.map((invDoc: QueryDocumentSnapshot<DocumentData>) => {
          const data = invDoc.data();
          return { id: invDoc.id, projectId: data.projectId, projectName: data.projectName, invitedByName: data.invitedByName, roleType: data.roleType, role: data.role, department: data.department, position: data.position, permissions: data.permissions, status: data.status };
        }));
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
    if (searchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.producerNames?.some(name => name.toLowerCase().includes(searchTerm.toLowerCase())));
    if (selectedPhase !== "all") filtered = filtered.filter(p => p.phase === selectedPhase);
    filtered.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (b.addedAt?.toMillis() || 0) - (a.addedAt?.toMillis() || 0);
    });
    setFilteredProjects(filtered);
  }, [searchTerm, selectedPhase, projects]);

  const toggleFavorite = async (projectId: string) => {
    if (!userId) return;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    try {
      await updateDoc(doc(db, `userProjects/${userId}/projects`, projectId), { isFavorite: !project.isFavorite });
      setProjects(projects.map(p => p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p));
    } catch (error) { console.error("Error toggling favorite:", error); }
  };

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!userId) return;
    setProcessingInvite(invitation.id);
    try {
      await updateDoc(doc(db, "invitations", invitation.id), { status: "accepted", respondedAt: new Date() });
      await setDoc(doc(db, `projects/${invitation.projectId}/members`, userId), { userId, name: userName, email: userEmail, role: invitation.role || null, department: invitation.department || null, position: invitation.position || null, permissions: { config: invitation.permissions.config || false, accounting: invitation.permissions.accounting, team: invitation.permissions.team }, addedAt: new Date() });
      await setDoc(doc(db, `userProjects/${userId}/projects/${invitation.projectId}`), { projectId: invitation.projectId, role: invitation.role || null, department: invitation.department || null, position: invitation.position || null, permissions: { config: invitation.permissions.config || false, accounting: invitation.permissions.accounting, team: invitation.permissions.team }, addedAt: new Date() });
      window.location.reload();
    } catch (error) { console.error("Error aceptando invitación:", error); setProcessingInvite(null); }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    if (!confirm("¿Rechazar esta invitación?")) return;
    setProcessingInvite(invitationId);
    try {
      await updateDoc(doc(db, "invitations", invitationId), { status: "rejected", respondedAt: new Date() });
      setInvitations(invitations.filter(i => i.id !== invitationId));
    } catch (error) { console.error("Error rechazando invitación:", error); }
    setProcessingInvite(null);
  };

  const archivedProjects = projects.filter(p => p.archived);
  const activeProjectsCount = projects.filter(p => !p.archived).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "approval": return <Clock size={14} className="text-amber-600" />;
      case "overdue": return <AlertCircle size={14} className="text-red-600" />;
      case "certificate": return <FileText size={14} className="text-purple-600" />;
      default: return <Bell size={14} className="text-slate-600" />;
    }
  };

  const getNotificationBg = (type: string) => {
    switch (type) {
      case "approval": return "bg-amber-100";
      case "overdue": return "bg-red-100";
      case "certificate": return "bg-purple-100";
      default: return "bg-slate-100";
    }
  };

  if (loading || userLoading) {
    return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              <Folder size={20} />
              <span className="text-lg font-semibold">Panel de proyectos</span>
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2.5 rounded-xl border transition-all ${showNotifications ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                <Bell size={18} />
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white">{unreadCount}</span>}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="font-semibold text-slate-900 text-sm">Alertas</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell size={24} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">Todo al día</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {notifications.map((notification) => (
                          <Link key={notification.id} href={notification.projectId ? `/project/${notification.projectId}/accounting${notification.type === "approval" ? "/approvals" : notification.type === "certificate" ? "/suppliers" : "/invoices"}` : "#"}>
                            <div className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotificationBg(notification.type)}`}>
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                                <p className="text-xs text-slate-500">{notification.message}</p>
                              </div>
                              <ChevronRight size={14} className="text-slate-300" />
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
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-6">
        {/* Invitaciones pendientes */}
        {invitations.length > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Mail size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-white">{invitations.length} invitación{invitations.length > 1 ? "es" : ""} pendiente{invitations.length > 1 ? "s" : ""}</h2>
                <p className="text-sm text-white/70">Te han invitado a nuevos proyectos</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="bg-white rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><Folder size={16} className="text-slate-600" /></div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{invitation.projectName}</h3>
                      <p className="text-xs text-slate-500">Por {invitation.invitedByName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-slate-700 bg-slate-100 rounded px-2 py-0.5">{invitation.roleType === "project" ? invitation.role : invitation.position}</span>
                    {invitation.permissions.accounting && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">Accounting</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAcceptInvitation(invitation)} disabled={processingInvite === invitation.id} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg py-2 text-xs transition-all disabled:opacity-50"><Check size={12} />{processingInvite === invitation.id ? "..." : "Aceptar"}</button>
                    <button onClick={() => handleRejectInvitation(invitation.id)} disabled={processingInvite === invitation.id} className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg py-2 transition-all disabled:opacity-50"><XIcon size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {projects.length === 0 && invitations.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Sparkles size={28} className="text-slate-400" /></div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Bienvenido a tu espacio de trabajo</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Aún no tienes proyectos asignados. Cuando un administrador te añada a un proyecto, aparecerá aquí.</p>
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar proyectos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm" />
              </div>
              <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm">
                <option value="all">Todas las fases</option>
                <option value="Desarrollo">Desarrollo</option>
                <option value="Preproducción">Preproducción</option>
                <option value="Rodaje">Rodaje</option>
                <option value="Postproducción">Postproducción</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>

            {/* Proyectos */}
            {filteredProjects.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                <FolderOpen size={28} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm mb-2">No se encontraron proyectos</p>
                <button onClick={() => { setSearchTerm(""); setSelectedPhase("all"); }} className="text-sm text-slate-700 hover:text-slate-900 font-medium underline">Limpiar filtros</button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => {
                  const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];
                  const totalAlerts = (project.alerts?.pendingApprovals || 0) + (project.alerts?.overdueInvoices || 0) + (project.alerts?.expiringCertificates || 0);

                  return (
                    <div key={project.id} className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${phaseStyle.dot}`}></div>
                          <h2 className="text-sm font-semibold text-slate-900 truncate">{project.name}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          {totalAlerts > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                              <AlertCircle size={10} />{totalAlerts}
                            </span>
                          )}
                          <button onClick={(e) => { e.preventDefault(); toggleFavorite(project.id); }} className={`p-1 rounded transition-colors ${project.isFavorite ? "text-amber-500" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-500"}`}>
                            <Star size={14} fill={project.isFavorite ? "currentColor" : "none"} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${phaseStyle.bg} ${phaseStyle.text}`}>{project.phase}</span>
                        {project.role && <span className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-0.5">{project.role}</span>}
                        {project.position && <span className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-0.5">{project.position}</span>}
                      </div>

                      {project.producerNames && project.producerNames.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <Building2 size={11} className="text-slate-400" />
                          <span className="text-[11px] text-slate-500 truncate">{project.producerNames.join(", ")}</span>
                        </div>
                      )}

                      {/* Alertas */}
                      {project.permissions.accounting && totalAlerts > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3 p-2 bg-slate-50 rounded-lg">
                          {project.alerts?.pendingApprovals ? <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded"><Clock size={10} />{project.alerts.pendingApprovals} aprob.</span> : null}
                          {project.alerts?.overdueInvoices ? <span className="flex items-center gap-1 text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded"><AlertTriangle size={10} />{project.alerts.overdueInvoices} vencida{project.alerts.overdueInvoices > 1 ? "s" : ""}</span> : null}
                          {project.alerts?.expiringCertificates ? <span className="flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded"><FileText size={10} />{project.alerts.expiringCertificates} cert.</span> : null}
                        </div>
                      )}

                      {/* Accesos */}
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        {project.permissions.config && (
                          <Link href={`/project/${project.id}/config`} className="flex-1">
                            <div className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all text-slate-600 text-xs font-medium"><Settings size={12} />Config</div>
                          </Link>
                        )}
                        {project.permissions.accounting && (
                          <Link href={`/project/${project.id}/accounting`} className="flex-1">
                            <div className="flex items-center justify-center gap-1.5 p-2 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all text-indigo-700 text-xs font-medium"><BarChart3 size={12} />Accounting</div>
                          </Link>
                        )}
                        {project.permissions.team && (
                          <Link href={`/project/${project.id}/team`} className="flex-1">
                            <div className="flex items-center justify-center gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all text-amber-700 text-xs font-medium"><Users size={12} />Team</div>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Archivados */}
            {archivedProjects.length > 0 && (
              <div className="mt-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button onClick={() => setShowArchived(!showArchived)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Archive size={18} className="text-slate-400" />
                    <span className="font-medium text-slate-700">Archivados</span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{archivedProjects.length}</span>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${showArchived ? "rotate-180" : ""}`} />
                </button>
                {showArchived && (
                  <div className="p-4 pt-0 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {archivedProjects.map((project) => {
                      const phaseStyle = phaseColors[project.phase] || phaseColors["Desarrollo"];
                      return (
                        <div key={project.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 opacity-60">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                            <h3 className="text-sm font-medium text-slate-700 truncate">{project.name}</h3>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${phaseStyle.bg} ${phaseStyle.text}`}>{project.phase}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

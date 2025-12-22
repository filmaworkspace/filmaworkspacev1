"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Search, Users, Settings, Clock, Mail, Check, X as XIcon, Building2, Sparkles, BarChart3, Archive, ChevronDown, Bell, AlertCircle, FileText, Star, ChevronRight, AlertTriangle, Filter } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useUser } from "@/contexts/UserContext";
import { collection, getDocs, getDoc, doc, query, where, updateDoc, setDoc, Timestamp, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const phaseConfig: Record<string, { bg: string; text: string; dot: string; gradient: string }> = {
  Desarrollo: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", gradient: "from-sky-500 to-sky-600" },
  Preproducción: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", gradient: "from-amber-500 to-amber-600" },
  Rodaje: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500", gradient: "from-rose-500 to-rose-600" },
  Postproducción: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500", gradient: "from-violet-500 to-violet-600" },
  Finalizado: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", gradient: "from-emerald-500 to-emerald-600" },
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
  roleType: "project" | "department"; role?: string; position?: string;
  permissions: { config?: boolean; accounting: boolean; team: boolean };
}
interface Notification { id: string; type: "approval" | "overdue" | "certificate"; title: string; projectName: string; projectId: string; }

export default function Dashboard() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
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
        const userProjectsSnapshot = await getDocs(collection(db, `userProjects/${userId}/projects`));
        const projectsData: Project[] = [];
        const newNotifications: Notification[] = [];

        for (const userProjectDoc of userProjectsSnapshot.docs) {
          const userProjectData = userProjectDoc.data();
          const projectId = userProjectDoc.id;
          const projectSnapshot = await getDoc(doc(db, "projects", projectId));

          if (projectSnapshot.exists()) {
            const projectData = projectSnapshot.data();
            let producerNames: string[] = [];
            if (projectData.producers?.length) {
              for (const producerId of projectData.producers) {
                const producerDoc = await getDoc(doc(db, "producers", producerId));
                if (producerDoc.exists()) producerNames.push(producerDoc.data().name);
              }
            }

            const membersSnapshot = await getDocs(collection(db, `projects/${projectId}/members`));
            let pendingApprovals = 0, overdueInvoices = 0, expiringCertificates = 0;

            if (userProjectData.permissions?.accounting) {
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

              const now = new Date();
              const allInvoicesSnapshot = await getDocs(collection(db, `projects/${projectId}/invoices`));
              allInvoicesSnapshot.docs.forEach(invDoc => {
                const invData = invDoc.data();
                if (invData.status === "pending" && invData.dueDate) {
                  const dueDate = invData.dueDate.toDate ? invData.dueDate.toDate() : new Date(invData.dueDate);
                  if (dueDate < now) overdueInvoices++;
                }
              });

              const suppliersSnapshot = await getDocs(collection(db, `projects/${projectId}/suppliers`));
              const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              suppliersSnapshot.docs.forEach(supDoc => {
                const certs = supDoc.data().certificates || {};
                [certs.bankOwnership, certs.contractorsCertificate].forEach(cert => {
                  if (cert?.uploaded && cert?.expiryDate) {
                    const expiry = cert.expiryDate.toDate ? cert.expiryDate.toDate() : new Date(cert.expiryDate);
                    if (expiry < thirtyDays) expiringCertificates++;
                  }
                });
              });

              if (pendingApprovals > 0) newNotifications.push({ id: `approval-${projectId}`, type: "approval", title: `${pendingApprovals} aprobación${pendingApprovals > 1 ? "es" : ""}`, projectName: projectData.name, projectId });
              if (overdueInvoices > 0) newNotifications.push({ id: `overdue-${projectId}`, type: "overdue", title: `${overdueInvoices} factura${overdueInvoices > 1 ? "s" : ""} vencida${overdueInvoices > 1 ? "s" : ""}`, projectName: projectData.name, projectId });
              if (expiringCertificates > 0) newNotifications.push({ id: `cert-${projectId}`, type: "certificate", title: `${expiringCertificates} cert. por caducar`, projectName: projectData.name, projectId });
            }

            projectsData.push({
              id: projectSnapshot.id, name: projectData.name, phase: projectData.phase,
              description: projectData.description || "", producerNames,
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
        setNotifications(newNotifications);

        const invitationsSnapshot = await getDocs(query(collection(db, "invitations"), where("invitedEmail", "==", userEmail), where("status", "==", "pending")));
        setInvitations(invitationsSnapshot.docs.map((invDoc: QueryDocumentSnapshot<DocumentData>) => {
          const data = invDoc.data();
          return { id: invDoc.id, projectId: data.projectId, projectName: data.projectName, invitedByName: data.invitedByName, roleType: data.roleType, role: data.role, position: data.position, permissions: data.permissions };
        }));
      } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
    };
    loadData();
  }, [userId, userEmail]);

  const toggleFavorite = async (projectId: string) => {
    if (!userId) return;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    try {
      await updateDoc(doc(db, `userProjects/${userId}/projects`, projectId), { isFavorite: !project.isFavorite });
      setProjects(projects.map(p => p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p));
    } catch (error) { console.error("Error:", error); }
  };

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!userId) return;
    setProcessingInvite(invitation.id);
    try {
      await updateDoc(doc(db, "invitations", invitation.id), { status: "accepted", respondedAt: new Date() });
      await setDoc(doc(db, `projects/${invitation.projectId}/members`, userId), { userId, name: userName, email: userEmail, role: invitation.role || null, department: null, position: invitation.position || null, permissions: { config: invitation.permissions.config || false, accounting: invitation.permissions.accounting, team: invitation.permissions.team }, addedAt: new Date() });
      await setDoc(doc(db, `userProjects/${userId}/projects/${invitation.projectId}`), { projectId: invitation.projectId, role: invitation.role || null, department: null, position: invitation.position || null, permissions: { config: invitation.permissions.config || false, accounting: invitation.permissions.accounting, team: invitation.permissions.team }, addedAt: new Date() });
      window.location.reload();
    } catch (error) { console.error("Error:", error); setProcessingInvite(null); }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    if (!confirm("¿Rechazar esta invitación?")) return;
    setProcessingInvite(invitationId);
    try {
      await updateDoc(doc(db, "invitations", invitationId), { status: "rejected", respondedAt: new Date() });
      setInvitations(invitations.filter(i => i.id !== invitationId));
    } catch (error) { console.error("Error:", error); }
    setProcessingInvite(null);
  };

  const activeProjects = projects.filter(p => !p.archived);
  const archivedProjects = projects.filter(p => p.archived);
  const filteredProjects = activeProjects.filter(p => {
    const matchesSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.producerNames?.some(n => n.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPhase = selectedPhase === "all" || p.phase === selectedPhase;
    return matchesSearch && matchesPhase;
  });

  const totalAlerts = notifications.length;
  const phases = ["Desarrollo", "Preproducción", "Rodaje", "Postproducción", "Finalizado"];
  const projectsByPhase = phases.map(phase => ({ phase, count: activeProjects.filter(p => p.phase === phase).length })).filter(p => p.count > 0);

  if (loading || userLoading) {
    return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">Panel de proyectos</h1>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2.5 rounded-xl border transition-all ${showNotifications ? "bg-slate-900 text-white border-slate-900" : totalAlerts > 0 ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`}>
                <Bell size={18} />
                {totalAlerts > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white shadow-sm">{totalAlerts}</span>}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">Requiere atención</p>
                      {totalAlerts > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{totalAlerts} alertas</span>}
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Check size={20} className="text-emerald-600" />
                        </div>
                        <p className="text-sm font-medium text-slate-900">Todo al día</p>
                        <p className="text-xs text-slate-500 mt-1">No hay alertas pendientes</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {notifications.map((n) => (
                          <Link key={n.id} href={`/project/${n.projectId}/accounting${n.type === "approval" ? "/approvals" : n.type === "certificate" ? "/suppliers" : "/invoices"}`}>
                            <div className="px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.type === "approval" ? "bg-amber-100" : n.type === "overdue" ? "bg-red-100" : "bg-violet-100"}`}>
                                {n.type === "approval" ? <Clock size={18} className="text-amber-600" /> : n.type === "overdue" ? <AlertCircle size={18} className="text-red-600" /> : <FileText size={18} className="text-violet-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{n.projectName}</p>
                              </div>
                              <ChevronRight size={16} className="text-slate-300" />
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

      <main className="max-w-7xl mx-auto px-6 md:px-12 pb-12">
        {/* Invitaciones */}
        {invitations.length > 0 && (
          <div className="mb-8 p-5 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <Mail size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-white">{invitations.length} invitación{invitations.length > 1 ? "es" : ""}</h2>
                <p className="text-sm text-white/70">Nuevos proyectos te esperan</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {invitations.map((inv) => (
                <div key={inv.id} className="bg-white/95 backdrop-blur rounded-xl p-4">
                  <h3 className="font-semibold text-slate-900 mb-1">{inv.projectName}</h3>
                  <p className="text-xs text-slate-500 mb-3">Por {inv.invitedByName}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{inv.roleType === "project" ? inv.role : inv.position}</span>
                    {inv.permissions.accounting && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Accounting</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAcceptInvitation(inv)} disabled={processingInvite === inv.id} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium py-2 rounded-lg transition-all disabled:opacity-50">{processingInvite === inv.id ? "..." : "Aceptar"}</button>
                    <button onClick={() => handleRejectInvitation(inv.id)} disabled={processingInvite === inv.id} className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"><XIcon size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty */}
        {projects.length === 0 && invitations.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles size={28} className="text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Tu espacio está listo</h2>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">Cuando te añadan a un proyecto, aparecerá aquí automáticamente.</p>
          </div>
        ) : (
          <>
            {/* Phase Overview */}
            {projectsByPhase.length > 1 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {projectsByPhase.map(({ phase, count }) => {
                  const config = phaseConfig[phase];
                  return (
                    <button key={phase} onClick={() => setSelectedPhase(selectedPhase === phase ? "all" : phase)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedPhase === phase ? `bg-gradient-to-r ${config.gradient} text-white shadow-md` : `${config.bg} ${config.text} hover:shadow-sm`}`}>
                      <span className={`w-2 h-2 rounded-full ${selectedPhase === phase ? "bg-white/80" : config.dot}`}></span>
                      {phase}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${selectedPhase === phase ? "bg-white/20" : "bg-white/80"}`}>{count}</span>
                    </button>
                  );
                })}
                {selectedPhase !== "all" && (
                  <button onClick={() => setSelectedPhase("all")} className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                    <XIcon size={14} /> Limpiar
                  </button>
                )}
              </div>
            )}

            {/* Search */}
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar proyecto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm" />
              </div>
            </div>

            {/* Projects Grid */}
            {filteredProjects.length === 0 ? (
              <div className="text-center py-16">
                <Filter size={24} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No hay proyectos con estos filtros</p>
                <button onClick={() => { setSearchTerm(""); setSelectedPhase("all"); }} className="mt-2 text-sm text-slate-700 hover:text-slate-900 font-medium underline">Limpiar</button>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => {
                  const phase = phaseConfig[project.phase] || phaseConfig["Desarrollo"];
                  const alerts = (project.alerts?.pendingApprovals || 0) + (project.alerts?.overdueInvoices || 0) + (project.alerts?.expiringCertificates || 0);

                  return (
                    <div key={project.id} className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-slate-300 transition-all duration-300">
                      {/* Phase indicator bar */}
                      <div className={`h-1 bg-gradient-to-r ${phase.gradient}`}></div>
                      
                      <div className="p-5">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h2 className="text-base font-semibold text-slate-900 truncate">{project.name}</h2>
                              {alerts > 0 && (
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">{alerts}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${phase.bg} ${phase.text}`}>{project.phase}</span>
                              {project.role && <span className="text-[11px] text-slate-500">{project.role}</span>}
                            </div>
                          </div>
                          <button onClick={(e) => { e.preventDefault(); toggleFavorite(project.id); }} className={`p-1.5 rounded-lg transition-all ${project.isFavorite ? "text-amber-500 bg-amber-50" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50 opacity-0 group-hover:opacity-100"}`}>
                            <Star size={16} fill={project.isFavorite ? "currentColor" : "none"} />
                          </button>
                        </div>

                        {/* Producer */}
                        {project.producerNames?.length ? (
                          <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
                            <Building2 size={12} />
                            <span className="truncate">{project.producerNames.join(", ")}</span>
                          </div>
                        ) : null}

                        {/* Alerts */}
                        {project.permissions.accounting && alerts > 0 && (
                          <div className="mb-4 p-3 bg-slate-50 rounded-xl space-y-2">
                            {project.alerts?.pendingApprovals ? (
                              <Link href={`/project/${project.id}/accounting/approvals`} className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-800">
                                <Clock size={12} />
                                <span>{project.alerts.pendingApprovals} aprobación{project.alerts.pendingApprovals > 1 ? "es" : ""} pendiente{project.alerts.pendingApprovals > 1 ? "s" : ""}</span>
                                <ChevronRight size={12} className="ml-auto" />
                              </Link>
                            ) : null}
                            {project.alerts?.overdueInvoices ? (
                              <Link href={`/project/${project.id}/accounting/invoices`} className="flex items-center gap-2 text-xs text-red-700 hover:text-red-800">
                                <AlertTriangle size={12} />
                                <span>{project.alerts.overdueInvoices} factura{project.alerts.overdueInvoices > 1 ? "s" : ""} vencida{project.alerts.overdueInvoices > 1 ? "s" : ""}</span>
                                <ChevronRight size={12} className="ml-auto" />
                              </Link>
                            ) : null}
                            {project.alerts?.expiringCertificates ? (
                              <Link href={`/project/${project.id}/accounting/suppliers`} className="flex items-center gap-2 text-xs text-violet-700 hover:text-violet-800">
                                <FileText size={12} />
                                <span>{project.alerts.expiringCertificates} cert. por caducar</span>
                                <ChevronRight size={12} className="ml-auto" />
                              </Link>
                            ) : null}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          {project.permissions.config && (
                            <Link href={`/project/${project.id}/config`} className="flex-1">
                              <div className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-slate-700 text-xs font-medium">
                                <Settings size={14} />
                                <span>Config</span>
                              </div>
                            </Link>
                          )}
                          {project.permissions.accounting && (
                            <Link href={`/project/${project.id}/accounting`} className="flex-1">
                              <div className="flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all text-white text-xs font-medium">
                                <BarChart3 size={14} />
                                <span>Accounting</span>
                              </div>
                            </Link>
                          )}
                          {project.permissions.team && (
                            <Link href={`/project/${project.id}/team`} className="flex-1">
                              <div className="flex items-center justify-center gap-1.5 py-2.5 bg-amber-100 hover:bg-amber-200 rounded-xl transition-all text-amber-700 text-xs font-medium">
                                <Users size={14} />
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
              <div className="mt-12 pt-8 border-t border-slate-100">
                <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors mb-4">
                  <Archive size={16} />
                  <span className="text-sm font-medium">Archivados</span>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{archivedProjects.length}</span>
                  <ChevronDown size={14} className={`transition-transform ${showArchived ? "rotate-180" : ""}`} />
                </button>

                {showArchived && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {archivedProjects.map((project) => {
                      const phase = phaseConfig[project.phase] || phaseConfig["Desarrollo"];
                      return (
                        <div key={project.id} className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden hover:bg-white hover:shadow-md transition-all">
                          <div className="h-1 bg-slate-300"></div>
                          <div className="p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <h3 className="text-sm font-semibold text-slate-700">{project.name}</h3>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${phase.bg} ${phase.text}`}>{project.phase}</span>
                            </div>
                            <div className="flex gap-2">
                              {project.permissions.config && <Link href={`/project/${project.id}/config`} className="flex-1"><div className="text-center py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">Config</div></Link>}
                              {project.permissions.accounting && <Link href={`/project/${project.id}/accounting`} className="flex-1"><div className="text-center py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">Accounting</div></Link>}
                              {project.permissions.team && <Link href={`/project/${project.id}/team`} className="flex-1"><div className="text-center py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">Team</div></Link>}
                            </div>
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
      </main>
    </div>
  );
}

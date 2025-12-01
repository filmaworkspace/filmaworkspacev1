"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import {
  Folder,
  Users,
  Clock,
  FileText,
  List,
  TrendingUp,
  UserPlus,
  UserMinus,
  Calendar,
  AlertCircle,
  CheckCircle,
  Package,
  Briefcase,
  DollarSign,
  ArrowRight,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface TeamStats {
  totalMembers: number;
  activeMembers: number;
  onLeave: number;
  pendingDocuments: number;
  pendingTimesheets: number;
  departmentCount: number;
  recentJoiners: number;
  recentLeavers: number;
}

interface RecentActivity {
  id: string;
  type: "join" | "leave" | "document" | "timesheet";
  memberName: string;
  department?: string;
  timestamp: Date;
  description: string;
}

export default function TeamPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TeamStats>({
    totalMembers: 0,
    activeMembers: 0,
    onLeave: 0,
    pendingDocuments: 0,
    pendingTimesheets: 0,
    departmentCount: 0,
    recentJoiners: 0,
    recentLeavers: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load members
      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      const members = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Load team members (with employment data)
      const teamMembersSnapshot = await getDocs(collection(db, `projects/${id}/teamMembers`));
      const teamMembers = teamMembersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Calculate stats
      const activeMembers = teamMembers.filter((m: any) => m.status === "active").length;
      const onLeave = teamMembers.filter((m: any) => m.status === "on-leave").length;

      // Get unique departments
      const departments = new Set(teamMembers.map((m: any) => m.department).filter(Boolean));

      // Recent joiners (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentJoiners = teamMembers.filter(
        (m: any) => m.joinDate && m.joinDate.toDate() > thirtyDaysAgo
      ).length;

      // Recent leavers (last 30 days)
      const recentLeavers = teamMembers.filter(
        (m: any) => m.leaveDate && m.leaveDate.toDate() > thirtyDaysAgo
      ).length;

      setStats({
        totalMembers: members.length,
        activeMembers,
        onLeave,
        pendingDocuments: 0, // TODO: Implement
        pendingTimesheets: 0, // TODO: Implement
        departmentCount: departments.size,
        recentJoiners,
        recentLeavers,
      });

      // Load recent activity
      // This is a placeholder - you would load actual activity logs
      const activities: RecentActivity[] = [];
      setRecentActivity(activities);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-amber-50 to-amber-100 border-y border-amber-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-amber-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-amber-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-amber-600 hover:text-amber-900 transition-colors text-sm font-medium"
        >
          Volver a proyectos
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-gradient-to-br from-amber-500 to-amber-700 p-3 rounded-xl shadow-lg">
                <Users size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                  Gestión de equipo
                </h1>
                <p className="text-slate-600 text-sm mt-1">
                  Panel de control y gestión del equipo del proyecto
                </p>
              </div>
            </div>
          </header>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-blue-700 font-medium">Total equipo</p>
                <Users size={20} className="text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-900">{stats.totalMembers}</p>
              <p className="text-xs text-blue-600 mt-1">{stats.departmentCount} departamentos</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-emerald-700 font-medium">Activos</p>
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <p className="text-3xl font-bold text-emerald-900">{stats.activeMembers}</p>
              <p className="text-xs text-emerald-600 mt-1">
                {stats.onLeave > 0 ? `${stats.onLeave} de baja` : "Sin bajas"}
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-amber-700 font-medium">Incorporaciones</p>
                <UserPlus size={20} className="text-amber-600" />
              </div>
              <p className="text-3xl font-bold text-amber-900">{stats.recentJoiners}</p>
              <p className="text-xs text-amber-600 mt-1">Últimos 30 días</p>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-red-700 font-medium">Bajas</p>
                <UserMinus size={20} className="text-red-600" />
              </div>
              <p className="text-3xl font-bold text-red-900">{stats.recentLeavers}</p>
              <p className="text-xs text-red-600 mt-1">Últimos 30 días</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Link href={`/project/${id}/team/members`}>
              <div className="bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-amber-400 hover:shadow-lg transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-amber-100 p-3 rounded-lg group-hover:bg-amber-200 transition-colors">
                    <Users size={24} className="text-amber-600" />
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Gestión de equipo
                </h3>
                <p className="text-sm text-slate-600">
                  Incorporaciones, bajas y datos del equipo
                </p>
              </div>
            </Link>

            <Link href={`/project/${id}/team/time-tracking`}>
              <div className="bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-amber-400 hover:shadow-lg transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-100 p-3 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Clock size={24} className="text-blue-600" />
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Control horario
                </h3>
                <p className="text-sm text-slate-600">
                  Registro de jornada y configuración
                </p>
              </div>
            </Link>

            <Link href={`/project/${id}/team/planning`}>
              <div className="bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-amber-400 hover:shadow-lg transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-purple-100 p-3 rounded-lg group-hover:bg-purple-200 transition-colors">
                    <List size={24} className="text-purple-600" />
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Planificación
                </h3>
                <p className="text-sm text-slate-600">
                  Calendarios y asignaciones
                </p>
              </div>
            </Link>

            <Link href={`/project/${id}/team/documentation`}>
              <div className="bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-amber-400 hover:shadow-lg transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-emerald-100 p-3 rounded-lg group-hover:bg-emerald-200 transition-colors">
                    <FileText size={24} className="text-emerald-600" />
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Documentación
                </h3>
                <p className="text-sm text-slate-600">
                  Envío de documentos con marca de agua
                </p>
              </div>
            </Link>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pending Actions */}
            <div className="lg:col-span-2 bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle size={20} className="text-amber-600" />
                Acciones pendientes
              </h2>

              <div className="space-y-3">
                {stats.pendingTimesheets > 0 && (
                  <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-100 p-2 rounded-lg">
                        <Clock size={20} className="text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Registros de jornada pendientes
                        </p>
                        <p className="text-xs text-slate-600">
                          {stats.pendingTimesheets} personas sin registrar hoy
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/project/${id}/team/time-tracking`}
                      className="text-amber-600 hover:text-amber-700 font-medium text-sm"
                    >
                      Ver →
                    </Link>
                  </div>
                )}

                {stats.pendingDocuments > 0 && (
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <FileText size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Documentos pendientes de envío
                        </p>
                        <p className="text-xs text-slate-600">
                          {stats.pendingDocuments} documentos preparados
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/project/${id}/team/documentation`}
                      className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                    >
                      Ver →
                    </Link>
                  </div>
                )}

                {stats.pendingTimesheets === 0 && stats.pendingDocuments === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle size={48} className="text-emerald-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-900">
                      ¡Todo al día!
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      No hay acciones pendientes en este momento
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp size={20} className="text-amber-600" />
                Resumen rápido
              </h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-slate-400" />
                    <span className="text-sm text-slate-600">Departamentos</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {stats.departmentCount}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-slate-400" />
                    <span className="text-sm text-slate-600">Miembros activos</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {stats.activeMembers}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <UserPlus size={16} className="text-slate-400" />
                    <span className="text-sm text-slate-600">Incorporaciones (30d)</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">
                    +{stats.recentJoiners}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserMinus size={16} className="text-slate-400" />
                    <span className="text-sm text-slate-600">Bajas (30d)</span>
                  </div>
                  <span className="text-sm font-semibold text-red-600">
                    -{stats.recentLeavers}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

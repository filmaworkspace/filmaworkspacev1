"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import {
  Folder,
  Users,
  Clock,
  FileText,
  List,
  TrendingUp,
  UserPlus,
  UserMinus,
  AlertCircle,
  CheckCircle,
  Briefcase,
  ArrowRight,
  ChevronRight,
  Calendar,
  Activity,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

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

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const membersSnapshot = await getDocs(collection(db, `projects/${id}/members`));
      const members = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const teamMembersSnapshot = await getDocs(collection(db, `projects/${id}/teamMembers`));
      const teamMembers = teamMembersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const activeMembers = teamMembers.filter((m: any) => m.status === "active").length;
      const onLeave = teamMembers.filter((m: any) => m.status === "on-leave").length;

      const departments = new Set(teamMembers.map((m: any) => m.department).filter(Boolean));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentJoiners = teamMembers.filter(
        (m: any) => m.joinDate && m.joinDate.toDate() > thirtyDaysAgo
      ).length;

      const recentLeavers = teamMembers.filter(
        (m: any) => m.leaveDate && m.leaveDate.toDate() > thirtyDaysAgo
      ).length;

      setStats({
        totalMembers: members.length,
        activeMembers,
        onLeave,
        pendingDocuments: 0,
        pendingTimesheets: 0,
        departmentCount: departments.size,
        recentJoiners,
        recentLeavers,
      });
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-amber-100 hover:text-white transition-colors text-sm"
            >
              <Folder size={14} />
              <span>{projectName}</span>
            </Link>
          </div>

          {/* Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <Users size={26} className="text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                Gestión de equipo
              </h1>
              <p className="text-amber-100 text-sm mt-0.5">
                Panel de control y gestión del equipo del proyecto
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Users size={18} className="text-white/80" />
                <span className="text-2xl font-bold">{stats.totalMembers}</span>
              </div>
              <p className="text-sm text-amber-100">Total equipo</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-300" />
                <span className="text-2xl font-bold">{stats.activeMembers}</span>
              </div>
              <p className="text-sm text-amber-100">Activos</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <UserPlus size={18} className="text-emerald-300" />
                <span className="text-2xl font-bold text-emerald-300">+{stats.recentJoiners}</span>
              </div>
              <p className="text-sm text-amber-100">Incorporaciones</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <UserMinus size={18} className="text-red-300" />
                <span className="text-2xl font-bold text-red-300">-{stats.recentLeavers}</span>
              </div>
              <p className="text-sm text-amber-100">Bajas (30d)</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Link href={`/project/${id}/team/members`}>
              <div className="group bg-white border-2 border-slate-200 hover:border-amber-400 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Users size={22} className="text-white" />
                  </div>
                  <div className="w-8 h-8 bg-slate-100 group-hover:bg-amber-100 rounded-full flex items-center justify-center transition-colors">
                    <ArrowRight size={16} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                  </div>
                </div>
                <h3 className={`text-lg font-semibold text-slate-900 mb-1 group-hover:text-amber-700 transition-colors ${spaceGrotesk.className}`}>
                  Gestión de equipo
                </h3>
                <p className="text-sm text-slate-500">
                  Incorporaciones, bajas y datos del equipo
                </p>
              </div>
            </Link>

            <Link href={`/project/${id}/team/time-tracking`}>
              <div className="group bg-white border-2 border-slate-200 hover:border-blue-400 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Clock size={22} className="text-white" />
                  </div>
                  <div className="w-8 h-8 bg-slate-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors">
                    <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                </div>
                <h3 className={`text-lg font-semibold text-slate-900 mb-1 group-hover:text-blue-700 transition-colors ${spaceGrotesk.className}`}>
                  Control horario
                </h3>
                <p className="text-sm text-slate-500">
                  Registro de jornada y configuración
                </p>
              </div>
            </Link>

            <Link href={`/project/${id}/team/planning`}>
              <div className="group bg-white border-2 border-slate-200 hover:border-purple-400 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Calendar size={22} className="text-white" />
                  </div>
                  <div className="w-8 h-8 bg-slate-100 group-hover:bg-purple-100 rounded-full flex items-center justify-center transition-colors">
                    <ArrowRight size={16} className="text-slate-400 group-hover:text-purple-600 transition-colors" />
                  </div>
                </div>
                <h3 className={`text-lg font-semibold text-slate-900 mb-1 group-hover:text-purple-700 transition-colors ${spaceGrotesk.className}`}>
                  Planificación
                </h3>
                <p className="text-sm text-slate-500">
                  Calendarios y asignaciones
                </p>
              </div>
            </Link>

            <Link href={`/project/${id}/team/documentation`}>
              <div className="group bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-2xl p-6 transition-all hover:shadow-lg cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <FileText size={22} className="text-white" />
                  </div>
                  <div className="w-8 h-8 bg-slate-100 group-hover:bg-emerald-100 rounded-full flex items-center justify-center transition-colors">
                    <ArrowRight size={16} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  </div>
                </div>
                <h3 className={`text-lg font-semibold text-slate-900 mb-1 group-hover:text-emerald-700 transition-colors ${spaceGrotesk.className}`}>
                  Documentación
                </h3>
                <p className="text-sm text-slate-500">
                  Envío de documentos con marca de agua
                </p>
              </div>
            </Link>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pending Actions */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                  <AlertCircle size={18} className="text-white" />
                </div>
                <div>
                  <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Acciones pendientes
                  </h2>
                  <p className="text-xs text-slate-500">Tareas que requieren tu atención</p>
                </div>
              </div>

              <div className="p-6">
                {stats.pendingTimesheets > 0 || stats.pendingDocuments > 0 ? (
                  <div className="space-y-3">
                    {stats.pendingTimesheets > 0 && (
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl group hover:border-amber-300 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                            <Clock size={18} className="text-amber-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              Registros de jornada pendientes
                            </p>
                            <p className="text-sm text-slate-500">
                              {stats.pendingTimesheets} personas sin registrar hoy
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/project/${id}/team/time-tracking`}
                          className="flex items-center gap-1 px-3 py-1.5 text-amber-700 hover:text-amber-900 font-medium text-sm hover:bg-amber-100 rounded-lg transition-colors"
                        >
                          Ver
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    )}

                    {stats.pendingDocuments > 0 && (
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl group hover:border-blue-300 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                            <FileText size={18} className="text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              Documentos pendientes de envío
                            </p>
                            <p className="text-sm text-slate-500">
                              {stats.pendingDocuments} documentos preparados
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/project/${id}/team/documentation`}
                          className="flex items-center gap-1 px-3 py-1.5 text-blue-700 hover:text-blue-900 font-medium text-sm hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          Ver
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} className="text-emerald-500" />
                    </div>
                    <p className={`font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                      ¡Todo al día!
                    </p>
                    <p className="text-sm text-slate-500">
                      No hay acciones pendientes en este momento
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats Summary */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                  <Activity size={18} className="text-white" />
                </div>
                <div>
                  <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                    Resumen rápido
                  </h2>
                  <p className="text-xs text-slate-500">Estado actual del equipo</p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Briefcase size={14} className="text-slate-500" />
                    </div>
                    <span className="text-sm text-slate-600">Departamentos</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {stats.departmentCount}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <Users size={14} className="text-emerald-600" />
                    </div>
                    <span className="text-sm text-slate-600">Miembros activos</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    {stats.activeMembers}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                      <UserPlus size={14} className="text-amber-600" />
                    </div>
                    <span className="text-sm text-slate-600">Incorporaciones (30d)</span>
                  </div>
                  <span className="text-sm font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                    +{stats.recentJoiners}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                      <UserMinus size={14} className="text-red-600" />
                    </div>
                    <span className="text-sm text-slate-600">Bajas (30d)</span>
                  </div>
                  <span className="text-sm font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg">
                    -{stats.recentLeavers}
                  </span>
                </div>

                {stats.onLeave > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="text-amber-600" />
                        <span className="text-sm text-amber-800">De baja temporal</span>
                      </div>
                      <span className="text-sm font-bold text-amber-700">
                        {stats.onLeave}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


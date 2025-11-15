"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  Folder,
  Users,
  List,
  Clock,
  FileText,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Calendar,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface TeamStats {
  totalMembers: number;
  activeMembers: number;
  pendingDocuments: number;
  pendingReports: number;
}

export default function TeamPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [stats] = useState<TeamStats>({
    totalMembers: 0,
    activeMembers: 0,
    pendingDocuments: 0,
    pendingReports: 0,
  });

  // Cargar nombre del proyecto
  useEffect(() => {
    const loadProjectData = async () => {
      try {
        const projectDoc = await getDoc(doc(db, "projects", id));
        if (projectDoc.exists()) {
          setProjectName(projectDoc.data().name || "Proyecto");
        }
      } catch (error) {
        console.error("Error cargando proyecto:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadProjectData();
    }
  }, [id]);

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
                  Coordinación de producción y control del equipo técnico
                </p>
              </div>
            </div>
          </header>

          {/* Estadísticas generales */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-blue-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <Users size={20} />
                </div>
                <div className="text-2xl font-bold text-blue-700">
                  {stats.totalMembers}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Total equipo
              </h3>
              <p className="text-xs text-blue-700">Miembros registrados</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-emerald-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <CheckCircle size={20} />
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {stats.activeMembers}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-emerald-900 mb-1">
                Activos
              </h3>
              <p className="text-xs text-emerald-700">En el proyecto</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-amber-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <AlertCircle size={20} />
                </div>
                <div className="text-2xl font-bold text-amber-700">
                  {stats.pendingDocuments}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-amber-900 mb-1">
                Documentos pendientes
              </h3>
              <p className="text-xs text-amber-700">Por completar</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-purple-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <Clock size={20} />
                </div>
                <div className="text-2xl font-bold text-purple-700">
                  {stats.pendingReports}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-purple-900 mb-1">
                Partes pendientes
              </h3>
              <p className="text-xs text-purple-700">Por revisar</p>
            </div>
          </div>

          {/* Paneles principales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Panel de Equipo */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-amber-300 hover:shadow-xl transition-all">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Users size={28} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Equipo</h2>
                    <p className="text-amber-100 text-sm">
                      Gestión del equipo técnico y artístico
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900 mb-1">0</div>
                    <p className="text-xs text-slate-600">Total</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 mb-1">0</div>
                    <p className="text-xs text-slate-600">Activos</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-600 mb-1">0</div>
                    <p className="text-xs text-slate-600">Inactivos</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Últimas incorporaciones
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 text-center">
                      No hay miembros registrados todavía
                    </p>
                  </div>
                </div>

                <Link href={`/project/${id}/team/members`}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors shadow-md">
                    Gestionar equipo
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>

            {/* Panel de Control Horario */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-purple-300 hover:shadow-xl transition-all">
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Clock size={28} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Control horario</h2>
                    <p className="text-purple-100 text-sm">
                      Partes diarios y registro de horas
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900 mb-1">0</div>
                    <p className="text-xs text-slate-600">Hoy</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600 mb-1">0</div>
                    <p className="text-xs text-slate-600">Pendientes</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 mb-1">0</div>
                    <p className="text-xs text-slate-600">Aprobados</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Partes recientes
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 text-center">
                      No hay partes registrados todavía
                    </p>
                  </div>
                </div>

                <Link href={`/project/${id}/team/time-tracking`}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors shadow-md">
                    Ver partes diarios
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Acciones rápidas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href={`/project/${id}/team/members`}>
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-amber-300 hover:shadow-lg transition-all cursor-pointer text-center group">
                  <div className="bg-amber-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-amber-600 transition-colors">
                    <UserPlus size={24} className="text-amber-600 group-hover:text-white transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">Alta miembro</p>
                </div>
              </Link>

              <Link href={`/project/${id}/team/planning`}>
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-lg transition-all cursor-pointer text-center group">
                  <div className="bg-indigo-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-indigo-600 transition-colors">
                    <List size={24} className="text-indigo-600 group-hover:text-white transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">Planificación</p>
                </div>
              </Link>

              <Link href={`/project/${id}/team/documentation`}>
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-lg transition-all cursor-pointer text-center group">
                  <div className="bg-emerald-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-emerald-600 transition-colors">
                    <FileText size={24} className="text-emerald-600 group-hover:text-white transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">Documentación</p>
                </div>
              </Link>

              <Link href={`/project/${id}/team/time-tracking`}>
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer text-center group">
                  <div className="bg-purple-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-purple-600 transition-colors">
                    <Calendar size={24} className="text-purple-600 group-hover:text-white transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">Ver calendario</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

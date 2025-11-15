"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  Folder,
  FileText,
  Receipt,
  DollarSign,
  CheckCircle,
  Clock,
  TrendingUp,
  ArrowRight,
  Users,
  BarChart3,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface BudgetStats {
  totalBudget: number;
  totalSpent: number;
  totalPending: number;
  totalAvailable: number;
}

interface POStats {
  total: number;
  pending: number;
  approved: number;
}

interface InvoiceStats {
  total: number;
  pending: number;
  paid: number;
}

export default function AccountingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Estados para estadísticas
  const [stats, setStats] = useState<BudgetStats>({
    totalBudget: 0,
    totalSpent: 0,
    totalPending: 0,
    totalAvailable: 0,
  });

  const [poStats, setPoStats] = useState<POStats>({
    total: 0,
    pending: 0,
    approved: 0,
  });

  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats>({
    total: 0,
    pending: 0,
    paid: 0,
  });

  // Cargar datos del proyecto
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
            <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-indigo-50 to-indigo-100 border-y border-indigo-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-indigo-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
        >
          Volver a proyectos
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                <DollarSign size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                  Panel de contabilidad
                </h1>
                <p className="text-slate-600 text-sm mt-1">
                  Resumen financiero y gestión de documentos
                </p>
              </div>
            </div>
          </header>

          {/* Estadísticas generales */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-blue-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <DollarSign size={20} />
                </div>
                <div className="text-2xl font-bold text-blue-700">
                  {stats.totalBudget.toLocaleString()} €
                </div>
              </div>
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Presupuesto total
              </h3>
              <p className="text-xs text-blue-700">Del proyecto</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-emerald-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <CheckCircle size={20} />
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {stats.totalSpent.toLocaleString()} €
                </div>
              </div>
              <h3 className="text-sm font-semibold text-emerald-900 mb-1">
                Gastado
              </h3>
              <p className="text-xs text-emerald-700">Facturas pagadas</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-amber-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <Clock size={20} />
                </div>
                <div className="text-2xl font-bold text-amber-700">
                  {stats.totalPending.toLocaleString()} €
                </div>
              </div>
              <h3 className="text-sm font-semibold text-amber-900 mb-1">
                Pendiente de pago
              </h3>
              <p className="text-xs text-amber-700">Por liquidar</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-purple-600 text-white p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                  <TrendingUp size={20} />
                </div>
                <div className="text-2xl font-bold text-purple-700">
                  {stats.totalAvailable.toLocaleString()} €
                </div>
              </div>
              <h3 className="text-sm font-semibold text-purple-900 mb-1">
                Disponible
              </h3>
              <p className="text-xs text-purple-700">Del presupuesto</p>
            </div>
          </div>

          {/* Secciones de navegación */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Proveedores */}
            <Link href={`/project/${id}/accounting/suppliers`}>
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-xl transition-all group cursor-pointer h-full">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-indigo-100 text-indigo-700 p-4 rounded-xl mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all group-hover:scale-110">
                    <Users size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Proveedores
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Gestiona tus proveedores
                  </p>
                  <ArrowRight size={20} className="text-indigo-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Presupuesto */}
            <Link href={`/project/${id}/accounting/budget`}>
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-blue-400 hover:shadow-xl transition-all group cursor-pointer h-full">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-blue-100 text-blue-700 p-4 rounded-xl mb-4 group-hover:bg-blue-600 group-hover:text-white transition-all group-hover:scale-110">
                    <DollarSign size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Presupuesto
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Gestiona el presupuesto
                  </p>
                  <ArrowRight size={20} className="text-blue-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Usuarios */}
            <Link href={`/project/${id}/accounting/users`}>
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-emerald-400 hover:shadow-xl transition-all group cursor-pointer h-full">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-emerald-100 text-emerald-700 p-4 rounded-xl mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all group-hover:scale-110">
                    <Users size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Usuarios
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Control de accesos
                  </p>
                  <ArrowRight size={20} className="text-emerald-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Informes */}
            <Link href={`/project/${id}/accounting/reports`}>
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-purple-400 hover:shadow-xl transition-all group cursor-pointer h-full">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-purple-100 text-purple-700 p-4 rounded-xl mb-4 group-hover:bg-purple-600 group-hover:text-white transition-all group-hover:scale-110">
                    <BarChart3 size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Informes
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Reportes financieros
                  </p>
                  <ArrowRight size={20} className="text-purple-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>

          {/* Paneles de POs y Facturas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel de POs */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <FileText size={28} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      Órdenes de compra
                    </h2>
                    <p className="text-indigo-100 text-sm">
                      Purchase orders del proyecto
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      {poStats.total}
                    </div>
                    <p className="text-xs text-slate-600">Total</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600 mb-1">
                      {poStats.pending}
                    </div>
                    <p className="text-xs text-slate-600">Pendientes</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 mb-1">
                      {poStats.approved}
                    </div>
                    <p className="text-xs text-slate-600">Aprobadas</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Actividad reciente
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 text-center">
                      No hay órdenes de compra creadas todavía
                    </p>
                  </div>
                </div>

                <Link href={`/project/${id}/accounting/pos`}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-md">
                    Gestionar órdenes de compra
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>

            {/* Panel de Facturas */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-emerald-300 hover:shadow-xl transition-all">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Receipt size={28} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Facturas</h2>
                    <p className="text-emerald-100 text-sm">
                      Gestión de facturas del proyecto
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      {invoiceStats.total}
                    </div>
                    <p className="text-xs text-slate-600">Total</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600 mb-1">
                      {invoiceStats.pending}
                    </div>
                    <p className="text-xs text-slate-600">Pendientes</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 mb-1">
                      {invoiceStats.paid}
                    </div>
                    <p className="text-xs text-slate-600">Pagadas</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Facturas recientes
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 text-center">
                      No hay facturas registradas todavía
                    </p>
                  </div>
                </div>

                <Link href={`/project/${id}/accounting/invoices`}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-md">
                    Gestionar facturas
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

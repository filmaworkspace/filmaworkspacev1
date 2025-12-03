"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  Timestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import {
  Folder,
  Clock,
  Settings,
  Calendar,
  Save,
  Bell,
  Download,
  Search,
  TrendingUp,
  BarChart3,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Info,
  Timer,
  CalendarDays,
  Zap,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

interface TimeTrackingConfig {
  enabled: boolean;
  sendTime: string;
  sendDays: string[];
  reminderTime: string;
  reminderEnabled: boolean;
  requireNotes: boolean;
  allowLateSubmission: boolean;
  lateSubmissionHours: number;
}

interface TimeEntry {
  id: string;
  userId: string;
  userName: string;
  department: string;
  date: Date;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalHours: number;
  status: "on-time" | "late" | "missing";
  notes?: string;
  submittedAt: Date;
}

const DAYS_OF_WEEK = [
  { value: "monday", label: "Lun", fullLabel: "Lunes" },
  { value: "tuesday", label: "Mar", fullLabel: "Martes" },
  { value: "wednesday", label: "Mié", fullLabel: "Miércoles" },
  { value: "thursday", label: "Jue", fullLabel: "Jueves" },
  { value: "friday", label: "Vie", fullLabel: "Viernes" },
  { value: "saturday", label: "Sáb", fullLabel: "Sábado" },
  { value: "sunday", label: "Dom", fullLabel: "Domingo" },
];

const statusConfig = {
  "on-time": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: CheckCircle,
    label: "A tiempo",
  },
  late: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: Clock,
    label: "Tarde",
  },
  missing: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: AlertCircle,
    label: "Falta",
  },
};

export default function TimeTrackingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "config" | "reports">("overview");

  const [config, setConfig] = useState<TimeTrackingConfig>({
    enabled: true,
    sendTime: "18:00",
    sendDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    reminderTime: "20:00",
    reminderEnabled: true,
    requireNotes: false,
    allowLateSubmission: true,
    lateSubmissionHours: 24,
  });

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<TimeEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState("");

  const [stats, setStats] = useState({
    todaySubmitted: 0,
    todayPending: 0,
    weekTotal: 0,
    onTimeRate: 0,
  });

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    filterEntries();
  }, [searchTerm, statusFilter, dateFilter, timeEntries]);

  const loadData = async () => {
    try {
      setLoading(true);

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const configDoc = await getDoc(doc(db, `projects/${id}/config/timeTracking`));
      if (configDoc.exists()) {
        setConfig(configDoc.data() as TimeTrackingConfig);
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const entriesQuery = query(
        collection(db, `projects/${id}/timeEntries`),
        where("date", ">=", Timestamp.fromDate(thirtyDaysAgo)),
        orderBy("date", "desc")
      );

      const entriesSnapshot = await getDocs(entriesQuery);
      const entries = entriesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
        submittedAt: doc.data().submittedAt.toDate(),
      })) as TimeEntry[];

      setTimeEntries(entries);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayEntries = entries.filter((e) => {
        const entryDate = new Date(e.date);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === today.getTime();
      });

      const membersSnapshot = await getDocs(collection(db, `projects/${id}/teamMembers`));
      const activeMembers = membersSnapshot.docs.filter(
        (doc) => doc.data().status === "active"
      ).length;

      const todaySubmitted = todayEntries.length;
      const todayPending = activeMembers - todaySubmitted;

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);

      const weekEntries = entries.filter((e) => e.date >= weekStart);
      const weekTotal = weekEntries.reduce((sum, e) => sum + e.totalHours, 0);

      const onTimeEntries = entries.filter((e) => e.status === "on-time").length;
      const onTimeRate = entries.length > 0 ? (onTimeEntries / entries.length) * 100 : 0;

      setStats({
        todaySubmitted,
        todayPending,
        weekTotal,
        onTimeRate,
      });
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = [...timeEntries];

    if (searchTerm) {
      filtered = filtered.filter(
        (entry) =>
          entry.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.department.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((entry) => entry.status === statusFilter);
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((entry) => {
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === filterDate.getTime();
      });
    }

    setFilteredEntries(filtered);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, `projects/${id}/config`, "timeTracking"), config);
      alert("Configuración guardada correctamente");
    } catch (error) {
      console.error("Error guardando configuración:", error);
      alert("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setConfig((prev) => ({
      ...prev,
      sendDays: prev.sendDays.includes(day)
        ? prev.sendDays.filter((d) => d !== day)
        : [...prev.sendDays, day],
    }));
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const exportReport = () => {
    const rows = [
      ["USUARIO", "DEPARTAMENTO", "FECHA", "ENTRADA", "SALIDA", "DESCANSO", "TOTAL HORAS", "ESTADO", "NOTAS"],
    ];

    filteredEntries.forEach((entry) => {
      rows.push([
        entry.userName,
        entry.department,
        formatDate(entry.date),
        entry.startTime,
        entry.endTime,
        `${entry.breakMinutes} min`,
        entry.totalHours.toString(),
        entry.status,
        entry.notes || "",
      ]);
    });

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Control_Horario_${projectName}_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-blue-100 mb-6">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              <Folder size={14} />
            </Link>
            <ChevronRight size={14} className="text-blue-200" />
            <Link
              href={`/project/${id}/team`}
              className="text-sm hover:text-white transition-colors"
            >
              Team
            </Link>
            <ChevronRight size={14} className="text-blue-200" />
            <span className="text-sm text-white font-medium">Control horario</span>
          </div>

          {/* Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <Clock size={26} className="text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                Control horario
              </h1>
              <p className="text-blue-100 text-sm mt-0.5">
                Registro automático de jornada del equipo
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-300" />
                <span className="text-2xl font-bold">{stats.todaySubmitted}</span>
              </div>
              <p className="text-sm text-blue-100">Hoy registrados</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle size={18} className="text-amber-300" />
                <span className="text-2xl font-bold">{stats.todayPending}</span>
              </div>
              <p className="text-sm text-blue-100">Hoy pendientes</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={18} className="text-emerald-300" />
                <span className="text-2xl font-bold">{stats.weekTotal.toFixed(0)}h</span>
              </div>
              <p className="text-sm text-blue-100">Horas semana</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <BarChart3 size={18} className="text-white/80" />
                <span className="text-2xl font-bold">{stats.onTimeRate.toFixed(0)}%</span>
              </div>
              <p className="text-sm text-blue-100">Puntualidad</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 p-1.5 inline-flex gap-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <BarChart3 size={16} />
              Resumen
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "config"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Settings size={16} />
              Configuración
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "reports"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Calendar size={16} />
              Registros
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Info Card */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Info size={22} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-blue-900 mb-2 ${spaceGrotesk.className}`}>
                      ¿Cómo funciona el control horario automático?
                    </h3>
                    <ul className="text-sm text-blue-800 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <Zap size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        Cada día laborable, el sistema envía automáticamente un formulario al equipo
                      </li>
                      <li className="flex items-start gap-2">
                        <Timer size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        El equipo registra su entrada, salida y descanso
                      </li>
                      <li className="flex items-start gap-2">
                        <Bell size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        Puedes configurar recordatorios automáticos para quienes no hayan registrado
                      </li>
                      <li className="flex items-start gap-2">
                        <Download size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        Todos los registros quedan almacenados y puedes exportarlos
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveTab("config")}
                  className="group bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center mb-4 transition-colors">
                    <Settings size={22} className="text-slate-600 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h3 className={`font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                    Configurar horarios
                  </h3>
                  <p className="text-sm text-slate-500">
                    Define cuándo enviar formularios y recordatorios
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("reports")}
                  className="group bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center mb-4 transition-colors">
                    <CalendarDays size={22} className="text-slate-600 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h3 className={`font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                    Ver registros
                  </h3>
                  <p className="text-sm text-slate-500">
                    Consulta el historial de jornadas del equipo
                  </p>
                </button>

                <button
                  onClick={exportReport}
                  className="group bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center mb-4 transition-colors">
                    <Download size={22} className="text-slate-600 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h3 className={`font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                    Exportar datos
                  </h3>
                  <p className="text-sm text-slate-500">
                    Descarga los registros en formato CSV
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Configuration Tab */}
          {activeTab === "config" && (
            <div className="max-w-3xl">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Settings size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      Configuración del control horario
                    </h2>
                    <p className="text-xs text-slate-500">Personaliza el envío de formularios y recordatorios</p>
                  </div>
                </div>

                <div className="p-6 space-y-8">
                  {/* Enable/Disable */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-semibold text-slate-900">Control horario activo</p>
                      <p className="text-sm text-slate-500">
                        Enviar formularios automáticos al equipo
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {config.enabled && (
                    <>
                      {/* Send Time */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
                          <Clock size={16} className="text-blue-600" />
                          Hora de envío del formulario
                        </label>
                        <input
                          type="time"
                          value={config.sendTime}
                          onChange={(e) => setConfig({ ...config, sendTime: e.target.value })}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                          El formulario se enviará todos los días laborables a esta hora
                        </p>
                      </div>

                      {/* Days Selection */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
                          <Calendar size={16} className="text-blue-600" />
                          Días laborables
                        </label>
                        <div className="flex gap-2">
                          {DAYS_OF_WEEK.map((day) => (
                            <button
                              key={day.value}
                              onClick={() => toggleDay(day.value)}
                              title={day.fullLabel}
                              className={`w-12 h-12 rounded-xl border-2 transition-all text-sm font-semibold ${
                                config.sendDays.includes(day.value)
                                  ? "border-blue-500 bg-blue-50 text-blue-700"
                                  : "border-slate-200 text-slate-400 hover:border-slate-300"
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Reminder */}
                      <div className="border-t border-slate-100 pt-8">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                              <Bell size={18} className="text-amber-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">Recordatorio automático</p>
                              <p className="text-sm text-slate-500">
                                Enviar recordatorio a quienes no hayan registrado
                              </p>
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.reminderEnabled}
                              onChange={(e) => setConfig({ ...config, reminderEnabled: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {config.reminderEnabled && (
                          <div className="ml-13 pl-13">
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                              Hora del recordatorio
                            </label>
                            <input
                              type="time"
                              value={config.reminderTime}
                              onChange={(e) => setConfig({ ...config, reminderTime: e.target.value })}
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all"
                            />
                          </div>
                        )}
                      </div>

                      {/* Additional Options */}
                      <div className="border-t border-slate-100 pt-8 space-y-4">
                        <h4 className={`font-semibold text-slate-900 mb-4 ${spaceGrotesk.className}`}>
                          Opciones adicionales
                        </h4>

                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                          <div>
                            <p className="font-medium text-slate-900">Requerir notas</p>
                            <p className="text-sm text-slate-500">
                              Obligar a incluir notas en cada registro
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.requireNotes}
                              onChange={(e) => setConfig({ ...config, requireNotes: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                          <div>
                            <p className="font-medium text-slate-900">Permitir registro tardío</p>
                            <p className="text-sm text-slate-500">
                              Permitir registrar después del día laborable
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.allowLateSubmission}
                              onChange={(e) => setConfig({ ...config, allowLateSubmission: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {config.allowLateSubmission && (
                          <div className="p-4 bg-slate-50 rounded-xl">
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                              Horas permitidas para registro tardío
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="168"
                              value={config.lateSubmissionHours}
                              onChange={(e) => setConfig({ ...config, lateSubmissionHours: parseInt(e.target.value) })}
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all bg-white"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
                  <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Guardar configuración
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por nombre o departamento..."
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all min-w-[160px]"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="on-time">A tiempo</option>
                    <option value="late">Tarde</option>
                    <option value="missing">Sin registrar</option>
                  </select>

                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm transition-all"
                  />

                  <button
                    onClick={exportReport}
                    className="flex items-center justify-center gap-2 px-5 py-3 border-2 border-blue-500 text-blue-600 rounded-xl hover:bg-blue-50 transition-colors text-sm font-semibold"
                  >
                    <Download size={16} />
                    Exportar
                  </button>
                </div>
              </div>

              {/* Entries Table */}
              {filteredEntries.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Clock size={32} className="text-slate-300" />
                  </div>
                  <h3 className={`text-xl font-semibold text-slate-900 mb-2 ${spaceGrotesk.className}`}>
                    No hay registros
                  </h3>
                  <p className="text-slate-500">
                    {searchTerm || statusFilter !== "all" || dateFilter
                      ? "Intenta ajustar los filtros de búsqueda"
                      : "Los registros de jornada aparecerán aquí"}
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <p className="text-sm text-slate-500">
                      {filteredEntries.length} registro{filteredEntries.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Usuario
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Fecha
                          </th>
                          <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Entrada
                          </th>
                          <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Salida
                          </th>
                          <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Descanso
                          </th>
                          <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Total
                          </th>
                          <th className="text-center px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredEntries.map((entry) => {
                          const status = statusConfig[entry.status];
                          const StatusIcon = status.icon;
                          return (
                            <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                    {entry.userName?.[0]?.toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-900">{entry.userName}</p>
                                    <p className="text-xs text-slate-500">{entry.department}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-900">
                                {formatDate(entry.date)}
                              </td>
                              <td className="px-6 py-4 text-center text-sm font-mono text-slate-900">
                                {entry.startTime}
                              </td>
                              <td className="px-6 py-4 text-center text-sm font-mono text-slate-900">
                                {entry.endTime}
                              </td>
                              <td className="px-6 py-4 text-center text-sm text-slate-500">
                                {entry.breakMinutes} min
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-sm font-bold text-slate-900">
                                  {entry.totalHours.toFixed(1)}h
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${status.bg} ${status.text} ${status.border}`}>
                                  <StatusIcon size={12} />
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

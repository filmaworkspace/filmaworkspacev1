"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  updateDoc,
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
  Users,
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  Info,
  Save,
  Bell,
  Mail,
  Download,
  Filter,
  Search,
  Eye,
  TrendingUp,
  BarChart3,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
  { value: "monday", label: "Lunes" },
  { value: "tuesday", label: "Martes" },
  { value: "wednesday", label: "Miércoles" },
  { value: "thursday", label: "Jueves" },
  { value: "friday", label: "Viernes" },
  { value: "saturday", label: "Sábado" },
  { value: "sunday", label: "Domingo" },
];

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

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load time tracking config
      const configDoc = await getDoc(doc(db, `projects/${id}/config/timeTracking`));
      if (configDoc.exists()) {
        setConfig(configDoc.data() as TimeTrackingConfig);
      }

      // Load time entries (last 30 days)
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

      // Calculate stats
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
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-amber-600 hover:text-amber-900 transition-colors text-sm font-medium"
          >
            Volver a proyectos
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 p-3 rounded-xl shadow-lg">
                  <Clock size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Control horario
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Registro automático de jornada del equipo
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === "overview"
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 size={16} />
                Resumen
              </div>
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === "config"
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings size={16} />
                Configuración
              </div>
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === "reports"
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                Registros
              </div>
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-blue-700 font-medium">Hoy registrados</p>
                    <CheckCircle size={20} className="text-blue-600" />
                  </div>
                  <p className="text-3xl font-bold text-blue-900">{stats.todaySubmitted}</p>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-amber-700 font-medium">Hoy pendientes</p>
                    <AlertCircle size={20} className="text-amber-600" />
                  </div>
                  <p className="text-3xl font-bold text-amber-900">{stats.todayPending}</p>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-emerald-700 font-medium">Horas semana</p>
                    <TrendingUp size={20} className="text-emerald-600" />
                  </div>
                  <p className="text-3xl font-bold text-emerald-900">
                    {stats.weekTotal.toFixed(1)}h
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-purple-700 font-medium">Tasa puntualidad</p>
                    <BarChart3 size={20} className="text-purple-600" />
                  </div>
                  <p className="text-3xl font-bold text-purple-900">
                    {stats.onTimeRate.toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Info Card */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                <div className="flex gap-3">
                  <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-2">
                      ¿Cómo funciona el control horario automático?
                    </p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>
                        • Cada día laborable, el sistema envía automáticamente un formulario al equipo
                      </li>
                      <li>• El equipo registra su entrada, salida y descanso</li>
                      <li>
                        • Puedes configurar recordatorios automáticos para quienes no hayan registrado
                      </li>
                      <li>• Todos los registros quedan almacenados y puedes exportarlos</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Configuration Tab */}
          {activeTab === "config" && (
            <div className="max-w-4xl">
              <div className="bg-white border-2 border-slate-200 rounded-xl shadow-sm p-6 space-y-6">
                {/* Enable/Disable */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-semibold text-slate-900">Control horario activo</p>
                    <p className="text-sm text-slate-600">
                      Enviar formularios automáticos al equipo
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) =>
                        setConfig({ ...config, enabled: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                {config.enabled && (
                  <>
                    {/* Send Time */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          Hora de envío del formulario
                        </div>
                      </label>
                      <input
                        type="time"
                        value={config.sendTime}
                        onChange={(e) =>
                          setConfig({ ...config, sendTime: e.target.value })
                        }
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        El formulario se enviará todos los días laborables a esta hora
                      </p>
                    </div>

                    {/* Days Selection */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} />
                          Días laborables
                        </div>
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={day.value}
                            onClick={() => toggleDay(day.value)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
                              config.sendDays.includes(day.value)
                                ? "border-amber-500 bg-amber-50 text-amber-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reminder */}
                    <div className="border-t pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="font-semibold text-slate-900 flex items-center gap-2">
                            <Bell size={16} />
                            Recordatorio automático
                          </p>
                          <p className="text-sm text-slate-600">
                            Enviar recordatorio a quienes no hayan registrado
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.reminderEnabled}
                            onChange={(e) =>
                              setConfig({ ...config, reminderEnabled: e.target.checked })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                      </div>

                      {config.reminderEnabled && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Hora del recordatorio
                          </label>
                          <input
                            type="time"
                            value={config.reminderTime}
                            onChange={(e) =>
                              setConfig({ ...config, reminderTime: e.target.value })
                            }
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Additional Options */}
                    <div className="border-t pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">Requerir notas</p>
                          <p className="text-sm text-slate-600">
                            Obligar a incluir notas en cada registro
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.requireNotes}
                            onChange={(e) =>
                              setConfig({ ...config, requireNotes: e.target.checked })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">Permitir registro tardío</p>
                          <p className="text-sm text-slate-600">
                            Permitir registrar después del día laborable
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.allowLateSubmission}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                allowLateSubmission: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                      </div>

                      {config.allowLateSubmission && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Horas permitidas para registro tardío
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="168"
                            value={config.lateSubmissionHours}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                lateSubmissionHours: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Save Button */}
                <div className="border-t pt-6">
                  <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50"
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
            <>
              {/* Filters */}
              <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nombre o departamento..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="on-time">A tiempo</option>
                      <option value="late">Tarde</option>
                      <option value="missing">Sin registrar</option>
                    </select>
                  </div>

                  <div>
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Export Button */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={exportReport}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-amber-600 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors text-sm font-medium"
                >
                  <Download size={16} />
                  Exportar
                </button>
              </div>

              {/* Entries Table */}
              {filteredEntries.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
                  <Clock size={64} className="text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    No hay registros
                  </h3>
                  <p className="text-slate-600">
                    {searchTerm || statusFilter !== "all" || dateFilter
                      ? "Intenta ajustar los filtros"
                      : "Los registros de jornada aparecerán aquí"}
                  </p>
                </div>
              ) : (
                <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b-2 border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Usuario
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Fecha
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Entrada
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Salida
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Descanso
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Total
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredEntries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {entry.userName}
                                </p>
                                <p className="text-xs text-slate-600">{entry.department}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-900">
                              {formatDate(entry.date)}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-slate-900">
                              {entry.startTime}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-slate-900">
                              {entry.endTime}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-slate-600">
                              {entry.breakMinutes} min
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-semibold text-slate-900">
                                {entry.totalHours.toFixed(1)}h
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {entry.status === "on-time" && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <CheckCircle size={12} />
                                  A tiempo
                                </span>
                              )}
                              {entry.status === "late" && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                  <Clock size={12} />
                                  Tarde
                                </span>
                              )}
                              {entry.status === "missing" && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                                  <AlertCircle size={12} />
                                  Falta
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}


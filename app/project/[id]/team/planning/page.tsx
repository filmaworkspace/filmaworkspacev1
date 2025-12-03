"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Folder,
  ChevronRight,
  Calendar,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  Sunset,
  MapPin,
  Users,
  Clock,
  Film,
  Clapperboard,
  Plus,
  X,
  GripVertical,
  ChevronLeft,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  Eye,
  Edit3,
  Trash2,
  Copy,
  Zap,
  TrendingUp,
  Target,
  FileText,
  Camera,
  Sparkles,
  LayoutGrid,
  List,
  CloudSun,
  Wind,
  Thermometer,
  Timer,
  Coffee,
  Utensils,
  Car,
  Building2,
  TreePine,
  Home,
  Waves,
  Mountain,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"] });

// Types
interface Scene {
  id: string;
  number: string;
  name: string;
  description: string;
  pages: number; // 1/8 pages
  intExt: "INT" | "EXT";
  dayNight: "DAY" | "NIGHT" | "SUNSET" | "DAWN";
  location: string;
  locationId: string;
  cast: string[];
  extras: number;
  status: "pending" | "scheduled" | "shot" | "reshoots";
  notes: string;
}

interface ShootingDay {
  id: string;
  date: string;
  dayNumber: number;
  scenes: string[];
  location: string;
  locationId: string;
  callTime: string;
  wrapTime: string;
  status: "planned" | "in-progress" | "completed" | "weather-hold";
  weather?: WeatherData;
  notes: string;
  crew: string[];
  totalPages: number;
}

interface Location {
  id: string;
  name: string;
  address: string;
  type: "studio" | "exterior" | "interior" | "mixed";
  icon: string;
  color: string;
  scenes: string[];
}

interface WeatherData {
  temp: number;
  condition: "sunny" | "cloudy" | "rainy" | "stormy";
  wind: number;
  humidity: number;
  sunrise: string;
  sunset: string;
}

interface ProductionStats {
  totalScenes: number;
  scenesShot: number;
  totalPages: number;
  pagesShot: number;
  totalDays: number;
  daysCompleted: number;
  avgPagesPerDay: number;
  onSchedule: boolean;
  daysAhead: number;
}

// Mock weather data generator
const generateWeather = (date: string): WeatherData => {
  const conditions: WeatherData["condition"][] = ["sunny", "cloudy", "rainy", "sunny", "sunny", "cloudy"];
  const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
  return {
    temp: Math.floor(Math.random() * 15) + 15,
    condition: randomCondition,
    wind: Math.floor(Math.random() * 30) + 5,
    humidity: Math.floor(Math.random() * 40) + 40,
    sunrise: "07:15",
    sunset: "20:45",
  };
};

// Location icons and colors
const locationTypes: Record<string, { icon: any; color: string; bg: string }> = {
  studio: { icon: Building2, color: "text-violet-600", bg: "bg-violet-100" },
  exterior: { icon: TreePine, color: "text-emerald-600", bg: "bg-emerald-100" },
  interior: { icon: Home, color: "text-amber-600", bg: "bg-amber-100" },
  beach: { icon: Waves, color: "text-cyan-600", bg: "bg-cyan-100" },
  mountain: { icon: Mountain, color: "text-slate-600", bg: "bg-slate-200" },
};

// Weather icons
const weatherIcons: Record<string, { icon: any; color: string; bg: string }> = {
  sunny: { icon: Sun, color: "text-amber-500", bg: "bg-amber-50" },
  cloudy: { icon: Cloud, color: "text-slate-500", bg: "bg-slate-100" },
  rainy: { icon: CloudRain, color: "text-blue-500", bg: "bg-blue-50" },
  stormy: { icon: Zap, color: "text-purple-500", bg: "bg-purple-50" },
};

// Sample data
const SAMPLE_LOCATIONS: Location[] = [
  { id: "loc1", name: "Estudio Principal", address: "Ciudad de la Luz, Madrid", type: "studio", icon: "studio", color: "violet", scenes: [] },
  { id: "loc2", name: "Casa del Protagonista", address: "Calle Mayor 15, Madrid", type: "interior", icon: "interior", color: "amber", scenes: [] },
  { id: "loc3", name: "Parque del Retiro", address: "Parque del Retiro, Madrid", type: "exterior", icon: "exterior", color: "emerald", scenes: [] },
  { id: "loc4", name: "Playa de Tarifa", address: "Tarifa, Cádiz", type: "exterior", icon: "beach", color: "cyan", scenes: [] },
  { id: "loc5", name: "Oficina Central", address: "Torre Picasso, Madrid", type: "interior", icon: "interior", color: "amber", scenes: [] },
];

const SAMPLE_SCENES: Scene[] = [
  { id: "sc1", number: "1", name: "Apertura - Amanecer en la ciudad", description: "Plano general de la ciudad al amanecer", pages: 2, intExt: "EXT", dayNight: "DAWN", location: "Parque del Retiro", locationId: "loc3", cast: ["María", "Carlos"], extras: 0, status: "shot", notes: "" },
  { id: "sc2", number: "2", name: "Desayuno en casa", description: "María desayuna mientras lee el periódico", pages: 4, intExt: "INT", dayNight: "DAY", location: "Casa del Protagonista", locationId: "loc2", cast: ["María"], extras: 0, status: "shot", notes: "" },
  { id: "sc3", number: "3", name: "Llamada de teléfono", description: "María recibe una llamada misteriosa", pages: 3, intExt: "INT", dayNight: "DAY", location: "Casa del Protagonista", locationId: "loc2", cast: ["María"], extras: 0, status: "scheduled", notes: "" },
  { id: "sc4", number: "4", name: "Reunión en la oficina", description: "Carlos presenta el proyecto al equipo", pages: 8, intExt: "INT", dayNight: "DAY", location: "Oficina Central", locationId: "loc5", cast: ["Carlos", "Elena", "Pedro"], extras: 5, status: "scheduled", notes: "" },
  { id: "sc5", number: "5", name: "Persecución en el parque", description: "Secuencia de acción en el parque", pages: 12, intExt: "EXT", dayNight: "DAY", location: "Parque del Retiro", locationId: "loc3", cast: ["María", "Carlos", "Villano"], extras: 20, status: "pending", notes: "Necesita coordinador de especialistas" },
  { id: "sc6", number: "6", name: "Atardecer en la playa", description: "María y Carlos hablan sobre el futuro", pages: 6, intExt: "EXT", dayNight: "SUNSET", location: "Playa de Tarifa", locationId: "loc4", cast: ["María", "Carlos"], extras: 0, status: "pending", notes: "Depende del clima" },
  { id: "sc7", number: "7", name: "Escena nocturna - Club", description: "Encuentro secreto en el club", pages: 5, intExt: "INT", dayNight: "NIGHT", location: "Estudio Principal", locationId: "loc1", cast: ["Carlos", "Informante"], extras: 30, status: "pending", notes: "" },
  { id: "sc8", number: "8", name: "Confrontación final", description: "Enfrentamiento entre protagonistas y villano", pages: 10, intExt: "EXT", dayNight: "NIGHT", location: "Parque del Retiro", locationId: "loc3", cast: ["María", "Carlos", "Villano", "Elena"], extras: 10, status: "pending", notes: "Efectos especiales" },
];

const SAMPLE_SHOOTING_DAYS: ShootingDay[] = [
  { id: "day1", date: "2025-01-15", dayNumber: 1, scenes: ["sc1", "sc2"], location: "Parque del Retiro / Casa", locationId: "loc3", callTime: "05:30", wrapTime: "18:00", status: "completed", totalPages: 6, notes: "", crew: [] },
  { id: "day2", date: "2025-01-16", dayNumber: 2, scenes: ["sc3"], location: "Casa del Protagonista", locationId: "loc2", callTime: "08:00", wrapTime: "16:00", status: "completed", totalPages: 3, notes: "", crew: [] },
  { id: "day3", date: "2025-01-17", dayNumber: 3, scenes: ["sc4"], location: "Oficina Central", locationId: "loc5", callTime: "07:00", wrapTime: "19:00", status: "in-progress", totalPages: 8, notes: "", crew: [] },
  { id: "day4", date: "2025-01-20", dayNumber: 4, scenes: ["sc5"], location: "Parque del Retiro", locationId: "loc3", callTime: "06:00", wrapTime: "20:00", status: "planned", totalPages: 12, notes: "Día de acción", crew: [] },
  { id: "day5", date: "2025-01-22", dayNumber: 5, scenes: ["sc6"], location: "Playa de Tarifa", locationId: "loc4", callTime: "14:00", wrapTime: "21:00", status: "weather-hold", totalPages: 6, notes: "Pendiente de clima", crew: [] },
  { id: "day6", date: "2025-01-24", dayNumber: 6, scenes: ["sc7"], location: "Estudio Principal", locationId: "loc1", callTime: "16:00", wrapTime: "04:00", status: "planned", totalPages: 5, notes: "Rodaje nocturno", crew: [] },
  { id: "day7", date: "2025-01-27", dayNumber: 7, scenes: ["sc8"], location: "Parque del Retiro", locationId: "loc3", callTime: "18:00", wrapTime: "06:00", status: "planned", totalPages: 10, notes: "Rodaje nocturno + FX", crew: [] },
];

export default function PlanningPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Data states
  const [scenes, setScenes] = useState<Scene[]>(SAMPLE_SCENES);
  const [shootingDays, setShootingDays] = useState<ShootingDay[]>(SAMPLE_SHOOTING_DAYS);
  const [locations, setLocations] = useState<Location[]>(SAMPLE_LOCATIONS);

  // UI states
  const [activeView, setActiveView] = useState<"timeline" | "strips" | "calendar">("timeline");
  const [selectedDay, setSelectedDay] = useState<ShootingDay | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [draggedScene, setDraggedScene] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentWeek, setCurrentWeek] = useState(0);

  // Stats
  const [stats, setStats] = useState<ProductionStats>({
    totalScenes: 0,
    scenesShot: 0,
    totalPages: 0,
    pagesShot: 0,
    totalDays: 0,
    daysCompleted: 0,
    avgPagesPerDay: 0,
    onSchedule: true,
    daysAhead: 0,
  });

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    calculateStats();
  }, [scenes, shootingDays]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Add weather to shooting days
      const daysWithWeather = SAMPLE_SHOOTING_DAYS.map(day => ({
        ...day,
        weather: generateWeather(day.date),
      }));
      setShootingDays(daysWithWeather);

    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const totalScenes = scenes.length;
    const scenesShot = scenes.filter(s => s.status === "shot").length;
    const totalPages = scenes.reduce((sum, s) => sum + s.pages, 0);
    const pagesShot = scenes.filter(s => s.status === "shot").reduce((sum, s) => sum + s.pages, 0);
    const totalDays = shootingDays.length;
    const daysCompleted = shootingDays.filter(d => d.status === "completed").length;
    const avgPagesPerDay = daysCompleted > 0 ? pagesShot / daysCompleted : 0;
    
    // Calculate if on schedule (simplified)
    const expectedProgress = (daysCompleted / totalDays) * 100;
    const actualProgress = (pagesShot / totalPages) * 100;
    const onSchedule = actualProgress >= expectedProgress - 5;
    const daysAhead = Math.round((actualProgress - expectedProgress) / (totalPages / totalDays / 8));

    setStats({
      totalScenes,
      scenesShot,
      totalPages,
      pagesShot,
      totalDays,
      daysCompleted,
      avgPagesPerDay: Math.round(avgPagesPerDay * 10) / 10,
      onSchedule,
      daysAhead,
    });
  };

  const getSceneById = (sceneId: string) => scenes.find(s => s.id === sceneId);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "shot":
        return { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" };
      case "in-progress":
        return { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" };
      case "scheduled":
      case "planned":
        return { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" };
      case "weather-hold":
        return { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" };
      case "pending":
        return { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" };
      case "reshoots":
        return { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" };
      default:
        return { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Completado";
      case "shot": return "Rodada";
      case "in-progress": return "En rodaje";
      case "scheduled": return "Programada";
      case "planned": return "Planificado";
      case "weather-hold": return "Pendiente clima";
      case "pending": return "Pendiente";
      case "reshoots": return "Repetir";
      default: return status;
    }
  };

  const getDayNightIcon = (dayNight: string) => {
    switch (dayNight) {
      case "DAY": return <Sun size={14} className="text-amber-500" />;
      case "NIGHT": return <Moon size={14} className="text-indigo-500" />;
      case "SUNSET": return <Sunset size={14} className="text-orange-500" />;
      case "DAWN": return <CloudSun size={14} className="text-pink-500" />;
      default: return <Sun size={14} className="text-amber-500" />;
    }
  };

  const handleDragStart = (sceneId: string) => {
    setDraggedScene(sceneId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnDay = (dayId: string) => {
    if (!draggedScene) return;

    setShootingDays(prev => prev.map(day => {
      if (day.id === dayId && !day.scenes.includes(draggedScene)) {
        const scene = getSceneById(draggedScene);
        return {
          ...day,
          scenes: [...day.scenes, draggedScene],
          totalPages: day.totalPages + (scene?.pages || 0),
        };
      }
      return day;
    }));

    setScenes(prev => prev.map(scene => {
      if (scene.id === draggedScene) {
        return { ...scene, status: "scheduled" };
      }
      return scene;
    }));

    setDraggedScene(null);
  };

  const removeSceneFromDay = (dayId: string, sceneId: string) => {
    setShootingDays(prev => prev.map(day => {
      if (day.id === dayId) {
        const scene = getSceneById(sceneId);
        return {
          ...day,
          scenes: day.scenes.filter(id => id !== sceneId),
          totalPages: day.totalPages - (scene?.pages || 0),
        };
      }
      return day;
    }));

    // Check if scene is scheduled in any other day
    const isInOtherDay = shootingDays.some(d => d.id !== dayId && d.scenes.includes(sceneId));
    if (!isInOtherDay) {
      setScenes(prev => prev.map(scene => {
        if (scene.id === sceneId) {
          return { ...scene, status: "pending" };
        }
        return scene;
      }));
    }
  };

  const openDayDetail = (day: ShootingDay) => {
    setSelectedDay(day);
    setShowDayModal(true);
  };

  const openSceneDetail = (scene: Scene) => {
    setSelectedScene(scene);
    setShowSceneModal(true);
  };

  // Get unscheduled scenes
  const unscheduledScenes = scenes.filter(s => s.status === "pending" || s.status === "reshoots");

  // Calculate pages as fractions (1/8)
  const formatPages = (eighths: number) => {
    const whole = Math.floor(eighths / 8);
    const remainder = eighths % 8;
    if (whole === 0) return `${remainder}/8`;
    if (remainder === 0) return `${whole}`;
    return `${whole} ${remainder}/8`;
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-slate-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
          {/* Film strip decoration */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 relative z-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-violet-200 mb-6">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              <Folder size={14} />
            </Link>
            <ChevronRight size={14} />
            <Link href={`/project/${id}/team`} className="text-sm hover:text-white transition-colors">
              Team
            </Link>
            <ChevronRight size={14} />
            <span className="text-sm text-white font-medium">Planificación</span>
          </div>

          {/* Title */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center border border-white/30">
                <Clapperboard size={26} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-bold tracking-tight ${spaceGrotesk.className}`}>
                  Planificación de Rodaje
                </h1>
                <p className="text-violet-200 text-sm mt-0.5">
                  Stripboard · Timeline · Gestión de jornadas
                </p>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur border border-white/20 rounded-xl text-sm font-medium hover:bg-white/20 transition-all">
                <FileText size={16} />
                Exportar PDF
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white text-violet-700 rounded-xl text-sm font-semibold hover:bg-violet-50 transition-all shadow-lg shadow-violet-900/20">
                <Plus size={16} />
                Nueva jornada
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Film size={18} className="text-violet-300" />
                <span className="text-xs font-medium text-violet-300">Escenas</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{stats.scenesShot}</span>
                <span className="text-sm text-violet-300">/ {stats.totalScenes}</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${(stats.scenesShot / stats.totalScenes) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <FileText size={18} className="text-violet-300" />
                <span className="text-xs font-medium text-violet-300">Páginas</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{formatPages(stats.pagesShot)}</span>
                <span className="text-sm text-violet-300">/ {formatPages(stats.totalPages)}</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${(stats.pagesShot / stats.totalPages) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Calendar size={18} className="text-violet-300" />
                <span className="text-xs font-medium text-violet-300">Jornadas</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{stats.daysCompleted}</span>
                <span className="text-sm text-violet-300">/ {stats.totalDays}</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full transition-all duration-500"
                  style={{ width: `${(stats.daysCompleted / stats.totalDays) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={18} className="text-violet-300" />
                <span className="text-xs font-medium text-violet-300">Media/día</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{stats.avgPagesPerDay}</span>
                <span className="text-sm text-violet-300">págs</span>
              </div>
              <p className="text-xs text-violet-300 mt-1">páginas por jornada</p>
            </div>

            <div className={`backdrop-blur border rounded-xl p-4 ${
              stats.onSchedule 
                ? "bg-emerald-500/20 border-emerald-400/30" 
                : "bg-rose-500/20 border-rose-400/30"
            }`}>
              <div className="flex items-center justify-between mb-2">
                {stats.onSchedule ? (
                  <CheckCircle size={18} className="text-emerald-300" />
                ) : (
                  <AlertTriangle size={18} className="text-rose-300" />
                )}
                <span className="text-xs font-medium text-violet-300">Estado</span>
              </div>
              <p className={`text-lg font-bold ${stats.onSchedule ? "text-emerald-300" : "text-rose-300"}`}>
                {stats.onSchedule ? "En tiempo" : "Retrasado"}
              </p>
              <p className="text-xs text-violet-300 mt-1">
                {stats.daysAhead > 0 ? `+${stats.daysAhead} días adelantado` : stats.daysAhead < 0 ? `${stats.daysAhead} días de retraso` : "En fecha"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* View Tabs */}
          <div className="flex items-center justify-between mb-6">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-1.5 inline-flex gap-1">
              <button
                onClick={() => setActiveView("timeline")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeView === "timeline"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <LayoutGrid size={16} />
                Timeline
              </button>
              <button
                onClick={() => setActiveView("strips")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeView === "strips"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <List size={16} />
                Stripboard
              </button>
              <button
                onClick={() => setActiveView("calendar")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeView === "calendar"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Calendar size={16} />
                Calendario
              </button>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
              >
                <option value="all">Todas las jornadas</option>
                <option value="planned">Planificadas</option>
                <option value="in-progress">En rodaje</option>
                <option value="completed">Completadas</option>
                <option value="weather-hold">Pendiente clima</option>
              </select>
            </div>
          </div>

          {/* Timeline View */}
          {activeView === "timeline" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Unscheduled Scenes Panel */}
              <div className="lg:col-span-1">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm sticky top-24">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className={`font-semibold text-slate-900 flex items-center gap-2 ${spaceGrotesk.className}`}>
                      <Film size={18} className="text-violet-600" />
                      Escenas sin programar
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Arrastra al día correspondiente</p>
                  </div>
                  <div className="p-4 max-h-[600px] overflow-y-auto space-y-2">
                    {unscheduledScenes.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">Todas las escenas programadas</p>
                      </div>
                    ) : (
                      unscheduledScenes.map((scene) => (
                        <div
                          key={scene.id}
                          draggable
                          onDragStart={() => handleDragStart(scene.id)}
                          onClick={() => openSceneDetail(scene)}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-grab active:cursor-grabbing hover:border-violet-300 hover:bg-violet-50 transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-slate-200 rounded-lg group-hover:bg-violet-200 transition-colors">
                              <GripVertical size={14} className="text-slate-400 group-hover:text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                                  {scene.number}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${scene.intExt === "INT" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {scene.intExt}
                                </span>
                                {getDayNightIcon(scene.dayNight)}
                              </div>
                              <p className="text-sm font-medium text-slate-900 truncate">{scene.name}</p>
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <FileText size={12} />
                                  {formatPages(scene.pages)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin size={12} />
                                  {scene.location.split(" ")[0]}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="lg:col-span-3 space-y-4">
                {shootingDays
                  .filter(day => filterStatus === "all" || day.status === filterStatus)
                  .map((day) => {
                    const dayScenes = day.scenes.map(id => getSceneById(id)).filter(Boolean) as Scene[];
                    const statusColors = getStatusColor(day.status);
                    const WeatherIcon = day.weather ? weatherIcons[day.weather.condition]?.icon : Sun;
                    const weatherColors = day.weather ? weatherIcons[day.weather.condition] : weatherIcons.sunny;

                    return (
                      <div
                        key={day.id}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDropOnDay(day.id)}
                        className={`bg-white border-2 rounded-2xl shadow-sm overflow-hidden transition-all ${
                          draggedScene ? "border-dashed border-violet-300 bg-violet-50/50" : "border-slate-200 hover:border-violet-200"
                        }`}
                      >
                        {/* Day Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className={`text-2xl font-bold text-violet-600 ${spaceGrotesk.className}`}>
                                {day.dayNumber}
                              </p>
                              <p className="text-xs text-slate-500 uppercase tracking-wide">Día</p>
                            </div>
                            <div className="w-px h-10 bg-slate-200"></div>
                            <div>
                              <p className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                                {formatDate(day.date)}
                              </p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <MapPin size={12} />
                                  {day.location}
                                </span>
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <Clock size={12} />
                                  {day.callTime} - {day.wrapTime}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            {/* Weather */}
                            {day.weather && (
                              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${weatherColors.bg}`}>
                                <WeatherIcon size={18} className={weatherColors.color} />
                                <div className="text-xs">
                                  <p className="font-semibold text-slate-700">{day.weather.temp}°C</p>
                                  <p className="text-slate-500">{day.weather.wind} km/h</p>
                                </div>
                              </div>
                            )}

                            {/* Status */}
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${statusColors.bg} ${statusColors.text}`}>
                              {getStatusLabel(day.status)}
                            </span>

                            {/* Actions */}
                            <button
                              onClick={() => openDayDetail(day)}
                              className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                            >
                              <Eye size={18} />
                            </button>
                          </div>
                        </div>

                        {/* Scenes Strip */}
                        <div className="p-4">
                          {dayScenes.length === 0 ? (
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center ${
                              draggedScene ? "border-violet-300 bg-violet-50" : "border-slate-200"
                            }`}>
                              <Film size={24} className="text-slate-300 mx-auto mb-2" />
                              <p className="text-sm text-slate-500">
                                {draggedScene ? "Suelta aquí para añadir" : "Sin escenas programadas"}
                              </p>
                            </div>
                          ) : (
                            <div className="flex gap-3 overflow-x-auto pb-2">
                              {dayScenes.map((scene) => {
                                const sceneStatusColors = getStatusColor(scene.status);
                                return (
                                  <div
                                    key={scene.id}
                                    className={`flex-shrink-0 w-56 p-4 rounded-xl border-2 ${sceneStatusColors.border} ${sceneStatusColors.bg} group relative`}
                                  >
                                    <button
                                      onClick={() => removeSceneFromDay(day.id, scene.id)}
                                      className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg"
                                    >
                                      <X size={12} />
                                    </button>

                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-xs font-bold text-violet-600 bg-white px-2 py-0.5 rounded-full shadow-sm">
                                        Esc. {scene.number}
                                      </span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${scene.intExt === "INT" ? "bg-amber-200 text-amber-800" : "bg-emerald-200 text-emerald-800"}`}>
                                        {scene.intExt}
                                      </span>
                                      {getDayNightIcon(scene.dayNight)}
                                    </div>

                                    <p className="text-sm font-semibold text-slate-900 mb-2 line-clamp-2">
                                      {scene.name}
                                    </p>

                                    <div className="flex items-center justify-between text-xs text-slate-600">
                                      <span className="flex items-center gap-1">
                                        <FileText size={12} />
                                        {formatPages(scene.pages)} págs
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Users size={12} />
                                        {scene.cast.length + scene.extras}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Add scene button */}
                              <div className="flex-shrink-0 w-32 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center hover:border-violet-300 hover:bg-violet-50 transition-all cursor-pointer">
                                <Plus size={24} className="text-slate-300" />
                              </div>
                            </div>
                          )}

                          {/* Day Summary */}
                          {dayScenes.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                              <div className="flex items-center gap-6">
                                <span className="text-slate-600">
                                  <span className="font-semibold text-slate-900">{dayScenes.length}</span> escenas
                                </span>
                                <span className="text-slate-600">
                                  <span className="font-semibold text-slate-900">{formatPages(day.totalPages)}</span> páginas
                                </span>
                                <span className="text-slate-600">
                                  <span className="font-semibold text-slate-900">
                                    {dayScenes.reduce((sum, s) => sum + s.cast.length, 0)}
                                  </span> actores
                                </span>
                              </div>
                              {day.notes && (
                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                                  📝 {day.notes}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Stripboard View */}
          {activeView === "strips" && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Escena</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">I/E</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">D/N</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Localización</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Págs</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reparto</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Estado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Día</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scenes.map((scene) => {
                      const statusColors = getStatusColor(scene.status);
                      const scheduledDay = shootingDays.find(d => d.scenes.includes(scene.id));

                      return (
                        <tr
                          key={scene.id}
                          onClick={() => openSceneDetail(scene)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-violet-600 bg-violet-100 px-2 py-1 rounded">
                              {scene.number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-900">{scene.name}</p>
                            <p className="text-xs text-slate-500 truncate max-w-xs">{scene.description}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              scene.intExt === "INT" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {scene.intExt}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {getDayNightIcon(scene.dayNight)}
                              <span className="text-xs text-slate-600">{scene.dayNight}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="text-slate-400" />
                              <span className="text-sm text-slate-700">{scene.location}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-medium text-slate-900">{formatPages(scene.pages)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {scene.cast.slice(0, 3).map((actor, i) => (
                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                  {actor}
                                </span>
                              ))}
                              {scene.cast.length > 3 && (
                                <span className="text-xs text-slate-400">+{scene.cast.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                              {getStatusLabel(scene.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {scheduledDay ? (
                              <span className="text-sm font-bold text-violet-600">
                                Día {scheduledDay.dayNumber}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Calendar View */}
          {activeView === "calendar" && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => setCurrentWeek(prev => prev - 1)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ChevronLeft size={20} className="text-slate-600" />
                </button>
                <h3 className={`text-lg font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                  Enero 2025
                </h3>
                <button
                  onClick={() => setCurrentWeek(prev => prev + 1)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ChevronRight size={20} className="text-slate-600" />
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-4">
                {/* Day headers */}
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
                  <div key={day} className="text-center py-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase">{day}</span>
                  </div>
                ))}

                {/* Calendar days */}
                {Array.from({ length: 35 }, (_, i) => {
                  const dayNum = i - 2 + currentWeek * 7; // Adjust for week offset
                  const dayDate = new Date(2025, 0, dayNum);
                  const dateStr = dayDate.toISOString().split("T")[0];
                  const shootingDay = shootingDays.find(d => d.date === dateStr);
                  const isCurrentMonth = dayDate.getMonth() === 0;

                  return (
                    <div
                      key={i}
                      className={`min-h-[120px] p-2 rounded-xl border-2 transition-all ${
                        shootingDay
                          ? "border-violet-200 bg-violet-50 hover:border-violet-300"
                          : isCurrentMonth
                          ? "border-slate-100 hover:border-slate-200"
                          : "border-transparent bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${
                          isCurrentMonth ? "text-slate-900" : "text-slate-400"
                        }`}>
                          {dayDate.getDate()}
                        </span>
                        {shootingDay && (
                          <span className="text-xs font-bold text-violet-600 bg-violet-200 px-1.5 py-0.5 rounded">
                            D{shootingDay.dayNumber}
                          </span>
                        )}
                      </div>
                      {shootingDay && (
                        <div className="space-y-1">
                          {shootingDay.scenes.slice(0, 2).map((sceneId) => {
                            const scene = getSceneById(sceneId);
                            return scene ? (
                              <div
                                key={sceneId}
                                className="text-xs bg-white p-1.5 rounded border border-violet-200 truncate"
                              >
                                <span className="font-semibold text-violet-600">{scene.number}</span>
                                <span className="text-slate-600 ml-1">{scene.name.substring(0, 15)}...</span>
                              </div>
                            ) : null;
                          })}
                          {shootingDay.scenes.length > 2 && (
                            <p className="text-xs text-violet-600 font-medium text-center">
                              +{shootingDay.scenes.length - 2} más
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Day Detail Modal */}
      {showDayModal && selectedDay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-violet-200 text-sm">Jornada de rodaje</p>
                  <h2 className={`text-2xl font-bold ${spaceGrotesk.className}`}>
                    Día {selectedDay.dayNumber} — {formatFullDate(selectedDay.date)}
                  </h2>
                </div>
                <button
                  onClick={() => setShowDayModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <MapPin size={14} />
                    <span className="text-xs uppercase tracking-wide">Localización</span>
                  </div>
                  <p className="font-semibold text-slate-900">{selectedDay.location}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Clock size={14} />
                    <span className="text-xs uppercase tracking-wide">Horario</span>
                  </div>
                  <p className="font-semibold text-slate-900">{selectedDay.callTime} - {selectedDay.wrapTime}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <FileText size={14} />
                    <span className="text-xs uppercase tracking-wide">Páginas</span>
                  </div>
                  <p className="font-semibold text-slate-900">{formatPages(selectedDay.totalPages)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Film size={14} />
                    <span className="text-xs uppercase tracking-wide">Escenas</span>
                  </div>
                  <p className="font-semibold text-slate-900">{selectedDay.scenes.length}</p>
                </div>
              </div>

              {/* Weather (if exterior) */}
              {selectedDay.weather && (
                <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-xl">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Cloud size={16} className="text-blue-500" />
                    Previsión meteorológica
                  </h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      {(() => {
                        const WeatherIcon = weatherIcons[selectedDay.weather!.condition]?.icon || Sun;
                        return <WeatherIcon size={32} className="text-blue-500 mx-auto mb-1" />;
                      })()}
                      <p className="text-lg font-bold text-slate-900">{selectedDay.weather.temp}°C</p>
                    </div>
                    <div className="text-center">
                      <Wind size={20} className="text-slate-400 mx-auto mb-1" />
                      <p className="text-sm font-medium text-slate-900">{selectedDay.weather.wind} km/h</p>
                      <p className="text-xs text-slate-500">Viento</p>
                    </div>
                    <div className="text-center">
                      <Sunset size={20} className="text-orange-400 mx-auto mb-1" />
                      <p className="text-sm font-medium text-slate-900">{selectedDay.weather.sunrise}</p>
                      <p className="text-xs text-slate-500">Amanecer</p>
                    </div>
                    <div className="text-center">
                      <Moon size={20} className="text-indigo-400 mx-auto mb-1" />
                      <p className="text-sm font-medium text-slate-900">{selectedDay.weather.sunset}</p>
                      <p className="text-xs text-slate-500">Atardecer</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Scenes */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Clapperboard size={16} className="text-violet-500" />
                  Escenas programadas
                </h4>
                <div className="space-y-3">
                  {selectedDay.scenes.map((sceneId) => {
                    const scene = getSceneById(sceneId);
                    if (!scene) return null;
                    const statusColors = getStatusColor(scene.status);

                    return (
                      <div
                        key={sceneId}
                        className="p-4 border border-slate-200 rounded-xl hover:border-violet-200 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <span className="text-lg font-bold text-violet-600 bg-violet-100 px-3 py-1 rounded-lg">
                              {scene.number}
                            </span>
                            <div>
                              <p className="font-semibold text-slate-900">{scene.name}</p>
                              <p className="text-sm text-slate-500 mt-0.5">{scene.description}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  scene.intExt === "INT" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                                }`}>
                                  {scene.intExt}
                                </span>
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  {getDayNightIcon(scene.dayNight)}
                                  {scene.dayNight}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatPages(scene.pages)} páginas
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                            {getStatusLabel(scene.status)}
                          </span>
                        </div>
                        {/* Cast */}
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500 mb-2">Reparto:</p>
                          <div className="flex flex-wrap gap-2">
                            {scene.cast.map((actor, i) => (
                              <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                                {actor}
                              </span>
                            ))}
                            {scene.extras > 0 && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
                                +{scene.extras} extras
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowDayModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Cerrar
              </button>
              <button className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
                <Edit3 size={16} />
                Editar jornada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scene Detail Modal */}
      {showSceneModal && selectedScene && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-bold bg-white/20 px-4 py-2 rounded-xl">
                    {selectedScene.number}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        selectedScene.intExt === "INT" ? "bg-amber-500 text-amber-950" : "bg-emerald-500 text-emerald-950"
                      }`}>
                        {selectedScene.intExt}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-white/20">
                        {selectedScene.dayNight}
                      </span>
                    </div>
                    <h2 className={`text-xl font-bold ${spaceGrotesk.className}`}>
                      {selectedScene.name}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowSceneModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto">
              <p className="text-slate-600 mb-6">{selectedScene.description}</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Localización</p>
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    <MapPin size={16} className="text-violet-500" />
                    {selectedScene.location}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Páginas</p>
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    <FileText size={16} className="text-violet-500" />
                    {formatPages(selectedScene.pages)} páginas
                  </p>
                </div>
              </div>

              {/* Cast */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Reparto</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedScene.cast.map((actor, i) => (
                    <span key={i} className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-full text-sm font-medium">
                      {actor}
                    </span>
                  ))}
                  {selectedScene.extras > 0 && (
                    <span className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                      +{selectedScene.extras} extras
                    </span>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedScene.notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-600 uppercase tracking-wide mb-1 font-semibold">Notas</p>
                  <p className="text-amber-800">{selectedScene.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between">
              <div className="flex items-center gap-2">
                {(() => {
                  const statusColors = getStatusColor(selectedScene.status);
                  return (
                    <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                      {getStatusLabel(selectedScene.status)}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSceneModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
                >
                  Cerrar
                </button>
                <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
                  <Edit3 size={16} />
                  Editar escena
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

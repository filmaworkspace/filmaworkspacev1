"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  X,
  User,
  LogOut,
  Settings,
  Folder,
  LayoutDashboard,
  Users,
  FileText,
  DollarSign,
  BarChart3,
  List,
  Clock,
  Briefcase,
  Info,
  UserCog,
  Building2,
} from "lucide-react";
import { Space_Grotesk, Inter } from "next/font/google";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [userName, setUserName] = useState("Usuario");
  const [projectId, setProjectId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await user.reload();
        setUserName(user.displayName || user.email?.split("@")[0] || "Usuario");
      }
    });

    return () => unsubscribe();
  }, []);

  // Extraer el projectId de la URL
  useEffect(() => {
    const pathParts = pathname.split("/");
    const projectIndex = pathParts.indexOf("project");
    if (projectIndex !== -1 && pathParts[projectIndex + 1]) {
      setProjectId(pathParts[projectIndex + 1]);
    }
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Cerrando sesión");
      router.push("/");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  // Determinar la sección actual
  const isAccountingSection = pathname.includes("/accounting");
  const isTeamSection = pathname.includes("/team") && !pathname.includes("/config");
  const isConfigSection = pathname.includes("/config");

  const currentSection = isAccountingSection
    ? "accounting"
    : isTeamSection
    ? "team"
    : isConfigSection
    ? "config"
    : null;

  const sectionColor =
    currentSection === "accounting"
      ? "text-indigo-600"
      : currentSection === "team"
      ? "text-amber-600"
      : currentSection === "config"
      ? "text-slate-600"
      : "text-slate-600";

  // Determinar qué página de accounting estamos viendo
  const accountingPage = isAccountingSection
    ? pathname.includes("/suppliers")
      ? "suppliers"
      : pathname.includes("/budget")
      ? "budget"
      : pathname.includes("/users")
      ? "users"
      : pathname.includes("/reports")
      ? "reports"
      : "panel"
    : null;

  // Determinar qué página de team estamos viendo
  const teamPage = isTeamSection
    ? pathname.includes("/members")
      ? "members"
      : pathname.includes("/planning")
      ? "planning"
      : pathname.includes("/time-tracking")
      ? "time-tracking"
      : pathname.includes("/documentation")
      ? "documentation"
      : "panel"
    : null;

  // Determinar qué tab de config estamos viendo
  const configTab = isConfigSection
    ? pathname.includes("/users")
      ? "users"
      : pathname.includes("/departments")
      ? "departments"
      : "general"
    : null;

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between ${inter.className}`}
    >
      <Link
        href="/dashboard"
        className={`select-none ${grotesk.className} flex items-center`}
      >
        <h1 className="text-xl font-normal text-slate-500 tracking-tighter">
          workspace
          {currentSection && (
            <span>
              <span className="text-slate-400 font-normal">/</span>
              <span className={`font-semibold ${sectionColor}`}>
                {currentSection}
              </span>
            </span>
          )}
        </h1>
      </Link>

      {/* Menú principal - se muestra cuando NO estamos en secciones específicas */}
      {!isAccountingSection && !isTeamSection && !isConfigSection && (
        <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2 text-sm text-slate-700">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 hover:text-slate-900 transition-colors duration-200"
          >
            <Folder size={16} className="text-slate-600" />
            <span>Proyectos</span>
          </Link>
        </nav>
      )}

      {/* Menú de Config */}
      {isConfigSection && projectId && (
        <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2 text-sm">
          <Link
            href={`/project/${projectId}/config`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              configTab === "general"
                ? "text-slate-900 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Info size={16} />
            <span>General</span>
          </Link>

          <Link
            href={`/project/${projectId}/config/users`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              configTab === "users"
                ? "text-slate-900 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserCog size={16} />
            <span>Usuarios</span>
          </Link>

          <Link
            href={`/project/${projectId}/config/departments`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              configTab === "departments"
                ? "text-slate-900 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Briefcase size={16} />
            <span>Departamentos</span>
          </Link>
        </nav>
      )}

      {/* Menú de Accounting */}
      {isAccountingSection && projectId && (
        <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2 text-sm">
          <Link
            href={`/project/${projectId}/accounting`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              accountingPage === "panel"
                ? "text-indigo-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutDashboard size={16} />
            <span>Panel principal</span>
          </Link>

          <Link
            href={`/project/${projectId}/accounting/suppliers`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              accountingPage === "suppliers"
                ? "text-indigo-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 size={16} />
            <span>Proveedores</span>
          </Link>

          <Link
            href={`/project/${projectId}/accounting/budget`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              accountingPage === "budget"
                ? "text-indigo-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <DollarSign size={16} />
            <span>Presupuesto</span>
          </Link>

          <Link
            href={`/project/${projectId}/accounting/users`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              accountingPage === "users"
                ? "text-indigo-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User size={16} />
            <span>Usuarios</span>
          </Link>

          <Link
            href={`/project/${projectId}/accounting/reports`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              accountingPage === "reports"
                ? "text-indigo-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 size={16} />
            <span>Informes</span>
          </Link>
        </nav>
      )}

      {/* Menú de Team */}
      {isTeamSection && projectId && (
        <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2 text-sm">
          <Link
            href={`/project/${projectId}/team`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              teamPage === "panel"
                ? "text-amber-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutDashboard size={16} />
            <span>Panel principal</span>
          </Link>

          <Link
            href={`/project/${projectId}/team/members`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              teamPage === "members"
                ? "text-amber-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users size={16} />
            <span>Equipo</span>
          </Link>

          <Link
            href={`/project/${projectId}/team/time-tracking`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              teamPage === "time-tracking"
                ? "text-amber-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock size={16} />
            <span>Control horario</span>
          </Link>

          <Link
            href={`/project/${projectId}/team/planning`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              teamPage === "planning"
                ? "text-amber-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List size={16} />
            <span>Planificación</span>
          </Link>

          <Link
            href={`/project/${projectId}/team/documentation`}
            className={`flex items-center gap-2 transition-colors duration-200 ${
              teamPage === "documentation"
                ? "text-amber-700 font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText size={16} />
            <span>Documentación</span>
          </Link>
        </nav>
      )}

      <div className="relative flex items-center">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center gap-3 text-slate-600 hover:text-slate-900 transition"
        >
          <span className="hidden sm:inline text-sm font-medium">
            {userName}
          </span>
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
            <User size={16} />
          </div>
        </button>

        {profileOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setProfileOpen(false)}
          ></div>
        )}

        {profileOpen && (
          <div
            className="absolute right-0 top-full mt-3 w-44 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg py-2 text-sm z-50 animate-fadeIn"
            style={{ animationDuration: "0.2s" }}
          >
            <Link
              href="/profile"
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition"
              onClick={() => setProfileOpen(false)}
            >
              <Settings size={14} /> Configuración
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2 hover:bg-slate-50 text-left text-rose-600 transition"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>

      <button
        className="md:hidden text-slate-700 hover:text-slate-900 transition-colors"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Menú móvil */}
      {menuOpen && (
        <div className="absolute top-full left-0 w-full bg-white/90 backdrop-blur-lg border-b border-slate-200 md:hidden z-40">
          <nav className="flex flex-col py-4 text-sm text-slate-700">
            {!isAccountingSection && !isTeamSection && !isConfigSection ? (
              // Menú móvil normal
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="py-2 hover:text-slate-900 flex items-center justify-center gap-2"
                >
                  <Folder size={16} className="text-slate-600" />
                  Proyectos
                </Link>
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="py-2 hover:text-slate-900 text-center"
                >
                  Configuración
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="py-2 text-rose-600 hover:text-rose-700"
                >
                  Cerrar sesión
                </button>
              </>
            ) : isConfigSection ? (
              // Menú móvil de Config
              <>
                <Link
                  href={`/project/${projectId}/config`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    configTab === "general"
                      ? "text-slate-900 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <Info size={16} />
                  General
                </Link>
                <Link
                  href={`/project/${projectId}/config/users`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    configTab === "users"
                      ? "text-slate-900 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <UserCog size={16} />
                  Usuarios
                </Link>
                <Link
                  href={`/project/${projectId}/config/departments`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    configTab === "departments"
                      ? "text-slate-900 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <Briefcase size={16} />
                  Departamentos
                </Link>
                <div className="border-t border-slate-200 mt-2 pt-2">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="py-2 hover:text-slate-900 text-center block"
                  >
                    Configuración
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                    className="py-2 text-rose-600 hover:text-rose-700 w-full"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </>
            ) : isAccountingSection ? (
              // Menú móvil de Accounting
              <>
                <Link
                  href={`/project/${projectId}/accounting`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    accountingPage === "panel"
                      ? "text-indigo-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <LayoutDashboard size={16} />
                  Panel principal
                </Link>
                <Link
                  href={`/project/${projectId}/accounting/suppliers`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    accountingPage === "suppliers"
                      ? "text-indigo-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <Users size={16} />
                  Proveedores
                </Link>
                <Link
                  href={`/project/${projectId}/accounting/budget`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    accountingPage === "budget"
                      ? "text-indigo-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <DollarSign size={16} />
                  Presupuesto
                </Link>
                <Link
                  href={`/project/${projectId}/accounting/users`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    accountingPage === "users"
                      ? "text-indigo-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <User size={16} />
                  Usuarios
                </Link>
                <Link
                  href={`/project/${projectId}/accounting/reports`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    accountingPage === "reports"
                      ? "text-indigo-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <BarChart3 size={16} />
                  Informes
                </Link>
                <div className="border-t border-slate-200 mt-2 pt-2">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="py-2 hover:text-slate-900 text-center block"
                  >
                    Configuración
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                    className="py-2 text-rose-600 hover:text-rose-700 w-full"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </>
            ) : (
              // Menú móvil de Team
              <>
                <Link
                  href={`/project/${projectId}/team`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    teamPage === "panel"
                      ? "text-amber-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <LayoutDashboard size={16} />
                  Panel principal
                </Link>
                <Link
                  href={`/project/${projectId}/team/members`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    teamPage === "members"
                      ? "text-amber-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <Users size={16} />
                  Equipo
                </Link>
                <Link
                  href={`/project/${projectId}/team/time-tracking`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    teamPage === "time-tracking"
                      ? "text-amber-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <Clock size={16} />
                  Control horario
                </Link>
                <Link
                  href={`/project/${projectId}/team/planning`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    teamPage === "planning"
                      ? "text-amber-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <List size={16} />
                  Planificación
                </Link>
                <Link
                  href={`/project/${projectId}/team/documentation`}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 flex items-center justify-center gap-2 ${
                    teamPage === "documentation"
                      ? "text-amber-700 font-medium"
                      : "hover:text-slate-900"
                  }`}
                >
                  <FileText size={16} />
                  Documentación
                </Link>
                <div className="border-t border-slate-200 mt-2 pt-2">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="py-2 hover:text-slate-900 text-center block"
                  >
                    Configuración
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                    className="py-2 text-rose-600 hover:text-rose-700 w-full"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </nav>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </header>
  );
}

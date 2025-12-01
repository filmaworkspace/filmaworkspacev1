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
  ChevronDown,
} from "lucide-react";
import { Space_Grotesk, Inter } from "next/font/google";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [accountingAccess, setAccountingAccess] = useState({
    panel: false,
    suppliers: false,
    budget: false,
    users: false,
    reports: false,
  });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await user.reload();
        setUserName(user.displayName || user.email?.split("@")[0] || "Usuario");
        setUserId(user.uid);
      } else {
        setUserId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const pathParts = pathname.split("/");
    const projectIndex = pathParts.indexOf("project");
    if (projectIndex !== -1 && pathParts[projectIndex + 1]) {
      setProjectId(pathParts[projectIndex + 1]);
    } else {
      setProjectId(null);
    }
  }, [pathname]);

  useEffect(() => {
    const loadAccountingPermissions = async () => {
      if (!userId || !projectId) {
        setAccountingAccess({ panel: false, suppliers: false, budget: false, users: false, reports: false });
        return;
      }

      try {
        const memberRef = doc(db, `projects/${projectId}/members`, userId);
        const memberSnap = await getDoc(memberRef);

        if (memberSnap.exists()) {
          const memberData = memberSnap.data();
          const hasAccountingPermission = memberData.permissions?.accounting || false;

          if (!hasAccountingPermission) {
            setAccountingAccess({ panel: false, suppliers: false, budget: false, users: false, reports: false });
            return;
          }

          const accessLevel = memberData.accountingAccessLevel || "user";
          const accessLevels = {
            user: { panel: true, suppliers: true, budget: false, users: false, reports: false },
            accounting: { panel: true, suppliers: true, budget: false, users: false, reports: true },
            accounting_extended: { panel: true, suppliers: true, budget: true, users: true, reports: true },
          };

          setAccountingAccess(accessLevels[accessLevel as keyof typeof accessLevels] || accessLevels.user);
        } else {
          setAccountingAccess({ panel: false, suppliers: false, budget: false, users: false, reports: false });
        }
      } catch (error) {
        console.error("Error cargando permisos:", error);
        setAccountingAccess({ panel: false, suppliers: false, budget: false, users: false, reports: false });
      }
    };

    loadAccountingPermissions();
  }, [userId, projectId]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const isAccountingSection = pathname.includes("/accounting");
  const isTeamSection = pathname.includes("/team") && !pathname.includes("/config");
  const isConfigSection = pathname.includes("/config");

  const currentSection = isAccountingSection ? "accounting" : isTeamSection ? "team" : isConfigSection ? "config" : null;

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

  const configTab = isConfigSection ? (pathname.includes("/users") ? "users" : pathname.includes("/departments") ? "departments" : "general") : null;

  const NavLink = ({ href, isActive, children }: { href: string; isActive: boolean; children: React.ReactNode }) => (
    <Link
      href={href}
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
        isActive ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );

  return (
    <header className={`fixed top-0 left-0 w-full z-50 bg-white border-b border-slate-200 ${inter.className}`}>
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Logo - Solo texto */}
        <Link href="/dashboard" className={`select-none ${grotesk.className} flex items-center`}>
          <span className="text-slate-500 font-normal tracking-tighter">workspace</span>
          {currentSection && (
            <>
              <span className="text-slate-300 mx-2">/</span>
              <span className="text-slate-500 font-semibold tracking-tighter">{currentSection}</span>
            </>
          )}
        </Link>

        {/* Navigation - Desktop */}
        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {/* Default Menu */}
          {!isAccountingSection && !isTeamSection && !isConfigSection && (
            <NavLink href="/dashboard" isActive={pathname === "/dashboard"}>
              <Folder size={15} />
              <span>Proyectos</span>
            </NavLink>
          )}

          {/* Config Menu */}
          {isConfigSection && projectId && (
            <>
              <NavLink href={`/project/${projectId}/config`} isActive={configTab === "general"}>
                <Info size={15} />
                <span>General</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/config/users`} isActive={configTab === "users"}>
                <UserCog size={15} />
                <span>Usuarios</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/config/departments`} isActive={configTab === "departments"}>
                <Briefcase size={15} />
                <span>Departamentos</span>
              </NavLink>
            </>
          )}

          {/* Accounting Menu */}
          {isAccountingSection && projectId && (
            <>
              {accountingAccess.panel && (
                <NavLink href={`/project/${projectId}/accounting`} isActive={accountingPage === "panel"}>
                  <LayoutDashboard size={15} />
                  <span>Panel</span>
                </NavLink>
              )}
              {accountingAccess.suppliers && (
                <NavLink href={`/project/${projectId}/accounting/suppliers`} isActive={accountingPage === "suppliers"}>
                  <Building2 size={15} />
                  <span>Proveedores</span>
                </NavLink>
              )}
              {accountingAccess.budget && (
                <NavLink href={`/project/${projectId}/accounting/budget`} isActive={accountingPage === "budget"}>
                  <DollarSign size={15} />
                  <span>Presupuesto</span>
                </NavLink>
              )}
              {accountingAccess.users && (
                <NavLink href={`/project/${projectId}/accounting/users`} isActive={accountingPage === "users"}>
                  <User size={15} />
                  <span>Usuarios</span>
                </NavLink>
              )}
              {accountingAccess.reports && (
                <NavLink href={`/project/${projectId}/accounting/reports`} isActive={accountingPage === "reports"}>
                  <BarChart3 size={15} />
                  <span>Informes</span>
                </NavLink>
              )}
            </>
          )}

          {/* Team Menu */}
          {isTeamSection && projectId && (
            <>
              <NavLink href={`/project/${projectId}/team`} isActive={teamPage === "panel"}>
                <LayoutDashboard size={15} />
                <span>Panel</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/team/members`} isActive={teamPage === "members"}>
                <Users size={15} />
                <span>Equipo</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/team/time-tracking`} isActive={teamPage === "time-tracking"}>
                <Clock size={15} />
                <span>Horarios</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/team/planning`} isActive={teamPage === "planning"}>
                <List size={15} />
                <span>Planificación</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/team/documentation`} isActive={teamPage === "documentation"}>
                <FileText size={15} />
                <span>Documentos</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Profile - Desktop */}
        <div className="relative flex items-center gap-3">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
              <User size={14} />
            </div>
            <span className="hidden sm:inline text-sm font-medium text-slate-700">{userName}</span>
            <ChevronDown size={14} className={`hidden sm:block text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {profileOpen && <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)}></div>}

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-sm z-50 animate-fadeIn">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs text-slate-400">Sesión iniciada como</p>
                <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
              </div>
              <Link href="/profile" className="flex items-center gap-2.5 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition" onClick={() => setProfileOpen(false)}>
                <Settings size={14} />
                Configuración
              </Link>
              <button onClick={handleLogout} className="flex w-full items-center gap-2.5 px-3 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 text-left transition">
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white">
          <nav className="flex flex-col p-3 gap-1">
            {!isAccountingSection && !isTeamSection && !isConfigSection ? (
              <>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50">
                  <Folder size={16} />
                  Proyectos
                </Link>
                <div className="border-t border-slate-100 my-2"></div>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50">
                  <Settings size={16} />
                  Configuración
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 text-left"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </>
            ) : isConfigSection ? (
              <>
                <Link
                  href={`/project/${projectId}/config`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${configTab === "general" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <Info size={16} />
                  General
                </Link>
                <Link
                  href={`/project/${projectId}/config/users`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${configTab === "users" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <UserCog size={16} />
                  Usuarios
                </Link>
                <Link
                  href={`/project/${projectId}/config/departments`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${configTab === "departments" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <Briefcase size={16} />
                  Departamentos
                </Link>
                <div className="border-t border-slate-100 my-2"></div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 text-left"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </>
            ) : isAccountingSection ? (
              <>
                {accountingAccess.panel && (
                  <Link
                    href={`/project/${projectId}/accounting`}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${accountingPage === "panel" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                  >
                    <LayoutDashboard size={16} />
                    Panel
                  </Link>
                )}
                {accountingAccess.suppliers && (
                  <Link
                    href={`/project/${projectId}/accounting/suppliers`}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${accountingPage === "suppliers" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                  >
                    <Building2 size={16} />
                    Proveedores
                  </Link>
                )}
                {accountingAccess.budget && (
                  <Link
                    href={`/project/${projectId}/accounting/budget`}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${accountingPage === "budget" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                  >
                    <DollarSign size={16} />
                    Presupuesto
                  </Link>
                )}
                {accountingAccess.users && (
                  <Link
                    href={`/project/${projectId}/accounting/users`}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${accountingPage === "users" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                  >
                    <User size={16} />
                    Usuarios
                  </Link>
                )}
                {accountingAccess.reports && (
                  <Link
                    href={`/project/${projectId}/accounting/reports`}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${accountingPage === "reports" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                  >
                    <BarChart3 size={16} />
                    Informes
                  </Link>
                )}
                <div className="border-t border-slate-100 my-2"></div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 text-left"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/project/${projectId}/team`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${teamPage === "panel" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <LayoutDashboard size={16} />
                  Panel
                </Link>
                <Link
                  href={`/project/${projectId}/team/members`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${teamPage === "members" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <Users size={16} />
                  Equipo
                </Link>
                <Link
                  href={`/project/${projectId}/team/time-tracking`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${teamPage === "time-tracking" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <Clock size={16} />
                  Horarios
                </Link>
                <Link
                  href={`/project/${projectId}/team/planning`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${teamPage === "planning" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <List size={16} />
                  Planificación
                </Link>
                <Link
                  href={`/project/${projectId}/team/documentation`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${teamPage === "documentation" ? "text-slate-900 bg-slate-100 font-medium" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}
                >
                  <FileText size={16} />
                  Documentos
                </Link>
                <div className="border-t border-slate-100 my-2"></div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 text-left"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </>
            )}
          </nav>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
      `}</style>
    </header>
  );
}

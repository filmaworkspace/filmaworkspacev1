"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useParams } from "next/navigation";
import { Inter } from "next/font/google";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  LogOut,
  User,
  ChevronDown,
  Settings,
  BarChart3,
  Users,
  Folder,
  LayoutDashboard,
  Building2,
  Wallet,
  UserCog,
  Shield,
  Info,
  Briefcase,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function Header() {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params?.id as string | undefined;
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [accountingAccess, setAccountingAccess] = useState({ panel: false, suppliers: false, budget: false, users: false, reports: false });
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdminSection = pathname?.startsWith("/admin");
  const isAccountingSection = pathname?.includes("/accounting");
  const isTeamSection = pathname?.includes("/team");
  const isConfigSection = pathname?.includes("/config");

  const configTab = isConfigSection
    ? pathname?.includes("/users") ? "users" : pathname?.includes("/departments") ? "departments" : "general"
    : null;
  const accountingPage = isAccountingSection
    ? pathname?.includes("/suppliers") ? "suppliers" : pathname?.includes("/budget") ? "budget" : pathname?.includes("/users") ? "users" : pathname?.includes("/reports") ? "reports" : "panel"
    : null;

  // Detectar sección actual
  const getCurrentSection = () => {
    if (isConfigSection) return "config";
    if (isAccountingSection) return "accounting";
    if (isTeamSection) return "team";
    return null;
  };
  const currentSection = getCurrentSection();

  const sectionLabels: Record<string, string> = {
    config: "Config",
    accounting: "Accounting",
    team: "Team"
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          setUserName(snap.data().name || u.email || "Usuario");
          setIsAdmin(snap.data().isAdmin || false);
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (projectId && user) {
      const loadProject = async () => {
        const projectSnap = await getDoc(doc(db, "projects", projectId));
        if (projectSnap.exists()) setProjectName(projectSnap.data().name || "");
        const memberSnap = await getDoc(doc(db, `projects/${projectId}/members`, user.uid));
        if (memberSnap.exists()) {
          const d = memberSnap.data();
          const role = d.role || "";
          const accessLevel = d.accountingAccessLevel || "user";
          const isExtended = accessLevel === "accounting_extended";
          const hasAccounting = d.permissions?.accounting || false;
          if (hasAccounting || ["EP", "PM", "Controller"].includes(role)) {
            setAccountingAccess({ panel: true, suppliers: true, budget: isExtended || ["EP", "PM"].includes(role), users: isExtended || ["EP", "PM"].includes(role), reports: isExtended || ["EP", "PM"].includes(role) });
          }
        }
      };
      loadProject();
    }
  }, [projectId, user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  // NavLink con fondo sutil redondeado
  const NavLink = ({ href, isActive, children }: { href: string; isActive: boolean; children: React.ReactNode }) => (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all ${
        isActive 
          ? "text-slate-900 bg-slate-100 font-medium" 
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );

  // Project Badge con sección actual
  const ProjectBadge = () => {
    if (!projectId || !projectName) return null;

    return (
      <div className="hidden md:flex items-center gap-2 text-[11px]">
        <span className="text-slate-300">·</span>
        <span className="text-slate-600 font-medium">{projectName}</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-400">{currentSection ? sectionLabels[currentSection] : ""}</span>
      </div>
    );
  };

  // Section Switcher - iconos para cambiar entre secciones
  const SectionSwitcher = () => {
    if (!projectId) return null;
    
    return (
      <div className="hidden md:flex items-center gap-1 ml-auto mr-4">
        <Link
          href={`/project/${projectId}/config`}
          className={`p-1.5 rounded-lg transition-all ${
            isConfigSection 
              ? "bg-slate-200 text-slate-700" 
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
          title="Config"
        >
          <Settings size={14} />
        </Link>
        <Link
          href={`/project/${projectId}/accounting`}
          className={`p-1.5 rounded-lg transition-all`}
          style={isAccountingSection 
            ? { backgroundColor: 'rgba(47, 82, 224, 0.15)', color: '#2F52E0' } 
            : { color: '#64748b' }
          }
          title="Accounting"
        >
          <BarChart3 size={14} />
        </Link>
        <Link
          href={`/project/${projectId}/team`}
          className={`p-1.5 rounded-lg transition-all`}
          style={isTeamSection 
            ? { backgroundColor: 'rgba(137, 211, 34, 0.2)', color: '#6BA319' } 
            : { color: '#64748b' }
          }
          title="Team"
        >
          <Users size={14} />
        </Link>
      </div>
    );
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200 ${inter.className}`}>
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex items-center h-[4.5rem]">
          {/* Logo + Project Badge */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/dashboard">
              <Image src="/filma-logo.svg" alt="Filma" width={80} height={28} priority />
            </Link>
            <ProjectBadge />
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1 ml-8">
          {/* Default Menu */}
          {!isAdminSection && !isAccountingSection && !isTeamSection && !isConfigSection && (
            <>
              <NavLink href="/dashboard" isActive={pathname === "/dashboard"}>
                <Folder size={14} />
                <span>Proyectos</span>
              </NavLink>
              {isAdmin && (
                <NavLink href="/admin" isActive={false}>
                  <Shield size={14} />
                  <span>Admin</span>
                </NavLink>
              )}
            </>
          )}

          {/* Admin Menu */}
          {isAdminSection && (
            <NavLink href="/admin" isActive={true}>
              <Shield size={14} />
              <span>Panel de administración</span>
            </NavLink>
          )}

          {/* Config Menu */}
          {isConfigSection && projectId && (
            <>
              <NavLink href={`/project/${projectId}/config`} isActive={configTab === "general"}>
                <Info size={14} />
                <span>General</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/config/users`} isActive={configTab === "users"}>
                <UserCog size={14} />
                <span>Usuarios</span>
              </NavLink>
              <NavLink href={`/project/${projectId}/config/departments`} isActive={configTab === "departments"}>
                <Briefcase size={14} />
                <span>Departamentos</span>
              </NavLink>
            </>
          )}

          {/* Accounting Menu */}
          {isAccountingSection && projectId && (
            <>
              {accountingAccess.panel && (
                <NavLink href={`/project/${projectId}/accounting`} isActive={accountingPage === "panel"}>
                  <LayoutDashboard size={14} />
                  <span>Panel</span>
                </NavLink>
              )}
              {accountingAccess.suppliers && (
                <NavLink href={`/project/${projectId}/accounting/suppliers`} isActive={accountingPage === "suppliers"}>
                  <Building2 size={14} />
                  <span>Proveedores</span>
                </NavLink>
              )}
              {accountingAccess.budget && (
                <NavLink href={`/project/${projectId}/accounting/budget`} isActive={accountingPage === "budget"}>
                  <Wallet size={14} />
                  <span>Presupuesto</span>
                </NavLink>
              )}
              {accountingAccess.users && (
                <NavLink href={`/project/${projectId}/accounting/users`} isActive={accountingPage === "users"}>
                  <UserCog size={14} />
                  <span>Usuarios</span>
                </NavLink>
              )}
              {accountingAccess.reports && (
                <NavLink href={`/project/${projectId}/accounting/reports`} isActive={accountingPage === "reports"}>
                  <BarChart3 size={14} />
                  <span>Informes</span>
                </NavLink>
              )}
            </>
          )}

          {/* Team Menu */}
          {isTeamSection && projectId && (
            <NavLink href={`/project/${projectId}/team`} isActive={true}>
              <Users size={14} />
              <span>Equipo</span>
            </NavLink>
          )}
          </nav>

          {/* Section Switcher + User Menu */}
          <div className="flex items-center ml-auto">
            <SectionSwitcher />
            
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <span className="text-xs font-semibold text-slate-600">
                    {userName?.[0]?.toUpperCase() || "U"}
                  </span>
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showUserMenu ? "rotate-180" : ""}`} />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/profile"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <User size={16} className="text-slate-400" />
                      Mi perfil
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={16} />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

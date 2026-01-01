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

  // Pill Link component - diseño redondeado tipo pill
  const PillLink = ({ href, isActive, children, icon: Icon }: { href: string; isActive: boolean; children: React.ReactNode; icon?: any }) => (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        isActive 
          ? "bg-slate-900 text-white" 
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
      }`}
    >
      {Icon && <Icon size={12} />}
      {children}
    </Link>
  );

  // Section Switcher - iconos para cambiar entre secciones del proyecto
  const SectionSwitcher = () => {
    if (!projectId) return null;
    
    return (
      <div className="flex items-center gap-1 ml-4 pl-4 border-l border-slate-200">
        <Link
          href={`/project/${projectId}/config`}
          className={`p-2 rounded-lg transition-all ${
            isConfigSection 
              ? "bg-slate-900 text-white" 
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
          title="Configuración"
        >
          <Settings size={16} />
        </Link>
        <Link
          href={`/project/${projectId}/accounting`}
          className={`p-2 rounded-lg transition-all ${
            isAccountingSection 
              ? "text-white" 
              : "hover:bg-slate-100"
          }`}
          style={isAccountingSection ? { backgroundColor: '#2F52E0' } : { color: '#2F52E0' }}
          title="Contabilidad"
        >
          <BarChart3 size={16} />
        </Link>
        <Link
          href={`/project/${projectId}/team`}
          className={`p-2 rounded-lg transition-all ${
            isTeamSection 
              ? "text-white" 
              : "hover:bg-slate-100"
          }`}
          style={isTeamSection ? { backgroundColor: '#6BA319' } : { color: '#6BA319' }}
          title="Equipo"
        >
          <Users size={16} />
        </Link>
      </div>
    );
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200 ${inter.className}`}>
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex items-center justify-between h-[4.5rem]">
          {/* Left: Logo + Project Context + Section Switcher */}
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex-shrink-0">
              <Image src="/filma-logo.svg" alt="Filma" width={80} height={28} priority />
            </Link>

            {/* Project Context Badge */}
            {projectId && projectName && (
              <div className="hidden md:flex items-center">
                <span className="text-slate-300 mx-2">·</span>
                <span className="text-xs font-medium text-slate-600">{projectName}</span>
              </div>
            )}

            {/* Section Switcher */}
            <SectionSwitcher />
          </div>

          {/* Center: Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {/* Default Menu */}
            {!isAdminSection && !isAccountingSection && !isTeamSection && !isConfigSection && (
              <>
                <PillLink href="/dashboard" isActive={pathname === "/dashboard"} icon={Folder}>
                  Proyectos
                </PillLink>
                {isAdmin && (
                  <PillLink href="/admin" isActive={false} icon={Shield}>
                    Admin
                  </PillLink>
                )}
              </>
            )}

            {/* Admin Menu */}
            {isAdminSection && (
              <PillLink href="/admin" isActive={true} icon={Shield}>
                Panel de administración
              </PillLink>
            )}

            {/* Config Menu */}
            {isConfigSection && projectId && (
              <>
                <PillLink href={`/project/${projectId}/config`} isActive={configTab === "general"} icon={Info}>
                  General
                </PillLink>
                <PillLink href={`/project/${projectId}/config/users`} isActive={configTab === "users"} icon={UserCog}>
                  Usuarios
                </PillLink>
                <PillLink href={`/project/${projectId}/config/departments`} isActive={configTab === "departments"} icon={Briefcase}>
                  Departamentos
                </PillLink>
              </>
            )}

            {/* Accounting Menu */}
            {isAccountingSection && projectId && (
              <>
                {accountingAccess.panel && (
                  <PillLink href={`/project/${projectId}/accounting`} isActive={accountingPage === "panel"} icon={LayoutDashboard}>
                    Panel
                  </PillLink>
                )}
                {accountingAccess.suppliers && (
                  <PillLink href={`/project/${projectId}/accounting/suppliers`} isActive={accountingPage === "suppliers"} icon={Building2}>
                    Proveedores
                  </PillLink>
                )}
                {accountingAccess.budget && (
                  <PillLink href={`/project/${projectId}/accounting/budget`} isActive={accountingPage === "budget"} icon={Wallet}>
                    Presupuesto
                  </PillLink>
                )}
                {accountingAccess.users && (
                  <PillLink href={`/project/${projectId}/accounting/users`} isActive={accountingPage === "users"} icon={UserCog}>
                    Usuarios
                  </PillLink>
                )}
                {accountingAccess.reports && (
                  <PillLink href={`/project/${projectId}/accounting/reports`} isActive={accountingPage === "reports"} icon={BarChart3}>
                    Informes
                  </PillLink>
                )}
              </>
            )}

            {/* Team Menu */}
            {isTeamSection && projectId && (
              <PillLink href={`/project/${projectId}/team`} isActive={true} icon={Users}>
                Equipo
              </PillLink>
            )}
          </nav>

          {/* Right: User Menu */}
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
    </header>
  );
}

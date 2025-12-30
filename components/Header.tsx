"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  X,
  Users,
  LogOut,
  Settings,
  Folder,
  LayoutDashboard,
  Wallet,
  BarChart3,
  Briefcase,
  Info,
  UserCog,
  Building2,
  Shield,
  User,
} from "lucide-react";
import { Inter } from "next/font/google";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useUser } from "@/contexts/UserContext";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState({
    config: false,
    accounting: false,
    team: false,
  });
  const [accountingAccess, setAccountingAccess] = useState({
    panel: false,
    suppliers: false,
    budget: false,
    users: false,
    reports: false,
  });
  const router = useRouter();
  const pathname = usePathname();
  
  const { user, isLoading } = useUser();
  const userName = user?.name || "Usuario";
  const userInitial = userName.charAt(0).toUpperCase();
  const isAdmin = user?.role === "admin";

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
    const loadPermissions = async () => {
      if (!user?.uid || !projectId) {
        setPermissions({ config: false, accounting: false, team: false });
        setAccountingAccess({ panel: false, suppliers: false, budget: false, users: false, reports: false });
        return;
      }

      try {
        const userProjectRef = doc(db, `userProjects/${user.uid}/projects`, projectId);
        const userProjectSnap = await getDoc(userProjectRef);

        if (userProjectSnap.exists()) {
          const userProjectData = userProjectSnap.data();
          setPermissions({
            config: userProjectData.permissions?.config || false,
            accounting: userProjectData.permissions?.accounting || false,
            team: userProjectData.permissions?.team || false,
          });
        }

        const memberRef = doc(db, `projects/${projectId}/members`, user.uid);
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
            visitor: { panel: true, suppliers: false, budget: false, users: false, reports: false },
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
        setPermissions({ config: false, accounting: false, team: false });
        setAccountingAccess({ panel: false, suppliers: false, budget: false, users: false, reports: false });
      }
    };

    loadPermissions();
  }, [user?.uid, projectId]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const isAdminSection = pathname.includes("/admin");
  const isAccountingSection = pathname.includes("/accounting");
  const isTeamSection = pathname.includes("/team") && !pathname.includes("/config");
  const isConfigSection = pathname.includes("/config");
  const isInProjectSection = isAccountingSection || isTeamSection || isConfigSection;

  const currentSection = isAdminSection ? "admin" : isAccountingSection ? "accounting" : isTeamSection ? "team" : isConfigSection ? "config" : null;

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

  const configTab = isConfigSection ? (pathname.includes("/users") ? "users" : pathname.includes("/departments") ? "departments" : "general") : null;

  const NavLink = ({ href, isActive, children }: { href: string; isActive: boolean; children: React.ReactNode }) => (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
        isActive ? "font-medium" : "hover:opacity-70"
      }`}
      style={{ 
        color: '#463E39',
        backgroundColor: isActive ? 'rgba(70, 62, 57, 0.1)' : 'transparent'
      }}
    >
      {children}
    </Link>
  );

  const SectionSwitcher = () => {
    if (!isInProjectSection || !projectId) return null;

    const sections = [
      { key: "config", href: `/project/${projectId}/config`, icon: Settings, label: "Config", hasAccess: permissions.config },
      { key: "accounting", href: `/project/${projectId}/accounting`, icon: BarChart3, label: "Accounting", hasAccess: permissions.accounting },
      { key: "team", href: `/project/${projectId}/team`, icon: Users, label: "Team", hasAccess: permissions.team },
    ];

    const availableSections = sections.filter(s => s.hasAccess && s.key !== currentSection);

    if (availableSections.length === 0) return null;

    return (
      <div className="flex items-center gap-0.5 mr-2 pr-2 border-r" style={{ borderColor: 'rgba(70, 62, 57, 0.2)' }}>
        {availableSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.key}
              href={section.href}
              className="p-2 rounded-lg transition-colors hover:opacity-70"
              style={{ color: 'rgba(70, 62, 57, 0.5)' }}
              title={section.label}
            >
              <Icon size={16} />
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <header className={`fixed top-0 left-0 w-full z-50 border-b ${inter.className}`} style={{ backgroundColor: '#F4F3EE', borderColor: 'rgba(70, 62, 57, 0.1)' }}>
      <div className="px-6 py-2.5 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="select-none flex items-center gap-2">
          <Image
            src="/header/headerlogo.svg"
            alt="Logo"
            width={100}
            height={24}
            priority
          />
          {currentSection && (
            <>
              <span style={{ color: 'rgba(70, 62, 57, 0.3)' }}>/</span>
              <span className="text-sm font-medium" style={{ color: '#463E39' }}>
                {currentSection}
              </span>
            </>
          )}
        </Link>

        {/* Navigation - Desktop */}
        <nav className="hidden md:flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
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

        {/* Right side: Section switcher + Profile */}
        <div className="relative flex items-center gap-1">
          {/* Section Switcher - Desktop */}
          <div className="hidden md:flex">
            <SectionSwitcher />
          </div>

          {/* Profile Avatar */}
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors hover:opacity-80"
            style={{ backgroundColor: '#463E39', color: '#F4F3EE' }}
          >
            {userInitial}
          </button>

          {profileOpen && <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)}></div>}

          {profileOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 border rounded-xl shadow-lg py-1 text-xs z-50 animate-fadeIn" style={{ backgroundColor: '#F4F3EE', borderColor: 'rgba(70, 62, 57, 0.1)' }}>
              <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(70, 62, 57, 0.1)' }}>
                <p className="font-medium truncate" style={{ color: '#463E39' }}>{userName}</p>
                {isAdmin && (
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'rgba(70, 62, 57, 0.1)', color: '#463E39' }}>
                    Admin
                  </span>
                )}
              </div>
              {isAdmin && (
                <Link href="/admin" className="flex items-center gap-2 px-3 py-2 transition hover:opacity-70" style={{ color: '#463E39' }} onClick={() => setProfileOpen(false)}>
                  <Shield size={13} />
                  Administración
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-2 px-3 py-2 transition hover:opacity-70" style={{ color: '#463E39' }} onClick={() => setProfileOpen(false)}>
                <User size={13} />
                Mi cuenta
              </Link>
              <div className="my-0.5" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }} />
              <button onClick={handleLogout} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:opacity-70 text-red-600">
                <LogOut size={13} />
                Cerrar sesión
              </button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2 rounded-lg transition hover:opacity-70" 
            style={{ color: '#463E39' }}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t" style={{ backgroundColor: '#F4F3EE', borderColor: 'rgba(70, 62, 57, 0.1)' }}>
          <nav className="flex flex-col p-2 gap-0.5">
            {/* Section Switcher - Mobile */}
            {isInProjectSection && projectId && (
              <>
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider" style={{ color: 'rgba(70, 62, 57, 0.4)' }}>Ir a sección</p>
                <div className="flex gap-1.5 px-2 py-1.5 mb-1">
                  {permissions.config && currentSection !== "config" && (
                    <Link
                      href={`/project/${projectId}/config`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border"
                      style={{ color: '#463E39', borderColor: 'rgba(70, 62, 57, 0.2)' }}
                    >
                      <Settings size={14} />
                      Config
                    </Link>
                  )}
                  {permissions.accounting && currentSection !== "accounting" && (
                    <Link
                      href={`/project/${projectId}/accounting`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border"
                      style={{ color: '#463E39', borderColor: 'rgba(70, 62, 57, 0.2)' }}
                    >
                      <BarChart3 size={14} />
                      Accounting
                    </Link>
                  )}
                  {permissions.team && currentSection !== "team" && (
                    <Link
                      href={`/project/${projectId}/team`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border"
                      style={{ color: '#463E39', borderColor: 'rgba(70, 62, 57, 0.2)' }}
                    >
                      <Users size={14} />
                      Team
                    </Link>
                  )}
                </div>
                <div className="my-1" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }}></div>
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider" style={{ color: 'rgba(70, 62, 57, 0.4)' }}>En esta sección</p>
              </>
            )}

            {!isAdminSection && !isAccountingSection && !isTeamSection && !isConfigSection ? (
              <>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: '#463E39' }}>
                  <Folder size={14} />
                  Proyectos
                </Link>
                {isAdmin && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: '#463E39' }}>
                    <Shield size={14} />
                    Administración
                  </Link>
                )}
                <div className="my-1" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }}></div>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: '#463E39' }}>
                  <User size={14} />
                  Mi cuenta
                </Link>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left text-red-600">
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </>
            ) : isAdminSection ? (
              <>
                <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ color: '#463E39', backgroundColor: 'rgba(70, 62, 57, 0.1)' }}>
                  <Shield size={14} />
                  Panel de administración
                </Link>
                <div className="my-1" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }}></div>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: '#463E39' }}>
                  <Folder size={14} />
                  Proyectos
                </Link>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: '#463E39' }}>
                  <User size={14} />
                  Mi cuenta
                </Link>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left text-red-600">
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </>
            ) : isConfigSection ? (
              <>
                <Link href={`/project/${projectId}/config`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${configTab === "general" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: configTab === "general" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                  <Info size={14} />
                  General
                </Link>
                <Link href={`/project/${projectId}/config/users`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${configTab === "users" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: configTab === "users" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                  <UserCog size={14} />
                  Usuarios
                </Link>
                <Link href={`/project/${projectId}/config/departments`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${configTab === "departments" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: configTab === "departments" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                  <Briefcase size={14} />
                  Departamentos
                </Link>
                <div className="my-1" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }}></div>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left text-red-600">
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </>
            ) : isAccountingSection ? (
              <>
                {accountingAccess.panel && (
                  <Link href={`/project/${projectId}/accounting`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${accountingPage === "panel" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: accountingPage === "panel" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                    <LayoutDashboard size={14} />
                    Panel
                  </Link>
                )}
                {accountingAccess.suppliers && (
                  <Link href={`/project/${projectId}/accounting/suppliers`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${accountingPage === "suppliers" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: accountingPage === "suppliers" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                    <Building2 size={14} />
                    Proveedores
                  </Link>
                )}
                {accountingAccess.budget && (
                  <Link href={`/project/${projectId}/accounting/budget`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${accountingPage === "budget" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: accountingPage === "budget" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                    <Wallet size={14} />
                    Presupuesto
                  </Link>
                )}
                {accountingAccess.users && (
                  <Link href={`/project/${projectId}/accounting/users`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${accountingPage === "users" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: accountingPage === "users" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                    <Users size={14} />
                    Usuarios
                  </Link>
                )}
                {accountingAccess.reports && (
                  <Link href={`/project/${projectId}/accounting/reports`} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${accountingPage === "reports" ? "font-medium" : ""}`} style={{ color: '#463E39', backgroundColor: accountingPage === "reports" ? 'rgba(70, 62, 57, 0.1)' : 'transparent' }}>
                    <BarChart3 size={14} />
                    Informes
                  </Link>
                )}
                <div className="my-1" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }}></div>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left text-red-600">
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link href={`/project/${projectId}/team`} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ color: '#463E39', backgroundColor: 'rgba(70, 62, 57, 0.1)' }}>
                  <Users size={14} />
                  Equipo
                </Link>
                <div className="my-1" style={{ borderTop: '1px solid rgba(70, 62, 57, 0.1)' }}></div>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left text-red-600">
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </>
            )}
          </nav>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.1s ease-out; }
      `}</style>
    </header>
  );
}

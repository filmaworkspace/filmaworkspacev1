"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { User, ArrowLeft, CheckCircle, Lock, Eye, EyeOff, Bell, Shield, AlertCircle, LogOut, Clock, FileText, Receipt, Building2 } from "lucide-react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useUser } from "@/contexts/UserContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, updateUserName } = useUser();

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState("profile");

  const [formData, setFormData] = useState({ name: "", email: "" });
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [notifications, setNotifications] = useState({
    pendingApprovals: true,
    overdueInvoices: true,
    expiringCertificates: true,
    teamInvitations: true,
    phaseChanges: true,
  });
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  const notificationConfig: Record<string, { label: string; description: string; icon: any; color: string }> = {
    pendingApprovals: { label: "Aprobaciones pendientes", description: "Cuando tienes POs o facturas pendientes de aprobar", icon: Clock, color: "text-amber-600 bg-amber-100" },
    overdueInvoices: { label: "Facturas vencidas", description: "Alertas de facturas que han superado su fecha de vencimiento", icon: Receipt, color: "text-red-600 bg-red-100" },
    expiringCertificates: { label: "Certificados por caducar", description: "Proveedores con certificados próximos a expirar", icon: FileText, color: "text-violet-600 bg-violet-100" },
    teamInvitations: { label: "Invitaciones de equipo", description: "Cuando te invitan a unirte a un proyecto", icon: User, color: "text-blue-600 bg-blue-100" },
    phaseChanges: { label: "Cambios de fase", description: "Cuando un proyecto cambia de fase de producción", icon: Building2, color: "text-emerald-600 bg-emerald-100" },
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (user) {
      setFormData({ name: user.name || "", email: user.email || "" });
      loadNotificationPreferences();
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) router.push("/");
  }, [isLoading, user, router]);

  const loadNotificationPreferences = async () => {
    if (!user?.uid) return;
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const prefs = userDoc.data().notificationPreferences;
        if (prefs) setNotifications(prev => ({ ...prev, ...prefs }));
      }
    } catch (error) {
      console.error("Error loading notification preferences:", error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { showToast("error", "No hay usuario autenticado"); setSaving(false); return; }
      if (!formData.name.trim()) { showToast("error", "El nombre no puede estar vacío"); setSaving(false); return; }
      await updateProfile(currentUser, { displayName: formData.name.trim() });
      updateUserName(formData.name.trim());
      showToast("success", "Perfil actualizado correctamente");
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) { showToast("error", "No hay usuario autenticado"); setSaving(false); return; }
      if (passwordData.newPassword.length < 6) { showToast("error", "La nueva contraseña debe tener al menos 6 caracteres"); setSaving(false); return; }
      if (passwordData.newPassword !== passwordData.confirmPassword) { showToast("error", "Las contraseñas no coinciden"); setSaving(false); return; }
      const credential = EmailAuthProvider.credential(currentUser.email, passwordData.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, passwordData.newPassword);
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast("success", "Contraseña actualizada correctamente");
    } catch (err: any) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        showToast("error", "La contraseña actual es incorrecta");
      } else {
        showToast("error", err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { notificationPreferences: notifications });
      showToast("success", "Preferencias guardadas");
    } catch (error) {
      showToast("error", "Error al guardar preferencias");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (err) {
      showToast("error", "Error al cerrar sesión");
    }
  };

  const tabs = [
    { key: "profile", label: "Perfil", icon: User },
    { key: "password", label: "Seguridad", icon: Shield },
    { key: "notifications", label: "Notificaciones", icon: Bell },
  ];

  if (isLoading) {
    return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors">
              <ArrowLeft size={12} />
              Proyectos
            </Link>
          </div>

          {/* Page header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl flex items-center justify-center text-white text-xl font-semibold">
                {formData.name?.[0]?.toUpperCase() || "U"}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{formData.name || "Usuario"}</h1>
                <p className="text-slate-500 text-sm mt-0.5">{formData.email}</p>
              </div>
            </div>

            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl text-sm font-medium transition-colors">
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-56 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            {/* PERFIL */}
            {activeTab === "profile" && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Información personal</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Actualiza tu información de perfil</p>
                </div>

                <form onSubmit={handleProfileSubmit} className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-2">Nombre completo</label>
                      <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm" placeholder="Tu nombre" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-2">Correo electrónico</label>
                      <div className="relative">
                        <input type="email" disabled value={formData.email} className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm text-slate-500 pr-10" />
                        <Lock size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">El correo no se puede cambiar</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button type="submit" disabled={saving} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50">
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SEGURIDAD */}
            {activeTab === "password" && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Cambiar contraseña</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Asegúrate de usar una contraseña segura</p>
                </div>

                <form onSubmit={handlePasswordSubmit} className="p-6 space-y-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">Contraseña actual</label>
                    <div className="relative">
                      <input type={showPassword.current ? "text" : "password"} value={passwordData.currentPassword} onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm pr-12" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword({ ...showPassword, current: !showPassword.current })} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword.current ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-2">Nueva contraseña</label>
                      <div className="relative">
                        <input type={showPassword.new ? "text" : "password"} value={passwordData.newPassword} onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm pr-12" placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword.new ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-2">Confirmar contraseña</label>
                      <div className="relative">
                        <input type={showPassword.confirm ? "text" : "password"} value={passwordData.confirmPassword} onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm pr-12" placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs text-amber-800">Usa al menos 6 caracteres con una combinación de letras, números y símbolos.</p>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button type="submit" disabled={saving} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50">
                      {saving ? "Actualizando..." : "Actualizar contraseña"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* NOTIFICACIONES */}
            {activeTab === "notifications" && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Preferencias de notificaciones</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Elige qué alertas quieres ver en el panel</p>
                </div>

                {loadingNotifications ? (
                  <div className="p-12 text-center">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto" />
                  </div>
                ) : (
                  <form onSubmit={handleNotificationsSubmit} className="p-6">
                    <div className="space-y-1">
                      {Object.entries(notifications).map(([key, value]) => {
                        const config = notificationConfig[key];
                        const Icon = config.icon;
                        return (
                          <label key={key} className="flex items-center justify-between p-4 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.color}`}>
                                <Icon size={18} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{config.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
                              </div>
                            </div>
                            <div className="relative">
                              <input type="checkbox" checked={value} onChange={() => setNotifications({ ...notifications, [key]: !value })} className="sr-only peer" />
                              <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-slate-900 transition-colors" />
                              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex justify-end pt-6 mt-4 border-t border-slate-100">
                      <button type="submit" disabled={saving} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50">
                        {saving ? "Guardando..." : "Guardar preferencias"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

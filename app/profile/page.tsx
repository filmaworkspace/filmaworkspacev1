"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import {
  User,
  Mail,
  Save,
  ArrowLeft,
  CheckCircle,
  Lock,
  Eye,
  EyeOff,
  Bell,
  BellOff,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "profile" | "password" | "notifications"
  >("profile");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    projectUpdates: true,
    teamInvites: true,
    weeklyDigest: false,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else {
        setUserId(user.uid);
        setFormData({
          name: user.displayName || "",
          email: user.email || "",
        });
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("No hay usuario autenticado");
        setSaving(false);
        return;
      }

      if (!formData.name.trim()) {
        setError("El nombre no puede estar vacío");
        setSaving(false);
        return;
      }

      await updateProfile(user, {
        displayName: formData.name.trim(),
      });

      await user.reload();

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error al actualizar perfil:", error);
      setError(error.message || "Error al actualizar el perfil");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        setError("No hay usuario autenticado");
        setSaving(false);
        return;
      }

      if (passwordData.newPassword.length < 6) {
        setError("La nueva contraseña debe tener al menos 6 caracteres");
        setSaving(false);
        return;
      }

      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setError("Las contraseñas no coinciden");
        setSaving(false);
        return;
      }

      // Reautenticar al usuario
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordData.currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // Cambiar contraseña
      await updatePassword(user, passwordData.newPassword);

      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error al cambiar contraseña:", error);
      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        setError("La contraseña actual es incorrecta");
      } else {
        setError(error.message || "Error al cambiar la contraseña");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);

    try {
      // Aquí guardarías las preferencias en Firebase/Firestore
      // Por ahora solo simulamos el guardado
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error al guardar notificaciones:", error);
      setError(error.message || "Error al guardar las preferencias");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm">Cargando perfil...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      <main className="pt-28 pb-16 px-6 md:px-12 flex-grow">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Volver al dashboard</span>
          </button>

          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-2">
              Configuración
            </h1>
            <p className="text-slate-600">
              Administra tu información personal y preferencias
            </p>
          </header>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "profile"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Perfil
            </button>
            <button
              onClick={() => setActiveTab("password")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "password"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Contraseña
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "notifications"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Notificaciones
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-10">
            {/* Tab: Perfil */}
            {activeTab === "profile" && (
              <>
                <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-200">
                  <div className="bg-slate-900 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-md">
                    <User size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Información del perfil
                    </h2>
                    <p className="text-sm text-slate-600">
                      Actualiza tu información personal
                    </p>
                  </div>
                </div>

                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-700">
                      Nombre completo
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User size={18} className="text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Tu nombre completo"
                        disabled={saving}
                        className="w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg pl-11 pr-4 py-3 text-sm bg-white outline-none transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Este es el nombre que se mostrará en toda la aplicación
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-700">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail size={18} className="text-slate-400" />
                      </div>
                      <input
                        type="email"
                        value={formData.email}
                        disabled
                        className="w-full border border-slate-300 rounded-lg pl-11 pr-4 py-3 text-sm bg-slate-50 outline-none cursor-not-allowed text-slate-500"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      El correo electrónico no se puede modificar
                    </p>
                  </div>

                  {error && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                      <CheckCircle size={18} className="text-emerald-600" />
                      <p className="text-sm text-emerald-600 font-medium">
                        Perfil actualizado correctamente
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                    >
                      <Save size={18} />
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/dashboard")}
                      disabled={saving}
                      className="px-6 py-3 rounded-lg font-medium text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Tab: Contraseña */}
            {activeTab === "password" && (
              <>
                <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-200">
                  <div className="bg-slate-900 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-md">
                    <Lock size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Cambiar contraseña
                    </h2>
                    <p className="text-sm text-slate-600">
                      Actualiza tu contraseña de acceso
                    </p>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-700">
                      Contraseña actual
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={18} className="text-slate-400" />
                      </div>
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={passwordData.currentPassword}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            currentPassword: e.target.value,
                          })
                        }
                        placeholder="Tu contraseña actual"
                        disabled={saving}
                        className="w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg pl-11 pr-12 py-3 text-sm bg-white outline-none transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowCurrentPassword(!showCurrentPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showCurrentPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-700">
                      Nueva contraseña
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={18} className="text-slate-400" />
                      </div>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            newPassword: e.target.value,
                          })
                        }
                        placeholder="Nueva contraseña (mínimo 6 caracteres)"
                        disabled={saving}
                        className="w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg pl-11 pr-12 py-3 text-sm bg-white outline-none transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showNewPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-700">
                      Confirmar nueva contraseña
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={18} className="text-slate-400" />
                      </div>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            confirmPassword: e.target.value,
                          })
                        }
                        placeholder="Confirma tu nueva contraseña"
                        disabled={saving}
                        className="w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg pl-11 pr-12 py-3 text-sm bg-white outline-none transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                      <CheckCircle size={18} className="text-emerald-600" />
                      <p className="text-sm text-emerald-600 font-medium">
                        Contraseña actualizada correctamente
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                    >
                      <Save size={18} />
                      {saving ? "Guardando..." : "Cambiar contraseña"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPasswordData({
                          currentPassword: "",
                          newPassword: "",
                          confirmPassword: "",
                        });
                        setError("");
                      }}
                      disabled={saving}
                      className="px-6 py-3 rounded-lg font-medium text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Limpiar
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Tab: Notificaciones */}
            {activeTab === "notifications" && (
              <>
                <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-200">
                  <div className="bg-slate-900 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-md">
                    <Bell size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Preferencias de notificaciones
                    </h2>
                    <p className="text-sm text-slate-600">
                      Controla cómo y cuándo recibes notificaciones
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleNotificationsSubmit}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start gap-3">
                        <Mail size={20} className="text-slate-600 mt-0.5" />
                        <div>
                          <h3 className="font-medium text-slate-900">
                            Notificaciones por email
                          </h3>
                          <p className="text-sm text-slate-600">
                            Recibe actualizaciones en tu correo
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.email}
                          onChange={(e) =>
                            setNotifications({
                              ...notifications,
                              email: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start gap-3">
                        <Bell size={20} className="text-slate-600 mt-0.5" />
                        <div>
                          <h3 className="font-medium text-slate-900">
                            Notificaciones push
                          </h3>
                          <p className="text-sm text-slate-600">
                            Recibe alertas en tiempo real
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.push}
                          onChange={(e) =>
                            setNotifications({
                              ...notifications,
                              push: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                      </label>
                    </div>

                    <div className="border-t border-slate-200 pt-4 mt-6">
                      <h3 className="text-sm font-semibold text-slate-900 mb-4">
                        Tipos de notificaciones
                      </h3>

                      <div className="space-y-3">
                        <label className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                          <span className="text-sm text-slate-700">
                            Actualizaciones de proyectos
                          </span>
                          <input
                            type="checkbox"
                            checked={notifications.projectUpdates}
                            onChange={(e) =>
                              setNotifications({
                                ...notifications,
                                projectUpdates: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                          />
                        </label>

                        <label className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                          <span className="text-sm text-slate-700">
                            Invitaciones a equipos
                          </span>
                          <input
                            type="checkbox"
                            checked={notifications.teamInvites}
                            onChange={(e) =>
                              setNotifications({
                                ...notifications,
                                teamInvites: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                          />
                        </label>

                        <label className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                          <span className="text-sm text-slate-700">
                            Resumen semanal
                          </span>
                          <input
                            type="checkbox"
                            checked={notifications.weeklyDigest}
                            onChange={(e) =>
                              setNotifications({
                                ...notifications,
                                weeklyDigest: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-500"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                      <CheckCircle size={18} className="text-emerald-600" />
                      <p className="text-sm text-emerald-600 font-medium">
                        Preferencias guardadas correctamente
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                    >
                      <Save size={18} />
                      {saving ? "Guardando..." : "Guardar preferencias"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

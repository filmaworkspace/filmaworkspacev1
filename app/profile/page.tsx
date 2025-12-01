// Página de Perfil — Versión totalmente nueva (Opción C)
// Estilo: Ultra minimalista, limpio y moderno
// Mantiene la MISMA información y funcionalidad base que tu archivo original
// pero con una experiencia completamente nueva.

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, ArrowLeft, CheckCircle, Lock, Eye, EyeOff, Bell } from "lucide-react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

export default function ProfilePage() {
  const router = useRouter();

  // -------------------------------------------
  // STATE
  // -------------------------------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("profile");

  const [formData, setFormData] = useState({ name: "", email: "" });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    projectUpdates: true,
    teamInvites: true,
    weeklyDigest: false,
  });

  // -------------------------------------------
  // AUTH LOAD
  // -------------------------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return router.push("/");
      setFormData({ name: user.displayName || "", email: user.email || "" });
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // -------------------------------------------
  // SUBMIT: PROFILE
  // -------------------------------------------
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      const user = auth.currentUser;
      if (!user) return setError("No hay usuario autenticado");
      if (!formData.name.trim()) return setError("El nombre no puede estar vacío");

      await updateProfile(user, { displayName: formData.name });
      await user.reload();
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------
  // SUBMIT: PASSWORD
  // -------------------------------------------
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      const user = auth.currentUser;
      if (!user || !user.email) return setError("No hay usuario autenticado");

      if (passwordData.newPassword.length < 6)
        return setError("La nueva contraseña debe tener al menos 6 caracteres");

      if (passwordData.newPassword !== passwordData.confirmPassword)
        return setError("Las contraseñas no coinciden");

      const credential = EmailAuthProvider.credential(
        user.email,
        passwordData.currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordData.newPassword);

      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSuccess(true);
    } catch (err) {
      if (err.code === "auth/wrong-password") return setError("La contraseña actual es incorrecta");
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------
  // SUBMIT: NOTIFICATIONS
  // -------------------------------------------
  const handleNotificationsSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    setSuccess(true);
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="animate-spin w-10 h-10 border-4 border-slate-300 border-t-slate-900 rounded-full"></div>
      </div>
    );

  // ============================================
  // UI MODERNA — MINIMALISTA
  // ============================================
  return (
    <div className="min-h-screen bg-white px-6 py-24 max-w-2xl mx-auto">
      {/* Volver */}
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition mb-8"
      >
        <ArrowLeft size={18} /> Volver
      </button>

      <h1 className="text-3xl font-semibold text-slate-900 mb-6">Tu cuenta</h1>
      <p className="text-slate-600 mb-10">Gestiona tu información personal y preferencias</p>

      {/* Tabs minimalistas */}
      <div className="flex gap-4 border-b border-slate-200 mb-8">
        {[{ key: "profile", label: "Perfil" }, { key: "password", label: "Contraseña" }, { key: "notifications", label: "Notificaciones" }].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`pb-3 text-sm font-medium transition ${
              activeTab === t.key
                ? "text-slate-900 border-b-2 border-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white p-8 border border-slate-200 rounded-2xl shadow-sm">
        {/* PERFIL */}
        {activeTab === "profile" && (
          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User size={20} /> Información personal
            </h2>

            <div>
              <label className="text-sm text-slate-700 mb-1 block">Nombre</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400/40 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-slate-700 mb-1 block">Correo</label>
              <input
                type="email"
                disabled
                value={formData.email}
                className="w-full p-3 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-500"
              />
            </div>

            {error && <div className="text-red-600 text-sm">{error}</div>}
            {success && <div className="text-emerald-600 text-sm flex items-center gap-2"><CheckCircle size={16}/> Guardado</div>}

            <button
              disabled={saving}
              className="w-full bg-slate-900 text-white py-3 rounded-lg text-sm hover:bg-slate-800 transition"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        )}

        {/* CONTRASEÑA */}
        {activeTab === "password" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Lock size={20} /> Cambiar contraseña
            </h2>

            {[{
              label: "Contraseña actual",
              key: "current",
              value: passwordData.currentPassword,
            },{
              label: "Nueva contraseña",
              key: "new",
              value: passwordData.newPassword,
            },{
              label: "Confirmar nueva contraseña",
              key: "confirm",
              value: passwordData.confirmPassword,
            }].map((field) => (
              <div key={field.key} className="relative">
                <label className="text-sm text-slate-700 mb-1 block">{field.label}</label>
                <input
                  type={showPassword[field.key] ? "text" : "password"}
                  value={field.value}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, [`${field.key}Password`]: e.target.value })
                  }
                  className="w-full p-3 border border-slate-300 rounded-lg text-sm pr-10 focus:ring-2 focus:ring-slate-400/40 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword({ ...showPassword, [field.key]: !showPassword[field.key] })}
                  className="absolute right-3 top-9 text-slate-500"
                >
                  {showPassword[field.key] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            ))}

            {error && <div className="text-red-600 text-sm">{error}</div>}
            {success && <div className="text-emerald-600 text-sm flex items-center gap-2"><CheckCircle size={16}/> Contraseña actualizada</div>}

            <button
              disabled={saving}
              className="w-full bg-slate-900 text-white py-3 rounded-lg text-sm hover:bg-slate-800 transition"
            >
              {saving ? "Guardando..." : "Actualizar contraseña"}
            </button>
          </form>
        )}

        {/* NOTIFICACIONES */}
        {activeTab === "notifications" && (
          <form onSubmit={handleNotificationsSubmit} className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Bell size={20} /> Notificaciones
            </h2>

            {Object.entries(notifications).map(([key, value]) => (
              <label key={key} className="flex items-center justify-between py-3">
                <span className="text-sm text-slate-800 capitalize">{key}</span>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => setNotifications({ ...notifications, [key]: !value })}
                  className="w-4 h-4"
                />
              </label>
            ))}

            {success && <div className="text-emerald-600 text-sm flex items-center gap-2"><CheckCircle size={16}/> Preferencias guardadas</div>}

            <button
              disabled={saving}
              className="w-full bg-slate-900 text-white py-3 rounded-lg text-sm hover:bg-slate-800 transition"
            >
              {saving ? "Guardando..." : "Guardar preferencias"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

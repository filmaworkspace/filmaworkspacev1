"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import { Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
      
      router.push("/dashboard");
    } catch (err: any) {
      const errorMessages: Record<string, string> = {
        "auth/invalid-email": "Email no válido",
        "auth/user-disabled": "Cuenta deshabilitada",
        "auth/user-not-found": "No existe una cuenta con este email",
        "auth/wrong-password": "Contraseña incorrecta",
        "auth/invalid-credential": "Credenciales incorrectas",
        "auth/too-many-requests": "Demasiados intentos. Inténtalo más tarde",
      };
      setError(errorMessages[err.code] || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
        <div className="relative z-10 flex items-center justify-center w-full">
          <span className={`text-3xl tracking-tighter text-white ${spaceGrotesk.className}`}>
            <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
          </span>
        </div>
      </div>

      {/* Right Side - Minimal Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-xs">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-12">
            <span className={`text-lg tracking-tighter text-slate-400 ${spaceGrotesk.className}`}>
              <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
            </span>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-lg font-medium text-slate-900">Iniciar sesión</h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                disabled={loading}
                autoComplete="email"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                disabled={loading}
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Options row */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                    className="sr-only peer"
                  />
                  <div className="w-4 h-4 border border-slate-300 rounded peer-checked:border-slate-900 peer-checked:bg-slate-900 transition-all" />
                  <svg
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs text-slate-500">Recordarme</span>
              </label>
              
              <Link
                href="/forgot-password"
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-xl">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-600">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Register link */}
          <p className="mt-6 text-center text-xs text-slate-400">
            ¿No tienes cuenta?{" "}
            <Link
              href="/register"
              className="text-slate-600 font-medium hover:text-slate-900 transition-colors"
            >
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

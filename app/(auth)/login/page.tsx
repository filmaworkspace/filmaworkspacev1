"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useAuth } from "@/hooks/useAuth";
import PasswordInput from "@/components/ui/PasswordInput";
import Button from "@/components/ui/Button";
import ErrorAlert from "@/components/ui/ErrorAlert";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password, rememberMe);
  };

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
        {/* Text centered */}
        <div className="relative z-10 flex items-center justify-center w-full">
          <span className={`text-3xl tracking-tighter text-white ${spaceGrotesk.className}`}>
            <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
          </span>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-12">
            <span className={`text-xl tracking-tighter text-slate-500 ${spaceGrotesk.className}`}>
              <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
            </span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-1">
              Iniciar sesión
            </h2>
            <p className="text-sm text-slate-500">
              Accede a tu espacio de trabajo
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>

            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400/30 cursor-pointer"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors select-none">
                  Recordar mi email
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-slate-600 hover:text-slate-900 hover:underline transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <ErrorAlert message={error} />

            <Button
              type="submit"
              loading={loading}
              loadingText="Iniciando sesión..."
            >
              Iniciar sesión
            </Button>
          </form>

          {/* Register link */}
          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            ¿No tienes cuenta?{" "}
            <Link
              href="/register"
              className="text-slate-800 hover:text-slate-900 font-medium hover:underline transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

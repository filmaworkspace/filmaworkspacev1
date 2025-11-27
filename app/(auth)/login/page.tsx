"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useAuth } from "@/hooks/useAuth";
import PasswordInput from "@/components/ui/PasswordInput";
import Button from "@/components/ui/Button";
import ErrorAlert from "@/components/ui/ErrorAlert";
import { Shield, Zap } from "lucide-react";
import Image from "next/image";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
      {/* Left Side - Gradient & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
        
        {/* Animated Gradient Orbs */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-500" />
        
        {/* Grid Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Filma Workspace"
                width={40}
                height={40}
                className="rounded-xl"
              />
              <span className={`text-xl font-semibold text-white tracking-tight ${spaceGrotesk.className}`}>
                Filma Workspace
              </span>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            <div>
              <h1 className={`text-4xl xl:text-5xl font-bold text-white leading-tight mb-4 ${spaceGrotesk.className}`}>
                Gestiona tus
                <span className="block bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  producciones
                </span>
                de forma inteligente
              </h1>
              <p className={`text-lg text-slate-400 max-w-md ${inter.className}`}>
                La plataforma todo-en-uno para gestionar presupuestos, equipos y proyectos audiovisuales.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                  <Shield className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Control total</h3>
                  <p className="text-sm text-slate-500">Permisos y roles personalizados</p>
                </div>
              </div>
              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Tiempo real</h3>
                  <p className="text-sm text-slate-500">Colaboración instantánea en equipo</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`text-sm text-slate-500 ${inter.className}`}>
            © 2025 Filma Workspace. Todos los derechos reservados.
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className={`w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-white ${inter.className}`}>
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <Image
              src="/logo.png"
              alt="Filma Workspace"
              width={36}
              height={36}
              className="rounded-lg"
            />
            <span className="text-lg font-semibold text-slate-900">
              Filma Workspace
            </span>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-1">
              Iniciar sesión
            </h2>
            <p className="text-slate-500 text-sm">
              Accede a tu espacio de trabajo
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contraseña
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 cursor-pointer"
                />
                <span className="text-sm text-slate-600">Recordarme</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <ErrorAlert message={error} />

            <Button
              type="submit"
              loading={loading}
              loadingText="Entrando..."
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
            >
              Entrar
            </Button>
          </form>

          {/* Register Link */}
          <p className="mt-8 text-center text-sm text-slate-600">
            ¿No tienes cuenta?{" "}
            <Link
              href="/register"
              className="text-slate-900 font-medium hover:underline"
            >
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

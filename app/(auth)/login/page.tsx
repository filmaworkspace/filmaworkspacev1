"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, AlertCircle, CheckCircle, Mail, Lock, ArrowRight, Film, Sparkles } from "lucide-react";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
});

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailValid, setEmailValid] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
      setEmailValid(true);
    }
  }, []);

  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setEmailValid(emailRegex.test(email));
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password, rememberMe);
  };

  const passwordStrength = password.length >= 8 ? "strong" : password.length >= 4 ? "medium" : "weak";

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Cinematic Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950" />
        
        {/* Animated background elements */}
        <div className="absolute top-1/4 left-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl" />
        
        {/* Floating particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white/20 rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}
            />
          ))}
        </div>

        {/* Brand content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full text-center px-12">
          <div className="mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
              <Film size={32} className="text-white" />
            </div>
            <h1 className={`text-4xl font-bold text-white mb-3 ${spaceGrotesk.className}`}>
              filma workspace
            </h1>
            <p className="text-lg text-indigo-200/80 max-w-md mx-auto leading-relaxed">
              Tu plataforma de gestión cinematográfica inteligente
            </p>
          </div>

          {/* Feature highlights */}
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-3 text-indigo-200">
              <Sparkles size={18} className="text-indigo-400" />
              <span>Gestión avanzada de proyectos</span>
            </div>
            <div className="flex items-center gap-3 text-indigo-200">
              <Sparkles size={18} className="text-indigo-400" />
              <span>Control financiero integrado</span>
            </div>
            <div className="flex items-center gap-3 text-indigo-200">
              <Sparkles size={18} className="text-indigo-400" />
              <span>Colaboración en tiempo real</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Modern Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-gradient-to-br from-white to-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-12">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center">
                <Film size={20} className="text-white" />
              </div>
              <span className={`text-xl font-bold text-slate-900 ${spaceGrotesk.className}`}>
                filma workspace
              </span>
            </div>
          </div>

          {/* Welcome header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Bienvenido de vuelta
            </h2>
            <p className="text-slate-600">
              Accede a tu espacio de trabajo cinematográfico
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input with validation */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail 
                  size={18} 
                  className={`absolute left-4 top-1/2 -translate-y-1/2 ${
                    emailValid ? 'text-emerald-500' : 'text-slate-400'
                  } transition-colors`} 
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="director@tuproyecto.com"
                  disabled={loading}
                  className={`w-full pl-12 pr-4 py-3 rounded-xl border transition-all duration-200 ${
                    emailValid 
                      ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400' 
                      : 'border-slate-300 focus:border-indigo-500'
                  } focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900 placeholder:text-slate-400 disabled:opacity-50`}
                />
                {emailValid && (
                  <CheckCircle size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                )}
              </div>
            </div>

            {/* Password Input with strength indicator */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full pl-12 pr-12 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              
              {/* Password strength indicator */}
              {password && (
                <div className="flex items-center gap-2 text-xs">
                  <div className={`h-1 flex-1 rounded-full overflow-hidden ${
                    passwordStrength === 'strong' ? 'bg-emerald-200' : 
                    passwordStrength === 'medium' ? 'bg-amber-200' : 'bg-red-200'
                  }`}>
                    <div className={`h-full transition-all duration-300 ${
                      passwordStrength === 'strong' ? 'w-full bg-emerald-500' : 
                      passwordStrength === 'medium' ? 'w-2/3 bg-amber-500' : 'w-1/3 bg-red-500'
                    }`} />
                  </div>
                  <span className={`capitalize ${
                    passwordStrength === 'strong' ? 'text-emerald-600' : 
                    passwordStrength === 'medium' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {passwordStrength === 'strong' ? 'Segura' : 
                     passwordStrength === 'medium' ? 'Media' : 'Débil'}
                  </span>
                </div>
              )}
            </div>

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">
                  Recordarme
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline transition-colors font-medium"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* Error alert with animation */}
            {error && (
              <div className="animate-slide-in bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {/* Submit button with loading state */}
            <button
              type="submit"
              disabled={loading || !emailValid || !password}
              className={`w-full py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                loading || !emailValid || !password
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="px-3 bg-gradient-to-br from-white to-gray-50 text-slate-500">
                ¿Eres nuevo?
              </span>
            </div>
          </div>

          {/* Register link */}
          <Link
            href="/register"
            className="block w-full py-3.5 rounded-xl border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-medium transition-all duration-200 text-center"
          >
            Crear cuenta gratuita
          </Link>

          {/* Security badge */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <div className="w-4 h-4 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle size={10} className="text-emerald-600" />
            </div>
            <span>Conexión segura con encriptación SSL</span>
          </div>
        </div>
      </div>

      {/* Add custom animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
      {/* Left Side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ backgroundColor: '#463E39' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10" />
        
        <div className="relative z-10 flex items-center justify-center w-full">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={220}
            height={70}
            className="opacity-90"
            priority
          />
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8" style={{ backgroundColor: '#F4F3EE' }}>
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-16">
            <Image
              src="/logodark.svg"
              alt="Logo"
              width={140}
              height={45}
              priority
            />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                disabled={loading}
                autoComplete="email"
                placeholder=" "
                className="peer w-full px-0 py-3 bg-transparent border-b-2 text-base outline-none transition-colors"
                style={{ 
                  color: '#463E39',
                  borderColor: focusedField === 'email' ? '#463E39' : 'rgba(70, 62, 57, 0.2)'
                }}
              />
              <label 
                className="absolute left-0 top-3 text-sm transition-all pointer-events-none peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-focus:-top-2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-xs"
                style={{ color: 'rgba(70, 62, 57, 0.5)' }}
              >
                Email
              </label>
            </div>

            {/* Password Field */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                disabled={loading}
                autoComplete="current-password"
                placeholder=" "
                className="peer w-full px-0 py-3 pr-10 bg-transparent border-b-2 text-base outline-none transition-colors"
                style={{ 
                  color: '#463E39',
                  borderColor: focusedField === 'password' ? '#463E39' : 'rgba(70, 62, 57, 0.2)'
                }}
              />
              <label 
                className="absolute left-0 top-3 text-sm transition-all pointer-events-none peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-focus:-top-2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-xs"
                style={{ color: 'rgba(70, 62, 57, 0.5)' }}
              >
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-0 top-3 transition-opacity disabled:opacity-50"
                style={{ color: 'rgba(70, 62, 57, 0.4)' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Options row */}
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                    className="sr-only peer"
                  />
                  <div 
                    className="w-4 h-4 border-2 rounded transition-all peer-checked:border-[#463E39] peer-checked:bg-[#463E39]"
                    style={{ borderColor: 'rgba(70, 62, 57, 0.3)' }}
                  />
                  <svg
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 opacity-0 peer-checked:opacity-100 transition-opacity"
                    style={{ color: '#F4F3EE' }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs" style={{ color: 'rgba(70, 62, 57, 0.6)' }}>Recordarme</span>
              </label>
              
              <Link
                href="/forgot-password"
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: 'rgba(70, 62, 57, 0.6)' }}
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            {/* Submit Button - Arrow */}
            <div className="flex items-center justify-between pt-4">
              <span className="text-lg font-medium" style={{ color: '#463E39' }}>Acceder</span>
              <button
                type="submit"
                disabled={loading}
                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                style={{ backgroundColor: '#463E39' }}
              >
                {loading ? (
                  <div 
                    className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(244, 243, 238, 0.3)', borderTopColor: '#F4F3EE' }}
                  />
                ) : (
                  <ArrowRight size={24} style={{ color: '#F4F3EE' }} />
                )}
              </button>
            </div>
          </form>

          {/* Register link */}
          <div className="mt-12 pt-8 border-t" style={{ borderColor: 'rgba(70, 62, 57, 0.1)' }}>
            <p className="text-sm" style={{ color: 'rgba(70, 62, 57, 0.5)' }}>
              ¿No tienes cuenta?{" "}
              <Link
                href="/register"
                className="font-medium transition-opacity hover:opacity-70"
                style={{ color: '#463E39' }}
              >
                Crear cuenta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

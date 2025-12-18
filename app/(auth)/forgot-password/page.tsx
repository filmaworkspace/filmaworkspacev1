"use client";
import { useState } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle, Mail } from "lucide-react";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(true);
    } catch (err: any) {
      const errorMessages: Record<string, string> = {
        "auth/user-not-found": "No existe una cuenta con este email",
        "auth/invalid-email": "Email no válido",
        "auth/too-many-requests": "Demasiados intentos. Inténtalo más tarde",
      };
      setError(errorMessages[err.code] || "Error al enviar el email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Gradient (unchanged) */}
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

      {/* Right Side - Minimalist Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-16">
            <span className={`text-xl tracking-tighter text-slate-400 ${spaceGrotesk.className}`}>
              <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
            </span>
          </div>

          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-8 transition-colors group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Volver
          </Link>

          {success ? (
            /* Success State */
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Mail size={28} className="text-emerald-600" />
              </div>
              
              <h1 className="text-2xl font-semibold text-slate-900 mb-2">
                Revisa tu email
              </h1>
              <p className="text-slate-500 text-sm mb-8">
                Hemos enviado un enlace de recuperación a<br />
                <span className="text-slate-900 font-medium">{email}</span>
              </p>

              <div className="p-4 bg-slate-50 rounded-xl mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-600 text-left">
                    Sigue las instrucciones del email para restablecer tu contraseña. Si no lo ves, revisa la carpeta de spam.
                  </p>
                </div>
              </div>

              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all group"
              >
                <span>Volver al inicio de sesión</span>
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <button
                onClick={() => { setSuccess(false); setEmail(""); }}
                className="mt-4 text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                ¿No recibiste el email? Intentar de nuevo
              </button>
            </div>
          ) : (
            /* Form State */
            <>
              {/* Header */}
              <div className="mb-10">
                <h1 className="text-2xl font-semibold text-slate-900">
                  Recuperar contraseña
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                  Te enviaremos un enlace para restablecerla
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    disabled={loading}
                    autoComplete="email"
                    className="w-full px-4 py-3 bg-slate-50 border-0 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all disabled:opacity-50"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl">
                    <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                    <span className="text-sm text-red-600">{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6 group"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <span>Enviar enlace</span>
                      <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-8 text-center text-sm text-slate-500">
                ¿Recordaste tu contraseña?{" "}
                <Link
                  href="/login"
                  className="text-slate-900 font-medium hover:underline"
                >
                  Iniciar sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

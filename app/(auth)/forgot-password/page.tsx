"use client";
import { useState } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { ArrowLeft, AlertCircle, CheckCircle, Mail } from "lucide-react";
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

          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-6 transition-colors"
          >
            <ArrowLeft size={14} />
            Volver
          </Link>

          {success ? (
            /* Success State */
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Mail size={20} className="text-emerald-600" />
              </div>
              
              <h1 className="text-lg font-medium text-slate-900 mb-1.5">
                Revisa tu email
              </h1>
              <p className="text-slate-400 text-xs mb-6">
                Hemos enviado un enlace de recuperación a<br />
                <span className="text-slate-600 font-medium">{email}</span>
              </p>

              <div className="p-3 bg-slate-50 rounded-xl mb-6">
                <div className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-slate-500 text-left">
                    Sigue las instrucciones del email para restablecer tu contraseña. Si no lo ves, revisa la carpeta de spam.
                  </p>
                </div>
              </div>

              <Link
                href="/login"
                className="block w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all text-center"
              >
                Volver al inicio de sesión
              </Link>

              <button
                onClick={() => { setSuccess(false); setEmail(""); }}
                className="mt-4 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                ¿No recibiste el email? Intentar de nuevo
              </button>
            </div>
          ) : (
            /* Form State */
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <h1 className="text-lg font-medium text-slate-900">Recuperar contraseña</h1>
                <p className="text-slate-400 text-xs mt-1">
                  Te enviaremos un enlace para restablecerla
                </p>
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
                  className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    "Enviar enlace"
                  )}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-6 text-center text-xs text-slate-400">
                ¿Recordaste tu contraseña?{" "}
                <Link
                  href="/login"
                  className="text-slate-600 font-medium hover:text-slate-900 transition-colors"
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

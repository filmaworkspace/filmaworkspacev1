"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Inter } from "next/font/google";
import { ArrowLeft, AlertCircle, CheckCircle, Mail } from "lucide-react";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
      {/* Left Side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ backgroundColor: '#463E39' }}>
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10" />
        
        {/* Logo centered */}
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
        <div className="w-full max-w-xs">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-12">
            <Image
              src="/logodark.svg"
              alt="Logo"
              width={140}
              height={45}
              priority
            />
          </div>

          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs mb-6 transition-colors hover:opacity-70"
            style={{ color: '#463E39', opacity: 0.5 }}
          >
            <ArrowLeft size={14} />
            Volver
          </Link>

          {success ? (
            /* Success State */
            <div className="text-center">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: 'rgba(70, 62, 57, 0.1)' }}
              >
                <Mail size={20} style={{ color: '#463E39' }} />
              </div>
              
              <h1 className="text-lg font-medium mb-1.5" style={{ color: '#463E39' }}>
                Revisa tu email
              </h1>
              <p className="text-xs mb-6" style={{ color: '#463E39', opacity: 0.5 }}>
                Hemos enviado un enlace de recuperación a<br />
                <span className="font-medium" style={{ color: '#463E39', opacity: 1 }}>{email}</span>
              </p>

              <div 
                className="p-3 rounded-xl mb-6"
                style={{ backgroundColor: 'rgba(70, 62, 57, 0.05)' }}
              >
                <div className="flex items-start gap-2">
                  <CheckCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#463E39' }} />
                  <p className="text-[11px] text-left" style={{ color: '#463E39', opacity: 0.6 }}>
                    Sigue las instrucciones del email para restablecer tu contraseña. Si no lo ves, revisa la carpeta de spam.
                  </p>
                </div>
              </div>

              <Link
                href="/login"
                className="block w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-center hover:opacity-90"
                style={{ backgroundColor: '#463E39', color: '#F4F3EE' }}
              >
                Volver a Acceder
              </Link>

              <button
                onClick={() => { setSuccess(false); setEmail(""); }}
                className="mt-4 text-xs transition-colors hover:opacity-70"
                style={{ color: '#463E39', opacity: 0.5 }}
              >
                ¿No recibiste el email? Intentar de nuevo
              </button>
            </div>
          ) : (
            /* Form State */
            <>
              {/* Header */}
              <div className="flex justify-center mb-8">
                <div className="text-center">
                  <h1 className="text-lg font-medium" style={{ color: '#463E39' }}>Recuperar contraseña</h1>
                  <p className="text-xs mt-1" style={{ color: '#463E39', opacity: 0.5 }}>
                    Te enviaremos un enlace para restablecerla
                  </p>
                </div>
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
                    className="w-full px-3.5 py-2.5 border border-[#463E39]/20 rounded-xl text-sm placeholder:text-[#463E39]/40 focus:outline-none focus:ring-2 focus:ring-[#463E39] focus:border-transparent transition-all disabled:opacity-50"
                    style={{ color: '#463E39', backgroundColor: '#F4F3EE' }}
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
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ backgroundColor: '#463E39', color: '#F4F3EE' }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <div 
                        className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                        style={{ borderColor: 'rgba(244, 243, 238, 0.3)', borderTopColor: '#F4F3EE' }}
                      />
                      Enviando...
                    </span>
                  ) : (
                    "Enviar enlace"
                  )}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-6 text-center text-xs" style={{ color: '#463E39', opacity: 0.5 }}>
                ¿Recordaste tu contraseña?{" "}
                <Link
                  href="/login"
                  className="font-medium transition-colors hover:opacity-80"
                  style={{ color: '#463E39', opacity: 1 }}
                >
                  Acceder
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ErrorAlert from "@/components/ui/ErrorAlert";
import Card from "@/components/ui/Card";
import AnimatedBackground from "@/components/auth/AnimatedBackground";
import { ArrowLeft } from "lucide-react";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
    } catch (error: any) {
      let errorMessage = "Error al enviar el email";

      if (error.code === "auth/user-not-found") {
        errorMessage = "No existe una cuenta con este email";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Email inválido";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Demasiados intentos. Intenta más tarde";
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden">
      <AnimatedBackground />

      <div className={`relative z-10 w-full max-w-md ${inter.className}`}>
        <Card>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al inicio de sesión
          </Link>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-1">
              Recuperar contraseña
            </h2>
            <p className="text-sm text-slate-500">
              Te enviaremos un enlace para restablecer tu contraseña
            </p>
          </div>

          {success ? (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-700 mb-3">
                ✓ Email enviado correctamente. Revisa tu bandeja de entrada y
                sigue las instrucciones para restablecer tu contraseña.
              </p>
              <Link
                href="/login"
                className="text-sm text-green-600 hover:text-green-700 font-medium hover:underline"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 text-slate-900"
            >
              <Input
                type="email"
                label="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                disabled={loading}
              />

              <ErrorAlert message={error} />

              <Button
                type="submit"
                loading={loading}
                loadingText="Enviando..."
              >
                Enviar enlace de recuperación
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
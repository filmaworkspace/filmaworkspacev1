"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useAuth } from "@/hooks/useAuth";
import Input from "@/components/ui/Input";
import PasswordInput from "@/components/ui/PasswordInput";
import Button from "@/components/ui/Button";
import ErrorAlert from "@/components/ui/ErrorAlert";
import Card from "@/components/ui/Card";
import AnimatedBackground from "@/components/auth/AnimatedBackground";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden">
      <AnimatedBackground />

      <div className={`relative z-10 w-full max-w-md ${inter.className}`}>
        <Card>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-1">
              Iniciar sesión
            </h2>
            <p className="text-sm text-slate-500">
              Accede a tu espacio de trabajo
            </p>
          </div>

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
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-400/30 focus:ring-offset-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            ¿No tienes cuenta?{" "}
            <Link
              href="/register"
              className="text-slate-800 hover:text-slate-900 font-medium hover:underline transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

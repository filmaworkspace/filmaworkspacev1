"use client";
import { useState } from "react";
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

export default function RegisterPage() {
  const { register, loading, error } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await register(formData.name, formData.email, formData.password);
  };

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900" />
        <div className="absolute top-1/3 -left-32 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
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
              Crear cuenta
            </h2>
            <p className="text-sm text-slate-500">
              Únete a Filma Workspace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nombre completo
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="Tu nombre"
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="tu@correo.com"
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>

            <PasswordInput
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              disabled={loading}
              required
            />

            <ErrorAlert message={error} />

            <Button
              type="submit"
              variant="secondary"
              loading={loading}
              loadingText="Creando cuenta..."
            >
              Crear cuenta
            </Button>
          </form>

          {/* Login link */}
          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-slate-800 hover:text-slate-900 font-medium hover:underline transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

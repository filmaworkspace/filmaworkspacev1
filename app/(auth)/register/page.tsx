"use client";
import { useState } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useAuth } from "@/hooks/useAuth";
import PasswordInput from "@/components/ui/PasswordInput";
import Button from "@/components/ui/Button";
import ErrorAlert from "@/components/ui/ErrorAlert";
import { Users, BarChart3, FolderKanban, ArrowRight } from "lucide-react";
import Image from "next/image";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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

  const features = [
    { icon: FolderKanban, text: "Gestión de proyectos ilimitados" },
    { icon: Users, text: "Colaboración en tiempo real" },
    { icon: BarChart3, text: "Control de presupuestos avanzado" },
  ];

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Gradient & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900" />
        
        {/* Animated Gradient Orbs */}
        <div className="absolute top-1/3 -left-32 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-2/3 left-1/3 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-700" />
        
        {/* Dots Pattern */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)`,
            backgroundSize: '30px 30px'
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
          <div className="space-y-10">
            <div>
              <h1 className={`text-4xl xl:text-5xl font-bold text-white leading-tight mb-4 ${spaceGrotesk.className}`}>
                Únete a miles de
                <span className="block bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
                  profesionales
                </span>
                del audiovisual
              </h1>
              <p className={`text-lg text-slate-400 max-w-md ${inter.className}`}>
                Empieza gratis y escala según tus necesidades. Sin compromiso.
              </p>
            </div>

            {/* Features List */}
            <div className="space-y-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <span className="text-white/80">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <p className={`text-white/90 italic mb-4 ${inter.className}`}>
                "Filma Workspace ha transformado la manera en que gestionamos nuestros proyectos. 
                Ahora tenemos control total sobre cada euro."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-semibold text-sm">
                  MC
                </div>
                <div>
                  <p className={`text-white font-medium text-sm ${inter.className}`}>María Castellanos</p>
                  <p className={`text-slate-500 text-xs ${inter.className}`}>Productora Ejecutiva</p>
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

      {/* Right Side - Register Form */}
      <div className={`w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-slate-50 ${inter.className}`}>
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <Image
              src="/logo.png"
              alt="Filma Workspace"
              width={40}
              height={40}
              className="rounded-xl"
            />
            <span className={`text-xl font-semibold text-slate-900 tracking-tight ${spaceGrotesk.className}`}>
              Filma Workspace
            </span>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              Crear cuenta
            </h2>
            <p className="text-slate-600">
              Únete a Filma Workspace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
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
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
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
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Contraseña
                </label>
                <PasswordInput
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <ErrorAlert message={error} />

            <Button
              type="submit"
              variant="secondary"
              loading={loading}
              loadingText="Creando cuenta..."
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group"
            >
              Crear cuenta
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-50 text-slate-500">
                ¿Ya tienes cuenta?
              </span>
            </div>
          </div>

          {/* Login Link */}
          <Link href="/login">
            <button className="w-full py-3 border-2 border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-medium transition-all">
              Iniciar sesión
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

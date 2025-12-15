// src/components/LoginPage.tsx (Minimalista y Compacto)
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useAuth } from "@/hooks/useAuth";
import Input from "@/components/ui/Input"; 
import PasswordInput from "@/components/ui/PasswordInput"; 
import Button from "@/components/ui/Button";
import ErrorAlert from "@/components/ui/ErrorAlert";
import { ArrowRight, Check } from "lucide-react"; 

// Tipografías consistentes
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
    // Fondo blanco puro, centrado en la página
    <div className={`min-h-screen flex items-center justify-center bg-white p-4 sm:p-6 ${inter.className}`}>
      
      {/* Contenedor central más pequeño (max-w-xs) y con menos padding (p-8) */}
      <div className="w-full max-w-xs p-8">
        
        {/* Logo/Header - Más pequeño (text-2xl) */}
        <div className="text-center mb-8">
          <Link href="/" className={`select-none ${spaceGrotesk.className} flex items-center justify-center`}>
            {/* Reducción de tamaño del logo: de 3xl a 2xl */}
            <span className="text-2xl text-slate-900 font-medium tracking-tighter">
              filma
            </span>
            <span className="text-2xl text-slate-500 font-normal tracking-tighter">
              workspace
            </span>
          </Link>

          {/* Título y Subtítulo - Título reducido a text-xl, menos espaciado */}
          <h2 className="mt-6 text-xl font-semibold text-slate-900">
            Iniciar sesión
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Accede a tu espacio de trabajo.
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            
          {/* Alerta de Error */}
          <ErrorAlert message={error} />
            
          {/* Campos de Input */}
          <Input
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            disabled={loading}
          />

          <PasswordInput
            id="password-input"
            label="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />

          {/* Opciones Adicionales - Espaciado más compacto */}
          <div className="flex items-center justify-between mt-0">
            {/* Checkbox "Recordar mi email" */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="appearance-none w-4 h-4 rounded border-2 border-slate-300 checked:bg-slate-900 checked:border-slate-900 focus:ring-2 focus:ring-slate-900/20 cursor-pointer transition-colors relative"
              />
              <span className="absolute left-0 top-0.5 text-white pointer-events-none opacity-0 checked:opacity-100 transition-opacity">
                <Check size={12} className="ml-[1px]" />
              </span>
              <span className="text-xs text-slate-600 group-hover:text-slate-800 transition-colors select-none">
                Recordar mi email
              </span>
            </label>

            {/* Enlace ¿Olvidaste tu contraseña? */}
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
            
          {/* Botón de Inicio de Sesión */}
          <Button
            type="submit"
            loading={loading}
            loadingText="Iniciando sesión..."
            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg shadow-sm text-base font-semibold text-white bg-slate-900 hover:bg-slate-700 focus:ring-2 focus:ring-offset-2 focus:ring-900 transition duration-150 ease-in-out"
          >
            Iniciar sesión
            {!loading && <ArrowRight size={18} />}
          </Button>
        </form>

        {/* Enlace de Registro - Espaciado más compacto */}
        <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-500">
          ¿No tienes cuenta?{" "}
          <Link
            href="/register"
            className="font-semibold text-slate-900 hover:text-slate-700 transition-colors"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}

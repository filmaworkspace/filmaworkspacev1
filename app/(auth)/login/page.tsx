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

// Tipografías consistentes con el Header
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function LoginPage() {
  // Lógica de autenticación intacta
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
    // Diseño minimalista: Fondo blanco puro, sin gradientes ni colores distractores.
    <div className={`min-h-screen flex items-center justify-center bg-white p-4 sm:p-6 ${inter.className}`}>
      
      {/* Contenedor central: Máximo enfoque en el contenido, sin sombras ni bordes fuertes */}
      <div className="w-full max-w-sm">
        
        {/* Logo/Header - Máximo minimalismo y claridad */}
        <div className="text-center mb-12">
          <Link href="/" className={`select-none ${spaceGrotesk.className} flex items-center justify-center`}>
            {/* Logotipo alineado: text-slate-900 (principal) y text-slate-500 (secundario) */}
            <span className="text-3xl text-slate-900 font-medium tracking-tighter">
              filma
            </span>
            <span className="text-3xl text-slate-500 font-normal tracking-tighter">
              workspace
            </span>
          </Link>

          {/* Título y Subtítulo - Espaciado generoso */}
          <h2 className="mt-8 text-2xl font-semibold text-slate-900">
            Iniciar Sesión
          </h2>
          {/* Texto secundario, discreto, usando el color de texto secundario del Header */}
          <p className="text-sm text-slate-500 mt-1">
            Accede a tu espacio de trabajo para continuar.
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            
          {/* Alerta de Error */}
          <ErrorAlert message={error} />
            
          {/* Campo Email - Utiliza el Input ajustado */}
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

          {/* Password Input - Utiliza el PasswordInput ajustado */}
          <PasswordInput
            id="password-input"
            label="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />

          {/* Opciones Adicionales */}
          <div className="flex items-center justify-between mt-1">
            {/* Checkbox "Recordar mi email" */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                // Checkbox: Neutro, foco en slate-900
                className="appearance-none w-4 h-4 rounded border-2 border-slate-300 checked:bg-slate-900 checked:border-slate-900 focus:ring-2 focus:ring-slate-900/20 cursor-pointer transition-colors relative"
              />
              <span className="absolute left-0 top-0.5 text-white pointer-events-none opacity-0 checked:opacity-100 transition-opacity">
                <Check size={12} className="ml-[1px]" />
              </span>
              {/* Texto discreto */}
              <span className="text-xs text-slate-600 group-hover:text-slate-800 transition-colors select-none">
                Recordar mi email
              </span>
            </label>

            {/* Enlace ¿Olvidaste tu contraseña? - Discreto, color text-slate-500 */}
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
            
          {/* Botón de Inicio de Sesión - El CTA más fuerte: fondo negro/slate-900 */}
          <Button
            type="submit"
            loading={loading}
            loadingText="Iniciando sesión..."
            // Botón: Color sólido slate-900, esquinas redondeadas (8px)
            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg shadow-sm text-base font-semibold text-white bg-slate-900 hover:bg-slate-700 focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition duration-150 ease-in-out"
          >
            Iniciar sesión
            {!loading && <ArrowRight size={18} />}
          </Button>
        </form>

        {/* Enlace de Registro - Mínima distracción */}
        <div className="mt-10 pt-6 border-t border-slate-200 text-center text-sm text-slate-500">
          ¿No tienes cuenta?{" "}
          <Link
            href="/register"
            // Enlace con color slate-900 para destacar sutilmente
            className="font-semibold text-slate-900 hover:text-slate-700 transition-colors"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}

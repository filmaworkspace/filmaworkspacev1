"use client";

import { useState } from "react";
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
    <div className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden">
      <AnimatedBackground />
      
      <div className={`relative z-10 w-full max-w-md ${inter.className}`}>
        <Card>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-1">
              Crear cuenta
            </h2>
            <p className="text-sm text-slate-500">Únete a Filma Workspace</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 text-slate-900"
          >
            <Input
              type="text"
              name="name"
              label="Nombre completo"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Tu nombre"
              disabled={loading}
            />

            <Input
              type="email"
              name="email"
              label="Email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="tu@correo.com"
              disabled={loading}
            />

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

          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-slate-800 hover:text-slate-900 font-medium hover:underline transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
// Importar Inter para asegurar consistencia
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface PasswordInputProps {
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

export default function PasswordInput({
  label = "Contraseña",
  value,
  onChange,
  placeholder = "••••••••",
  disabled = false,
  required = false,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={inter.className}>
      {label && (
        // Estilo del label: text-sm font-medium text-slate-700
        <label className="block text-sm font-medium mb-1.5 text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          required={required}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          // Clases de estilo del campo: 
          // py-2.5 y px-4 para el mismo tamaño que Input.tsx. pr-10 para dejar espacio al botón.
          // text-sm consistente con el Header
          className="w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg 
                     px-4 py-2.5 pr-10 text-sm bg-white outline-none transition-all 
                     placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={
            showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
          }
        >
          {showPassword ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

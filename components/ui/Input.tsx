"use client";

import { InputHTMLAttributes } from "react";
// Importar Inter para asegurar consistencia en la tipografía si el componente se usa fuera del contexto del LoginPage
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div className={inter.className}>
      {label && (
        // Estilo del label: text-sm font-medium text-slate-700
        <label className="block text-sm font-medium mb-1.5 text-slate-700">
          {label}
        </label>
      )}
      <input
        {...props}
        // Clases de estilo del campo: 
        // py-2.5 y px-4 para el mismo tamaño que PasswordInput
        // text-sm consistente con el Header
        className={`w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg 
                    px-4 py-2.5 text-sm bg-white outline-none transition-all 
                    placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      />
    </div>
  );
}

"use client";

import { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-2 text-slate-700">
          {label}
        </label>
      )}
      <input
        {...props}
        className={`w-full border border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 rounded-lg px-4 py-2.5 text-sm bg-white outline-none transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      />
    </div>
  );
}
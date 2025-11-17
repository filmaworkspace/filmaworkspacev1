"use client";

export default function Footer() {
  return (
    <footer
      className="w-full py-6 text-center text-xs text-slate-500"
    >
      © {new Date().getFullYear()} Filma Workspace. Todos los derechos
      reservados.
    </footer>
  );
}
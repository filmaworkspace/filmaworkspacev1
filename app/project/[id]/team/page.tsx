"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Users, ArrowLeft } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

export default function TeamPage() {
  const params = useParams();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const timer = setTimeout(() => setLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [id]);

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mx-auto"></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      <main className="pt-20 pb-16 px-6 flex-grow flex items-center justify-center">
        <div className="text-center max-w-sm">
          {/* Icono */}
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users size={28} className="text-slate-400" />
          </div>

          {/* Texto */}
          <h1 className={`text-xl font-semibold text-slate-800 mb-2 ${spaceGrotesk.className}`}>
            Próximamente
          </h1>
          <p className="text-slate-500 text-sm mb-8">
            La sección de equipo aún no está disponible.
          </p>

          {/* Botón volver */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Volver a proyectos</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk, Caveat } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  Folder,
  Users,
  Hammer,
  HardHat,
  Wrench,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function TeamPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen ${inter.className}`} style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 25%, #fcd34d 50%, #fbbf24 75%, #f59e0b 100%)' }}>
      {/* Patrón de fondo sutil */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <main className="pt-20 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center relative">
        <div className="text-center">
          {/* Botón volver */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 mb-12 px-4 py-2 bg-white/80 backdrop-blur-sm border border-amber-200 rounded-full text-amber-800 hover:bg-white hover:shadow-lg transition-all group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Volver a proyectos</span>
          </Link>

          {/* El cartel colgante */}
          <div className="relative inline-block">
            {/* Clavos superiores */}
            <div className="absolute -top-3 left-8 w-4 h-4 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full shadow-lg z-20">
              <div className="absolute top-1 left-1 w-2 h-2 bg-slate-300 rounded-full"></div>
            </div>
            <div className="absolute -top-3 right-8 w-4 h-4 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full shadow-lg z-20">
              <div className="absolute top-1 left-1 w-2 h-2 bg-slate-300 rounded-full"></div>
            </div>

            {/* Cuerdas */}
            <div className="absolute -top-16 left-9 w-1 h-16 bg-gradient-to-b from-amber-700 to-amber-800 rounded-full z-10 origin-bottom" style={{ transform: 'rotate(-5deg)' }}></div>
            <div className="absolute -top-16 right-9 w-1 h-16 bg-gradient-to-b from-amber-700 to-amber-800 rounded-full z-10 origin-bottom" style={{ transform: 'rotate(5deg)' }}></div>

            {/* Gancho superior (donde cuelgan las cuerdas) */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-20 h-6 bg-gradient-to-b from-slate-500 to-slate-700 rounded-t-lg z-0">
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-600 rounded-sm"></div>
            </div>

            {/* El cartel principal */}
            <div 
              className="relative bg-gradient-to-br from-amber-50 via-white to-orange-50 border-4 border-amber-800 rounded-lg shadow-2xl px-12 py-10 md:px-20 md:py-14 sign-swing"
              style={{
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 2px 4px rgba(255,255,255,0.5)',
              }}
            >
              {/* Textura de madera sutil */}
              <div 
                className="absolute inset-0 opacity-[0.02] rounded-lg pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath opacity='.5' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              />

              {/* Icono de construcción */}
              <div className="flex justify-center gap-3 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12 hover:rotate-0 transition-transform">
                  <Hammer size={28} className="text-white" />
                </div>
                <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12 hover:rotate-0 transition-transform">
                  <Wrench size={28} className="text-white" />
                </div>
              </div>

              {/* Título principal */}
              <h1 className={`text-4xl md:text-5xl font-bold text-amber-900 mb-3 ${spaceGrotesk.className}`}>
                ¡Próximamente!
              </h1>

              {/* Subtítulo */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <div className="w-10 h-0.5 bg-gradient-to-r from-transparent to-amber-400"></div>
                <Users size={20} className="text-amber-600" />
                <div className="w-10 h-0.5 bg-gradient-to-l from-transparent to-amber-400"></div>
              </div>

              <p className="text-lg md:text-xl text-amber-800 font-medium mb-2">
                La sección <span className="font-bold text-amber-900">EQUIPO</span>
              </p>
              <p className="text-amber-700 mb-8">
                no está disponible todavía
              </p>

              {/* Nota manuscrita */}
              <div className={`${caveat.className} text-2xl md:text-3xl text-amber-700 transform -rotate-2 mb-6`}>
                "Estamos trabajando en algo genial"
                <Sparkles size={20} className="inline-block ml-2 text-amber-500" />
              </div>

              {/* Iconos de trabajo */}
              <div className="flex justify-center gap-4 mt-8">
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-100/80 border border-amber-300 rounded-full">
                  <HardHat size={18} className="text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">En construcción</span>
                </div>
              </div>

              {/* Esquinas decorativas */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-amber-400 rounded-tl-sm"></div>
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-amber-400 rounded-tr-sm"></div>
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-amber-400 rounded-bl-sm"></div>
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-amber-400 rounded-br-sm"></div>
            </div>
          </div>

          {/* Texto inferior */}
          <p className="mt-12 text-amber-900/70 text-sm max-w-md mx-auto">
            Pronto podrás gestionar tu equipo, horarios, planificación y documentación desde aquí.
          </p>
        </div>
      </main>

      <style jsx>{`
        @keyframes swing {
          0%, 100% {
            transform: rotate(-1deg);
          }
          50% {
            transform: rotate(1deg);
          }
        }
        
        .sign-swing {
          animation: swing 4s ease-in-out infinite;
          transform-origin: top center;
        }
      `}</style>
    </div>
  );
}

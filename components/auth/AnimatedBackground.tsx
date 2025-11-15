"use client";

import { useState, useEffect, CSSProperties } from "react";

interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

interface Word {
  id: number;
  text: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  duration: number;
}

export default function AnimatedBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const bubbles: Bubble[] = [
    { id: 0, x: 12, y: 18, size: 220, duration: 55, delay: 0, color: "from-white/40 to-blue-50/20" },
    { id: 1, x: 70, y: 22, size: 170, duration: 62, delay: 4, color: "from-blue-100/30 to-indigo-50/20" },
    { id: 2, x: 48, y: 60, size: 260, duration: 58, delay: 3, color: "from-white/35 to-slate-100/25" },
    { id: 3, x: 20, y: 80, size: 150, duration: 65, delay: 5, color: "from-blue-50/30 to-indigo-50/25" },
    { id: 4, x: 85, y: 70, size: 200, duration: 70, delay: 2, color: "from-slate-50/35 to-white/25" },
  ];

  const words: Word[] = [
    { id: 0, text: "filma", x: 18, y: 28, rotation: -10, scale: 1, opacity: 0.025, duration: 50 },
    { id: 1, text: "workspace", x: 68, y: 22, rotation: 6, scale: 0.9, opacity: 0.03, duration: 60 },
    { id: 2, text: "filma", x: 35, y: 55, rotation: 14, scale: 1.1, opacity: 0.025, duration: 52 },
    { id: 3, text: "workspace", x: 55, y: 75, rotation: -7, scale: 0.95, opacity: 0.03, duration: 58 },
  ];

  if (!mounted) {
    return <div className="fixed inset-0 bg-gradient-to-b from-white via-slate-50 to-blue-50/40 -z-10"></div>;
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Fondo base suave */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50 to-blue-50/40"></div>
      
      {/* --- LOGO FIJO Y SIN OPACIDAD (Arriba a la izquierda) --- */}
      <img
        src="/logo.png"
        alt="Filma Workspace"
        className="absolute top-6 left-6 w-20 h-auto select-none pointer-events-auto z-0" // w-24 es un tamaño adecuado
        style={{ opacity: 1 }} // Opacidad completa
      />
      
      {/* Burbujas flotando orgánicamente */}
      {bubbles.map((b) => (
        <div
          key={b.id}
          className={`absolute rounded-full bg-gradient-to-br ${b.color} backdrop-blur-3xl`}
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.size}px`,
            height: `${b.size}px`,
            animation: `float-organic ${b.duration}s cubic-bezier(0.42, 0.0, 0.58, 1.0) infinite`,
            animationDelay: `${b.delay}s`,
            filter: "blur(35px)",
          }}
        />
      ))}

      {/* Palabras super sutiles */}
      {words.map((w) => (
        <div
          key={w.id}
          className="absolute select-none pointer-events-none"
          style={{
            left: `${w.x}%`,
            top: `${w.y}%`,
            opacity: w.opacity,
            animation: `float-text-organic ${w.duration}s ease-in-out infinite`,
            "--rotation": `${w.rotation}deg`,
          } as CSSProperties & { "--rotation": string }}
        >
          <span
            className="text-7xl font-semibold text-slate-400"
            style={{ transform: `scale(${w.scale})` }}
          >
            {w.text}
          </span>
        </div>
      ))}

      {/* Halo luminoso superior */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-48 bg-gradient-to-b from-blue-100/30 to-transparent blur-3xl opacity-60"></div>

      {/* Onda central suave */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] border border-blue-100/40 rounded-full animate-ping-slow"></div>

      <style jsx>{`
        @keyframes float-organic {
          0%   { transform: translate(0px, 0px) scale(1); }
          25%  { transform: translate(12px, -18px) scale(1.03); }
          50%  { transform: translate(-22px, -28px) scale(1.05); }
          75%  { transform: translate(-8px, 12px) scale(1.02); }
          100% { transform: translate(0px, 0px) scale(1); }
        }

        @keyframes float-text-organic {
          0% {
            transform: translate(-50%, -50%) translate(0, 0) rotate(var(--rotation));
          }
          33% {
            transform: translate(-50%, -50%) translate(0, -10px) rotate(calc(var(--rotation) + 2deg));
          }
          66% {
            transform: translate(-50%, -50%) translate(0, 6px) rotate(calc(var(--rotation) - 1deg));
          }
          100% {
            transform: translate(-50%, -50%) translate(0, 0) rotate(var(--rotation));
          }
        }

        @keyframes ping-slow {
          0% { transform: scale(0.95); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 0.35; }
          100% { transform: scale(0.95); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

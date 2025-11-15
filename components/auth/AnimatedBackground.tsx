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

  // Generar burbujas con posiciones fijas para evitar hydration mismatch
  const bubbles: Bubble[] = [
    {
      id: 0,
      x: 10,
      y: 20,
      size: 180,
      duration: 35,
      delay: 0,
      color: "from-slate-200/15 to-slate-300/15",
    },
    {
      id: 1,
      x: 75,
      y: 15,
      size: 150,
      duration: 40,
      delay: 2,
      color: "from-blue-200/10 to-slate-200/10",
    },
    {
      id: 2,
      x: 50,
      y: 60,
      size: 200,
      duration: 32,
      delay: 4,
      color: "from-slate-100/20 to-slate-200/15",
    },
    {
      id: 3,
      x: 20,
      y: 80,
      size: 120,
      duration: 38,
      delay: 1,
      color: "from-slate-200/12 to-blue-200/12",
    },
    {
      id: 4,
      x: 85,
      y: 70,
      size: 160,
      duration: 42,
      delay: 3,
      color: "from-slate-300/10 to-slate-200/15",
    },
    {
      id: 5,
      x: 40,
      y: 30,
      size: 140,
      duration: 36,
      delay: 5,
      color: "from-blue-100/15 to-slate-100/15",
    },
    {
      id: 6,
      x: 65,
      y: 45,
      size: 170,
      duration: 34,
      delay: 2.5,
      color: "from-slate-200/18 to-slate-300/12",
    },
    {
      id: 7,
      x: 15,
      y: 50,
      size: 130,
      duration: 44,
      delay: 6,
      color: "from-slate-100/15 to-blue-100/10",
    },
  ];

  // Palabras flotantes con posiciones fijas
  const words: Word[] = [
    {
      id: 0,
      text: "filma",
      x: 15,
      y: 25,
      rotation: -12,
      scale: 1,
      opacity: 0.04,
      duration: 25,
    },
    {
      id: 1,
      text: "workspace",
      x: 70,
      y: 20,
      rotation: 8,
      scale: 0.9,
      opacity: 0.05,
      duration: 30,
    },
    {
      id: 2,
      text: "filma",
      x: 35,
      y: 55,
      rotation: 15,
      scale: 1.1,
      opacity: 0.045,
      duration: 28,
    },
    {
      id: 3,
      text: "workspace",
      x: 55,
      y: 75,
      rotation: -8,
      scale: 0.95,
      opacity: 0.055,
      duration: 32,
    },
    {
      id: 4,
      text: "filma",
      x: 80,
      y: 50,
      rotation: 5,
      scale: 1.05,
      opacity: 0.04,
      duration: 27,
    },
    {
      id: 5,
      text: "workspace",
      x: 25,
      y: 70,
      rotation: -15,
      scale: 0.85,
      opacity: 0.05,
      duration: 29,
    },
  ];

  if (!mounted) {
    return (
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/30"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Fondo base minimalista */}
      <div className="absolute inset-0 bg-white"></div>

      {/* Grid decorativo muy sutil */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #1e293b 1px, transparent 1px),
            linear-gradient(to bottom, #1e293b 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Burbujas flotantes con glassmorphism */}
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className={`absolute rounded-full bg-gradient-to-br ${bubble.color} backdrop-blur-3xl`}
          style={{
            left: `${bubble.x}%`,
            top: `${bubble.y}%`,
            width: `${bubble.size}px`,
            height: `${bubble.size}px`,
            animation: `float-bubble ${bubble.duration}s ease-in-out infinite`,
            animationDelay: `${bubble.delay}s`,
            filter: "blur(40px)",
          }}
        />
      ))}

      {/* Palabras flotantes "filma" y "workspace" */}
      {words.map((word) => (
        <div
          key={word.id}
          className="absolute select-none pointer-events-none"
          style={
            {
              left: `${word.x}%`,
              top: `${word.y}%`,
              opacity: word.opacity,
              animation: `float-text ${word.duration}s ease-in-out infinite`,
              "--rotation": `${word.rotation}deg`,
            } as CSSProperties & { "--rotation": string }
          }
        >
          <span
            className="text-6xl font-bold text-slate-300"
            style={{
              display: "block",
              transform: `scale(${word.scale})`,
            }}
          >
            {word.text}
          </span>
        </div>
      ))}

      {/* Ondas decorativas minimalistas */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-slate-200/40 rounded-full animate-ping-slow"></div>
      </div>

      {/* Elementos geométricos flotantes minimalistas */}
      <div className="absolute top-1/4 left-1/4 w-16 h-16 border border-slate-200/30 rounded-lg rotate-45 animate-float-slow"></div>
      <div className="absolute bottom-1/3 right-1/4 w-12 h-12 border border-slate-200/30 rounded-full animate-float-slow-2"></div>

      {/* Destello sutil en la parte superior */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-40 bg-gradient-to-b from-blue-100/20 via-indigo-100/10 to-transparent blur-3xl"></div>

      <style jsx>{`
        @keyframes float-bubble {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(30px, -30px) scale(1.05);
          }
          50% {
            transform: translate(-20px, -60px) scale(0.95);
          }
          75% {
            transform: translate(-40px, -30px) scale(1.02);
          }
        }

        @keyframes float-text {
          0%,
          100% {
            transform: translate(-50%, -50%) translateY(0)
              rotate(var(--rotation));
          }
          50% {
            transform: translate(-50%, -50%) translateY(-15px)
              rotate(calc(var(--rotation) + 3deg));
          }
        }

        @keyframes float-slow {
          0%,
          100% {
            transform: translate(0, 0) rotate(45deg);
          }
          50% {
            transform: translate(10px, -20px) rotate(65deg);
          }
        }

        @keyframes float-slow-2 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-15px, 25px) scale(1.1);
          }
        }

        @keyframes float-slow-3 {
          0%,
          100% {
            transform: translate(0, 0) rotate(0deg);
          }
          50% {
            transform: translate(20px, -15px) rotate(180deg);
          }
        }

        @keyframes ping-slow {
          0% {
            transform: scale(0.95);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.5;
          }
          100% {
            transform: scale(0.95);
            opacity: 1;
          }
        }

        .animate-float-slow {
          animation: float-slow 12s ease-in-out infinite;
        }

        .animate-float-slow-2 {
          animation: float-slow-2 10s ease-in-out infinite;
        }

        .animate-float-slow-3 {
          animation: float-slow-3 14s ease-in-out infinite;
        }

        .animate-ping-slow {
          animation: ping-slow 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
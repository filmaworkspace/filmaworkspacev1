"use client";

import { useState, useEffect, CSSProperties } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

interface FilmStrip {
  id: number;
  y: number;
  rotation: number;
  duration: number;
  delay: number;
}

export default function AnimatedBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Partículas flotantes sutiles
  const particles: Particle[] = [
    { id: 0, x: 10, y: 20, size: 3, duration: 25, delay: 0 },
    { id: 1, x: 85, y: 15, size: 2, duration: 30, delay: 3 },
    { id: 2, x: 30, y: 60, size: 4, duration: 28, delay: 5 },
    { id: 3, x: 70, y: 75, size: 2.5, duration: 32, delay: 2 },
    { id: 4, x: 50, y: 40, size: 3.5, duration: 27, delay: 7 },
    { id: 5, x: 20, y: 80, size: 2, duration: 35, delay: 1 },
    { id: 6, x: 90, y: 50, size: 3, duration: 29, delay: 4 },
    { id: 7, x: 15, y: 35, size: 2.5, duration: 33, delay: 6 },
  ];

  // Tiras de película decorativas
  const filmStrips: FilmStrip[] = [
    { id: 0, y: 15, rotation: -15, duration: 45, delay: 0 },
    { id: 1, y: 70, rotation: 12, duration: 50, delay: 5 },
  ];

  if (!mounted) {
    return (
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Fondo base con degradado cinematográfico */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950"></div>

      {/* Capa de ruido sutil para textura */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid decorativo minimalista */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(148, 163, 184) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(148, 163, 184) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Ondas de luz cinematográficas */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div 
          className="absolute top-1/4 -left-1/4 w-[800px] h-[800px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)",
            animation: "pulse-slow 15s ease-in-out infinite",
          }}
        />
        <div 
          className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, transparent 70%)",
            animation: "pulse-slow 20s ease-in-out infinite",
            animationDelay: "7s",
          }}
        />
      </div>

      {/* Partículas flotantes */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-full bg-white/20 backdrop-blur-sm"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            animation: `float-particle ${particle.duration}s ease-in-out infinite`,
            animationDelay: `${particle.delay}s`,
            boxShadow: "0 0 20px rgba(255, 255, 255, 0.3)",
          }}
        />
      ))}

      {/* Tiras de película decorativas */}
      {filmStrips.map((strip) => (
        <div
          key={strip.id}
          className="absolute w-full h-24 opacity-[0.03]"
          style={{
            top: `${strip.y}%`,
            transform: `rotate(${strip.rotation}deg)`,
            animation: `slide-film ${strip.duration}s linear infinite`,
            animationDelay: `${strip.delay}s`,
          }}
        >
          {/* Perforaciones de película */}
          <div className="flex h-full items-center justify-between px-4">
            {[...Array(20)].map((_, i) => (
              <div 
                key={i}
                className="w-3 h-3 bg-slate-400/30 rounded-sm"
              />
            ))}
          </div>
        </div>
      ))}

      {/* Spotlight desde arriba */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-20"
        style={{
          background: "linear-gradient(to bottom, rgba(139, 92, 246, 0.3), transparent)",
          filter: "blur(80px)",
          animation: "spotlight-pulse 10s ease-in-out infinite",
        }}
      />

      {/* Efecto de viñeta sutil */}
      <div 
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at center, transparent 0%, rgba(15, 23, 42, 0.4) 100%)",
        }}
      />

      {/* Línea de horizonte decorativa */}
      <div 
        className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"
        style={{
          animation: "horizon-glow 8s ease-in-out infinite",
        }}
      />

      {/* Logo marca de agua sutil */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none">
        <span 
          className="text-[12rem] font-bold text-slate-700/[0.02] tracking-tighter"
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          FILMA
        </span>
      </div>

      <style jsx>{`
        @keyframes float-particle {
          0%, 100% {
            transform: translate(0, 0);
            opacity: 0.2;
          }
          25% {
            transform: translate(15px, -20px);
            opacity: 0.4;
          }
          50% {
            transform: translate(-10px, -40px);
            opacity: 0.6;
          }
          75% {
            transform: translate(-20px, -20px);
            opacity: 0.4;
          }
        }

        @keyframes slide-film {
          0% {
            transform: translateX(-100%) rotate(var(--rotation));
          }
          100% {
            transform: translateX(100%) rotate(var(--rotation));
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            transform: scale(1);
            opacity: 0.1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.15;
          }
        }

        @keyframes spotlight-pulse {
          0%, 100% {
            opacity: 0.15;
          }
          50% {
            opacity: 0.25;
          }
        }

        @keyframes horizon-glow {
          0%, 100% {
            opacity: 0.3;
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
          }
          50% {
            opacity: 0.6;
            box-shadow: 0 0 40px rgba(99, 102, 241, 0.4);
          }
        }
      `}</style>
    </div>
  );
}

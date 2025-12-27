"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inter, Space_Grotesk } from "next/font/google";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, Timestamp } from "firebase/firestore";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      router.push("/dashboard");
    } catch (err: any) {
      const errorMessages: Record<string, string> = {
        "auth/email-already-in-use": "Ya existe una cuenta con este email",
        "auth/invalid-email": "Email no válido",
        "auth/operation-not-allowed": "Operación no permitida",
        "auth/weak-password": "La contraseña es demasiado débil",
      };
      setError(errorMessages[err.code] || "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex ${inter.className}`}>
      {/* Left Side - Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900" />
        <div className="absolute top-1/3 -left-32 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
        <div className="relative z-10 flex items-center justify-center w-full">
          <span className={`text-3xl tracking-tighter text-white ${spaceGrotesk.className}`}>
            <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
          </span>
        </div>
      </div>

      {/* Right Side - Minimal Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-xs">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-12">
            <span className={`text-lg tracking-tighter text-slate-400 ${spaceGrotesk.className}`}>
              <span className="font-medium">filma</span> <span className="font-normal">workspace</span>
            </span>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-lg font-medium text-slate-900">Crear cuenta</h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre completo"
                disabled={loading}
                autoComplete="name"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>

            {/* Email */}
            <div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                disabled={loading}
                autoComplete="email"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  disabled={loading}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all disabled:opacity-50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                Mínimo 6 caracteres
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-xl">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-600">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando cuenta...
                </span>
              ) : (
                "Crear cuenta"
              )}
            </button>
          </form>

          {/* Login link */}
          <p className="mt-6 text-center text-xs text-slate-400">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-slate-600 font-medium hover:text-slate-900 transition-colors"
            >
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

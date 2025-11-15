"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Páginas sin header ni footer (páginas de autenticación)
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password";

  // Páginas que requieren autenticación
  const isDashboardPage = pathname.startsWith("/dashboard");
  const isAdminPage = pathname.startsWith("/admindashboard");
  const isProjectPage = pathname.startsWith("/project");

  const requiresAuth = isDashboardPage || isAdminPage || isProjectPage;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Si no hay usuario y la página requiere autenticación, redirigir a login
      if (!user && requiresAuth) {
        router.push("/login");
        return;
      }

      // Si es admin dashboard, verificar que sea admin
      if (user && isAdminPage) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          const role = userDoc.exists() ? userDoc.data().role : "user";

          if (role !== "admin") {
            router.push("/dashboard");
            return;
          }
        } catch (error) {
          console.error("Error verificando rol:", error);
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [pathname, router, requiresAuth, isAdminPage]);

  // Loading state para páginas que requieren autenticación
  if (loading && requiresAuth) {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        {!isAuthPage && <Header />}
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">
              Cargando...
            </p>
          </div>
        </main>
        {!isAuthPage && <Footer />}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {!isAuthPage && <Header />}
      <main className="flex flex-col flex-grow">{children}</main>
      {!isAuthPage && <Footer />}
    </div>
  );
}
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

export function useAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean
  ) => {
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.exists() ? userDoc.data() : null;
      const userRole = userData?.role || "user";

      if (userRole === "admin") {
        router.push("/admindashboard");
      } else {
        router.push("/dashboard");
      }
    } catch (error: any) {
      let errorMessage = "Error al iniciar sesión";

      if (error.code === "auth/invalid-credential") {
        errorMessage = "Email o contraseña incorrectos";
      } else if (error.code === "auth/user-not-found") {
        errorMessage = "No existe una cuenta con este email";
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "Contraseña incorrecta";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Email inválido";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "Esta cuenta ha sido deshabilitada";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Demasiados intentos. Intenta más tarde";
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setError("");
    setLoading(true);

    try {
      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres");
        setLoading(false);
        return;
      }

      if (!name.trim()) {
        setError("El nombre es obligatorio");
        setLoading(false);
        return;
      }

      // 1. Crear usuario en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 2. Actualizar perfil
      await updateProfile(user, {
        displayName: name.trim(),
      });

      // 3. Crear documento en Firestore
      await setDoc(doc(db, "users", user.uid), {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: "user",
        createdAt: serverTimestamp(),
      });

      // 4. ✅ ACTUALIZAR INVITACIONES - CORREGIDO
      // Cargar solo invitaciones pendientes (Firebase filtrará automáticamente)
      const invitationsRef = collection(db, "invitations");
      const q = query(
        invitationsRef,
        where("status", "==", "pending")
        // Firebase solo devolverá las invitaciones donde invitedEmail == email del usuario
      );

      const invitationsSnapshot = await getDocs(q);

      // Actualizar invitedUserId para las invitaciones de este usuario
      const updatePromises = invitationsSnapshot.docs
        .filter((invDoc) => invDoc.data().invitedEmail === email.toLowerCase().trim())
        .map((inviteDoc) =>
          updateDoc(inviteDoc.ref, {
            invitedUserId: user.uid,
          })
        );

      await Promise.all(updatePromises);

      // 5. Recargar y redirigir
      await user.reload();
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error("Error en registro:", error);
      let errorMessage = "Error al crear la cuenta";

      if (error.code === "auth/email-already-in-use") {
        errorMessage = "Este email ya está registrado";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Email inválido";
      } else if (error.code === "auth/operation-not-allowed") {
        errorMessage = "Registro deshabilitado. Contacta al administrador";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "La contraseña es demasiado débil";
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Error de conexión. Verifica tu internet";
      } else if (error.code?.includes("permission-denied")) {
        errorMessage = "Error de permisos. Contacta al administrador";
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return { login, register, loading, error };
}

import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View, ActivityIndicator } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseConfig";

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (Platform.OS === "web") {
      document.title = "Cines";

      // Vincular manifest.json de forma dinámica si no está presente
      if (!document.getElementById("pwa-manifest")) {
        const link = document.createElement("link");
        link.id = "pwa-manifest";
        link.rel = "manifest";
        link.href = "/manifest.json";
        document.head.appendChild(link);
      }

      // Remover Service Worker y limpiar caché antiguo
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => {
            for (const registration of registrations) {
              registration.unregister();
              console.log("Service Worker desregistrado con éxito.");
            }
          })
          .catch((err) => console.error("Error al remover Service Worker:", err));
      }

      // Inyectar estilo global para ocultar barras de scroll
      const style = document.createElement("style");
      style.textContent = `
        ::-webkit-scrollbar {
          display: none !important;
        }
        * {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const currentPath = segments.join("/");
      const isLoginPage = currentPath === "login" || segments[0] === "login";
      
      if (!user && !isLoginPage) {
        // Usuario no autenticado intentando acceder a ruta protegida
        router.replace("/login");
      } else if (user && isLoginPage) {
        // Usuario autenticado en página de login, redirigir a home
        router.replace("/");
      }
      
      // Marcar como inicializado después de la primera verificación
      if (initializing) {
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, [segments, initializing]);

  // Mostrar pantalla de carga mientras se verifica la autenticación
  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        title: "Cine",
        animation: "fade",
      }}
    />
  );
}
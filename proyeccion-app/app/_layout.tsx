import Head from "expo-router/head";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View, ActivityIndicator } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseConfig";

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [initializing, setInitializing] = useState(typeof window !== "undefined");

  useEffect(() => {
    if (Platform.OS === "web") {
      if (!document.title) {
        document.title = "Cines - Gestión de Proyección";
      }

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
      const isNotFoundPage =
        currentPath === "+not-found" ||
        segments[0] === "+not-found" ||
        segments.includes("+not-found");
      
      if (!user && !isLoginPage && !isNotFoundPage) {
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0A0F1D" }}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#0A0F1D" />
        <link rel="icon" type="image/png" href="/logo192.png" />
      </Head>
      <View
        style={{ flex: 1 }}
        {...(Platform.OS === "web" ? ({ role: "application" } as any) : {})}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            title: "Cine",
            animation: "fade",
          }}
        />
      </View>
    </>
  );
}
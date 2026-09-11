import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import SEOHead from "@/components/SEOHead";
import { THEME } from "@/lib/theme";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <SEOHead
        title="404 - Página no encontrada | Cines"
        description="La página que estás buscando no existe o ha sido movida. Para acceder a los módulos de proyección cinematográfica debes iniciar sesión."
        pathname="/404"
        noIndex
      />

      <View
        style={styles.container}
        {...(Platform.OS === "web" ? ({ role: "main" } as any) : {})}
        accessibilityRole="none"
      >
        <View style={styles.card}>
          {/* Visual Icon Badge */}
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name="filmstrip-off"
              size={54}
              color="#F59E0B"
            />
          </View>

          <Text style={styles.codeText}>404</Text>
          <Text style={styles.titleText}>Página no encontrada</Text>

          <Text style={styles.descText}>
            La ruta a la que intentas ingresar no existe, fue eliminada o ha cambiado de dirección.
          </Text>

          {/* Aviso sobre inicio de sesión requerido */}
          <View style={styles.authNoticeBox}>
            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={22}
              color="#38BDF8"
              style={{ marginRight: 10 }}
            />
            <Text style={styles.authNoticeText}>
              <Text style={{ fontWeight: "700", color: "#E0F2FE" }}>
                Acceso restringido:
              </Text>{" "}
              Para navegar por los módulos de programación, créditos, DCP y mantenimiento debes haber iniciado sesión previamente con tu usuario autorizado.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnLogin]}
              onPress={() => router.replace("/login")}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión en el sistema"
            >
              <MaterialCommunityIcons
                name="login-variant"
                size={20}
                color="#FFFFFF"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.btnLoginText}>Iniciar Sesión</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnHome]}
              onPress={() => router.replace("/")}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Volver a la página principal"
            >
              <MaterialCommunityIcons
                name="home-outline"
                size={20}
                color="#E2E8F0"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.btnHomeText}>Ir al Inicio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1D",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    minHeight: "100%",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#131C31",
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
    elevation: 8,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(245, 158, 11, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  codeText: {
    fontSize: 52,
    fontWeight: "900",
    color: "#F8FAFC",
    letterSpacing: 2,
    lineHeight: 56,
  },
  titleText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#E2E8F0",
    marginTop: 4,
    marginBottom: 10,
    textAlign: "center",
  },
  descText: {
    fontSize: 14.5,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  authNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 26,
  },
  authNoticeText: {
    flex: 1,
    fontSize: 13,
    color: "#BAE6FD",
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
    minWidth: 160,
  },
  btnLogin: {
    backgroundColor: "#2563EB",
  },
  btnLoginText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  btnHome: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  btnHomeText: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "600",
  },
});

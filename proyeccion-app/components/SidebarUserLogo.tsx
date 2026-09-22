import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, THEME } from "@/lib/theme";

type Props = {
  cineLabel: string;
  isExpanded: boolean;
  isServerOnline: boolean;
  onPress?: () => void;
};

export default function SidebarUserLogo({
  cineLabel,
  isExpanded,
  isServerOnline,
  onPress,
}: Props) {
  const [isHovered, setIsHovered] = useState(false);

  // ─── Animaciones ────────────────────────────────────────────────────────────
  // 1. Pulso de aura / respiración suave del badge
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // 2. Onda de radar continua del estado del servidor
  const radarAnim = useRef(new Animated.Value(0)).current;
  // 3. Escala reactiva al interactuar (hover / press)
  const interactiveScale = useRef(new Animated.Value(1)).current;
  // 4. Inclinación sutil del icono
  const tiltAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const isWeb = Platform.OS === "web";
    const nativeDriver = !isWeb;

    // Bucle 1: Aura respirando suavemente
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
      ])
    );

    // Bucle 2: Onda de radar del servidor (expansión y desvanecimiento)
    const radarLoop = Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: nativeDriver,
      })
    );

    // Bucle 3: Inclinación continua y juguetona del ícono principal
    const tiltLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tiltAnim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(tiltAnim, {
          toValue: -1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(tiltAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
      ])
    );

    pulseLoop.start();
    radarLoop.start();
    tiltLoop.start();

    return () => {
      pulseLoop.stop();
      radarLoop.stop();
      tiltLoop.stop();
    };
  }, [pulseAnim, radarAnim, tiltAnim]);

  // Manejo de hover
  const handleMouseEnter = () => {
    setIsHovered(true);
    Animated.spring(interactiveScale, {
      toValue: 1.1,
      friction: 4,
      tension: 120,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    Animated.spring(interactiveScale, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const iconRotation = tiltAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-5deg", "0deg", "5deg"],
  });

  const radarScale = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.5],
  });

  const radarOpacity = radarAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.75, 0.25, 0],
  });

  const statusColor = isServerOnline ? "#10B981" : "#EF4444";

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      {...(Platform.OS === "web"
        ? ({
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
          } as any)
        : {})}
      style={[
        s.container,
        isExpanded ? s.containerExpanded : s.containerCollapsed,
        isHovered && s.containerHovered,
      ]}
    >
      {/* ── AVATAR PRINCIPAL ANIMADO ── */}
      <View style={s.avatarWrapper}>
        {/* Aura pulsante de fondo */}
        <Animated.View
          style={[
            s.auraGlow,
            {
              transform: [{ scale: pulseAnim }],
              opacity: isHovered ? 0.9 : 0.65,
            },
          ]}
        />

        {/* Disco contenedor del logo */}
        <Animated.View
          style={[
            s.logoBadge,
            {
              transform: [{ scale: interactiveScale }],
            },
            isHovered && s.logoBadgeHovered,
          ]}
        >
          {/* Reflejo / gradiente interno superior */}
          <View style={s.badgeHighlight} />

          {/* Icono central de cine animado con oscilación */}
          <Animated.View
            style={{
              transform: [{ rotate: iconRotation }],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons
              name="movie-open-star"
              size={23}
              color="#F43F5E"
            />
          </Animated.View>
        </Animated.View>

        {/* Indicador de radar para el estado de conexión */}
        <View style={s.statusDotAnchor}>
          {/* Anillo de onda radar que se expande */}
          <Animated.View
            style={[
              s.radarRipple,
              {
                borderColor: statusColor,
                backgroundColor: statusColor,
                transform: [{ scale: radarScale }],
                opacity: radarOpacity,
              },
            ]}
          />
          {/* Punto central del radar */}
          <View
            style={[
              s.statusDotCore,
              {
                backgroundColor: statusColor,
                shadowColor: statusColor,
              },
            ]}
          />
        </View>
      </View>

      {/* ── TÍTULOS Y DETALLES (SÓLO CUANDO ESTÁ EXPANDIDO) ── */}
      {isExpanded && (
        <View style={s.titlesWrap}>
          {/* Nombre del complejo / usuario */}
          <View style={s.nameRow}>
            <Text style={s.cineName} numberOfLines={1}>
              {cineLabel || "Cinemark"}
            </Text>
            <View style={s.proTag}>
              <MaterialCommunityIcons
                name="shield-check"
                size={10}
                color="#E11D48"
                style={{ marginRight: 2 }}
              />
              <Text style={s.proTagText}>CINE</Text>
            </View>
          </View>

          {/* Badge dinámico del estado del servidor */}
          <View style={s.serverStatusPill}>
            <View
              style={[
                s.miniStatusDot,
                { backgroundColor: statusColor },
              ]}
            />
            <Text
              style={[
                s.serverStatusText,
                { color: isServerOnline ? COLORS.success : COLORS.danger },
              ]}
              numberOfLines={1}
            >
              {isServerOnline ? "Servidor conectado" : "Modo desconectado"}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    transitionProperty: "background-color, transform",
    transitionDuration: "180ms",
  } as any,
  containerCollapsed: {
    justifyContent: "center",
    width: "100%",
  },
  containerExpanded: {
    justifyContent: "flex-start",
    width: "100%",
  },
  containerHovered: {
    backgroundColor: "rgba(225, 29, 72, 0.06)",
  },

  // Contenedor del avatar con posicionamiento relativo para el aura y el radar
  avatarWrapper: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  // Aura pulsante circular colorida
  auraGlow: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(225, 29, 72, 0.22)",
    borderWidth: 1.5,
    borderColor: "rgba(244, 63, 94, 0.35)",
  },

  // Insignia principal con aspecto de gema / cristal de cine
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: "#E11D48",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    shadowColor: "#E11D48",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  logoBadgeHovered: {
    borderColor: "#F43F5E",
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },

  // Brillo superior que da efecto tridimensional brillante
  badgeHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
  },

  // Ancla para el radar de estado (esquina inferior derecha)
  statusDotAnchor: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },

  // Onda expansiva del radar
  radarRipple: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },

  // Núcleo del punto de estado
  statusDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.card,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },

  // Bloque de títulos
  titlesWrap: {
    flex: 1,
    marginLeft: 11,
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cineName: {
    fontSize: 14.5,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  proTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: "rgba(225, 29, 72, 0.3)",
  },
  proTagText: {
    fontSize: 8.5,
    fontWeight: "900",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },

  // Badge del estado del servidor
  serverStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 5,
  },
  miniStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  serverStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
});

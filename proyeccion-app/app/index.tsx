import { Redirect } from "expo-router";
import { signOut } from "firebase/auth";
import { Analytics } from "@vercel/analytics/next"

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import NavHeader from "@/components/NavHeader";
import CineProfileModal from "@/components/cineProfileModal";
import { IpAccessGate } from "@/components/IpAccessGate";
import { auth, db, CINES_COLLECTION } from "../lib/firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";
import { authorizeCurrentIp, checkIpAccess } from "../lib/ipAccess";
import { COLORS, THEME } from "../lib/theme";
import { useAppLayout } from "../lib/useAppLayout";
import { useAuthUser } from "../lib/useAuthUser";

import CalendarTab from "./screens/CalendarTab";
import CreditosScreen from "./screens/Creditos";
import EventosScreen from "./screens/Eventos";
import MarketingTab from "./screens/MarketingTab";
import ProgramacionTab from "./screens/ProgramacionTab";
import RmaTab from "./screens/RmaTab";
import DcpTab from "./screens/DcpTab";
import OficinasCalendarioScreen from "./oficinas-calendario";
import OficinasEventosScreen from "./oficinas-eventos";
import CoordinadoresQuimicosScreen from "./screens/CoordinadoresQuimicosScreen";
import CoordinadoresLentesScreen from "./screens/CoordinadoresLentesScreen";
import CoordinadoresProximamenteScreen from "./screens/CoordinadoresProximamenteScreen";
import TrailersSemanalesScreen from "./screens/TrailersSemanalesScreen";
import ControlSemanalScreen from "./screens/ControlSemanalScreen";
import ChequeoCopiasScreen from "./screens/ChequeoCopiasScreen";
import LamparasScreen from "./screens/LamparasScreen";
import CierreMesScreen from "./screens/CierreMesScreen";

type MainTab = "CALENDARIO" | "EVENTOS" | "PROYECCIÓN" | "SERVICIOS" | "COORDINADORES";
type ProyeccionTab = "RMA" | "CREDITOS" | "DCP" | "TRAILERS_SEMANALES" | "CHEQUEO_COPIAS" | "CONTROL_SEMANAL" | "LAMPARAS" | "CIERRE_MES";
type MarketingSubTab = "MKT" | "PROGRAMACION";
type CoordinadoresSubTab = "QUIMICOS" | "LENTES_3D" | "PROXIMAMENTE";

const MAIN_TAB_META = {
  CALENDARIO: { label: "Calendario", icon: "calendar-month-outline" },
  EVENTOS: { label: "Eventos", icon: "calendar-star" },
  PROYECCIÓN: { label: "Proyección", icon: "projector" },
  SERVICIOS: { label: "Servicios", icon: "briefcase-outline" },
  COORDINADORES: { label: "Coordinadores", icon: "account-group-outline" },
} as const;

const SUB_TABS = {
  PROYECCIÓN: [
    { key: "LAMPARAS", label: "Lámparas", icon: "lightbulb-on-outline" },
    { key: "DCP", label: "DCP", icon: "disc" },
    { key: "CREDITOS", label: "Créditos", icon: "lightbulb-outline" },
    { key: "RMA", label: "RMA", icon: "wrench-outline" },
    { key: "TRAILERS_SEMANALES", label: "Trailers Semanales", icon: "movie-outline" },
    { key: "CHEQUEO_COPIAS", label: "Chequeo de Copias", icon: "movie-check-outline" },
    { key: "CONTROL_SEMANAL", label: "Control Semanal", icon: "clipboard-check-outline" },
    { key: "CIERRE_MES", label: "Cierre de Mes", icon: "calendar-check" },
  ],
  SERVICIOS: [
    { key: "PROGRAMACION", label: "Programaciones", icon: "clipboard-text-outline" },
    { key: "MKT", label: "Marketing", icon: "bullhorn-outline" },
  ],
  COORDINADORES: [
    { key: "QUIMICOS", label: "Químicos", icon: "flask-outline" },
    { key: "LENTES_3D", label: "Lentes 3D", icon: "glasses" },
    { key: "PROXIMAMENTE", label: "Productos", icon: "package-variant-closed" },
  ],
} as const;

function applyTheme(mode: "light" | "dark") {
  if (Platform.OS !== "web") return;
  const root = document.documentElement;
  if (mode === "dark") {
    root.style.setProperty("--bg", "#0F172A");
    root.style.setProperty("--bg-mobile", "#0B0F19");
    root.style.setProperty("--primary", "#E11D48");
    root.style.setProperty("--primary-dark", "#9F1239");
    root.style.setProperty("--primary-soft", "#311018");
    root.style.setProperty("--text", "#F8FAFC");
    root.style.setProperty("--muted", "#94A3B8");
    root.style.setProperty("--text-soft", "#94A3B8");
    root.style.setProperty("--card", "#1E293B");
    root.style.setProperty("--border", "#334155");
    root.style.setProperty("--success-bg", "#064E3B");
    root.style.setProperty("--success", "#10B981");
    root.style.setProperty("--success-border", "#047857");
    root.style.setProperty("--danger", "#EF4444");
    root.style.setProperty("--danger-soft", "#450A0A");
    root.style.setProperty("--warning", "#F59E0B");
    root.style.setProperty("--warning-bg", "#381A04");
    root.style.setProperty("--warning-border", "#78350F");
    root.style.setProperty("--info", "#3B82F6");
    root.style.setProperty("--info-bg", "#172554");
    root.style.setProperty("--info-border", "#1E3A8A");
    root.style.setProperty("--beta-bg", "#25183E");
    root.style.setProperty("--beta-border", "#7C3AED");
    root.style.setProperty("--beta-text", "#A78BFA");
    root.style.setProperty("--beta-text-soft", "#C084FC");
    root.style.setProperty("--beta-badge-bg", "#4C1D95");
    root.style.setProperty("--beta-file-picker-bg", "#1E1530");
    root.style.setProperty("--beta-file-picker-text", "#DDD6FE");
    root.style.setProperty("--beta-divider", "#4C1D95");
    root.style.setProperty("--beta-btn-disabled", "#581C87");
  } else {
    root.style.setProperty("--bg", "#F8FAFC");
    root.style.setProperty("--bg-mobile", "#F1F5F9");
    root.style.setProperty("--primary", "#890404");
    root.style.setProperty("--primary-dark", "#6f0303");
    root.style.setProperty("--primary-soft", "#FBEAEA");
    root.style.setProperty("--text", "#0F172A");
    root.style.setProperty("--muted", "#64748B");
    root.style.setProperty("--text-soft", "#64748B");
    root.style.setProperty("--card", "#FFFFFF");
    root.style.setProperty("--border", "#E2E8F0");
    root.style.setProperty("--success-bg", "#D1FAE5");
    root.style.setProperty("--success", "#047857");
    root.style.setProperty("--success-border", "#BBF7D0");
    root.style.setProperty("--danger", "#DC2626");
    root.style.setProperty("--danger-soft", "#FEE2E2");
    root.style.setProperty("--warning", "#8a5a00");
    root.style.setProperty("--warning-bg", "#fff4d6");
    root.style.setProperty("--warning-border", "#ead9a5");
    root.style.setProperty("--info", "#1E40AF");
    root.style.setProperty("--info-bg", "#F0F7FF");
    root.style.setProperty("--info-border", "#b8d4f0");
    root.style.setProperty("--beta-bg", "#F5F3FF");
    root.style.setProperty("--beta-border", "#8B5CF6");
    root.style.setProperty("--beta-text", "#7C3AED");
    root.style.setProperty("--beta-text-soft", "#6D28D9");
    root.style.setProperty("--beta-badge-bg", "#EDE9FE");
    root.style.setProperty("--beta-file-picker-bg", "#F3E8FF");
    root.style.setProperty("--beta-file-picker-text", "#4C1D95");
    root.style.setProperty("--beta-divider", "#DDD6FE");
    root.style.setProperty("--beta-btn-disabled", "#C084FC");
  }
}

export default function Home() {
  const layout = useAppLayout();
  const { isWeb, isMobile, isTablet, pagePadding, contentMaxWidth } = layout;

  const {
    user,
    loading: sessionLoading,
    isLoggedIn,
    isOficinas,
    displayName,
    cineId,
  } = useAuthUser();

  const [mainTab, setMainTab] = useState<MainTab>("CALENDARIO");
  const [proyeccionTab, setProyeccionTab] = useState<ProyeccionTab>("LAMPARAS");
  const [marketingTab, setMarketingTab] = useState<MarketingSubTab>("PROGRAMACION");
  const [coordinadoresTab, setCoordinadoresTab] = useState<CoordinadoresSubTab>("QUIMICOS");

  const [isHovered, setIsHovered] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);

  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");

  const [proyeccionPin, setProyeccionPin] = useState<string | null>(null);
  const [isProjectionUnlocked, setIsProjectionUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const toggleTheme = () => {
    const nextMode = themeMode === "light" ? "dark" : "light";
    setThemeMode(nextMode);
    applyTheme(nextMode);
    if (Platform.OS === "web") {
      localStorage.setItem("theme_mode", nextMode);
    }
  };

  useEffect(() => {
    if (Platform.OS === "web") {
      const saved = localStorage.getItem("theme_mode") as "light" | "dark";
      if (saved === "dark" || saved === "light") {
        setThemeMode(saved);
        applyTheme(saved);
      } else {
        applyTheme("light");
      }
    }
  }, []);

  const [ipCheckState, setIpCheckState] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "authorized" }
    | { state: "not_authorized"; ip: string; cineLabel: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const [ipGateLoading, setIpGateLoading] = useState(false);
  const [ipGateError, setIpGateError] = useState<string | null>(null);

  const logoutDirect = async () => {
    try {
      setShowLogoutConfirm(false);
      await signOut(auth);
    } catch (e) {
      console.error(e);
      setSessionError("No se pudo cerrar la sesión.");
    }
  };

  const confirmLogout = async () => {
    await logoutDirect();
  };

  const visibleMainTabs = useMemo(
    () => {
      if (isOficinas) {
        return ["CALENDARIO", "EVENTOS"] as const;
      }
      return ["CALENDARIO", "EVENTOS", "PROYECCIÓN", "SERVICIOS", "COORDINADORES"] as const;
    },
    [isOficinas]
  );

  const ipCheckStartedRef = React.useRef(false);
  const cineLabelRaw = displayName || cineId || "Cine";
  const cineLabel = cineLabelRaw
    ? cineLabelRaw.charAt(0).toUpperCase() + cineLabelRaw.slice(1)
    : "Cine";
  useEffect(() => {
    if (!user) {
      ipCheckStartedRef.current = false;
      setIpCheckState({ state: "idle" });
      setIpGateError(null);
      setIpGateLoading(false);
      setProfileVisible(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user || sessionLoading) return;
    if (ipCheckStartedRef.current) return;

    ipCheckStartedRef.current = true;

    // Usuarios de oficinas no necesitan validación de IP
    if (isOficinas) {
      setIpCheckState({ state: "authorized" });
      return;
    }

    // Saltar web check si corre en Android/iOS (ej: APK nativa)
    if (Platform.OS !== "web") {
      setIpCheckState({ state: "authorized" });
      return;
    }

    const currentCineLabel = displayName || cineId || "Cine";

    async function run() {
      setIpCheckState({ state: "checking" });

      const res = await checkIpAccess();

      if (cancelled) return;

      if (res.state === "authorized") {
        setIpCheckState({ state: "authorized" });
      } else if (res.state === "not_authorized") {
        setIpCheckState({
          state: "not_authorized",
          ip: res.ip,
          cineLabel: res.nombre || currentCineLabel,
        });
      } else if (res.state === "error") {
        setIpCheckState({ state: "error", message: res.message });
      } else {
        setIpCheckState({
          state: "error",
          message: "No se pudo validar la IP.",
        });
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, isOficinas, displayName, cineId]);

  useEffect(() => {
    if (!cineId) {
      setProyeccionPin(null);
      setIsProjectionUnlocked(false);
      return;
    }

    const configRef = doc(db, CINES_COLLECTION, cineId, "info", "config");
    const unsubscribe = onSnapshot(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const pin = data?.proyeccionPin ? String(data.proyeccionPin).trim() : null;
        setProyeccionPin(pin);
      } else {
        setProyeccionPin(null);
      }
    }, (error) => {
      console.error("Error listening to cine config:", error);
    });

    return () => unsubscribe();
  }, [cineId]);

  function renderProjectionLockBanner() {
    return (
      <View
        style={[
          styles.lockBanner,
          isProjectionUnlocked ? styles.lockBannerUnlocked : styles.lockBannerLocked,
        ]}
      >
        <View style={styles.lockBannerTextWrap}>
          <MaterialCommunityIcons
            name={isProjectionUnlocked ? "lock-open-outline" : "lock-outline"}
            size={20}
            color={isProjectionUnlocked ? "#15803d" : "#b91c1c"}
          />
          <Text
            style={[
              styles.lockBannerText,
              { color: isProjectionUnlocked ? "#15803d" : "#b91c1c" },
            ]}
          >
            {isProjectionUnlocked
              ? "Edición habilitada. Podés realizar modificaciones."
              : "Modo lectura activo. Las modificaciones están deshabilitadas."}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.lockBannerBtn,
            { backgroundColor: isProjectionUnlocked ? "#dcfce7" : "#fee2e2" },
          ]}
          onPress={
            isProjectionUnlocked
              ? () => setIsProjectionUnlocked(false)
              : () => {
                  if (!proyeccionPin) {
                    alert("Por favor, configurá el 'Pin proyeccion' en los Ajustes (icono de tuerca abajo a la izquierda) para poder habilitar la edición.");
                    return;
                  }
                  setUnlockPin("");
                  setUnlockError(null);
                  setShowUnlockModal(true);
                }
          }
        >
          <Text
            style={[
              styles.lockBannerBtnText,
              { color: isProjectionUnlocked ? "#15803d" : "#b91c1c" },
            ]}
          >
            {isProjectionUnlocked ? "Bloquear" : "Desbloquear"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (sessionLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: THEME.colors.bg }]}>
        <ActivityIndicator />
        <Text style={[styles.loadingText, { color: COLORS.muted }]}>
          Inicializando…
        </Text>


      </View>
    );
  }

  if (!isLoggedIn || !user) {
    return <Redirect href="/login" />;
  }

  if (ipCheckState.state === "idle" || ipCheckState.state === "checking") {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: THEME.colors.bg }]}>
        <ActivityIndicator />
        <Text style={[styles.loadingText, { color: COLORS.muted }]}>
          Validando IP…
        </Text>
      </View>
    );
  }

  if (ipCheckState.state === "error") {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: THEME.colors.bg }]}>
        <Text style={[styles.loadingText, { color: COLORS.text }]}>
          {ipCheckState.message}
        </Text>

        <TouchableOpacity
          style={[styles.logoutChip, { marginTop: 10 }]}
          onPress={logoutDirect}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutChipText}>Salir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ipGateVisible = ipCheckState.state === "not_authorized";

  if (ipGateVisible) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: isWeb ? THEME.colors.bg : THEME.colors.bgMobile },
        ]}
      >
        <NavHeader title={cineLabel} />

        <View style={styles.loadingScreen}>
          <ActivityIndicator />
          <Text style={[styles.loadingText, { color: COLORS.muted }]}>
            Acceso restringido por IP
          </Text>
        </View>

        <IpAccessGate
          visible
          cineLabel={
            ipCheckState.state === "not_authorized"
              ? ipCheckState.cineLabel
              : cineLabel
          }
          ip={ipCheckState.state === "not_authorized" ? ipCheckState.ip : ""}
          loading={ipGateLoading}
          error={ipGateError}
          onLogout={logoutDirect}
          onSubmit={async ({ pin, label }) => {
            setIpGateError(null);
            setIpGateLoading(true);
            const res = await authorizeCurrentIp({ pin, label });
            setIpGateLoading(false);

            if (!res.ok) {
              setIpGateError(res.message);
              return;
            }

            setIpCheckState({ state: "authorized" });
          }}
        />

        <Modal
          visible={showLogoutConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLogoutConfirm(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
              <Text style={styles.modalTitle}>Cerrar sesión</Text>
              <Text style={styles.modalMessage}>¿Seguro que querés salir?</Text>

              <View
                style={[
                  styles.modalActions,
                  isMobile && styles.modalActionsMobile,
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    styles.modalBtnCancel,
                    isMobile && styles.modalBtnMobile,
                  ]}
                  onPress={() => setShowLogoutConfirm(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    styles.modalBtnDanger,
                    isMobile && styles.modalBtnMobile,
                  ]}
                  onPress={confirmLogout}
                >
                  <Text style={styles.modalBtnDangerText}>Salir</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const contentAreaStyle = [
    styles.content,
    {
      paddingHorizontal: isMobile ? 12 : isTablet ? 16 : pagePadding,
      paddingTop: isMobile ? 12 : THEME.spacing.lg,
      paddingBottom: (isMobile ? 12 : pagePadding) + 8,
    },
  ];

  function renderSidebarContent(isDrawer: boolean = false) {
    const isExpanded = isHovered || isDrawer;

    return (
      <View style={styles.sidebarInner}>
        {/* Logo/Cabecera */}
        <View style={styles.sidebarHeader}>
          <View style={styles.sidebarLogoCircle}>
            <MaterialCommunityIcons
              name="movie-open-outline"
              size={22}
              color={COLORS.primary}
            />
          </View>
          {isExpanded && (
            <View style={styles.sidebarHeaderTitles}>
              <Text style={styles.sidebarTitle} numberOfLines={1}>
                {cineLabel}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sidebarDivider} />

        {/* Listado de secciones */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sidebarScroll}
        >
          {visibleMainTabs.map((tab) => {
            const meta = MAIN_TAB_META[tab];
            const isActive = mainTab === tab;
            const hasSubmenu = tab in SUB_TABS;

            return (
              <View key={tab} style={styles.sidebarMenuSection}>
                <TouchableOpacity
                  onPress={() => {
                    setMainTab(tab);
                    // Auto-seleccionar primer subtab
                    if (tab === "PROYECCIÓN") setProyeccionTab("LAMPARAS");
                    if (tab === "SERVICIOS") setMarketingTab("PROGRAMACION");
                    if (tab === "COORDINADORES") setCoordinadoresTab("QUIMICOS");

                    if (isDrawer && !hasSubmenu) {
                      setIsDrawerOpen(false);
                    }
                  }}
                  style={[
                    styles.sidebarBtn,
                    isActive && styles.sidebarBtnActive,
                  ]}
                  activeOpacity={0.7}
                >
                  {isActive && <View style={styles.sidebarActiveIndicator} />}

                  <MaterialCommunityIcons
                    name={meta.icon}
                    size={22}
                    color={isActive ? COLORS.primary : COLORS.muted}
                    style={styles.sidebarBtnIcon}
                  />

                  {isExpanded && (
                    <Text
                      style={[
                        styles.sidebarBtnText,
                        isActive && styles.sidebarBtnTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {meta.label}
                    </Text>
                  )}

                  {isExpanded && hasSubmenu && (
                    <MaterialCommunityIcons
                      name={isActive ? "chevron-down" : "chevron-right"}
                      size={16}
                      color={isActive ? COLORS.primary : COLORS.muted}
                      style={styles.sidebarChevron}
                    />
                  )}
                </TouchableOpacity>

                {/* Submenú tipo Acordeón */}
                {isActive && isExpanded && hasSubmenu && (
                  <View style={styles.submenuContainer}>
                    {SUB_TABS[tab as keyof typeof SUB_TABS].map((subItem) => {
                      let isSubActive = false;
                      let onSubPress = () => { };

                      if (tab === "PROYECCIÓN") {
                        isSubActive = proyeccionTab === subItem.key;
                        onSubPress = () => {
                          setProyeccionTab(subItem.key as ProyeccionTab);
                          if (isDrawer) setIsDrawerOpen(false);
                        };
                      } else if (tab === "SERVICIOS") {
                        isSubActive = marketingTab === subItem.key;
                        onSubPress = () => {
                          setMarketingTab(subItem.key as MarketingSubTab);
                          if (isDrawer) setIsDrawerOpen(false);
                        };
                      } else if (tab === "COORDINADORES") {
                        isSubActive = coordinadoresTab === subItem.key;
                        onSubPress = () => {
                          setCoordinadoresTab(subItem.key as CoordinadoresSubTab);
                          if (isDrawer) setIsDrawerOpen(false);
                        };
                      }

                      return (
                        <TouchableOpacity
                          key={subItem.key}
                          onPress={onSubPress}
                          style={[
                            styles.submenuBtn,
                            isSubActive && styles.submenuBtnActive,
                          ]}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons
                            name={subItem.icon}
                            size={16}
                            color={isSubActive ? COLORS.primary : COLORS.muted}
                            style={styles.submenuBtnIcon}
                          />
                          <Text
                            style={[
                              styles.submenuText,
                              isSubActive && styles.submenuTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {subItem.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.sidebarDivider} />

        {/* Footer con Ajustes e Inicio */}
        <View style={styles.sidebarFooter}>
          <TouchableOpacity
            onPress={() => {
              setProfileVisible(true);
              if (isDrawer) setIsDrawerOpen(false);
            }}
            style={styles.sidebarFooterBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="cog-outline"
              size={22}
              color={COLORS.text}
            />
            {isExpanded && (
              <Text style={styles.sidebarFooterText} numberOfLines={1}>
                Configuración
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowLogoutConfirm(true);
              if (isDrawer) setIsDrawerOpen(false);
            }}
            style={styles.sidebarFooterBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="logout"
              size={22}
              color={COLORS.danger}
            />
            {isExpanded && (
              <Text
                style={[styles.sidebarFooterText, { color: COLORS.danger }]}
                numberOfLines={1}
              >
                Cerrar sesión
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderContent() {
    if (mainTab === "CALENDARIO") {
      return isOficinas ? <OficinasCalendarioScreen /> : <CalendarTab />;
    }

    if (mainTab === "EVENTOS") {
      return isOficinas ? <OficinasEventosScreen /> : <EventosScreen />;
    }

    if (mainTab === "PROYECCIÓN") {
      return (
        <View style={styles.screenWrap}>
          {renderProjectionLockBanner()}
          <View style={styles.subContent}>
            {proyeccionTab === "DCP" && <DcpTab readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "CREDITOS" && <CreditosScreen readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "RMA" && <RmaTab readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "TRAILERS_SEMANALES" && <TrailersSemanalesScreen readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "CHEQUEO_COPIAS" && <ChequeoCopiasScreen readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "CONTROL_SEMANAL" && <ControlSemanalScreen readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "LAMPARAS" && <LamparasScreen readOnly={!isProjectionUnlocked} />}
            {proyeccionTab === "CIERRE_MES" && <CierreMesScreen readOnly={!isProjectionUnlocked} />}
          </View>
        </View>
      );
    }

    if (mainTab === "SERVICIOS") {
      return (
        <View style={styles.screenWrap}>
          <View style={styles.subContent}>
            {marketingTab === "MKT" && <MarketingTab />}
            {marketingTab === "PROGRAMACION" && <ProgramacionTab />}
          </View>
        </View>
      );
    }

    if (mainTab === "COORDINADORES") {
      return (
        <View style={styles.screenWrap}>
          <View style={styles.subContent}>
            {coordinadoresTab === "QUIMICOS" && <CoordinadoresQuimicosScreen />}
            {coordinadoresTab === "LENTES_3D" && <CoordinadoresLentesScreen />}
            {coordinadoresTab === "PROXIMAMENTE" && <CoordinadoresProximamenteScreen />}
          </View>
        </View>
      );
    }

    return null;
  }

  const sidebarStyle = [
    styles.sidebar,
    {
      width: isHovered ? 260 : 70,
    },
    Platform.OS === "web" && ({
      transitionProperty: "width",
      transitionDuration: "0.22s",
      transitionTimingFunction: "ease-in-out",
    } as any)
  ];

  return (
    <View style={styles.mainAppRow}>
      {/* 1. Sidebar para Web/Desktop */}
      {!isMobile && (
        <View
          style={sidebarStyle}
          {...({
            onMouseEnter: () => setIsHovered(true),
            onMouseLeave: () => setIsHovered(false),
          } as any)}
        >
          {renderSidebarContent()}
        </View>
      )}

      {/* 2. Backdrop para Drawer Móvil */}
      {isMobile && isDrawerOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          onPress={() => setIsDrawerOpen(false)}
          activeOpacity={1}
        />
      )}

      {/* 3. Panel de Drawer Móvil */}
      {isMobile && (
        <View
          style={[
            styles.drawer,
            { left: isDrawerOpen ? 0 : -280 }
          ]}
        >
          {renderSidebarContent(true)}
        </View>
      )}

      {/* 4. Contenedor de Contenido Principal */}
      <View style={styles.mainContentContainer}>
        <NavHeader
          title={cineLabel}
          onPressSettings={() => setProfileVisible(true)}
          onPressMenu={isMobile ? () => setIsDrawerOpen(true) : undefined}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
        />



        <View style={styles.contentOuter}>
          <View
            style={[
              styles.contentInner,
              isWeb && { maxWidth: contentMaxWidth },
            ]}
          >
            <View style={contentAreaStyle}>{renderContent()}</View>
          </View>
        </View>
      </View>

      <CineProfileModal
        visible={profileVisible}
        cineId={cineId}
        fallbackTitle={cineLabel}
        onClose={() => setProfileVisible(false)}
      />

      <Modal
        visible={showUnlockModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnlockModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <Text style={styles.modalTitle}>Desbloquear Edición</Text>
            <Text style={styles.modalMessage}>
              Ingresá el PIN de proyección para habilitar las modificaciones.
            </Text>

            <TextInput
              value={unlockPin}
              onChangeText={setUnlockPin}
              style={[
                {
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: THEME.radius.md,
                  paddingHorizontal: THEME.spacing.md,
                  paddingVertical: THEME.spacing.md,
                  color: COLORS.text,
                  fontSize: THEME.fontSize.md,
                  width: "100%",
                  marginVertical: 12,
                  textAlign: "center",
                },
              ]}
              placeholder="Ingresá el PIN proyeccion"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              keyboardType="number-pad"
            />

            {unlockError ? (
              <Text style={{ color: COLORS.danger, fontWeight: "700", marginBottom: 12, textAlign: "center" }}>
                {unlockError}
              </Text>
            ) : null}

            <View style={[styles.modalActions, isMobile && styles.modalActionsMobile]}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  isMobile && styles.modalBtnMobile,
                ]}
                onPress={() => setShowUnlockModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  isMobile && styles.modalBtnMobile,
                ]}
                onPress={() => {
                  if (unlockPin.trim() === proyeccionPin) {
                    setIsProjectionUnlocked(true);
                    setShowUnlockModal(false);
                  } else {
                    setUnlockError("PIN incorrecto.");
                  }
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLogoutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <Text style={styles.modalTitle}>Cerrar sesión</Text>
            <Text style={styles.modalMessage}>¿Seguro que querés salir?</Text>

            <View
              style={[
                styles.modalActions,
                isMobile && styles.modalActionsMobile,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  isMobile && styles.modalBtnMobile,
                ]}
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnDanger,
                  isMobile && styles.modalBtnMobile,
                ]}
                onPress={confirmLogout}
              >
                <Text style={styles.modalBtnDangerText}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!sessionError}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionError(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <Text style={styles.modalTitle}>Error</Text>
            <Text style={styles.modalMessage}>{sessionError ?? ""}</Text>

            <View
              style={[
                styles.modalActions,
                isMobile && styles.modalActionsMobile,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  isMobile && styles.modalBtnMobile,
                ]}
                onPress={() => setSessionError(null)}
              >
                <Text style={styles.modalBtnPrimaryText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: THEME.spacing.sm,
  },

  logoutChip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  logoutChipText: {
    color: COLORS.text,
    fontWeight: "700",
  },

  navWrap: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginTop: THEME.spacing.md,
  },

  navWrapWeb: {
    alignItems: "center",
    ...THEME.shadow.web,
  },

  navInnerWrap: {
    width: "100%",
  },

  navInner: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    paddingHorizontal: THEME.spacing.sm,
  },

  navInnerMobile: {
    paddingHorizontal: 0,
    flexWrap: "wrap",
    rowGap: 0,
  },

  tabBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },

  tabBtnMobile: {
    flex: undefined,
    width: "33.333%",
    paddingVertical: 10,
    borderBottomWidth: 2.5,
  },
  tabBtnMobileLast2: {
    width: "50%",
  },

  navMobileWrap: {
    width: "100%",
  },
  navMobileRow: {
    flexDirection: "row",
    width: "100%",
  },
  navMobileRow2: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tabBtnMobileNew: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabTextMobileNew: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
    textAlign: "center",
  },

  tabBtnActive: {
    borderBottomColor: COLORS.primary,
  },

  tabText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.muted,
  },

  tabTextMobile: {
    fontSize: 11.5,
    letterSpacing: 0.2,
  },

  tabTextActive: {
    color: COLORS.primary,
  },

  contentOuter: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    minHeight: 0,
  },

  contentInner: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  content: {
    flex: 1,
    minHeight: 0,
  },

  screenWrap: {
    flex: 1,
    minHeight: 0,
  },

  subTabsWrap: {
    width: "100%",
    alignItems: "center",
    marginBottom: THEME.spacing.md,
  },

  subTabsInner: {
    width: "100%",
  },

  subTabsRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    flexWrap: "nowrap",
  },

  subTabBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  subTabBtnActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: "#f1caca",
  },

  subTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
  },

  subTabTextActive: {
    color: COLORS.primary,
  },

  subContent: {
    flex: 1,
    minHeight: 0,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },

  modalCard: {
    width: "85%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  modalCardMobile: {
    width: "100%",
    maxWidth: 360,
    padding: 18,
    borderRadius: 16,
  },

  modalTitle: {
    fontSize: THEME.fontSize.lg,
    marginBottom: THEME.spacing.sm,
    textAlign: "center",
    color: COLORS.text,
    fontWeight: "700",
  },

  modalMessage: {
    color: COLORS.text,
    textAlign: "center",
    marginBottom: THEME.spacing.md,
    lineHeight: 22,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: THEME.spacing.md,
  },

  modalActionsMobile: {
    flexDirection: "column",
    gap: 10,
  },

  modalBtn: {
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBtnMobile: {
    width: "100%",
    minWidth: 0,
  },

  modalBtnCancel: {
    backgroundColor: COLORS.border,
  },

  modalBtnCancelText: {
    color: COLORS.text,
    fontWeight: "600",
  },

  modalBtnDanger: {
    backgroundColor: "#b91c1c",
  },

  modalBtnDangerText: {
    color: "#fff",
    fontWeight: "700",
  },

  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
  },

  modalBtnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },

  // Nuevos estilos de diseño de barra lateral premium
  mainAppRow: {
    flex: 1,
    flexDirection: "row",
    height: (Platform.OS === "web" ? "100vh" : "100%") as any,
    width: "100%",
    backgroundColor: COLORS.bg,
  },
  mainContentContainer: {
    flex: 1,
    height: "100%",
    minWidth: 0,
    backgroundColor: COLORS.bg,
  },
  sidebar: {
    height: "100%",
    backgroundColor: COLORS.card,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 200,
    backgroundColor: COLORS.card,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 150,
  },
  sidebarInner: {
    flex: 1,
    height: "100%",
    paddingVertical: THEME.spacing.md,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 48,
  },
  sidebarLogoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: "#f1caca",
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarHeaderTitles: {
    flex: 1,
    marginLeft: 12,
  },
  sidebarTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  sidebarSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
    marginTop: 1,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 11,
    marginBottom: THEME.spacing.md,
  },
  sidebarScroll: {
    paddingHorizontal: 8,
    gap: 4,
  },
  sidebarMenuSection: {
    width: "100%",
  },
  sidebarBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.md,
    backgroundColor: "transparent",
    position: "relative",
    height: 48,
  },
  sidebarBtnActive: {
    backgroundColor: COLORS.primarySoft,
  },
  sidebarActiveIndicator: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  sidebarBtnIcon: {
    marginRight: 12,
    width: 24,
    textAlign: "center",
  },
  sidebarBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.muted,
    flex: 1,
  },
  sidebarBtnTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  sidebarChevron: {
    marginLeft: 4,
  },
  submenuContainer: {
    paddingLeft: 12,
    marginTop: 4,
    marginBottom: 8,
    gap: 2,
  },
  submenuBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.sm,
    height: 36,
  },
  submenuBtnActive: {
    backgroundColor: "#F8FAFC",
  },
  submenuBtnIcon: {
    marginRight: 10,
    width: 16,
    textAlign: "center",
  },
  submenuText: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.muted,
  },
  submenuTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  sidebarFooter: {
    paddingHorizontal: 8,
    gap: 4,
  },
  sidebarFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.md,
    height: 40,
  },
  sidebarFooterText: {
    marginLeft: 12,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
    flexWrap: "wrap",
  },
  lockBannerLocked: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  lockBannerUnlocked: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  lockBannerTextWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 200,
  },
  lockBannerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  lockBannerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  lockBannerBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
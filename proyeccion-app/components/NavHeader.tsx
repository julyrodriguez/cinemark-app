import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";

export type NewsItem = {
  id: string;
  tag: string;
  badgeColor: string;
  badgeBg: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message: string;
  detail?: string;
  ticker: string;
  date?: string;
};

const DEFAULT_NEWS: NewsItem[] = [
  {
    id: "creditos-print",
    tag: "NUEVO",
    badgeColor: "#10B981",
    badgeBg: "rgba(16, 185, 129, 0.14)",
    icon: "printer-check",
    title: "Impresión de Programación con Créditos",
    message: "¡Ahora se puede imprimir las programaciones con los créditos incluidos!",
    detail:
      "Al generar la impresión o exportación de la programación de salas, podés activar el interruptor 'Imprimir con Créditos' para incluir los horarios de encendido/apagado de luces y post-créditos vinculados.",
    ticker: "PRG+CRD ▲",
    date: "Hoy",
  },
  {
    id: "offline-mode",
    tag: "SISTEMA",
    badgeColor: "#3B82F6",
    badgeBg: "rgba(59, 130, 246, 0.14)",
    icon: "server-network",
    title: "Detección Automática de Servidor",
    message: "Modo lectura de respaldo automático ante caídas con control de IP salteado",
    detail:
      "Si el servidor principal está fuera de línea, la aplicación conmuta automáticamente al respaldo de Firebase, saltea la validación de IP para no bloquear el ingreso y te permite operar en modo solo lectura.",
    ticker: "SRV:AUTO ●",
    date: "Nuevo",
  },
  {
    id: "reloj-opt",
    tag: "UPDATE",
    badgeColor: "#8B5CF6",
    badgeBg: "rgba(139, 92, 246, 0.14)",
    icon: "trending-up",
    title: "Cálculo Reloj y Exportación Excel",
    message: "Exportación a Excel estilizada, cálculo reloj preciso y control de salas",
    detail:
      "Se optimizó la vinculación optimista de créditos con programación y la visualización de observaciones generales con niveles de urgencia.",
    ticker: "XLSX:LIVE ▲",
    date: "Reciente",
  },
];

type Props = {
  title?: string;
  subtitle?: string;
  onPressSettings?: () => void;
  onPressMenu?: () => void;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
  newsItems?: NewsItem[];
};

export default function NavHeader({
  title,
  subtitle,
  onPressSettings,
  onPressMenu,
  themeMode = "light",
  onToggleTheme,
  newsItems,
}: Props) {
  const { isWeb, isMobile, contentMaxWidth } = useAppLayout();

  const news = newsItems && newsItems.length > 0 ? newsItems : DEFAULT_NEWS;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const currentNews = news[currentIndex] || news[0];

  const changeNews = useCallback(
    (nextIndex: number) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(slideAnim, {
          toValue: -8,
          duration: 180,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(() => {
        setCurrentIndex(nextIndex);
        slideAnim.setValue(8);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 220,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim]
  );

  const handleNext = useCallback(() => {
    const next = (currentIndex + 1) % news.length;
    changeNews(next);
  }, [currentIndex, news.length, changeNews]);

  const handlePrev = useCallback(() => {
    const prev = (currentIndex - 1 + news.length) % news.length;
    changeNews(prev);
  }, [currentIndex, news.length, changeNews]);

  // Rotación automática cada 4.5 segundos si no está en pausa
  useEffect(() => {
    if (isPaused || isHovered || news.length <= 1) return;

    const timer = setInterval(() => {
      handleNext();
    }, 4500);

    return () => clearInterval(timer);
  }, [isPaused, isHovered, handleNext, news.length]);

  const isDark = themeMode === "dark";

  return (
    <View style={[s.wrap, isWeb ? s.wrapWeb : s.wrapMobile]}>
      <View
        style={[
          s.row,
          isWeb && {
            maxWidth: contentMaxWidth,
          },
        ]}
      >
        {/* Botón de menú en móviles */}
        <View style={s.side}>
          {isMobile && onPressMenu ? (
            <TouchableOpacity
              style={s.menuBtn}
              onPress={onPressMenu}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="menu"
                size={24}
                color={COLORS.text}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Centro: Comunicador de novedades estilo broker / ticker card */}
        <View style={s.centerBlock}>
          <TouchableOpacity
            style={[
              s.brokerCard,
              isDark ? s.brokerCardDark : s.brokerCardLight,
              isHovered && s.brokerCardHover,
            ]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.85}
            {...({
              onMouseEnter: () => setIsHovered(true),
              onMouseLeave: () => setIsHovered(false),
            } as any)}
          >
            {/* Tag / Badge estilo broker ticker */}
            <View
              style={[
                s.badgeContainer,
                {
                  backgroundColor: currentNews.badgeBg,
                  borderColor: currentNews.badgeColor,
                },
              ]}
            >
              <View
                style={[
                  s.badgeLiveDot,
                  { backgroundColor: currentNews.badgeColor },
                ]}
              />
              <MaterialCommunityIcons
                name={currentNews.icon}
                size={13}
                color={currentNews.badgeColor}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  s.badgeText,
                  { color: currentNews.badgeColor },
                ]}
              >
                {currentNews.tag}
              </Text>
            </View>

            {/* Mensaje animado tipo ticker */}
            <Animated.View
              style={[
                s.tickerContent,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text
                style={[
                  s.tickerMessage,
                  isDark ? s.tickerMessageDark : s.tickerMessageLight,
                ]}
                numberOfLines={1}
              >
                {currentNews.message}
              </Text>
            </Animated.View>

            {/* Métrica / Ticker Code estilo broker de acciones (solo desktop) */}
            {isWeb && !isMobile && (
              <View
                style={[
                  s.tickerMetricWrap,
                  {
                    backgroundColor: currentNews.badgeBg,
                    borderColor: currentNews.badgeColor,
                  },
                ]}
              >
                <Text
                  style={[
                    s.tickerMetricText,
                    { color: currentNews.badgeColor },
                  ]}
                >
                  {currentNews.ticker}
                </Text>
              </View>
            )}

            {/* Controles de navegación del ticker */}
            <View style={s.tickerNavWrap}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  handlePrev();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={s.navArrow}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={16}
                  color={COLORS.muted}
                />
              </TouchableOpacity>

              <Text style={s.navCounter}>
                {currentIndex + 1}/{news.length}
              </Text>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleNext();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={s.navArrow}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>

        {/* Lado derecho: botón de cambio de tema */}
        <View style={s.sideRightWrap}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={onToggleTheme}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={themeMode === "dark" ? "weather-sunny" : "weather-night"}
              size={isMobile ? 22 : 24}
              color={COLORS.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal interactivo con todas las novedades */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isMobile && s.modalCardMobile]}>
            <View style={s.modalHeader}>
              <View style={s.modalHeaderTitleWrap}>
                <MaterialCommunityIcons
                  name="bullhorn-variant-outline"
                  size={24}
                  color={COLORS.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={s.modalTitle}>Novedades y Actualizaciones</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={s.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={s.modalScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            >
              {news.map((item) => (
                <View key={item.id} style={s.newsCardItem}>
                  <View style={s.newsCardTop}>
                    <View
                      style={[
                        s.badgeContainer,
                        {
                          backgroundColor: item.badgeBg,
                          borderColor: item.badgeColor,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={12}
                        color={item.badgeColor}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[s.badgeText, { color: item.badgeColor }]}
                      >
                        {item.tag}
                      </Text>
                    </View>

                    <View style={s.newsItemRightMeta}>
                      <Text style={s.newsItemTicker}>{item.ticker}</Text>
                      {item.date && (
                        <Text style={s.newsItemDate}>{item.date}</Text>
                      )}
                    </View>
                  </View>

                  <Text style={s.newsItemTitle}>{item.title}</Text>
                  <Text style={s.newsItemDetail}>
                    {item.detail || item.message}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity
                style={s.modalOkBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={s.modalOkBtnText}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  wrapWeb: {
    height: 72,
    paddingHorizontal: THEME.spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    ...THEME.shadow.web,
  },

  wrapMobile: {
    paddingTop: 48,
    paddingBottom: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },

  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },

  side: {
    width: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  centerBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  /* Card estilo broker ticker */
  brokerCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 720,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },

  brokerCardLight: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },

  brokerCardDark: {
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderColor: "rgba(71, 85, 105, 0.5)",
  },

  brokerCardHover: {
    borderColor: "#94A3B8",
  },

  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 0.5,
  },

  badgeLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },

  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  tickerContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },

  tickerMessage: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
  },

  tickerMessageLight: {
    color: "#1E293B",
  },

  tickerMessageDark: {
    color: "#F8FAFC",
  },

  tickerMetricWrap: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
  },

  tickerMetricText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  tickerNavWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: 4,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(148, 163, 184, 0.2)",
  },

  navArrow: {
    padding: 2,
    borderRadius: 4,
  },

  navCounter: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
    paddingHorizontal: 2,
  },

  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  sideRightWrap: {
    width: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  /* Modal de novedades */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "80%",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },

  modalCardMobile: {
    maxWidth: "96%",
    padding: 16,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  modalHeaderTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
  },

  modalCloseBtn: {
    padding: 4,
    borderRadius: 6,
  },

  modalScroll: {
    flexGrow: 0,
  },

  newsCardItem: {
    backgroundColor: COLORS.bgMobile,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  newsCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  newsItemRightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  newsItemTicker: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.primary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  newsItemDate: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "500",
  },

  newsItemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },

  newsItemDetail: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
  },

  modalFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: "flex-end",
  },

  modalOkBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
  },

  modalOkBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
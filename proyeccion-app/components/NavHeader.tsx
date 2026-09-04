import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
    message:
      "✨ Nueva función: Ahora podés imprimir y exportar las programaciones completas con los créditos de luces y post-créditos vinculados a cada función.",
    detail:
      "Al generar la impresión o exportación a PDF de la programación semanal/diaria, podés activar el interruptor 'Imprimir con Créditos' para visualizar automáticamente los horarios de encendido/apagado de sala y post-créditos vinculados.",
    ticker: "PRG+CRD ▲",
    date: "Hoy",
  },
  {
    id: "control-salas-butacas",
    tag: "SALAS",
    badgeColor: "#F59E0B",
    badgeBg: "rgba(245, 158, 11, 0.14)",
    icon: "seat",
    title: "Control de Salas: Gravedad de Butacas y Observaciones",
    message:
      "💺 Control de Salas: Ahora las butacas dañadas incluyen nivel de gravedad y se incorporan observaciones generales por sala.",
    detail:
      "En el módulo de Control de Salas podés clasificar la gravedad de daño de cada butaca reportada y cargar observaciones generales por sala para optimizar el mantenimiento y seguimiento.",
    ticker: "SALAS+OBS ▲",
    date: "Nuevo",
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

/**
 * Subcomponente de texto estilo Marquesina / Ticker de Broker.
 * Si el texto es más largo que el ancho disponible del contenedor,
 * se desliza suavemente hacia la izquierda para que se pueda leer completo.
 */
function MarqueeText({
  text,
  isDark,
  isHovered,
  onComplete,
}: {
  text: string;
  isDark: boolean;
  isHovered: boolean;
  onComplete?: () => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const scrollAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const isOverflowing = textWidth > viewportWidth && viewportWidth > 0;
  const distance = isOverflowing ? textWidth - viewportWidth + 24 : 0;

  useEffect(() => {
    scrollAnim.setValue(0);
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }

    if (isHovered) {
      return;
    }

    if (!isOverflowing) {
      // Texto corto que entra completamente: mantener visible 5.5s y rotar
      const timer = setTimeout(() => {
        if (!isHovered && onComplete) {
          onComplete();
        }
      }, 5500);
      return () => clearTimeout(timer);
    }

    // Velocidad de desplazamiento: ~38 píxeles por segundo (lectura cómoda)
    const duration = Math.max(3000, (distance / 38) * 1000);

    const anim = Animated.sequence([
      Animated.delay(1600), // Pausa inicial para que el usuario empiece a leer
      Animated.timing(scrollAnim, {
        toValue: -distance,
        duration,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.delay(1800), // Pausa final para leer el remate del mensaje
    ]);

    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished && !isHovered && onComplete) {
        onComplete();
      }
    });

    return () => {
      anim.stop();
    };
  }, [text, isOverflowing, distance, isHovered, onComplete, scrollAnim]);

  return (
    <View
      style={s.tickerViewport}
      onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          s.tickerAnimatedTrack,
          {
            transform: [{ translateX: scrollAnim }],
          },
        ]}
      >
        <Text
          onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
          style={[
            s.tickerMessage,
            isDark ? s.tickerMessageDark : s.tickerMessageLight,
            Platform.OS === "web" && ({ whiteSpace: "nowrap" } as any),
          ]}
          numberOfLines={1}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

export default function NavHeader({
  title,
  subtitle,
  onPressSettings,
  onPressMenu,
  themeMode = "light",
  onToggleTheme,
  newsItems,
}: Props) {
  const { isWeb, isMobile } = useAppLayout();

  const news = newsItems && newsItems.length > 0 ? newsItems : DEFAULT_NEWS;
  const [currentIndex, setCurrentIndex] = useState(0);
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

  const isDark = themeMode === "dark";

  return (
    <View style={[s.wrap, isWeb ? s.wrapWeb : s.wrapMobile]}>
      <View style={s.row}>
        {/* Botón de menú en dispositivos móviles */}
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

        {/* Centro: Comunicador de novedades amplio estilo broker / ticker */}
        <View style={s.centerBlock}>
          <TouchableOpacity
            style={[
              s.brokerCard,
              isDark ? s.brokerCardDark : s.brokerCardLight,
              isHovered && s.brokerCardHover,
              !isMobile && s.brokerCardDesktop,
            ]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.85}
            {...({
              onMouseEnter: () => setIsHovered(true),
              onMouseLeave: () => setIsHovered(false),
            } as any)}
          >
            {/* Tag / Badge estilo broker stock */}
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
                size={14}
                color={currentNews.badgeColor}
                style={{ marginRight: 5 }}
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

            {/* Mensaje con animación vertical al cambiar y desplazamiento horizontal si desborda */}
            <Animated.View
              style={[
                s.tickerContent,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <MarqueeText
                text={currentNews.message}
                isDark={isDark}
                isHovered={isHovered}
                onComplete={news.length > 1 ? handleNext : undefined}
              />
            </Animated.View>

            {/* Métrica / Ticker Code bursátil (en escritorio) */}
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

      {/* Modal interactivo con todas las novedades detalladas */}
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
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    ...THEME.shadow.web,
  },

  wrapMobile: {
    paddingTop: 48,
    paddingBottom: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
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
    width: 44,
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
    maxWidth: "100%",
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 10,
  },

  brokerCardDesktop: {
    maxWidth: 1400,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
  },

  brokerCardLight: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
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
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 0.5,
    flexShrink: 0,
  },

  badgeLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  tickerContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    overflow: "hidden",
  },

  tickerViewport: {
    width: "100%",
    overflow: "hidden",
    justifyContent: "center",
  },

  tickerAnimatedTrack: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },

  tickerMessage: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: -0.2,
  },

  tickerMessageLight: {
    color: "#0F172A",
  },

  tickerMessageDark: {
    color: "#F8FAFC",
  },

  tickerMetricWrap: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    flexShrink: 0,
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
    gap: 3,
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(148, 163, 184, 0.25)",
    flexShrink: 0,
  },

  navArrow: {
    padding: 3,
    borderRadius: 4,
  },

  navCounter: {
    fontSize: 10.5,
    fontWeight: "700",
    color: COLORS.muted,
    paddingHorizontal: 2,
  },

  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  sideRightWrap: {
    width: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    maxWidth: 580,
    maxHeight: "82%",
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
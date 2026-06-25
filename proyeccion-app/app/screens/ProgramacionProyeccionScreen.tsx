// app/screens/ProgramacionProyeccionScreen.tsx

import React, { useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { doc, onSnapshot } from "firebase/firestore";
import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { useAuthUser } from "../../lib/useAuthUser";
import { COLORS, THEME } from "../../lib/theme";
import { WeekdayKey } from "../../lib/programacion/types";

// Types
interface DailyShow {
  sala: number;
  pelicula: string;
  calificacion: string;
  inicio: string;
  fin: string;
  sortInicio: number;
  sortFin: number;
}

interface SavedWeekly {
  startDate: string;
  savedAt: string;
  weeklyRows: any[];
}

const DAYS_OF_WEEK: { key: WeekdayKey; label: string }[] = [
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
];

const MINUTE_WIDTH = 2; // px per minute
const HOUR_WIDTH = 60 * MINUTE_WIDTH; // 120px per hour
const ROW_HEIGHT = 72; // height of each room row
const HEADER_HEIGHT = 44; // height of timeline hours header
const ROOM_COL_WIDTH = 80; // width of rooms left column

// Helper to convert time "HH:MM" to minutes from midnight
function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Helper to add minutes to a time string
function addMinutesToTimeStr(timeStr: string, minsToAdd: number): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const totalMins = (h * 60 + m + minsToAdd) % 1440;
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

// Helper to format minutes from 6 AM to time "HH:MM"
function formatMinutesToTime(minsFrom6AM: number): string {
  const totalMins = (6 * 60 + minsFrom6AM) % 1440;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Generate deterministic colors for each movie title
function getMovieColor(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 38%)`;
}

export default function ProgramacionProyeccionScreen({ readOnly }: { readOnly: boolean }) {
  const { cineId } = useAuthUser();
  const [loading, setLoading] = useState(true);
  const [savedWeekly, setSavedWeekly] = useState<SavedWeekly | null>(null);
  const [selectedDay, setSelectedDay] = useState<WeekdayKey>("jueves");
  const [selectedShow, setSelectedShow] = useState<DailyShow | null>(null);

  // Subscribe to weekly programming saved in database under "Servicios Programacion"
  useEffect(() => {
    if (!cineId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", "actual");
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSavedWeekly({
            startDate: data.startDate || "",
            savedAt: data.savedAt || "",
            weeklyRows: data.weeklyRows || [],
          });
        } else {
          setSavedWeekly(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("[ProgramacionProyeccionScreen] Error loading programming:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [cineId]);

  // Extract all unique room numbers
  const rooms = useMemo(() => {
    if (!savedWeekly?.weeklyRows) return [];
    const set = new Set<number>();
    savedWeekly.weeklyRows.forEach((row) => {
      if (row.sala !== undefined && row.sala !== null) {
        set.add(Number(row.sala));
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [savedWeekly]);

  // Build the list of shows for the selected day
  const shows = useMemo(() => {
    if (!savedWeekly?.weeklyRows) return [];
    const list: DailyShow[] = [];
    savedWeekly.weeklyRows.forEach((row) => {
      const ranges = row.horariosPorDia?.[selectedDay] ?? [];
      ranges.forEach((item: string) => {
        let inicio = "";
        let fin = "";
        const match = item.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        if (match) {
          inicio = match[1];
          fin = match[2];
        } else {
          const timeMatch = item.match(/(\d{1,2}:\d{2})/);
          if (timeMatch) {
            inicio = timeMatch[1];
            // Fallback duration 120 minutes
            const [h, m] = inicio.split(":").map(Number);
            const endMins = (h * 60 + m + 120) % 1440;
            const endH = Math.floor(endMins / 60);
            const endM = endMins % 60;
            fin = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          }
        }

        if (inicio && fin) {
          list.push({
            sala: Number(row.sala),
            pelicula: row.pelicula,
            calificacion: row.calificacion || "",
            inicio,
            fin,
            sortInicio: timeToMinutes(inicio),
            sortFin: timeToMinutes(fin),
          });
        }
      });
    });
    return list;
  }, [savedWeekly, selectedDay]);

  // Determine dynamic timeline start and end bounds based on shows of the selected day
  const { timelineStartMins, timelineEndMins, minStartMins } = useMemo(() => {
    if (shows.length === 0) {
      return { timelineStartMins: 0, timelineEndMins: 1440, minStartMins: 0 };
    }
    let minStart = 1440;
    let maxEnd = 0;
    shows.forEach((show) => {
      const startMins = timeToMinutes(show.inicio);
      const endMins = timeToMinutes(show.fin);
      let tStart = startMins >= 360 ? startMins - 360 : startMins + 1440 - 360;
      let tEnd = endMins >= 360 ? endMins - 360 : endMins + 1440 - 360;
      if (tEnd < tStart) {
        tEnd += 1440;
      }
      if (tStart < minStart) minStart = tStart;
      if (tEnd > maxEnd) maxEnd = tEnd;
    });

    // 1 hour before first show start (aligned to start of hour)
    let start = Math.max(0, Math.floor((minStart - 60) / 60) * 60);
    // 1 hour after last show end (aligned to end of hour)
    let end = Math.min(1440, Math.ceil((maxEnd + 60) / 60) * 60);

    return { timelineStartMins: start, timelineEndMins: end, minStartMins: minStart };
  }, [shows]);

  // Calculate opening line position (30 minutes before first show starts)
  const openingLeft = useMemo(() => {
    if (shows.length === 0) return null;
    const openingMins = minStartMins - 30;
    return (openingMins - timelineStartMins) * MINUTE_WIDTH;
  }, [minStartMins, timelineStartMins, shows]);

  // Calculate card position and width based on dynamic timeline bounds
  const getPositionAndWidth = (show: DailyShow) => {
    const startMins = timeToMinutes(show.inicio);
    const endMins = timeToMinutes(show.fin);

    // Map to timeline minutes (starting at 06:00 AM)
    let tStart = startMins >= 360 ? startMins - 360 : startMins + 1440 - 360;
    let tEnd = endMins >= 360 ? endMins - 360 : endMins + 1440 - 360;

    if (tEnd < tStart) {
      tEnd += 1440;
    }

    const duration = tEnd - tStart;

    return {
      left: (tStart - timelineStartMins) * MINUTE_WIDTH,
      width: Math.max(duration * MINUTE_WIDTH, 50),
    };
  };

  // Generate hour markings for the header
  const dynamicHoursArray = useMemo(() => {
    const list = [];
    const startHour = 6 + timelineStartMins / 60;
    const totalHours = (timelineEndMins - timelineStartMins) / 60;
    for (let i = 0; i < totalHours; i++) {
      const h = (startHour + i) % 24;
      list.push(`${String(h).padStart(2, "0")}:00`);
    }
    return list;
  }, [timelineStartMins, timelineEndMins]);

  const timelineWidth = dynamicHoursArray.length * HOUR_WIDTH;

  // Calculate show duration in minutes
  const getShowDuration = (show: DailyShow) => {
    const startMins = timeToMinutes(show.inicio);
    const endMins = timeToMinutes(show.fin);
    let tStart = startMins >= 360 ? startMins - 360 : startMins + 1440 - 360;
    let tEnd = endMins >= 360 ? endMins - 360 : endMins + 1440 - 360;
    if (tEnd < tStart) {
      tEnd += 1440;
    }
    return tEnd - tStart;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando programación...</Text>
      </View>
    );
  }

  if (!savedWeekly || rooms.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="calendar-blank" size={64} color={COLORS.muted} />
        <Text style={styles.noDataTitle}>No hay programación cargada</Text>
        <Text style={styles.noDataSubtitle}>
          Subí el reporte en la sección de Servicios &gt; Programaciones para visualizar la programación aquí.
        </Text>
      </View>
    );
  }

  const formattedWeekLabel = savedWeekly.startDate
    ? `Semana del ${savedWeekly.startDate}`
    : "Programación Semanal";

  return (
    <View style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{formattedWeekLabel}</Text>
          <Text style={styles.headerSubtitle}>
            Línea de tiempo dinámica adaptada a las funciones de cada día (6:00 AM a 6:00 AM)
          </Text>
        </View>
      </View>

      {/* Days Tabs Selection */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {DAYS_OF_WEEK.map((day) => {
            const isActive = selectedDay === day.key;
            return (
              <TouchableOpacity
                key={day.key}
                onPress={() => setSelectedDay(day.key)}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Grid View */}
      <View style={styles.gridContainer}>
        <ScrollView style={styles.verticalScrollView} bounces={false}>
          <View style={styles.mainLayoutRow}>
            {/* Rooms fixed left column */}
            <View style={[styles.roomsColumn, { marginTop: HEADER_HEIGHT }]}>
              {rooms.map((salaNum) => (
                <View key={salaNum} style={styles.roomLabelCell}>
                  <Text style={styles.roomLabelText}>Sala {salaNum}</Text>
                </View>
              ))}
            </View>

            {/* Scrollable Timeline */}
            <ScrollView
              horizontal
              bounces={false}
              showsHorizontalScrollIndicator={true}
              style={styles.timelineHorizontalScroll}
            >
              <View style={{ width: timelineWidth }}>
                {/* Timeline Hour Header */}
                <View style={styles.hourHeaderRow}>
                  {dynamicHoursArray.map((hourText, idx) => (
                    <View key={idx} style={[styles.hourHeaderCell, { width: HOUR_WIDTH }]}>
                      <Text style={styles.hourHeaderText}>{hourText}</Text>
                    </View>
                  ))}
                </View>

                {/* Timeline Grid & Cards */}
                <View style={[styles.gridAndCardsContainer, { height: rooms.length * ROW_HEIGHT }]}>
                  {/* Grid Lines Background */}
                  <View style={StyleSheet.absoluteFill}>
                    {dynamicHoursArray.map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.gridLineColumn,
                          {
                            left: idx * HOUR_WIDTH,
                            width: 1,
                            backgroundColor: COLORS.border,
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                          },
                        ]}
                      />
                    ))}
                    {/* Final closing line */}
                    <View
                      style={{
                        left: timelineWidth - 1,
                        width: 1,
                        backgroundColor: COLORS.border,
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                      }}
                    />
                  </View>

                  {/* Cinema Opening Line (zIndex: 1, sits under cards but above grid) */}
                  {openingLeft !== null && (
                    <View
                      style={[
                        styles.openingLine,
                        {
                          left: openingLeft,
                          height: rooms.length * ROW_HEIGHT,
                          top: 0,
                        },
                      ]}
                    >
                      <View style={styles.openingLineBadge}>
                        <Text style={styles.openingLineBadgeText} numberOfLines={1}>
                          Apertura: {formatMinutesToTime(minStartMins - 30)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Rows containing the movie cards (zIndex: 2) */}
                  {rooms.map((salaNum, roomIndex) => {
                    const showsInSala = shows.filter((s) => s.sala === salaNum);
                    return (
                      <View
                        key={salaNum}
                        style={[
                          styles.timelineRow,
                          {
                            top: roomIndex * ROW_HEIGHT,
                            height: ROW_HEIGHT,
                          },
                        ]}
                      >
                        {showsInSala.map((show, showIdx) => {
                          const { left, width } = getPositionAndWidth(show);
                          const movieAccentColor = getMovieColor(show.pelicula);
                          const is3D = /3d/i.test(show.pelicula);
                          const showAds = width > 75; // show ads prefix block if card is wide enough

                          return (
                            <TouchableOpacity
                              key={showIdx}
                              activeOpacity={0.7}
                              style={[
                                styles.movieCard,
                                {
                                  left,
                                  width,
                                  borderLeftColor: movieAccentColor,
                                },
                                is3D
                                  ? {
                                      backgroundColor: movieAccentColor,
                                      borderColor: movieAccentColor,
                                    }
                                  : {
                                      backgroundColor: COLORS.card,
                                    },
                              ]}
                              onPress={() => setSelectedShow(show)}
                            >
                              {/* 12m Publicity prefix zone */}
                              {showAds && (
                                <View
                                  style={[
                                    styles.adsPrefix,
                                    is3D
                                      ? {
                                          backgroundColor: "rgba(255, 255, 255, 0.16)",
                                          borderRightColor: "rgba(255, 255, 255, 0.3)",
                                        }
                                      : {
                                          backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
                                          borderRightColor: COLORS.border,
                                        },
                                  ]}
                                >
                                  <Text style={[styles.adsPrefixText, is3D && { color: "#FFFFFF" }]}>
                                    Publi 12m
                                  </Text>
                                </View>
                              )}

                              {/* Card Content */}
                              <View style={[styles.movieCardContent, showAds && { paddingLeft: 12 * MINUTE_WIDTH + 6 }]}>
                                <Text
                                  style={[styles.movieCardTitle, is3D && { color: "#FFFFFF" }]}
                                  numberOfLines={1}
                                >
                                  {show.pelicula}
                                </Text>
                                <View style={styles.movieCardFooter}>
                                  <Text
                                    style={[styles.movieCardTime, is3D && { color: "rgba(255,255,255,0.85)" }]}
                                    numberOfLines={1}
                                  >
                                    {show.inicio} - {show.fin}
                                  </Text>
                                  {show.calificacion ? (
                                    <View
                                      style={[
                                        styles.ratingBadge,
                                        is3D && {
                                          backgroundColor: "rgba(255, 255, 255, 0.22)",
                                          borderColor: "transparent",
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[styles.ratingBadgeText, is3D && { color: "#FFFFFF" }]}
                                        numberOfLines={1}
                                      >
                                        {show.calificacion}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {/* Show Details Modal */}
      <Modal
        visible={selectedShow !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedShow(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Detalle de Función</Text>
              <TouchableOpacity onPress={() => setSelectedShow(null)} style={styles.modalCloseButton}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {selectedShow && (
              <View style={styles.modalBody}>
                {/* Movie Title */}
                <Text style={styles.modalMovieTitle}>{selectedShow.pelicula}</Text>

                {/* Details list */}
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="door-open" size={22} color={COLORS.muted} style={styles.detailIcon} />
                  <View>
                    <Text style={styles.detailLabel}>Sala</Text>
                    <Text style={styles.detailValue}>Sala {selectedShow.sala}</Text>
                  </View>
                </View>

                {/* Ads / Film Startup detail breakdown */}
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="projector" size={22} color={COLORS.muted} style={styles.detailIcon} />
                  <View>
                    <Text style={styles.detailLabel}>Cronograma de Proyección</Text>
                    <Text style={styles.detailValueSub}>
                      • Encendido / Publicidad (12 min): <Text style={styles.detailHighlight}>{selectedShow.inicio} hs</Text>
                    </Text>
                    <Text style={styles.detailValueSub}>
                      • Inicio de Película: <Text style={styles.detailHighlight}>{addMinutesToTimeStr(selectedShow.inicio, 12)} hs</Text>
                    </Text>
                    <Text style={styles.detailValueSub}>
                      • Finalización de Función: <Text style={styles.detailHighlight}>{selectedShow.fin} hs</Text>
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="timer-outline" size={22} color={COLORS.muted} style={styles.detailIcon} />
                  <View>
                    <Text style={styles.detailLabel}>Duración Total del Bloque</Text>
                    <Text style={styles.detailValue}>{getShowDuration(selectedShow)} minutos (incluye publicidad)</Text>
                  </View>
                </View>

                {selectedShow.calificacion ? (
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="account-alert-outline" size={22} color={COLORS.muted} style={styles.detailIcon} />
                    <View>
                      <Text style={styles.detailLabel}>Calificación</Text>
                      <Text style={styles.detailValue}>{selectedShow.calificacion}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            )}

            <TouchableOpacity onPress={() => setSelectedShow(null)} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.xl,
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: THEME.spacing.md,
    color: COLORS.textSoft,
    fontSize: THEME.fontSize.md,
  },
  noDataTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: THEME.spacing.lg,
    textAlign: "center",
  },
  noDataSubtitle: {
    fontSize: THEME.fontSize.md,
    color: COLORS.textSoft,
    marginTop: THEME.spacing.sm,
    textAlign: "center",
    maxWidth: 400,
    lineHeight: 22,
  },
  header: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.md,
    paddingBottom: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerInfo: {
    flexDirection: "column",
  },
  headerTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "900",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.textSoft,
    marginTop: 2,
  },
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  tabBar: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  tabButton: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.radius.full,
    backgroundColor: Platform.OS === "web" ? "var(--bg, #F1F5F9)" : "#F1F5F9",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "bold",
    color: COLORS.text,
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  gridContainer: {
    flex: 1,
  },
  verticalScrollView: {
    flex: 1,
  },
  mainLayoutRow: {
    flexDirection: "row",
  },
  roomsColumn: {
    width: ROOM_COL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.card,
    zIndex: 3,
    ...Platform.select({
      web: {
        boxShadow: "2px 0 8px rgba(0,0,0,0.05)",
      },
      default: {
        elevation: 3,
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
    }),
  },
  roomLabelCell: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  roomLabelText: {
    fontSize: THEME.fontSize.md,
    fontWeight: "bold",
    color: COLORS.text,
  },
  timelineHorizontalScroll: {
    flex: 1,
  },
  hourHeaderRow: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  hourHeaderCell: {
    height: HEADER_HEIGHT,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: THEME.spacing.xs,
  },
  hourHeaderText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  gridAndCardsContainer: {
    position: "relative",
  },
  gridLineColumn: {
    opacity: 0.25,
  },
  openingLine: {
    position: "absolute",
    width: 2,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: COLORS.primary,
    zIndex: 1,
    alignItems: "center",
  },
  openingLineBadge: {
    position: "absolute",
    top: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    width: 104,
    alignItems: "center",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
      },
    }),
  },
  openingLineBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  timelineRow: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    justifyContent: "center",
    zIndex: 2,
  },
  movieCard: {
    position: "absolute",
    height: ROW_HEIGHT - 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderRadius: THEME.radius.sm,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
        cursor: "pointer",
        transitionDuration: "0.2s",
      },
      default: {
        elevation: 1,
      },
    }),
  },
  adsPrefix: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 12 * MINUTE_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
  },
  adsPrefixText: {
    fontSize: 8,
    fontWeight: "900",
    color: COLORS.textSoft,
  },
  movieCardContent: {
    flex: 1,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    justifyContent: "space-between",
  },
  movieCardTitle: {
    fontSize: THEME.fontSize.xs + 1,
    fontWeight: "bold",
    color: COLORS.text,
  },
  movieCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  movieCardTime: {
    fontSize: THEME.fontSize.xs - 1,
    color: COLORS.textSoft,
    fontWeight: "500",
  },
  ratingBadge: {
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  ratingBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.muted,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.lg,
    ...Platform.select({
      web: {
        boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
      },
    }),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  modalHeaderTitle: {
    fontSize: THEME.fontSize.md + 1,
    fontWeight: "bold",
    color: COLORS.text,
  },
  modalCloseButton: {
    padding: THEME.spacing.xs,
  },
  modalBody: {
    marginBottom: THEME.spacing.lg,
  },
  modalMovieTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: THEME.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: THEME.spacing.sm,
  },
  detailIcon: {
    marginRight: THEME.spacing.md,
    marginTop: 2,
  },
  detailLabel: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.textSoft,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: THEME.fontSize.sm + 1,
    fontWeight: "bold",
    color: COLORS.text,
  },
  detailValueSub: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.text,
    marginTop: 2,
    lineHeight: 18,
  },
  detailHighlight: {
    fontWeight: "bold",
    color: COLORS.primary,
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: THEME.fontSize.md,
    fontWeight: "bold",
  },
});

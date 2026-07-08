// app/screens/ProgramacionProyeccionScreen.tsx

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { doc, onSnapshot, getDoc } from "@/lib/dbService";
import { db, CINES_COLLECTION, functions } from "../../lib/firebaseConfig";
import { httpsCallable } from "@/lib/dbService";
import { useAuthUser } from "../../lib/useAuthUser";
import { COLORS, THEME } from "../../lib/theme";
import { WeekdayKey } from "../../lib/programacion/types";
import dayjs from "dayjs";
import { mockShowtimesData } from "./mockShowtimes";
import { getRoomLayout, SeatInfo, RoomLayout, FirestoreSalaLayout } from "./ControlSalasScreen";
import { getCineConfig } from "../../lib/cineConfig";

// Types
interface DailyShow {
  sala: number;
  pelicula: string;
  calificacion: string;
  inicio: string;
  fin: string;
  sortInicio: number;
  sortFin: number;

  // API / Simulation Mode Properties
  isSimulated?: boolean;
  sessionId?: string;
  sessionDateTime?: string;
  sessionFormat?: string;
  language?: string;
  premiere?: boolean;
  corporateId?: string;
  movieId?: string;
  occupiedSeats?: string[];
  
  capacity?: number;
  availableSeats?: number;
  soldSeats?: number;
  
  hasDbox?: boolean;
  normalCapacity?: number;
  normalAvailable?: number;
  normalSold?: number;
  dboxCapacity?: number;
  dboxAvailable?: number;
  dboxSold?: number;
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

const DAY_CYCLE_INDEX: Record<WeekdayKey, number> = {
  jueves: 0,
  viernes: 1,
  sabado: 2,
  domingo: 3,
  lunes: 4,
  martes: 5,
  miercoles: 6,
};

const MINUTE_WIDTH = 2; // px per minute
const HOUR_WIDTH = 60 * MINUTE_WIDTH; // 120px per hour
const ROW_HEIGHT = 54; // height of each room row (perfect middle-ground)
const HEADER_HEIGHT = 34; // height of timeline hours header
const ROOM_COL_WIDTH = 72; // width of rooms left column
const SCROLLBAR_HEIGHT = Platform.OS === "web" ? 16 : 0;

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

// Helper to get current weekday key
function getCurrentWeekdayKey(): WeekdayKey {
  let now = dayjs();
  // Si es antes de las 6:00 AM, seguimos en el día cinematográfico anterior
  if (now.hour() < 6) {
    now = now.subtract(1, "day");
  }
  const dayNum = now.day(); // 0 = Sunday, 1 = Monday, etc.
  const map: Record<number, WeekdayKey> = {
    0: "domingo",
    1: "lunes",
    2: "martes",
    3: "miercoles",
    4: "jueves",
    5: "viernes",
    6: "sabado",
  };
  return map[dayNum];
}

// Helper to get current time in minutes from 6 AM
function getCurrentTimeMins(): number {
  const now = dayjs();
  const h = now.hour();
  const m = now.minute();
  const minsFromMidnight = h * 60 + m;
  return minsFromMidnight >= 360 ? minsFromMidnight - 360 : minsFromMidnight + 1440 - 360;
}

// Map user's cineId to BFF API theater ID
function getTheaterId(cineId: string): string {
  const mapping: Record<string, string> = {
    "abasto": "103",
    "parquebrown": "2016",
  };
  return mapping[cineId.toLowerCase()] || "103"; // fallback to Abasto (103)
}

// Get start of movie week (Thursday) for a given date in yyyy-mm-dd
function getMovieWeekStart(date: Date): string {
  const localDate = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  if (localDate.getUTCHours() < 6) {
    localDate.setTime(localDate.getTime() - 24 * 60 * 60 * 1000);
  }
  const dayNum = localDate.getUTCDay();
  const daysToSubtract = dayNum <= 3 ? dayNum + 3 : dayNum - 4;
  const thurDate = new Date(localDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  const yyyy = thurDate.getUTCFullYear();
  const mm = String(thurDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(thurDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Get start of movie week (Thursday) for the current date
function getMovieWeekStartForNow(): string {
  const localDate = new Date(Date.now() - (3 * 60 * 60 * 1000));
  if (localDate.getUTCHours() < 6) {
    localDate.setTime(localDate.getTime() - 24 * 60 * 60 * 1000);
  }
  const dayNum = localDate.getUTCDay();
  const daysToSubtract = dayNum <= 3 ? dayNum + 3 : dayNum - 4;
  const thurDate = new Date(localDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  const yyyy = thurDate.getUTCFullYear();
  const mm = String(thurDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(thurDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Format week start date to range label, e.g., "Semana del 25/6 a 01/7"
function formatWeekRange(weekStart: string): string {
  if (!weekStart) return "";
  const [y, m, d] = weekStart.split('-').map(Number);
  const thur = new Date(Date.UTC(y, m - 1, d));
  const wed = new Date(thur.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  const thurD = thur.getUTCDate();
  const thurM = thur.getUTCMonth() + 1;
  const wedD = String(wed.getUTCDate()).padStart(2, '0');
  const wedM = wed.getUTCMonth() + 1;
  
  return `Semana del ${thurD}/${thurM} a ${wedD}/${wedM}`;
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
  const [salasCount, setSalasCount] = useState<number>(12);

  // Load cinema configuration (salas count)
  useEffect(() => {
    if (!cineId) return;

    getCineConfig(cineId)
      .then((cfg) => {
        if (cfg?.salasCount && Number.isFinite(cfg.salasCount) && cfg.salasCount > 0) {
          setSalasCount(Math.floor(cfg.salasCount));
        }
      })
      .catch((e) => console.error("Error loading cine config in ProgramacionProyeccionScreen:", e));
  }, [cineId]);
  const [savedWeekly, setSavedWeekly] = useState<SavedWeekly | null>(null);
  const [selectedDay, setSelectedDay] = useState<WeekdayKey>(getCurrentWeekdayKey());
  const [selectedShow, setSelectedShow] = useState<DailyShow | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [currentTimeMins, setCurrentTimeMins] = useState(getCurrentTimeMins());
  const [scrollEl, setScrollEl] = useState<any>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const timelineScrollRef = useRef<ScrollView>(null);
  const verticalScrollRef = useRef<ScrollView>(null);
  const cardYOffsets = useRef<Record<number, number>>({});
  const listContainerY = useRef(0);
  const lastScrolledDay = useRef<string | null>(null);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const [isScrolled, setIsScrolled] = useState(false);

  const isCollapsed = isMobile && isScrolled;
  const currentRoomColWidth = isCollapsed ? 34 : ROOM_COL_WIDTH;

  // API Data Integration states
  const useApiData = true;
  const [apiData, setApiData] = useState<any[] | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [showStatsPanel, setShowStatsPanel] = useState(false);

  // Seat Map Integration
  const [seatMapData, setSeatMapData] = useState<any | null>(null);
  const [loadingSeatMap, setLoadingSeatMap] = useState<boolean>(false);
  const [seatMapError, setSeatMapError] = useState<string | null>(null);
  const [showSeatMap, setShowSeatMap] = useState<boolean>(false);

  const [activeSalaLayout, setActiveSalaLayout] = useState<RoomLayout | null>(null);

  useEffect(() => {
    if (!cineId || !selectedShow) {
      setActiveSalaLayout(null);
      return;
    }

    const salaId = selectedShow.sala;
    const ref = doc(db, CINES_COLLECTION, cineId, "salas_layouts", String(salaId));
    
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        const dbLayout = snapshot.data() as FirestoreSalaLayout;
        const seats: { [row: string]: SeatInfo[] } = {};
        const customSeats = dbLayout.customSeats || {};
        const customSeatNumbers = dbLayout.customSeatNumbers || {};
        const invertSeats = dbLayout.invertSeats || false;

        for (const row of dbLayout.rows) {
          const rowSeats: SeatInfo[] = [];
          for (let c = 1; c <= dbLayout.maxCol; c++) {
            const key = `${row}-${c}`;
            const exception = customSeats[key];
            
            let type: "seat" | "empty" = "seat";
            let isDbox = false;

            if (exception === "empty") {
              type = "empty";
            } else if (exception === "dbox") {
              isDbox = true;
            }

            const customNum = customSeatNumbers[key];
            const seatNumber = customNum !== undefined ? customNum : (invertSeats ? (dbLayout.maxCol - c + 1) : c);

            rowSeats.push({
              row,
              number: seatNumber,
              colIndex: c,
              type,
              isDbox,
            });
          }
          seats[row] = rowSeats;
        }

        setActiveSalaLayout({
          rows: dbLayout.rows,
          maxCol: dbLayout.maxCol,
          aisles: dbLayout.aisles || [],
          rowAisles: dbLayout.rowAisles || [],
          seats,
          invertSeats,
        });
      } else {
        setActiveSalaLayout(getRoomLayout(salaId));
      }
    }, (error) => {
      console.error("Error listening to sala layout:", error);
      setActiveSalaLayout(getRoomLayout(salaId));
    });

    return () => unsubscribe();
  }, [cineId, selectedShow]);

  const fetchSeatMap = async (show: DailyShow) => {
    if (!show || !cineId) return;
    setLoadingSeatMap(true);
    setSeatMapError(null);
    setSeatMapData(null);
    setShowSeatMap(true);

    // Intentar obtener el mapa de asientos en tiempo real a través de la API primero
    try {
      const getSeatMapFunc = httpsCallable(functions, "getCinemarkSeatMap");
      const res = await getSeatMapFunc({
        cinemaId: getTheaterId(cineId),
        sessionId: show.sessionId,
        corporateFilmId: show.corporateId || show.movieId || "",
        sessionDateTime: show.sessionDateTime
      });

      const responseData = res.data as any;
      if (responseData && responseData.Code === 0) {
        setSeatMapData(responseData.Data);
        setLoadingSeatMap(false);
        return;
      }
    } catch (err: any) {
      console.warn("Real-time seat map fetch failed, trying Firestore fallback:", err);
    }

    // Fallback a Firestore: si la llamada a la API falló (o devolvió código !== 0),
    // intentamos usar los datos en caché (ya sea del show actual o del documento de showtimes en Firestore)
    if (show.occupiedSeats && show.occupiedSeats.length > 0) {
      setLoadingSeatMap(false);
      return;
    }

    try {
      const weekStart = getMovieWeekStart(new Date());
      const docRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart || weekStart);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const sessions: any[] = snap.data()?.sessions || [];
        const saved = sessions.find((s: any) => String(s.sessionId) === String(show.sessionId));
        if (saved?.occupiedSeats && saved.occupiedSeats.length > 0) {
          setSelectedShow(prev => prev ? { ...prev, occupiedSeats: saved.occupiedSeats } : prev);
          setSeatMapError(null);
          setLoadingSeatMap(false);
          return;
        }
      }
      setSeatMapError("No se pudo obtener el mapa de asientos en vivo ni el caché local.");
    } catch (fsErr: any) {
      console.error("Error reading fallback from Firestore:", fsErr);
      setSeatMapError("Error al obtener el mapa de asientos.");
    } finally {
      setLoadingSeatMap(false);
    }
  };

  const renderSeatGrid = (mapData: any) => {
    const layout = activeSalaLayout;
    if (!layout) {
      return (
        <View style={{ padding: 20, alignItems: "center" }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={{ color: COLORS.textSoft, marginTop: 8 }}>Cargando plano de la sala...</Text>
        </View>
      );
    }

    // Build map of occupied seats from API mapData OR pre-saved database occupiedSeats
    const occupiedMap = new Map<string, any>();
    if (mapData && mapData.areas) {
      mapData.areas.forEach((area: any) => {
        if (!area.rows) return;
        area.rows.forEach((row: any) => {
          const rowId = row.rowPhysicalId;
          if (!row.seats) return;
          row.seats.forEach((seat: any) => {
            occupiedMap.set(`${rowId}-${seat.seatNumber}`, seat);
          });
        });
      });
    } else if (selectedShow && selectedShow.occupiedSeats) {
      selectedShow.occupiedSeats.forEach((seatKey: string) => {
        occupiedMap.set(seatKey, { seatStatus: 1 });
      });
    }

    return (
      <View style={styles.seatGridContainer}>
        {/* Screen Indicator */}
        <View style={styles.screenIndicator}>
          <View style={styles.screenLine} />
          <Text style={styles.screenText}>PANTALLA</Text>
        </View>

        <ScrollView 
          horizontal={true} 
          showsHorizontalScrollIndicator={true}
          bounces={true}
          contentContainerStyle={styles.horizontalGridScroll}
          style={{ alignSelf: "stretch" }}
        >
          <View style={{ flexDirection: "column" }}>
            {layout.rows.map((rowName) => {
              const rowSeats = layout.seats[rowName];
              if (!rowSeats) return null;

              // Slice row seats dynamically based on aisles definition
              const sections: SeatInfo[][] = [];
              let prev = 0;
              layout.aisles.forEach((aisleIndex) => {
                sections.push(rowSeats.slice(prev, aisleIndex));
                prev = aisleIndex;
              });
              sections.push(rowSeats.slice(prev, layout.maxCol));

              return (
                <React.Fragment key={rowName}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 3 }}>
                    {/* Left row letter */}
                    <Text style={styles.rowLabelText}>{rowName}</Text>

                    {/* Render sections separated by aisles */}
                    {sections.map((section, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <View style={styles.aisleSpace} />}
                        <View style={{ flexDirection: "row" }}>
                          {section.map((seat) => {
                            if (seat.type === "empty") {
                              return <View key={`empty-${seat.row}-${seat.colIndex}`} style={styles.seatSpacer} />;
                            }

                            const seatKey = `${seat.row}-${seat.number}`;
                            const apiSeat = occupiedMap.get(seatKey);
                            const isSold = apiSeat ? apiSeat.seatStatus !== 0 : false;
                            
                            let seatStyle = styles.seatAvailable;
                            let iconName = "";

                            if (isSold) {
                              const status = apiSeat.seatStatus;
                              if (status === 1 || status === 6 || status === 7) {
                                seatStyle = styles.seatOccupied;
                              } else if (status === 4) {
                                seatStyle = styles.seatWheelchair;
                                iconName = "wheelchair-accessibility";
                              } else if (status === 5) {
                                seatStyle = styles.seatAutoAssigned;
                              } else if (status === 8) {
                                seatStyle = styles.seatBlocked;
                              } else {
                                seatStyle = styles.seatOccupied; // default fallback if sold
                              }
                            }

                            // D-BOX border highlight
                            const isDbox = seat.isDbox;

                            return (
                              <View 
                                key={seatKey} 
                                style={[
                                  styles.seatBase, 
                                  seatStyle,
                                  isDbox && styles.seatDboxBorder
                                ]}
                              >
                                {iconName ? (
                                  <MaterialCommunityIcons 
                                    name={iconName as any} 
                                    size={Platform.select({ web: 13, default: 10 })} 
                                    color="#FFF" 
                                  />
                                ) : (
                                  <Text style={styles.seatNumberText}>{seat.number}</Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </React.Fragment>
                    ))}

                    {/* Right row letter */}
                    <Text style={[styles.rowLabelText, { marginLeft: 8 }]}>{rowName}</Text>
                  </View>
                  {layout.rowAisles?.includes(rowName) && <View style={{ height: 14 }} />}
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  const handleGridScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    setIsScrolled(x > 5);
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollTo({ x, animated: false });
    }
  };

  const handleScrollRef = (el: any) => {
    if (!el) return;
    const scrollNode = el.getScrollableNode ? el.getScrollableNode() : el;
    if (!scrollNode) return;
    if (scrollNode !== scrollEl) {
      setScrollEl(scrollNode);
    }
  };

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
        if (!useApiData) {
          setLoading(false);
        }
      },
      (error) => {
        console.error("[ProgramacionProyeccionScreen] Error loading programming:", error);
        if (!useApiData) {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [cineId, useApiData]);

  // Fetch showtimes from Firestore or fallback to mock data
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!useApiData || !cineId || !selectedWeekStart) return;

    let isMounted = true;
    setLoading(true);
    setApiError(null);

    const docRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart);

    getDoc(docRef)
      .then((snap) => {
        if (isMounted) {
          if (snap.exists()) {
            const data = snap.data();
            setApiData(data.sessions || []);
            setApiError(null);
          } else {
            console.warn(`No showtimes document found in Firestore for week: ${selectedWeekStart}`);
            // Fallback to local mock data so the app displays instantly
            setApiData(mockShowtimesData.data || []);
            setApiError("Sin sincronizar: Mostrando datos de simulación locales.");
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error reading showtimes from Firestore:", err);
        if (isMounted) {
          setApiData(mockShowtimesData.data || []);
          setApiError("Error de lectura en Firestore. Usando datos de simulación locales.");
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [useApiData, cineId, selectedWeekStart]);

  // Generate weeks list dynamically (4 past weeks + current + 5 future weeks for pre-sales)
  const availableWeeks = useMemo(() => {
    const list: string[] = [];
    const currentThur = getMovieWeekStartForNow();
    const [y, m, d] = currentThur.split('-').map(Number);
    const thurDate = new Date(Date.UTC(y, m - 1, d));

    for (let i = -4; i < 6; i++) {
      const nextThur = new Date(thurDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const yyyy = nextThur.getUTCFullYear();
      const mm = String(nextThur.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nextThur.getUTCDate()).padStart(2, '0');
      list.push(`${yyyy}-${mm}-${dd}`);
    }
    return list;
  }, []);

  // Set default selected week
  useEffect(() => {
    if (useApiData && !selectedWeekStart) {
      setSelectedWeekStart(getMovieWeekStartForNow());
    }
  }, [useApiData, selectedWeekStart]);

  const handleManualSync = async () => {
    if (!cineId) return;
    try {
      setSyncing(true);
      const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://api-cinemark.jariel.com.ar/api";
      const apiToken = process.env.EXPO_PUBLIC_API_TOKEN || "jariel2026";
      
      const response = await fetch(`${API_BASE_URL}/showtimes/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`
        },
        body: JSON.stringify({ cineId })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Servidor retornó estado ${response.status}`);
      }

      // Reload active week from Firestore
      const docRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setApiData(data.sessions || []);
        setApiError(null);
      } else {
        setApiData([]);
        setApiError("Sincronización completa: No hay funciones programadas para esta semana.");
      }
      Alert.alert("Éxito", "Sincronización con Cinemark completada correctamente.");
    } catch (err: any) {
      console.error("Manual sync failed:", err);
      Alert.alert("Error", "No se pudo sincronizar con Cinemark: " + (err.message || err));
    } finally {
      setSyncing(false);
    }
  };

  const prevTodayRef = useRef<WeekdayKey>(getCurrentWeekdayKey());

  // Keep track of current time and automatically update day on roll-over (every 15 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMins(getCurrentTimeMins());

      const newToday = getCurrentWeekdayKey();
      const oldToday = prevTodayRef.current;

      if (newToday !== oldToday) {
        prevTodayRef.current = newToday;
        // Si el usuario está visualizando el día actual, actualizamos su vista al nuevo día
        if (selectedDay === oldToday) {
          setSelectedDay(newToday);
        }
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedDay]);



  // Web Scroll setup: Custom scrollbar styles, class addition, and drag-to-scroll listeners
  useEffect(() => {
    if (Platform.OS !== "web" || !scrollEl) return;

    // 1. Inject custom scrollbar style rules
    let styleElement = document.getElementById("programacion-scrollbar-style") as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "programacion-scrollbar-style";
      document.head.appendChild(styleElement);
    }
    styleElement.innerHTML = `
      .programacion-scroll-area {
        scrollbar-width: auto !important;
        -ms-overflow-style: auto !important;
        overflow-x: auto !important;
      }
      .programacion-scroll-area::-webkit-scrollbar {
        height: 12px !important;
        width: 12px !important;
        display: block !important;
      }
      .programacion-scroll-area::-webkit-scrollbar-track {
        background: #F1F5F9 !important;
        border-radius: 6px !important;
      }
      .programacion-scroll-area::-webkit-scrollbar-thumb {
        background: #CBD5E1 !important;
        border-radius: 6px !important;
        border: 3px solid #F1F5F9 !important;
      }
      .programacion-scroll-area::-webkit-scrollbar-thumb:hover {
        background: #94A3B8 !important;
      }
    `;

    // 2. Add classes to the scroll node
    scrollEl.classList.add("programacion-scroll-area");
    scrollEl.style.overflowX = "scroll";

    // 3. Attach drag-to-scroll event listeners
    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // only left click
      isDown = true;
      scrollEl.style.cursor = "grabbing";
      startX = e.clientX;
      scrollLeft = scrollEl.scrollLeft;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.clientX;
      const walk = (startX - x) * 1.5;
      scrollEl.scrollLeft = scrollLeft + walk;
    };

    const onMouseUp = () => {
      if (isDown) {
        isDown = false;
        scrollEl.style.cursor = "grab";
      }
    };

    scrollEl.style.cursor = "grab";
    scrollEl.style.userSelect = "none";

    scrollEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      scrollEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [scrollEl]);

  // Extract all unique room numbers from the cinema config (matching Control de Salas)
  const rooms = useMemo(() => {
    const list: number[] = [];
    for (let i = 1; i <= salasCount; i++) {
      list.push(i);
    }
    return list;
  }, [salasCount]);

  // Build the list of shows for the selected day
  const shows = useMemo(() => {
    if (useApiData) {
      const currentWeek = getMovieWeekStartForNow();
      const hasSavedProgramming = !!savedWeekly?.weeklyRows && savedWeekly.weeklyRows.length > 0 && savedWeekly.startDate === selectedWeekStart;

      console.log("[shows] currentWeek:", currentWeek, "selectedWeekStart:", selectedWeekStart, "savedWeekly startDate:", savedWeekly?.startDate, "hasSavedProgramming:", hasSavedProgramming, "savedWeekly rows:", savedWeekly?.weeklyRows?.length ?? "null");

      // Case A: If there's no saved weekly programming layout matching the selected week.
      if (!hasSavedProgramming) {
        console.log("[shows] → CASO A (solo API, fin=+120min)");
        if (!apiData || !selectedWeekStart) return [];

        // Group API sessions by sessionId (to merge DBOX and normal)
        const sessionsBySessionId: Record<string, any[]> = {};
        apiData.forEach((session) => {
          // Filter by selected week
          const utcDate = new Date(session.sessionDateTime);
          const weekStart = getMovieWeekStart(utcDate);
          if (weekStart !== selectedWeekStart) return;

          // Map UTC sessionDateTime directly (BFF date string represents local time)
          const arDate = new Date(utcDate.getTime());
          if (arDate.getUTCHours() < 6) {
            arDate.setTime(arDate.getTime() - 24 * 60 * 60 * 1000);
          }

          // Get day key
          const dayNum = arDate.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
          const map: Record<number, WeekdayKey> = {
            0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles",
            4: "jueves", 5: "viernes", 6: "sabado"
          };
          const sessionDay = map[dayNum];

          // We only care about sessions on the selected day
          if (sessionDay !== selectedDay) return;

          const sid = session.sessionId;
          if (!sessionsBySessionId[sid]) {
            sessionsBySessionId[sid] = [];
          }
          sessionsBySessionId[sid].push(session);
        });

        const list: DailyShow[] = [];

        Object.keys(sessionsBySessionId).forEach((sid) => {
          const group = sessionsBySessionId[sid];
          const first = group[0];

          const utcDate = new Date(first.sessionDateTime);
          const arDate = new Date(utcDate.getTime());

          const hours = String(arDate.getUTCHours()).padStart(2, '0');
          const mins = String(arDate.getUTCMinutes()).padStart(2, '0');
          const inicio = `${hours}:${mins}`;

          // Fallback duration 120 mins
          const durationMins = 120;
          const endMins = (arDate.getUTCHours() * 60 + arDate.getUTCMinutes() + durationMins) % 1440;
          const endH = Math.floor(endMins / 60);
          const endM = endMins % 60;
          const fin = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

          // Merge normal and dbox seats
          let totalCapacity = 0;
          let totalAvailable = 0;
          let formats: string[] = [];
          let isPremiere = false;

          let hasDbox = false;
          let normalCapacity = 0;
          let normalAvailable = 0;
          let dboxCapacity = 0;
          let dboxAvailable = 0;

          group.forEach((s) => {
            totalCapacity += s.occupation.capacity;
            totalAvailable += s.occupation.availableSeats;
            formats.push(s.sessionFormat);
            if (s.premiere) isPremiere = true;

            if (s.sessionFormat.toUpperCase().includes("DBOX")) {
              hasDbox = true;
              dboxCapacity += s.occupation.capacity;
              dboxAvailable += s.occupation.availableSeats;
            } else {
              normalCapacity += s.occupation.capacity;
              normalAvailable += s.occupation.availableSeats;
            }
          });

          const totalSold = totalCapacity - totalAvailable;
          const normalSold = normalCapacity - normalAvailable;
          const dboxSold = dboxCapacity - dboxAvailable;

          // Extract a clean rating from tags or default empty
          const rating = first.tags?.[0]?.label || "";

          list.push({
            sala: Number(first.theaterRoom),
            pelicula: first.movieName,
            calificacion: rating,
            inicio,
            fin,
            sortInicio: timeToMinutes(inicio),
            sortFin: timeToMinutes(fin),

            isSimulated: true,
            sessionId: sid,
            sessionDateTime: first.sessionDateTime,
            sessionFormat: Array.from(new Set(formats)).join(" / "),
            language: first.language.name,
            premiere: isPremiere,
            corporateId: first.corporateId,
            movieId: first.movieId,
            occupiedSeats: first.occupiedSeats || [],

            capacity: totalCapacity,
            availableSeats: totalAvailable,
            soldSeats: totalSold,

            hasDbox,
            normalCapacity,
            normalAvailable,
            normalSold,
            dboxCapacity,
            dboxAvailable,
            dboxSold,
          });
        });

        return list;
      }
    }

    // Case B: Current Week (either static view, or live view enriched with API data).
    // We use the static PDF/Excel structure as the master timeline layout.
    console.log("[shows] → CASO B (savedWeekly con fin real del PDF). Rows:", savedWeekly?.weeklyRows?.length, "día:", selectedDay);
    if (!savedWeekly?.weeklyRows) return [];
    const list: DailyShow[] = [];

    // Pre-calculate API mapping for the selected day to speed up lookups
    const apiLookup: Record<string, any[]> = {};
    if (useApiData && apiData && selectedWeekStart) {
      apiData.forEach((session) => {
        const utcDate = new Date(session.sessionDateTime);
        const weekStart = getMovieWeekStart(utcDate);
        if (weekStart !== selectedWeekStart) return;

        const arDate = new Date(utcDate.getTime());
        if (arDate.getUTCHours() < 6) {
          arDate.setTime(arDate.getTime() - 24 * 60 * 60 * 1000);
        }
        const dayNum = arDate.getUTCDay();
        const map: Record<number, WeekdayKey> = {
          0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles",
          4: "jueves", 5: "viernes", 6: "sabado"
        };
        const sessionDay = map[dayNum];
        if (sessionDay !== selectedDay) return;

        const hours = String(arDate.getUTCHours()).padStart(2, '0');
        const mins = String(arDate.getUTCMinutes()).padStart(2, '0');
        const sessionTimeStr = `${hours}:${mins}`;

        const key = `${session.theaterRoom}_${sessionTimeStr}`;
        if (!apiLookup[key]) {
          apiLookup[key] = [];
        }
        apiLookup[key].push(session);
      });
    }

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
            const [h, m] = inicio.split(":").map(Number);
            const endMins = (h * 60 + m + 120) % 1440;
            const endH = Math.floor(endMins / 60);
            const endM = endMins % 60;
            fin = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          }
        }

        if (inicio && fin) {
          const show: DailyShow = {
            sala: Number(row.sala),
            pelicula: row.pelicula,
            calificacion: row.calificacion || "",
            inicio,
            fin,
            sortInicio: timeToMinutes(inicio),
            sortFin: timeToMinutes(fin),
            isSimulated: false,
          };

          // If in API mode, try to enrich with occupancy details
          if (useApiData) {
            const key = `${show.sala}_${show.inicio}`;
            const matchingSessions = apiLookup[key];
            
            if (matchingSessions && matchingSessions.length > 0) {
              let totalCapacity = 0;
              let totalAvailable = 0;
              let formats: string[] = [];
              let isPremiere = false;

              let hasDbox = false;
              let normalCapacity = 0;
              let normalAvailable = 0;
              let dboxCapacity = 0;
              let dboxAvailable = 0;

              matchingSessions.forEach((s) => {
                totalCapacity += s.occupation.capacity;
                totalAvailable += s.occupation.availableSeats;
                formats.push(s.sessionFormat);
                if (s.premiere) isPremiere = true;

                if (s.sessionFormat.toUpperCase().includes("DBOX")) {
                  hasDbox = true;
                  dboxCapacity += s.occupation.capacity;
                  dboxAvailable += s.occupation.availableSeats;
                } else {
                  normalCapacity += s.occupation.capacity;
                  normalAvailable += s.occupation.availableSeats;
                }
              });

              const totalSold = totalCapacity - totalAvailable;
              const normalSold = normalCapacity - normalAvailable;
              const dboxSold = dboxCapacity - dboxAvailable;

              show.isSimulated = true;
              show.sessionId = matchingSessions[0].sessionId;
              show.sessionDateTime = matchingSessions[0].sessionDateTime;
              show.sessionFormat = Array.from(new Set(formats)).join(" / ");
              show.language = matchingSessions[0].language.name;
              show.premiere = isPremiere;
              show.corporateId = matchingSessions[0].corporateId;
              show.movieId = matchingSessions[0].movieId;
              show.occupiedSeats = matchingSessions[0].occupiedSeats || [];

              show.capacity = totalCapacity;
              show.availableSeats = totalAvailable;
              show.soldSeats = totalSold;

              show.hasDbox = hasDbox;
              show.normalCapacity = normalCapacity;
              show.normalAvailable = normalAvailable;
              show.normalSold = normalSold;
              show.dboxCapacity = dboxCapacity;
              show.dboxAvailable = dboxAvailable;
              show.dboxSold = dboxSold;
            }
          }

          list.push(show);
        }
      });
    });

    return list;
  }, [savedWeekly, selectedDay, useApiData, apiData, selectedWeekStart]);

  // Compute daily and weekly statistics and operational alerts
  const stats = useMemo(() => {
    if (!useApiData || !apiData || !selectedWeekStart) {
      return null;
    }

    // 1. Weekly Stats (for the entire selectedWeekStart)
    let weeklyTotalSold = 0;
    let weekly3DSold = 0;

    const movieSales: Record<string, number> = {};
    const roomSales: Record<number, number> = {};
    const daySales: Record<string, number> = {};
    const day3DSales: Record<string, number> = {};
    let maxOccupationSession: any = null;
    let maxOccupationSessionRate = -1;

    // Initialize all days in daySales and day3DSales to 0 to ensure they all exist in chart even if 0 sales
    DAYS_OF_WEEK.forEach(day => {
      daySales[day.key] = 0;
      day3DSales[day.key] = 0;
    });

    apiData.forEach((session) => {
      const utcDate = new Date(session.sessionDateTime);
      const weekStart = getMovieWeekStart(utcDate);
      if (weekStart !== selectedWeekStart) return;

      const sold = Math.max(0, session.occupation.capacity - session.occupation.availableSeats);
      const capacity = session.occupation.capacity;
      
      weeklyTotalSold += sold;

      const is3D = /3d/i.test(session.movieName) || /3d/i.test(session.sessionFormat || "");
      if (is3D) {
        weekly3DSold += sold;
      }

      // Movie sales
      const movie = session.movieName;
      movieSales[movie] = (movieSales[movie] || 0) + sold;

      // Room sales
      const room = Number(session.theaterRoom);
      roomSales[room] = (roomSales[room] || 0) + sold;

      // Day sales
      const arDate = new Date(utcDate.getTime());
      if (arDate.getUTCHours() < 6) {
        arDate.setTime(arDate.getTime() - 24 * 60 * 60 * 1000);
      }
      const dayNum = arDate.getUTCDay();
      const map: Record<number, WeekdayKey> = {
        0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles",
        4: "jueves", 5: "viernes", 6: "sabado"
      };
      const sessionDay = map[dayNum];
      if (sessionDay) {
        daySales[sessionDay] = (daySales[sessionDay] || 0) + sold;
        if (is3D) {
          day3DSales[sessionDay] = (day3DSales[sessionDay] || 0) + sold;
        }
      }

      // Most full session
      if (capacity > 0) {
        const rate = sold / capacity;
        if (rate > maxOccupationSessionRate || (rate === maxOccupationSessionRate && sold > (maxOccupationSession?.soldSeats || 0))) {
          maxOccupationSessionRate = rate;
          const hours = String(arDate.getUTCHours()).padStart(2, '0');
          const mins = String(arDate.getUTCMinutes()).padStart(2, '0');
          maxOccupationSession = {
            pelicula: movie,
            sala: room,
            inicio: `${hours}:${mins}`,
            diaLabel: DAYS_OF_WEEK.find(d => d.key === sessionDay)?.label || sessionDay,
            soldSeats: sold,
            capacity: capacity,
            rate: rate
          };
        }
      }
    });

    // Find movie most and least sold
    let mostViewedMovie = "";
    let mostViewedMovieCount = -1;
    let leastViewedMovie = "";
    let leastViewedMovieCount = Infinity;

    Object.keys(movieSales).forEach((movie) => {
      const count = movieSales[movie];
      if (count > mostViewedMovieCount) {
        mostViewedMovieCount = count;
        mostViewedMovie = movie;
      }
      if (count < leastViewedMovieCount) {
        leastViewedMovieCount = count;
        leastViewedMovie = movie;
      }
    });

    // Find day with most sales
    let bestDayKey = "jueves";
    let bestDaySalesValue = -1;
    Object.keys(daySales).forEach((dayKey) => {
      const sales = daySales[dayKey];
      if (sales > bestDaySalesValue) {
        bestDaySalesValue = sales;
        bestDayKey = dayKey;
      }
    });
    const bestDayLabelText = DAYS_OF_WEEK.find(d => d.key === bestDayKey)?.label || bestDayKey;

    // Find room with most sales
    let bestRoomNum = -1;
    let bestRoomSalesValue = -1;
    Object.keys(roomSales).forEach((roomStr) => {
      const roomNum = Number(roomStr);
      const sales = roomSales[roomNum];
      if (sales > bestRoomSalesValue) {
        bestRoomSalesValue = sales;
        bestRoomNum = roomNum;
      }
    });

    // 2. Daily Stats (for the current shows list of the selected day)
    let dailyTotalSold = 0;
    let daily3DSold = 0;
    const recordingRiskShows: DailyShow[] = [];
    const guideNeededShows: DailyShow[] = [];

    shows.forEach((show) => {
      if (show.isSimulated && show.capacity !== undefined && show.capacity > 0) {
        const sold = show.soldSeats ?? 0;
        dailyTotalSold += sold;

        const is3D = /3d/i.test(show.pelicula) || /3d/i.test(show.sessionFormat || "");
        if (is3D) {
          daily3DSold += sold;
        }

        const rate = sold / show.capacity;
        if (rate < 0.02 && sold > 0) {
          recordingRiskShows.push(show);
        } else if (rate > 0.60) {
          guideNeededShows.push(show);
        }
      }
    });

    return {
      weeklyTotalSold,
      weekly3DSold,
      dailyTotalSold,
      daily3DSold,
      recordingRiskShows,
      guideNeededShows,

      // New rich stats
      movieSales,
      roomSales,
      daySales,
      day3DSales,
      mostViewedMovie,
      mostViewedMovieCount,
      leastViewedMovie,
      leastViewedMovieCount: leastViewedMovieCount === Infinity ? 0 : leastViewedMovieCount,
      maxOccupationSession,
      bestDayLabel: bestDayLabelText,
      bestDaySales: bestDaySalesValue,
      bestRoom: bestRoomNum,
      bestRoomSales: bestRoomSalesValue
    };
  }, [useApiData, apiData, selectedWeekStart, shows]);

  const getOperationalStartMins = (show: DailyShow) => {
    const startMins = timeToMinutes(show.inicio);
    return startMins >= 360 ? startMins - 360 : startMins + 1440 - 360;
  };

  const scrollToUpcomingShow = () => {
    if (!verticalScrollRef.current) return;
    
    const sortedShows = [...shows].sort((a, b) => {
      const aStart = getOperationalStartMins(a);
      const bStart = getOperationalStartMins(b);
      return aStart - bStart;
    });

    const nextShowIndex = sortedShows.findIndex(show => getShowStatus(show) === "FUTURE");
    
    if (nextShowIndex !== -1) {
      const cardY = cardYOffsets.current[nextShowIndex];
      if (cardY !== undefined) {
        const targetY = listContainerY.current + cardY;
        verticalScrollRef.current.scrollTo({ y: targetY, animated: true });
      }
    }
  };

  useEffect(() => {
    if (viewMode === "list" && shows.length > 0) {
      cardYOffsets.current = {};
      const timer = setTimeout(() => {
        scrollToUpcomingShow();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [selectedDay, viewMode, shows]);

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

  // Calculate current time line position
  const showCurrentTimeLine = useMemo(() => {
    if (useApiData && selectedWeekStart) {
      const currentWeek = getMovieWeekStartForNow();
      if (selectedWeekStart !== currentWeek) return false;
    }
    const today = getCurrentWeekdayKey();
    return (
      selectedDay === today &&
      shows.length > 0 &&
      currentTimeMins >= timelineStartMins &&
      currentTimeMins <= timelineEndMins
    );
  }, [selectedDay, shows.length, currentTimeMins, timelineStartMins, timelineEndMins, useApiData, selectedWeekStart]);

  const currentTimeLeft = useMemo(() => {
    return (currentTimeMins - timelineStartMins) * MINUTE_WIDTH;
  }, [currentTimeMins, timelineStartMins]);

  // Check if badges will overlap (distance < 110px)
  const badgesOverlap = useMemo(() => {
    if (openingLeft === null || !showCurrentTimeLine) return false;
    const distance = Math.abs(currentTimeLeft - openingLeft);
    return distance < 110;
  }, [openingLeft, showCurrentTimeLine, currentTimeLeft]);

  // Determine status (PAST, PLAYING, FUTURE) of a show
  const getShowStatus = (show: DailyShow) => {
    if (useApiData && selectedWeekStart) {
      const currentWeek = getMovieWeekStartForNow();
      if (selectedWeekStart > currentWeek) {
        return "FUTURE";
      }
      if (selectedWeekStart < currentWeek) {
        return "PAST";
      }
    }

    const today = getCurrentWeekdayKey();
    const todayIdx = DAY_CYCLE_INDEX[today];
    const selectedIdx = DAY_CYCLE_INDEX[selectedDay];

    if (selectedIdx < todayIdx) {
      return "PAST";
    }
    if (selectedIdx > todayIdx) {
      return "FUTURE";
    }

    // Today: compare showtimes
    const startMins = timeToMinutes(show.inicio);
    const endMins = timeToMinutes(show.fin);
    let tStart = startMins >= 360 ? startMins - 360 : startMins + 1440 - 360;
    let tEnd = endMins >= 360 ? endMins - 360 : endMins + 1440 - 360;

    if (tEnd < tStart) {
      tEnd += 1440;
    }

    if (currentTimeMins > tEnd) {
      return "PAST";
    }
    if (currentTimeMins >= tStart && currentTimeMins <= tEnd) {
      return "PLAYING";
    }
    return "FUTURE";
  };

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
      width: Math.max(duration * MINUTE_WIDTH, 40),
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

  // Auto-scroll to center the "Ahora" (current time) line if it is visible
  useEffect(() => {
    if (!showCurrentTimeLine) {
      lastScrolledDay.current = null;
      return;
    }

    if (!loading && scrollEl && lastScrolledDay.current !== selectedDay) {
      lastScrolledDay.current = selectedDay;
      const viewportWidth = windowWidth - currentRoomColWidth;
      const targetScrollX = Math.max(
        0,
        Math.min(timelineWidth - viewportWidth, currentTimeLeft - viewportWidth / 2)
      );

      const timer = setTimeout(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollTo({ x: targetScrollX, animated: false });
        } else if (scrollEl) {
          if (typeof scrollEl.scrollTo === "function") {
            scrollEl.scrollTo({ left: targetScrollX, behavior: "auto" });
          } else {
            scrollEl.scrollLeft = targetScrollX;
          }
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [
    loading,
    scrollEl,
    showCurrentTimeLine,
    selectedDay,
    currentTimeLeft,
    windowWidth,
    currentRoomColWidth,
    timelineWidth,
  ]);

  // Synchronize and reset scroll positions when changing cinema or week
  useEffect(() => {
    lastScrolledDay.current = null;
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTo({ x: 0, animated: false });
    }
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollTo({ x: 0, animated: false });
    }
  }, [cineId, selectedWeekStart]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando programación...</Text>
      </View>
    );
  }

  // Full-screen empty check (only if we have absolutely no weeks available at all)
  if (availableWeeks.length === 0 || !selectedWeekStart) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="calendar-blank" size={64} color={COLORS.muted} />
        <Text style={styles.noDataTitle}>No hay programación cargada</Text>
        <Text style={styles.noDataSubtitle}>
          No se pudieron obtener datos de la API de Cinemark ni existe un historial de sincronizaciones.
        </Text>
      </View>
    );
  }

  const renderListView = () => {
    const sortedShows = [...shows].sort((a, b) => {
      const aStart = getOperationalStartMins(a);
      const bStart = getOperationalStartMins(b);
      return aStart - bStart;
    });

    return (
      <View 
        style={styles.listContainer}
        onLayout={(event) => {
          listContainerY.current = event.nativeEvent.layout.y;
        }}
      >
        {sortedShows.map((show, idx) => {
          const is3D = /3d/i.test(show.pelicula) || /3d/i.test(show.sessionFormat || "");
          const movieAccentColor = getMovieColor(show.pelicula);
          const status = getShowStatus(show);
          const hasEntered = status === "PAST" || status === "PLAYING";
          
          return (
            <View 
              key={`list-card-${idx}`}
              onLayout={(event) => {
                cardYOffsets.current[idx] = event.nativeEvent.layout.y;
              }}
              style={[
                styles.listCard,
                { borderLeftColor: movieAccentColor },
                is3D ? { backgroundColor: movieAccentColor } : null,
                hasEntered && {
                  backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
                  borderLeftColor: "#94A3B8",
                  opacity: 0.6
                }
              ]}
            >
              {/* Room number to the left */}
              <View style={[
                styles.listRoomBadge, 
                is3D && !hasEntered && { backgroundColor: "rgba(255, 255, 255, 0.25)" },
                hasEntered && { backgroundColor: "#E2E8F0" }
              ]}>
                <Text style={[
                  styles.listRoomBadgeText, 
                  is3D && !hasEntered && { color: "#FFFFFF" },
                  hasEntered && { color: "#64748B" }
                ]}>SALA</Text>
                <Text style={[
                  styles.listRoomNumberText, 
                  is3D && !hasEntered && { color: "#FFFFFF" },
                  hasEntered && { color: "#64748B" }
                ]}>{show.sala}</Text>
              </View>

              {/* Movie info */}
              <View style={styles.listInfoContainer}>
                <Text style={[
                  styles.listMovieTitle, 
                  is3D && !hasEntered && { color: "#FFFFFF" },
                  hasEntered && { color: "#64748B" }
                ]} numberOfLines={2}>
                  {show.pelicula}{is3D && !/3d/i.test(show.pelicula) ? " (3D)" : ""}
                </Text>
                
                <Text style={[
                  styles.listMovieTime, 
                  is3D && !hasEntered && { color: "rgba(255, 255, 255, 0.85)" },
                  hasEntered && { color: "#94A3B8" }
                ]}>
                  ⏰ {show.inicio} - {show.fin} hs
                </Text>

                <View style={styles.listOccupancyContainer}>
                  <MaterialCommunityIcons 
                    name="ticket" 
                    size={14} 
                    color={hasEntered ? "#94A3B8" : (is3D ? "#FFFFFF" : "#EAB308")} 
                  />
                  <Text style={[
                    styles.listOccupancyText, 
                    is3D && !hasEntered && { color: "rgba(255, 255, 255, 0.85)" },
                    hasEntered && { color: "#94A3B8" }
                  ]}>
                    Ventas: {show.capacity !== undefined ? `${show.soldSeats} / ${show.capacity}` : "Sin datos"}
                  </Text>
                </View>

                {show.isSimulated && (() => {
                  const rate = show.capacity !== undefined && show.capacity > 0 && show.soldSeats !== undefined ? show.soldSeats / show.capacity : 0;
                  const sold = show.soldSeats ?? 0;
                  let alertColor = "";
                  let alertText = "";
                  if (rate < 0.02 && sold > 0) {
                    alertColor = "#EF4444";
                    alertText = "⚠️ Riesgo de grabación";
                  } else if (rate > 0.60) {
                    alertColor = "#10B981";
                    alertText = "👤 Necesario guía";
                  }
                  if (!alertText) return null;
                  return (
                    <View style={{ flexDirection: "row", marginTop: 4 }}>
                      <View style={[
                        styles.cardAlertBadge, 
                        { backgroundColor: alertColor, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }
                      ]}>
                        <Text style={[styles.cardAlertBadgeText, { fontSize: 10 }]} numberOfLines={1}>
                          {alertText}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>

              {/* View Seats Button */}
              <TouchableOpacity
                onPress={() => {
                  setSelectedShow(show);
                  fetchSeatMap(show);
                }}
                disabled={!show.isSimulated}
                style={[
                  styles.listButton,
                  is3D && !hasEntered && { backgroundColor: "#FFFFFF" },
                  hasEntered && { backgroundColor: "#E2E8F0" },
                  !show.isSimulated && { opacity: 0.4 }
                ]}
              >
                <Text style={[
                  styles.listButtonText,
                  is3D && show.isSimulated && !hasEntered ? { color: movieAccentColor } : null,
                  hasEntered && { color: "#64748B" }
                ]}>
                  {show.isSimulated ? "Ver Asientos" : "Sin Mapa"}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  const renderStatsPanel = () => {
    if (!stats) return null;

    // Sort movies by sales
    const sortedMovies = Object.entries(stats.movieSales || {})
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5); // top 5

    // Sort rooms by sales
    const sortedRooms = Object.entries(stats.roomSales || {})
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const maxMovieSales = stats.mostViewedMovieCount > 0 ? stats.mostViewedMovieCount : 1;
    const maxDaySales = stats.bestDaySales > 0 ? stats.bestDaySales : 1;
    const maxRoomSales = stats.bestRoomSales > 0 ? stats.bestRoomSales : 1;
    const maxDay3DSales = Math.max(...Object.values(stats.day3DSales || {}), 1);

    return (
      <View style={styles.statsPanelContainer}>
        {/* Section Header */}
        <View style={styles.statsHeaderContainer}>
          <MaterialCommunityIcons name="chart-box-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
          <Text style={styles.statsPanelTitle}>Análisis y Estadísticas Semanales</Text>
        </View>

        {/* Warning Banner */}
        <View style={styles.statsWarningCard}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#EAB308" style={{ marginRight: 8 }} />
          <Text style={styles.statsWarningText}>
            La información presentada en esta sección puede contener un margen de error.
          </Text>
        </View>

        {/* Highlights Row */}
        <View style={[styles.statsCardsRow, isMobile && { flexDirection: "column" }]}>
          {/* Card 1: Más Vista */}
          {stats.mostViewedMovie ? (
            <View style={[styles.statsMiniCard, isMobile && { width: "100%", minWidth: "100%" }]}>
              <View style={styles.statsMiniCardHeader}>
                <MaterialCommunityIcons name="crown" size={16} color="#EAB308" />
                <Text style={styles.statsMiniCardLabel}>Película Más Vista</Text>
              </View>
              <Text style={styles.statsMiniCardTitle} numberOfLines={1}>{stats.mostViewedMovie}</Text>
              <Text style={styles.statsMiniCardValue}>{stats.mostViewedMovieCount} tickets</Text>
            </View>
          ) : null}

          {/* Card 2: Menos Vista */}
          {stats.leastViewedMovie ? (
            <View style={[styles.statsMiniCard, isMobile && { width: "100%", minWidth: "100%" }]}>
              <View style={styles.statsMiniCardHeader}>
                <MaterialCommunityIcons name="trending-down" size={16} color="#EF4444" />
                <Text style={styles.statsMiniCardLabel}>Película Menos Vista</Text>
              </View>
              <Text style={styles.statsMiniCardTitle} numberOfLines={1}>{stats.leastViewedMovie}</Text>
              <Text style={styles.statsMiniCardValue}>{stats.leastViewedMovieCount} tickets</Text>
            </View>
          ) : null}

          {/* Card 3: Día Estrella */}
          {stats.bestDayLabel ? (
            <View style={[styles.statsMiniCard, isMobile && { width: "100%", minWidth: "100%" }]}>
              <View style={styles.statsMiniCardHeader}>
                <MaterialCommunityIcons name="calendar-star" size={16} color="#10B981" />
                <Text style={styles.statsMiniCardLabel}>Día de Mayor Venta</Text>
              </View>
              <Text style={styles.statsMiniCardTitle} numberOfLines={1}>{stats.bestDayLabel}</Text>
              <Text style={styles.statsMiniCardValue}>{stats.bestDaySales} tickets</Text>
            </View>
          ) : null}

          {/* Card 4: Sala Estrella */}
          {stats.bestRoom !== -1 ? (
            <View style={[styles.statsMiniCard, isMobile && { width: "100%", minWidth: "100%" }]}>
              <View style={styles.statsMiniCardHeader}>
                <MaterialCommunityIcons name="theater" size={16} color="#3B82F6" />
                <Text style={styles.statsMiniCardLabel}>Sala con Más Ventas</Text>
              </View>
              <Text style={styles.statsMiniCardTitle} numberOfLines={1}>Sala {stats.bestRoom}</Text>
              <Text style={styles.statsMiniCardValue}>{stats.bestRoomSales} tickets</Text>
            </View>
          ) : null}

          {/* Card 5: Lentes 3D Semanales */}
          <View style={[styles.statsMiniCard, isMobile && { width: "100%", minWidth: "100%" }]}>
            <View style={styles.statsMiniCardHeader}>
              <MaterialCommunityIcons name="sunglasses" size={16} color="#8B5CF6" />
              <Text style={styles.statsMiniCardLabel}>Lentes 3D Semanales</Text>
            </View>
            <Text style={styles.statsMiniCardTitle} numberOfLines={1}>{stats.weekly3DSold}</Text>
            <Text style={styles.statsMiniCardValue}>Total en la semana</Text>
          </View>
        </View>

        {/* Function Más Llena Highlight */}
        {stats.maxOccupationSession ? (
          <View style={styles.statsBannerCard}>
            <MaterialCommunityIcons name="fire" size={20} color="#EF4444" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statsBannerLabel}>FUNCIÓN CON MAYOR OCUPACIÓN DE LA SEMANA</Text>
              <Text style={styles.statsBannerTitle} numberOfLines={1}>
                {stats.maxOccupationSession.pelicula}
              </Text>
              <Text style={styles.statsBannerSubtitle}>
                {stats.maxOccupationSession.diaLabel} a las {stats.maxOccupationSession.inicio} hs • Sala {stats.maxOccupationSession.sala}
              </Text>
            </View>
            <View style={styles.statsBannerBadge}>
              <Text style={styles.statsBannerBadgeText}>
                {Math.round(stats.maxOccupationSession.rate * 100)}% Lleno
              </Text>
              <Text style={styles.statsBannerBadgeSubtext}>
                ({stats.maxOccupationSession.soldSeats}/{stats.maxOccupationSession.capacity} tix)
              </Text>
            </View>
          </View>
        ) : null}

        {/* Alerts Section (Only Daily) */}
        <View style={styles.statsAlertsSection}>
          <Text style={styles.statsAlertsTitle}>🚨 ALERTAS OPERATIVAS (Hoy)</Text>
          {stats.recordingRiskShows.length === 0 && stats.guideNeededShows.length === 0 ? (
            <View style={styles.noAlertsContainer}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.noAlertsText}>Sin alertas de sala hoy</Text>
            </View>
          ) : (
            <View style={styles.alertsList}>
              {stats.recordingRiskShows.length > 0 && (
                <View style={[styles.alertItem, styles.alertItemRisk]}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <MaterialCommunityIcons name="alert-circle" size={14} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={styles.alertItemText} numberOfLines={1}>
                      Hay <Text style={{ fontWeight: "bold" }}>{stats.recordingRiskShows.length}</Text> funciones con ocupación menor al 2%
                    </Text>
                  </View>
                  <View style={[styles.alertBadge, { backgroundColor: "#EF4444" }]}>
                    <Text style={styles.alertBadgeText}>Riesgo de grabación</Text>
                  </View>
                </View>
              )}
              {stats.guideNeededShows.map((show, idx) => (
                <View key={`guide-${idx}`} style={[styles.alertItem, styles.alertItemGuide]}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <MaterialCommunityIcons name="account-group" size={14} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={styles.alertItemText} numberOfLines={1}>
                      <Text style={{ fontWeight: "bold" }}>{show.inicio}</Text> - Sala {show.sala} | {show.pelicula} (Ocupación: {show.capacity !== undefined && show.soldSeats !== undefined && show.capacity > 0 ? ((show.soldSeats/show.capacity)*100).toFixed(0) : 0}%)
                    </Text>
                  </View>
                  <View style={[styles.alertBadge, { backgroundColor: "#10B981" }]}>
                    <Text style={styles.alertBadgeText}>Necesario guía de sala</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Charts Container */}
        <View style={[styles.chartsGrid, windowWidth < 1200 && { flexDirection: "column" }]}>
          {/* Chart 1: Ranking Peliculas */}
          <View style={[styles.chartContainer, { flex: windowWidth < 1200 ? undefined : 1 }, windowWidth < 1200 && { width: "100%" }]}>
            <Text style={styles.chartTitle}>Top 5 Películas de la Semana (Tickets)</Text>
            <View style={styles.chartBody}>
              {sortedMovies.map(([movie, sales], index) => {
                const percentage = ((sales as number) / maxMovieSales) * 100;
                return (
                  <View key={movie} style={styles.chartRow}>
                    <View style={styles.chartRowInfo}>
                      <Text style={styles.chartRowName} numberOfLines={1}>
                        {index + 1}. {movie}
                      </Text>
                      <Text style={styles.chartRowValue}>{sales as number}</Text>
                    </View>
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBarFill, { width: `${percentage}%`, backgroundColor: COLORS.primary }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Chart 2: Ventas por Dia */}
          <View style={[styles.chartContainer, { flex: windowWidth < 1200 ? undefined : 1, marginLeft: windowWidth < 1200 ? 0 : 16, marginTop: windowWidth < 1200 ? 16 : 0 }, windowWidth < 1200 && { width: "100%" }]}>
            <Text style={styles.chartTitle}>Ventas por Día de la Semana (Tickets)</Text>
            <View style={styles.chartBody}>
              {DAYS_OF_WEEK.map((day) => {
                const sales = stats.daySales[day.key] || 0;
                const percentage = (sales / maxDaySales) * 100;
                return (
                  <View key={day.key} style={styles.chartRow}>
                    <View style={styles.chartRowInfo}>
                      <Text style={styles.chartRowName} numberOfLines={1}>
                        {day.label}
                      </Text>
                      <Text style={styles.chartRowValue}>{sales}</Text>
                    </View>
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBarFill, { width: `${percentage}%`, backgroundColor: "#10B981" }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Chart 4: Lentes 3D por Dia */}
          <View style={[styles.chartContainer, { flex: windowWidth < 1200 ? undefined : 1, marginLeft: windowWidth < 1200 ? 0 : 16, marginTop: windowWidth < 1200 ? 16 : 0 }, windowWidth < 1200 && { width: "100%" }]}>
            <Text style={styles.chartTitle}>Lentes 3D por Día de la Semana</Text>
            <View style={styles.chartBody}>
              {DAYS_OF_WEEK.map((day) => {
                const sales = stats.day3DSales[day.key] || 0;
                const percentage = maxDay3DSales > 0 ? (sales / maxDay3DSales) * 100 : 0;
                return (
                  <View key={day.key} style={styles.chartRow}>
                    <View style={styles.chartRowInfo}>
                      <Text style={styles.chartRowName} numberOfLines={1}>
                        {day.label}
                      </Text>
                      <Text style={styles.chartRowValue}>{sales}</Text>
                    </View>
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBarFill, { width: `${percentage}%`, backgroundColor: "#8B5CF6" }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Chart 3: Ventas por Sala */}
        <View style={[styles.chartContainer, { marginHorizontal: 16 }]}>
          <Text style={styles.chartTitle}>Ventas por Sala de Cine (Tickets)</Text>
          <View style={[styles.chartBody, { flexDirection: "row", flexWrap: "wrap", gap: 12 }]}>
            {sortedRooms.map(([room, sales]) => {
              const percentage = ((sales as number) / maxRoomSales) * 100;
              return (
                <View key={room} style={[styles.roomChartCell, { width: isMobile ? "100%" : "48%" }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={styles.roomChartName}>Sala {room}</Text>
                    <Text style={styles.roomChartValue}>{sales as number} tix</Text>
                  </View>
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBarFill, { width: `${percentage}%`, backgroundColor: "#3B82F6" }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const formattedWeekLabel = useApiData
    ? ""
    : (savedWeekly?.startDate
      ? `Semana del ${savedWeekly.startDate}`
      : "Programación Semanal");

  const hasHeaderContent = !!formattedWeekLabel || !useApiData || (useApiData && !!apiError);

  return (
    <View style={styles.container}>
      {/* Header Info */}
      {hasHeaderContent ? (
        <View style={[styles.header, { justifyContent: "center", paddingVertical: 12 }]}>
          <View style={[styles.headerInfo, { alignItems: "center", width: "100%" }]}>
            {formattedWeekLabel ? (
              <Text style={styles.headerTitle}>{formattedWeekLabel}</Text>
            ) : null}
            {!useApiData && (
              <Text style={[styles.headerSubtitle, { textAlign: "center" }]}>
                La programación se obtiene a partir del reporte cargado y guardado en la sección de Servicios &gt; Programación.
              </Text>
            )}
            {useApiData && apiError && (
              <View style={styles.apiErrorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#B45309" style={{ marginRight: 4 }} />
                <Text style={styles.apiErrorText}>{apiError}</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* Week Selector Bar (if in API mode) */}
      {useApiData && availableWeeks.length > 1 && (() => {
        const currentIndex = availableWeeks.indexOf(selectedWeekStart);
        const canGoPrev = currentIndex > 0;
        const canGoNext = currentIndex < availableWeeks.length - 1;
        const currentWeek = getMovieWeekStartForNow();
        const isCurrent = selectedWeekStart === currentWeek;
        
        let label = formatWeekRange(selectedWeekStart);
        if (isCurrent) {
          label += " (Actual)";
        } else if (selectedWeekStart > currentWeek) {
          label += " (Preventa)";
        } else if (selectedWeekStart < currentWeek) {
          label += " (Pasada)";
        }
        
        return (
          <View style={styles.singleWeekSelectorContainer}>
            <TouchableOpacity
              disabled={!canGoPrev}
              onPress={() => setSelectedWeekStart(availableWeeks[currentIndex - 1])}
              style={[styles.arrowButton, !canGoPrev && styles.arrowButtonDisabled]}
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color={canGoPrev ? COLORS.text : COLORS.muted} />
            </TouchableOpacity>
            
            <View style={styles.singleWeekLabelContainer}>
              <Text style={styles.singleWeekLabelText}>{label}</Text>
            </View>

            <TouchableOpacity
              disabled={!canGoNext}
              onPress={() => setSelectedWeekStart(availableWeeks[currentIndex + 1])}
              style={[styles.arrowButton, !canGoNext && styles.arrowButtonDisabled]}
            >
              <MaterialCommunityIcons name="chevron-right" size={20} color={canGoNext ? COLORS.text : COLORS.muted} />
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Main Grid View */}
      <View style={styles.gridContainer}>
        <ScrollView ref={verticalScrollRef} style={styles.verticalScrollView} bounces={false}>

          {/* Days Tabs Selection (Index 0 or 1 depending on stats visibility) */}
          <View style={[
            styles.tabBarContainer,
            !isMobile && {
              position: "relative",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }
          ]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.tabBar,
                !isMobile && { paddingHorizontal: 260 }
              ]}
              style={!isMobile ? { flex: 1 } : undefined}
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

            <View style={[
              styles.headerButtonsRow,
              { paddingVertical: 6 },
              !isMobile && {
                position: "absolute",
                right: 16,
              },
              isMobile && {
                flexDirection: "row",
                justifyContent: "center",
                alignSelf: "stretch",
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingVertical: 10,
                backgroundColor: COLORS.card,
              }
            ]}>
              <TouchableOpacity
                onPress={() => setViewMode(prev => prev === "grid" ? "list" : "grid")}
                style={styles.toggleViewButton}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={viewMode === "grid" ? "view-list" : "view-grid"}
                  size={18}
                  color={COLORS.text}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.toggleViewButtonText}>
                  {viewMode === "grid" ? "Modo Lista" : "Modo Grilla"}
                </Text>
              </TouchableOpacity>

              {useApiData && (
                <TouchableOpacity
                  onPress={handleManualSync}
                  disabled={syncing}
                  style={[styles.apiSyncButton, { marginLeft: 8 }]}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                  ) : (
                    <MaterialCommunityIcons name="cached" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.apiSyncButtonText}>
                    {syncing ? "Sincronizando..." : "Sincronizar"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {rooms.length === 0 ? (
            <View style={styles.emptyGridPlaceholder}>
              <MaterialCommunityIcons name="calendar-blank" size={48} color={COLORS.muted} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyGridTitle}>No hay funciones cargadas</Text>
              <Text style={styles.emptyGridSubtitle}>No se encontraron funciones para esta fecha o semana.</Text>
            </View>
          ) : viewMode === "list" ? (
            renderListView()
          ) : (
            <View style={{ position: "relative", zIndex: 1 }}>
              {/* Grid Header Row (Index 1) */}
          <View style={[
            styles.mainLayoutRow,
            { zIndex: 10 },
            Platform.OS === "web" ? { position: "sticky" as any, top: 0, backgroundColor: COLORS.bg } : {}
          ]}>
            {/* Corner intersection block */}
            <View style={[styles.cornerHeaderCell, { width: currentRoomColWidth }]}>
              {isCollapsed ? (
                <MaterialCommunityIcons name="theater" size={14} color={COLORS.textSoft} />
              ) : (
                <View style={styles.cornerContent}>
                  <MaterialCommunityIcons name="theater" size={14} color={COLORS.textSoft} />
                  <Text style={styles.cornerText}>Salas</Text>
                </View>
              )}
            </View>

            {/* Horizontal Scroll for hours header only */}
            <ScrollView
              ref={headerScrollRef}
              horizontal
              bounces={false}
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              style={styles.timelineHorizontalScroll}
            >
              <View style={{ width: timelineWidth }}>
                <View style={styles.hourHeaderRow}>
                  {dynamicHoursArray.map((hourText, idx) => (
                    <View key={idx} style={[styles.hourHeaderCell, { width: HOUR_WIDTH }]}>
                      <Text style={styles.hourHeaderText}>{hourText}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Grid Content Row (Index 2) */}
          <View style={styles.mainLayoutRow}>
            {/* Rooms fixed left column */}
            <View style={[styles.roomsColumn, { width: currentRoomColWidth }]}>
              {rooms.map((salaNum) => (
                <View key={salaNum} style={[styles.roomLabelCell, { width: currentRoomColWidth }]}>
                  <Text style={styles.roomLabelText}>
                    {isCollapsed ? `${salaNum}` : `Sala ${salaNum}`}
                  </Text>
                </View>
              ))}
              {/* Bottom spacer to align with scrollbar space */}
              {SCROLLBAR_HEIGHT > 0 && (
                <View style={{ height: SCROLLBAR_HEIGHT, backgroundColor: COLORS.card }} />
              )}
            </View>

            {/* Scrollable Timeline */}
            <ScrollView
              ref={(el) => {
                timelineScrollRef.current = el;
                handleScrollRef(el);
              }}
              horizontal
              bounces={false}
              showsHorizontalScrollIndicator={true}
              style={styles.timelineHorizontalScroll}
              contentContainerStyle={{ paddingBottom: SCROLLBAR_HEIGHT }}
              onScroll={handleGridScroll}
              scrollEventThrottle={16}
            >
              <View style={{ width: timelineWidth, position: "relative" }}>
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
                          const is3D = /3d/i.test(show.pelicula) || /3d/i.test(show.sessionFormat || "");
                          const showAds = width > 50; // show ads prefix block if card is wide enough

                          const status = getShowStatus(show);
                          const isPast = status === "PAST";
                          const isPlaying = status === "PLAYING";

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
                                isPast && { opacity: 0.45 },
                                isPlaying && {
                                  borderColor: "#10B981",
                                  borderWidth: 2,
                                  ...Platform.select({
                                    web: {
                                      boxShadow: "0 0 10px rgba(16, 185, 129, 0.4)",
                                    },
                                  }),
                                },
                              ]}
                              onPress={() => setSelectedShow(show)}
                            >
                              {/* 12m Publicity prefix zone (painted yellow) */}
                              {showAds && (
                                <View
                                  style={[
                                    styles.adsPrefix,
                                    {
                                      backgroundColor: "#EAB308", // Yellow representing ads/pre-show
                                      borderRightColor: "rgba(0, 0, 0, 0.15)",
                                    },
                                  ]}
                                />
                              )}

                              {/* Card Content */}
                              <View style={[styles.movieCardContent, showAds && { paddingLeft: 12 * MINUTE_WIDTH + 6 }]}>
                                <View style={styles.movieCardHeaderRow}>
                                  {isPlaying && <View style={styles.playingDot} />}
                                  <Text
                                    style={[styles.movieCardTitle, is3D && { color: "#FFFFFF" }]}
                                    numberOfLines={1}
                                  >
                                    {show.pelicula}{is3D && !/3d/i.test(show.pelicula) ? " (3D)" : ""}
                                  </Text>
                                </View>
                                <View style={styles.movieCardFooter}>
                                  <Text
                                    style={[styles.movieCardTime, is3D && { color: "#FFFFFF" }]}
                                    numberOfLines={1}
                                  >
                                    {show.inicio} - {show.fin}
                                  </Text>
                                  {show.isSimulated && (() => {
                                    const rate = show.capacity !== undefined && show.capacity > 0 && show.soldSeats !== undefined ? show.soldSeats / show.capacity : 0;
                                    const sold = show.soldSeats ?? 0;
                                    let alertColor = "";
                                    let alertText = "";
                                    if (rate < 0.02 && sold > 0) {
                                      alertColor = "#EF4444";
                                      alertText = "⚠️ Riesgo";
                                    } else if (rate > 0.60) {
                                      alertColor = "#10B981";
                                      alertText = "👤 Guía";
                                    }
                                    return (
                                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                                        <View style={styles.cardSoldContainer}>
                                          <MaterialCommunityIcons name="ticket" size={11} color="#EAB308" style={{ marginRight: 2 }} />
                                          <Text style={[styles.cardSoldText, is3D ? { color: "#FFFFFF" } : { color: COLORS.primary }, { fontWeight: "bold" }]} numberOfLines={1}>
                                            {show.soldSeats}/{show.capacity}
                                          </Text>
                                        </View>
                                        {alertText ? (
                                          <View style={[styles.cardAlertBadge, { backgroundColor: alertColor }]}>
                                            <Text style={styles.cardAlertBadgeText} numberOfLines={1}>{alertText}</Text>
                                          </View>
                                        ) : null}
                                      </View>
                                    );
                                  })()}
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

                {/* Cinema Opening Line (zIndex: 3, sits on top of cards, starts from top of Sala 1) */}
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

                {/* Current Time Line (zIndex: 4, sits on top of cards, starts from top of Sala 1) */}
                {showCurrentTimeLine && (
                  <View
                    style={[
                      styles.currentTimeLine,
                      {
                        left: currentTimeLeft,
                        height: rooms.length * ROW_HEIGHT,
                        top: 0,
                      },
                    ]}
                  >
                    <View style={[styles.currentTimeBadge, badgesOverlap && { top: 26 }]}>
                      <Text style={styles.currentTimeBadgeText} numberOfLines={1}>
                        Ahora: {formatMinutesToTime(currentTimeMins)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
      {useApiData && stats && renderStatsPanel()}
    </ScrollView>
  </View>

      {/* Show Details Modal */}
      <Modal
        visible={selectedShow !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => { setSelectedShow(null); setShowSeatMap(false); setSeatMapData(null); }}
      >
        <View style={[styles.modalOverlay, showSeatMap && isMobile && styles.modalOverlayFullScreen]}>
          <View style={[styles.modalContent, showSeatMap && (isMobile ? styles.modalContentFullScreen : styles.modalContentLarge)]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Detalle de Función</Text>
              <TouchableOpacity onPress={() => { setSelectedShow(null); setShowSeatMap(false); setSeatMapData(null); }} style={styles.modalCloseButton}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {selectedShow && (
              <ScrollView 
                style={{ maxHeight: showSeatMap && isMobile ? windowHeight - 100 : windowHeight - 200 }} 
                contentContainerStyle={[styles.modalBody, showSeatMap && isMobile && { paddingHorizontal: 0, paddingBottom: 8 }]}
                showsVerticalScrollIndicator={false}
              >
                {showSeatMap ? (
                  <View style={{ flex: 1, minHeight: 350 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <TouchableOpacity 
                        onPress={() => { setShowSeatMap(false); setSeatMapData(null); }} 
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}
                      >
                        <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.primary} />
                        <Text style={{ color: COLORS.primary, fontWeight: "bold", marginLeft: 4, fontSize: 14 }}>Volver a detalles</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.modalMovieTitle, { marginBottom: 4 }]}>{selectedShow.pelicula}</Text>
                    <Text style={{ color: COLORS.textSoft, fontSize: 13, marginBottom: 12 }}>
                      Sala {selectedShow.sala} | {selectedShow.sessionFormat || "2D"} | {selectedShow.inicio} hs
                    </Text>

                    {loadingSeatMap ? (
                      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 }}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={{ color: COLORS.textSoft, marginTop: 12, fontSize: 13 }}>Cargando mapa de asientos...</Text>
                      </View>
                    ) : seatMapError ? (
                      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40 }}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#EF4444" />
                        <Text style={{ color: "#EF4444", fontWeight: "bold", marginTop: 8, fontSize: 14 }}>Error al cargar mapa</Text>
                        <Text style={{ color: COLORS.textSoft, textAlign: "center", marginTop: 4, paddingHorizontal: 16, fontSize: 12 }}>{seatMapError}</Text>
                      </View>
                    ) : (seatMapData || (selectedShow && selectedShow.occupiedSeats && selectedShow.occupiedSeats.length > 0)) ? (
                      <>
                        <View style={styles.legendContainer}>
                          <View style={styles.legendItem}>
                            <View style={[styles.seatBase, styles.seatAvailable]} />
                            <Text style={styles.legendText}>Disp.</Text>
                          </View>
                          <View style={styles.legendItem}>
                            <View style={[styles.seatBase, styles.seatOccupied]} />
                            <Text style={styles.legendText}>Ocup.</Text>
                          </View>
                          <View style={styles.legendItem}>
                            <View style={[styles.seatBase, styles.seatAutoAssigned]} />
                            <Text style={styles.legendText}>Mi Reserva</Text>
                          </View>
                          <View style={styles.legendItem}>
                            <View style={[styles.seatBase, styles.seatWheelchair, { justifyContent: 'center', alignItems: 'center' }]}>
                              <MaterialCommunityIcons name="wheelchair-accessibility" size={10} color="#FFF" />
                            </View>
                            <Text style={styles.legendText}>Silla</Text>
                          </View>
                        </View>

                        {renderSeatGrid(seatMapData)}
                      </>
                    ) : null}
                  </View>
                ) : (
                  <>
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

                    {/* API Info / Format & Language */}
                    {selectedShow.isSimulated && (
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons name="movie-filter-outline" size={22} color={COLORS.muted} style={styles.detailIcon} />
                        <View>
                          <Text style={styles.detailLabel}>Formato e Idioma (API)</Text>
                          <Text style={styles.detailValue}>
                            {selectedShow.sessionFormat} | {selectedShow.language}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Sales Breakdown / Ocupación */}
                    {selectedShow.isSimulated && (
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons name="ticket-confirmation-outline" size={22} color={COLORS.muted} style={styles.detailIcon} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailLabel}>Ventas / Ocupación</Text>
                          <View style={styles.occupancyContainer}>
                            {selectedShow.hasDbox ? (
                              <>
                                <View style={styles.occupancySubRow}>
                                  <Text style={styles.occupancyLabel}>Butacas Comunes:</Text>
                                  <Text style={styles.occupancyVal}>
                                    <Text style={{ fontWeight: "bold" }}>{selectedShow.normalSold}</Text> vendidas de {selectedShow.normalCapacity} ({selectedShow.normalAvailable} disp.)
                                  </Text>
                                </View>
                                <View style={styles.occupancySubRow}>
                                  <Text style={styles.occupancyLabel}>Butacas D-BOX:</Text>
                                  <Text style={styles.occupancyVal}>
                                    <Text style={{ fontWeight: "bold" }}>{selectedShow.dboxSold}</Text> vendidas de {selectedShow.dboxCapacity} ({selectedShow.dboxAvailable} disp.)
                                  </Text>
                                </View>
                                <View style={[styles.occupancySubRow, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 4, marginTop: 4 }]}>
                                  <Text style={[styles.occupancyLabel, { fontWeight: "bold" }]}>Total Sala:</Text>
                                  <Text style={[styles.occupancyVal, { fontWeight: "bold", color: COLORS.primary }]}>
                                    {selectedShow.soldSeats} vendidas de {selectedShow.capacity} ({selectedShow.availableSeats} disp.)
                                  </Text>
                                </View>
                              </>
                            ) : (
                              <View style={styles.occupancySubRow}>
                                <Text style={styles.occupancyLabel}>Butacas:</Text>
                                <Text style={styles.occupancyVal}>
                                  <Text style={{ fontWeight: "bold" }}>{selectedShow.soldSeats}</Text> vendidas de {selectedShow.capacity} ({selectedShow.availableSeats} disp.)
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Dynamic alert block */}
                    {selectedShow.isSimulated && (() => {
                      const rate = selectedShow.capacity !== undefined && selectedShow.capacity > 0 && selectedShow.soldSeats !== undefined ? selectedShow.soldSeats / selectedShow.capacity : 0;
                      const sold = selectedShow.soldSeats ?? 0;
                      if (rate < 0.02 && sold > 0) {
                        return (
                          <View style={[styles.detailRow, { backgroundColor: "rgba(239, 68, 68, 0.08)", borderRadius: 8, padding: 8, marginTop: 4, marginBottom: 8 }]}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#EF4444" style={styles.detailIcon} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.detailLabel, { color: "#EF4444", fontWeight: "bold" }]}>Alerta de Seguridad</Text>
                              <Text style={[styles.detailValue, { color: "#EF4444" }]}>⚠️ Riesgo de grabación (Ocupación menor al 2%)</Text>
                            </View>
                          </View>
                        );
                      }
                      if (rate > 0.60) {
                        return (
                          <View style={[styles.detailRow, { backgroundColor: "rgba(16, 185, 129, 0.08)", borderRadius: 8, padding: 8, marginTop: 4, marginBottom: 8 }]}>
                            <MaterialCommunityIcons name="account-group" size={22} color="#10B981" style={styles.detailIcon} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.detailLabel, { color: "#10B981", fontWeight: "bold" }]}>Operación de Sala</Text>
                              <Text style={[styles.detailValue, { color: "#10B981" }]}>👤 Necesario guía de sala (Ocupación mayor al 60%)</Text>
                            </View>
                          </View>
                        );
                      }
                      return null;
                    })()}

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

                    {/* View Seat Map Button */}
                    {selectedShow.isSimulated && (
                      <TouchableOpacity 
                        onPress={() => fetchSeatMap(selectedShow)} 
                        style={styles.viewSeatMapButton}
                      >
                        <MaterialCommunityIcons name="seat-recline-normal" size={20} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.viewSeatMapButtonText}>Ver Mapa de Asientos en Vivo</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ScrollView>
            )}

            <TouchableOpacity onPress={() => { setSelectedShow(null); setShowSeatMap(false); setSeatMapData(null); }} style={styles.modalButton}>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerInfo: {
    flexDirection: "column",
    alignItems: "flex-start",
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textSoft,
    marginTop: 2,
    textAlign: "center",
  },
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  tabBar: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: 6,
    gap: THEME.spacing.sm,
    justifyContent: "center",
    flexGrow: 1,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.radius.full,
    backgroundColor: Platform.OS === "web" ? "var(--bg, #F1F5F9)" : "#F1F5F9",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(137, 4, 4, 0.25)",
      },
    }),
  },
  tabButtonText: {
    fontSize: 13,
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
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.card,
    zIndex: 3,
    ...Platform.select({
      web: {
        boxShadow: "2px 0 8px rgba(0,0,0,0.05)",
        transitionProperty: "width",
        transitionDuration: "0.2s",
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
  cornerHeaderCell: {
    height: HEADER_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    ...Platform.select({
      web: {
        position: "sticky" as any,
        top: 0,
        zIndex: 6,
        transitionProperty: "width",
        transitionDuration: "0.2s",
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
    ...Platform.select({
      web: {
        transitionProperty: "width",
        transitionDuration: "0.2s",
      },
    }),
  },
  roomLabelText: {
    fontSize: 13,
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
    ...Platform.select({
      web: {
        position: "sticky" as any,
        top: 0,
        zIndex: 5,
      },
    }),
  },
  hourHeaderCell: {
    height: HEADER_HEIGHT,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  hourHeaderText: {
    fontSize: 10.5,
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
    width: 0,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
    borderStyle: "dashed",
    zIndex: 3,
    alignItems: "center",
  },
  openingLineBadge: {
    position: "absolute",
    top: 4,
    left: -52,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    width: 104,
    alignItems: "center",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
      },
    }),
  },
  openingLineBadgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "bold",
  },
  currentTimeLine: {
    position: "absolute",
    width: 0,
    borderLeftWidth: 2,
    borderLeftColor: "#10B981", // Emerald green
    borderStyle: "dashed",
    zIndex: 4,
    alignItems: "center",
  },
  currentTimeBadge: {
    position: "absolute",
    top: 4,
    left: -52,
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    width: 104,
    alignItems: "center",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
      },
    }),
  },
  currentTimeBadgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "bold",
  },
  cornerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cornerText: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.textSoft,
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
    height: ROW_HEIGHT - 10, // 44px height (vertical spacing)
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
    borderRightWidth: 1,
  },
  movieCardContent: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    justifyContent: "space-between",
  },
  movieCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  playingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  movieCardTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.text,
  },
  movieCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  movieCardTime: {
    fontSize: 9.5,
    color: COLORS.text,
    fontWeight: "bold",
  },
  ratingBadge: {
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    paddingHorizontal: THEME.spacing.xs,
    paddingVertical: 0,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  ratingBadgeText: {
    fontSize: 8.5,
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
  modalOverlayFullScreen: {
    padding: 0,
    justifyContent: "flex-end",
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
  modalContentLarge: {
    maxWidth: 800,
    width: Platform.OS === "web" ? "90%" : "98%",
  },
  modalContentFullScreen: {
    width: "100%",
    maxWidth: "100%",
    borderRadius: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 24,
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
  apiToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "var(--card, #1E293B)" : "#1E293B",
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  apiToggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  apiToggleText: {
    fontSize: 12,
    color: COLORS.textSoft,
    fontWeight: "bold",
  },
  apiToggleTextActive: {
    color: "#FFFFFF",
  },
  apiErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  apiErrorText: {
    fontSize: 10.5,
    color: "#B45309",
    fontWeight: "600",
  },
  cardSoldText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  occupancyContainer: {
    marginTop: 4,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  occupancySubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  occupancyLabel: {
    fontSize: 11,
    color: COLORS.textSoft,
  },
  occupancyVal: {
    fontSize: 11,
    color: COLORS.text,
  },
  weekSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "var(--card, #1E293B)" : "#1E293B",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    gap: 8,
  },
  weekSelectorLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  weekSelectorScroll: {
    flexDirection: "row",
    gap: 8,
  },
  weekButton: {
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  weekButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  weekButtonText: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "bold",
  },
  weekButtonTextActive: {
    color: "#FFFFFF",
  },
  headerButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  apiSyncButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  apiSyncButtonText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  arrowButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  arrowButtonDisabled: {
    opacity: 0.4,
  },
  singleWeekSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Platform.OS === "web" ? "var(--card, #1E293B)" : "#1E293B",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    gap: 16,
  },
  singleWeekLabelContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 260,
    alignItems: "center",
  },
  singleWeekLabelText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "bold",
  },
  cardSoldContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardAlertBadge: {
    marginLeft: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  cardAlertBadgeText: {
    fontSize: 8,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  statsWarningCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: "#EAB308",
  },
  statsWarningText: {
    fontSize: 12,
    color: COLORS.textSoft,
    fontWeight: "500",
    flex: 1,
  },
  statsPanelContainer: {
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 24,
    marginTop: 20,
  },
  statsHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  statsPanelTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.text,
  },
  statsCardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
  },
  statsMiniCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
      },
      default: {
        elevation: 1,
      },
    }),
  },
  statsMiniCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  statsMiniCardLabel: {
    fontSize: 11,
    color: COLORS.textSoft,
    fontWeight: "bold",
    marginLeft: 4,
  },
  statsMiniCardTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 2,
  },
  statsMiniCardValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  statsBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
  },
  statsBannerLabel: {
    fontSize: 10,
    color: COLORS.textSoft,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  statsBannerTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: 2,
  },
  statsBannerSubtitle: {
    fontSize: 11,
    color: COLORS.textSoft,
    marginTop: 1,
  },
  statsBannerBadge: {
    alignItems: "flex-end",
    marginLeft: 10,
  },
  statsBannerBadgeText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#EF4444",
  },
  statsBannerBadgeSubtext: {
    fontSize: 10,
    color: COLORS.textSoft,
    marginTop: 2,
  },
  statsAlertsSection: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  statsAlertsTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.text,
    letterSpacing: 0.5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
    marginBottom: 4,
  },
  chartsGrid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 16,
    width: "100%",
  },
  chartContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
      },
      default: {
        elevation: 1,
      },
    }),
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 12,
  },
  chartBody: {
    gap: 10,
  },
  chartRow: {
    width: "100%",
  },
  chartRowInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 4,
  },
  chartRowName: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  chartRowValue: {
    fontSize: 11.5,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  chartBarTrack: {
    height: 8,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  chartBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  roomChartCell: {
    padding: 10,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roomChartName: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.text,
  },
  roomChartValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  noAlertsContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  noAlertsText: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "500",
  },
  alertsList: {
    gap: 8,
  },
  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "space-between",
  },
  alertItemRisk: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  alertItemGuide: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  alertItemText: {
    fontSize: 12,
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  alertBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertBadgeText: {
    fontSize: 9,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  emptyGridPlaceholder: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Platform.OS === "web" ? "var(--card, #1E293B)" : "#1E293B",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: 16,
  },
  emptyGridTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyGridSubtitle: {
    fontSize: 12,
    color: COLORS.textSoft,
    textAlign: "center",
  },
  seatGridContainer: {
    marginTop: 8,
    padding: Platform.select({ web: 12, default: 4 }),
    borderRadius: 8,
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "stretch",
  },
  screenIndicator: {
    width: "80%",
    alignItems: "center",
    marginBottom: 16,
  },
  screenLine: {
    width: "100%",
    height: 4,
    backgroundColor: COLORS.textSoft,
    borderRadius: 2,
    opacity: 0.3,
  },
  screenText: {
    fontSize: 9,
    color: COLORS.textSoft,
    fontWeight: "bold",
    letterSpacing: 2,
    marginTop: 2,
  },
  horizontalGridScroll: {
    paddingBottom: 8,
    paddingHorizontal: Platform.select({ web: 0, default: 4 }),
    flexGrow: 0,
  },
  colNumberText: {
    width: Platform.select({ web: 22, default: 14 }),
    textAlign: "center",
    fontSize: Platform.select({ web: 10, default: 7 }),
    color: COLORS.textSoft,
    marginHorizontal: Platform.select({ web: 2, default: 0.5 }),
  },
  rowLabelText: {
    width: Platform.select({ web: 26, default: 16 }),
    textAlign: "center",
    fontSize: Platform.select({ web: 12, default: 9 }),
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  seatSpacer: {
    width: Platform.select({ web: 22, default: 14 }),
    height: Platform.select({ web: 22, default: 14 }),
    marginHorizontal: Platform.select({ web: 2, default: 0.5 }),
    backgroundColor: "transparent",
  },
  seatBase: {
    width: Platform.select({ web: 22, default: 14 }),
    height: Platform.select({ web: 22, default: 14 }),
    borderRadius: Platform.select({ web: 5, default: 3 }),
    marginHorizontal: Platform.select({ web: 2, default: 0.5 }),
    justifyContent: "center",
    alignItems: "center",
  },
  seatAvailable: {
    backgroundColor: "#10B981",
  },
  seatOccupied: {
    backgroundColor: "#EF4444",
  },
  seatWheelchair: {
    backgroundColor: "#3B82F6",
  },
  seatAutoAssigned: {
    backgroundColor: "#F59E0B",
  },
  seatBlocked: {
    backgroundColor: "#6B7280",
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendText: {
    fontSize: 10,
    color: COLORS.textSoft,
    marginLeft: 4,
  },
  viewSeatMapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  viewSeatMapButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  aisleSpace: {
    width: Platform.select({ web: 24, default: 12 }),
  },
  seatNumberText: {
    color: "#FFFFFF",
    fontSize: Platform.select({ web: 9, default: 6 }),
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: Platform.select({ web: 11, default: 8 }),
  },
  seatDboxBorder: {
    borderWidth: Platform.select({ web: 1.5, default: 1 }),
    borderColor: "#EAB308",
  },
  toggleViewButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleViewButtonText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "bold",
  },
  listContainer: {
    padding: 12,
    gap: 12,
  },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      },
    }),
  },
  listRoomBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(224, 242, 254, 1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  listRoomBadgeText: {
    fontSize: 8,
    color: COLORS.primary,
    fontWeight: "bold",
  },
  listRoomNumberText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "bold",
    lineHeight: 18,
  },
  listInfoContainer: {
    flex: 1,
    justifyContent: "center",
  },
  listMovieTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 4,
  },
  listMovieTime: {
    fontSize: 12,
    color: COLORS.textSoft,
    marginBottom: 4,
  },
  listOccupancyContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  listOccupancyText: {
    fontSize: 12,
    color: COLORS.textSoft,
    marginLeft: 4,
  },
  listButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  listButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
});

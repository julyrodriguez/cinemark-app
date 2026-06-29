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
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db, CINES_COLLECTION, functions } from "../../lib/firebaseConfig";
import { httpsCallable } from "firebase/functions";
import { useAuthUser } from "../../lib/useAuthUser";
import { COLORS, THEME } from "../../lib/theme";
import { WeekdayKey } from "../../lib/programacion/types";
import dayjs from "dayjs";
import { mockShowtimesData } from "./mockShowtimes";

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
  sessionFormat?: string;
  language?: string;
  premiere?: boolean;
  
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
  };
  return mapping[cineId.toLowerCase()] || "103"; // fallback to Abasto (103)
}

// Get start of movie week (Thursday) for a given date in yyyy-mm-dd
function getMovieWeekStart(date: Date): string {
  const localDate = new Date(date.getTime() - (3 * 60 * 60 * 1000));
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
  const dayNum = localDate.getUTCDay();
  const daysToSubtract = dayNum <= 3 ? dayNum + 3 : dayNum - 4;
  const thurDate = new Date(localDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  const yyyy = thurDate.getUTCFullYear();
  const mm = String(thurDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(thurDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  const [selectedDay, setSelectedDay] = useState<WeekdayKey>(getCurrentWeekdayKey());
  const [selectedShow, setSelectedShow] = useState<DailyShow | null>(null);

  const [currentTimeMins, setCurrentTimeMins] = useState(getCurrentTimeMins());
  const [scrollEl, setScrollEl] = useState<any>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const timelineScrollRef = useRef<ScrollView>(null);
  const lastScrolledDay = useRef<string | null>(null);

  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const [isScrolled, setIsScrolled] = useState(false);

  const isCollapsed = isMobile && isScrolled;
  const currentRoomColWidth = isCollapsed ? 34 : ROOM_COL_WIDTH;

  // API Data Integration states
  const [useApiData, setUseApiData] = useState(true); // default to true for live experience
  const [apiData, setApiData] = useState<any[] | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");

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
            setApiData([]);
            setApiError("No hay datos sincronizados para esta semana. Presiona el botón de sincronizar.");
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

  // Generate weeks list dynamically (current + 5 future weeks for pre-sales)
  const availableWeeks = useMemo(() => {
    const list: string[] = [];
    const currentThur = getMovieWeekStartForNow();
    const [y, m, d] = currentThur.split('-').map(Number);
    const thurDate = new Date(Date.UTC(y, m - 1, d));

    for (let i = 0; i < 6; i++) {
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
      const syncFunc = httpsCallable(functions, "forceSyncShowtimes");
      await syncFunc({ cineId });

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

  // Extract all unique room numbers
  const rooms = useMemo(() => {
    if (useApiData) {
      if (!apiData || !selectedWeekStart) return [];
      const set = new Set<number>();
      apiData.forEach((session) => {
        // Filter by selected week
        const utcDate = new Date(session.sessionDateTime);
        const weekStart = getMovieWeekStart(utcDate);
        if (weekStart !== selectedWeekStart) return;

        if (session.theaterRoom !== undefined && session.theaterRoom !== null) {
          set.add(Number(session.theaterRoom));
        }
      });
      return Array.from(set).sort((a, b) => a - b);
    }

    if (!savedWeekly?.weeklyRows) return [];
    const set = new Set<number>();
    savedWeekly.weeklyRows.forEach((row) => {
      if (row.sala !== undefined && row.sala !== null) {
        set.add(Number(row.sala));
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [savedWeekly, useApiData, apiData, selectedWeekStart]);

  // Build the list of shows for the selected day
  const shows = useMemo(() => {
    if (useApiData) {
      if (!apiData || !selectedWeekStart) return [];

      // Group API sessions by sessionId (to merge DBOX and normal)
      const sessionsBySessionId: Record<string, any[]> = {};
      apiData.forEach((session) => {
        // Filter by selected week
        const utcDate = new Date(session.sessionDateTime);
        const weekStart = getMovieWeekStart(utcDate);
        if (weekStart !== selectedWeekStart) return;

        // Map UTC sessionDateTime to Argentina time (UTC-3)
        const arDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000));

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
        const arDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000));

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
          sessionFormat: Array.from(new Set(formats)).join(" / "),
          language: first.language.name,
          premiere: isPremiere,

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
  }, [savedWeekly, selectedDay, useApiData, apiData]);

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
    const today = getCurrentWeekdayKey();
    return (
      selectedDay === today &&
      shows.length > 0 &&
      currentTimeMins >= timelineStartMins &&
      currentTimeMins <= timelineEndMins
    );
  }, [selectedDay, shows.length, currentTimeMins, timelineStartMins, timelineEndMins]);

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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando programación...</Text>
      </View>
    );
  }

  // Adjust empty check to allow API/Simulated data when savedWeekly is empty/null
  if ((!useApiData && (!savedWeekly || rooms.length === 0)) || (useApiData && rooms.length === 0)) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="calendar-blank" size={64} color={COLORS.muted} />
        <Text style={styles.noDataTitle}>No hay programación cargada</Text>
        <Text style={styles.noDataSubtitle}>
          {useApiData 
            ? "No se pudieron obtener datos de la API ni de simulación local."
            : "Subí el reporte en la sección de Servicios > Programaciones para visualizar la programación aquí."}
        </Text>
        <TouchableOpacity
          onPress={() => setUseApiData(!useApiData)}
          style={[styles.apiToggleButton, { marginTop: 16 }]}
        >
          <Text style={styles.apiToggleText}>
            {useApiData ? "Ver Reporte PDF/Excel" : "Ver Simulación API (Abasto)"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formattedWeekLabel = useApiData
    ? (selectedWeekStart
      ? `Programación API (${selectedWeekStart.split('-').reverse().slice(0,2).join('/')})`
      : "Programación en Vivo (API / Simulación)")
    : (savedWeekly?.startDate
      ? `Semana del ${savedWeekly.startDate}`
      : "Programación Semanal");

  return (
    <View style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{formattedWeekLabel}</Text>
          <Text style={styles.headerSubtitle}>
            {useApiData
              ? `Datos para Abasto (Cine ID ${getTheaterId(cineId)}). Uniendo butacas normales y D-BOX.`
              : "La programación se obtiene a partir del reporte cargado y guardado en la sección de Servicios > Programación."}
          </Text>
          {useApiData && apiError && (
            <View style={styles.apiErrorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#B45309" style={{ marginRight: 4 }} />
              <Text style={styles.apiErrorText}>{apiError}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerButtonsRow}>
          {useApiData && (
            <TouchableOpacity
              onPress={handleManualSync}
              disabled={syncing}
              style={[styles.apiSyncButton, { marginRight: 8 }]}
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
          <TouchableOpacity
            onPress={() => setUseApiData(!useApiData)}
            style={[styles.apiToggleButton, useApiData && styles.apiToggleButtonActive]}
          >
            <MaterialCommunityIcons 
              name={useApiData ? "sync" : "cloud-sync"} 
              size={18} 
              color={useApiData ? "#FFFFFF" : COLORS.textSoft} 
              style={{ marginRight: 6 }} 
            />
            <Text style={[styles.apiToggleText, useApiData && styles.apiToggleTextActive]}>
              {useApiData ? "Ver PDF/Excel" : "Ver Simulación API (Abasto)"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Week Selector Bar (if in API mode) */}
      {useApiData && availableWeeks.length > 1 && (
        <View style={styles.weekSelectorContainer}>
          <Text style={styles.weekSelectorLabel}>Semana:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weekSelectorScroll}
          >
            {availableWeeks.map((week) => {
              const isActive = selectedWeekStart === week;
              
              // Format week label nicely: e.g., "Semana del 25/06" or "Semana del 30/07 (Preventa)"
              const [y, m, d] = week.split('-');
              const currentWeek = getMovieWeekStartForNow();
              const isCurrent = week === currentWeek;
              
              let label = `Semana del ${d}/${m}`;
              if (isCurrent) {
                label = `Semana Actual (${d}/${m})`;
              } else if (week > currentWeek) {
                label += " (Preventa)";
              }
              
              return (
                <TouchableOpacity
                  key={week}
                  onPress={() => setSelectedWeekStart(week)}
                  style={[styles.weekButton, isActive && styles.weekButtonActive]}
                >
                  <Text style={[styles.weekButtonText, isActive && styles.weekButtonTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Main Grid View */}
      <View style={styles.gridContainer}>
        <ScrollView style={styles.verticalScrollView} bounces={false} stickyHeaderIndices={[1]}>
          {/* Days Tabs Selection (Index 0) */}
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
                          const is3D = /3d/i.test(show.pelicula);
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
                                    {show.pelicula}
                                  </Text>
                                </View>
                                <View style={styles.movieCardFooter}>
                                  <Text
                                    style={[styles.movieCardTime, is3D && { color: "#FFFFFF" }]}
                                    numberOfLines={1}
                                  >
                                    {show.inicio} - {show.fin}
                                  </Text>
                                  {show.isSimulated && (
                                    <Text style={[styles.cardSoldText, is3D ? { color: "#FFFFFF" } : { color: COLORS.primary }, { fontWeight: "bold" }]} numberOfLines={1}>
                                      🔥 {show.soldSeats}/{show.capacity}
                                    </Text>
                                  )}
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
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
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
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontSize: 12,
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
    paddingLeft: THEME.spacing.xs,
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
});

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { auth } from "@/lib/firebaseConfig";
import { COLORS, THEME } from "@/lib/theme";
import dayjs from "dayjs";

// Lista de cines trackeados por la compañía
const THEATERS = [
  { id: "2015", name: "Alto Avellaneda", icon: "movie-roll" },
  { id: "733", name: "Palermo", icon: "ticket-confirmation-outline" },
  { id: "730", name: "Puerto Madero", icon: "water-outline" },
  { id: "734", name: "Caballito", icon: "chess-knight" },
  { id: "2016", name: "Parque Brown", icon: "tree-outline" },
  { id: "748", name: "San Justo", icon: "compass-outline" },
  { id: "101", name: "Morón", icon: "shield-star-outline" },
  { id: "110", name: "Moreno", icon: "map-marker-radius-outline" },
  { id: "103", name: "Abasto", icon: "stadium-variant" },
  { id: "104", name: "Unicenter", icon: "star-face" },
  { id: "111", name: "DOT", icon: "google-circles-group" }
];

const DAYS_OF_WEEK = [
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" }
];

type Session = {
  sessionId: string;
  movieId: string;
  movieName: string;
  sessionDateTime: string;
  sessionDisplayDate: string;
  theaterRoom: string;
  sessionFormat?: string;
  formats?: Array<{ name: string }>;
  language?: { name: string };
  soldSeats?: number;
  occupiedSeats?: string[];
  occupation?: {
    capacity: number;
    availableSeats: number;
  };
};

type TheaterShowtimes = {
  theaterId: string;
  theaterName: string;
  weekStart: string;
  updatedAt: string;
  sessions: Session[];
};

// Generar color determinista basado en el título de la película
function getMovieColor(title: string) {
  if (!title) return COLORS.primary;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 35%)`;
}

// Formatear semana en rango de jueves a miércoles
function formatWeekRange(weekStart: string): string {
  if (!weekStart) return "";
  const [y, m, d] = weekStart.split('-').map(Number);
  const thur = new Date(Date.UTC(y, m - 1, d));
  const wed = new Date(thur.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  const thurD = thur.getUTCDate();
  const thurM = thur.getUTCMonth() + 1;
  const wedD = wed.getUTCDate();
  const wedM = wed.getUTCMonth() + 1;
  
  return `Del ${thurD}/${String(thurM).padStart(2, '0')} al ${wedD}/${String(wedM).padStart(2, '0')}`;
}

// Obtener la fecha de inicio de la semana de cine actual (jueves)
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

// Obtener el día operativo actual de cine (empieza a las 6 AM)
function getCurrentWeekdayKey(): string {
  let now = dayjs();
  if (now.hour() < 6) {
    now = now.subtract(1, "day");
  }
  const dayNum = now.day(); // 0 = Domingo, 1 = Lunes, etc.
  const map: Record<number, string> = {
    0: "domingo",
    1: "lunes",
    2: "martes",
    3: "miercoles",
    4: "jueves",
    5: "viernes",
    6: "sabado",
  };
  return map[dayNum] || "jueves";
}

// Obtener el día de la semana de la función según el día operativo de cine (comienza a las 6 AM)
function getSessionDayKey(sessionDateTimeStr: string): string {
  if (!sessionDateTimeStr) return "jueves";
  const date = new Date(sessionDateTimeStr);
  const arDate = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  if (arDate.getUTCHours() < 6) {
    arDate.setTime(arDate.getTime() - 24 * 60 * 60 * 1000);
  }
  const dayNum = arDate.getUTCDay();
  const map: Record<number, string> = {
    0: "domingo",
    1: "lunes",
    2: "martes",
    3: "miercoles",
    4: "jueves",
    5: "viernes",
    6: "sabado",
  };
  return map[dayNum] || "jueves";
}

// Determinar si una función es trasnoche (comienza a partir de las 23:30 hs o antes de las 6:00 AM)
function isTrasnocheSession(timeStr: string): boolean {
  if (!timeStr || !timeStr.includes(":")) return false;
  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  
  if (hour < 6) return true;
  if (hour === 23 && min >= 30) return true;
  return false;
}

// Obtener un peso numérico para la ordenación de funciones (las trasnoches del día operativo van al fondo)
function getSessionSortWeight(timeStr: string): number {
  if (!timeStr || !timeStr.includes(":")) return 0;
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  
  // Si la función es trasnoche de madrugada (entre 00:00 y 05:59 AM), le sumamos 24 horas para ordenarla al final
  if (hour < 6) {
    hour += 24;
  }
  
  return hour * 60 + min;
}

export default function CompanyScreen() {
  const [loadingTheaters, setLoadingTheaters] = useState(true);
  const [selectedTheater, setSelectedTheater] = useState<typeof THEATERS[0] | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(() => getCurrentWeekdayKey());
  const [selectedWeek, setSelectedWeek] = useState<string>(() => getMovieWeekStartForNow());
  
  // Refs para sincronización de scroll horizontal en modo grilla
  const roomScrollRefs = useRef<Record<string, ScrollView | null>>({});
  const isSyncingScroll = useRef(false);

  const handleRoomScroll = (event: any, salaNum: string) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const x = event.nativeEvent.contentOffset.x;
    
    Object.entries(roomScrollRefs.current).forEach(([roomNum, ref]) => {
      if (roomNum !== salaNum && ref) {
        ref.scrollTo({ x, animated: false });
      }
    });
    
    setTimeout(() => {
      isSyncingScroll.current = false;
    }, 10);
  };
  
  // Toggles de Modo de Estadísticas (semanal o diaria)
  const [statsMode, setStatsMode] = useState<"weekly" | "daily">("weekly");
  const [statsDay, setStatsDay] = useState<string>(() => getCurrentWeekdayKey());
  const [companyStatsTab, setCompanyStatsTab] = useState<"overview" | "cines" | "peliculas" | "horarios" | "trasnoche">("overview");
  const [theaterSortBy, setTheaterSortBy] = useState<"tickets" | "occupancy">("tickets");

  // Modo de visualización de cartelera (list o grid)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Caché de showtimes de toda la semana de todos los cines
  const [weeklyDataCache, setWeeklyDataCache] = useState<Record<string, TheaterShowtimes>>({});

  const [showtimesData, setShowtimesData] = useState<TheaterShowtimes | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Generar la lista de semanas de cine de forma dinámica (4 pasadas, la actual, y 5 futuras)
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

  // Petición HTTP Helper con Tokens
  const fetchFromApi = async (endpoint: string) => {
    const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://api-cinemark.jariel.com.ar/api";
    const apiToken = process.env.EXPO_PUBLIC_API_TOKEN || "jariel2026";
    
    const headers: any = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`
    };

    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const fbToken = await currentUser.getIdToken();
        headers["x-firebase-auth"] = `Bearer ${fbToken}`;
      } catch (e) {
        console.warn("[CompanyScreen] Error al obtener Firebase Token:", e);
      }
    }

    const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  };

  // Cargar showtimes de todos los cines para la semana seleccionada (se guardan en cache)
  const loadStatsForWeek = async (week: string) => {
    setLoadingTheaters(true);
    const cache: Record<string, TheaterShowtimes> = {};
    
    await Promise.all(
      THEATERS.map(async (theater) => {
        try {
          const data: TheaterShowtimes = await fetchFromApi(`/company/showtimes/${theater.id}/${week}`);
          if (data && data.sessions) {
            cache[theater.id] = data;
          }
        } catch (err) {
          console.warn(`[CompanyScreen] Sin datos para el cine ${theater.name} en la semana ${week}`);
        }
      })
    );
    
    setWeeklyDataCache(cache);
    setLoadingTheaters(false);
  };

  // Cargar estadísticas cuando cambia la semana seleccionada
  useEffect(() => {
    if (selectedWeek) {
      loadStatsForWeek(selectedWeek);
    }
  }, [selectedWeek]);

  // Al cambiar el cine seleccionado o la semana seleccionada, cargar los showtimes detallados
  useEffect(() => {
    if (!selectedTheater || !selectedWeek) return;

    const loadWeeklyShowtimes = async () => {
      setLoadingDetails(true);
      setShowtimesData(null);
      try {
        const data = await fetchFromApi(`/company/showtimes/${selectedTheater.id}/${selectedWeek}`);
        setShowtimesData(data);
      } catch (err) {
        console.error("[CompanyScreen] Error al cargar showtimes semanales:", err);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadWeeklyShowtimes();
  }, [selectedTheater, selectedWeek]);

  const handleSelectTheater = (theater: typeof THEATERS[0]) => {
    setSelectedTheater(theater);
    setSearchQuery("");
    const currentDayKey = getCurrentWeekdayKey();
    setSelectedDay(currentDayKey);
  };

  // Computar estadísticas individuales por cine en base al caché, modo de filtro (Semana/Día) y día seleccionado
  const computedTheaterStats = useMemo(() => {
    const stats: Record<string, {
      occupancy: number;
      totalTickets: number;
      totalCapacity: number;
      sessionsCount: number;
      weekStart: string;
    }> = {};

    THEATERS.forEach((theater) => {
      const data = weeklyDataCache[theater.id];
      if (data && data.sessions && data.sessions.length > 0) {
        let totalSold = 0;
        let totalCap = 0;
        let count = 0;
        
        data.sessions.forEach(s => {
          // Filtrar por día si el modo es diario
          if (statsMode === "daily" && getSessionDayKey(s.sessionDateTime) !== statsDay) {
            return;
          }
          
          const cap = s.occupation?.capacity || 200;
          let sold = s.soldSeats || s.occupiedSeats?.length || 0;
          // Si el total es 0 (ej. preventas sin mapas cargados aún) pero hay ocupación en la API, calcular la diferencia
          if (!sold && s.occupation) {
            sold = Math.max(0, s.occupation.capacity - s.occupation.availableSeats);
          }
          
          totalSold += sold;
          totalCap += cap;
          count++;
        });

        stats[theater.id] = {
          occupancy: totalCap > 0 ? (totalSold / totalCap) * 100 : 0,
          totalTickets: totalSold,
          totalCapacity: totalCap,
          sessionsCount: count,
          weekStart: selectedWeek
        };
      } else {
        stats[theater.id] = {
          occupancy: 0,
          totalTickets: 0,
          totalCapacity: 0,
          sessionsCount: 0,
          weekStart: selectedWeek
        };
      }
    });

    return stats;
  }, [weeklyDataCache, statsMode, statsDay, selectedWeek]);

  // KPIs Globales consolidados
  const globalKpis = useMemo(() => {
    let totalSold = 0;
    let totalCap = 0;
    let leaderName = "-";
    let leaderPercent = 0;

    Object.entries(computedTheaterStats).forEach(([id, stat]) => {
      if (stat) {
        totalSold += stat.totalTickets || 0;
        totalCap += stat.totalCapacity || 0;

        if (stat.occupancy > leaderPercent) {
          leaderPercent = stat.occupancy;
          leaderName = THEATERS.find(t => t.id === id)?.name || "-";
        }
      }
    });

    return {
      totalSold,
      avgOccupancy: totalCap > 0 ? (totalSold / totalCap) * 100 : 0,
      leaderName,
      leaderPercent
    };
  }, [computedTheaterStats]);

  // Extended Company Deep Analytics
  const companyAnalytics = useMemo(() => {
    let totalSold = 0;
    let totalCap = 0;
    let totalSessions = 0;
    let total3DSold = 0;
    let total2DSold = 0;

    let volumeLeaderName = "-";
    let volumeLeaderTickets = -1;
    let occupancyLeaderName = "-";
    let occupancyLeaderPercent = -1;

    const theatersRanked: Array<{
      id: string;
      name: string;
      icon: string;
      totalTickets: number;
      totalCapacity: number;
      occupancy: number;
      sessionsCount: number;
      avgPaxPerShow: number;
      shareOfTotal: number;
    }> = [];

    const movieAggregates: Record<string, {
      title: string;
      totalSold: number;
      totalCap: number;
      sessionsCount: number;
      theatersSet: Set<string>;
      sold3D: number;
    }> = {};

    const networkShifts = {
      matine: { key: "matine", label: "Matiné", sub: "< 15:00 hs", icon: "weather-sunset-up" as const, sold: 0, cap: 0, sessions: 0 },
      tarde: { key: "tarde", label: "Tarde", sub: "15:00 a 19:00 hs", icon: "white-balance-sunny" as const, sold: 0, cap: 0, sessions: 0 },
      noche: { key: "noche", label: "Noche", sub: "19:00 a 23:00 hs", icon: "weather-sunset-down" as const, sold: 0, cap: 0, sessions: 0 },
      trasnoche: { key: "trasnoche", label: "Trasnoche", sub: "≥ 23:00 hs", icon: "weather-night" as const, sold: 0, cap: 0, sessions: 0 },
    };

    const daySalesCompany: Record<string, { sold: number; cap: number; sessions: number }> = {};
    DAYS_OF_WEEK.forEach(d => {
      daySalesCompany[d.key] = { sold: 0, cap: 0, sessions: 0 };
    });

    let networkRecordSession: any = null;
    let networkRecordRate = -1;

    THEATERS.forEach((theater) => {
      const data = weeklyDataCache[theater.id];
      const stats = computedTheaterStats[theater.id];
      const theaterSold = stats?.totalTickets || 0;
      const theaterCap = stats?.totalCapacity || 0;
      const theaterOcc = stats?.occupancy || 0;
      const theaterSessions = stats?.sessionsCount || 0;

      totalSold += theaterSold;
      totalCap += theaterCap;
      totalSessions += theaterSessions;

      if (theaterSold > volumeLeaderTickets) {
        volumeLeaderTickets = theaterSold;
        volumeLeaderName = theater.name;
      }
      if (theaterOcc > occupancyLeaderPercent && theaterCap > 0) {
        occupancyLeaderPercent = theaterOcc;
        occupancyLeaderName = theater.name;
      }

      theatersRanked.push({
        id: theater.id,
        name: theater.name,
        icon: theater.icon,
        totalTickets: theaterSold,
        totalCapacity: theaterCap,
        occupancy: theaterOcc,
        sessionsCount: theaterSessions,
        avgPaxPerShow: theaterSessions > 0 ? Math.round(theaterSold / theaterSessions) : 0,
        shareOfTotal: 0,
      });

      if (data && data.sessions) {
        data.sessions.forEach((s) => {
          if (statsMode === "daily" && getSessionDayKey(s.sessionDateTime) !== statsDay) {
            return;
          }

          const cap = s.occupation?.capacity || 200;
          let sold = s.soldSeats || s.occupiedSeats?.length || 0;
          if (!sold && s.occupation) {
            sold = Math.max(0, s.occupation.capacity - s.occupation.availableSeats);
          }

          const is3D = /3d/i.test(s.movieName) || /3d/i.test(s.sessionFormat || "");
          if (is3D) total3DSold += sold;
          else total2DSold += sold;

          if (!movieAggregates[s.movieName]) {
            movieAggregates[s.movieName] = {
              title: s.movieName,
              totalSold: 0,
              totalCap: 0,
              sessionsCount: 0,
              theatersSet: new Set<string>(),
              sold3D: 0
            };
          }
          movieAggregates[s.movieName].totalSold += sold;
          movieAggregates[s.movieName].totalCap += cap;
          movieAggregates[s.movieName].sessionsCount += 1;
          movieAggregates[s.movieName].theatersSet.add(theater.name);
          if (is3D) movieAggregates[s.movieName].sold3D += sold;

          const time = s.sessionDateTime ? s.sessionDateTime.substring(11, 16) : "";
          const hour = parseInt(time.split(":")[0] || "0", 10);
          if (isTrasnocheSession(time)) {
            networkShifts.trasnoche.sold += sold;
            networkShifts.trasnoche.cap += cap;
            networkShifts.trasnoche.sessions += 1;
          } else if (hour < 15) {
            networkShifts.matine.sold += sold;
            networkShifts.matine.cap += cap;
            networkShifts.matine.sessions += 1;
          } else if (hour < 19) {
            networkShifts.tarde.sold += sold;
            networkShifts.tarde.cap += cap;
            networkShifts.tarde.sessions += 1;
          } else {
            networkShifts.noche.sold += sold;
            networkShifts.noche.cap += cap;
            networkShifts.noche.sessions += 1;
          }

          const dayKey = getSessionDayKey(s.sessionDateTime);
          if (daySalesCompany[dayKey]) {
            daySalesCompany[dayKey].sold += sold;
            daySalesCompany[dayKey].cap += cap;
            daySalesCompany[dayKey].sessions += 1;
          }

          if (cap > 0) {
            const rate = sold / cap;
            if (rate > networkRecordRate || (rate === networkRecordRate && sold > (networkRecordSession?.sold || 0))) {
              networkRecordRate = rate;
              networkRecordSession = {
                theaterName: theater.name,
                movieName: s.movieName,
                time: time,
                dayKey: dayKey,
                dayLabel: DAYS_OF_WEEK.find(d => d.key === dayKey)?.label || dayKey,
                room: s.theaterRoom,
                sold: sold,
                cap: cap,
                rate: rate
              };
            }
          }
        });
      }
    });

    theatersRanked.forEach((t) => {
      t.shareOfTotal = totalSold > 0 ? (t.totalTickets / totalSold) * 100 : 0;
    });

    const topMovies = Object.values(movieAggregates)
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 8)
      .map(m => ({
        ...m,
        theatersCount: m.theatersSet.size,
        occupancy: m.totalCap > 0 ? (m.totalSold / m.totalCap) * 100 : 0,
        shareOfChain: totalSold > 0 ? (m.totalSold / totalSold) * 100 : 0,
      }));

    const avgOccupancy = totalCap > 0 ? (totalSold / totalCap) * 100 : 0;
    const avgPaxPerShow = totalSessions > 0 ? Math.round(totalSold / totalSessions) : 0;
    const mix3DPercent = totalSold > 0 ? (total3DSold / totalSold) * 100 : 0;

    const dayDetails = DAYS_OF_WEEK.map((d) => {
      const data = daySalesCompany[d.key] || { sold: 0, cap: 0, sessions: 0 };
      const occ = data.cap > 0 ? (data.sold / data.cap) * 100 : 0;
      const isWeekend = d.key === "viernes" || d.key === "sabado" || d.key === "domingo";
      return {
        ...d,
        sold: data.sold,
        capacity: data.cap,
        sessions: data.sessions,
        occupancy: occ,
        isWeekend
      };
    });

    let bestDay = dayDetails[0];
    dayDetails.forEach(d => {
      if (d.sold > bestDay.sold) bestDay = d;
    });

    const weekendSold = (daySalesCompany["viernes"]?.sold || 0) + (daySalesCompany["sabado"]?.sold || 0) + (daySalesCompany["domingo"]?.sold || 0);
    const weekdaySold = Math.max(0, totalSold - weekendSold);

    return {
      totalSold,
      totalCap,
      totalSessions,
      avgOccupancy,
      avgPaxPerShow,
      total3DSold,
      total2DSold,
      mix3DPercent,
      volumeLeaderName,
      volumeLeaderTickets: Math.max(0, volumeLeaderTickets),
      occupancyLeaderName,
      occupancyLeaderPercent: Math.max(0, occupancyLeaderPercent),
      theatersRanked,
      topMovies,
      networkShifts,
      dayDetails,
      bestDay,
      weekendSold,
      weekdaySold,
      networkRecordSession
    };
  }, [computedTheaterStats, weeklyDataCache, statsMode, statsDay]);

  // Estadísticas Especiales de Trasnoche (23:30 hs a 06:00 hs)
  const trasnocheStats = useMemo(() => {
    let totalSold = 0;
    let totalCap = 0;
    let bestTheaterName = "-";
    let bestTheaterPercent = 0;
    let bestTheaterSold = 0;
    let hasTrasnocheData = false;

    THEATERS.forEach((theater) => {
      const data = weeklyDataCache[theater.id];
      if (data && data.sessions) {
        let tSold = 0;
        let tCap = 0;
        
        data.sessions.forEach((s) => {
          // Filtrar por día si el modo de estadística es diario
          if (statsMode === "daily" && getSessionDayKey(s.sessionDateTime) !== statsDay) {
            return;
          }
          
          const time = s.sessionDateTime ? s.sessionDateTime.substring(11, 16) : "";
          if (isTrasnocheSession(time)) {
            const cap = s.occupation?.capacity || 200;
            let sold = s.soldSeats || s.occupiedSeats?.length || 0;
            if (!sold && s.occupation) {
              sold = Math.max(0, s.occupation.capacity - s.occupation.availableSeats);
            }
            tSold += sold;
            tCap += cap;
          }
        });

        if (tCap > 0) {
          hasTrasnocheData = true;
          totalSold += tSold;
          totalCap += tCap;
          const occupancy = (tSold / tCap) * 100;
          if (occupancy > bestTheaterPercent) {
            bestTheaterPercent = occupancy;
            bestTheaterName = theater.name;
            bestTheaterSold = tSold;
          }
        }
      }
    });

    return {
      hasTrasnocheData,
      totalSold,
      avgOccupancy: totalCap > 0 ? (totalSold / totalCap) * 100 : 0,
      bestTheaterName,
      bestTheaterPercent,
      bestTheaterSold
    };
  }, [weeklyDataCache, statsMode, statsDay]);

  // Filtrar funciones detalladas por día de la semana y buscador (con ordenación trasnoche al fondo)
  const filteredSessions = useMemo(() => {
    if (!showtimesData?.sessions) return [];
    
    let list = showtimesData.sessions;
    list = list.filter(s => getSessionDayKey(s.sessionDateTime) === selectedDay);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(s =>
        (s.movieName || "").toLowerCase().includes(query) ||
        (s.theaterRoom || "").toLowerCase().includes(query)
      );
    }

    // Ordenar de forma que los trasnoches del día de cine operativo (1:00 AM, etc) vayan al fondo
    return [...list].sort((a, b) => {
      const aTime = a.sessionDateTime ? a.sessionDateTime.substring(11, 16) : "";
      const bTime = b.sessionDateTime ? b.sessionDateTime.substring(11, 16) : "";
      return getSessionSortWeight(aTime) - getSessionSortWeight(bTime);
    });
  }, [showtimesData, selectedDay, searchQuery]);

  // Obtener lista única de salas para el renderizado en cuadrícula/grid
  const roomsList = useMemo(() => {
    const rooms = filteredSessions.map(s => s.theaterRoom);
    return Array.from(new Set(rooms)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [filteredSessions]);


  // Renderizar cada función en modo de lista
  const renderSessionItem = ({ item }: { item: Session }) => {
    let sold = item.soldSeats || item.occupiedSeats?.length || 0;
    if (!sold && item.occupation) {
      sold = Math.max(0, item.occupation.capacity - item.occupation.availableSeats);
    }
    const capacity = item.occupation?.capacity || 200;
    const occupancyPercent = capacity > 0 ? (sold / capacity) * 100 : 0;
    const movieAccentColor = getMovieColor(item.movieName);

    let progressColor = COLORS.danger; // > 60%
    if (occupancyPercent < 25) progressColor = COLORS.info; // < 25% (baja)
    else if (occupancyPercent < 60) progressColor = COLORS.success; // 25-60% (media)

    const format = item.sessionFormat || (item.formats && item.formats[0]?.name) || "";
    const language = (item.language && item.language.name) || "";
    const time = item.sessionDateTime ? item.sessionDateTime.substring(11, 16) : "";
    const isTrasnoche = isTrasnocheSession(time);

    return (
      <View style={[styles.listCard, { borderLeftColor: movieAccentColor }]}>
        {/* Badge de Sala (Estilo circular) */}
        <View style={styles.listRoomBadge}>
          <Text style={styles.listRoomBadgeText}>SALA</Text>
          <Text style={styles.listRoomNumberText}>{item.theaterRoom || "-"}</Text>
        </View>

        {/* Información de Película y Ocupación */}
        <View style={styles.listInfoContainer}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.listMovieTitle}>{item.movieName || "Película"}</Text>
            {isTrasnoche && (
              <View style={styles.trasnocheBadge}>
                <MaterialCommunityIcons name="weather-night" size={10} color="#F59E0B" />
                <Text style={styles.trasnocheBadgeText}>Trasnoche</Text>
              </View>
            )}
          </View>
          <View style={styles.sessionMetaRow}>
            {format ? <Text style={styles.sessionMetaLabel}>{format}</Text> : null}
            {format && language ? <Text style={styles.sessionMetaDivider}>•</Text> : null}
            {language ? <Text style={styles.sessionMetaLabel}>{language}</Text> : null}
          </View>

          {/* Barra de progreso de ocupación */}
          <View style={styles.occupancyBarContainer}>
            <View style={styles.occupancyLabelRow}>
              <Text style={styles.occupancyTickets}>
                {sold} / {capacity} tickets vendidos
              </Text>
              <Text style={[styles.occupancyPercentText, { color: progressColor }]}>
                {occupancyPercent.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${Math.min(100, occupancyPercent)}%`, backgroundColor: progressColor }
                ]} 
              />
            </View>
          </View>
        </View>

        {/* Horario a la derecha */}
        <View style={styles.sessionTimeCol}>
          <Text style={styles.sessionTimeText}>{time || "--:--"} hs</Text>
        </View>
      </View>
    );
  };

  // Selector de semanas (Estilo idéntico a Programación con flechas)
  const renderWeekSelector = () => {
    const currentIndex = availableWeeks.indexOf(selectedWeek);
    if (currentIndex === -1) return null;
    
    const canGoPrev = currentIndex > 0;
    const canGoNext = currentIndex < availableWeeks.length - 1;
    const currentWeek = getMovieWeekStartForNow();
    const isCurrent = selectedWeek === currentWeek;
    
    let label = formatWeekRange(selectedWeek);
    if (isCurrent) {
      label += " (Actual)";
    } else if (selectedWeek > currentWeek) {
      label += " (Preventa)";
    } else if (selectedWeek < currentWeek) {
      label += " (Pasada)";
    }
    
    return (
      <View style={styles.singleWeekSelectorContainer}>
        <TouchableOpacity
          disabled={!canGoPrev}
          onPress={() => setSelectedWeek(availableWeeks[currentIndex - 1])}
          style={[styles.arrowButton, !canGoPrev && styles.arrowButtonDisabled]}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons 
            name="chevron-left" 
            size={20} 
            color={canGoPrev ? COLORS.text : COLORS.muted} 
          />
        </TouchableOpacity>
        
        <View style={styles.singleWeekLabelContainer}>
          <Text style={styles.singleWeekLabelText}>{label}</Text>
        </View>

        <TouchableOpacity
          disabled={!canGoNext}
          onPress={() => setSelectedWeek(availableWeeks[currentIndex + 1])}
          style={[styles.arrowButton, !canGoNext && styles.arrowButtonDisabled]}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons 
            name="chevron-right" 
            size={20} 
            color={canGoNext ? COLORS.text : COLORS.muted} 
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >

      {/* Selector de Semanas a nivel global superior */}
      {renderWeekSelector()}

      {/* Selector de Modo de Estadísticas (Semanal vs Diario) */}
      <View style={styles.statsModeToggleContainer}>
        <TouchableOpacity
          style={[styles.toggleBtn, statsMode === "weekly" && styles.toggleBtnActive]}
          onPress={() => setStatsMode("weekly")}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons 
            name="calendar-range" 
            size={16} 
            color={statsMode === "weekly" ? "#FFFFFF" : COLORS.text} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.toggleBtnText, statsMode === "weekly" && styles.toggleBtnTextActive]}>
            Semanal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, statsMode === "daily" && styles.toggleBtnActive]}
          onPress={() => setStatsMode("daily")}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons 
            name="calendar-today" 
            size={16} 
            color={statsMode === "daily" ? "#FFFFFF" : COLORS.text} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.toggleBtnText, statsMode === "daily" && styles.toggleBtnTextActive]}>
            Diario
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selector de día centrado para estadísticas (modo diario) */}
      {statsMode === "daily" && (
        <View style={styles.statsDaySelectorContainer}>
          <Text style={styles.statsDaySelectorLabel}>Filtrar estadísticas de cines por día:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.centeredTabBar}
          >
            {DAYS_OF_WEEK.map((day) => {
              const isActive = statsDay === day.key;
              return (
                <TouchableOpacity
                  key={day.key}
                  onPress={() => setStatsDay(day.key)}
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
      )}

      {/* Centro de Inteligencia & Estadísticas de la Compañía */}
      <View style={styles.companyStatsModernContainer}>
        {/* Modern Section Header */}
        <View style={styles.companyStatsHeaderRow}>
          <View style={styles.companyHeaderBadgePill}>
            <MaterialCommunityIcons name="domain" size={13} color={COLORS.primary} />
            <Text style={styles.companyHeaderBadgeText}>INTELIGENCIA DE RED • CADENA</Text>
          </View>
          <Text style={styles.companyStatsMainTitle}>
            Estadísticas Consolidadas de la Compañía
          </Text>
          <Text style={styles.companyStatsMainSubtitle}>
            Monitoreo comercial y operativo de los 11 complejos Cinemark en tiempo real
          </Text>
        </View>

        {/* 6 Executive KPI Scorecards */}
        <View style={styles.companyKpiGrid}>
          {/* Card 1: Tickets Cadena */}
          <View style={[styles.companyKpiCard, { borderTopColor: COLORS.primary }]}>
            <View style={styles.companyKpiTopRow}>
              <View style={[styles.companyKpiIconCircle, { backgroundColor: COLORS.primarySoft }]}>
                <MaterialCommunityIcons name="ticket-percent-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.companyKpiTag}>
                <Text style={styles.companyKpiTagText}>{statsMode === "daily" ? "Diario" : "Semanal"}</Text>
              </View>
            </View>
            <Text style={styles.companyKpiNumber}>
              {loadingTheaters ? "-" : companyAnalytics.totalSold.toLocaleString("es-AR")}
            </Text>
            <Text style={styles.companyKpiLabel}>Tickets Totales Cadena</Text>
            <View style={styles.companyKpiDivider} />
            <Text style={styles.companyKpiFooter}>
              Promedio: <Text style={{ fontWeight: "bold" }}>{companyAnalytics.avgPaxPerShow} tix</Text> / show
            </Text>
          </View>

          {/* Card 2: Ocupación Promedio */}
          <View style={[styles.companyKpiCard, { borderTopColor: "#10B981" }]}>
            <View style={styles.companyKpiTopRow}>
              <View style={[styles.companyKpiIconCircle, { backgroundColor: "#D1FAE5" }]}>
                <MaterialCommunityIcons name="chart-donut" size={18} color="#047857" />
              </View>
              <View style={[styles.companyKpiTag, { backgroundColor: "#D1FAE5" }]}>
                <Text style={[styles.companyKpiTagText, { color: "#047857" }]}>Ocupación</Text>
              </View>
            </View>
            <Text style={styles.companyKpiNumber}>
              {loadingTheaters ? "-" : `${companyAnalytics.avgOccupancy.toFixed(1)}%`}
            </Text>
            <Text style={styles.companyKpiLabel}>Ocupación Media Red</Text>
            <View style={styles.companyKpiDivider} />
            <Text style={styles.companyKpiFooter}>
              Capacidad: <Text style={{ fontWeight: "bold" }}>{companyAnalytics.totalCap.toLocaleString("es-AR")}</Text> butacas
            </Text>
          </View>

          {/* Card 3: Cine Líder en Ocupación */}
          <View style={[styles.companyKpiCard, { borderTopColor: "#EAB308" }]}>
            <View style={styles.companyKpiTopRow}>
              <View style={[styles.companyKpiIconCircle, { backgroundColor: "#FEF3C7" }]}>
                <MaterialCommunityIcons name="trophy-outline" size={18} color="#B45309" />
              </View>
              <View style={[styles.companyKpiTag, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[styles.companyKpiTagText, { color: "#B45309" }]}>Eficiencia</Text>
              </View>
            </View>
            <Text style={styles.companyKpiNumberText} numberOfLines={1}>
              {loadingTheaters ? "-" : companyAnalytics.occupancyLeaderName}
            </Text>
            <Text style={styles.companyKpiLabel}>Líder en Ocupación</Text>
            <View style={styles.companyKpiDivider} />
            <Text style={styles.companyKpiFooter}>
              Aforo récord: <Text style={{ fontWeight: "bold" }}>{companyAnalytics.occupancyLeaderPercent.toFixed(1)}%</Text>
            </Text>
          </View>

          {/* Card 4: Cine Mayor Volumen */}
          <View style={[styles.companyKpiCard, { borderTopColor: "#3B82F6" }]}>
            <View style={styles.companyKpiTopRow}>
              <View style={[styles.companyKpiIconCircle, { backgroundColor: "#DBEAFE" }]}>
                <MaterialCommunityIcons name="trending-up" size={18} color="#1D4ED8" />
              </View>
              <View style={[styles.companyKpiTag, { backgroundColor: "#DBEAFE" }]}>
                <Text style={[styles.companyKpiTagText, { color: "#1D4ED8" }]}>Volumen</Text>
              </View>
            </View>
            <Text style={styles.companyKpiNumberText} numberOfLines={1}>
              {loadingTheaters ? "-" : companyAnalytics.volumeLeaderName}
            </Text>
            <Text style={styles.companyKpiLabel}>Líder en Tickets</Text>
            <View style={styles.companyKpiDivider} />
            <Text style={styles.companyKpiFooter}>
              Ventas: <Text style={{ fontWeight: "bold" }}>{companyAnalytics.volumeLeaderTickets.toLocaleString("es-AR")} tix</Text>
            </Text>
          </View>

          {/* Card 5: Lentes 3D Cadena */}
          <View style={[styles.companyKpiCard, { borderTopColor: "#8B5CF6" }]}>
            <View style={styles.companyKpiTopRow}>
              <View style={[styles.companyKpiIconCircle, { backgroundColor: "#EDE9FE" }]}>
                <MaterialCommunityIcons name="sunglasses" size={18} color="#7C3AED" />
              </View>
              <View style={[styles.companyKpiTag, { backgroundColor: "#EDE9FE" }]}>
                <Text style={[styles.companyKpiTagText, { color: "#7C3AED" }]}>Mix 3D</Text>
              </View>
            </View>
            <Text style={styles.companyKpiNumber}>
              {loadingTheaters ? "-" : companyAnalytics.total3DSold.toLocaleString("es-AR")}
            </Text>
            <Text style={styles.companyKpiLabel}>Lentes 3D Cadena</Text>
            <View style={styles.companyKpiDivider} />
            <Text style={styles.companyKpiFooter}>
              Penetración: <Text style={{ fontWeight: "bold" }}>{companyAnalytics.mix3DPercent.toFixed(1)}%</Text> del aforo
            </Text>
          </View>

          {/* Card 6: Shows & Complejos */}
          <View style={[styles.companyKpiCard, { borderTopColor: "#64748B" }]}>
            <View style={styles.companyKpiTopRow}>
              <View style={[styles.companyKpiIconCircle, { backgroundColor: "#F1F5F9" }]}>
                <MaterialCommunityIcons name="theater" size={18} color="#334155" />
              </View>
              <View style={[styles.companyKpiTag, { backgroundColor: "#F1F5F9" }]}>
                <Text style={[styles.companyKpiTagText, { color: "#334155" }]}>Red</Text>
              </View>
            </View>
            <Text style={styles.companyKpiNumber}>
              {loadingTheaters ? "-" : companyAnalytics.totalSessions}
            </Text>
            <Text style={styles.companyKpiLabel}>Funciones Activas</Text>
            <View style={styles.companyKpiDivider} />
            <Text style={styles.companyKpiFooter}>
              Complejos: <Text style={{ fontWeight: "bold" }}>{THEATERS.length}</Text> cines monitoreados
            </Text>
          </View>
        </View>

        {/* Función Récord de la Cadena Banner */}
        {companyAnalytics.networkRecordSession ? (
          <View style={styles.companyRecordBanner}>
            <View style={styles.companyRecordFlameCircle}>
              <MaterialCommunityIcons name="fire" size={24} color="#EF4444" />
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={styles.companyRecordBadgeRow}>
                <Text style={styles.companyRecordBadgeLabel}>FUNCIÓN RÉCORD DE LA CADENA</Text>
                <View style={styles.companyRecordPill}>
                  <Text style={styles.companyRecordPillText}>
                    {Math.round(companyAnalytics.networkRecordSession.rate * 100)}% LLENO
                  </Text>
                </View>
              </View>
              <Text style={styles.companyRecordMovie} numberOfLines={1}>
                {companyAnalytics.networkRecordSession.movieName}
              </Text>
              <Text style={styles.companyRecordDetails}>
                {companyAnalytics.networkRecordSession.theaterName} • {companyAnalytics.networkRecordSession.dayLabel} a las {companyAnalytics.networkRecordSession.time} hs (Sala {companyAnalytics.networkRecordSession.room})
              </Text>
            </View>
            <View style={styles.companyRecordNumbers}>
              <Text style={styles.companyRecordTicketsSold}>
                {companyAnalytics.networkRecordSession.sold}
              </Text>
              <Text style={styles.companyRecordTicketsCap}>
                / {companyAnalytics.networkRecordSession.cap} tix
              </Text>
            </View>
          </View>
        ) : null}

        {/* Sub-Tabs Selector de Estadísticas */}
        <View style={styles.companySubTabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.companySubTabsScroll}
          >
            {[
              { key: "overview", label: "Vista General", icon: "view-dashboard-outline" },
              { key: "cines", label: "Ranking de Cines", icon: "trophy-outline" },
              { key: "peliculas", label: "Top Películas Cadena", icon: "filmstrip" },
              { key: "horarios", label: "Días & Turnos", icon: "clock-time-four-outline" },
              { key: "trasnoche", label: "Especial Trasnoche", icon: "weather-night" },
            ].map((tab) => {
              const isActive = companyStatsTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setCompanyStatsTab(tab.key as any)}
                  style={[styles.companySubTabBtn, isActive && styles.companySubTabBtnActive]}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={tab.icon as any}
                    size={15}
                    color={isActive ? "#FFFFFF" : COLORS.textSoft}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.companySubTabBtnText, isActive && styles.companySubTabBtnTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab 1: Ranking de Cines (Leaderboard) */}
        {(companyStatsTab === "overview" || companyStatsTab === "cines") && (
          <View style={styles.companyAnalyticsCard}>
            <View style={styles.companyAnalyticsCardHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="trophy-variant-outline" size={18} color="#EAB308" style={{ marginRight: 8 }} />
                <Text style={styles.companyAnalyticsCardTitle}>Ranking & Rendimiento por Complejo</Text>
              </View>
              {/* Sorter toggle */}
              <View style={styles.sorterContainer}>
                <TouchableOpacity
                  onPress={() => setTheaterSortBy("tickets")}
                  style={[styles.sortBtn, theaterSortBy === "tickets" && styles.sortBtnActive]}
                >
                  <Text style={[styles.sortBtnText, theaterSortBy === "tickets" && styles.sortBtnTextActive]}>
                    Tickets
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTheaterSortBy("occupancy")}
                  style={[styles.sortBtn, theaterSortBy === "occupancy" && styles.sortBtnActive]}
                >
                  <Text style={[styles.sortBtnText, theaterSortBy === "occupancy" && styles.sortBtnTextActive]}>
                    Ocupación
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.leaderboardList}>
              {[...companyAnalytics.theatersRanked]
                .sort((a, b) => theaterSortBy === "tickets" ? b.totalTickets - a.totalTickets : b.occupancy - a.occupancy)
                .map((theater, index) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const rankBadge = medals[index] || `#${index + 1}`;
                  const isTop3 = index < 3;
                  const isSelected = selectedTheater?.id === theater.id;

                  let barColor = "#3B82F6";
                  if (theater.occupancy > 50) barColor = "#EF4444";
                  else if (theater.occupancy >= 25) barColor = "#10B981";

                  return (
                    <TouchableOpacity
                      key={theater.id}
                      onPress={() => {
                        const target = THEATERS.find(t => t.id === theater.id);
                        if (target) handleSelectTheater(target);
                      }}
                      style={[
                        styles.leaderboardRow,
                        isTop3 && styles.leaderboardRowTop3,
                        isSelected && styles.leaderboardRowSelected,
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.leaderboardRankIcon}>{rankBadge}</Text>
                      <View style={[styles.leaderboardIconCircle, isSelected && { backgroundColor: COLORS.primarySoft }]}>
                        <MaterialCommunityIcons
                          name={theater.icon as any || "movie-roll"}
                          size={18}
                          color={isSelected ? COLORS.primary : COLORS.text}
                        />
                      </View>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <Text style={[styles.leaderboardTheaterName, isSelected && { color: COLORS.primary }]}>
                            {theater.name}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={styles.leaderboardTicketsText}>
                              {theater.totalTickets.toLocaleString("es-AR")} tix
                            </Text>
                            <Text style={styles.leaderboardShareText}>
                              ({theater.shareOfTotal.toFixed(1)}%)
                            </Text>
                          </View>
                        </View>
                        {/* Occupancy bar */}
                        <View style={styles.leaderboardBarBg}>
                          <View style={[styles.leaderboardBarFill, { width: `${Math.min(100, theater.occupancy)}%`, backgroundColor: barColor }]} />
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                          <Text style={styles.leaderboardSubDetail}>
                            {theater.sessionsCount} funciones • {theater.avgPaxPerShow} pax/show
                          </Text>
                          <Text style={[styles.leaderboardOccText, { color: barColor }]}>
                            {theater.occupancy.toFixed(1)}% ocupación
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        )}

        {/* Tab 2: Top Películas Cadena */}
        {(companyStatsTab === "overview" || companyStatsTab === "peliculas") && (
          <View style={styles.companyAnalyticsCard}>
            <View style={styles.companyAnalyticsCardHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="filmstrip" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={styles.companyAnalyticsCardTitle}>Top Películas en Cartelera (Box Office Cadena)</Text>
              </View>
            </View>

            <View style={styles.topMoviesList}>
              {companyAnalytics.topMovies.map((movie, index) => {
                const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
                const maxTickets = companyAnalytics.topMovies[0]?.totalSold || 1;
                const percentage = (movie.totalSold / maxTickets) * 100;

                return (
                  <View key={movie.title} style={styles.topMovieRow}>
                    <Text style={styles.topMovieRank}>{medals[index] || `#${index + 1}`}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.topMovieInfoRow}>
                        <Text style={styles.topMovieTitle} numberOfLines={1}>
                          {movie.title}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={styles.topMovieTickets}>{movie.totalSold.toLocaleString("es-AR")} tix</Text>
                          <Text style={styles.topMovieShare}>({movie.shareOfChain.toFixed(1)}%)</Text>
                        </View>
                      </View>
                      <View style={styles.topMovieBarBg}>
                        <View
                          style={[
                            styles.topMovieBarFill,
                            {
                              width: `${percentage}%`,
                              backgroundColor: index === 0 ? COLORS.primary : index === 1 ? "#3B82F6" : index === 2 ? "#10B981" : "#64748B"
                            }
                          ]}
                        />
                      </View>
                      <View style={styles.topMovieFooterRow}>
                        <Text style={styles.topMovieFooterText}>
                          Exhibida en <Text style={{ fontWeight: "bold" }}>{movie.theatersCount}</Text> de {THEATERS.length} complejos • {movie.sessionsCount} funciones
                        </Text>
                        {movie.sold3D > 0 && (
                          <View style={styles.topMovie3DChip}>
                            <Text style={styles.topMovie3DChipText}>3D: {movie.sold3D} tix</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Tab 3: Días & Franjas Horarias */}
        {(companyStatsTab === "overview" || companyStatsTab === "horarios") && (
          <View style={styles.companyAnalyticsCard}>
            <View style={styles.companyAnalyticsCardHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="clock-time-four-outline" size={18} color="#3B82F6" style={{ marginRight: 8 }} />
                <Text style={styles.companyAnalyticsCardTitle}>Distribución por Turnos & Franjas Horarias</Text>
              </View>
            </View>

            {/* Franjas Horarias */}
            <View style={styles.companyShiftsGrid}>
              {Object.values(companyAnalytics.networkShifts).map((shift) => {
                const occ = shift.cap > 0 ? (shift.sold / shift.cap) * 100 : 0;
                const percentOfChain = companyAnalytics.totalSold > 0 ? (shift.sold / companyAnalytics.totalSold) * 100 : 0;
                return (
                  <View key={shift.key} style={styles.companyShiftCard}>
                    <View style={styles.companyShiftHeader}>
                      <MaterialCommunityIcons name={shift.icon} size={18} color={COLORS.primary} />
                      <Text style={styles.companyShiftTitle}>{shift.label}</Text>
                    </View>
                    <Text style={styles.companyShiftSub}>{shift.sub}</Text>
                    <Text style={styles.companyShiftSold}>{shift.sold.toLocaleString("es-AR")} tix</Text>
                    <View style={styles.companyShiftBarBg}>
                      <View style={[styles.companyShiftBarFill, { width: `${Math.min(100, occ)}%` }]} />
                    </View>
                    <View style={styles.companyShiftFooterRow}>
                      <Text style={styles.companyShiftFooterText}>{shift.sessions} funciones</Text>
                      <Text style={styles.companyShiftOcc}>{occ.toFixed(0)}% ocup.</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Días de la Semana (si estamos en vista semanal) */}
            {statsMode === "weekly" && (
              <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={styles.companyDaysTitle}>Curva de Ventas por Día de la Semana</Text>
                  <View style={styles.companyWeekendBadge}>
                    <Text style={styles.companyWeekendBadgeText}>
                      Finde: {companyAnalytics.weekendSold.toLocaleString("es-AR")} tix
                    </Text>
                  </View>
                </View>

                <View style={styles.companyDaysList}>
                  {companyAnalytics.dayDetails.map((day) => {
                    const maxDaySold = companyAnalytics.bestDay?.sold || 1;
                    const percentage = (day.sold / maxDaySold) * 100;
                    const isPeak = day.key === companyAnalytics.bestDay?.key && day.sold > 0;

                    return (
                      <View key={day.key} style={styles.companyDayRow}>
                        <View style={styles.companyDayInfoRow}>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            {isPeak && <MaterialCommunityIcons name="star" size={13} color="#EAB308" style={{ marginRight: 4 }} />}
                            <Text style={[styles.companyDayName, isPeak && { color: COLORS.primary, fontWeight: "900" }]}>
                              {day.label} {day.isWeekend && "(FDS)"}
                            </Text>
                          </View>
                          <Text style={[styles.companyDayTickets, isPeak && { color: COLORS.primary }]}>
                            {day.sold.toLocaleString("es-AR")} tix ({day.occupancy.toFixed(0)}%)
                          </Text>
                        </View>
                        <View style={styles.companyDayBarBg}>
                          <View
                            style={[
                              styles.companyDayBarFill,
                              {
                                width: `${percentage}%`,
                                backgroundColor: isPeak ? COLORS.primary : day.isWeekend ? "#10B981" : "#3B82F6"
                              }
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Tab 4: Especial Trasnoche */}
        {(companyStatsTab === "overview" || companyStatsTab === "trasnoche") && trasnocheStats.hasTrasnocheData && (
          <View style={styles.trasnocheModernCard}>
            <View style={styles.trasnocheModernHeader}>
              <View style={styles.trasnocheMoonCircle}>
                <MaterialCommunityIcons name="weather-night" size={20} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.trasnocheModernTitle}>
                  {statsMode === "daily"
                    ? `Especial Trasnoche Cadena 🌙 (${DAYS_OF_WEEK.find(d => d.key === statsDay)?.label || ""})`
                    : "Especial Trasnoche Cadena 🌙 (Semanal)"}
                </Text>
                <Text style={styles.trasnocheModernSubtitle}>
                  Funciones a partir de las 23:30 hs y trasnoches de madrugada en toda la red
                </Text>
              </View>
            </View>

            <View style={styles.trasnocheModernStatsGrid}>
              <View style={styles.trasnocheModernCol}>
                <Text style={styles.trasnocheModernVal}>
                  {trasnocheStats.totalSold.toLocaleString("es-AR")}
                </Text>
                <Text style={styles.trasnocheModernLbl}>Tickets Trasnoche Cadena</Text>
              </View>

              <View style={styles.trasnocheModernCol}>
                <Text style={styles.trasnocheModernVal}>
                  {trasnocheStats.avgOccupancy.toFixed(1)}%
                </Text>
                <Text style={styles.trasnocheModernLbl}>Ocupación Media</Text>
              </View>

              <View style={styles.trasnocheModernCol}>
                <Text style={styles.trasnocheModernVal} numberOfLines={1}>
                  {trasnocheStats.bestTheaterName}
                </Text>
                <Text style={styles.trasnocheModernLbl}>
                  Líder Nocturno ({trasnocheStats.bestTheaterPercent.toFixed(1)}%)
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Grid de Cines */}
      <Text style={styles.sectionTitle}>Seleccionar Cine</Text>
      
      {loadingTheaters ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando datos de ocupación de cines...</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {THEATERS.map((theater) => {
            const stats = computedTheaterStats[theater.id];
            const isSelected = selectedTheater?.id === theater.id;

            return (
              <TouchableOpacity
                key={theater.id}
                style={[
                  styles.theaterCard,
                  isSelected && styles.theaterCardSelected
                ]}
                onPress={() => handleSelectTheater(theater)}
                activeOpacity={0.7}
              >
                <View style={styles.theaterCardHeader}>
                  <View style={[
                    styles.theaterIconBg,
                    isSelected && styles.theaterIconBgSelected
                  ]}>
                    <MaterialCommunityIcons 
                      name="office-building" 
                      size={20} 
                      color={isSelected ? "#FFF" : COLORS.primary} 
                    />
                  </View>
                  <Text style={[
                    styles.theaterName,
                    isSelected && styles.theaterNameSelected
                  ]}>
                    {theater.name}
                  </Text>
                </View>

                {stats ? (
                  <View style={styles.theaterStatsBox}>
                    <View style={styles.theaterStatLabelRow}>
                      <Text style={styles.theaterStatLabel}>Ocupación</Text>
                      <Text style={styles.theaterStatValue}>{stats.occupancy.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.theaterMiniProgressBarBg}>
                      <View style={[
                        styles.theaterMiniProgressBarFill,
                        { 
                          width: `${Math.min(100, stats.occupancy)}%`,
                          backgroundColor: stats.occupancy > 60 ? COLORS.danger : stats.occupancy > 25 ? COLORS.success : COLORS.info 
                        }
                      ]} />
                    </View>
                    <Text style={styles.theaterFooterText}>
                      {stats.totalTickets} tickets • {stats.sessionsCount} funciones
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Sin programación registrada</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Detalle del Cine Seleccionado */}
      {selectedTheater && (
        <View style={styles.detailSection}>
          <View style={styles.detailHeader}>
            <View style={styles.detailHeaderTitleRow}>
              <MaterialCommunityIcons name="television-play" size={24} color={COLORS.primary} />
              <Text style={styles.detailTitle}>{selectedTheater.name}</Text>
            </View>
            
            {/* Toggle de Vista (Lista vs Grilla) */}
            <TouchableOpacity
              onPress={() => setViewMode(prev => prev === "grid" ? "list" : "grid")}
              style={styles.toggleViewButton}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={viewMode === "grid" ? "view-list" : "view-grid"}
                size={16}
                color={COLORS.text}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.toggleViewButtonText}>
                {viewMode === "grid" ? "Modo Lista" : "Modo Grilla"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Selector de Días centrado */}
          <View style={styles.daySelectorContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.centeredTabBar}
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

          {/* Buscador de Películas */}
          <View style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.muted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por película o sala..."
              placeholderTextColor={COLORS.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Renderizado Condicional: List View vs Grid View */}
          {loadingDetails ? (
            <View style={styles.centerLoadingDetail}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Cargando cartelera detallada...</Text>
            </View>
          ) : filteredSessions.length > 0 ? (
            viewMode === "grid" ? (
              /* MODO CUADRÍCULA / GRID DE SALAS */
              <View style={styles.gridRoomsContainer}>
                {roomsList.map((salaNum) => {
                  const sessionsInSala = filteredSessions.filter(s => s.theaterRoom === salaNum);
                  if (sessionsInSala.length === 0) return null;

                  return (
                    <View key={salaNum} style={styles.gridRoomRow}>
                      <View style={styles.gridRoomLabelCell}>
                        <Text style={styles.gridRoomLabelText}>Sala</Text>
                        <Text style={styles.gridRoomNumberText}>{salaNum}</Text>
                      </View>
                      <ScrollView
                        ref={(ref) => { roomScrollRefs.current[salaNum] = ref; }}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.gridRoomSessionsScroll}
                        onScroll={(e) => handleRoomScroll(e, salaNum)}
                        scrollEventThrottle={16}
                      >
                        {sessionsInSala.map((session) => {
                          let sold = session.soldSeats || session.occupiedSeats?.length || 0;
                          if (!sold && session.occupation) {
                            sold = Math.max(0, session.occupation.capacity - session.occupation.availableSeats);
                          }
                          const capacity = session.occupation?.capacity || 200;
                          const occupancyPercent = capacity > 0 ? (sold / capacity) * 100 : 0;
                          const movieAccentColor = getMovieColor(session.movieName);
                          const time = session.sessionDateTime ? session.sessionDateTime.substring(11, 16) : "";
                          const format = session.sessionFormat || (session.formats && session.formats[0]?.name) || "";
                          const isTrasnoche = isTrasnocheSession(time);
                          
                          let progressColor = COLORS.danger; // > 60%
                          if (occupancyPercent < 25) progressColor = COLORS.info; // < 25% (baja)
                          else if (occupancyPercent < 60) progressColor = COLORS.success; // 25-60% (media)

                          return (
                            <View key={session.sessionId} style={[styles.gridSessionCard, { borderTopColor: movieAccentColor }]}>
                              <View style={styles.gridSessionHeaderRow}>
                                <Text style={styles.gridSessionTime}>{time} hs</Text>
                                {isTrasnoche && (
                                  <MaterialCommunityIcons name="weather-night" size={10} color="#F59E0B" />
                                )}
                              </View>
                              <Text style={styles.gridSessionMovie} numberOfLines={1}>
                                {session.movieName}
                              </Text>
                              <Text style={styles.gridSessionFormat}>{format}</Text>
                              <View style={styles.gridSessionOccupancyBox}>
                                <Text style={styles.gridSessionOccupancyText}>
                                  {sold}/{capacity} tix
                                </Text>
                                <Text style={[styles.gridSessionPercentText, { color: progressColor }]}>
                                  {occupancyPercent.toFixed(0)}%
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}
              </View>
            ) : (
              /* MODO LISTA TRADICIONAL */
              <View style={styles.sessionsList}>
                {filteredSessions.map((session) => (
                  <React.Fragment key={`${session.sessionId}_${session.theaterRoom}`}>
                    {renderSessionItem({ item: session })}
                  </React.Fragment>
                ))}
              </View>
            )
          ) : (
            <View style={styles.noSessionsBox}>
              <MaterialCommunityIcons name="movie-filter-outline" size={40} color={COLORS.muted} />
              <Text style={styles.noSessionsText}>
                No hay funciones programadas para este día
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  contentContainer: {
    padding: THEME.spacing.lg,
    paddingBottom: THEME.spacing.xxl + 20,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: THEME.spacing.xl,
    paddingBottom: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: THEME.spacing.md,
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "bold",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    ...THEME.shadow.soft,
  },
  kpiValue: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginVertical: THEME.spacing.xs,
  },
  kpiLabel: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: THEME.spacing.md,
  },
  centerLoading: {
    padding: THEME.spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLoadingDetail: {
    padding: THEME.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginTop: THEME.spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.xxl,
  },
  theaterCard: {
    width: Platform.OS === "web" ? ("calc(25% - 12px)" as any) : ("calc(33.3% - 11px)" as any),
    minWidth: 160,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "space-between",
    ...THEME.shadow.soft,
  },
  theaterCardSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  theaterCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: THEME.spacing.sm,
  },
  theaterIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: THEME.spacing.sm,
  },
  theaterIconBgSelected: {
    backgroundColor: COLORS.primary,
  },
  theaterName: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  theaterNameSelected: {
    color: COLORS.primary,
  },
  theaterStatsBox: {
    marginTop: THEME.spacing.xs,
  },
  theaterStatLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  theaterStatLabel: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
  },
  theaterStatValue: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "bold",
    color: COLORS.text,
  },
  theaterMiniProgressBarBg: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  theaterMiniProgressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  theaterFooterText: {
    fontSize: 10,
    color: COLORS.muted,
  },
  noDataText: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
    fontStyle: "italic",
  },
  detailSection: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: THEME.spacing.md,
    paddingBottom: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
  },
  detailTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "bold",
    color: COLORS.text,
  },
  singleWeekSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    gap: 16,
    marginBottom: THEME.spacing.lg,
  },
  singleWeekLabelContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.bgMobile,
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
  arrowButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  arrowButtonDisabled: {
    opacity: 0.4,
  },
  daySelectorContainer: {
    marginBottom: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
  },
  centeredTabBarWrapper: {
    width: "100%",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  centeredTabBar: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.radius.full,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.lg,
  },
  searchIcon: {
    marginRight: THEME.spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: COLORS.text,
    fontSize: THEME.fontSize.sm,
  },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 5,
    marginBottom: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      },
    }),
  },
  listRoomBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primarySoft,
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
  sessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  sessionMetaLabel: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
  },
  sessionMetaDivider: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
  },
  sessionTimeCol: {
    justifyContent: "center",
    alignItems: "flex-end",
    paddingLeft: THEME.spacing.md,
  },
  sessionTimeText: {
    fontSize: THEME.fontSize.md,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  occupancyBarContainer: {
    marginTop: THEME.spacing.xs,
  },
  occupancyLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  occupancyTickets: {
    fontSize: 11,
    color: COLORS.textSoft,
  },
  occupancyPercentText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  noSessionsBox: {
    padding: THEME.spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  noSessionsText: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginTop: THEME.spacing.sm,
    textAlign: "center",
  },
  sessionsList: {
    gap: THEME.spacing.sm,
  },
  statsModeToggleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    gap: 8,
    marginBottom: THEME.spacing.md,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: THEME.radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  toggleBtnTextActive: {
    color: "#FFFFFF",
  },
  statsDaySelectorContainer: {
    marginBottom: THEME.spacing.lg,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.md,
  },
  statsDaySelectorLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSoft,
    marginBottom: 8,
    textAlign: "center",
  },
  trasnocheStatsContainer: {
    backgroundColor: COLORS.warningBg,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
    ...THEME.shadow.soft,
  },
  trasnocheStatsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBorder,
    paddingBottom: 8,
  },
  trasnocheStatsTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.warning,
  },
  trasnocheStatsBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trasnocheStatCol: {
    flex: 1,
    alignItems: "center",
  },
  trasnocheStatValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.warning,
  },
  trasnocheStatLabel: {
    fontSize: 10,
    color: COLORS.textSoft,
    marginTop: 2,
    textAlign: "center",
  },
  trasnocheBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    gap: 2,
  },
  trasnocheBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.warning,
  },
  toggleViewButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toggleViewButtonText: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.text,
  },
  gridRoomsContainer: {
    gap: THEME.spacing.sm,
  },
  gridRoomRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    overflow: "hidden",
  },
  gridRoomLabelCell: {
    width: 60,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingRight: 6,
    marginRight: 6,
  },
  gridRoomLabelText: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  gridRoomNumberText: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
    lineHeight: 22,
  },
  gridRoomSessionsScroll: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingRight: 12,
  },
  gridSessionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 4,
    padding: 6,
    width: 120,
    justifyContent: "center",
  },
  gridSessionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gridSessionTime: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  gridSessionMovie: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
    marginVertical: 2,
  },
  gridSessionFormat: {
    fontSize: 8,
    color: COLORS.muted,
  },
  gridSessionOccupancyBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  gridSessionOccupancyText: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "600",
  },
  gridSessionPercentText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  // ─── Modern Company Intelligence Styles ─────────────────────
  companyStatsModernContainer: {
    marginBottom: THEME.spacing.xl,
  },
  companyStatsHeaderRow: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  companyHeaderBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  companyHeaderBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.primary,
    marginLeft: 5,
    letterSpacing: 0.5,
  },
  companyStatsMainTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.text,
  },
  companyStatsMainSubtitle: {
    fontSize: 12,
    color: COLORS.textSoft,
    marginTop: 2,
  },
  companyKpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  companyKpiCard: {
    flex: 1,
    minWidth: 155,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 3,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
      default: { elevation: 2 },
    }),
  },
  companyKpiTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  companyKpiIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  companyKpiTag: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  companyKpiTagText: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  companyKpiNumber: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  companyKpiNumberText: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.text,
    marginVertical: 2,
  },
  companyKpiLabel: {
    fontSize: 11,
    color: COLORS.textSoft,
    fontWeight: "600",
    marginTop: 2,
  },
  companyKpiDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  companyKpiFooter: {
    fontSize: 10.5,
    color: COLORS.textSoft,
  },
  companyRecordBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderLeftWidth: 5,
    borderLeftColor: "#EF4444",
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(239, 68, 68, 0.08)" },
      default: { elevation: 2 },
    }),
  },
  companyRecordFlameCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  companyRecordBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  companyRecordBadgeLabel: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#EF4444",
    letterSpacing: 0.5,
  },
  companyRecordPill: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  companyRecordPillText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  companyRecordMovie: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.text,
  },
  companyRecordDetails: {
    fontSize: 11,
    color: COLORS.textSoft,
    marginTop: 2,
  },
  companyRecordNumbers: {
    alignItems: "flex-end",
    marginLeft: 10,
  },
  companyRecordTicketsSold: {
    fontSize: 20,
    fontWeight: "900",
    color: "#EF4444",
  },
  companyRecordTicketsCap: {
    fontSize: 10,
    color: COLORS.textSoft,
  },
  companySubTabsContainer: {
    marginBottom: 16,
  },
  companySubTabsScroll: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  companySubTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  companySubTabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...Platform.select({
      web: { boxShadow: "0 2px 6px rgba(137, 4, 4, 0.25)" },
      default: { elevation: 2 },
    }),
  },
  companySubTabBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSoft,
  },
  companySubTabBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  companyAnalyticsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.03)" },
      default: { elevation: 1 },
    }),
  },
  companyAnalyticsCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  companyAnalyticsCardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.text,
  },
  sorterContainer: {
    flexDirection: "row",
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderRadius: 6,
    padding: 2,
  },
  sortBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sortBtnActive: {
    backgroundColor: COLORS.card,
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
      default: { elevation: 1 },
    }),
  },
  sortBtnText: {
    fontSize: 11,
    color: COLORS.textSoft,
    fontWeight: "600",
  },
  sortBtnTextActive: {
    color: COLORS.text,
    fontWeight: "bold",
  },
  leaderboardList: {
    gap: 8,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F8FAFC)" : "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
  },
  leaderboardRowTop3: {
    borderColor: "rgba(234, 179, 8, 0.3)",
  },
  leaderboardRowSelected: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    backgroundColor: "rgba(137, 4, 4, 0.02)",
  },
  leaderboardRankIcon: {
    fontSize: 16,
    width: 26,
    textAlign: "center",
  },
  leaderboardIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #E2E8F0)" : "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  leaderboardTheaterName: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.text,
  },
  leaderboardTicketsText: {
    fontSize: 12.5,
    fontWeight: "bold",
    color: COLORS.text,
  },
  leaderboardShareText: {
    fontSize: 10.5,
    color: COLORS.textSoft,
  },
  leaderboardBarBg: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  leaderboardBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  leaderboardSubDetail: {
    fontSize: 9.5,
    color: COLORS.textSoft,
  },
  leaderboardOccText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  topMoviesList: {
    gap: 12,
  },
  topMovieRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topMovieRank: {
    fontSize: 16,
    width: 24,
    textAlign: "center",
  },
  topMovieInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  topMovieTitle: {
    fontSize: 12.5,
    fontWeight: "bold",
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  topMovieTickets: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.text,
  },
  topMovieShare: {
    fontSize: 10.5,
    color: COLORS.textSoft,
  },
  topMovieBarBg: {
    height: 7,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  topMovieBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  topMovieFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 3,
  },
  topMovieFooterText: {
    fontSize: 9.5,
    color: COLORS.textSoft,
  },
  topMovie3DChip: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  topMovie3DChipText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#7C3AED",
  },
  companyShiftsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  companyShiftCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F8FAFC)" : "#F8FAFC",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  companyShiftHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  companyShiftTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.text,
  },
  companyShiftSub: {
    fontSize: 10,
    color: COLORS.textSoft,
    marginBottom: 6,
  },
  companyShiftSold: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 6,
  },
  companyShiftBarBg: {
    height: 5,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  companyShiftBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  companyShiftFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  companyShiftFooterText: {
    fontSize: 9.5,
    color: COLORS.textSoft,
  },
  companyShiftOcc: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: "#059669",
  },
  companyDaysTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.text,
  },
  companyWeekendBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  companyWeekendBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#047857",
  },
  companyDaysList: {
    gap: 8,
  },
  companyDayRow: {
    width: "100%",
  },
  companyDayInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  companyDayName: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.text,
  },
  companyDayTickets: {
    fontSize: 11.5,
    fontWeight: "bold",
    color: COLORS.textSoft,
  },
  companyDayBarBg: {
    height: 7,
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  companyDayBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  trasnocheModernCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: "0 4px 16px rgba(0,0,0,0.15)" },
      default: { elevation: 3 },
    }),
  },
  trasnocheModernHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  trasnocheMoonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  trasnocheModernTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#F8FAFC",
  },
  trasnocheModernSubtitle: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  trasnocheModernStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trasnocheModernCol: {
    flex: 1,
    alignItems: "center",
  },
  trasnocheModernVal: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#F59E0B",
  },
  trasnocheModernLbl: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "center",
  },
});

import React, { useEffect, useState, useMemo } from "react";
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
  
  // Toggles de Modo de Estadísticas (semanal o diaria)
  const [statsMode, setStatsMode] = useState<"weekly" | "daily">("weekly");
  const [statsDay, setStatsDay] = useState<string>(() => getCurrentWeekdayKey());

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
    const sold = item.soldSeats || item.occupiedSeats?.length || 0;
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
      {/* Cabecera */}
      <View style={styles.header}>
        <View style={styles.headerIconCircle}>
          <MaterialCommunityIcons name="office-building" size={28} color={COLORS.primary} />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>Panel de Compañía</Text>
          <Text style={styles.subtitle}>
            Estadísticas y programaciones de cines de Cinemark & Hoyts
          </Text>
        </View>
      </View>

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
          <View style={styles.centeredTabBarWrapper}>
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
        </View>
      )}

      {/* KPIs Globales */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="ticket-percent-outline" size={24} color={COLORS.info} />
          <Text style={styles.kpiValue}>
            {loadingTheaters ? "-" : `${globalKpis.totalSold.toLocaleString("es-AR")}`}
          </Text>
          <Text style={styles.kpiLabel}>
            Tickets {statsMode === "daily" ? "Diarios" : "Semanales"} Vendidos
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="chart-donut" size={24} color={COLORS.success} />
          <Text style={styles.kpiValue}>
            {loadingTheaters ? "-" : `${globalKpis.avgOccupancy.toFixed(1)}%`}
          </Text>
          <Text style={styles.kpiLabel}>Ocupación Promedio Gral.</Text>
        </View>

        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="trophy-outline" size={24} color={COLORS.warning} />
          <Text style={styles.kpiValue} numberOfLines={1}>
            {loadingTheaters ? "-" : globalKpis.leaderName}
          </Text>
          <Text style={styles.kpiLabel}>
            Cine Líder ({globalKpis.leaderPercent.toFixed(1)}%)
          </Text>
        </View>
      </View>

      {/* Sección Especial Trasnoche */}
      {trasnocheStats.hasTrasnocheData && (
        <View style={styles.trasnocheStatsContainer}>
          <View style={styles.trasnocheStatsHeader}>
            <MaterialCommunityIcons name="weather-night" size={18} color={COLORS.warning} />
            <Text style={styles.trasnocheStatsTitle}>
              {statsMode === "daily"
                ? `Especial Trasnoche 🌙 (Diario - ${DAYS_OF_WEEK.find(d => d.key === statsDay)?.label || ""})`
                : "Especial Trasnoche 🌙 (Semanal)"}
            </Text>
          </View>
          <View style={styles.trasnocheStatsBody}>
            <View style={styles.trasnocheStatCol}>
              <Text style={styles.trasnocheStatValue}>
                {trasnocheStats.totalSold.toLocaleString("es-AR")}
              </Text>
              <Text style={styles.trasnocheStatLabel}>Tickets Trasnoche</Text>
            </View>
            <View style={styles.trasnocheStatCol}>
              <Text style={styles.trasnocheStatValue}>
                {trasnocheStats.avgOccupancy.toFixed(1)}%
              </Text>
              <Text style={styles.trasnocheStatLabel}>Ocupación Promedio</Text>
            </View>
            <View style={styles.trasnocheStatCol}>
              <Text style={styles.trasnocheStatValue}>
                {trasnocheStats.bestTheaterName}
              </Text>
              <Text style={styles.trasnocheStatLabel}>
                Líder Trasnoche ({trasnocheStats.bestTheaterPercent.toFixed(1)}%)
              </Text>
            </View>
          </View>
        </View>
      )}

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
                      name={theater.icon as any} 
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
            <View style={styles.centeredTabBarWrapper}>
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
              <ActivityIndicator size="medium" color={COLORS.primary} />
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
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.gridRoomSessionsScroll}
                      >
                        {sessionsInSala.map((session) => {
                          const sold = session.soldSeats || session.occupiedSeats?.length || 0;
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
    width: Platform.OS === "web" ? "calc(25% - 12px)" : "calc(33.3% - 11px)",
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
    alignItems: "center",
    justifyContent: "center",
  },
  centeredTabBar: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    minWidth: "100%",
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
    fontSize: 8,
    color: COLORS.textSoft,
  },
  gridSessionPercentText: {
    fontSize: 8,
    fontWeight: "bold",
  },
});

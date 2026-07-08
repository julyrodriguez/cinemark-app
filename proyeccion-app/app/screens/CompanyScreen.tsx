import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
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

// Lista de cines trackeados por la compañía
const THEATERS = [
  { id: "2015", name: "Alto Avellaneda", icon: "movie-roll" },
  { id: "733", name: "Palermo", icon: "ticket-confirmation-outline" },
  { id: "730", name: "Puerto Madero", icon: "water-outline" },
  { id: "734", name: "Caballito", icon: "chess-knight" },
  { id: "2016", name: "Parque Brown", icon: "tree-outline" },
  { id: "748", name: "San Justo", icon: "compass-outline" },
  { id: "101", name: "Morón", icon: "shield-star-outline" },
  { id: "110", name: "Moreno", icon: "map-marker-radius-outline" }
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
  sessionId: number;
  movieId: string;
  movieName: string;
  sessionDateTime: string;
  sessionDisplayDate: string;
  sessionTime: string;
  theaterRoom: string;
  formatName: string;
  languageName: string;
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
  
  return `Semana del ${thurD}/${thurM} al ${wedD}/${wedM}`;
}

// Obtener la clave del día según la fecha y hora de la función (zona horaria de Argentina y día operativo que empieza a las 6 AM)
function getSessionDayKey(sessionDateTimeStr: string): string {
  const date = new Date(sessionDateTimeStr);
  // Ajuste aproximado a Argentina (UTC-3)
  const arDate = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  
  // Si es antes de las 6:00 AM, seguimos en el día operativo anterior
  if (arDate.getUTCHours() < 6) {
    arDate.setTime(arDate.getTime() - 24 * 60 * 60 * 1000);
  }
  
  const dayNum = arDate.getUTCDay(); // 0 = Domingo, 1 = Lunes, etc.
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

export default function CompanyScreen() {
  const [loadingTheaters, setLoadingTheaters] = useState(true);
  const [selectedTheater, setSelectedTheater] = useState<typeof THEATERS[0] | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("jueves");
  
  // Datos de ocupación consolidados para las tarjetas del grid (semana actual de cada cine)
  const [theaterStats, setTheaterStats] = useState<Record<string, {
    occupancy: number;
    totalTickets: number;
    totalCapacity: number;
    sessionsCount: number;
    weekStart: string;
  }>>({});

  // Detalle del cine seleccionado
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [showtimesData, setShowtimesData] = useState<TheaterShowtimes | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Cargar estadísticas iniciales para todos los cines (semana más reciente)
  const loadInitialStats = async () => {
    setLoadingTheaters(true);
    const stats: typeof theaterStats = {};
    
    for (const theater of THEATERS) {
      try {
        const weeks: string[] = await fetchFromApi(`/company/weeks/${theater.id}`);
        if (weeks && weeks.length > 0) {
          const sortedWeeks = [...weeks].sort((a, b) => b.localeCompare(a));
          const latestWeek = sortedWeeks[0];

          const data: TheaterShowtimes = await fetchFromApi(`/company/showtimes/${theater.id}/${latestWeek}`);
          if (data && data.sessions) {
            let totalSold = 0;
            let totalCap = 0;
            
            data.sessions.forEach(s => {
              const cap = s.occupation?.capacity || 200;
              const sold = s.soldSeats || s.occupiedSeats?.length || 0;
              totalSold += sold;
              totalCap += cap;
            });

            stats[theater.id] = {
              occupancy: totalCap > 0 ? (totalSold / totalCap) * 100 : 0,
              totalTickets: totalSold,
              totalCapacity: totalCap,
              sessionsCount: data.sessions.length,
              weekStart: latestWeek
            };
          }
        }
      } catch (err) {
        console.warn(`[CompanyScreen] No se pudieron cargar estadísticas para el cine ${theater.name}:`, err);
      }
    }
    
    setTheaterStats(stats);
    setLoadingTheaters(false);
  };

  useEffect(() => {
    loadInitialStats();
  }, []);

  // Al seleccionar un cine, cargar sus semanas y autodetectar el día actual
  const handleSelectTheater = async (theater: typeof THEATERS[0]) => {
    setSelectedTheater(theater);
    setLoadingDetails(true);
    setShowtimesData(null);
    setAvailableWeeks([]);
    setSelectedWeek("");
    setSearchQuery("");

    // Autodetectar día actual cinematográfico
    let now = new Date();
    const arHours = new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCHours();
    if (arHours < 6) {
      now = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    const dayNum = new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
    const map: Record<number, string> = {
      0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles",
      4: "jueves", 5: "viernes", 6: "sabado"
    };
    setSelectedDay(map[dayNum] || "jueves");

    try {
      const weeks: string[] = await fetchFromApi(`/company/weeks/${theater.id}`);
      if (weeks && weeks.length > 0) {
        const sortedWeeks = [...weeks].sort((a, b) => b.localeCompare(a));
        setAvailableWeeks(sortedWeeks);
        setSelectedWeek(sortedWeeks[0]);
      } else {
        setLoadingDetails(false);
      }
    } catch (err) {
      console.error("[CompanyScreen] Error al obtener semanas para el cine:", err);
      setLoadingDetails(false);
    }
  };

  // Al cambiar la semana seleccionada, cargar los showtimes
  useEffect(() => {
    if (!selectedTheater || !selectedWeek) return;

    const loadWeeklyShowtimes = async () => {
      setLoadingDetails(true);
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

  // KPIs Globales
  const globalKpis = useMemo(() => {
    let totalSold = 0;
    let totalCap = 0;
    let leaderName = "-";
    let leaderPercent = 0;

    Object.entries(theaterStats).forEach(([id, stat]) => {
      totalSold += stat.totalTickets;
      totalCap += stat.totalCapacity;

      if (stat.occupancy > leaderPercent) {
        leaderPercent = stat.occupancy;
        leaderName = THEATERS.find(t => t.id === id)?.name || "-";
      }
    });

    return {
      totalSold,
      avgOccupancy: totalCap > 0 ? (totalSold / totalCap) * 100 : 0,
      leaderName,
      leaderPercent
    };
  }, [theaterStats]);

  // Filtrar funciones detalladas por día de la semana y buscador
  const filteredSessions = useMemo(() => {
    if (!showtimesData?.sessions) return [];
    
    let list = showtimesData.sessions;

    // 1. Filtrar por el día operativo seleccionado
    list = list.filter(s => getSessionDayKey(s.sessionDateTime) === selectedDay);

    // 2. Filtrar por el buscador
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.movieName.toLowerCase().includes(query) ||
        s.theaterRoom.toLowerCase().includes(query)
      );
    }

    // Ordenar por hora de inicio
    return [...list].sort((a, b) => a.sessionTime.localeCompare(b.sessionTime));
  }, [showtimesData, selectedDay, searchQuery]);

  // Renderizar cada función (Estilo idéntico a la vista de Programación del cine)
  const renderSessionItem = ({ item }: { item: Session }) => {
    const sold = item.soldSeats || item.occupiedSeats?.length || 0;
    const capacity = item.occupation?.capacity || 200;
    const occupancyPercent = capacity > 0 ? (sold / capacity) * 100 : 0;
    const movieAccentColor = getMovieColor(item.movieName);

    let progressColor = COLORS.danger; // > 60%
    if (occupancyPercent < 25) progressColor = COLORS.info; // < 25% (baja)
    else if (occupancyPercent < 60) progressColor = COLORS.success; // 25-60% (media)

    return (
      <View style={[styles.listCard, { borderLeftColor: movieAccentColor }]}>
        {/* Badge de Sala (Estilo circular idéntico al original) */}
        <View style={styles.listRoomBadge}>
          <Text style={styles.listRoomBadgeText}>SALA</Text>
          <Text style={styles.listRoomNumberText}>{item.theaterRoom}</Text>
        </View>

        {/* Información de Película y Ocupación */}
        <View style={styles.listInfoContainer}>
          <Text style={styles.listMovieTitle}>{item.movieName}</Text>
          <View style={styles.sessionMetaRow}>
            <Text style={styles.sessionMetaLabel}>{item.formatName}</Text>
            <Text style={styles.sessionMetaDivider}>•</Text>
            <Text style={styles.sessionMetaLabel}>{item.languageName}</Text>
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
          <Text style={styles.sessionTimeText}>{item.sessionTime} hs</Text>
        </View>
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
            Estadísticas y programaciones de salas externas de Cinemark & Hoyts
          </Text>
        </View>
      </View>

      {/* KPIs Globales */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="ticket-percent-outline" size={24} color={COLORS.info} />
          <Text style={styles.kpiValue}>
            {loadingTheaters ? "-" : `${globalKpis.totalSold.toLocaleString("es-AR")}`}
          </Text>
          <Text style={styles.kpiLabel}>Tickets Semanales Vendidos</Text>
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
            const stats = theaterStats[theater.id];
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
                  <Text style={styles.noDataText}>Sin programación reciente</Text>
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

            {/* Selector de Semanas */}
            {availableWeeks.length > 0 && (
              <View style={styles.weekSelectorContainer}>
                <Text style={styles.weekLabel}>Semana:</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.weeksScroll}
                >
                  {availableWeeks.map(w => (
                    <TouchableOpacity
                      key={w}
                      style={[
                        styles.weekBtn,
                        selectedWeek === w && styles.weekBtnActive
                      ]}
                      onPress={() => setSelectedWeek(w)}
                    >
                      <Text style={[
                        styles.weekBtnText,
                        selectedWeek === w && styles.weekBtnTextActive
                      ]}>
                        {formatWeekRange(w)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Selector de Días (Thursday to Wednesday) */}
          {availableWeeks.length > 0 && (
            <View style={styles.daySelectorContainer}>
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
          )}

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

          {/* Listado de Funciones */}
          {loadingDetails ? (
            <View style={styles.centerLoadingDetail}>
              <ActivityIndicator size="medium" color={COLORS.primary} />
              <Text style={styles.loadingText}>Cargando cartelera detallada...</Text>
            </View>
          ) : filteredSessions.length > 0 ? (
            <FlatList
              data={filteredSessions}
              renderItem={renderSessionItem}
              keyExtractor={(item) => `${item.sessionId}_${item.theaterRoom}`}
              scrollEnabled={false}
              initialNumToRender={15}
            />
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
    width: Platform.OS === "web" ? "calc(25% - 12px)" : "calc(50% - 8px)",
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
    flexDirection: Platform.OS === "web" ? "row" : "column",
    justifyContent: "space-between",
    alignItems: Platform.OS === "web" ? "center" : "stretch",
    gap: THEME.spacing.md,
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
  weekSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
  },
  weekLabel: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  weeksScroll: {
    gap: THEME.spacing.xs,
  },
  weekBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  weekBtnActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  weekBtnText: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.textSoft,
  },
  weekBtnTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
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
});

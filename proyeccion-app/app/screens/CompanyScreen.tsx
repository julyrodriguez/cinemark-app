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

export default function CompanyScreen() {
  const [loadingTheaters, setLoadingTheaters] = useState(true);
  const [selectedTheater, setSelectedTheater] = useState<typeof THEATERS[0] | null>(null);
  
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
        // 1. Obtener las semanas disponibles
        const weeks: string[] = await fetchFromApi(`/company/weeks/${theater.id}`);
        if (weeks && weeks.length > 0) {
          // Ordenar para tomar la semana más reciente
          const sortedWeeks = [...weeks].sort((a, b) => b.localeCompare(a));
          const latestWeek = sortedWeeks[0];

          // 2. Obtener showtimes de esa semana
          const data: TheaterShowtimes = await fetchFromApi(`/company/showtimes/${theater.id}/${latestWeek}`);
          if (data && data.sessions) {
            let totalSold = 0;
            let totalCap = 0;
            
            data.sessions.forEach(s => {
              const cap = s.occupation?.capacity || 200; // fallback standard capacity
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

  // Al seleccionar un cine, cargar sus semanas disponibles
  const handleSelectTheater = async (theater: typeof THEATERS[0]) => {
    setSelectedTheater(theater);
    setLoadingDetails(true);
    setShowtimesData(null);
    setAvailableWeeks([]);
    setSelectedWeek("");
    setSearchQuery("");

    try {
      const weeks: string[] = await fetchFromApi(`/company/weeks/${theater.id}`);
      if (weeks && weeks.length > 0) {
        const sortedWeeks = [...weeks].sort((a, b) => b.localeCompare(a));
        setAvailableWeeks(sortedWeeks);
        setSelectedWeek(sortedWeeks[0]); // Seleccionar por defecto la última semana
      } else {
        setLoadingDetails(false);
      }
    } catch (err) {
      console.error("[CompanyScreen] Error al obtener semanas para el cine:", err);
      setLoadingDetails(false);
    }
  };

  // Al cambiar la semana seleccionada, cargar los showtimes detallados
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

  // KPIs Globales (Suma de los datos cargados de la semana más reciente)
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

  // Filtrar funciones detalladas por el buscador de películas
  const filteredSessions = useMemo(() => {
    if (!showtimesData?.sessions) return [];
    if (!searchQuery.trim()) return showtimesData.sessions;
    
    const query = searchQuery.toLowerCase().trim();
    return showtimesData.sessions.filter(s =>
      s.movieName.toLowerCase().includes(query) ||
      s.theaterRoom.toLowerCase().includes(query)
    );
  }, [showtimesData, searchQuery]);

  // Renderizar cada función individual en la lista detallada
  const renderSessionItem = ({ item }: { item: Session }) => {
    const sold = item.soldSeats || item.occupiedSeats?.length || 0;
    const capacity = item.occupation?.capacity || 200;
    const occupancyPercent = capacity > 0 ? (sold / capacity) * 100 : 0;

    // Colores dinámicos del porcentaje
    let progressColor = COLORS.danger; // > 60%
    if (occupancyPercent < 25) progressColor = COLORS.info; // < 25% (baja)
    else if (occupancyPercent < 60) progressColor = COLORS.success; // 25-60% (media)

    const dateFormatted = item.sessionDateTime
      ? new Date(item.sessionDateTime).toLocaleDateString("es-AR", {
          day: "numeric",
          month: "short",
          weekday: "short",
        })
      : item.sessionDisplayDate;

    return (
      <View style={styles.sessionCard}>
        <View style={styles.sessionRow}>
          <View style={styles.sessionInfoLeft}>
            <Text style={styles.sessionMovieName}>{item.movieName}</Text>
            <View style={styles.sessionMetaRow}>
              <Text style={styles.sessionMetaLabel}>{item.formatName}</Text>
              <Text style={styles.sessionMetaDivider}>•</Text>
              <Text style={styles.sessionMetaLabel}>Sala {item.theaterRoom}</Text>
              <Text style={styles.sessionMetaDivider}>•</Text>
              <Text style={styles.sessionMetaLabel}>{item.languageName}</Text>
            </View>
          </View>
          
          <View style={styles.sessionTimeCol}>
            <Text style={styles.sessionTimeText}>{item.sessionTime} hs</Text>
            <Text style={styles.sessionDateText}>{dateFormatted}</Text>
          </View>
        </View>

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
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Cabecera de la Sección */}
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

      {/* Tarjetas KPI Globales */}
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

      {/* Drilldown Detalle del Cine Seleccionado */}
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
                        {w}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
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
              scrollEnabled={false} // Ya estamos dentro de un ScrollView
              initialNumToRender={10}
            />
          ) : (
            <View style={styles.noSessionsBox}>
              <MaterialCommunityIcons name="movie-filter-outline" size={40} color={COLORS.muted} />
              <Text style={styles.noSessionsText}>
                No se encontraron funciones para esta selección
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
    marginBottom: THEME.spacing.lg,
    paddingBottom: THEME.spacing.md,
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
  sessionCard: {
    backgroundColor: COLORS.bgMobile,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionInfoLeft: {
    flex: 1,
    paddingRight: THEME.spacing.md,
  },
  sessionMovieName: {
    fontSize: THEME.fontSize.md,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 4,
  },
  sessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    alignItems: "flex-end",
  },
  sessionTimeText: {
    fontSize: THEME.fontSize.md,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  sessionDateText: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
    marginTop: 2,
  },
  occupancyBarContainer: {
    marginTop: THEME.spacing.md,
  },
  occupancyLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: THEME.spacing.xs,
  },
  occupancyTickets: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.textSoft,
  },
  occupancyPercentText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "bold",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
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

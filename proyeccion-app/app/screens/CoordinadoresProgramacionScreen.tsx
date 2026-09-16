// app/screens/CoordinadoresProgramacionScreen.tsx

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import dayjs from "dayjs";

import {
  collection,
  doc,
  onSnapshot,
} from "@/lib/dbService";
import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { useAuthUser } from "../../lib/useAuthUser";
import { useAppLayout } from "../../lib/useAppLayout";
import { COLORS, THEME } from "../../lib/theme";
import { buildDailyProgramming } from "../../lib/programacion/excel";
import {
  DailyShow,
  WeekdayKey,
  WEEKDAY_LABELS,
  WeeklyMovieRow,
} from "../../lib/programacion/types";

// Días de la semana cinematográfica
const DAYS: WeekdayKey[] = [
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "lunes",
  "martes",
  "miercoles",
];

const DAY_OFFSETS: Record<WeekdayKey, number> = {
  jueves: 0,
  viernes: 1,
  sabado: 2,
  domingo: 3,
  lunes: 4,
  martes: 5,
  miercoles: 6,
};

const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
  jueves: "JUE",
  viernes: "VIE",
  sabado: "SÁB",
  domingo: "DOM",
  lunes: "LUN",
  martes: "MAR",
  miercoles: "MIÉ",
};

const MONTH_LABELS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function buildDateLabel(startDate: Date | null, day: WeekdayKey): string {
  if (!startDate || isNaN(startDate.getTime())) {
    return `${WEEKDAY_LABELS[day].toUpperCase()} (SEMANA ACTUAL)`;
  }
  const offset = DAY_OFFSETS[day] ?? 0;
  const target = new Date(startDate);
  target.setDate(startDate.getDate() + offset);

  const dayName = WEEKDAY_LABELS[day].toUpperCase();
  const dayNum = target.getDate();
  const monthName = MONTH_LABELS_ES[target.getMonth()].toUpperCase();
  const yearNum = target.getFullYear();

  return `${dayName} ${dayNum} DE ${monthName} DE ${yearNum}`;
}

function buildShortDate(startDate: Date | null, day: WeekdayKey): string {
  if (!startDate || isNaN(startDate.getTime())) return "";
  const offset = DAY_OFFSETS[day] ?? 0;
  const target = new Date(startDate);
  target.setDate(startDate.getDate() + offset);
  const dd = String(target.getDate()).padStart(2, "0");
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function getCinematicWeekdayKey(date: Date = new Date()): WeekdayKey {
  const adjusted = new Date(date);
  if (adjusted.getHours() < 6) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  const jsDay = adjusted.getDay();
  switch (jsDay) {
    case 4: return "jueves";
    case 5: return "viernes";
    case 6: return "sabado";
    case 0: return "domingo";
    case 1: return "lunes";
    case 2: return "martes";
    case 3: return "miercoles";
    default: return "jueves";
  }
}

function getMovieWeekStart(baseDate: Date = new Date()): string {
  const current = new Date(baseDate);
  if (current.getHours() < 6) {
    current.setDate(current.getDate() - 1);
  }
  const dayOfWeek = current.getDay();
  const daysSinceThursday = (dayOfWeek - 4 + 7) % 7;
  const thursday = new Date(current);
  thursday.setDate(current.getDate() - daysSinceThursday);
  const y = thursday.getFullYear();
  const m = String(thursday.getMonth() + 1).padStart(2, "0");
  const d = String(thursday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildEventWeeklyRows(eventos: any[], weekStartStr: string): WeeklyMovieRow[] {
  if (!eventos || eventos.length === 0 || !weekStartStr) return [];
  const [sy, sm, sd] = weekStartStr.split("-").map(Number);
  const thursday = new Date(sy, sm - 1, sd, 6, 0, 0);
  const nextThursday = new Date(thursday);
  nextThursday.setDate(nextThursday.getDate() + 7);

  const rowsMap: Record<string, WeeklyMovieRow> = {};

  eventos.forEach((ev) => {
    let eventDate: Date | null = null;
    if (ev.fechaInicio) {
      eventDate = new Date(ev.fechaInicio);
    } else if (ev.fecha) {
      eventDate = new Date(ev.fecha);
    }
    if (!eventDate || isNaN(eventDate.getTime())) return;
    if (eventDate < thursday || eventDate >= nextThursday) return;

    const eventDayKey = getCinematicWeekdayKey(eventDate);
    const salaNum = Number(ev.sala || ev.numeroSala || 1);
    const movieTitle = (ev.nombre || ev.titulo || "EVENTO").toUpperCase();
    const calif = ev.calificacion || "ATP";
    const horaIni = ev.horaInicio || ev.inicio || "00:00";
    const horaFn = ev.horaFin || ev.fin || "00:00";
    const horarioStr = `${horaIni}-${horaFn}`;

    const key = `evento-${salaNum}-${movieTitle}`;
    if (!rowsMap[key]) {
      rowsMap[key] = {
        sala: salaNum,
        pelicula: `[EV] ${movieTitle}`,
        calificacion: calif,
        horariosPorDia: {
          jueves: [],
          viernes: [],
          sabado: [],
          domingo: [],
          lunes: [],
          martes: [],
          miercoles: [],
        },
      };
    }
    if (!rowsMap[key].horariosPorDia[eventDayKey].includes(horarioStr)) {
      rowsMap[key].horariosPorDia[eventDayKey].push(horarioStr);
    }
  });

  return Object.values(rowsMap);
}

function isRestrictedRating(rating: string): boolean {
  if (!rating) return false;
  const r = rating.toUpperCase().trim();
  return (
    r.includes("+13") ||
    r.includes("+16") ||
    r.includes("+18") ||
    r.includes("R-13") ||
    r.includes("R-17") ||
    r.includes("R") ||
    r.includes("C") ||
    r.includes("SAM13") ||
    r.includes("SAM16") ||
    r.includes("SAM18") ||
    r.includes("P-13") ||
    r.includes("P-16") ||
    r.includes("P-18")
  );
}

export default function CoordinadoresProgramacionScreen() {
  const { cineId } = useAuthUser();
  const { isMobile, isWeb, width } = useAppLayout();

  // Día seleccionado (default al día cinematográfico actual)
  const [selectedDay, setSelectedDay] = useState<WeekdayKey>(() => getCinematicWeekdayKey());

  // Reporte guardado en Firestore (programacion_semanal/actual)
  const [savedWeekly, setSavedWeekly] = useState<{
    startDate: string;
    savedAt: string;
    weeklyRows: WeeklyMovieRow[];
  } | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState(true);

  // Créditos desde Firebase (activados por defecto según solicitado)
  const [creditosList, setCreditosList] = useState<any[]>([]);
  const [includeCreditos, setIncludeCreditos] = useState(true);

  // Eventos especiales
  const [eventos, setEventos] = useState<any[]>([]);

  // Filtro de búsqueda rápida en pantalla
  const [filtroTexto, setFiltroTexto] = useState("");

  // ── MODO VISTA RESUMIDA MOBILE & CONTROL DE COLUMNAS ─────────────────────
  const [vistaResumida, setVistaResumida] = useState<boolean>(() => isMobile);

  // Toggles de personalización de columnas
  const [colPelicula, setColPelicula] = useState<boolean>(true);
  const [colCalif, setColCalif] = useState<boolean>(true);
  const [colCreditos, setColCreditos] = useState<boolean>(true);
  const [modoSeccion, setModoSeccion] = useState<"AMBAS" | "ENTRADAS" | "SALIDAS">("AMBAS");
  // Foco de seguimiento actual/próximo ("ENTRADA" o "SALIDA")
  const [focoHorario, setFocoHorario] = useState<"ENTRADA" | "SALIDA">("ENTRADA");

  // ── AUTO-SCROLL AL INGRESO PRÓXIMO / ACTUAL ──────────────────────────────
  const mainScrollRef = useRef<ScrollView>(null);
  const rowOffsetsRef = useRef<Record<number, number>>({});
  const tableContainerYRef = useRef<number>(0);
  const hasAutoScrolledRef = useRef<boolean>(false);

  // Minutos cinematográficos actuales (actualizados cada 30 segundos)
  const [currentMinutes, setCurrentMinutes] = useState<number>(() => {
    const now = dayjs();
    const m = now.hour() * 60 + now.minute();
    return m < 360 ? m + 24 * 60 : m;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = dayjs();
      const m = now.hour() * 60 + now.minute();
      setCurrentMinutes(m < 360 ? m + 24 * 60 : m);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── 1. Cargar programación semanal guardada en Firebase ───────────────────
  useEffect(() => {
    if (!cineId) return;

    setLoadingWeekly(true);
    const docRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", "actual");

    const unsub = onSnapshot(
      docRef,
      (snap: any) => {
        if (snap.exists()) {
          const data = snap.data();
          setSavedWeekly({
            startDate: data.startDate,
            savedAt: data.savedAt,
            weeklyRows: data.weeklyRows || [],
          });
        } else {
          setSavedWeekly(null);
        }
        setLoadingWeekly(false);
      },
      (err: any) => {
        console.error("[CoordinadoresProg] Error cargando programación semanal:", err);
        setLoadingWeekly(false);
      }
    );

    return () => unsub();
  }, [cineId]);

  // ── 2. Cargar lista de créditos en tiempo real ───────────────────────────
  useEffect(() => {
    if (!cineId) return;

    const ref = collection(db, CINES_COLLECTION, cineId, "creditos");
    const unsub = onSnapshot(
      ref,
      (snapshot: any) => {
        const list: any[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setCreditosList(list);
      },
      (error: any) => {
        console.error("[CoordinadoresProg] Error cargando creditos:", error);
      }
    );

    return () => unsub();
  }, [cineId]);

  // ── 3. Cargar eventos especiales en tiempo real ──────────────────────────
  useEffect(() => {
    if (!cineId) return;

    const ref = collection(db, CINES_COLLECTION, cineId, "eventos");
    const unsub = onSnapshot(
      ref,
      (snapshot: any) => {
        const list: any[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setEventos(list);
      },
      (error: any) => {
        console.error("[CoordinadoresProg] Error cargando eventos:", error);
      }
    );

    return () => unsub();
  }, [cineId]);

  // ── 4. Fecha base de la semana ───────────────────────────────────────────
  const weekStartStr = useMemo(() => {
    if (savedWeekly?.startDate) return savedWeekly.startDate;
    return getMovieWeekStart(new Date());
  }, [savedWeekly]);

  const startDateObj = useMemo(() => {
    if (!weekStartStr) return null;
    const [y, m, d] = weekStartStr.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, [weekStartStr]);

  const dateLabelCompleto = useMemo(() => {
    return buildDateLabel(startDateObj, selectedDay);
  }, [startDateObj, selectedDay]);

  // ── 5. Filas guardadas en Firebase ───────────────────────────────────────
  const weeklyRowsToUse = useMemo(() => {
    return savedWeekly?.weeklyRows || [];
  }, [savedWeekly]);

  // ── 6. Generar estructura del día para la vista diaria ───────────────────
  const dailyData = useMemo(() => {
    if (weeklyRowsToUse.length === 0) {
      return {
        dateLabel: dateLabelCompleto,
        entrada: [],
        salida: [],
        maxRows: 0,
        cambioSalaKeys: new Set<string>(),
      };
    }
    const eventRows = buildEventWeeklyRows(eventos, weekStartStr);
    return buildDailyProgramming(
      [...weeklyRowsToUse, ...eventRows],
      selectedDay,
      dateLabelCompleto,
      creditosList,
      includeCreditos
    );
  }, [weeklyRowsToUse, eventos, weekStartStr, selectedDay, dateLabelCompleto, creditosList, includeCreditos]);

  // ── 7. Filtrar filas en la vista si hay búsqueda ─────────────────────────
  const entradaFiltrada = useMemo(() => {
    if (!filtroTexto.trim()) return dailyData.entrada;
    const q = filtroTexto.trim().toLowerCase();
    return dailyData.entrada.filter(
      (s) =>
        s.pelicula.toLowerCase().includes(q) ||
        String(s.sala).includes(q) ||
        s.inicio.includes(q)
    );
  }, [dailyData.entrada, filtroTexto]);

  const salidaFiltrada = useMemo(() => {
    if (!filtroTexto.trim()) return dailyData.salida;
    const q = filtroTexto.trim().toLowerCase();
    return dailyData.salida.filter(
      (s) =>
        s.pelicula.toLowerCase().includes(q) ||
        String(s.sala).includes(q) ||
        s.fin.includes(q) ||
        (s.creditosHoraReloj && s.creditosHoraReloj.includes(q))
    );
  }, [dailyData.salida, filtroTexto]);

  // Cantidad máxima de filas para aparear la tabla lado a lado
  const maxRows = Math.max(entradaFiltrada.length, salidaFiltrada.length);

  // ── 8. Determinar ingreso/egreso objetivo (el que está por suceder o en curso) ───
  const isToday = selectedDay === getCinematicWeekdayKey();

  const targetEntradaIdx = useMemo(() => {
    if (!isToday || entradaFiltrada.length === 0) return -1;
    const found = entradaFiltrada.findIndex((s) => s.sortInicio >= currentMinutes - 15);
    return found !== -1 ? found : entradaFiltrada.length - 1;
  }, [isToday, entradaFiltrada, currentMinutes]);

  const targetSalidaIdx = useMemo(() => {
    if (!isToday || salidaFiltrada.length === 0) return -1;
    const found = salidaFiltrada.findIndex((s) => s.sortFin >= currentMinutes - 10);
    return found !== -1 ? found : salidaFiltrada.length - 1;
  }, [isToday, salidaFiltrada, currentMinutes]);

  const targetIdx = useMemo(() => {
    if (!isToday) return -1;
    if (modoSeccion === "SALIDAS" || focoHorario === "SALIDA") {
      return targetSalidaIdx;
    }
    return targetEntradaIdx;
  }, [isToday, modoSeccion, focoHorario, targetEntradaIdx, targetSalidaIdx]);

  const targetShow = useMemo(() => {
    if (targetIdx < 0) return null;
    if (modoSeccion === "SALIDAS" || focoHorario === "SALIDA") {
      return salidaFiltrada[targetSalidaIdx] || null;
    }
    return entradaFiltrada[targetEntradaIdx] || null;
  }, [targetIdx, modoSeccion, focoHorario, targetEntradaIdx, targetSalidaIdx, entradaFiltrada, salidaFiltrada]);

  // Función para deslizarse suavemente a la fila del horario actual
  const scrollToTargetRow = useCallback((animated: boolean = true) => {
    if (targetIdx < 0) return;

    const measuredY = rowOffsetsRef.current[targetIdx];
    const containerY = tableContainerYRef.current || 220;

    let targetY: number;
    if (measuredY !== undefined) {
      targetY = containerY + measuredY;
    } else {
      const rowHeight = vistaResumida ? 48 : 26;
      targetY = containerY + targetIdx * rowHeight;
    }

    const finalScrollY = Math.max(0, targetY - 80);
    mainScrollRef.current?.scrollTo({ y: finalScrollY, animated });
  }, [targetIdx, vistaResumida]);

  // Reset del flag de auto-scroll cuando cambia el día, vista, modo o foco
  useEffect(() => {
    hasAutoScrolledRef.current = false;
    rowOffsetsRef.current = {};
  }, [selectedDay, vistaResumida, modoSeccion, focoHorario]);

  // Auto-scroll automático inicial al horario actual cuando los datos están listos
  useEffect(() => {
    if (loadingWeekly || targetIdx < 0 || hasAutoScrolledRef.current || filtroTexto.trim().length > 0) return;

    const timeout = setTimeout(() => {
      if (!hasAutoScrolledRef.current) {
        scrollToTargetRow(true);
        hasAutoScrolledRef.current = true;
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [loadingWeekly, targetIdx, filtroTexto, scrollToTargetRow]);

  // ── 9. Extraer info del pie de página (Películas 3D y Cambio de Poster) ───
  const peliculas3D = useMemo(() => {
    const set3D = new Set<string>();
    dailyData.entrada.forEach((s) => {
      if (s.pelicula.toUpperCase().includes("3D")) {
        set3D.add(s.pelicula.trim());
      }
    });
    return Array.from(set3D);
  }, [dailyData.entrada]);

  const cambiosDePoster = useMemo(() => {
    const list: { sala: number; pelicula: string; inicio: string }[] = [];
    dailyData.entrada.forEach((s) => {
      const key = `${s.sala}-${s.inicio}-${s.fin}-${s.pelicula}`;
      if (dailyData.cambioSalaKeys.has(key)) {
        list.push({ sala: s.sala, pelicula: s.pelicula, inicio: s.inicio });
      }
    });
    return list;
  }, [dailyData]);

  return (
    <View style={styles.screenWrapper}>
      <ScrollView ref={mainScrollRef} style={styles.container} contentContainerStyle={styles.content}>
        {/* ── BARRA SUPERIOR / HEADER ── */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="clipboard-text-play-outline" size={24} color="#166534" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={styles.title}>Programación del Día</Text>
                <View style={styles.badgeExcel}>
                  <MaterialCommunityIcons name="file-excel-box" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.badgeExcelText}>VISTA EXCEL</Text>
                </View>
              </View>
              <Text style={styles.subtitle}>
                Réplica visual de la hoja de programación con créditos automáticos de Proyección
              </Text>
            </View>
          </View>
        </View>

        {/* ── BARRA DE ESTADO DEL REPORTE GUARDADO ── */}
        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            <MaterialCommunityIcons
              name={savedWeekly ? "check-decagram" : "alert-circle-outline"}
              size={18}
              color={savedWeekly ? "#166534" : "#D97706"}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.statusText}>
              {savedWeekly ? (
                <>
                  Reporte guardado:{" "}
                  <Text style={{ fontWeight: "700", color: "#166534" }}>
                    Semana del {dayjs(savedWeekly.startDate).format("DD/MM/YYYY")}
                  </Text>
                  {savedWeekly.savedAt && (
                    <Text style={{ color: COLORS.muted }}>
                      {" "}
                      ({dayjs(savedWeekly.savedAt).format("DD/MM HH:mm")})
                    </Text>
                  )}
                </>
              ) : loadingWeekly ? (
                "Buscando reporte guardado en el cine..."
              ) : (
                "No se encontró un reporte guardado activo para este cine."
              )}
            </Text>
          </View>

          {/* Switch de Créditos */}
          <View style={styles.switchContainer}>
            <MaterialCommunityIcons
              name="clock-time-four"
              size={16}
              color={includeCreditos ? "#B45309" : COLORS.muted}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.switchLabel, includeCreditos && { color: "#B45309", fontWeight: "700" }]}>
              Créditos: {includeCreditos ? "ACTIVADOS" : "DESACTIVADOS"}
            </Text>
            <Switch
              value={includeCreditos}
              onValueChange={setIncludeCreditos}
              trackColor={{ false: COLORS.border, true: "#FDE68A" }}
              thumbColor={includeCreditos ? "#D97706" : "#FFFFFF"}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>

        {/* ── SELECTOR DE DÍA DE LA SEMANA ── */}
        <View style={styles.daySelectorCard}>
          {!isWeb && width < 480 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayScrollContent}>
              {DAYS.map((day) => {
                const isSel = selectedDay === day;
                const shortDate = buildShortDate(startDateObj, day);
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => setSelectedDay(day)}
                    style={[styles.dayTabMobileScroll, isSel && styles.dayTabActive]}
                    activeOpacity={0.75}
                  >
                    <Text numberOfLines={1} style={[styles.dayTabTitle, isSel && styles.dayTabTitleActive]}>
                      {WEEKDAY_LABELS[day]}
                    </Text>
                    {shortDate.length > 0 && (
                      <Text numberOfLines={1} style={[styles.dayTabDate, isSel && styles.dayTabDateActive]}>
                        {shortDate}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.dayTabsRow}>
              {DAYS.map((day) => {
                const isSel = selectedDay === day;
                const shortDate = buildShortDate(startDateObj, day);
                const label = width < 720 ? WEEKDAY_SHORT[day] : WEEKDAY_LABELS[day];
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => setSelectedDay(day)}
                    style={[styles.dayTab, isSel && styles.dayTabActive]}
                    activeOpacity={0.75}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.dayTabTitle,
                        isSel && styles.dayTabTitleActive,
                        width < 720 && { fontSize: 10 },
                      ]}
                    >
                      {label}
                    </Text>
                    {shortDate.length > 0 && (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dayTabDate,
                          isSel && styles.dayTabDateActive,
                          width < 720 && { fontSize: 8.5 },
                        ]}
                      >
                        {shortDate}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── BARRA DE HERRAMIENTAS: BOTÓN VISTA RESUMIDA Y CONTROL DE COLUMNAS ── */}
        <View style={styles.viewToolbar}>
          {/* Botón destacado de alternar entre Vista Resumida Mobile y Hoja Completa */}
          <TouchableOpacity
            onPress={() => setVistaResumida(!vistaResumida)}
            style={[styles.btnToggleVista, vistaResumida && styles.btnToggleVistaActive]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name={vistaResumida ? "cellphone-check" : "table-large"}
              size={16}
              color={vistaResumida ? "#FFFFFF" : "#166534"}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.btnToggleVistaText, vistaResumida && styles.btnToggleVistaTextActive]}>
              {vistaResumida ? "Vista Resumida Mobile (Sin scroll)" : "Vista Hoja Completa Excel"}
            </Text>
            <View style={[styles.pillBadgeMode, vistaResumida && styles.pillBadgeModeActive]}>
              <Text style={[styles.pillBadgeModeText, vistaResumida && styles.pillBadgeModeTextActive]}>
                {vistaResumida ? "100% Pantalla" : "Scroll Horizontal"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Botón rápido para saltar al horario actual / próximo ingreso o salida */}
          {isToday && targetShow && (
            <TouchableOpacity
              onPress={() => scrollToTargetRow(true)}
              style={[
                styles.btnJumpNow,
                focoHorario === "SALIDA" && styles.btnJumpNowSalida,
              ]}
              activeOpacity={0.8}
              accessibilityLabel={`Ir a ${focoHorario === "ENTRADA" ? "entrada" : "salida"} actual`}
            >
              <MaterialCommunityIcons
                name="clock-fast"
                size={15}
                color={focoHorario === "SALIDA" ? "#9A3412" : "#166534"}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.btnJumpNowText, focoHorario === "SALIDA" && styles.btnJumpNowTextSalida]}>
                Ir a {focoHorario === "ENTRADA" ? `Entrada (${targetShow.inicio})` : `Salida (${targetShow.fin})`}
              </Text>
            </TouchableOpacity>
          )}

          {/* Barra de personalización de columnas y secciones (visible en cualquier momento) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colFiltersScroll}>
            {/* Segmento de Secciones */}
            <View style={styles.sectionPills}>
              <TouchableOpacity
                onPress={() => setModoSeccion("AMBAS")}
                style={[styles.sectionPill, modoSeccion === "AMBAS" && styles.sectionPillActive]}
              >
                <Text style={[styles.sectionPillText, modoSeccion === "AMBAS" && styles.sectionPillTextActive]}>
                  ⇄ Ambas
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModoSeccion("ENTRADAS")}
                style={[styles.sectionPill, modoSeccion === "ENTRADAS" && styles.sectionPillActive]}
              >
                <Text style={[styles.sectionPillText, modoSeccion === "ENTRADAS" && styles.sectionPillTextActive]}>
                  ⬇ Solo Entradas
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModoSeccion("SALIDAS")}
                style={[styles.sectionPill, modoSeccion === "SALIDAS" && styles.sectionPillActive]}
              >
                <Text style={[styles.sectionPillText, modoSeccion === "SALIDAS" && styles.sectionPillTextActive]}>
                  ⬆ Solo Salidas
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toolbarDivider} />

            {/* Pill Toggle: Nombre de Película */}
            <TouchableOpacity
              onPress={() => setColPelicula(!colPelicula)}
              style={[styles.colTogglePill, !colPelicula && styles.colTogglePillOff]}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={colPelicula ? "movie-open-check" : "movie-off-outline"}
                size={14}
                color={colPelicula ? "#166534" : COLORS.muted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.colTogglePillText, !colPelicula && styles.colTogglePillTextOff]}>
                Película: {colPelicula ? "Visible" : "Oculta"}
              </Text>
            </TouchableOpacity>

            {/* Pill Toggle: Calificación */}
            <TouchableOpacity
              onPress={() => setColCalif(!colCalif)}
              style={[styles.colTogglePill, !colCalif && styles.colTogglePillOff]}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={colCalif ? "tag-check" : "tag-off"}
                size={14}
                color={colCalif ? "#166534" : COLORS.muted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.colTogglePillText, !colCalif && styles.colTogglePillTextOff]}>
                Calif: {colCalif ? "Visible" : "Oculta"}
              </Text>
            </TouchableOpacity>

            {/* Pill Toggle: Créditos */}
            {includeCreditos && (
              <TouchableOpacity
                onPress={() => setColCreditos(!colCreditos)}
                style={[styles.colTogglePill, !colCreditos && styles.colTogglePillOff]}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={colCreditos ? "clock-check-outline" : "clock-remove-outline"}
                  size={14}
                  color={colCreditos ? "#166534" : COLORS.muted}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.colTogglePillText, !colCreditos && styles.colTogglePillTextOff]}>
                  Créditos: {colCreditos ? "Visible" : "Oculto"}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Buscador rápido de películas o salas */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={16} color={COLORS.muted} style={{ marginRight: 6 }} />
          <TextInput
            placeholder="Buscar película, sala o función..."
            placeholderTextColor={COLORS.muted}
            value={filtroTexto}
            onChangeText={setFiltroTexto}
            style={styles.searchInput}
          />
          {filtroTexto.length > 0 && (
            <TouchableOpacity onPress={() => setFiltroTexto("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.muted} />
            </TouchableOpacity>
          )}
          <View style={styles.searchCountBadge}>
            <Text style={styles.searchCountText}>
              {dailyData.entrada.length} funciones
            </Text>
          </View>
        </View>

        {/* ── CONTENIDO PRINCIPAL: VISTA RESUMIDA MOBILE O HOJA EXCEL ── */}
        {loadingWeekly ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#166534" />
            <Text style={styles.loadingText}>Cargando programación del reporte guardado...</Text>
          </View>
        ) : weeklyRowsToUse.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="file-excel-outline" size={48} color={COLORS.muted} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No hay programación semanal cargada</Text>
            <Text style={styles.emptyDesc}>
              Para visualizar esta programación, guarda el reporte en Servicios &gt; Programaciones.
            </Text>
          </View>
        ) : vistaResumida ? (
          /* ══════════════════════════════════════════════════════════════════
             MODO VISTA RESUMIDA MOBILE (100% ANCHO, SIN SCROLL HORIZONTAL)
             ══════════════════════════════════════════════════════════════════ */
          <View
            style={styles.compactContainer}
            onLayout={(e) => {
              tableContainerYRef.current = e.nativeEvent.layout.y;
            }}
          >
            {/* Cabecera compacta con la fecha del día */}
            <View style={styles.compactHeaderBanner}>
              <Text style={styles.compactHeaderTitle}>{dateLabelCompleto}</Text>
              <Text style={styles.compactHeaderSub}>
                {modoSeccion === "AMBAS" ? "Entradas y Salidas apareadas" : modoSeccion === "ENTRADAS" ? "Listado de Entradas" : "Listado de Salidas"}
                {!colPelicula && " • Nombres de película ocultos"}
              </Text>
            </View>

            {/* Listado según el modo de sección seleccionado */}
            {maxRows === 0 ? (
              <View style={styles.excelEmptyRow}>
                <Text style={styles.excelEmptyRowText}>
                  {filtroTexto ? "No hay funciones que coincidan con la búsqueda." : "Sin funciones programadas para este día."}
                </Text>
              </View>
            ) : modoSeccion === "AMBAS" ? (
              /* SUB-MODO AMBAS: Filas apareadas lado a lado sin desbordar el ancho del móvil */
              <View style={styles.compactList}>
                {/* Rótulos de columnas compactas con selección interactiva (Tocar para enfocar) */}
                <View style={styles.compactColumnLabelsRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setFocoHorario("ENTRADA");
                      scrollToTargetRow(true);
                    }}
                    style={[
                      styles.compactSideLeftHeader,
                      focoHorario === "ENTRADA" && styles.compactHeaderActiveEntrada,
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <MaterialCommunityIcons
                        name={focoHorario === "ENTRADA" ? "radiobox-marked" : "radiobox-blank"}
                        size={12}
                        color={focoHorario === "ENTRADA" ? "#10B981" : COLORS.muted}
                      />
                      <Text style={[styles.compactColLabelText, focoHorario === "ENTRADA" && styles.compactColLabelActiveEntrada]}>
                        ENTRADAS (INICIO • SALA)
                      </Text>
                      {focoHorario === "ENTRADA" && isToday && (
                        <View style={styles.pillActiveTrack}>
                          <Text style={styles.pillActiveTrackText}>Seguir</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setFocoHorario("SALIDA");
                      scrollToTargetRow(true);
                    }}
                    style={[
                      styles.compactSideRightHeader,
                      focoHorario === "SALIDA" && styles.compactHeaderActiveSalida,
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                      {focoHorario === "SALIDA" && isToday && (
                        <View style={styles.pillActiveTrackSalida}>
                          <Text style={styles.pillActiveTrackSalidaText}>Seguir</Text>
                        </View>
                      )}
                      <Text style={[styles.compactColLabelText, focoHorario === "SALIDA" && styles.compactColLabelActiveSalida]}>
                        SALIDAS (SALA • CRÉD • FIN)
                      </Text>
                      <MaterialCommunityIcons
                        name={focoHorario === "SALIDA" ? "radiobox-marked" : "radiobox-blank"}
                        size={12}
                        color={focoHorario === "SALIDA" ? "#F59E0B" : COLORS.muted}
                      />
                    </View>
                  </TouchableOpacity>
                </View>

                {Array.from({ length: maxRows }).map((_, idx) => {
                  const inShow = entradaFiltrada[idx];
                  const outShow = salidaFiltrada[idx];

                  const is3D = inShow?.pelicula?.toUpperCase().includes("3D");
                  const inKey = inShow ? `${inShow.sala}-${inShow.inicio}-${inShow.fin}-${inShow.pelicula}` : "";
                  const isPosterChange = inShow ? dailyData.cambioSalaKeys.has(inKey) : false;
                  const isRestricted = inShow ? isRestrictedRating(inShow.calificacion) : false;

                  const outIs3D = outShow?.pelicula?.toUpperCase().includes("3D");
                  const isTargetEntrada = isToday && focoHorario === "ENTRADA" && idx === targetEntradaIdx;
                  const isTargetSalida = isToday && focoHorario === "SALIDA" && idx === targetSalidaIdx;

                  return (
                    <View
                      key={`comp-row-${idx}`}
                      onLayout={(e) => {
                        rowOffsetsRef.current[idx] = e.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.compactItemRow,
                        idx % 2 === 1 && styles.compactItemRowZebra,
                        isTargetEntrada && styles.compactItemRowTargetEntrada,
                        isTargetSalida && styles.compactItemRowTargetSalida,
                      ]}
                    >
                      {/* Columna Izquierda: Entradas (Tocar para enfocar Entradas) */}
                      <TouchableOpacity
                        style={styles.compactSideLeftCol}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (focoHorario !== "ENTRADA") {
                            setFocoHorario("ENTRADA");
                          }
                        }}
                      >
                        <View style={styles.compactSideLeftRow}>
                          {inShow ? (
                            <>
                              <View style={[styles.compactBadgeInicio, isTargetEntrada && styles.compactBadgeInicioActive]}>
                                <Text style={[styles.compactBadgeInicioText, isTargetEntrada && styles.compactBadgeInicioTextActive]}>
                                  {inShow.inicio}
                                </Text>
                              </View>
                              {isTargetEntrada && (
                                <View style={styles.badgeAhora}>
                                  <Text style={styles.badgeAhoraText}>AHORA</Text>
                                </View>
                              )}
                              <View style={styles.compactBadgeSala}>
                                <Text style={styles.compactBadgeSalaText}>S{inShow.sala}</Text>
                              </View>
                              {colCalif && inShow.calificacion ? (
                                <View style={[styles.compactBadgeCalif, isRestricted && styles.compactBadgeCalifRestricted]}>
                                  <Text style={[styles.compactBadgeCalifText, isRestricted && styles.compactBadgeCalifTextRestricted]}>
                                    {inShow.calificacion}
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          ) : (
                            <Text style={styles.compactDashText}>-</Text>
                          )}
                        </View>

                        {/* Película de Entrada */}
                        {colPelicula && inShow && (
                          <View style={styles.compactMovieSubRow}>
                            <Text
                              style={[styles.compactMovieTitleText, is3D && styles.compactMovieTitle3D]}
                              numberOfLines={1}
                            >
                              {inShow.pelicula}
                            </Text>
                            {isPosterChange && (
                              <View style={styles.posterBadgeMini}>
                                <Text style={styles.posterBadgeMiniText}>★</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Columna Derecha: Salidas (Tocar para enfocar Salidas) */}
                      <TouchableOpacity
                        style={styles.compactSideRightCol}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (focoHorario !== "SALIDA") {
                            setFocoHorario("SALIDA");
                          }
                        }}
                      >
                        <View style={styles.compactSideRightRow}>
                          {outShow ? (
                            <>
                              {isTargetSalida && (
                                <View style={styles.badgeAhoraSalida}>
                                  <Text style={styles.badgeAhoraSalidaText}>AHORA</Text>
                                </View>
                              )}
                              <View style={styles.compactBadgeSala}>
                                <Text style={styles.compactBadgeSalaText}>S{outShow.sala}</Text>
                              </View>
                              {includeCreditos && colCreditos ? (
                                <View
                                  style={[
                                    styles.compactBadgeCreditos,
                                    !outShow.creditosHoraReloj && styles.compactBadgeMuted,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.compactBadgeCreditosText,
                                      !outShow.creditosHoraReloj && { color: COLORS.muted },
                                    ]}
                                  >
                                    {outShow.creditosHoraReloj || "-"}
                                  </Text>
                                </View>
                              ) : null}
                              <View style={[styles.compactBadgeFin, isTargetSalida && styles.compactBadgeFinActive]}>
                                <Text style={[styles.compactBadgeFinText, isTargetSalida && styles.compactBadgeFinTextActive]}>
                                  {outShow.fin}
                                </Text>
                              </View>
                            </>
                          ) : (
                            <Text style={styles.compactDashText}>-</Text>
                          )}
                        </View>

                        {/* Película de Salida */}
                        {colPelicula && outShow && (
                          <View style={styles.compactMovieSubRowRight}>
                            <Text
                              style={[styles.compactMovieTitleTextRight, outIs3D && styles.compactMovieTitle3D]}
                              numberOfLines={1}
                            >
                              {outShow.pelicula}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : modoSeccion === "ENTRADAS" ? (
              /* SUB-MODO SOLO ENTRADAS */
              <View style={styles.compactList}>
                {entradaFiltrada.map((show, idx) => {
                  const is3D = show.pelicula?.toUpperCase().includes("3D");
                  const inKey = `${show.sala}-${show.inicio}-${show.fin}-${show.pelicula}`;
                  const isPosterChange = dailyData.cambioSalaKeys.has(inKey);
                  const isRestricted = isRestrictedRating(show.calificacion);
                  const isTarget = isToday && idx === targetIdx;

                  return (
                    <View
                      key={`in-card-${idx}`}
                      onLayout={(e) => {
                        rowOffsetsRef.current[idx] = e.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.singleSectionRow,
                        idx % 2 === 1 && styles.singleSectionRowZebra,
                        isTarget && styles.compactItemRowTarget,
                      ]}
                    >
                      <View style={styles.singleRowTop}>
                        <View style={styles.compactBadgeInicio}>
                          <Text style={styles.compactBadgeInicioText}>{show.inicio}</Text>
                        </View>
                        {isTarget && (
                          <View style={styles.badgeAhora}>
                            <Text style={styles.badgeAhoraText}>AHORA</Text>
                          </View>
                        )}
                        <View style={styles.compactBadgeSala}>
                          <Text style={styles.compactBadgeSalaText}>Sala {show.sala}</Text>
                        </View>
                        {colCalif && show.calificacion ? (
                          <View style={[styles.compactBadgeCalif, isRestricted && styles.compactBadgeCalifRestricted]}>
                            <Text style={[styles.compactBadgeCalifText, isRestricted && styles.compactBadgeCalifTextRestricted]}>
                              {show.calificacion}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {colPelicula && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                          <Text style={[styles.singleRowMovieText, is3D && styles.compactMovieTitle3D]} numberOfLines={1}>
                            {show.pelicula}
                          </Text>
                          {isPosterChange && (
                            <View style={styles.posterBadgeMini}>
                              <Text style={styles.posterBadgeMiniText}>★ Cambio póster</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              /* SUB-MODO SOLO SALIDAS */
              <View style={styles.compactList}>
                {salidaFiltrada.map((show, idx) => {
                  const is3D = show.pelicula?.toUpperCase().includes("3D");
                  const isTarget = isToday && idx === targetIdx;

                  return (
                    <View
                      key={`out-card-${idx}`}
                      onLayout={(e) => {
                        rowOffsetsRef.current[idx] = e.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.singleSectionRow,
                        idx % 2 === 1 && styles.singleSectionRowZebra,
                        isTarget && styles.compactItemRowTarget,
                      ]}
                    >
                      <View style={styles.singleRowTop}>
                        <View style={styles.compactBadgeSala}>
                          <Text style={styles.compactBadgeSalaText}>Sala {show.sala}</Text>
                        </View>
                        {isTarget && (
                          <View style={styles.badgeAhora}>
                            <Text style={styles.badgeAhoraText}>AHORA</Text>
                          </View>
                        )}
                        {includeCreditos && colCreditos && (
                          <View style={[styles.compactBadgeCreditos, !show.creditosHoraReloj && styles.compactBadgeMuted]}>
                            <MaterialCommunityIcons name="clock-outline" size={11} color="#B45309" style={{ marginRight: 2 }} />
                            <Text style={styles.compactBadgeCreditosText}>
                              {show.creditosHoraReloj ? `Créd: ${show.creditosHoraReloj}` : "Créd: -"}
                            </Text>
                          </View>
                        )}
                        <View style={styles.compactBadgeFin}>
                          <Text style={styles.compactBadgeFinText}>Fin: {show.fin}</Text>
                        </View>
                      </View>

                      {colPelicula && (
                        <View style={{ marginTop: 3 }}>
                          <Text style={[styles.singleRowMovieText, is3D && styles.compactMovieTitle3D]} numberOfLines={1}>
                            {show.pelicula}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Leyenda compacta en pie de página */}
            <View style={styles.compactFooterBox}>
              {peliculas3D.length > 0 && (
                <Text style={styles.compactFooterLine}>
                  <Text style={{ fontWeight: "700", color: COLORS.text }}>Películas 3D: </Text>
                  {peliculas3D.join(", ")}
                </Text>
              )}
              {cambiosDePoster.length > 0 && (
                <Text style={styles.compactFooterLine}>
                  <Text style={{ fontWeight: "700", color: "#B45309" }}>★ Cambios de póster: </Text>
                  {cambiosDePoster.map((c) => `S${c.sala} (${c.inicio})`).join(", ")}
                </Text>
              )}
            </View>
          </View>
        ) : (
          /* ══════════════════════════════════════════════════════════════════
             MODO HOJA COMPLETA EXCEL (RÉPLICA EXACTA CON SCROLL HORIZONTAL)
             ══════════════════════════════════════════════════════════════════ */
          <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={true} style={styles.excelScroll}>
            <View
              style={[styles.excelSheetContainer, { minWidth: isMobile ? 860 : "100%" }]}
              onLayout={(e) => {
                tableContainerYRef.current = e.nativeEvent.layout.y;
              }}
            >
              {/* ── FILA 1: FECHA Y TÍTULO MERGED (FONDO GRIS CLARO EXCEL) ── */}
              <View style={styles.excelTopHeader}>
                <Text style={styles.excelTopHeaderText}>{dateLabelCompleto}</Text>
              </View>

              {/* ── FILA 2: SECCIONES MERGED (ENTRADA / SALIDA) ── */}
              <View style={styles.excelSectionRow}>
                <View style={[styles.excelSectionBlock, { flex: 5 }]}>
                  <Text style={styles.excelSectionBlockText}>ENTRADA</Text>
                </View>
                <View style={styles.excelDividerColumn} />
                <View style={[styles.excelSectionBlock, { flex: 5 }]}>
                  <Text style={styles.excelSectionBlockText}>SALIDA</Text>
                </View>
              </View>

              {/* ── FILA 3: CABECERA DE COLUMNAS ── */}
              <View style={styles.excelColumnsHeaderRow}>
                {/* ENTRADA COLUMNAS */}
                <View style={styles.excelColGroupEntrada}>
                  <Text style={[styles.excelTh, { width: 55 }]}>INICIO</Text>
                  <Text style={[styles.excelTh, { width: 44 }]}>SALA</Text>
                  <Text style={[styles.excelTh, { width: 28 }]}>H</Text>
                  <Text style={[styles.excelTh, { flex: 1, textAlign: "left", paddingLeft: 8 }]}>PELÍCULA</Text>
                  {colCalif && <Text style={[styles.excelTh, { width: 50 }]}>CALIF</Text>}
                </View>

                {/* SEPARADOR CENTRAL EXCEL */}
                <View style={styles.excelDividerColumn} />

                {/* SALIDA COLUMNAS */}
                <View style={styles.excelColGroupSalida}>
                  <Text style={[styles.excelTh, { width: 44 }]}>SALA</Text>
                  {includeCreditos && colCreditos && (
                    <Text style={[styles.excelTh, { width: 68, color: "#B45309", fontWeight: "800" }]}>CRÉDITOS</Text>
                  )}
                  <Text style={[styles.excelTh, { width: 55, color: "#DC2626" }]}>FIN</Text>
                  <Text style={[styles.excelTh, { flex: 1, textAlign: "left", paddingLeft: 8 }]}>PELÍCULA</Text>
                </View>
              </View>

              {/* ── FILAS DE DATOS DE LA HOJA EXCEL ── */}
              {maxRows === 0 ? (
                <View style={styles.excelEmptyRow}>
                  <Text style={styles.excelEmptyRowText}>
                    {filtroTexto ? "No hay funciones que coincidan con la búsqueda." : "Sin funciones programadas para este día."}
                  </Text>
                </View>
              ) : (
                Array.from({ length: maxRows }).map((_, idx) => {
                  const inShow: DailyShow | undefined = entradaFiltrada[idx];
                  const outShow: DailyShow | undefined = salidaFiltrada[idx];

                  const is3D = inShow?.pelicula?.toUpperCase().includes("3D");
                  const inKey = inShow ? `${inShow.sala}-${inShow.inicio}-${inShow.fin}-${inShow.pelicula}` : "";
                  const isPosterChange = inShow ? dailyData.cambioSalaKeys.has(inKey) : false;
                  const isRestricted = inShow ? isRestrictedRating(inShow.calificacion) : false;

                  const outIs3D = outShow?.pelicula?.toUpperCase().includes("3D");
                  const isTarget = isToday && idx === targetIdx;

                  return (
                    <View
                      key={`row-${idx}`}
                      onLayout={(e) => {
                        rowOffsetsRef.current[idx] = e.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.excelDataRow,
                        idx % 2 === 1 && styles.excelDataRowZebra,
                        isTarget && styles.excelDataRowTarget,
                      ]}
                    >
                      {/* ── LADO ENTRADA ── */}
                      <View style={styles.excelColGroupEntrada}>
                        {inShow ? (
                          <>
                            <View style={[styles.excelCell, { width: 55 }]}>
                              <Text style={styles.excelTextInicio}>{inShow.inicio}</Text>
                            </View>
                            <View style={[styles.excelCell, { width: 44 }]}>
                              <Text style={styles.excelTextSala}>{inShow.sala}</Text>
                            </View>
                            <View style={[styles.excelCell, { width: 28 }]}>
                              <Text style={styles.excelTextHab}>H</Text>
                            </View>
                            <View
                              style={[
                                styles.excelCell,
                                styles.excelCellMovie,
                                { flex: 1 },
                                is3D && styles.excelCellMovie3D,
                              ]}
                            >
                              <Text
                                style={[styles.excelTextMovie, is3D && styles.excelTextMovie3D]}
                                numberOfLines={1}
                              >
                                {colPelicula ? inShow.pelicula : `Sala ${inShow.sala}`}
                              </Text>
                              {isPosterChange && (
                                <View style={styles.posterChangeBadge}>
                                  <Text style={styles.posterChangeBadgeText}>★</Text>
                                </View>
                              )}
                            </View>
                            {colCalif && (
                              <View style={[styles.excelCell, { width: 50 }, isRestricted && styles.excelCellCalifRestricted]}>
                                <Text style={[styles.excelTextCalif, isRestricted && styles.excelTextCalifRestricted]}>
                                  {inShow.calificacion || "-"}
                                </Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <>
                            <View style={[styles.excelCell, { width: 55 }]} />
                            <View style={[styles.excelCell, { width: 44 }]} />
                            <View style={[styles.excelCell, { width: 28 }]} />
                            <View style={[styles.excelCell, { flex: 1 }]} />
                            {colCalif && <View style={[styles.excelCell, { width: 50 }]} />}
                          </>
                        )}
                      </View>

                      {/* SEPARADOR CENTRAL EXCEL */}
                      <View style={styles.excelDividerColumn} />

                      {/* ── LADO SALIDA ── */}
                      <View style={styles.excelColGroupSalida}>
                        {outShow ? (
                          <>
                            <View style={[styles.excelCell, { width: 44 }]}>
                              <Text style={styles.excelTextSala}>{outShow.sala}</Text>
                            </View>
                            {includeCreditos && colCreditos && (
                              <View style={[styles.excelCell, styles.excelCellCreditos, { width: 68 }]}>
                                <Text style={styles.excelTextCreditos}>
                                  {outShow.creditosHoraReloj || "-"}
                                </Text>
                              </View>
                            )}
                            <View style={[styles.excelCell, styles.excelCellFin, { width: 55 }]}>
                              <Text style={styles.excelTextFin}>{outShow.fin}</Text>
                            </View>
                            <View
                              style={[
                                styles.excelCell,
                                styles.excelCellMovie,
                                { flex: 1 },
                                outIs3D && styles.excelCellMovie3D,
                              ]}
                            >
                              <Text
                                style={[styles.excelTextMovie, outIs3D && styles.excelTextMovie3D]}
                                numberOfLines={1}
                              >
                                {colPelicula ? outShow.pelicula : `Sala ${outShow.sala}`}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={[styles.excelCell, { width: 44 }]} />
                            {includeCreditos && colCreditos && <View style={[styles.excelCell, { width: 68 }]} />}
                            <View style={[styles.excelCell, { width: 55 }]} />
                            <View style={[styles.excelCell, { flex: 1 }]} />
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              )}

              {/* ── PIE DE PÁGINA OFICIAL EXCEL (LÍNEAS DE LEYENDA) ── */}
              <View style={styles.excelLegendContainer}>
                {/* PELÍCULAS 3D */}
                <View style={styles.excelLegendRow}>
                  <View style={styles.excelLegendTag}>
                    <Text style={styles.excelLegendTagText}>PELÍCULAS 3D</Text>
                  </View>
                  <Text style={styles.excelLegendContent} numberOfLines={2}>
                    {peliculas3D.length > 0 ? peliculas3D.join("   |   ") : "Sin películas 3D programadas"}
                  </Text>
                </View>

                {/* CAMBIO DE PÓSTER */}
                <View style={styles.excelLegendRow}>
                  <View style={[styles.excelLegendTag, { backgroundColor: "#FEF3C7" }]}>
                    <Text style={[styles.excelLegendTagText, { color: "#92400E" }]}>CAMBIO DE PÓSTER</Text>
                  </View>
                  <Text style={styles.excelLegendContent} numberOfLines={2}>
                    {cambiosDePoster.length > 0
                      ? cambiosDePoster.map((c) => `Sala ${c.sala} (${c.inicio}): ${c.pelicula}`).join("   |   ")
                      : "No hay cambios de película en una misma sala"}
                  </Text>
                </View>

                {/* CALIFICACIONES */}
                <View style={styles.excelLegendFooter}>
                  <Text style={styles.excelLegendFooterText}>
                    G = Audiencia General (ATP)  |  SP = Supervisión Parental Sugerida (ATPR)  |  R-13 = Restringida menores de 13 años  |  R-17 = Restringida menores de 17 años  |  C = Solo apta mayores de 18 años
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </ScrollView>

      {/* Botón flotante para saltar directamente a la hora actual */}
      {isToday && targetShow && (
        <TouchableOpacity
          onPress={() => scrollToTargetRow(true)}
          style={[
            styles.fabJumpNow,
            focoHorario === "SALIDA" && styles.fabJumpNowSalida,
          ]}
          activeOpacity={0.85}
          accessibilityLabel={`Ir a ${focoHorario === "ENTRADA" ? "entrada" : "salida"} actual`}
        >
          <MaterialCommunityIcons name="target" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
          <Text style={styles.fabJumpNowText}>
            Ahora {focoHorario === "ENTRADA" ? `Entrada: ${targetShow.inicio}` : `Salida: ${targetShow.fin}`} (S{targetShow.sala})
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 10,
    width: "100%",
    paddingBottom: 60,
  },

  // Header superior
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 260,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
  },
  badgeExcel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeExcelText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
  },

  // Barra de estado del reporte guardado
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    flexWrap: "wrap",
    gap: 6,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.text,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchLabel: {
    fontSize: 10.5,
    color: COLORS.text,
    fontWeight: "600",
  },

  // Selector de días de la semana (100% responsive y centrado en web)
  daySelectorCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 6,
    width: "100%",
  },
  dayTabsRow: {
    flexDirection: "row",
    width: "100%",
    gap: 4,
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  dayScrollContent: {
    flexDirection: "row",
    gap: 4,
  },
  dayTab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayTabMobileScroll: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayTabActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  dayTabTitle: {
    fontSize: 11.5,
    fontWeight: "700",
    color: COLORS.muted,
    textAlign: "center",
  },
  dayTabTitleActive: {
    color: "#FFFFFF",
  },
  dayTabDate: {
    fontSize: 9.5,
    color: COLORS.muted,
    marginTop: 1.5,
    textAlign: "center",
  },
  dayTabDateActive: {
    color: "#DCFCE7",
  },

  // ── BARRA DE HERRAMIENTAS: VISTA RESUMIDA Y COLUMNAS ──
  viewToolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    padding: 5,
    marginBottom: 6,
    flexWrap: "wrap",
    gap: 6,
  },
  btnToggleVista: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.radius.sm,
    cursor: "pointer" as any,
  },
  btnToggleVistaActive: {
    backgroundColor: "#166534",
    borderColor: "#14532D",
  },
  btnToggleVistaText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: COLORS.text,
  },
  btnToggleVistaTextActive: {
    color: "#FFFFFF",
  },
  pillBadgeMode: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  pillBadgeModeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  pillBadgeModeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: COLORS.muted,
  },
  pillBadgeModeTextActive: {
    color: "#FFFFFF",
  },
  btnJumpNow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: "#166534",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: THEME.radius.sm,
  },
  btnJumpNowSalida: {
    borderColor: "#D97706",
  },
  btnJumpNowText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  btnJumpNowTextSalida: {
    color: COLORS.text,
  },
  fabJumpNow: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: "#166534",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 999,
  },
  fabJumpNowSalida: {
    backgroundColor: "#D97706",
  },
  fabJumpNowText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
  badgeAhora: {
    backgroundColor: "#166534",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 3,
  },
  badgeAhoraSalida: {
    backgroundColor: "#D97706",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 3,
  },
  badgeAhoraText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  badgeAhoraSalidaText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  colFiltersScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionPills: {
    flexDirection: "row",
    backgroundColor: COLORS.bgMobile,
    padding: 2,
    borderRadius: 4,
    gap: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  sectionPillActive: {
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  sectionPillText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: COLORS.muted,
  },
  sectionPillTextActive: {
    color: COLORS.text,
    fontWeight: "700",
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    backgroundColor: COLORS.border,
    marginHorizontal: 2,
  },
  colTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: "#166534",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  colTogglePillOff: {
    backgroundColor: COLORS.bgMobile,
    borderColor: COLORS.border,
  },
  colTogglePillText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: COLORS.text,
  },
  colTogglePillTextOff: {
    color: COLORS.muted,
  },

  // Buscador rápido
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  searchCountBadge: {
    backgroundColor: COLORS.bgMobile,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  searchCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
  },

  // Loading y empty
  loadingBox: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.muted,
  },
  emptyCard: {
    padding: 30,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 3,
  },
  emptyDesc: {
    fontSize: 11.5,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 400,
    marginBottom: 12,
    lineHeight: 16,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ESTILOS: VISTA RESUMIDA MOBILE (100% RESPONSIVE SIN SCROLL HORIZONTAL)
  // ══════════════════════════════════════════════════════════════════════════
  compactContainer: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  compactHeaderBanner: {
    backgroundColor: COLORS.bgMobile,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },
  compactHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  compactHeaderSub: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 1,
  },
  compactList: {
    width: "100%",
  },
  compactColumnLabelsRow: {
    flexDirection: "row",
    backgroundColor: COLORS.bgMobile,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  compactSideLeftHeader: {
    flex: 1,
    paddingRight: 6,
    borderRightWidth: 2,
    borderRightColor: "#94A3B8",
    paddingVertical: 2,
    borderRadius: 4,
  },
  compactSideRightHeader: {
    flex: 1,
    paddingLeft: 6,
    alignItems: "flex-end",
    paddingVertical: 2,
    borderRadius: 4,
  },
  compactHeaderActiveEntrada: {
    backgroundColor: Platform.OS === "web" ? ("rgba(16, 185, 129, 0.12)" as any) : "#F0FDF4",
  },
  compactHeaderActiveSalida: {
    backgroundColor: Platform.OS === "web" ? ("rgba(245, 158, 11, 0.12)" as any) : "#FFFBEB",
  },
  compactColLabelText: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  compactColLabelActiveEntrada: {
    color: "#10B981",
    fontWeight: "900",
  },
  compactColLabelActiveSalida: {
    color: "#F59E0B",
    fontWeight: "900",
  },
  pillActiveTrack: {
    backgroundColor: "#10B981",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  pillActiveTrackText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  pillActiveTrackSalida: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  pillActiveTrackSalidaText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // Fila compacta con raya vertical divisoria completa
  compactItemRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  compactItemRowZebra: {
    backgroundColor: COLORS.bgMobile,
  },
  compactItemRowTarget: {
    backgroundColor: Platform.OS === "web" ? ("rgba(16, 185, 129, 0.12)" as any) : "#F0FDF4",
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  compactItemRowTargetEntrada: {
    backgroundColor: Platform.OS === "web" ? ("rgba(16, 185, 129, 0.12)" as any) : "#F0FDF4",
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  compactItemRowTargetSalida: {
    backgroundColor: Platform.OS === "web" ? ("rgba(245, 158, 11, 0.12)" as any) : "#FFFBEB",
    borderRightWidth: 4,
    borderRightColor: "#F59E0B",
  },
  compactSideLeftCol: {
    flex: 1,
    paddingRight: 6,
    borderRightWidth: 2,
    borderRightColor: "#94A3B8",
    justifyContent: "center",
  },
  compactSideRightCol: {
    flex: 1,
    paddingLeft: 6,
    justifyContent: "center",
  },
  compactSideLeftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "nowrap",
  },
  compactSideRightRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    flexWrap: "nowrap",
  },
  compactMovieSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 3,
  },
  compactMovieSubRowRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
    gap: 3,
  },
  compactBadgeInicio: {
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeInicioActive: {
    backgroundColor: "#10B981",
    borderColor: "#059669",
  },
  compactBadgeInicioText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.text,
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  compactBadgeInicioTextActive: {
    color: "#FFFFFF",
  },
  compactBadgeSala: {
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeSalaText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
  },
  compactBadgeCalif: {
    backgroundColor: COLORS.bgMobile,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeCalifRestricted: {
    backgroundColor: "#000000",
  },
  compactBadgeCalifText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: COLORS.muted,
  },
  compactBadgeCalifTextRestricted: {
    color: "#FFFFFF",
  },
  compactBadgeCreditos: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeCreditosText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#B45309",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  compactBadgeFin: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeFinActive: {
    backgroundColor: "#DC2626",
    borderColor: "#B91C1C",
  },
  compactBadgeFinText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#DC2626",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  compactBadgeFinTextActive: {
    color: "#FFFFFF",
  },
  compactBadgeMuted: {
    backgroundColor: COLORS.bgMobile,
    borderColor: COLORS.border,
  },
  compactDashText: {
    fontSize: 11,
    color: COLORS.muted,
  },

  // Línea de película compacta
  compactMovieLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    paddingTop: 1,
  },
  compactMovieTitleText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: COLORS.text,
  },
  compactMovieTitleTextRight: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
  },
  compactMovieTitle3D: {
    backgroundColor: "#374151",
    color: "#FFFFFF",
    paddingHorizontal: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  posterBadgeMini: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 4,
  },
  posterBadgeMiniText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#D97706",
  },

  // Fila para modo de sección individual (Solo Entradas o Solo Salidas)
  singleSectionRow: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  singleSectionRowZebra: {
    backgroundColor: COLORS.bgMobile,
  },
  singleRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  singleRowMovieText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  compactFooterBox: {
    padding: 8,
    backgroundColor: COLORS.bgMobile,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 4,
  },
  compactFooterLine: {
    fontSize: 10,
    color: COLORS.muted,
    lineHeight: 14,
  },

  // ══════════════════════════════════════════════════════════════════
  // ESTILOS: HOJA EXCEL VISUAL IDÉNTICA (VISTA COMPLETA)
  // ══════════════════════════════════════════════════════════════════
  excelScroll: {
    width: "100%",
  },
  excelSheetContainer: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },

  // Encabezado 1: Fecha (Gris Claro Excel)
  excelTopHeader: {
    backgroundColor: COLORS.bgMobile,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  excelTopHeaderText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.8,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },

  // Encabezado 2: ENTRADA / SALIDA
  excelSectionRow: {
    flexDirection: "row",
    backgroundColor: COLORS.bgMobile,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  excelSectionBlock: {
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  excelSectionBlockText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 1,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },

  // Encabezado 3: Columnas
  excelColumnsHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.bgMobile,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
  },
  excelColGroupEntrada: {
    flex: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  excelColGroupSalida: {
    flex: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  excelDividerColumn: {
    width: 2,
    backgroundColor: COLORS.border,
    alignSelf: "stretch",
  },
  excelTh: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    paddingVertical: 4,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.border,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },

  // Fila de datos
  excelDataRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    minHeight: 25,
  },
  excelDataRowZebra: {
    backgroundColor: COLORS.bgMobile,
  },
  excelDataRowTarget: {
    backgroundColor: Platform.OS === "web" ? ("rgba(16, 185, 129, 0.15)" as any) : "#DCFCE7",
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  excelEmptyRow: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  excelEmptyRowText: {
    fontSize: 12,
    color: COLORS.muted,
  },

  // Celdas
  excelCell: {
    borderRightWidth: 0.5,
    borderRightColor: COLORS.border,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  excelCellMovie: {
    alignItems: "flex-start",
    flexDirection: "row",
    paddingHorizontal: 6,
  },
  excelCellMovie3D: {
    backgroundColor: "#374151",
  },
  excelCellFin: {
    backgroundColor: Platform.OS === "web" ? ("rgba(239, 68, 68, 0.12)" as any) : "#FEF2F2",
  },
  excelCellCreditos: {
    backgroundColor: Platform.OS === "web" ? ("rgba(245, 158, 11, 0.12)" as any) : "#FEF3C7",
  },
  excelCellCalifRestricted: {
    backgroundColor: "#000000",
  },

  // Tipografías de celda
  excelTextInicio: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.text,
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  excelTextSala: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  excelTextHab: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "600",
  },
  excelTextMovie: {
    fontSize: 10.5,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },
  excelTextMovie3D: {
    color: "#FFFFFF",
  },
  excelTextCalif: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
  },
  excelTextCalifRestricted: {
    color: "#FFFFFF",
  },
  excelTextCreditos: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  excelTextFin: {
    fontSize: 11,
    fontWeight: "800",
    color: "#DC2626",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  posterChangeBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 4,
  },
  posterChangeBadgeText: {
    fontSize: 9,
    color: "#D97706",
    fontWeight: "800",
  },

  // Pie de página de la hoja (Leyenda Excel)
  excelLegendContainer: {
    borderTopWidth: 1.5,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgMobile,
  },
  excelLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 8,
  },
  excelLegendTag: {
    backgroundColor: "#374151",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  excelLegendTagText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  excelLegendContent: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.text,
  },
  excelLegendFooter: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: COLORS.bgMobile,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  excelLegendFooterText: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: "center",
  },
});

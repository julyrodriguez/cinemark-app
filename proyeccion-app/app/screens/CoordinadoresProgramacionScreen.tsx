// app/screens/CoordinadoresProgramacionScreen.tsx

import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
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
  getDoc,
  onSnapshot,
} from "@/lib/dbService";
import { toDate } from "@/shared/utils";
import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { useAuthUser } from "../../lib/useAuthUser";
import { useAppLayout } from "../../lib/useAppLayout";
import { COLORS, THEME } from "../../lib/theme";
import {
  buildDailyProgramming,
  generateProgramacionWorkbook,
  parseWeeklyProgrammingExcel,
} from "../../lib/programacion/excel";
import { parseWeeklyProgrammingPDF } from "../../lib/programacion/pdf";
import {
  DailyShow,
  ProgramacionBuildResult,
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
  const label = WEEKDAY_LABELS[day];
  if (!startDate) return label.toUpperCase();

  const offset = DAY_OFFSETS[day];
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);

  const dd = String(d.getDate()).padStart(2, "0");
  const month = MONTH_LABELS_ES[d.getMonth()];
  const yyyy = d.getFullYear();

  return `${label} ${dd} de ${month.charAt(0).toUpperCase() + month.slice(1)} de ${yyyy}`.toUpperCase();
}

function buildShortDate(startDate: Date | null, day: WeekdayKey): string {
  if (!startDate) return "";
  const offset = DAY_OFFSETS[day];
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function getCinematicWeekdayKey(date: Date = new Date()): WeekdayKey {
  let d = dayjs(date);
  if (d.hour() < 6) {
    d = d.subtract(1, "day");
  }
  const dayNum = d.day();
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

function getMovieWeekStart(date: Date): string {
  const localDate = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  if (localDate.getUTCHours() < 6) {
    localDate.setTime(localDate.getTime() - 24 * 60 * 60 * 1000);
  }
  const dayNum = localDate.getUTCDay();
  const daysToSubtract = dayNum <= 3 ? dayNum + 3 : dayNum - 4;
  const thurDate = new Date(localDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  const yyyy = thurDate.getUTCFullYear();
  const mm = String(thurDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(thurDate.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMinutesToTimeStr(timeStr: string, minsToAdd: number): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  let totalMinutes = Number(hStr) * 60 + Number(mStr) + minsToAdd;
  totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function buildEventWeeklyRows(eventos: any[], weekStart: string): WeeklyMovieRow[] {
  const rowsMap: Record<string, WeeklyMovieRow> = {};

  eventos.forEach((evt) => {
    if (!evt.sala || String(evt.sala).trim() === "") return;
    if (evt.duracion === undefined || evt.duracion === null || String(evt.duracion).trim() === "") return;

    const eventDate = toDate(evt.diaHora);
    const eventWeekStart = getMovieWeekStart(eventDate);
    if (eventWeekStart !== weekStart) return;

    const eventDayKey = getCinematicWeekdayKey(eventDate);
    const startHours = String(eventDate.getHours()).padStart(2, "0");
    const startMins = String(eventDate.getMinutes()).padStart(2, "0");
    const inicio = `${startHours}:${startMins}`;
    const duration = Number(evt.duracion);
    const fin = addMinutesToTimeStr(inicio, duration);

    const timeRangeStr = `${inicio} - ${fin}`;
    const peliculaName = `[EVENTO] ${evt.pelicula || "EVENTO"}`.toUpperCase();
    const key = `${evt.sala}_${peliculaName}`;

    if (!rowsMap[key]) {
      rowsMap[key] = {
        sala: Number(evt.sala),
        pelicula: peliculaName,
        calificacion: "",
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

    rowsMap[key].horariosPorDia[eventDayKey].push(timeRangeStr);
  });

  return Object.values(rowsMap);
}

function downloadArrayBufferOnWeb(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  // Archivo local alternativo si se decide cargar otro
  const [localRows, setLocalRows] = useState<WeeklyMovieRow[] | null>(null);
  const [localStartDate, setLocalStartDate] = useState<string | null>(null);

  // Créditos desde Firebase (activados por defecto según solicitado)
  const [creditosList, setCreditosList] = useState<any[]>([]);
  const [includeCreditos, setIncludeCreditos] = useState(true);

  // Eventos especiales
  const [eventos, setEventos] = useState<any[]>([]);

  // Filtro de búsqueda rápida en pantalla
  const [filtroTexto, setFiltroTexto] = useState("");

  // Estado de descarga/exportación
  const [exportingExcel, setExportingExcel] = useState(false);

  // ── MODO VISTA RESUMIDA MOBILE & CONTROL DE COLUMNAS ─────────────────────
  // En móviles por defecto se activa la vista resumida para evitar scroll a la derecha
  const [vistaResumida, setVistaResumida] = useState<boolean>(() => isMobile);

  // Toggles de personalización de columnas
  const [colPelicula, setColPelicula] = useState<boolean>(true);
  const [colCalif, setColCalif] = useState<boolean>(true);
  const [colCreditos, setColCreditos] = useState<boolean>(true);
  const [modoSeccion, setModoSeccion] = useState<"AMBAS" | "ENTRADAS" | "SALIDAS">("AMBAS");

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
    if (localStartDate) return localStartDate;
    if (savedWeekly?.startDate) return savedWeekly.startDate;
    return getMovieWeekStart(new Date());
  }, [localStartDate, savedWeekly]);

  const startDateObj = useMemo(() => {
    if (!weekStartStr) return null;
    const [y, m, d] = weekStartStr.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, [weekStartStr]);

  const dateLabelCompleto = useMemo(() => {
    return buildDateLabel(startDateObj, selectedDay);
  }, [startDateObj, selectedDay]);

  // ── 5. Filas a usar (Guardadas por defecto, o locales si se cargaron) ─────
  const weeklyRowsToUse = useMemo(() => {
    if (localRows && localRows.length > 0) return localRows;
    return savedWeekly?.weeklyRows || [];
  }, [localRows, savedWeekly]);

  // ── 6. Generación del reporte diario idéntico a Servicios ─────────────────
  const dailyData: ProgramacionBuildResult = useMemo(() => {
    const eventRows = buildEventWeeklyRows(eventos, weekStartStr);
    const combinedRows = [...weeklyRowsToUse, ...eventRows];

    return buildDailyProgramming(
      combinedRows,
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

  // ── 8. Extraer info del pie de página (Películas 3D y Cambio de Poster) ───
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

  // ── 9. Descargar Excel oficial con créditos ──────────────────────────────
  const handleDescargarExcel = async () => {
    if (weeklyRowsToUse.length === 0) {
      Alert.alert("Sin datos", "No hay programación cargada para exportar.");
      return;
    }

    try {
      setExportingExcel(true);
      const eventRows = buildEventWeeklyRows(eventos, weekStartStr);
      const generated = await generateProgramacionWorkbook({
        weeklyRows: [...weeklyRowsToUse, ...eventRows],
        day: selectedDay,
        dateLabel: dateLabelCompleto,
        includeCreditos,
        creditosList,
      });

      const dayLabel = WEEKDAY_LABELS[selectedDay];
      const fileName = `Programacion ${includeCreditos ? "con Creditos " : ""}${dayLabel} ${buildShortDate(
        startDateObj,
        selectedDay
      ).replace("/", "-")}.xlsx`;

      if (Platform.OS === "web") {
        downloadArrayBufferOnWeb(generated.buffer, fileName);
      } else {
        if (generated.uri) {
          await Sharing.shareAsync(generated.uri);
        } else {
          Alert.alert("Descarga completa", `Archivo generado: ${fileName}`);
        }
      }
    } catch (err: any) {
      console.error("[CoordinadoresProg] Error descargando Excel:", err);
      Alert.alert("Error", "No se pudo generar el archivo Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  // ── 10. Cargar archivo alternativo manualmente ───────────────────────────
  const handlePickAlternateFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
          "application/pdf",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file?.uri) return;

      const isPdf = file.name?.toLowerCase().endsWith(".pdf") || file.mimeType === "application/pdf";
      if (isPdf) {
        const { rows, startDate } = await parseWeeklyProgrammingPDF(file.uri);
        if (rows && rows.length > 0) {
          setLocalRows(rows);
          if (startDate) setLocalStartDate(dayjs(startDate).format("YYYY-MM-DD"));
        } else {
          Alert.alert("Formato no compatible", "El archivo PDF no contiene datos válidos.");
        }
      } else {
        const { rows, startDate } = await parseWeeklyProgrammingExcel(file.uri);
        if (rows && rows.length > 0) {
          setLocalRows(rows);
          if (startDate) setLocalStartDate(dayjs(startDate).format("YYYY-MM-DD"));
        } else {
          Alert.alert("Formato no compatible", "El archivo Excel no contiene datos de programación válidos.");
        }
      }
    } catch (e: any) {
      console.error("[CoordinadoresProg] Error cargando archivo:", e);
      Alert.alert("Error", "Ocurrió un error al leer el archivo.");
    }
  };

  // Imprimir directo en navegador
  const handleImprimir = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.print();
    } else {
      handleDescargarExcel();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

        {/* Acciones principales */}
        <View style={styles.topActions}>
          <TouchableOpacity
            onPress={handleDescargarExcel}
            style={[styles.btnExcel, exportingExcel && { opacity: 0.7 }]}
            activeOpacity={0.8}
            disabled={exportingExcel}
          >
            {exportingExcel ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
            ) : (
              <MaterialCommunityIcons name="download" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.btnExcelText}>Descargar Excel (.xlsx)</Text>
          </TouchableOpacity>

          {Platform.OS === "web" && (
            <TouchableOpacity onPress={handleImprimir} style={styles.btnPrint} activeOpacity={0.8}>
              <MaterialCommunityIcons name="printer" size={16} color={COLORS.text} style={{ marginRight: 6 }} />
              <Text style={styles.btnPrintText}>Imprimir</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handlePickAlternateFile}
            style={styles.btnAltFile}
            activeOpacity={0.8}
            title="Cargar otro Excel o PDF si deseas ver una semana diferente"
          >
            <MaterialCommunityIcons name="file-upload-outline" size={15} color={COLORS.muted} />
          </TouchableOpacity>
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
              "No se encontró un reporte guardado activo. Puedes subir un Excel o PDF."
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
            trackColor={{ false: "#CBD5E1", true: "#FDE68A" }}
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

          {/* Ocultar / Mostrar Nombre de Película */}
          <TouchableOpacity
            onPress={() => setColPelicula(!colPelicula)}
            style={[styles.colTogglePill, !colPelicula && styles.colTogglePillOff]}
          >
            <MaterialCommunityIcons
              name={colPelicula ? "filmstrip" : "filmstrip-off"}
              size={13}
              color={colPelicula ? "#166534" : "#DC2626"}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.colTogglePillText, !colPelicula && styles.colTogglePillTextOff]}>
              Películas: {colPelicula ? "Visibles" : "Ocultas"}
            </Text>
          </TouchableOpacity>

          {/* Ocultar / Mostrar Calificación */}
          <TouchableOpacity
            onPress={() => setColCalif(!colCalif)}
            style={[styles.colTogglePill, !colCalif && styles.colTogglePillOff]}
          >
            <MaterialCommunityIcons
              name={colCalif ? "tag-outline" : "tag-off-outline"}
              size={13}
              color={colCalif ? "#166534" : "#DC2626"}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.colTogglePillText, !colCalif && styles.colTogglePillTextOff]}>
              Calif: {colCalif ? "Visible" : "Oculta"}
            </Text>
          </TouchableOpacity>

          {/* Ocultar / Mostrar Créditos */}
          {includeCreditos && (
            <TouchableOpacity
              onPress={() => setColCreditos(!colCreditos)}
              style={[styles.colTogglePill, !colCreditos && styles.colTogglePillOff]}
            >
              <MaterialCommunityIcons
                name={colCreditos ? "clock-outline" : "clock-time-three-outline"}
                size={13}
                color={colCreditos ? "#B45309" : "#DC2626"}
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
            Para generar esta vista, sube el archivo Excel en Servicios &gt; Programaciones o cárgalo directamente aquí.
          </Text>
          <TouchableOpacity onPress={handlePickAlternateFile} style={styles.btnExcel} activeOpacity={0.8}>
            <MaterialCommunityIcons name="upload" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.btnExcelText}>Cargar archivo Excel</Text>
          </TouchableOpacity>
        </View>
      ) : vistaResumida ? (
        /* ══════════════════════════════════════════════════════════════════
           MODO VISTA RESUMIDA MOBILE (100% ANCHO, SIN SCROLL HORIZONTAL)
           ══════════════════════════════════════════════════════════════════ */
        <View style={styles.compactContainer}>
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
              {/* Rótulos de columnas compactas */}
              <View style={styles.compactColumnLabelsRow}>
                <View style={styles.compactSideLeftHeader}>
                  <Text style={styles.compactColLabelText}>ENTRADA (INICIO • SALA)</Text>
                </View>
                <View style={styles.compactArrowBox} />
                <View style={styles.compactSideRightHeader}>
                  <Text style={styles.compactColLabelText}>SALIDA (SALA • CRÉD • FIN)</Text>
                </View>
              </View>

              {Array.from({ length: maxRows }).map((_, idx) => {
                const inShow = entradaFiltrada[idx];
                const outShow = salidaFiltrada[idx];

                const is3D = inShow?.pelicula?.toUpperCase().includes("3D");
                const inKey = inShow ? `${inShow.sala}-${inShow.inicio}-${inShow.fin}-${inShow.pelicula}` : "";
                const isPosterChange = inShow ? dailyData.cambioSalaKeys.has(inKey) : false;
                const isRestricted = inShow ? isRestrictedRating(inShow.calificacion) : false;

                const outIs3D = outShow?.pelicula?.toUpperCase().includes("3D");

                return (
                  <View key={`comp-row-${idx}`} style={[styles.compactItemRow, idx % 2 === 1 && styles.compactItemRowZebra]}>
                    {/* Línea 1: Horarios y Salas */}
                    <View style={styles.compactTimeRow}>
                      {/* Lado Entrada */}
                      <View style={styles.compactSideLeft}>
                        {inShow ? (
                          <>
                            <View style={styles.compactBadgeInicio}>
                              <Text style={styles.compactBadgeInicioText}>{inShow.inicio}</Text>
                            </View>
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

                      {/* Flecha divisoria */}
                      <View style={styles.compactArrowBox}>
                        <MaterialCommunityIcons name="arrow-right-thin" size={16} color="#94A3B8" />
                      </View>

                      {/* Lado Salida */}
                      <View style={styles.compactSideRight}>
                        {outShow ? (
                          <>
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
                            <View style={styles.compactBadgeFin}>
                              <Text style={styles.compactBadgeFinText}>{outShow.fin}</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.compactDashText}>-</Text>
                        )}
                      </View>
                    </View>

                    {/* Línea 2: Título de película (si está activado) */}
                    {colPelicula && (inShow || outShow) && (
                      <View style={styles.compactMovieLine}>
                        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                          {inShow && (
                            <Text
                              style={[styles.compactMovieTitleText, is3D && styles.compactMovieTitle3D]}
                              numberOfLines={1}
                            >
                              {inShow.pelicula}
                            </Text>
                          )}
                          {isPosterChange && (
                            <View style={styles.posterBadgeMini}>
                              <Text style={styles.posterBadgeMiniText}>★</Text>
                            </View>
                          )}
                        </View>

                        {/* Si la salida tiene una película distinta o la entrada está vacía */}
                        {outShow && (!inShow || outShow.pelicula !== inShow.pelicula) && (
                          <View style={{ flex: 1, paddingLeft: 6, alignItems: "flex-end" }}>
                            <Text
                              style={[styles.compactMovieTitleTextRight, outIs3D && styles.compactMovieTitle3D]}
                              numberOfLines={1}
                            >
                              Fin: {outShow.pelicula}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
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

                return (
                  <View key={`in-card-${idx}`} style={[styles.singleSectionRow, idx % 2 === 1 && styles.singleSectionRowZebra]}>
                    <View style={styles.singleRowTop}>
                      <View style={styles.compactBadgeInicio}>
                        <Text style={styles.compactBadgeInicioText}>{show.inicio}</Text>
                      </View>
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

                return (
                  <View key={`out-card-${idx}`} style={[styles.singleSectionRow, idx % 2 === 1 && styles.singleSectionRowZebra]}>
                    <View style={styles.singleRowTop}>
                      <View style={styles.compactBadgeSala}>
                        <Text style={styles.compactBadgeSalaText}>Sala {show.sala}</Text>
                      </View>
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
                <Text style={{ fontWeight: "700", color: "#374151" }}>Películas 3D: </Text>
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
          <View style={[styles.excelSheetContainer, { minWidth: isMobile ? 860 : "100%" }]}>
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

                return (
                  <View key={`row-${idx}`} style={[styles.excelDataRow, idx % 2 === 1 && styles.excelDataRowZebra]}>
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
                              {colPelicula ? inShow.pelicula : `Sala ${inShow.sala} (Película oculta)`}
                            </Text>
                            {isPosterChange && (
                              <View style={styles.posterChangeBadge} title="Cambio de póster en sala">
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

                    {/* SEPARADOR CENTRAL */}
                    <View style={styles.excelDividerColumn} />

                    {/* ── LADO SALIDA ── */}
                    <View style={styles.excelColGroupSalida}>
                      {outShow ? (
                        <>
                          <View style={[styles.excelCell, { width: 44 }]}>
                            <Text style={styles.excelTextSala}>{outShow.sala}</Text>
                          </View>

                          {includeCreditos && colCreditos && (
                            <View
                              style={[
                                styles.excelCell,
                                { width: 68 },
                                outShow.creditosHoraReloj ? styles.excelCellCreditos : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.excelTextCreditos,
                                  !outShow.creditosHoraReloj && { color: COLORS.muted },
                                ]}
                              >
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
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
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
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
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnExcel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  btnExcelText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  btnPrint: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  btnPrintText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
  },
  btnAltFile: {
    padding: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: THEME.radius.sm,
  },

  // Barra de estado del reporte guardado
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  switchLabel: {
    fontSize: 10.5,
    color: "#92400E",
    fontWeight: "600",
  },

  // Selector de días de la semana (100% responsive y centrado en web)
  daySelectorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
    backgroundColor: "#F8FAFC",
  },
  dayTabMobileScroll: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  dayTabActive: {
    backgroundColor: "#166534",
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
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: THEME.radius.sm,
    padding: 5,
    marginBottom: 6,
    flexWrap: "wrap",
    gap: 6,
  },
  btnToggleVista: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#86EFAC",
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
    color: "#166534",
  },
  btnToggleVistaTextActive: {
    color: "#FFFFFF",
  },
  pillBadgeMode: {
    backgroundColor: "#DCFCE7",
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
    color: "#166534",
  },
  pillBadgeModeTextActive: {
    color: "#FFFFFF",
  },
  colFiltersScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionPills: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 2,
    borderRadius: 4,
    gap: 2,
  },
  sectionPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  sectionPillActive: {
    backgroundColor: "#FFFFFF",
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
    color: "#0F172A",
    fontWeight: "700",
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 2,
  },
  colTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  colTogglePillOff: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  colTogglePillText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#166534",
  },
  colTogglePillTextOff: {
    color: "#DC2626",
  },

  // Buscador rápido
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
    backgroundColor: "#F1F5F9",
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
    backgroundColor: "#FFFFFF",
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.muted,
  },
  emptyCard: {
    padding: 30,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
    backgroundColor: "#FFFFFF",
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    overflow: "hidden",
  },
  compactHeaderBanner: {
    backgroundColor: "#E2E8F0",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
    alignItems: "center",
  },
  compactHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
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
    backgroundColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  compactSideLeftHeader: {
    flex: 5,
  },
  compactSideRightHeader: {
    flex: 5,
    alignItems: "flex-end",
  },
  compactColLabelText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.5,
  },

  // Fila compacta apareada
  compactItemRow: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  compactItemRowZebra: {
    backgroundColor: "#F8FAFC",
  },
  compactTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  compactSideLeft: {
    flex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "nowrap",
  },
  compactSideRight: {
    flex: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    flexWrap: "nowrap",
  },
  compactArrowBox: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  compactBadgeInicio: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeInicioText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  compactBadgeSala: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  compactBadgeSalaText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1E293B",
  },
  compactBadgeCalif: {
    backgroundColor: "#F1F5F9",
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
    color: "#475569",
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
  compactBadgeFinText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#DC2626",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  compactBadgeMuted: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
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
    color: "#1E293B",
  },
  compactMovieTitleTextRight: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
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
    borderBottomColor: "#E2E8F0",
  },
  singleSectionRowZebra: {
    backgroundColor: "#F8FAFC",
  },
  singleRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  singleRowMovieText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1E293B",
    flex: 1,
  },
  compactFooterBox: {
    padding: 8,
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    gap: 4,
  },
  compactFooterLine: {
    fontSize: 10,
    color: "#475569",
    lineHeight: 14,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ESTILOS: HOJA EXCEL VISUAL IDÉNTICA (VISTA COMPLETA)
  // ══════════════════════════════════════════════════════════════════════════
  excelScroll: {
    width: "100%",
  },
  excelSheetContainer: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#334155",
    borderRadius: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },

  // Encabezado 1: Fecha (Gris Claro Excel)
  excelTopHeader: {
    backgroundColor: "#E2E8F0",
    borderBottomWidth: 1.5,
    borderBottomColor: "#334155",
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  excelTopHeaderText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.8,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },

  // Encabezado 2: ENTRADA / SALIDA
  excelSectionRow: {
    flexDirection: "row",
    backgroundColor: "#CBD5E1",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  excelSectionBlock: {
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  excelSectionBlockText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 1,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },

  // Encabezado 3: Columnas
  excelColumnsHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderBottomWidth: 1.5,
    borderBottomColor: "#334155",
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
    backgroundColor: "#334155",
    alignSelf: "stretch",
  },
  excelTh: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    paddingVertical: 4,
    borderRightWidth: 0.5,
    borderRightColor: "#94A3B8",
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },

  // Fila de datos
  excelDataRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#CBD5E1",
    minHeight: 25,
  },
  excelDataRowZebra: {
    backgroundColor: "#F8FAFC",
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
    borderRightColor: "#CBD5E1",
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
    backgroundColor: "#FEF2F2",
  },
  excelCellCreditos: {
    backgroundColor: "#FEF3C7",
  },
  excelCellCalifRestricted: {
    backgroundColor: "#000000",
  },

  // Tipografías de celda
  excelTextInicio: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    fontFamily: Platform.OS === "web" ? "Consolas, monospace" : "System",
  },
  excelTextSala: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  excelTextHab: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "600",
  },
  excelTextMovie: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
    fontFamily: Platform.OS === "web" ? "Calibri, Arial, sans-serif" : "System",
  },
  excelTextMovie3D: {
    color: "#FFFFFF",
  },
  excelTextCalif: {
    fontSize: 10,
    fontWeight: "700",
    color: "#334155",
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
    borderTopColor: "#334155",
    backgroundColor: "#F8FAFC",
  },
  excelLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#CBD5E1",
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
    color: "#334155",
  },
  excelLegendFooter: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#F1F5F9",
  },
  excelLegendFooterText: {
    fontSize: 9,
    color: "#64748B",
    textAlign: "center",
  },
});

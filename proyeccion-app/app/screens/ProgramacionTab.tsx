// app/screens/ProgramacionTab.tsx

import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Animated,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  onSnapshot,
} from "@/lib/dbService";
import dayjs from "dayjs";
import { toDate } from "@/shared/utils";

import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { useAuthUser } from "../../lib/useAuthUser";
import {
  generateProgramacionWorkbook,
  generateWeeklyProgramacionWorkbook,
  parseWeeklyProgrammingExcel,
  buildDailyProgramming,
} from "../../lib/programacion/excel";
import { parseWeeklyProgrammingPDF } from "../../lib/programacion/pdf";
import { WEEKDAY_LABELS, WeekdayKey, FloorConfig, WeeklyMovieRow } from "../../lib/programacion/types";
import { COLORS, THEME } from "../../lib/theme";

const PROG = { success: "#1d7a34", successSoft: "#eaf7ee" };

/** Índice del día dentro de la semana de programación (jueves = 0) */
const DAY_OFFSETS: Record<WeekdayKey, number> = {
  jueves: 0,
  viernes: 1,
  sabado: 2,
  domingo: 3,
  lunes: 4,
  martes: 5,
  miercoles: 6,
};

const MONTH_LABELS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Dado el jueves de inicio de la semana y el día seleccionado,
 * calcula la fecha real y devuelve un label como "Jueves 05 de Junio de 2025".
 */
function buildDateLabel(startDate: Date | null, day: WeekdayKey): string {
  const label = WEEKDAY_LABELS[day];
  if (!startDate) return label;

  const offset = DAY_OFFSETS[day];
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);

  const dd = String(d.getDate()).padStart(2, "0");
  const month = MONTH_LABELS_ES[d.getMonth()];
  const yyyy = d.getFullYear();

  return `${label} ${dd} de ${month.charAt(0).toUpperCase() + month.slice(1)} de ${yyyy}`;
}

/**
 * Nombre del archivo: "Programacion Jueves 05-Jun-2025.xlsx"
 */
function buildFileName(startDate: Date | null, day: WeekdayKey): string {
  const label = WEEKDAY_LABELS[day];
  if (!startDate) return `Programacion ${label}.xlsx`;

  const offset = DAY_OFFSETS[day];
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `Programacion ${label} ${dd}-${mm}-${yyyy}.xlsx`;
}

const DAYS: WeekdayKey[] = [
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "lunes",
  "martes",
  "miercoles",
];

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
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startD = start.getUTCDate();
  const startM = start.getUTCMonth() + 1;
  const endD = end.getUTCDate();
  const endM = end.getUTCMonth() + 1;
  return `Semana del ${startD}/${startM} al ${endD}/${endM}`;
}

function isMarketingTag(tag: string): boolean {
  if (!tag) return true;
  const t = tag.toUpperCase().trim();
  return t.includes("CONTENIDO ALTERNATIVO") || 
         t.includes("CON RESTRICCIONES") || 
         t.includes("SIN PROMOCIONES") ||
         t === "";
}

function mapApiSessionsToWeeklyRows(sessions: any[]): WeeklyMovieRow[] {
  const groupMap: Record<string, {
    sala: number;
    pelicula: string;
    calificacion: string;
    horariosPorDia: Record<WeekdayKey, string[]>;
  }> = {};

  sessions.forEach((session: any) => {
    const salaNum = Number(session.theaterRoom);
    if (isNaN(salaNum)) return;

    const formatStr = (session.sessionFormat || "").toUpperCase().includes("3D") ? "3D" : "2D";
    const langName = (session.language?.name || session.language || "").toUpperCase();
    let langStr = "CAS";
    if (langName.includes("SUB") || langName.includes("ING") || langName.includes("ORIG")) {
      langStr = "SUB";
    }

    const pelicula = `${session.movieName} ${formatStr} ${langStr}`.toUpperCase();
    const groupKey = `${salaNum}_${pelicula}`;
    const currentRating = session.rating || session.calificacion || session.tags?.[0]?.label || "";

    if (!groupMap[groupKey]) {
      groupMap[groupKey] = {
        sala: salaNum,
        pelicula,
        calificacion: currentRating,
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
    } else {
      const existing = groupMap[groupKey].calificacion;
      if (!existing || (isMarketingTag(existing) && !isMarketingTag(currentRating))) {
        groupMap[groupKey].calificacion = currentRating;
      }
    }

    let dtStr = session.sessionDateTime || "";
    if (dtStr && !dtStr.includes("T") && dtStr.includes(" ")) {
      dtStr = dtStr.replace(" ", "T");
    }
    const utcDate = new Date(dtStr);
    const arDate = new Date(utcDate.getTime());
    if (arDate.getUTCHours() < 6) {
      arDate.setTime(arDate.getTime() - 24 * 60 * 60 * 1000);
    }

    const dayNum = arDate.getUTCDay();
    const dayMap: Record<number, WeekdayKey> = {
      0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles",
      4: "jueves", 5: "viernes", 6: "sabado"
    };
    const sessionDay = dayMap[dayNum];

    const hours = String(arDate.getUTCHours()).padStart(2, '0');
    const mins = String(arDate.getUTCMinutes()).padStart(2, '0');
    const inicio = `${hours}:${mins}`;

    const durationMins = (session.runTime || 120) + 15;
    const endMins = (arDate.getUTCHours() * 60 + arDate.getUTCMinutes() + durationMins) % 1440;
    const endH = Math.floor(endMins / 60);
    const endM = endMins % 60;
    const fin = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    const timeRangeStr = `${inicio} - ${fin}`;

    if (!groupMap[groupKey].horariosPorDia[sessionDay].includes(timeRangeStr)) {
      groupMap[groupKey].horariosPorDia[sessionDay].push(timeRangeStr);
    }
  });

  const result = Object.values(groupMap);
  result.forEach((row) => {
    (Object.keys(row.horariosPorDia) as WeekdayKey[]).forEach((day) => {
      row.horariosPorDia[day].sort((a, b) => {
        const timeA = a.split(" - ")[0];
        const timeB = b.split(" - ")[0];
        const minA = Number(timeA.split(":")[0]) * 60 + Number(timeA.split(":")[1]);
        const minB = Number(timeB.split(":")[0]) * 60 + Number(timeB.split(":")[1]);
        const adjA = minA < 360 ? minA + 1440 : minA;
        const adjB = minB < 360 ? minB + 1440 : minB;
        return adjA - adjB;
      });
    });
  });

  return result.sort((a, b) => {
    if (a.sala !== b.sala) return a.sala - b.sala;
    return a.pelicula.localeCompare(b.pelicula);
  });
}



function getCinematicWeekdayKey(date: Date): WeekdayKey {
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

function addMinutesToTimeStr(timeStr: string, minsToAdd: number): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const totalMins = (h * 60 + m + minsToAdd) % 1440;
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function buildEventWeeklyRows(eventos: any[], weekStart: string): WeeklyMovieRow[] {
  const rowsMap: Record<string, WeeklyMovieRow> = {};

  eventos.forEach((evt) => {
    if (!evt.sala || evt.sala.trim() === "") return;
    if (evt.duracion === undefined || evt.duracion === null || String(evt.duracion).trim() === "") return;

    const eventDate = toDate(evt.diaHora);
    const eventWeekStart = getMovieWeekStart(eventDate);
    if (eventWeekStart !== weekStart) return;

    const eventDayKey = getCinematicWeekdayKey(eventDate);
    const startHours = String(eventDate.getHours()).padStart(2, '0');
    const startMins = String(eventDate.getMinutes()).padStart(2, '0');
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

export default function ProgramacionTab() {
  const { cineId } = useAuthUser();

  const [sourceMode, setSourceMode] = useState<"file" | "api">("file");
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => getMovieWeekStartForNow());

  const availableWeeks = useMemo(() => {
    const list: string[] = [];
    const currentThur = getMovieWeekStartForNow();
    const [y, m, d] = currentThur.split('-');
    const thurDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));

    for (let i = -4; i < 6; i++) {
      const nextThur = new Date(thurDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const yyyy = nextThur.getUTCFullYear();
      const mm = String(nextThur.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nextThur.getUTCDate()).padStart(2, '0');
      list.push(`${yyyy}-${mm}-${dd}`);
    }
    return list;
  }, []);

  const [weeklyUri, setWeeklyUri] = useState<string | null>(null);
  const [weeklyName, setWeeklyName] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<WeekdayKey>("jueves");
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // Animación del banner parpadeante en Rojo
  const [blinkOpacity] = useState(new Animated.Value(1));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkOpacity, {
          toValue: 0.3,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(blinkOpacity, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Estado para la fecha de inicio de semana seleccionada/detectada
  const [fechaInicioSemana, setFechaInicioSemana] = useState(() => {
    // Default al jueves más reciente
    const d = dayjs();
    const diff = d.day() - 4; // 4 = Jueves
    const thur = diff >= 0 ? d.subtract(diff, "day") : d.subtract(7 + diff, "day");
    return thur.format("YYYY-MM-DD");
  });

  // Estado para las filas parseadas (si se carga un archivo y se quiere guardar)
  const [loadedWeeklyRows, setLoadedWeeklyRows] = useState<any[] | null>(null);
  const [loadedWeeklyType, setLoadedWeeklyType] = useState<"excel" | "pdf" | "api" | null>(null);

  // Estados para el Weekly guardado en Firestore
  const [savedWeekly, setSavedWeekly] = useState<{
    startDate: string;
    savedAt: string;
    weeklyRows: any[];
  } | null>(null);
  const [useSavedWeekly, setUseSavedWeekly] = useState(false);
  const [loadingSavedWeekly, setLoadingSavedWeekly] = useState(false);

  async function loadLatestSavedWeekly() {
    if (!cineId) return;
    try {
      setLoadingSavedWeekly(true);
      const docRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", "actual");
      const snap = await getDoc(docRef);
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
    } catch (err) {
      console.error("[Weekly] Error al cargar programación guardada:", err);
    } finally {
      setLoadingSavedWeekly(false);
    }
  }

  useEffect(() => {
    loadLatestSavedWeekly();
  }, [cineId]);

  useEffect(() => {
    if (!cineId) return;

    const ref = collection(db, CINES_COLLECTION, cineId, "eventos");
    const unsubscribe = onSnapshot(
      ref,
      (snapshot: any) => {
        const list: any[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data(),
          });
        });
        setEventos(list);
      },
      (error: any) => {
        console.error("[ProgramacionTab] Error loading eventos:", error);
      }
    );

    return () => unsubscribe();
  }, [cineId]);

  const [creditosList, setCreditosList] = useState<any[]>([]);
  const [includeCreditos, setIncludeCreditos] = useState(false);

  useEffect(() => {
    if (!cineId) return;

    const ref = collection(db, CINES_COLLECTION, cineId, "creditos");
    const unsubscribe = onSnapshot(
      ref,
      (snapshot: any) => {
        const list: any[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data(),
          });
        });
        setCreditosList(list);
      },
      (error: any) => {
        console.error("[ProgramacionTab] Error loading creditos:", error);
      }
    );

    return () => unsubscribe();
  }, [cineId]);

  const [summary, setSummary] = useState<{
    entrada: number;
    salida: number;
    fileName: string;
  } | null>(null);
  const [useFloors, setUseFloors] = useState(false);
  const [numFloors, setNumFloors] = useState(2);
  const [floorRanges, setFloorRanges] = useState([
    { from: "1", to: "4" },
    { from: "5", to: "8" },
    { from: "9", to: "12" },
    { from: "13", to: "16" },
  ]);

  const canGenerate = useMemo(() => {
    if (useSavedWeekly) {
      return !!savedWeekly && !loading;
    }
    return !!weeklyUri && !loading;
  }, [useSavedWeekly, savedWeekly, weeklyUri, loading]);

  // Extract daily programming data for preview (matches Excel generation exactly)
  const previewData = useMemo(() => {
    const rowsToUse = useSavedWeekly ? (savedWeekly?.weeklyRows || []) : (loadedWeeklyRows || []);
    const weekStart = useSavedWeekly ? (savedWeekly?.startDate || fechaInicioSemana) : fechaInicioSemana;
    const eventRows = buildEventWeeklyRows(eventos, weekStart);
    return buildDailyProgramming(
      [...rowsToUse, ...eventRows],
      selectedDay,
      WEEKDAY_LABELS[selectedDay],
      creditosList,
      includeCreditos
    );
  }, [useSavedWeekly, savedWeekly, loadedWeeklyRows, selectedDay, eventos, fechaInicioSemana, creditosList, includeCreditos]);

  async function pickWeeklyFile() {
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

      setWeeklyUri(file.uri);
      setWeeklyName(file.name ?? (isPdf ? "sessionByScreen.pdf" : "archivo-semanal.xlsx"));
      setSummary(null);
      setUseSavedWeekly(false);
      setStatusText(isPdf ? "Cargando y procesando PDF..." : "Cargando y procesando Excel...");

      setLoading(true);
      if (isPdf) {
        const { rows, startDate } = await parseWeeklyProgrammingPDF(file.uri);
        if (rows && rows.length > 0) {
          setLoadedWeeklyRows(rows);
          setLoadedWeeklyType("pdf");
          if (startDate) {
            setFechaInicioSemana(dayjs(startDate).format("YYYY-MM-DD"));
            setStatusText(`PDF cargado correctamente. Fecha detectada: ${dayjs(startDate).format("DD/MM/YYYY")}`);
          } else {
            const d = dayjs();
            const diff = d.day() - 4; // Jueves
            const thur = diff >= 0 ? d.subtract(diff, "day") : d.subtract(7 + diff, "day");
            setFechaInicioSemana(thur.format("YYYY-MM-DD"));
            setStatusText("PDF cargado. No se detectó fecha en el encabezado.");
          }
        } else {
          setLoadedWeeklyRows(null);
          setStatusText("El archivo PDF no tiene un formato compatible.");
        }
      } else {
        const { rows, startDate } = await parseWeeklyProgrammingExcel(file.uri);
        if (rows && rows.length > 0) {
          setLoadedWeeklyRows(rows);
          setLoadedWeeklyType("excel");
          if (startDate) {
            setFechaInicioSemana(dayjs(startDate).format("YYYY-MM-DD"));
            setStatusText(`Excel cargado correctamente. Fecha detectada: ${dayjs(startDate).format("DD/MM/YYYY")}`);
          } else {
            // Calcular jueves por defecto
            const d = dayjs();
            const diff = d.day() - 4; // Jueves
            const thur = diff >= 0 ? d.subtract(diff, "day") : d.subtract(7 + diff, "day");
            setFechaInicioSemana(thur.format("YYYY-MM-DD"));
            setStatusText("Excel cargado. No se detectó fecha en el encabezado.");
          }
        } else {
          setLoadedWeeklyRows(null);
          setStatusText("El archivo Excel no tiene un formato compatible.");
        }
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo procesar el archivo seleccionado.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadFromApi() {
    if (!cineId) return;
    try {
      setLoading(true);
      setStatusText("Obteniendo showtimes desde la API...");

      const docRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        Alert.alert(
          "Sin datos",
          `No hay showtimes guardados para la semana ${selectedWeekStart}. Por favor sincronizá la programación primero en la sección correspondiente.`
        );
        return;
      }

      const sessions = snap.data()?.sessions || [];
      if (sessions.length === 0) {
        Alert.alert("Sin datos", `La programación para la semana ${selectedWeekStart} está vacía.`);
        return;
      }

      setStatusText("Procesando programación de la API...");
      const rows = mapApiSessionsToWeeklyRows(sessions);

      if (rows && rows.length > 0) {
        setLoadedWeeklyRows(rows);
        setLoadedWeeklyType("api");
        setFechaInicioSemana(selectedWeekStart);
        setWeeklyName(`API Programación ${selectedWeekStart}`);
        setWeeklyUri("api");
        setUseSavedWeekly(false);
        setSummary(null);
        setStatusText(`Programación API cargada correctamente. Se detectaron ${rows.length} películas.`);
      } else {
        setLoadedWeeklyRows(null);
        setStatusText("No se encontraron sesiones válidas en la programación.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Ocurrió un error al cargar la programación desde la API.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!useSavedWeekly && !weeklyUri) return;
    try {
      setLoading(true);
      setSummary(null);
      setStatusText("Procesando datos...");

      let weeklyRows: WeeklyMovieRow[] = [];
      let dateLabelToUse = WEEKDAY_LABELS[selectedDay];
      let startDateToUse: Date | null = null;

      let shouldSaveAutomatically = false;
      let rowsToSave: any[] = [];
      let startDateToSave = "";

      if (useSavedWeekly && savedWeekly) {
        weeklyRows = savedWeekly.weeklyRows;
        const parsedStartDate = dayjs(savedWeekly.startDate).toDate();
        startDateToUse = parsedStartDate;
        dateLabelToUse = buildDateLabel(parsedStartDate, selectedDay);
      } else if (loadedWeeklyRows && loadedWeeklyRows.length > 0) {
        weeklyRows = loadedWeeklyRows;
        const parsedStartDate = dayjs(fechaInicioSemana).toDate();
        startDateToUse = parsedStartDate;
        dateLabelToUse = buildDateLabel(parsedStartDate, selectedDay);

        shouldSaveAutomatically = true;
        rowsToSave = loadedWeeklyRows;
        startDateToSave = fechaInicioSemana;
      } else if (weeklyUri) {
        const isPdf = weeklyName?.toLowerCase().endsWith(".pdf") || false;
        const { rows, startDate } = isPdf
          ? await parseWeeklyProgrammingPDF(weeklyUri)
          : await parseWeeklyProgrammingExcel(weeklyUri);
        weeklyRows = rows;
        startDateToUse = startDate;
        if (startDate) {
          dateLabelToUse = buildDateLabel(startDate, selectedDay);
        }

        shouldSaveAutomatically = true;
        rowsToSave = rows;
        startDateToSave = startDate ? dayjs(startDate).format("YYYY-MM-DD") : fechaInicioSemana;
      }

      if (!weeklyRows.length) {
        Alert.alert("Sin datos", "La programación no contiene datos válidos.");
        return;
      }

      const weekStartStr = startDateToSave || (startDateToUse instanceof Date ? dayjs(startDateToUse).format("YYYY-MM-DD") : startDateToUse) || fechaInicioSemana;
      const eventRows = buildEventWeeklyRows(eventos, weekStartStr);
      const generated = await generateProgramacionWorkbook({
        weeklyRows: [...weeklyRows, ...eventRows],
        day: selectedDay,
        dateLabel: dateLabelToUse,
        floorConfig: useFloors ? {
          active: true,
          count: parseInt(numFloors.toString(), 10) || 2,
          ranges: floorRanges.slice(0, parseInt(numFloors.toString(), 10)).map(r => ({
            from: parseInt(r.from.toString(), 10) || 0,
            to: parseInt(r.to.toString(), 10) || 0
          }))
        } : undefined,
        includeCreditos,
        creditosList,
      });

      let finalFileName = generated.fileName;
      if (startDateToUse) {
        finalFileName = buildFileName(startDateToUse, selectedDay);
        if (includeCreditos) {
          finalFileName = finalFileName.replace("Programacion ", "Programacion con Creditos ");
        }
      }

      setSummary({
        entrada: generated.data.entrada.length,
        salida: generated.data.salida.length,
        fileName: finalFileName,
      });

      setStatusText("Generación exitosa");

      // Si guardamos automáticamente, corremos la misma lógica que handleSaveWeeklyToDb
      if (shouldSaveAutomatically && cineId && rowsToSave.length > 0) {
        try {
          const docRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", "actual");
          const dateDocRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", startDateToSave);
          const sanitizedRows = JSON.parse(JSON.stringify(rowsToSave));
          const payload = {
            startDate: startDateToSave,
            weeklyRows: sanitizedRows,
            savedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(docRef, payload);
          await setDoc(dateDocRef, payload);

          setSavedWeekly({
            startDate: payload.startDate,
            savedAt: payload.savedAt,
            weeklyRows: payload.weeklyRows,
          });
          setUseSavedWeekly(true);

          // Limpiar archivo local temporal cargado tras guardar con éxito
          setWeeklyUri(null);
          setWeeklyName(null);
          setLoadedWeeklyRows(null);
          setLoadedWeeklyType(null);

          await loadLatestSavedWeekly();
          setStatusText("Generación exitosa. Reporte guardado para futuros usos.");
        } catch (saveError) {
          console.error("[Weekly Save Automatic] Error al guardar en la BD:", saveError);
        }
      }

      if (Platform.OS === "web") {
        if (generated.webArrayBuffer) {
          const blob = new Blob([generated.webArrayBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = finalFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        return;
      }

      if (generated.uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(generated.uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Ocurrió un problema al generar el Excel.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateWeekly() {
    if (!useSavedWeekly && !weeklyUri) return;
    try {
      setLoading(true);
      setSummary(null);
      setStatusText("Generando reporte semanal...");

      let weeklyRows: WeeklyMovieRow[] = [];
      let startDateToUse: Date | null = null;

      let shouldSaveAutomatically = false;
      let rowsToSave: any[] = [];
      let startDateToSave = "";

      if (useSavedWeekly && savedWeekly) {
        weeklyRows = savedWeekly.weeklyRows;
        startDateToUse = dayjs(savedWeekly.startDate).toDate();
      } else if (loadedWeeklyRows && loadedWeeklyRows.length > 0) {
        weeklyRows = loadedWeeklyRows;
        startDateToUse = dayjs(fechaInicioSemana).toDate();
        shouldSaveAutomatically = true;
        rowsToSave = loadedWeeklyRows;
        startDateToSave = fechaInicioSemana;
      } else if (weeklyUri) {
        const isPdf = weeklyName?.toLowerCase().endsWith(".pdf") || false;
        const { rows, startDate } = isPdf
          ? await parseWeeklyProgrammingPDF(weeklyUri)
          : await parseWeeklyProgrammingExcel(weeklyUri);
        weeklyRows = rows;
        startDateToUse = startDate;
        shouldSaveAutomatically = true;
        rowsToSave = rows;
        startDateToSave = startDate ? dayjs(startDate).format("YYYY-MM-DD") : fechaInicioSemana;
      }

      if (!weeklyRows.length) {
        Alert.alert("Sin datos", "La programación no contiene datos válidos.");
        return;
      }

      const weekStartStr = startDateToSave || (startDateToUse instanceof Date ? dayjs(startDateToUse).format("YYYY-MM-DD") : startDateToUse) || fechaInicioSemana;
      const eventRows = buildEventWeeklyRows(eventos, weekStartStr);
      const generated = await generateWeeklyProgramacionWorkbook({
        weeklyRows: [...weeklyRows, ...eventRows],
        startDate: startDateToUse,
        floorConfig: useFloors ? {
          active: true,
          count: parseInt(numFloors.toString(), 10) || 2,
          ranges: floorRanges.slice(0, parseInt(numFloors.toString(), 10)).map(r => ({
            from: parseInt(r.from.toString(), 10) || 0,
            to: parseInt(r.to.toString(), 10) || 0
          }))
        } : undefined,
        includeCreditos,
        creditosList,
      });

      // Si guardamos automáticamente, corremos la misma lógica que handleSaveWeeklyToDb
      if (shouldSaveAutomatically && cineId && rowsToSave.length > 0) {
        try {
          const docRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", "actual");
          const dateDocRef = doc(db, CINES_COLLECTION, cineId, "programacion_semanal", startDateToSave);
          const sanitizedRows = JSON.parse(JSON.stringify(rowsToSave));
          const payload = {
            startDate: startDateToSave,
            weeklyRows: sanitizedRows,
            savedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(docRef, payload);
          await setDoc(dateDocRef, payload);

          setSavedWeekly({
            startDate: payload.startDate,
            savedAt: payload.savedAt,
            weeklyRows: payload.weeklyRows,
          });
          setUseSavedWeekly(true);

          // Limpiar archivo local temporal cargado tras guardar con éxito
          setWeeklyUri(null);
          setWeeklyName(null);
          setLoadedWeeklyRows(null);
          setLoadedWeeklyType(null);

          await loadLatestSavedWeekly();
        } catch (saveError) {
          console.error("[Weekly Save Automatic] Error al guardar en la BD:", saveError);
        }
      }

      setStatusText("Generación semanal exitosa");

      if (Platform.OS === "web") {
        if (generated.webArrayBuffer) {
          const blob = new Blob([generated.webArrayBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = generated.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        return;
      }

      if (generated.uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(generated.uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Ocurrió un problema al generar el Excel semanal.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <ScrollView style={s.main} contentContainerStyle={s.content}>
      {/* CARTEL EN ROJO QUE PARPADEE ANIMADAMENTE */}
      <Animated.View style={[s.warningBanner, { opacity: blinkOpacity }]}>
        <Text style={s.warningBannerText}>
          ⚠️ ATENCIÓN: Si hubo cambios de programación debe descargar el reporte nuevo, por favor consulte a sus encargados.
        </Text>
      </Animated.View>


      {/* TARJETA DE MANUAL */}
      <Pressable
        style={[s.card, s.manualCard, showManual && s.manualCardActive]}
        onPress={() => setShowManual(!showManual)}
      >
        <View style={s.rowBetween}>
          <View style={s.manualHeader}>
            <Text style={{ fontSize: 18 }}>📖</Text>
            <Text style={s.manualTitle}>Manual de Instrucciones e Impresión</Text>
          </View>
          <Text style={s.manualChevron}>{showManual ? "▲" : "▼"}</Text>
        </View>

        {showManual && (
          <View style={s.manualContent}>
            <View style={s.divider} />

            <View style={s.step}>
              <Text style={s.stepNumber}>1</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Exportación desde Vista</Text>
                <Text style={s.stepText}>• Buscar reporte: "Weekly sessions by screen" o "Función por pantalla semanal".</Text>
                <Text style={s.stepText}>• Fechas: Elegir rango de Jueves a Jueves.</Text>
                <Text style={s.stepText}>• Idioma: Seleccionar Inglés (opción superior a la fecha).</Text>
                <Text style={s.stepText}>• Exportar: Tocar flecha superior y elegir "Excel Data Only" o "PDF".</Text>
              </View>
            </View>

            <View style={s.step}>
              <Text style={s.stepNumber}>2</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Generación en esta App</Text>
                <Text style={s.stepText}>• Cargar el archivo generado en la sección de "Archivo Fuente".</Text>
                <Text style={s.stepText}>• Seleccionar el día deseado y configurar "División por Pisos" si se requiere.</Text>
              </View>
            </View>

            <View style={s.step}>
              <Text style={s.stepNumber}>3</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Configuración de Impresora</Text>
                <Text style={s.stepText}>• Abrir el archivo generado y habilitar edición.</Text>
                <Text style={s.stepText}>• Ajustes Generales: Imprimir Todo el Libro | Orientación Horizontal | Papel A4 | Ajustar hoja a una página | Imprimir a una cara.</Text>
                <Text style={s.stepText}>• IMPORTANTE (Doble Cara): Si activaste pisos, seleccionar "Imprimir a doble cara" y elegir la opción "Voltear por el lado largo". Asegurarse de aplicar esto a ambas hojas.</Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>

      <View style={s.card}>
        {/* SECCIÓN 1: ORIGEN DE DATOS */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Origen de Datos</Text>

          {/* Cartel naranja de información */}
          <View style={[s.pdfInfoBanner, { marginBottom: 12 }]}>
            <Text style={s.pdfInfoBannerText}>
              💡 NUEVO: ¡Ahora podés importar la programación semanal directamente desde la API sin necesidad de subir archivos PDF o Excel! Seleccioná la pestaña "Programación API", elegí la semana y listo.
            </Text>
          </View>

          {/* Selector de origen */}
          <View style={s.tabContainer}>
            <Pressable
              style={[s.tabButton, sourceMode === "file" && s.tabButtonActive]}
              onPress={() => setSourceMode("file")}
            >
              <MaterialCommunityIcons
                name="file-document-outline"
                size={16}
                color={sourceMode === "file" ? COLORS.primary : COLORS.muted}
                style={{ marginRight: 6 }}
              />
              <Text style={[s.tabButtonText, sourceMode === "file" && s.tabButtonTextActive]}>
                Archivo (PDF/Excel)
              </Text>
            </Pressable>
            <Pressable
              style={[s.tabButton, sourceMode === "api" && s.tabButtonActive]}
              onPress={() => setSourceMode("api")}
            >
              <MaterialCommunityIcons
                name="api"
                size={16}
                color={sourceMode === "api" ? COLORS.primary : COLORS.muted}
                style={{ marginRight: 6 }}
              />
              <Text style={[s.tabButtonText, sourceMode === "api" && s.tabButtonTextActive]}>
                Programación API
              </Text>
            </Pressable>
          </View>

          {sourceMode === "file" ? (
            <>

              <View style={{ position: "relative" }}>
                <Pressable
                  style={[s.filePicker, !!weeklyName && s.filePickerActive, { paddingRight: weeklyName ? 48 : 12 }]}
                  onPress={pickWeeklyFile}
                >
                  <View style={s.filePickerIcon}>
                    <Text style={{ fontSize: 20 }}>
                      {weeklyName?.toLowerCase().endsWith(".pdf") ? "📄" : "📊"}
                    </Text>
                  </View>
                  <View style={s.filePickerInfo}>
                    <Text style={s.filePickerText}>
                      {weeklyName || "Seleccionar Archivo Semanal (Excel o PDF)"}
                    </Text>
                    <Text style={s.filePickerSubtext}>
                      {weeklyName ? "Archivo cargado" : "Formatos .xlsx, .xls, .pdf"}
                    </Text>
                  </View>
                </Pressable>

                {/* Botón X para sacar el archivo cargado */}
                {!!weeklyUri && weeklyUri !== "api" && (
                  <Pressable
                    style={s.clearFileButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      setWeeklyUri(null);
                      setWeeklyName(null);
                      setLoadedWeeklyRows(null);
                      setLoadedWeeklyType(null);
                      setStatusText("");
                    }}
                  >
                    <Text style={s.clearFileButtonText}>✕</Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={s.miniLabel}>Seleccionar Semana de Programación:</Text>
              {(() => {
                const currentIndex = availableWeeks.indexOf(selectedWeekStart);
                if (currentIndex === -1) return null;
                const canGoPrev = currentIndex > 0;
                const canGoNext = currentIndex < availableWeeks.length - 1;
                const currentWeek = getMovieWeekStartForNow();
                const isCurrent = selectedWeekStart === currentWeek;
                
                let weekLabel = formatWeekRange(selectedWeekStart);
                if (isCurrent) {
                  weekLabel += " (Actual)";
                } else if (selectedWeekStart > currentWeek) {
                  weekLabel += " (Preventa)";
                } else if (selectedWeekStart < currentWeek) {
                  weekLabel += " (Pasada)";
                }
                
                return (
                  <View style={s.singleWeekSelectorContainer}>
                    <Pressable
                      disabled={!canGoPrev}
                      onPress={() => setSelectedWeekStart(availableWeeks[currentIndex - 1])}
                      style={[s.arrowButton, !canGoPrev && s.arrowButtonDisabled]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "bold", color: canGoPrev ? COLORS.text : COLORS.muted }}>◀</Text>
                    </Pressable>
                    
                    <View style={s.singleWeekLabelContainer}>
                      <Text style={s.singleWeekLabelText}>{weekLabel}</Text>
                    </View>
        
                    <Pressable
                      disabled={!canGoNext}
                      onPress={() => setSelectedWeekStart(availableWeeks[currentIndex + 1])}
                      style={[s.arrowButton, !canGoNext && s.arrowButtonDisabled]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "bold", color: canGoNext ? COLORS.text : COLORS.muted }}>▶</Text>
                    </Pressable>
                  </View>
                );
              })()}

              <Pressable
                style={[s.compactSaveButton, loading && { opacity: 0.7 }]}
                onPress={handleLoadFromApi}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.compactSaveButtonText}>📡 CARGAR DESDE API</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* Card compacto verde colocado abajo de donde cargas el reporte */}
          {loadedWeeklyRows && (
            <View style={s.compactSuccessCard}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.compactSuccessTitle}>
                  📁 Reporte semanal detectado ({loadedWeeklyType === "api" ? "API" : loadedWeeklyType?.toUpperCase()})
                </Text>
                <Text style={s.compactSuccessText}>
                  Se extrajeron {loadedWeeklyRows.length} películas de la programación.
                </Text>
                <Text style={s.compactSuccessTime}>
                  Cargado: {dayjs().format("DD/MM/YYYY HH:mm")} hs
                </Text>
              </View>

              {/* Botón X para sacar el reporte API si queremos */}
              {weeklyUri === "api" && (
                <Pressable
                  style={{
                    backgroundColor: "rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    alignSelf: "flex-start",
                    marginTop: 4
                  }}
                  onPress={() => {
                    setWeeklyUri(null);
                    setWeeklyName(null);
                    setLoadedWeeklyRows(null);
                    setLoadedWeeklyType(null);
                    setStatusText("");
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "bold" }}>✕ Limpiar API</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={s.divider} />

        {/* SECCIÓN 2: DÍA */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Día de Programación</Text>
          <View style={s.daysGrid}>
            {DAYS.map((day) => {
              const active = selectedDay === day;
              return (
                <Pressable
                  key={day}
                  onPress={() => setSelectedDay(day)}
                  style={[s.dayButton, active && s.dayButtonActive]}
                >
                  <Text style={[s.dayButtonText, active && s.dayButtonTextActive]}>
                    {WEEKDAY_LABELS[day].substring(0, 3)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.divider} />

        {/* SECCIÓN 3: PISOS */}
        <View style={s.section}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.sectionLabel}>División por Pisos</Text>
              <Text style={s.sectionSublabel}>Habilite la opción para que el Excel sea generado con la separación de pisos en el dorso de la programación.</Text>
            </View>
            <Pressable
              style={[s.switch, useFloors && s.switchActive]}
              onPress={() => setUseFloors(!useFloors)}
            >
              <View style={[s.switchThumb, useFloors && s.switchThumbActive]} />
            </Pressable>
          </View>

          {useFloors && (
            <View style={s.floorConfig}>
              <Text style={s.miniLabel}>Cantidad de Niveles:</Text>
              <View style={s.numFloorsRow}>
                {[1, 2, 3, 4].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setNumFloors(n)}
                    style={[s.numButton, numFloors === n && s.numButtonActive]}
                  >
                    <Text style={[s.numButtonText, numFloors === n && s.numButtonTextActive]}>{n}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.rangesContainer}>
                {Array.from({ length: numFloors }).map((_, i) => (
                  <View key={i} style={s.rangeRow}>
                    <Text style={s.rangeName}>Piso {i + 1}</Text>
                    <View style={s.rangeInputs}>
                      <TextInput
                        style={s.rangeInput}
                        keyboardType="numeric"
                        value={floorRanges[i].from}
                        onChangeText={(v) => {
                          const n = [...floorRanges]; n[i].from = v; setFloorRanges(n);
                        }}
                        placeholder="1"
                      />
                      <Text style={s.rangeTo}>hasta</Text>
                      <TextInput
                        style={s.rangeInput}
                        keyboardType="numeric"
                        value={floorRanges[i].to}
                        onChangeText={(v) => {
                          const n = [...floorRanges]; n[i].to = v; setFloorRanges(n);
                        }}
                        placeholder="8"
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {savedWeekly && (
        <Pressable
          style={[
            s.card,
            {
              borderColor: !!weeklyUri && useSavedWeekly ? COLORS.danger : (useSavedWeekly ? COLORS.primary : COLORS.border),
              borderWidth: useSavedWeekly || (!!weeklyUri && useSavedWeekly) ? 2 : 1,
              backgroundColor: useSavedWeekly ? (!!weeklyUri ? COLORS.dangerSoft : COLORS.primarySoft) : COLORS.card,
              padding: 16,
              opacity: weeklyUri ? 0.6 : 1,
            },
          ]}
          onPress={() => {
            if (weeklyUri && !useSavedWeekly) {
              return; // Bloquear acción si ya hay un archivo cargado y la opción no está seleccionada
            }
            setUseSavedWeekly(!useSavedWeekly);
          }}
        >
          <View style={s.rowBetween}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: !!weeklyUri && useSavedWeekly ? COLORS.danger : COLORS.muted, textTransform: "uppercase" }}>
                📅 Último Reporte Semanal Usado
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.text, marginTop: 4 }}>
                Cargado el: {dayjs(savedWeekly.savedAt).format("DD/MM/YYYY HH:mm")}
              </Text>
            </View>

            {/* Cuadrado de Validación / Checkbox */}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: !!weeklyUri && useSavedWeekly ? COLORS.danger : (useSavedWeekly ? COLORS.primary : COLORS.muted),
                backgroundColor: useSavedWeekly && !weeklyUri ? COLORS.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {useSavedWeekly && !weeklyUri && (
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "bold" }}>✓</Text>
              )}
              {useSavedWeekly && !!weeklyUri && (
                <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: "bold" }}>✓</Text>
              )}
            </View>
          </View>

          {!!weeklyUri ? (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger, borderWidth: 1, borderRadius: 8 }}>
              <Text style={{ fontSize: 11.5, fontWeight: "800", color: COLORS.danger }}>
                ⚠️ Para usar el último reporte guardado expulse el reporte cargado actualmente.
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, fontWeight: "600", color: useSavedWeekly ? COLORS.primary : COLORS.muted, marginTop: 8 }}>
              {useSavedWeekly
                ? "✓ Usando reporte guardado en base de datos. No se requiere subir archivo."
                : "Tocá aquí si querés utilizar este weekly para realizar la programación del día seleccionado."}
            </Text>
          )}
        </Pressable>
      )}

      {/* OPCIÓN: IMPRIMIR CON CRÉDITOS */}
      <View
        style={[
          s.card,
          {
            marginTop: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: includeCreditos ? "#FFFBEB" : COLORS.card,
            borderColor: includeCreditos ? "#F59E0B" : COLORS.border,
            borderWidth: 1,
            borderRadius: 12,
          },
        ]}
      >
        <View style={s.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: includeCreditos ? "#FDE68A" : "#F3F4F6",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <MaterialCommunityIcons
                name="movie-open-star-outline"
                size={20}
                color={includeCreditos ? "#B45309" : COLORS.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: COLORS.text }}>
                Imprimir con Créditos
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                Agrega la columna de créditos con la hora reloj calculada a la sección de salida
              </Text>
            </View>
          </View>
          <Switch
            value={includeCreditos}
            onValueChange={setIncludeCreditos}
            trackColor={{ false: COLORS.border, true: "#F59E0B" }}
            thumbColor="#fff"
          />
        </View>

        {includeCreditos && (
          <View
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: "#FDE68A",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 8,
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              padding: 10,
              borderRadius: 8,
            }}
          >
            <MaterialCommunityIcons
              name="information"
              size={18}
              color="#D97706"
              style={{ marginTop: 1 }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 11.5,
                color: "#92400E",
                lineHeight: 16,
              }}
            >
              <Text style={{ fontWeight: "bold" }}>Aclaración:</Text> El horario de los créditos tomados para el cálculo corresponde a los que el área de <Text style={{ fontWeight: "bold" }}>Proyección</Text> carga en su sección.
            </Text>
          </View>
        )}
      </View>

      {/* ACCIÓN PRINCIPAL */}
      <View style={s.actionArea}>
        <Pressable
          style={[s.mainButton, (!canGenerate || loading) && s.mainButtonDisabled]}
          onPress={handleGenerate}
          disabled={!canGenerate || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={s.mainButtonText}>
                {includeCreditos ? "GENERAR EXCEL CON CRÉDITOS" : "GENERAR EXCEL DÍA"}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" }}>
                {selectedDay.toUpperCase()}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[s.secondaryButton, (!canGenerate || loading) && s.mainButtonDisabled]}
          onPress={handleGenerateWeekly}
          disabled={!canGenerate || loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <>
              <Text style={s.secondaryButtonText}>
                {includeCreditos ? "DESCARGAR SEMANA CON CRÉDITOS" : "DESCARGAR SEMANA COMPLETA"}
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: "600" }}>
                JUEVES A MIÉRCOLES
              </Text>
            </>
          )}
        </Pressable>
        {!!statusText && <Text style={s.statusInfo}>{statusText}</Text>}
      </View>

      {/* Vista Previa de la Programación (Excel Style) */}
      {(useSavedWeekly ? !!savedWeekly : !!loadedWeeklyRows) && (
        <View style={[s.card, { marginTop: 16 }]}>
          <View style={s.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <MaterialCommunityIcons name="eye-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={s.sectionLabel}>Vista Previa: {WEEKDAY_LABELS[selectedDay]}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowPreview(!showPreview)}>
              <Text style={{ color: COLORS.primary, fontWeight: "bold", fontSize: 13 }}>
                {showPreview ? "Ocultar" : "Mostrar"}
              </Text>
            </TouchableOpacity>
          </View>
          
          {showPreview && (
            <View style={{ marginTop: 12 }}>
              {includeCreditos && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#FEF3C7",
                    borderColor: "#F59E0B",
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    marginBottom: 12,
                  }}
                >
                  <MaterialCommunityIcons name="information" size={16} color="#B45309" />
                  <Text style={{ fontSize: 11.5, color: "#92400E", flex: 1, lineHeight: 15 }}>
                    <Text style={{ fontWeight: "bold" }}>Aclaración:</Text> El horario de los créditos tomados para el reporte corresponde a los que el área de <Text style={{ fontWeight: "bold" }}>Proyección</Text> carga en su sección.
                  </Text>
                </View>
              )}

              {previewData.entrada.length === 0 && previewData.salida.length === 0 ? (
                <Text style={{ fontSize: 13, color: COLORS.muted, textAlign: "center", paddingVertical: 20 }}>
                  Sin funciones programadas para este día en el reporte.
                </Text>
              ) : (
                <View style={s.previewColumnsContainer}>
                  {/* COLUMNA ENTRADAS (INGRESOS) */}
                  <View style={s.previewColumn}>
                    <View style={[s.previewColumnHeader, { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary }]}>
                      <Text style={[s.previewColumnHeaderText, { color: COLORS.primary }]}>ENTRADAS (INGRESOS)</Text>
                    </View>
                    <View style={s.previewTableHeaderRow}>
                      <Text style={[s.previewTableHeaderText, { width: 50, textAlign: "center" }]}>INICIO</Text>
                      <Text style={[s.previewTableHeaderText, { width: 50, textAlign: "center" }]}>SALA</Text>
                      <Text style={[s.previewTableHeaderText, { flex: 1, paddingLeft: 8 }]}>PELÍCULA</Text>
                      <Text style={[s.previewTableHeaderText, { width: 45, textAlign: "center" }]}>CALIF</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 350 }} nestedScrollEnabled>
                      {previewData.entrada.map((show, idx) => (
                        <View key={`in-${idx}`} style={s.previewItemRow}>
                          <View style={[s.previewCellTime, { width: 50, alignItems: "center" }]}>
                            <Text style={s.previewTimeValText}>{show.inicio}</Text>
                          </View>
                          <View style={[s.previewCellSala, { width: 50, alignItems: "center" }]}>
                            <Text style={s.previewSalaValText}>{show.sala}</Text>
                          </View>
                          <View style={{ flex: 1, paddingLeft: 8, justifyContent: "center" }}>
                            <Text style={s.previewMovieValText} numberOfLines={1}>
                              {show.pelicula}
                            </Text>
                          </View>
                          <View style={[s.previewCellCalif, { width: 45, alignItems: "center" }]}>
                            <Text style={s.previewCalifValText}>{show.calificacion || "-"}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>

                  {/* COLUMNA SALIDAS (EGRESOS) */}
                  <View style={s.previewColumn}>
                    <View style={[s.previewColumnHeader, { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger }]}>
                      <Text style={[s.previewColumnHeaderText, { color: COLORS.danger }]}>SALIDAS (EGRESOS)</Text>
                    </View>
                    <View style={s.previewTableHeaderRow}>
                      <Text style={[s.previewTableHeaderText, { width: 45, textAlign: "center" }]}>SALA</Text>
                      {includeCreditos && (
                        <Text style={[s.previewTableHeaderText, { width: 55, textAlign: "center", color: "#B45309" }]}>CRÉDITOS</Text>
                      )}
                      <Text style={[s.previewTableHeaderText, { width: 45, textAlign: "center" }]}>FIN</Text>
                      <Text style={[s.previewTableHeaderText, { flex: 1, paddingLeft: 8 }]}>PELÍCULA</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 350 }} nestedScrollEnabled>
                      {previewData.salida.map((show, idx) => (
                        <View key={`out-${idx}`} style={s.previewItemRow}>
                          <View style={[s.previewCellSala, { width: 45, alignItems: "center" }]}>
                            <Text style={s.previewSalaValText}>{show.sala}</Text>
                          </View>
                          {includeCreditos && (
                            <View style={[s.previewCellTime, { width: 55, alignItems: "center", backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                              <Text style={[s.previewTimeValText, { color: "#B45309", fontWeight: "bold" }]}>
                                {show.creditosHoraReloj || "-"}
                              </Text>
                            </View>
                          )}
                          <View style={[s.previewCellTime, { width: 45, alignItems: "center", backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger }]}>
                            <Text style={[s.previewTimeValText, { color: COLORS.danger }]}>{show.fin}</Text>
                          </View>
                          <View style={{ flex: 1, paddingLeft: 8, justifyContent: "center" }}>
                            <Text style={s.previewMovieValText} numberOfLines={1}>
                              {show.pelicula}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}



      {/* RESUMEN */}
      {summary && (
        <View style={s.summaryCard}>
          <View style={s.summaryHeader}>
            <Text style={s.summaryTitle}>Reporte de Generación</Text>
            <Text style={s.summaryBadge}>OK</Text>
          </View>
          <View style={s.summaryGrid}>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{summary.entrada}</Text>
              <Text style={s.summaryLabel}>ENTRADAS</Text>
            </View>
            <View style={s.summaryVerticalDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{summary.salida}</Text>
              <Text style={s.summaryLabel}>SALIDAS</Text>
            </View>
          </View>
          <Text style={s.summaryFooter} numberOfLines={1}>
            File: {summary.fileName}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  main: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  header: { marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5, textAlign: "center" },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 2, textAlign: "center" },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  section: { gap: 12 },
  sectionLabel: { fontSize: 14.5, fontWeight: "900", color: COLORS.text, textTransform: "uppercase", letterSpacing: 0.8 },
  sectionSublabel: { fontSize: 12.5, color: COLORS.muted, marginTop: 4, fontWeight: "500" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 18 },

  // Archivo picker
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    gap: 12,
  },
  filePickerActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft, borderStyle: "solid" },
  filePickerIcon: { width: 44, height: 44, backgroundColor: COLORS.card, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  filePickerInfo: { flex: 1 },
  filePickerText: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  filePickerSubtext: { fontSize: 10, color: COLORS.muted },

  // Días
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.bg, minWidth: 50, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  dayButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayButtonText: { fontSize: 12, fontWeight: "700", color: COLORS.muted },
  dayButtonTextActive: { color: "#FFF" },

  // Switch
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  switch: {
    width: 48,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.border,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  switchActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFF", ...THEME.shadow.soft },
  switchThumbActive: { transform: [{ translateX: 22 }] },

  // Pisos Config
  floorConfig: { marginTop: 18, gap: 12, backgroundColor: COLORS.bg, padding: 12, borderRadius: 12 },
  miniLabel: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  numFloorsRow: { flexDirection: "row", gap: 8 },
  numButton: { width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  numButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  numButtonText: { fontWeight: "800", color: COLORS.muted },
  numButtonTextActive: { color: "#FFF" },
  rangesContainer: { gap: 8, marginTop: 4 },
  rangeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.card, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  rangeName: { fontSize: 12, fontWeight: "700", color: COLORS.text },
  rangeInputs: { flexDirection: "row", alignItems: "center", gap: 6 },
  rangeInput: { width: 40, height: 30, backgroundColor: COLORS.bg, borderRadius: 6, textAlign: "center", fontSize: 12, fontWeight: "700", color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  rangeTo: { fontSize: 10, color: COLORS.muted },

  // Manual
  manualCard: { borderColor: COLORS.border, padding: 16 },
  manualCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.card },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  manualTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  manualChevron: { fontSize: 12, color: COLORS.muted, fontWeight: "900" },
  manualContent: { marginTop: 4 },
  step: { flexDirection: "row", gap: 12, marginTop: 16 },
  stepNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, color: "#FFF", fontSize: 12, fontWeight: "900", textAlign: "center", lineHeight: 22, overflow: "hidden" },
  stepInfo: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  stepText: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },

  // Botón Principal
  actionArea: { marginTop: 8, alignItems: "center", gap: 12 },
  mainButton: { backgroundColor: COLORS.primary, width: "100%", height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", ...THEME.shadow.soft },
  mainButtonDisabled: { backgroundColor: COLORS.border, opacity: 0.7 },
  mainButtonText: { color: "#FFF", fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  statusInfo: { fontSize: 12, color: COLORS.primary, fontWeight: "700" },
  secondaryButton: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.success, width: "100%", height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", ...THEME.shadow.soft },
  secondaryButtonText: { color: COLORS.success, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },

  // Resumen Card
  summaryCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border, gap: 16 },
  summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  summaryBadge: { backgroundColor: "#DCFCE7", color: "#166534", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontSize: 10, fontWeight: "800" },
  summaryGrid: { flexDirection: "row", backgroundColor: COLORS.bg, borderRadius: 16, padding: 16, alignItems: "center" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 24, fontWeight: "900", color: COLORS.primary },
  summaryLabel: { fontSize: 10, fontWeight: "800", color: COLORS.muted, marginTop: 2 },
  summaryVerticalDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  summaryFooter: { fontSize: 11, color: COLORS.muted, textAlign: "center" },
  warningBanner: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: COLORS.danger,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  warningBannerText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 18,
  },
  pdfInfoBanner: {
    backgroundColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  pdfInfoBannerText: {
    color: COLORS.warning,
    fontSize: 11.5,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 16,
  },
  compactSuccessCard: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.success,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  compactSuccessTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.success,
    textTransform: "uppercase",
  },
  compactSuccessText: {
    fontSize: 11.5,
    color: COLORS.text,
    fontWeight: "600",
  },
  compactSuccessTime: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: "700",
    marginTop: 2,
  },
  compactSaveButton: {
    backgroundColor: COLORS.success,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    ...THEME.shadow.soft,
  },
  compactSaveButtonText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  clearFileButton: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: -16 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 3,
  },
  clearFileButtonText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "900",
  },
  previewColumnsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 8,
  },
  previewColumn: {
    flex: 1,
    minWidth: 290,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    overflow: "hidden",
  },
  previewColumnHeader: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  previewColumnHeaderText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  previewTableHeaderRow: {
    flexDirection: "row",
    backgroundColor: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  previewTableHeaderText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  previewItemRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    alignItems: "center",
  },
  previewCellTime: {
    backgroundColor: COLORS.primarySoft,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: COLORS.primary,
  },
  previewCellSala: {
    justifyContent: "center",
  },
  previewCellCalif: {
    justifyContent: "center",
  },
  previewTimeValText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: COLORS.primary,
  },
  previewSalaValText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },
  previewMovieValText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  previewCalifValText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    flexDirection: "row",
  },
  tabButtonActive: {
    backgroundColor: COLORS.card,
    ...THEME.shadow.soft,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
  },
  tabButtonTextActive: {
    color: COLORS.primary,
  },
  singleWeekSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    marginTop: 6,
    gap: 12,
  },
  singleWeekLabelContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 220,
    alignItems: "center",
  },
  singleWeekLabelText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "bold",
  },
  arrowButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  arrowButtonDisabled: {
    opacity: 0.4,
  },
});
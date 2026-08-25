// app/screens/ChequeoCopiasScreen.tsx

import React, { useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import dayjs from "dayjs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc
} from "@/lib/dbService";
import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";

import { useAuthUser } from "../../lib/useAuthUser";
import { useAppLayout } from "../../lib/useAppLayout";
import { parseWeeklyProgrammingPDF } from "../../lib/programacion/pdf";
import { WeeklyMovieRow, WeekdayKey } from "../../lib/programacion/types";
import { COLORS, THEME } from "../../lib/theme";
import {
  LOGO_B64,
} from "../../lib/programacion/copias_images";

function isMarketingTag(tag: string): boolean {
  if (!tag) return true;
  const t = tag.toUpperCase().trim();
  return t.includes("CONTENIDO ALTERNATIVO") || 
         t.includes("CON RESTRICCIONES") || 
         t.includes("SIN PROMOCIONES") ||
         t === "";
}

// 6 framing patterns SVGs representing projection framing formats
export const FRAMING_SVGS: Record<string, string> = {
  framing_1: `
    <svg viewBox="0 0 100 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke="#334155" stroke-width="1.5"/>
    </svg>
  `,
  framing_2: `
    <svg viewBox="0 0 100 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke="#334155" stroke-width="1.5"/>
      <rect x="2" y="2" width="12" height="56" fill="#334155"/>
      <rect x="86" y="2" width="12" height="56" fill="#334155"/>
    </svg>
  `,
  framing_3: `
    <svg viewBox="0 0 100 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke="#334155" stroke-width="1.5"/>
      <rect x="2" y="2" width="96" height="8" fill="#334155"/>
      <rect x="2" y="50" width="96" height="8" fill="#334155"/>
    </svg>
  `,
  framing_4: `
    <svg viewBox="0 0 100 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke="#334155" stroke-width="1.5"/>
      <rect x="2" y="2" width="96" height="56" fill="none" stroke="#334155" stroke-width="10"/>
    </svg>
  `,
  framing_5: `
    <svg viewBox="0 0 100 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="60" fill="#FFF"/>
      <polygon points="10,0 22,0 10,60" fill="#000"/>
      <polygon points="90,0 78,0 90,60" fill="#000"/>
      <line x1="10" y1="0" x2="10" y2="60" stroke="#1F497D" stroke-width="2"/>
      <line x1="90" y1="0" x2="90" y2="60" stroke="#1F497D" stroke-width="2"/>
    </svg>
  `,
  framing_6: `
    <svg viewBox="0 0 100 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="60" fill="#FFF"/>
      <path d="M 20,48 Q 50,55 80,48 L 80,51 Q 50,55 20,51 Z" fill="#000"/>
      <path d="M 20,51 Q 50,55 80,51" fill="none" stroke="#1F497D" stroke-width="2"/>
    </svg>
  `,
};

const FRAMING_OPTIONS = [
  { key: "framing_1", label: "Pantalla Completa" },
  { key: "framing_2", label: "Barras Laterales (Pillarbox)" },
  { key: "framing_3", label: "Barras Horizontales (Letterbox)" },
  { key: "framing_4", label: "Bordes Todo Alrededor" },
  { key: "framing_5", label: "Deformación Lateral (Pincushion)" },
  { key: "framing_6", label: "Deformación Sup/Inf" },
];

const FramingFigure = ({ optionKey, style }: { optionKey: string; style?: any }) => {
  if (Platform.OS !== "web") {
    return (
      <View style={[style, { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#334155", alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 9, color: "#334155", fontWeight: "bold" }}>[Figura]</Text>
      </View>
    );
  }

  const strokeColor = "#334155";
  const strokeWidth = 1.5;

  if (optionKey === "framing_1") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" style={{ width: "100%", height: "100%" }}>
        <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke={strokeColor} strokeWidth={strokeWidth} />
      </svg>
    );
  }
  if (optionKey === "framing_2") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" style={{ width: "100%", height: "100%" }}>
        <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke={strokeColor} strokeWidth={strokeWidth} />
        <rect x="2" y="2" width="12" height="56" fill="#334155" />
        <rect x="86" y="2" width="12" height="56" fill="#334155" />
      </svg>
    );
  }
  if (optionKey === "framing_3") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" style={{ width: "100%", height: "100%" }}>
        <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke={strokeColor} strokeWidth={strokeWidth} />
        <rect x="2" y="2" width="96" height="8" fill="#334155" />
        <rect x="2" y="50" width="96" height="8" fill="#334155" />
      </svg>
    );
  }
  if (optionKey === "framing_4") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" style={{ width: "100%", height: "100%" }}>
        <rect x="2" y="2" width="96" height="56" fill="#FFF" stroke={strokeColor} strokeWidth={strokeWidth} />
        <rect x="2" y="2" width="96" height="56" fill="none" stroke="#334155" strokeWidth="10" />
      </svg>
    );
  }
  if (optionKey === "framing_5") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" style={{ width: "100%", height: "100%" }}>
        <rect x="0" y="0" width="100" height="60" fill="#FFF" />
        <polygon points="10,0 22,0 10,60" fill="#000" />
        <polygon points="90,0 78,0 90,60" fill="#000" />
        <line x1="10" y1="0" x2="10" y2="60" stroke="#1F497D" strokeWidth={2} />
        <line x1="90" y1="0" x2="90" y2="60" stroke="#1F497D" strokeWidth={2} />
      </svg>
    );
  }
  if (optionKey === "framing_6") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" style={{ width: "100%", height: "100%" }}>
        <rect x="0" y="0" width="100" height="60" fill="#FFF" />
        <path d="M 20,48 Q 50,55 80,48 L 80,51 Q 50,55 20,51 Z" fill="#000" />
        <path d="M 20,51 Q 50,55 80,51" fill="none" stroke="#1F497D" strokeWidth={2} />
      </svg>
    );
  }

  return null;
};

const cleanTitleForComparison = (title: string): string => {
  return title
    .toUpperCase()
    .replace(/\bDBOX\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const removeAccents = (str: string): string => {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const cleanMovieNameForCredits = (name: string): string => {
  if (!name) return "";
  let clean = removeAccents(name).toUpperCase();
  
  // Remove typical tags as whole words (like 2D, 3D, DBOX, SUB, CAS, DOB, etc.)
  const tags = [
    "2D", "3D", "DBOX", "SUB", "CAS", "DOB", "NAT", "LAT", "XD", "4D", "4DX", 
    "ATMOS", "5\\.1", "7\\.1", "OV", "VF", "FTR", "TRL", "IMAX", "LASER"
  ];
  
  const tagRegex = new RegExp(`\\b(${tags.join("|")})\\b`, "gi");
  clean = clean.replace(tagRegex, "");
  
  // Replace underscores, dashes, multiple spaces with a single space
  clean = clean.replace(/[_\-\s]+/g, " ");
  
  return clean.trim();
};

const COMMON_DISTRIBUTORS = ["UIP", "Warner", "Disney", "Sony", "Diamond", "BF + Paris", "Digicine"];

interface EstrenoMovie {
  pelicula: string;
  calificacion: string;
  salas: number[];
  distribuidora: string;
  responsable: string;
  aspect: "FLAT" | "SCOPE";
  imageKey: string;
  is3D: boolean;
  is2D: boolean;
  audio: "5.1" | "7.1" | "Inmersivo";
  idioma: "Doblada" | "Subtitulada" | "Nativo";
}

// Custom colors matching other tabs
const MKT = {
  warning: Platform.OS === "web" ? "var(--warning, #8a5a00)" : "#8a5a00",
  warningBg: Platform.OS === "web" ? "var(--warning-bg, #fff4d6)" : "#fff4d6",
};

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

const getWeekdayKeyFromDate = (dateStr: string): WeekdayKey => {
  const d = dayjs(dateStr);
  const dayNum = d.day(); // 0 is Sunday, 1 is Monday...
  const mapping: Record<number, WeekdayKey> = {
    0: "domingo",
    1: "lunes",
    2: "martes",
    3: "miercoles",
    4: "jueves",
    5: "viernes",
    6: "sabado",
  };
  return mapping[dayNum] || "jueves";
};

export default function ChequeoCopiasScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { user, displayName, cineId } = useAuthUser();
  const { isMobile } = useAppLayout();

  const [existingCredits, setExistingCredits] = useState<string[]>([]);
  const [generatingCredits, setGeneratingCredits] = useState<Record<string, boolean>>({});
  const [splitMovies, setSplitMovies] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!cineId) return;
    const q = query(collection(db, CINES_COLLECTION, cineId, "creditos"));
    const unsub = onSnapshot(q, (snap: any) => {
      const titles = snap.docs.map((doc: any) => removeAccents(doc.data().pelicula ?? "").toUpperCase().trim());
      setExistingCredits(titles);
    }, (err: any) => {
      console.error("Error listening to creditos:", err);
    });
    return unsub;
  }, [cineId]);



  const generarCreditoDesdeCopia = async (peliculaName: string) => {
    if (!cineId || !user) return;
    
    const baseTitle = cleanMovieNameForCredits(peliculaName);
    if (existingCredits.includes(baseTitle.toUpperCase().trim())) {
      Alert.alert("Créditos", `Ya existe una tarjeta para "${baseTitle}" en créditos.`);
      return;
    }

    setGeneratingCredits(prev => ({ ...prev, [peliculaName]: true }));

    try {
      await addDoc(collection(db, CINES_COLLECTION, cineId, "creditos"), {
        pelicula: baseTitle,
        peliculaLower: baseTitle.toLowerCase(),
        horaCredito: "00:00:00",
        horaApaga1: null,
        horaPrende1: null,
        horaApaga2: null,
        horaPrende2: null,
        horas: ["00:00:00"],
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      Alert.alert("Créditos", `Tarjeta de créditos para "${baseTitle}" generada con éxito.`);
    } catch (e: any) {
      console.error("Error al generar credito:", e);
      Alert.alert("Error", "No se pudo generar la tarjeta en créditos.");
    } finally {
      setGeneratingCredits(prev => ({ ...prev, [peliculaName]: false }));
    }
  };

  // File picker states
  const [oldUri, setOldUri] = useState<string | null>(null);
  const [oldName, setOldName] = useState<string | null>(null);
  const [newUri, setNewUri] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);

  // Parsing & comparison states
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [semanaText, setSemanaText] = useState("");
  const [estrenos, setEstrenos] = useState<EstrenoMovie[]>([]);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [comparisonDone, setComparisonDone] = useState(false);

  const [sourceMode, setSourceMode] = useState<"pdf" | "programacion">("pdf");
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

  const uiCards = React.useMemo(() => {
    const groups: Record<string, EstrenoMovie[]> = {};
    estrenos.forEach((item) => {
      const base = cleanMovieNameForCredits(item.pelicula);
      if (!groups[base]) {
        groups[base] = [];
      }
      groups[base].push(item);
    });

    const cards: Array<{
      isGrouped: boolean;
      baseTitle: string;
      items: EstrenoMovie[];
      key: string;
    }> = [];

    Object.keys(groups).forEach((base) => {
      const isSplit = !!splitMovies[base];
      const items = groups[base];
      
      if (isSplit || items.length === 1) {
        items.forEach((item) => {
          cards.push({
            isGrouped: false,
            baseTitle: base,
            items: [item],
            key: item.pelicula,
          });
        });
      } else {
        cards.push({
          isGrouped: true,
          baseTitle: base,
          items: items,
          key: `group-${base}`,
        });
      }
    });

    return cards;
  }, [estrenos, splitMovies]);

  const groupsCount = React.useMemo(() => {
    const counts: Record<string, number> = {};
    estrenos.forEach((item) => {
      const base = cleanMovieNameForCredits(item.pelicula);
      counts[base] = (counts[base] || 0) + 1;
    });
    return counts;
  }, [estrenos]);

  const handleUpdateCardField = (
    card: { isGrouped: boolean; baseTitle: string; items: EstrenoMovie[] },
    key: keyof EstrenoMovie,
    value: any
  ) => {
    if (readOnly) return;
    setEstrenos((prev) => {
      return prev.map((item) => {
        const matches = card.isGrouped 
          ? cleanMovieNameForCredits(item.pelicula) === card.baseTitle
          : item.pelicula === card.items[0].pelicula;
          
        if (matches) {
          return {
            ...item,
            [key]: value,
          };
        }
        return item;
      });
    });
  };

  const handlePrintGroup = async (items: EstrenoMovie[]) => {
    if (Platform.OS === "web") {
      for (let i = 0; i < items.length; i++) {
        setTimeout(() => {
          handlePrint(items[i]);
        }, i * 800);
      }
    } else {
      for (const item of items) {
        await handlePrint(item);
      }
    }
  };

  // Pick Old Week file
  const pickOldFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file?.uri) return;

      setOldUri(file.uri);
      setOldName(file.name ?? "semana_vieja.pdf");
      setComparisonDone(false);
      setEstrenos([]);
      setExpandedCards({});
      setSplitMovies({});
    } catch (err) {
      Alert.alert("Error", "No se pudo cargar el archivo de semana vieja.");
    }
  };

  // Pick New Week file
  const pickNewFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file?.uri) return;

      setNewUri(file.uri);
      setNewName(file.name ?? "semana_nueva.pdf");
      setComparisonDone(false);
      setEstrenos([]);
      setExpandedCards({});
      setSplitMovies({});
    } catch (err) {
      Alert.alert("Error", "No se pudo cargar el archivo de semana nueva.");
    }
  };

  // Compare both weeks to detect estrenos
  const handleCompare = async () => {
    if (sourceMode === "pdf") {
      if (!oldUri || !newUri) {
        Alert.alert("Archivos faltantes", "Por favor carga ambos archivos para realizar la comparación.");
        return;
      }

      try {
        setLoading(true);
        setStatusText("Parseando semana vieja...");
        const oldResult = await parseWeeklyProgrammingPDF(oldUri);

        setStatusText("Parseando semana nueva...");
        const newResult = await parseWeeklyProgrammingPDF(newUri);

        setStatusText("Comparando programaciones...");

        // Compute week date range label from new week startDate
        if (newResult.startDate) {
          const start = dayjs(newResult.startDate);
          const end = start.add(6, "day");
          setSemanaText(`${start.format("DD/MM")} al ${end.format("DD/MM")}`);
        } else {
          setSemanaText("Nueva Semana");
        }

        // Group old week rows by cleaned movie name to check if they only have showtimes on Wednesday
        const oldMoviesSchedule: Record<string, Record<WeekdayKey, number>> = {};

        oldResult.rows.forEach((row) => {
          const compName = cleanTitleForComparison(row.pelicula);
          if (!oldMoviesSchedule[compName]) {
            oldMoviesSchedule[compName] = {
              jueves: 0,
              viernes: 0,
              sabado: 0,
              domingo: 0,
              lunes: 0,
              martes: 0,
              miercoles: 0,
            };
          }
          
          if (row.horariosPorDia) {
            Object.keys(row.horariosPorDia).forEach((dayKey) => {
              const times = row.horariosPorDia[dayKey as WeekdayKey] || [];
              oldMoviesSchedule[compName][dayKey as WeekdayKey] += times.length;
            });
          }
        });

        // Unique clean titles from old week that are NOT preestrenos (only Wednesday shows)
        const oldTitles = new Set<string>();

        Object.keys(oldMoviesSchedule).forEach((compName) => {
          const sched = oldMoviesSchedule[compName];
          const hasOtherDays = (
            sched.jueves > 0 ||
            sched.viernes > 0 ||
            sched.sabado > 0 ||
            sched.domingo > 0 ||
            sched.lunes > 0 ||
            sched.martes > 0
          );

          // A movie is NOT a Wednesday-only preestreno if it has showtimes on any other day of the week.
          // If it only has showtimes on Wednesday, we exclude it from oldTitles so it's treated as an estreno in the new week.
          if (hasOtherDays) {
            oldTitles.add(compName);
          }
        });

        // Group new week rows by cleaned movie name to ignore DBOX and find screens
        const newMoviesMap: Record<string, { calificacion: string; salas: Set<number> }> = {};

        newResult.rows.forEach((row) => {
          const originalName = row.pelicula.trim().toUpperCase();
          const compName = cleanTitleForComparison(originalName);
          if (!newMoviesMap[compName]) {
            newMoviesMap[compName] = {
              calificacion: row.calificacion || "",
              salas: new Set<number>(),
            };
          }
          newMoviesMap[compName].salas.add(row.sala);
        });

        // Find which new movies are not in old week
        const detectedEstrenos: EstrenoMovie[] = [];

        Object.keys(newMoviesMap).forEach((compName) => {
          if (!oldTitles.has(compName)) {
            // It's an estreno!
            const data = newMoviesMap[compName];

            // Auto-detect format from name
            const is3D = /3D/i.test(compName);
            const is2D = !is3D;

            // Auto-detect language
            let idioma: "Doblada" | "Subtitulada" | "Nativo" = "Doblada";
            if (/SUB/i.test(compName)) {
              idioma = "Subtitulada";
            } else if (/CAS/i.test(compName) || /DOB/i.test(compName)) {
              idioma = "Doblada";
            }

            // Auto-detect aspect ratio (default flat, or scope if name suggests)
            let aspect: "FLAT" | "SCOPE" = "FLAT";
            if (/SCOPE/i.test(compName)) {
              aspect = "SCOPE";
            }

            detectedEstrenos.push({
              pelicula: compName,
              calificacion: data.calificacion,
              salas: Array.from(data.salas).sort((a, b) => a - b),
              distribuidora: "",
              responsable: displayName || "",
              aspect,
              imageKey: "framing_1", // Default to FLAT en FLAT
              is3D,
              is2D,
              audio: "5.1",
              idioma,
            });
          }
        });

        setEstrenos(detectedEstrenos);
        setExpandedCards({});
        setSplitMovies({});
        setComparisonDone(true);
        setStatusText(`Comparación finalizada. Se encontraron ${detectedEstrenos.length} estrenos.`);
      } catch (err) {
        console.error(err);
        Alert.alert("Error de comparación", "Ocurrió un error al procesar y comparar los archivos PDF.");
      } finally {
        setLoading(false);
      }
    } else {
      // Programación (API Cinemark)
      if (!cineId) return;

      try {
        setLoading(true);
        setStatusText("Buscando programación de la semana...");

        // Calculate old week date string (7 days before)
        const previousWeekStart = dayjs(selectedWeekStart).subtract(7, "day").format("YYYY-MM-DD");

        // Set week range text
        const start = dayjs(selectedWeekStart);
        const end = start.add(6, "day");
        setSemanaText(`${start.format("DD/MM")} al ${end.format("DD/MM")}`);

        // 1. Fetch new week showtimes from Cinemark API (showtimes collection)
        setStatusText("Obteniendo showtimes semana nueva...");
        const newDocRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart);
        const newSnap = await getDoc(newDocRef);

        if (!newSnap.exists()) {
          Alert.alert("Sin datos", `No hay showtimes guardados para la semana ${selectedWeekStart}. Por favor sincronizá la programación primero.`);
          setLoading(false);
          return;
        }
        const newResultRows = newSnap.data()?.sessions || [];

        // 2. Fetch old week showtimes from Cinemark API (showtimes collection)
        setStatusText("Obteniendo showtimes semana vieja...");
        const oldDocRef = doc(db, CINES_COLLECTION, cineId, "showtimes", previousWeekStart);
        const oldSnap = await getDoc(oldDocRef);
        const oldResultRows = oldSnap.exists() ? oldSnap.data()?.sessions || [] : [];

        setStatusText("Comparando programaciones...");

        // Build oldMoviesSchedule to check if they only have showtimes on Wednesday
        const oldMoviesSchedule: Record<string, Record<WeekdayKey, number>> = {};

        oldResultRows.forEach((session: any) => {
          const formatStr = (session.sessionFormat || "").toUpperCase().includes("3D") ? "3D" : "2D";
          const langName = (session.language?.name || session.language || "").toUpperCase();
          let langStr = "CAS";
          if (langName.includes("SUB") || langName.includes("ING") || langName.includes("ORIG")) {
            langStr = "SUB";
          }

          const movieTitle = `${session.movieName} ${formatStr} ${langStr}`.toUpperCase();
          const compName = cleanTitleForComparison(movieTitle);

          if (!oldMoviesSchedule[compName]) {
            oldMoviesSchedule[compName] = {
              jueves: 0, viernes: 0, sabado: 0, domingo: 0, lunes: 0, martes: 0, miercoles: 0
            };
          }

          const displayDate = session.sessionDisplayDate || (session.sessionDateTime ? session.sessionDateTime.substring(0, 10) : "");
          if (displayDate) {
            const dayKey = getWeekdayKeyFromDate(displayDate);
            oldMoviesSchedule[compName][dayKey] += 1;
          }
        });

        // Build oldTitles set
        const oldTitles = new Set<string>();
        Object.keys(oldMoviesSchedule).forEach((compName) => {
          const sched = oldMoviesSchedule[compName];
          const hasOtherDays = (
            sched.jueves > 0 ||
            sched.viernes > 0 ||
            sched.sabado > 0 ||
            sched.domingo > 0 ||
            sched.lunes > 0 ||
            sched.martes > 0
          );
          if (hasOtherDays) {
            oldTitles.add(compName);
          }
        });

        // Build newMoviesMap
        const newMoviesMap: Record<string, { calificacion: string; salas: Set<number> }> = {};

        newResultRows.forEach((session: any) => {
          const formatStr = (session.sessionFormat || "").toUpperCase().includes("3D") ? "3D" : "2D";
          const langName = (session.language?.name || session.language || "").toUpperCase();
          let langStr = "CAS";
          if (langName.includes("SUB") || langName.includes("ING") || langName.includes("ORIG")) {
            langStr = "SUB";
          }
          const movieTitle = `${session.movieName} ${formatStr} ${langStr}`.toUpperCase();
          const compName = cleanTitleForComparison(movieTitle);

          const currentRating = session.rating || session.calificacion || session.tags?.[0]?.label || "";
          if (!newMoviesMap[compName]) {
            newMoviesMap[compName] = {
              calificacion: currentRating,
              salas: new Set<number>(),
            };
          } else {
            const existing = newMoviesMap[compName].calificacion;
            if (!existing || (isMarketingTag(existing) && !isMarketingTag(currentRating))) {
              newMoviesMap[compName].calificacion = currentRating;
            }
          }
          const salaNum = Number(session.theaterRoom);
          if (!isNaN(salaNum)) {
            newMoviesMap[compName].salas.add(salaNum);
          }
        });

        // Find estrenos
        const detectedEstrenos: EstrenoMovie[] = [];

        Object.keys(newMoviesMap).forEach((compName) => {
          if (!oldTitles.has(compName)) {
            const data = newMoviesMap[compName];

            // Auto-detect format from name
            const is3D = /3D/i.test(compName);
            const is2D = !is3D;

            // Auto-detect language
            let idioma: "Doblada" | "Subtitulada" | "Nativo" = "Doblada";
            if (/SUB/i.test(compName)) {
              idioma = "Subtitulada";
            } else if (/CAS/i.test(compName) || /DOB/i.test(compName)) {
              idioma = "Doblada";
            }

            // Auto-detect aspect ratio (default flat, or scope if name suggests)
            let aspect: "FLAT" | "SCOPE" = "FLAT";
            if (/SCOPE/i.test(compName)) {
              aspect = "SCOPE";
            }

            detectedEstrenos.push({
              pelicula: compName,
              calificacion: data.calificacion,
              salas: Array.from(data.salas).sort((a, b) => a - b),
              distribuidora: "",
              responsable: displayName || "",
              aspect,
              imageKey: "framing_1",
              is3D,
              is2D,
              audio: "5.1",
              idioma,
            });
          }
        });

        setEstrenos(detectedEstrenos);
        setExpandedCards({});
        setSplitMovies({});
        setComparisonDone(true);
        setStatusText(`Comparación finalizada. Se encontraron ${detectedEstrenos.length} estrenos.`);
      } catch (err) {
        console.error(err);
        Alert.alert("Error de comparación", "Ocurrió un error al procesar y comparar las programaciones.");
      } finally {
        setLoading(false);
      }
    }
  };

  // Update a field in a specific estreno card
  const handleUpdateEstreno = (index: number, key: keyof EstrenoMovie, value: any) => {
    if (readOnly) return;
    setEstrenos((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [key]: value,
      };
      return copy;
    });
  };

  // Clear file selections
  const handleReset = () => {
    if (readOnly) return;
    setOldUri(null);
    setOldName(null);
    setNewUri(null);
    setNewName(null);
    setEstrenos([]);
    setExpandedCards({});
    setSplitMovies({});
    setComparisonDone(false);
    setStatusText("");
    setSemanaText("");
  };

  // Build HTML and trigger print
  const handlePrint = async (item: EstrenoMovie) => {
    const complejoName = cineId
      ? cineId.charAt(0).toUpperCase() + cineId.slice(1)
      : "Cinemark";

    const fechaHoy = dayjs().format("DD/MM/YYYY");

    // HTML matches AMARGA NAVIDAD 2D CAS.pdf style perfectly
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Chequeo de Copia - ${item.pelicula}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      color: #000;
      margin: 10mm;
      padding: 0;
      font-size: 10pt;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .container {
      border: 1.5pt solid #1F497D;
      padding: 15px;
      height: 265mm;
      box-sizing: border-box;
      position: relative;
    }
    
    /* Header layout */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .header-logo {
      width: 130px;
      vertical-align: top;
    }
    .header-logo img {
      max-width: 100%;
      height: auto;
    }
    .header-info {
      font-size: 8.5pt;
      color: #595959;
      line-height: 1.25;
      vertical-align: top;
      padding-left: 15px;
    }
    .header-title {
      font-size: 15pt;
      font-weight: bold;
      color: #1F497D;
      text-align: right;
      text-transform: uppercase;
      vertical-align: top;
      letter-spacing: 0.5px;
    }
    
    /* Section style */
    .section-title {
      background-color: #1F497D;
      color: #FFF;
      font-size: 11pt;
      font-weight: bold;
      padding: 4px 8px;
      margin-top: 18px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    
    /* Table inputs style */
    .fields-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .fields-table td {
      padding: 6px 8px;
      border: 1px solid #BFBFBF;
    }
    .fields-table td.label {
      font-weight: bold;
      color: #1F497D;
      background-color: #F2F5F8;
      width: 20%;
    }
    .fields-table td.value {
      font-size: 10pt;
    }
    
    /* Grid for screens */
    .screens-grid {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .screens-grid th {
      background-color: #F2F5F8;
      color: #1F497D;
      font-weight: bold;
      padding: 5px;
      border: 1px solid #BFBFBF;
      text-align: center;
      font-size: 9pt;
    }
    .screens-grid td {
      padding: 6px;
      border: 1px solid #BFBFBF;
      text-align: center;
      font-size: 11pt;
      font-weight: bold;
    }
    
    /* Checkbox character */
    .chk-box {
      font-family: sans-serif;
      font-size: 12pt;
      margin-right: 4px;
      font-weight: bold;
      color: #1F497D;
    }
    
    /* Formats inline table */
    .formats-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .formats-table td {
      padding: 6px 8px;
      border: 1px solid #BFBFBF;
      width: 25%;
    }
    
    /* Columns for Control Section */
    .control-left {
      width: 100%;
      border: 1px solid #BFBFBF;
      padding: 12px;
      box-sizing: border-box;
      margin-bottom: 15px;
    }
    .block-title {
      font-weight: bold;
      color: #1F497D;
      border-bottom: 1.5px solid #1F497D;
      padding-bottom: 4px;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-size: 9pt;
    }
    
    /* Comment box */
    .comments-box {
      border: 1px solid #BFBFBF;
      height: 80px;
      padding: 8px;
      box-sizing: border-box;
    }
    .comments-line {
      border-bottom: 1px solid #D9D9D9;
      height: 22px;
    }
    
    /* Corporate Footer */
    .footer-container {
      position: absolute;
      bottom: 15px;
      left: 15px;
      right: 15px;
      border-top: 1.5pt solid #1F497D;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-left {
      font-size: 8pt;
      color: #595959;
      line-height: 1.25;
    }
    .footer-right {
      font-size: 14pt;
      font-weight: 800;
      color: #1F497D;
      font-style: italic;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td class="header-logo">
          <img src="${LOGO_B64}" alt="Cinemark" />
        </td>
        <td class="header-title">
          información de la copia
        </td>
      </tr>
    </table>
    
    <!-- Movie Info -->
    <table class="fields-table">
      <tr>
        <td class="label">Complejo</td>
        <td class="value" style="font-weight: bold;">${complejoName}</td>
        <td class="label">Fecha</td>
        <td class="value">${fechaHoy}</td>
      </tr>
      <tr>
        <td class="label">Película</td>
        <td class="value" style="font-weight: bold; font-size: 11pt;">${item.pelicula}</td>
        <td class="label">Semana</td>
        <td class="value">${semanaText}</td>
      </tr>
      <tr>
        <td class="label">Distribuidora</td>
        <td class="value">${item.distribuidora || "-"}</td>
        <td class="label">Estreno</td>
        <td class="value" style="font-weight: bold;">SI</td>
      </tr>
    </table>
    
    <!-- Auditoriums -->
    <div style="font-weight: bold; color: #1F497D; margin-bottom: 5px; font-size: 9.5pt; text-transform: uppercase;">Auditorio</div>
    <table class="screens-grid">
      <tr>
        ${Array.from({ length: 16 }).map((_, i) => `<th>${String(i + 1).padStart(2, "0")}</th>`).join("")}
      </tr>
      <tr>
        ${Array.from({ length: 16 }).map((_, i) => {
          const isPlaying = item.salas.includes(i + 1);
          return `<td>${isPlaying ? "☒" : "☐"}</td>`;
        }).join("")}
      </tr>
    </table>
    
    <!-- Technical Formats -->
    <table class="formats-table">
      <tr>
        <td>
          <span class="chk-box">${item.is2D ? "☒" : "☐"}</span> 2D
          <span class="chk-box" style="margin-left: 15px;">${item.is3D ? "☒" : "☐"}</span> 3D
        </td>
        <td>
          <span class="chk-box">${item.aspect === "FLAT" ? "☒" : "☐"}</span> FLAT
          <span class="chk-box" style="margin-left: 15px;">${item.aspect === "SCOPE" ? "☒" : "☐"}</span> SCOPE
        </td>
        <td>
          <span class="chk-box">${item.audio === "5.1" ? "☒" : "☐"}</span> 5.1
          <span class="chk-box" style="margin-left: 10px;">${item.audio === "7.1" ? "☒" : "☐"}</span> 7.1
          <span class="chk-box" style="margin-left: 10px;">${item.audio === "Inmersivo" ? "☒" : "☐"}</span> Inmersivo
        </td>
        <td>
          <span class="chk-box">${item.idioma === "Doblada" ? "☒" : "☐"}</span> Doblada
          <span class="chk-box" style="margin-left: 8px;">${item.idioma === "Subtitulada" ? "☒" : "☐"}</span> Subtitulada
          <span class="chk-box" style="margin-left: 8px;">${item.idioma === "Nativo" ? "☒" : "☐"}</span> Nativo
        </td>
      </tr>
    </table>
    
    <!-- Control de Presentación -->
    <div class="section-title">Control de presentación</div>
    
    <!-- Image check -->
    <div class="control-left">
      <div class="block-title">Imagen en pantalla</div>
      <div style="text-align: center; margin-bottom: 12px; height: 110px; display: flex; align-items: center; justify-content: center; width: 100%;">
        <div style="width: 180px; height: 110px; display: inline-block;">
          ${FRAMING_SVGS[item.imageKey] || ""}
        </div>
      </div>
      <div style="display: flex; justify-content: space-around; margin-top: 15px; margin-bottom: 5px;">
        <div><span class="chk-box">☒</span> Imagen nítida</div>
        <div><span class="chk-box">☒</span> Imagen enfocada</div>
        <div><span class="chk-box">☒</span> Imagen sin parpadeo</div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer-container">
      <div class="footer-left">
        Beruti 3399 5to Piso, Capital Federal<br/>
        Oficina Corporativa Cinemark Argentina
      </div>
      <div class="footer-right">
        CINEMARK
      </div>
    </div>
  </div>
</body>
</html>
`;

    try {
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          Alert.alert("Imprimir", "Por favor habilita las ventanas emergentes (popups) para poder imprimir.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        const printProcess = () => {
          printWindow.focus();
          printWindow.print();
        };

        if (printWindow.document.readyState === "complete") {
          printProcess();
        } else {
          printWindow.onload = printProcess;
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Imprimir", `No se pudo generar el archivo de impresión: ${e.message}`);
    }
  };

  return (
    <ScrollView style={s.main} contentContainerStyle={s.content}>
      {/* Warning Banner - Required Jueves Warning */}
      <View style={s.banner}>
        <Text style={s.bannerIcon}>⚠️</Text>
        <View style={s.bannerContent}>
          <Text style={s.bannerTitle}>USO REQUERIDO LOS DÍAS JUEVES</Text>
          <Text style={s.bannerText}>
            Esta sección de Chequeo de Copias debe ser completada obligatoriamente los días Jueves para verificar e imprimir las planillas de los estrenos de la nueva semana.
          </Text>
        </View>
      </View>

      {/* Upload files card */}
      <View style={s.card}>
        <Text style={s.cardHeader}>Carga de Reportes Semanales</Text>
        <Text style={s.cardSubtitle}>
          {sourceMode === "pdf"
            ? "Subí los PDFs de la semana vieja (anterior) y semana nueva (siguiente) para calcular qué películas son nuevos estrenos."
            : "Seleccioná la semana y la fuente para calcular qué películas son nuevos estrenos a partir de la base de datos."}
        </Text>

        {/* Source selector (PDF vs Programación) */}
        <View style={s.tabContainer}>
          <Pressable
            style={[s.tabButton, sourceMode === "pdf" && s.tabButtonActive]}
            onPress={() => {
              setSourceMode("pdf");
              setComparisonDone(false);
              setEstrenos([]);
            }}
          >
            <Text style={[s.tabButtonText, sourceMode === "pdf" && s.tabButtonTextActive]}>
              📁 Cargar PDFs
            </Text>
          </Pressable>
          <Pressable
            style={[s.tabButton, sourceMode === "programacion" && s.tabButtonActive]}
            onPress={() => {
              setSourceMode("programacion");
              setComparisonDone(false);
              setEstrenos([]);
            }}
          >
            <Text style={[s.tabButtonText, sourceMode === "programacion" && s.tabButtonTextActive]}>
              🖥️ Usar Programación Guardada
            </Text>
          </Pressable>
        </View>

        {sourceMode === "pdf" ? (
          <View style={[s.uploadRow, isMobile && { flexDirection: "column" }]}>
            {/* Old Week File Picker */}
            <View style={s.uploadCol}>
              <Text style={s.pickerLabel}>Semana Vieja (Anterior)</Text>
              <Pressable
                style={[s.filePickerBtn, !!oldUri && s.filePickerActive, readOnly && { opacity: 0.6 }]}
                onPress={readOnly ? undefined : pickOldFile}
              >
                <Text style={s.filePickerIcon}>{oldUri ? "📄" : "📥"}</Text>
                <Text style={s.filePickerText} numberOfLines={1}>
                  {oldName || "Cargar PDF Semana Vieja"}
                </Text>
              </Pressable>
            </View>

            {/* New Week File Picker */}
            <View style={s.uploadCol}>
              <Text style={s.pickerLabel}>Semana Nueva (Entrante)</Text>
              <Pressable
                style={[s.filePickerBtn, !!newUri && s.filePickerActive, readOnly && { opacity: 0.6 }]}
                onPress={readOnly ? undefined : pickNewFile}
              >
                <Text style={s.filePickerIcon}>{newUri ? "📄" : "📥"}</Text>
                <Text style={s.filePickerText} numberOfLines={1}>
                  {newName || "Cargar PDF Semana Nueva"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12, marginBottom: THEME.spacing.lg }}>
            {/* Week Selector Bar */}
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
          </View>
        )}

        {/* Action Buttons */}
        <View style={s.actionRow}>
          {sourceMode === "pdf" && (oldUri || newUri) && !readOnly && (
            <Pressable style={s.resetBtn} onPress={handleReset}>
              <Text style={s.resetBtnText}>Limpiar</Text>
            </Pressable>
          )}

          <Pressable
            style={[
              s.compareBtn,
              ((sourceMode === "pdf" && (!oldUri || !newUri)) || loading || readOnly) && s.compareBtnDisabled
            ]}
            onPress={readOnly ? undefined : handleCompare}
            disabled={(sourceMode === "pdf" && (!oldUri || !newUri)) || loading || readOnly}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.compareBtnText}>COMPARAR SEMANAS</Text>
            )}
          </Pressable>
        </View>

        {!!statusText && <Text style={s.statusInfo}>{statusText}</Text>}
      </View>

      {/* Comparison results */}
      {comparisonDone && (
        <View>
          {estrenos.length === 0 ? (
            <View style={s.noEstrenosCard}>
              <Text style={s.noEstrenosTitle}>🎉 ¡No se detectaron estrenos!</Text>
              <Text style={s.noEstrenosText}>
                Todas las películas de la semana nueva ya se daban en la semana vieja. No es necesario imprimir planillas de copias.
              </Text>
            </View>
          ) : (
            <View style={s.resultsHeader}>
              <Text style={s.resultsCountTitle}>
                🎥 Películas Estreno Detectadas ({estrenos.length})
              </Text>
              <Text style={s.resultsSubtitle}>
                Semana: {semanaText}. Completa los datos requeridos para cada película e imprimí su planilla de control.
              </Text>
            </View>
          )}

          {/* Estreno card list */}
          {uiCards.map((card) => {
            const isExpanded = !!expandedCards[card.key];
            const item = card.items[0];
            const baseTitle = cleanMovieNameForCredits(card.baseTitle);
            const creditCardExists = existingCredits.includes(baseTitle.toUpperCase().trim());
            const mergedSalas = Array.from(new Set(card.items.flatMap(it => it.salas))).sort((a, b) => a - b);
            const displayTitle = card.isGrouped ? card.baseTitle : item.pelicula;

            return (
              <View key={card.key} style={[s.estrenoCard, !isExpanded && { gap: 0 }]}>
                {/* Estreno header */}
                <View
                  style={[
                    s.estrenoHeader,
                    !isExpanded && { borderBottomWidth: 0, paddingBottom: 0 }
                  ]}
                >
                  <Pressable
                    style={{ flex: 1, marginRight: THEME.spacing.sm }}
                    onPress={() => {
                      setExpandedCards((prev) => ({
                        ...prev,
                        [card.key]: !prev[card.key],
                      }));
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <Text style={s.estrenoMovieTitle}>{displayTitle}</Text>
                      
                      {/* Small Credits button next to the title */}
                      {!readOnly && !creditCardExists && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#16A34A",
                            borderRadius: 6,
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                          }}
                          onPress={() => {
                            const title = "Generar Créditos";
                            const msg = `¿Crear tarjeta en Créditos para "${baseTitle}"?`;

                            if (Platform.OS === "web") {
                              if (window.confirm(`${title}\n\n${msg}`)) {
                                generarCreditoDesdeCopia(displayTitle);
                              }
                            } else {
                              Alert.alert(
                                title,
                                msg,
                                [
                                  { text: "Cancelar", style: "cancel" },
                                  {
                                    text: "Crear",
                                    onPress: () => generarCreditoDesdeCopia(displayTitle)
                                  }
                                ]
                              );
                            }
                          }}
                        >
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "bold" }}>
                            ➕ Créditos
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={s.badgeRow}>
                      <View style={s.estrenoBadge}>
                        <Text style={s.estrenoBadgeText}>Estreno</Text>
                      </View>
                      <Text style={s.salasText}>
                        Proyecta en Salas: {mergedSalas.join(", ")}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: THEME.spacing.sm }}
                    onPress={() => {
                      setExpandedCards((prev) => ({
                        ...prev,
                        [card.key]: !prev[card.key],
                      }));
                    }}
                  >
                    {!!item.calificacion && (
                      <View style={s.ratingBadge}>
                        <Text style={s.ratingText}>{item.calificacion}</Text>
                      </View>
                    )}
                    <MaterialCommunityIcons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={24}
                      color={COLORS.muted}
                    />
                  </Pressable>
                </View>

                {isExpanded && (
                  <>
                    {/* System grouping notice & split/join options */}
                    {card.isGrouped ? (
                      <View style={{
                        backgroundColor: COLORS.primarySoft,
                        borderRadius: THEME.radius.sm,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: COLORS.primarySoft,
                        gap: 6,
                        marginBottom: 4,
                      }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.primary }}>
                          ℹ️ Copias agrupadas automáticamente
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.text, lineHeight: 16 }}>
                          Las copias (2D, 3D, dobladas, subtituladas) de esta película se unificaron para simplificar la carga. Al imprimir, se generará la planilla para cada formato detectado ({card.items.map(it => `${it.is3D ? "3D" : "2D"} ${it.idioma.substring(0,3)}`).join(", ")}).
                        </Text>
                        <Pressable
                          style={{
                            alignSelf: "flex-start",
                            backgroundColor: COLORS.card,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            borderRadius: 6,
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            marginTop: 4,
                          }}
                          onPress={() => {
                            setSplitMovies(prev => ({ ...prev, [card.baseTitle]: true }));
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: COLORS.text }}>
                            🔓 Dividir en copias individuales
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      groupsCount[card.baseTitle] > 1 && (
                        <View style={{
                          backgroundColor: COLORS.bgMobile,
                          borderRadius: THEME.radius.sm,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          gap: 6,
                          marginBottom: 4,
                        }}>
                          <Text style={{ fontSize: 12, color: COLORS.text, lineHeight: 16 }}>
                            Esta planilla se encuentra dividida. Podés volver a agrupar todos los formatos para editarlos juntos.
                          </Text>
                          <Pressable
                            style={{
                              alignSelf: "flex-start",
                              backgroundColor: COLORS.card,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                              borderRadius: 6,
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              marginTop: 4,
                            }}
                            onPress={() => {
                              setSplitMovies(prev => ({ ...prev, [card.baseTitle]: false }));
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: COLORS.text }}>
                              🔗 Agrupar todos los formatos
                            </Text>
                          </Pressable>
                        </View>
                      )
                    )}

                    {/* Technical Config Form */}
                    <View style={s.formGrid}>
                      {/* Distribuidora */}
                      <View style={s.inputWrapper}>
                        <Text style={s.formLabel}>Distribuidora *</Text>
                        <TextInput
                          value={item.distribuidora}
                          onChangeText={(val) => handleUpdateCardField(card, "distribuidora", val)}
                          placeholder="Ej: UIP, Warner, etc."
                          placeholderTextColor={COLORS.muted}
                          style={s.formInput}
                          editable={!readOnly}
                        />
                        {/* Quick distributor pills */}
                        <View style={s.pillsRow}>
                          {COMMON_DISTRIBUTORS.map((dist) => (
                            <Pressable
                              key={dist}
                              style={s.distPill}
                              onPress={() => handleUpdateCardField(card, "distribuidora", dist)}
                            >
                              <Text style={s.distPillText}>{dist}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Responsable */}
                      <View style={s.inputWrapper}>
                        <Text style={s.formLabel}>Responsable del Control *</Text>
                        <TextInput
                          value={item.responsable}
                          onChangeText={(val) => handleUpdateCardField(card, "responsable", val)}
                          placeholder="Tu nombre"
                          placeholderTextColor={COLORS.muted}
                          style={s.formInput}
                          editable={!readOnly}
                        />
                      </View>

                      {/* Aspect Ratio */}
                      <View style={s.inputWrapper}>
                        <Text style={s.formLabel}>Aspect Ratio (Encuadre) *</Text>
                        <View style={s.toggleGroup}>
                          <Pressable
                            style={[s.toggleBtn, item.aspect === "FLAT" && s.toggleBtnActive]}
                            onPress={() => handleUpdateCardField(card, "aspect", "FLAT")}
                          >
                            <Text style={[s.toggleBtnText, item.aspect === "FLAT" && s.toggleBtnTextActive]}>
                              FLAT
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[s.toggleBtn, item.aspect === "SCOPE" && s.toggleBtnActive]}
                            onPress={() => handleUpdateCardField(card, "aspect", "SCOPE")}
                          >
                            <Text style={[s.toggleBtnText, item.aspect === "SCOPE" && s.toggleBtnTextActive]}>
                              SCOPE
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Format & Lang & Audio checkboxes */}
                      <View style={[s.checkboxGrid, isMobile && { flexDirection: "column" }]}>
                        {/* Format */}
                        <View style={s.checkCol}>
                          <Text style={s.formLabel}>
                            Formato {card.isGrouped && "(Auto-detectado)"}
                          </Text>
                          {card.isGrouped ? (
                            <View style={s.checkOptions}>
                              <View style={s.miniCheck}>
                                <Text style={s.miniCheckText}>🔒 2D</Text>
                              </View>
                              <View style={s.miniCheck}>
                                <Text style={s.miniCheckText}>🔒 3D</Text>
                              </View>
                            </View>
                          ) : (
                            <View style={s.checkOptions}>
                              <Pressable
                                style={[s.miniCheck, item.is2D && s.miniCheckActive]}
                                onPress={() => {
                                  handleUpdateCardField(card, "is2D", !item.is2D);
                                  if (!item.is2D) handleUpdateCardField(card, "is3D", false);
                                }}
                              >
                                <Text style={[s.miniCheckText, item.is2D && s.miniCheckTextActive]}>2D</Text>
                              </Pressable>
                              <Pressable
                                style={[s.miniCheck, item.is3D && s.miniCheckActive]}
                                onPress={() => {
                                  handleUpdateCardField(card, "is3D", !item.is3D);
                                  if (!item.is3D) handleUpdateCardField(card, "is2D", false);
                                }}
                              >
                                <Text style={[s.miniCheckText, item.is3D && s.miniCheckTextActive]}>3D</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>

                        {/* Language */}
                        <View style={s.checkCol}>
                          <Text style={s.formLabel}>
                            Idioma {card.isGrouped && "(Auto-detectado)"}
                          </Text>
                          {card.isGrouped ? (
                            <View style={s.checkOptions}>
                              <View style={s.miniCheck}>
                                <Text style={s.miniCheckText}>🔒 DOB</Text>
                              </View>
                              <View style={s.miniCheck}>
                                <Text style={s.miniCheckText}>🔒 SUB</Text>
                              </View>
                              <View style={s.miniCheck}>
                                <Text style={s.miniCheckText}>🔒 NAT</Text>
                              </View>
                            </View>
                          ) : (
                            <View style={s.checkOptions}>
                              {["Doblada", "Subtitulada", "Nativo"].map((lang) => (
                                <Pressable
                                  key={lang}
                                  style={[s.miniCheck, item.idioma === lang && s.miniCheckActive]}
                                  onPress={() => handleUpdateCardField(card, "idioma", lang)}
                                >
                                  <Text style={[s.miniCheckText, item.idioma === lang && s.miniCheckTextActive]}>
                                    {lang.substring(0, 3)}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                        </View>

                        {/* Audio */}
                        <View style={s.checkCol}>
                          <Text style={s.formLabel}>Audio</Text>
                          <View style={s.checkOptions}>
                            {["5.1", "7.1", "Inmersivo"].map((aud) => (
                              <Pressable
                                key={aud}
                                style={[s.miniCheck, item.audio === aud && s.miniCheckActive]}
                                onPress={() => handleUpdateCardField(card, "audio", aud)}
                              >
                                <Text style={[s.miniCheckText, item.audio === aud && s.miniCheckTextActive]}>
                                  {aud}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Visual Framing selector */}
                    <View style={s.framingContainer}>
                      <Text style={s.formLabel}>Seleccionar Imagen de Encuadre en Pantalla *</Text>
                      <Text style={s.framingSub}>Seleccioná la imagen que representa cómo se debe ver la proyección:</Text>
                      
                      <View style={s.framingGrid}>
                        {FRAMING_OPTIONS.map((opt) => {
                          const isSelected = item.imageKey === opt.key;
                          return (
                            <Pressable
                              key={opt.key}
                              style={[
                                s.framingCard,
                                isMobile ? { width: "100%" } : { width: "31%" },
                                isSelected && s.framingCardActive
                              ]}
                              onPress={() => handleUpdateCardField(card, "imageKey", opt.key)}
                            >
                              <View style={s.framingImageWrapper}>
                                <FramingFigure
                                  optionKey={opt.key}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                  }}
                                />
                              </View>
                              <View style={s.framingCardFooter}>
                                <View style={[s.radioIcon, isSelected && s.radioIconActive]}>
                                  {isSelected && <View style={s.radioDot} />}
                                </View>
                                <Text style={[s.framingCardLabel, isSelected && s.framingCardLabelActive]} numberOfLines={1}>
                                  {opt.label}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* Print Button */}
                    <Pressable
                      style={s.printBtn}
                      onPress={() => {
                        if (card.isGrouped) {
                          handlePrintGroup(card.items);
                        } else {
                          handlePrint(item);
                        }
                      }}
                    >
                      <Text style={s.printBtnText}>
                        🖨️ {card.isGrouped ? `IMPRIMIR PLANILLAS (${card.items.length})` : "IMPRIMIR PLANILLA DE COPIA"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.bgMobile,
  },
  content: {
    padding: THEME.spacing.lg,
    gap: THEME.spacing.lg,
  },
  banner: {
    flexDirection: "row",
    backgroundColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
    borderWidth: 1.5,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    gap: THEME.spacing.md,
    alignItems: "center",
  },
  bannerIcon: {
    fontSize: 28,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "900",
    color: COLORS.warning,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bannerText: {
    fontSize: THEME.fontSize.xs + 1,
    lineHeight: 16,
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  cardHeader: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: THEME.fontSize.xs + 1,
    color: COLORS.muted,
    lineHeight: 16,
    marginBottom: THEME.spacing.lg,
  },
  uploadRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  uploadCol: {
    flex: 1,
    gap: 6,
  },
  pickerLabel: {
    fontSize: THEME.fontSize.xs + 1,
    fontWeight: "700",
    color: COLORS.text,
  },
  filePickerBtn: {
    height: 52,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: THEME.radius.sm,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: COLORS.bg,
    gap: THEME.spacing.sm,
  },
  filePickerActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
    borderStyle: "solid",
  },
  filePickerIcon: {
    fontSize: 20,
  },
  filePickerText: {
    fontSize: THEME.fontSize.xs + 1,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: THEME.spacing.md,
  },
  resetBtn: {
    height: 40,
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.radius.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resetBtnText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.muted,
  },
  compareBtn: {
    height: 40,
    backgroundColor: COLORS.primary,
    paddingHorizontal: THEME.spacing.xl,
    borderRadius: THEME.radius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  compareBtnDisabled: {
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },
  compareBtnText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 0.5,
  },
  statusInfo: {
    marginTop: THEME.spacing.md,
    fontSize: THEME.fontSize.xs + 1,
    color: COLORS.primary,
    fontWeight: "600",
    textAlign: "center",
  },
  noEstrenosCard: {
    backgroundColor: COLORS.successBg + "22",
    borderColor: COLORS.success,
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.lg,
    alignItems: "center",
    gap: 8,
  },
  noEstrenosTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.success,
  },
  noEstrenosText: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 18,
  },
  resultsHeader: {
    marginBottom: THEME.spacing.sm,
  },
  resultsCountTitle: {
    fontSize: THEME.fontSize.md + 1,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 2,
  },
  resultsSubtitle: {
    fontSize: THEME.fontSize.xs + 1,
    color: COLORS.muted,
  },
  estrenoCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.lg,
    gap: THEME.spacing.lg,
    ...THEME.shadow.soft,
  },
  estrenoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
    paddingBottom: THEME.spacing.md,
  },
  estrenoMovieTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
  },
  estrenoBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: THEME.radius.sm - 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  estrenoBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FFF",
    textTransform: "uppercase",
  },
  salasText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "700",
    color: COLORS.muted,
  },
  ratingBadge: {
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm - 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "800",
    color: COLORS.text,
  },
  formGrid: {
    gap: THEME.spacing.md,
  },
  inputWrapper: {
    gap: 6,
  },
  formLabel: {
    fontSize: THEME.fontSize.xs + 1,
    fontWeight: "800",
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  formInput: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: THEME.spacing.md,
    fontSize: THEME.fontSize.sm,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  distPill: {
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  distPillText: {
    fontSize: THEME.fontSize.xs - 1,
    fontWeight: "700",
    color: COLORS.muted,
  },
  toggleGroup: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    overflow: "hidden",
    height: 42,
  },
  toggleBtn: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  toggleBtnText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.muted,
  },
  toggleBtnTextActive: {
    color: "#FFF",
    fontWeight: "800",
  },
  checkboxGrid: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: THEME.spacing.md,
  },
  checkCol: {
    flex: 1,
    gap: 6,
  },
  checkOptions: {
    flexDirection: "row",
    gap: 6,
  },
  miniCheck: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.bg,
  },
  miniCheckActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  miniCheckText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "700",
    color: COLORS.muted,
  },
  miniCheckTextActive: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  framingContainer: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: THEME.spacing.lg,
  },
  framingSub: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
    marginBottom: THEME.spacing.xs,
  },
  framingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: THEME.spacing.md,
  },
  framingCard: {
    width: Platform.OS === "web" ? "31%" : "47%",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    overflow: "hidden",
    backgroundColor: COLORS.bg,
  },
  framingCardActive: {
    borderColor: COLORS.primary,
    ...THEME.shadow.soft,
  },
  framingImageWrapper: {
    height: 80,
    backgroundColor: "#000",
    padding: 2,
  },
  framingCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 6,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  radioIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  radioIconActive: {
    borderColor: COLORS.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  framingCardLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    flex: 1,
  },
  framingCardLabelActive: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  printBtn: {
    height: 48,
    backgroundColor: "#1F497D", // Cinemark dark blue theme color for checklist
    borderRadius: THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: THEME.spacing.sm,
    ...THEME.shadow.soft,
  },
  printBtnText: {
    fontSize: THEME.fontSize.sm + 1,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: 0.5,
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
  fallbackBanner: {
    backgroundColor: MKT.warningBg,
    borderColor: MKT.warning,
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  fallbackBannerText: {
    color: MKT.warning,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 16,
  },
});

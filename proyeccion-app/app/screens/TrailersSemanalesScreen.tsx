import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as XLSX from "xlsx-js-style";
import dayjs from "dayjs";
import { doc, getDoc } from "@/lib/dbService";
import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";

// Custom colors matching other tabs
const MKT = {
  warning: Platform.OS === "web" ? "var(--warning, #8a5a00)" : "#8a5a00",
  warningBg: Platform.OS === "web" ? "var(--warning-bg, #fff4d6)" : "#fff4d6",
};

type TrlMovie = {
  title: string;
  rating: string;
  trailers: string[];
};

type MatchedMovie = {
  sessionTitle: string;
  matchedTitle: string;
  rating: string;
  trailers: string[];
  isMatched: boolean;
};

type ScreenMovies = {
  screenNum: number;
  movies: MatchedMovie[];
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

export default function TrailersSemanalesScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { cineId } = useAuthUser();

  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);

  const [trlsName, setTrlsName] = useState<string | null>(null);
  const [trlsData, setTrlsData] = useState<TrlMovie[] | null>(null);

  const [sourceMode, setSourceMode] = useState<"pdf" | "programacion">("pdf");
  const [dbSubSource, setDbSubSource] = useState<"servicios" | "api">("api");
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => getMovieWeekStartForNow());
  const [dbWeekly, setDbWeekly] = useState<{
    startDate: string;
    weeklyRows: any[];
    isApiSource: boolean;
    isFallbackActual?: boolean;
  } | null>(null);
  const [loadingDbWeekly, setLoadingDbWeekly] = useState(false);
  const [pdfPeriod, setPdfPeriod] = useState<string | null>(null);

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

  const dbPeriod = useMemo(() => {
    const dateStr = dbWeekly?.startDate || selectedWeekStart;
    if (!dateStr) return null;
    const start = dayjs(dateStr);
    const end = start.add(6, "day");
    return `${start.format("DD/MM/YYYY")} al ${end.format("DD/MM/YYYY")}`;
  }, [dbWeekly, selectedWeekStart]);

  const activePeriod = useMemo(() => {
    if (sourceMode === "pdf") {
      return pdfPeriod || "21/05/2026 al 28/05/2026";
    } else {
      return dbPeriod || "21/05/2026 al 28/05/2026";
    }
  }, [sourceMode, pdfPeriod, dbPeriod]);

  const loadDbWeekly = async (showFeedback = false) => {
    if (!cineId) return;
    try {
      setLoadingDbWeekly(true);
      // Load from Cinemark API (showtimes collection)
      const docRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setDbWeekly({
          startDate: selectedWeekStart,
          weeklyRows: data.sessions || [],
          isApiSource: true,
          isFallbackActual: false,
        });
        if (showFeedback) {
          Alert.alert("Éxito", "Programación (API Cinemark) cargada correctamente.");
        }
      } else {
        setDbWeekly(null);
        if (showFeedback) {
          Alert.alert("Sin datos", `No hay showtimes guardados para la semana ${selectedWeekStart}.`);
        }
      }
    } catch (e: any) {
      console.error("Error al cargar programación:", e);
      if (showFeedback) {
        Alert.alert("Error", "No se pudo cargar la programación de la semana.");
      }
    } finally {
      setLoadingDbWeekly(false);
    }
  };

  useEffect(() => {
    loadDbWeekly(false);
  }, [cineId, selectedWeekStart, dbSubSource]);

  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingTrls, setLoadingTrls] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [showManual, setShowManual] = useState(false);

  const [editableScreens, setEditableScreens] = useState<ScreenMovies[] | null>(null);

  const [pasteTexts, setPasteTexts] = useState<Record<string, string>>({});

  // Dynamically load PDFJS from CDN for client-side PDF parsing in the browser
  useEffect(() => {
    if (Platform.OS === "web") {
      if (!(window as any)["pdfjs-dist/build/pdf"]) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, []);

  // PDF Parser client side
  async function parsePdfClientSide(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        try {
          const typedarray = new Uint8Array(this.result as ArrayBuffer);
          const pdfjsLib = (window as any)["pdfjs-dist/build/pdf"];
          if (!pdfjsLib) {
            throw new Error("pdf.js no está cargado. Por favor, verificá tu conexión.");
          }
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            let pageText = "";
            let lastY = -1;
            for (const item of textContent.items as any[]) {
              if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += "\n";
              }
              pageText += item.str + " ";
              lastY = item.transform[5];
            }
            fullText += `\n--- PAGE ${i} ---\n` + pageText;
          }
          resolve(fullText);
        } catch (err) {
          reject(err);
        }
      };
      fileReader.onerror = (err) => reject(err);
      fileReader.readAsArrayBuffer(file);
    });
  }

  // Parse pdfText into screen room and movies mapping
  const parsedSessions = useMemo(() => {
    if (!pdfText) return null;

    const lines = pdfText.split("\n");
    const screens: Record<number, Set<string>> = {};
    let currentScreen: number | null = null;
    let pendingMovie = "";

    const ignoreKeywords = [
      "agüero 665", "capital federal", "30-69345924-5", "hoyts abasto",
      "working days", "weekly sessions", "showing sessions",
      "display mode", "film title", "thurs fri sat", "wedfilm", "tues",
      "vista entertainment", "no free ticket", "reportfiles", "and end time"
    ];

    const timeRegex = /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g;

    for (let line of lines) {
      let lineClean = line.trim();
      if (!lineClean) continue;

      if (lineClean.includes("--- PAGE")) {
        pendingMovie = "";
        continue;
      }

      // Check ignores with flattened double spaces
      let ignored = false;
      let lowerLine = lineClean.toLowerCase().replace(/\s+/g, " ");
      for (let kw of ignoreKeywords) {
        if (lowerLine.includes(kw)) {
          ignored = true;
          break;
        }
      }

      // Also ignore explicit date-time generated patterns and page markers
      if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(lineClean)) ignored = true;
      if (/^\d+\s*\/\s*\d+\s*©/.test(lineClean)) ignored = true;
      if (lowerLine.includes("film title") || lowerLine.includes("wedfilm") || lowerLine.includes("thurs") || lowerLine.includes("tues")) {
        ignored = true;
      }

      if (ignored) continue;

      // Screen detect
      const screenMatch = lineClean.match(/^(?:pantalla|screen)\s+(\d+)$/i);
      if (screenMatch) {
        if (pendingMovie) {
          let cleaned = pendingMovie.replace(/\s+/g, " ").trim();
          if (cleaned) {
            if (!screens[currentScreen!]) screens[currentScreen!] = new Set();
            screens[currentScreen!].add(cleaned);
          }
          pendingMovie = "";
        }
        currentScreen = parseInt(screenMatch[1], 10);
        continue;
      }

      if (!currentScreen) continue;

      // Check times
      const hasTimes = timeRegex.test(lineClean);
      if (hasTimes) {
        if (pendingMovie) {
          let cleaned = pendingMovie.replace(/\s+/g, " ").trim();
          if (cleaned) {
            if (!screens[currentScreen]) screens[currentScreen] = new Set();
            screens[currentScreen].add(cleaned);
          }
          pendingMovie = "";
        }

        let lineNoTimes = lineClean.replace(timeRegex, "").trim();
        if (lineNoTimes) {
          pendingMovie = lineNoTimes;
        }
      } else {
        if (pendingMovie) {
          pendingMovie += " " + lineClean;
        } else {
          pendingMovie = lineClean;
        }
      }

      // If rating in parentheses is at the end, complete
      if (pendingMovie && /\([A-Z0-9-]+\)\s*$/.test(pendingMovie.trim())) {
        let cleaned = pendingMovie.replace(/\s+/g, " ").trim();
        if (cleaned) {
          if (!screens[currentScreen]) screens[currentScreen] = new Set();
          screens[currentScreen].add(cleaned);
        }
        pendingMovie = "";
      }
    }

    if (pendingMovie && currentScreen) {
      let cleaned = pendingMovie.replace(/\s+/g, " ").trim();
      if (cleaned) {
        if (!screens[currentScreen]) screens[currentScreen] = new Set();
        screens[currentScreen].add(cleaned);
      }
    }

    // Convert sets to arrays preserving natural chronological order
    const result: Record<number, string[]> = {};
    for (let scr in screens) {
      result[scr] = Array.from(screens[scr]);
    }
    return result;
  }, [pdfText]);

  // Compute the sessions (screens map) depending on selected source mode
  const weeklySessions = useMemo(() => {
    if (sourceMode === "pdf") {
      return parsedSessions;
    } else {
      if (!dbWeekly || !dbWeekly.weeklyRows) return null;

      const screens: Record<number, string[]> = {};
      if (dbWeekly.isApiSource) {
        // Parse from sessions list
        const sessions = dbWeekly.weeklyRows;
        sessions.forEach((session: any) => {
          const salaNum = Number(session.theaterRoom);
          if (isNaN(salaNum)) return;
          if (!screens[salaNum]) {
            screens[salaNum] = [];
          }
          
          const formatStr = (session.sessionFormat || "").toUpperCase().includes("3D") ? "3D" : "2D";
          const langName = (session.language?.name || session.language || "").toUpperCase();
          let langStr = "CAS";
          if (langName.includes("SUB") || langName.includes("ING") || langName.includes("ORIG")) {
            langStr = "SUB";
          }
          
          const movieTitle = `${session.movieName} ${formatStr} ${langStr}`.toUpperCase();
            
          if (!screens[salaNum].includes(movieTitle)) {
            screens[salaNum].push(movieTitle);
          }
        });
      } else {
        // Parse from programacion_semanal weeklyRows
        dbWeekly.weeklyRows.forEach((row: any) => {
          const salaNum = parseInt(row.sala, 10);
          if (isNaN(salaNum)) return;
          if (!screens[salaNum]) {
            screens[salaNum] = [];
          }
          const movieTitle = row.calificacion 
            ? `${row.pelicula} (${row.calificacion})` 
            : row.pelicula;

          if (!screens[salaNum].includes(movieTitle)) {
            screens[salaNum].push(movieTitle);
          }
        });
      }
      return screens;
    }
  }, [sourceMode, parsedSessions, dbWeekly]);

  // Intelligent matching functions
  function normalizeForMatching(title: string): string {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // accents
      .replace(/\b(2d|3d|sub|cas|dbox)\b/gi, "") // format words
      .replace(/&/g, "and")            // & to and
      .replace(/\([a-z0-9-]+\)/gi, "") // rating parentheses
      .replace(/[^a-z0-9\s]/gi, "")    // other punctuation
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchMovieToTrl(sessionMovie: string, trlMovies: TrlMovie[]): TrlMovie | null {
    const normSession = normalizeForMatching(sessionMovie);
    let bestMatch: TrlMovie | null = null;
    let bestScore = 0;

    for (let trl of trlMovies) {
      const normTrl = normalizeForMatching(trl.title);

      if (normSession === normTrl) {
        let score = 100;
        const sessHas3d = /\b3d\b/i.test(sessionMovie);
        const trlHas3d = /\b3d\b/i.test(trl.title);
        if (sessHas3d === trlHas3d) score += 20;

        const sessHasCas = /\bcas\b/i.test(sessionMovie);
        const trlHasCas = /\bcas\b/i.test(trl.title);
        if (sessHasCas === trlHasCas) score += 10;

        const sessHasSub = /\bsub\b/i.test(sessionMovie);
        const trlHasSub = /\bsub\b/i.test(trl.title);
        if (sessHasSub === trlHasSub) score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = trl;
        }
      }
    }

    if (!bestMatch) {
      for (let trl of trlMovies) {
        const normTrl = normalizeForMatching(trl.title);
        if (normSession.includes(normTrl) || normTrl.includes(normSession)) {
          let score = 10;
          const sessHas3d = /\b3d\b/i.test(sessionMovie);
          const trlHas3d = /\b3d\b/i.test(trl.title);
          if (sessHas3d === trlHas3d) score += 5;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = trl;
          }
        }
      }
    }

    return bestMatch;
  }

  // Combine sessions and trls data
  const matchedCalculated = useMemo(() => {
    if (!weeklySessions || !trlsData) return null;

    const screens: ScreenMovies[] = [];
    for (let scrNumStr in weeklySessions) {
      const screenNum = parseInt(scrNumStr, 10);
      const movies = weeklySessions[screenNum].map((sessionMovie) => {
        const match = matchMovieToTrl(sessionMovie, trlsData);
        if (match) {
          const trailersList = [...match.trailers];
          return {
            sessionTitle: sessionMovie,
            matchedTitle: match.title,
            rating: match.rating,
            trailers: trailersList,
            isMatched: true,
          };
        } else {
          return {
            sessionTitle: sessionMovie,
            matchedTitle: "",
            rating: "",
            trailers: [],
            isMatched: false,
          };
        }
      });
      screens.push({ screenNum, movies });
    }
    return screens.sort((a, b) => a.screenNum - b.screenNum);
  }, [weeklySessions, trlsData]);

  // Set editableScreens state when matchedCalculated changes
  useEffect(() => {
    if (matchedCalculated) {
      setEditableScreens(matchedCalculated);
    } else {
      setEditableScreens(null);
    }
  }, [matchedCalculated]);

  // Update movie title
  const handleUpdateMovieTitle = (screenNum: number, movieIdx: number, newTitle: string) => {
    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        const updatedMovies = scr.movies.map((m, idx) => {
          if (idx === movieIdx) {
            return { ...m, sessionTitle: newTitle };
          }
          return m;
        });
        return { ...scr, movies: updatedMovies };
      }
      return scr;
    });
    setEditableScreens(updated);
  };

  // Update trailer name
  const handleUpdateTrailerName = (screenNum: number, movieIdx: number, trailerIdx: number, newName: string) => {
    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        const updatedMovies = scr.movies.map((m, idx) => {
          if (idx === movieIdx) {
            const updatedTrailers = m.trailers.map((t, tIdx) => {
              if (tIdx === trailerIdx) return newName;
              return t;
            });
            return { ...m, trailers: updatedTrailers };
          }
          return m;
        });
        return { ...scr, movies: updatedMovies };
      }
      return scr;
    });
    setEditableScreens(updated);
  };

  // Add a new trailer row
  const handleAddTrailer = (screenNum: number, movieIdx: number) => {
    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        const updatedMovies = scr.movies.map((m, idx) => {
          if (idx === movieIdx) {
            if (m.trailers.length >= 5) {
              Alert.alert("Límite alcanzado", "No podés agregar más de 5 trailers por película debido al diseño de la planilla.");
              return m;
            }
            return { ...m, trailers: [...m.trailers, ""], isMatched: true };
          }
          return m;
        });
        return { ...scr, movies: updatedMovies };
      }
      return scr;
    });
    setEditableScreens(updated);
  };

  // Remove a trailer row
  const handleRemoveTrailer = (screenNum: number, movieIdx: number, trailerIdx: number) => {
    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        const updatedMovies = scr.movies.map((m, idx) => {
          if (idx === movieIdx) {
            const updatedTrailers = m.trailers.filter((_, tIdx) => tIdx !== trailerIdx);
            return { ...m, trailers: updatedTrailers };
          }
          return m;
        });
        return { ...scr, movies: updatedMovies };
      }
      return scr;
    });
    setEditableScreens(updated);
  };

  // Delete a movie card entirely
  const handleDeleteMovie = (screenNum: number, movieIdx: number) => {
    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        const updatedMovies = scr.movies.filter((_, idx) => idx !== movieIdx);
        return { ...scr, movies: updatedMovies };
      }
      return scr;
    });
    setEditableScreens(updated);
  };

  // Add an empty movie card to a room
  const handleAddMovie = (screenNum: number) => {
    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        if (scr.movies.length >= 6) {
          Alert.alert("Límite alcanzado", "No podés agregar más de 6 películas por sala debido a las columnas del diseño de la planilla Excel.");
          return scr;
        }
        const newMovie: MatchedMovie = {
          sessionTitle: "Nueva Película",
          matchedTitle: "",
          rating: "",
          trailers: [],
          isMatched: false,
        };
        return { ...scr, movies: [...scr.movies, newMovie] };
      }
      return scr;
    });
    setEditableScreens(updated);
  };

  // Split pasted text by newlines and import into movie trailers
  const handleImportPastedTrailers = (screenNum: number, movieIdx: number) => {
    const key = `${screenNum}-${movieIdx}`;
    const text = pasteTexts[key] || "";
    if (!text.trim()) return;

    const parsedLines = text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 5); // limit to 5 trailers

    if (parsedLines.length === 0) return;

    if (!editableScreens) return;
    const updated = editableScreens.map(scr => {
      if (scr.screenNum === screenNum) {
        const updatedMovies = scr.movies.map((m, idx) => {
          if (idx === movieIdx) {
            return {
              ...m,
              trailers: parsedLines,
              isMatched: true,
            };
          }
          return m;
        });
        return { ...scr, movies: updatedMovies };
      }
      return scr;
    });

    setEditableScreens(updated);

    // Clear paste text state for this movie
    setPasteTexts(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  // File pickers
  async function pickPdf() {
    try {
      setLoadingPdf(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const asset = res.assets[0];
      setPdfName(asset.name || "SessionsbyScreen.pdf");

      if (Platform.OS === "web") {
        const maybeFile = (asset as any).file as File | undefined;
        if (maybeFile) {
          const text = await parsePdfClientSide(maybeFile);
          setPdfText(text);

          // Auto extract exhibition dates
          const dateMatch = text.match(/From\s+Thursday\s+(\d{2}\/\d{2}\/\d{4}).*Until\s+Thursday\s+(\d{2}\/\d{2}\/\d{4})/i);
          if (dateMatch) {
            setPdfPeriod(`${dateMatch[1]} al ${dateMatch[2]}`);
          }
        } else {
          throw new Error("No se pudo obtener el archivo del navegador.");
        }
      } else {
        Alert.alert("Plataforma no soportada", "La lectura de PDF solo está soportada en entorno web actualmente.");
      }
    } catch (e: any) {
      console.error("PDF upload error:", e);
      Alert.alert("Error leyendo PDF", e?.message ?? "Asegurate de estar cargando un archivo PDF válido.");
    } finally {
      setLoadingPdf(false);
    }
  }

  async function pickTrls() {
    try {
      setLoadingTrls(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const asset = res.assets[0];
      setTrlsName(asset.name || "TRLS.xlsx");

      let buffer: ArrayBuffer;
      const maybeFile = (asset as any).file as File | undefined;
      if (maybeFile && typeof maybeFile.arrayBuffer === "function") {
        buffer = await maybeFile.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        buffer = await response.arrayBuffer();
      }

      // Parse XLSX
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("Archivo TRLS sin hojas válidas.");

      const matrix = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: "" });

      const tables: any[] = [];
      let currentTable: any = null;

      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const hasContent = row.some(cell => cell !== undefined && cell !== null && cell !== "");

        if (hasContent) {
          if (!currentTable) {
            currentTable = {
              titles: row.map(cell => String(cell).trim()).filter(Boolean),
              ratings: [],
              trailers: []
            };
            tables.push(currentTable);
          } else if (currentTable.ratings.length === 0) {
            currentTable.ratings = row.map(cell => String(cell).trim());
          } else {
            currentTable.trailers.push(row.map(cell => String(cell).trim()));
          }
        } else {
          currentTable = null;
        }
      }

      // Flatten columns
      const moviesList: TrlMovie[] = [];
      tables.forEach(table => {
        const numCols = table.titles.length;
        for (let c = 0; c < numCols; c++) {
          const title = table.titles[c];
          if (!title) continue;

          const cleanTitle = String(title).trim();
          const cleanTitleUpper = cleanTitle.toUpperCase();
          // Filter out ratings that are not movies
          if (cleanTitleUpper === "R-13" || cleanTitleUpper === "R-17" || cleanTitleUpper === "R13" || cleanTitleUpper === "R17") {
            continue;
          }

          const rating = table.ratings[c] || "";
          const colTrailers: string[] = [];
          table.trailers.forEach((row: any[]) => {
            const trl = row[c];
            if (trl && String(trl).trim()) {
              const cleanTrl = String(trl).trim();
              const cleanTrlUpper = cleanTrl.toUpperCase();
              // Filter out ratings that are not trailers
              if (cleanTrlUpper !== "R-13" && cleanTrlUpper !== "R-17" && cleanTrlUpper !== "R13" && cleanTrlUpper !== "R17") {
                colTrailers.push(cleanTrl);
              }
            }
          });
          moviesList.push({ title: cleanTitle, rating, trailers: colTrailers });
        }
      });

      setTrlsData(moviesList);
    } catch (e: any) {
      console.error("TRLS upload error:", e);
      Alert.alert("Error leyendo TRLS.xlsx", e?.message ?? "Verificá que el archivo tenga el formato correcto.");
    } finally {
      setLoadingTrls(false);
    }
  }



  // Handle high-fidelity PDF Generation identical to Excel styles and layout
  async function handleGeneratePdf() {
    if (!editableScreens) return;

    try {
      setGeneratingPdf(true);

      // Build HTML content identical to the Excel spreadsheet layout
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Planilla de Trailers</title>
          <style>
            @page {
              size: auto;
              margin: 0;
            }
            @media print {
              body { margin: 0.8cm; -webkit-print-color-adjust: exact; }
              .page-break { page-break-after: always; }
            }
            body {
              font-family: 'Helvetica Neue', Arial, sans-serif;
              color: #1e293b;
              margin: 15px;
              background-color: #FFF;
            }
            .header-container {
              text-align: center;
              margin-bottom: 15px;
              border-bottom: 3px solid #890404;
              padding-bottom: 8px;
            }
            .header-title {
              font-size: 20px;
              font-weight: bold;
              color: #890404;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              margin: 0 0 3px 0;
            }
            .header-subtitle {
              font-size: 11px;
              color: #64748b;
              margin: 0;
              font-weight: 500;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 15px;
              margin-top: 12px;
              background-color: #f8fafc;
              padding: 8px 12px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
              font-size: 11px;
            }
            .meta-item {
              display: flex;
              flex-direction: column;
            }
            .meta-label {
              font-weight: bold;
              color: #64748b;
              text-transform: uppercase;
              font-size: 9px;
              margin-bottom: 2px;
            }
            .meta-value {
              font-size: 11px;
              color: #0f172a;
              font-weight: bold;
            }
            .sala-card-container {
              page-break-inside: avoid;
              break-inside: avoid;
              margin-bottom: 15px;
            }
            .sala-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
              font-size: 8px;
              page-break-inside: avoid;
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }
            .sala-table th, .sala-table td {
              border: 1px solid #94a3b8;
              padding: 4px;
              vertical-align: middle;
            }
            .sala-header-row {
              background-color: #0f172a;
              color: #FFF;
              font-size: 10px;
              font-weight: bold;
              text-align: center;
            }
            .movie-title-row {
              background-color: #f1f5f9;
              font-weight: bold;
              font-size: 8px;
              text-align: center;
              height: 30px;
            }
            .col-header-row {
              background-color: #e2e8f0;
              font-weight: bold;
              font-size: 7.5px;
              text-align: center;
            }
            .trailer-row {
              height: 18px;
            }
            .trailer-name {
              font-weight: 500;
              padding-left: 6px !important;
            }
            .qty-col, .dur-col {
              text-align: center;
              font-weight: bold;
            }
            .summary-row {
              background-color: #f8fafc;
              font-weight: bold;
              height: 20px;
            }
            .footer {
              text-align: center;
              font-size: 9px;
              color: #94a3b8;
              margin-top: 25px;
              border-top: 1px solid #e2e8f0;
              padding-top: 8px;
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <h1 class="header-title">…:::PLANILLA DE TRAILERS Y PUBLICIDADES:::...</h1>
           
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Responsable de Programación</span>
                <span class="meta-value">M. Sucovsky - J. Rodriguez - F. Castillo</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Complejo</span>
                <span class="meta-value">Hoyts Abasto (2004)</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Fecha de Exhibición</span>
                <span class="meta-value">${activePeriod}</span>
              </div>
            </div>
          </div>
      `;

      // Draw tables for each Sala
      editableScreens.forEach((scr, idx) => {
        html += `
          <div class="sala-card-container">
            <table class="sala-table">
              <thead>
                <tr class="sala-header-row">
                  <th colspan="12">SALA ${scr.screenNum}</th>
                </tr>
                <tr class="movie-title-row">
        `;

        // 6 movies columns
        for (let k = 0; k < 6; k++) {
          const movie = scr.movies[k];
          const title = movie ? movie.sessionTitle : "";
          html += `<th colspan="2">${title || ""}</th>`;
        }

        html += `
                </tr>
                <tr class="col-header-row">
        `;

        // Col headers for each movie column
        for (let k = 0; k < 6; k++) {
          html += `
            <th>Trailer</th>
            <th style="width: 25px;">Cant</th>
          `;
        }

        html += `
                </tr>
              </thead>
              <tbody>
        `;

        // 5 trailer rows (Cola #4 to Cola #1 + 1 extra row)
        for (let r = 0; r < 5; r++) {
          html += `<tr class="trailer-row">`;
          for (let k = 0; k < 6; k++) {
            const movie = scr.movies[k];
            const trailer = movie && movie.trailers[r] ? movie.trailers[r] : "";
            const qty = trailer ? "1" : "";

            html += `
              <td class="trailer-name">${trailer}</td>
              <td class="qty-col">${qty}</td>
            `;
          }
          html += `</tr>`;
        }

        // Summary row total trailers
        html += `
          <tr class="summary-row">
        `;
        for (let k = 0; k < 6; k++) {
          const movie = scr.movies[k];
          const hasTrailers = movie && movie.trailers.length > 0;
          const totalQty = hasTrailers ? movie.trailers.length : 0;
          html += `
            <td style="padding-left: 6px;">Cantidad total de Trailers</td>
            <td class="qty-col">${hasTrailers ? totalQty : ""}</td>
          `;
        }

        html += `
                </tr>
              </tbody>
            </table>
          </div>
        `;
      });

      html += `
        </body>
        </html>
      `;

      // Export/print PDF
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          throw new Error("El navegador bloqueó el popup. Permití popups e intentá de nuevo.");
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        const doPrint = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 500);
        };

        if (printWindow.document.readyState === "complete") {
          doPrint();
        } else {
          printWindow.onload = doPrint;
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: "Planilla de Trailers Hoyts - PDF",
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("PDF generado", `Se guardó en:\n${uri}`);
        }
      }

    } catch (e: any) {
      console.error("PDF generation error:", e);
      Alert.alert("Error generando PDF", e?.message ?? "Hubo un problema al generar el formato imprimible.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const canProcess = (sourceMode === "pdf" ? !!pdfText : !!dbWeekly) && !!trlsData && !!editableScreens;

  return (
    <ScrollView style={s.main} contentContainerStyle={s.content}>
      {/* MANUAL CARD */}
      <Pressable
        style={[s.card, s.manualCard, showManual && s.manualCardActive]}
        onPress={() => setShowManual(!showManual)}
      >
        <View style={s.rowBetween}>
          <View style={s.manualHeader}>
            <Text style={{ fontSize: 18 }}>📖</Text>
            <Text style={s.manualTitle}>Manual de Uso - Trailers Semanales</Text>
          </View>
          <Text style={s.manualChevron}>{showManual ? "▲" : "▼"}</Text>
        </View>

        {showManual && (
          <View style={s.manualContent}>
            <View style={s.divider} />
            <View style={s.step}>
              <Text style={s.stepNumber}>1</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Exportar Archivos desde Vista</Text>
                <Text style={s.stepText}>• **PDF**: Generar y descargar el reporte "Weekly Sessions by Screen" en formato PDF.</Text>
                <Text style={s.stepText}>• **Excel**: Descargar el cuadro de distribución "TRLS.xlsx" para la semana.</Text>
              </View>
            </View>
            <View style={s.step}>
              <Text style={s.stepNumber}>2</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Cargar en la Aplicación</Text>
                <Text style={s.stepText}>• Subir el PDF en la sección **Session by Screen** o seleccionar usar la programación semanal guardada de la base de datos.</Text>
                <Text style={s.stepText}>• Subir el Excel en la sección **TRLS de la Semana**.</Text>
              </View>
            </View>
            <View style={s.step}>
              <Text style={s.stepNumber}>3</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Generar Planilla Oficial</Text>
                <Text style={s.stepText}>• Verificar el dashboard de emparejamiento por sala.</Text>
                <Text style={s.stepText}>• Presionar **"IMPRIMIR / PDF"** para generar la planilla de trailers Hoyts lista para imprimir o guardar.</Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>

      {/* FILE UPLOAD CARD */}
      <View style={s.card}>
        {/* SECTION 1: SOURCE SELECTOR & CONFIG */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>1. Programación Semanal</Text>

          <View style={s.tabContainer}>
            <Pressable
              style={[s.tabButton, sourceMode === "pdf" && s.tabButtonActive]}
              onPress={() => setSourceMode("pdf")}
            >
              <Text style={[s.tabButtonText, sourceMode === "pdf" && s.tabButtonTextActive]}>
                📁 PDF Session by Screen
              </Text>
            </Pressable>
            <Pressable
              style={[s.tabButton, sourceMode === "programacion" && s.tabButtonActive]}
              onPress={() => {
                setSourceMode("programacion");
                loadDbWeekly(true);
              }}
            >
              {loadingDbWeekly ? (
                <ActivityIndicator color={COLORS.primary} size="small" style={{ marginRight: 6 }} />
              ) : null}
              <Text style={[s.tabButtonText, sourceMode === "programacion" && s.tabButtonTextActive]}>
                🖥️ Usar Programación Guardada
              </Text>
            </Pressable>
          </View>

          {sourceMode === "pdf" ? (
            <Pressable
              style={[s.filePicker, !!pdfText && s.filePickerActive, readOnly && { opacity: 0.6 }]}
              onPress={readOnly ? undefined : pickPdf}
            >
              <View style={s.filePickerIcon}>
                {loadingPdf ? (
                  <ActivityIndicator color={COLORS.primary} size="small" />
                ) : (
                  <Text style={{ fontSize: 20 }}>📁</Text>
                )}
              </View>
              <View style={s.filePickerInfo}>
                <Text style={s.filePickerText}>
                  {pdfName ? pdfName : "Seleccionar SessionsbyScreen.pdf"}
                </Text>
                <Text style={s.filePickerSubtext}>
                  {pdfText ? `Texto extraído - Semana: ${activePeriod}` : "Formato .pdf"}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={{ gap: 10 }}>

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

              {/* Fallback Banner for Servicios Programación */}
              {dbWeekly && dbWeekly.isFallbackActual && dbSubSource === "servicios" && (
                <View style={s.fallbackBanner}>
                  <Text style={s.fallbackBannerText}>
                    ⚠️ Mostrando la programación 'actual' (última guardada) porque no hay una guardada específicamente para la semana seleccionada ({selectedWeekStart}).
                  </Text>
                </View>
              )}

              {/* Source Picker Status Box */}
              <Pressable
                style={[s.filePicker, !!dbWeekly && s.filePickerActive]}
                onPress={() => loadDbWeekly(true)}
              >
                <View style={s.filePickerIcon}>
                  {loadingDbWeekly ? (
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  ) : (
                    <Text style={{ fontSize: 20 }}>🌐</Text>
                  )}
                </View>
                <View style={s.filePickerInfo}>
                  <Text style={s.filePickerText}>
                    {dbWeekly 
                      ? "Cargado: API Cinemark" 
                      : "Sin programación cargada"}
                  </Text>
                  <Text style={s.filePickerSubtext}>
                    {dbWeekly 
                      ? "Origen: Showtimes de API" 
                      : "Presioná para intentar cargar nuevamente"}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>

        <View style={s.divider} />

        {/* SECTION 2: EXCEL */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>2. TRLS de la Semana (Excel)</Text>
          <Pressable
            style={[s.filePicker, !!trlsData && s.filePickerActive, readOnly && { opacity: 0.6 }]}
            onPress={readOnly ? undefined : pickTrls}
          >
            <View style={s.filePickerIcon}>
              {loadingTrls ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Text style={{ fontSize: 20 }}>📊</Text>
              )}
            </View>
            <View style={s.filePickerInfo}>
              <Text style={s.filePickerText}>
                {trlsName ? trlsName : "Seleccionar TRLS.xlsx"}
              </Text>
              <Text style={s.filePickerSubtext}>
                {trlsData ? `${trlsData.length} películas registradas` : "Formatos .xlsx, .xls"}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* MAIN BUTTONS */}
      {canProcess && (
        <View style={s.actionRow}>
          <Pressable
            style={[s.fullButton, s.pdfBtn, generatingPdf && s.mainButtonDisabled]}
            onPress={handleGeneratePdf}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={s.mainButtonText}>IMPRIMIR / PDF</Text>
                <Text style={s.buttonSubtext}>Formato Planilla Oficial</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* DASHBOARD PREVIEW */}
      {editableScreens && (
        <View style={s.dashboardCard}>
          <View style={s.dashboardHeader}>
            <Text style={s.dashboardTitle}>Dashboard Editable de Trailers por Sala</Text>
            <Text style={[s.dashboardBadge, readOnly && { backgroundColor: COLORS.muted }]}>
              {readOnly ? "SOLO LECTURA" : "EDITABLE"}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
            ✍️ Podés editar los nombres de las películas y de los trailers directamente en los campos de texto. También podés agregar o quitar trailers sobre la marcha. Las modificaciones se aplicarán al PDF de impresión.
          </Text>
          <View style={s.divider} />

          {editableScreens.map((scr) => (
            <View key={scr.screenNum} style={s.salaBlock}>
              <View style={s.salaHeaderRow}>
                <View style={s.salaBadge}>
                  <Text style={s.salaBadgeText}>{scr.screenNum}</Text>
                </View>
                <Text style={s.salaTitle}>Sala {scr.screenNum}</Text>
              </View>

              <View style={s.moviesList}>
                {scr.movies.map((movie, idx) => (
                  <View key={idx} style={s.movieItem}>
                    {/* Movie Header / Title Input */}
                    <View style={s.movieHeaderRow}>
                      <Text style={{ fontSize: 13, marginRight: 4 }}>🎬</Text>
                      <TextInput
                        style={s.movieInput}
                        value={movie.sessionTitle}
                        onChangeText={(txt) => handleUpdateMovieTitle(scr.screenNum, idx, txt)}
                        placeholder="Nombre de la película..."
                        placeholderTextColor={COLORS.muted}
                        editable={!readOnly}
                      />
                      {movie.isMatched ? (
                        <View style={s.matchedBadge}>
                          <Text style={s.matchedBadgeText}>OK</Text>
                        </View>
                      ) : (
                        <View style={s.unmatchedBadge}>
                          <Text style={s.unmatchedBadgeText}>Sin TRLS</Text>
                        </View>
                      )}

                    </View>

                    {/* Trailers List / Editable rows */}
                    <View style={s.trailersBox}>
                      {movie.trailers.map((trl, tIdx) => (
                        <View key={tIdx} style={s.trailerInputRow}>
                          <Text style={s.trailerBullet}>•</Text>
                          <TextInput
                            style={s.trailerInput}
                            value={trl}
                            onChangeText={(txt) => handleUpdateTrailerName(scr.screenNum, idx, tIdx, txt)}
                            placeholder="Nombre del trailer..."
                            placeholderTextColor={COLORS.muted}
                            editable={!readOnly}
                          />
                          {!readOnly && (
                            <Pressable
                              style={s.removeTrailerBtn}
                              onPress={() => handleRemoveTrailer(scr.screenNum, idx, tIdx)}
                            >
                              <Text style={s.removeTrailerText}>🗑️</Text>
                            </Pressable>
                          )}
                        </View>
                      ))}

                      {movie.trailers.length === 0 && (
                        <View style={s.warningBox}>
                          <Text style={s.warningText}>
                            ⚠️ Sin trailers cargados.
                          </Text>
                          {!readOnly && (
                            <View style={s.pasteContainer}>
                              <Text style={s.pasteTitle}>Pegar lista de trailers (uno por línea):</Text>
                              <TextInput
                                style={s.pasteInput}
                                multiline={true}
                                numberOfLines={3}
                                placeholder={`batman\ntoy story`}
                                placeholderTextColor={COLORS.muted}
                                value={pasteTexts[`${scr.screenNum}-${idx}`] || ""}
                                onChangeText={(txt) => setPasteTexts(prev => ({ ...prev, [`${scr.screenNum}-${idx}`]: txt }))}
                              />
                              <Pressable
                                style={s.pasteLoadBtn}
                                onPress={() => handleImportPastedTrailers(scr.screenNum, idx)}
                              >
                                <Text style={s.pasteLoadBtnText}>⚡ Cargar Trailers</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Add Trailer Button */}
                      {!readOnly && movie.trailers.length < 5 && (
                        <Pressable
                          style={s.addTrailerBtn}
                          onPress={() => handleAddTrailer(scr.screenNum, idx)}
                        >
                          <Text style={s.addTrailerBtnText}>+ Agregar Trailer</Text>
                        </Pressable>
                      )}

                      {/* Delete Movie Button */}
                      {!readOnly && (
                        <Pressable
                          style={s.deleteMovieBtn}
                          onPress={() => handleDeleteMovie(scr.screenNum, idx)}
                        >
                          <Text style={s.deleteMovieText}>❌ Eliminar Película</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              {/* Add Movie to Sala Button */}
              {!readOnly && scr.movies.length < 6 && (
                <Pressable
                  style={s.addMovieBtn}
                  onPress={() => handleAddMovie(scr.screenNum)}
                >
                  <Text style={s.addMovieBtnText}>➕ Agregar Película a Sala {scr.screenNum}</Text>
                </Pressable>
              )}

              <View style={s.salaDivider} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  main: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  // Base card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  section: { gap: 12 },
  sectionLabel: {
    fontSize: 14.5,
    fontWeight: "900",
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 18 },

  // File pickers
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
  filePickerActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
    borderStyle: "solid",
  },
  filePickerIcon: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filePickerInfo: { flex: 1 },
  filePickerText: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  filePickerSubtext: { fontSize: 10, color: COLORS.muted },

  // Row helpers
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Manual Card
  manualCard: { borderColor: COLORS.border, padding: 16 },
  manualCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.card },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  manualTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  manualChevron: { fontSize: 12, color: COLORS.muted, fontWeight: "900" },
  manualContent: { marginTop: 4 },
  step: { flexDirection: "row", gap: 12, marginTop: 16 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    color: "#FFF",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 22,
    overflow: "hidden",
  },
  stepInfo: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  stepText: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },

  // Action area side-by-side
  actionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    justifyContent: "space-between",
    marginTop: 8,
  },
  fullButton: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...THEME.shadow.soft,
  },
  pdfBtn: {
    backgroundColor: COLORS.primary,
  },
  mainButtonDisabled: {
    opacity: 0.5,
  },
  mainButtonText: {
    fontSize: 13.5,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: 0.8,
  },
  buttonSubtext: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },

  // Dashboard styles
  dashboardCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dashboardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  dashboardBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  salaBlock: {
    marginTop: 10,
  },
  salaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  salaBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  salaBadgeText: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },
  salaTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },
  moviesList: {
    paddingLeft: 12,
    gap: 12,
  },
  movieItem: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  movieHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  movieNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },
  matchedBadge: {
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  matchedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
  },
  unmatchedBadge: {
    backgroundColor: MKT.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unmatchedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: MKT.warning,
  },
  trailersBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 4,
  },
  trlText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  warningBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  warningText: {
    fontSize: 11,
    color: MKT.warning,
    lineHeight: 16,
  },
  salaDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 18,
    marginBottom: 10,
  },
  // Interactive inputs and buttons
  movieInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trailerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 3,
  },
  trailerBullet: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: "bold",
  },
  trailerInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: COLORS.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  removeTrailerBtn: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  removeTrailerText: {
    fontSize: 12,
  },
  addTrailerBtn: {
    width: "100%",
    backgroundColor: COLORS.primarySoft,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  addTrailerBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
  },
  deleteMovieBtn: {
    width: "100%",
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fee2e2", // red-100 soft red
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fca5a5",
    marginTop: 8,
  },
  deleteMovieText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#dc2626", // strong red text
  },
  addMovieBtn: {
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  addMovieBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
  },
  pasteContainer: {
    marginTop: 8,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  pasteTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.text,
  },
  pasteInput: {
    fontSize: 11.5,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    height: 60,
    textAlignVertical: "top", // alignment for multiline android
  },
  pasteLoadBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pasteLoadBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFF",
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

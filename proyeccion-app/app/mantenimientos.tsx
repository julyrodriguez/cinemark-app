import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useState, useMemo } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import PageTitle from "@/components/PageTitle";
import { auth, db, CINES_COLLECTION } from "../lib/firebaseConfig";
import { COLORS, THEME } from "../lib/theme";
import { useAuthUser } from "../lib/useAuthUser";
import { useAppLayout } from "../lib/useAppLayout";

export interface Mantenimiento {
  id: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  duration?: number;
  type: "A" | "B" | "C" | "D";
  performedBy: "Nosotros" | "Ingeniero";
  notes?: string;
  calendarEventId?: string | null;
  calendarEventIds?: string[];
  createdAt?: any;
  createdBy?: string;
  createdName?: string;
}

// Helper: Calculate days between two YYYY-MM-DD date strings
function getDaysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1 + "T12:00:00");
  const d2 = new Date(dateStr2 + "T12:00:00");
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const diffTime = Math.abs(utc2 - utc1);
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// Helper: Add days to YYYY-MM-DD string
function addDaysToYmd(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Helper: Format date string YYYY-MM-DD to DD/MM/YYYY
function ymdToDdmmyyyy(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Helper: Format date in Spanish (e.g. Lunes, 12 de Junio de 2026)
function formatDisplayDate(dateStr: string): string {
  const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const date = new Date(dateStr + "T12:00:00");
  const dayName = daysOfWeek[date.getDay()];
  const day = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName}, ${day} de ${monthName} de ${year}`;
}

// Helper: Short date format for mobile (e.g. "12 Jun")
function formatDisplayDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDate();
  const monthsShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${day} ${monthsShort[date.getMonth()]}`;
}

// Helper: Format date range
function formatRangeDate(start: string, end?: string): string {
  if (!end || start === end) return formatDisplayDate(start);
  return `Del ${formatDisplayDate(start)} al ${formatDisplayDate(end)}`;
}

function formatRangeDateShort(start: string, end?: string): string {
  if (!end || start === end) return formatDisplayDateShort(start);
  return `${formatDisplayDateShort(start)} al ${formatDisplayDateShort(end)}`;
}

// Helper: Relative time (e.g. "Hace 5 días", "Hoy", "Ayer")
function getRelativeTime(dateStr: string): string {
  const target = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays === -1) return "Mañana";
  if (diffDays < 0) return `En ${Math.abs(diffDays)} días`;

  if (diffDays < 30) {
    return `Hace ${diffDays} ${diffDays === 1 ? "día" : "días"}`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    const remainingDays = diffDays % 30;
    if (remainingDays === 0) {
      return `Hace ${diffMonths} ${diffMonths === 1 ? "mes" : "meses"}`;
    }
    return `Hace ${diffMonths} ${diffMonths === 1 ? "mes" : "meses"} y ${remainingDays} ${remainingDays === 1 ? "día" : "días"}`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `Hace ${diffYears} ${diffYears === 1 ? "año" : "años"}`;
}

export default function MantenimientosScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, loading: sessionLoading, displayName } = useAuthUser();
  const { isMobile } = useAppLayout();

  const [activeSubTab, setActiveSubTab] = useState<"fechas" | "barco_pc">("fechas");
  const [loading, setLoading] = useState(true);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"A" | "B" | "C" | "D">("A");
  const [duration, setDuration] = useState<number>(1);
  const [notes, setNotes] = useState("");

  // Date states
  const [customDateText, setCustomDateText] = useState(""); // Web YYYY-MM-DD (typed as DD/MM/YYYY)
  const [customDateValue, setCustomDateValue] = useState<Date>(new Date()); // Mobile
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  // Delete states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mtmToDelete, setMtmToDelete] = useState<Mantenimiento | null>(null);

  // Fetch mantenimientos
  useEffect(() => {
    let unsub: any;

    (async () => {
      if (sessionLoading) {
        setLoading(true);
        return;
      }
      if (!user || !cineId) {
        setMantenimientos([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, CINES_COLLECTION, cineId, "mantenimientos"),
        orderBy("date", "desc")
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          const arr = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as Mantenimiento[];

          setMantenimientos(arr);
          setLoading(false);
        },
        (err) => {
          console.error(err);
          setLoading(false);
          Alert.alert("Mantenimientos", "No se pudieron cargar los registros.");
        }
      );
    })();

    return () => unsub && unsub();
  }, [user, cineId, sessionLoading]);

  // Automatic client-side migration: migrate older MTM calendar events to Type B mantenimientos
  useEffect(() => {
    if (sessionLoading || !user || !cineId || loading) return;

    let active = true;

    const performClientMigration = async () => {
      try {
        const calCol = collection(db, CINES_COLLECTION, cineId, "calendarEvents");
        const qCal = query(calCol, where("type", "==", "MTM"));
        const calSnap = await getDocs(qCal);

        if (!active) return;

        const migratedDatesAndIds = new Set();
        const unmigrated: any[] = [];
        for (const docSnap of calSnap.docs) {
          const eventData = docSnap.data();
          const eventId = docSnap.id;
          
          const dateKey = eventData.date;
          const isAlreadyProcessed = migratedDatesAndIds.has(eventId) || (dateKey && migratedDatesAndIds.has(dateKey));

          const isLinked = isAlreadyProcessed || mantenimientos.some(
            (m) => m.calendarEventId === eventId || (m.date === dateKey && m.type === "B")
          );

          if (!isLinked) {
            unmigrated.push({ id: eventId, ...eventData });
            migratedDatesAndIds.add(eventId);
            if (dateKey) {
              migratedDatesAndIds.add(dateKey);
            }
          }
        }

        if (unmigrated.length === 0) return;

        console.log(`[Migration] Found ${unmigrated.length} unmigrated Mtm calendar events. Migrating...`);

        const mtmColRef = collection(db, CINES_COLLECTION, cineId, "mantenimientos");
        for (const evt of unmigrated) {
          await addDoc(mtmColRef, {
            date: evt.date,
            type: "B",
            performedBy: "Nosotros",
            notes: evt.description || "Migrado desde calendario",
            calendarEventId: evt.id,
            createdAt: evt.createdAt || serverTimestamp(),
            createdBy: evt.createdBy || user.uid,
            createdName: evt.createdName || "Sistema",
          });
        }
        console.log(`[Migration] Successfully migrated ${unmigrated.length} events to new mantenimientos collection.`);
      } catch (err) {
        console.error("[Migration] Error migrating calendar MTM events: ", err);
      }
    };

    performClientMigration();

    return () => {
      active = false;
    };
  }, [user, cineId, sessionLoading, loading, mantenimientos]);

  const hasCleanedRef = React.useRef(false);

  // Automatic client-side cleanup: delete duplicate maintenance documents on the same date, leaving only one.
  useEffect(() => {
    if (sessionLoading || !user || !cineId || loading || mantenimientos.length === 0 || hasCleanedRef.current) return;

    const performClientCleanup = async () => {
      hasCleanedRef.current = true;
      try {
        const seenDates = new Set();
        const duplicatesToDelete: Mantenimiento[] = [];

        // Sort by creation time (oldest first) so we keep the first one registered
        const sorted = [...mantenimientos].sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeA - timeB;
        });

        for (const mtm of sorted) {
          if (seenDates.has(mtm.date)) {
            duplicatesToDelete.push(mtm);
          } else {
            seenDates.add(mtm.date);
          }
        }

        if (duplicatesToDelete.length === 0) return;

        console.log(`[Cleanup] Found ${duplicatesToDelete.length} duplicate maintenance records. Cleaning up...`);

        for (const dup of duplicatesToDelete) {
          // Delete linked calendar events
          if (dup.calendarEventIds && dup.calendarEventIds.length > 0) {
            for (const eventId of dup.calendarEventIds) {
              await deleteDoc(doc(db, CINES_COLLECTION, cineId, "calendarEvents", eventId));
            }
          } else if (dup.calendarEventId) {
            await deleteDoc(doc(db, CINES_COLLECTION, cineId, "calendarEvents", dup.calendarEventId));
          }

          // Delete the maintenance document
          await deleteDoc(doc(db, CINES_COLLECTION, cineId, "mantenimientos", dup.id));
          console.log(`[Cleanup] Deleted duplicate maintenance ${dup.id} for date ${dup.date}`);
        }
        console.log(`[Cleanup] Successfully removed duplicate records.`);
      } catch (err) {
        console.error("[Cleanup] Error during duplicate cleanup: ", err);
      }
    };

    performClientCleanup();
  }, [user, cineId, sessionLoading, loading, mantenimientos]);

  // Compute gaps, stats and visual groups (difference of 1 day or less)
  const { displayGroups, stats } = useMemo(() => {
    // 1. Sort ascending to calculate consecutive gaps correctly
    const sortedAsc = [...mantenimientos].sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeA - timeB;
    });

    const gapsMap: Record<string, number> = {};
    for (let i = 1; i < sortedAsc.length; i++) {
      const current = sortedAsc[i];
      const prev = sortedAsc[i - 1];
      gapsMap[current.id] = getDaysBetween(prev.date, current.date);
    }

    // 2. Sort descending for layout display
    const sortedDesc = [...mantenimientos].sort((a, b) => {
      const dateComp = b.date.localeCompare(a.date);
      if (dateComp !== 0) return dateComp;
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    // 3. Group items: if the difference between a newer item's start date and an older item's end date is <= 1 day, group them
    const groups: Mantenimiento[][] = [];
    let currentGroup: Mantenimiento[] = [];

    for (let i = 0; i < sortedDesc.length; i++) {
      const item = sortedDesc[i];
      if (currentGroup.length === 0) {
        currentGroup.push(item);
      } else {
        const lastItemInGroup = currentGroup[currentGroup.length - 1];
        // list is descending, so lastItemInGroup.date >= item.date.
        // If lastItemInGroup has endDate, compare item.date with lastItemInGroup.date (start date) or compare start/end.
        // To be safe, calculate diff between start date of the newer item (lastItemInGroup) and end date of the older item (item.endDate || item.date)
        const date1 = lastItemInGroup.date;
        const date2 = item.endDate || item.date;
        const diff = getDaysBetween(date1, date2);

        if (diff <= 1) {
          currentGroup.push(item);
        } else {
          groups.push(currentGroup);
          currentGroup = [item];
        }
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // 4. Compute stats
    const total = mantenimientos.length;
    const totalDays = mantenimientos.reduce((acc, m) => acc + (m.duration || 1), 0);
    const ultimo = sortedDesc[0] || null;

    let avgGap: number | null = null;
    if (total > 1) {
      let sumGaps = 0;
      let countGaps = 0;
      Object.values(gapsMap).forEach((gap) => {
        sumGaps += gap;
        countGaps++;
      });
      if (countGaps > 0) {
        avgGap = Math.round(sumGaps / countGaps);
      }
    }

    // Associate gaps to groups
    // The gap will be calculated between the current group and the next newer group.
    // Group G[idx] is older than G[idx - 1] (since list is descending).
    // The gap is between current group's maxDate (end of cycle) and next newer group's minDate (start of next cycle).
    const displayGroupsWithGaps = groups.map((g, idx) => {
      let groupGap: number | null = null;
      let nextStartDate: string | null = null;
      if (idx > 0) {
        const maxDateOfCurrent = g[0].endDate || g[0].date;
        const nextNewerGroup = groups[idx - 1];
        const minDateOfNextNewer = nextNewerGroup[nextNewerGroup.length - 1].date;
        groupGap = getDaysBetween(maxDateOfCurrent, minDateOfNextNewer);
        nextStartDate = minDateOfNextNewer;
      }
      return {
        id: g[0].id,
        items: g,
        maxDate: g[0].endDate || g[0].date,
        minDate: g[g.length - 1].date,
        gapDays: groupGap,
        nextStartDate,
      };
    });

    return {
      displayGroups: displayGroupsWithGaps,
      stats: {
        total,
        totalDays,
        ultimo,
        avgGap,
      },
    };
  }, [mantenimientos]);

  const openNew = () => {
    const today = new Date();
    const formattedWeb = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    setCustomDateText(formattedWeb);
    setCustomDateValue(today);
    setType("A");
    setDuration(1);
    setNotes("");
    setShowForm(true);
  };

  /** Parse DD/MM/YYYY → YYYY-MM-DD */
  const parseDateInput = (text: string): string | null => {
    const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = parseInt(dd, 10), mo = parseInt(mm, 10), y = parseInt(yyyy, 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  const addMantenimiento = async () => {
    if (!user || !cineId) return;

    let dateStr: string;

    if (Platform.OS === "web") {
      const parsed = parseDateInput(customDateText);
      if (!parsed) {
        Alert.alert("Fecha inválida", "Usá el formato DD/MM/AAAA (ej: 28/03/2026)");
        return;
      }
      dateStr = parsed;
    } else {
      const d = customDateValue;
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    try {
      const storedDisplayName =
        (await AsyncStorage.getItem("displayName")) ||
        displayName ||
        user.email?.split("@")[0] ||
        "Usuario";

      const performedBy = (type === "A" || type === "B") ? "Nosotros" : "Ingeniero";

      // 1. Create multiple calendar events (one for each day)
      const calendarEventIds: string[] = [];
      const calColRef = collection(db, CINES_COLLECTION, cineId, "calendarEvents");
      
      for (let i = 0; i < duration; i++) {
        const eventDate = addDaysToYmd(dateStr, i);
        const calDocRef = await addDoc(calColRef, {
          date: eventDate,
          type: "MTM",
          title: "MTM",
          description: `Mantenimiento Tipo ${type} (${performedBy === "Nosotros" ? "Nosotros" : "Ingeniero"})${notes.trim() ? " - " + notes.trim() : ""}`,
          createdBy: user.uid,
          createdName: storedDisplayName,
          createdAt: serverTimestamp(),
          cineId: cineId,
        });
        calendarEventIds.push(calDocRef.id);
      }

      // 2. Add maintenance record with linked calendarEventIds
      await addDoc(collection(db, CINES_COLLECTION, cineId, "mantenimientos"), {
        date: dateStr,
        endDate: addDaysToYmd(dateStr, duration - 1),
        duration,
        type,
        performedBy,
        notes: notes.trim() || null,
        calendarEventIds,
        calendarEventId: calendarEventIds[0], // legacy fallback
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdName: storedDisplayName,
      });

      setShowForm(false);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo registrar el mantenimiento.");
    }
  };

  const askDeleteMtm = (item: Mantenimiento) => {
    if (readOnly) return;
    setMtmToDelete(item);
    setShowDeleteConfirm(true);
  };

  const confirmRemoveMtm = async () => {
    if (!mtmToDelete || !cineId) return;

    try {
      // 1. Delete associated calendar events
      if (mtmToDelete.calendarEventIds && mtmToDelete.calendarEventIds.length > 0) {
        for (const eventId of mtmToDelete.calendarEventIds) {
          await deleteDoc(doc(db, CINES_COLLECTION, cineId, "calendarEvents", eventId));
        }
      } else if (mtmToDelete.calendarEventId) {
        await deleteDoc(doc(db, CINES_COLLECTION, cineId, "calendarEvents", mtmToDelete.calendarEventId));
      }
      
      // 2. Delete maintenance
      await deleteDoc(doc(db, CINES_COLLECTION, cineId, "mantenimientos", mtmToDelete.id));

      setShowDeleteConfirm(false);
      setMtmToDelete(null);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo eliminar el mantenimiento.");
    }
  };

  const getTypeStyle = (t: "A" | "B" | "C" | "D") => {
    switch (t) {
      case "A":
        return { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" }; // Blue
      case "B":
        return { bg: "#ECFDF5", border: "#A7F3D0", text: "#047857" }; // Green
      case "C":
        return { bg: "#FFFBEB", border: "#FDE68A", text: "#B45309" }; // Amber
      case "D":
        return { bg: "#FAF5FF", border: "#E9D5FF", text: "#6D28D9" }; // Purple
    }
  };

  const renderStats = () => {
    const ultimoText = stats.ultimo
      ? `Tipo ${stats.ultimo.type} (${getRelativeTime(stats.ultimo.date)})`
      : "Ninguno";

    return (
      <View style={[styles.statsRow, isMobile && styles.statsRowMobile]}>
        <View style={[styles.statsCard, isMobile && styles.statsCardMobile, { flex: isMobile ? 1.4 : 1.5 }]}>
          <MaterialCommunityIcons name="clock-outline" size={isMobile ? 16 : 22} color={COLORS.primary} style={{ marginBottom: isMobile ? 3 : 6 }} />
          <Text style={[styles.statsVal, isMobile && styles.statsValMobile]} numberOfLines={1}>{ultimoText}</Text>
          <Text style={[styles.statsLbl, isMobile && styles.statsLblMobile]}>Último Mtm</Text>
        </View>

        <View style={[styles.statsCard, isMobile && styles.statsCardMobile]}>
          <MaterialCommunityIcons name="calendar-range" size={isMobile ? 16 : 22} color={COLORS.primary} style={{ marginBottom: isMobile ? 3 : 6 }} />
          <Text style={[styles.statsVal, isMobile && styles.statsValMobile]}>
            {stats.avgGap !== null ? `${stats.avgGap}d` : "N/A"}
          </Text>
          <Text style={[styles.statsLbl, isMobile && styles.statsLblMobile]}>Frecuencia</Text>
        </View>
      </View>
    );
  };

  const renderSingleCardContent = (item: Mantenimiento, hideHeader = false, isLatestOverall = false) => {
    const styleMeta = getTypeStyle(item.type);
    const isEngineer = item.type === "C" || item.type === "D";
    const dateText = item.duration && item.duration > 1 
      ? (isMobile ? formatRangeDateShort(item.date, item.endDate) : formatRangeDate(item.date, item.endDate))
      : (isMobile ? formatDisplayDateShort(item.date) : formatDisplayDate(item.date));

    return (
      <View style={styles.cardContent}>
        {!hideHeader && (
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, { backgroundColor: styleMeta.bg, borderColor: styleMeta.border }]}>
              <Text style={[styles.typeBadgeText, { color: styleMeta.text, fontSize: isMobile ? 10 : 12 }]}>
                Tipo {item.type} {item.duration && item.duration > 1 ? `(${item.duration}d)` : ""}
              </Text>
            </View>

            <View style={styles.performedBadge}>
              <MaterialCommunityIcons
                name={isEngineer ? "account-hard-hat-outline" : "account-supervisor-outline"}
                size={isMobile ? 12 : 14}
                color={isEngineer ? "#7C3AED" : COLORS.muted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.performedText, { fontSize: isMobile ? 10 : 11 }, isEngineer && { color: "#7C3AED", fontWeight: "700" }]}>
                {isEngineer ? "Ingeniero" : "Nosotros"}
              </Text>
            </View>

            {!readOnly && (
              <TouchableOpacity style={styles.deleteCardBtn} onPress={() => askDeleteMtm(item)}>
                <MaterialCommunityIcons name="trash-can-outline" size={isMobile ? 16 : 18} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.cardBody}>
          <Text style={[styles.cardDate, { fontSize: isMobile ? 14 : 16 }]}>
            {dateText}
          </Text>
          {isLatestOverall && (
            <Text style={[styles.cardRelativeDate, { fontSize: isMobile ? 12 : 13 }]}>
              {getRelativeTime(item.endDate || item.date)}
            </Text>
          )}

          {!!item.notes && (
            <View style={styles.notesContainer}>
              <Text style={[styles.notesText, { fontSize: isMobile ? 13 : 14 }]}>{item.notes}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.createdByText, { fontSize: isMobile ? 10 : 11 }]}>
            Registrado por {item.createdName || "Usuario"}
          </Text>
        </View>
      </View>
    );
  };

  const renderGroupedCard = (items: Mantenimiento[], isLatestOverall = false) => {
    const minDate = items[items.length - 1].date;
    const maxDate = items[0].date;
    const dateRangeStr = minDate === maxDate
      ? (isMobile ? formatDisplayDateShort(minDate) : formatDisplayDate(minDate))
      : (isMobile ? formatRangeDateShort(minDate, maxDate) : formatRangeDate(minDate, maxDate));

    return (
      <View style={styles.groupedMtmCard}>
        {/* Group Header */}
        <View style={styles.groupedHeader}>
          <MaterialCommunityIcons name="layers-outline" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupedTitle, { fontSize: isMobile ? 13 : 14 }]}>Mantenimientos Agrupados</Text>
            <Text style={[styles.groupedSubtitle, { fontSize: isMobile ? 11 : 12 }]}>{dateRangeStr} ({items.length} registros)</Text>
            {isLatestOverall && (
              <Text style={[styles.cardRelativeDate, { fontSize: isMobile ? 12 : 13, marginTop: 2 }]}>
                {getRelativeTime(maxDate)}
              </Text>
            )}
          </View>
        </View>

        {/* Group Items */}
        <View style={styles.groupedBody}>
          {items.map((item, idx) => {
            const styleMeta = getTypeStyle(item.type);
            const isEngineer = item.type === "C" || item.type === "D";
            const showDateInRow = (minDate !== maxDate) && (idx === 0 || items[idx].date !== items[idx - 1].date);
            const itemDateStr = isMobile ? formatDisplayDateShort(item.date) : formatDisplayDate(item.date);

            return (
              <View key={item.id} style={[styles.groupedItemRow, idx > 0 && styles.groupedItemRowBorder]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: styleMeta.bg, borderColor: styleMeta.border }]}>
                    <Text style={[styles.typeBadgeText, { color: styleMeta.text, fontSize: isMobile ? 10 : 12 }]}>
                      Tipo {item.type} {item.duration && item.duration > 1 ? `(${item.duration}d)` : ""}
                    </Text>
                  </View>

                  <View style={styles.performedBadge}>
                    <MaterialCommunityIcons
                      name={isEngineer ? "account-hard-hat-outline" : "account-supervisor-outline"}
                      size={isMobile ? 12 : 14}
                      color={isEngineer ? "#7C3AED" : COLORS.muted}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.performedText, { fontSize: isMobile ? 10 : 11 }, isEngineer && { color: "#7C3AED", fontWeight: "700" }]}>
                      {isEngineer ? "Ingeniero" : "Nosotros"}
                    </Text>
                  </View>

                  {!readOnly && (
                    <TouchableOpacity style={styles.deleteCardBtn} onPress={() => askDeleteMtm(item)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={isMobile ? 15 : 17} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.cardBody}>
                  {showDateInRow && (
                    <Text style={[styles.cardDate, { fontSize: isMobile ? 13 : 15, marginTop: 4 }]}>
                      {itemDateStr}
                    </Text>
                  )}

                  {!!item.notes && (
                    <View style={[styles.notesContainer, { marginTop: 6 }]}>
                      <Text style={[styles.notesText, { fontSize: isMobile ? 12 : 13 }]}>{item.notes}</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.cardFooter, { borderTopWidth: 0, paddingTop: 2 }]}>
                  <Text style={[styles.createdByText, { fontSize: isMobile ? 10 : 11 }]}>
                    Registrado por {item.createdName || "Usuario"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderGroupItem = ({ item, index }: { item: { id: string; items: Mantenimiento[]; gapDays: number | null; nextStartDate?: string | null }; index: number }) => {
    const isLatestGroup = index === 0;

    return (
      <View style={styles.cardWrapper}>
        {/* If gap days are present, show gap separator connecting to the next newer group */}
        {item.gapDays !== null && item.gapDays !== undefined && (
          <View style={styles.gapConnectorContainer}>
            <View style={styles.gapLine} />
            <View style={styles.gapBadge}>
              <MaterialCommunityIcons name="timelapse" size={12} color={COLORS.muted} style={{ marginRight: 4 }} />
              <Text style={[styles.gapText, { fontSize: isMobile ? 10 : 11 }]}>
                Pasaron {item.gapDays} {item.gapDays === 1 ? "día" : "días"} hasta el siguiente mantenimiento {item.nextStartDate ? `(${ymdToDdmmyyyy(item.nextStartDate)})` : ""}
              </Text>
            </View>
            <View style={styles.gapLine} />
          </View>
        )}

        {/* Group render: if 1 item in group, render normal card, else render grouped card */}
        {item.items.length === 1 ? (
          <View style={styles.mtmCard}>
            {renderSingleCardContent(item.items[0], false, isLatestGroup)}
          </View>
        ) : (
          renderGroupedCard(item.items, isLatestGroup)
        )}
      </View>
    );
  };

  const renderFechasTab = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {renderStats()}

        {mantenimientos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="calendar-multiselect"
              size={isMobile ? 48 : 64}
              color={COLORS.muted}
              style={{ opacity: 0.4, marginBottom: 16 }}
            />
            <Text style={[styles.emptyTitle, { fontSize: isMobile ? 16 : 18 }]}>Sin mantenimientos registrados</Text>
            <Text style={[styles.emptySubtitle, { fontSize: isMobile ? 12 : 14 }]}>
              Presioná el botón de agregar para registrar el primer mantenimiento.
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayGroups}
            keyExtractor={(item) => item.id}
            renderItem={renderGroupItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  };

  const renderBarcoPcTab = () => {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="laptop"
          size={isMobile ? 60 : 80}
          color={COLORS.muted}
          style={{ opacity: 0.3, marginBottom: 20 }}
        />
        <Text style={[styles.emptyTitle, { fontSize: isMobile ? 16 : 18 }]}>Sección Barco Pc</Text>
        <Text style={[styles.emptySubtitle, { fontSize: isMobile ? 12 : 14 }]}>
          Esta sección está reservada y se desarrollará en el futuro.
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { padding: isMobile ? 8 : 16 }]}>
      <PageTitle title="Mantenimientos" center />

      {/* Subtab Navigation */}
      <View style={[styles.tabBar, { marginBottom: isMobile ? 12 : 16 }]}>
        <TouchableOpacity
          style={[styles.tabButton, { paddingVertical: isMobile ? 8 : 12, paddingHorizontal: isMobile ? 12 : 20 }, activeSubTab === "fechas" && styles.tabButtonActive]}
          onPress={() => setActiveSubTab("fechas")}
        >
          <MaterialCommunityIcons
            name="calendar-clock"
            size={isMobile ? 16 : 18}
            color={activeSubTab === "fechas" ? COLORS.primary : COLORS.muted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabButtonText, { fontSize: isMobile ? 13 : 15 }, activeSubTab === "fechas" && styles.tabButtonTextActive]}>
            Fechas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, { paddingVertical: isMobile ? 8 : 12, paddingHorizontal: isMobile ? 12 : 20 }, activeSubTab === "barco_pc" && styles.tabButtonActive]}
          onPress={() => setActiveSubTab("barco_pc")}
        >
          <MaterialCommunityIcons
            name="laptop"
            size={isMobile ? 16 : 18}
            color={activeSubTab === "barco_pc" ? COLORS.primary : COLORS.muted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabButtonText, { fontSize: isMobile ? 13 : 15 }, activeSubTab === "barco_pc" && styles.tabButtonTextActive]}>
            Barco Pc
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeSubTab === "fechas" ? renderFechasTab() : renderBarcoPcTab()}
      </View>

      {!readOnly && activeSubTab === "fechas" && (
        <TouchableOpacity
          style={styles.fabBR}
          onPress={openNew}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="plus" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add Modal */}
      <Modal
        visible={showForm}
        animationType="fade"
        transparent
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardModern, { padding: isMobile ? 16 : 22 }]}>
            <Text style={[styles.modalTitleModern, { fontSize: isMobile ? 18 : 22 }]}>Registrar Mantenimiento</Text>
            <Text style={[styles.modalSubtitleModern, { fontSize: isMobile ? 12 : 14, marginBottom: isMobile ? 12 : 18 }]}>
              Completá los datos correspondientes al mantenimiento realizado.
            </Text>

            {/* Date Selection */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Fecha de inicio</Text>
              {Platform.OS === "web" ? (
                <TextInput
                  style={[styles.modalInputModern, { minHeight: isMobile ? 40 : 46 }]}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#94A3B8"
                  value={customDateText}
                  onChangeText={setCustomDateText}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : (
                <View>
                  <TouchableOpacity
                    style={styles.dropdownTrigger}
                    onPress={() => setShowAndroidPicker(true)}
                  >
                    <Text style={styles.dropdownTriggerText}>
                      {customDateValue
                        ? formatDate(`${customDateValue.getFullYear()}-${String(customDateValue.getMonth() + 1).padStart(2, "0")}-${String(customDateValue.getDate()).padStart(2, "0")}`)
                        : "Seleccionar fecha"}
                    </Text>
                    <MaterialCommunityIcons name="calendar" size={20} color={COLORS.muted} />
                  </TouchableOpacity>
                  {showAndroidPicker && (
                    <DateTimePicker
                      value={customDateValue}
                      mode="date"
                      display="default"
                      onChange={(_: any, selectedDate?: Date) => {
                        setShowAndroidPicker(false);
                        if (selectedDate) setCustomDateValue(selectedDate);
                      }}
                    />
                  )}
                </View>
              )}
            </View>

            {/* Duration (multi-day) selection */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Duración del Mantenimiento</Text>
              <View style={styles.typeSelectorRow}>
                {([1, 2, 3] as const).map((d) => {
                  const isSelected = duration === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.typeSelectorBtn,
                        { height: isMobile ? 38 : 44 },
                        isSelected && {
                          backgroundColor: COLORS.primarySoft,
                          borderColor: COLORS.primary,
                        },
                      ]}
                      onPress={() => setDuration(d)}
                    >
                      <Text
                        style={[
                          styles.typeSelectorBtnText,
                          { color: isSelected ? COLORS.primary : COLORS.muted, fontSize: isMobile ? 13 : 15 },
                          isSelected && { fontWeight: "800" },
                        ]}
                      >
                        {d} {d === 1 ? "día" : "días"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Type Selection */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tipo de Mantenimiento</Text>
              <View style={styles.typeSelectorRow}>
                {(["A", "B", "C", "D"] as const).map((t) => {
                  const isSelected = type === t;
                  const styleMeta = getTypeStyle(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeSelectorBtn,
                        { height: isMobile ? 38 : 44 },
                        isSelected && {
                          backgroundColor: styleMeta.bg,
                          borderColor: styleMeta.text,
                        },
                      ]}
                      onPress={() => setType(t)}
                    >
                      <Text
                        style={[
                          styles.typeSelectorBtnText,
                          { color: isSelected ? styleMeta.text : COLORS.muted, fontSize: isMobile ? 13 : 15 },
                          isSelected && { fontWeight: "800" },
                        ]}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Informational Message about Engineer for C and D */}
              {(type === "C" || type === "D") ? (
                <View style={styles.infoBanner}>
                  <MaterialCommunityIcons name="information" size={14} color="#7C3AED" style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={[styles.infoBannerText, { fontSize: isMobile ? 11 : 12 }]}>
                    Nota: Los tipos C y D son ejecutados por el ingeniero.
                  </Text>
                </View>
              ) : (
                <View style={[styles.infoBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  <MaterialCommunityIcons name="information" size={14} color="#1D4ED8" style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={[styles.infoBannerText, { color: "#1E40AF", fontSize: isMobile ? 11 : 12 }]}>
                    Nota: Los tipos A y B son ejecutados por nosotros.
                  </Text>
                </View>
              )}
            </View>

            {/* Notes */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Notas u observaciones (Opcional)</Text>
              <TextInput
                style={[styles.modalInputModern, styles.textAreaModern, { height: isMobile ? 70 : 90 }]}
                placeholder="Detalles o repuestos..."
                placeholderTextColor="#94A3B8"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>

            {/* Actions */}
            <View style={styles.modalActionsModern}>
              <TouchableOpacity
                style={[styles.cancelBtnModern, { paddingVertical: isMobile ? 10 : 12 }]}
                onPress={() => setShowForm(false)}
              >
                <Text style={[styles.cancelBtnTextModern, { fontSize: isMobile ? 13 : 14 }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtnModern, { paddingVertical: isMobile ? 10 : 12 }]} onPress={addMantenimiento}>
                <Text style={[styles.saveBtnTextModern, { fontSize: isMobile ? 13 : 14 }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar Mantenimiento</Text>
            <Text style={styles.confirmText}>
              ¿Estás seguro de que querés eliminar este registro? Esto también quitará las etiquetas "Mtm" correspondientes del calendario.
            </Text>
            <View style={styles.modalActionsModern}>
              <TouchableOpacity
                style={styles.cancelBtnModern}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.cancelBtnTextModern}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtnModern}
                onPress={confirmRemoveMtm}
              >
                <Text style={styles.deleteBtnTextModern}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Utility: simple format for Android value display
function formatDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabButton: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    alignItems: "center",
  },
  tabButtonActive: {
    borderBottomColor: COLORS.primary,
  },
  tabButtonText: {
    fontWeight: "600",
    color: COLORS.muted,
  },
  tabButtonTextActive: {
    color: COLORS.text,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statsRowMobile: {
    gap: 6,
    marginBottom: 12,
  },
  statsCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statsCardMobile: {
    borderRadius: 10,
    padding: 6,
  },
  statsVal: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  statsValMobile: {
    fontSize: 13,
  },
  statsLbl: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "600",
  },
  statsLblMobile: {
    fontSize: 9,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 90,
  },
  cardWrapper: {
    width: "100%",
  },
  mtmCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    marginBottom: 12,
  },
  groupedMtmCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    marginBottom: 12,
    overflow: "hidden",
  },
  groupedHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupedTitle: {
    fontWeight: "800",
    color: COLORS.text,
  },
  groupedSubtitle: {
    color: COLORS.muted,
    marginTop: 1,
    fontWeight: "600",
  },
  groupedBody: {
    padding: 4,
  },
  groupedItemRow: {
    padding: 12,
  },
  groupedItemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cardContent: {
    width: "100%",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontWeight: "800",
  },
  performedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  performedText: {
    color: COLORS.muted,
  },
  deleteCardBtn: {
    marginLeft: "auto",
    padding: 4,
  },
  cardBody: {
    marginBottom: 8,
  },
  cardDate: {
    fontWeight: "700",
    color: COLORS.text,
  },
  cardRelativeDate: {
    color: COLORS.muted,
    marginTop: 2,
  },
  notesContainer: {
    marginTop: 8,
    backgroundColor: COLORS.bg,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesText: {
    color: COLORS.text,
    lineHeight: 18,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    marginTop: 4,
  },
  createdByText: {
    color: COLORS.muted,
    fontStyle: "italic",
  },
  gapConnectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  gapLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
    borderStyle: "dashed",
  },
  gapBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginHorizontal: 10,
  },
  gapText: {
    fontWeight: "600",
    color: COLORS.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    marginTop: 20,
  },
  emptyTitle: {
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCardModern: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  modalTitleModern: {
    fontWeight: "800",
    color: COLORS.text,
  },
  modalSubtitleModern: {
    marginTop: 4,
    lineHeight: 18,
    color: COLORS.muted,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalInputModern: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontSize: 15,
  },
  textAreaModern: {
    textAlignVertical: "top",
  },
  typeSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  typeSelectorBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
  },
  typeSelectorBtnText: {
    fontWeight: "600",
  },
  infoBanner: {
    flexDirection: "row",
    backgroundColor: "#F3E8FF", // Light purple
    borderColor: "#E9D5FF",
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: "flex-start",
  },
  infoBannerText: {
    flex: 1,
    color: "#6D28D9",
    lineHeight: 15,
  },
  dropdownTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
  },
  dropdownTriggerText: {
    fontSize: 15,
    color: COLORS.text,
  },
  modalActionsModern: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  cancelBtnModern: {
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnTextModern: {
    color: COLORS.text,
    fontWeight: "700",
  },
  saveBtnModern: {
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 10,
  },
  confirmText: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  deleteBtnModern: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  deleteBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  fabBR: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1000,
  },
});

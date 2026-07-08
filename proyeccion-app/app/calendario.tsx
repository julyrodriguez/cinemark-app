import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "@/lib/dbService";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Calendar, DateData, LocaleConfig } from "react-native-calendars";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import SectionCard from "@/components/SectionCard";
import {
  CINES_COLLECTION,
  db,
} from "../lib/firebaseConfig";
import { COLORS, THEME } from "../lib/theme";
import { useAuthUser } from "../lib/useAuthUser";
import { sanitizeCineId, pad2, toLocalYmd, monthRange } from "@/shared/utils";

LocaleConfig.locales["es"] = {
  monthNames: [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ],
  monthNamesShort: [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ],
  dayNames: [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ],
  dayNamesShort: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  today: "Hoy",
};
LocaleConfig.defaultLocale = "es";

const CALENDAR_TYPE_COLORS = {
  tta: "#3b82f6",
  mtm: "#ef4444",
  evento: "#10b981",
  especial: "#a855f7",
};

type CalendarEvent = {
  id: string;
  date: string;
  type: "TTA" | "MTM" | "EVENTO" | "Especial";
  title: string;
  description?: string;
  createdBy: string;
  createdName: string;
  createdAt: any;
};

export default function CalendarTab({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, displayName, loading: sessionLoading } = useAuthUser();

  const currentCineId = useMemo(() => sanitizeCineId(cineId), [cineId]);

  const today = new Date();
  const [visibleYear, setVisibleYear] = useState(today.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth() + 1);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const handlePrevMonth = () => {
    if (visibleMonth === 1) {
      setVisibleYear((y) => y - 1);
      setVisibleMonth(12);
    } else {
      setVisibleMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (visibleMonth === 12) {
      setVisibleYear((y) => y + 1);
      setVisibleMonth(1);
    } else {
      setVisibleMonth((m) => m + 1);
    }
  };

  const monthDays = useMemo(() => {
    const firstDayOfMonth = new Date(visibleYear, visibleMonth - 1, 1);
    const lastDayOfMonth = new Date(visibleYear, visibleMonth, 0);
    
    const daysInMonth = lastDayOfMonth.getDate();
    const startOfWeekOffset = firstDayOfMonth.getDay(); 
    
    const cells: Array<{ dateString: string; dayNum: number; isCurrentMonth: boolean }> = [];
    
    // Rellenar días del mes anterior
    const prevMonthLastDay = new Date(visibleYear, visibleMonth - 1, 0).getDate();
    for (let i = startOfWeekOffset - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevMonth = visibleMonth === 1 ? 12 : visibleMonth - 1;
      const prevYear = visibleMonth === 1 ? visibleYear - 1 : visibleYear;
      const dateString = `${prevYear}-${pad2(prevMonth)}-${pad2(d)}`;
      cells.push({ dateString, dayNum: d, isCurrentMonth: false });
    }
    
    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const dateString = `${visibleYear}-${pad2(visibleMonth)}-${pad2(d)}`;
      cells.push({ dateString, dayNum: d, isCurrentMonth: true });
    }
    
    // Rellenar días del mes siguiente para completar la última semana
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = visibleMonth === 12 ? 1 : visibleMonth + 1;
      const nextYear = visibleMonth === 12 ? visibleYear + 1 : visibleYear;
      const dateString = `${nextYear}-${pad2(nextMonth)}-${pad2(d)}`;
      cells.push({ dateString, dayNum: d, isCurrentMonth: false });
    }
    
    return cells;
  }, [visibleYear, visibleMonth]);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState<"TTA" | "MTM" | "EVENTO" | "Especial">(
    "TTA"
  );
  const [description, setDescription] = useState("");

  const colCal = useMemo(() => {
    if (!currentCineId) return null;
    return collection(db, CINES_COLLECTION, currentCineId, "calendarEvents");
  }, [currentCineId]);

  const colEvt = useMemo(() => {
    if (!currentCineId) return null;
    return collection(db, CINES_COLLECTION, currentCineId, "eventos");
  }, [currentCineId]);

  const lastCalendarRef = useRef<CalendarEvent[]>([]);
  const lastEventosRef = useRef<CalendarEvent[]>([]);

  useEffect(() => {
    if (sessionLoading) {
      setLoading(true);
      return;
    }

    if (!currentCineId || !colCal || !colEvt) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    lastCalendarRef.current = [];
    lastEventosRef.current = [];

    const { start, next, startStr, nextStr } = monthRange(
      visibleYear,
      visibleMonth
    );

    const qCal = query(
      colCal,
      where("date", ">=", startStr),
      where("date", "<", nextStr),
      orderBy("date", "asc")
    );

    const qEvt = query(
      colEvt,
      where("diaHora", ">=", start),
      where("diaHora", "<", next),
      orderBy("diaHora", "asc")
    );

    function mergeMonthly() {
      const merged = [
        ...lastCalendarRef.current,
        ...lastEventosRef.current,
      ].filter((e) => !!e.date);

      merged.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.title || "").localeCompare(b.title || "");
      });

      setEvents(merged);
      setLoading(false);
    }

    const unsub1 = onSnapshot(
      qCal,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as CalendarEvent[];

        lastCalendarRef.current = rows;
        mergeMonthly();
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    const unsub2 = onSnapshot(
      qEvt,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() as any;
          const fecha: Date | null = data.diaHora?.toDate
            ? data.diaHora.toDate()
            : null;
          const dateStr = fecha ? toLocalYmd(fecha) : data.date || null;

          return {
            id: `EVT-${d.id}`,
            date: dateStr,
            type: "EVENTO",
            title: data.pelicula || "Evento",
            description: `Sala ${data.sala || ""}`,
            createdBy: "system",
            createdName: "Sistema",
            createdAt: data.diaHora || null,
          } as CalendarEvent;
        });

        lastEventosRef.current = rows;
        mergeMonthly();
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [colCal, colEvt, currentCineId, sessionLoading, visibleYear, visibleMonth]);

  const typeColor = (t: string) =>
    t === "TTA"
      ? CALENDAR_TYPE_COLORS.tta
      : t === "MTM"
      ? CALENDAR_TYPE_COLORS.mtm
      : t === "EVENTO"
      ? CALENDAR_TYPE_COLORS.evento
      : CALENDAR_TYPE_COLORS.especial;

  const renderDay = (day: DateData) => {
    const dayEvents = events.filter((e) => e.date === day.dateString);
    const shown = dayEvents.slice(0, 2);
    const current = new Date();
    const todayStr = toLocalYmd(current);
    const isPast = day.dateString < todayStr;
    const isToday = day.dateString === todayStr;
    const textColor = isPast ? COLORS.muted : COLORS.text;
    const opacity = isPast ? 0.5 : 1;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          setSelectedDay(day.dateString);
          setShowModal(true);
        }}
        style={[styles.dayCell, isToday && styles.todayCell]}
      >
        <View style={{ opacity }}>
          <Text style={[styles.dayNumber, { color: textColor }]}>{day.day}</Text>

          <View style={{ marginTop: 2 }}>
            {shown.map((ev, i) => (
              <View
                key={`${ev.id}-${i}`}
                style={[
                  styles.dayBadge,
                  {
                    backgroundColor: typeColor(ev.type),
                  },
                ]}
              >
                <Text style={styles.dayBadgeText}>{ev.type}</Text>
              </View>
            ))}

            {dayEvents.length > 2 && (
              <Text style={styles.moreCount}>+{dayEvents.length - 2}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const formattedDate = selectedDay
    ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const addEvent = async () => {
    if (readOnly) return;
    if (!user || !selectedDay || !colCal || !currentCineId) return;

    if (type === "EVENTO") {
      Alert.alert(
        "No permitido",
        "Los eventos de tipo EVENTO se crean desde la otra sección."
      );
      return;
    }

    if (type === "MTM") {
      Alert.alert(
        "No permitido",
        "Los mantenimientos (MTM) solo pueden registrarse desde la sección de Mantenimientos."
      );
      return;
    }

    try {
      const createdName =
        displayName?.trim() || user.email?.split("@")[0] || "Usuario";

      await addDoc(colCal, {
        date: selectedDay,
        type,
        title: type,
        description: description.trim(),
        createdBy: user.uid,
        createdName,
        createdAt: serverTimestamp(),
        cineId: currentCineId,
      });

      setDescription("");
      setType("TTA");
      setShowModal(false);
      setSelectedDay(null);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo crear el evento.");
    }
  };

  const dayEvents = useMemo(
    () => events.filter((e) => e.date === selectedDay),
    [events, selectedDay]
  );

  const deleteEvent = async (event: CalendarEvent) => {
    if (readOnly) return;
    if (event.type === "EVENTO") {
      Alert.alert(
        "No permitido",
        "Los eventos de tipo EVENTO no pueden eliminarse aquí."
      );
      return;
    }

    setShowModal(false);
    setDeleteTarget(event);
    setDeleteVisible(true);
  };

  const ejecutarBorrado = async () => {
    if (readOnly) return;
    if (!deleteTarget || !currentCineId) return;

    try {
      await deleteDoc(
        doc(db, CINES_COLLECTION, currentCineId, "calendarEvents", deleteTarget.id)
      );

      setDeleteVisible(false);
      setDeleteTarget(null);
      setSelectedDay(null);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo eliminar el evento.");
    }
  };

  const renderDesktopHeader = () => {
    const monthName = LocaleConfig.locales["es"].monthNames[visibleMonth - 1];
    return (
      <View style={styles.desktopHeader}>
        <Text style={styles.desktopHeaderTitle}>
          {monthName} {visibleYear}
        </Text>
        <View style={styles.desktopHeaderActions}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowButton} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              const current = new Date();
              setVisibleYear(current.getFullYear());
              setVisibleMonth(current.getMonth() + 1);
            }} 
            style={styles.todayButton} 
            activeOpacity={0.7}
          >
            <Text style={styles.todayButtonText}>Hoy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNextMonth} style={styles.arrowButton} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDesktopCalendar = () => {
    const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const current = new Date();
    const todayStr = toLocalYmd(current);

    return (
      <View style={styles.desktopCalendarContainer}>
        {renderDesktopHeader()}
        
        {/* Días de la semana encabezado */}
        <View style={styles.desktopWeekHeader}>
          {daysOfWeek.map((dayName) => (
            <View key={dayName} style={styles.desktopWeekHeaderCell}>
              <Text style={styles.desktopWeekHeaderCellText}>{dayName}</Text>
            </View>
          ))}
        </View>

        {/* Celdas de días */}
        <View style={styles.desktopGrid}>
          {monthDays.map((cell, idx) => {
            const isToday = cell.dateString === todayStr;
            const dayEvents = events.filter((e) => e.date === cell.dateString);
            const shownEvents = dayEvents.slice(0, 3);
            const extraCount = dayEvents.length - 3;
            
            const textStyle = [
              styles.desktopDayNumber,
              !cell.isCurrentMonth && styles.desktopDayNumberDisabled,
              isToday && styles.desktopDayNumberToday,
            ];

            return (
              <TouchableOpacity
                key={`${cell.dateString}-${idx}`}
                style={[
                  styles.desktopDayCell,
                  isToday && styles.desktopDayCellToday,
                  !cell.isCurrentMonth && styles.desktopDayCellDisabled,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedDay(cell.dateString);
                  setShowModal(true);
                }}
              >
                <View style={styles.desktopDayCellHeader}>
                  <Text style={textStyle}>{cell.dayNum}</Text>
                  {isToday && <Text style={styles.todayLabelDesktop}>HOY</Text>}
                </View>

                <View style={styles.desktopEventsWrapper}>
                  {shownEvents.map((ev, i) => {
                    const color = typeColor(ev.type);
                    return (
                      <View
                        key={`${ev.id}-${i}`}
                        style={[
                          styles.desktopEventBadge,
                          {
                            backgroundColor: color + "12",
                            borderLeftColor: color,
                          },
                        ]}
                      >
                        <Text style={[styles.desktopEventBadgeText, { color }]} numberOfLines={1}>
                          <Text style={{ fontWeight: "800" }}>{ev.type}</Text>
                          {ev.description ? `: ${ev.description}` : ""}
                        </Text>
                      </View>
                    );
                  })}
                  {extraCount > 0 && (
                    <Text style={styles.desktopMoreCount}>+{extraCount} más</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {isDesktop ? (
        renderDesktopCalendar()
      ) : (
        <>
          <SectionCard>
            <Calendar
              hideExtraDays
              dayComponent={({ date }: { date?: DateData }) =>
                date ? renderDay(date) : null
              }
              onDayPress={(day: DateData) => {
                setSelectedDay(day.dateString);
                setShowModal(true);
              }}
              onMonthChange={(m) => {
                setVisibleYear(m.year);
                setVisibleMonth(m.month);
              }}
              theme={{
                calendarBackground: COLORS.card,
                textSectionTitleColor: COLORS.muted,
                dayTextColor: COLORS.text,
                monthTextColor: COLORS.text,
                todayTextColor: COLORS.primary,
                arrowColor: COLORS.primary,
                textMonthFontWeight: "bold",
                textMonthFontSize: THEME.fontSize.lg,
                textDisabledColor: Platform.OS === "web" ? "rgba(255,255,255,0.15)" : "#ccc",
              }}
            />
          </SectionCard>

          <View style={styles.legend}>
            {[
              { c: CALENDAR_TYPE_COLORS.tta, label: "TTA" },
              { c: CALENDAR_TYPE_COLORS.mtm, label: "MTM" },
              { c: CALENDAR_TYPE_COLORS.evento, label: "EVENTO" },
              { c: CALENDAR_TYPE_COLORS.especial, label: "Especial" },
            ].map((x) => (
              <View key={x.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: x.c }]} />
                <Text style={styles.legendText}>{x.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Modal
        visible={deleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteVisible(false);
          setDeleteTarget(null);
        }}
      >
        <View style={styles.overlayCentered}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar evento</Text>
            <Text style={styles.confirmText}>
              {deleteTarget
                ? `¿Eliminar "${deleteTarget.title}" del ${deleteTarget.date}?`
                : "¿Eliminar este evento?"}
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.saveBtn, styles.cancelBtnInline]}
                onPress={() => {
                  setDeleteVisible(false);
                  setDeleteTarget(null);
                  setSelectedDay(null);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, styles.deleteBtnInline]}
                onPress={ejecutarBorrado}
              >
                <Text style={styles.deleteBtnText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.overlayCentered}>
          <View style={styles.modalCardCentered}>
            <Text style={styles.modalTitle}>
              {formattedDate} {loading ? " (cargando…)" : ""}
            </Text>

            <FlatList
              data={dayEvents}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.eventItem,
                    { borderLeftColor: typeColor(item.type) },
                  ]}
                >
                  <View style={styles.eventItemRow}>
                    <Text
                      style={[
                        styles.eventTitle,
                        { color: typeColor(item.type), flex: 1 },
                      ]}
                    >
                      {item.title}
                    </Text>

                    {item.type !== "EVENTO" && !readOnly && (
                      <TouchableOpacity
                        onPress={() => deleteEvent(item)}
                        style={styles.deleteEventBtn}
                      >
                        <Text style={styles.deleteEventBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {!!item.description && (
                    <Text style={styles.eventDesc}>{item.description}</Text>
                  )}
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyDayText}>
                  {loading ? "Cargando…" : "Sin eventos para este día"}
                </Text>
              }
            />

            {user && !readOnly && (
              <>
                <View style={styles.typeRow}>
                  {["TTA", "Especial"].map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setType(t as "TTA" | "Especial")}
                      style={[
                        styles.typeBtn,
                        {
                          backgroundColor:
                            type === t ? typeColor(t) : COLORS.card,
                          borderColor: typeColor(t),
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: type === t ? "#fff" : typeColor(t),
                          fontWeight: "700",
                        }}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {(type === "TTA" || type === "Especial") && (
                  <TextInput
                    placeholder={
                      type === "TTA"
                        ? "Descripción de TTA (opcional)"
                        : "Descripción del evento especial"
                    }
                    value={description}
                    onChangeText={setDescription}
                    style={styles.input}
                    multiline
                    placeholderTextColor={COLORS.muted}
                  />
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={addEvent}>
                  <Text style={styles.saveBtnText}>Guardar</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, styles.closeBtn]}
              onPress={() => {
                setShowModal(false);
                setSelectedDay(null);
                setDescription("");
                setType("TTA");
              }}
            >
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dayCell: {
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    width: 46,
    borderRadius: THEME.radius.md,
  },
  todayCell: {
    backgroundColor: Platform.OS === "web" ? "var(--primary-soft, #ffe4e6)" : "#ffe4e6",
    borderRadius: 12,
  },
  dayNumber: {
    fontWeight: "700",
    textAlign: "center",
  },
  dayBadge: {
    borderRadius: 3,
    paddingHorizontal: 3,
    marginTop: 1,
    alignSelf: "center",
  },
  dayBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  moreCount: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.xs - 1,
    textAlign: "center",
    marginTop: 1,
  },

  legend: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: THEME.radius.sm - 2,
  },
  legendText: {
    color: COLORS.text,
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
  },

  overlayCentered: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: THEME.spacing.lg,
  },
  modalCardCentered: {
    backgroundColor: COLORS.card,
    width: "90%",
    maxHeight: "85%",
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: THEME.spacing.sm,
  },

  confirmCard: {
    backgroundColor: COLORS.card,
    width: "90%",
    maxWidth: 420,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  confirmText: {
    color: COLORS.text,
    lineHeight: 22,
    textAlign: "center",
  },
  confirmActions: {
    flexDirection: "row",
    gap: THEME.spacing.md,
    marginTop: THEME.spacing.lg,
  },

  typeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: THEME.spacing.sm,
    marginVertical: THEME.spacing.xs,
  },
  typeBtn: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    borderWidth: 1.5,
  },

  input: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    color: COLORS.text,
    marginTop: THEME.spacing.sm,
    textAlignVertical: "top",
  },

  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: THEME.radius.md,
    paddingVertical: THEME.spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: THEME.spacing.md,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
  },

  cancelBtnInline: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 0,
  },
  cancelBtnText: {
    color: COLORS.text,
    fontWeight: "600",
  },
  deleteBtnInline: {
    flex: 1,
    backgroundColor: COLORS.danger,
    marginTop: 0,
  },
  deleteBtnText: {
    color: "#fff",
    fontWeight: "700",
  },

  closeBtn: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: THEME.spacing.sm,
  },
  closeBtnText: {
    color: COLORS.text,
    fontWeight: "600",
  },

  eventItem: {
    borderLeftWidth: 4,
    paddingLeft: THEME.spacing.sm,
    marginVertical: THEME.spacing.xs,
  },
  eventItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  eventDesc: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
  },
  deleteEventBtn: {
    backgroundColor: Platform.OS === "web" ? "var(--danger-soft, #fee2e2)" : "#fee2e2",
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.radius.sm,
    marginLeft: THEME.spacing.sm,
  },
  deleteEventBtnText: {
    color: COLORS.danger,
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
  },
  emptyDayText: {
    color: COLORS.muted,
    textAlign: "center",
    marginVertical: THEME.spacing.md,
  },

  desktopCalendarContainer: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...THEME.shadow.soft,
    marginBottom: THEME.spacing.lg,
  },
  desktopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  desktopHeaderTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  desktopHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  todayButtonText: {
    fontWeight: "600",
    color: COLORS.text,
    fontSize: 14,
  },
  desktopWeekHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginBottom: 4,
  },
  desktopWeekHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  desktopWeekHeaderCellText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.muted,
  },
  desktopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  desktopDayCell: {
    width: "14.285%",
    height: 120,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    padding: 6,
    backgroundColor: COLORS.card,
    justifyContent: "flex-start",
  },
  desktopDayCellToday: {
    backgroundColor: Platform.OS === "web" ? "var(--primary-soft, #fdf2f2)" : "#fdf2f2",
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  desktopDayCellDisabled: {
    backgroundColor: Platform.OS === "web" ? "var(--bg, #F8FAFC)" : "#F8FAFC",
  },
  desktopDayCellHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  desktopDayNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  desktopDayNumberDisabled: {
    color: COLORS.muted,
    opacity: 0.5,
  },
  desktopDayNumberToday: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  todayLabelDesktop: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  desktopEventsWrapper: {
    flex: 1,
    gap: 4,
  },
  desktopEventBadge: {
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: "center",
  },
  desktopEventBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  desktopMoreCount: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "right",
    marginTop: 2,
  },
});
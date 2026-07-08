import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "@/lib/dbService";
import { httpsCallable } from "@/lib/dbService";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";

import PageContainer from "@/components/PageContainer";
import SectionCard from "@/components/SectionCard";
import { CINES_COLLECTION, db, functions } from "@/lib/firebaseConfig";
import { COLORS, THEME } from "@/lib/theme";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  toDate,
  horaCorta,
  DIAS_SEMANA_SHORT,
  MESES_ABBR,
  MESES_FULL,
} from "@/shared/utils";

// Constantes y funciones ahora importadas desde @/shared/utils
const diasSemana = DIAS_SEMANA_SHORT;
const mesesAbbr = MESES_ABBR;
const mesesFull = MESES_FULL;

type Evento = {
  id: string;
  cineId: string;
  cineNombre: string;
  pelicula: string;
  sala: string;
  diaHora: Date;
  kdm?: boolean;
  dcp?: boolean;
  desayuno?: boolean;
  combo?: boolean;
};

type Cine = {
  cineId: string;
  nombre: string;
};

type DiaData = {
  fecha: Date;
  dia: string;
  numero: number;
  mes: string;
  eventos: Evento[];
};

const diaScrollWeb = {
  maxHeight: 320,
  overflowY: "auto",
  overflowX: "hidden",
  paddingBottom: 8,
  WebkitOverflowScrolling: "touch",
} as any;


export default function OficinasCalendarioScreen() {
  const { isOficinas, loading: sessionLoading } = useAuthUser();

  const [cines, setCines] = useState<Cine[]>([]);
  const [semana, setSemana] = useState<DiaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [vistaMode, setVistaMode] = useState<"semanal" | "mensual">("semanal");
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    if (!sessionLoading && isOficinas) {
      loadCines();
    }
  }, [sessionLoading, isOficinas]);

  useEffect(() => {
    setSemana([]);
    if (cines.length > 0) {
      if (vistaMode === "semanal") {
        loadSemana();
      } else {
        loadMes();
      }
    }
  }, [cines, weekOffset, monthOffset, vistaMode]);

  const loadCines = async () => {
    try {
      const cinesSnap = await getDocs(collection(db, CINES_COLLECTION));
      const cinesList: Cine[] = [];

      cinesSnap.forEach((doc) => {
        const data = doc.data();
        if (doc.id !== "oficinas" && doc.id !== "cinemarkproyecto") {
          cinesList.push({
            cineId: doc.id,
            nombre: data.nombre || doc.id,
          });
        }
      });

      cinesList.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setCines(cinesList);
    } catch (e) {
      console.error("Error loading cines:", e);
    }
  };

  const loadSemana = async () => {
    try {
      setLoading(true);

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() + weekOffset * 7);

      const dias: DiaData[] = [];
      for (let i = 0; i < 7; i++) {
        const fecha = new Date(inicioSemana);
        fecha.setDate(inicioSemana.getDate() + i);

        dias.push({
          fecha,
          dia: diasSemana[fecha.getDay()],
          numero: fecha.getDate(),
          mes: mesesAbbr[fecha.getMonth()],
          eventos: [],
        });
      }

      const primerDia = dias[0].fecha;
      const ultimoDia = new Date(dias[6].fecha);
      ultimoDia.setHours(23, 59, 59, 999);

      const startMs = primerDia.getTime();
      const endMs = ultimoDia.getTime();

      console.log("📅 Cargando eventos semana:", { startMs, endMs });

      console.log("🌐 Llamando Cloud Function...");
      const getEventos = httpsCallable(functions, "getOficinasEventos");
      const result = await getEventos({
        startDate: startMs,
        endDate: endMs,
      });
      console.log("📦 Respuesta Cloud Function:", result.data);
      const eventosData = (result.data as any).eventos || [];
      console.log("📊 Total eventos recibidos:", eventosData.length);

      eventosData.forEach((evento: any) => {
        const diaHora = toDate(evento.diaHora);
        const diaHoraNorm = new Date(diaHora);
        diaHoraNorm.setHours(0, 0, 0, 0);

        const diaIndex = dias.findIndex(
          (d) => d.fecha.getTime() === diaHoraNorm.getTime()
        );

        if (diaIndex !== -1) {
          dias[diaIndex].eventos.push({
            id: evento.id,
            cineId: evento.cineId,
            cineNombre: evento.cineNombre,
            pelicula: evento.pelicula || "",
            sala: evento.sala || "",
            diaHora,
            kdm: !!evento.kdm,
            dcp: !!evento.dcp,
            desayuno: !!evento.desayuno,
            combo: !!evento.combo,
          });
        }
      });

      dias.forEach((dia) => {
        dia.eventos.sort((a, b) => a.diaHora.getTime() - b.diaHora.getTime());
      });

      setSemana(dias);
    } catch (e) {
      console.error("Error loading semana:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMes = async () => {
    try {
      setLoading(true);

      const hoy = new Date();
      const mesActual = new Date(
        hoy.getFullYear(),
        hoy.getMonth() + monthOffset,
        1
      );

      const primerDia = new Date(
        mesActual.getFullYear(),
        mesActual.getMonth(),
        1
      );
      primerDia.setHours(0, 0, 0, 0);

      const ultimoDia = new Date(
        mesActual.getFullYear(),
        mesActual.getMonth() + 1,
        0
      );
      ultimoDia.setHours(23, 59, 59, 999);

      const diasDelMes = ultimoDia.getDate();
      const dias: DiaData[] = [];

      for (let i = 1; i <= diasDelMes; i++) {
        const fecha = new Date(
          mesActual.getFullYear(),
          mesActual.getMonth(),
          i
        );
        fecha.setHours(0, 0, 0, 0);

        dias.push({
          fecha,
          dia: diasSemana[fecha.getDay()],
          numero: fecha.getDate(),
          mes: mesesAbbr[fecha.getMonth()],
          eventos: [],
        });
      }

      const startMs = primerDia.getTime();
      const endMs = ultimoDia.getTime();

      console.log("📅 Cargando eventos mes:", { startMs, endMs });

      console.log("🌐 Llamando Cloud Function...");
      const getEventos = httpsCallable(functions, "getOficinasEventos");
      const result = await getEventos({
        startDate: startMs,
        endDate: endMs,
      });
      console.log("📦 Respuesta Cloud Function:", result.data);
      const eventosData = (result.data as any).eventos || [];
      console.log("📊 Total eventos recibidos:", eventosData.length);

      eventosData.forEach((evento: any) => {
        const diaHora = toDate(evento.diaHora);
        const diaHoraNorm = new Date(diaHora);
        diaHoraNorm.setHours(0, 0, 0, 0);

        const diaIndex = dias.findIndex(
          (d) => d.fecha.getTime() === diaHoraNorm.getTime()
        );

        if (diaIndex !== -1) {
          dias[diaIndex].eventos.push({
            id: evento.id,
            cineId: evento.cineId,
            cineNombre: evento.cineNombre,
            pelicula: evento.pelicula || "",
            sala: evento.sala || "",
            diaHora,
            kdm: !!evento.kdm,
            dcp: !!evento.dcp,
            desayuno: !!evento.desayuno,
            combo: !!evento.combo,
          });
        }
      });

      dias.forEach((dia) => {
        dia.eventos.sort((a, b) => a.diaHora.getTime() - b.diaHora.getTime());
      });

      setSemana(dias);
    } catch (e) {
      console.error("Error loading mes:", e);
    } finally {
      setLoading(false);
    }
  };

  const getMesNombre = () => {
    const hoy = new Date();
    const mes = new Date(hoy.getFullYear(), hoy.getMonth() + monthOffset, 1);
    return `${mesesFull[mes.getMonth()]} ${mes.getFullYear()}`;
  };

  const getSemanaRango = () => {
    if (semana.length === 0) return "";
    const primero = semana[0];
    const ultimo = semana[semana.length - 1];
    return `${primero.numero} ${primero.mes} - ${ultimo.numero} ${ultimo.mes}`;
  };

  const renderBadge = (
    label: string,
    tone: "ok" | "danger" | "neutral" | "info"
  ) => {
    return (
      <View
        style={[
          s.badge,
          tone === "ok" && s.badgeOk,
          tone === "danger" && s.badgeDanger,
          tone === "neutral" && s.badgeNeutral,
          tone === "info" && s.badgeInfo,
        ]}
      >
        <Text
          style={[
            s.badgeText,
            tone === "ok" && s.badgeTextOk,
            tone === "danger" && s.badgeTextDanger,
            tone === "neutral" && s.badgeTextNeutral,
            tone === "info" && s.badgeTextInfo,
          ]}
        >
          {label}
        </Text>
      </View>
    );
  };

  const renderEvento = (evento: Evento) => {
    return (
      <View key={evento.id} style={s.eventoCard}>
        <View style={s.eventoTopRow}>
          <View style={s.eventoHoraWrap}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={14}
              color={COLORS.primary}
            />
            <Text style={s.eventoHora}>{horaCorta(evento.diaHora)}</Text>
          </View>

          <View style={s.salaPill}>
            <Text style={s.salaPillText}>Sala {evento.sala}</Text>
          </View>
        </View>

        <Text style={s.eventoPelicula}>{evento.pelicula}</Text>

        <View style={s.cineRow}>
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={14}
            color={COLORS.muted}
          />
          <Text style={s.eventoCine}>{evento.cineNombre}</Text>
        </View>

        <View style={s.eventoBadges}>
          {renderBadge("DCP", evento.dcp ? "ok" : "danger")}
          {renderBadge("KDM", evento.kdm ? "ok" : "danger")}
          {evento.desayuno ? renderBadge("Desayuno", "info") : null}
          {evento.combo ? renderBadge("Combo", "neutral") : null}
        </View>
      </View>
    );
  };

  if (sessionLoading) {
    return (
      <View style={s.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isOficinas) {
    return (
      <View style={s.loadingScreen}>
        <Text style={s.errorText}>Acceso denegado. Requiere rol oficinas.</Text>
      </View>
    );
  }

  return (
  <View style={s.container}>
    <PageContainer >
      <SectionCard style={s.controlsCard}>
        <View style={s.controlsWrap}>
          <View style={s.viewToggle}>
            <TouchableOpacity
              style={[
                s.toggleButton,
                vistaMode === "semanal" && s.toggleButtonActive,
              ]}
              onPress={() => setVistaMode("semanal")}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="view-week-outline"
                size={16}
                color={vistaMode === "semanal" ? "#fff" : COLORS.muted}
              />
              <Text
                style={[
                  s.toggleButtonText,
                  vistaMode === "semanal" && s.toggleButtonTextActive,
                ]}
              >
                Semanal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.toggleButton,
                vistaMode === "mensual" && s.toggleButtonActive,
              ]}
              onPress={() => setVistaMode("mensual")}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="calendar-month-outline"
                size={16}
                color={vistaMode === "mensual" ? "#fff" : COLORS.muted}
              />
              <Text
                style={[
                  s.toggleButtonText,
                  vistaMode === "mensual" && s.toggleButtonTextActive,
                ]}
              >
                Mensual
              </Text>
            </TouchableOpacity>
          </View>

          <View style={s.navigation}>
            <TouchableOpacity
              style={s.navButton}
              onPress={() => {
                if (vistaMode === "semanal") {
                  setWeekOffset(weekOffset - 1);
                } else {
                  setMonthOffset(monthOffset - 1);
                }
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={22}
                color={COLORS.text}
              />
            </TouchableOpacity>

            <View style={s.periodoCenter}>
              <Text style={s.periodoLabel}>
                {vistaMode === "semanal" ? "Semana" : "Mes"}
              </Text>
              <Text style={s.periodoText}>
                {vistaMode === "semanal" ? getSemanaRango() : getMesNombre()}
              </Text>
            </View>

            <TouchableOpacity
              style={s.navButton}
              onPress={() => {
                if (vistaMode === "semanal") {
                  setWeekOffset(weekOffset + 1);
                } else {
                  setMonthOffset(monthOffset + 1);
                }
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={COLORS.text}
              />
            </TouchableOpacity>
          </View>
        </View>
      </SectionCard>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={s.loadingText}>Cargando eventos...</Text>
        </View>
      ) : vistaMode === "semanal" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.weekScrollContent}
        >
          {semana.map((dia, index) => {
            const esHoy =
              new Date().toDateString() === dia.fecha.toDateString();

            return (
              <View key={index} style={s.diaCard}>
                <SectionCard style={s.diaCardInner}>
                  <View style={s.diaCardContent}>
                    <View style={[s.diaHeader, esHoy && s.diaHeaderHoy]}>
                      <View style={s.diaHeaderLeft}>
                        <Text style={[s.diaNombre, esHoy && s.diaTextoHoy]}>
                          {dia.dia}
                        </Text>
                        <Text style={[s.diaFecha, esHoy && s.diaTextoHoy]}>
                          {dia.numero} {dia.mes}
                        </Text>
                      </View>

                      <View
                        style={[
                          s.diaContador,
                          esHoy && s.diaContadorHoy,
                        ]}
                      >
                        <Text
                          style={[
                            s.diaContadorText,
                            esHoy && s.diaContadorTextHoy,
                          ]}
                        >
                          {dia.eventos.length}
                        </Text>
                      </View>
                    </View>

           {Platform.OS === "web" ? (
  <View style={diaScrollWeb}>
    {dia.eventos.length === 0 ? (
      <View style={s.emptyBox}>
        <MaterialCommunityIcons
          name="calendar-blank-outline"
          size={24}
          color={COLORS.muted}
        />
        <Text style={s.emptyText}>Sin eventos</Text>
      </View>
    ) : (
      <View style={s.eventosContainer}>
        {dia.eventos.map((evento) => renderEvento(evento))}
      </View>
    )}
  </View>
) : (
  <ScrollView
    style={s.diaScroll}
    contentContainerStyle={s.diaScrollContent}
    showsVerticalScrollIndicator={false}
    nestedScrollEnabled
  >
    {dia.eventos.length === 0 ? (
      <View style={s.emptyBox}>
        <MaterialCommunityIcons
          name="calendar-blank-outline"
          size={24}
          color={COLORS.muted}
        />
        <Text style={s.emptyText}>Sin eventos</Text>
      </View>
    ) : (
      <View style={s.eventosContainer}>
        {dia.eventos.map((evento) => renderEvento(evento))}
      </View>
    )}
  </ScrollView>
)}
                  </View>
                </SectionCard>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.monthScrollContent}
        >
          {semana.map((dia, index) => {
            const esHoy =
              new Date().toDateString() === dia.fecha.toDateString();

            return (
              <SectionCard key={index} style={s.mesDiaCard}>
                <View style={[s.diaHeaderMensual, esHoy && s.diaHeaderHoy]}>
                  <View>
                    <Text
                      style={[s.diaNombreMensual, esHoy && s.diaTextoHoy]}
                    >
                      {dia.dia} {dia.numero} {dia.mes}
                    </Text>
                  </View>

                  <View
                    style={[
                      s.diaContador,
                      esHoy && s.diaContadorHoy,
                    ]}
                  >
                    <Text
                      style={[
                        s.diaContadorText,
                        esHoy && s.diaContadorTextHoy,
                      ]}
                    >
                      {dia.eventos.length}
                    </Text>
                  </View>
                </View>

                {dia.eventos.length === 0 ? (
                  <View style={s.emptyBoxMonthly}>
                    <Text style={s.emptyText}>Sin eventos</Text>
                  </View>
                ) : (
                  <View style={s.eventosContainerMensual}>
                    {dia.eventos.map((evento) => renderEvento(evento))}
                  </View>
                )}
              </SectionCard>
            );
          })}
        </ScrollView>
      )}
    </PageContainer>
  </View>
);

}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
  },

  pageContent: {
    paddingTop: 8,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.bg,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.xl,
    gap: 10,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: "700",
  },

  controlsCard: {
    marginBottom: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  controlsWrap: {
    gap: 14,
  },

  viewToggle: {
    flexDirection: "row",
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  toggleButtonText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.muted,
  },
  toggleButtonTextActive: {
    color: "#fff",
  },

  navigation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  periodoCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  periodoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  periodoText: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },

  weekScrollContent: {
    paddingBottom: 0,
    paddingRight: 20,
    alignItems: "flex-start",
  },
  diaCard: {
    width: 360,
    marginRight: 14,
  },
  diaCardInner: {
  height: 400,
  overflow: "hidden",
},

diaCardContent: {
  flex: 1,
  height: "100%",
  display: "flex",
  flexDirection: "column",
},

diaScroll: {
  flex: 1,
  flexShrink: 1,
  minHeight: 0,
},

diaScrollContent: {
  paddingBottom: 8,
},


  diaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  diaHeaderHoy: {
    borderBottomColor: COLORS.primary,
  },
  diaHeaderLeft: {
    gap: 2,
  },
  diaNombre: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  diaFecha: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  diaTextoHoy: {
    color: COLORS.primary,
  },

  diaContador: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  diaContadorHoy: {
    backgroundColor: COLORS.primary,
  },
  diaContadorText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.muted,
  },
  diaContadorTextHoy: {
    color: "#fff",
  },

  eventosContainer: {
    gap: 14,
  },
  eventosContainerMensual: {
    gap: 10,
  },

  eventoCard: {
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  eventoTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  eventoHoraWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventoHora: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
  },
  salaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  salaPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },

  eventoPelicula: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  cineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  eventoCine: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.muted,
  },

  eventoBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  badgeDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  badgeNeutral: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  badgeInfo: {
    backgroundColor: "#faf5ff",
    borderColor: "#e9d5ff",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  badgeTextOk: {
    color: "#047857",
  },
  badgeTextDanger: {
    color: "#b91c1c",
  },
  badgeTextNeutral: {
    color: "#1d4ed8",
  },
  badgeTextInfo: {
    color: "#7c3aed",
  },

  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 38,
    gap: 8,
  },
  emptyBoxMonthly: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    fontStyle: "italic",
    fontSize: THEME.fontSize.sm,
  },

  monthScrollContent: {
    paddingBottom: 8,
  },
  mesDiaCard: {
    marginBottom: 12,
  },
  diaHeaderMensual: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  diaNombreMensual: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
  },
});

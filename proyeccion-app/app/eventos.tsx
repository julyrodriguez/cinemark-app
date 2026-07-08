import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { 
  Timestamp, 
  updateDoc, 
  doc, 
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit as qLimit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from "@/lib/dbService";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { crearEvento } from "../lib/eventos";
import { buildSalasFromCount, getCineConfig } from "../lib/cineConfig";
import { CINES_COLLECTION, db } from "../lib/firebaseConfig";
import { COLORS, THEME } from "../lib/theme";
import { useAuthUser } from "../lib/useAuthUser";
import {
  formatDateInput,
  formatTimeInput,
  parseWebDate,
  parseWebTime,
  horaCorta,
  todayAt,
  toDate,
  pad2,
  DIAS_SEMANA_FULL,
  MESES_ABBR,
} from "@/shared/utils";

type Evento = {
  id: string;
  pelicula: string;
  sala: string;
  diaHora: Date;
  kdm?: boolean;
  dcp?: boolean;
  desayuno?: boolean;
  combo?: boolean;
  createdAt?: any;
};

const PAGE = 10;

export default function EventosScreen() {
  const { cineId, loading: sessionLoading } = useAuthUser();

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const [salasCount, setSalasCount] = useState(12);
  const [salasLoading, setSalasLoading] = useState(true);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuItem, setMenuItem] = useState<Evento | null>(null);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Evento | null>(null);

  const [cFechaWeb, setCFechaWeb] = useState(formatDateInput(todayAt(11)));
  const [cHoraWeb, setCHoraWeb] = useState(formatTimeInput(todayAt(11)));

  const [editFechaWeb, setEditFechaWeb] = useState(formatDateInput(todayAt(11)));
  const [editHoraWeb, setEditHoraWeb] = useState(formatTimeInput(todayAt(11)));

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const colRef = useMemo(() => {
    if (!cineId) return null;
    return collection(db, CINES_COLLECTION, cineId, "eventos");
  }, [cineId]);

  const SALAS = useMemo(() => buildSalasFromCount(salasCount), [salasCount]);
  const isSalaValida = (s: string) => SALAS.includes(s);

  const abrirConfirmarBorrado = (item: Evento) => {
    setDeleteItem(item);
    setDeleteVisible(true);
  };

  const cerrarConfirmarBorrado = () => {
    setDeleteVisible(false);
    setDeleteItem(null);
  };

  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });

  const abrirMenuItem = (item: Evento, event?: any) => {
    if (event) {
      setMenuAnchor({ x: event.pageX, y: event.pageY });
    }
    setMenuItem(item);
    setMenuVisible(true);
  };

  const cerrarMenuItem = () => {
    setMenuVisible(false);
    setMenuItem(null);
  };

  const loadCineConfig = async () => {
    if (!cineId) {
      setSalasLoading(false);
      return;
    }

    try {
      setSalasLoading(true);
      const cfg = await getCineConfig(cineId);
      const nextCount =
        cfg?.salasCount && cfg.salasCount > 0 ? cfg.salasCount : 12;
      setSalasCount(nextCount);
    } catch (e) {
      console.error(e);
      setSalasCount(12);
    } finally {
      setSalasLoading(false);
    }
  };

  const loadFirstPage = async () => {
    if (sessionLoading) {
      setLoading(true);
      return;
    }

    if (!cineId || !colRef) {
      setEventos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const threshold = new Date(now.getTime() - 60 * 60 * 1000);

      const qy = query(
        colRef,
        where("diaHora", ">=", threshold),
        orderBy("diaHora", "asc"),
        qLimit(PAGE)
      );

      const snap = await getDocs(qy);

      const rows = snap.docs.map((d) => {
        const data = d.data() as any;
        const diaHora = toDate(data.diaHora);

        return {
          id: d.id,
          pelicula: data.pelicula || "",
          sala: String(data.sala ?? ""),
          kdm: !!data.kdm,
          dcp: !!data.dcp,
          desayuno: !!data.desayuno,
          combo: !!data.combo,
          diaHora,
        } as Evento;
      });

      setEventos(rows);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || !lastDocRef.current || !cineId || !colRef) return;

    try {
      const now = new Date();
      const threshold = new Date(now.getTime() - 60 * 60 * 1000);

      const qy = query(
        colRef,
        where("diaHora", ">=", threshold),
        orderBy("diaHora", "asc"),
        startAfter(lastDocRef.current),
        qLimit(PAGE)
      );

      const snap = await getDocs(qy);

      const extra = snap.docs.map((d) => {
        const data = d.data() as any;
        const diaHora = toDate(data.diaHora);

        return {
          id: d.id,
          pelicula: data.pelicula || "",
          sala: String(data.sala ?? ""),
          kdm: !!data.kdm,
          dcp: !!data.dcp,
          desayuno: !!data.desayuno,
          combo: !!data.combo,
          diaHora,
        } as Evento;
      });

      setEventos((prev) => prev.concat(extra));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE);
    } catch (e) {
      console.error(e);
    }
  };

  const ejecutarBorrado = async () => {
    if (!deleteItem || !cineId) return;

    try {
      await deleteDoc(
        doc(db, CINES_COLLECTION, cineId, "eventos", deleteItem.id)
      );
      cerrarConfirmarBorrado();
      await loadFirstPage();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCineConfig();
  }, [cineId]);

  useEffect(() => {
    loadFirstPage();
  }, [cineId, sessionLoading]);

  const [createVisible, setCreateVisible] = useState(false);
  const [cPelicula, setCPelicula] = useState("");
  const [cSala, setCSala] = useState("");
  const [cFechaHora, setCFechaHora] = useState<Date>(todayAt(11));
  const [cKdm, setCKdm] = useState(false);
  const [cDcp, setCDcp] = useState(false);
  const [cDesayuno, setCDesayuno] = useState(false);
  const [cCombo, setCCombo] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [createError, setCreateError] = useState("");

  const abrirCrear = () => {
    const base = todayAt(11);
    setCPelicula("");
    setCSala("");
    setCFechaHora(base);
    setCFechaWeb(formatDateInput(base));
    setCHoraWeb(formatTimeInput(base));
    setCKdm(false);
    setCDcp(false);
    setCDesayuno(false);
    setCCombo(false);
    setCreateError("");
    setCreateVisible(true);
  };

  const cerrarCrear = () => {
    setCreateVisible(false);
    setCreateError("");
  };

  const onChangeFechaWeb = (text: string) => {
    setCFechaWeb(text);
    const parsedDate = parseWebDate(text);
    if (!parsedDate) return;

    const merged = new Date(cFechaHora);
    merged.setFullYear(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate()
    );
    setCFechaHora(merged);
  };

  const onChangeHoraWeb = (text: string) => {
    setCHoraWeb(text);
    const parsedTime = parseWebTime(text);
    if (!parsedTime) return;

    const merged = new Date(cFechaHora);
    merged.setHours(parsedTime.h, parsedTime.min, 0, 0);
    setCFechaHora(merged);
  };

  const guardarNuevoEvento = async () => {
    setCreateError("");

    if (!cPelicula.trim()) {
      setCreateError("Falta película.");
      return;
    }

    if (!isSalaValida(cSala)) {
      setCreateError(
        `Sala inválida. Elegí una sala entre 1 y ${salasCount} o AC.`
      );
      return;
    }

    if (Platform.OS === "web") {
      if (!parseWebDate(cFechaWeb)) {
        setCreateError("Fecha inválida. Usá formato YYYY-MM-DD.");
        return;
      }
      if (!parseWebTime(cHoraWeb)) {
        setCreateError("Hora inválida. Usá formato HH:mm.");
        return;
      }
    }

    if (!cineId) {
      setCreateError("Sesión no lista. Reintentá en unos segundos.");
      return;
    }

    try {
      await crearEvento(
        {
          diaHora: cFechaHora,
          pelicula: cPelicula.trim(),
          sala: cSala.trim(),
          kdm: cKdm,
          dcp: cDcp,
          desayuno: cDesayuno,
          combo: cCombo,
        },
        cineId
      );

      cerrarCrear();
      await loadFirstPage();
    } catch (e: any) {
      setCreateError(e?.message ?? "No se pudo crear el evento.");
    }
  };

  const onChangeFecha = (_: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      const merged = new Date(cFechaHora);
      merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setCFechaHora(merged);
    }
  };

  const onChangeHora = (_: any, date?: Date) => {
    setShowTimePicker(false);
    if (date) {
      const merged = new Date(cFechaHora);
      merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setCFechaHora(merged);
    }
  };

  const [editVisible, setEditVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editSala, setEditSala] = useState("");
  const [editKdm, setEditKdm] = useState(false);
  const [editDcp, setEditDcp] = useState(false);
  const [editDesayuno, setEditDesayuno] = useState(false);
  const [editCombo, setEditCombo] = useState(false);
  const [editFechaHora, setEditFechaHora] = useState<Date>(todayAt(11));
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showEditTimePicker, setShowEditTimePicker] = useState(false);
  const [editError, setEditError] = useState("");

  const abrirEdicion = (item: Evento) => {
    const fecha =
      item.diaHora instanceof Date ? item.diaHora : toDate(item.diaHora);

    setEditId(item.id);
    setEditSala(String(item.sala ?? ""));
    setEditKdm(!!item.kdm);
    setEditDcp(!!item.dcp);
    setEditDesayuno(!!item.desayuno);
    setEditCombo(!!item.combo);
    setEditFechaHora(fecha);
    setEditFechaWeb(formatDateInput(fecha));
    setEditHoraWeb(formatTimeInput(fecha));
    setEditError("");
    setEditVisible(true);
  };

  const cerrarEdicion = () => {
    setEditVisible(false);
    setEditId(null);
    setEditError("");
  };

  const onChangeEditFechaWeb = (text: string) => {
    setEditFechaWeb(text);
    const parsedDate = parseWebDate(text);
    if (!parsedDate) return;

    const merged = new Date(editFechaHora);
    merged.setFullYear(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate()
    );
    setEditFechaHora(merged);
  };

  const onChangeEditHoraWeb = (text: string) => {
    setEditHoraWeb(text);
    const parsedTime = parseWebTime(text);
    if (!parsedTime) return;

    const merged = new Date(editFechaHora);
    merged.setHours(parsedTime.h, parsedTime.min, 0, 0);
    setEditFechaHora(merged);
  };

  const onChangeEditFecha = (_: any, date?: Date) => {
    setShowEditDatePicker(false);
    if (date) {
      const merged = new Date(editFechaHora);
      merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setEditFechaHora(merged);
    }
  };

  const onChangeEditHora = (_: any, date?: Date) => {
    setShowEditTimePicker(false);
    if (date) {
      const merged = new Date(editFechaHora);
      merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setEditFechaHora(merged);
    }
  };

  const guardarEdicion = async () => {
    if (!editId || !cineId) return;

    setEditError("");

    if (!isSalaValida(editSala)) {
      setEditError(
        `Sala inválida. Elegí una sala entre 1 y ${salasCount} o AC.`
      );
      return;
    }

    if (Platform.OS === "web") {
      if (!parseWebDate(editFechaWeb)) {
        setEditError("Fecha inválida. Usá formato YYYY-MM-DD.");
        return;
      }
      if (!parseWebTime(editHoraWeb)) {
        setEditError("Hora inválida. Usá formato HH:mm.");
        return;
      }
    }

    try {
      await updateDoc(doc(db, CINES_COLLECTION, cineId, "eventos", editId), {
        sala: editSala,
        kdm: editKdm,
        dcp: editDcp,
        desayuno: editDesayuno,
        combo: editCombo,
        diaHora: Timestamp.fromDate(editFechaHora),
        timestamp: editFechaHora.getTime(),
      });

      cerrarEdicion();
      await loadFirstPage();
    } catch (e: any) {
      setEditError(e?.message ?? "No se pudo actualizar.");
    }
  };

  if (loading || salasLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Cargando eventos…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={eventos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const d =
            item.diaHora instanceof Date ? item.diaHora : toDate(item.diaHora);
          const valid = !isNaN(d.getTime());
          const dia = DIAS_SEMANA_FULL[d.getDay()];
          const mes = MESES_ABBR[d.getMonth()];
          const hora = valid ? horaCorta(d) : "--:--";

          return (
            <View>
              <View style={styles.item}>
                <View style={styles.dateCol}>
                  <Text style={styles.dateDay}>{dia}</Text>
                  <Text style={styles.dateNum}>
                    {valid ? pad2(d.getDate()) : "—"}
                  </Text>
                  <Text style={styles.dateMonth}>{mes}</Text>

                  <View style={styles.timePill}>
                    <Text style={styles.timePillText}>{hora}</Text>
                  </View>
                </View>

                <View style={styles.itemLeft}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.pelicula}
                  </Text>

                  <View style={styles.statusWrap}>
                    {item.kdm ? (
                      <Text style={styles.okText}>KDM OK</Text>
                    ) : (
                      <Text style={styles.waitText}>Esperando KDM</Text>
                    )}

                    {item.dcp ? (
                      <Text style={styles.okText}>DCP OK</Text>
                    ) : (
                      <Text style={styles.waitText}>Esperando DCP</Text>
                    )}

                    {item.desayuno ? (
                      <Text style={styles.okText}>Lleva desayuno</Text>
                    ) : (
                      <Text style={styles.waitText}>No lleva desayuno</Text>
                    )}

                    {item.combo ? (
                      <Text style={styles.okText}>Lleva combo</Text>
                    ) : (
                      <Text style={styles.waitText}>No lleva combo</Text>
                    )}
                  </View>
                </View>

                <View style={styles.salaRight}>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      abrirMenuItem(item, e.nativeEvent);
                    }}
                    style={styles.moreBtn}
                  >
                    <Text style={styles.moreBtnText}>⋮</Text>
                  </Pressable>

                  <Text style={styles.salaLabel}>SALA</Text>
                  <Text style={styles.salaNumber}>{item.sala}</Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay eventos esta semana.</Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footerLoadMore}>
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMore}
                activeOpacity={0.9}
              >
                <Text style={styles.loadMoreText}>Cargar más</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        style={styles.fabBR}
        activeOpacity={0.9}
        onPress={abrirCrear}
      >
        <MaterialCommunityIcons name="plus" size={30} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={deleteVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarConfirmarBorrado}
      >
        <View style={styles.modalBackdropCenter}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar evento</Text>

            <Text style={styles.confirmText}>
              {deleteItem
                ? `¿Querés borrar "${deleteItem.pelicula}" (Sala ${deleteItem.sala})?`
                : "¿Querés borrar este evento?"}
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1 }]}
                onPress={cerrarConfirmarBorrado}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnDanger, { flex: 1 }]}
                onPress={ejecutarBorrado}
              >
                <Text style={styles.btnPrimaryText}>Borrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarMenuItem}
      >
        <TouchableWithoutFeedback onPress={cerrarMenuItem}>
          <View style={[styles.menuBackdrop, { justifyContent: 'flex-start', alignItems: 'flex-start' }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuCard, { position: 'absolute', top: menuAnchor.y > 10 ? menuAnchor.y : 100, left: menuAnchor.x - 200 > 10 ? menuAnchor.x - 200 : 20 }]}>
                <Pressable
                  style={styles.menuAction}
                  onPress={() => {
                    const item = menuItem;
                    cerrarMenuItem();
                    if (item) abrirEdicion(item);
                  }}
                >
                  <Text style={styles.menuActionText}>✏️ Editar</Text>
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  style={styles.menuAction}
                  onPress={() => {
                    const item = menuItem;
                    cerrarMenuItem();
                    if (item) abrirConfirmarBorrado(item);
                  }}
                >
                  <Text style={styles.menuDeleteText}>🗑️ Borrar</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarCrear}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuevo evento</Text>

            <Text style={styles.label}>Película</Text>
            <TextInput
              value={cPelicula}
              onChangeText={setCPelicula}
              placeholder="Ej: Batman"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Sala (1–{salasCount} o AC)</Text>
            <View style={styles.salasWrap}>
              {SALAS.map((s) => {
                const selected = s === cSala;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.salaChip, selected && styles.salaChipSelected]}
                    onPress={() => setCSala(s)}
                  >
                    <Text
                      style={[
                        styles.salaChipText,
                        selected && styles.salaChipTextSelected,
                      ]}
                    >
                      Sala {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Fecha y hora</Text>

            {Platform.OS === "web" ? (
              <View style={styles.webDateRow}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={cFechaWeb}
                    onChangeText={onChangeFechaWeb}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={{ width: 120 }}>
                  <TextInput
                    value={cHoraWeb}
                    onChangeText={onChangeHoraWeb}
                    placeholder="HH:mm"
                    placeholderTextColor={COLORS.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.webDateRow}>
                  <TouchableOpacity
                    style={styles.btnGhost}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.btnGhostText}>
                      {cFechaHora.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnGhost}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Text style={styles.btnGhostText}>
                      {horaCorta(cFechaHora)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showDatePicker && (
                  <DateTimePicker
                    value={cFechaHora}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeFecha}
                  />
                )}

                {showTimePicker && (
                  <DateTimePicker
                    value={cFechaHora}
                    mode="time"
                    is24Hour
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeHora}
                  />
                )}
              </>
            )}

            <View style={styles.switchRow}>
              <Switch value={cKdm} onValueChange={setCKdm} />
              <Text style={styles.switchLabel}>Tenemos el KDM</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch value={cDcp} onValueChange={setCDcp} />
              <Text style={styles.switchLabel}>Tenemos el DCP</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch value={cDesayuno} onValueChange={setCDesayuno} />
              <Text style={styles.switchLabel}>Lleva desayuno</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch value={cCombo} onValueChange={setCCombo} />
              <Text style={styles.switchLabel}>Lleva combo</Text>
            </View>

            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1 }]}
                onPress={cerrarCrear}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={guardarNuevoEvento}
              >
                <Text style={styles.btnPrimaryText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarEdicion}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar evento</Text>

            <Text style={styles.label}>Sala (1–{salasCount} o AC)</Text>
            <View style={styles.salasWrap}>
              {SALAS.map((s) => {
                const selected = s === editSala;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.salaChip, selected && styles.salaChipSelected]}
                    onPress={() => setEditSala(s)}
                  >
                    <Text
                      style={[
                        styles.salaChipText,
                        selected && styles.salaChipTextSelected,
                      ]}
                    >
                      Sala {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Fecha y hora</Text>

            {Platform.OS === "web" ? (
              <View style={styles.webDateRow}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={editFechaWeb}
                    onChangeText={onChangeEditFechaWeb}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={{ width: 120 }}>
                  <TextInput
                    value={editHoraWeb}
                    onChangeText={onChangeEditHoraWeb}
                    placeholder="HH:mm"
                    placeholderTextColor={COLORS.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.webDateRow}>
                  <TouchableOpacity
                    style={styles.btnGhost}
                    onPress={() => setShowEditDatePicker(true)}
                  >
                    <Text style={styles.btnGhostText}>
                      {editFechaHora.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnGhost}
                    onPress={() => setShowEditTimePicker(true)}
                  >
                    <Text style={styles.btnGhostText}>
                      {horaCorta(editFechaHora)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showEditDatePicker && (
                  <DateTimePicker
                    value={editFechaHora}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeEditFecha}
                  />
                )}

                {showEditTimePicker && (
                  <DateTimePicker
                    value={editFechaHora}
                    mode="time"
                    is24Hour
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeEditHora}
                  />
                )}
              </>
            )}

            <View style={styles.switchRow}>
              <Switch value={editKdm} onValueChange={setEditKdm} />
              <Text style={styles.switchLabel}>Tiene KDM</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch value={editDcp} onValueChange={setEditDcp} />
              <Text style={styles.switchLabel}>Tiene DCP</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch value={editDesayuno} onValueChange={setEditDesayuno} />
              <Text style={styles.switchLabel}>Lleva desayuno</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch value={editCombo} onValueChange={setEditCombo} />
              <Text style={styles.switchLabel}>Lleva combo</Text>
            </View>

            {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1 }]}
                onPress={cerrarEdicion}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={guardarEdicion}
              >
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  loadingText: {
    color: COLORS.muted,
    marginTop: 8,
  },

  listContent: {
    gap: 8,
    padding: 14,
    paddingBottom: 120,
  },

  item: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "stretch",
    gap: THEME.spacing.md,
    minHeight: 96,
  },

  dateCol: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.xs,
    paddingHorizontal: THEME.spacing.sm,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },

  dateDay: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.xs,
    fontWeight: "800",
    letterSpacing: 1,
  },

  dateNum: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 2,
  },

  dateMonth: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
    marginTop: -2,
  },

  timePill: {
    marginTop: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    paddingHorizontal: THEME.spacing.md,
    borderRadius: THEME.radius.full,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  timePillText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: THEME.fontSize.sm,
    textAlign: "center",
  },

  itemLeft: {
    flex: 1,
    justifyContent: "center",
    paddingRight: THEME.spacing.sm,
    minWidth: 0,
  },

  itemTitle: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: THEME.fontSize.md,
    lineHeight: 22,
    flexShrink: 1,
    textAlign: "left",
  },

  statusWrap: {
    marginTop: THEME.spacing.sm,
    gap: 2,
    alignItems: "flex-start",
  },

  waitText: {
    color: "#b91c1c",
    fontWeight: "800",
    fontSize: THEME.fontSize.xs,
  },

  okText: {
    color: "#15803d",
    fontWeight: "800",
    fontSize: THEME.fontSize.xs,
  },

  salaRight: {
    width: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: THEME.spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },

  salaLabel: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
    letterSpacing: 1,
  },

  salaNumber: {
    marginTop: 2,
    fontSize: 32,
    fontWeight: "900",
    color: COLORS.primary,
    lineHeight: 34,
  },

  footerLoadMore: {
    paddingVertical: 14,
    alignItems: "center",
    gap: 8,
  },

  loadMoreBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: THEME.radius.full,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    ...THEME.shadow.soft,
  },

  loadMoreText: {
    color: "#fff",
    fontWeight: "800",
  },

  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },

  emptyText: {
    color: COLORS.muted,
    fontSize: THEME.fontSize.md,
    textAlign: "center",
  },

  fabBR: {
    position: "absolute",
    right: THEME.spacing.lg,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...THEME.shadow.web,
  },

  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },

  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.lg,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },

  modalCard: {
    backgroundColor: COLORS.card,
    padding: 24,
    borderRadius: 24,
    width: "100%",
    maxWidth: 500,
    borderColor: COLORS.border,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },

  confirmText: {
    color: COLORS.text,
    marginTop: 4,
    lineHeight: 20,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 18,
    marginBottom: 6,
  },

  input: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.md,
    marginTop: THEME.spacing.md,
  },

  switchLabel: {
    color: COLORS.text,
    fontSize: THEME.fontSize.sm,
    fontWeight: "500",
  },

  btnGhost: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },

  btnGhostText: {
    color: COLORS.text,
    fontWeight: "700",
  },

  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
  },

  btnDanger: {
    backgroundColor: COLORS.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  salasWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },

  salaChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },

  salaChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  salaChipText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "600",
  },

  salaChipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: THEME.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.bgMobile,
    marginBottom: THEME.spacing.xs,
  },

  moreBtnText: {
    fontSize: THEME.fontSize.md,
    fontWeight: "900",
    color: COLORS.text,
    lineHeight: 18,
  },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: THEME.spacing.lg,
  },

  menuCard: {
    width: 200,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.web,
  },

  menuAction: {
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
  },

  menuActionText: {
    color: COLORS.text,
    fontWeight: "600",
  },

  menuDeleteText: {
    color: "#b91c1c",
    fontWeight: "700",
  },

  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  errorText: {
    color: "#b91c1c",
    fontWeight: "700",
    marginTop: THEME.spacing.md,
    fontSize: THEME.fontSize.sm,
  },

  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  webDateRow: {
    flexDirection: "row",
    gap: 12,
  },
});
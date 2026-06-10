import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  endAt,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  startAfter,
  startAt,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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

import { auth, db, CINES_COLLECTION } from "../lib/firebaseConfig";
import { COLORS, THEME } from "../lib/theme";
import { useAuthUser } from "../lib/useAuthUser";

const EXTRA = { success: "#16A34A", danger: "#DC2626" };

interface Credito {
  id: string;
  pelicula: string;
  peliculaLower?: string;
  horaCredito: string;
  horaApaga1?: string | null;
  horaPrende1?: string | null;
  horaApaga2?: string | null;
  horaPrende2?: string | null;
  createdAt?: any;
  createdBy?: string | null;
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function normalizeHHMMSS(input: string): string | null {
  const parts = input.trim().split(":");
  if (parts.length !== 3) return null;
  const [hStr, mStr, sStr] = parts;
  const h = Number(hStr),
    m = Number(mStr),
    s = Number(sStr);

  if (
    [h, m, s].some(Number.isNaN) ||
    m < 0 ||
    m > 59 ||
    s < 0 ||
    s > 59 ||
    h < 0
  ) {
    return null;
  }

  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export default function CreditosScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, loading: sessionLoading } = useAuthUser();
  const [items, setItems] = useState<Credito[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Credito[]>([]);
  const searchTimer = useRef<any>(null);

  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPelicula, setFormPelicula] = useState("");

  const [formHoraFin, setFormHoraFin] = useState("");
  const [enablePC1, setEnablePC1] = useState(false);
  const [formApaga1, setFormApaga1] = useState("");
  const [formPrende1, setFormPrende1] = useState("");
  const [enablePC2, setEnablePC2] = useState(false);
  const [formApaga2, setFormApaga2] = useState("");
  const [formPrende2, setFormPrende2] = useState("");

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuItem, setMenuItem] = useState<Credito | null>(null);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Credito | null>(null);

  const colRef = useMemo(() => {
    if (!cineId) return null;
    return collection(db, CINES_COLLECTION, cineId, "creditos");
  }, [cineId]);
  const PAGE = 10;

  const mapDoc = (d: QueryDocumentSnapshot<DocumentData>): Credito => ({
    id: d.id,
    pelicula: d.get("pelicula") ?? "",
    peliculaLower: d.get("peliculaLower") ?? undefined,
    horaCredito: d.get("horaCredito") ?? "00:00:00",
    horaApaga1: d.get("horaApaga1") ?? null,
    horaPrende1: d.get("horaPrende1") ?? null,
    horaApaga2: d.get("horaApaga2") ?? null,
    horaPrende2: d.get("horaPrende2") ?? null,
    createdAt: d.get("createdAt") ?? null,
    createdBy: d.get("createdBy") ?? null,
  });

  const loadFirstPage = async () => {
    if (sessionLoading) {
      setLoading(true);
      return;
    }
    if (!cineId || !colRef) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qy = query(colRef, orderBy("createdAt", "desc"), qLimit(PAGE));
      const snap = await getDocs(qy);
      const data = snap.docs.map(mapDoc);
      setItems(data);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE);
    } catch (e) {
      console.error(e);
      Alert.alert("Créditos", "No se pudo cargar la lista.");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || !lastDocRef.current || !cineId || !colRef) return;
    try {
      const qy = query(
        colRef,
        orderBy("createdAt", "desc"),
        startAfter(lastDocRef.current),
        qLimit(PAGE)
      );
      const snap = await getDocs(qy);
      const extra = snap.docs.map(mapDoc);
      setItems((prev) => prev.concat(extra));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE);
    } catch (e) {
      console.error(e);
      Alert.alert("Créditos", "No se pudo cargar más.");
    }
  };

  useEffect(() => {
    loadFirstPage();
  }, [cineId, sessionLoading, colRef]);

  const runSearch = async (term: string) => {
    if (!cineId || !colRef) {
      setSearching(false);
      setSearchResults([]);
      return;
    }
    const key = term.trim().toLowerCase();
    if (key.length < 2) {
      setSearching(false);
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const qy = query(
        colRef,
        orderBy("peliculaLower"),
        startAt(key),
        endAt(key + "\uf8ff"),
        qLimit(20)
      );
      const snap = await getDocs(qy);
      setSearchResults(snap.docs.map(mapDoc));
    } catch (e) {
      console.error(e);
      Alert.alert("Créditos", "No se pudo buscar.");
    } finally {
      setSearching(false);
    }
  };

  const onChangeSearch = (t: string) => {
    setSearch(t);
    setSearching(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(t), 300);
  };

  const resetForm = () => {
    setFormPelicula("");
    setFormHoraFin("");
    setEnablePC1(false);
    setFormApaga1("");
    setFormPrende1("");
    setEnablePC2(false);
    setFormApaga2("");
    setFormPrende2("");
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setOpenModal(true);
  };

  const openEdit = (it: Credito) => {
    setEditingId(it.id);
    setFormPelicula(it.pelicula);
    setFormHoraFin(it.horaCredito || "");

    const hasPC1 = Boolean(it.horaApaga1 || it.horaPrende1);
    const hasPC2 = Boolean(it.horaApaga2 || it.horaPrende2);

    setEnablePC1(hasPC1);
    setFormApaga1(it.horaApaga1 || "");
    setFormPrende1(it.horaPrende1 || "");
    setEnablePC2(hasPC2);
    setFormApaga2(it.horaApaga2 || "");
    setFormPrende2(it.horaPrende2 || "");
    setOpenModal(true);
  };

  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });

  const abrirMenuItem = (item: Credito, event?: any) => {
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

  const abrirConfirmarBorrado = (item: Credito) => {
    setDeleteItem(item);
    setDeleteVisible(true);
  };

  const cerrarConfirmarBorrado = () => {
    setDeleteVisible(false);
    setDeleteItem(null);
  };

  function validateIfPresent(label: string, value: string): string | null {
    if (!value.trim()) return null;
    const norm = normalizeHHMMSS(value);
    if (!norm) {
      Alert.alert("Hora inválida", `${label}: usá HH:mm:ss (ej: 01:54:50)`);
      return null;
    }
    return norm;
  }

  const saveItem = async () => {
    if (!formPelicula.trim()) {
      Alert.alert("Falta info", "Ingresá el nombre de la película");
      return;
    }

    const pelicula = formPelicula.trim();
    const peliculaLower = pelicula.toLowerCase();

    const horaFinNorm = normalizeHHMMSS(formHoraFin);
    if (!horaFinNorm) {
      Alert.alert("Hora inválida", "Hora final: usá HH:mm:ss (ej: 01:54:50)");
      return;
    }

    let apaga1: string | null = null;
    let prende1: string | null = null;

    if (enablePC1) {
      const a1 = validateIfPresent("Postcrédito 1 (apagan)", formApaga1);
      const p1 = validateIfPresent("Postcrédito 1 (prenden)", formPrende1);
      if (!a1 || !p1) return;
      apaga1 = a1;
      prende1 = p1;
    }

    let apaga2: string | null = null;
    let prende2: string | null = null;

    if (enablePC2) {
      const a2 = validateIfPresent("Postcrédito 2 (apagan)", formApaga2);
      const p2 = validateIfPresent("Postcrédito 2 (prenden)", formPrende2);
      if (!a2 || !p2) return;
      apaga2 = a2;
      prende2 = p2;
    }

    const payload: any = {
      pelicula,
      peliculaLower,
      horaCredito: horaFinNorm,
      horaApaga1: apaga1 ?? null,
      horaPrende1: prende1 ?? null,
      horaApaga2: apaga2 ?? null,
      horaPrende2: prende2 ?? null,
      horas: [
        horaFinNorm,
        ...(apaga1 ? [apaga1] : []),
        ...(prende1 ? [prende1] : []),
        ...(apaga2 ? [apaga2] : []),
        ...(prende2 ? [prende2] : []),
      ],
    };

    try {
      if (editingId) {
        if (!cineId) return;
        await updateDoc(
          doc(db, CINES_COLLECTION, cineId, "creditos", editingId),
          payload
        );
        if (search.trim().length >= 2) runSearch(search);
        else loadFirstPage();
      } else {
        if (!cineId) return;
        await addDoc(collection(db, CINES_COLLECTION, cineId, "creditos"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid ?? null,
        });
        if (search.trim().length >= 2) runSearch(search);
        else loadFirstPage();
      }

      setOpenModal(false);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message ?? "No se pudo guardar");
    }
  };

  const confirmDelete = (item: Credito) => {
    abrirConfirmarBorrado(item);
  };

  const ejecutarBorrado = async () => {
    if (!deleteItem || !cineId) return;
    const id = deleteItem.id;

    try {
      await deleteDoc(doc(db, CINES_COLLECTION, cineId, "creditos", id));

      if (search.trim().length >= 2) {
        setSearchResults((prev) => prev.filter((x) => x.id !== id));
      } else {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }

      cerrarConfirmarBorrado();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message ?? "No se pudo eliminar");
    }
  };

  const renderItem = ({ item }: { item: Credito }) => {
    const line1 = item.horaCredito
      ? [{ kind: "on" as const, label: "Prenden", time: item.horaCredito }]
      : [];

    const line2: Array<{ kind: "on" | "off"; label: string; time: string }> = [];
    if (item.horaApaga1)
      line2.push({ kind: "off", label: "Apagan", time: item.horaApaga1 });
    if (item.horaPrende1)
      line2.push({ kind: "on", label: "Prenden", time: item.horaPrende1 });

    const line3: Array<{ kind: "on" | "off"; label: string; time: string }> = [];
    if (item.horaApaga2)
      line3.push({ kind: "off", label: "Apagan", time: item.horaApaga2 });
    if (item.horaPrende2)
      line3.push({ kind: "on", label: "Prenden", time: item.horaPrende2 });

    const Chip = ({
      kind,
      label,
      time,
    }: {
      kind: "on" | "off";
      label: string;
      time: string;
    }) => (
      <View
        style={[
          styles.credChip,
          kind === "on" ? styles.credChipOn : styles.credChipOff,
        ]}
      >
        <MaterialCommunityIcons
          name={kind === "on" ? "lightbulb-on-outline" : "lightbulb-off-outline"}
          size={14}
          color={
            kind === "on"
              ? styles.credChipTextOn.color
              : styles.credChipTextOff.color
          }
          style={{ marginRight: 6 }}
        />

        <Text
          style={[
            styles.credChipText,
            kind === "on" ? styles.credChipTextOn : styles.credChipTextOff,
          ]}
        >
          {label} <Text style={styles.credTime}>{time}</Text>
        </Text>
      </View>
    );

    const Row = ({
      title,
      items,
    }: {
      title: string;
      items: Array<{ kind: "on" | "off"; label: string; time: string }>;
    }) => {
      if (!items.length) return null;
      return (
        <View style={styles.credRow}>
          <Text style={styles.credRowLabel} numberOfLines={1}>
            {title}
          </Text>

          <View style={styles.credRowChips}>
            {items.map((it, i) => (
              <Chip key={`${title}-${it.label}-${it.time}-${i}`} {...it} />
            ))}
          </View>
        </View>
      );
    };

    return (
      <View style={styles.creditCard}>
        <View style={styles.creditCardAccent} />

        <View style={styles.creditCardBody}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.title} numberOfLines={2}>
              {item.pelicula}
            </Text>

            {!readOnly && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  abrirMenuItem(item, e.nativeEvent);
                }}
                style={styles.moreBtn}
              >
                <MaterialCommunityIcons
                  name="dots-vertical"
                  size={18}
                  color={COLORS.text}
                />
              </Pressable>
            )}
          </View>

          <Row title="Final" items={line1} />
          <Row title="Postcrédito 1" items={line2} />
          <Row title="Postcrédito 2" items={line3} />
        </View>
      </View>
    );
  };

  const showingSearch = search.trim().length >= 2;
  const data = showingSearch ? searchResults : items;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Cargando créditos…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topArea}>
        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={onChangeSearch}
            placeholder="Buscar por película…"
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            autoCapitalize="none"
          />

          {search ? (
            <TouchableOpacity
              onPress={() => {
                setSearch("");
                setSearchResults([]);
                setSearching(false);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>×</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.countText}>
          {showingSearch
            ? searching
              ? "Buscando…"
              : `${data.length} resultado${data.length === 1 ? "" : "s"}`
            : `Mostrando los ${data.length} más recientes`}
        </Text>
      </View>

      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        ListFooterComponent={
          !showingSearch && hasMore ? (
            <View style={styles.footerLoadMore}>
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMore}
                activeOpacity={0.9}
              >
                <Text style={styles.loadMoreText}>Cargar más</Text>
              </TouchableOpacity>

              <Text style={styles.footerHint}>Ver créditos más antiguos</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {showingSearch
                ? searching
                  ? "Buscando…"
                  : "Sin resultados"
                : "No hay créditos cargados"}
            </Text>
          </View>
        )}
      />

      {!readOnly && (
        <TouchableOpacity
          style={styles.fabBR}
          onPress={openCreate}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="plus" size={30} color="#fff" />
        </TouchableOpacity>
      )}

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
                    const it = menuItem;
                    cerrarMenuItem();
                    if (it) openEdit(it);
                  }}
                >
                  <Text style={styles.menuActionText}>✏️ Editar</Text>
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  style={styles.menuAction}
                  onPress={() => {
                    const it = menuItem;
                    cerrarMenuItem();
                    if (it) confirmDelete(it);
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
        visible={deleteVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarConfirmarBorrado}
      >
        <View style={styles.modalWrap}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar crédito</Text>

            <Text style={styles.confirmText}>
              {deleteItem
                ? `¿Querés borrar "${deleteItem.pelicula}"?`
                : "¿Querés borrar este crédito?"}
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={cerrarConfirmarBorrado}
              >
                <Text style={[styles.btnText, { color: COLORS.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnDanger]}
                onPress={ejecutarBorrado}
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>Borrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={openModal}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingId ? "Editar crédito" : "Nuevo crédito"}
            </Text>

            <Text style={styles.inputLabel}>Película</Text>
            <TextInput
              value={formPelicula}
              onChangeText={setFormPelicula}
              placeholder="Nombre de la película"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
            />

            <Text style={styles.inputLabel}>
              Luces se prenden al final (HH:mm:ss)
            </Text>
            <TextInput
              value={formHoraFin}
              onChangeText={setFormHoraFin}
              placeholder="01:54:50"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.switchRow}>
              <Switch value={enablePC1} onValueChange={setEnablePC1} />
              <Text style={styles.switchLabel}>Agregar Postcrédito 1</Text>
            </View>

            {enablePC1 && (
              <>
                <Text style={styles.inputLabel}>Se apagan (HH:mm:ss)</Text>
                <TextInput
                  value={formApaga1}
                  onChangeText={setFormApaga1}
                  placeholder="02:01:00"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.inputLabel}>Se prenden (HH:mm:ss)</Text>
                <TextInput
                  value={formPrende1}
                  onChangeText={setFormPrende1}
                  placeholder="02:05:40"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            <View style={styles.switchRow}>
              <Switch value={enablePC2} onValueChange={setEnablePC2} />
              <Text style={styles.switchLabel}>Agregar Postcrédito 2</Text>
            </View>

            {enablePC2 && (
              <>
                <Text style={styles.inputLabel}>Se apagan (HH:mm:ss)</Text>
                <TextInput
                  value={formApaga2}
                  onChangeText={setFormApaga2}
                  placeholder="02:10:00"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.inputLabel}>Se prenden (HH:mm:ss)</Text>
                <TextInput
                  value={formPrende2}
                  onChangeText={setFormPrende2}
                  placeholder="02:14:30"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            <View style={{ height: 10 }} />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => setOpenModal(false)}
              >
                <Text style={[styles.btnText, { color: COLORS.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={saveItem}
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>
                  {editingId ? "Guardar" : "Crear"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    position: "relative",
    minHeight:0,
  },

  topArea: {
    paddingBottom: THEME.spacing.sm,
  },

  list: {
    flex: 1,
    minHeight:0,
  },

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
    paddingBottom: 120,
  },

  creditCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.lg,
    overflow: "hidden",
    flexDirection: "row",
    ...THEME.shadow.soft,
  },
  creditCardAccent: {
    width: 5,
    backgroundColor: COLORS.primary,
  },
  creditCardBody: {
    flex: 1,
    padding: THEME.spacing.md,
    justifyContent: "center",
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },

  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    marginBottom: THEME.spacing.sm,
    textAlign: "center",
  },

  moreBtn: {
    position: "absolute",
    right: 0,
    width: 32,
    height: 32,
    borderRadius: THEME.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  credRow: {
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  credRowLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
    textAlign: "center",
  },
  credRowChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },

  credChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  credChipOn: {
    backgroundColor: EXTRA.success + "22",
    borderColor: EXTRA.success + "55",
  },
  credChipOff: {
    backgroundColor: EXTRA.danger + "22",
    borderColor: EXTRA.danger + "55",
  },
  credChipText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "800",
  },
  credChipTextOn: { color: EXTRA.success },
  credChipTextOff: { color: EXTRA.danger },
  credTime: { fontVariant: ["tabular-nums"] },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: THEME.spacing.md,
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
  },
  clearBtn: {
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.sm,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  clearBtnText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  countText: {
    marginBottom: THEME.spacing.md,
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
  },

  footerLoadMore: {
    paddingVertical: 14,
    alignItems: "center",
    gap: 8,
  },
  footerHint: {
    color: COLORS.muted,
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
  zIndex: 50,
  elevation: 10,
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

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: THEME.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: THEME.spacing.sm,
  },
  confirmText: {
    color: COLORS.text,
    lineHeight: 20,
  },

  inputLabel: {
    color: COLORS.muted,
    marginTop: THEME.spacing.sm,
    marginBottom: THEME.spacing.xs,
    fontSize: THEME.fontSize.sm,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
  },

  btn: {
    flex: 1,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  btnSecondary: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  btnDanger: {
    backgroundColor: "#b91c1c",
    borderColor: "#b91c1c",
  },
  btnText: {
    fontWeight: "700",
  },

  switchRow: {
    marginTop: THEME.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.md,
  },
  switchLabel: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: THEME.fontSize.sm,
  },

  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  emptyWrap: {
    alignItems: "center",
    marginTop: 40,
  },
  emptyText: {
    color: COLORS.muted,
  },
});
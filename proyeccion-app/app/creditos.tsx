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
} from "@/lib/dbService";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  Animated,
  ScrollView,
  useWindowDimensions,
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

function removeAccents(str: string): string {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

const CreditoCard = ({
  item,
  readOnly,
  abrirMenuItem,
  COLORS,
  THEME,
  EXTRA,
}: {
  item: Credito;
  readOnly: boolean;
  abrirMenuItem: (item: Credito, event?: any) => void;
  COLORS: any;
  THEME: any;
  EXTRA: any;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, []);

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
        color={kind === "on" ? EXTRA.success : EXTRA.danger}
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
    <Animated.View style={{ opacity: fadeAnim }}>
      <View
        {...({
          onMouseEnter: Platform.OS === "web" ? () => setIsHovered(true) : undefined,
          onMouseLeave: Platform.OS === "web" ? () => setIsHovered(false) : undefined,
        } as any)}
        style={[
          styles.creditCard,
          isHovered && styles.creditCardHovered,
          { borderColor: isHovered ? COLORS.primary : COLORS.border }
        ]}
      >
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
                style={[
                  styles.moreBtn,
                  isHovered && { borderColor: COLORS.primary }
                ]}
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
    </Animated.View>
  );
};

export default function CreditosScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, loading: sessionLoading } = useAuthUser();
  const { width: screenWidth } = useWindowDimensions();
  const columns = screenWidth >= 1100 ? 3 : screenWidth >= 768 ? 2 : 1;
  const itemWidth: any = `${100 / columns}%`;
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

  const mapDoc = (d: QueryDocumentSnapshot<DocumentData>): Credito => {
    const data = d.data();
    return {
      id: d.id,
      pelicula: data.pelicula ?? "",
      peliculaLower: data.peliculaLower ?? undefined,
      horaCredito: data.horaCredito ?? "00:00:00",
      horaApaga1: data.horaApaga1 ?? null,
      horaPrende1: data.horaPrende1 ?? null,
      horaApaga2: data.horaApaga2 ?? null,
      horaPrende2: data.horaPrende2 ?? null,
      createdAt: data.createdAt ?? null,
      createdBy: data.createdBy ?? null,
    };
  };

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
    const key = removeAccents(term).trim().toLowerCase();
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

    const pelicula = removeAccents(formPelicula).trim();
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

  const renderItem = ({ item }: { item: Credito }) => (
    <CreditoCard
      item={item}
      readOnly={readOnly}
      abrirMenuItem={abrirMenuItem}
      COLORS={COLORS}
      THEME={THEME}
      EXTRA={EXTRA}
    />
  );

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
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.muted} style={{ marginRight: 8 }} />
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
              <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.muted} />
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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {data.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {showingSearch
                ? searching
                  ? "Buscando…"
                  : "Sin resultados"
                : "No hay créditos cargados"}
            </Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {data.map((item) => (
              <View key={item.id} style={{ width: itemWidth, padding: 8 }}>
                {renderItem({ item })}
              </View>
            ))}
          </View>
        )}

        {!showingSearch && hasMore ? (
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
        ) : null}
      </ScrollView>

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
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar crédito</Text>

            <Text style={styles.confirmText}>
              {deleteItem
                ? `¿Querés borrar "${deleteItem.pelicula}"?`
                : "¿Querés borrar este crédito?"}
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.cancelBtnModern}
                onPress={cerrarConfirmarBorrado}
              >
                <Text style={styles.cancelBtnTextModern}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtnModern}
                onPress={ejecutarBorrado}
              >
                <Text style={styles.deleteBtnTextModern}>Borrar</Text>
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
          style={styles.modalOverlay}
        >
          <View style={styles.modalCardModern}>
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
                style={styles.cancelBtnModern}
                onPress={() => setOpenModal(false)}
              >
                <Text style={styles.cancelBtnTextModern}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtnModern}
                onPress={saveItem}
              >
                <Text style={styles.saveBtnTextModern}>
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
    minHeight: 0,
  },

  topArea: {
    paddingBottom: THEME.spacing.sm,
  },

  list: {
    flex: 1,
    minHeight: 0,
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

  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    alignItems: "flex-start",
  },

  creditCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.lg,
    overflow: "hidden",
    flexDirection: "row",
    ...Platform.select({
      web: {
        ...THEME.shadow.web,
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      } as any,
      default: THEME.shadow.soft,
    }),
  },
  creditCardHovered: {
    ...Platform.select({
      web: {
        transform: [{ translateY: -2 }],
        boxShadow: "0 12px 20px -8px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.05)",
      } as any,
    }),
  },
  creditCardAccent: {
    width: 4,
    backgroundColor: COLORS.primary,
  },
  creditCardBody: {
    flex: 1,
    padding: THEME.spacing.lg,
    justifyContent: "center",
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: THEME.spacing.md,
  },

  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    textAlign: "left",
  },

  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "all 0.2s ease",
      },
    }),
  },

  credRow: {
    marginTop: 10,
    alignItems: "flex-start",
  },
  credRowLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  credRowChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },

  credChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  credChipOn: {
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    borderColor: "rgba(22, 163, 74, 0.15)",
  },
  credChipOff: {
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderColor: "rgba(220, 38, 38, 0.15)",
  },
  credChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  credChipTextOn: { color: EXTRA.success },
  credChipTextOff: { color: EXTRA.danger },
  credTime: {
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.sm,
    borderRadius: 14,
    paddingHorizontal: THEME.spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  clearBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
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
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  footerHint: {
    color: COLORS.muted,
    fontSize: 13,
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
    backgroundColor: "transparent",
  },
  menuCard: {
    width: 170,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  menuAction: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuActionText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  menuDeleteText: {
    color: "#dc2626",
    fontWeight: "700",
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  modalOverlay: {
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
    borderRadius: 16,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.web,
  },

  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: THEME.spacing.sm,
  },
  confirmText: {
    color: COLORS.text,
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

  /* ── Modal elements ── */
  modalCardModern: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  inputLabel: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 10,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 4,
  },
  cancelBtnModern: {
    paddingHorizontal: 18,
    paddingVertical: 12,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  deleteBtnModern: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
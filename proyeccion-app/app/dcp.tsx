import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  startAfter,
  startAt,
  endAt,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "@/lib/dbService";
import React, { useEffect, useState, useRef } from "react";
import {
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Animated,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { db, CINES_COLLECTION } from "../lib/firebaseConfig";
import { getCineConfig } from "../lib/cineConfig";

import { COLORS, THEME } from "../lib/theme";
import { useAuthUser } from "../lib/useAuthUser";
import { Dcp } from "../lib/types";

/* ── helpers ── */

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const formatDate = (isoStr: string) => {
  if (!isoStr) return "";
  const parts = isoStr.split("-");
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatDiscoLabel = (disco: string) => {
  if (!disco) return "";
  const val = disco.trim();
  const lower = val.toLowerCase();
  if (lower === "satelite" || lower === "satélite") return "Satélite";
  if (lower.startsWith("disco") || lower.startsWith("#")) return val;
  return `Disco #${val}`;
};

/* ── component ── */

/* ── component cards ── */

const ActiveDcpCard = ({
  item,
  readOnly,
  openMenuForDcp,
  retirarDcp,
  COLORS,
  THEME,
  formatDiscoLabel,
  formatDate,
}: {
  item: Dcp;
  readOnly: boolean;
  openMenuForDcp: (e: any, item: Dcp) => void;
  retirarDcp: (item: Dcp) => void;
  COLORS: any;
  THEME: any;
  formatDiscoLabel: (disco: string) => string;
  formatDate: (date: string) => string;
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

  return (
    <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <View
        {...({
          onMouseEnter: Platform.OS === "web" ? () => setIsHovered(true) : undefined,
          onMouseLeave: Platform.OS === "web" ? () => setIsHovered(false) : undefined,
        } as any)}
        style={[
          styles.dcpCard,
          isHovered && styles.dcpCardHovered,
          { borderColor: isHovered ? COLORS.primary : COLORS.border }
        ]}
      >
        <View style={styles.dcpCardAccent} />
        <View style={styles.dcpCardBody}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.dcpTitle} numberOfLines={2}>
              {item.nombre}
            </Text>
            {!readOnly && (
              <Pressable
                onPress={(e) => openMenuForDcp(e, item)}
                style={[
                  styles.moreBtn,
                  isHovered && { borderColor: COLORS.primary }
                ]}
              >
                <MaterialCommunityIcons name="dots-vertical" size={18} color={COLORS.text} />
              </Pressable>
            )}
          </View>

          <View style={styles.metaRowCenter}>
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="disc" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.metaChipText}>{formatDiscoLabel(item.numeroDisco)}</Text>
            </View>
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.metaChipText}>{item.ubicacion}</Text>
            </View>
          </View>

          <View style={{ alignItems: "center" }}>
            <SubCasBadges item={item} COLORS={COLORS} />
          </View>
          
          <View style={styles.metaRowCenter}>
            <View style={styles.metaChipDate}>
              <MaterialCommunityIcons name="calendar-arrow-right" size={14} color="#16A34A" style={{ marginRight: 4 }} />
              <Text style={styles.metaChipDateText}>Llegó: {formatDate(item.fechaLlegada)}</Text>
            </View>
          </View>

          {item.createdName ? (
            <Text style={styles.dcpMetaCenter}>Cargado por: {item.createdName}</Text>
          ) : null}

          {!readOnly && (
            <TouchableOpacity
              style={styles.retireBtn}
              onPress={() => retirarDcp(item)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="package-down" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retireBtnText}>Marcar como retirado</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const RetiredDcpCard = ({
  item,
  readOnly,
  openMenuForDcp,
  revertirDcp,
  COLORS,
  THEME,
  formatDiscoLabel,
  formatDate,
}: {
  item: Dcp;
  readOnly: boolean;
  openMenuForDcp: (e: any, item: Dcp) => void;
  revertirDcp: (item: Dcp) => void;
  COLORS: any;
  THEME: any;
  formatDiscoLabel: (disco: string) => string;
  formatDate: (date: string) => string;
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

  return (
    <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <View
        {...({
          onMouseEnter: Platform.OS === "web" ? () => setIsHovered(true) : undefined,
          onMouseLeave: Platform.OS === "web" ? () => setIsHovered(false) : undefined,
        } as any)}
        style={[
          styles.dcpCard,
          styles.dcpCardRetired,
          isHovered && styles.dcpCardHovered,
          { borderColor: isHovered ? COLORS.muted : COLORS.border }
        ]}
      >
        <View style={[styles.dcpCardAccent, { backgroundColor: COLORS.muted }]} />
        <View style={styles.dcpCardBody}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.dcpTitle2, { color: COLORS.muted }]} numberOfLines={2}>
              {item.nombre}
            </Text>
            {!readOnly && (
              <Pressable onPress={(e) => openMenuForDcp(e, item)} style={styles.moreBtn}>
                <MaterialCommunityIcons name="dots-vertical" size={18} color={COLORS.muted} />
              </Pressable>
            )}
          </View>

          <View style={styles.metaRowCenter}>
            <View style={[styles.metaChip, { backgroundColor: COLORS.bg }]}>
              <MaterialCommunityIcons name="disc" size={14} color={COLORS.muted} style={{ marginRight: 4 }} />
              <Text style={[styles.metaChipText, { color: COLORS.muted }]}>{formatDiscoLabel(item.numeroDisco)}</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: COLORS.bg }]}>
              <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.muted} style={{ marginRight: 4 }} />
              <Text style={[styles.metaChipText, { color: COLORS.muted }]}>{item.ubicacion}</Text>
            </View>
          </View>

          <View style={{ alignItems: "center" }}>
            <SubCasBadges item={item} muted COLORS={COLORS} />
          </View>
          
          <View style={styles.metaRowCenter}>
            <View style={[styles.metaChipDate, { backgroundColor: "rgba(22, 163, 74, 0.08)" }]}>
              <MaterialCommunityIcons name="calendar-arrow-right" size={14} color="#16A34A" style={{ marginRight: 4 }} />
              <Text style={styles.metaChipDateText}>Llegó: {formatDate(item.fechaLlegada)}</Text>
            </View>
            {item.fechaSalida ? (
              <View style={[styles.metaChipDate, { backgroundColor: "rgba(220, 38, 38, 0.08)" }]}>
                <MaterialCommunityIcons name="calendar-arrow-left" size={14} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={[styles.metaChipDateText, { color: "#DC2626" }]}>Salió: {formatDate(item.fechaSalida)}</Text>
              </View>
            ) : null}
          </View>

          {item.createdName ? (
            <Text style={styles.dcpMetaCenter}>Cargado por: {item.createdName}</Text>
          ) : null}

          {!readOnly && (
            <TouchableOpacity
              style={[styles.retireBtn, { backgroundColor: "#64748B" }]}
              onPress={() => revertirDcp(item)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="undo" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retireBtnText}>Marcar como no retirado</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const SubCasBadges = ({ item, muted, COLORS }: { item: Dcp; muted?: boolean; COLORS: any }) => {
  const hasSub = item.sub !== false; // default true for old docs
  const hasCas = item.cas !== false;
  if (!hasSub && !hasCas) return null;

  const color = muted ? COLORS.muted : "#6366F1";
  const bg = muted ? COLORS.bg : COLORS.primarySoft;

  return (
    <View style={styles.metaRow}>
      {hasSub && (
        <View style={[styles.metaChipSmall, { backgroundColor: bg }]}>
          <Text style={[styles.metaChipSmallText, { color }]}>SUB</Text>
        </View>
      )}
      {hasCas && (
        <View style={[styles.metaChipSmall, { backgroundColor: bg }]}>
          <Text style={[styles.metaChipSmallText, { color }]}>CAS</Text>
        </View>
      )}
    </View>
  );
};

export default function DcpScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, loading: sessionLoading, displayName } = useAuthUser();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [activos, setActivos] = useState<Dcp[]>([]);
  const [showHistorial, setShowHistorial] = useState(false);

  /* ── historial pagination & search ── */
  const [retirados, setRetirados] = useState<Dcp[]>([]);
  const [loadingRetirados, setLoadingRetirados] = useState(false);
  const [hasMoreRetirados, setHasMoreRetirados] = useState(false);
  const [lastRetRef, setLastRetRef] = useState<any>(null);
  const [historialSearch, setHistorialSearch] = useState("");
  const searchTimer = React.useRef<NodeJS.Timeout>(undefined);
  const HISTORIAL_PAGE = 10;

  const handleNumeroDiscoChange = (t: string) => {
    // Si contiene algo que no sea número
    if (/[^0-9]/.test(t)) {
      Alert.alert("Formato Inválido", "El número de disco solo acepta números (ej: 3). Si deseas cargar un satélite, toca el botón celeste 'Satélite' a la derecha.");
      setFormNumeroDisco(t.replace(/[^0-9]/g, ""));
    } else {
      setFormNumeroDisco(t);
    }
  };

  /* ── form state ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formNombre, setFormNombre] = useState("");
  const [formNumeroDisco, setFormNumeroDisco] = useState("");
  const [formEsSatelite, setFormEsSatelite] = useState(false);
  const [formUbicacion, setFormUbicacion] = useState("TMS");
  const [formCargadoPor, setFormCargadoPor] = useState("");
  const [formSub, setFormSub] = useState(true);
  const [formCas, setFormCas] = useState(true);

  /* ── ubicación dropdown ── */
  const [ubicacionOptions, setUbicacionOptions] = useState<string[]>(["TMS"]);
  const [showUbicacionDropdown, setShowUbicacionDropdown] = useState(false);

  /* ── nombres persistidos ── */
  const [nombresCargadores, setNombresCargadores] = useState<string[]>([]);
  const [showNombresDropdown, setShowNombresDropdown] = useState(false);

  /* ── context menu ── */
  const [showMenu, setShowMenu] = useState(false);
  const [menuDcp, setMenuDcp] = useState<Dcp | null>(null);

  /* ── confirmations ── */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dcpToDelete, setDcpToDelete] = useState<Dcp | null>(null);
  const [showRetireConfirm, setShowRetireConfirm] = useState(false);
  const [dcpToRetire, setDcpToRetire] = useState<Dcp | null>(null);

  /* ── custom date retire ── */
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [customDateText, setCustomDateText] = useState(""); // web: DD/MM/YYYY
  const [customDateValue, setCustomDateValue] = useState(new Date()); // android picker
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const columns = screenWidth >= 1100 ? 3 : screenWidth >= 768 ? 2 : 1;
  const itemWidth: any = `${100 / columns}%`;

  useEffect(() => {
    if (!cineId) return;
    (async () => {
      try {
        const config = await getCineConfig(cineId);
        if (config && config.salasCount > 0) {
          const salas = Array.from({ length: config.salasCount }, (_, i) => `Sala ${i + 1}`);
          setUbicacionOptions(["TMS", ...salas]);
        } else {
          setUbicacionOptions(["TMS"]);
        }
      } catch (e) {
        console.error("Error loading cine config for DCP:", e);
        setUbicacionOptions(["TMS"]);
      }
    })();
  }, [cineId]);

  /* ── load persisted cargador names from Firestore ── */
  useEffect(() => {
    if (!cineId) return;
    (async () => {
      try {
        const ref = doc(db, CINES_COLLECTION, cineId, "info", "dcpNombres");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const list = Array.isArray(data.nombres) ? data.nombres as string[] : [];
          setNombresCargadores(list);
        }
      } catch (e) {
        console.error("Error loading DCP nombres:", e);
      }
    })();
  }, [cineId]);

  /** Persist a new cargador name to Firestore if not already saved */
  const persistNombre = async (nombre: string) => {
    if (!cineId || !nombre.trim()) return;
    const trimmed = nombre.trim();
    if (nombresCargadores.includes(trimmed)) return;

    const updated = [...nombresCargadores, trimmed];
    setNombresCargadores(updated);

    try {
      const ref = doc(db, CINES_COLLECTION, cineId, "info", "dcpNombres");
      await setDoc(ref, { nombres: updated }, { merge: true });
    } catch (e) {
      console.error("Error persisting DCP nombre:", e);
    }
  };

  /* ── realtime listener (ONLY ACTIVOS) ── */
  useEffect(() => {
    let unsub: any;

    (async () => {
      if (sessionLoading) {
        setLoading(true);
        return;
      }
      if (!user || !cineId) {
        setActivos([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, CINES_COLLECTION, cineId, "dcp"),
        where("retirado", "==", false)
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          const all = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as Dcp[];

          // Client-side sort to avoid composite index requirement
          all.sort((a, b) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tB - tA;
          });

          setActivos(all);
          setLoading(false);
        },
        (err) => {
          console.error("Activos listener err:", err);
          setLoading(false);
        }
      );
    })();

    return () => unsub && unsub();
  }, [user, cineId, sessionLoading]);

  /* ── lazy load retirados ── */

  const loadRetirados = async (isLoadMore = false, term = "") => {
    if (!cineId) return;

    try {
      setLoadingRetirados(true);
      const col = collection(db, CINES_COLLECTION, cineId, "dcp");
      const searchKey = term.trim().toUpperCase();
      let currentLastRef = isLoadMore ? lastRetRef : null;
      let accumulated: Dcp[] = [];
      let docsFetched = 0;
      let shouldKeepFetching = true;
      let iterations = 0;

      while (shouldKeepFetching && iterations < 8) {
        iterations++;
        let q;

        if (searchKey) {
          q = query(
            col,
            orderBy("nombre"),
            startAt(searchKey),
            endAt(searchKey + "\uf8ff"),
            ...(currentLastRef ? [startAfter(currentLastRef)] : []),
            limit(30)
          );
        } else {
          q = query(
            col,
            orderBy("fechaSalida", "desc"),
            ...(currentLastRef ? [startAfter(currentLastRef)] : []),
            limit(HISTORIAL_PAGE)
          );
        }

        const snap = await getDocs(q);
        if (snap.empty) {
          shouldKeepFetching = false;
          break;
        }

        docsFetched = snap.docs.length;
        currentLastRef = snap.docs[snap.docs.length - 1];

        const allFetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Dcp));
        const retiredItems = allFetched.filter(x => x.retirado === true);
        accumulated = [...accumulated, ...retiredItems];

        const pageSize = searchKey ? 30 : HISTORIAL_PAGE;
        if (accumulated.length >= HISTORIAL_PAGE || docsFetched < pageSize) {
          shouldKeepFetching = false;
        }
      }

      if (isLoadMore) {
        setRetirados(prev => {
          const map = new Map(prev.map(i => [i.id, i]));
          accumulated.forEach(i => map.set(i.id, i));
          return Array.from(map.values());
        });
      } else {
        setRetirados(accumulated);
      }

      setLastRetRef(currentLastRef);

      const pageSize = searchKey ? 30 : HISTORIAL_PAGE;
      setHasMoreRetirados(docsFetched === pageSize && accumulated.length > 0);
    } catch (e: any) {
      console.error("Historial error:", e);
      Alert.alert("Error", "No se pudo cargar el historial. Pedile a soporte que cree el índice de Firestore. Abrí la consola (F12) para tener el link.");
    } finally {
      setLoadingRetirados(false);
    }
  };

  const handleSearchHistorial = (text: string) => {
    setHistorialSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadRetirados(false, text);
    }, 400);
  };

  /* ── form actions ── */

  const openNew = () => {
    setEditingId(null);
    setFormNombre("");
    setFormNumeroDisco("");
    setFormEsSatelite(false);
    setFormUbicacion("TMS");
    setFormCargadoPor("");
    setFormSub(true);
    setFormCas(true);
    setShowUbicacionDropdown(false);
    setShowNombresDropdown(false);
    setShowForm(true);
  };

  const openEdit = (d: Dcp) => {
    setEditingId(d.id);
    setFormNombre(d.nombre);
    setFormUbicacion(d.ubicacion);
    setFormCargadoPor(d.createdName || "");
    setFormSub(d.sub !== false);
    setFormCas(d.cas !== false);

    const dLow = d.numeroDisco.toLowerCase().trim();
    if (dLow === "satelite" || dLow === "satélite") {
      setFormEsSatelite(true);
      setFormNumeroDisco("");
    } else {
      setFormEsSatelite(false);
      setFormNumeroDisco(d.numeroDisco);
    }

    setShowUbicacionDropdown(false);
    setShowNombresDropdown(false);
    setShowForm(true);
  };

  const addDcp = async () => {
    if (!user || !cineId) return;

    if (!formNombre.trim()) {
      Alert.alert("DCP", "Ingresá el nombre del DCP (obligatorio).");
      return;
    }
    if (!formEsSatelite) {
      if (!formNumeroDisco.trim()) {
        Alert.alert("DCP", "Ingresá el número de disco (obligatorio) o seleccioná Satélite.");
        return;
      }
      if (!/^\d+$/.test(formNumeroDisco.trim())) {
        Alert.alert("DCP", "El número de disco debe contener únicamente números. Si es un satélite, utiliza el botón lateral.");
        return;
      }
    }
    if (!formCargadoPor.trim()) {
      Alert.alert("DCP", "Ingresá quién carga el DCP (obligatorio).");
      return;
    }

    try {
      const cargadoPor = formCargadoPor.trim();

      const changes = {
        nombre: formNombre.trim(),
        numeroDisco: formEsSatelite ? "Satelite" : formNumeroDisco.trim(),
        ubicacion: formUbicacion,
        sub: formSub,
        cas: formCas,
        createdName: cargadoPor,
      };

      if (editingId) {
        await updateDoc(doc(db, CINES_COLLECTION, cineId, "dcp", editingId), changes);
      } else {
        await addDoc(collection(db, CINES_COLLECTION, cineId, "dcp"), {
          ...changes,
          fechaLlegada: todayISO(),
          fechaSalida: null,
          retirado: false,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }

      // persist the name for future use
      await persistNombre(cargadoPor);

      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      Alert.alert("DCP", "No se pudo guardar la información del DCP.");
    }
  };

  /* ── menu / retire / delete ── */
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const openMenuForDcp = (e: any, d: Dcp) => {
    let { pageX, pageY } = e.nativeEvent;
    let x = pageX - 150; // default to left of the cursor
    let y = pageY;

    // Bounds check
    if (x < 10) x = 10;
    if (y + 120 > screenHeight) y = pageY - 110;

    setMenuPos({ x, y });
    setMenuDcp(d);
    setShowMenu(true);
  };

  const closeMenu = () => {
    setShowMenu(false);
    setMenuDcp(null);
  };

  const retirarDcp = (d: Dcp) => {
    setDcpToRetire(d);
    setShowCustomDate(false);
    setCustomDateText("");
    setCustomDateValue(new Date());
    setShowAndroidPicker(false);
    setShowRetireConfirm(true);
  };

  const confirmRetirar = async () => {
    if (!dcpToRetire || !cineId) return;
    try {
      await updateDoc(
        doc(db, CINES_COLLECTION, cineId, "dcp", dcpToRetire.id),
        { retirado: true, fechaSalida: todayISO() }
      );
      setShowRetireConfirm(false);
      setDcpToRetire(null);
    } catch (e) {
      console.error(e);
      Alert.alert("DCP", "No se pudo retirar el DCP.");
    }
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

  const confirmRetirarCustomDate = async () => {
    if (!dcpToRetire || !cineId) return;

    let fechaSalida: string;

    if (Platform.OS === "web") {
      const parsed = parseDateInput(customDateText);
      if (!parsed) {
        Alert.alert("Fecha inválida", "Usá el formato DD/MM/AAAA (ej: 28/03/2026)");
        return;
      }
      fechaSalida = parsed;
    } else {
      // Android — use customDateValue from picker
      const d = customDateValue;
      fechaSalida = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    try {
      await updateDoc(
        doc(db, CINES_COLLECTION, cineId, "dcp", dcpToRetire.id),
        { retirado: true, fechaSalida }
      );
      setShowRetireConfirm(false);
      setShowCustomDate(false);
      setDcpToRetire(null);
    } catch (e) {
      console.error(e);
      Alert.alert("DCP", "No se pudo retirar el DCP.");
    }
  };

  const deshacerRetiro = async (d: Dcp) => {
    if (readOnly) return;
    if (!cineId) return;

    try {
      await updateDoc(
        doc(db, CINES_COLLECTION, cineId, "dcp", d.id),
        {
          retirado: false,
          fechaSalida: null,
        }
      );
    } catch (e) {
      console.error("ERROR REVERTIR:", e);
      Alert.alert("DCP", "No se pudo revertir el retiro.");
    }
  };
  const revertirDcp = (d: Dcp) => {
    const title = "Revertir retiro";
    const msg = `¿Volver "${d.nombre}" a activos?`;

    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${msg}`)) {
        deshacerRetiro(d);
      }
    } else {
      Alert.alert(
        title,
        msg,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Confirmar", onPress: () => deshacerRetiro(d) },
        ]
      );
    }
  };
  const removeDcp = (d: Dcp) => {
    setDcpToDelete(d);
    setShowDeleteConfirm(true);
  };

  const confirmRemoveDcp = async () => {
    if (!dcpToDelete || !cineId) return;
    try {
      await deleteDoc(doc(db, CINES_COLLECTION, cineId, "dcp", dcpToDelete.id));
      setShowDeleteConfirm(false);
      setDcpToDelete(null);
    } catch (e) {
      console.error(e);
      Alert.alert("DCP", "No se pudo eliminar.");
    }
  };

  /* ── render items ── */

  const renderActiveItem = ({ item }: { item: Dcp }) => (
    <ActiveDcpCard
      item={item}
      readOnly={readOnly}
      openMenuForDcp={openMenuForDcp}
      retirarDcp={retirarDcp}
      COLORS={COLORS}
      THEME={THEME}
      formatDiscoLabel={formatDiscoLabel}
      formatDate={formatDate}
    />
  );

  const renderRetiredItem = ({ item }: { item: Dcp }) => (
    <RetiredDcpCard
      item={item}
      readOnly={readOnly}
      openMenuForDcp={openMenuForDcp}
      revertirDcp={revertirDcp}
      COLORS={COLORS}
      THEME={THEME}
      formatDiscoLabel={formatDiscoLabel}
      formatDate={formatDate}
    />
  );

  /* ── loading ── */

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Cargando DCPs…</Text>
      </View>
    );
  }

  /* ── main render ── */

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.listContent}>
        {loading && activos.length === 0 ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : activos.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>Sin DCPs activos por el momento.</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {activos.map(item => (
              <View key={item.id} style={{ width: itemWidth, padding: 8 }}>
                {renderActiveItem({ item })}
              </View>
            ))}
          </View>
        )}

        {/* ── HISTORIAL SECTION ── */}
        <View>
          <TouchableOpacity
            style={styles.historialToggle}
            onPress={() => {
              const next = !showHistorial;
              setShowHistorial(next);
              if (next) {
                setHistorialSearch("");
                loadRetirados(false, "");
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name={showHistorial ? "chevron-up" : "chevron-down"}
              size={20}
              color={COLORS.primary}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.historialToggleText}>
              Historial de retirados
            </Text>
          </TouchableOpacity>

          {showHistorial && (
            <View style={styles.historialSection}>
              {/* Search bar */}
              <View style={styles.historialSearchWrap}>
                <TextInput
                  value={historialSearch}
                  onChangeText={handleSearchHistorial}
                  placeholder="Buscar en retirados…"
                  placeholderTextColor={COLORS.muted}
                  style={styles.historialSearchInput}
                  returnKeyType="search"
                  onSubmitEditing={Keyboard.dismiss}
                  autoCapitalize="none"
                />
                {historialSearch ? (
                  <TouchableOpacity
                    onPress={() => {
                      setHistorialSearch("");
                      loadRetirados(false, "");
                    }}
                    style={styles.historialClearBtn}
                  >
                    <Text style={styles.historialClearBtnText}>×</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {loadingRetirados && retirados.length === 0 ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 20 }} />
              ) : retirados.length === 0 ? (
                <Text style={[styles.emptyText, { marginTop: 12 }]}>
                  {historialSearch ? "Sin resultados" : "Sin DCPs retirados"}
                </Text>
              ) : (
                <>
                  <View style={styles.gridContainer}>
                    {retirados.map((item) => (
                      <View key={item.id} style={{ width: itemWidth, padding: 8 }}>
                        {renderRetiredItem({ item })}
                      </View>
                    ))}
                  </View>
                  {loadingRetirados ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 10 }} />
                  ) : hasMoreRetirados ? (
                    <TouchableOpacity
                      style={styles.loadMoreBtn}
                      onPress={() => loadRetirados(true, historialSearch)}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.loadMoreText}>Cargar más</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>
          )}

        </View>
      </ScrollView>

      {/* FAB */}
      {!readOnly && (
        <TouchableOpacity style={styles.fabBR} onPress={openNew} activeOpacity={0.9}>
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Context menu ── */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={closeMenu}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={[styles.menuBackdrop, { alignItems: "flex-start", justifyContent: "flex-start" }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuCard, { position: "absolute", top: menuPos.y, left: menuPos.x }]}>
                {menuDcp && (
                  <>
                    <Pressable
                      style={styles.menuAction}
                      onPress={() => { const d = menuDcp; closeMenu(); openEdit(d); }}
                    >
                      <Text style={styles.menuActionText}>✏️ Editar</Text>
                    </Pressable>
                    <View style={styles.menuDivider} />
                  </>
                )}
                <Pressable
                  style={styles.menuAction}
                  onPress={() => { const d = menuDcp; closeMenu(); if (d) removeDcp(d); }}
                >
                  <Text style={styles.menuDeleteText}>🗑️ Eliminar</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Retire confirmation ── */}
      <Modal
        visible={showRetireConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => { setShowRetireConfirm(false); setDcpToRetire(null); setShowCustomDate(false); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Retirar DCP</Text>
            <Text style={styles.confirmText}>
              {dcpToRetire ? `¿Marcar "${dcpToRetire.nombre}" como retirado?` : "¿Marcar este DCP como retirado?"}
            </Text>

            {!showCustomDate ? (
              <>
                <Text style={[styles.confirmText, { marginTop: 4, color: COLORS.muted, fontSize: 13 }]}>
                  Se registrará la fecha de hoy como salida.
                </Text>
                <View style={styles.retireActionsCol}>
                  <TouchableOpacity style={styles.retireActionBtn} onPress={confirmRetirar}>
                    <MaterialCommunityIcons name="calendar-today" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.retireActionBtnText}>Retirar hoy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.retireActionBtn, { backgroundColor: "#6366F1" }]}
                    onPress={() => setShowCustomDate(true)}
                  >
                    <MaterialCommunityIcons name="calendar-edit" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.retireActionBtnText}>Fecha específica</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.retireActionBtn, { backgroundColor: COLORS.border }]}
                    onPress={() => { setShowRetireConfirm(false); setDcpToRetire(null); }}
                  >
                    <Text style={[styles.retireActionBtnText, { color: COLORS.text }]}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.confirmText, { marginTop: 4, color: COLORS.muted, fontSize: 13 }]}>
                  Ingresá la fecha de salida
                </Text>

                {Platform.OS === "web" ? (
                  <View style={styles.fieldGroup}>
                    <TextInput
                      style={styles.modalInputModern}
                      placeholder="DD/MM/AAAA"
                      placeholderTextColor="#94A3B8"
                      value={customDateText}
                      onChangeText={setCustomDateText}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ) : (
                  <View style={{ alignItems: "center", marginVertical: 12 }}>
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

                <View style={styles.retireActionsCol}>
                  <TouchableOpacity style={styles.retireActionBtn} onPress={confirmRetirarCustomDate}>
                    <MaterialCommunityIcons name="check" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.retireActionBtnText}>Confirmar fecha</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.retireActionBtn, { backgroundColor: "#E2E8F0" }]}
                    onPress={() => setShowCustomDate(false)}
                  >
                    <Text style={[styles.retireActionBtnText, { color: COLORS.text }]}>Volver</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Delete confirmation ── */}
      <Modal
        visible={showDeleteConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => { setShowDeleteConfirm(false); setDcpToDelete(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar DCP</Text>
            <Text style={styles.confirmText}>
              {dcpToDelete ? `¿Eliminar "${dcpToDelete.nombre}"?` : "¿Eliminar este DCP?"}
            </Text>
            <View style={styles.modalActionsModern}>
              <TouchableOpacity style={styles.cancelBtnModern} onPress={() => { setShowDeleteConfirm(false); setDcpToDelete(null); }}>
                <Text style={styles.cancelBtnTextModern}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtnModern} onPress={confirmRemoveDcp}>
                <Text style={styles.deleteBtnTextModern}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── New/Edit DCP form ── */}
      <Modal visible={showForm} animationType="fade" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardModern}>
            <Text style={styles.modalTitleModern}>{editingId ? "Editar DCP" : "Nuevo DCP"}</Text>
            <Text style={styles.modalSubtitleModern}>
              {editingId ? "Modificá la información de este DCP." : "Completá los datos para registrar un nuevo disco."}
            </Text>

            {/* Nombre */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nombre</Text>
              <TextInput
                style={styles.modalInputModern}
                placeholder="Ej: CAPITÁN AMÉRICA"
                value={formNombre}
                onChangeText={(t) => setFormNombre(t.toUpperCase())}
                returnKeyType="next"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Número de disco o Satélite */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Número de disco</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={[
                    styles.modalInputModern,
                    { flex: 1, marginRight: 10 },
                    formEsSatelite && { backgroundColor: COLORS.bg, color: COLORS.muted }
                  ]}
                  placeholder={formEsSatelite ? "Satélite seleccionado" : "Ej: 3"}
                  value={formEsSatelite ? "Satélite" : formNumeroDisco}
                  onChangeText={handleNumeroDiscoChange}
                  returnKeyType="next"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  editable={!formEsSatelite}
                />
                <TouchableOpacity
                  onPress={() => setFormEsSatelite(!formEsSatelite)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: formEsSatelite ? COLORS.primary : COLORS.border,
                    paddingVertical: THEME.spacing.md,
                    paddingHorizontal: THEME.spacing.lg,
                    borderRadius: THEME.radius.md,
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                >
                  <Text style={{
                    color: formEsSatelite ? "#fff" : COLORS.muted,
                    fontWeight: "600",
                    fontSize: 14
                  }}>
                    Satélite
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Ubicación — dropdown */}
            <View style={[styles.fieldGroup, { zIndex: 20 }]}>
              <Text style={styles.fieldLabel}>Ubicación</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => {
                  setShowUbicacionDropdown(!showUbicacionDropdown);
                  setShowNombresDropdown(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownTriggerText}>{formUbicacion}</Text>
                <MaterialCommunityIcons
                  name={showUbicacionDropdown ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
              {showUbicacionDropdown && (
                <View style={styles.dropdownList}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                    {ubicacionOptions.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.dropdownItem,
                          formUbicacion === opt && styles.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setFormUbicacion(opt);
                          setShowUbicacionDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            formUbicacion === opt && styles.dropdownItemTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                        {formUbicacion === opt && (
                          <MaterialCommunityIcons name="check" size={16} color={COLORS.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Cargado por — with autocomplete dropdown */}
            <View style={[styles.fieldGroup, { zIndex: 10 }]}>
              <Text style={styles.fieldLabel}>Cargado por</Text>
              <View>
                <TextInput
                  style={styles.modalInputModern}
                  placeholder="Nombre de quien carga"
                  value={formCargadoPor}
                  onChangeText={(t) => {
                    setFormCargadoPor(t);
                    setShowNombresDropdown(t.length === 0 && nombresCargadores.length > 0);
                  }}
                  onFocus={() => {
                    if (nombresCargadores.length > 0) setShowNombresDropdown(true);
                    setShowUbicacionDropdown(false);
                  }}
                  returnKeyType="done"
                  placeholderTextColor="#94A3B8"
                />
                {showNombresDropdown && nombresCargadores.length > 0 && (
                  <View style={styles.dropdownList}>
                    {nombresCargadores
                      .filter((n) =>
                        formCargadoPor.trim()
                          ? n.toLowerCase().includes(formCargadoPor.trim().toLowerCase())
                          : true
                      )
                      .map((nombre) => (
                        <TouchableOpacity
                          key={nombre}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setFormCargadoPor(nombre);
                            setShowNombresDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{nombre}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
            </View>

            {/* SUB / CAS toggles */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleItem}>
                <Switch value={formSub} onValueChange={setFormSub} />
                <Text style={styles.toggleLabel}>SUB</Text>
              </View>
              <View style={styles.toggleItem}>
                <Switch value={formCas} onValueChange={setFormCas} />
                <Text style={styles.toggleLabel}>CAS</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.modalActionsModern}>
              <TouchableOpacity style={styles.cancelBtnModern} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnTextModern}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtnModern} onPress={addDcp}>
                <Text style={styles.saveBtnTextModern}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ── styles ── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    position: "relative",
    minHeight: 0,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: COLORS.muted,
    marginTop: 8,
  },

  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    alignItems: "flex-start",
  },

  listContent: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  /* ── DCP Card ── */
  dcpCardOuter: {
  },
  dcpCard: {
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
  dcpCardHovered: {
    ...Platform.select({
      web: {
        transform: [{ translateY: -2 }],
        boxShadow: "0 12px 20px -8px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.05)",
      } as any,
    }),
  },
  dcpCardRetired: {
    opacity: 0.75,
  },
  dcpCardAccent: {
    width: 4,
    backgroundColor: COLORS.primary,
  },
  dcpCardBody: {
    flex: 1,
    padding: THEME.spacing.lg,
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    marginBottom: THEME.spacing.sm,
    position: "relative",
  },

  dcpTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    textAlign: "center",
  },
  dcpTitle2: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    textAlign: "center",
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },

  metaRowCenter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    justifyContent: "center",
  },

  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  metaChipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipSmallText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  metaChipDate: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  metaChipDateText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },

  dcpMeta: {
    color: COLORS.muted,
    marginTop: 4,
    fontSize: THEME.fontSize.sm,
  },

  dcpMetaCenter: {
    color: COLORS.muted,
    marginTop: 6,
    fontSize: THEME.fontSize.sm - 1,
    textAlign: "center",
  },

  retireBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    alignSelf: "center",
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "opacity 0.2s ease",
      } as any,
    }),
  },
  retireBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

  /* ── More button ── */
  moreBtn: {
    position: "absolute",
    right: 0,
    top: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "all 0.2s ease",
      } as any,
    }),
  },
  moreBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 16,
  },

  /* ── Historial toggle ── */
  historialToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  historialToggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
  },
  historialSection: {
    paddingTop: 8,
  },

  /* ── Historial search ── */
  historialSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.md,
    borderRadius: 14,
    paddingHorizontal: THEME.spacing.md,
    ...Platform.select({
      web: {
        transition: "border-color 0.2s ease",
      } as any,
    }),
  },
  historialSearchInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  historialClearBtn: {
    paddingVertical: THEME.spacing.xs,
    paddingHorizontal: THEME.spacing.sm,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  historialClearBtnText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  historialCount: {
    marginBottom: THEME.spacing.sm,
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
    textAlign: "center",
  },
  loadMoreBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: THEME.radius.full,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    alignSelf: "center",
    marginTop: 10,
    ...THEME.shadow.soft,
  },
  loadMoreText: {
    color: "#fff",
    fontWeight: "800",
  },

  /* ── FAB ── */
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

  /* ── Menus & modals ── */
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
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 20,
  },

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
  modalTitleModern: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  modalSubtitleModern: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },

  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalInputModern: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontSize: 15,
  },

  /* ── Dropdown (for ubicación & nombres) ── */
  dropdownTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownTriggerText: {
    color: COLORS.text,
    fontSize: 15,
  },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    maxHeight: 200,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dropdownItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.primarySoft,
  },
  dropdownItemText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "600",
  },
  dropdownItemTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },

  /* ── SUB / CAS toggles ── */
  toggleRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 14,
    marginTop: 4,
  },
  toggleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },

  modalActionsModern: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },

  /* ── Retire modal actions (column layout) ── */
  retireActionsCol: {
    gap: 10,
    marginTop: 14,
  },
  retireActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  retireActionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  cancelBtnModern: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.border,
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
  },
  deleteBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 24,
  },
});

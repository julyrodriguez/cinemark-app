import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  runTransaction,
  where,
  startAfter
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { CINES_COLLECTION, db } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";

// ─── Types ────────────────────────────────────────────────────────────────────

type LentesStock = {
  id: "adultos" | "kids";
  nombre: "Adultos" | "Kids";
  sucios: number;
  chequeados: number; // Chequeados para usar
  listos: number;     // Listos para chequear
  limpios: number;    // Limpios
  ultimaActualizacion?: string;
};

type LentesCierre = {
  id: string;
  fecha: string;
  creadoEn: string;
  creadoPorEmail: string;
  creadoPorNombre: string;
  responsable: string;
  tipo?: "cierre" | "embolsado" | "ajuste";
  adultos: {
    usados?: number;
    perdidos?: number;
    embolsados?: number;
    sucios?: number;
    chequeados?: number;
    listos?: number;
    limpios?: number;
    merma?: number;
  };
  kids: {
    usados?: number;
    perdidos?: number;
    embolsados?: number;
    sucios?: number;
    chequeados?: number;
    listos?: number;
    limpios?: number;
    merma?: number;
  };
  entregados?: { label: string; adultos: number; kids: number }[];
  finalDelDia?: {
    adultos: { embolsados: number; sucios: number };
    kids: { embolsados: number; sucios: number };
  };
  complejo?: {
    adultos: { sucios: number; limpios: number; embolsados: number };
    kids: { sucios: number; limpios: number; embolsados: number };
  };
  merma?: {
    adultos: number;
    kids: number;
  };
  prevStock?: {
    adultos: { sucios: number; listos: number; chequeados: number; limpios?: number };
    kids: { sucios: number; listos: number; chequeados: number; limpios?: number };
  };
};

type MonthlyStats = {
  usadosAdultos: number;
  usadosKids: number;
  perdidosAdultos: number;
  perdidosKids: number;
  mermaAdultos: number;
  mermaKids: number;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoordinadoresLentesScreen() {
  const { cineId, user, displayName } = useAuthUser();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  // Helper for cross-platform alerts (Web compatibility)
  const showAlert = (
    title: string,
    message: string,
    buttons?: { text: string; style?: "cancel" | "default" | "destructive"; onPress?: () => void }[]
  ) => {
    if (Platform.OS === "web") {
      if (buttons && buttons.length > 1) {
        const isConfirm = window.confirm(`${title}\n\n${message}`);
        if (isConfirm) {
          const primaryBtn = buttons.find(
            b => b.style === "destructive" || b.text.toLowerCase().includes("sí") || b.text.toLowerCase().includes("revertir") || b.text.toLowerCase().includes("aceptar")
          );
          if (primaryBtn && primaryBtn.onPress) {
            primaryBtn.onPress();
          } else {
            const otherBtn = buttons.find(b => b.style !== "cancel");
            if (otherBtn && otherBtn.onPress) otherBtn.onPress();
          }
        }
      } else {
        window.alert(`${title}\n\n${message}`);
      }
    } else {
      Alert.alert(title, message, buttons);
    }
  };

  const [loading, setLoading] = useState(true);
  const [stockAdultos, setStockAdultos] = useState<LentesStock | null>(null);
  const [stockKids, setStockKids] = useState<LentesStock | null>(null);

  // ── Historial, Estadísticas y Navegación de Cierres ──
  const [expandHistorico, setExpandHistorico] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [cierres, setCierres] = useState<LentesCierre[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingCierres, setLoadingCierres] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [filterCierres, setFilterCierres] = useState(true);
  const [filterAjustes, setFilterAjustes] = useState(true);
  const [expandedCierreIds, setExpandedCierreIds] = useState<string[]>([]);

  const toggleRowExpanded = (id: string) => {
    setExpandedCierreIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ── Modales ──
  const [showAjustar, setShowAjustar] = useState<"adultos" | "kids" | null>(null);
  const [showCierre, setShowCierre] = useState(false);

  // ── Formulario de Ajuste Manual (PIN & Inputs) ──
  const [showAjustarPin, setShowAjustarPin] = useState<"adultos" | "kids" | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [proyeccionPin, setProyeccionPin] = useState<string | null>(null);

  const [editSucios, setEditSucios] = useState("");
  const [editChequeados, setEditChequeados] = useState("");
  const [editListos, setEditListos] = useState("");
  const [editLimpios, setEditLimpios] = useState("");
  const [ajustarError, setAjustarError] = useState("");
  const [savingAjustar, setSavingAjustar] = useState(false);

  // ── Formulario de Cierre Diario Moderno ──
  const [cierreResponsable, setCierreResponsable] = useState("");
  const [cierreFecha, setCierreFecha] = useState(() => new Date());
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // Seccion 1: Lentes entregados a porteria
  const [entregadosRows, setEntregadosRows] = useState([
    { id: 1, label: "Apertura", adultos: "", kids: "" },
    { id: 2, label: "", adultos: "", kids: "" }
  ]);

  // Seccion 2: Lentes al final del dia
  const [cierreEmbolsadosAdultos, setCierreEmbolsadosAdultos] = useState("");
  const [cierreEmbolsadosKids, setCierreEmbolsadosKids] = useState("");
  const [cierreSuciosAdultos, setCierreSuciosAdultos] = useState("");
  const [cierreSuciosKids, setCierreSuciosKids] = useState("");

  // Seccion 4: Lentes totales en el complejo y merma
  const [complejoSuciosAdultos, setComplejoSuciosAdultos] = useState("");
  const [complejoSuciosKids, setComplejoSuciosKids] = useState("");
  const [complejoLimpiosAdultos, setComplejoLimpiosAdultos] = useState("");
  const [complejoLimpiosKids, setComplejoLimpiosKids] = useState("");
  const [complejoEmbolsadosAdultos, setComplejoEmbolsadosAdultos] = useState("");
  const [complejoEmbolsadosKids, setComplejoEmbolsadosKids] = useState("");
  const [mermaAdultos, setMermaAdultos] = useState("");
  const [mermaKids, setMermaKids] = useState("");

  const [cierreError, setCierreError] = useState("");
  const [savingCierre, setSavingCierre] = useState(false);

  // ── Formulario de Nuevos Embolsados ──
  const [embolsadoResponsable, setEmbolsadoResponsable] = useState("");
  const [embolsadosAdultos, setEmbolsadosAdultos] = useState("");
  const [embolsadosKids, setEmbolsadosKids] = useState("");
  const [embolsadoError, setEmbolsadoError] = useState("");
  const [savingEmbolsado, setSavingEmbolsado] = useState(false);

  // ─── Fetch Stock ─────────────────────────────────────────────────────────────

  const initStockDoc = async (type: "adultos" | "kids") => {
    if (!cineId) return null;
    const ref = doc(db, CINES_COLLECTION, cineId, "lentes3d", type);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const defaultVal: LentesStock = {
        id: type,
        nombre: type === "adultos" ? "Adultos" : "Kids",
        sucios: 0,
        chequeados: 0,
        listos: 0,
        limpios: 0,
        ultimaActualizacion: new Date().toISOString()
      };
      await setDoc(ref, defaultVal);
      return defaultVal;
    }
    return {
      limpios: 0,
      ...snap.data()
    } as LentesStock;
  };

  const fetchStock = useCallback(async () => {
    if (!cineId) return;
    try {
      const adData = await initStockDoc("adultos");
      const kdData = await initStockDoc("kids");
      if (adData) setStockAdultos(adData);
      if (kdData) setStockKids(kdData);
    } catch (e) {
      console.error("fetchStock Lentes3D:", e);
    }
  }, [cineId]);

  useEffect(() => {
    const loadStock = async () => {
      setLoading(true);
      await fetchStock();
      setLoading(false);
    };
    loadStock();
  }, [fetchStock]);

  useEffect(() => {
    if (!cineId) return;
    const configRef = doc(db, CINES_COLLECTION, cineId, "info", "config");
    const loadPin = async () => {
      try {
        const snap = await getDoc(configRef);
        if (snap.exists()) {
          const pinVal = snap.data()?.proyeccionPin ? String(snap.data().proyeccionPin).trim() : null;
          setProyeccionPin(pinVal);
        }
      } catch (e) {
        console.error("Error fetching proyeccionPin:", e);
      }
    };
    loadPin();
  }, [cineId]);

  // ─── Fetch Cierres (Paginados y Filtrados por Mes) ────────────────────────────

  const fetchCierres = async (monthDate: Date, isLoadMore = false) => {
    if (!cineId) return;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoadingCierres(true);
    }
    try {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

      const cRef = collection(db, CINES_COLLECTION, cineId, "lentes3d_cierres");
      let q;
      if (isLoadMore && lastDoc) {
        q = query(
          cRef,
          where("fecha", ">=", startStr),
          where("fecha", "<=", endStr),
          orderBy("fecha", "desc"),
          startAfter(lastDoc),
          limit(10)
        );
      } else {
        q = query(
          cRef,
          where("fecha", ">=", startStr),
          where("fecha", "<=", endStr),
          orderBy("fecha", "desc"),
          limit(10)
        );
      }

      const snap = await getDocs(q);
      const items: LentesCierre[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any)
      }));

      // Ordenar por creadoEn desc (los más recientes a la hora real primero)
      items.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

      if (isLoadMore) {
        setCierres((prev) => {
          const combined = [...prev, ...items];
          combined.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
          return combined;
        });
      } else {
        setCierres(items);
      }

      if (snap.docs.length > 0) {
        setLastDoc(snap.docs[snap.docs.length - 1]);
      } else if (!isLoadMore) {
        setLastDoc(null);
      }
      setHasMore(snap.docs.length === 10);
    } catch (e) {
      console.error("fetchCierres error:", e);
    } finally {
      setLoadingCierres(false);
      setLoadingMore(false);
    }
  };

  const fetchMonthlyStats = async (monthDate: Date) => {
    if (!cineId) return;
    setLoadingStats(true);
    try {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

      const cRef = collection(db, CINES_COLLECTION, cineId, "lentes3d_cierres");
      const q = query(
        cRef,
        where("fecha", ">=", startStr),
        where("fecha", "<=", endStr)
      );
      const snap = await getDocs(q);

      let totalUsadosAd = 0;
      let totalUsadosKd = 0;
      let totalPerdidosAd = 0;
      let totalPerdidosKd = 0;
      let totalMermaAd = 0;
      let totalMermaKd = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.tipo === "cierre" || !data.tipo) {
          totalUsadosAd += data.adultos?.usados || 0;
          totalUsadosKd += data.kids?.usados || 0;
          totalPerdidosAd += data.adultos?.perdidos || 0;
          totalPerdidosKd += data.kids?.perdidos || 0;
          totalMermaAd += data.adultos?.merma || data.merma?.adultos || 0;
          totalMermaKd += data.kids?.merma || data.merma?.kids || 0;
        }
      });

      setMonthlyStats({
        usadosAdultos: totalUsadosAd,
        usadosKids: totalUsadosKd,
        perdidosAdultos: totalPerdidosAd,
        perdidosKids: totalPerdidosKd,
        mermaAdultos: totalMermaAd,
        mermaKids: totalMermaKd,
      });
    } catch (e) {
      console.error("fetchMonthlyStats error:", e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (cineId) {
      fetchMonthlyStats(selectedMonth);
    }
  }, [cineId, selectedMonth]);

  useEffect(() => {
    if (cineId && expandHistorico) {
      setLastDoc(null);
      fetchCierres(selectedMonth, false);
    }
  }, [cineId, selectedMonth, expandHistorico]);

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      fetchCierres(selectedMonth, true);
    }
  };

  const handlePrevMonth = () => {
    setLastDoc(null);
    setActiveMenuId(null);
    setSelectedMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setLastDoc(null);
    setActiveMenuId(null);
    setSelectedMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const formatMonthName = (date: Date) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // ─── Guardar Ajuste Manual ──────────────────────────────────────────────────

  const handleOpenAjustar = (type: "adultos" | "kids") => {
    setEnteredPin("");
    setPinError("");
    setShowAjustarPin(type);
  };

  const guardarAjuste = async () => {
    setAjustarError("");
    if (!showAjustar || !cineId) return;

    const suciosNum = parseInt(editSucios.trim());
    const chequeadosNum = parseInt(editChequeados.trim());
    const listosNum = parseInt(editListos.trim());
    const limpiosNum = parseInt(editLimpios.trim());

    if (isNaN(suciosNum) || suciosNum < 0 ||
      isNaN(chequeadosNum) || chequeadosNum < 0 ||
      isNaN(listosNum) || listosNum < 0 ||
      isNaN(limpiosNum) || limpiosNum < 0) {
      setAjustarError("Todos los campos deben ser números enteros mayores o iguales a 0.");
      return;
    }

    setSavingAjustar(true);
    try {
      await runTransaction(db, async (transaction) => {
        const refA = doc(db, CINES_COLLECTION, cineId, "lentes3d", "adultos");
        const refK = doc(db, CINES_COLLECTION, cineId, "lentes3d", "kids");

        const snapA = await transaction.get(refA);
        const snapK = await transaction.get(refK);

        if (!snapA.exists() || !snapK.exists()) {
          throw new Error("No se pudo obtener el stock actual para realizar el ajuste.");
        }

        const currentA = snapA.data() as LentesStock;
        const currentK = snapK.data() as LentesStock;

        let finalAdultos = {
          sucios: currentA.sucios,
          chequeados: currentA.chequeados,
          listos: currentA.listos,
          limpios: currentA.limpios ?? 0,
        };

        let finalKids = {
          sucios: currentK.sucios,
          chequeados: currentK.chequeados,
          listos: currentK.listos,
          limpios: currentK.limpios ?? 0,
        };

        if (showAjustar === "adultos") {
          finalAdultos = {
            sucios: suciosNum,
            chequeados: chequeadosNum,
            listos: listosNum,
            limpios: limpiosNum,
          };
          transaction.update(refA, {
            ...finalAdultos,
            ultimaActualizacion: new Date().toISOString()
          });
        } else {
          finalKids = {
            sucios: suciosNum,
            chequeados: chequeadosNum,
            listos: listosNum,
            limpios: limpiosNum,
          };
          transaction.update(refK, {
            ...finalKids,
            ultimaActualizacion: new Date().toISOString()
          });
        }

        // Guardar reporte histórico de ajuste
        const todayStr = new Date().toISOString().split("T")[0];
        const auditRef = doc(collection(db, CINES_COLLECTION, cineId, "lentes3d_cierres"));
        transaction.set(auditRef, {
          tipo: "ajuste",
          fecha: todayStr,
          creadoEn: new Date().toISOString(),
          creadoPorEmail: user?.email ?? "coordinador@cinemark.com.ar",
          creadoPorNombre: displayName || "Coordinador",
          responsable: "Ajuste Manual",
          adultos: finalAdultos,
          kids: finalKids
        });
      });

      setShowAjustar(null);
      await fetchStock();
      if (expandHistorico) {
        setLastDoc(null);
        await fetchCierres(selectedMonth, false);
      }
      showAlert("Ajuste Exitoso", "Se ha registrado el ajuste manual y generado el reporte de auditoría.");
    } catch (e: any) {
      setAjustarError(e?.message ?? "Error al actualizar.");
    } finally {
      setSavingAjustar(false);
    }
  };

  // ─── Guardar Cierre de Día ──────────────────────────────────────────────────

  const handleOpenCierre = () => {
    setCierreResponsable("");
    setCierreFecha(new Date());
    setCalendarMonth(new Date());
    setShowCalendarPicker(false);

    setEntregadosRows([
      { id: 1, label: "Apertura", adultos: "", kids: "" },
      { id: 2, label: "", adultos: "", kids: "" }
    ]);

    setCierreEmbolsadosAdultos("");
    setCierreEmbolsadosKids("");
    setCierreSuciosAdultos("");
    setCierreSuciosKids("");

    setComplejoSuciosAdultos("");
    setComplejoSuciosKids("");
    setComplejoLimpiosAdultos("");
    setComplejoLimpiosKids("");
    setComplejoEmbolsadosAdultos("");
    setComplejoEmbolsadosKids("");
    setMermaAdultos("");
    setMermaKids("");

    setCierreError("");
    setShowCierre(true);
  };

  const handleRowValueChange = (index: number, field: "adultos" | "kids", value: string) => {
    const cleanVal = value.replace(/[^0-9]/g, "");
    const updated = [...entregadosRows];
    updated[index][field] = cleanVal;

    if (index === updated.length - 1 && (updated[index].adultos.trim() !== "" || updated[index].kids.trim() !== "")) {
      updated.push({ id: Date.now(), label: "", adultos: "", kids: "" });
    } else {
      while (
        updated.length > 2 &&
        updated[updated.length - 1].adultos.trim() === "" &&
        updated[updated.length - 1].kids.trim() === "" &&
        updated[updated.length - 2].adultos.trim() === "" &&
        updated[updated.length - 2].kids.trim() === ""
      ) {
        updated.pop();
      }
    }
    setEntregadosRows(updated);
  };

  const getEntregadosTotal = (field: "adultos" | "kids") => {
    return entregadosRows.reduce((sum, row) => {
      const val = parseInt(row[field]) || 0;
      return sum + val;
    }, 0);
  };

  const renderCierreInputRow = (label: string, valueAd: string, onChangeAd: (v: string) => void, valueKd: string, onChangeKd: (v: string) => void) => {
    if (isMobile) {
      return (
        <View style={s.cierreInputsColMobile}>
          <Text style={s.rowLabel}>{label}</Text>
          <View style={s.cierreInputsRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={valueAd}
                onChangeText={onChangeAd}
                placeholder="Adultos"
                keyboardType="number-pad"
                style={s.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                value={valueKd}
                onChangeText={onChangeKd}
                placeholder="Kids"
                keyboardType="number-pad"
                style={s.input}
              />
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={s.cierreInputsRow}>
        <View style={{ flex: 1.2, justifyContent: 'center' }}>
          <Text style={s.rowLabel}>{label}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            value={valueAd}
            onChangeText={onChangeAd}
            placeholder="Adultos"
            keyboardType="number-pad"
            style={s.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            value={valueKd}
            onChangeText={onChangeKd}
            placeholder="Kids"
            keyboardType="number-pad"
            style={s.input}
          />
        </View>
      </View>
    );
  };

  const guardarCierre = async () => {
    setCierreError("");
    if (!cineId || !stockAdultos || !stockKids) return;

    if (!cierreResponsable.trim()) {
      setCierreError("Por favor ingresá el nombre del responsable del cierre.");
      return;
    }

    const parseNum = (val: string) => {
      const parsed = parseInt(val.trim());
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    };

    const eAdultos = getEntregadosTotal("adultos");
    const eKids = getEntregadosTotal("kids");

    const embAd = parseNum(cierreEmbolsadosAdultos);
    const embKd = parseNum(cierreEmbolsadosKids);
    const sucAd = parseNum(cierreSuciosAdultos);
    const sucKd = parseNum(cierreSuciosKids);

    const compSucAd = parseNum(complejoSuciosAdultos);
    const compSucKd = parseNum(complejoSuciosKids);
    const compLimAd = parseNum(complejoLimpiosAdultos);
    const compLimKd = parseNum(complejoLimpiosKids);
    const compEmbAd = parseNum(complejoEmbolsadosAdultos);
    const compEmbKd = parseNum(complejoEmbolsadosKids);

    const mermaAd = parseNum(mermaAdultos);
    const mermaKd = parseNum(mermaKids);

    const diffAd = (embAd + sucAd) - eAdultos;
    const lostAd = diffAd < 0 ? Math.abs(diffAd) : 0;

    const diffKd = (embKd + sucKd) - eKids;
    const lostKd = diffKd < 0 ? Math.abs(diffKd) : 0;

    setSavingCierre(true);
    try {
      const todayStr = cierreFecha.toISOString().split("T")[0];

      await runTransaction(db, async (transaction) => {
        const refA = doc(db, CINES_COLLECTION, cineId, "lentes3d", "adultos");
        const refK = doc(db, CINES_COLLECTION, cineId, "lentes3d", "kids");

        const snapA = await transaction.get(refA);
        const snapK = await transaction.get(refK);

        if (!snapA.exists() || !snapK.exists()) {
          throw new Error("No se pudo obtener el stock actual para realizar el cierre.");
        }

        const currentA = snapA.data() as LentesStock;
        const currentK = snapK.data() as LentesStock;

        // Actualizar stocks en base a la Seccion 4 (totales del complejo)
        // Chequeados para usar no se toca en la operacion de cierre diario, solo sucios, limpios y listos.
        transaction.update(refA, {
          sucios: compSucAd,
          listos: compEmbAd,
          limpios: compLimAd,
          ultimaActualizacion: new Date().toISOString()
        });

        transaction.update(refK, {
          sucios: compSucKd,
          listos: compEmbKd,
          limpios: compLimKd,
          ultimaActualizacion: new Date().toISOString()
        });

        const auditRef = doc(collection(db, CINES_COLLECTION, cineId, "lentes3d_cierres"));
        transaction.set(auditRef, {
          tipo: "cierre",
          fecha: todayStr,
          creadoEn: new Date().toISOString(),
          creadoPorEmail: user?.email ?? "coordinador@cinemark.com.ar",
          creadoPorNombre: displayName || "Coordinador",
          responsable: cierreResponsable.trim(),
          
          entregados: entregadosRows.filter(r => r.adultos.trim() !== "" || r.kids.trim() !== "").map(r => ({
            label: r.label || "",
            adultos: parseInt(r.adultos) || 0,
            kids: parseInt(r.kids) || 0
          })),
          finalDelDia: {
            adultos: { embolsados: embAd, sucios: sucAd },
            kids: { embolsados: embKd, sucios: sucKd }
          },
          complejo: {
            adultos: { sucios: compSucAd, limpios: compLimAd, embolsados: compEmbAd },
            kids: { sucios: compSucKd, limpios: compLimKd, embolsados: compEmbKd }
          },
          merma: {
            adultos: mermaAd,
            kids: mermaKd
          },
          
          prevStock: {
            adultos: {
              sucios: currentA.sucios,
              listos: currentA.listos,
              chequeados: currentA.chequeados,
              limpios: currentA.limpios ?? 0
            },
            kids: {
              sucios: currentK.sucios,
              listos: currentK.listos,
              chequeados: currentK.chequeados,
              limpios: currentK.limpios ?? 0
            }
          },

          adultos: {
            usados: eAdultos,
            perdidos: lostAd,
            merma: mermaAd
          },
          kids: {
            usados: eKids,
            perdidos: lostKd,
            merma: mermaKd
          }
        });
      });

      setShowCierre(false);
      await fetchStock();
      await fetchMonthlyStats(selectedMonth);
      if (expandHistorico) {
        setLastDoc(null);
        await fetchCierres(selectedMonth, false);
      }
      showAlert("Cierre Completado", "El stock de lentes 3D se ha actualizado de forma exitosa.");
    } catch (e: any) {
      setCierreError(e?.message ?? "Error al procesar el cierre de día.");
    } finally {
      setSavingCierre(false);
    }
  };

  // ─── Reversión y Eliminación de Reportes ─────────────────────────────────────

  const confirmRevertirReporte = (cierre: LentesCierre) => {
    const isEmbolsado = cierre.tipo === "embolsado";
    const title = isEmbolsado ? "Revertir Embolsado" : "Revertir Cierre";
    const msg = isEmbolsado
      ? `¿Estás seguro de que querés revertir este proceso de embolsado?\nSe devolverán los lentes a "Sucios" y se descontarán de "Listos para chequear".\n\nResponsable: ${cierre.responsable}`
      : `¿Estás seguro de que querés revertir este cierre diario?\nSe devolverán los usados y perdidos a "Listos para chequear" y se descontarán los usados de "Sucios".\n\nResponsable: ${cierre.responsable}`;

    showAlert(
      title,
      msg,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, revertir",
          style: "destructive",
          onPress: () => handleRevertir(cierre),
        },
      ]
    );
  };

  const handleRevertir = async (cierre: LentesCierre) => {
    if (!cineId) return;

    if (cierre.tipo === "ajuste") {
      showAlert("Error", "Los reportes de ajuste manual de stock no se pueden revertir.");
      return;
    }

    try {
      const isEmbolsado = cierre.tipo === "embolsado";

      await runTransaction(db, async (transaction) => {
        const refA = doc(db, CINES_COLLECTION, cineId, "lentes3d", "adultos");
        const refK = doc(db, CINES_COLLECTION, cineId, "lentes3d", "kids");

        const snapA = await transaction.get(refA);
        const snapK = await transaction.get(refK);

        if (!snapA.exists() || !snapK.exists()) {
          throw new Error("No se pudo obtener el stock actual para realizar la reversión.");
        }

        const currentA = snapA.data() as LentesStock;
        const currentK = snapK.data() as LentesStock;

        let suciosFinalA = currentA.sucios;
        let listosFinalA = currentA.listos;
        let chequeadosFinalA = currentA.chequeados;
        let limpiosFinalA = currentA.limpios ?? 0;

        let suciosFinalK = currentK.sucios;
        let listosFinalK = currentK.listos;
        let chequeadosFinalK = currentK.chequeados;
        let limpiosFinalK = currentK.limpios ?? 0;

        if (isEmbolsado) {
          const eA = cierre.adultos?.embolsados || 0;
          const eK = cierre.kids?.embolsados || 0;

          if (currentA.listos < eA) {
            throw new Error(`Adultos: No hay suficiente stock en "Listos para chequear" (${currentA.listos}) para descontar los ${eA} embolsados.`);
          }
          if (currentK.listos < eK) {
            throw new Error(`Kids: No hay suficiente stock en "Listos para chequear" (${currentK.listos}) para descontar los ${eK} embolsados.`);
          }

          suciosFinalA = currentA.sucios + eA;
          listosFinalA = currentA.listos - eA;

          suciosFinalK = currentK.sucios + eK;
          listosFinalK = currentK.listos - eK;
        } else if (cierre.prevStock) {
          suciosFinalA = cierre.prevStock.adultos.sucios;
          listosFinalA = cierre.prevStock.adultos.listos;
          chequeadosFinalA = cierre.prevStock.adultos.chequeados;
          limpiosFinalA = cierre.prevStock.adultos.limpios ?? 0;

          suciosFinalK = cierre.prevStock.kids.sucios;
          listosFinalK = cierre.prevStock.kids.listos;
          chequeadosFinalK = cierre.prevStock.kids.chequeados;
          limpiosFinalK = cierre.prevStock.kids.limpios ?? 0;
        } else {
          const uA = cierre.adultos?.usados || 0;
          const pA = cierre.adultos?.perdidos || 0;

          const uK = cierre.kids?.usados || 0;
          const pK = cierre.kids?.perdidos || 0;

          if (currentA.sucios < uA) {
            throw new Error(`Adultos: No hay suficiente stock en "Sucios" (${currentA.sucios}) para descontar los ${uA} usados.`);
          }
          if (currentK.sucios < uK) {
            throw new Error(`Kids: No hay suficiente stock en "Sucios" (${currentK.sucios}) para descontar los ${uK} usados.`);
          }

          suciosFinalA = currentA.sucios - uA;
          listosFinalA = currentA.listos + uA + pA;

          suciosFinalK = currentK.sucios - uK;
          listosFinalK = currentK.listos + uK + pK;
        }

        transaction.update(refA, {
          sucios: suciosFinalA,
          listos: listosFinalA,
          chequeados: chequeadosFinalA,
          limpios: limpiosFinalA,
          ultimaActualizacion: new Date().toISOString(),
        });

        transaction.update(refK, {
          sucios: suciosFinalK,
          listos: listosFinalK,
          chequeados: chequeadosFinalK,
          limpios: limpiosFinalK,
          ultimaActualizacion: new Date().toISOString(),
        });

        const docRef = doc(db, CINES_COLLECTION, cineId, "lentes3d_cierres", cierre.id);
        transaction.delete(docRef);
      });

      // Refrescar stocks, estadísticas y listado de cierres
      await fetchStock();
      await fetchMonthlyStats(selectedMonth);
      setLastDoc(null);
      await fetchCierres(selectedMonth, false);

      showAlert("Reporte Revertido", "El reporte ha sido revertido e indexado de forma exitosa.");
    } catch (e: any) {
      showAlert("Error de Reversión", e?.message ?? "No se pudo revertir el reporte.");
    }
  };

  // ─── Helpers de Previsualización Dinámica ────────────────────────────────────

  const renderPreview = (current: LentesStock | null, usadosInput: string, perdidosInput: string) => {
    if (!current) return null;
    const u = usadosInput.trim() !== "" ? parseInt(usadosInput.trim()) : 0;
    const p = perdidosInput.trim() !== "" ? parseInt(perdidosInput.trim()) : 0;

    if (isNaN(u) || isNaN(p) || u < 0 || p < 0) return null;

    const listosFinal = current.listos - u - p;
    const suciosFinal = current.sucios + u;

    return (
      <View style={s.previewWrap}>
        <Text style={s.previewTitle}>🔮 Previsualización de cambios ({current.nombre}):</Text>
        <Text style={s.previewText}>
          • Listos p/ chequear: {current.listos} → <Text style={{ fontWeight: "700", color: listosFinal < 0 ? "#DC2626" : "#C2410C" }}>{listosFinal}</Text>
        </Text>
        <Text style={s.previewText}>
          • Sucios: {current.sucios} → <Text style={{ fontWeight: "700", color: "#0369A1" }}>{suciosFinal}</Text>
        </Text>
      </View>
    );
  };

  const renderEmbolsadoPreview = (current: LentesStock | null, embolsadosInput: string) => {
    if (!current) return null;
    const e = embolsadosInput.trim() !== "" ? parseInt(embolsadosInput.trim()) : 0;

    if (isNaN(e) || e < 0) return null;

    const suciosFinal = current.sucios - e;
    const listosFinal = current.listos + e;

    return (
      <View style={s.previewWrap}>
        <Text style={s.previewTitle}>🔮 Previsualización de cambios ({current.nombre}):</Text>
        <Text style={s.previewText}>
          • Sucios: {current.sucios} → <Text style={{ fontWeight: "700", color: suciosFinal < 0 ? "#DC2626" : "#0369A1" }}>{suciosFinal}</Text>
        </Text>
        <Text style={s.previewText}>
          • Listos para chequear: {current.listos} → <Text style={{ fontWeight: "700", color: "#C2410C" }}>{listosFinal}</Text>
        </Text>
      </View>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Cargando stock de lentes 3D…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.headerRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={s.pageTitle}>🕶️ Lentes 3D</Text>
            <Text style={s.pageSubtitle}>Inventario de lentes adultos y niños por estado</Text>
          </View>
          <View style={s.headerButtons}>
            <TouchableOpacity style={s.cierreBtn} onPress={handleOpenCierre}>
              <Text style={s.cierreBtnText}>📝 Cierre del día</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Aviso */}
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>💡 Cierre del Día y Dinámica de Proceso</Text>
          <Text style={s.noticeText}>
            Para realizar el cierre del día de los lentes 3D, hacé click en <Text style={{ fontWeight: "700" }}>"📝 Cierre del día"</Text>. Deberás indicar los lentes entregados a portería, los recolectados al final del día, la merma diaria, y los lentes totales en el complejo (Sucios, Limpios y Embolsados).{"\n"}
            <Text style={{ fontWeight: "700" }}>⚠️ IMPORTANTE:</Text> En el conteo de <Text style={{ fontWeight: "700" }}>"Embolsados"</Text> en el complejo <Text style={{ fontWeight: "700" }}>NO</Text> se deben incluir los lentes <Text style={{ fontWeight: "700" }}>"Chequeados para usar"</Text> (Verde), ya que estos últimos solo pueden ser modificados de forma manual mediante el botón de <Text style={{ fontWeight: "700" }}>"Ajustar Stock"</Text> con PIN de seguridad.
          </Text>
        </View>

        {/* Cards de Adultos y Kids */}
        <View style={s.cardsGrid}>
          {[stockAdultos, stockKids].map((item) => {
            if (!item) return null;
            return (
              <View key={item.id} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>🕶️ Lentes {item.nombre}</Text>
                  <TouchableOpacity
                    style={s.ajusteLink}
                    onPress={() => handleOpenAjustar(item.id)}
                  >
                    <Text style={s.ajusteLinkText}>⚙️ Ajustar Stock</Text>
                  </TouchableOpacity>
                </View>

                {/* Lista de Estados */}
                <View style={s.stateList}>
                  {/* Sucios */}
                  <View style={[s.stateItem, s.stateBlue]}>
                    <View style={s.stateLabelRow}>
                      <Text style={s.stateLabel}>Sucios</Text>
                    </View>
                    <Text style={s.stateValueBlue}>{item.sucios.toLocaleString("es-AR")}</Text>
                  </View>

                  {/* Limpios */}
                  <View style={[s.stateItem, s.stateTeal]}>
                    <View style={s.stateLabelRow}>
                      <Text style={s.stateLabel}>Limpios</Text>
                    </View>
                    <Text style={s.stateValueTeal}>{(item.limpios ?? 0).toLocaleString("es-AR")}</Text>
                  </View>

                  {/* Listos para chequear */}
                  <View style={[s.stateItem, s.stateOrange]}>
                    <View style={s.stateLabelRow}>
                      <Text style={s.stateLabel}>Listos para chequear</Text>
                    </View>
                    <Text style={s.stateValueOrange}>{item.listos.toLocaleString("es-AR")}</Text>
                  </View>

                  {/* Chequeados para usar */}
                  <View style={[s.stateItem, s.stateGreen]}>
                    <View style={s.stateLabelRow}>
                      <Text style={s.stateLabel}>Chequeados para usar</Text>
                    </View>
                    <Text style={s.stateValueGreen}>{item.chequeados.toLocaleString("es-AR")}</Text>
                  </View>
                </View>

                {/* Total */}
                <View style={s.cardTotalRow}>
                  <Text style={s.totalText}>TOTAL ACUMULADO</Text>
                  <Text style={s.totalValue}>{(item.sucios + item.chequeados + item.listos + (item.limpios ?? 0)).toLocaleString("es-AR")} U</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Estadísticas del Mes */}
        <View style={s.statsCard}>
          <View style={s.statsHeaderRow}>
            <Text style={s.statsTitle}>📊 Estadísticas del Mes</Text>
            <View style={s.statsMonthNav}>
              <TouchableOpacity onPress={handlePrevMonth} style={s.statsMonthNavBtn}>
                <Text style={s.statsMonthNavBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={s.statsMonthNavTitle}>{formatMonthName(selectedMonth)}</Text>
              <TouchableOpacity onPress={handleNextMonth} style={s.statsMonthNavBtn}>
                <Text style={s.statsMonthNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>
          {loadingStats ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
          ) : monthlyStats ? (
            <View style={s.statsGrid}>
              <View style={s.statBox}>
                <Text style={s.statIcon}>🕶️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.statLabel}>Usados</Text>
                  <Text style={s.statValue}>{(monthlyStats.usadosAdultos + monthlyStats.usadosKids).toLocaleString("es-AR")}</Text>
                  <Text style={s.statSubText}>Ad: {monthlyStats.usadosAdultos} | Kd: {monthlyStats.usadosKids}</Text>
                </View>
              </View>
              <View style={s.statBox}>
                <Text style={s.statIcon}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.statLabel}>Perdidos</Text>
                  <Text style={s.statValue}>{(monthlyStats.perdidosAdultos + monthlyStats.perdidosKids).toLocaleString("es-AR")}</Text>
                  <Text style={s.statSubText}>Ad: {monthlyStats.perdidosAdultos} | Kd: {monthlyStats.perdidosKids}</Text>
                </View>
              </View>
              <View style={s.statBox}>
                <Text style={s.statIcon}>🧺</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.statLabel}>Merma</Text>
                  <Text style={s.statValue}>{(monthlyStats.mermaAdultos + monthlyStats.mermaKids).toLocaleString("es-AR")}</Text>
                  <Text style={s.statSubText}>Ad: {monthlyStats.mermaAdultos} | Kd: {monthlyStats.mermaKids}</Text>
                </View>
              </View>
              <View style={[s.statBox, s.statBoxHighlight]}>
                <Text style={s.statIcon}>📉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.statLabel}>Pérdida %</Text>
                  {(() => {
                    const totalUsados = monthlyStats.usadosAdultos + monthlyStats.usadosKids;
                    const totalPerdidos = monthlyStats.perdidosAdultos + monthlyStats.perdidosKids;
                    const totalMerma = monthlyStats.mermaAdultos + monthlyStats.mermaKids;
                    const totalLoss = totalPerdidos + totalMerma;
                    const pct = totalUsados > 0 ? (totalLoss / totalUsados) * 100 : 0;
                    return (
                      <>
                        <Text style={[s.statValue, { color: pct > 5 ? "#DC2626" : "#0F172A" }]}>
                          {pct.toFixed(1)}%
                        </Text>
                        <Text style={s.statSubText}>Total pérdida: {totalLoss}</Text>
                      </>
                    );
                  })()}
                </View>
              </View>
            </View>
          ) : (
            <Text style={s.noStatsText}>No hay datos estadísticos para este mes.</Text>
          )}
        </View>

        {/* Historial de cierres de auditoría */}
        <View style={s.historicoCard}>
          <TouchableOpacity
            style={s.historicoToggle}
            onPress={() => setExpandHistorico(!expandHistorico)}
            activeOpacity={0.8}
          >
            <Text style={s.historicoTitle}>📜 Historial de Cierres y Ajustes</Text>
            <Text style={s.historicoChevron}>{expandHistorico ? "▼" : "▶"}</Text>
          </TouchableOpacity>

          {expandHistorico && (
            <View style={s.historicoContent}>
              {/* Filtros de Tipo */}
              <View style={s.filterRow}>
                <Text style={s.filterLabel}>Filtrar por tipo:</Text>
                
                <TouchableOpacity
                  style={[s.filterCheckbox, filterCierres && s.filterCheckboxActive]}
                  onPress={() => setFilterCierres(!filterCierres)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.filterCheckboxText, filterCierres && s.filterCheckboxTextActive]}>
                    {filterCierres ? "✓ Cierres" : "Cierres"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.filterCheckbox, filterAjustes && s.filterCheckboxActive]}
                  onPress={() => setFilterAjustes(!filterAjustes)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.filterCheckboxText, filterAjustes && s.filterCheckboxTextActive]}>
                    {filterAjustes ? "✓ Ajustes" : "Ajustes"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Navegador de Mes */}
              <View style={s.monthNavRow}>
                <TouchableOpacity onPress={handlePrevMonth} style={s.monthNavBtn}>
                  <Text style={s.monthNavBtnText}>◀</Text>
                </TouchableOpacity>
                <Text style={s.monthNavTitle}>{formatMonthName(selectedMonth)}</Text>
                <TouchableOpacity onPress={handleNextMonth} style={s.monthNavBtn}>
                  <Text style={s.monthNavBtnText}>▶</Text>
                </TouchableOpacity>
              </View>

              {loadingCierres ? (
                <View style={{ paddingVertical: 20 }}>
                  <ActivityIndicator color={COLORS.primary} size="small" />
                </View>
              ) : (() => {
                const filteredCierres = cierres.filter((c) => {
                  if (c.tipo === "ajuste") return filterAjustes;
                  return filterCierres;
                });

                if (filteredCierres.length === 0) {
                  return <Text style={s.noHistoryText}>No hay registros para este mes con los filtros seleccionados.</Text>;
                }

                return (
                  <View style={{ gap: 12 }}>
                  {filteredCierres.map((c) => {
                    const dateParts = c.creadoEn ? new Date(c.creadoEn) : new Date();
                    const formattedTime = dateParts.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
                    const [y, m, d] = c.fecha.split("-");
                    const formattedDate = `${d}/${m}/${y}`;
                    const isEmbolsado = c.tipo === "embolsado";
                    const isAjuste = c.tipo === "ajuste";

                    const isExpanded = expandedCierreIds.includes(c.id);
                    const diffAd = c.complejo ? (((c.finalDelDia?.adultos?.embolsados || 0) + (c.finalDelDia?.adultos?.sucios || 0)) - (c.adultos.usados || 0)) : null;
                    const diffKd = c.complejo ? (((c.finalDelDia?.kids?.embolsados || 0) + (c.finalDelDia?.kids?.sucios || 0)) - (c.kids.usados || 0)) : null;

                    return (
                      <View key={c.id} style={[s.historyRow, activeMenuId === c.id && { zIndex: 999, elevation: 5 }]}>
                        <TouchableOpacity
                          style={s.historyRowHeaderButton}
                          onPress={() => toggleRowExpanded(c.id)}
                          activeOpacity={0.7}
                        >
                          <View style={s.historyHeader}>
                            <View style={{ flex: 1 }}>
                              {/* Tipo y Chevron */}
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <View style={[s.badge, isAjuste ? s.badgeAmber : isEmbolsado ? s.badgeBlue : s.badgeIndigo]}>
                                  <Text style={[s.badgeText, isAjuste ? s.badgeTextAmber : isEmbolsado ? s.badgeTextBlue : s.badgeTextIndigo]}>
                                    {isAjuste ? "⚙️ Ajuste" : isEmbolsado ? "🧺 Embolsado" : "📝 Cierre"}
                                  </Text>
                                </View>
                                <Text style={s.expandChevron}>{isExpanded ? "▲ Contraer" : "▼ Expandir"}</Text>
                              </View>

                              {/* Título: Cierre del DD/MM/YYYY */}
                              <Text style={s.historyRowTitleText}>
                                {isAjuste ? "Ajuste" : isEmbolsado ? "Embolsado" : "Cierre"} del <Text style={{ fontWeight: "700" }}>{formattedDate}</Text>
                              </Text>

                              {/* Hecho por */}
                              <Text style={s.historyRowAuthorText}>
                                hecho por <Text style={{ fontWeight: "700", color: "#475569" }}>{c.responsable || c.creadoPorNombre}</Text>
                              </Text>

                              {/* Cuadrados de Diferencia (solo para cierres) */}
                              {c.complejo && diffAd !== null && diffKd !== null && (
                                <View style={s.headerDiffsContainer}>
                                  <View style={[s.headerDiffBox, diffAd < 0 ? s.headerDiffBoxNeg : s.headerDiffBoxPos]}>
                                    <Text style={s.headerDiffLabel}>Adultos</Text>
                                    <Text style={[s.headerDiffVal, { color: diffAd < 0 ? "#DC2626" : "#16A34A" }]}>
                                      {diffAd > 0 ? `+${diffAd}` : diffAd}
                                    </Text>
                                  </View>
                                  <View style={[s.headerDiffBox, diffKd < 0 ? s.headerDiffBoxNeg : s.headerDiffBoxPos]}>
                                    <Text style={s.headerDiffLabel}>Kids</Text>
                                    <Text style={[s.headerDiffVal, { color: diffKd < 0 ? "#DC2626" : "#16A34A" }]}>
                                      {diffKd > 0 ? `+${diffKd}` : diffKd}
                                    </Text>
                                  </View>
                                </View>
                              )}
                            </View>

                            {/* Tres puntitos menu */}
                            {!isAjuste && (
                              <View style={s.menuContainer}>
                                <TouchableOpacity
                                  style={s.menuBtn}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === c.id ? null : c.id);
                                  }}
                                >
                                  <Text style={s.menuBtnText}>⋮</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={s.historyDataBlock}>
                            <View style={s.historyCol}>
                              <Text style={s.historyColTitle}>🕶️ Adultos</Text>
                              {isAjuste ? (
                                <>
                                  <Text style={s.historyColText}>• Sucios: <Text style={{ fontWeight: "700", color: "#0369A1" }}>{c.adultos.sucios ?? 0}</Text></Text>
                                  <Text style={s.historyColText}>• Listos: <Text style={{ fontWeight: "700", color: "#C2410C" }}>{c.adultos.listos ?? 0}</Text></Text>
                                  <Text style={s.historyColText}>• Limpios: <Text style={{ fontWeight: "700", color: "#0D9488" }}>{c.adultos.limpios ?? 0}</Text></Text>
                                  <Text style={s.historyColText}>• Chequeados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.adultos.chequeados ?? 0}</Text></Text>
                                </>
                              ) : isEmbolsado ? (
                                <Text style={s.historyColText}>• Embolsados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.adultos.embolsados || 0}</Text></Text>
                              ) : c.complejo ? (
                                <>
                                  <Text style={s.historyColText}>• Entregados: <Text style={{ fontWeight: "700" }}>{c.adultos.usados || 0}</Text></Text>
                                  <Text style={s.historyColText}>• Fin de Día: <Text style={{ fontWeight: "700" }}>{(c.finalDelDia?.adultos?.embolsados || 0) + (c.finalDelDia?.adultos?.sucios || 0)}</Text> (Embolsados: {c.finalDelDia?.adultos?.embolsados || 0}, Sucios: {c.finalDelDia?.adultos?.sucios || 0})</Text>
                                  {(() => {
                                    const diff = ((c.finalDelDia?.adultos?.embolsados || 0) + (c.finalDelDia?.adultos?.sucios || 0)) - (c.adultos.usados || 0);
                                    return (
                                      <Text style={s.historyColText}>
                                        • Diferencia: <Text style={{ fontWeight: "700", color: diff < 0 ? "#DC2626" : "#16A34A" }}>{diff > 0 ? `+${diff}` : diff}</Text>
                                      </Text>
                                    );
                                  })()}
                                  <Text style={s.historyColText}>• En Complejo: Sucios: {c.complejo?.adultos?.sucios || 0} | Limpios: {c.complejo?.adultos?.limpios || 0} | Embolsados: {c.complejo?.adultos?.embolsados || 0}</Text>
                                  <Text style={s.historyColText}>• Merma: <Text style={{ fontWeight: "700", color: "#DC2626" }}>{c.merma?.adultos || c.adultos.merma || 0}</Text></Text>
                                </>
                              ) : (
                                <>
                                  <Text style={s.historyColText}>• Usados: <Text style={{ fontWeight: "700" }}>{c.adultos.usados || 0}</Text></Text>
                                  {c.adultos.perdidos !== undefined && (
                                    <Text style={s.historyColText}>• Perdidos: <Text style={{ fontWeight: "700", color: "#DC2626" }}>{c.adultos.perdidos}</Text></Text>
                                  )}
                                  {c.adultos.embolsados !== undefined && c.adultos.embolsados > 0 && (
                                    <Text style={s.historyColText}>• Embolsados (Ant.): <Text style={{ fontWeight: "700", color: "#0369A1" }}>{c.adultos.embolsados}</Text></Text>
                                  )}
                                </>
                              )}
                            </View>
                            <View style={s.historyCol}>
                              <Text style={s.historyColTitle}>🕶️ Kids</Text>
                              {isAjuste ? (
                                <>
                                  <Text style={s.historyColText}>• Sucios: <Text style={{ fontWeight: "700", color: "#0369A1" }}>{c.kids.sucios ?? 0}</Text></Text>
                                  <Text style={s.historyColText}>• Listos: <Text style={{ fontWeight: "700", color: "#C2410C" }}>{c.kids.listos ?? 0}</Text></Text>
                                  <Text style={s.historyColText}>• Limpios: <Text style={{ fontWeight: "700", color: "#0D9488" }}>{c.kids.limpios ?? 0}</Text></Text>
                                  <Text style={s.historyColText}>• Chequeados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.kids.chequeados ?? 0}</Text></Text>
                                </>
                              ) : isEmbolsado ? (
                                <Text style={s.historyColText}>• Embolsados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.kids.embolsados || 0}</Text></Text>
                              ) : c.complejo ? (
                                <>
                                  <Text style={s.historyColText}>• Entregados: <Text style={{ fontWeight: "700" }}>{c.kids.usados || 0}</Text></Text>
                                  <Text style={s.historyColText}>• Fin de Día: <Text style={{ fontWeight: "700" }}>{(c.finalDelDia?.kids?.embolsados || 0) + (c.finalDelDia?.kids?.sucios || 0)}</Text> (Embolsados: {c.finalDelDia?.kids?.embolsados || 0}, Sucios: {c.finalDelDia?.kids?.sucios || 0})</Text>
                                  {(() => {
                                    const diff = ((c.finalDelDia?.kids?.embolsados || 0) + (c.finalDelDia?.kids?.sucios || 0)) - (c.kids.usados || 0);
                                    return (
                                      <Text style={s.historyColText}>
                                        • Diferencia: <Text style={{ fontWeight: "700", color: diff < 0 ? "#DC2626" : "#16A34A" }}>{diff > 0 ? `+${diff}` : diff}</Text>
                                      </Text>
                                    );
                                  })()}
                                  <Text style={s.historyColText}>• En Complejo: Sucios: {c.complejo?.kids?.sucios || 0} | Limpios: {c.complejo?.kids?.limpios || 0} | Embolsados: {c.complejo?.kids?.embolsados || 0}</Text>
                                  <Text style={s.historyColText}>• Merma: <Text style={{ fontWeight: "700", color: "#DC2626" }}>{c.merma?.kids || c.kids.merma || 0}</Text></Text>
                                </>
                              ) : (
                                <>
                                  <Text style={s.historyColText}>• Usados: <Text style={{ fontWeight: "700" }}>{c.kids.usados || 0}</Text></Text>
                                  {c.kids.perdidos !== undefined && (
                                    <Text style={s.historyColText}>• Perdidos: <Text style={{ fontWeight: "700", color: "#DC2626" }}>{c.kids.perdidos}</Text></Text>
                                  )}
                                  {c.kids.embolsados !== undefined && c.kids.embolsados > 0 && (
                                    <Text style={s.historyColText}>• Embolsados (Ant.): <Text style={{ fontWeight: "700", color: "#0369A1" }}>{c.kids.embolsados}</Text></Text>
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                        )}

                        {/* Menu Popover absoluto al nivel de historyRow para evitar recortes de hit box */}
                        {activeMenuId === c.id && !isAjuste && (
                          <View style={s.menuPopover}>
                            <TouchableOpacity
                              style={s.menuItem}
                              onPress={() => {
                                setActiveMenuId(null);
                                confirmRevertirReporte(c);
                              }}
                            >
                              <Text style={s.menuItemText}>↩ Revertir reporte</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Botón Cargar más */}
                  {hasMore && (
                    <TouchableOpacity
                      style={s.loadMoreBtn}
                      onPress={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <ActivityIndicator color="#0369A1" size="small" />
                      ) : (
                        <Text style={s.loadMoreBtnText}>Cargar más cierres</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal PIN de Ajuste ── */}
      <Modal
        visible={showAjustarPin !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAjustarPin(null)}
      >
        <View style={[s.backdrop, isMobile && { padding: 12 }]}>
          <View style={[s.modalCard, isMobile && { padding: 16 }]}>
            <Text style={s.modalTitle}>PIN de Seguridad</Text>
            <Text style={s.modalSubtitle}>Se requiere el PIN de Proyección para ajustar el stock.</Text>

            <TextInput
              value={enteredPin}
              onChangeText={setEnteredPin}
              placeholder="Ingresá el PIN"
              secureTextEntry
              keyboardType="number-pad"
              style={s.input}
            />

            {!!pinError && <Text style={s.errorText}>{pinError}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setShowAjustarPin(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => {
                  if (!proyeccionPin) {
                    setPinError("No hay un PIN de proyección configurado en el cine.");
                    return;
                  }
                  if (enteredPin.trim() === proyeccionPin) {
                    const target = showAjustarPin;
                    setShowAjustarPin(null);
                    if (target) {
                      const current = target === "adultos" ? stockAdultos : stockKids;
                      if (current) {
                        setEditSucios(String(current.sucios));
                        setEditChequeados(String(current.chequeados));
                        setEditListos(String(current.listos));
                        setEditLimpios(String(current.limpios ?? 0));
                        setAjustarError("");
                        setShowAjustar(target);
                      }
                    }
                  } else {
                    setPinError("PIN incorrecto.");
                  }
                }}
              >
                <Text style={s.btnPrimaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Ajuste Manual ── */}
      <Modal
        visible={showAjustar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAjustar(null)}
      >
        <View style={[s.backdrop, isMobile && { padding: 12 }]}>
          <View style={[s.modalCard, isMobile && { padding: 16 }]}>
            <Text style={s.modalTitle}>Ajustar Stock de Lentes</Text>
            <Text style={s.modalSubtitle}>{showAjustar === "adultos" ? "Categoría Adultos" : "Categoría Kids"}</Text>

            <Text style={s.label}>Sucios (Azul)</Text>
            <TextInput
              value={editSucios}
              onChangeText={setEditSucios}
              keyboardType="number-pad"
              style={s.input}
            />

            <Text style={s.label}>Listos para chequear (Naranja)</Text>
            <TextInput
              value={editListos}
              onChangeText={setEditListos}
              keyboardType="number-pad"
              style={s.input}
            />

            <Text style={s.label}>Limpios (Teal)</Text>
            <TextInput
              value={editLimpios}
              onChangeText={setEditLimpios}
              keyboardType="number-pad"
              style={s.input}
            />

            <Text style={s.label}>Chequeados para usar (Verde)</Text>
            <TextInput
              value={editChequeados}
              onChangeText={setEditChequeados}
              keyboardType="number-pad"
              style={s.input}
            />

            {!!ajustarError && <Text style={s.errorText}>{ajustarError}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setShowAjustar(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={guardarAjuste} disabled={savingAjustar}>
                {savingAjustar ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.btnPrimaryText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Cierre Diario ── */}
      <Modal
        visible={showCierre}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCierre(false)}
      >
        <View style={[s.backdrop, isMobile && { padding: 12 }]}>
          <ScrollView style={s.modalScroll} contentContainerStyle={s.modalScrollCenter} keyboardShouldPersistTaps="handled">
            <View style={[s.modalCardLg, isMobile && { padding: 16 }]}>
              <Text style={s.modalTitle}>Cierre de Día - Lentes 3D</Text>
              <Text style={s.modalSubtitleLg}>Modifica los stocks en base a la función y pérdidas del día</Text>

              {/* Responsable Input */}
              <View style={s.responsableContainer}>
                <Text style={s.label}>Responsable del Cierre *</Text>
                <TextInput
                  value={cierreResponsable}
                  onChangeText={setCierreResponsable}
                  placeholder="Nombre y apellido"
                  placeholderTextColor="#64748B"
                  style={[s.input, { backgroundColor: "#F1F5F9" }]}
                />
              </View>

              {/* Calendario de Selección de Fecha */}
              <View style={s.responsableContainer}>
                <Text style={s.label}>Fecha del Cierre</Text>
                <TouchableOpacity
                  style={s.dateTrigger}
                  onPress={() => setShowCalendarPicker(!showCalendarPicker)}
                >
                  <Text style={s.dateTriggerText}>
                    📅 {cierreFecha.getDate()}/{cierreFecha.getMonth() + 1}/{cierreFecha.getFullYear()} (Hacé click para cambiar)
                  </Text>
                </TouchableOpacity>

                {showCalendarPicker && (
                  <View style={s.calendarEmbed}>
                    <View style={s.calendarHeader}>
                      <TouchableOpacity
                        onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                        style={s.calendarNavBtn}
                      >
                        <Text style={s.calendarNavBtnText}>◀</Text>
                      </TouchableOpacity>
                      <Text style={s.calendarMonthTitle}>
                        {formatMonthName(calendarMonth)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                        style={s.calendarNavBtn}
                      >
                        <Text style={s.calendarNavBtnText}>▶</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={s.calendarWeekdays}>
                      {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"].map((wd) => (
                        <Text key={wd} style={s.calendarWeekdayText}>{wd}</Text>
                      ))}
                    </View>

                    <View style={s.calendarGrid}>
                      {(() => {
                        const yr = calendarMonth.getFullYear();
                        const mt = calendarMonth.getMonth();
                        const daysInMt = getDaysInMonth(yr, mt);
                        const startDay = getFirstDayOfMonth(yr, mt);

                        const gridItems = [];
                        for (let i = 0; i < startDay; i++) {
                          gridItems.push(<View key={`empty-${i}`} style={s.calendarDayBoxEmpty} />);
                        }

                        for (let d = 1; d <= daysInMt; d++) {
                          const thisDate = new Date(yr, mt, d);
                          const isSelected = thisDate.getDate() === cierreFecha.getDate() &&
                                             thisDate.getMonth() === cierreFecha.getMonth() &&
                                             thisDate.getFullYear() === cierreFecha.getFullYear();
                          const isToday = (() => {
                            const today = new Date();
                            return thisDate.getDate() === today.getDate() &&
                                   thisDate.getMonth() === today.getMonth() &&
                                   thisDate.getFullYear() === today.getFullYear();
                          })();

                          gridItems.push(
                            <TouchableOpacity
                              key={`day-${d}`}
                              style={[
                                s.calendarDayBox,
                                isSelected && s.calendarDaySelected,
                                isToday && !isSelected && s.calendarDayToday
                              ]}
                              onPress={() => {
                                setCierreFecha(thisDate);
                                setShowCalendarPicker(false);
                              }}
                            >
                              <Text style={[
                                s.calendarDayText,
                                isSelected && s.calendarDayTextSelected,
                                isToday && !isSelected && s.calendarDayTextToday
                              ]}>
                                {d}
                              </Text>
                            </TouchableOpacity>
                          );
                        }
                        return gridItems;
                      })()}
                    </View>
                  </View>
                )}
              </View>

              {/* Seccion 1: Lentes entregados a porteria */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>1. Lentes entregados a portería</Text>
                
                {entregadosRows.map((row, idx) => 
                  renderCierreInputRow(
                    idx === 0 ? "Apertura" : `Entrega #${idx + 1}`,
                    row.adultos,
                    (val) => handleRowValueChange(idx, "adultos", val),
                    row.kids,
                    (val) => handleRowValueChange(idx, "kids", val)
                  )
                )}

                <View style={s.sectionTotalRow}>
                  <Text style={s.sectionTotalLabel}>Total entregados:</Text>
                  <Text style={s.sectionTotalValue}>
                    Adultos: {getEntregadosTotal("adultos")} | Kids: {getEntregadosTotal("kids")}
                  </Text>
                </View>
              </View>

              {/* Seccion 2: Lentes al final del dia */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>2. Lentes al final del día</Text>

                {renderCierreInputRow("Embolsados", cierreEmbolsadosAdultos, setCierreEmbolsadosAdultos, cierreEmbolsadosKids, setCierreEmbolsadosKids)}
                {renderCierreInputRow("Sucios", cierreSuciosAdultos, setCierreSuciosAdultos, cierreSuciosKids, setCierreSuciosKids)}

                <View style={s.sectionTotalRow}>
                  <Text style={s.sectionTotalLabel}>Total final del día:</Text>
                  <Text style={s.sectionTotalValue}>
                    Adultos: {(parseInt(cierreEmbolsadosAdultos) || 0) + (parseInt(cierreSuciosAdultos) || 0)} | Kids: {(parseInt(cierreEmbolsadosKids) || 0) + (parseInt(cierreSuciosKids) || 0)}
                  </Text>
                </View>
              </View>

              {/* Seccion 3: Diferencias */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>3. Diferencias (Fin de Día vs Entregados)</Text>
                {(() => {
                  const totAdEnt = getEntregadosTotal("adultos");
                  const totAdFin = (parseInt(cierreEmbolsadosAdultos) || 0) + (parseInt(cierreSuciosAdultos) || 0);
                  const diffAd = totAdFin - totAdEnt;

                  const totKdEnt = getEntregadosTotal("kids");
                  const totKdFin = (parseInt(cierreEmbolsadosKids) || 0) + (parseInt(cierreSuciosKids) || 0);
                  const diffKd = totKdFin - totKdEnt;

                  return (
                    <View style={s.diffContainer}>
                      <View style={s.diffItem}>
                        <Text style={s.diffItemLabel}>Diferencia Adultos:</Text>
                        <Text style={[s.diffValue, { color: diffAd < 0 ? COLORS.danger : "#16A34A" }]}>
                          {diffAd > 0 ? `+${diffAd}` : diffAd}
                        </Text>
                      </View>
                      <View style={s.diffItem}>
                        <Text style={s.diffItemLabel}>Diferencia Kids:</Text>
                        <Text style={[s.diffValue, { color: diffKd < 0 ? COLORS.danger : "#16A34A" }]}>
                          {diffKd > 0 ? `+${diffKd}` : diffKd}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>

              {/* Seccion 4: Lentes totales en el complejo */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>4. Lentes totales en el complejo</Text>

                {renderCierreInputRow("Sucios", complejoSuciosAdultos, setComplejoSuciosAdultos, complejoSuciosKids, setComplejoSuciosKids)}
                {renderCierreInputRow("Limpios", complejoLimpiosAdultos, setComplejoLimpiosAdultos, complejoLimpiosKids, setComplejoLimpiosKids)}
                {renderCierreInputRow("Embolsados", complejoEmbolsadosAdultos, setComplejoEmbolsadosAdultos, complejoEmbolsadosKids, setComplejoEmbolsadosKids)}
              </View>

              {/* Merma diaria */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>Merma diaria</Text>

                {renderCierreInputRow("Merma", mermaAdultos, setMermaAdultos, mermaKids, setMermaKids)}
              </View>

              {/* Error */}
              {!!cierreError && <Text style={s.errorText}>{cierreError}</Text>}

              <View style={s.modalActions}>
                <TouchableOpacity style={s.btnGhost} onPress={() => setShowCierre(false)}>
                  <Text style={s.btnGhostText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnPrimary} onPress={guardarCierre} disabled={savingCierre}>
                  {savingCierre ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Procesar Cierre</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>



    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  pageTitle: { fontSize: 22, fontWeight: "900", color: COLORS.text },
  pageSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2, fontWeight: "500" },
  cierreBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    ...THEME.shadow.soft,
  },
  cierreBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  // Aviso Box
  noticeCard: {
    backgroundColor: Platform.OS === "web" ? "var(--info-bg, #EFF6FF)" : "#EFF6FF",
    borderColor: Platform.OS === "web" ? "var(--info-border, #BFDBFE)" : "#BFDBFE",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    ...THEME.shadow.soft,
  },
  noticeTitle: { fontSize: 13, fontWeight: "900", color: Platform.OS === "web" ? "var(--info, #1E40AF)" : "#1E40AF" },
  noticeText: { fontSize: 12, color: COLORS.text, lineHeight: 18, fontWeight: "500" },

  // Grid Layout for Cards
  cardsGrid: {
    flexDirection: "column",
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...THEME.shadow.soft,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  ajusteLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  ajusteLinkText: { fontSize: 12, fontWeight: "700", color: COLORS.muted },

  // States List
  stateList: {
    flexDirection: "column",
    gap: 8,
  },
  stateItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  stateLabelRow: {
    flexDirection: "column",
  },
  stateLabel: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  stateSubLabel: { fontSize: 10, color: COLORS.muted, fontWeight: "600", marginTop: 1 },

  // Colors mapping
  stateBlue: {
    backgroundColor: Platform.OS === "web" ? "var(--info-bg, #F0F9FF)" : "#F0F9FF",
    borderColor: Platform.OS === "web" ? "var(--info-border, #BAE6FD)" : "#BAE6FD"
  },
  stateValueBlue: { fontSize: 16, fontWeight: "900", color: Platform.OS === "web" ? "var(--info, #0369A1)" : "#0369A1" },

  stateOrange: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FFF7ED)" : "#FFF7ED",
    borderColor: Platform.OS === "web" ? "var(--warning-border, #FED7AA)" : "#FED7AA"
  },
  stateValueOrange: { fontSize: 16, fontWeight: "900", color: Platform.OS === "web" ? "var(--warning, #C2410C)" : "#C2410C" },

  stateGreen: {
    backgroundColor: Platform.OS === "web" ? "var(--success-bg, #F0FDF4)" : "#F0FDF4",
    borderColor: Platform.OS === "web" ? "var(--success-border, #BBF7D0)" : "#BBF7D0"
  },
  stateValueGreen: { fontSize: 16, fontWeight: "900", color: Platform.OS === "web" ? "var(--success, #047857)" : "#047857" },

  cardTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  totalText: { fontSize: 10, fontWeight: "900", color: COLORS.muted, letterSpacing: 0.5 },
  totalValue: { fontSize: 16, fontWeight: "900", color: COLORS.text },

  // Historico Card
  historicoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
    overflow: "hidden",
  },
  historicoToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: COLORS.card,
  },
  historicoTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  historicoChevron: { fontSize: 12, color: COLORS.muted, fontWeight: "700" },
  historicoContent: {
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 12,
    gap: 12,
  },
  noHistoryText: { fontSize: 12, color: COLORS.muted, textAlign: "center", paddingVertical: 12, fontStyle: "italic" },
  historyRow: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  historyDate: { fontSize: 12, fontWeight: "800", color: COLORS.text },
  historyAuthor: { fontSize: 10, color: COLORS.muted, fontWeight: "600" },
  historyDataBlock: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  historyCol: { flex: 1, gap: 2 },
  historyColTitle: { fontSize: 11, fontWeight: "800", color: COLORS.text, marginBottom: 2 },
  historyColText: { fontSize: 11, color: COLORS.muted, fontWeight: "500" },

  // Month Navigator
  monthNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthNavBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  monthNavBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  monthNavTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },
  loadMoreBtn: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },

  // Modals
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalScrollCenter: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    width: "100%",
  },
  modalScroll: {
    width: "100%",
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  modalCardLg: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 500,
    gap: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, fontWeight: "600", marginTop: -6 },
  modalSubtitleLg: { fontSize: 13, color: COLORS.muted, fontWeight: "600", marginTop: -10, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.text, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  errorText: { fontSize: 12, color: COLORS.danger, fontWeight: "600", marginTop: 4 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },

  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: COLORS.bg,
  },
  btnGhostText: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryText: { fontSize: 14, fontWeight: "800", color: "#FFF" },

  // Cierre Section Layout
  cierreSection: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    backgroundColor: COLORS.bg,
    gap: 12,
  },
  cierreSectionTitle: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  cierreInputsRow: { flexDirection: "row", gap: 12 },

  responsableContainer: {
    width: "100%",
    marginBottom: 4,
  },

  // Previsualización Dinámica
  previewWrap: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FFFBEB)" : "#FFFBEB",
    borderColor: Platform.OS === "web" ? "var(--warning-border, #FEF3C7)" : "#FEF3C7",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  previewTitle: { fontSize: 11, fontWeight: "800", color: Platform.OS === "web" ? "var(--warning, #B45309)" : "#B45309" },
  previewText: { fontSize: 11, color: Platform.OS === "web" ? "var(--warning, #D97706)" : "#D97706", fontWeight: "500" },

  // Nuevos Estilos Agregados
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  badgeBlue: {
    backgroundColor: Platform.OS === "web" ? "var(--info-bg, #E0F2FE)" : "#E0F2FE",
  },
  badgeIndigo: {
    backgroundColor: COLORS.primarySoft,
  },
  badgeAmber: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FEF3C7)" : "#FEF3C7",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgeTextBlue: {
    color: Platform.OS === "web" ? "var(--info, #0369A1)" : "#0369A1",
  },
  badgeTextIndigo: {
    color: COLORS.primary,
  },
  badgeTextAmber: {
    color: Platform.OS === "web" ? "var(--warning, #B45309)" : "#B45309",
  },
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...THEME.shadow.soft,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 8,
  },
  statBoxHighlight: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FFFBEB)" : "#FFFBEB",
    borderColor: Platform.OS === "web" ? "var(--warning-border, #FEF3C7)" : "#FEF3C7",
  },
  statIcon: {
    fontSize: 18,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 1,
  },
  noStatsText: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    paddingVertical: 8,
    fontStyle: "italic",
  },
  statsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statsMonthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statsMonthNavBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  statsMonthNavBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
  },
  statsMonthNavTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    minWidth: 110,
    textAlign: "center",
  },
  cierreInputsCol: {
    flexDirection: "column",
    gap: 12,
  },
  inputGroup: {
    width: "100%",
  },
  menuContainer: {
    position: "relative",
    zIndex: 50,
  },
  menuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  menuBtnText: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.muted,
    lineHeight: 16,
  },
  menuPopover: {
    position: "absolute",
    right: 12,
    top: 46,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 130,
    zIndex: 100,
    padding: 2,
    ...THEME.shadow.soft,
  },
  menuItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.danger,
  },
  
  // Calendario y nuevos campos
  dateTrigger: {
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
  dateTriggerText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  calendarEmbed: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    backgroundColor: COLORS.card,
    ...THEME.shadow.soft,
    width: "100%",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  calendarMonthTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
  },
  calendarNavBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarNavBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
  },
  calendarWeekdays: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 4,
  },
  calendarWeekdayText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
    width: 32,
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  calendarDayBox: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    marginVertical: 2,
  },
  calendarDayBoxEmpty: {
    width: "14.28%",
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: COLORS.primary,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  calendarDayText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
  },
  calendarDayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  calendarDayTextToday: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  sectionTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
  },
  sectionTotalLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTotalValue: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },
  diffContainer: {
    flexDirection: "column",
    gap: 8,
  },
  diffItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diffItemLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  diffValue: {
    fontSize: 14,
    fontWeight: "900",
  },
  cierreInputsColMobile: {
    flexDirection: "column",
    gap: 6,
    width: "100%",
  },
  stateTeal: {
    backgroundColor: Platform.OS === "web" ? "var(--teal-bg, #F0FDFA)" : "#F0FDFA",
    borderColor: Platform.OS === "web" ? "var(--teal-border, #CCFBF1)" : "#CCFBF1",
  },
  stateValueTeal: {
    fontSize: 16,
    fontWeight: "900",
    color: Platform.OS === "web" ? "var(--teal, #0D9488)" : "#0D9488",
  },
  statSubText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  filterCheckbox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  filterCheckboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterCheckboxText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  filterCheckboxTextActive: {
    color: "#FFFFFF",
  },
  historyRowHeaderButton: {
    width: "100%",
  },
  expandChevron: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
    marginLeft: 6,
  },
  headerDiffsContainer: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  headerDiffBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  headerDiffBoxPos: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  headerDiffBoxNeg: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FEE2E2",
  },
  headerDiffLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.muted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  headerDiffVal: {
    fontSize: 15,
    fontWeight: "900",
  },
  historyRowTitleText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 2,
  },
  historyRowAuthorText: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
    marginBottom: 8,
  },
});

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
  };
  kids: {
    usados?: number;
    perdidos?: number;
    embolsados?: number;
    sucios?: number;
    chequeados?: number;
    listos?: number;
  };
};

type MonthlyStats = {
  usados: number;
  perdidos: number;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoordinadoresLentesScreen() {
  const { cineId, user, displayName } = useAuthUser();

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

  // ── Modales ──
  const [showAjustar, setShowAjustar] = useState<"adultos" | "kids" | null>(null);
  const [showCierre, setShowCierre] = useState(false);
  const [showEmbolsado, setShowEmbolsado] = useState(false);

  // ── Formulario de Ajuste Manual ──
  const [editSucios, setEditSucios] = useState("");
  const [editChequeados, setEditChequeados] = useState("");
  const [editListos, setEditListos] = useState("");
  const [ajustarError, setAjustarError] = useState("");
  const [savingAjustar, setSavingAjustar] = useState(false);

  // ── Formulario de Cierre Diario ──
  const [cierreResponsable, setCierreResponsable] = useState("");
  const [cierreUsadosAdultos, setCierreUsadosAdultos] = useState("");
  const [cierrePerdidosAdultos, setCierrePerdidosAdultos] = useState("");
  const [cierreUsadosKids, setCierreUsadosKids] = useState("");
  const [cierrePerdidosKids, setCierrePerdidosKids] = useState("");
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
        ultimaActualizacion: new Date().toISOString()
      };
      await setDoc(ref, defaultVal);
      return defaultVal;
    }
    return snap.data() as LentesStock;
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

      let totalUsados = 0;
      let totalPerdidos = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.tipo === "cierre" || !data.tipo) {
          totalUsados += (data.adultos?.usados || 0) + (data.kids?.usados || 0);
          totalPerdidos += (data.adultos?.perdidos || 0) + (data.kids?.perdidos || 0);
        }
      });

      setMonthlyStats({
        usados: totalUsados,
        perdidos: totalPerdidos,
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
    const current = type === "adultos" ? stockAdultos : stockKids;
    if (!current) return;
    setEditSucios(String(current.sucios));
    setEditChequeados(String(current.chequeados));
    setEditListos(String(current.listos));
    setAjustarError("");
    setShowAjustar(type);
  };

  const guardarAjuste = async () => {
    setAjustarError("");
    if (!showAjustar || !cineId) return;

    const suciosNum = parseInt(editSucios.trim());
    const chequeadosNum = parseInt(editChequeados.trim());
    const listosNum = parseInt(editListos.trim());

    if (isNaN(suciosNum) || suciosNum < 0 ||
      isNaN(chequeadosNum) || chequeadosNum < 0 ||
      isNaN(listosNum) || listosNum < 0) {
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
        };

        let finalKids = {
          sucios: currentK.sucios,
          chequeados: currentK.chequeados,
          listos: currentK.listos,
        };

        if (showAjustar === "adultos") {
          finalAdultos = {
            sucios: suciosNum,
            chequeados: chequeadosNum,
            listos: listosNum,
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
    setCierreResponsable(displayName || "");
    setCierreUsadosAdultos("");
    setCierrePerdidosAdultos("");
    setCierreUsadosKids("");
    setCierrePerdidosKids("");
    setCierreError("");
    setShowCierre(true);
  };

  const guardarCierre = async () => {
    setCierreError("");
    if (!cineId || !stockAdultos || !stockKids) return;

    if (!cierreResponsable.trim()) {
      setCierreError("Por favor ingresá el nombre del responsable del cierre.");
      return;
    }

    // Parsear inputs (si se dejan vacíos, se asume 0)
    const uAdultos = cierreUsadosAdultos.trim() !== "" ? parseInt(cierreUsadosAdultos.trim()) : 0;
    const pAdultos = cierrePerdidosAdultos.trim() !== "" ? parseInt(cierrePerdidosAdultos.trim()) : 0;
    const uKids = cierreUsadosKids.trim() !== "" ? parseInt(cierreUsadosKids.trim()) : 0;
    const pKids = cierrePerdidosKids.trim() !== "" ? parseInt(cierrePerdidosKids.trim()) : 0;

    if (isNaN(uAdultos) || uAdultos < 0 ||
      isNaN(pAdultos) || pAdultos < 0 ||
      isNaN(uKids) || uKids < 0 ||
      isNaN(pKids) || pKids < 0) {
      setCierreError("Las cantidades de usados y perdidos deben ser enteros positivos.");
      return;
    }

    // Validar stock disponible: listos >= usados + perdidos
    if ((uAdultos + pAdultos) > stockAdultos.listos) {
      setCierreError(`Adultos: No podés descontar ${uAdultos} usados y ${pAdultos} perdidos ya que solo hay ${stockAdultos.listos} listos para chequear.`);
      return;
    }
    if ((uKids + pKids) > stockKids.listos) {
      setCierreError(`Kids: No podés descontar ${uKids} usados y ${pKids} perdidos ya que solo hay ${stockKids.listos} listos para chequear.`);
      return;
    }

    setSavingCierre(true);
    try {
      // Transacción para garantizar consistencia del stock y escritura de auditoría
      await runTransaction(db, async (transaction) => {
        const refA = doc(db, CINES_COLLECTION, cineId, "lentes3d", "adultos");
        const refK = doc(db, CINES_COLLECTION, cineId, "lentes3d", "kids");

        const snapA = await transaction.get(refA);
        const snapK = await transaction.get(refK);

        const currentA = snapA.data() as LentesStock;
        const currentK = snapK.data() as LentesStock;

        // Actualizar Adultos
        transaction.update(refA, {
          sucios: currentA.sucios + uAdultos,
          listos: currentA.listos - uAdultos - pAdultos,
          ultimaActualizacion: new Date().toISOString()
        });

        // Actualizar Kids
        transaction.update(refK, {
          sucios: currentK.sucios + uKids,
          listos: currentK.listos - uKids - pKids,
          ultimaActualizacion: new Date().toISOString()
        });

        // Guardar Auditoría Histórica
        const todayStr = new Date().toISOString().split("T")[0];
        const auditRef = doc(collection(db, CINES_COLLECTION, cineId, "lentes3d_cierres"));
        transaction.set(auditRef, {
          tipo: "cierre",
          fecha: todayStr,
          creadoEn: new Date().toISOString(),
          creadoPorEmail: user?.email ?? "coordinador@cinemark.com.ar",
          creadoPorNombre: displayName || "Coordinador",
          responsable: cierreResponsable.trim(),
          adultos: { usados: uAdultos, perdidos: pAdultos },
          kids: { usados: uKids, perdidos: pKids }
        });
      });

      setShowCierre(false);
      await fetchStock();
      await fetchMonthlyStats(selectedMonth);
      if (expandHistorico) {
        setLastDoc(null);
        fetchCierres(selectedMonth, false);
      }
      showAlert("Cierre Completado", "El stock de lentes 3D se ha actualizado de forma exitosa.");
    } catch (e: any) {
      setCierreError(e?.message ?? "Error al procesar el cierre de día.");
    } finally {
      setSavingCierre(false);
    }
  };

  // ─── Guardar Nuevos Embolsados ──────────────────────────────────────────────

  const guardarEmbolsados = async () => {
    setEmbolsadoError("");
    if (!cineId || !stockAdultos || !stockKids) return;

    if (!embolsadoResponsable.trim()) {
      setEmbolsadoError("Por favor ingresá el nombre del responsable.");
      return;
    }

    const eAdultos = embolsadosAdultos.trim() !== "" ? parseInt(embolsadosAdultos.trim()) : 0;
    const eKids = embolsadosKids.trim() !== "" ? parseInt(embolsadosKids.trim()) : 0;

    if (isNaN(eAdultos) || eAdultos < 0 || isNaN(eKids) || eKids < 0) {
      setEmbolsadoError("Las cantidades de nuevos embolsados deben ser enteros positivos.");
      return;
    }

    if (eAdultos > stockAdultos.sucios) {
      setEmbolsadoError(`Adultos: No podés embolsar ${eAdultos} ya que solo hay ${stockAdultos.sucios} sucios disponibles.`);
      return;
    }

    if (eKids > stockKids.sucios) {
      setEmbolsadoError(`Kids: No podés embolsar ${eKids} ya que solo hay ${stockKids.sucios} sucios disponibles.`);
      return;
    }

    setSavingEmbolsado(true);
    try {
      await runTransaction(db, async (transaction) => {
        const refA = doc(db, CINES_COLLECTION, cineId, "lentes3d", "adultos");
        const refK = doc(db, CINES_COLLECTION, cineId, "lentes3d", "kids");

        const snapA = await transaction.get(refA);
        const snapK = await transaction.get(refK);

        const currentA = snapA.data() as LentesStock;
        const currentK = snapK.data() as LentesStock;

        transaction.update(refA, {
          sucios: currentA.sucios - eAdultos,
          listos: currentA.listos + eAdultos,
          ultimaActualizacion: new Date().toISOString()
        });

        transaction.update(refK, {
          sucios: currentK.sucios - eKids,
          listos: currentK.listos + eKids,
          ultimaActualizacion: new Date().toISOString()
        });

        const todayStr = new Date().toISOString().split("T")[0];
        const auditRef = doc(collection(db, CINES_COLLECTION, cineId, "lentes3d_cierres"));
        transaction.set(auditRef, {
          tipo: "embolsado",
          fecha: todayStr,
          creadoEn: new Date().toISOString(),
          creadoPorEmail: user?.email ?? "coordinador@cinemark.com.ar",
          creadoPorNombre: displayName || "Coordinador",
          responsable: embolsadoResponsable.trim(),
          adultos: { embolsados: eAdultos },
          kids: { embolsados: eKids }
        });
      });

      setShowEmbolsado(false);
      await fetchStock();
      await fetchMonthlyStats(selectedMonth);
      if (expandHistorico) {
        setLastDoc(null);
        fetchCierres(selectedMonth, false);
      }
      showAlert("Embolsado Completado", "El stock de lentes 3D se ha actualizado de forma exitosa.");
    } finally {
      setSavingEmbolsado(false);
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

        let suciosFinalK = currentK.sucios;
        let listosFinalK = currentK.listos;

        if (isEmbolsado) {
          // Revertir Embolsado:
          // Inverso: sucios = sucios + e, listos = listos - e
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
        } else {
          // Revertir Cierre:
          // Inverso: sucios = sucios - u, listos = listos + u + p
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

        // Actualizar stocks en la transacción
        transaction.update(refA, {
          sucios: suciosFinalA,
          listos: listosFinalA,
          ultimaActualizacion: new Date().toISOString(),
        });

        transaction.update(refK, {
          sucios: suciosFinalK,
          listos: listosFinalK,
          ultimaActualizacion: new Date().toISOString(),
        });

        // Eliminar reporte de auditoría en la transacción
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
              <Text style={s.cierreBtnText}>📝 Cierre</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.cierreBtn, { backgroundColor: "#0284C7", marginLeft: 6 }]}
              onPress={() => {
                setEmbolsadoResponsable(displayName || "");
                setEmbolsadosAdultos("");
                setEmbolsadosKids("");
                setEmbolsadoError("");
                setShowEmbolsado(true);
              }}
            >
              <Text style={s.cierreBtnText}>🧺 Embolsar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Aviso */}
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>💡 Estados y Dinámica de Procesamiento</Text>
          <Text style={s.noticeText}>
            • <Text style={{ fontWeight: "700" }}>Sucios (Azul):</Text> Inventario de lentes por limpiar. Cuando se embolsan nuevos, se descuentan de aquí.{"\n"}
            • <Text style={{ fontWeight: "700" }}>Listos para chequear (Naranja):</Text> Lentes disponibles para usar. En el cierre pasan a ser usados (se ensucian) o perdidos (salen del inventario).{"\n"}
            • <Text style={{ fontWeight: "700" }}>Chequeados para usar (Verde):</Text> Lentes controlados bajo rigurosos controles (No se descuentan de ninguna forma).
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
                      <Text style={s.stateSubLabel}>Por limpiar y embolsar</Text>
                    </View>
                    <Text style={s.stateValueBlue}>{item.sucios.toLocaleString("es-AR")}</Text>
                  </View>

                  {/* Listos para chequear */}
                  <View style={[s.stateItem, s.stateOrange]}>
                    <View style={s.stateLabelRow}>
                      <Text style={s.stateLabel}>Listos para chequear</Text>
                      <Text style={s.stateSubLabel}>Cierre diario</Text>
                    </View>
                    <Text style={s.stateValueOrange}>{item.listos.toLocaleString("es-AR")}</Text>
                  </View>

                  {/* Chequeados para usar */}
                  <View style={[s.stateItem, s.stateGreen]}>
                    <View style={s.stateLabelRow}>
                      <Text style={s.stateLabel}>Chequeados para usar</Text>
                      <Text style={s.stateSubLabel}>Listos para usar AUD</Text>
                    </View>
                    <Text style={s.stateValueGreen}>{item.chequeados.toLocaleString("es-AR")}</Text>
                  </View>
                </View>

                {/* Total */}
                <View style={s.cardTotalRow}>
                  <Text style={s.totalText}>TOTAL ACUMULADO</Text>
                  <Text style={s.totalValue}>{(item.sucios + item.chequeados + item.listos).toLocaleString("es-AR")} U</Text>
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
                <View>
                  <Text style={s.statLabel}>Usados</Text>
                  <Text style={s.statValue}>{monthlyStats.usados.toLocaleString("es-AR")}</Text>
                </View>
              </View>
              <View style={s.statBox}>
                <Text style={s.statIcon}>⚠️</Text>
                <View>
                  <Text style={s.statLabel}>Perdidos</Text>
                  <Text style={s.statValue}>{monthlyStats.perdidos.toLocaleString("es-AR")}</Text>
                </View>
              </View>
              <View style={[s.statBox, s.statBoxHighlight]}>
                <Text style={s.statIcon}>📉</Text>
                <View>
                  <Text style={s.statLabel}>Pérdida %</Text>
                  <Text style={[s.statValue, { color: monthlyStats.usados > 0 && (monthlyStats.perdidos / monthlyStats.usados) * 100 > 5 ? "#DC2626" : "#0F172A" }]}>
                    {monthlyStats.usados > 0
                      ? `${((monthlyStats.perdidos / monthlyStats.usados) * 100).toFixed(1)}%`
                      : "0.0%"}
                  </Text>
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
            <Text style={s.historicoTitle}>📜 Historial de Cierres y Embolsados</Text>
            <Text style={s.historicoChevron}>{expandHistorico ? "▼" : "▶"}</Text>
          </TouchableOpacity>

          {expandHistorico && (
            <View style={s.historicoContent}>
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
              ) : cierres.length === 0 ? (
                <Text style={s.noHistoryText}>No hay registros para este mes.</Text>
              ) : (
                <View style={{ gap: 12 }}>
                  {cierres.map((c) => {
                    const dateParts = c.creadoEn ? new Date(c.creadoEn) : new Date();
                    const formattedTime = dateParts.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
                    const [y, m, d] = c.fecha.split("-");
                    const formattedDate = `${d}/${m}/${y}`;
                    const isEmbolsado = c.tipo === "embolsado";
                    const isAjuste = c.tipo === "ajuste";

                    return (
                      <View key={c.id} style={[s.historyRow, activeMenuId === c.id && { zIndex: 999, elevation: 5 }]}>
                        <View style={s.historyHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.historyDate}>{formattedDate} - {formattedTime}</Text>
                            <View style={[s.badge, isAjuste ? s.badgeAmber : isEmbolsado ? s.badgeBlue : s.badgeIndigo]}>
                              <Text style={[s.badgeText, isAjuste ? s.badgeTextAmber : isEmbolsado ? s.badgeTextBlue : s.badgeTextIndigo]}>
                                {isAjuste ? "⚙️ Ajuste" : isEmbolsado ? "🧺 Embolsado" : "📝 Cierre"}
                              </Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={s.historyAuthor}>por: {c.creadoPorNombre}</Text>
                              {c.responsable && (
                                <Text style={[s.historyAuthor, { fontWeight: "700", color: "#475569", marginTop: 2 }]}>
                                  Responsable: {c.responsable}
                                </Text>
                              )}
                            </View>

                            {/* Tres puntitos menu */}
                            {!isAjuste && (
                              <View style={s.menuContainer}>
                                <TouchableOpacity
                                  style={s.menuBtn}
                                  onPress={() => setActiveMenuId(activeMenuId === c.id ? null : c.id)}
                                >
                                  <Text style={s.menuBtnText}>⋮</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                        <View style={s.historyDataBlock}>
                          <View style={s.historyCol}>
                            <Text style={s.historyColTitle}>🕶️ Adultos</Text>
                            {isAjuste ? (
                              <>
                                <Text style={s.historyColText}>• Sucios: <Text style={{ fontWeight: "700", color: "#0369A1" }}>{c.adultos.sucios ?? 0}</Text></Text>
                                <Text style={s.historyColText}>• Listos: <Text style={{ fontWeight: "700", color: "#C2410C" }}>{c.adultos.listos ?? 0}</Text></Text>
                                <Text style={s.historyColText}>• Chequeados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.adultos.chequeados ?? 0}</Text></Text>
                              </>
                            ) : isEmbolsado ? (
                              <Text style={s.historyColText}>• Embolsados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.adultos.embolsados || 0}</Text></Text>
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
                                <Text style={s.historyColText}>• Chequeados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.kids.chequeados ?? 0}</Text></Text>
                              </>
                            ) : isEmbolsado ? (
                              <Text style={s.historyColText}>• Embolsados: <Text style={{ fontWeight: "700", color: "#047857" }}>{c.kids.embolsados || 0}</Text></Text>
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
              )}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal Ajuste Manual ── */}
      <Modal
        visible={showAjustar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAjustar(null)}
      >
        <View style={s.backdrop}>
          <View style={s.modalCard}>
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
        <View style={s.backdrop}>
          <ScrollView contentContainerStyle={s.modalScrollCenter} keyboardShouldPersistTaps="handled">
            <View style={s.modalCardLg}>
              <Text style={s.modalTitle}>Cierre de Día - Lentes 3D</Text>
              <Text style={s.modalSubtitleLg}>Modifica los stocks en base a la función y pérdidas del día</Text>

              {/* Responsable Input */}
              <View style={s.responsableContainer}>
                <Text style={s.label}>Responsable del Cierre</Text>
                <TextInput
                  onChangeText={setCierreResponsable}
                  placeholder="Nombre de quien hace el cierre"
                  style={s.input}
                />
              </View>

              {/* Seccion Adultos */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>🕶️ Adultos</Text>
                <View style={s.cierreInputsCol}>
                  <View style={s.inputGroup}>
                    <Text style={s.label}>Usados (descuenta listos)</Text>
                    <TextInput
                      value={cierreUsadosAdultos}
                      onChangeText={setCierreUsadosAdultos}
                      placeholder="Ej: 50"
                      keyboardType="number-pad"
                      style={s.input}
                    />
                  </View>
                  <View style={s.inputGroup}>
                    <Text style={s.label}>Perdidos (descuenta listos)</Text>
                    <TextInput
                      value={cierrePerdidosAdultos}
                      onChangeText={setCierrePerdidosAdultos}
                      placeholder="Ej: 5"
                      keyboardType="number-pad"
                      style={s.input}
                    />
                  </View>
                </View>
                {renderPreview(stockAdultos, cierreUsadosAdultos, cierrePerdidosAdultos)}
              </View>

              {/* Seccion Kids */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>🕶️ Kids</Text>
                <View style={s.cierreInputsCol}>
                  <View style={s.inputGroup}>
                    <Text style={s.label}>Usados (descuenta listos)</Text>
                    <TextInput
                      value={cierreUsadosKids}
                      onChangeText={setCierreUsadosKids}
                      placeholder="Ej: 40"
                      keyboardType="number-pad"
                      style={s.input}
                    />
                  </View>
                  <View style={s.inputGroup}>
                    <Text style={s.label}>Perdidos (descuenta listos)</Text>
                    <TextInput
                      value={cierrePerdidosKids}
                      onChangeText={setCierrePerdidosKids}
                      placeholder="Ej: 2"
                      keyboardType="number-pad"
                      style={s.input}
                    />
                  </View>
                </View>
                {renderPreview(stockKids, cierreUsadosKids, cierrePerdidosKids)}
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

      {/* ── Modal Nuevos Embolsados ── */}
      <Modal
        visible={showEmbolsado}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmbolsado(false)}
      >
        <View style={s.backdrop}>
          <ScrollView contentContainerStyle={s.modalScrollCenter} keyboardShouldPersistTaps="handled">
            <View style={s.modalCardLg}>
              <Text style={s.modalTitle}>🧺 Nuevos Embolsados - Lentes 3D</Text>
              <Text style={s.modalSubtitleLg}>Registrá los lentes higienizados y embolsados (se descuentan de sucios y pasan a listos para chequear)</Text>

              {/* Responsable Input */}
              <View style={s.responsableContainer}>
                <Text style={s.label}>Responsable del Proceso</Text>
                <TextInput

                  onChangeText={setEmbolsadoResponsable}
                  placeholder="Nombre de quien realizó el reporte de embolsados"
                  style={s.input}
                />
              </View>

              {/* Seccion Adultos */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>🕶️ Adultos</Text>
                <View style={s.cierreInputsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Cantidad Embolsados</Text>
                    <TextInput
                      value={embolsadosAdultos}
                      onChangeText={setEmbolsadosAdultos}
                      placeholder="Ej: 30"
                      keyboardType="number-pad"
                      style={s.input}
                    />
                  </View>
                </View>
                {renderEmbolsadoPreview(stockAdultos, embolsadosAdultos)}
              </View>

              {/* Seccion Kids */}
              <View style={s.cierreSection}>
                <Text style={s.cierreSectionTitle}>🕶️ Kids</Text>
                <View style={s.cierreInputsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Cantidad Embolsados</Text>
                    <TextInput
                      value={embolsadosKids}
                      onChangeText={setEmbolsadosKids}
                      placeholder="Ej: 20"
                      keyboardType="number-pad"
                      style={s.input}
                    />
                  </View>
                </View>
                {renderEmbolsadoPreview(stockKids, embolsadosKids)}
              </View>

              {/* Error */}
              {!!embolsadoError && <Text style={s.errorText}>{embolsadoError}</Text>}

              <View style={s.modalActions}>
                <TouchableOpacity style={s.btnGhost} onPress={() => setShowEmbolsado(false)}>
                  <Text style={s.btnGhostText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnPrimary, { backgroundColor: "#0284C7" }]} onPress={guardarEmbolsados} disabled={savingEmbolsado}>
                  {savingEmbolsado ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Registrar Embolsados</Text>}
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
    gap: 10,
  },
  statBox: {
    flex: 1,
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
});

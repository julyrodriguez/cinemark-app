import React, { useEffect, useState, useMemo } from "react";
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  limit,
} from "firebase/firestore";
import * as Print from "expo-print";
import dayjs from "dayjs";

import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { getCineConfig } from "../../lib/cineConfig";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface LampItem {
  modelo: string;
  serie: string;
}

interface OrderItem {
  marca: string;
  modelo: string;
  potencia: string;
  cantidad: number;
  esSugerencia?: boolean;
  sala?: number;
  horasRestantes?: number;
  lamparaId?: string;
}

interface SavedMonthClose {
  responsable: string;
  subgerente: string;
  fecha: string; // ISO date or formatted
  stockInicial: LampItem[];
  stockFinal: LampItem[];
  recepcion: LampItem[];
  consumo: LampItem[];
  pedido: OrderItem[];
  updatedAt?: any;
}

interface IncidentItem {
  sala: string;
  fecha: string;
  pelicula: string;
  horario: string;
  detalle: string;
  solucion: string;
  incidenteTopc: string;
  tipoIncidente: "Corte tecnico" | "Corte evitable" | "Corte operativo" | "Suspension tecnica" | "Suspension evitable" | "";
}

interface SavedMonthCuts {
  responsable: string;
  subgerente: string;
  fecha: string;
  incidentes: IncidentItem[];
  updatedAt?: any;
}

type TabType = "CIERRE_LAMPARAS" | "CORTE_MENSUAL";

const POTENCIAS_OPTIONS = [
  "1200W",
  "2000W",
  "2200W",
  "3000W",
  "4000W",
];

const MODELOS_OPTIONS = [
  "DXL-30BAF/L",
  "DXL-20BAF",
  "DXL-20BAF/L",
  "DXL-22BAF",
  "DXL-40BAF/L",
];

interface ModelSelectCellProps {
  value: string;
  onChange: (val: string) => void;
  style?: any;
  placeholder?: string;
}

function ModelSelectCell({ value, onChange, style, placeholder }: ModelSelectCellProps) {
  const [isEditingCustom, setIsEditingCustom] = useState(() => {
    return value !== "" && !MODELOS_OPTIONS.includes(value);
  });

  const handleSelectChange = (val: string) => {
    if (val === "__CUSTOM__") {
      setIsEditingCustom(true);
      onChange("");
    } else {
      onChange(val);
    }
  };

  if (Platform.OS !== "web") {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[style, { textAlign: "center" }]}
        placeholder={placeholder || "Ej: DXL-30BAF/L"}
        placeholderTextColor={COLORS.muted}
      />
    );
  }

  if (isEditingCustom) {
    return (
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", position: "relative" }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          style={[style, { flex: 1, paddingRight: 24, textAlign: "center" }]}
          placeholder={placeholder || "Ej: DXL-30BAF/L"}
          placeholderTextColor={COLORS.muted}
          autoFocus
        />
        <TouchableOpacity
          onPress={() => {
            setIsEditingCustom(false);
            onChange("");
          }}
          style={{ position: "absolute", right: 4, height: "100%", justifyContent: "center", zIndex: 10 }}
        >
          <MaterialCommunityIcons name="menu-down" size={20} color={COLORS.muted} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => handleSelectChange(e.target.value)}
      style={{
        backgroundColor: "transparent",
        color: value ? COLORS.text : COLORS.muted,
        borderWidth: 0,
        padding: 8,
        fontSize: 12,
        fontWeight: "600",
        outlineWidth: 0,
        width: "100%",
        height: 28,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "center",
        textAlignLast: "center",
      }}
    >
      <option value="" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.muted, textAlign: "center" }}>{placeholder || "Seleccionar..."}</option>
      {MODELOS_OPTIONS.map((m) => (
        <option key={m} value={m} style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text, textAlign: "center" }}>{m}</option>
      ))}
      <option value="__CUSTOM__" style={{ fontWeight: "bold", backgroundColor: "var(--card, #FFFFFF)", color: COLORS.primary, textAlign: "center" }}>✍️ Escribir a mano...</option>
    </select>
  );
}

export default function CierreMesScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { cineId } = useAuthUser();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>("CIERRE_LAMPARAS");

  // Selector de Mes y Año
  const [selectedMesAno, setSelectedMesAno] = useState(() => {
    return dayjs().format("YYYY-MM"); // Por defecto el mes actual, ej "2026-05"
  });

  // Estados de datos
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSavedInDb, setIsSavedInDb] = useState(false);

  // Estados de cortes
  const [incidentes, setIncidentes] = useState<IncidentItem[]>([]);
  const [cortesIsSavedInDb, setCortesIsSavedInDb] = useState(false);
  const [savingCortes, setSavingCortes] = useState(false);

  // Campos principales
  const [responsable, setResponsable] = useState("");
  const [subgerente, setSubgerente] = useState("VICTOR DIAZ");
  const [fechaEnvio, setFechaEnvio] = useState(() => dayjs().format("YYYY-MM-DD"));

  // Tablas del cierre
  const [stockInicial, setStockInicial] = useState<LampItem[]>([]);
  const [stockFinal, setStockFinal] = useState<LampItem[]>([]);
  const [recepcion, setRecepcion] = useState<LampItem[]>([]);
  const [consumo, setConsumo] = useState<LampItem[]>([]);
  const [pedido, setPedido] = useState<OrderItem[]>([]);

  // Estado para modal de confirmación de borrado
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    table: "inicial" | "final" | "recepcion" | "consumo" | "pedido" | "incidente";
    index: number;
    itemInfo: string;
  } | null>(null);

  // Datos crudos cargados para cálculos
  const [lamparasRaw, setLamparasRaw] = useState<any[]>([]);
  const [movimientosRaw, setMovimientosRaw] = useState<any[]>([]);
  const [latestControl, setLatestControl] = useState<any | null>(null);
  const [salasCount, setSalasCount] = useState(12);

  // Opciones de salas configuradas para el cine
  const salaOptions = useMemo(() => {
    const opts = [];
    for (let i = 1; i <= salasCount; i++) {
      opts.push({ value: String(i), label: `Sala ${i}` });
    }
    opts.push({ value: "TODAS", label: "TODAS" });
    return opts;
  }, [salasCount]);

  // Generar opciones de meses (últimos 12 meses para selector)
  const mesesOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = dayjs().subtract(i, "month");
      opts.push({
        value: d.format("YYYY-MM"),
        label: d.format("MMMM YYYY").charAt(0).toUpperCase() + d.format("MMMM YYYY").slice(1),
      });
    }
    return opts;
  }, []);

  // Cargar configuración de salas del cine
  useEffect(() => {
    if (!cineId) return;
    (async () => {
      try {
        const cfg = await getCineConfig(cineId);
        if (cfg?.salasCount && Number.isFinite(cfg.salasCount) && cfg.salasCount > 0) {
          setSalasCount(Math.floor(cfg.salasCount));
        }
      } catch (e) {
        console.error("Error al cargar salasCount:", e);
      }
    })();
  }, [cineId]);

  // Se deja responsable inicial vacío por requerimiento

  // 1. Cargar datos base: lámparas, movimientos y último control semanal
  useEffect(() => {
    if (!cineId) return;

    let unsubLamps = () => { };
    let unsubMovs = () => { };
    let unsubControl = () => { };

    try {
      // Suscripción a Lámparas
      const lampsCol = collection(db, CINES_COLLECTION, cineId, "lamparas");
      unsubLamps = onSnapshot(lampsCol, (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLamparasRaw(rows);
      });

      // Suscripción a Movimientos
      const movsCol = collection(db, CINES_COLLECTION, cineId, "lampara_movimientos");
      const movsQuery = query(movsCol, orderBy("fechaISO", "desc"));
      unsubMovs = onSnapshot(movsQuery, (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMovimientosRaw(rows);
      });

      // Suscripción a Último Control Semanal
      const controlsCol = collection(db, CINES_COLLECTION, cineId, "controles_semanales");
      const controlQuery = query(controlsCol, orderBy("fecha", "desc"), limit(1));
      unsubControl = onSnapshot(controlQuery, (snap) => {
        if (!snap.empty) {
          setLatestControl(snap.docs[0].data());
        } else {
          setLatestControl(null);
        }
      });

    } catch (e) {
      console.error("Error al suscribirse a los datos:", e);
      setLoading(false);
    }

    return () => {
      unsubLamps();
      unsubMovs();
      unsubControl();
    };
  }, [cineId]);

  // 2. Escuchar cambios de mes o datos base para computar/cargar el Cierre
  useEffect(() => {
    loadOrCreateCierre();
  }, [selectedMesAno, lamparasRaw, movimientosRaw, latestControl]);

  // Método principal para cargar de BD o autocalcular el cierre de mes
  const loadOrCreateCierre = async () => {
    try {
      const docRef = doc(db, CINES_COLLECTION, cineId, "cierre_mes_lamparas", selectedMesAno);
      const docSnap = await getDoc(docRef);

      let loadedResponsable = "";
      let loadedSubgerente = "";
      let loadedFecha = "";

      if (docSnap.exists()) {
        // Cargar datos congelados guardados en la BD
        const data = docSnap.data() as SavedMonthClose;
        loadedResponsable = data.responsable || "";
        loadedSubgerente = data.subgerente || "";
        loadedFecha = data.fecha || "";
        setStockInicial(data.stockInicial || []);
        setStockFinal(data.stockFinal || []);
        setRecepcion(data.recepcion || []);
        setConsumo(data.consumo || []);
        setPedido(data.pedido || []);
        setIsSavedInDb(true);
      } else {
        // No existe guardado, calcular sugerencias automáticas
        setIsSavedInDb(false);
        setFechaEnvio(dayjs().format("YYYY-MM-DD"));

        // Filtrar movimientos del mes seleccionado
        // Formato de mesAno en movimientos: "YYYY-MM"
        const mesMovs = movimientosRaw.filter((m) => m.mesAno === selectedMesAno);

        // A. RECEPCIÓN: ingreso_backup de este mes
        const recList: LampItem[] = mesMovs
          .filter((m) => m.tipo === "ingreso_backup")
          .map((m) => ({
            modelo: m.modelo || m.potencia || m.marca || "Lámpara",
            serie: m.lamparaId || "",
          }));

        // B. CONSUMO: instalacion en proyector de este mes
        const consList: LampItem[] = mesMovs
          .filter((m) => m.tipo === "instalacion")
          .map((m) => ({
            modelo: m.modelo || m.potencia || m.marca || "Lámpara",
            serie: m.lamparaId || "",
          }));

        // C. STOCK FINAL: 
        // Si es el mes en curso (o posterior), usamos el stock de backup actual.
        // Si es un mes pasado, reconstruimos el stock al final de ese mes.
        const isCurrentOrFutureMonth = dayjs(selectedMesAno).isSame(dayjs(), "month") || dayjs(selectedMesAno).isAfter(dayjs(), "month");

        let finalStockList: LampItem[] = [];

        if (isCurrentOrFutureMonth) {
          // Stock backup actual
          finalStockList = lamparasRaw
            .filter((l) => l.status === "backup")
            .map((l) => ({
              modelo: l.modelo || l.potencia || l.marca || "Lámpara",
              serie: l.id || "",
            }));
        } else {
          // Reconstruir stock final del mes pasado:
          // Todos los que son backup hoy y fueron creados antes del fin del mes seleccionado,
          // más los que eran backup pero fueron instalados/retirados después del mes seleccionado,
          // menos los que fueron ingresados después del mes seleccionado.
          const endOfMonth = dayjs(selectedMesAno).endOf("month");

          // Filtramos lámparas del stock actual que ya existían al fin de ese mes
          const existingBackupLamps = lamparasRaw.filter((l) => {
            if (l.status !== "backup") return false;
            // Si tiene createdAt, evaluamos
            if (l.createdAt) {
              const createdDate = l.createdAt.toDate ? l.createdAt.toDate() : new Date(l.createdAt.seconds * 1000);
              return dayjs(createdDate).isBefore(endOfMonth);
            }
            return true;
          });

          // Sumamos las que se instalaron después de ese mes (pues en ese mes todavía estaban en backup)
          const installedLater = movimientosRaw.filter((m) => {
            if (m.tipo !== "instalacion") return false;
            const instDate = m.fecha ? (m.fecha.toDate ? m.fecha.toDate() : new Date(m.fecha.seconds * 1000)) : new Date(m.fechaISO);
            return dayjs(instDate).isAfter(endOfMonth) && m.mesAno !== selectedMesAno;
          });

          const installedLaterLamps = installedLater.map((m) => ({
            modelo: m.modelo || m.potencia || m.marca || "Lámpara",
            serie: m.lamparaId || "",
          }));

          // Juntamos ambos
          const combined = [
            ...existingBackupLamps.map((l) => ({ modelo: l.modelo || l.potencia || l.marca || "Lámpara", serie: l.id || "" })),
            ...installedLaterLamps,
          ];

          // Filtramos duplicados por número de serie
          const uniqueSeries = new Set<string>();
          finalStockList = combined.filter((item) => {
            const s = (item.serie || "").trim().toLowerCase();
            if (!s || uniqueSeries.has(s)) return false;
            uniqueSeries.add(s);
            return true;
          });
        }

        // D. STOCK INICIAL: 
        // Intentamos cargar el Stock Final del mes anterior en primer lugar.
        const prevMonthStr = dayjs(selectedMesAno).subtract(1, "month").format("YYYY-MM");
        const prevDocRef = doc(db, CINES_COLLECTION, cineId, "cierre_mes_lamparas", prevMonthStr);
        const prevSnap = await getDoc(prevDocRef);

        let initialStockList: LampItem[] = [];

        if (prevSnap.exists() && prevSnap.data()?.stockFinal) {
          initialStockList = prevSnap.data().stockFinal;
        } else {
          // Reconstruir stock inicial: SI = SF - Recepcion + Consumo
          // Lámparas que estaban en stock final pero NO entraron este mes,
          // más las que se consumieron (instalaron) este mes.
          const recSeries = new Set(recList.map((r) => (r.serie || "").trim().toLowerCase()).filter(Boolean));
          const inFinalButNotReceived = finalStockList.filter(
            (item) => !recSeries.has((item.serie || "").trim().toLowerCase())
          );

          const combined = [...inFinalButNotReceived, ...consList];
          const uniqueSeries = new Set<string>();
          initialStockList = combined.filter((item) => {
            const s = (item.serie || "").trim().toLowerCase();
            if (!s || uniqueSeries.has(s)) return false;
            uniqueSeries.add(s);
            return true;
          });
        }

        // E. PEDIDO DE LÁMPARAS SUGERENCIA:
        // Buscamos proyector por proyector en el último control semanal si les quedan < 400 horas.
        const suggestionsList: OrderItem[] = [];

        if (latestControl?.lamparas) {
          latestControl.lamparas.forEach((controlLamp: any) => {
            const roomNum = controlLamp.sala;
            const remainingHours = parseInt(controlLamp.horasRestantes || "9999", 10);

            // Sugerir si tiene menos de 400 horas
            if (remainingHours < 400) {
              // Buscar marca y modelo de la lámpara activa en esa sala desde las lámparas reales
              const activeLamp = lamparasRaw.find(
                (l) => l.status === "activa" && l.sala === roomNum
              );

              const newSug: OrderItem = {
                marca: activeLamp?.marca || "Genérica",
                modelo: activeLamp?.modelo || activeLamp?.potencia || controlLamp.potencia || "Lámpara",
                potencia: activeLamp?.potencia || controlLamp.potencia || "3000W",
                cantidad: 1,
                esSugerencia: true,
                sala: roomNum,
                horasRestantes: remainingHours,
                lamparaId: activeLamp?.id || "N/A",
              };

              // Si ya existe un pedido con el mismo modelo, incrementamos la cantidad
              const existingIdx = suggestionsList.findIndex(
                (item) => item.modelo.trim().toLowerCase() === newSug.modelo.trim().toLowerCase()
              );

              if (existingIdx !== -1) {
                suggestionsList[existingIdx].cantidad += 1;
              } else {
                suggestionsList.push(newSug);
              }
            }
          });
        }

        setStockInicial(initialStockList);
        setStockFinal(finalStockList);
        setRecepcion(recList);
        setConsumo(consList);
        setPedido(suggestionsList);
      }

      // Cargar Reporte de Cortes Mensuales
      const cutsDocRef = doc(db, CINES_COLLECTION, cineId, "cierre_mes_cortes", selectedMesAno);
      const cutsDocSnap = await getDoc(cutsDocRef);

      if (cutsDocSnap.exists()) {
        const cutsData = cutsDocSnap.data() as SavedMonthCuts;
        if (cutsData.responsable) loadedResponsable = cutsData.responsable;
        if (cutsData.subgerente) loadedSubgerente = cutsData.subgerente;
        if (cutsData.fecha) loadedFecha = cutsData.fecha;
        setIncidentes(cutsData.incidentes || []);
        setCortesIsSavedInDb(true);
      } else {
        setIncidentes([]);
        setCortesIsSavedInDb(false);
      }

      // Consolidar responsable, subgerente y fecha de envío con valores cargados o valores actuales/por defecto
      if (loadedResponsable) setResponsable(loadedResponsable);
      if (loadedSubgerente) setSubgerente(loadedSubgerente);
      if (loadedFecha) setFechaEnvio(loadedFecha);

      setLoading(false);
    } catch (e) {
      console.error("Error al calcular o cargar el cierre:", e);
      setLoading(false);
    }
  };

  // ─── Guardar en la Base de Datos ───────────────────────────────────────────

  const handleSave = async () => {
    if (readOnly) return;
    if (!cineId) return;
    if (!(responsable || "").trim()) {
      Alert.alert("Error", "Por favor ingresá el nombre del responsable.");
      return;
    }

    setSaving(true);
    try {
      // Filtrar filas vacías y sanitizar antes de guardar en la BD
      const cleanInicial = stockInicial
        .filter((item) => (item?.modelo || "").trim() || (item?.serie || "").trim())
        .map((item) => ({
          modelo: (item?.modelo || "").trim(),
          serie: (item?.serie || "").trim(),
        }));

      const cleanFinal = stockFinal
        .filter((item) => (item?.modelo || "").trim() || (item?.serie || "").trim())
        .map((item) => ({
          modelo: (item?.modelo || "").trim(),
          serie: (item?.serie || "").trim(),
        }));

      const cleanRecepcion = recepcion
        .filter((item) => (item?.modelo || "").trim() || (item?.serie || "").trim())
        .map((item) => ({
          modelo: (item?.modelo || "").trim(),
          serie: (item?.serie || "").trim(),
        }));

      const cleanConsumo = consumo
        .filter((item) => (item?.modelo || "").trim() || (item?.serie || "").trim())
        .map((item) => ({
          modelo: (item?.modelo || "").trim(),
          serie: (item?.serie || "").trim(),
        }));

      const cleanPedido = pedido
        .filter(
          (item) =>
            (item?.marca || "").trim() ||
            (item?.modelo || "").trim() ||
            (item?.potencia || "").trim()
        )
        .map((item) => ({
          marca: (item?.marca || "").trim(),
          modelo: (item?.modelo || "").trim(),
          potencia: (item?.potencia || "").trim(),
          cantidad: Number(item?.cantidad) || 0,
          esSugerencia: !!item?.esSugerencia,
          sala: item?.sala !== undefined && item?.sala !== null ? Number(item.sala) : undefined,
          horasRestantes: item?.horasRestantes !== undefined && item?.horasRestantes !== null ? Number(item.horasRestantes) : undefined,
          lamparaId: item?.lamparaId || "",
        }));

      const docRef = doc(db, CINES_COLLECTION, cineId, "cierre_mes_lamparas", selectedMesAno);

      const payload: SavedMonthClose = {
        responsable: (responsable || "").trim(),
        subgerente: (subgerente || "").trim(),
        fecha: fechaEnvio || "",
        stockInicial: cleanInicial,
        stockFinal: cleanFinal,
        recepcion: cleanRecepcion,
        consumo: cleanConsumo,
        pedido: cleanPedido,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, payload);
      setIsSavedInDb(true);
      Alert.alert("Éxito", `El cierre de mes de ${formatMesAno(selectedMesAno)} ha sido guardado.`);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", `No se pudo guardar el cierre: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCortes = async () => {
    if (readOnly) return;
    if (!cineId) return;
    if (!(responsable || "").trim()) {
      Alert.alert("Error", "Por favor ingresá el nombre del responsable.");
      return;
    }

    setSavingCortes(true);
    try {
      const cleanIncidentes = incidentes
        .filter(
          (item) =>
            (item?.sala || "").trim() ||
            (item?.pelicula || "").trim() ||
            (item?.horario || "").trim() ||
            (item?.detalle || "").trim() ||
            (item?.solucion || "").trim() ||
            (item?.incidenteTopc || "").trim() ||
            (item?.tipoIncidente || "").trim()
        )
        .map((item) => ({
          sala: (item?.sala || "").trim(),
          fecha: (item?.fecha || "").trim(),
          pelicula: (item?.pelicula || "").trim(),
          horario: (item?.horario || "").trim(),
          detalle: (item?.detalle || "").trim(),
          solucion: (item?.solucion || "").trim(),
          incidenteTopc: (item?.incidenteTopc || "").trim(),
          tipoIncidente: (item?.tipoIncidente || "") as IncidentItem["tipoIncidente"],
        }));

      const docRef = doc(db, CINES_COLLECTION, cineId, "cierre_mes_cortes", selectedMesAno);

      const payload: SavedMonthCuts = {
        responsable: (responsable || "").trim(),
        subgerente: (subgerente || "").trim(),
        fecha: fechaEnvio || "",
        incidentes: cleanIncidentes,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(docRef, payload);
      setCortesIsSavedInDb(true);
      Alert.alert("Éxito", `El reporte de corte de ${formatMesAno(selectedMesAno)} ha sido guardado.`);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", `No se pudo guardar el reporte de cortes: ${e.message}`);
    } finally {
      setSavingCortes(false);
    }
  };

  // ─── Impresión a PDF / Replicando el Formato Oficial ───────────────────────

  const handlePrint = async () => {
    // Rellenamos dinámicamente hasta 10 filas para Inicial/Final/Recepción/Consumo
    // y hasta 4 para Pedidos, garantizando la estética exacta de la grilla del PDF.
    const padLamps = (list: LampItem[]): LampItem[] => {
      const copy = [...list];
      while (copy.length < 10) {
        copy.push({ modelo: "", serie: "" });
      }
      return copy;
    };

    const padOrders = (list: OrderItem[]): OrderItem[] => {
      const copy = [...list];
      while (copy.length < 4) {
        copy.push({ marca: "", modelo: "", potencia: "", cantidad: 0 });
      }
      return copy;
    };

    const printableInicial = padLamps(stockInicial);
    const printableFinal = padLamps(stockFinal);
    const printableRecepcion = padLamps(recepcion);
    const printableConsumo = padLamps(consumo);
    const printablePedido = padOrders(pedido);

    const mesFormatted = formatMesAno(selectedMesAno).toUpperCase();
    const fechaFormatted = dayjs(fechaEnvio).format("DD/MM/YYYY");
    const complejo = (cineId || "2004 - ABASTO").toUpperCase();
    const filename = `Cierre de Lámparas ${formatMesAno(selectedMesAno)} - ${complejo}`;

    // Filas para Tabla 1: Inicial y Final
    let table1RowsHtml = "";
    for (let i = 0; i < 10; i++) {
      const init = printableInicial[i];
      const fin = printableFinal[i];
      table1RowsHtml += `
        <tr>
          <td style="text-align: center; font-weight: bold; width: 6%;">${i + 1}</td>
          <td style="width: 22%;">${init.modelo}</td>
          <td style="width: 22%;">${init.serie}</td>
          <td style="width: 22%;">${fin.modelo}</td>
          <td style="width: 28%;">${fin.serie}</td>
        </tr>
      `;
    }

    // Filas para Tabla 2: Recepción y Consumo
    let table2RowsHtml = "";
    for (let i = 0; i < 10; i++) {
      const rec = printableRecepcion[i];
      const cons = printableConsumo[i];
      table2RowsHtml += `
        <tr>
          <td style="text-align: center; font-weight: bold; width: 6%;">${i + 1}</td>
          <td style="width: 22%;">${rec.modelo}</td>
          <td style="width: 22%;">${rec.serie}</td>
          <td style="width: 22%;">${cons.modelo}</td>
          <td style="width: 28%;">${cons.serie}</td>
        </tr>
      `;
    }

    // Filas para Tabla 3: Pedido de Lámparas
    let table3RowsHtml = "";
    for (let i = 0; i < 4; i++) {
      const ord = printablePedido[i];
      table3RowsHtml += `
        <tr>
          <td style="text-align: center; font-weight: bold; width: 6%;">${i + 1}</td>
          <td style="width: 28%;">${ord.marca}</td>
          <td style="width: 28%;">${ord.modelo}</td>
          <td style="width: 22%;">${ord.potencia}</td>
          <td style="text-align: center; width: 16%;">${ord.cantidad > 0 ? ord.cantidad : ""}</td>
        </tr>
      `;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <style>
    @page { size: auto; margin: 0mm; }
    body {
      font-family: 'Arial', sans-serif;
      margin: 0;
      padding: 0;
      color: #000;
      background-color: #FFF;
      font-size: 9.5pt;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .page {
      box-sizing: border-box;
      padding: 12mm 15mm 12mm 15mm;
      height: 297mm; /* A4 */
      width: 210mm;
      margin: 0 auto;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Cabecera / Pie Corporativo */
    .corporate-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 2px solid #890404;
      padding-top: 8px;
      margin-top: 20px;
    }
    .corporate-info {
      font-size: 8pt;
      color: #444;
      line-height: 1.4;
    }
    .corporate-logo {
      font-size: 15pt;
      font-weight: 900;
      color: #890404;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      font-style: italic;
    }

    h1 {
      font-size: 16pt;
      font-weight: bold;
      color: #890404;
      text-align: center;
      margin: 4px 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Tabla de Datos de Cabecera del Cierre */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .info-table td {
      padding: 4px 6px;
      border: 1px solid #CCC;
    }
    .info-table td.label {
      background-color: #F2F2F2;
      font-weight: bold;
      width: 18%;
      font-size: 8.5pt;
      text-transform: uppercase;
    }
    .info-table td.val {
      font-size: 9pt;
    }

    h2 {
      font-size: 14pt;
      font-weight: bold;
      color: #890404;
      margin: 10px 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Grillas y Tablas de Datos */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      table-layout: fixed;
    }
    .data-table th {
      border: 1.5px solid #000;
      background-color: #F2F2F2;
      color: #000;
      font-weight: bold;
      padding: 4px 6px;
      font-size: 8.5pt;
      text-align: left;
      text-transform: uppercase;
      word-break: break-word;
    }
    .data-table th.center-header {
      text-align: center;
    }
    .data-table td {
      border: 1px solid #777;
      padding: 4px 6px;
      font-size: 8.5pt;
      height: 16px;
      word-break: break-word;
    }

    /* Bloque de Firmas */
    .signatures-block {
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      padding: 0 15px;
    }
    .signature-line {
      width: 42%;
      border-top: 1px solid #000;
      text-align: center;
      padding-top: 6px;
      font-size: 9pt;
      margin-top: 40px;
      line-height: 1.3;
    }
  </style>
</head>
<body>

  <div class="page">
    <div>
      <h1>Cierre de Lámparas</h1>

      <table class="info-table">
        <tr>
          <td class="label">Cine:</td>
          <td class="val" style="font-weight: bold; width: 32%;">${complejo}</td>
          <td class="label" style="width: 18%;">Fecha:</td>
          <td class="val" style="width: 32%;">${fechaFormatted}</td>
        </tr>
        <tr>
          <td class="label">Responsable:</td>
          <td class="val">${responsable.toUpperCase()}</td>
          <td class="label">Mes Cierre:</td>
          <td class="val" style="font-weight: bold; color: #890404;">${mesFormatted}</td>
        </tr>
      </table>

      <!-- TABLA 1: INICIAL Y FINAL -->
      <table class="data-table">
        <thead>
          <tr>
            <th rowspan="2" class="center-header" style="width: 6%;">Item</th>
            <th colspan="2" class="center-header" style="width: 44%; border-right: 1.5px solid #000;">Inicial</th>
            <th colspan="2" class="center-header" style="width: 50%;">Final</th>
          </tr>
          <tr>
            <th>Modelo</th>
            <th style="border-right: 1.5px solid #000;">Número de Serie</th>
            <th>Modelo</th>
            <th>Número de Serie</th>
          </tr>
        </thead>
        <tbody>
          ${table1RowsHtml}
        </tbody>
      </table>

      <!-- TABLA 2: RECEPCIÓN Y CONSUMO -->
      <table class="data-table">
        <thead>
          <tr>
            <th rowspan="2" class="center-header" style="width: 6%;">Item</th>
            <th colspan="2" class="center-header" style="width: 44%; border-right: 1.5px solid #000;">Recepción</th>
            <th colspan="2" class="center-header" style="width: 50%;">Consumo</th>
          </tr>
          <tr>
            <th>Modelo</th>
            <th style="border-right: 1.5px solid #000;">Número de Serie</th>
            <th>Modelo</th>
            <th>Número de Serie</th>
          </tr>
        </thead>
        <tbody>
          ${table2RowsHtml}
        </tbody>
      </table>

      <!-- TABLA 3: PEDIDO DE LÁMPARAS -->
      <h2>Pedido de Lámparas</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th class="center-header" style="width: 6%;">Item</th>
            <th>Marca</th>
            <th>Modelo</th>
            <th>Potencia</th>
            <th class="center-header" style="width: 16%;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${table3RowsHtml}
        </tbody>
      </table>
    </div>

    <!-- FIRMAS AL PIE DE PÁGINA -->
    <div class="signatures-block">
      <div class="signature-line">
        FIRMA RESPONSABLE<br/>
        <strong>${responsable.toUpperCase()}</strong>
      </div>
      <div class="signature-line">
        FIRMA GERENTE PROYECCIÓN<br/>
        <strong>${subgerente.toUpperCase()}</strong>
      </div>
    </div>

    <!-- INFO CORPORATIVA EN FOOTER -->
    <div class="corporate-footer">
      <div class="corporate-info">
        Beruti 3399 5to Piso, Capital Federal<br/>
        Oficina Corporativa Cinemark<br/>
      </div>
      <div class="corporate-logo">CINEMARK</div>
    </div>
  </div>

</body>
</html>
`;

    try {
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          Alert.alert("Imprimir", "Habilitá las ventanas emergentes (popups) para poder imprimir el PDF.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        const doPrint = () => {
          printWindow.focus();
          printWindow.print();
        };

        if (printWindow.document.readyState === "complete") {
          doPrint();
        } else {
          printWindow.onload = doPrint;
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", `No se pudo generar la impresión: ${e.message}`);
    }
  };

  const handlePrintCortes = async () => {
    const mesFormatted = formatMesAno(selectedMesAno).toUpperCase();
    const fechaFormatted = dayjs(fechaEnvio).format("DD/MM/YYYY");
    const complejo = (cineId || "2004 - ABASTO").toUpperCase();
    const filename = `Reporte de corte mensual ${formatMesAno(selectedMesAno)} - ${complejo}`;

    let tableRowsHtml = "";
    if (incidentes.length === 0) {
      tableRowsHtml = `
        <tr>
          <td colspan="8" class="no-incidents">
            No se registraron incidentes ni cortes de sesión en este período mensual.
          </td>
        </tr>
      `;
    } else {
      tableRowsHtml = incidentes
        .map(
          (inc) => `
        <tr>
          <td style="text-align: center; font-weight: bold;">${inc.sala || ""}</td>
          <td style="text-align: center;">${inc.fecha ? dayjs(inc.fecha).format("DD/MM/YYYY") : ""}</td>
          <td>${inc.pelicula || ""}</td>
          <td style="text-align: center;">${inc.horario || ""}</td>
          <td>${inc.detalle || ""}</td>
          <td>${inc.solucion || ""}</td>
          <td style="text-align: center; font-family: monospace;">${inc.incidenteTopc || ""}</td>
          <td style="font-weight: 500;">${inc.tipoIncidente || ""}</td>
        </tr>
      `
        )
        .join("");
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <style>
    @page { size: auto; margin: 0mm; }
    body {
      font-family: 'Arial', sans-serif;
      margin: 0;
      padding: 0;
      color: #000;
      background-color: #FFF;
      font-size: 8.5pt;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .page {
      box-sizing: border-box;
      padding: 12mm 15mm 12mm 15mm;
      min-height: 297mm; /* A4 */
      width: 210mm;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Cabecera / Pie Corporativo */
    .corporate-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 2px solid #890404;
      padding-top: 8px;
      margin-top: 20px;
    }
    .corporate-info {
      font-size: 7.5pt;
      color: #444;
      line-height: 1.3;
    }
    .corporate-logo {
      font-size: 15pt;
      font-weight: 900;
      color: #890404;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      font-style: italic;
    }

    h1 {
      font-size: 15pt;
      font-weight: bold;
      color: #890404;
      text-align: center;
      margin: 4px 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Tabla de Datos de Cabecera */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .info-table td {
      padding: 4px 6px;
      border: 1px solid #CCC;
    }
    .info-table td.label {
      background-color: #F2F2F2;
      font-weight: bold;
      width: 18%;
      font-size: 8pt;
      text-transform: uppercase;
    }
    .info-table td.val {
      font-size: 8.5pt;
    }

    /* Grillas y Tablas de Datos */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      table-layout: fixed;
    }
    .data-table th {
      border: 1.5px solid #000;
      background-color: #890404;
      color: #FFF;
      font-weight: bold;
      padding: 6px 4px;
      font-size: 8pt;
      text-align: center;
      text-transform: uppercase;
      word-break: break-word;
    }
    .data-table td {
      border: 1px solid #777;
      padding: 6px 4px;
      font-size: 8pt;
      vertical-align: top;
      word-break: break-word;
    }
    .no-incidents {
      text-align: center;
      font-style: italic;
      color: #555;
      padding: 20px !important;
      font-size: 9.5pt;
    }

    /* Bloque de Firmas */
    .signatures-block {
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      padding: 0 15px;
    }
    .signature-line {
      width: 42%;
      border-top: 1px solid #000;
      text-align: center;
      padding-top: 6px;
      font-size: 8.5pt;
      margin-top: 40px;
      line-height: 1.3;
    }
  </style>
</head>
<body>

  <div class="page">
    <div>
      <h1>Reporte de Corte Mensual</h1>

      <table class="info-table">
        <tr>
          <td class="label">Cine:</td>
          <td class="val" style="font-weight: bold; width: 32%;">${complejo}</td>
          <td class="label" style="width: 18%;">Fecha:</td>
          <td class="val" style="width: 32%;">${fechaFormatted}</td>
        </tr>
        <tr>
          <td class="label">Responsable:</td>
          <td class="val">${responsable.toUpperCase()}</td>
          <td class="label">Mes Cierre:</td>
          <td class="val" style="font-weight: bold; color: #890404;">${mesFormatted}</td>
        </tr>
      </table>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 8%;">Sala</th>
            <th style="width: 10%;">Fecha</th>
            <th style="width: 16%;">Película</th>
            <th style="width: 10%;">Horario</th>
            <th style="width: 22%;">Detalle de incidente</th>
            <th style="width: 22%;">Solución del incidente</th>
            <th style="width: 12%;">Incidente TOPC</th>
            <th style="width: 12%;">Tipo de Incidente</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>

    <!-- FIRMAS AL PIE DE PÁGINA -->
    <div class="signatures-block">
      <div class="signature-line">
        FIRMA RESPONSABLE<br/>
        <strong>${responsable.toUpperCase()}</strong>
      </div>
      <div class="signature-line">
        FIRMA GERENTE PROYECCIÓN<br/>
        <strong>${subgerente.toUpperCase()}</strong>
      </div>
    </div>

    <!-- INFO CORPORATIVA EN FOOTER -->
    <div class="corporate-footer">
      <div class="corporate-info">
        Beruti 3399 5to Piso, Capital Federal<br/>
        Oficina Corporativa Cinemark<br/>
      </div>
      <div class="corporate-logo">CINEMARK</div>
    </div>
  </div>

</body>
</html>
    `;

    try {
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          Alert.alert("Imprimir", "Habilitá las ventanas emergentes (popups) para poder imprimir el PDF.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        const doPrint = () => {
          printWindow.focus();
          printWindow.print();
        };

        if (printWindow.document.readyState === "complete") {
          doPrint();
        } else {
          printWindow.onload = doPrint;
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", `No se pudo generar la impresión: ${e.message}`);
    }
  };

  // ─── Helpers de Formato ────────────────────────────────────────────────────

  function formatMesAno(mesAnoStr: string) {
    if (!mesAnoStr) return "";
    const [y, m] = mesAnoStr.split("-");
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }

  // ─── Modificar Grilla Manualmente ──────────────────────────────────────────

  const handleUpdateItem = (
    table: "inicial" | "final" | "recepcion" | "consumo",
    index: number,
    field: "modelo" | "serie",
    value: string
  ) => {
    const setters = {
      inicial: { list: stockInicial, set: setStockInicial },
      final: { list: stockFinal, set: setStockFinal },
      recepcion: { list: recepcion, set: setRecepcion },
      consumo: { list: consumo, set: setConsumo },
    };

    const { list, set } = setters[table];
    const copy = [...list];

    // Asegurar que exista el índice
    while (copy.length <= index) {
      copy.push({ modelo: "", serie: "" });
    }

    copy[index] = { ...copy[index], [field]: value };
    set(copy);
  };

  const handleUpdateOrder = (index: number, field: keyof OrderItem, value: any) => {
    const copy = [...pedido];
    while (copy.length <= index) {
      copy.push({ marca: "", modelo: "", potencia: "", cantidad: 0 });
    }
    copy[index] = { ...copy[index], [field]: value };
    setPedido(copy);
  };

  const handleAddRow = (table: "inicial" | "final" | "recepcion" | "consumo") => {
    const setters = {
      inicial: setStockInicial,
      final: setStockFinal,
      recepcion: setRecepcion,
      consumo: setConsumo,
    };
    setters[table]((prev) => [...prev, { modelo: "", serie: "" }]);
  };

  const handleAddOrderRow = () => {
    setPedido((prev) => [
      ...prev,
      { marca: "", modelo: "", potencia: "", cantidad: 1 },
    ]);
  };

  const handleDeleteRow = (table: "inicial" | "final" | "recepcion" | "consumo", index: number) => {
    const listMap = {
      inicial: stockInicial,
      final: stockFinal,
      recepcion: recepcion,
      consumo: consumo,
    };
    const item = listMap[table]?.[index];
    const itemInfo = item && (item.modelo || item.serie)
      ? `${item.modelo || "Lámpara sin modelo"} (Serie: ${item.serie || "S/D"})`
      : "esta fila vacía";

    setDeleteConfirmModal({
      table,
      index,
      itemInfo,
    });
  };

  const handleDeleteOrderRow = (index: number) => {
    const item = pedido[index];
    const itemInfo = item && (item.modelo || item.marca)
      ? `${item.marca || ""} ${item.modelo || "Lámpara sin modelo"} (${item.potencia || "3000W"}, Cantidad: ${item.cantidad || 0})`
      : "esta fila vacía de pedido";

    setDeleteConfirmModal({
      table: "pedido",
      index,
      itemInfo,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmModal) return;
    const { table, index } = deleteConfirmModal;

    if (table === "pedido") {
      setPedido((prev) => prev.filter((_, i) => i !== index));
    } else if (table === "incidente") {
      setIncidentes((prev) => prev.filter((_, i) => i !== index));
    } else {
      const setters = {
        inicial: setStockInicial,
        final: setStockFinal,
        recepcion: setRecepcion,
        consumo: setConsumo,
      };
      setters[table]((prev) => prev.filter((_, i) => i !== index));
    }
    setDeleteConfirmModal(null);
  };

  const handleAddIncidentRow = () => {
    setIncidentes((prev) => [
      ...prev,
      {
        sala: "",
        fecha: dayjs().format("YYYY-MM-DD"),
        pelicula: "",
        horario: "",
        detalle: "",
        solucion: "",
        incidenteTopc: "",
        tipoIncidente: "",
      },
    ]);
  };

  const handleUpdateIncident = (index: number, field: keyof IncidentItem, value: string) => {
    const copy = [...incidentes];
    while (copy.length <= index) {
      copy.push({
        sala: "",
        fecha: dayjs().format("YYYY-MM-DD"),
        pelicula: "",
        horario: "",
        detalle: "",
        solucion: "",
        incidenteTopc: "",
        tipoIncidente: "",
      });
    }
    copy[index] = { ...copy[index], [field]: value };
    setIncidentes(copy);
  };

  const handleDeleteIncidentRow = (index: number) => {
    const item = incidentes[index];
    const itemInfo = item && (item.sala || item.pelicula)
      ? `el Incidente #${index + 1} (Sala: ${item.sala || "S/D"}, Película: ${item.pelicula || "S/D"})`
      : `el Incidente #${index + 1}`;

    setDeleteConfirmModal({
      table: "incidente",
      index,
      itemInfo,
    });
  };

  // Sugerencias calculadas a partir del último control semanal e independientemente del estado 'pedido'
  const sugerenciasDetectadas = useMemo(() => {
    const suggestionsList: OrderItem[] = [];

    if (latestControl?.lamparas) {
      latestControl.lamparas.forEach((controlLamp: any) => {
        const roomNum = controlLamp.sala;
        const remainingHours = parseInt(controlLamp.horasRestantes || "9999", 10);

        if (remainingHours < 400) {
          const activeLamp = lamparasRaw.find(
            (l) => l.status === "activa" && l.sala === roomNum
          );

          suggestionsList.push({
            marca: activeLamp?.marca || "Genérica",
            modelo: activeLamp?.modelo || activeLamp?.potencia || controlLamp.potencia || "Lámpara",
            potencia: activeLamp?.potencia || controlLamp.potencia || "3000W",
            cantidad: 1,
            esSugerencia: true,
            sala: roomNum,
            horasRestantes: remainingHours,
            lamparaId: activeLamp?.id || "N/A",
          });
        }
      });
    }
    return suggestionsList;
  }, [latestControl, lamparasRaw]);

  const suggestedLampsCount = sugerenciasDetectadas.length;

  const allSuggestionsAdded = useMemo(() => {
    if (sugerenciasDetectadas.length === 0) return false;

    // Contar cuántas sugerencias hay de cada modelo
    const suggCounts: Record<string, number> = {};
    sugerenciasDetectadas.forEach((s) => {
      const modelKey = s.modelo.trim().toLowerCase();
      suggCounts[modelKey] = (suggCounts[modelKey] || 0) + 1;
    });

    // Verificar si en `pedido` existen esos modelos con al menos la cantidad sugerida
    return Object.entries(suggCounts).every(([modelKey, requiredQty]) => {
      const matchingOrder = pedido.find(
        (item) => item.modelo.trim().toLowerCase() === modelKey
      );
      return matchingOrder && matchingOrder.cantidad >= requiredQty;
    });
  }, [sugerenciasDetectadas, pedido]);

  const handleAddAllSuggestions = () => {
    if (sugerenciasDetectadas.length === 0) return;

    setPedido((prev) => {
      // 1. Filtrar y quedarnos con los pedidos manuales (los que no son sugerencia)
      const manualOrders = prev.filter((item) => !item.esSugerencia);

      // 2. Agrupar todas las sugerencias detectadas por modelo
      const groupedSuggestions: OrderItem[] = [];
      sugerenciasDetectadas.forEach((sug) => {
        const existingIdx = groupedSuggestions.findIndex(
          (item) => item.modelo.trim().toLowerCase() === sug.modelo.trim().toLowerCase()
        );
        if (existingIdx !== -1) {
          groupedSuggestions[existingIdx].cantidad += 1;
        } else {
          groupedSuggestions.push({ ...sug });
        }
      });

      // 3. Unir pedidos manuales con todas las sugerencias agrupadas
      return [...manualOrders, ...groupedSuggestions];
    });
  };

  // ─── RENDERS DE SUB-TABLAS INTERACTIVAS ────────────────────────────────────

  const renderSideBySideTable = (
    titleLeft: string,
    listLeft: LampItem[],
    tableKeyLeft: "inicial" | "recepcion",
    titleRight: string,
    listRight: LampItem[],
    tableKeyRight: "final" | "consumo"
  ) => {
    const isRowLayout = Platform.OS === "web" && width >= 1024;

    const renderColumnContent = (
      title: string,
      list: LampItem[],
      tableKey: "inicial" | "recepcion" | "final" | "consumo"
    ) => {
      const displayList = [...list, { modelo: "", serie: "" }];

      const grid = (
        <View style={s.tableGrid}>
          {/* Header */}
          <View style={s.gridRowHeader}>
            <View style={{ flex: 0.8, justifyContent: "center", alignItems: "center" }}>
              <Text style={s.gridTh}>#</Text>
            </View>
            <View style={{ flex: 4, justifyContent: "center", paddingLeft: 8 }}>
              <Text style={s.gridTh}>Modelo</Text>
            </View>
            <View style={{ flex: 5.2, justifyContent: "center", paddingLeft: 8 }}>
              <Text style={s.gridTh}>Nº Serie</Text>
            </View>
            <View style={{ flex: 1.2 }} />
          </View>

          {/* Rows */}
          {displayList.map((item, idx) => {
            return (
              <View key={`${tableKey}-${idx}`} style={[s.gridRow, idx % 2 === 1 && s.gridRowAlt]}>
                {/* # */}
                <View style={{ flex: 0.8, justifyContent: "center", alignItems: "center", minHeight: 28 }}>
                  <Text style={[s.gridTd, { textAlign: "center", fontWeight: "bold", paddingHorizontal: 0 }]}>
                    {idx + 1}
                  </Text>
                </View>

                {/* Modelo */}
                <View style={{ flex: 4, justifyContent: "center" }}>
                  <ModelSelectCell
                    value={item.modelo}
                    onChange={(val) => handleUpdateItem(tableKey, idx, "modelo", val)}
                    style={[s.gridInput, { width: "100%" }]}
                    placeholder="EJ: DXL-30BAF/L"
                  />
                </View>

                {/* Nº Serie */}
                <View style={{ flex: 5.2, justifyContent: "center" }}>
                  <TextInput
                    value={item.serie}
                    onChangeText={(val) => handleUpdateItem(tableKey, idx, "serie", val.toUpperCase())}
                    style={[s.gridInput, { width: "100%", fontWeight: "500" }]}
                    placeholder="EJ: ABC123"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>

                {/* Delete action */}
                <View style={{ flex: 1.2, justifyContent: "center", alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() => handleDeleteRow(tableKey, idx)}
                    style={s.rowDeleteBtn}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      );

      return (
        <View style={[s.sideColumn, isRowLayout ? { flex: 1 } : { width: "100%" }]}>
          <View style={s.tableHeaderBox}>
            <Text style={s.tableHeaderTitle}>{title}</Text>
          </View>

          {isMobile ? (
            <View style={{ gap: 12 }}>
              {displayList.map((item, idx) => {
                return (
                  <View key={`${tableKey}-${idx}`} style={s.mobileCard}>
                    <View style={s.mobileCardHeader}>
                      <Text style={s.mobileCardNumber}>Item #{idx + 1}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteRow(tableKey, idx)}
                        style={s.rowDeleteBtn}
                      >
                        <MaterialCommunityIcons name="close-circle-outline" size={18} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                    <View style={s.mobileCardBody}>
                      <View style={s.mobileField}>
                        <Text style={s.mobileLabel}>Modelo</Text>
                        <View style={s.mobileSelectWrapper}>
                          <ModelSelectCell
                            value={item.modelo}
                            onChange={(val) => handleUpdateItem(tableKey, idx, "modelo", val)}
                            style={s.mobileSelectCell}
                            placeholder="Seleccionar..."
                          />
                        </View>
                      </View>
                      <View style={s.mobileField}>
                        <Text style={s.mobileLabel}>Nº Serie</Text>
                        <TextInput
                          value={item.serie}
                          onChangeText={(val) => handleUpdateItem(tableKey, idx, "serie", val.toUpperCase())}
                          style={s.mobileInput}
                          placeholder="EJ: ABC123"
                          placeholderTextColor={COLORS.muted}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            grid
          )}
        </View>
      );
    };

    return (
      <View style={[s.sideBySideContainer, { flexDirection: isRowLayout ? "row" : "column" }]}>
        {renderColumnContent(titleLeft, listLeft, tableKeyLeft)}
        {renderColumnContent(titleRight, listRight, tableKeyRight)}
      </View>
    );
  };

  const renderPedidoGridContent = () => {
    return (
      <>
        <View style={s.gridRowHeader}>
          <View style={{ flex: 0.8, justifyContent: "center", alignItems: "center" }}>
            <Text style={s.gridTh}>#</Text>
          </View>
          <View style={{ flex: 2.5, justifyContent: "center", alignItems: "center" }}>
            <Text style={s.gridTh}>Marca</Text>
          </View>
          <View style={{ flex: 3.5, justifyContent: "center", alignItems: "center" }}>
            <Text style={s.gridTh}>Modelo</Text>
          </View>
          <View style={{ flex: 2.2, justifyContent: "center", alignItems: "center" }}>
            <Text style={s.gridTh}>Potencia</Text>
          </View>
          <View style={{ flex: 1.5, justifyContent: "center", alignItems: "center" }}>
            <Text style={s.gridTh}>Cant.</Text>
          </View>
          <View style={{ flex: 1.2 }} />
        </View>

        {pedido.map((item, idx) => (
          <View key={`order-${idx}`} style={[s.gridRow, idx % 2 === 1 && s.gridRowAlt]}>
            {/* # */}
            <View style={{ flex: 0.8, alignItems: "center", justifyContent: "center", minHeight: 28 }}>
              <Text style={[s.gridTd, { textAlign: "center", fontWeight: "bold", paddingHorizontal: 0 }]}>
                {idx + 1}
              </Text>
              {item.esSugerencia && (
                <Text style={{ fontSize: 6, fontWeight: "900", color: COLORS.primary, marginTop: -2, letterSpacing: -0.2, textTransform: "uppercase" }}>
                  Sugerencia
                </Text>
              )}
            </View>

            {/* Marca */}
            <View style={{ flex: 2.5, justifyContent: "center" }}>
              <TextInput
                value={item.marca}
                onChangeText={(val) => handleUpdateOrder(idx, "marca", val)}
                style={[s.gridInput, { textAlign: "center", width: "100%" }]}
                placeholder="EJ: USHIO"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            {/* Modelo */}
            <View style={{ flex: 3.5, justifyContent: "center" }}>
              <ModelSelectCell
                value={item.modelo}
                onChange={(val) => handleUpdateOrder(idx, "modelo", val)}
                style={[s.gridInput, { textAlign: "center", width: "100%" }]}
                placeholder="EJ: DXL-30BAF/L"
              />
            </View>

            {/* Potencia */}
            <View style={{ flex: 2.2, justifyContent: "center" }}>
              <TextInput
                value={item.potencia}
                onChangeText={(val) => handleUpdateOrder(idx, "potencia", val)}
                style={[s.gridInput, { textAlign: "center", width: "100%" }]}
                placeholder="EJ: 3000W"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            {/* Cant. */}
            <View style={{ flex: 1.5, justifyContent: "center" }}>
              <TextInput
                value={String(item.cantidad)}
                onChangeText={(val) => handleUpdateOrder(idx, "cantidad", parseInt(val, 10) || 0)}
                keyboardType="numeric"
                style={[s.gridInput, { textAlign: "center", width: "100%" }]}
              />
            </View>

            {/* Delete button */}
            <View style={{ flex: 1.2, justifyContent: "center", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => handleDeleteOrderRow(idx)}
                style={s.rowDeleteBtn}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {pedido.length === 0 && (
          <View style={s.emptyOrderBox}>
            <Text style={s.emptyOrderText}>No hay pedidos de lámparas cargados.</Text>
          </View>
        )}
      </>
    );
  };

  // ─── RENDERS PRINCIPALES ───────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Cargando datos del cierre de mes…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Menú de Subpestañas superior */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === "CIERRE_LAMPARAS" && s.tabBtnActive]}
          onPress={() => setActiveTab("CIERRE_LAMPARAS")}
        >
          <MaterialCommunityIcons
            name="lightbulb-on-outline"
            size={18}
            color={activeTab === "CIERRE_LAMPARAS" ? "#FFF" : COLORS.muted}
          />
          <Text style={[s.tabBtnText, activeTab === "CIERRE_LAMPARAS" && s.tabBtnTextActive, { fontSize: isMobile ? 11 : 13 }]}>
            Cierre de Lámparas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.tabBtn, activeTab === "CORTE_MENSUAL" && s.tabBtnActive]}
          onPress={() => setActiveTab("CORTE_MENSUAL")}
        >
          <MaterialCommunityIcons
            name="chart-bar"
            size={18}
            color={activeTab === "CORTE_MENSUAL" ? "#FFF" : COLORS.muted}
          />
          <Text style={[s.tabBtnText, activeTab === "CORTE_MENSUAL" && s.tabBtnTextActive, { fontSize: isMobile ? 11 : 13 }]}>
            Reporte de corte mensual
          </Text>
        </TouchableOpacity>
      </View>

      {/* CONTENIDO DE LAS PESTAÑAS */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Selector superior de Mes / Año y Responsable */}
        <View style={s.selectorCard}>
          <View style={[s.selectorRow, isMobile && { flexDirection: "column", gap: 12, alignItems: "stretch" }]}>

            {/* Selector de Mes */}
            <View style={isMobile ? { width: "100%" } : { flex: 1.2 }}>
              <Text style={s.selectorLabel}>Mes de Cierre</Text>
              <View style={s.pickerWrapper}>
                <select
                  value={selectedMesAno}
                  onChange={(e) => setSelectedMesAno(e.target.value)}
                  style={s.webPicker}
                >
                  {mesesOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </View>
            </View>

            {/* Responsable */}
            <View style={isMobile ? { width: "100%" } : { flex: 1.5 }}>
              <Text style={s.selectorLabel}>Responsable del Cierre *</Text>
              <TextInput
                value={responsable}
                onChangeText={(val) => setResponsable(val.toUpperCase())}
                placeholder="Ingresá tu nombre"
                placeholderTextColor={COLORS.muted}
                style={s.inputField}
                editable={!readOnly}
              />
            </View>

            {/* Subgerente */}
            <View style={isMobile ? { width: "100%" } : { flex: 1.5 }}>
              <Text style={s.selectorLabel}>Subgerente Responsable</Text>
              <TextInput
                value={subgerente}
                onChangeText={setSubgerente}
                placeholder="Ej: VICTOR DIAZ"
                placeholderTextColor={COLORS.muted}
                style={s.inputField}
                editable={!readOnly}
              />
            </View>

            {/* Fecha Envío */}
            <View style={isMobile ? { width: "100%" } : { flex: 1 }}>
              <Text style={s.selectorLabel}>Fecha de Envío</Text>
              <TextInput
                value={fechaEnvio}
                onChangeText={setFechaEnvio}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.muted}
                style={[s.inputField, { fontFamily: "monospace" }]}
                editable={!readOnly}
              />
            </View>
          </View>

          {isSavedInDb && (
            <View style={s.savedIndicator}>
              <MaterialCommunityIcons name="check-decagram" size={16} color={COLORS.success} />
              <Text style={s.savedIndicatorText}>
                Este cierre ya está guardado en la base de datos (congelado).
              </Text>
            </View>
          )}
        </View>

        {/* PESTAÑA A: CIERRE DE LÁMPARAS */}
        {activeTab === "CIERRE_LAMPARAS" && (
          <View style={{ gap: 20 }}>
            <View pointerEvents={readOnly ? "none" : "auto"}>

            {/* Banner Informativo */}
            <View style={s.bannerInfo}>
              <MaterialCommunityIcons name="information" size={20} color="#1E40AF" style={{ marginRight: 8 }} />
              <Text style={s.bannerText}>
                Las listas de <Text style={{ fontWeight: "700" }}>Recepción</Text> y <Text style={{ fontWeight: "700" }}>Consumo</Text> se cargan a partir de los movimientos registrados este mes. El <Text style={{ fontWeight: "700" }}>Stock Inicial</Text> toma el Stock Final del mes anterior. Podés ajustar cualquier celda libremente antes de guardar o imprimir.
              </Text>
            </View>

            {/* GRILLA 1: STOCK INICIAL & STOCK FINAL */}
            {renderSideBySideTable(
              "Stock Inicial (Principio de Mes)",
              stockInicial,
              "inicial",
              "Stock Final (Cierre de Mes)",
              stockFinal,
              "final"
            )}

            {/* GRILLA 2: RECEPCIÓN & CONSUMO */}
            {renderSideBySideTable(
              "Recepción (Lámparas Nuevas)",
              recepcion,
              "recepcion",
              "Consumo (Instaladas en Salas)",
              consumo,
              "consumo"
            )}

            {/* GRILLA 3: PEDIDO DE LÁMPARAS */}
            <View style={s.pedidoCard}>
              <View style={s.tableHeaderBox}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={20} color={COLORS.primary} />
                  <Text style={s.tableHeaderTitle}>Pedido de Lámparas</Text>
                </View>
                <TouchableOpacity onPress={handleAddOrderRow} style={s.addBtnCompact}>
                  <MaterialCommunityIcons name="plus" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* Banner de sugerencias automáticas */}
              <View style={[s.suggestionBanner, suggestedLampsCount > 0 ? s.suggestionAlert : s.suggestionNone, { flexDirection: "column", alignItems: "stretch" }]}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <MaterialCommunityIcons
                    name={suggestedLampsCount > 0 ? "alert-circle" : "check-circle"}
                    size={18}
                    color={suggestedLampsCount > 0 ? "#854D0E" : "#166534"}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[s.suggestionBannerText, { color: suggestedLampsCount > 0 ? "#854D0E" : "#166534" }]}>
                    {suggestedLampsCount > 0
                      ? `Se detectaron ${suggestedLampsCount} lámparas activas con menos de 400 horas restantes en el último control semanal:`
                      : "No hay lámparas activas en proyectores con menos de 400 horas de uso restantes. No se generaron sugerencias automáticas."}
                  </Text>
                </View>

                {suggestedLampsCount > 0 && (
                  <>
                    <View style={{ marginTop: 8, paddingLeft: 26, gap: 4, borderTopWidth: 0.5, borderTopColor: "#EAB308", paddingTop: 8 }}>
                      {sugerenciasDetectadas.map((p, i) => (
                        <Text key={i} style={{ fontSize: 12, color: "#854D0E", fontWeight: "700" }}>
                          • Sala {p.sala}: Lámpara {p.lamparaId || "S/D"} ({p.marca} {p.potencia}) — Quedan <Text style={{ textDecorationLine: "underline" }}>{p.horasRestantes} horas</Text> restantes.
                        </Text>
                      ))}
                    </View>

                    <View style={{ marginTop: 12, paddingLeft: 26, alignItems: "flex-start" }}>
                      <TouchableOpacity
                        onPress={handleAddAllSuggestions}
                        disabled={allSuggestionsAdded}
                        style={[
                          s.btnSugerencia,
                          { paddingVertical: 7, paddingHorizontal: 16 },
                          allSuggestionsAdded && { backgroundColor: "transparent", borderWidth: 1, borderColor: "#854D0E" }
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={allSuggestionsAdded ? "check" : "plus-box-outline"}
                          size={16}
                          color={allSuggestionsAdded ? "#854D0E" : "#FFF"}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[s.btnSugerenciaText, { fontSize: 11.5 }, allSuggestionsAdded && { color: "#854D0E" }]}>
                          {allSuggestionsAdded ? "Sugerencias agregadas al pedido" : "Agregar todas las sugerencias al pedido"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>

              <View style={{ width: "100%" }}>
                {isMobile ? (
                  <View style={{ gap: 12, marginTop: 10 }}>
                    {pedido.map((item, idx) => (
                      <View key={`order-${idx}`} style={s.mobileCard}>
                        <View style={s.mobileCardHeader}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={s.mobileCardNumber}>Item #{idx + 1}</Text>
                            {item.esSugerencia && (
                              <View style={{ backgroundColor: COLORS.primary + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9, fontWeight: "900", color: COLORS.primary, letterSpacing: -0.2, textTransform: "uppercase" }}>
                                  Sugerencia
                                </Text>
                              </View>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteOrderRow(idx)}
                            style={s.rowDeleteBtn}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>

                        <View style={s.mobileCardBody}>
                          <View style={s.mobileField}>
                            <Text style={s.mobileLabel}>Marca</Text>
                            <TextInput
                              value={item.marca}
                              onChangeText={(val) => handleUpdateOrder(idx, "marca", val)}
                              style={s.mobileInput}
                              placeholder="EJ: USHIO"
                              placeholderTextColor={COLORS.muted}
                            />
                          </View>

                          <View style={s.mobileField}>
                            <Text style={s.mobileLabel}>Modelo</Text>
                            <View style={s.mobileSelectWrapper}>
                              <ModelSelectCell
                                value={item.modelo}
                                onChange={(val) => handleUpdateOrder(idx, "modelo", val)}
                                style={s.mobileSelectCell}
                                placeholder="Seleccionar..."
                              />
                            </View>
                          </View>

                          <View style={[s.selectorRow, { gap: 12, marginTop: 4 }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.mobileLabel}>Potencia</Text>
                              <TextInput
                                value={item.potencia}
                                onChangeText={(val) => handleUpdateOrder(idx, "potencia", val)}
                                style={[s.mobileInput, { textAlign: "center" }]}
                                placeholder="EJ: 3000W"
                                placeholderTextColor={COLORS.muted}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.mobileLabel}>Cant.</Text>
                              <TextInput
                                value={String(item.cantidad)}
                                onChangeText={(val) => handleUpdateOrder(idx, "cantidad", parseInt(val, 10) || 0)}
                                keyboardType="numeric"
                                style={[s.mobileInput, { textAlign: "center" }]}
                              />
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}

                    {pedido.length === 0 && (
                      <View style={s.emptyOrderBox}>
                        <Text style={s.emptyOrderText}>No hay pedidos de lámparas cargados.</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={[s.tableGrid, { marginTop: 10 }]}>
                    {renderPedidoGridContent()}
                  </View>
                )}
              </View>
            </View>

            </View>

            {/* BOTONES DE ACCIONES */}
            <View style={[s.actionRow, isMobile && { flexDirection: "column", gap: 12, width: "100%", alignSelf: "center" }]}>
              {!readOnly && (
                <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="database-outline" size={20} color="#FFF" />
                      <Text style={s.actionBtnText}>Guardar en BD</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.printBtn} onPress={handlePrint}>
                <MaterialCommunityIcons name="printer-outline" size={20} color="#FFF" />
                <Text style={s.actionBtnText}>Imprimir / Generar PDF</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}

        {/* PESTAÑA B: REPORTE DE CORTE MENSUAL */}
        {activeTab === "CORTE_MENSUAL" && (
          <View style={{ gap: 20 }}>
            <View pointerEvents={readOnly ? "none" : "auto"}>
            {/* Banner Informativo */}
            <View style={s.bannerInfo}>
              <MaterialCommunityIcons name="information" size={20} color="#1E40AF" style={{ marginRight: 8 }} />
              <Text style={s.bannerText}>
                Registrá los cortes o suspensiones ocurridas durante el mes de <Text style={{ fontWeight: "700" }}>{formatMesAno(selectedMesAno)}</Text>. Si no hubo ningún inconveniente, podés dejar la lista vacía para enviar el informe sin incidentes.
              </Text>
            </View>

            {cortesIsSavedInDb && (
              <View style={[s.savedIndicator, { marginHorizontal: 0, marginTop: 0 }]}>
                <MaterialCommunityIcons name="check-decagram" size={16} color={COLORS.success} />
                <Text style={s.savedIndicatorText}>
                  Este reporte de cortes ya está guardado en la base de datos (congelado).
                </Text>
              </View>
            )}

            <View style={s.incidentContainer}>
              {incidentes.map((item, idx) => (
                <View key={`incident-${idx}`} style={s.incidentCard}>
                  <View style={s.incidentHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MaterialCommunityIcons name="alert-decagram-outline" size={18} color={COLORS.primary} />
                      <Text style={s.incidentTitle}>Incidente #{idx + 1}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteIncidentRow(idx)}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="close-circle-outline" size={20} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={[s.incidentBody, { flexDirection: Platform.OS === "web" && width >= 1024 ? "row" : "column", gap: 16 }]}>
                    {/* Columna Izquierda: Datos Básicos */}
                    <View style={Platform.OS === "web" && width >= 1024 ? { flex: 1, gap: 12 } : { gap: 12 }}>
                      <View style={[s.incidentRowLayout, isMobile && { flexDirection: "column", gap: 12 }]}>
                        <View style={isMobile ? { width: "100%", gap: 6 } : { flex: 1, gap: 6 }}>
                          <Text style={s.fieldLabel}>Sala *</Text>
                          <View style={s.selectWrapper}>
                            {Platform.OS === "web" ? (
                              <select
                                value={item.sala}
                                onChange={(e) => handleUpdateIncident(idx, "sala", e.target.value)}
                                style={s.formSelect}
                              >
                                <option value="" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.muted }}>Seleccionar...</option>
                                {salaOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value} style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <TextInput
                                value={item.sala}
                                onChangeText={(val) => handleUpdateIncident(idx, "sala", val)}
                                style={[s.formInput, { height: "100%", borderWidth: 0 }]}
                                placeholder="Ej: 5 o TODAS"
                                placeholderTextColor={COLORS.muted}
                              />
                            )}
                          </View>
                        </View>

                        <View style={isMobile ? { width: "100%", gap: 6 } : { flex: 1.2, gap: 6 }}>
                          <Text style={s.fieldLabel}>Fecha *</Text>
                          <TextInput
                            value={item.fecha}
                            onChangeText={(val) => handleUpdateIncident(idx, "fecha", val)}
                            style={s.formInput}
                            placeholder="AAAA-MM-DD"
                            placeholderTextColor={COLORS.muted}
                          />
                        </View>
                      </View>

                      <View style={[s.incidentRowLayout, isMobile && { flexDirection: "column", gap: 12 }]}>
                        <View style={isMobile ? { width: "100%", gap: 6 } : { flex: 1.4, gap: 6 }}>
                          <Text style={s.fieldLabel}>Película *</Text>
                          <TextInput
                            value={item.pelicula}
                            onChangeText={(val) => handleUpdateIncident(idx, "pelicula", val)}
                            style={s.formInput}
                            placeholder="Ej: Proyecto Fin de Mundo"
                            placeholderTextColor={COLORS.muted}
                          />
                        </View>

                        <View style={isMobile ? { width: "100%", gap: 6 } : { flex: 1, gap: 6 }}>
                          <Text style={s.fieldLabel}>Horario *</Text>
                          <TextInput
                            value={item.horario}
                            onChangeText={(val) => handleUpdateIncident(idx, "horario", val)}
                            style={s.formInput}
                            placeholder="Ej: 13:00HS"
                            placeholderTextColor={COLORS.muted}
                          />
                        </View>
                      </View>

                      <View style={[s.incidentRowLayout, isMobile && { flexDirection: "column", gap: 12 }]}>
                        <View style={isMobile ? { width: "100%", gap: 6 } : { flex: 1.2, gap: 6 }}>
                          <Text style={s.fieldLabel}>Tipo de Incidente *</Text>
                          <View style={s.selectWrapper}>
                            {Platform.OS === "web" ? (
                              <select
                                value={item.tipoIncidente}
                                onChange={(e) => handleUpdateIncident(idx, "tipoIncidente", e.target.value as any)}
                                style={s.formSelect}
                              >
                                <option value="" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.muted }}>Seleccionar...</option>
                                <option value="Corte tecnico" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>Corte técnico</option>
                                <option value="Corte evitable" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>Corte evitable</option>
                                <option value="Corte operativo" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>Corte operativo</option>
                                <option value="Suspension tecnica" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>Suspensión técnica</option>
                                <option value="Suspension evitable" style={{ backgroundColor: "var(--card, #FFFFFF)", color: COLORS.text }}>Suspensión evitable</option>
                              </select>
                            ) : (
                              <TextInput
                                value={item.tipoIncidente}
                                onChangeText={(val) => handleUpdateIncident(idx, "tipoIncidente", val)}
                                style={[s.formInput, { height: "100%", borderWidth: 0 }]}
                                placeholder="Ej: Corte tecnico"
                                placeholderTextColor={COLORS.muted}
                              />
                            )}
                          </View>
                        </View>

                        <View style={isMobile ? { width: "100%", gap: 6 } : { flex: 1, gap: 6 }}>
                          <Text style={s.fieldLabel}>Incidente TOPC</Text>
                          <TextInput
                            value={item.incidenteTopc}
                            onChangeText={(val) => handleUpdateIncident(idx, "incidenteTopc", val)}
                            style={s.formInput}
                            placeholder="Ej: INC1234567"
                            placeholderTextColor={COLORS.muted}
                          />
                        </View>
                      </View>
                    </View>

                    {/* Columna Derecha: Detalle y Solución */}
                    <View style={Platform.OS === "web" && width >= 1024 ? { flex: 1.2, gap: 12 } : { gap: 12 }}>
                      <View style={s.fieldGroup}>
                        <Text style={s.fieldLabel}>Detalle del Incidente *</Text>
                        <TextInput
                          value={item.detalle}
                          onChangeText={(val) => handleUpdateIncident(idx, "detalle", val)}
                          multiline
                          numberOfLines={3}
                          style={s.formTextarea}
                          placeholder="Explicá detalladamente qué ocurrió..."
                          placeholderTextColor={COLORS.muted}
                        />
                      </View>

                      <View style={s.fieldGroup}>
                        <Text style={s.fieldLabel}>Solución del Incidente *</Text>
                        <TextInput
                          value={item.solucion}
                          onChangeText={(val) => handleUpdateIncident(idx, "solucion", val)}
                          multiline
                          numberOfLines={3}
                          style={s.formTextarea}
                          placeholder="Explicá cómo se resolvió el inconveniente..."
                          placeholderTextColor={COLORS.muted}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ))}

              {incidentes.length === 0 && (
                <View style={s.emptyIncidentCard}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={42} color={COLORS.muted} />
                  <Text style={s.emptyIncidentTitle}>Sin incidentes reportados</Text>
                  <Text style={s.emptyIncidentText}>
                    No hay cortes o suspensiones registradas en este período. Si existió algún incidente, agregalo presionando el botón de abajo.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleAddIncidentRow}
                style={s.addIncidentBtn}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.primary} />
                <Text style={s.addIncidentBtnText}>Agregar Incidente / Corte</Text>
              </TouchableOpacity>
            </View>
            </View>

            {/* BOTONES DE ACCIÓN */}
            <View style={[s.actionRow, isMobile && { flexDirection: "column", gap: 12, width: "100%", alignSelf: "center" }]}>
              {!readOnly && (
                <TouchableOpacity style={s.saveBtn} onPress={handleSaveCortes} disabled={savingCortes}>
                  {savingCortes ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="database-outline" size={20} color="#FFF" />
                      <Text style={s.actionBtnText}>Guardar en BD</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.printBtn} onPress={handlePrintCortes}>
                <MaterialCommunityIcons name="printer-outline" size={20} color="#FFF" />
                <Text style={s.actionBtnText}>Imprimir / Generar PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── MODAL: CONFIRMACIÓN DE ELIMINACIÓN DE LÁMPARA ─── */}
      <Modal
        visible={!!deleteConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Confirmar eliminación</Text>
            <Text style={s.confirmText}>
              ¿Seguro que deseas eliminar {deleteConfirmModal?.table === "pedido" ? "el pedido de" : "la lámpara"}{" "}
              <Text style={{ fontWeight: "900" }}>{deleteConfirmModal?.itemInfo}</Text>?
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setDeleteConfirmModal(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnDanger}
                onPress={handleConfirmDelete}
              >
                <Text style={s.btnPrimaryText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Selector superior
  selectorCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    ...THEME.shadow.soft,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-end",
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.muted,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  pickerWrapper: {
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
  },
  webPicker: {
    backgroundColor: "transparent",
    color: COLORS.text,
    borderWidth: 0,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: "700",
    outlineWidth: 0,
    width: "100%",
    height: "100%",
    cursor: "pointer",
  } as any,
  inputField: {
    height: 38,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  savedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 6,
  },
  savedIndicatorText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: "700",
  },

  // Tabs superiores
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
  },
  tabBtnTextActive: {
    color: "#FFF",
  },

  // Banner informativo
  bannerInfo: {
    flexDirection: "row",
    backgroundColor: COLORS.info + "10",
    borderWidth: 1,
    borderColor: COLORS.info + "30",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.info,
    lineHeight: 18,
  },

  // Side-by-side Grids
  sideBySideContainer: {
    gap: 16,
    width: "100%",
  },
  sideColumn: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...THEME.shadow.soft,
  },
  tableHeaderBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
  },
  tableHeaderTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
    textTransform: "uppercase",
  },
  addBtnCompact: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  tableGrid: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gridRowHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.bgMobile,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
  },
  gridTh: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.text,
    textTransform: "uppercase",
    paddingHorizontal: 8,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingVertical: 4,
  },
  gridRowAlt: {
    backgroundColor: COLORS.bgMobile + "40",
  },
  gridTd: {
    fontSize: 12,
    color: COLORS.text,
    paddingHorizontal: 8,
  },
  gridInput: {
    fontSize: 12,
    color: COLORS.text,
    paddingHorizontal: 8,
    height: 28,
    fontWeight: "600",
    backgroundColor: "transparent",
    borderWidth: 0,
    outlineWidth: 0,
  } as any,
  gridRowInputCell: {
    flex: 3.5,
    position: "relative",
    justifyContent: "center",
  },
  rowDeleteBtn: {
    justifyContent: "center",
    alignItems: "center",
    height: 28,
  },

  // Mobile Cards for lists
  mobileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  mobileCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
    marginBottom: 4,
  },
  mobileCardNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.muted,
  },
  mobileCardBody: {
    gap: 8,
  },
  mobileField: {
    gap: 4,
  },
  mobileLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  mobileSelectWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    height: 36,
    backgroundColor: COLORS.bgMobile,
    justifyContent: "center",
    overflow: "hidden",
  },
  mobileSelectCell: {
    height: "100%",
    width: "100%",
    fontSize: 13,
    color: COLORS.text,
    paddingHorizontal: 10,
    fontWeight: "600",
    backgroundColor: "transparent",
    borderWidth: 0,
    outlineWidth: 0,
    textAlign: "center",
  } as any,
  mobileInput: {
    height: 36,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },

  // Pedidos de Lámparas
  pedidoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...THEME.shadow.soft,
  },
  suggestionBanner: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginVertical: 4,
  },
  suggestionAlert: {
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FEF08A",
  },
  suggestionNone: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  suggestionBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  suggestionBadge: {
    position: "absolute",
    right: 4,
    backgroundColor: "#FEF08A",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: "#EAB308",
  },
  suggestionBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#854D0E",
  },
  btnSugerencia: {
    flexDirection: "row",
    backgroundColor: "#854D0E",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSugerenciaText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 11,
  },
  emptyOrderBox: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyOrderText: {
    fontSize: 12,
    color: COLORS.muted,
    fontStyle: "italic",
  },

  // Botones de acciones
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 10,
  },
  saveBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 280,
    ...THEME.shadow.soft,
  },
  printBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 280,
    ...THEME.shadow.soft,
  },
  actionBtnText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 14,
  },

  // Placeholder
  placeholderContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 32,
    alignItems: "center",
    maxWidth: 500,
    width: "100%",
    ...THEME.shadow.web,
  },
  placeholderIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 4,
  },
  placeholderStatus: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  placeholderMockInfo: {
    width: "100%",
    backgroundColor: COLORS.bgMobile,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 8,
  },
  mockInfoTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  mockInfoText: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 16,
  },
  placeholderBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    ...THEME.shadow.soft,
  },
  placeholderBtnText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 13,
  },

  // Estilos de incidentes
  incidentContainer: {
    gap: 16,
  },
  incidentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...THEME.shadow.soft,
  },
  incidentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
    marginBottom: 14,
  },
  incidentTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.primary,
    textTransform: "uppercase",
  },
  incidentBody: {
    gap: 14,
  },
  incidentRowLayout: {
    flexDirection: "row",
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  selectWrapper: {
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
  },
  formSelect: {
    backgroundColor: "transparent",
    color: COLORS.text,
    borderWidth: 0,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "600",
    outlineWidth: 0,
    width: "100%",
    height: "100%",
    cursor: "pointer",
    fontFamily: "inherit",
  } as any,
  formInput: {
    height: 38,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  formTextarea: {
    minHeight: 88,
    backgroundColor: COLORS.bgMobile,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    textAlignVertical: "top",
  } as any,
  addIncidentBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  addIncidentBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  emptyIncidentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    ...THEME.shadow.soft,
  },
  emptyIncidentTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  emptyIncidentText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 360,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.web,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 2,
  },
  confirmText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginVertical: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  btnGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnGhostText: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 13,
  },
  btnDanger: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 13,
  },
});

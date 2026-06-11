import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import localizedFormat from "dayjs/plugin/localizedFormat";
import "dayjs/locale/es";

dayjs.extend(isoWeek);
dayjs.extend(localizedFormat);
dayjs.locale("es");

import { CINES_COLLECTION, db } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { getCineConfig } from "../../lib/cineConfig";

// ─── Interfaces & Types ──────────────────────────────────────────────────────

interface RetirementDetails {
  horasUsadas: number;
  horasRestantes: number;
  tipoRetiro: "Fin de vida util" | "Garantia" | "Fuera de garantia";
  descripcion: string;
  salaOriginal: number;
  anoRetiro: number;
}

interface Lampara {
  id: string;
  status: "activa" | "backup" | "final";
  sala: number | null;
  marca?: string;
  potencia?: string;
  modelo?: string;
  notas?: string;
  createdAt?: any;
  installedAt?: any;
  retiredAt?: any;
  retirementDetails?: RetirementDetails;
}

const POTENCIAS_OPTIONS = [
  "3000W",
  "2000W",
  "2200W",
  "4000W"
];

const MODELOS_OPTIONS = [
  "DXL-30BAF/L",
  "DXL-20BAF",
  "DXL-20BAF/L",
  "DXL-22BAF",
  "DXL-40BAF/L"
];

// ─── Component ────────────────────────────────────────────────────────────────

interface LamparaMovimiento {
  id: string;
  tipo: "ingreso_backup" | "instalacion" | "retiro";
  lamparaId: string;
  sala: number | null;
  marca?: string;
  potencia?: string;
  modelo?: string;
  fecha: any;
  fechaISO: string;
  mesAno: string;
  userName: string;
}

type ActiveTab = "PROYECTORES" | "BACKUP" | "HISTORIAL" | "MOVIMIENTOS" | "SIMULACION";

function PulsingDot() {
  const opacity = React.useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#10B981", // Emerald 500 green
        opacity: opacity,
        marginRight: 6,
      }}
    />
  );
}

export default function LamparasScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { cineId, displayName } = useAuthUser();
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;

  const cardWidth = useMemo(() => {
    if (width < 640) return "100%";
    if (width < 1024) return "48%";
    if (width < 1440) return "31.8%";
    return "23.5%";
  }, [width]);

  // Estados Principales
  const [activeTab, setActiveTab] = useState<ActiveTab>("PROYECTORES");
  const [lamparas, setLamparas] = useState<Lampara[]>([]);
  const [salasCount, setSalasCount] = useState(12);
  const [loading, setLoading] = useState(true);
  const [latestControl, setLatestControl] = useState<any | null>(null);
  const [movimientos, setMovimientos] = useState<LamparaMovimiento[]>([]);

  // Estados de Collapsed para Historial Final (por Año)
  const [collapsedYears, setCollapsedYears] = useState<Record<number, boolean>>({});
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  // ── Modales y Formularios ──
  const [showAddBackup, setShowAddBackup] = useState(false);
  const [bId, setBId] = useState("");
  const [bMarca, setBMarca] = useState("USHIO");
  const [bPotencia, setBPotencia] = useState("3000W");
  const [bModelo, setBModelo] = useState("DXL-30BAF/L");
  const [bNotas, setBNotas] = useState("");
  const [savingBackup, setSavingBackup] = useState(false);
  const [addError, setAddError] = useState("");

  // Auto-seleccionar modelo en base a la potencia en el registro de Backup
  useEffect(() => {
    if (bPotencia === "3000W") {
      setBModelo("DXL-30BAF/L");
    } else if (bPotencia === "2000W") {
      setBModelo("DXL-20BAF");
    } else if (bPotencia === "2200W") {
      setBModelo("DXL-22BAF");
    } else if (bPotencia === "4000W") {
      setBModelo("DXL-40BAF/L");
    }
  }, [bPotencia]);

  const [installModal, setInstallModal] = useState<{ sala: number } | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const [savingInstall, setSavingInstall] = useState(false);

  const [retireModal, setRetireModal] = useState<{ sala: number; lamparaId: string } | null>(null);
  const [rHorasUsadas, setRHorasUsadas] = useState("");
  const [rHorasRestantes, setRHorasRestantes] = useState("");
  const [rTipoRetiro, setRTipoRetiro] = useState<"Fin de vida util" | "Garantia" | "Fuera de garantia">("Fin de vida util");
  const [rDescripcion, setRDescripcion] = useState("");
  const [savingRetire, setSavingRetire] = useState(false);
  const [retireError, setRetireError] = useState("");

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<Lampara | null>(null);
  const [revertConfirmModal, setRevertConfirmModal] = useState<LamparaMovimiento | null>(null);
  const [revertingMovId, setRevertingMovId] = useState<string | null>(null);

  // ── Estados para Simulación ──
  const [simMode, setSimMode] = useState<"SEMANAL" | "MANUAL">("SEMANAL");
  const [simSelectedRoom, setSimSelectedRoom] = useState<number | null>(null);
  const [simSemanalDailyUsage, setSimSemanalDailyUsage] = useState<string>("");
  
  const [simManualHours, setSimManualHours] = useState<string>("");
  const [simManualDailyUsage, setSimManualDailyUsage] = useState<string>("");
  const [simManualStartDate, setSimManualStartDate] = useState<string>(dayjs().format("YYYY-MM-DD"));

  // ─── Cargar Salas Count ─────────────────────────────────────────────────────
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

  // ─── Cargar último Control Semanal para vincular horas ──────────────────────
  useEffect(() => {
    if (!cineId) return;

    const q = query(
      collection(db, CINES_COLLECTION, cineId, "controles_semanales"),
      orderBy("fecha", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setLatestControl(snap.docs[0].data());
      } else {
        setLatestControl(null);
      }
    }, (err) => {
      console.error("Error subscribiéndose al último control semanal:", err);
    });

    return () => unsub();
  }, [cineId]);

  // ─── Suscripción en Tiempo Real a Movimientos ──────────────────────────────
  useEffect(() => {
    if (!cineId) return;

    const qCol = collection(db, CINES_COLLECTION, cineId, "lampara_movimientos");
    const q = query(qCol, orderBy("fechaISO", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: LamparaMovimiento[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            tipo: data.tipo ?? "ingreso_backup",
            lamparaId: data.lamparaId ?? "",
            sala: data.sala !== undefined ? data.sala : null,
            marca: data.marca ?? "",
            potencia: data.potencia ?? "",
            fecha: data.fecha,
            fechaISO: data.fechaISO ?? "",
            mesAno: data.mesAno ?? "",
            userName: data.userName ?? "",
          };
        });
        setMovimientos(rows);
      },
      (err) => {
        console.error("Error subscribiéndose a movimientos:", err);
      }
    );

    return () => unsub();
  }, [cineId]);

  // ─── Suscripción en Tiempo Real a Lámparas ────────────────────────────────
  useEffect(() => {
    if (!cineId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const qCol = collection(db, CINES_COLLECTION, cineId, "lamparas");
    const unsub = onSnapshot(
      qCol,
      (snap) => {
        const rows: Lampara[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            status: data.status ?? "backup",
            sala: data.sala !== undefined ? data.sala : null,
            marca: data.marca ?? "",
            potencia: data.potencia ?? "",
            notas: data.notas ?? "",
            createdAt: data.createdAt,
            installedAt: data.installedAt,
            retiredAt: data.retiredAt,
            retirementDetails: data.retirementDetails,
          };
        });
        setLamparas(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Error subscribiéndose a lámparas:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [cineId]);

  // ─── Helpers de Clasificación ──────────────────────────────────────────────

  const activeLampsBySala = useMemo(() => {
    const map: Record<number, Lampara> = {};
    lamparas.forEach((lamp) => {
      if (lamp.status === "activa" && lamp.sala !== null) {
        map[lamp.sala] = lamp;
      }
    });
    return map;
  }, [lamparas]);

  const backupLamps = useMemo(() => {
    return lamparas.filter((l) => l.status === "backup");
  }, [lamparas]);

  const finalLampsByYear = useMemo(() => {
    const map: Record<number, Lampara[]> = {};
    lamparas
      .filter((l) => l.status === "final" && l.retirementDetails)
      .forEach((lamp) => {
        const year = lamp.retirementDetails?.anoRetiro ?? new Date().getFullYear();
        if (!map[year]) {
          map[year] = [];
        }
        map[year].push(lamp);
      });

    // Ordenar lámparas dentro de cada año de forma descendente por fecha de retiro
    Object.keys(map).forEach((y) => {
      const yearNum = Number(y);
      map[yearNum].sort((a, b) => {
        const dateA = a.retiredAt?.seconds ? a.retiredAt.seconds * 1000 : new Date(a.retiredAt || 0).getTime();
        const dateB = b.retiredAt?.seconds ? b.retiredAt.seconds * 1000 : new Date(b.retiredAt || 0).getTime();
        return dateB - dateA;
      });
    });

    return map;
  }, [lamparas]);

  const sortedYears = useMemo(() => {
    return Object.keys(finalLampsByYear)
      .map(Number)
      .sort((a, b) => b - a); // Años más recientes primero
  }, [finalLampsByYear]);

  // Inicializar años colapsados (por defecto abiertos los que tengan datos)
  useEffect(() => {
    if (sortedYears.length > 0) {
      setCollapsedYears((prev) => {
        const initial = { ...prev };
        sortedYears.forEach((y) => {
          if (initial[y] === undefined) {
            initial[y] = false; // Abierto por defecto
          }
        });
        return initial;
      });
    }
  }, [sortedYears]);

  const toggleYearCollapse = (year: number) => {
    setCollapsedYears((prev) => ({ ...prev, [year]: !prev[year] }));
  };

  // ─── Clasificación y Helpers de Movimientos ────────────────────────────────
  const movementsByMonth = useMemo(() => {
    const map: Record<string, LamparaMovimiento[]> = {};
    movimientos.forEach((mov) => {
      const key = mov.mesAno || "Sin fecha";
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(mov);
    });
    return map;
  }, [movimientos]);

  const sortedMonths = useMemo(() => {
    return Object.keys(movementsByMonth).sort((a, b) => b.localeCompare(a)); // Más recientes primero
  }, [movementsByMonth]);

  useEffect(() => {
    if (sortedMonths.length > 0) {
      setCollapsedMonths((prev) => {
        const initial = { ...prev };
        sortedMonths.forEach((m) => {
          if (initial[m] === undefined) {
            initial[m] = false; // Abierto por defecto
          }
        });
        return initial;
      });
    }
  }, [sortedMonths]);

  function formatMesAno(mesAnoStr: string) {
    if (!mesAnoStr) return "Desconocido";
    const [y, m] = mesAnoStr.split("-");
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    const monthIdx = parseInt(m, 10) - 1;
    return `${months[monthIdx]} ${y}`;
  }

  // ─── Agregar Lámpara a Backup ──────────────────────────────────────────────

  const handleAddBackup = async () => {
    if (readOnly) return;
    setAddError("");
    const cleanId = bId.trim().toUpperCase();

    if (!cleanId) {
      setAddError("El ID de la lámpara es obligatorio.");
      return;
    }

    if (!cineId) return;
    setSavingBackup(true);

    try {
      // Verificar si ya existe una lámpara con este ID en Firestore
      const alreadyExists = lamparas.some(
        (l) => l.id.toLowerCase() === cleanId.toLowerCase()
      );

      if (alreadyExists) {
        setAddError("Ya existe una lámpara con este ID en el sistema.");
        setSavingBackup(false);
        return;
      }

      const docRef = doc(db, CINES_COLLECTION, cineId, "lamparas", cleanId);
      await setDoc(docRef, {
        status: "backup",
        sala: null,
        marca: bMarca.trim(),
        potencia: bPotencia,
        modelo: bModelo,
        notas: bNotas.trim(),
        createdAt: serverTimestamp(),
      });

      // Registrar movimiento de ingreso
      const movRef = doc(collection(db, CINES_COLLECTION, cineId, "lampara_movimientos"));
      await setDoc(movRef, {
        tipo: "ingreso_backup",
        lamparaId: cleanId,
        sala: null,
        marca: bMarca.trim(),
        potencia: bPotencia,
        modelo: bModelo,
        fecha: serverTimestamp(),
        fechaISO: new Date().toISOString(),
        mesAno: new Date().toISOString().substring(0, 7), // "YYYY-MM"
        userName: displayName || "Operador",
      });

      setShowAddBackup(false);
      setBId("");
      setBMarca("");
      setBNotas("");
      Alert.alert("Éxito", "Lámpara agregada al stock de backup.");
    } catch (e: any) {
      console.error(e);
      setAddError(e.message ?? "Error al guardar la lámpara.");
    } finally {
      setSavingBackup(false);
    }
  };

  // ─── Instalar Lámpara en Proyector ─────────────────────────────────────────

  const handleInstall = async () => {
    if (readOnly) return;
    if (!installModal || !selectedBackupId || !cineId) return;

    setSavingInstall(true);
    try {
      const roomNum = installModal.sala;
      const backupLamp = backupLamps.find((l) => l.id === selectedBackupId);
      const docRef = doc(db, CINES_COLLECTION, cineId, "lamparas", selectedBackupId);

      await updateDoc(docRef, {
        status: "activa",
        sala: roomNum,
        installedAt: serverTimestamp(),
      });

      // Registrar movimiento de instalación
      const movRef = doc(collection(db, CINES_COLLECTION, cineId, "lampara_movimientos"));
      await setDoc(movRef, {
        tipo: "instalacion",
        lamparaId: selectedBackupId,
        sala: roomNum,
        marca: backupLamp?.marca ?? "",
        potencia: backupLamp?.potencia ?? "",
        modelo: backupLamp?.modelo ?? "",
        fecha: serverTimestamp(),
        fechaISO: new Date().toISOString(),
        mesAno: new Date().toISOString().substring(0, 7), // "YYYY-MM"
        userName: displayName || "Operador",
      });

      setInstallModal(null);
      setSelectedBackupId("");
      Alert.alert("Éxito", `Lámpara instalada correctamente en la Sala ${roomNum}.`);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", `No se pudo instalar la lámpara: ${e.message}`);
    } finally {
      setSavingInstall(false);
    }
  };

  // ─── Retirar Lámpara a Historial Final ─────────────────────────────────────

  const handleRetire = async () => {
    if (readOnly) return;
    setRetireError("");
    const horasUsadasNum = parseInt(rHorasUsadas.trim(), 10);
    const horasRestantesNum = parseInt(rHorasRestantes.trim(), 10);

    if (isNaN(horasUsadasNum) || horasUsadasNum < 0) {
      setRetireError("Por favor ingresá un número válido para las horas usadas.");
      return;
    }
    if (isNaN(horasRestantesNum) || horasRestantesNum < 0) {
      setRetireError("Por favor ingresá un número válido para las horas restantes.");
      return;
    }

    if (!retireModal || !cineId) return;
    setSavingRetire(true);

    try {
      const docRef = doc(db, CINES_COLLECTION, cineId, "lamparas", retireModal.lamparaId);

      const details: RetirementDetails = {
        horasUsadas: horasUsadasNum,
        horasRestantes: horasRestantesNum,
        tipoRetiro: rTipoRetiro,
        descripcion: rDescripcion.trim(),
        salaOriginal: retireModal.sala,
        anoRetiro: new Date().getFullYear(),
      };

      await updateDoc(docRef, {
        status: "final",
        sala: null,
        retiredAt: serverTimestamp(),
        retirementDetails: details,
      });

      // Registrar movimiento de retiro
      const currentLamp = lamparas.find((l) => l.id === retireModal.lamparaId);
      const movRef = doc(collection(db, CINES_COLLECTION, cineId, "lampara_movimientos"));
      await setDoc(movRef, {
        tipo: "retiro",
        lamparaId: retireModal.lamparaId,
        sala: retireModal.sala,
        marca: currentLamp?.marca ?? "",
        potencia: currentLamp?.potencia ?? "",
        modelo: currentLamp?.modelo ?? "",
        fecha: serverTimestamp(),
        fechaISO: new Date().toISOString(),
        mesAno: new Date().toISOString().substring(0, 7), // "YYYY-MM"
        userName: displayName || "Operador",
      });

      setRetireModal(null);
      setRHorasUsadas("");
      setRHorasRestantes("");
      setRDescripcion("");
      setRTipoRetiro("Fin de vida util");
      Alert.alert("Éxito", "Lámpara retirada e ingresada al Historial Final.");
    } catch (e: any) {
      console.error(e);
      setRetireError(e.message ?? "Error al procesar el retiro.");
    } finally {
      setSavingRetire(false);
    }
  };

  // ─── Borrar Lámpara (Solo Backup) ─────────────────────────────────────────

  const handleDeleteLamp = async (lamp: Lampara) => {
    if (readOnly) return;
    if (!cineId) return;
    try {
      await deleteDoc(doc(db, CINES_COLLECTION, cineId, "lamparas", lamp.id));
      setDeleteConfirmModal(null);
      Alert.alert("Éxito", "Lámpara eliminada del stock.");
    } catch (e: any) {
      Alert.alert("Error", `No se pudo eliminar la lámpara: ${e.message}`);
    }
  };

  // ─── Revertir Movimiento ───────────────────────────────────────────────────

  const handleRevertMovement = async (mov: LamparaMovimiento) => {
    if (readOnly) return;
    if (!cineId) return;
    setRevertingMovId(mov.id);

    try {
      const lampRef = doc(db, CINES_COLLECTION, cineId, "lamparas", mov.lamparaId);

      // Buscar documento en listado local de lámparas
      const lamp = lamparas.find((l) => l.id === mov.lamparaId);

      if (!lamp) {
        Alert.alert(
          "Error al revertir",
          "La lámpara asociada a este movimiento ya no existe en el sistema."
        );
        setRevertConfirmModal(null);
        return;
      }

      if (mov.tipo === "ingreso_backup") {
        if (lamp.status !== "backup") {
          Alert.alert(
            "No se puede revertir",
            "Esta lámpara ya no se encuentra en el stock de backup (ya fue instalada o retirada)."
          );
          setRevertConfirmModal(null);
          return;
        }

        // Eliminar la lámpara de backup y el movimiento
        await deleteDoc(lampRef);
        await deleteDoc(doc(db, CINES_COLLECTION, cineId, "lampara_movimientos", mov.id));

      } else if (mov.tipo === "instalacion") {
        if (lamp.status !== "activa") {
          Alert.alert(
            "No se puede revertir",
            "Esta lámpara ya no se encuentra activa en ningún proyector."
          );
          setRevertConfirmModal(null);
          return;
        }

        // Revertir la lámpara a estado backup y eliminar el movimiento
        await updateDoc(lampRef, {
          status: "backup",
          sala: null,
          installedAt: null,
        });
        await deleteDoc(doc(db, CINES_COLLECTION, cineId, "lampara_movimientos", mov.id));

      } else if (mov.tipo === "retiro") {
        const targetSala = mov.sala;
        if (targetSala !== null && activeLampsBySala[targetSala]) {
          Alert.alert(
            "No es posible revertir",
            "No es posible ya que el proyector ya tiene una nueva lampara asignada, por favor revierta la asignacion de la misma a dicho proyector"
          );
          setRevertConfirmModal(null);
          return;
        }

        // Revertir la lámpara a estado activa y reasignarle su sala, limpiando detalles de retiro
        await updateDoc(lampRef, {
          status: "activa",
          sala: targetSala,
          retiredAt: null,
          retirementDetails: null,
        });
        await deleteDoc(doc(db, CINES_COLLECTION, cineId, "lampara_movimientos", mov.id));
      }

      setRevertConfirmModal(null);
      Alert.alert("Éxito", "El movimiento fue revertido correctamente.");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", `No se pudo revertir el movimiento: ${e.message}`);
    } finally {
      setRevertingMovId(null);
    }
  };

  // ─── Formato de Fechas ──────────────────────────────────────────────────────

  const formatFirebaseDate = (val: any) => {
    if (!val) return "-";
    let date: Date;
    if (val.toDate) {
      date = val.toDate();
    } else if (val.seconds) {
      date = new Date(val.seconds * 1000);
    } else {
      date = new Date(val);
    }
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ─── Simulación Helpers y Lógica ───

  const adjustManualDate = (amount: number) => {
    const d = dayjs(simManualStartDate);
    if (d.isValid()) {
      setSimManualStartDate(d.add(amount, "day").format("YYYY-MM-DD"));
    } else {
      setSimManualStartDate(dayjs().format("YYYY-MM-DD"));
    }
  };

  const runSimulation = (remainingHours: any, dailyUsage: any, startDateStr: string) => {
    const remainingHoursNum = Number(remainingHours);
    const dailyUsageNum = Number(dailyUsage);

    if (isNaN(remainingHoursNum) || remainingHoursNum <= 0 || isNaN(dailyUsageNum) || dailyUsageNum <= 0) {
      return null;
    }

    const days = Math.floor(remainingHoursNum / dailyUsageNum);
    const startDay = dayjs(startDateStr);
    if (!startDay.isValid()) return null;

    const simulationDays = [];
    let currentHours = remainingHoursNum;
    const maxSimulate = Math.min(days + 2, 100);

    for (let i = 1; i <= maxSimulate; i++) {
      const date = startDay.add(i - 1, "day");
      const hoursAtStart = currentHours;
      const hoursAtEnd = currentHours - dailyUsageNum;
      const isOk = hoursAtEnd >= 0;

      simulationDays.push({
        dayIndex: i,
        date: date.format("YYYY-MM-DD"),
        dateFormatted: date.format("dddd DD/MM"),
        hoursAtStart: parseFloat(hoursAtStart.toFixed(1)),
        hoursAtEnd: parseFloat(hoursAtEnd.toFixed(1)),
        isOk,
        status: isOk 
          ? (hoursAtEnd < dailyUsageNum ? "RECOMENDADO" : "SEGURO") 
          : "INSUFICIENTE"
      });

      currentHours = hoursAtEnd;
      if (!isOk) break;
    }

    let recommendationText = "";
    let changeDateLabel = "";
    let hoursAtChange = 0;

    if (days === 0) {
      recommendationText = `Cambiar de inmediato el ${startDay.format("dddd DD/MM")} (antes de iniciar la jornada).`;
      changeDateLabel = startDay.format("dddd DD/MM");
      hoursAtChange = remainingHoursNum;
    } else {
      const lastSafeDate = startDay.add(days - 1, "day");
      const nextDate = startDay.add(days, "day");
      
      const lastSafeDateStr = lastSafeDate.format("dddd DD [de] MMMM");
      const nextDateStr = nextDate.format("dddd DD [de] MMMM");
      
      recommendationText = `Al cierre de ${lastSafeDateStr} / apertura de ${nextDateStr}`;
      changeDateLabel = `${lastSafeDateStr} (cierre) / ${nextDateStr} (apertura)`;
      hoursAtChange = remainingHoursNum - (days * dailyUsageNum);
    }

    return {
      days,
      recommendationText,
      hoursAtChange: parseFloat(hoursAtChange.toFixed(1)),
      simulationDays,
      changeDateLabel
    };
  };

  const simResult = useMemo(() => {
    if (simMode === "SEMANAL") {
      if (simSelectedRoom === null) return null;
      const controlLamp = latestControl?.lamparas?.find((l: any) => l.sala === simSelectedRoom);
      if (!controlLamp) return null;
      const horasRestantes = controlLamp.horasRestantes ?? 0;
      const fechaReporte = latestControl.fecha ?? dayjs().format("YYYY-MM-DD");
      const dailyUsage = parseFloat(simSemanalDailyUsage);
      return runSimulation(horasRestantes, dailyUsage, fechaReporte);
    } else {
      const horasRestantes = parseFloat(simManualHours);
      const dailyUsage = parseFloat(simManualDailyUsage);
      const fechaInicial = simManualStartDate;
      return runSimulation(horasRestantes, dailyUsage, fechaInicial);
    }
  }, [simMode, simSelectedRoom, simSemanalDailyUsage, simManualHours, simManualDailyUsage, simManualStartDate, latestControl]);

  // ─── Render ───

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Cargando lámparas…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.headerRow}>
        <View style={s.headerTextBlock}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <Text style={{ position: "absolute", left: -28, fontSize: 22 }}>💡</Text>
            <Text style={s.pageTitle}>Lámparas</Text>
          </View>
          <Text style={s.pageSubtitle}>Control de ciclo de vida de proyectores y stock</Text>
        </View>
      </View>

      {/* Segmented Control Bar */}
      {width < 480 ? (
        // Mobile pequeño: 2 filas (3 y 2 tabs)
        <View style={[s.tabBar, { marginHorizontal: 6, flexDirection: "column", gap: 4 }]}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity
              style={[s.tabBtn, activeTab === "PROYECTORES" && s.tabBtnActive, { flex: 1, paddingVertical: 8, gap: 3 }]}
              onPress={() => setActiveTab("PROYECTORES")}
            >
              <MaterialCommunityIcons name="projector" size={14} color={activeTab === "PROYECTORES" ? "#FFF" : COLORS.muted} />
              <Text style={[s.tabBtnText, activeTab === "PROYECTORES" && s.tabBtnTextActive, { fontSize: 10 }]}>Salas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, activeTab === "BACKUP" && s.tabBtnActive, { flex: 1, paddingVertical: 8, gap: 3 }]}
              onPress={() => setActiveTab("BACKUP")}
            >
              <MaterialCommunityIcons name="package-variant-closed" size={14} color={activeTab === "BACKUP" ? "#FFF" : COLORS.muted} />
              <Text style={[s.tabBtnText, activeTab === "BACKUP" && s.tabBtnTextActive, { fontSize: 10 }]}>Backup ({backupLamps.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, activeTab === "HISTORIAL" && s.tabBtnActive, { flex: 1, paddingVertical: 8, gap: 3 }]}
              onPress={() => setActiveTab("HISTORIAL")}
            >
              <MaterialCommunityIcons name="history" size={14} color={activeTab === "HISTORIAL" ? "#FFF" : COLORS.muted} />
              <Text style={[s.tabBtnText, activeTab === "HISTORIAL" && s.tabBtnTextActive, { fontSize: 10 }]}>Historial</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity
              style={[s.tabBtn, activeTab === "MOVIMIENTOS" && s.tabBtnActive, { flex: 1, paddingVertical: 8, gap: 3 }]}
              onPress={() => setActiveTab("MOVIMIENTOS")}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={14} color={activeTab === "MOVIMIENTOS" ? "#FFF" : COLORS.muted} />
              <Text style={[s.tabBtnText, activeTab === "MOVIMIENTOS" && s.tabBtnTextActive, { fontSize: 10 }]}>Movimientos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, activeTab === "SIMULACION" && s.tabBtnActive, { flex: 1, paddingVertical: 8, gap: 3 }]}
              onPress={() => setActiveTab("SIMULACION")}
            >
              <MaterialCommunityIcons name="calculator" size={14} color={activeTab === "SIMULACION" ? "#FFF" : COLORS.muted} />
              <Text style={[s.tabBtnText, activeTab === "SIMULACION" && s.tabBtnTextActive, { fontSize: 10 }]}>Simulación</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // Tablet / Desktop: fila única con 5 tabs
        <View style={[s.tabBar, { marginHorizontal: width < 768 ? 8 : 16 }]}>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === "PROYECTORES" && s.tabBtnActive, { paddingVertical: width < 768 ? 9 : 10, gap: width < 768 ? 4 : 6 }]}
            onPress={() => setActiveTab("PROYECTORES")}
          >
            <MaterialCommunityIcons name="projector" size={width < 768 ? 15 : 18} color={activeTab === "PROYECTORES" ? "#FFF" : COLORS.muted} />
            <Text style={[s.tabBtnText, activeTab === "PROYECTORES" && s.tabBtnTextActive, { fontSize: width < 768 ? 11 : 13 }]}>
              {width < 600 ? "Salas" : "Proyectores"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === "BACKUP" && s.tabBtnActive, { paddingVertical: width < 768 ? 9 : 10, gap: width < 768 ? 4 : 6 }]}
            onPress={() => setActiveTab("BACKUP")}
          >
            <MaterialCommunityIcons name="package-variant-closed" size={width < 768 ? 15 : 18} color={activeTab === "BACKUP" ? "#FFF" : COLORS.muted} />
            <Text style={[s.tabBtnText, activeTab === "BACKUP" && s.tabBtnTextActive, { fontSize: width < 768 ? 11 : 13 }]}>
              {width < 600 ? `Backup (${backupLamps.length})` : `Stock Backup (${backupLamps.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === "HISTORIAL" && s.tabBtnActive, { paddingVertical: width < 768 ? 9 : 10, gap: width < 768 ? 4 : 6 }]}
            onPress={() => setActiveTab("HISTORIAL")}
          >
            <MaterialCommunityIcons name="history" size={width < 768 ? 15 : 18} color={activeTab === "HISTORIAL" ? "#FFF" : COLORS.muted} />
            <Text style={[s.tabBtnText, activeTab === "HISTORIAL" && s.tabBtnTextActive, { fontSize: width < 768 ? 11 : 13 }]}>
              {width < 600 ? "Historial" : "Historial Final"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === "MOVIMIENTOS" && s.tabBtnActive, { paddingVertical: width < 768 ? 9 : 10, gap: width < 768 ? 4 : 6 }]}
            onPress={() => setActiveTab("MOVIMIENTOS")}
          >
            <MaterialCommunityIcons name="swap-horizontal" size={width < 768 ? 15 : 18} color={activeTab === "MOVIMIENTOS" ? "#FFF" : COLORS.muted} />
            <Text style={[s.tabBtnText, activeTab === "MOVIMIENTOS" && s.tabBtnTextActive, { fontSize: width < 768 ? 11 : 13 }]}>
              Movimientos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === "SIMULACION" && s.tabBtnActive, { paddingVertical: width < 768 ? 9 : 10, gap: width < 768 ? 4 : 6 }]}
            onPress={() => setActiveTab("SIMULACION")}
          >
            <MaterialCommunityIcons name="calculator" size={width < 768 ? 15 : 18} color={activeTab === "SIMULACION" ? "#FFF" : COLORS.muted} />
            <Text style={[s.tabBtnText, activeTab === "SIMULACION" && s.tabBtnTextActive, { fontSize: width < 768 ? 11 : 13 }]}>
              Simulación
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          activeTab === "BACKUP" && { paddingBottom: 100 }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View pointerEvents={readOnly ? "none" : "auto"}>
        {/* PESTAÑA 1: PROYECTORES */}
        {activeTab === "PROYECTORES" && (
          <View style={{ gap: 14, width: "100%" }}>
            {/* Banner Informativo General */}
            <View style={s.infoBanner}>
              <MaterialCommunityIcons name="information" size={18} color="#1E40AF" style={{ marginRight: 6 }} />
              <Text style={s.infoBannerText}>
                Las horas de uso y restantes de las lámparas activas son reportadas y actualizadas <Text style={{ fontWeight: "700" }}>cada viernes</Text> a través del Control Semanal.
              </Text>
            </View>

            <View style={s.proyectoresGrid}>
              {Array.from({ length: salasCount }, (_, i) => i + 1).map((roomNum) => {
                const activeLamp = activeLampsBySala[roomNum];
                const controlLamp = latestControl?.lamparas?.find((l: any) => l.sala === roomNum);
                const horasUsadas = controlLamp?.horasActuales ?? "0";
                const horasRestantes = controlLamp?.horasRestantes ?? "0";

                return (
                  <View key={roomNum} style={[s.roomCard, activeLamp && s.roomCardActive, { width: cardWidth }]}>
                    <View style={s.roomCardHeader}>
                      <Text style={s.roomTitle}>Sala {roomNum}</Text>
                      {activeLamp ? (
                        <View style={s.activeBadge}>
                          <PulsingDot />
                          <Text style={s.activeBadgeText}>ACTIVA</Text>
                        </View>
                      ) : (
                        <View style={s.emptyBadge}>
                          <Text style={s.emptyBadgeText}>VACÍO</Text>
                        </View>
                      )}
                    </View>

                    {activeLamp ? (
                      <View style={s.roomLampInfo}>
                        <Text style={s.nomenclatureText}>
                          #{roomNum} - {activeLamp.id}
                        </Text>
                        <View style={s.lampDetailsRow}>
                          {activeLamp.marca ? (
                            <View style={s.detailChip}>
                              <Text style={s.detailChipText}>{activeLamp.marca}</Text>
                            </View>
                          ) : null}
                          {activeLamp.potencia ? (
                            <View style={[s.detailChip, { backgroundColor: COLORS.primarySoft }]}>
                              <Text style={[s.detailChipText, { color: COLORS.primary }]}>
                                {activeLamp.potencia}
                              </Text>
                            </View>
                          ) : null}
                          {activeLamp.modelo ? (
                            <View style={[s.detailChip, { backgroundColor: COLORS.info + "15" }]}>
                              <Text style={[s.detailChipText, { color: COLORS.info }]}>
                                {activeLamp.modelo}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={s.dateLabel}>
                          Instalada: {formatFirebaseDate(activeLamp.installedAt)}
                        </Text>

                        {/* Horas Vinculadas del Control Semanal */}
                        <View style={s.roomHoursContainer}>
                          <View style={s.roomHoursBox}>
                            <Text style={s.roomHoursLabel}>Horas Usadas</Text>
                            <Text style={s.roomHoursVal}>{horasUsadas} h</Text>
                          </View>
                          <View style={s.roomHoursBox}>
                            <Text style={s.roomHoursLabel}>Horas Restantes</Text>
                            <Text style={s.roomHoursVal}>{horasRestantes} h</Text>
                          </View>
                        </View>

                        {activeLamp.notas ? (
                          <Text style={s.lampNotes} numberOfLines={2}>
                            💬 {activeLamp.notas}
                          </Text>
                        ) : null}

                        <TouchableOpacity
                          style={s.retireBtn}
                          onPress={() => {
                            setRetireModal({ sala: roomNum, lamparaId: activeLamp.id });
                            setRHorasUsadas(String(horasUsadas));
                            setRHorasRestantes(String(horasRestantes));
                            setRDescripcion("");
                            setRTipoRetiro("Fin de vida util");
                            setRetireError("");
                          }}
                        >
                          <MaterialCommunityIcons name="logout" size={14} color="#FFF" />
                          <Text style={s.retireBtnText}>Retirar Lámpara</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={s.roomEmptyInfo}>
                        <MaterialCommunityIcons
                          name="projector-off"
                          size={32}
                          color={COLORS.muted}
                          style={{ marginBottom: 6 }}
                        />
                        <Text style={s.emptyRoomText}>Sin lámpara activa</Text>
                        <TouchableOpacity
                          style={s.installBtn}
                          onPress={() => {
                            if (backupLamps.length === 0) {
                              Alert.alert(
                                "Sin Stock de Backup",
                                "No hay lámparas disponibles en stock. Cargá una nueva lámpara en la pestaña 'Stock Backup' primero."
                              );
                              return;
                            }
                            setInstallModal({ sala: roomNum });
                            setSelectedBackupId(backupLamps[0].id);
                          }}
                        >
                          <Text style={s.installBtnText}>Instalar Lámpara</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* PESTAÑA 2: STOCK BACKUP */}
        {activeTab === "BACKUP" && (
          <View style={s.backupList}>
            {backupLamps.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="package-variant" size={48} color={COLORS.muted} />
                <Text style={s.emptyCardTitle}>Stock Vacío</Text>
                <Text style={s.emptyCardSubtitle}>
                  No hay lámparas de repuesto disponibles. Presioná "+ Nueva Lámpara" para cargar una.
                </Text>
              </View>
            ) : (
              backupLamps.map((lamp) => (
                <View key={lamp.id} style={s.backupCard}>
                  <View style={s.backupCardLeft}>
                    <Text style={s.backupIdTitle}>{lamp.id}</Text>
                    <View style={s.lampDetailsRow}>
                      {lamp.marca ? (
                        <View style={s.detailChip}>
                          <Text style={s.detailChipText}>{lamp.marca}</Text>
                        </View>
                      ) : null}
                      {lamp.potencia ? (
                        <View style={[s.detailChip, { backgroundColor: COLORS.primarySoft }]}>
                          <Text style={[s.detailChipText, { color: COLORS.primary }]}>
                            {lamp.potencia}
                          </Text>
                        </View>
                      ) : null}
                      {lamp.modelo ? (
                        <View style={[s.detailChip, { backgroundColor: COLORS.info + "15" }]}>
                          <Text style={[s.detailChipText, { color: COLORS.info }]}>
                            {lamp.modelo}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s.dateLabel}>
                      Registrada: {formatFirebaseDate(lamp.createdAt)}
                    </Text>
                    {lamp.notas ? <Text style={s.backupNotes}>💬 {lamp.notas}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={s.deleteIconBtn}
                    onPress={() => setDeleteConfirmModal(lamp)}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* PESTAÑA 3: HISTORIAL FINAL (AGRUPADO POR AÑO) */}
        {activeTab === "HISTORIAL" && (
          <View style={s.historialContainer}>
            {sortedYears.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="history" size={48} color={COLORS.muted} />
                <Text style={s.emptyCardTitle}>Sin Historial</Text>
                <Text style={s.emptyCardSubtitle}>
                  Aún no se han retirado lámparas en este cine. Las lámparas retiradas aparecerán aquí organizadas por año.
                </Text>
              </View>
            ) : (
              sortedYears.map((year) => {
                const yearLamps = finalLampsByYear[year] || [];
                const isCollapsed = collapsedYears[year] ?? false;

                return (
                  <View key={year} style={s.yearSection}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => toggleYearCollapse(year)}
                      style={s.yearHeader}
                    >
                      <View style={s.yearHeaderLeft}>
                        <Text style={s.yearTitle}>Año {year}</Text>
                        <View style={s.yearCountBadge}>
                          <Text style={s.yearCountBadgeText}>
                            {yearLamps.length} lámpara{yearLamps.length !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-right" : "chevron-down"}
                        size={22}
                        color={COLORS.text}
                      />
                    </TouchableOpacity>

                    {!isCollapsed && (
                      <View style={s.yearLampsList}>
                        {yearLamps.map((lamp) => {
                          const det = lamp.retirementDetails!;
                          let badgeBg = COLORS.border;
                          let badgeText = COLORS.text;
                          if (det.tipoRetiro === "Garantia") {
                            badgeBg = COLORS.successBg;
                            badgeText = COLORS.success;
                          } else if (det.tipoRetiro === "Fuera de garantia") {
                            badgeBg = COLORS.dangerSoft;
                            badgeText = COLORS.danger;
                          }

                          return (
                            <View key={lamp.id} style={s.finalCard}>
                              <View style={s.finalCardHeader}>
                                <Text style={s.finalNomenclature}>
                                  #{det.salaOriginal} - {lamp.id}
                                </Text>
                                <View style={[s.retirementBadge, { backgroundColor: badgeBg }]}>
                                  <Text style={[s.retirementBadgeText, { color: badgeText }]}>
                                    {det.tipoRetiro === "Fin de vida util" ? "Fin de Vida Útil" : det.tipoRetiro}
                                  </Text>
                                </View>
                              </View>

                              {/* Detalles de Horas */}
                              <View style={s.hoursGrid}>
                                <View style={s.hoursBox}>
                                  <Text style={s.hoursTitle}>Horas Usadas</Text>
                                  <Text style={s.hoursVal}>{det.horasUsadas} h</Text>
                                </View>
                                <View style={s.hoursBox}>
                                  <Text style={s.hoursTitle}>Horas Restantes</Text>
                                  <Text style={s.hoursVal}>{det.horasRestantes} h</Text>
                                </View>
                              </View>

                              {/* Detalles de Ciclo */}
                              <View style={s.historyTimeline}>
                                <Text style={s.timelineItem}>
                                  📅 <Text style={{ fontWeight: "700" }}>Ingreso backup:</Text> {formatFirebaseDate(lamp.createdAt)}
                                </Text>
                                <Text style={s.timelineItem}>
                                  📽️ <Text style={{ fontWeight: "700" }}>Instalación Sala {det.salaOriginal}:</Text> {formatFirebaseDate(lamp.installedAt)}
                                </Text>
                                <Text style={s.timelineItem}>
                                  🛑 <Text style={{ fontWeight: "700" }}>Retiro final:</Text> {formatFirebaseDate(lamp.retiredAt)}
                                </Text>
                              </View>

                              {/* Descripción de retiro */}
                              {det.descripcion ? (
                                <View style={s.retirementDesc}>
                                  <Text style={s.retirementDescTitle}>Motivo / Descripción de Retiro:</Text>
                                  <Text style={s.retirementDescText}>{det.descripcion}</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* PESTAÑA 4: MOVIMIENTOS */}
        {activeTab === "MOVIMIENTOS" && (
          <View style={s.historialContainer}>
            {sortedMonths.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="swap-horizontal" size={48} color={COLORS.muted} />
                <Text style={s.emptyCardTitle}>Sin Movimientos</Text>
                <Text style={s.emptyCardSubtitle}>
                  Aún no se han registrado movimientos de instalación o ingreso a backup en este cine.
                </Text>
              </View>
            ) : (
              sortedMonths.map((monthKey) => {
                const monthMovs = movementsByMonth[monthKey] || [];
                const isCollapsed = collapsedMonths[monthKey] ?? false;

                return (
                  <View key={monthKey} style={s.yearSection}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setCollapsedMonths((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }))}
                      style={s.yearHeader}
                    >
                      <View style={s.yearHeaderLeft}>
                        <Text style={s.yearTitle}>{formatMesAno(monthKey)}</Text>
                        <View style={s.yearCountBadge}>
                          <Text style={s.yearCountBadgeText}>
                            {monthMovs.length} movimiento{monthMovs.length !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-right" : "chevron-down"}
                        size={22}
                        color={COLORS.text}
                      />
                    </TouchableOpacity>

                    {!isCollapsed && (
                      <View style={s.yearLampsList}>
                        {monthMovs.map((mov) => {
                          const isInst = mov.tipo === "instalacion";
                          const isRet = mov.tipo === "retiro";

                          const movColor = isInst ? COLORS.primary : isRet ? COLORS.danger : COLORS.success;
                          const movIcon = isInst ? "projector" : isRet ? "projector-off" : "package-variant-closed";
                          const movText = isInst ? `Instalada en Sala ${mov.sala}` : isRet ? `Retirada de Sala ${mov.sala}` : "Ingreso a Backup";

                          return (
                            <View key={mov.id} style={s.finalCard}>
                              <View style={s.finalCardHeader}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <MaterialCommunityIcons
                                    name={movIcon}
                                    size={16}
                                    color={movColor}
                                  />
                                  <Text style={[s.finalNomenclature, { color: movColor }]}>
                                    {movText}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={s.dotsBtn}
                                  onPress={() => setRevertConfirmModal(mov)}
                                >
                                  <MaterialCommunityIcons name="dots-vertical" size={20} color={COLORS.muted} />
                                </TouchableOpacity>
                              </View>

                              <Text style={[s.nomenclatureText, { fontSize: 16, marginBottom: 8 }]}>
                                {isInst ? `#${mov.sala} - ${mov.lamparaId}` : mov.lamparaId}
                              </Text>

                              <View style={[s.lampDetailsRow, { marginBottom: 8 }]}>
                                {mov.marca ? (
                                  <View style={s.detailChip}>
                                    <Text style={s.detailChipText}>{mov.marca}</Text>
                                  </View>
                                ) : null}
                                {mov.potencia ? (
                                  <View style={[s.detailChip, { backgroundColor: COLORS.primarySoft }]}>
                                    <Text style={[s.detailChipText, { color: COLORS.primary }]}>
                                      {mov.potencia}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>

                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                                <Text style={[s.dateLabel, { marginBottom: 0 }]}>
                                  🕒 {formatFirebaseDate(mov.fecha)}
                                </Text>
                                <Text style={s.userLabel}>
                                  👤 {mov.userName || "Operador"}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
        </View>

        {/* PESTAÑA 5: SIMULACIÓN */}
        {activeTab === "SIMULACION" && (
          <View style={{ gap: 14, width: "100%" }}>
            {/* Mode Selector Card */}
            <View style={[s.simModeContainer, { marginHorizontal: 0 }]}>
              <TouchableOpacity
                style={[s.simModeBtn, simMode === "SEMANAL" && s.simModeBtnActive]}
                onPress={() => setSimMode("SEMANAL")}
              >
                <MaterialCommunityIcons name="calendar-clock" size={18} color={simMode === "SEMANAL" ? "#FFF" : COLORS.muted} />
                <Text style={[s.simModeBtnText, simMode === "SEMANAL" && s.simModeBtnTextActive]}>Control Semanal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.simModeBtn, simMode === "MANUAL" && s.simModeBtnActive]}
                onPress={() => setSimMode("MANUAL")}
              >
                <MaterialCommunityIcons name="keyboard-outline" size={18} color={simMode === "MANUAL" ? "#FFF" : COLORS.muted} />
                <Text style={[s.simModeBtnText, simMode === "MANUAL" && s.simModeBtnTextActive]}>Simulación Manual</Text>
              </TouchableOpacity>
            </View>

            {simMode === "SEMANAL" ? (
              /* MODO CONTROL SEMANAL */
              <View style={s.simCard}>
                <Text style={s.simCardTitle}>🗓️ Simular con Control Semanal</Text>
                <Text style={s.simCardSubtitle}>
                  Elegí un proyector para leer sus horas restantes y la fecha del reporte. Luego cargá el promedio de uso diario para calcular el día de reemplazo.
                </Text>

                <Text style={s.label}>1. Seleccionar Proyector (Sala) *</Text>
                
                {latestControl ? (
                  <View style={s.roomSelectGrid}>
                    {Array.from({ length: salasCount }, (_, i) => i + 1).map((roomNum) => {
                      const isSelected = simSelectedRoom === roomNum;
                      const activeLamp = activeLampsBySala[roomNum];
                      const controlLamp = latestControl?.lamparas?.find((l: any) => l.sala === roomNum);
                      const hasControlData = !!controlLamp;
                      
                      return (
                        <TouchableOpacity
                          key={roomNum}
                          style={[
                            s.roomSelectBtn,
                            isSelected && s.roomSelectBtnActive,
                            !hasControlData && { opacity: 0.4 }
                          ]}
                          onPress={() => {
                            if (hasControlData) {
                              setSimSelectedRoom(roomNum);
                            } else {
                              Alert.alert(
                                "Sin Datos", 
                                `La Sala ${roomNum} no tiene datos cargados en el último Control Semanal.`
                              );
                            }
                          }}
                        >
                          <Text style={[s.roomSelectBtnText, isSelected && s.roomSelectBtnTextActive]}>
                            Sala {roomNum}
                          </Text>
                          {activeLamp && (
                            <Text style={[s.roomSelectBtnSubText, isSelected && s.roomSelectBtnSubTextActive]} numberOfLines={1}>
                              {activeLamp.id}
                            </Text>
                          )}
                          {controlLamp && (
                            <Text style={[s.roomSelectBtnHours, isSelected && s.roomSelectBtnHoursActive]}>
                              {controlLamp.horasRestantes} h
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={[s.infoBanner, { backgroundColor: "#FDE8E8", borderColor: "#F8B4B4", marginVertical: 8 }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#9B1C1C" style={{ marginRight: 6 }} />
                    <Text style={[s.infoBannerText, { color: "#9B1C1C" }]}>
                      No se encontraron reportes de Control Semanal cargados para este cine. Completá un Control Semanal primero para usar esta opción.
                    </Text>
                  </View>
                )}

                {simSelectedRoom !== null && (
                  (() => {
                    const controlLamp = latestControl?.lamparas?.find((l: any) => l.sala === simSelectedRoom);
                    const activeLamp = activeLampsBySala[simSelectedRoom];
                    const dateReport = latestControl?.fecha ? dayjs(latestControl.fecha).format("dddd DD [de] MMMM") : "-";
                    return (
                      <View style={s.selectedRoomDetailsCard}>
                        <View style={s.selectedRoomDetailRow}>
                          <Text style={s.selectedRoomDetailLabel}>Lámpara Instalada:</Text>
                          <Text style={s.selectedRoomDetailVal}>{activeLamp ? `${activeLamp.marca || ""} ${activeLamp.modelo || ""} (${activeLamp.id})` : "No registrada"}</Text>
                        </View>
                        <View style={s.selectedRoomDetailRow}>
                          <Text style={s.selectedRoomDetailLabel}>Horas Restantes (al reporte):</Text>
                          <Text style={[s.selectedRoomDetailVal, { color: COLORS.primary }]}>{controlLamp?.horasRestantes ?? 0} h</Text>
                        </View>
                        <View style={s.selectedRoomDetailRow}>
                          <Text style={s.selectedRoomDetailLabel}>Fecha del Reporte:</Text>
                          <Text style={s.selectedRoomDetailVal}>{dateReport} ({latestControl?.fecha ?? ""})</Text>
                        </View>
                      </View>
                    );
                  })()
                )}

                <Text style={s.label}>2. Cargar Uso Diario (Horas) *</Text>
                <TextInput
                  value={simSemanalDailyUsage}
                  onChangeText={setSimSemanalDailyUsage}
                  placeholder="Ej: 6.5 o 8"
                  placeholderTextColor={COLORS.muted}
                  style={s.input}
                  keyboardType="numeric"
                />
              </View>
            ) : (
              /* MODO SIMULACIÓN MANUAL */
              <View style={s.simCard}>
                <Text style={s.simCardTitle}>✍️ Simulación Manual</Text>
                <Text style={s.simCardSubtitle}>
                  Ingresá las horas restantes de la lámpara, el promedio de horas de uso diarias y la fecha de inicio de la simulación.
                </Text>

                {/* Aclaración requerida por el usuario */}
                <View style={[s.infoBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", marginBottom: 6 }]}>
                  <MaterialCommunityIcons name="information" size={18} color="#1E40AF" style={{ marginRight: 6 }} />
                  <Text style={[s.infoBannerText, { color: "#1E40AF" }]}>
                    <Text style={{ fontWeight: "700" }}>Aclaración importante:</Text> Las horas ingresadas deben ser las que tiene el proyector al <Text style={{ fontWeight: "700" }}>comienzo</Text> del día o al <Text style={{ fontWeight: "700" }}>cierre</Text> del día anterior (no a mitad de jornada).
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Horas Restantes *</Text>
                    <TextInput
                      value={simManualHours}
                      onChangeText={setSimManualHours}
                      placeholder="Ej: 800"
                      placeholderTextColor={COLORS.muted}
                      style={s.input}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Uso Diario (Horas) *</Text>
                    <TextInput
                      value={simManualDailyUsage}
                      onChangeText={setSimManualDailyUsage}
                      placeholder="Ej: 7.5"
                      placeholderTextColor={COLORS.muted}
                      style={s.input}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Text style={s.label}>Fecha Inicial *</Text>
                <View style={{ flexDirection: width < 600 ? "column" : "row", gap: 8, alignItems: width < 600 ? "stretch" : "center" }}>
                  <TextInput
                    value={simManualStartDate}
                    onChangeText={setSimManualStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.muted}
                    style={[s.input, { flex: width < 600 ? undefined : 1 }]}
                  />
                  <View style={{ flexDirection: "row", gap: 4, marginTop: width < 600 ? 4 : 0 }}>
                    <TouchableOpacity style={[s.adjustDateBtn, { flex: 1, minWidth: 50 }]} onPress={() => adjustManualDate(-1)}>
                      <Text style={s.adjustDateBtnText}>-1 día</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.adjustDateBtn, { flex: 1, minWidth: 50 }]} onPress={() => setSimManualStartDate(dayjs().format("YYYY-MM-DD"))}>
                      <Text style={s.adjustDateBtnText}>Hoy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.adjustDateBtn, { flex: 1, minWidth: 50 }]} onPress={() => adjustManualDate(1)}>
                      <Text style={s.adjustDateBtnText}>+1 día</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* SimResult Rendering */}
            {simResult ? (
              <View style={s.resultsContainer}>
                <Text style={s.resultsSectionTitle}>📊 Resultados de la Simulación</Text>
                
                {/* Recommended Date Card */}
                <View style={s.recommendationCard}>
                  <View style={s.recHeader}>
                    <MaterialCommunityIcons name="wrench" size={20} color="#92400E" />
                    <Text style={s.recTitle}>Momento Recomendado para el Cambio</Text>
                  </View>
                  
                  <Text style={s.recDateText}>{simResult.recommendationText}</Text>
                  
                  <View style={s.recDetailsRow}>
                    <View style={s.recDetailItem}>
                      <Text style={s.recDetailLabel}>Días Seguros Restantes</Text>
                      <Text style={s.recDetailValue}>{simResult.days} {simResult.days === 1 ? "día" : "días"}</Text>
                    </View>
                    <View style={s.recDetailItem}>
                      <Text style={s.recDetailLabel}>Horas al momento de cambio</Text>
                      <Text style={[s.recDetailValue, { color: simResult.hoursAtChange < 2 ? COLORS.danger : "#047857" }]}>
                        {simResult.hoursAtChange} h
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={s.recNote}>
                    💡 La lámpara se cambia lo más cercano a 0 posible sin exceder las horas de uso seguro.
                  </Text>
                </View>

                {/* Table Title */}
                <Text style={s.tableTitle}>📅 Proyección Día por Día</Text>

                {/* Day by Day Table */}
                <View style={s.tableContainer}>
                  {/* Table Header */}
                  {width < 600 ? (
                    <View style={s.tableHeaderRow}>
                      <Text style={[s.tableColHeader, { flex: 2.2 }]}>Jornada / Fecha</Text>
                      <Text style={[s.tableColHeader, { flex: 1.3, textAlign: "right" }]}>Final</Text>
                      <Text style={[s.tableColHeader, { flex: 2.5, textAlign: "center" }]}>Estado</Text>
                    </View>
                  ) : (
                    <View style={s.tableHeaderRow}>
                      <Text style={[s.tableColHeader, { flex: 1.2 }]}>Jornada</Text>
                      <Text style={[s.tableColHeader, { flex: 2 }]}>Fecha</Text>
                      <Text style={[s.tableColHeader, { flex: 1.5, textAlign: "right" }]}>Inicio</Text>
                      <Text style={[s.tableColHeader, { flex: 1.2, textAlign: "right" }]}>Uso</Text>
                      <Text style={[s.tableColHeader, { flex: 1.5, textAlign: "right" }]}>Final</Text>
                      <Text style={[s.tableColHeader, { flex: 2.3, textAlign: "center" }]}>Estado</Text>
                    </View>
                  )}
                  
                  {/* Table Body */}
                  {simResult.simulationDays.map((item, index) => {
                    let badgeBg = "#DEF7EC";
                    let badgeText = "#03543F";
                    let statusText = width < 600 ? "" : "Seguro";
                    let statusIcon = "check-circle";
                    
                    if (item.status === "RECOMENDADO") {
                      badgeBg = "#FEF3C7";
                      badgeText = "#92400E";
                      statusText = width < 600 ? "Cambiar" : "Cambiar al cierre";
                      statusIcon = "wrench";
                    } else if (item.status === "INSUFICIENTE") {
                      badgeBg = "#FDE8E8";
                      badgeText = "#9B1C1C";
                      statusText = width < 600 ? "Agotado" : "Horas insuficientes";
                      statusIcon = "close-circle";
                    }
                    
                    const dailyUsageVal = simMode === "SEMANAL" ? parseFloat(simSemanalDailyUsage) : parseFloat(simManualDailyUsage);

                    return (
                      <View key={item.dayIndex} style={[s.tableRow, index % 2 === 1 && s.tableRowAlternating]}>
                        {width < 600 ? (
                          <>
                            <Text style={[s.tableCell, { flex: 2.2, fontSize: 11, textTransform: "capitalize" }]} numberOfLines={1}>
                              D{item.dayIndex} - {dayjs(item.date).format("ddd DD/MM")}
                            </Text>
                            <Text style={[s.tableCell, { flex: 1.3, textAlign: "right", fontWeight: "600" }]}>{item.hoursAtEnd} h</Text>
                            <View style={{ flex: 2.5, alignItems: "center", justifyContent: "center" }}>
                              <View style={[s.statusBadge, { backgroundColor: badgeBg }]}>
                                <MaterialCommunityIcons name={statusIcon as any} size={11} color={badgeText} style={{ marginRight: statusText ? 3 : 0 }} />
                                <Text style={[s.statusBadgeText, { color: badgeText }]} numberOfLines={1}>
                                  {statusText}
                                </Text>
                              </View>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={[s.tableCell, { flex: 1.2, fontWeight: "700" }]}>Día {item.dayIndex}</Text>
                            <Text style={[s.tableCell, { flex: 2, fontSize: 12, textTransform: "capitalize" }]} numberOfLines={1}>
                              {item.dateFormatted}
                            </Text>
                            <Text style={[s.tableCell, { flex: 1.5, textAlign: "right" }]}>{item.hoursAtStart} h</Text>
                            <Text style={[s.tableCell, { flex: 1.2, textAlign: "right", color: COLORS.muted }]}>{dailyUsageVal} h</Text>
                            <Text style={[s.tableCell, { flex: 1.5, textAlign: "right", fontWeight: "600" }]}>{item.hoursAtEnd} h</Text>
                            
                            <View style={{ flex: 2.3, alignItems: "center", justifyContent: "center" }}>
                              <View style={[s.statusBadge, { backgroundColor: badgeBg }]}>
                                <MaterialCommunityIcons name={statusIcon as any} size={11} color={badgeText} style={{ marginRight: statusText ? 3 : 0 }} />
                                <Text style={[s.statusBadgeText, { color: badgeText }]} numberOfLines={1}>
                                  {statusText}
                                </Text>
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={s.emptySimCard}>
                <MaterialCommunityIcons name="calculator-variant-outline" size={48} color={COLORS.muted} />
                <Text style={s.emptySimTitle}>Esperando Datos Completos</Text>
                <Text style={s.emptySimSubtitle}>
                  {simMode === "SEMANAL"
                    ? "Seleccioná un proyector de la lista superior e ingresá el uso diario aproximado."
                    : "Ingresá las horas restantes de la lámpara, el promedio de uso diario y la fecha inicial."}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─── MODAL: NUEVA LÁMPARA A BACKUP ─── */}
      <Modal
        visible={showAddBackup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddBackup(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { maxHeight: "90%" }]}>
            <Text style={s.modalTitle}>Nueva Lámpara a Backup</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 6 }} contentContainerStyle={{ gap: 12 }}>
              <Text style={s.label}>ID de Lámpara *</Text>
              <TextInput
                value={bId}
                onChangeText={(text) => setBId(text.toUpperCase())}
                placeholder="Ej: L-450, XL-3000..."
                placeholderTextColor={COLORS.muted}
                style={s.input}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <Text style={s.label}>Marca / Fabricante (opcional)</Text>
              <TextInput
                value={bMarca}
                onChangeText={setBMarca}
                placeholder="Ej: Ushio, Osram, Christie..."
                placeholderTextColor={COLORS.muted}
                style={s.input}
              />

              <Text style={s.label}>Potencia</Text>
              <View style={s.pickerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.potenciaRow}>
                  {POTENCIAS_OPTIONS.map((opt) => {
                    const isSelected = bPotencia === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[s.potenciaOption, isSelected && s.potenciaOptionSelected]}
                        onPress={() => setBPotencia(opt)}
                      >
                        <Text style={[s.potenciaOptionText, isSelected && s.potenciaOptionTextSelected]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={s.label}>Modelo</Text>
              <View style={s.pickerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.potenciaRow}>
                  {MODELOS_OPTIONS.map((opt) => {
                    const isSelected = bModelo === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[s.potenciaOption, isSelected && s.potenciaOptionSelected]}
                        onPress={() => setBModelo(opt)}
                      >
                        <Text style={[s.potenciaOptionText, isSelected && s.potenciaOptionTextSelected]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={s.label}>Notas / Descripción adicional (opcional)</Text>
              <TextInput
                value={bNotas}
                onChangeText={setBNotas}
                placeholder="Detalles"
                placeholderTextColor={COLORS.muted}
                multiline
                numberOfLines={3}
                style={[s.input, s.textAreaInput]}
              />

              {!!addError && <Text style={s.errorText}>{addError}</Text>}
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.btnGhost}
                onPress={() => setShowAddBackup(false)}
                disabled={savingBackup}
              >
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleAddBackup}
                disabled={savingBackup}
              >
                {savingBackup ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.btnPrimaryText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: INSTALAR LÁMPARA DESDE BACKUP ─── */}
      <Modal
        visible={!!installModal}
        transparent
        animationType="fade"
        onRequestClose={() => setInstallModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { maxHeight: "90%" }]}>
            <Text style={s.modalTitle}>Instalar Lámpara</Text>
            {installModal && (
              <Text style={s.modalSubtitle}>Seleccioná la lámpara para instalar en la Sala {installModal.sala}</Text>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 6 }} contentContainerStyle={{ gap: 12 }}>
              <Text style={s.label}>Lámparas en Stock Backup</Text>
              <View style={s.backupPickerWrap}>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator>
                  {backupLamps.map((lamp) => {
                    const isSelected = selectedBackupId === lamp.id;
                    return (
                      <TouchableOpacity
                        key={lamp.id}
                        style={[s.backupPickerItem, isSelected && s.backupPickerItemSelected]}
                        onPress={() => setSelectedBackupId(lamp.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[s.backupPickerItemTitle, isSelected && s.backupPickerItemTextSelected]}>
                            {lamp.id}
                          </Text>
                          <Text style={s.backupPickerItemSub}>
                            {lamp.marca || "Genérica"} - {lamp.potencia || "Potencia N/A"}
                          </Text>
                        </View>
                        {isSelected ? (
                          <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.btnGhost}
                onPress={() => setInstallModal(null)}
                disabled={savingInstall}
              >
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleInstall}
                disabled={savingInstall}
              >
                {savingInstall ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.btnPrimaryText}>Confirmar Instalación</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: FORMULARIO DE RETIRO DE LÁMPARA ─── */}
      <Modal
        visible={!!retireModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRetireModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Retirar Lámpara del Proyector</Text>
            {retireModal && (
              <Text style={s.modalSubtitle}>
                Sala {retireModal.sala} · Lámpara {retireModal.lamparaId}
              </Text>
            )}

            <View style={s.modalRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={s.label}>Horas Usadas *</Text>
                <TextInput
                  value={rHorasUsadas}
                  onChangeText={setRHorasUsadas}
                  placeholder="Ej: 2100"
                  placeholderTextColor={COLORS.muted}
                  style={s.input}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={s.label}>Horas Restantes *</Text>
                <TextInput
                  value={rHorasRestantes}
                  onChangeText={setRHorasRestantes}
                  placeholder="Ej: 900"
                  placeholderTextColor={COLORS.muted}
                  style={s.input}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={s.label}>Tipo de Retiro *</Text>
            <View style={s.typeSelector}>
              {(["Fin de vida util", "Garantia", "Fuera de garantia"] as const).map((opt) => {
                const isSelected = rTipoRetiro === opt;
                let activeColor = COLORS.muted;
                if (opt === "Garantia") activeColor = "#047857";
                if (opt === "Fuera de garantia") activeColor = COLORS.danger;

                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      s.typeOptBtn,
                      isSelected && { borderColor: activeColor, backgroundColor: activeColor + "15" },
                    ]}
                    onPress={() => setRTipoRetiro(opt)}
                  >
                    <Text
                      style={[
                        s.typeOptText,
                        isSelected && { color: activeColor, fontWeight: "800" },
                      ]}
                    >
                      {opt === "Fin de vida util"
                        ? "Fin Vida Útil"
                        : opt === "Garantia"
                          ? "Garantía"
                          : "Fuera Garantía"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>Descripción / Comentarios adicionales</Text>
            <TextInput
              value={rDescripcion}
              onChangeText={setRDescripcion}
              placeholder="Detallar motivos del retiro o estado visual..."
              placeholderTextColor={COLORS.muted}
              multiline
              numberOfLines={3}
              style={[s.input, s.textAreaInput]}
            />

            {!!retireError && <Text style={s.errorText}>{retireError}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.btnGhost}
                onPress={() => setRetireModal(null)}
                disabled={savingRetire}
              >
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnDanger}
                onPress={handleRetire}
                disabled={savingRetire}
              >
                {savingRetire ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.btnPrimaryText}>Confirmar Retiro</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: CONFIRMACIÓN DE ELIMINACIÓN DE BACKUP ─── */}
      <Modal
        visible={!!deleteConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Eliminar Lámpara de Backup</Text>
            <Text style={s.confirmText}>
              ¿Seguro que querés eliminar la lámpara{" "}
              <Text style={{ fontWeight: "900" }}>{deleteConfirmModal?.id}</Text> del stock de backup?
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setDeleteConfirmModal(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnDanger}
                onPress={() => deleteConfirmModal && handleDeleteLamp(deleteConfirmModal)}
              >
                <Text style={s.btnPrimaryText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: CONFIRMAR REVERSIÓN DE MOVIMIENTO ─── */}
      <Modal
        visible={!!revertConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRevertConfirmModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Revertir Movimiento</Text>
            {revertConfirmModal && (
              <Text style={s.confirmText}>
                ¿Seguro que querés <Text style={{ fontWeight: "900", color: COLORS.danger }}>revertir y eliminar</Text> este registro de{" "}
                <Text style={{ fontWeight: "700" }}>
                  {revertConfirmModal.tipo === "instalacion"
                    ? `Instalación de ${revertConfirmModal.lamparaId} en Sala ${revertConfirmModal.sala}`
                    : revertConfirmModal.tipo === "retiro"
                      ? `Retiro de ${revertConfirmModal.lamparaId} de Sala ${revertConfirmModal.sala}`
                      : `Ingreso a Backup de ${revertConfirmModal.lamparaId}`}
                </Text>? Esto deshará sus efectos en el stock de proyectores y backup de forma inmediata.
              </Text>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setRevertConfirmModal(null)} disabled={!!revertingMovId}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnDanger}
                onPress={() => revertConfirmModal && handleRevertMovement(revertConfirmModal)}
                disabled={!!revertingMovId}
              >
                {revertingMovId ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.btnPrimaryText}>Revertir Acción</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Action Button for Backup */}
      {!readOnly && activeTab === "BACKUP" && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => {
            setBId("");
            setBMarca("USHIO");
            setBPotencia("3000W");
            setBModelo("DXL-30BAF/L");
            setBNotas("");
            setAddError("");
            setShowAddBackup(true);
          }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={s.fabText}>Nueva Lámpara</Text>
        </TouchableOpacity>
      )}
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

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
  },
  headerTextBlock: {
    flex: 1,
    alignItems: "center",
  },
  pageTitle: { fontSize: 22, fontWeight: "900", color: COLORS.text, textAlign: "center" },
  pageSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2, fontWeight: "500", textAlign: "center" },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    ...THEME.shadow.soft,
  },
  addBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  // Tab segmented bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 14,
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
  tabIcon: {
    // Icon margin/color handled dynamically
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
  },
  tabBtnTextActive: {
    color: "#FFF",
  },

  // 1. Proyectores Grid
  proyectoresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  roomCard: {
    width: Platform.OS === "web" ? "31.5%" : "100%",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    minHeight: 180,
    justifyContent: "space-between",
    ...THEME.shadow.soft,
  },
  roomCardActive: {
    borderColor: COLORS.primary + "30",
  },
  roomCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  roomTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.successBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#047857",
  },
  emptyBadge: {
    backgroundColor: COLORS.bgMobile,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  emptyBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.muted,
  },
  roomLampInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  nomenclatureText: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.primary,
    marginBottom: 6,
  },
  lampDetailsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  detailChip: {
    backgroundColor: COLORS.bgMobile,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSoft,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 6,
  },
  lampNotes: {
    fontSize: 11,
    color: COLORS.textSoft,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 6,
    fontStyle: "italic",
    marginBottom: 10,
  },
  retireBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    paddingVertical: 8,
    gap: 6,
  },
  retireBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
  },
  roomEmptyInfo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 10,
  },
  emptyRoomText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 8,
  },
  installBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  installBtnText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },

  // 2. Stock Backup List
  backupList: {
    gap: 12,
  },
  backupCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  backupCardLeft: {
    flex: 1,
    paddingRight: 10,
  },
  backupIdTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 6,
  },
  backupNotes: {
    fontSize: 12,
    color: COLORS.textSoft,
    marginTop: 6,
    fontStyle: "italic",
  },
  deleteIconBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: COLORS.dangerSoft,
  },

  // Empty stock state
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  emptyCardSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },

  // 3. Historial Final
  historialContainer: {
    gap: 14,
  },
  yearSection: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...THEME.shadow.soft,
  },
  yearHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  yearHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  yearTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  yearCountBadge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  yearCountBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.primary,
  },
  yearLampsList: {
    padding: 16,
    gap: 16,
  },
  finalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  finalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  finalNomenclature: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.primary,
  },
  retirementBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retirementBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  hoursGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  hoursBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hoursTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 4,
  },
  hoursVal: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.text,
  },
  historyTimeline: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginBottom: 12,
  },
  timelineItem: {
    fontSize: 11,
    color: COLORS.textSoft,
  },
  retirementDesc: {
    backgroundColor: COLORS.primarySoft + "30",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    borderRadius: 6,
    padding: 10,
  },
  retirementDescTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 2,
  },
  retirementDescText: {
    fontSize: 12,
    color: COLORS.text,
    fontStyle: "italic",
    lineHeight: 16,
  },

  // Modales
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
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: -8,
    marginBottom: 4,
    fontWeight: "600",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 4,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "500",
  },
  textAreaInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  confirmText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginVertical: 10,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  btnPrimary: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#FFF",
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

  // Potencia horizontal selection
  pickerContainer: {
    height: 42,
    marginVertical: 4,
  },
  potenciaRow: {
    flexDirection: "row",
    gap: 8,
  },
  potenciaOption: {
    backgroundColor: COLORS.bgMobile,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
  },
  potenciaOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  potenciaOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSoft,
  },
  potenciaOptionTextSelected: {
    color: "#FFF",
  },

  // Backup Picker in Install Modal
  backupPickerWrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    marginVertical: 4,
  },
  backupPickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backupPickerItemSelected: {
    backgroundColor: COLORS.primarySoft + "40",
  },
  backupPickerItemTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },
  backupPickerItemTextSelected: {
    color: COLORS.primary,
  },
  backupPickerItemSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
    fontWeight: "600",
  },

  // Retirement type selector
  typeSelector: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 4,
  },
  typeOptBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: COLORS.bg,
  },
  typeOptText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "var(--info-bg, #EFF6FF)" : "#EFF6FF",
    borderColor: Platform.OS === "web" ? "var(--info-border, #DBEAFE)" : "#DBEAFE",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: Platform.OS === "web" ? "var(--info, #1E40AF)" : "#1E40AF",
    fontWeight: "500",
    lineHeight: 16,
  },
  roomHoursContainer: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 10,
  },
  roomHoursBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  roomHoursLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 2,
  },
  roomHoursVal: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.text,
  },
  dotsBtn: {
    padding: 4,
    borderRadius: 8,
  },
  userLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    ...THEME.shadow.web,
    elevation: 6,
    zIndex: 999,
  },
  fabText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 14,
  },

  // 6. Simulación styles
  simModeContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginBottom: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  simModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 6,
  },
  simModeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  simModeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
  },
  simModeBtnTextActive: {
    color: "#FFF",
  },
  simCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 16,
    gap: 12,
    ...THEME.shadow.soft,
  },
  simCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  simCardSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  roomSelectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 10,
  },
  roomSelectBtn: {
    flexGrow: 1,
    minWidth: 80,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  roomSelectBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  roomSelectBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },
  roomSelectBtnTextActive: {
    color: COLORS.primary,
  },
  roomSelectBtnSubText: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  roomSelectBtnSubTextActive: {
    color: COLORS.primary + "B0",
  },
  roomSelectBtnHours: {
    fontSize: 11,
    fontWeight: "800",
    color: "#059669",
    marginTop: 4,
  },
  roomSelectBtnHoursActive: {
    color: COLORS.primary,
  },
  selectedRoomDetailsCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  selectedRoomDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectedRoomDetailLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: "600",
  },
  selectedRoomDetailVal: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "800",
  },
  adjustDateRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  adjustDateBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  adjustDateBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  resultsContainer: {
    gap: 12,
  },
  resultsSectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 10,
  },
  recommendationCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: 16,
    gap: 10,
  },
  recHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#92400E",
  },
  recDateText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#78350F",
    lineHeight: 24,
  },
  recDetailsRow: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderColor: "#FCD34D50",
    paddingTop: 10,
  },
  recDetailItem: {
    flex: 1,
  },
  recDetailLabel: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "600",
    marginBottom: 2,
  },
  recDetailValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#78350F",
  },
  recNote: {
    fontSize: 11,
    color: "#B45309",
    fontStyle: "italic",
    marginTop: 2,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 10,
  },
  tableContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border + "40",
    alignItems: "center",
  },
  tableRowAlternating: {
    backgroundColor: COLORS.bg + "40",
  },
  tableCell: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  emptySimCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...THEME.shadow.soft,
  },
  emptySimTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 4,
  },
  emptySimSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
  },
});

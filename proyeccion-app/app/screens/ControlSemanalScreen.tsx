import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  getDoc,
  serverTimestamp,
} from "@/lib/dbService";
import React, { useEffect, useState, useCallback } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  useWindowDimensions,
  View,
} from "react-native";
import * as Print from "expo-print";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import localizedFormat from "dayjs/plugin/localizedFormat";
import "dayjs/locale/es";

// Configuración de dayjs
dayjs.extend(isoWeek);
dayjs.extend(localizedFormat);
dayjs.locale("es");

import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { Rma } from "../../lib/types";
import { getCineConfig } from "../../lib/cineConfig";

// ─── Constants & Defaults ───────────────────────────────────────────────────

const POTENCIAS_OPTIONS = [
  "1200W Digital",
  "2000W Digital",
  "2200W Digital",
  "3000W Digital",
  "4000W Digital",
  "4500W Digital",
  "6000W Digital",
  "6500W Digital",
  "7000W Digital",
];

const SALAS_DEFAULTS = [
  { sala: 1, potencia: "3000W Digital", medicion2d: "16.1", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 2, potencia: "2200W Digital", medicion2d: "16.26", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 3, potencia: "2200W Digital", medicion2d: "15.22", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 4, potencia: "2200W Digital", medicion2d: "16.3", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 5, potencia: "3000W Digital", medicion2d: "19.4", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 6, potencia: "2000W Digital", medicion2d: "18.23", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 7, potencia: "2200W Digital", medicion2d: "16.3", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 8, potencia: "3000W Digital", medicion2d: "20.3", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 9, potencia: "3000W Digital", medicion2d: "18.1", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 10, potencia: "3000W Digital", medicion2d: "21.2", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 11, potencia: "3000W Digital", medicion2d: "20.3", medicion3d: "5.7", calibrado: true, horasActuales: "0", horasRestantes: "0" },
  { sala: 12, potencia: "3000W Digital", medicion2d: "17.2", medicion3d: "", calibrado: true, horasActuales: "0", horasRestantes: "0" },
];

const DIAS_SEMANA = ["Sabado", "Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];

const getDynamicSalasDefaults = (count: number) => {
  return Array.from({ length: count }, (_, i) => {
    const salaNum = i + 1;
    const existing = SALAS_DEFAULTS.find((d) => d.sala === salaNum);
    if (existing) {
      return { ...existing };
    }
    return {
      sala: salaNum,
      potencia: "3000W Digital",
      medicion2d: "",
      medicion3d: "",
      calibrado: true,
      horasActuales: "0",
      horasRestantes: "0",
    };
  });
};

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface LamparaData {
  sala: number;
  potencia: string;
  medicion2d: string;
  medicion3d: string;
  calibrado: boolean;
  horasActuales: string;
  horasRestantes: string;
}

export default function ControlSemanalScreen({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, loading: sessionLoading, displayName } = useAuthUser();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Estados Principales
  const [loading, setLoading] = useState(true);
  const [rmas, setRmas] = useState<Rma[]>([]);
  const [saving, setSaving] = useState(false);

  const [salasCount, setSalasCount] = useState(12);
  const [loadingSalas, setLoadingSalas] = useState(true);

  // Refs para navegación con flechas del teclado
  const actualRefs = React.useRef<(any)[]>([]);
  const restanteRefs = React.useRef<(any)[]>([]);

  const handleKeyPress = (
    e: any,
    index: number,
    field: "horasActuales" | "horasRestantes"
  ) => {
    const key = e.nativeEvent.key;
    if (key === "ArrowDown") {
      const nextIdx = index + 1;
      if (nextIdx < salasCount) {
        const target = field === "horasActuales" ? actualRefs.current[nextIdx] : restanteRefs.current[nextIdx];
        target?.focus();
      }
    } else if (key === "ArrowUp") {
      const prevIdx = index - 1;
      if (prevIdx >= 0) {
        const target = field === "horasActuales" ? actualRefs.current[prevIdx] : restanteRefs.current[prevIdx];
        target?.focus();
      }
    }
  };

  // Configuración de autollenado de horas de lámpara
  const [autollenado, setAutollenado] = useState<boolean>(true);
  const [vidaUtil4500, setVidaUtil4500] = useState<string>("1000");
  const [vidaUtil4000, setVidaUtil4000] = useState<string>("1000");
  const [vidaUtil3000, setVidaUtil3000] = useState<string>("3000");
  const [vidaUtil2200, setVidaUtil2200] = useState<string>("2500");
  const [vidaUtil2000, setVidaUtil2000] = useState<string>("2500");
  const [vidaUtil1200, setVidaUtil1200] = useState<string>("3000");
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // Campos de Fecha y Cabecera
  const [fecha, setFecha] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [fechaText, setFechaText] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [semanaStr, setSemanaStr] = useState<string>("Semana 20");
  const [weekKey, setWeekKey] = useState<string>("");
  const [subgerente, setSubgerente] = useState<string>("VICTOR DIAZ");
  const [responsable, setResponsable] = useState<string>("");
  const [complejo, setComplejo] = useState<string>("Complejo 2004 - Abasto");

  // Lectura de Lámparas
  const [lamparas, setLamparas] = useState<LamparaData[]>([]);

  // Helper para obtener vida útil predeterminada de la lámpara
  const getVidaUtil = (potenciaStr: string) => {
    const p = String(potenciaStr || "").toLowerCase();
    if (p.includes("4500")) return parseInt(vidaUtil4500, 10) || 1000;
    if (p.includes("4000")) return parseInt(vidaUtil4000, 10) || 1000;
    if (p.includes("3000")) return parseInt(vidaUtil3000, 10) || 3000;
    if (p.includes("2200")) return parseInt(vidaUtil2200, 10) || 2500;
    if (p.includes("2000")) return parseInt(vidaUtil2000, 10) || 2500;
    if (p.includes("1200")) return parseInt(vidaUtil1200, 10) || 3000;
    return 3000; // default fallback
  };

  // Cargar configuración del cine (salasCount)
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      if (!cineId) {
        setSalasCount(12);
        setLoadingSalas(false);
        return;
      }

      try {
        setLoadingSalas(true);
        const cfg = await getCineConfig(cineId);

        if (cancelled) return;

        const count =
          cfg?.salasCount && Number.isFinite(cfg.salasCount) && cfg.salasCount > 0
            ? Math.floor(cfg.salasCount)
            : 12;

        setSalasCount(count);
      } catch (e) {
        console.error("ControlSemanal config error:", e);
        if (!cancelled) {
          setSalasCount(12);
        }
      } finally {
        if (!cancelled) {
          setLoadingSalas(false);
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [cineId]);

  // Cargar configuración de autollenado
  useEffect(() => {
    if (!cineId) return;
    (async () => {
      try {
        const localAuto = await AsyncStorage.getItem("cs_config_auto");
        const local4500 = await AsyncStorage.getItem("cs_config_4500");
        const local4000 = await AsyncStorage.getItem("cs_config_4000");
        const local3000 = await AsyncStorage.getItem("cs_config_3000");
        const local2200 = await AsyncStorage.getItem("cs_config_2200");
        const local2000 = await AsyncStorage.getItem("cs_config_2000");
        const local1200 = await AsyncStorage.getItem("cs_config_1200");

        if (localAuto !== null) setAutollenado(localAuto === "true");
        if (local4500 !== null) setVidaUtil4500(local4500);
        if (local4000 !== null) setVidaUtil4000(local4000);
        if (local3000 !== null) setVidaUtil3000(local3000);
        if (local2200 !== null) setVidaUtil2200(local2200);
        if (local2000 !== null) setVidaUtil2000(local2000);
        if (local1200 !== null) setVidaUtil1200(local1200);

        // Intentar leer de Firestore (config compartida)
        const docRef = doc(db, CINES_COLLECTION, cineId, "config", "controles_semanales");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.autollenado !== undefined) setAutollenado(!!data.autollenado);
          if (data.vidaUtil4500 !== undefined) setVidaUtil4500(String(data.vidaUtil4500));
          if (data.vidaUtil4000 !== undefined) setVidaUtil4000(String(data.vidaUtil4000));
          if (data.vidaUtil3000 !== undefined) setVidaUtil3000(String(data.vidaUtil3000));
          if (data.vidaUtil2200 !== undefined) setVidaUtil2200(String(data.vidaUtil2200));
          if (data.vidaUtil2000 !== undefined) setVidaUtil2000(String(data.vidaUtil2000));
          if (data.vidaUtil1200 !== undefined) setVidaUtil1200(String(data.vidaUtil1200));
        }
      } catch (e) {
        console.error("Error al cargar config de lámparas:", e);
      }
    })();
  }, [cineId]);

  const guardarConfiguracion = async () => {
    if (!cineId) return;
    setSavingConfig(true);
    try {
      const v4500 = parseInt(vidaUtil4500, 10);
      const v4000 = parseInt(vidaUtil4000, 10);
      const v3000 = parseInt(vidaUtil3000, 10);
      const v2200 = parseInt(vidaUtil2200, 10);
      const v2000 = parseInt(vidaUtil2000, 10);
      const v1200 = parseInt(vidaUtil1200, 10);

      if (
        isNaN(v4500) || v4500 <= 0 ||
        isNaN(v4000) || v4000 <= 0 ||
        isNaN(v3000) || v3000 <= 0 ||
        isNaN(v2200) || v2200 <= 0 ||
        isNaN(v2000) || v2000 <= 0 ||
        isNaN(v1200) || v1200 <= 0
      ) {
        Alert.alert("Configuración", "Los valores de vida útil deben ser números enteros positivos.");
        setSavingConfig(false);
        return;
      }

      await AsyncStorage.setItem("cs_config_auto", String(autollenado));
      await AsyncStorage.setItem("cs_config_4500", String(v4500));
      await AsyncStorage.setItem("cs_config_4000", String(v4000));
      await AsyncStorage.setItem("cs_config_3000", String(v3000));
      await AsyncStorage.setItem("cs_config_2200", String(v2200));
      await AsyncStorage.setItem("cs_config_2000", String(v2000));
      await AsyncStorage.setItem("cs_config_1200", String(v1200));

      await setDoc(doc(db, CINES_COLLECTION, cineId, "config", "controles_semanales"), {
        autollenado,
        vidaUtil4500: v4500,
        vidaUtil4000: v4000,
        vidaUtil3000: v3000,
        vidaUtil2200: v2200,
        vidaUtil2000: v2000,
        vidaUtil1200: v1200,
        updatedAt: serverTimestamp(),
      });

      setShowConfigModal(false);
      Alert.alert("Configuración", "Valores predeterminados de vida útil guardados correctamente.");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Configuración", `Error al guardar: ${e.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Checklists e indicadores
  const [tempElevada, setTempElevada] = useState<boolean>(false);
  const [tempBaja, setTempBaja] = useState<boolean>(false);
  const [tempCorrecta, setTempCorrecta] = useState<boolean>(true);
  const [controlHumedad, setControlHumedad] = useState<boolean>(false);
  const [promedioTemp, setPromedioTemp] = useState<string>("24");
  const [promedioHumedadMin, setPromedioHumedadMin] = useState<string>("55");
  const [promedioHumedadMax, setPromedioHumedadMax] = useState<string>("60");

  // Mantenimiento Preventivo
  const [diasRealizados, setDiasRealizados] = useState<string[]>([]);
  const [mantenimientoA, setMantenimientoA] = useState<boolean>(false);
  const [mantenimientoB, setMantenimientoB] = useState<boolean>(false);
  const [mantenimientoConfirmado, setMantenimientoConfirmado] = useState<boolean>(false);
  const [mantenimientoSINConfirmar, setMantenimientoSINConfirmar] = useState<boolean>(true);

  // Calidad de Presentación
  const [broadsign, setBroadsign] = useState<boolean>(false);
  const [calificacion, setCalificacion] = useState<boolean>(false);
  const [contenidoDcp, setContenidoDcp] = useState<boolean>(false);
  const [imagen, setImagen] = useState<boolean>(false);
  const [sonido, setSonido] = useState<boolean>(false);
  const [iluminacion, setIluminacion] = useState<boolean>(false);
  const [todasCopias, setTodasCopias] = useState<boolean>(false);
  const [parcialCopias, setParcialCopias] = useState<boolean>(false);
  const [imagenCorrectaSalas, setImagenCorrectaSalas] = useState<boolean>(false);
  const [sonidoCorrectoSalas, setSonidoCorrectoSalas] = useState<boolean>(false);

  // ─── Efectos y Cálculos de Fecha ──────────────────────────────────────────

  // Auto-cálculo de semanaStr y weekKey
  useEffect(() => {
    if (!fecha) return;
    const d = dayjs(fecha);
    if (!d.isValid()) return;
    const wNum = d.isoWeek();
    setSemanaStr(`Semana ${wNum}`);

    // lunes de esa semana
    const startOfWeek = d.startOf("week").add(1, "day");
    const key = startOfWeek.format("YYYY-[W]WW");
    setWeekKey(key);
  }, [fecha]);

  // Carga del Responsable inicial guardado
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("control_semanal_responsable");
        if (stored) {
          setResponsable(stored);
        } else {
          setResponsable("");
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Carga del Complejo desde displayName
  useEffect(() => {
    if (displayName) {
      if (displayName.toLowerCase().includes("abasto")) {
        setComplejo("Complejo 2004 - Abasto");
      } else {
        setComplejo(displayName);
      }
    }
  }, [displayName]);

  // ─── Firestore: Suscribirse a RMAs Activos ─────────────────────────────────
  useEffect(() => {
    if (sessionLoading || !cineId) return;

    setLoading(true);
    const q = query(
      collection(db, CINES_COLLECTION, cineId, "rma"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data();
          let fApertura = "Sin fecha";
          if (data.createdAt) {
            const timestamp = data.createdAt;
            if (timestamp.toDate) {
              fApertura = dayjs(timestamp.toDate()).format("DD/MM/YYYY");
            } else if (timestamp.seconds) {
              fApertura = dayjs(new Date(timestamp.seconds * 1000)).format("DD/MM/YYYY");
            } else {
              fApertura = dayjs(timestamp).format("DD/MM/YYYY");
            }
          }
          return {
            id: d.id,
            rmaNumber: data.rmaNumber ?? "",
            incidentNumber: data.incidentNumber ?? "",
            details: data.details ?? "",
            createdAt: fApertura, // Usamos la fecha formateada directamente para la tabla
          };
        }) as Rma[];

        setRmas(arr);
        setLoading(false);
      },
      (err) => {
        console.error("Error al cargar RMAs:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [cineId, sessionLoading]);

  // Carga automática del reporte semanal desde Firestore
  useEffect(() => {
    if (!cineId || !weekKey || loadingSalas) return;

    let active = true;
    setLoading(true);

    const loadWeeklyReport = async () => {
      try {
        const docRef = doc(db, CINES_COLLECTION, cineId, "controles_semanales", weekKey);
        const snap = await getDoc(docRef);

        if (!active) return;

        if (snap.exists()) {
          const data = snap.data();

          if (data.fecha) {
            setFecha(data.fecha);
            setFechaText(data.fecha);
          }
          if (data.subgerente) setSubgerente(data.subgerente);
          if (data.responsable) setResponsable(data.responsable);

          // Lámparas
          if (Array.isArray(data.lamparas)) {
            // Combinar con los defaults oficiales por si falta alguna sala o campo
            const dynamicDefaults = getDynamicSalasDefaults(salasCount);
            const merged = dynamicDefaults.map((def) => {
              const saved = data.lamparas.find((l: any) => l.sala === def.sala);
              return saved ? {
                sala: def.sala,
                potencia: saved.potencia !== undefined ? String(saved.potencia) : def.potencia,
                medicion2d: saved.medicion2d !== undefined ? String(saved.medicion2d) : def.medicion2d,
                medicion3d: saved.medicion3d !== undefined ? String(saved.medicion3d) : def.medicion3d,
                calibrado: saved.calibrado !== undefined ? !!saved.calibrado : def.calibrado,
                horasActuales: saved.horasActuales !== undefined ? String(saved.horasActuales) : "0",
                horasRestantes: saved.horasRestantes !== undefined ? String(saved.horasRestantes) : "0",
              } : { ...def };
            });
            setLamparas(merged);
          } else {
            setLamparas(getDynamicSalasDefaults(salasCount));
          }

          // Tablero de Control
          if (data.tableroControl) {
            const tc = data.tableroControl;
            setTempElevada(!!tc.tempElevada);
            setTempBaja(!!tc.tempBaja);
            setTempCorrecta(!!tc.tempCorrecta);
            setControlHumedad(!!tc.controlHumedad);
            setPromedioTemp(tc.promedioTemp !== undefined ? String(tc.promedioTemp) : "24");
            setPromedioHumedadMin(tc.promedioHumedadMin !== undefined ? String(tc.promedioHumedadMin) : "55");
            setPromedioHumedadMax(tc.promedioHumedadMax !== undefined ? String(tc.promedioHumedadMax) : "60");
          } else {
            setTempElevada(false);
            setTempBaja(false);
            setTempCorrecta(true);
            setControlHumedad(false);
            setPromedioTemp("24");
            setPromedioHumedadMin("55");
            setPromedioHumedadMax("60");
          }

          // Mantenimiento Preventivo
          if (data.mantenimientoPreventivo) {
            const mp = data.mantenimientoPreventivo;
            setDiasRealizados(Array.isArray(mp.diasRealizados) ? mp.diasRealizados.map(String) : []);
            setMantenimientoA(!!mp.mantenimientoA);
            setMantenimientoB(!!mp.mantenimientoB);
            setMantenimientoConfirmado(!!mp.confirmado);
            setMantenimientoSINConfirmar(!!mp.sinConfirmar);
          } else {
            setDiasRealizados([]);
            setMantenimientoA(false);
            setMantenimientoB(false);
            setMantenimientoConfirmado(false);
            setMantenimientoSINConfirmar(true);
          }

          // Calidad de Presentación
          if (data.calidadPresentacion) {
            const cp = data.calidadPresentacion;
            setBroadsign(!!cp.broadsign);
            setCalificacion(!!cp.calificacion);
            setContenidoDcp(!!cp.contenidoDcp);
            setImagen(!!cp.imagen);
            setSonido(!!cp.sonido);
            setIluminacion(!!cp.iluminacion);
            setTodasCopias(!!cp.todasCopias);
            setParcialCopias(!!cp.parcialCopias);
            setImagenCorrectaSalas(!!cp.imagenCorrectaSalas);
            setSonidoCorrectoSalas(!!cp.sonidoCorrectoSalas);
          } else {
            setBroadsign(false);
            setCalificacion(false);
            setContenidoDcp(false);
            setImagen(false);
            setSonido(false);
            setIluminacion(false);
            setTodasCopias(false);
            setParcialCopias(false);
            setImagenCorrectaSalas(false);
            setSonidoCorrectoSalas(false);
          }

        } else {
          // Si no existe, resetear todo a los valores default (con horas de lámparas en "0")
          setLamparas(getDynamicSalasDefaults(salasCount));
          setTempElevada(false);
          setTempBaja(false);
          setTempCorrecta(true);
          setControlHumedad(false);
          setPromedioTemp("24");
          setPromedioHumedadMin("55");
          setPromedioHumedadMax("60");
          setDiasRealizados([]);
          setMantenimientoA(false);
          setMantenimientoB(false);
          setMantenimientoConfirmado(false);
          setMantenimientoSINConfirmar(true);
          setBroadsign(false);
          setCalificacion(false);
          setContenidoDcp(false);
          setImagen(false);
          setSonido(false);
          setIluminacion(false);
          setTodasCopias(false);
          setParcialCopias(false);
          setImagenCorrectaSalas(false);
          setSonidoCorrectoSalas(false);
        }
      } catch (err) {
        console.error("Error al cargar el reporte semanal:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadWeeklyReport();

    return () => {
      active = false;
    };
  }, [cineId, weekKey, loadingSalas, salasCount]);

  // Función para guardar el reporte semanal en Firestore
  const handleSave = async () => {
    if (readOnly) return;
    if (!cineId) return;

    if (!responsable.trim()) {
      Alert.alert("Campos obligatorios", "Por favor, ingresa el nombre del Responsable del control.");
      return;
    }

    setSaving(true);
    try {
      // Guardar el responsable localmente para recordar
      await AsyncStorage.setItem("control_semanal_responsable", responsable.trim());

      const docRef = doc(db, CINES_COLLECTION, cineId, "controles_semanales", weekKey);

      const payload = {
        fecha,
        semana: parseInt(semanaStr.replace(/\D/g, ""), 10) || 0,
        responsable: responsable.trim(),
        subgerente: subgerente.trim(),
        complejo,

        // Horas y mediciones de lámparas
        lamparas: lamparas.map((l) => ({
          sala: l.sala,
          potencia: l.potencia,
          medicion2d: l.medicion2d,
          medicion3d: l.medicion3d,
          calibrado: l.calibrado,
          horasActuales: l.horasActuales,
          horasRestantes: l.horasRestantes,
        })),

        // Tablero de Control
        tableroControl: {
          tempElevada,
          tempBaja,
          tempCorrecta,
          controlHumedad,
          promedioTemp,
          promedioHumedadMin,
          promedioHumedadMax,
        },

        // Mantenimiento Preventivo
        mantenimientoPreventivo: {
          diasRealizados,
          mantenimientoA,
          mantenimientoB,
          confirmado: mantenimientoConfirmado,
          sinConfirmar: mantenimientoSINConfirmar,
        },

        // Calidad de Presentación
        calidadPresentacion: {
          broadsign,
          calificacion,
          contenidoDcp,
          imagen,
          sonido,
          iluminacion,
          todasCopias,
          parcialCopias,
          imagenCorrectaSalas,
          sonidoCorrectoSalas,
        },

        updatedAt: serverTimestamp(),
      };

      // Guardar/Sobreescribir en la BD usando setDoc
      await setDoc(docRef, payload);

      Alert.alert("Éxito", `El control semanal para la semana ${semanaStr} se ha guardado correctamente.`);
    } catch (err: any) {
      console.error("Error al guardar en Firestore:", err);
      Alert.alert("Error", `No se pudo guardar el reporte: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Funciones Auxiliares UI ──────────────────────────────────────────────

  const handleUpdateLamp = (salaIndex: number, field: keyof LamparaData, value: any) => {
    setLamparas((prev) =>
      prev.map((lamp, i) => {
        if (i !== salaIndex) return lamp;

        const updated = { ...lamp, [field]: value };

        // Auto-llenado de horas restantes si corresponde
        if (autollenado) {
          if (field === "horasActuales") {
            const act = parseInt(String(value).replace(/\D/g, ""), 10);
            if (!isNaN(act)) {
              const vida = getVidaUtil(lamp.potencia);
              const rest = Math.max(0, vida - act);
              updated.horasRestantes = String(rest);
            } else {
              updated.horasRestantes = "";
            }
          } else if (field === "potencia" && lamp.horasActuales) {
            const act = parseInt(String(lamp.horasActuales).replace(/\D/g, ""), 10);
            if (!isNaN(act)) {
              const vida = getVidaUtil(value); // usar la nueva potencia
              const rest = Math.max(0, vida - act);
              updated.horasRestantes = String(rest);
            }
          }
        }

        return updated;
      })
    );
  };

  const toggleDiaRealizado = (dia: string) => {
    setDiasRealizados((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
    );
  };

  // ─── Generación de PDF / Imprimir HTML de Alta Fidelidad ──────────────────────

  const handlePrint = async () => {
    // T.O.P Center RMAs rows
    const rmasRowsHtml = rmas.length
      ? rmas
        .map(
          (r) => `
          <tr>
            <td>${r.createdAt ?? ""}</td>
            <td>${r.incidentNumber ?? ""}</td>
            <td>${r.rmaNumber ?? ""}</td>
            <td>${r.details ?? ""}</td>
          </tr>`
        )
        .join("")
      : `<tr><td colspan="4" style="text-align: center; color: #888;">No hay RMAs activos</td></tr>`;

    // Horas de lámparas rows
    const lamparasRowsHtml = lamparas
      .map(
        (l) => `
        <tr>
          <td style="text-align: center; font-weight: bold;">${l.sala}</td>
          <td>${l.potencia}</td>
          <td style="text-align: center;">${l.medicion2d || "-"}</td>
          <td style="text-align: center;">${l.medicion3d || "-"}</td>
          <td style="text-align: center;">${l.calibrado ? "☒" : "☐"}</td>
          <td style="text-align: right; padding-right: 10px;">${l.horasActuales || "-"}</td>
          <td style="text-align: right; padding-right: 10px;">${l.horasRestantes || "-"}</td>
        </tr>`
      )
      .join("");

    // Formatear Fecha Actualización para el impreso
    const fechaFormatted = dayjs(fecha).format("D [de] MMMM [de] YYYY");

    // Construcción del HTML Oficial de Cinemark con 3 Páginas Perfectamente Breakables
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Control Semanal - ${complejo}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      color: #000;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    /* Pie de Página Corporativo */
    .corporate-footer {
      position: absolute;
      bottom: 15mm;
      left: 20mm;
      right: 20mm;
      border-top: 1.5pt solid #1F497D;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .corporate-info {
      font-size: 8.5pt;
      color: #595959;
      line-height: 1.2;
    }
    .corporate-logo-placeholder {
      font-size: 14pt;
      font-weight: 800;
      color: #1F497D;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-style: italic;
    }

    /* Títulos y Secciones */
    h1 {
      color: #1F497D;
      font-size: 20pt;
      font-weight: bold;
      margin-top: 0;
      margin-bottom: 15px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    h2 {
      background-color: #1F497D;
      color: #FFF;
      font-size: 12pt;
      font-weight: bold;
      padding: 6px 10px;
      margin-top: 25px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    /* Tabla de Detalles del Reporte */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .info-table td {
      padding: 6px 4px;
      vertical-align: middle;
      border: none;
    }
    .info-table td.label {
      font-weight: bold;
      color: #1F497D;
      width: 25%;
    }
    .info-table td.val {
      border-bottom: 1px solid #D9D9D9;
      color: #000;
    }

    /* Estilos Generales de Tablas */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      margin-bottom: 15px;
    }
    table.data-table th {
      background-color: #1F497D;
      color: #FFF;
      font-weight: bold;
      font-size: 10pt;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #1F497D;
      text-transform: uppercase;
    }
    table.data-table td {
      padding: 6px 8px;
      border: 1px solid #BFBFBF;
      font-size: 9.5pt;
    }
    table.data-table tr:nth-child(even) {
      background-color: #F2F5F8;
    }

    /* Estilos Checkbox del Imprimible */
    .chk {
      font-family: sans-serif;
      font-size: 11pt;
      margin-right: 5px;
      color: #1F497D;
      font-weight: bold;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    /* Control de Páginas Fiel */
    .page {
      page-break-after: always;
      position: relative;
      box-sizing: border-box;
      padding: 15mm 20mm 15mm 20mm;
      height: 297mm;
      overflow: hidden;
    }
    .page:last-child {
      page-break-after: avoid;
    }

    /* Tablero de Control / Mantenimiento Layout */
    .section-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .card-block {
      border: 1px solid #D9D9D9;
      padding: 15px;
      border-radius: 4px;
      background-color: #FAFAFA;
      margin-bottom: 15px;
    }
    .card-block-title {
      font-weight: bold;
      color: #1F497D;
      margin-bottom: 10px;
      border-bottom: 1.5px solid #1F497D;
      padding-bottom: 4px;
      font-size: 11pt;
      text-transform: uppercase;
    }

    /* Firmas al Final */
    .signatures-block {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      padding: 0 10px;
    }
    .signature-line {
      width: 40%;
      border-top: 1px solid #000;
      text-align: center;
      padding-top: 8px;
      font-size: 9.5pt;
      margin-top: 50px;
    }
  </style>
</head>
<body>

  <!-- ================= PAGE 1 ================= -->
  <div class="page">
    <h1>Control Semanal</h1>

    <table class="info-table">
      <tr>
        <td class="label">Complejo:</td>
        <td class="val" colspan="3" style="font-weight: bold; font-size: 12pt;">${complejo}</td>
      </tr>
      <tr>
        <td class="label">Fecha actualización:</td>
        <td class="val">${fechaFormatted}</td>
        <td class="label" style="text-align: right; padding-right: 15px;">Semana:</td>
        <td class="val">${semanaStr.replace("Semana ", "")}</td>
      </tr>
      <tr>
        <td class="label">Subgerente del Área:</td>
        <td class="val">${subgerente}</td>
        <td class="label" style="text-align: right; padding-right: 15px;">Responsable:</td>
        <td class="val">${responsable}</td>
      </tr>
    </table>

    <h2>Sección T.O.P Center</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 15%;">Fecha Apertura</th>
          <th style="width: 20%;"># Incidente</th>
          <th style="width: 20%;"># RMA</th>
          <th>Comentario</th>
        </tr>
      </thead>
      <tbody>
        ${rmasRowsHtml}
      </tbody>
    </table>

    <h2>Horas de Lámparas</h2>
    <table class="data-table" style="font-size: 9pt;">
      <thead>
        <tr>
          <th style="text-align: center; width: 6%;">Sala</th>
          <th style="width: 22%;">Potencia</th>
          <th style="text-align: center; width: 12%;">Medición 2D</th>
          <th style="text-align: center; width: 12%;">Medición 3D</th>
          <th style="text-align: center; width: 10%;">Calibrado</th>
          <th style="text-align: right; width: 19%; padding-right: 10px;">Horas Actuales</th>
          <th style="text-align: right; width: 19%; padding-right: 10px;">Horas Restantes</th>
        </tr>
      </thead>
      <tbody>
        ${lamparasRowsHtml}
      </tbody>
    </table>

    <div class="corporate-footer">
      <div class="corporate-info">
        Beruti 3399 5to Piso, Capital Federal<br/>
        Oficina Corporativa Cinemark Argentina<br/>
      </div>
      <div class="corporate-logo-placeholder">CINEMARK</div>
    </div>
  </div>

  <!-- ================= PAGE 2 ================= -->
  <div class="page">
    <h1>Control Semanal</h1>

    <h2>Tablero de Control</h2>
    <div class="section-grid">
      <div class="card-block">
        <div class="card-block-title">Control de Temperatura</div>
        <div class="checkbox-row"><span class="chk">${tempElevada ? "☒" : "☐"}</span> Temperatura Elevada</div>
        <div class="checkbox-row"><span class="chk">${tempBaja ? "☒" : "☐"}</span> Temperatura Baja</div>
        <div class="checkbox-row"><span class="chk">${tempCorrecta ? "☒" : "☐"}</span> Temperatura Correcta</div>
      </div>
      
      <div class="card-block">
        <div class="card-block-title">Promedios e Indicadores</div>
        <div class="checkbox-row"><span class="chk">${controlHumedad ? "☒" : "☐"}</span> Control de Humedad</div>
        <p style="margin: 8px 0 0 0; font-size: 10pt; color: #333;">
          <strong>Promedio Temperatura:</strong> ${promedioTemp} °C <br/>
          <strong>Promedio Humedad:</strong> ${promedioHumedadMin} a ${promedioHumedadMax} %
        </p>
        <p style="font-size: 8.5pt; color: #555; font-style: italic; margin-top: 8px;">
          * Rango ideal: Temperatura entre 23ºC a 26ºC.
        </p>
      </div>
    </div>

    <h2>Mantenimiento Preventivo</h2>
    <div class="card-block">
      <div class="card-block-title">Días Realizados</div>
      <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 15px;">
        ${DIAS_SEMANA.map(
      (d) => `
          <div class="checkbox-row">
            <span class="chk">${diasRealizados.includes(d) ? "☒" : "☐"}</span> ${d}
          </div>`
    ).join("")}
      </div>

      <div class="section-grid" style="margin-top: 10px;">
        <div>
          <div class="checkbox-row"><span class="chk">${mantenimientoA ? "☒" : "☐"}</span> Mantenimiento Tipo A</div>
          <div class="checkbox-row"><span class="chk">${mantenimientoB ? "☒" : "☐"}</span> Mantenimiento Tipo B</div>
        </div>
        <div>
          <div class="checkbox-row"><span class="chk">${mantenimientoConfirmado ? "☒" : "☐"}</span> Mantenimiento Confirmado</div>
          <div class="checkbox-row"><span class="chk">${mantenimientoSINConfirmar ? "☒" : "☐"}</span> Mantenimiento SIN Confirmar</div>
        </div>
      </div>
    </div>

    <h2>Calidad de Presentación</h2>
    <div class="card-block">
      <div class="section-grid">
        <div>
          <div class="checkbox-row"><span class="chk">${broadsign ? "☒" : "☐"}</span> Control Broadsign</div>
          <div class="checkbox-row"><span class="chk">${calificacion ? "☒" : "☐"}</span> Control de Calificación</div>
          <div class="checkbox-row"><span class="chk">${contenidoDcp ? "☒" : "☐"}</span> Control de Contenido DCP</div>
          <div class="checkbox-row"><span class="chk">${imagen ? "☒" : "☐"}</span> Control de Imagen</div>
        </div>
        <div>
          <div class="checkbox-row"><span class="chk">${sonido ? "☒" : "☐"}</span> Control de Sonido</div>
          <div class="checkbox-row"><span class="chk">${iluminacion ? "☒" : "☐"}</span> Control de Iluminación</div>
          <div class="checkbox-row"><span class="chk">${todasCopias ? "☒" : "☐"}</span> Control de Todas las Copias</div>
          <div class="checkbox-row"><span class="chk">${parcialCopias ? "☒" : "☐"}</span> Control Parcial de Copias</div>
        </div>
      </div>
    </div>

    <div class="corporate-footer">
      <div class="corporate-info">
        Beruti 3399 5to Piso, Capital Federal<br/>
        Oficina Corporativa Cinemark Argentina<br/>
      </div>
      <div class="corporate-logo-placeholder">CINEMARK</div>
    </div>
  </div>

  <!-- ================= PAGE 3 ================= -->
  <div class="page">
    <h1>Control Semanal</h1>

    <h2>Resultados de Presentación</h2>
    <div class="card-block" style="padding: 20px;">
      <div class="checkbox-row" style="margin-bottom: 20px; font-size: 12pt;">
        <span class="chk" style="font-size: 14pt;">${imagenCorrectaSalas ? "☒" : "☐"}</span> Imagen correcta en todas las salas
      </div>
      <div class="checkbox-row" style="font-size: 12pt;">
        <span class="chk" style="font-size: 14pt;">${sonidoCorrectoSalas ? "☒" : "☐"}</span> Sonido correcto en todas las salas
      </div>
    </div>

    <div class="signatures-block">
      <div class="signature-line">
        Firma Responsable<br/>
        <strong>${responsable}</strong>
      </div>
      <div class="signature-line">
        Firma Subgerente Proyección<br/>
        <strong>${subgerente}</strong>
      </div>
    </div>

    <div class="corporate-footer">
      <div class="corporate-info">
        Beruti 3399 5to Piso, Capital Federal<br/>
        Oficina Corporativa Cinemark Argentina<br/>
      </div>
      <div class="corporate-logo-placeholder">CINEMARK</div>
    </div>
  </div>

</body>
</html>
`;

    try {
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          Alert.alert("Imprimir", "Por favor habilita las ventanas emergentes (popups) para poder imprimir.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        // Esperar a que cargue
        const printProcess = () => {
          printWindow.focus();
          printWindow.print();
        };

        if (printWindow.document.readyState === "complete") {
          printProcess();
        } else {
          printWindow.onload = printProcess;
        }
      } else {
        // En dispositivo móvil, usamos expo-print
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Imprimir", `No se pudo generar el archivo de impresión: ${e.message}`);
    }
  };

  // ─── Render Components ──────────────────────────────────────────────────────

  const rmasTableContent = (
    <>
      <View style={s.tableHeaderRow}>
        <Text style={[s.th, { flex: 1.2 }]}>Fecha</Text>
        <Text style={[s.th, { flex: 1.8 }]}># Incidente</Text>
        <Text style={[s.th, { flex: 1.8 }]}># RMA</Text>
        <Text style={[s.th, { flex: 3 }]}>Comentario</Text>
      </View>
      {rmas.map((r, i) => (
        <View key={r.id || i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
          <Text style={[s.td, { flex: 1.2 }]} numberOfLines={1}>{r.createdAt}</Text>
          <Text style={[s.td, { flex: 1.8, fontWeight: "bold" }]} numberOfLines={1}>{r.incidentNumber || "-"}</Text>
          <Text style={[s.td, { flex: 1.8, color: "#1F497D", fontWeight: "700" }]} numberOfLines={1}>{r.rmaNumber}</Text>
          <Text style={[s.td, { flex: 3 }]} numberOfLines={2}>{r.details || "-"}</Text>
        </View>
      ))}
    </>
  );

  const lamparasTableContent = (
    <>
      {/* Cabecera de Tabla Lámparas */}
      <View style={s.tableHeaderRow}>
        <Text style={[s.th, { flex: 0.7, textAlign: "center" }]}>Sala</Text>
        <Text style={[s.th, { flex: 2.2 }]}>Potencia</Text>
        <Text style={[s.th, { flex: 1, textAlign: "center" }]}>FL 2D</Text>
        <Text style={[s.th, { flex: 1, textAlign: "center" }]}>FL 3D</Text>
        <Text style={[s.th, { flex: 0.9, textAlign: "center" }]}>Cal.</Text>
        <Text style={[s.th, { flex: 1.8, textAlign: "right" }]}>Horas Act.</Text>
        <Text style={[s.th, { flex: 1.8, textAlign: "right" }]}>Horas Rest.</Text>
      </View>

      {/* Filas de Salas */}
      {lamparas.map((l, idx) => (
        <View key={l.sala} style={[s.tableRowLamp, idx % 2 === 1 && s.tableRowAlt]}>

          {/* Sala */}
          <Text style={[s.td, { flex: 0.7, textAlign: "center", fontWeight: "bold" }]}>{l.sala}</Text>

          {/* Potencia Dropdown */}
          <View style={{ flex: 2.2 }}>
            <TextInput
              value={l.potencia}
              onChangeText={(val) => handleUpdateLamp(idx, "potencia", val)}
              style={s.cellInputText}
              placeholder="Ej: 3000W"
            />
          </View>

          {/* FL 2D */}
          <TextInput
            value={l.medicion2d}
            onChangeText={(val) => handleUpdateLamp(idx, "medicion2d", val)}
            style={[s.cellInputNumeric, { flex: 1, textAlign: "center" }]}
            placeholder="2D"
            keyboardType="decimal-pad"
          />

          {/* FL 3D */}
          <TextInput
            value={l.medicion3d}
            onChangeText={(val) => handleUpdateLamp(idx, "medicion3d", val)}
            style={[s.cellInputNumeric, { flex: 1, textAlign: "center" }]}
            placeholder="3D"
            keyboardType="decimal-pad"
          />

          {/* Calibrado Checkbox */}
          <TouchableOpacity
            style={[s.checkboxCell, { flex: 0.9 }]}
            onPress={() => handleUpdateLamp(idx, "calibrado", !l.calibrado)}
          >
            <MaterialCommunityIcons
              name={l.calibrado ? "checkbox-marked" : "checkbox-blank-outline"}
              size={20}
              color="#1F497D"
            />
          </TouchableOpacity>

          {/* Horas Actuales Input */}
          <TextInput
            ref={(r) => { actualRefs.current[idx] = r; }}
            value={l.horasActuales}
            onChangeText={(val) => handleUpdateLamp(idx, "horasActuales", val)}
            onKeyPress={(e) => handleKeyPress(e, idx, "horasActuales")}
            style={[s.cellInputNumericPrimary, { flex: 1.8, textAlign: "right" }]}
            placeholder="Actuales"
            keyboardType="numeric"
          />

          {/* Horas Restantes Input */}
          <TextInput
            ref={(r) => { restanteRefs.current[idx] = r; }}
            value={l.horasRestantes}
            onChangeText={(val) => handleUpdateLamp(idx, "horasRestantes", val)}
            onKeyPress={(e) => handleKeyPress(e, idx, "horasRestantes")}
            style={[s.cellInputNumericPrimary, { flex: 1.8, textAlign: "right" }]}
            placeholder="Restantes"
            keyboardType="numeric"
          />
        </View>
      ))}
    </>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (sessionLoading || loading || loadingSalas) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Cargando control semanal…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View pointerEvents={readOnly ? "none" : "auto"}>
          {/* Cabecera / Info de la Oficina Corporativa */}
          <View style={s.corpCard}>
          <View style={s.corpHeader}>
            <Text style={s.corpTitle}>CINEMARK ARGENTINA</Text>
            <Text style={s.corpLabel}>Oficina Corporativa</Text>
          </View>
          <Text style={s.corpText}>Beruti 3399 5to Piso, Capital Federal</Text>
          <Text style={s.corpText}>svidegaray@cinemark.com.ar</Text>
        </View>

        {/* Sección de Datos Principales */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#1F497D" />
            <Text style={s.sectionTitle}>Datos del Control Semanal</Text>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Complejo</Text>
            <TextInput
              value={complejo}
              onChangeText={setComplejo}
              style={s.inputDisabled}
              editable={false}
            />
          </View>

          <View style={[s.row, isMobile && { flexDirection: "column", alignItems: "stretch", marginBottom: 4 }]}>
            <View style={[s.inputGroup, { flex: 2 }]}>
              <Text style={s.inputLabel}>Fecha de actualización (YYYY-MM-DD)</Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  value={fechaText}
                  onChangeText={(val) => {
                    setFechaText(val);
                    // Solo actualizar 'fecha' si es una fecha válida en formato YYYY-MM-DD (10 caracteres)
                    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                      const d = dayjs(val);
                      if (d.isValid()) {
                        setFecha(val);
                      }
                    }
                  }}
                  onBlur={() => {
                    // Si al salir del input la fecha es válida, la formateamos e intentamos actualizar.
                    // De lo contrario, revertimos al último valor de 'fecha' guardado/válido.
                    const d = dayjs(fechaText);
                    if (d.isValid()) {
                      const formatted = d.format("YYYY-MM-DD");
                      setFechaText(formatted);
                      if (formatted !== fecha) {
                        setFecha(formatted);
                      }
                    } else {
                      setFechaText(fecha);
                    }
                  }}
                  placeholder="2026-05-15"
                  style={[s.input, { flex: 1, height: 38 }]}
                  placeholderTextColor={COLORS.muted}
                />
                <TouchableOpacity
                  onPress={() => {
                    const d = dayjs(fecha);
                    if (d.isValid()) {
                      const newDate = d.add(7, "day").format("YYYY-MM-DD");
                      setFecha(newDate);
                      setFechaText(newDate);
                    }
                  }}
                  style={{
                    backgroundColor: "#1F497D",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    height: 38,
                    justifyContent: "center",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: 6,
                  }}
                >
                  <MaterialCommunityIcons name="calendar-plus" size={16} color="#FFF" />
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>Sumar 7 días</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[s.inputGroup, { flex: 1 }, isMobile ? { marginTop: 12, marginBottom: 4 } : { marginLeft: 10 }]}>
              <Text style={s.inputLabel}>Semana</Text>
              <View style={s.computedBox}>
                <Text style={s.computedText}>{semanaStr}</Text>
              </View>
            </View>
          </View>

          <View style={[s.row, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.inputLabel}>Subgerente responsable</Text>
              <TextInput
                value={subgerente}
                onChangeText={setSubgerente}
                placeholder="VICTOR DIAZ"
                style={s.input}
                placeholderTextColor={COLORS.muted}
              />
            </View>
            <View style={[s.inputGroup, { flex: 1 }, isMobile ? { marginTop: 12 } : { marginLeft: 10 }]}>
              <Text style={s.inputLabel}>Responsable del control *</Text>
              <TextInput
                onChangeText={setResponsable}
                placeholder="Ingrese su nombre"
                style={s.input}
                placeholderTextColor={COLORS.muted}
              />
            </View>
          </View>
        </View>

        {/* Sección T.O.P Center (RMAs Firestore) */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <MaterialCommunityIcons name="alert-decagram-outline" size={20} color="#1F497D" />
            <Text style={s.sectionTitle}>Sección T.O.P Center (RMAs)</Text>
          </View>
          <Text style={s.sectionSubtitle}>Cargados automáticamente desde tus reportes de RMA</Text>

          {rmas.length === 0 ? (
            <View style={s.emptyTableBox}>
              <Text style={s.emptyTableText}>No hay RMAs cargados actualmente</Text>
            </View>
          ) : isMobile ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={[s.tableContainer, { minWidth: 550 }]}>
                {rmasTableContent}
              </View>
            </ScrollView>
          ) : (
            <View style={[s.tableContainer, { width: "100%" }]}>
              {rmasTableContent}
            </View>
          )}
        </View>

        {/* Sección Horas de Lámparas */}
        <View style={s.card}>
          <View style={[s.sectionHeader, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color="#1F497D" />
              <Text style={s.sectionTitle}>Control de Lámparas (Proyección)</Text>
            </View>
            <TouchableOpacity onPress={() => setShowConfigModal(true)} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="cog" size={20} color="#1F497D" />
            </TouchableOpacity>
          </View>
          <Text style={s.sectionSubtitle}>Ingresa las Horas Actuales y Restantes de cada sala</Text>

          {isMobile ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={[s.tableContainer, { minWidth: 720 }]}>
                {lamparasTableContent}
              </View>
            </ScrollView>
          ) : (
            <View style={[s.tableContainer, { width: "100%" }]}>
              {lamparasTableContent}
            </View>
          )}
        </View>

        {/* Sección Tablero de Control */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <MaterialCommunityIcons name="gauge" size={20} color="#1F497D" />
            <Text style={s.sectionTitle}>Tablero de Control</Text>
          </View>

          <View style={[s.row, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={s.subSectionTitle}>Control de Temperatura</Text>

              <TouchableOpacity style={s.checkboxRow} onPress={() => { setTempElevada(true); setTempBaja(false); setTempCorrecta(false); }}>
                <MaterialCommunityIcons name={tempElevada ? "radiobox-marked" : "radiobox-blank"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Temperatura Elevada</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => { setTempElevada(false); setTempBaja(true); setTempCorrecta(false); }}>
                <MaterialCommunityIcons name={tempBaja ? "radiobox-marked" : "radiobox-blank"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Temperatura Baja</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => { setTempElevada(false); setTempBaja(false); setTempCorrecta(true); }}>
                <MaterialCommunityIcons name={tempCorrecta ? "radiobox-marked" : "radiobox-blank"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Temperatura Correcta</Text>
              </TouchableOpacity>
            </View>

            <View style={[{ flex: 1, gap: 10 }, isMobile && { marginTop: 16 }]}>
              <Text style={s.subSectionTitle}>Parámetros de Cabina</Text>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setControlHumedad(!controlHumedad)}>
                <MaterialCommunityIcons name={controlHumedad ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Humedad</Text>
              </TouchableOpacity>

              <View style={[s.row, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
                <View style={[s.inputGroup, { flex: 1 }]}>
                  <Text style={s.inputLabel}>Promedio Temp (°C)</Text>
                  <TextInput
                    value={promedioTemp}
                    onChangeText={setPromedioTemp}
                    keyboardType="numeric"
                    style={s.inputCompact}
                  />
                </View>
                <View style={[s.inputGroup, { flex: 1 }, isMobile ? { marginTop: 10 } : { marginLeft: 8 }]}>
                  <Text style={s.inputLabel}>Humedad % (Min-Max)</Text>
                  <View style={[s.row, { flexShrink: 1 }]}>
                    <TextInput
                      value={promedioHumedadMin}
                      onChangeText={setPromedioHumedadMin}
                      keyboardType="numeric"
                      style={[s.inputCompact, { flex: 1, minWidth: 0 }]}
                      placeholder="55"
                    />
                    <Text style={{ alignSelf: "center", marginHorizontal: 4 }}>a</Text>
                    <TextInput
                      value={promedioHumedadMax}
                      onChangeText={setPromedioHumedadMax}
                      keyboardType="numeric"
                      style={[s.inputCompact, { flex: 1, minWidth: 0 }]}
                      placeholder="60"
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Sección Mantenimiento Preventivo */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <MaterialCommunityIcons name="tools" size={20} color="#1F497D" />
            <Text style={s.sectionTitle}>Mantenimiento Preventivo</Text>
          </View>

          <Text style={s.subSectionTitle}>Días en que se realizaron tareas específicas:</Text>
          <View style={s.chipContainer}>
            {DIAS_SEMANA.map((dia) => {
              const selected = diasRealizados.includes(dia);
              return (
                <TouchableOpacity
                  key={dia}
                  onPress={() => toggleDiaRealizado(dia)}
                  style={[s.chip, selected && s.chipSelected]}
                >
                  <Text style={[s.chipText, selected && s.chipTextSelected]}>{dia}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[s.row, { marginTop: 10 }, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={s.subSectionTitle}>Tipo de Tarea</Text>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setMantenimientoA(!mantenimientoA)}>
                <MaterialCommunityIcons name={mantenimientoA ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Mantenimiento A</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setMantenimientoB(!mantenimientoB)}>
                <MaterialCommunityIcons name={mantenimientoB ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Mantenimiento B</Text>
              </TouchableOpacity>
            </View>

            <View style={[{ flex: 1, gap: 10 }, isMobile && { marginTop: 16 }]}>
              <Text style={s.subSectionTitle}>Estado de Confirmación</Text>

              <TouchableOpacity style={s.checkboxRow} onPress={() => { setMantenimientoConfirmado(true); setMantenimientoSINConfirmar(false); }}>
                <MaterialCommunityIcons name={mantenimientoConfirmado ? "radiobox-marked" : "radiobox-blank"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Mantenimiento Confirmado</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => { setMantenimientoConfirmado(false); setMantenimientoSINConfirmar(true); }}>
                <MaterialCommunityIcons name={mantenimientoSINConfirmar ? "radiobox-marked" : "radiobox-blank"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Mantenimiento SIN Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sección Calidad de Presentación */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <MaterialCommunityIcons name="projector" size={20} color="#1F497D" />
            <Text style={s.sectionTitle}>Calidad de Presentación</Text>
          </View>

          <View style={[s.row, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
            <View style={{ flex: 1, gap: 10 }}>
              <TouchableOpacity style={s.checkboxRow} onPress={() => setBroadsign(!broadsign)}>
                <MaterialCommunityIcons name={broadsign ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control Broadsign</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setCalificacion(!calificacion)}>
                <MaterialCommunityIcons name={calificacion ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Calificación</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setContenidoDcp(!contenidoDcp)}>
                <MaterialCommunityIcons name={contenidoDcp ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Contenido DCP</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setImagen(!imagen)}>
                <MaterialCommunityIcons name={imagen ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Imagen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setSonido(!sonido)}>
                <MaterialCommunityIcons name={sonido ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Sonido</Text>
              </TouchableOpacity>
            </View>

            <View style={[{ flex: 1, gap: 10 }, isMobile && { marginTop: 10 }]}>
              <TouchableOpacity style={s.checkboxRow} onPress={() => setIluminacion(!iluminacion)}>
                <MaterialCommunityIcons name={iluminacion ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Iluminación</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setTodasCopias(!todasCopias)}>
                <MaterialCommunityIcons name={todasCopias ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control de Todas las Copias</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setParcialCopias(!parcialCopias)}>
                <MaterialCommunityIcons name={parcialCopias ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Control Parcial de Copias</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setImagenCorrectaSalas(!imagenCorrectaSalas)}>
                <MaterialCommunityIcons name={imagenCorrectaSalas ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Imagen Correcta en todas las salas</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setSonidoCorrectoSalas(!sonidoCorrectoSalas)}>
                <MaterialCommunityIcons name={sonidoCorrectoSalas ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Sonido Correcto en todas las salas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </View>

        {/* Botones de Acción */}
        <View style={[s.actionRow, isMobile && { flexDirection: "column", gap: 10 }]}>
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
            <Text style={s.actionBtnText}>Imprimir / PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal Configuración Horas Lámparas ── */}
      <Modal visible={showConfigModal} transparent animationType="fade" onRequestClose={() => setShowConfigModal(false)}>
        <View style={s.backdrop}>
          <View style={[s.modalCard, { maxHeight: "90%" }]}>
            <Text style={s.modalTitle}>Configuración de Lámparas</Text>
            <Text style={s.modalSubtitle}>Establecer vida útil de lámparas para autollenado</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 6 }} contentContainerStyle={{ gap: 12 }}>
              {/* Checkbox de Autollenado */}
              <TouchableOpacity style={[s.checkboxRow, { marginBottom: 5, marginTop: 5 }]} onPress={() => setAutollenado(!autollenado)}>
                <MaterialCommunityIcons name={autollenado ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color="#1F497D" />
                <Text style={s.checkboxRowText}>Aplicar autollenado automático</Text>
              </TouchableOpacity>

              <Text style={s.label}>Vida útil para 4500W (en horas)</Text>
              <TextInput
                value={vidaUtil4500}
                onChangeText={setVidaUtil4500}
                placeholder="1000"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="numeric"
              />

              <Text style={s.label}>Vida útil para 4000W (en horas)</Text>
              <TextInput
                value={vidaUtil4000}
                onChangeText={setVidaUtil4000}
                placeholder="1000"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="numeric"
              />

              <Text style={s.label}>Vida útil para 3000W (en horas)</Text>
              <TextInput
                value={vidaUtil3000}
                onChangeText={setVidaUtil3000}
                placeholder="3000"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="numeric"
              />

              <Text style={s.label}>Vida útil para 2200W (en horas)</Text>
              <TextInput
                value={vidaUtil2200}
                onChangeText={setVidaUtil2200}
                placeholder="2500"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="numeric"
              />

              <Text style={s.label}>Vida útil para 2000W (en horas)</Text>
              <TextInput
                value={vidaUtil2000}
                onChangeText={setVidaUtil2000}
                placeholder="2500"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="numeric"
              />

              <Text style={s.label}>Vida útil para 1200W (en horas)</Text>
              <TextInput
                value={vidaUtil1200}
                onChangeText={setVidaUtil1200}
                placeholder="3000"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="numeric"
              />
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setShowConfigModal(false)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={guardarConfiguracion} disabled={savingConfig}>
                {savingConfig ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Guardar</Text>}
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
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },

  row: { flexDirection: "row", alignItems: "center" },

  // Corp Card
  corpCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
    gap: 4,
  },
  corpHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 6, marginBottom: 4 },
  corpTitle: { fontSize: 13, fontWeight: "900", color: "#1F497D" },
  corpLabel: { fontSize: 10, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase" },
  corpText: { fontSize: 11, color: COLORS.textSoft, fontWeight: "500" },

  // Base Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...THEME.shadow.soft,
  },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1.5, borderBottomColor: "#1F497D", paddingBottom: 6, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#1F497D" },
  sectionSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: -4, fontWeight: "500" },
  subSectionTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text, marginTop: 4 },

  // Inputs
  inputGroup: { gap: 4 },
  inputLabel: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: COLORS.text,
    fontWeight: "600",
  },
  inputDisabled: {
    backgroundColor: COLORS.border,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: COLORS.muted,
    fontWeight: "700",
  },
  computedBox: {
    backgroundColor: "#F0F5FA",
    borderWidth: 1,
    borderColor: "#B8D4F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  computedText: { fontSize: 13.5, fontWeight: "800", color: "#1F497D" },
  inputCompact: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: "600",
  },

  // Checkboxes
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkboxRowText: { fontSize: 13, color: COLORS.text, fontWeight: "600" },

  // Chips para Mantenimiento
  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  chip: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: "#E6F0FA",
    borderColor: "#1F497D",
  },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSoft },
  chipTextSelected: { color: "#1F497D" },

  // Tablas
  tableContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 6,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#1F497D",
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  th: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 11,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  tableRowLamp: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  tableRowAlt: {
    backgroundColor: COLORS.bg,
  },
  td: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "500",
  },
  emptyTableBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTableText: { fontSize: 13, color: COLORS.muted, fontWeight: "600" },

  // Inputs en Celdas de Tabla
  cellInputText: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontSize: 11.5,
    color: COLORS.text,
    fontWeight: "600",
    marginHorizontal: 2,
  },
  cellInputNumeric: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontSize: 11.5,
    color: COLORS.text,
    fontWeight: "600",
    marginHorizontal: 2,
  },
  cellInputNumericPrimary: {
    backgroundColor: "#FAFEFA",
    borderWidth: 1,
    borderColor: "#CBE8CB",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    color: "#1E3A1E",
    fontWeight: "700",
    marginHorizontal: 2,
  },
  checkboxCell: {
    alignItems: "center",
    justifyContent: "center",
  },

  // Botones de acción
  actionRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#10B981", // verde esmeralda premium
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...THEME.shadow.soft,
  },
  printBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#1F497D", // azul corporativo
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...THEME.shadow.soft,
  },
  actionBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },

  // Modal de Configuración
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    ...THEME.shadow.soft,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: -4,
    fontWeight: "500",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnPrimaryText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 13,
  },
});

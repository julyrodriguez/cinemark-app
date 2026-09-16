import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import dayjs from "dayjs";

import { doc, getDoc, onSnapshot, setDoc } from "@/lib/dbService";
import { CINES_COLLECTION, db } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { useAppLayout } from "../../lib/useAppLayout";
import {
  calculateBreakDuration,
  calculateWorkHours,
  CINEMA_WEEKDAYS,
  getCinemaThursdayForDate,
  normalizeExcelTime,
  parsePoziExcel,
  parsePoziWeeklyExcel,
  POZI_CATEGORIAS,
  PoziCategoriaCodigo,
  PoziEmployee,
} from "../../lib/pozi/poziParser";

export default function CoordinadoresPoziScreen() {
  const { cineId, displayName, user } = useAuthUser();
  const { isMobile, isDesktop, isTablet, width } = useAppLayout();

  // Fecha seleccionada (YYYY-MM-DD)
  const [fecha, setFecha] = useState<string>(() => dayjs().format("YYYY-MM-DD"));

  // Jueves base de la semana cinematográfica actual
  const baseThursdayStr = useMemo(() => getCinemaThursdayForDate(fecha), [fecha]);
  const baseThursdayObj = useMemo(() => dayjs(baseThursdayStr), [baseThursdayStr]);

  // Lista de los 7 días de la semana de cine (Jueves a Miércoles)
  const cinemaWeekDays = useMemo(() => {
    return CINEMA_WEEKDAYS.map((dayDef) => {
      const d = baseThursdayObj.add(dayDef.dayOffset, "day");
      const dStr = d.format("YYYY-MM-DD");
      return {
        ...dayDef,
        dateStr: dStr,
        dateFormatted: d.format("DD/MM"),
        isSelected: dStr === fecha,
        isToday: dStr === dayjs().format("YYYY-MM-DD"),
      };
    });
  }, [baseThursdayObj, fecha]);

  // Lista de empleados del día
  const [empleados, setEmpleados] = useState<PoziEmployee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastExcelName, setLastExcelName] = useState<string | null>(null);

  // Tick para refrescar cuentas regresivas y hora actual cada 10 segundos
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const horaActualStr = useMemo(() => dayjs(nowTick).format("HH:mm"), [nowTick]);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<"TODAS" | PoziCategoriaCodigo>("TODAS");
  const [filtroEstado, setFiltroEstado] = useState<"TODOS" | "PROGRAMADOS" | "PENDIENTE" | "EN_BREAK" | "CUMPLIDO">("TODOS");
  const [soloProximosIngresos, setSoloProximosIngresos] = useState<boolean>(false);

  // Modal Programar Break
  const [programarEmp, setProgramarEmp] = useState<PoziEmployee | null>(null);
  const [progHora, setProgHora] = useState<string>("");
  const [progError, setProgError] = useState<string>("");

  // Modal agregar empleado manual
  const [showAddModal, setShowAddModal] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCat, setNuevaCat] = useState<PoziCategoriaCodigo>("OV");
  const [nuevoEntra, setNuevoEntra] = useState("14:00");
  const [nuevoSale, setNuevoSale] = useState("22:00");
  const [nuevoError, setNuevoError] = useState("");

  // Modal modificar ingreso de empleado existente
  const [editingEmp, setEditingEmp] = useState<PoziEmployee | null>(null);
  const [editEntra, setEditEntra] = useState("");
  const [editSale, setEditSale] = useState("");
  const [editCat, setEditCat] = useState<PoziCategoriaCodigo>("OV");
  const [editError, setEditError] = useState("");

  // ── Sincronización en tiempo real con Firestore ─────────────────────────
  useEffect(() => {
    if (!cineId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const poziDocRef = doc(db, CINES_COLLECTION, cineId, "pozi", fecha);

    const unsubscribe = onSnapshot(
      poziDocRef,
      (snapshot: any) => {
        setLoading(false);
        if (snapshot && typeof snapshot.data === "function" && snapshot.exists?.()) {
          const data = snapshot.data();
          if (Array.isArray(data.empleados)) {
            const listaMapeada = data.empleados.map((emp: any) => ({
              ...emp,
              duracionBreak: emp.duracionBreak === 40 ? 45 : emp.duracionBreak,
            }));
            setEmpleados(listaMapeada);
          } else {
            setEmpleados([]);
          }
          if (data.updatedAt) {
            setLastUpdated(dayjs(data.updatedAt).format("DD/MM HH:mm"));
          }
          if (data.excelFileName) {
            setLastExcelName(data.excelFileName);
          }
        } else {
          setEmpleados([]);
          setLastExcelName(null);
          setLastUpdated(null);
        }
      },
      (err: any) => {
        console.error("Error en suscripción POZI:", err);
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [cineId, fecha]);

  // Guardar lista en Firestore
  const persistirEmpleados = useCallback(
    async (nuevaLista: PoziEmployee[], fileName?: string) => {
      if (!cineId) return;
      setSaving(true);
      try {
        const docRef = doc(db, CINES_COLLECTION, cineId, "pozi", fecha);
        await setDoc(
          docRef,
          {
            fecha,
            empleados: nuevaLista,
            updatedAt: Date.now(),
            actualizadoPor: displayName || user?.email || "Coordinador",
            ...(fileName ? { excelFileName: fileName } : {}),
          },
          { merge: true }
        );
        setEmpleados(nuevaLista);
      } catch (err) {
        console.error("Error al guardar POZI:", err);
        Alert.alert("Error", "No se pudo guardar la información en el servidor.");
      } finally {
        setSaving(false);
      }
    },
    [cineId, fecha, displayName, user]
  );

  // ── Helper de confirmación compatible con Web y Nativo ──────────────────
  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : true;
      if (ok) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: "Cancelar", style: "cancel" },
        { text: "Confirmar", style: "destructive", onPress: onConfirm },
      ]);
    }
  };

  // ── Cargar Excel de POZI (Soporte Semanal Multi-Hoja) ────────────────────
  const handlePickExcel = async () => {
    if (!cineId) {
      Alert.alert("Aviso", "No se encontró el cine actual seleccionado.");
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setSaving(true);

      let buffer: ArrayBuffer;
      const maybeFile = (asset as any).file as File | undefined;
      if (maybeFile && typeof maybeFile.arrayBuffer === "function") {
        buffer = await maybeFile.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        buffer = await response.arrayBuffer();
      }

      // Parsea el libro completo por hojas (Jueves = hoja 1 hasta Miércoles = hoja 7)
      const weeklyResult = parsePoziWeeklyExcel(buffer, asset.name || "POZI.xlsx", fecha);

      if (weeklyResult.dias.length === 0 || weeklyResult.totalEmpleados === 0) {
        setSaving(false);
        Alert.alert(
          "Sin empleados válidos",
          "No se encontraron empleados con categorías válidas (OV, OS, OT, OC, EI) en ninguna de las hojas. Recuerda que filas sin categoría se descartan automáticamente."
        );
        return;
      }

      const usuarioActual = displayName || user?.email || "Coordinador";
      const resumenDias: string[] = [];

      // Guardar cada día parseado en Firestore
      for (const diaResult of weeklyResult.dias) {
        if (!diaResult.empleados || diaResult.empleados.length === 0) continue;

        const docRef = doc(db, CINES_COLLECTION, cineId, "pozi", diaResult.fecha);
        const existingMap = new Map<string, PoziEmployee>();

        try {
          const existingSnap = await getDoc(docRef);
          if (existingSnap && typeof (existingSnap as any).data === "function" && (existingSnap as any).exists?.()) {
            const data = (existingSnap as any).data();
            if (Array.isArray(data.empleados)) {
              data.empleados.forEach((e: PoziEmployee) => {
                existingMap.set(e.nombre.trim().toLowerCase(), e);
              });
            }
          }
        } catch (errSnap) {
          console.warn(`No se pudo leer existente para ${diaResult.fecha}:`, errSnap);
        }

        // Combinar preservando estados de breaks activos si ya estaban en curso
        const empleadosFinales = diaResult.empleados.map((nuevo) => {
          const key = nuevo.nombre.trim().toLowerCase();
          const existente = existingMap.get(key);
          if (existente && existente.estadoBreak !== "PENDIENTE") {
            return {
              ...nuevo,
              estadoBreak: existente.estadoBreak,
              breakInicio: existente.breakInicio,
              breakRegreso: existente.breakRegreso,
              breakFin: existente.breakFin,
              breakIniciadoAt: existente.breakIniciadoAt,
              breakFinalizadoAt: existente.breakFinalizadoAt,
              encargado: existente.encargado,
              notas: existente.notas || nuevo.notas,
            };
          }
          return nuevo;
        });

        await setDoc(
          docRef,
          {
            fecha: diaResult.fecha,
            diaSemana: diaResult.diaNombre,
            empleados: empleadosFinales,
            updatedAt: Date.now(),
            actualizadoPor: usuarioActual,
            excelFileName: asset.name || "POZI.xlsx",
            sheetName: diaResult.sheetName,
          },
          { merge: true }
        );

        resumenDias.push(
          `• ${diaResult.diaNombre} (${dayjs(diaResult.fecha).format("DD/MM")}): ${empleadosFinales.length} emp. [Hoja: "${diaResult.sheetName}"]`
        );
      }

      setSaving(false);

      const primerDia = weeklyResult.dias[0];
      const ultimoDia = weeklyResult.dias[weeklyResult.dias.length - 1];

      Alert.alert(
        "POZI Semanal Cargado",
        `Se procesaron con éxito ${weeklyResult.hojasProcesadas} hoja(s) (${primerDia.diaNombre} a ${ultimoDia.diaNombre}) con un total de ${weeklyResult.totalEmpleados} empleados cargados.\n\n${resumenDias.join("\n")}`
      );
    } catch (err: any) {
      setSaving(false);
      console.error("Error al procesar archivo Excel:", err);
      Alert.alert("Error de procesamiento", err.message || "No se pudo leer el archivo Excel.");
    }
  };

  // ── Programar Break (Horario Programado) ───────────────────────────────
  const handleAbrirProgramarBreak = (emp: PoziEmployee) => {
    setProgramarEmp(emp);
    setProgHora(emp.breakProgramado || "");
    setProgError("");
  };

  const handleGuardarProgramarBreak = (hora: string | null) => {
    if (!programarEmp) return;

    let horaNormalizada: string | null = null;
    if (hora && hora.trim()) {
      horaNormalizada = normalizeExcelTime(hora.trim());
      if (!horaNormalizada || !/^\d{2}:\d{2}$/.test(horaNormalizada)) {
        setProgError("Ingresa un horario válido en formato HH:mm (ej. 20:00).");
        return;
      }
    }

    const nuevaLista = empleados.map((e) => {
      if (e.id === programarEmp.id) {
        return {
          ...e,
          breakProgramado: horaNormalizada,
        };
      }
      return e;
    });

    persistirEmpleados(nuevaLista);
    setProgramarEmp(null);
  };

  // Sugerencias de horarios rápidos para programar break
  const sugerenciasBreak = useMemo(() => {
    if (!programarEmp || !programarEmp.entra || !programarEmp.sale) return [];
    const entraNorm = normalizeExcelTime(programarEmp.entra);
    const saleNorm = normalizeExcelTime(programarEmp.sale);
    if (!entraNorm || !saleNorm) return [];

    const [eH, eM] = entraNorm.split(":").map(Number);
    const [sH, sM] = saleNorm.split(":").map(Number);
    if (isNaN(eH) || isNaN(eM) || isNaN(sH) || isNaN(sM)) return [];

    let entraTotalMin = eH * 60 + eM;
    let saleTotalMin = sH * 60 + sM;
    if (saleTotalMin < entraTotalMin) saleTotalMin += 24 * 60;
    const durMin = saleTotalMin - entraTotalMin;

    const items: { label: string; hora: string }[] = [];

    // Mitad de turno
    const mitadMin = entraTotalMin + Math.round(durMin / 2);
    const mH = Math.floor(mitadMin / 60) % 24;
    const mM = mitadMin % 60;
    const mitadStr = `${String(mH).padStart(2, "0")}:${String(mM).padStart(2, "0")}`;
    items.push({
      label: `Mitad (${mitadStr})`,
      hora: mitadStr,
    });

    // Puntos fijos +2h, +3h, +4h, +5h, +6h
    [2, 3, 4, 5, 6].forEach((offsetH) => {
      if (offsetH * 60 < durMin - 30) {
        const tMin = entraTotalMin + offsetH * 60;
        const h = Math.floor(tMin / 60) % 24;
        const m = tMin % 60;
        const horaStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        if (!items.some((it) => it.hora === horaStr)) {
          items.push({
            label: `+${offsetH}h (${horaStr})`,
            hora: horaStr,
          });
        }
      }
    });

    return items;
  }, [programarEmp]);

  // ── Marcar Salida a Break Manual ─────────────────────────────────────────
  const handleMarcarSalidaBreak = (empId: string) => {
    const ahora = dayjs();
    const ahoraStr = ahora.format("HH:mm");
    const ahoraMs = ahora.valueOf();
    const usuarioActual = displayName || user?.email?.split("@")[0] || "Encargado";

    const nuevaLista = empleados.map((e) => {
      if (e.id === empId) {
        const horaRegresoStr = ahora.add(e.duracionBreak, "minute").format("HH:mm");
        return {
          ...e,
          estadoBreak: "EN_BREAK" as const,
          breakInicio: ahoraStr,
          breakRegreso: horaRegresoStr,
          breakIniciadoAt: ahoraMs,
          encargado: usuarioActual,
        };
      }
      return e;
    });

    persistirEmpleados(nuevaLista);
  };

  // ── Finalizar Break ("Volvió de Break") ──────────────────────────────────
  const handleFinalizarBreak = (empId: string) => {
    const ahora = dayjs();
    const ahoraStr = ahora.format("HH:mm");
    const ahoraMs = ahora.valueOf();

    const nuevaLista = empleados.map((e) => {
      if (e.id === empId) {
        return {
          ...e,
          estadoBreak: "FINALIZADO" as const,
          breakFin: ahoraStr,
          breakFinalizadoAt: ahoraMs,
        };
      }
      return e;
    });

    persistirEmpleados(nuevaLista);
  };

  // ── Deshacer Salida a Break / Restablecer a Pendiente ────────────────────
  const handleReiniciarBreak = (empId: string) => {
    confirmAction(
      "Deshacer Break",
      "¿Deseas restablecer este empleado a estado Pendiente?",
      () => {
        const nuevaLista = empleados.map((e) => {
          if (e.id === empId) {
            return {
              ...e,
              estadoBreak: "PENDIENTE" as const,
              breakInicio: null,
              breakRegreso: null,
              breakFin: null,
              breakIniciadoAt: null,
              breakFinalizadoAt: null,
            };
          }
          return e;
        });
        persistirEmpleados(nuevaLista);
      }
    );
  };

  // ── Modificar Ingreso / Horarios ───────────────────────────────────────
  const handleAbrirEdicion = (emp: PoziEmployee) => {
    setEditingEmp(emp);
    setEditEntra(emp.entra || "14:00");
    setEditSale(emp.sale || "22:00");
    setEditCat((emp.categoria as PoziCategoriaCodigo) || "OV");
    setEditError("");
  };

  const handleGuardarEdicion = () => {
    if (!editingEmp) return;

    const entraNorm = normalizeExcelTime(editEntra);
    const saleNorm = normalizeExcelTime(editSale);

    if (!entraNorm || !saleNorm) {
      setEditError("Ingresa horarios válidos de entrada y salida.");
      return;
    }

    const hs = calculateWorkHours(entraNorm, saleNorm);
    const durBreak = calculateBreakDuration(hs);

    const nuevaLista = empleados.map((e) => {
      if (e.id === editingEmp.id) {
        return {
          ...e,
          entra: entraNorm,
          sale: saleNorm,
          categoria: editCat,
          notas: editCat === "EI" ? "EI" : e.notas === "EI" && editCat !== "EI" ? null : e.notas,
          horasTrabajadas: hs,
          duracionBreak: durBreak,
        };
      }
      return e;
    });

    persistirEmpleados(nuevaLista);
    setEditingEmp(null);
  };

  const handleEliminarEmpleado = (empId: string, empNombre?: string) => {
    confirmAction(
      "Eliminar Empleado",
      `¿Deseas quitar a ${empNombre ? `"${empNombre}"` : "este empleado"} de la lista del día?`,
      () => {
        const nuevaLista = empleados.filter((e) => e.id !== empId);
        persistirEmpleados(nuevaLista);
        if (editingEmp?.id === empId) {
          setEditingEmp(null);
        }
      }
    );
  };

  // ── Agregar Empleado Manual ─────────────────────────────────────────────
  const handleGuardarNuevoEmpleado = () => {
    if (!nuevoNombre.trim()) {
      setNuevoError("Ingresa el nombre y apellido.");
      return;
    }

    const entraNorm = normalizeExcelTime(nuevoEntra);
    const saleNorm = normalizeExcelTime(nuevoSale);
    const hs = calculateWorkHours(entraNorm, saleNorm);
    const durBreak = calculateBreakDuration(hs);

    const emp: PoziEmployee = {
      id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nombre: nuevoNombre.trim(),
      categoria: nuevaCat,
      entra: entraNorm,
      sale: saleNorm,
      horasTrabajadas: hs,
      duracionBreak: durBreak,
      estadoBreak: "PENDIENTE",
      breakInicio: null,
      breakRegreso: null,
      breakFin: null,
      breakIniciadoAt: null,
      encargado: null,
      notas: "Cargado manual",
    };

    const nuevaLista = [...empleados, emp];
    persistirEmpleados(nuevaLista);
    setShowAddModal(false);
    setNuevoNombre("");
    setNuevoError("");
  };

  // ── Navegación de Fechas ────────────────────────────────────────────────
  const cambiarDia = (delta: number) => {
    setFecha((prev) => dayjs(prev).add(delta, "day").format("YYYY-MM-DD"));
  };

  // ── Clasificación de Empleados en Vivo (Manual + Break Programado) ──────
  const infoEmpleados = useMemo(() => {
    const isFechaHoy = fecha === dayjs().format("YYYY-MM-DD");

    return empleados.map((emp) => {
      let salio = false;
      let enBreak = false;
      let cumplido = false;
      let esProgramadoFuturo = false;
      let minutosRestantes = 0;
      let minutosTranscurridos = 0;
      let horaInicioEfectiva: string | null = null;
      let horaRegresoEfectiva: string | null = null;

      // 1. Caso Break Finalizado manualmente
      if (emp.estadoBreak === "FINALIZADO") {
        salio = true;
        cumplido = true;
        enBreak = false;
        horaInicioEfectiva = emp.breakInicio || emp.breakProgramado || null;
        horaRegresoEfectiva = emp.breakFin || emp.breakRegreso || null;
        minutosTranscurridos = emp.duracionBreak;
      }
      // 2. Caso Break Iniciado Manualmente ("Se fue a Break")
      else if (emp.estadoBreak === "EN_BREAK" && emp.breakIniciadoAt) {
        salio = true;
        horaInicioEfectiva = emp.breakInicio || dayjs(emp.breakIniciadoAt).format("HH:mm");
        horaRegresoEfectiva =
          emp.breakRegreso ||
          dayjs(emp.breakIniciadoAt).add(emp.duracionBreak, "minute").format("HH:mm");

        const msFinEsperado = emp.breakIniciadoAt + emp.duracionBreak * 60 * 1000;
        const diffMs = msFinEsperado - nowTick;
        minutosRestantes = Math.round(diffMs / 60000);
        minutosTranscurridos = Math.max(0, Math.floor((nowTick - emp.breakIniciadoAt) / 60000));

        if (minutosRestantes <= 0) {
          cumplido = true;
          enBreak = false;
        } else {
          cumplido = false;
          enBreak = true;
        }
      }
      // 3. Caso Break Programado por Horario (ej: "20:00" o "08:00")
      else if (emp.breakProgramado) {
        const [progH, progM] = emp.breakProgramado.split(":").map(Number);
        if (!isNaN(progH) && !isNaN(progM)) {
          let progDate = dayjs(`${fecha}T${String(progH).padStart(2, "0")}:${String(progM).padStart(2, "0")}:00`);
          // Si el turno entra de noche (>=18h) y el break es de madrugada (<6h)
          if (emp.entra) {
            const [eH] = emp.entra.split(":").map(Number);
            if (!isNaN(eH) && eH >= 18 && progH < 6) {
              progDate = progDate.add(1, "day");
            }
          }

          const progMs = progDate.valueOf();
          horaInicioEfectiva = emp.breakProgramado;
          horaRegresoEfectiva = progDate.add(emp.duracionBreak, "minute").format("HH:mm");

          // Si estamos visualizando la fecha actual
          if (isFechaHoy) {
            if (nowTick < progMs) {
              // Futuro: todavía no llegó la hora del break
              esProgramadoFuturo = true;
              salio = false;
              enBreak = false;
              cumplido = false;
              minutosRestantes = Math.round((progMs - nowTick) / 60000);
            } else {
              // Ya llegó o pasó el horario programado: ¡Empieza a correr automáticamente!
              // Ejemplo: programado a las 8, son 8:30 => transcurridos 30m, faltan 15m
              salio = true;
              const msFinProg = progMs + emp.duracionBreak * 60 * 1000;
              const diffFinMs = msFinProg - nowTick;
              minutosRestantes = Math.round(diffFinMs / 60000);
              minutosTranscurridos = Math.max(0, Math.floor((nowTick - progMs) / 60000));

              if (minutosRestantes <= 0) {
                cumplido = true;
                enBreak = false;
              } else {
                cumplido = false;
                enBreak = true;
              }
            }
          } else {
            // Fecha no es hoy
            const esPasada = dayjs(fecha).isBefore(dayjs().format("YYYY-MM-DD"));
            if (esPasada) {
              salio = true;
              cumplido = true;
              minutosTranscurridos = emp.duracionBreak;
            } else {
              esProgramadoFuturo = true;
            }
          }
        }
      }

      const entraLimpio = emp.entra || "";
      const esProximoIngreso = entraLimpio >= horaActualStr;

      return {
        ...emp,
        salio,
        enBreak,
        cumplido,
        esProgramadoFuturo,
        horaInicioEfectiva,
        horaRegresoEfectiva,
        minutosRestantes,
        minutosTranscurridos,
        esProximoIngreso,
      };
    });
  }, [empleados, fecha, nowTick, horaActualStr]);

  const totalProximosIngresos = useMemo(() => {
    return infoEmpleados.filter((e) => e.esProximoIngreso).length;
  }, [infoEmpleados]);

  // KPIs
  const kpis = useMemo(() => {
    const total = infoEmpleados.length;
    const programados = infoEmpleados.filter((e) => e.esProgramadoFuturo).length;
    const pendientes = infoEmpleados.filter((e) => !e.salio && !e.esProgramadoFuturo).length;
    const enBreakActivos = infoEmpleados.filter((e) => e.enBreak).length;
    const horarioCumplido = infoEmpleados.filter((e) => e.cumplido).length;
    return { total, programados, pendientes, enBreakActivos, horarioCumplido };
  }, [infoEmpleados]);

  // ── Empleados Filtrados y Ordenados ────────────────────────────────────
  const empleadosFiltrados = useMemo(() => {
    const filtrados = infoEmpleados.filter((e) => {
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase().trim();
        const coincideNombre = e.nombre.toLowerCase().includes(q);
        const coincideCat = String(e.categoria || "").toLowerCase().includes(q);
        if (!coincideNombre && !coincideCat) return false;
      }

      if (filtroCategoria !== "TODAS" && e.categoria !== filtroCategoria) {
        return false;
      }

      if (filtroEstado === "PROGRAMADOS" && !e.esProgramadoFuturo) return false;
      if (filtroEstado === "PENDIENTE" && (e.salio || e.esProgramadoFuturo)) return false;
      if (filtroEstado === "EN_BREAK" && !e.enBreak) return false;
      if (filtroEstado === "CUMPLIDO" && !e.cumplido) return false;

      if (soloProximosIngresos && !e.esProximoIngreso) {
        return false;
      }

      return true;
    });

    return filtrados.sort((a, b) => (a.entra || "").localeCompare(b.entra || ""));
  }, [infoEmpleados, filtroTexto, filtroCategoria, filtroEstado, soloProximosIngresos]);

  const isWide = !isMobile && width >= 850;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── BARRA SUPERIOR / HEADER ── */}
      <View style={styles.topBar}>
        <View style={styles.titleArea}>
          <View style={styles.titleIconBadge}>
            <MaterialCommunityIcons name="account-clock-outline" size={20} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>POZI & Breaks</Text>
            <Text style={styles.headerSub}>Control operativo de turnos y descansos</Text>
          </View>
        </View>

        {/* Acciones principales y Selector de Fecha */}
        <View style={styles.headerActions}>
          {/* Navegador de Fecha */}
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={() => cambiarDia(-1)} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-left" size={16} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFecha(dayjs().format("YYYY-MM-DD"))} style={styles.dateCenterBtn}>
              <MaterialCommunityIcons name="calendar" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.dateText}>
                {dayjs(fecha).format("DD/MM/YYYY")}
                {fecha === dayjs().format("YYYY-MM-DD") ? " (Hoy)" : ""}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => cambiarDia(1)} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Botones de acción */}
          <View style={styles.btnGroup}>
            <TouchableOpacity onPress={handlePickExcel} style={styles.btnUpload} activeOpacity={0.8}>
              <MaterialCommunityIcons name="file-excel-box" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.btnUploadText}>Cargar Excel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              style={[styles.btnAction, isMobile && styles.btnActionMobile]}
              activeOpacity={0.8}
              title="Agregar Empleado"
            >
              <MaterialCommunityIcons
                name="account-plus"
                size={16}
                color={COLORS.text}
                style={!isMobile ? { marginRight: 4 } : undefined}
              />
              {!isMobile && <Text style={styles.btnActionText}>Agregar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── SELECTOR RÁPIDO DE DÍAS DE LA SEMANA (Jueves a Miércoles) ── */}
      <View style={styles.weekSelectorCard}>
        <View style={styles.weekHeaderRow}>
          <Text style={styles.weekHeaderTitle}>
            Semana de Cine ({baseThursdayObj.format("DD/MM")} al {baseThursdayObj.add(6, "day").format("DD/MM")})
          </Text>
          {lastExcelName && (
            <Text style={styles.weekHeaderSub}>
              📄 {lastExcelName}
            </Text>
          )}
        </View>

        <View style={styles.weekTabsRow}>
          {cinemaWeekDays.map((dayItem) => {
            const isSel = dayItem.isSelected;
            return (
              <TouchableOpacity
                key={dayItem.key}
                onPress={() => setFecha(dayItem.dateStr)}
                style={[
                  styles.dayTabBtn,
                  isSel && styles.dayTabBtnActive,
                  dayItem.isToday && !isSel && styles.dayTabBtnToday,
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.dayTabDayText,
                    isSel && styles.dayTabDayTextActive,
                    dayItem.isToday && !isSel && styles.dayTabDayTextToday,
                  ]}
                  numberOfLines={1}
                >
                  {isMobile ? dayItem.short : width < 900 ? dayItem.short : dayItem.label}
                </Text>
                <Text
                  style={[
                    styles.dayTabDateText,
                    isSel && styles.dayTabDateTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {dayItem.dateFormatted}
                </Text>
                {dayItem.isToday && (
                  <View style={[styles.dayTodayIndicator, isSel && styles.dayTodayIndicatorActive]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── BARRA RESUMEN / KPIS LINEAL Y COMPACTA ── */}
      <View style={styles.kpiBar}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiVal}>{kpis.total}</Text>
          <Text style={styles.kpiTag}>Total</Text>
        </View>
        <View style={styles.kpiDivider} />

        <View style={styles.kpiItem}>
          <Text style={[styles.kpiVal, { color: COLORS.muted }]}>{kpis.pendientes}</Text>
          <Text style={styles.kpiTag}>Pendientes</Text>
        </View>
        <View style={styles.kpiDivider} />

        <TouchableOpacity
          onPress={() => setFiltroEstado(filtroEstado === "PROGRAMADOS" ? "TODOS" : "PROGRAMADOS")}
          style={[styles.kpiItem, { cursor: "pointer" as any }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.kpiVal, { color: kpis.programados > 0 ? "#0284C7" : COLORS.muted }]}>
            {kpis.programados}
          </Text>
          <Text style={[styles.kpiTag, filtroEstado === "PROGRAMADOS" && { color: "#0284C7", fontWeight: "700" }]}>
            Programados
          </Text>
        </TouchableOpacity>
        <View style={styles.kpiDivider} />

        <View style={styles.kpiItem}>
          <Text style={[styles.kpiVal, { color: kpis.enBreakActivos > 0 ? "#D97706" : COLORS.text }]}>
            {kpis.enBreakActivos}
          </Text>
          <Text style={styles.kpiTag}>En Break</Text>
        </View>
        <View style={styles.kpiDivider} />

        <View style={styles.kpiItem}>
          <Text style={[styles.kpiVal, { color: COLORS.success }]}>{kpis.horarioCumplido}</Text>
          <Text style={styles.kpiTag}>Cumplidos</Text>
        </View>

        {/* Botón interactivo de Próximos en KPI bar */}
        <TouchableOpacity
          onPress={() => setSoloProximosIngresos(!soloProximosIngresos)}
          style={[
            styles.kpiProximosBtn,
            soloProximosIngresos && styles.kpiProximosBtnActive,
            !isMobile && { marginLeft: "auto" },
          ]}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name={soloProximosIngresos ? "check-circle" : "clock-fast"}
            size={14}
            color={soloProximosIngresos ? "#FFFFFF" : "#0284C7"}
            style={{ marginRight: 5 }}
          />
          <Text
            style={[
              styles.kpiProximosLabel,
              soloProximosIngresos && styles.kpiProximosLabelActive,
            ]}
          >
            {soloProximosIngresos ? "Filtro activo: Próximos" : "Próximos a ingresar"}
          </Text>
          <View
            style={[
              styles.kpiProximosBadge,
              soloProximosIngresos && styles.kpiProximosBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.kpiProximosBadgeText,
                soloProximosIngresos && styles.kpiProximosBadgeTextActive,
              ]}
            >
              {totalProximosIngresos}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={soloProximosIngresos ? "close" : "chevron-right"}
            size={13}
            color={soloProximosIngresos ? "#FFFFFF" : "#0284C7"}
            style={{ marginLeft: 3 }}
          />
        </TouchableOpacity>
      </View>

      {/* ── BARRA DE FILTROS LIMPIA Y MODERNA ── */}
      <View style={styles.filterBar}>
        {/* Buscador */}
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={16} color={COLORS.muted} style={{ marginRight: 6 }} />
          <TextInput
            placeholder="Buscar por empleado..."
            placeholderTextColor={COLORS.muted}
            value={filtroTexto}
            onChangeText={setFiltroTexto}
            style={styles.searchInput}
          />
          {filtroTexto.length > 0 && (
            <TouchableOpacity onPress={() => setFiltroTexto("")}>
              <MaterialCommunityIcons name="close-circle" size={14} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Scroll horizontal de filtros para que nunca se rompa en móvil ni PC */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {/* Botón destacado e interactivo: Próximos Ingresos */}
          <TouchableOpacity
            onPress={() => setSoloProximosIngresos(!soloProximosIngresos)}
            style={[
              styles.btnProximos,
              soloProximosIngresos && styles.btnProximosActive,
            ]}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={soloProximosIngresos ? "clock-check" : "clock-fast"}
              size={15}
              color={soloProximosIngresos ? "#FFFFFF" : "#0284C7"}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.btnProximosText,
                soloProximosIngresos && styles.btnProximosTextActive,
              ]}
            >
              {soloProximosIngresos ? "Próximos (Activo)" : `Próximos (≥${horaActualStr})`}
            </Text>
            <View
              style={[
                styles.btnProximosBadge,
                soloProximosIngresos && styles.btnProximosBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.btnProximosBadgeText,
                  soloProximosIngresos && styles.btnProximosBadgeTextActive,
                ]}
              >
                {totalProximosIngresos}
              </Text>
            </View>
            {soloProximosIngresos && (
              <MaterialCommunityIcons
                name="close-circle"
                size={14}
                color="#FFFFFF"
                style={{ marginLeft: 5 }}
              />
            )}
          </TouchableOpacity>

          {/* Divisor vertical */}
          <View style={styles.filterVDivider} />

          {/* Segment de Categorías Oficiales */}
          <View style={styles.pillGroup}>
            <TouchableOpacity
              onPress={() => setFiltroCategoria("TODAS")}
              style={[styles.filterPill, filtroCategoria === "TODAS" && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, filtroCategoria === "TODAS" && styles.filterPillTextActive]}>
                Todas
              </Text>
            </TouchableOpacity>

            {(Object.keys(POZI_CATEGORIAS) as PoziCategoriaCodigo[]).map((cKey) => {
              const meta = POZI_CATEGORIAS[cKey];
              const isSel = filtroCategoria === cKey;
              const count = infoEmpleados.filter((e) => e.categoria === cKey).length;
              return (
                <TouchableOpacity
                  key={cKey}
                  onPress={() => setFiltroCategoria(cKey)}
                  style={[
                    styles.filterPill,
                    isSel && { backgroundColor: meta.bg, borderColor: meta.color },
                  ]}
                >
                  <View style={[styles.catDot, { backgroundColor: meta.color }]} />
                  <Text style={[styles.filterPillText, isSel && { color: meta.color, fontWeight: "700" }]}>
                    {meta.codigo}
                  </Text>
                  {count > 0 && (
                    <Text style={[styles.filterPillBadge, isSel && { color: meta.color }]}>
                      {count}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Divisor vertical */}
          <View style={styles.filterVDivider} />

          {/* Segment de Estado */}
          <View style={styles.pillGroup}>
            {(["TODOS", "PROGRAMADOS", "PENDIENTE", "EN_BREAK", "CUMPLIDO"] as const).map((st) => {
              const isSel = filtroEstado === st;
              const labels: Record<string, string> = {
                TODOS: "Todos",
                PROGRAMADOS: "Programados",
                PENDIENTE: "Pendientes",
                EN_BREAK: "En Break",
                CUMPLIDO: "Cumplidos",
              };
              return (
                <TouchableOpacity
                  key={st}
                  onPress={() => setFiltroEstado(st)}
                  style={[styles.filterPill, isSel && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, isSel && styles.filterPillTextActive]}>
                    {labels[st]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Banner de filtro activo de Próximos */}
      {soloProximosIngresos && (
        <View style={styles.proximosActiveBanner}>
          <View style={styles.proximosActiveBannerLeft}>
            <MaterialCommunityIcons name="clock-check" size={15} color="#0284C7" style={{ marginRight: 6 }} />
            <Text style={styles.proximosActiveBannerText}>
              Mostrando ingresos a partir de las <Text style={{ fontWeight: "800" }}>{horaActualStr}</Text> ({empleadosFiltrados.length} empleados)
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setSoloProximosIngresos(false)}
            style={styles.btnQuitarFiltroProximos}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close" size={12} color="#0284C7" style={{ marginRight: 3 }} />
            <Text style={styles.btnQuitarFiltroProximosText}>Quitar filtro</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── TABLA LINEAL DE EMPLEADOS ── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando datos del POZI...</Text>
        </View>
      ) : empleados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-excel-outline" size={40} color={COLORS.muted} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>No hay POZI cargado para esta fecha</Text>
          <Text style={styles.emptyDesc}>
            Sube el archivo Excel del día. Las filas sin categorías válidas (OV, OS, OT, OC, EI) se descartan solas.
          </Text>
          <TouchableOpacity onPress={handlePickExcel} style={styles.btnUpload} activeOpacity={0.8}>
            <MaterialCommunityIcons name="upload" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.btnUploadText}>Subir archivo Excel</Text>
          </TouchableOpacity>
        </View>
      ) : empleadosFiltrados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="filter-remove-outline" size={32} color={COLORS.muted} style={{ marginBottom: 6 }} />
          <Text style={styles.emptyTitle}>No hay empleados que coincidan con el filtro</Text>
          <TouchableOpacity
            onPress={() => {
              setFiltroTexto("");
              setFiltroCategoria("TODAS");
              setFiltroEstado("TODOS");
              setSoloProximosIngresos(false);
            }}
            style={styles.btnResetFilter}
          >
            <Text style={styles.btnResetFilterText}>Limpiar filtros</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.tableCard}>
          {/* Cabecera de la tabla (solo en pantallas anchas / tablet / desktop) */}
          {isWide && (
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thText, { flex: 2.2 }]}>EMPLEADO</Text>
              <Text style={[styles.thText, { width: 70 }]}>CAT</Text>
              <Text style={[styles.thText, { flex: 1.4 }]}>TURNO</Text>
              <Text style={[styles.thText, { width: 85 }]}>DURACIÓN</Text>
              <Text style={[styles.thText, { width: 115 }]}>BREAK PROG.</Text>
              <Text style={[styles.thText, { flex: 2.4 }]}>ESTADO / REGRESO</Text>
              <Text style={[styles.thText, { width: 145, textAlign: "right" }]}>ACCIONES</Text>
            </View>
          )}

          {/* Filas de empleados */}
          {empleadosFiltrados.map((emp, index) => {
            const isSalio = emp.salio;
            const isCumplido = emp.cumplido;
            const catMeta = POZI_CATEGORIAS[emp.categoria as PoziCategoriaCodigo] || {
              codigo: emp.categoria,
              nombre: emp.categoria,
              color: "#475569",
              bg: "#F1F5F9",
              border: "#CBD5E1",
            };
            const isLast = index === empleadosFiltrados.length - 1;

            if (isWide) {
              // ── FILA LINEAL PARA PC / TABLET ──
              return (
                <View
                  key={emp.id}
                  style={[
                    styles.rowWide,
                    isLast && { borderBottomWidth: 0 },
                    emp.esProgramadoFuturo && styles.rowProgramado,
                    emp.enBreak && styles.rowEnBreak,
                    emp.cumplido && styles.rowCumplido,
                  ]}
                >
                  {/* Columna Empleado */}
                  <View style={[styles.cell, { flex: 2.2, flexDirection: "row", alignItems: "center" }]}>
                    <Text style={styles.rowNombre} numberOfLines={1}>
                      {emp.nombre}
                    </Text>
                    {emp.notas?.includes("EI") && (
                      <View style={styles.badgeEiInline}>
                        <Text style={styles.badgeEiInlineText}>EI</Text>
                      </View>
                    )}
                  </View>

                  {/* Columna Categoría (Tocar para modificar) */}
                  <View style={[styles.cell, { width: 70 }]}>
                    <TouchableOpacity
                      onPress={() => handleAbrirEdicion(emp)}
                      style={[styles.catBadgeCompact, { backgroundColor: catMeta.bg, borderColor: catMeta.border }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catBadgeCompactText, { color: catMeta.color }]}>{catMeta.codigo}</Text>
                      <MaterialCommunityIcons name="pencil-outline" size={10} color={catMeta.color} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  </View>

                  {/* Columna Turno + Edición */}
                  <View style={[styles.cell, { flex: 1.4, flexDirection: "row", alignItems: "center" }]}>
                    <TouchableOpacity
                      onPress={() => handleAbrirEdicion(emp)}
                      style={styles.horarioInlineBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.horarioInlineText}>
                        {emp.entra || "--:--"} - {emp.sale || "--:--"}
                      </Text>
                      <Text style={styles.horarioHsMuted}>({emp.horasTrabajadas}h)</Text>
                      <MaterialCommunityIcons name="pencil-outline" size={13} color={COLORS.muted} style={{ marginLeft: 3 }} />
                    </TouchableOpacity>
                  </View>

                  {/* Columna Duración Break */}
                  <View style={[styles.cell, { width: 85 }]}>
                    <View
                      style={[
                        styles.breakPillFina,
                        emp.duracionBreak === 20 ? styles.breakPill20 : styles.breakPill45,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={emp.duracionBreak === 20 ? "coffee" : "food-apple"}
                        size={11}
                        color={emp.duracionBreak === 20 ? "#047857" : "#B45309"}
                        style={{ marginRight: 3 }}
                      />
                      <Text
                        style={[
                          styles.breakPillFinaText,
                          { color: emp.duracionBreak === 20 ? "#047857" : "#B45309" },
                        ]}
                      >
                        {emp.duracionBreak}m
                      </Text>
                    </View>
                  </View>

                  {/* Columna Break Programado */}
                  <View style={[styles.cell, { width: 115 }]}>
                    {emp.breakProgramado ? (
                      <TouchableOpacity
                        onPress={() => handleAbrirProgramarBreak(emp)}
                        style={[
                          styles.progPill,
                          emp.esProgramadoFuturo && styles.progPillFuturo,
                          emp.enBreak && styles.progPillEnBreak,
                        ]}
                        activeOpacity={0.75}
                        title="Modificar horario programado"
                      >
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={11}
                          color={emp.esProgramadoFuturo ? "#0284C7" : emp.enBreak ? "#D97706" : COLORS.text}
                          style={{ marginRight: 3 }}
                        />
                        <Text
                          style={[
                            styles.progPillText,
                            emp.esProgramadoFuturo && { color: "#0284C7" },
                            emp.enBreak && { color: "#D97706" },
                          ]}
                        >
                          {emp.breakProgramado}
                        </Text>
                        <MaterialCommunityIcons
                          name="pencil-outline"
                          size={10}
                          color={COLORS.muted}
                          style={{ marginLeft: 3 }}
                        />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleAbrirProgramarBreak(emp)}
                        style={styles.btnProgramarVacio}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="clock-plus-outline" size={12} color={COLORS.muted} style={{ marginRight: 3 }} />
                        <Text style={styles.btnProgramarVacioText}>+ Prog.</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Columna Estado / Regreso */}
                  <View style={[styles.cell, { flex: 2.4 }]}>
                    {emp.esProgramadoFuturo ? (
                      <View style={styles.salioInlineWrap}>
                        <View style={styles.dotProgramado} />
                        <Text style={styles.estadoProgramadoText}>
                          Prog. {emp.horaInicioEfectiva} ➔ {emp.horaRegresoEfectiva}
                        </Text>
                        <View style={styles.timerPillProg}>
                          <Text style={styles.timerPillProgText}>En {emp.minutosRestantes}m</Text>
                        </View>
                      </View>
                    ) : emp.enBreak ? (
                      <View style={styles.salioInlineWrap}>
                        <Text style={styles.salioInlineHoras}>
                          {emp.horaInicioEfectiva} ➔{" "}
                          <Text style={{ fontWeight: "800", color: "#B45309" }}>
                            {emp.horaRegresoEfectiva}
                          </Text>
                        </Text>
                        <View style={styles.timerPillMini}>
                          <Text style={styles.timerPillMiniText}>
                            Van {emp.minutosTranscurridos}m • {emp.minutosRestantes}m rest
                          </Text>
                        </View>
                      </View>
                    ) : emp.cumplido ? (
                      <View style={styles.salioInlineWrap}>
                        <Text style={styles.salioInlineHoras}>
                          {emp.horaInicioEfectiva} ➔{" "}
                          <Text style={{ fontWeight: "800", color: "#047857" }}>
                            {emp.horaRegresoEfectiva}
                          </Text>
                        </Text>
                        <View style={styles.cumplidoPillMini}>
                          <Text style={styles.cumplidoPillMiniText}>
                            {emp.minutosRestantes < -2 ? `+${Math.abs(emp.minutosRestantes)}m` : "Cumplido"}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={styles.dotPendiente} />
                        <Text style={styles.estadoPendienteText}>Pendiente</Text>
                        {emp.esProximoIngreso && (
                          <View style={styles.proximoPillInline}>
                            <Text style={styles.proximoPillInlineText}>Entra {emp.entra}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Columna Acciones */}
                  <View style={[styles.cell, { width: 145, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 5 }]}>
                    {emp.enBreak ? (
                      <>
                        <TouchableOpacity
                          onPress={() => handleFinalizarBreak(emp.id)}
                          style={styles.btnFinalizarLineal}
                          activeOpacity={0.8}
                          title="Marcar regreso de break"
                        >
                          <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" style={{ marginRight: 2 }} />
                          <Text style={styles.btnFinalizarLinealText}>Volvió</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleReiniciarBreak(emp.id)}
                          style={styles.btnIconAction}
                          title="Deshacer"
                        >
                          <MaterialCommunityIcons name="restart" size={15} color={COLORS.muted} />
                        </TouchableOpacity>
                      </>
                    ) : emp.cumplido ? (
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnIconAction}
                        title="Deshacer"
                      >
                        <MaterialCommunityIcons name="restart" size={15} color={COLORS.muted} />
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          onPress={() => handleMarcarSalidaBreak(emp.id)}
                          style={styles.btnBreakLineal}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name="coffee-outline" size={13} color="#FFFFFF" style={{ marginRight: 3 }} />
                          <Text style={styles.btnBreakLinealText}>Break</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleAbrirProgramarBreak(emp)}
                          style={styles.btnIconAction}
                          title="Programar horario de break"
                        >
                          <MaterialCommunityIcons name="clock-edit-outline" size={15} color={COLORS.muted} />
                        </TouchableOpacity>
                      </>
                    )}

                    {/* Botón Borrar */}
                    <TouchableOpacity
                      onPress={() => handleEliminarEmpleado(emp.id, emp.nombre)}
                      style={styles.btnIconActionDanger}
                      accessibilityLabel="Eliminar"
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            // ── FILA LINEAL COMPACTA PARA MÓVIL (2 RENGLONES FINITOS) ──
            return (
              <View
                key={emp.id}
                style={[
                  styles.rowMobile,
                  isLast && { borderBottomWidth: 0 },
                  emp.esProgramadoFuturo && styles.rowProgramado,
                  emp.enBreak && styles.rowEnBreak,
                  emp.cumplido && styles.rowCumplido,
                ]}
              >
                {/* Renglón 1: Nombre + Cat + Horario + Botones editar/borrar */}
                <View style={styles.mobileRowTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 5 }}>
                    <Text style={styles.rowNombreMobile} numberOfLines={1}>
                      {emp.nombre}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleAbrirEdicion(emp)}
                      style={[styles.catBadgeCompact, { backgroundColor: catMeta.bg, borderColor: catMeta.border }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catBadgeCompactText, { color: catMeta.color }]}>{catMeta.codigo}</Text>
                      <MaterialCommunityIcons name="pencil-outline" size={9} color={catMeta.color} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                    {emp.notas?.includes("EI") && (
                      <View style={styles.badgeEiInline}>
                        <Text style={styles.badgeEiInlineText}>EI</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => handleAbrirEdicion(emp)}
                    style={styles.horarioInlineBtnMobile}
                  >
                    <Text style={styles.horarioInlineTextMobile}>
                      {emp.entra || "--:--"} - {emp.sale || "--:--"}
                    </Text>
                    <MaterialCommunityIcons name="pencil-outline" size={12} color={COLORS.muted} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleEliminarEmpleado(emp.id, emp.nombre)}
                    style={styles.btnIconActionDangerMobile}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color="#DC2626" />
                  </TouchableOpacity>
                </View>

                {/* Renglón 2: Duración Break + Break Programado + Estado / Botón */}
                <View style={styles.mobileRowBottom}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View
                      style={[
                        styles.breakPillFina,
                        emp.duracionBreak === 20 ? styles.breakPill20 : styles.breakPill45,
                      ]}
                    >
                      <Text
                        style={[
                          styles.breakPillFinaText,
                          { color: emp.duracionBreak === 20 ? "#047857" : "#B45309" },
                        ]}
                      >
                        {emp.duracionBreak}m
                      </Text>
                    </View>

                    {emp.breakProgramado ? (
                      <TouchableOpacity
                        onPress={() => handleAbrirProgramarBreak(emp)}
                        style={[
                          styles.progPillMobile,
                          emp.esProgramadoFuturo && styles.progPillFuturo,
                          emp.enBreak && styles.progPillEnBreak,
                        ]}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={10}
                          color={emp.esProgramadoFuturo ? "#0284C7" : emp.enBreak ? "#D97706" : COLORS.text}
                          style={{ marginRight: 2 }}
                        />
                        <Text
                          style={[
                            styles.progPillMobileText,
                            emp.esProgramadoFuturo && { color: "#0284C7" },
                            emp.enBreak && { color: "#D97706" },
                          ]}
                        >
                          {emp.breakProgramado}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleAbrirProgramarBreak(emp)}
                        style={styles.btnProgramarVacioMobile}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="clock-plus-outline" size={11} color={COLORS.muted} style={{ marginRight: 2 }} />
                        <Text style={styles.btnProgramarVacioMobileText}>+ Prog.</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Estado y Acciones en móvil */}
                  {emp.esProgramadoFuturo ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <View style={styles.timerPillProg}>
                        <Text style={styles.timerPillProgText}>En {emp.minutosRestantes}m</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleMarcarSalidaBreak(emp.id)}
                        style={styles.btnBreakMobile}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="coffee-outline" size={12} color="#FFFFFF" style={{ marginRight: 3 }} />
                        <Text style={styles.btnBreakMobileText}>Iniciar ya</Text>
                      </TouchableOpacity>
                    </View>
                  ) : emp.enBreak ? (
                    <View style={styles.salioMobileInline}>
                      <View style={{ flexDirection: "column", alignItems: "flex-end" }}>
                        <Text style={styles.salioMobileText}>
                          {emp.horaInicioEfectiva} ➔{" "}
                          <Text style={{ fontWeight: "800", color: "#B45309" }}>
                            {emp.horaRegresoEfectiva}
                          </Text>
                        </Text>
                        <Text style={{ fontSize: 9, color: "#B45309", fontWeight: "700" }}>
                          Van {emp.minutosTranscurridos}m ({emp.minutosRestantes}m rest)
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleFinalizarBreak(emp.id)}
                        style={styles.btnFinalizarMobile}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" style={{ marginRight: 2 }} />
                        <Text style={styles.btnFinalizarMobileText}>Volvió</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnIconActionMobile}
                      >
                        <MaterialCommunityIcons name="restart" size={13} color={COLORS.muted} />
                      </TouchableOpacity>
                    </View>
                  ) : emp.cumplido ? (
                    <View style={styles.salioMobileInline}>
                      <Text style={styles.salioMobileText}>
                        {emp.horaInicioEfectiva} ➔{" "}
                        <Text style={{ fontWeight: "800", color: "#047857" }}>
                          {emp.horaRegresoEfectiva}
                        </Text>
                      </Text>
                      <View style={styles.cumplidoPillMini}>
                        <Text style={styles.cumplidoPillMiniText}>
                          {emp.minutosRestantes < -2 ? `+${Math.abs(emp.minutosRestantes)}m` : "Cumplido"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnIconActionMobile}
                      >
                        <MaterialCommunityIcons name="restart" size={13} color={COLORS.muted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleMarcarSalidaBreak(emp.id)}
                      style={styles.btnBreakMobile}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="coffee-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.btnBreakMobileText}>Se fue a Break</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── MODAL PROGRAMAR BREAK ── */}
      <Modal visible={!!programarEmp} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="clock-time-four-outline" size={20} color="#0284C7" style={{ marginRight: 6 }} />
                <Text style={styles.modalTitle}>Programar Break</Text>
              </View>
              <TouchableOpacity onPress={() => setProgramarEmp(null)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.editEmpNombre}>{programarEmp?.nombre}</Text>
            <Text style={styles.editEmpSub}>
              Turno: {programarEmp?.entra || "--:--"} a {programarEmp?.sale || "--:--"} ({programarEmp?.horasTrabajadas}h) • Break de {programarEmp?.duracionBreak} min
            </Text>

            {progError.length > 0 && <Text style={styles.errorText}>{progError}</Text>}

            {/* Sugerencias de horarios según turno */}
            {sugerenciasBreak.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>Sugerencias según turno</Text>
                <View style={styles.sugerenciasWrap}>
                  {sugerenciasBreak.map((sug) => {
                    const isCur = progHora === sug.hora;
                    return (
                      <TouchableOpacity
                        key={sug.hora}
                        onPress={() => {
                          setProgHora(sug.hora);
                          setProgError("");
                        }}
                        style={[
                          styles.sugPill,
                          isCur && styles.sugPillActive,
                        ]}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={12}
                          color={isCur ? "#FFFFFF" : "#0284C7"}
                          style={{ marginRight: 3 }}
                        />
                        <Text style={[styles.sugPillText, isCur && styles.sugPillTextActive]}>
                          {sug.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Input de Horario manual */}
            <Text style={styles.inputLabel}>Horario del Break (HH:mm)</Text>
            <TextInput
              style={styles.inputModal}
              placeholder="Ej. 20:00"
              placeholderTextColor={COLORS.muted}
              value={progHora}
              onChangeText={(txt) => {
                setProgHora(txt);
                setProgError("");
              }}
              keyboardType="numbers-and-punctuation"
            />

            <View style={styles.modalFooterRow}>
              {programarEmp?.breakProgramado && (
                <TouchableOpacity
                  onPress={() => handleGuardarProgramarBreak(null)}
                  style={styles.btnEliminarModal}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="clock-remove-outline" size={15} color="#DC2626" style={{ marginRight: 4 }} />
                  <Text style={styles.btnEliminarModalText}>Quitar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => handleGuardarProgramarBreak(progHora)}
                style={[styles.btnGuardarModal, { backgroundColor: "#0284C7" }]}
                activeOpacity={0.8}
              >
                <Text style={styles.btnGuardarModalText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setProgramarEmp(null)}
                style={styles.btnCerrarModal}
              >
                <Text style={styles.btnCerrarModalText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL MODIFICAR EMPLEADO (CATEGORÍA Y HORARIOS) ── */}
      <Modal visible={!!editingEmp} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 460 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="account-edit-outline" size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.modalTitle}>Modificar Empleado</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingEmp(null)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.editEmpNombre}>{editingEmp?.nombre}</Text>
            <Text style={styles.editEmpSub}>
              Corrige la categoría asignada o ajusta el horario de entrada y salida por si hubo algún error.
            </Text>

            {editError.length > 0 && <Text style={styles.errorText}>{editError}</Text>}

            {/* Selector de Categoría enriquecido */}
            <Text style={styles.inputLabel}>Categoría</Text>
            <View style={styles.catGrid}>
              {(Object.keys(POZI_CATEGORIAS) as PoziCategoriaCodigo[]).map((cKey) => {
                const meta = POZI_CATEGORIAS[cKey];
                const isSel = editCat === cKey;
                return (
                  <TouchableOpacity
                    key={cKey}
                    onPress={() => setEditCat(cKey)}
                    style={[
                      styles.catCard,
                      { borderColor: isSel ? meta.color : COLORS.border },
                      isSel && { backgroundColor: meta.bg, borderWidth: 1.5 },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.catCardBadge,
                        { backgroundColor: isSel ? meta.color : meta.bg, borderColor: meta.border },
                      ]}
                    >
                      <Text style={[styles.catCardBadgeText, { color: isSel ? "#FFFFFF" : meta.color }]}>
                        {meta.codigo}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catCardNombre, isSel && { color: meta.color, fontWeight: "700" }]}>
                        {meta.nombre}
                      </Text>
                      <Text style={styles.catCardDesc} numberOfLines={1}>
                        {meta.desc}
                      </Text>
                    </View>
                    {isSel && (
                      <MaterialCommunityIcons name="check-circle" size={16} color={meta.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inputs de Horarios */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Hora Entrada</Text>
                <TextInput
                  style={styles.inputModal}
                  placeholder="14:00"
                  value={editEntra}
                  onChangeText={setEditEntra}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Hora Salida</Text>
                <TextInput
                  style={styles.inputModal}
                  placeholder="22:00"
                  value={editSale}
                  onChangeText={setEditSale}
                />
              </View>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                onPress={() => handleEliminarEmpleado(editingEmp!.id, editingEmp!.nombre)}
                style={styles.btnEliminarModal}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={15} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={styles.btnEliminarModalText}>Eliminar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleGuardarEdicion} style={styles.btnGuardarModal}>
                <Text style={styles.btnGuardarModalText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingEmp(null)} style={styles.btnCerrarModal}>
                <Text style={styles.btnCerrarModalText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL AGREGAR EMPLEADO MANUAL ── */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Empleado</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            {nuevoError.length > 0 && <Text style={styles.errorText}>{nuevoError}</Text>}

            <Text style={styles.inputLabel}>Nombre y Apellido *</Text>
            <TextInput
              style={styles.inputModal}
              placeholder="Ej. Juan Pérez"
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
            />

            <Text style={styles.inputLabel}>Categoría</Text>
            <View style={styles.catGrid}>
              {(Object.keys(POZI_CATEGORIAS) as PoziCategoriaCodigo[]).map((cKey) => {
                const meta = POZI_CATEGORIAS[cKey];
                const isSel = nuevaCat === cKey;
                return (
                  <TouchableOpacity
                    key={cKey}
                    onPress={() => setNuevaCat(cKey)}
                    style={[
                      styles.catCard,
                      { borderColor: isSel ? meta.color : COLORS.border },
                      isSel && { backgroundColor: meta.bg, borderWidth: 1.5 },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.catCardBadge,
                        { backgroundColor: isSel ? meta.color : meta.bg, borderColor: meta.border },
                      ]}
                    >
                      <Text style={[styles.catCardBadgeText, { color: isSel ? "#FFFFFF" : meta.color }]}>
                        {meta.codigo}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catCardNombre, isSel && { color: meta.color, fontWeight: "700" }]}>
                        {meta.nombre}
                      </Text>
                      <Text style={styles.catCardDesc} numberOfLines={1}>
                        {meta.desc}
                      </Text>
                    </View>
                    {isSel && (
                      <MaterialCommunityIcons name="check-circle" size={16} color={meta.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Hora Entrada</Text>
                <TextInput
                  style={styles.inputModal}
                  placeholder="14:00"
                  value={nuevoEntra}
                  onChangeText={setNuevoEntra}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Hora Salida</Text>
                <TextInput
                  style={styles.inputModal}
                  placeholder="22:00"
                  value={nuevoSale}
                  onChangeText={setNuevoSale}
                />
              </View>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity onPress={handleGuardarNuevoEmpleado} style={styles.btnGuardarModal}>
                <Text style={styles.btnGuardarModalText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.btnCerrarModal}>
                <Text style={styles.btnCerrarModalText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 10,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 60,
  },
  // TopBar
  topBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  titleArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titleIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 11,
    color: COLORS.muted,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 1,
  },
  dateNavBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  dateCenterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  btnGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  btnUpload: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  btnUploadText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  btnAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  btnActionMobile: {
    paddingHorizontal: 7,
    paddingVertical: 6,
    justifyContent: "center",
  },
  btnActionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },

  // Selector de días de la semana de cine (Jueves a Miércoles)
  weekSelectorCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    marginBottom: 8,
  },
  weekHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  weekHeaderTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  weekHeaderSub: {
    fontSize: 10,
    color: COLORS.muted,
  },
  weekTabsRow: {
    flexDirection: "row",
    gap: 4,
  },
  dayTabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: "relative",
  },
  dayTabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayTabBtnToday: {
    borderColor: COLORS.primary,
  },
  dayTabDayText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  dayTabDayTextActive: {
    color: "#FFFFFF",
  },
  dayTabDayTextToday: {
    color: COLORS.primary,
  },
  dayTabDateText: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 1,
  },
  dayTabDateTextActive: {
    color: "rgba(255, 255, 255, 0.85)",
  },
  dayTodayIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.primary,
  },
  dayTodayIndicatorActive: {
    backgroundColor: "#FFFFFF",
  },

  // KPI Bar lineal
  kpiBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 10,
  },
  kpiItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  kpiVal: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
  },
  kpiTag: {
    fontSize: 11,
    color: COLORS.muted,
  },
  kpiDivider: {
    width: 1,
    height: 12,
    backgroundColor: COLORS.border,
  },
  // Botón interactivo de Próximos en KPI bar
  kpiProximosBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderWidth: 1.5,
    borderColor: "#BAE6FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    cursor: "pointer" as any,
  },
  kpiProximosBtnActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0369A1",
  },
  kpiProximosLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
  },
  kpiProximosLabelActive: {
    color: "#FFFFFF",
  },
  kpiProximosBadge: {
    backgroundColor: "#BAE6FD",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 5,
    marginRight: 2,
  },
  kpiProximosBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  kpiProximosBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0369A1",
  },
  kpiProximosBadgeTextActive: {
    color: "#FFFFFF",
  },

  // Botón destacado de Próximos en FilterBar
  btnProximos: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderWidth: 1.5,
    borderColor: "#BAE6FD",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: THEME.radius.sm,
    cursor: "pointer" as any,
  },
  btnProximosActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0369A1",
  },
  btnProximosText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0284C7",
  },
  btnProximosTextActive: {
    color: "#FFFFFF",
  },
  btnProximosBadge: {
    backgroundColor: "#BAE6FD",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 6,
  },
  btnProximosBadgeActive: {
    backgroundColor: "#0369A1",
  },
  btnProximosBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0369A1",
  },
  btnProximosBadgeTextActive: {
    color: "#FFFFFF",
  },

  // Banner informativo del filtro activo de Próximos
  proximosActiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  proximosActiveBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  proximosActiveBannerText: {
    fontSize: 12,
    color: "#0369A1",
  },
  btnQuitarFiltroProximos: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    cursor: "pointer" as any,
  },
  btnQuitarFiltroProximosText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0284C7",
  },

  // FilterBar moderna
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    marginBottom: 8,
    gap: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 170,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  filterScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: COLORS.bg,
  },
  filterPillActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  filterPillTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  filterPillBadge: {
    fontSize: 10,
    color: COLORS.muted,
    marginLeft: 3,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  filterVDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.border,
    marginHorizontal: 2,
  },

  // Tabla Card
  tableCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    width: "100%",
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  thText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  cell: {
    paddingRight: 6,
  },

  // Fila Wide (PC / Tablet)
  rowWide: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  rowProgramado: {
    backgroundColor: "#F8FAFC",
  },
  rowEnBreak: {
    backgroundColor: "#FFFDF7",
  },
  rowCumplido: {
    backgroundColor: "#FAFCFA",
  },
  rowNombre: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  badgeEiInline: {
    backgroundColor: "#F0FDFA",
    borderColor: "#99F6E4",
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 5,
  },
  badgeEiInlineText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0D9488",
  },
  catBadgeCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    borderWidth: 1,
    alignSelf: "flex-start",
    cursor: "pointer" as any,
  },
  catBadgeCompactText: {
    fontSize: 10,
    fontWeight: "800",
  },
  horarioInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  horarioInlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
  },
  horarioHsMuted: {
    fontSize: 10,
    color: COLORS.muted,
    marginLeft: 3,
  },
  breakPillFina: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  breakPill20: {
    backgroundColor: "#ECFDF5",
  },
  breakPill45: {
    backgroundColor: "#FEF3C7",
  },
  breakPillFinaText: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Break Programado Pills
  progPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    cursor: "pointer" as any,
  },
  progPillFuturo: {
    backgroundColor: "#F0F9FF",
    borderColor: "#BAE6FD",
  },
  progPillEnBreak: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  progPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  btnProgramarVacio: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    cursor: "pointer" as any,
  },
  btnProgramarVacioText: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "600",
  },

  progPillMobile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  progPillMobileText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
  },
  btnProgramarVacioMobile: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  btnProgramarVacioMobileText: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: "600",
  },

  dotPendiente: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
    marginRight: 5,
  },
  estadoPendienteText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  dotProgramado: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0284C7",
    marginRight: 5,
  },
  estadoProgramadoText: {
    fontSize: 11,
    color: "#0284C7",
    fontWeight: "600",
  },
  timerPillProg: {
    backgroundColor: "#E0F2FE",
    borderColor: "#BAE6FD",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  timerPillProgText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0369A1",
  },
  proximoPillInline: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  proximoPillInlineText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0284C7",
  },
  salioInlineWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  salioInlineHoras: {
    fontSize: 11,
    color: COLORS.text,
  },
  timerPillMini: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  timerPillMiniText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#B45309",
  },
  cumplidoPillMini: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  cumplidoPillMiniText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#047857",
  },
  btnBreakLineal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  btnBreakLinealText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  btnFinalizarLineal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0284C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  btnFinalizarLinealText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  btnFinalizarMobile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0284C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  btnFinalizarMobileText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  btnIconAction: {
    padding: 4,
    borderRadius: 4,
  },
  btnIconActionDanger: {
    padding: 4,
    borderRadius: 4,
  },

  // Sugerencias Wrap en Modal
  sugerenciasWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  sugPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    cursor: "pointer" as any,
  },
  sugPillActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  sugPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0284C7",
  },
  sugPillTextActive: {
    color: "#FFFFFF",
  },

  // Fila Mobile (Celular)
  rowMobile: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  mobileRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowNombreMobile: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  horarioInlineBtnMobile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: 6,
  },
  horarioInlineTextMobile: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.text,
    marginRight: 3,
  },
  btnIconActionDangerMobile: {
    padding: 3,
    marginLeft: 4,
  },
  mobileRowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  btnBreakMobile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  btnBreakMobileText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  salioMobileInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  salioMobileText: {
    fontSize: 11,
    color: COLORS.text,
  },
  btnIconActionMobile: {
    padding: 2,
  },

  // Empty / Loading
  centerContainer: {
    padding: 30,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 12,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 3,
  },
  emptyDesc: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 400,
    marginBottom: 12,
  },
  btnResetFilter: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.radius.sm,
  },
  btnResetFilterText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "600",
  },

  // Modales
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalDesc: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 8,
  },
  editEmpNombre: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 2,
  },
  editEmpSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 10,
  },
  catGrid: {
    gap: 5,
    marginTop: 4,
    marginBottom: 6,
  },
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 8,
    cursor: "pointer" as any,
  },
  catCardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 32,
    alignItems: "center",
  },
  catCardBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  catCardNombre: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  catCardDesc: {
    fontSize: 10,
    color: COLORS.muted,
  },
  modalFooterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  btnGuardarModal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: THEME.radius.sm,
  },
  btnGuardarModalText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  btnCerrarModal: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: THEME.radius.sm,
  },
  btnCerrarModalText: {
    color: COLORS.text,
    fontSize: 12,
  },
  btnEliminarModal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: THEME.radius.sm,
    marginRight: "auto",
  },
  btnEliminarModalText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 2,
    marginTop: 5,
  },
  inputModal: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    marginBottom: 5,
  },
});

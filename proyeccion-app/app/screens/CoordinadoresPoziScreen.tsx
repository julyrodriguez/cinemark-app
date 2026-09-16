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

import { doc, onSnapshot, setDoc } from "@/lib/dbService";
import { CINES_COLLECTION, db } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { useAppLayout } from "../../lib/useAppLayout";
import {
  calculateBreakDuration,
  calculateWorkHours,
  normalizeExcelTime,
  parsePoziExcel,
  POZI_CATEGORIAS,
  PoziCategoriaCodigo,
  PoziEmployee,
  PoziParsedResult,
} from "../../lib/pozi/poziParser";

export default function CoordinadoresPoziScreen() {
  const { cineId, displayName, user } = useAuthUser();
  const { isMobile, isDesktop, isLargeDesktop } = useAppLayout();

  // Fecha seleccionada (YYYY-MM-DD)
  const [fecha, setFecha] = useState<string>(() => dayjs().format("YYYY-MM-DD"));

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
  const [filtroEstado, setFiltroEstado] = useState<"TODOS" | "PENDIENTE" | "EN_BREAK" | "CUMPLIDO">("TODOS");
  const [soloProximosIngresos, setSoloProximosIngresos] = useState<boolean>(false);

  // Modal de vista previa / datos para prompt
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [parsedDebugInfo, setParsedDebugInfo] = useState<PoziParsedResult | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

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
            setEmpleados(data.empleados);
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

  // ── Cargar Excel de POZI ────────────────────────────────────────────────
  const handlePickExcel = async () => {
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

      let buffer: ArrayBuffer;
      const maybeFile = (asset as any).file as File | undefined;
      if (maybeFile && typeof maybeFile.arrayBuffer === "function") {
        buffer = await maybeFile.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        buffer = await response.arrayBuffer();
      }

      const parsed = parsePoziExcel(buffer, asset.name || "POZI.xlsx");
      setParsedDebugInfo(parsed);

      if (parsed.empleados.length === 0) {
        Alert.alert(
          "Sin empleados válidos",
          "No se encontraron empleados con categorías válidas (OV, OS, OT, OC, EI). Recuerda que filas sin categoría se descartan automáticamente."
        );
        return;
      }

      // Si ya existían empleados: conservar salidas a break ya registradas
      const mapaExistentes = new Map<string, PoziEmployee>();
      empleados.forEach((e) => {
        const key = e.nombre.trim().toLowerCase();
        mapaExistentes.set(key, e);
      });

      const empleadosFinales = parsed.empleados.map((nuevo) => {
        const key = nuevo.nombre.trim().toLowerCase();
        const existente = mapaExistentes.get(key);
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
            notas: existente.notas,
          };
        }
        return nuevo;
      });

      await persistirEmpleados(empleadosFinales, asset.name || "POZI.xlsx");

      Alert.alert(
        "POZI Cargado con éxito",
        `Se procesaron ${parsed.empleados.length} empleados con categorías válidas para la fecha ${dayjs(
          fecha
        ).format("DD/MM/YYYY")}.`
      );
    } catch (err: any) {
      console.error("Error al procesar archivo Excel:", err);
      Alert.alert("Error de procesamiento", err.message || "No se pudo leer el archivo Excel.");
    }
  };

  // ── Marcar Salida a Break ───────────────────────────────────────────────
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
        { text: "Eliminar / Confirmar", style: "destructive", onPress: onConfirm },
      ]);
    }
  };

  // ── Deshacer Salida a Break ────────────────────────────────────────────
  const handleReiniciarBreak = (empId: string) => {
    confirmAction(
      "Deshacer Salida a Break",
      "¿Deseas restablecer a este empleado a estado Pendiente?",
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

  const handleVaciarDia = () => {
    if (empleados.length === 0) return;
    confirmAction(
      "Vaciar POZI del Día",
      `¿Estás seguro de que deseas eliminar a todos los ${empleados.length} empleados cargados para la fecha ${dayjs(fecha).format("DD/MM/YYYY")}?`,
      () => {
        persistirEmpleados([], "");
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

  // ── Clasificación de Empleados en Vivo ──────────────────────────────────
  const infoEmpleados = useMemo(() => {
    return empleados.map((emp) => {
      const salio = emp.estadoBreak !== "PENDIENTE" && !!emp.breakInicio;

      const horaRegreso =
        emp.breakRegreso ||
        (emp.breakInicio && emp.breakIniciadoAt
          ? dayjs(emp.breakIniciadoAt).add(emp.duracionBreak, "minute").format("HH:mm")
          : null);

      let minutosRestantes = 0;
      let cumplido = false;

      if (salio && emp.breakIniciadoAt) {
        const msFinEsperado = emp.breakIniciadoAt + emp.duracionBreak * 60 * 1000;
        const diffMs = msFinEsperado - nowTick;
        minutosRestantes = Math.round(diffMs / (60 * 1000));
        cumplido = minutosRestantes <= 0;
      }

      // Verificación si es próximo ingreso (entra en o después de la hora actual)
      const entraLimpio = emp.entra || "";
      const esProximoIngreso = entraLimpio >= horaActualStr;

      return {
        ...emp,
        salio,
        horaRegreso,
        minutosRestantes,
        cumplido,
        esProximoIngreso,
      };
    });
  }, [empleados, nowTick, horaActualStr]);

  // Conteo de Próximos a Ingresar
  const totalProximosIngresos = useMemo(() => {
    return infoEmpleados.filter((e) => e.esProximoIngreso).length;
  }, [infoEmpleados]);

  // KPIs
  const kpis = useMemo(() => {
    const total = infoEmpleados.length;
    const pendientes = infoEmpleados.filter((e) => !e.salio).length;
    const enBreakActivos = infoEmpleados.filter((e) => e.salio && !e.cumplido).length;
    const horarioCumplido = infoEmpleados.filter((e) => e.salio && e.cumplido).length;
    return { total, pendientes, enBreakActivos, horarioCumplido };
  }, [infoEmpleados]);

  // ── Empleados Filtrados y Ordenados ────────────────────────────────────
  const empleadosFiltrados = useMemo(() => {
    const filtrados = infoEmpleados.filter((e) => {
      // Filtro texto
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase().trim();
        const coincideNombre = e.nombre.toLowerCase().includes(q);
        const coincideCat = String(e.categoria || "").toLowerCase().includes(q);
        if (!coincideNombre && !coincideCat) return false;
      }

      // Filtro categoría (OV, OS, OT, OC, EI)
      if (filtroCategoria !== "TODAS" && e.categoria !== filtroCategoria) {
        return false;
      }

      // Filtro estado
      if (filtroEstado === "PENDIENTE" && e.salio) return false;
      if (filtroEstado === "EN_BREAK" && (!e.salio || e.cumplido)) return false;
      if (filtroEstado === "CUMPLIDO" && (!e.salio || !e.cumplido)) return false;

      // Filtro Próximos Ingresos
      if (soloProximosIngresos && !e.esProximoIngreso) {
        return false;
      }

      return true;
    });

    // Ordenar cronológicamente por horario de entrada (Entra asc)
    return filtrados.sort((a, b) => (a.entra || "").localeCompare(b.entra || ""));
  }, [infoEmpleados, filtroTexto, filtroCategoria, filtroEstado, soloProximosIngresos]);

  // ── Copiar resumen para promptear ──────────────────────────────────────
  const handleCopiarPrompt = () => {
    const textoACopiar = parsedDebugInfo?.rawSummaryText || JSON.stringify(empleados.slice(0, 10), null, 2);
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textoACopiar);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
    } else {
      Alert.alert("Datos del POZI", textoACopiar);
    }
  };

  const useGrid = !isMobile && (isDesktop || isLargeDesktop);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { maxWidth: isMobile ? "100%" : 1600 }]}>
      {/* ── ENCABEZADO ── */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleRow}>
          <View style={[styles.iconCircle, isMobile && styles.iconCircleMobile]}>
            <MaterialCommunityIcons name="account-clock-outline" size={isMobile ? 22 : 28} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, isMobile && styles.titleMobile]}>Control de POZI & Breaks</Text>
            <Text style={styles.subtitle}>
              Horarios, próximas entradas ({horaActualStr}) y descansos automáticos
            </Text>
          </View>
        </View>

        {/* Barra de Acciones y Fecha */}
        <View style={styles.actionsBar}>
          {/* Navegador de Fecha */}
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={() => cambiarDia(-1)} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-left" size={18} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFecha(dayjs().format("YYYY-MM-DD"))} style={styles.dateCenterBtn}>
              <MaterialCommunityIcons name="calendar" size={15} color={COLORS.primary} style={{ marginRight: 5 }} />
              <Text style={styles.dateText}>
                {dayjs(fecha).format("DD/MM/YYYY")}
                {fecha === dayjs().format("YYYY-MM-DD") ? " (Hoy)" : ""}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => cambiarDia(1)} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Botones de acción */}
          <View style={styles.rightButtonsRow}>
            <TouchableOpacity onPress={handlePickExcel} style={styles.btnCargarExcel} activeOpacity={0.8}>
              <MaterialCommunityIcons name="file-excel-box" size={18} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.btnCargarExcelText}>Cargar Excel</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.btnSecondary} activeOpacity={0.8}>
              <MaterialCommunityIcons name="account-plus" size={16} color={COLORS.text} style={{ marginRight: 4 }} />
              <Text style={styles.btnSecondaryText}>Agregar</Text>
            </TouchableOpacity>

            {empleados.length > 0 && (
              <TouchableOpacity onPress={handleVaciarDia} style={styles.btnVaciar} activeOpacity={0.8}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={styles.btnVaciarText}>Limpiar día</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setDebugModalOpen(true)} style={styles.btnGhost} activeOpacity={0.8}>
              <MaterialCommunityIcons name="code-json" size={16} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.btnGhostText}>Prompt</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info del archivo cargado */}
        {lastExcelName && (
          <View style={styles.fileInfoBanner}>
            <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.success} />
            <Text style={styles.fileInfoText} numberOfLines={1}>
              Planilla: <Text style={{ fontWeight: "700" }}>{lastExcelName}</Text>
              {lastUpdated ? ` • Sincronizado: ${lastUpdated}` : ""}
            </Text>
          </View>
        )}
      </View>

      {/* ── TARJETAS DE MÉTRICAS (KPIS) ── */}
      <View style={styles.kpiContainer}>
        <View style={[styles.kpiCard, { borderLeftColor: COLORS.info }]}>
          <Text style={styles.kpiNumber}>{kpis.total}</Text>
          <Text style={styles.kpiLabel}>Total Personal</Text>
        </View>

        <TouchableOpacity
          onPress={() => setSoloProximosIngresos(!soloProximosIngresos)}
          style={[
            styles.kpiCard,
            { borderLeftColor: "#0284C7" },
            soloProximosIngresos && { backgroundColor: "#E0F2FE", borderColor: "#0284C7" },
          ]}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.kpiNumber, { color: "#0284C7" }]}>{totalProximosIngresos}</Text>
            <MaterialCommunityIcons
              name="clock-fast"
              size={18}
              color="#0284C7"
              style={{ marginLeft: 6 }}
            />
          </View>
          <Text style={styles.kpiLabel}>Próximos Ingresos (≥{horaActualStr})</Text>
        </TouchableOpacity>

        <View style={[styles.kpiCard, { borderLeftColor: COLORS.warning, backgroundColor: kpis.enBreakActivos > 0 ? "#FFFBEB" : COLORS.card }]}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.kpiNumber, { color: COLORS.warning }]}>{kpis.enBreakActivos}</Text>
            {kpis.enBreakActivos > 0 && (
              <MaterialCommunityIcons name="coffee" size={18} color={COLORS.warning} style={{ marginLeft: 6 }} />
            )}
          </View>
          <Text style={styles.kpiLabel}>En Break Ahora</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: COLORS.success }]}>
          <Text style={[styles.kpiNumber, { color: COLORS.success }]}>{kpis.horarioCumplido}</Text>
          <Text style={styles.kpiLabel}>Horario Cumplido</Text>
        </View>
      </View>

      {/* ── BARRA DE FILTROS & BÚSQUEDA ── */}
      <View style={styles.filterSection}>
        {/* Buscador y Toggle de Próximos Ingresos */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 6 }} />
            <TextInput
              placeholder="Buscar por empleado..."
              placeholderTextColor={COLORS.muted}
              value={filtroTexto}
              onChangeText={setFiltroTexto}
              style={styles.searchInput}
            />
            {filtroTexto.length > 0 && (
              <TouchableOpacity onPress={() => setFiltroTexto("")}>
                <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Botón rápido Próximos Ingresos */}
          <TouchableOpacity
            onPress={() => setSoloProximosIngresos(!soloProximosIngresos)}
            style={[styles.btnProximosToggle, soloProximosIngresos && styles.btnProximosToggleActive]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="clock-fast"
              size={16}
              color={soloProximosIngresos ? "#FFFFFF" : "#0284C7"}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.btnProximosToggleText, soloProximosIngresos && styles.btnProximosToggleTextActive]}>
              {soloProximosIngresos ? "Mostrando Próximos" : "Próximos Ingresos"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filtros de Categorías Oficiales (OV, OS, OT, OC, EI) */}
        <View style={styles.chipsRow}>
          <Text style={styles.filterLabel}>Categoría:</Text>
          <TouchableOpacity
            onPress={() => setFiltroCategoria("TODAS")}
            style={[styles.chip, filtroCategoria === "TODAS" && styles.chipActive]}
          >
            <Text style={[styles.chipText, filtroCategoria === "TODAS" && styles.chipTextActive]}>
              Todas ({infoEmpleados.length})
            </Text>
          </TouchableOpacity>

          {(Object.keys(POZI_CATEGORIAS) as PoziCategoriaCodigo[]).map((catKey) => {
            const meta = POZI_CATEGORIAS[catKey];
            const isSelected = filtroCategoria === catKey;
            const cantidad = infoEmpleados.filter((e) => e.categoria === catKey).length;
            return (
              <TouchableOpacity
                key={catKey}
                onPress={() => setFiltroCategoria(catKey)}
                style={[
                  styles.chip,
                  { borderColor: meta.border },
                  isSelected && { backgroundColor: meta.bg, borderColor: meta.color },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: meta.color },
                    isSelected && { fontWeight: "700" },
                  ]}
                >
                  {meta.codigo} - {meta.nombre} ({cantidad})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Filtros de Estado */}
        <View style={styles.chipsRow}>
          <Text style={styles.filterLabel}>Estado:</Text>
          {(["TODOS", "PENDIENTE", "EN_BREAK", "CUMPLIDO"] as const).map((st) => {
            const isSelected = filtroEstado === st;
            const labels: Record<string, string> = {
              TODOS: `Todos (${kpis.total})`,
              PENDIENTE: `Pendientes (${kpis.pendientes})`,
              EN_BREAK: `En Break (${kpis.enBreakActivos})`,
              CUMPLIDO: `Cumplidos (${kpis.horarioCumplido})`,
            };
            return (
              <TouchableOpacity
                key={st}
                onPress={() => setFiltroEstado(st)}
                style={[styles.chip, isSelected && styles.chipActive]}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {labels[st]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── LISTADO DE EMPLEADOS (COMPACTO EN CELULAR / GRID EN PC) ── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando datos del POZI...</Text>
        </View>
      ) : empleados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-excel-outline" size={48} color={COLORS.muted} style={{ marginBottom: 10 }} />
          <Text style={styles.emptyTitle}>No hay POZI cargado para esta fecha</Text>
          <Text style={styles.emptyDesc}>
            Haz clic en "Cargar Excel" para subir el archivo. Filas sin categorías válidas (OV, OS, OT, OC, EI)
            se ignoran automáticamente.
          </Text>
          <TouchableOpacity onPress={handlePickExcel} style={styles.btnCargarExcel} activeOpacity={0.8}>
            <MaterialCommunityIcons name="upload" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.btnCargarExcelText}>Seleccionar archivo Excel</Text>
          </TouchableOpacity>
        </View>
      ) : empleadosFiltrados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="filter-remove-outline" size={36} color={COLORS.muted} style={{ marginBottom: 6 }} />
          <Text style={styles.emptyTitle}>No se encontraron empleados con los filtros actuales</Text>
          <TouchableOpacity
            onPress={() => {
              setFiltroTexto("");
              setFiltroCategoria("TODAS");
              setFiltroEstado("TODOS");
              setSoloProximosIngresos(false);
            }}
            style={styles.btnResetFilter}
          >
            <Text style={styles.btnResetFilterText}>Restablecer filtros</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={useGrid ? styles.gridContainer : styles.listContainer}>
          {empleadosFiltrados.map((emp) => {
            const isSalio = emp.salio;
            const isCumplido = emp.cumplido;
            const catMeta = POZI_CATEGORIAS[emp.categoria as PoziCategoriaCodigo] || {
              codigo: emp.categoria,
              nombre: emp.categoria,
              color: "#475569",
              bg: "#F1F5F9",
              border: "#CBD5E1",
            };

            return (
              <View
                key={emp.id}
                style={[
                  styles.cardEmpleado,
                  useGrid && styles.cardEmpleadoGrid,
                  isSalio && !isCumplido && styles.cardEmpleadoEnBreak,
                  isSalio && isCumplido && styles.cardEmpleadoCumplido,
                  isMobile && styles.cardEmpleadoMobile,
                ]}
              >
                {/* Cabecera del Empleado: Nombre, Cat, Horarios */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.nombreCatWrap}>
                    <Text style={[styles.empleadoNombre, isMobile && styles.empleadoNombreMobile]} numberOfLines={1}>
                      {emp.nombre}
                    </Text>
                    {/* Badge Categoría */}
                    <View style={[styles.catBadge, { backgroundColor: catMeta.bg, borderColor: catMeta.border }]}>
                      <Text style={[styles.catBadgeText, { color: catMeta.color }]}>{catMeta.codigo}</Text>
                    </View>
                    {emp.notas?.includes("EI") && (
                      <View style={[styles.catBadge, { backgroundColor: "#F0FDFA", borderColor: "#99F6E4" }]}>
                        <Text style={[styles.catBadgeText, { color: "#0D9488" }]}>EI</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {/* Horario de Entrada/Salida con botón para editar */}
                    <TouchableOpacity
                      onPress={() => handleAbrirEdicion(emp)}
                      style={styles.horarioEditablePill}
                      activeOpacity={0.7}
                      accessibilityLabel="Editar horarios de ingreso"
                    >
                      <MaterialCommunityIcons name="clock-outline" size={13} color={COLORS.muted} style={{ marginRight: 4 }} />
                      <Text style={styles.horarioEditableText}>
                        {emp.entra || "--:--"} a {emp.sale || "--:--"}
                      </Text>
                      <MaterialCommunityIcons name="pencil-outline" size={13} color={COLORS.primary} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>

                    {/* Botón Borrar Empleado */}
                    <TouchableOpacity
                      onPress={() => handleEliminarEmpleado(emp.id, emp.nombre)}
                      style={styles.btnTrashHeader}
                      activeOpacity={0.7}
                      accessibilityLabel="Eliminar de la lista"
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sub-fila: Duración de Break y horas trabajadas */}
                <View style={styles.cardSubRow}>
                  <View
                    style={[
                      styles.badgeBreakCompact,
                      emp.duracionBreak === 20 ? styles.badgeBreak20 : styles.badgeBreak40,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={emp.duracionBreak === 20 ? "coffee" : "food-apple"}
                      size={12}
                      color={emp.duracionBreak === 20 ? "#047857" : "#B45309"}
                      style={{ marginRight: 3 }}
                    />
                    <Text
                      style={[
                        styles.badgeBreakCompactText,
                        { color: emp.duracionBreak === 20 ? "#047857" : "#B45309" },
                      ]}
                    >
                      Break: {emp.duracionBreak} min ({emp.horasTrabajadas}h)
                    </Text>
                  </View>

                  {/* Si es próximo ingreso hoy */}
                  {emp.esProximoIngreso && !isSalio && (
                    <View style={styles.badgeProximo}>
                      <MaterialCommunityIcons name="arrow-up-circle-outline" size={12} color="#0284C7" style={{ marginRight: 3 }} />
                      <Text style={styles.badgeProximoText}>Entra {emp.entra}</Text>
                    </View>
                  )}
                </View>

                {/* Sección de Break / Acción */}
                {!isSalio ? (
                  <View style={styles.breakActionRow}>
                    <TouchableOpacity
                      onPress={() => handleMarcarSalidaBreak(emp.id)}
                      style={[styles.btnMarcarSalidaCompact, isMobile && styles.btnMarcarSalidaCompactMobile]}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="coffee-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.btnMarcarSalidaCompactText}>
                        Se fue a Break ({emp.duracionBreak}m)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleEliminarEmpleado(emp.id)}
                      style={styles.btnMiniGhost}
                      accessibilityLabel="Quitar"
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={COLORS.muted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.salioCompactBox}>
                    <View style={styles.salioDatosRow}>
                      <View style={styles.salioItemCompact}>
                        <Text style={styles.salioItemLabel}>SALIÓ</Text>
                        <Text style={styles.salioItemVal}>{emp.breakInicio || "--:--"}</Text>
                      </View>

                      <MaterialCommunityIcons name="arrow-right" size={14} color={isCumplido ? "#059669" : "#D97706"} />

                      <View style={styles.salioItemCompact}>
                        <Text style={styles.salioItemLabel}>DEBE VOLVER</Text>
                        <Text style={[styles.salioItemVal, { fontWeight: "800", color: isCumplido ? "#047857" : "#B45309" }]}>
                          {emp.horaRegreso || "--:--"}
                        </Text>
                      </View>

                      {/* Pill de estado */}
                      <View style={{ marginLeft: "auto" }}>
                        {!isCumplido ? (
                          <View style={styles.countdownPillCompact}>
                            <Text style={styles.countdownPillCompactText}>
                              Faltan {emp.minutosRestantes}m
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.cumplidoPillCompact}>
                            <Text style={styles.cumplidoPillCompactText}>
                              {emp.minutosRestantes < -2 ? `+${Math.abs(emp.minutosRestantes)}m pasado` : "Cumplido"}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Botón deshacer */}
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnMiniGhost}
                        accessibilityLabel="Deshacer salida"
                      >
                        <MaterialCommunityIcons name="restart" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── MODAL MODIFICAR INGRESO / HORARIOS ── */}
      <Modal visible={!!editingEmp} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.editModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="pencil" size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.modalTitle}>Modificar Horario e Ingreso</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingEmp(null)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.editEmpNombre}>{editingEmp?.nombre}</Text>

            {editError.length > 0 && <Text style={styles.errorText}>{editError}</Text>}

            {/* Selector de Categoría */}
            <Text style={styles.inputLabel}>Categoría</Text>
            <View style={styles.catSelectRow}>
              {(Object.keys(POZI_CATEGORIAS) as PoziCategoriaCodigo[]).map((cKey) => {
                const meta = POZI_CATEGORIAS[cKey];
                const isSel = editCat === cKey;
                return (
                  <TouchableOpacity
                    key={cKey}
                    onPress={() => setEditCat(cKey)}
                    style={[
                      styles.catSelectBtn,
                      { borderColor: meta.border },
                      isSel && { backgroundColor: meta.bg, borderColor: meta.color },
                    ]}
                  >
                    <Text style={[styles.catSelectBtnText, { color: isSel ? meta.color : COLORS.muted }]}>
                      {meta.codigo}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inputs de Horarios */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
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
                onPress={() => handleEliminarEmpleado(editingEmp.id, editingEmp.nombre)}
                style={styles.btnEliminarModal}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={styles.btnEliminarModalText}>Eliminar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleGuardarEdicion} style={styles.btnCargarExcel}>
                <Text style={styles.btnCargarExcelText}>Guardar</Text>
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
          <View style={styles.addModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Empleado Manual</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.muted} />
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
            <View style={styles.catSelectRow}>
              {(Object.keys(POZI_CATEGORIAS) as PoziCategoriaCodigo[]).map((cKey) => {
                const meta = POZI_CATEGORIAS[cKey];
                const isSel = nuevaCat === cKey;
                return (
                  <TouchableOpacity
                    key={cKey}
                    onPress={() => setNuevaCat(cKey)}
                    style={[
                      styles.catSelectBtn,
                      { borderColor: meta.border },
                      isSel && { backgroundColor: meta.bg, borderColor: meta.color },
                    ]}
                  >
                    <Text style={[styles.catSelectBtnText, { color: isSel ? meta.color : COLORS.muted }]}>
                      {meta.codigo}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
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
              <TouchableOpacity onPress={handleGuardarNuevoEmpleado} style={styles.btnCargarExcel}>
                <Text style={styles.btnCargarExcelText}>Guardar Empleado</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.btnCerrarModal}>
                <Text style={styles.btnCerrarModalText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL VER ESTRUCTURA / PROMPT ── */}
      <Modal visible={debugModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.debugModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="file-code-outline" size={22} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Estructura detectada del Excel</Text>
              </View>
              <TouchableOpacity onPress={() => setDebugModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Se ignoraron filas sin categorías OV, OS, OT, OC o EI. Puedes copiar estos datos para compartirlo.
            </Text>

            {copiedNotification && (
              <View style={styles.copiedBanner}>
                <MaterialCommunityIcons name="check-bold" size={16} color="#047857" style={{ marginRight: 6 }} />
                <Text style={styles.copiedBannerText}>¡Texto copiado al portapapeles!</Text>
              </View>
            )}

            <ScrollView style={styles.debugScrollArea}>
              <Text style={styles.codeText}>
                {parsedDebugInfo?.rawSummaryText ||
                  JSON.stringify(
                    {
                      fechaActual: fecha,
                      totalEmpleadosCargados: empleados.length,
                      muestra: empleados.slice(0, 5),
                    },
                    null,
                    2
                  )}
              </Text>
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity onPress={handleCopiarPrompt} style={styles.btnCopiaPrompt}>
                <MaterialCommunityIcons name="content-copy" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.btnCopiaPromptText}>Copiar al portapapeles</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDebugModalOpen(false)} style={styles.btnCerrarModal}>
                <Text style={styles.btnCerrarModalText}>Cerrar</Text>
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
    padding: 12,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 70,
  },
  header: {
    marginBottom: 10,
  },
  headerMobile: {
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleMobile: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.text,
  },
  titleMobile: {
    fontSize: 18,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 1,
  },
  actionsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
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
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dateCenterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dateText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  rightButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  btnCargarExcel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
  },
  btnCargarExcelText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: THEME.radius.sm,
  },
  btnSecondaryText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: THEME.radius.sm,
  },
  btnGhostText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  btnVaciar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: THEME.radius.sm,
  },
  btnVaciarText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
  },
  btnTrashHeader: {
    padding: 4,
    borderRadius: 4,
  },
  btnEliminarModal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
    marginRight: "auto",
  },
  btnEliminarModalText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
  },
  fileInfoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    marginTop: 6,
    gap: 5,
  },
  fileInfoText: {
    fontSize: 11,
    color: "#166534",
    flex: 1,
  },
  // KPIs
  kpiContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3.5,
  },
  kpiNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
  },
  kpiLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
    fontWeight: "500",
  },
  // Filtros
  filterSection: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    gap: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  searchBar: {
    flex: 1,
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  btnProximosToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  btnProximosToggleActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  btnProximosToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284C7",
  },
  btnProximosToggleTextActive: {
    color: "#FFFFFF",
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.muted,
    marginRight: 2,
  },
  chip: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.full,
  },
  chipActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  // Listas y Grids
  listContainer: {
    gap: 8,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cardEmpleado: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: "100%",
  },
  cardEmpleadoGrid: {
    width: "49.2%",
  },
  cardEmpleadoMobile: {
    padding: 8,
  },
  cardEmpleadoEnBreak: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFDF7",
    borderWidth: 1.5,
  },
  cardEmpleadoCumplido: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F9FCFA",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  nombreCatWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  empleadoNombre: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  empleadoNombreMobile: {
    fontSize: 13,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  horarioEditablePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  horarioEditableText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
  },
  cardSubRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  badgeBreakCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeBreak20: {
    backgroundColor: "#ECFDF5",
  },
  badgeBreak40: {
    backgroundColor: "#FEF3C7",
  },
  badgeBreakCompactText: {
    fontSize: 11,
    fontWeight: "600",
  },
  badgeProximo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  badgeProximoText: {
    fontSize: 10,
    color: "#0284C7",
    fontWeight: "600",
  },
  // Acciones compactas
  breakActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  btnMarcarSalidaCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.sm,
  },
  btnMarcarSalidaCompactMobile: {
    paddingVertical: 6,
  },
  btnMarcarSalidaCompactText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  salioCompactBox: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: THEME.radius.sm,
    padding: 6,
    marginTop: 6,
  },
  salioDatosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  salioItemCompact: {
    alignItems: "flex-start",
  },
  salioItemLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: "700",
  },
  salioItemVal: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  countdownPillCompact: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: THEME.radius.full,
  },
  countdownPillCompactText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B45309",
  },
  cumplidoPillCompact: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: THEME.radius.full,
  },
  cumplidoPillCompactText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#047857",
  },
  btnMiniGhost: {
    padding: 5,
  },
  centerContainer: {
    padding: 30,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 12,
  },
  emptyContainer: {
    padding: 30,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 460,
    marginBottom: 14,
    lineHeight: 18,
  },
  btnResetFilter: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  btnResetFilterText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  // Modales
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  editModalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 16,
  },
  addModalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 16,
  },
  debugModalCard: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "85%",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalDesc: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 10,
  },
  editEmpNombre: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 8,
  },
  catSelectRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  catSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    backgroundColor: COLORS.bg,
  },
  catSelectBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  debugScrollArea: {
    backgroundColor: "#0F172A",
    borderRadius: THEME.radius.sm,
    padding: 10,
    maxHeight: 320,
    marginBottom: 12,
  },
  codeText: {
    color: "#38BDF8",
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
    fontSize: 11,
    lineHeight: 16,
  },
  modalFooterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  btnCopiaPrompt: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
  },
  btnCopiaPromptText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  btnCerrarModal: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
  },
  btnCerrarModalText: {
    color: COLORS.text,
    fontSize: 12,
  },
  copiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    padding: 6,
    borderRadius: THEME.radius.sm,
    marginBottom: 8,
  },
  copiedBannerText: {
    fontSize: 11,
    color: "#047857",
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 3,
    marginTop: 6,
  },
  inputModal: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    marginBottom: 6,
  },
});

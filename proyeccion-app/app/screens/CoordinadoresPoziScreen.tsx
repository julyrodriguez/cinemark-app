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
} from "../../lib/pozi/poziParser";

export default function CoordinadoresPoziScreen() {
  const { cineId, displayName, user } = useAuthUser();
  const { isMobile, isDesktop, isTablet, width } = useAppLayout();

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

      if (parsed.empleados.length === 0) {
        Alert.alert(
          "Sin empleados válidos",
          "No se encontraron empleados con categorías válidas (OV, OS, OT, OC, EI). Recuerda que filas sin categoría se descartan automáticamente."
        );
        return;
      }

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
        `Se procesaron ${parsed.empleados.length} empleados para la fecha ${dayjs(fecha).format(
          "DD/MM/YYYY"
        )}.`
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
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase().trim();
        const coincideNombre = e.nombre.toLowerCase().includes(q);
        const coincideCat = String(e.categoria || "").toLowerCase().includes(q);
        if (!coincideNombre && !coincideCat) return false;
      }

      if (filtroCategoria !== "TODAS" && e.categoria !== filtroCategoria) {
        return false;
      }

      if (filtroEstado === "PENDIENTE" && e.salio) return false;
      if (filtroEstado === "EN_BREAK" && (!e.salio || e.cumplido)) return false;
      if (filtroEstado === "CUMPLIDO" && (!e.salio || !e.cumplido)) return false;

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
            {(["TODOS", "PENDIENTE", "EN_BREAK", "CUMPLIDO"] as const).map((st) => {
              const isSel = filtroEstado === st;
              const labels: Record<string, string> = {
                TODOS: "Todos",
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
              <Text style={[styles.thText, { flex: 2.5 }]}>EMPLEADO</Text>
              <Text style={[styles.thText, { width: 70 }]}>CAT</Text>
              <Text style={[styles.thText, { flex: 1.5 }]}>TURNO</Text>
              <Text style={[styles.thText, { width: 105 }]}>BREAK</Text>
              <Text style={[styles.thText, { flex: 2.5 }]}>ESTADO / REGRESO</Text>
              <Text style={[styles.thText, { width: 120, textAlign: "right" }]}>ACCIONES</Text>
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
                    isSalio && !isCumplido && styles.rowEnBreak,
                    isSalio && isCumplido && styles.rowCumplido,
                  ]}
                >
                  {/* Columna Empleado */}
                  <View style={[styles.cell, { flex: 2.5, flexDirection: "row", alignItems: "center" }]}>
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
                  <View style={[styles.cell, { width: 78 }]}>
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
                  <View style={[styles.cell, { flex: 1.5, flexDirection: "row", alignItems: "center" }]}>
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

                  {/* Columna Break Asignado */}
                  <View style={[styles.cell, { width: 105 }]}>
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
                        {emp.duracionBreak} min
                      </Text>
                    </View>
                  </View>

                  {/* Columna Estado / Regreso */}
                  <View style={[styles.cell, { flex: 2.5 }]}>
                    {!isSalio ? (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={styles.dotPendiente} />
                        <Text style={styles.estadoPendienteText}>Pendiente</Text>
                        {emp.esProximoIngreso && (
                          <View style={styles.proximoPillInline}>
                            <Text style={styles.proximoPillInlineText}>Entra {emp.entra}</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.salioInlineWrap}>
                        <Text style={styles.salioInlineHoras}>
                          {emp.breakInicio} ➔{" "}
                          <Text style={{ fontWeight: "800", color: isCumplido ? "#047857" : "#B45309" }}>
                            {emp.horaRegreso}
                          </Text>
                        </Text>
                        {!isCumplido ? (
                          <View style={styles.timerPillMini}>
                            <Text style={styles.timerPillMiniText}>Faltan {emp.minutosRestantes}m</Text>
                          </View>
                        ) : (
                          <View style={styles.cumplidoPillMini}>
                            <Text style={styles.cumplidoPillMiniText}>
                              {emp.minutosRestantes < -2 ? `+${Math.abs(emp.minutosRestantes)}m` : "Cumplido"}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Columna Acciones */}
                  <View style={[styles.cell, { width: 120, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 6 }]}>
                    {!isSalio ? (
                      <TouchableOpacity
                        onPress={() => handleMarcarSalidaBreak(emp.id)}
                        style={styles.btnBreakLineal}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="coffee-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.btnBreakLinealText}>Break</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnIconAction}
                        title="Deshacer salida"
                      >
                        <MaterialCommunityIcons name="restart" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
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
                  isSalio && !isCumplido && styles.rowEnBreak,
                  isSalio && isCumplido && styles.rowCumplido,
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

                {/* Renglón 2: Duración Break + Estado / Botón */}
                <View style={styles.mobileRowBottom}>
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
                      {emp.duracionBreak}m ({emp.horasTrabajadas}h)
                    </Text>
                  </View>

                  {!isSalio ? (
                    <TouchableOpacity
                      onPress={() => handleMarcarSalidaBreak(emp.id)}
                      style={styles.btnBreakMobile}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="coffee-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.btnBreakMobileText}>Se fue a Break</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.salioMobileInline}>
                      <Text style={styles.salioMobileText}>
                        {emp.breakInicio} ➔{" "}
                        <Text style={{ fontWeight: "800", color: isCumplido ? "#047857" : "#B45309" }}>
                          {emp.horaRegreso}
                        </Text>
                      </Text>
                      {!isCumplido ? (
                        <View style={styles.timerPillMini}>
                          <Text style={styles.timerPillMiniText}>{emp.minutosRestantes}m</Text>
                        </View>
                      ) : (
                        <View style={styles.cumplidoPillMini}>
                          <Text style={styles.cumplidoPillMiniText}>
                            {emp.minutosRestantes < -2 ? `+${Math.abs(emp.minutosRestantes)}m` : "Cumplido"}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnIconActionMobile}
                      >
                        <MaterialCommunityIcons name="restart" size={14} color={COLORS.muted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

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
  btnIconAction: {
    padding: 4,
    borderRadius: 4,
  },
  btnIconActionDanger: {
    padding: 4,
    borderRadius: 4,
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

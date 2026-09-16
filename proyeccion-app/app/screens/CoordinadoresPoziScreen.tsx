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
import {
  calculateBreakDuration,
  calculateWorkHours,
  normalizeExcelTime,
  parsePoziExcel,
  PoziEmployee,
  PoziParsedResult,
} from "../../lib/pozi/poziParser";

export default function CoordinadoresPoziScreen() {
  const { cineId, displayName, user } = useAuthUser();

  // Fecha seleccionada (YYYY-MM-DD)
  const [fecha, setFecha] = useState<string>(() => dayjs().format("YYYY-MM-DD"));

  // Lista de empleados del día
  const [empleados, setEmpleados] = useState<PoziEmployee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastExcelName, setLastExcelName] = useState<string | null>(null);

  // Tick para refrescar cuentas regresivas en vivo cada 10 segundos
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("TODAS");
  const [filtroEstado, setFiltroEstado] = useState<"TODOS" | "PENDIENTE" | "EN_BREAK" | "CUMPLIDO">("TODOS");

  // Modal de vista previa / datos para prompt
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [parsedDebugInfo, setParsedDebugInfo] = useState<PoziParsedResult | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Modal agregar empleado manual
  const [showAddModal, setShowAddModal] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCat, setNuevaCat] = useState("General");
  const [nuevoEntra, setNuevoEntra] = useState("14:00");
  const [nuevoSale, setNuevoSale] = useState("22:00");
  const [nuevoError, setNuevoError] = useState("");

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
          "Sin datos válidos",
          "No se pudieron encontrar empleados en el archivo. Puedes revisar la estructura del archivo en el visor de datos."
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
        `Se procesaron ${parsed.empleados.length} empleados para la fecha ${dayjs(fecha).format(
          "DD/MM/YYYY"
        )}. Ya puedes marcar las salidas a break.`
      );
    } catch (err: any) {
      console.error("Error al procesar archivo Excel:", err);
      Alert.alert("Error de procesamiento", err.message || "No se pudo leer el archivo Excel.");
    }
  };

  // ── Marcar Salida a Break (No requiere marcar regreso) ───────────────────
  const handleMarcarSalidaBreak = (empId: string) => {
    const ahora = dayjs();
    const ahoraStr = ahora.format("HH:mm");
    const ahoraMs = ahora.valueOf();
    const usuarioActual = displayName || user?.email?.split("@")[0] || "Encargado";

    const nuevaLista = empleados.map((e) => {
      if (e.id === empId) {
        // Se calcula la hora a la que debería regresar según la duración de su break (20 o 40 min)
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

  // ── Deshacer / Reiniciar Salida a Break ─────────────────────────────────
  const handleReiniciarBreak = (empId: string) => {
    Alert.alert(
      "Deshacer Salida a Break",
      "¿Deseas restablecer a este empleado a estado Pendiente?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, restablecer",
          style: "destructive",
          onPress: () => {
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
          },
        },
      ]
    );
  };

  const handleEliminarEmpleado = (empId: string) => {
    Alert.alert("Eliminar Empleado", "¿Deseas quitar a este empleado de la lista?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          const nuevaLista = empleados.filter((e) => e.id !== empId);
          persistirEmpleados(nuevaLista);
        },
      },
    ]);
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
      categoria: nuevaCat.trim() || "General",
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

  // ── Categorías Únicas para Filtro ───────────────────────────────────────
  const categoriasUnicas = useMemo(() => {
    const set = new Set<string>();
    empleados.forEach((e) => {
      if (e.categoria) set.add(e.categoria);
    });
    return Array.from(set).sort();
  }, [empleados]);

  // ── Clasificación y KPIs en vivo ────────────────────────────────────────
  const infoEmpleados = useMemo(() => {
    return empleados.map((emp) => {
      const salio = emp.estadoBreak !== "PENDIENTE" && !!emp.breakInicio;

      // Hora estimada de regreso
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

      return {
        ...emp,
        salio,
        horaRegreso,
        minutosRestantes,
        cumplido,
      };
    });
  }, [empleados, nowTick]);

  const kpis = useMemo(() => {
    const total = infoEmpleados.length;
    const pendientes = infoEmpleados.filter((e) => !e.salio).length;
    const enBreakActivos = infoEmpleados.filter((e) => e.salio && !e.cumplido).length;
    const horarioCumplido = infoEmpleados.filter((e) => e.salio && e.cumplido).length;
    return { total, pendientes, enBreakActivos, horarioCumplido };
  }, [infoEmpleados]);

  // ── Empleados Filtrados ────────────────────────────────────────────────
  const empleadosFiltrados = useMemo(() => {
    return infoEmpleados.filter((e) => {
      // Filtro texto
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase().trim();
        const coincideNombre = e.nombre.toLowerCase().includes(q);
        const coincideCat = e.categoria.toLowerCase().includes(q);
        if (!coincideNombre && !coincideCat) return false;
      }

      // Filtro categoría
      if (filtroCategoria !== "TODAS" && e.categoria !== filtroCategoria) {
        return false;
      }

      // Filtro estado
      if (filtroEstado === "PENDIENTE" && e.salio) return false;
      if (filtroEstado === "EN_BREAK" && (!e.salio || e.cumplido)) return false;
      if (filtroEstado === "CUMPLIDO" && (!e.salio || !e.cumplido)) return false;

      return true;
    });
  }, [infoEmpleados, filtroTexto, filtroCategoria, filtroEstado]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── ENCABEZADO ── */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="account-clock-outline" size={30} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Control de POZI & Breaks</Text>
            <Text style={styles.subtitle}>
              Marca la salida y visualiza automáticamente la hora exacta de regreso
            </Text>
          </View>
        </View>

        {/* Barra de Acciones y Fecha */}
        <View style={styles.actionsBar}>
          {/* Navegador de Fecha */}
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={() => cambiarDia(-1)} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFecha(dayjs().format("YYYY-MM-DD"))} style={styles.dateCenterBtn}>
              <MaterialCommunityIcons name="calendar" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
              <Text style={styles.dateText}>
                {dayjs(fecha).format("DD/MM/YYYY")}
                {fecha === dayjs().format("YYYY-MM-DD") ? " (Hoy)" : ""}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => cambiarDia(1)} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Botones de acción */}
          <View style={styles.rightButtonsRow}>
            <TouchableOpacity onPress={handlePickExcel} style={styles.btnCargarExcel} activeOpacity={0.8}>
              <MaterialCommunityIcons name="file-excel-box" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.btnCargarExcelText}>Cargar Excel POZI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              style={styles.btnSecondary}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="account-plus" size={18} color={COLORS.text} style={{ marginRight: 4 }} />
              <Text style={styles.btnSecondaryText}>Agregar</Text>
            </TouchableOpacity>

            {/* Ver datos del Excel / Prompt */}
            <TouchableOpacity
              onPress={() => setDebugModalOpen(true)}
              style={styles.btnGhost}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="code-json" size={18} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.btnGhostText}>Estructura / Prompt</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info del archivo cargado */}
        {lastExcelName && (
          <View style={styles.fileInfoBanner}>
            <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.success} />
            <Text style={styles.fileInfoText}>
              Planilla activa: <Text style={{ fontWeight: "700" }}>{lastExcelName}</Text>
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

        <View style={[styles.kpiCard, { borderLeftColor: COLORS.muted }]}>
          <Text style={styles.kpiNumber}>{kpis.pendientes}</Text>
          <Text style={styles.kpiLabel}>Pendientes de Break</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: COLORS.warning, backgroundColor: kpis.enBreakActivos > 0 ? "#FFFBEB" : COLORS.card }]}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.kpiNumber, { color: COLORS.warning }]}>{kpis.enBreakActivos}</Text>
            {kpis.enBreakActivos > 0 && (
              <MaterialCommunityIcons name="coffee" size={22} color={COLORS.warning} style={{ marginLeft: 6 }} />
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
        {/* Buscador */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.muted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Buscar por empleado o categoría..."
            placeholderTextColor={COLORS.muted}
            value={filtroTexto}
            onChangeText={setFiltroTexto}
            style={styles.searchInput}
          />
          {filtroTexto.length > 0 && (
            <TouchableOpacity onPress={() => setFiltroTexto("")}>
              <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
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
              CUMPLIDO: `Horario Cumplido (${kpis.horarioCumplido})`,
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

        {/* Filtros de Categorías */}
        {categoriasUnicas.length > 0 && (
          <View style={styles.chipsRow}>
            <Text style={styles.filterLabel}>Categoría:</Text>
            <TouchableOpacity
              onPress={() => setFiltroCategoria("TODAS")}
              style={[styles.chip, filtroCategoria === "TODAS" && styles.chipActive]}
            >
              <Text style={[styles.chipText, filtroCategoria === "TODAS" && styles.chipTextActive]}>
                Todas
              </Text>
            </TouchableOpacity>
            {categoriasUnicas.map((cat) => {
              const isSelected = filtroCategoria === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setFiltroCategoria(cat)}
                  style={[styles.chip, isSelected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── LISTADO DE EMPLEADOS ── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando datos del POZI...</Text>
        </View>
      ) : empleados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-excel-outline" size={54} color={COLORS.muted} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>No hay POZI cargado para esta fecha</Text>
          <Text style={styles.emptyDesc}>
            Haz clic en "Cargar Excel POZI" para subir la planilla del día. El sistema calculará
            automáticamente las horas y el break correspondiente (20 min para 7hs o menos, 40 min para más de 7hs).
          </Text>
          <TouchableOpacity onPress={handlePickExcel} style={styles.btnCargarExcel} activeOpacity={0.8}>
            <MaterialCommunityIcons name="upload" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.btnCargarExcelText}>Seleccionar archivo Excel</Text>
          </TouchableOpacity>
        </View>
      ) : empleadosFiltrados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="filter-remove-outline" size={40} color={COLORS.muted} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>No se encontraron empleados con los filtros aplicados</Text>
          <TouchableOpacity
            onPress={() => {
              setFiltroTexto("");
              setFiltroCategoria("TODAS");
              setFiltroEstado("TODOS");
            }}
            style={styles.btnResetFilter}
          >
            <Text style={styles.btnResetFilterText}>Limpiar filtros</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {empleadosFiltrados.map((emp) => {
            const isSalio = emp.salio;
            const isCumplido = emp.cumplido;

            return (
              <View
                key={emp.id}
                style={[
                  styles.cardEmpleado,
                  isSalio && !isCumplido && styles.cardEmpleadoEnBreak,
                  isSalio && isCumplido && styles.cardEmpleadoCumplido,
                ]}
              >
                {/* Lado izquierdo: Datos del empleado */}
                <View style={styles.empleadoInfoCol}>
                  <View style={styles.empleadoHeaderRow}>
                    <Text style={styles.empleadoNombre}>{emp.nombre}</Text>
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>{emp.categoria}</Text>
                    </View>
                  </View>

                  <View style={styles.horariosRow}>
                    <View style={styles.badgeHorario}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.muted} style={{ marginRight: 4 }} />
                      <Text style={styles.badgeHorarioText}>
                        {emp.entra || "--:--"} a {emp.sale || "--:--"}
                      </Text>
                    </View>

                    <View style={styles.badgeHorario}>
                      <MaterialCommunityIcons name="briefcase-clock-outline" size={14} color={COLORS.muted} style={{ marginRight: 4 }} />
                      <Text style={styles.badgeHorarioText}>{emp.horasTrabajadas} hs de jornada</Text>
                    </View>

                    {/* Badge Duración de Break Asignada */}
                    <View
                      style={[
                        styles.badgeBreakAsignado,
                        emp.duracionBreak === 20 ? styles.badgeBreak20 : styles.badgeBreak40,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={emp.duracionBreak === 20 ? "coffee" : "food-apple"}
                        size={14}
                        color={emp.duracionBreak === 20 ? "#047857" : "#B45309"}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.badgeBreakAsignadoText,
                          { color: emp.duracionBreak === 20 ? "#047857" : "#B45309" },
                        ]}
                      >
                        Break: {emp.duracionBreak} min {emp.horasTrabajadas <= 7 ? "(≤7 hs)" : "(>7 hs)"}
                      </Text>
                    </View>
                  </View>

                  {/* Detalle visual cuando ya salió a break */}
                  {isSalio && (
                    <View style={[styles.salioBanner, isCumplido ? styles.salioBannerCumplido : styles.salioBannerActivo]}>
                      <View style={styles.salioHorasRow}>
                        <View style={styles.salioHoraItem}>
                          <Text style={styles.salioHoraLabel}>SALIÓ</Text>
                          <Text style={styles.salioHoraValor}>{emp.breakInicio || "--:--"}</Text>
                        </View>

                        <MaterialCommunityIcons name="arrow-right" size={18} color={isCumplido ? "#059669" : "#D97706"} />

                        <View style={styles.salioHoraItem}>
                          <Text style={styles.salioHoraLabel}>DEBE REGRESAR</Text>
                          <Text style={[styles.salioHoraValor, { fontWeight: "800", color: isCumplido ? "#047857" : "#B45309" }]}>
                            {emp.horaRegreso || "--:--"}
                          </Text>
                        </View>

                        <View style={styles.salioTimerBox}>
                          {!isCumplido ? (
                            <View style={styles.countdownPill}>
                              <MaterialCommunityIcons name="timer-sand" size={14} color="#B45309" style={{ marginRight: 4 }} />
                              <Text style={styles.countdownPillText}>
                                Faltan {emp.minutosRestantes} min
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.cumplidoPill}>
                              <MaterialCommunityIcons name="check-circle" size={14} color="#047857" style={{ marginRight: 4 }} />
                              <Text style={styles.cumplidoPillText}>
                                {emp.minutosRestantes < -2
                                  ? `Debió volver ${emp.horaRegreso} (+${Math.abs(emp.minutosRestantes)} min)`
                                  : `Horario cumplido (${emp.horaRegreso})`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {emp.encargado && (
                        <Text style={styles.autorizoText}>Autorizado por: {emp.encargado}</Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Lado derecho: Acción rápida */}
                <View style={styles.empleadoAccionesCol}>
                  {!isSalio ? (
                    <TouchableOpacity
                      onPress={() => handleMarcarSalidaBreak(emp.id)}
                      style={styles.btnMarcarSalida}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="coffee-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <View>
                        <Text style={styles.btnMarcarSalidaText}>Se fue a Break</Text>
                        <Text style={styles.btnMarcarSalidaSub}>Regresa en {emp.duracionBreak} min</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.horarioRegresoBadge}>
                      <Text style={styles.horarioRegresoBadgeLabel}>REGRESA</Text>
                      <Text style={styles.horarioRegresoBadgeHora}>{emp.horaRegreso || "--:--"}</Text>
                    </View>
                  )}

                  {/* Botones de gestión (deshacer / eliminar) */}
                  <View style={styles.miniBotonesRow}>
                    {isSalio && (
                      <TouchableOpacity
                        onPress={() => handleReiniciarBreak(emp.id)}
                        style={styles.btnMiniGhost}
                        accessibilityLabel="Deshacer salida"
                      >
                        <MaterialCommunityIcons name="restart" size={18} color={COLORS.muted} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => handleEliminarEmpleado(emp.id)}
                      style={styles.btnMiniGhost}
                      accessibilityLabel="Quitar"
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── MODAL VER ESTRUCTURA / DATOS PARA PROMPT ── */}
      <Modal visible={debugModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.debugModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons name="file-code-outline" size={24} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Datos detectados del Excel POZI</Text>
              </View>
              <TouchableOpacity onPress={() => setDebugModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Aquí puedes revisar los datos leídos del archivo y copiar el resumen técnico para pegarlo o compartirlo.
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
                <MaterialCommunityIcons name="content-copy" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.btnCopiaPromptText}>Copiar datos al portapapeles</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDebugModalOpen(false)} style={styles.btnCerrarModal}>
                <Text style={styles.btnCerrarModalText}>Cerrar</Text>
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

            <Text style={styles.inputLabel}>Categoría / Sector</Text>
            <TextInput
              style={styles.inputModal}
              placeholder="Ej. Candy, Boletería, Limpieza"
              value={nuevaCat}
              onChangeText={setNuevaCat}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: THEME.spacing.lg,
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 60,
  },
  header: {
    marginBottom: THEME.spacing.md,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: THEME.spacing.md,
    gap: THEME.spacing.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: THEME.fontSize.xxl,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginTop: 2,
  },
  actionsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: THEME.spacing.sm,
    marginTop: 4,
  },
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 2,
  },
  dateNavBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateCenterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  rightButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  btnCargarExcel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
  },
  btnCargarExcelText: {
    color: "#FFFFFF",
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: THEME.radius.md,
  },
  btnSecondaryText: {
    color: COLORS.text,
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
  },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: THEME.radius.md,
  },
  btnGhostText: {
    color: COLORS.primary,
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
  },
  fileInfoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
    marginTop: 10,
    gap: 6,
  },
  fileInfoText: {
    fontSize: THEME.fontSize.xs,
    color: "#166534",
  },
  // KPIs
  kpiContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: THEME.spacing.md,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
  },
  kpiNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  kpiLabel: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
    marginTop: 2,
    fontWeight: "500",
  },
  // Filtros
  filterSection: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.md,
    gap: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  filterLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "600",
    color: COLORS.muted,
    marginRight: 4,
  },
  chip: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.radius.full,
  },
  chipActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
  },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  // Lista
  listContainer: {
    gap: 10,
  },
  cardEmpleado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexWrap: "wrap",
    gap: 12,
  },
  cardEmpleadoEnBreak: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFDF7",
    borderWidth: 1.5,
  },
  cardEmpleadoCumplido: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F8FCF9",
  },
  empleadoInfoCol: {
    flex: 1,
    minWidth: 280,
  },
  empleadoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  empleadoNombre: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  catBadge: {
    backgroundColor: "#EEF2F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: THEME.radius.sm,
  },
  catBadgeText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "600",
    color: "#334155",
  },
  horariosRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  badgeHorario: {
    flexDirection: "row",
    alignItems: "center",
  },
  badgeHorarioText: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
  },
  badgeBreakAsignado: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.radius.sm,
  },
  badgeBreak20: {
    backgroundColor: "#ECFDF5",
  },
  badgeBreak40: {
    backgroundColor: "#FEF3C7",
  },
  badgeBreakAsignadoText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "700",
  },
  // Banner cuando ya salió
  salioBanner: {
    borderRadius: THEME.radius.sm,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
  },
  salioBannerActivo: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  salioBannerCumplido: {
    backgroundColor: "#ECFDF5",
    borderColor: "#BBF7D0",
  },
  salioHorasRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  salioHoraItem: {
    alignItems: "flex-start",
  },
  salioHoraLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  salioHoraValor: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  salioTimerBox: {
    marginLeft: "auto",
  },
  countdownPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radius.full,
  },
  countdownPillText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "700",
    color: "#B45309",
  },
  cumplidoPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radius.full,
  },
  cumplidoPillText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "600",
    color: "#047857",
  },
  autorizoText: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },
  empleadoAccionesCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btnMarcarSalida: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
  },
  btnMarcarSalidaText: {
    color: "#FFFFFF",
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
  },
  btnMarcarSalidaSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "500",
  },
  horarioRegresoBadge: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: THEME.radius.md,
    alignItems: "center",
  },
  horarioRegresoBadgeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  horarioRegresoBadgeHora: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  miniBotonesRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  btnMiniGhost: {
    padding: 8,
  },
  centerContainer: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: THEME.fontSize.sm,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 500,
    marginBottom: 16,
    lineHeight: 20,
  },
  btnResetFilter: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
  },
  btnResetFilterText: {
    color: COLORS.primary,
    fontSize: THEME.fontSize.sm,
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
  debugModalCard: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "85%",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: 20,
  },
  addModalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalDesc: {
    fontSize: THEME.fontSize.xs,
    color: COLORS.muted,
    marginBottom: 12,
  },
  debugScrollArea: {
    backgroundColor: "#0F172A",
    borderRadius: THEME.radius.sm,
    padding: 12,
    maxHeight: 360,
    marginBottom: 14,
  },
  codeText: {
    color: "#38BDF8",
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
    fontSize: 12,
    lineHeight: 18,
  },
  modalFooterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  btnCopiaPrompt: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: THEME.radius.sm,
  },
  btnCopiaPromptText: {
    color: "#FFFFFF",
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
  },
  btnCerrarModal: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: THEME.radius.sm,
  },
  btnCerrarModalText: {
    color: COLORS.text,
    fontSize: THEME.fontSize.sm,
  },
  copiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    padding: 8,
    borderRadius: THEME.radius.sm,
    marginBottom: 10,
  },
  copiedBannerText: {
    fontSize: THEME.fontSize.xs,
    color: "#047857",
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
    marginTop: 8,
  },
  inputModal: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: THEME.fontSize.sm,
    color: COLORS.text,
    outlineStyle: "none" as any,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: THEME.fontSize.xs,
    marginBottom: 8,
  },
});

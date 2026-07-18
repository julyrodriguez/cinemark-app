import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "@/lib/dbService";
import { useAuthUser } from "../../lib/useAuthUser";
import { COLORS, THEME } from "../../lib/theme";
import { db } from "../../lib/firebaseConfig";

// Tipos de datos
interface FeedbackEntry {
  id: string;
  tipo: "sugerencia" | "bug";
  categoria: string;
  titulo: string;
  descripcion: string;
  prioridad?: "leve" | "moderada" | "critica" | null;
  impacto?: "estetica" | "ahorra_tiempo" | "evita_errores" | null;
  cineId: string;
  userName: string;
  fechaCreacion?: any;
  fechaISO: string;
  status: "pendiente" | "analizando" | "en_progreso" | "completado" | "desestimado";
  comentarioAdmin?: string;
  votos?: string[];
}

const CATEGORIAS = [
  { value: "proyeccion", label: "Proyección / Sala" },
  { value: "dcp", label: "DCP / Contenidos" },
  { value: "lamparas", label: "Lámparas" },
  { value: "inventario", label: "Inventario / Insumos" },
  { value: "interfaz", label: "Diseño / Interfaz" },
  { value: "otro", label: "Otro motivo" },
];

export default function FeedbackScreen() {
  const { cineId, displayName, isAdmin } = useAuthUser();
  const { width } = useWindowDimensions();

  // Estados de navegación interna
  const [activeTab, setActiveTab] = useState<"NUEVO" | "LISTA">("NUEVO");

  // Estados del Formulario
  const [tipo, setTipo] = useState<"sugerencia" | "bug">("sugerencia");
  const [categoria, setCategoria] = useState("proyeccion");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<"leve" | "moderada" | "critica">("moderada");
  const [impacto, setImpacto] = useState<"estetica" | "ahorra_tiempo" | "evita_errores">("ahorra_tiempo");
  const [submitting, setSubmitting] = useState(false);

  // Estados del Historial
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const isAbastoUser = useMemo(() => {
    return cineId?.toLowerCase() === "abasto" || isAdmin;
  }, [cineId, isAdmin]);

  // Suscribirse a los reportes de todos los cines en tiempo real
  useEffect(() => {
    setLoadingEntries(true);
    // Usamos la colección cines/global/feedback para que pase por el backend local y se replique
    const qCol = collection(db, "cines", "global", "feedback");
    const q = query(qCol, orderBy("fechaISO", "desc"));

    const unsub = onSnapshot(
      q,
      (snap: any) => {
        const rows: FeedbackEntry[] = snap.docs.map((d: any) => {
          const data = d.data();
          return {
            id: d.id,
            tipo: data.tipo ?? "sugerencia",
            categoria: data.categoria ?? "otro",
            titulo: data.titulo ?? "",
            descripcion: data.descripcion ?? "",
            prioridad: data.prioridad,
            impacto: data.impacto,
            cineId: data.cineId ?? "desconocido",
            userName: data.userName ?? "Operador",
            fechaCreacion: data.fechaCreacion,
            fechaISO: data.fechaISO ?? "",
            status: data.status ?? "pendiente",
            comentarioAdmin: data.comentarioAdmin ?? "",
            votos: data.votos ?? [],
          };
        });
        setEntries(rows);
        setLoadingEntries(false);
      },
      (err: any) => {
        console.error("Error al cargar feedback:", err);
        setLoadingEntries(false);
      }
    );

    return () => unsub();
  }, []);

  const handleSubmit = async () => {
    if (!titulo.trim() || !descripcion.trim()) {
      Alert.alert("Campos obligatorios", "Por favor ingresá un título y una descripción.");
      return;
    }

    setSubmitting(true);
    try {
      const qCol = collection(db, "cines", "global", "feedback");
      await addDoc(qCol, {
        tipo,
        categoria,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        prioridad: tipo === "bug" ? prioridad : null,
        impacto: tipo === "sugerencia" ? impacto : null,
        cineId: cineId || "desconocido",
        userName: displayName || "Operador",
        fechaCreacion: serverTimestamp(),
        fechaISO: new Date().toISOString(),
        status: "pendiente",
        votos: [],
      });

      Alert.alert("¡Enviado!", "Tu sugerencia/reporte ha sido registrado y enviado por mail.");
      setTitulo("");
      setDescripcion("");
      setActiveTab("LISTA");
    } catch (e: any) {
      Alert.alert("Error", "No se pudo registrar tu feedback: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (item: FeedbackEntry, nextStatus: FeedbackEntry["status"]) => {
    if (!isAbastoUser) return;
    try {
      const docRef = doc(collection(db, "cines", "global", "feedback"), item.id);
      await updateDoc(docRef, {
        status: nextStatus,
      });
      Alert.alert("Éxito", `El estado ha sido cambiado a: ${nextStatus === "completado" ? "Completado" : nextStatus}`);
    } catch (e: any) {
      Alert.alert("Error", "No se pudo actualizar el estado: " + e.message);
    }
  };

  const getStatusBadge = (status: FeedbackEntry["status"]) => {
    switch (status) {
      case "completado":
        return { bg: "#065F46", text: "#34D399", label: "Completado" };
      case "en_progreso":
        return { bg: "#78350F", text: "#FBBF24", label: "En Progreso" };
      case "analizando":
        return { bg: "#1E3A8A", text: "#93C5FD", label: "En Análisis" };
      case "desestimado":
        return { bg: "#450A0A", text: "#F87171", label: "Desestimado" };
      default:
        return { bg: "#374151", text: "#D1D5DB", label: "Pendiente" };
    }
  };

  const getCategoryLabel = (catVal: string) => {
    return CATEGORIAS.find((c) => c.value === catVal)?.label ?? "Otro";
  };

  return (
    <View style={s.container}>
      {/* Tab bar segmented */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === "NUEVO" && s.tabBtnActive]}
          onPress={() => setActiveTab("NUEVO")}
        >
          <MaterialCommunityIcons
            name="plus-box"
            size={16}
            color={activeTab === "NUEVO" ? "#FFF" : COLORS.muted}
          />
          <Text style={[s.tabBtnText, activeTab === "NUEVO" && s.tabBtnTextActive]}>
            Proponer / Reportar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === "LISTA" && s.tabBtnActive]}
          onPress={() => setActiveTab("LISTA")}
        >
          <MaterialCommunityIcons
            name="format-list-bulleted"
            size={16}
            color={activeTab === "LISTA" ? "#FFF" : COLORS.muted}
          />
          <Text style={[s.tabBtnText, activeTab === "LISTA" && s.tabBtnTextActive]}>
            Sugerencias de Cines ({entries.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "NUEVO" ? (
          /* FORMULARIO */
          <View style={s.card}>
            <Text style={s.cardTitle}>📩 Enviar Propuesta / Falla</Text>
            <Text style={s.cardSubtitle}>
              Ayudanos a mejorar la aplicación. Al enviar, se creará un registro visible para todos los cines y se enviará un mail automático de notificación al equipo de desarrollo.
            </Text>

            {/* Selector de tipo */}
            <View style={s.row}>
              <TouchableOpacity
                style={[s.typeBtn, tipo === "sugerencia" && { backgroundColor: COLORS.primary, borderColor: "transparent" }]}
                onPress={() => setTipo("sugerencia")}
              >
                <MaterialCommunityIcons
                  name="lightbulb-on"
                  size={18}
                  color={tipo === "sugerencia" ? "#FFF" : COLORS.muted}
                />
                <Text style={[s.typeBtnText, tipo === "sugerencia" ? { color: "#FFF" } : { color: COLORS.muted }]}>
                  Sugerencia
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.typeBtn, tipo === "bug" && { backgroundColor: COLORS.danger, borderColor: "transparent" }]}
                onPress={() => setTipo("bug")}
              >
                <MaterialCommunityIcons
                  name="bug"
                  size={18}
                  color={tipo === "bug" ? "#FFF" : COLORS.muted}
                />
                <Text style={[s.typeBtnText, tipo === "bug" ? { color: "#FFF" } : { color: COLORS.muted }]}>
                  Reportar Bug
                </Text>
              </TouchableOpacity>
            </View>

            {/* Categoría */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Categoría / Módulo afectado</Text>
              <View style={s.catContainer}>
                {CATEGORIAS.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[s.catChip, categoria === cat.value && s.catChipActive]}
                    onPress={() => setCategoria(cat.value)}
                  >
                    <Text style={[s.catChipText, categoria === cat.value && s.catChipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Título */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Título resumido *</Text>
              <TextInput
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Ej: Opción para ocultar proyectores fuera de uso"
                placeholderTextColor={COLORS.muted}
                style={s.input}
              />
            </View>

            {/* Detalles condicionales (Prioridad/Impacto) */}
            {tipo === "bug" ? (
              <View style={s.fieldGroup}>
                <Text style={s.label}>Severidad del problema</Text>
                <View style={s.row}>
                  {(["leve", "moderada", "critica"] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        s.optBtn,
                        prioridad === p && {
                          borderColor: p === "critica" ? COLORS.danger : p === "moderada" ? "#F59E0B" : COLORS.success,
                          backgroundColor: p === "critica" ? COLORS.danger + "15" : p === "moderada" ? "#F59E0B15" : COLORS.success + "15",
                        },
                      ]}
                      onPress={() => setPrioridad(p)}
                    >
                      <Text style={[s.optText, prioridad === p && { color: "#FFF", fontWeight: "bold" }]}>
                        {p === "critica" ? "Crítica 🚨" : p === "moderada" ? "Moderada ⚠️" : "Leve ✅"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={s.fieldGroup}>
                <Text style={s.label}>Impacto estimado</Text>
                <View style={s.row}>
                  {(["ahorra_tiempo", "evita_errores", "estetica"] as const).map((i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.optBtn, impacto === i && s.optBtnActive]}
                      onPress={() => setImpacto(i)}
                    >
                      <Text style={[s.optText, impacto === i && s.optTextActive]}>
                        {i === "ahorra_tiempo" ? "Ahorra tiempo ⚡" : i === "evita_errores" ? "Evita errores 🛡️" : "Estética / Diseño 🎨"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Descripción */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Descripción detallada *</Text>
              <TextInput
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder="Explicá claramente tu idea o los pasos que causaron el error..."
                placeholderTextColor={COLORS.muted}
                multiline
                numberOfLines={6}
                style={[s.input, s.textArea]}
              />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: tipo === "bug" ? COLORS.danger : COLORS.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={s.submitBtnText}>Enviar Propuesta</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* HISTORIAL / LISTADO */
          <View style={{ gap: 14 }}>
            {loadingEntries ? (
              <View style={s.loadingCenter}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={s.loadingText}>Cargando propuestas...</Text>
              </View>
            ) : entries.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="message-draw" size={48} color={COLORS.muted} />
                <Text style={s.emptyTitle}>Sin sugerencias registradas</Text>
                <Text style={s.emptySubtitle}>
                  Aún no se han enviado propuestas de mejora o reportes de fallas en el sistema.
                </Text>
              </View>
            ) : (
              entries.map((item) => {
                const isBug = item.tipo === "bug";
                const badge = getStatusBadge(item.status);
                const isCompleted = item.status === "completado";
                const date = item.fechaISO ? new Date(item.fechaISO) : null;
                const formattedDate = date ? date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

                return (
                  <View key={item.id} style={s.entryCard}>
                    <View style={s.cardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <MaterialCommunityIcons
                          name={isBug ? "bug" : "lightbulb-on"}
                          size={18}
                          color={isBug ? COLORS.danger : COLORS.primary}
                        />
                        <Text style={[s.entryTypeLabel, { color: isBug ? COLORS.danger : COLORS.primary }]}>
                          {isBug ? `Bug (${item.prioridad})` : `Sugerencia`}
                        </Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[s.statusBadgeText, { color: badge.text }]}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={s.entryTitle}>{item.titulo}</Text>
                    <Text style={s.entryDesc}>{item.descripcion}</Text>

                    <View style={s.entryMetadata}>
                      <Text style={s.metadataText}>
                        📍 <Text style={{ fontWeight: "700" }}>{item.cineId.toUpperCase()}</Text> ({item.userName})
                      </Text>
                      <Text style={s.metadataText}>
                        📁 {getCategoryLabel(item.categoria)}
                      </Text>
                      <Text style={s.metadataText}>
                        📅 {formattedDate}
                      </Text>
                    </View>

                    {/* Acciones del administrador (Solo usuario de Abasto o Admin) */}
                    {isAbastoUser && !isCompleted && (
                      <View style={s.adminActions}>
                        <Text style={s.adminLabel}>Gestión de Desarrollo (Abasto):</Text>
                        <View style={s.adminBtnRow}>
                          <TouchableOpacity
                            style={[s.adminBtn, { backgroundColor: COLORS.successBg }]}
                            onPress={() => handleUpdateStatus(item, "completado")}
                          >
                            <MaterialCommunityIcons name="check-bold" size={14} color={COLORS.success} />
                            <Text style={[s.adminBtnText, { color: COLORS.success }]}>Completar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.adminBtn, { backgroundColor: "#78350F30" }]}
                            onPress={() => handleUpdateStatus(item, "en_progreso")}
                          >
                            <MaterialCommunityIcons name="progress-clock" size={14} color="#FBBF24" />
                            <Text style={[s.adminBtnText, { color: "#FBBF24" }]}>En Progreso</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.adminBtn, { backgroundColor: COLORS.dangerSoft }]}
                            onPress={() => handleUpdateStatus(item, "desestimado")}
                          >
                            <MaterialCommunityIcons name="close-circle-outline" size={14} color={COLORS.danger} />
                            <Text style={[s.adminBtnText, { color: COLORS.danger }]}>Desestimar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingCenter: { padding: 40, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  
  // Tab Bar Segmented
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
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
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
  },
  tabBtnTextActive: {
    color: "#FFF",
  },

  // Cards & Forms
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...THEME.shadow.soft,
    gap: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  cardSubtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  row: { flexDirection: "row", gap: 10 },
  typeBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  typeBtnText: { color: COLORS.muted, fontWeight: "bold", fontSize: 14 },
  
  fieldGroup: { gap: 6 },
  label: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 14,
  },
  textArea: {
    height: 120,
    textAlignVertical: "top",
  },
  
  // Chips de categoria
  catContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  catChip: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipActive: {
    borderColor: COLORS.primary + "80",
    backgroundColor: COLORS.primarySoft,
  },
  catChipText: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  catChipTextActive: { color: COLORS.primary },

  // Selector Option Buttons
  optBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  optBtnActive: {
    borderColor: COLORS.primary + "80",
    backgroundColor: COLORS.primarySoft,
  },
  optText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  optTextActive: { color: COLORS.primary },

  // Submit button
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },

  // Entries List
  entryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
    ...THEME.shadow.soft,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryTypeLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  entryTitle: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  entryDesc: { fontSize: 13, color: COLORS.text, opacity: 0.8, lineHeight: 18 },
  entryMetadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 10,
    marginTop: 4,
  },
  metadataText: { fontSize: 11, color: COLORS.muted, fontWeight: "600" },

  // Empty Card
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...THEME.shadow.soft,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  emptySubtitle: { color: COLORS.muted, fontSize: 12, textAlign: "center", lineHeight: 16 },

  // Admin Actions
  adminActions: {
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 12,
    marginTop: 4,
    gap: 8,
  },
  adminLabel: { fontSize: 11, fontWeight: "800", color: "#FBBF24" },
  adminBtnRow: { flexDirection: "row", gap: 8 },
  adminBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
  },
  adminBtnText: { fontSize: 11, fontWeight: "700" },
});

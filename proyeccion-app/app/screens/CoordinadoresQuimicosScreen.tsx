import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "@/lib/dbService";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";

import { CINES_COLLECTION, db, functions } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { httpsCallable } from "@/lib/dbService";

// ─── Types ────────────────────────────────────────────────────────────────────

type Vencimiento = {
  id: string;
  fecha: string;      // "YYYY-MM-DD"
  litros: number;
};

type Quimico = {
  id: string;
  nombre: string;
  descripcion?: string;
  vencimientos: Vencimiento[];
  stockMinimo?: number; // umbral de alerta de poco stock
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  if (!iso) return "Sin fecha";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function totalLitros(v: Vencimiento[]) {
  return v.reduce((s, x) => s + x.litros, 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

// Devuelve la fecha ISO más próxima con litros > 0, o "" si no hay
function proximoVencimiento(q: Quimico): string {
  const activos = q.vencimientos.filter((v) => v.litros > 0).map((v) => v.fecha).sort();
  return activos[0] ?? "9999-99-99";
}

export default function CoordinadoresQuimicosScreen() {
  const { cineId } = useAuthUser();

  const [quimicos, setQuimicos] = useState<Quimico[]>([]);
  const [loading, setLoading] = useState(true);

  // ── búsqueda y collapse ──
  const [busqueda, setBusqueda] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── nuevo químico ──
  const [showNuevo, setShowNuevo] = useState(false);
  const [nNombre, setNNombre] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nStockMinimo, setNStockMinimo] = useState("");
  const [saving, setSaving] = useState(false);
  const [nError, setNError] = useState("");

  // ── nuevo vencimiento ──
  const [vencModal, setVencModal] = useState<{ quimicoId: string; nombre: string } | null>(null);
  const [vFecha, setVFecha] = useState("");
  const [vLitros, setVLitros] = useState("");
  const [vError, setVError] = useState("");
  const [savingV, setSavingV] = useState(false);

  // ── editar litros ──
  const [editVenc, setEditVenc] = useState<{
    quimicoId: string;
    vencId: string;
    litrosActual: number;
    fecha: string;
  } | null>(null);
  const [editLitrosDelta, setEditLitrosDelta] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ── borrar químico ──
  const [deleteQ, setDeleteQ] = useState<Quimico | null>(null);

  // ── stock mínimo ──
  const [stockMinimoModal, setStockMinimoModal] = useState<{ quimicoId: string; nombre: string; actual: number | undefined } | null>(null);
  const [stockMinimoInput, setStockMinimoInput] = useState("");
  const [savingStockMin, setSavingStockMin] = useState(false);
  const [stockMinError, setStockMinError] = useState("");

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchQuimicos = useCallback(async () => {
    if (!cineId) { setLoading(false); return; }
    setLoading(true);
    try {
      const qCol = collection(db, CINES_COLLECTION, cineId, "quimicos");
      const qSnap = await getDocs(query(qCol, orderBy("nombre", "asc")));

      const rows: Quimico[] = await Promise.all(
        qSnap.docs.map(async (d) => {
          const data = d.data() as any;
          const vCol = collection(db, CINES_COLLECTION, cineId, "quimicos", d.id, "vencimientos");
          const vSnap = await getDocs(query(vCol, orderBy("fecha", "asc")));
          const vencimientos: Vencimiento[] = vSnap.docs.map((v) => ({
            id: v.id,
            fecha: (v.data() as any).fecha ?? "",
            litros: Number((v.data() as any).litros ?? 0),
          }));
          return {
            id: d.id,
            nombre: data.nombre ?? "",
            descripcion: data.descripcion ?? "",
            vencimientos,
            stockMinimo: data.stockMinimo !== undefined ? Number(data.stockMinimo) : undefined,
          };
        })
      );
      setQuimicos(rows);
      // Inicializar todos colapsados al cargar
      const allCollapsed: Record<string, boolean> = {};
      rows.forEach((q) => { allCollapsed[q.id] = true; });
      setCollapsed(allCollapsed);
    } catch (e) {
      console.error("fetchQuimicos:", e);
    } finally {
      setLoading(false);
    }
  }, [cineId]);

  useEffect(() => { fetchQuimicos(); }, [fetchQuimicos]);

  // ─── Crear químico ──────────────────────────────────────────────────────────

  const guardarNuevoQuimico = async () => {
    setNError("");
    if (!nNombre.trim()) { setNError("El nombre es requerido."); return; }
    // Validar stock mínimo si se ingresó
    let stockMinimoNum: number | undefined = undefined;
    if (nStockMinimo.trim() !== "") {
      stockMinimoNum = parseFloat(nStockMinimo.replace(",", "."));
      if (isNaN(stockMinimoNum) || stockMinimoNum < 0) {
        setNError("El stock mínimo debe ser un número mayor o igual a 0.");
        return;
      }
    }
    if (!cineId) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        nombre: nNombre.trim(),
        descripcion: nDesc.trim(),
        creadoEn: new Date().toISOString(),
      };
      if (stockMinimoNum !== undefined) payload.stockMinimo = stockMinimoNum;
      await addDoc(collection(db, CINES_COLLECTION, cineId, "quimicos"), payload);
      setShowNuevo(false);
      setNNombre(""); setNDesc(""); setNStockMinimo("");
      fetchQuimicos();
    } catch (e: any) {
      setNError(e?.message ?? "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Borrar químico ─────────────────────────────────────────────────────────

  const borrarQuimico = async (q: Quimico) => {
    if (!cineId) return;
    try {
      // borrar subcolección vencimientos primero
      for (const v of q.vencimientos) {
        await deleteDoc(doc(db, CINES_COLLECTION, cineId, "quimicos", q.id, "vencimientos", v.id));
      }
      await deleteDoc(doc(db, CINES_COLLECTION, cineId, "quimicos", q.id));
      setDeleteQ(null);
      fetchQuimicos();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo borrar.");
    }
  };

  // ─── Agregar vencimiento ────────────────────────────────────────────────────

  const guardarVencimiento = async () => {
    setVError("");
    if (!vencModal || !cineId) return;

    // Acepta DD-MM-AAAA y convierte a YYYY-MM-DD internamente
    const parseDDMMAAAA = (s: string) => {
      const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (!m) return null;
      return `${m[3]}-${m[2]}-${m[1]}`; // -> YYYY-MM-DD
    };
    const fechaISO = parseDDMMAAAA(vFecha);
    if (!fechaISO) { setVError("Fecha inválida. Usá DD-MM-AAAA (ej: 31-12-2025)."); return; }
    const litrosNum = parseFloat(vLitros.replace(",", "."));
    if (isNaN(litrosNum) || litrosNum <= 0) { setVError("Litros debe ser un número mayor a 0."); return; }

    setSavingV(true);
    try {
      await addDoc(
        collection(db, CINES_COLLECTION, cineId, "quimicos", vencModal.quimicoId, "vencimientos"),
        { fecha: fechaISO, litros: litrosNum }
      );
      setVencModal(null); setVFecha(""); setVLitros("");
      fetchQuimicos();
    } catch (e: any) {
      setVError(e?.message ?? "Error al guardar.");
    } finally {
      setSavingV(false);
    }
  };

  // ─── Editar / descontar litros ──────────────────────────────────────────────

  const guardarEditLitros = async () => {
    setEditError("");
    if (!editVenc || !cineId) return;
    const delta = parseFloat(editLitrosDelta.replace(",", "."));
    if (isNaN(delta) || delta <= 0) { setEditError("Ingresá un número positivo a descontar."); return; }
    const nuevos = editVenc.litrosActual - delta;
    if (nuevos < 0) { setEditError(`No podés descontar más de ${editVenc.litrosActual} L.`); return; }

    setSavingEdit(true);
    try {
      const ref = doc(db, CINES_COLLECTION, cineId, "quimicos", editVenc.quimicoId, "vencimientos", editVenc.vencId);
      if (nuevos === 0) {
        await deleteDoc(ref);
      } else {
        await updateDoc(ref, { litros: nuevos });
      }
      const quimicoIdGuardado = editVenc.quimicoId;
      setEditVenc(null); setEditLitrosDelta("");
      fetchQuimicos();
      // Notificar bajo stock en segundo plano (fire-and-forget)
      try {
        const notificar = httpsCallable(functions, "notificarBajoStockQuimico");
        notificar({ cineId, quimicoId: quimicoIdGuardado }).catch(() => {});
      } catch (_) {}
    } catch (e: any) {
      setEditError(e?.message ?? "Error al actualizar.");
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── Guardar stock mínimo ────────────────────────────────────────────────────

  const guardarStockMinimo = async () => {
    setStockMinError("");
    if (!stockMinimoModal || !cineId) return;
    const val = stockMinimoInput.trim();
    // Permitir vacío para quitar el umbral
    let num: number | null = null;
    if (val !== "") {
      num = parseFloat(val.replace(",", "."));
      if (isNaN(num) || num < 0) { setStockMinError("Ingresá un número mayor o igual a 0."); return; }
    }
    setSavingStockMin(true);
    try {
      const ref = doc(db, CINES_COLLECTION, cineId, "quimicos", stockMinimoModal.quimicoId);
      if (num === null) {
        await updateDoc(ref, { stockMinimo: null });
      } else {
        await updateDoc(ref, { stockMinimo: num });
      }
      setStockMinimoModal(null);
      setStockMinimoInput("");
      fetchQuimicos();
    } catch (e: any) {
      setStockMinError(e?.message ?? "Error al guardar.");
    } finally {
      setSavingStockMin(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Cargando químicos…</Text>
      </View>
    );
  }

  // ── Lista filtrada y ordenada ──
  const listaFiltrada = quimicos
    .filter((q) => q.nombre.toLowerCase().includes(busqueda.toLowerCase().trim()))
    .slice()
    .sort((a, b) => proximoVencimiento(a).localeCompare(proximoVencimiento(b)));

  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.pageSubtitle}>{quimicos.length} producto{quimicos.length !== 1 ? "s" : ""} registrado{quimicos.length !== 1 ? "s" : ""}</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => { setNNombre(""); setNDesc(""); setNError(""); setShowNuevo(true); }}>
            <Text style={s.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>

        {/* Buscador */}
        <View style={s.searchWrap}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar químico…"
            placeholderTextColor="#94A3B8"
            style={s.searchInput}
            clearButtonMode="while-editing"
          />
          {busqueda.length > 0 && (
            <TouchableOpacity onPress={() => setBusqueda("")} style={s.clearBtn}>
              <Text style={s.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Aviso de Control de Stock Automatizado */}
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>ℹ️ Control de Stock Automatizado</Text>
          <Text style={s.noticeText}>
            • <Text style={{ fontWeight: "700" }}>Vencimientos:</Text> Cada 15 días se realiza un chequeo. Si alguna tanda está a menos de 1 mes de vencer, se envía una alerta por mail.{"\n"}
            • <Text style={{ fontWeight: "700" }}>Límite de Stock:</Text> Si el stock desciende por debajo del "límite" configurado, se envía un mail de alerta inmediatamente.
          </Text>
        </View>

        {quimicos.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🧴</Text>
            <Text style={s.emptyTitle}>Sin químicos registrados</Text>
            <Text style={s.emptySubtitle}>Presioná "+ Nuevo" para agregar el primer químico.</Text>
          </View>
        )}

        {quimicos.length > 0 && listaFiltrada.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>Sin resultados</Text>
            <Text style={s.emptySubtitle}>No hay químicos que coincidan con "{busqueda}".</Text>
          </View>
        )}

        {listaFiltrada.map((q) => {
          const total = totalLitros(q.vencimientos);
          const vencActivos = q.vencimientos.filter((v) => v.litros > 0);
          const isCollapsed = !!collapsed[q.id];
          const proxVenc = vencActivos.length > 0 ? vencActivos.sort((a,b) => a.fecha.localeCompare(b.fecha))[0] : null;
          const enZonaRoja = q.stockMinimo !== undefined && q.stockMinimo > 0 && total <= q.stockMinimo;

          return (
            <View key={q.id} style={[s.card, enZonaRoja && s.cardRed]}>
              {/* Card header — siempre visible, toca para colapsar */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggleCollapse(q.id)}
                style={s.cardHeader}
              >
                <View style={s.cardTitleWrap}>
                  <View style={s.cardTitleRow}>
                    <Text style={[s.cardTitle, enZonaRoja && s.cardTitleRed]}>{q.nombre}</Text>
                    {enZonaRoja && <View style={s.bajoBadge}><Text style={s.bajoBadgeText}>⚠️ BAJO STOCK</Text></View>}
                  </View>
                  {isCollapsed && proxVenc && (
                    <Text style={s.cardDescCollapsed}>
                      📅 Vence: {formatFecha(proxVenc.fecha)} · <Text style={s.cardDescCollapsedLitros}>{proxVenc.litros.toLocaleString("es-AR")} L</Text>
                    </Text>
                  )}
                  {!isCollapsed && !!q.descripcion && (
                    <Text style={s.cardDesc}>{q.descripcion}</Text>
                  )}
                </View>
                <View style={s.cardHeaderRight}>
                  {isCollapsed && (
                    <View style={[s.totalBadgeCollapsed, enZonaRoja && s.totalBadgeCollapsedRed]}>
                      <Text style={[s.totalBadgeCollapsedNum, enZonaRoja && s.totalBadgeRedNum]}>{total.toLocaleString("es-AR")}</Text>
                      <Text style={[s.totalBadgeCollapsedLabel, enZonaRoja && s.totalBadgeRedLabel]}>TOTAL</Text>
                    </View>
                  )}
                  {!isCollapsed && (
                    <View style={[s.totalBadge, enZonaRoja && s.totalBadgeCollapsedRed]}>
                      <Text style={[s.totalBadgeNum, enZonaRoja && s.totalBadgeRedNum]}>{total.toLocaleString("es-AR")}</Text>
                      <Text style={[s.totalBadgeLabel, enZonaRoja && s.totalBadgeRedLabel]}>L total</Text>
                    </View>
                  )}
                  <Text style={s.chevron}>{isCollapsed ? "▶" : "▼"}</Text>
                </View>
              </TouchableOpacity>

              {/* Contenido expandido */}
              {!isCollapsed && (
                <>
                  {/* Vencimientos */}
                  {vencActivos.length > 0 && (
                    <View style={s.vencList}>
                      {vencActivos
                        .slice()
                        .sort((a, b) => a.fecha.localeCompare(b.fecha))
                        .map((v) => (
                        <View key={v.id} style={s.vencRow}>
                          <View style={s.vencInfo}>
                            <Text style={s.vencFecha}>Vence: {formatFecha(v.fecha)}</Text>
                            <Text style={s.vencLitros}>{v.litros.toLocaleString("es-AR")} L</Text>
                          </View>
                          <TouchableOpacity
                            style={s.consumirBtn}
                            onPress={() => {
                              setEditVenc({ quimicoId: q.id, vencId: v.id, litrosActual: v.litros, fecha: v.fecha });
                              setEditLitrosDelta("");
                              setEditError("");
                            }}
                          >
                            <Text style={s.consumirBtnText}>Consumir</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {vencActivos.length === 0 && (
                    <Text style={s.sinStockText}>Sin stock disponible</Text>
                  )}

                  {/* Configurar stock mínimo */}
                  <TouchableOpacity
                    style={s.stockMinBtn}
                    onPress={() => {
                      setStockMinimoModal({ quimicoId: q.id, nombre: q.nombre, actual: q.stockMinimo });
                      setStockMinimoInput(q.stockMinimo !== undefined ? String(q.stockMinimo) : "");
                      setStockMinError("");
                    }}
                  >
                    <Text style={s.stockMinBtnText}>
                      🚨 Stock mínimo: {q.stockMinimo !== undefined ? `${q.stockMinimo} L` : "No configurado"}
                    </Text>
                  </TouchableOpacity>

                  {/* Agregar vencimiento */}
                  <TouchableOpacity
                    style={s.addVencBtn}
                    onPress={() => { setVencModal({ quimicoId: q.id, nombre: q.nombre }); setVFecha(""); setVLitros(""); setVError(""); }}
                  >
                    <Text style={s.addVencBtnText}>+ Agregar tanda / vencimiento</Text>
                  </TouchableOpacity>

                  {/* Botón borrar — solo visible expandido */}
                  <TouchableOpacity
                    style={s.deleteBtnExpanded}
                    onPress={() => setDeleteQ(q)}
                  >
                    <Text style={s.deleteBtnExpandedText}>🗑️ Eliminar químico</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal nuevo químico ── */}
      <Modal visible={showNuevo} transparent animationType="fade" onRequestClose={() => { setShowNuevo(false); setNNombre(""); setNDesc(""); setNStockMinimo(""); setNError(""); }}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Nuevo químico</Text>

            <Text style={s.label}>Nombre *</Text>
            <TextInput
              value={nNombre}
              onChangeText={setNNombre}
              placeholder="Ej: Revelador, Fijador…"
              placeholderTextColor={COLORS.muted}
              style={s.input}
            />

            <Text style={s.label}>Descripción (opcional)</Text>
            <TextInput
              value={nDesc}
              onChangeText={setNDesc}
              placeholder="Ej: Para procesar B&N"
              placeholderTextColor={COLORS.muted}
              style={s.input}
            />

            <Text style={s.label}>🚨 Stock mínimo en Litros (opcional)</Text>
            <TextInput
              value={nStockMinimo}
              onChangeText={setNStockMinimo}
              placeholder="Ej: 10 (alerta cuando baje a este valor)"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
            />

            {!!nError && <Text style={s.errorText}>{nError}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => { setShowNuevo(false); setNNombre(""); setNDesc(""); setNStockMinimo(""); setNError(""); }}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={guardarNuevoQuimico} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal agregar vencimiento ── */}
      <Modal visible={!!vencModal} transparent animationType="fade" onRequestClose={() => setVencModal(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Nueva tanda</Text>
            {!!vencModal && <Text style={s.modalSubtitle}>{vencModal.nombre}</Text>}

            <Text style={s.label}>Fecha de vencimiento (DD-MM-AAAA)</Text>
            <TextInput
              value={vFecha}
              onChangeText={(text) => {
                // Auto-formato: solo dígitos + guiones
                const digits = text.replace(/\D/g, "").slice(0, 8);
                let formatted = digits;
                if (digits.length > 2) formatted = digits.slice(0,2) + "-" + digits.slice(2);
                if (digits.length > 4) formatted = digits.slice(0,2) + "-" + digits.slice(2,4) + "-" + digits.slice(4);
                setVFecha(formatted);
              }}
              placeholder="31-12-2025"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="numeric"
              autoCorrect={false}
              maxLength={10}
            />

            <Text style={s.label}>Litros</Text>
            <TextInput
              value={vLitros}
              onChangeText={setVLitros}
              placeholder="Ej: 20"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
            />

            {!!vError && <Text style={s.errorText}>{vError}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setVencModal(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={guardarVencimiento} disabled={savingV}>
                {savingV ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal consumir litros ── */}
      <Modal visible={!!editVenc} transparent animationType="fade" onRequestClose={() => setEditVenc(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Consumir litros</Text>
            {!!editVenc && (
              <Text style={s.modalSubtitle}>
                Vence: {formatFecha(editVenc.fecha)} · Stock actual: {editVenc.litrosActual} L
              </Text>
            )}

            <Text style={s.label}>Litros a descontar</Text>
            <TextInput
              value={editLitrosDelta}
              onChangeText={setEditLitrosDelta}
              placeholder="Ej: 5"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
              autoFocus
            />

            {!!editError && <Text style={s.errorText}>{editError}</Text>}

            {editVenc && parseFloat(editLitrosDelta.replace(",", ".")) > 0 &&
              editVenc.litrosActual - parseFloat(editLitrosDelta.replace(",", ".")) === 0 && (
              <View style={s.warningBox}>
                <Text style={s.warningText}>⚠️ Al llegar a 0 L este vencimiento se eliminará automáticamente.</Text>
              </View>
            )}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setEditVenc(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnWarning} onPress={guardarEditLitros} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Descontar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal confirmar borrar químico ── */}
      <Modal visible={!!deleteQ} transparent animationType="fade" onRequestClose={() => setDeleteQ(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Eliminar químico</Text>
            <Text style={s.confirmText}>
              ¿Querés eliminar <Text style={{ fontWeight: "900" }}>{deleteQ?.nombre}</Text> y todos sus vencimientos?
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setDeleteQ(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnDanger} onPress={() => deleteQ && borrarQuimico(deleteQ)}>
                <Text style={s.btnPrimaryText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal stock mínimo ── */}
      <Modal visible={!!stockMinimoModal} transparent animationType="fade" onRequestClose={() => setStockMinimoModal(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>🚨 Stock mínimo</Text>
            {!!stockMinimoModal && <Text style={s.modalSubtitle}>{stockMinimoModal.nombre}</Text>}
            <Text style={s.label}>Litros mínimos de alerta</Text>
            <TextInput
              value={stockMinimoInput}
              onChangeText={setStockMinimoInput}
              placeholder="Ej: 10 (dejá vacío para quitar)"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={s.stockMinHint}>
              <Text style={s.stockMinHintText}>Cuando el total del químico esté en este valor o menos, la card se marcará en rojo como alerta de poco stock.</Text>
            </View>
            {!!stockMinError && <Text style={s.errorText}>{stockMinError}</Text>}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setStockMinimoModal(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnDanger} onPress={guardarStockMinimo} disabled={savingStockMin}>
                {savingStockMin ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Guardar</Text>}
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
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    ...THEME.shadow.soft,
  },
  addBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  // Buscador
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "500",
    paddingVertical: 0,
  },
  clearBtn: { padding: 4 },
  clearBtnText: { fontSize: 13, color: COLORS.muted, fontWeight: "700" },

  // Collapse
  chevron: { fontSize: 11, color: COLORS.muted, fontWeight: "900", marginLeft: 4 },
  cardDescCollapsed: { fontSize: 11, color: COLORS.muted, marginTop: 2, fontWeight: "600" },

  // Empty
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  emptySubtitle: { fontSize: 13, color: COLORS.muted, textAlign: "center", lineHeight: 20 },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...THEME.shadow.soft,
  },
  cardRed: {
    backgroundColor: Platform.OS === "web" ? "var(--danger-soft, #FFF5F5)" : "#FFF5F5",
    borderColor: Platform.OS === "web" ? "var(--danger, #FCA5A5)" : "#FCA5A5",
    borderWidth: 1.5,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardTitleRed: { color: COLORS.danger },
  bajoBadge: {
    backgroundColor: Platform.OS === "web" ? "var(--danger-soft, #FEE2E2)" : "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--danger, #FCA5A5)" : "#FCA5A5",
  },
  bajoBadgeText: { fontSize: 10, fontWeight: "800", color: COLORS.danger, letterSpacing: 0.3 },
  totalBadgeCollapsedRed: {
    backgroundColor: Platform.OS === "web" ? "var(--danger-soft, #FEE2E2)" : "#FEE2E2",
    borderColor: Platform.OS === "web" ? "var(--danger, #FCA5A5)" : "#FCA5A5",
  },
  totalBadgeRedNum: { color: COLORS.danger },
  totalBadgeRedLabel: { color: COLORS.danger },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  cardTitleWrap: { flex: 1, paddingRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  cardDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2, fontWeight: "500" },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  totalBadge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalBadgeNum: { fontSize: 16, fontWeight: "900", color: COLORS.primary },
  totalBadgeLabel: { fontSize: 10, color: COLORS.muted, fontWeight: "700" },
  // Badge total en modo colapsado (diferenciado: gris/slate)
  totalBadgeCollapsed: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalBadgeCollapsedNum: { fontSize: 13, fontWeight: "900", color: COLORS.text },
  totalBadgeCollapsedLabel: { fontSize: 9, color: COLORS.muted, fontWeight: "700", letterSpacing: 0.5 },
  // Litros resaltados en la línea collapsed
  cardDescCollapsedLitros: { fontWeight: "800", color: COLORS.text },
  deleteIconBtn: { padding: 6 },
  deleteIcon: { fontSize: 18 },
  deleteBtnExpanded: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: COLORS.bg,
  },
  deleteBtnExpandedText: { fontSize: 13, fontWeight: "700", color: COLORS.danger },

  // Vencimientos
  vencList: { gap: 8 },
  vencRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  vencInfo: { flex: 1 },
  vencFecha: { fontSize: 12, color: COLORS.muted, fontWeight: "600" },
  vencLitros: { fontSize: 18, fontWeight: "900", color: COLORS.text, marginTop: 2 },
  consumirBtn: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FEF3C7)" : "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--warning-border, #FDE68A)" : "#FDE68A",
  },
  consumirBtnText: { fontSize: 12, fontWeight: "800", color: Platform.OS === "web" ? "var(--warning, #92400E)" : "#92400E" },

  sinStockText: { fontSize: 12, color: COLORS.muted, fontStyle: "italic", textAlign: "center" },

  stockMinBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bg,
    alignItems: "center",
  },
  stockMinBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.text },
  stockMinHint: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FFF7ED)" : "#FFF7ED",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--warning-border, #FED7AA)" : "#FED7AA",
  },
  stockMinHintText: { fontSize: 12, color: Platform.OS === "web" ? "var(--warning, #92400E)" : "#92400E", fontWeight: "500", lineHeight: 18 },
  addVencBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  addVencBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },

  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 440,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  modalSubtitle: { fontSize: 13, color: COLORS.muted, fontWeight: "600", marginTop: -6 },
  label: { fontSize: 12, fontWeight: "800", color: COLORS.text, textTransform: "uppercase", letterSpacing: 0.5 },
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
  errorText: { fontSize: 12, color: COLORS.danger, fontWeight: "600" },
  confirmText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  warningBox: {
    backgroundColor: Platform.OS === "web" ? "var(--warning-bg, #FFF7ED)" : "#FFF7ED",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--warning-border, #FED7AA)" : "#FED7AA",
  },
  warningText: { fontSize: 12, color: Platform.OS === "web" ? "var(--warning, #92400E)" : "#92400E", fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },

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
  btnWarning: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "var(--warning, #D97706)" : "#D97706",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDanger: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  noticeCard: {
    backgroundColor: Platform.OS === "web" ? "var(--info-bg, #EFF6FF)" : "#EFF6FF",
    borderColor: Platform.OS === "web" ? "var(--info-border, #BFDBFE)" : "#BFDBFE",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    ...THEME.shadow.soft,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Platform.OS === "web" ? "var(--info, #1E40AF)" : "#1E40AF",
  },
  noticeText: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
    fontWeight: "500",
  },
});

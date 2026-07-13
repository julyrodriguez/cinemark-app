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
  cantidad: number;
};

type Producto = {
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

function totalCantidad(v: Vencimiento[]) {
  return v.reduce((s, x) => s + x.cantidad, 0);
}

// Devuelve la fecha ISO más próxima con cantidad > 0, o "9999-99-99" si no hay
function proximoVencimiento(p: Producto): string {
  const activos = p.vencimientos.filter((v) => v.cantidad > 0).map((v) => v.fecha).sort();
  return activos[0] ?? "9999-99-99";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoordinadoresProximamenteScreen() {
  const { cineId } = useAuthUser();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);

  // ── búsqueda y collapse ──
  const [busqueda, setBusqueda] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── nuevo producto ──
  const [showNuevo, setShowNuevo] = useState(false);
  const [nNombre, setNNombre] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nStockMinimo, setNStockMinimo] = useState("");
  const [saving, setSaving] = useState(false);
  const [nError, setNError] = useState("");

  // ── nuevo vencimiento ──
  const [vencModal, setVencModal] = useState<{ productoId: string; nombre: string } | null>(null);
  const [vFecha, setVFecha] = useState("");
  const [vCantidad, setVCantidad] = useState("");
  const [vError, setVError] = useState("");
  const [savingV, setSavingV] = useState(false);

  // ── editar cantidad ──
  const [editVenc, setEditVenc] = useState<{
    productoId: string;
    vencId: string;
    cantidadActual: number;
    fecha: string;
  } | null>(null);
  const [editCantidadDelta, setEditCantidadDelta] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ── borrar producto ──
  const [deleteP, setDeleteP] = useState<Producto | null>(null);

  // ── stock mínimo ──
  const [stockMinimoModal, setStockMinimoModal] = useState<{ productoId: string; nombre: string; actual: number | undefined } | null>(null);
  const [stockMinimoInput, setStockMinimoInput] = useState("");
  const [savingStockMin, setSavingStockMin] = useState(false);
  const [stockMinError, setStockMinError] = useState("");

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchProductos = useCallback(async () => {
    if (!cineId) { setLoading(false); return; }
    setLoading(true);
    try {
      const pCol = collection(db, CINES_COLLECTION, cineId, "productos");
      const pSnap = await getDocs(query(pCol, orderBy("nombre", "asc")));

      const rows: Producto[] = await Promise.all(
        pSnap.docs.map(async (d) => {
          const data = d.data() as any;
          const vCol = collection(db, CINES_COLLECTION, cineId, "productos", d.id, "vencimientos");
          const vSnap = await getDocs(query(vCol, orderBy("fecha", "asc")));
          const vencimientos: Vencimiento[] = vSnap.docs.map((v) => ({
            id: v.id,
            fecha: (v.data() as any).fecha ?? "",
            cantidad: Number((v.data() as any).cantidad ?? 0),
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
      setProductos(rows);
      // Inicializar todos colapsados al cargar
      const allCollapsed: Record<string, boolean> = {};
      rows.forEach((p) => { allCollapsed[p.id] = true; });
      setCollapsed(allCollapsed);
    } catch (e) {
      console.error("fetchProductos:", e);
    } finally {
      setLoading(false);
    }
  }, [cineId]);

  useEffect(() => { fetchProductos(); }, [fetchProductos]);

  // ─── Crear producto ──────────────────────────────────────────────────────────

  const guardarNuevoProducto = async () => {
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
      await addDoc(collection(db, CINES_COLLECTION, cineId, "productos"), payload);
      setShowNuevo(false);
      setNNombre(""); setNDesc(""); setNStockMinimo("");
      fetchProductos();
    } catch (e: any) {
      setNError(e?.message ?? "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Borrar producto ─────────────────────────────────────────────────────────

  const borrarProducto = async (p: Producto) => {
    if (!cineId) return;
    try {
      // borrar subcolección vencimientos primero
      for (const v of p.vencimientos) {
        await deleteDoc(doc(db, CINES_COLLECTION, cineId, "productos", p.id, "vencimientos", v.id));
      }
      await deleteDoc(doc(db, CINES_COLLECTION, cineId, "productos", p.id));
      setDeleteP(null);
      fetchProductos();
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
    const cantidadNum = parseFloat(vCantidad.replace(",", "."));
    if (isNaN(cantidadNum) || cantidadNum <= 0) { setVError("Cantidad debe ser un número mayor a 0."); return; }

    setSavingV(true);
    try {
      await addDoc(
        collection(db, CINES_COLLECTION, cineId, "productos", vencModal.productoId, "vencimientos"),
        { fecha: fechaISO, cantidad: cantidadNum }
      );
      setVencModal(null); setVFecha(""); setVCantidad("");
      fetchProductos();
    } catch (e: any) {
      setVError(e?.message ?? "Error al guardar.");
    } finally {
      setSavingV(false);
    }
  };

  // ─── Editar / descontar cantidad ──────────────────────────────────────────

  const guardarEditCantidad = async () => {
    setEditError("");
    if (!editVenc || !cineId) return;
    const delta = parseFloat(editCantidadDelta.replace(",", "."));
    if (isNaN(delta) || delta <= 0) { setEditError("Ingresá un número positivo a descontar."); return; }
    const nuevos = editVenc.cantidadActual - delta;
    if (nuevos < 0) { setEditError(`No podés descontar más de ${editVenc.cantidadActual} U.`); return; }

    setSavingEdit(true);
    try {
      const ref = doc(db, CINES_COLLECTION, cineId, "productos", editVenc.productoId, "vencimientos", editVenc.vencId);
      if (nuevos === 0) {
        await deleteDoc(ref);
      } else {
        await updateDoc(ref, { cantidad: nuevos });
      }
      const productoIdGuardado = editVenc.productoId;
      setEditVenc(null); setEditCantidadDelta("");
      fetchProductos();
      // Notificar bajo stock en segundo plano (fire-and-forget)
      try {
        const notificar = httpsCallable(functions, "notificarBajoStockProducto");
        notificar({ cineId, productoId: productoIdGuardado }).catch(() => {});
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
      const ref = doc(db, CINES_COLLECTION, cineId, "productos", stockMinimoModal.productoId);
      if (num === null) {
        await updateDoc(ref, { stockMinimo: null });
      } else {
        await updateDoc(ref, { stockMinimo: num });
      }
      setStockMinimoModal(null);
      setStockMinimoInput("");
      fetchProductos();
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
        <Text style={s.loadingText}>Cargando productos…</Text>
      </View>
    );
  }

  // ── Lista filtrada y ordenada ──
  const listaFiltrada = productos
    .filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase().trim()))
    .slice()
    .sort((a, b) => proximoVencimiento(a).localeCompare(proximoVencimiento(b)));

  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.pageSubtitle}>{productos.length} producto{productos.length !== 1 ? "s" : ""} registrado{productos.length !== 1 ? "s" : ""}</Text>
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
            placeholder="Buscar producto…"
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

        {productos.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyTitle}>Sin productos registrados</Text>
            <Text style={s.emptySubtitle}>Presioná "+ Nuevo" para agregar el primer producto.</Text>
          </View>
        )}

        {productos.length > 0 && listaFiltrada.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>Sin resultados</Text>
            <Text style={s.emptySubtitle}>No hay productos que coincidan con "{busqueda}".</Text>
          </View>
        )}

        {listaFiltrada.map((p) => {
          const total = totalCantidad(p.vencimientos);
          const vencActivos = p.vencimientos.filter((v) => v.cantidad > 0);
          const isCollapsed = !!collapsed[p.id];
          const proxVenc = vencActivos.length > 0 ? vencActivos.sort((a,b) => a.fecha.localeCompare(b.fecha))[0] : null;
          const enZonaRoja = p.stockMinimo !== undefined && p.stockMinimo > 0 && total <= p.stockMinimo;

          return (
            <View key={p.id} style={[s.card, enZonaRoja && s.cardRed]}>
              {/* Card header — siempre visible, toca para colapsar */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggleCollapse(p.id)}
                style={s.cardHeader}
              >
                <View style={s.cardTitleWrap}>
                  <View style={s.cardTitleRow}>
                    <Text style={[s.cardTitle, enZonaRoja && s.cardTitleRed]}>{p.nombre}</Text>
                    {enZonaRoja && <View style={s.bajoBadge}><Text style={s.bajoBadgeText}>⚠️ BAJO STOCK</Text></View>}
                  </View>
                  {isCollapsed && proxVenc && (
                    <Text style={s.cardDescCollapsed}>
                      📅 Vence: {formatFecha(proxVenc.fecha)} · <Text style={s.cardDescCollapsedCant}>{proxVenc.cantidad.toLocaleString("es-AR")} U</Text>
                    </Text>
                  )}
                  {!isCollapsed && !!p.descripcion && (
                    <Text style={s.cardDesc}>{p.descripcion}</Text>
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
                      <Text style={[s.totalBadgeLabel, enZonaRoja && s.totalBadgeRedLabel]}>U total</Text>
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
                            <Text style={s.vencCant}>{v.cantidad.toLocaleString("es-AR")} U</Text>
                          </View>
                          <TouchableOpacity
                            style={s.consumirBtn}
                            onPress={() => {
                              setEditVenc({ productoId: p.id, vencId: v.id, cantidadActual: v.cantidad, fecha: v.fecha });
                              setEditCantidadDelta("");
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
                      setStockMinimoModal({ productoId: p.id, nombre: p.nombre, actual: p.stockMinimo });
                      setStockMinimoInput(p.stockMinimo !== undefined ? String(p.stockMinimo) : "");
                      setStockMinError("");
                    }}
                  >
                    <Text style={s.stockMinBtnText}>
                      🚨 Stock mínimo: {p.stockMinimo !== undefined ? `${p.stockMinimo} U` : "No configurado"}
                    </Text>
                  </TouchableOpacity>

                  {/* Agregar vencimiento */}
                  <TouchableOpacity
                    style={s.addVencBtn}
                    onPress={() => { setVencModal({ productoId: p.id, nombre: p.nombre }); setVFecha(""); setVCantidad(""); setVError(""); }}
                  >
                    <Text style={s.addVencBtnText}>+ Agregar tanda / vencimiento</Text>
                  </TouchableOpacity>

                  {/* Botón borrar — solo visible expandido */}
                  <TouchableOpacity
                    style={s.deleteBtnExpanded}
                    onPress={() => setDeleteP(p)}
                  >
                    <Text style={s.deleteBtnExpandedText}>🗑️ Eliminar producto</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal nuevo producto ── */}
      <Modal visible={showNuevo} transparent animationType="fade" onRequestClose={() => { setShowNuevo(false); setNNombre(""); setNDesc(""); setNStockMinimo(""); setNError(""); }}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Nuevo producto</Text>

            <Text style={s.label}>Nombre *</Text>
            <TextInput
              value={nNombre}
              onChangeText={setNNombre}
              placeholder="Ej: Lentes 3D, Vasos…"
              placeholderTextColor={COLORS.muted}
              style={s.input}
            />

            <Text style={s.label}>Descripción (opcional)</Text>
            <TextInput
              value={nDesc}
              onChangeText={setNDesc}
              placeholder="Ej: Descartables para Candy"
              placeholderTextColor={COLORS.muted}
              style={s.input}
            />

            <Text style={s.label}>🚨 Stock mínimo en Unidades (opcional)</Text>
            <TextInput
              value={nStockMinimo}
              onChangeText={setNStockMinimo}
              placeholder="Ej: 50 (alerta cuando baje a este valor)"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
            />

            {!!nError && <Text style={s.errorText}>{nError}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => { setShowNuevo(false); setNNombre(""); setNDesc(""); setNStockMinimo(""); setNError(""); }}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={guardarNuevoProducto} disabled={saving}>
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

            <Text style={s.label}>Cantidad (Unidades)</Text>
            <TextInput
              value={vCantidad}
              onChangeText={setVCantidad}
              placeholder="Ej: 100"
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

      {/* ── Modal consumir cantidad ── */}
      <Modal visible={!!editVenc} transparent animationType="fade" onRequestClose={() => setEditVenc(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Consumir unidades</Text>
            {!!editVenc && (
              <Text style={s.modalSubtitle}>
                Vence: {formatFecha(editVenc.fecha)} · Stock actual: {editVenc.cantidadActual} U
              </Text>
            )}

            <Text style={s.label}>Unidades a descontar</Text>
            <TextInput
              value={editCantidadDelta}
              onChangeText={setEditCantidadDelta}
              placeholder="Ej: 10"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
              autoFocus
            />

            {!!editError && <Text style={s.errorText}>{editError}</Text>}

            {editVenc && parseFloat(editCantidadDelta.replace(",", ".")) > 0 &&
              editVenc.cantidadActual - parseFloat(editCantidadDelta.replace(",", ".")) === 0 && (
              <View style={s.warningBox}>
                <Text style={s.warningText}>⚠️ Al llegar a 0 U este vencimiento se eliminará automáticamente.</Text>
              </View>
            )}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setEditVenc(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnWarning} onPress={guardarEditCantidad} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>Descontar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal confirmar borrar producto ── */}
      <Modal visible={!!deleteP} transparent animationType="fade" onRequestClose={() => setDeleteP(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Eliminar producto</Text>
            <Text style={s.confirmText}>
              ¿Querés eliminar <Text style={{ fontWeight: "900" }}>{deleteP?.nombre}</Text> y todos sus vencimientos?
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnGhost} onPress={() => setDeleteP(null)}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnDanger} onPress={() => deleteP && borrarProducto(deleteP)}>
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
            <Text style={s.label}>Unidades mínimas de alerta</Text>
            <TextInput
              value={stockMinimoInput}
              onChangeText={setStockMinimoInput}
              placeholder="Ej: 50 (dejá vacío para quitar)"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={s.stockMinHint}>
              <Text style={s.stockMinHintText}>Cuando el total del producto esté en este valor o menos, la card se marcará en rojo como alerta de poco stock.</Text>
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
  // Cantidad resaltada en la línea collapsed
  cardDescCollapsedCant: { fontWeight: "800", color: COLORS.text },
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
  vencCant: { fontSize: 18, fontWeight: "900", color: COLORS.text, marginTop: 2 },
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

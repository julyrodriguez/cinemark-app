import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  QueryDocumentSnapshot,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { CINES_COLLECTION, db } from "@/lib/firebaseConfig";
import { COLORS, THEME } from "@/lib/theme";
import { useAuthUser } from "@/lib/useAuthUser";
import PageContainer from "@/components/PageContainer";
import SectionCard from "@/components/SectionCard";
import {
  formatDateInput,
  formatTimeInput,
  parseWebDate,
  parseWebTime,
  horaCorta,
  todayAt,
  toDate,
  DIAS_SEMANA_FULL,
  MESES_ABBR,
} from "@/shared/utils";

// Alias para compatibilidad con código existente
const diasFull = DIAS_SEMANA_FULL;
const mesesAbbr = MESES_ABBR;

// Funciones de utilidad ahora importadas desde @/shared/utils

type Evento = {
  id: string;
  cineId: string;
  cineNombre: string;
  pelicula: string;
  sala: string;
  diaHora: Date;
  kdm?: boolean;
  dcp?: boolean;
  desayuno?: boolean;
  combo?: boolean;
  createdAt?: any;
};

type Cine = {
  cineId: string;
  nombre: string;
  active: boolean;
};

export default function OficinasEventosScreen() {
  const { isOficinas, loading: sessionLoading } = useAuthUser();

  const [cines, setCines] = useState<Cine[]>([]);
  const [cinesLoading, setCinesLoading] = useState(true);
  const [selectedCineId, setSelectedCineId] = useState<string | null>(null);

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<Evento | null>(null);
  const [cinePickerVisible, setCinePickerVisible] = useState(false);

  const [cPelicula, setCPelicula] = useState("");
  const [cSala, setCSala] = useState("");
  const [cFechaWeb, setCFechaWeb] = useState(formatDateInput(todayAt(11)));
  const [cHoraWeb, setCHoraWeb] = useState(formatTimeInput(todayAt(11)));
  const [cFechaNative, setCFechaNative] = useState(todayAt(11));
  const [cHoraNative, setCHoraNative] = useState(todayAt(11));
  const [cShowDatePicker, setCShowDatePicker] = useState(false);
  const [cShowTimePicker, setCShowTimePicker] = useState(false);
  const [cDesayuno, setCDesayuno] = useState(false);
  const [cCombo, setCCombo] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [salasDisponibles, setSalasDisponibles] = useState<number>(0);
  const [cCineId, setCCineId] = useState("");
  const [cLoadingSalas, setCLoadingSalas] = useState(false);

  const [eDesayuno, setEDesayuno] = useState(false);
  const [eCombo, setECombo] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (!sessionLoading && isOficinas) {
      loadCines();
    }
  }, [sessionLoading, isOficinas]);

  useEffect(() => {
    if (selectedCineId && cines.length > 0) {
      loadEventos(selectedCineId);
    }
  }, [selectedCineId, cines]);

  useEffect(() => {
    if (cCineId) {
      loadSalasDelCine(cCineId);
    }
  }, [cCineId]);

  const loadSalasDelCine = async (cineId: string) => {
    try {
      setCLoadingSalas(true);
      const configRef = doc(db, CINES_COLLECTION, cineId, "info", "config");
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        const data = configSnap.data();
        setSalasDisponibles(data?.salas || 0);
      } else {
        setSalasDisponibles(0);
      }
    } catch (e) {
      console.error("Error loading salas:", e);
      setSalasDisponibles(0);
    } finally {
      setCLoadingSalas(false);
    }
  };

  const loadCines = async () => {
    try {
      setCinesLoading(true);
      const cinesSnap = await getDocs(collection(db, CINES_COLLECTION));
      const cinesList: Cine[] = [];
      cinesSnap.forEach((doc) => {
        const data = doc.data();
        if (doc.id !== "oficinas" && doc.id !== "cinemarkproyecto") {
          cinesList.push({
            cineId: doc.id,
            nombre: data.nombre || doc.id,
            active: data.active !== false,
          });
        }
      });
      cinesList.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setCines(cinesList);
      if (cinesList.length > 0 && !selectedCineId) {
        setSelectedCineId(cinesList[0].cineId);
      }
    } catch (e) {
      console.error("Error loading cines:", e);
    } finally {
      setCinesLoading(false);
    }
  };

  const loadEventos = async (cineId: string) => {
    try {
      setLoading(true);
      const colRef = collection(db, CINES_COLLECTION, cineId, "eventos");
      const now = new Date();
      const threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const q = query(colRef, where("diaHora", ">=", threshold), orderBy("diaHora", "asc"));
      const snap = await getDocs(q);

      const evts: Evento[] = [];
      const cineNombre = cines.find((c) => c.cineId === cineId)?.nombre || cineId;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        evts.push({
          id: docSnap.id,
          cineId,
          cineNombre,
          pelicula: data.pelicula || "",
          sala: data.sala || "",
          diaHora: toDate(data.diaHora),
          kdm: !!data.kdm,
          dcp: !!data.dcp,
          desayuno: !!data.desayuno,
          combo: !!data.combo,
          createdAt: data.createdAt,
        });
      });

      setEventos(evts);
    } catch (e) {
      console.error("Error loading eventos:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvento = async () => {
    if (!cCineId) {
      return;
    }

    if (createLoading) return;

    let finalDate: Date;
    if (Platform.OS === "web") {
      const [y, m, d] = cFechaWeb.split("-").map(Number);
      const [hh, mm] = cHoraWeb.split(":").map(Number);
      finalDate = new Date(y, m - 1, d, hh, mm);
    } else {
      const y = cFechaNative.getFullYear();
      const m = cFechaNative.getMonth();
      const d = cFechaNative.getDate();
      const hh = cHoraNative.getHours();
      const mm = cHoraNative.getMinutes();
      finalDate = new Date(y, m, d, hh, mm);
    }

    try {
      setCreateLoading(true);
      const colRef = collection(db, CINES_COLLECTION, cCineId, "eventos");
      await addDoc(colRef, {
        pelicula: cPelicula.trim(),
        sala: cSala.trim(),
        diaHora: Timestamp.fromDate(finalDate),
        kdm: false,
        dcp: false,
        desayuno: cDesayuno,
        combo: cCombo,
        createdAt: Timestamp.now(),
      });

      setCPelicula("");
      setCSala("");
      setCFechaWeb(formatDateInput(todayAt(11)));
      setCHoraWeb(formatTimeInput(todayAt(11)));
      setCFechaNative(todayAt(11));
      setCHoraNative(todayAt(11));
      setCDesayuno(false);
      setCCombo(false);
      setCreateModalVisible(false);

      if (selectedCineId === cCineId) {
        await loadEventos(cCineId);
      }
    } catch (e) {
      console.error(e);
      alert("Error al crear evento.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditEvento = async () => {
    if (!editItem || editLoading) return;

    try {
      setEditLoading(true);
      const docRef = doc(db, CINES_COLLECTION, editItem.cineId, "eventos", editItem.id);
      await updateDoc(docRef, {
        desayuno: eDesayuno,
        combo: eCombo,
      });

      setEditModalVisible(false);
      setEditItem(null);
      await loadEventos(editItem.cineId);
    } catch (e) {
      console.error("Error updating evento:", e);
      alert("Error al actualizar evento");
    } finally {
      setEditLoading(false);
    }
  };

  const openEditModal = (evento: Evento) => {
    setEditItem(evento);
    setEDesayuno(!!evento.desayuno);
    setECombo(!!evento.combo);
    setEditModalVisible(true);
  };

  const renderEvento = ({ item }: { item: Evento }) => {
    const d = item.diaHora;
    const dia = diasFull[d.getDay()];
    const mes = mesesAbbr[d.getMonth()];
    const fecha = `${dia} ${d.getDate()} ${mes}`;
    const hora = horaCorta(d);

    return (
      <SectionCard style={{ marginBottom: 12 }}>
        <View style={s.eventoRow}>
          <View style={s.eventoInfo}>
            <Text style={s.eventoPelicula}>{item.pelicula}</Text>
            <Text style={s.eventoDetalle}>
              Sala {item.sala} • {fecha} {hora}
            </Text>
            <View style={s.eventoBadges}>
              {item.dcp && <View style={s.badge}><Text style={s.badgeText}>DCP</Text></View>}
              {item.kdm && <View style={s.badge}><Text style={s.badgeText}>KDM</Text></View>}
              {item.desayuno && <View style={[s.badge, s.badgeSuccess]}><Text style={s.badgeText}>Desayuno</Text></View>}
              {item.combo && <View style={[s.badge, s.badgeSuccess]}><Text style={s.badgeText}>Combo</Text></View>}
            </View>
          </View>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => openEditModal(item)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="pencil" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </SectionCard>
    );
  };

  if (sessionLoading || cinesLoading) {
    return (
      <View style={s.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isOficinas) {
    return (
      <View style={s.loadingScreen}>
        <Text style={s.errorText}>Acceso denegado. Requiere rol oficinas.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <PageContainer>
        <SectionCard style={{ marginBottom: 16 }}>
          <View style={s.header}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={s.label}>Seleccionar Cine</Text>
              <View style={s.selectContainer}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {cines.map((cine) => (
                    <TouchableOpacity
                      key={cine.cineId}
                      style={[
                        s.cineChipCompact,
                        selectedCineId === cine.cineId && s.cineChipCompactActive,
                      ]}
                      onPress={() => setSelectedCineId(cine.cineId)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          s.cineChipCompactText,
                          selectedCineId === cine.cineId && s.cineChipCompactTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {cine.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={() => {
                setCCineId(selectedCineId || "");
                setCreateModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={s.btnPrimaryText}>Crear</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator />
            <Text style={s.loadingText}>Cargando eventos...</Text>
          </View>
        ) : eventos.length === 0 ? (
          <SectionCard>
            <Text style={s.emptyText}>No hay eventos esta semana.</Text>
          </SectionCard>
        ) : (
          <FlatList
            data={eventos}
            renderItem={renderEvento}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </PageContainer>

      {/* Modal Crear Evento */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !createLoading && setCreateModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Crear Evento</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
              <Text style={s.label}>Cine</Text>
              <TouchableOpacity
                style={s.selectButton}
                onPress={() => setCinePickerVisible(true)}
                disabled={createLoading}
              >
                <Text style={s.selectButtonText}>
                  {cCineId ? cines.find(c => c.cineId === cCineId)?.nombre || "Seleccionar cine" : "Seleccionar cine"}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.text} />
              </TouchableOpacity>

              <Text style={s.label}>Película</Text>
              <TextInput
                value={cPelicula}
                onChangeText={setCPelicula}
                placeholder="Nombre de la película"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                editable={!createLoading}
              />

              <Text style={s.label}>Sala</Text>
              {cLoadingSalas ? (
                <ActivityIndicator size="small" style={{ marginVertical: 12 }} />
              ) : salasDisponibles > 0 ? (
                <View style={s.pickerContainer}>
                  {Array.from({ length: salasDisponibles }, (_, i) => i + 1).map((sala) => (
                    <TouchableOpacity
                      key={sala}
                      style={[s.pickerOption, cSala === String(sala) && s.pickerOptionActive]}
                      onPress={() => setCSala(String(sala))}
                      activeOpacity={0.8}
                      disabled={createLoading}
                    >
                      <Text style={[s.pickerOptionText, cSala === String(sala) && s.pickerOptionTextActive]}>
                        Sala {sala}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  value={cSala}
                  onChangeText={setCSala}
                  placeholder="Número de sala"
                  placeholderTextColor={COLORS.muted}
                  style={s.input}
                  keyboardType="number-pad"
                  editable={!createLoading}
                />
              )}

                {Platform.OS === "web" ? (
                  <>
                    <Text style={s.label}>Fecha</Text>
                    <TextInput
                      value={cFechaWeb}
                      onChangeText={setCFechaWeb}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={COLORS.muted}
                      style={s.input}
                    />
                    <Text style={s.label}>Hora</Text>
                    <TextInput
                      value={cHoraWeb}
                      onChangeText={setCHoraWeb}
                      placeholder="HH:MM"
                      placeholderTextColor={COLORS.muted}
                      style={s.input}
                    />
                  </>
                ) : (
                  <>
                    <Text style={s.label}>Fecha</Text>
                    <Pressable onPress={() => setCShowDatePicker(true)} style={s.dateButton}>
                      <Text style={s.dateButtonText}>{formatDateInput(cFechaNative)}</Text>
                    </Pressable>
                    {cShowDatePicker && (
                      <DateTimePicker
                        value={cFechaNative}
                        mode="date"
                        display="default"
                        onChange={(e, date) => {
                          setCShowDatePicker(false);
                          if (date) setCFechaNative(date);
                        }}
                      />
                    )}
                    <Text style={s.label}>Hora</Text>
                    <Pressable onPress={() => setCShowTimePicker(true)} style={s.dateButton}>
                      <Text style={s.dateButtonText}>{formatTimeInput(cHoraNative)}</Text>
                    </Pressable>
                    {cShowTimePicker && (
                      <DateTimePicker
                        value={cHoraNative}
                        mode="time"
                        display="default"
                        onChange={(e, date) => {
                          setCShowTimePicker(false);
                          if (date) setCHoraNative(date);
                        }}
                      />
                    )}
                  </>
                )}

              <View style={s.checkboxRow}>
                <TouchableOpacity
                  style={s.checkbox}
                  onPress={() => !createLoading && setCDesayuno(!cDesayuno)}
                  activeOpacity={0.8}
                  disabled={createLoading}
                >
                  <View style={[s.checkboxBox, cDesayuno && s.checkboxBoxActive]}>
                    {cDesayuno && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                  </View>
                  <Text style={s.checkboxLabel}>Desayuno</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.checkbox}
                  onPress={() => !createLoading && setCCombo(!cCombo)}
                  activeOpacity={0.8}
                  disabled={createLoading}
                >
                  <View style={[s.checkboxBox, cCombo && s.checkboxBoxActive]}>
                    {cCombo && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                  </View>
                  <Text style={s.checkboxLabel}>Combo</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.btnPrimary, createLoading && { opacity: 0.5 }]}
                onPress={handleCreateEvento}
                activeOpacity={0.8}
                disabled={createLoading}
              >
                {createLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.btnPrimaryText}>Crear</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => !createLoading && setCreateModalVisible(false)}
                activeOpacity={0.8}
                disabled={createLoading}
              >
                <Text style={s.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Editar Evento (solo combo/desayuno) */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}>
          <View style={s.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Editar Evento</Text>

                {editItem && (
                  <>
                    <Text style={s.eventoPelicula}>{editItem.pelicula}</Text>
                    <Text style={s.eventoDetalle}>Sala {editItem.sala}</Text>
                    <Text style={s.infoText}>Solo podés editar Combo y Desayuno</Text>

                    <View style={s.checkboxRow}>
                      <TouchableOpacity
                        style={s.checkbox}
                        onPress={() => !editLoading && setEDesayuno(!eDesayuno)}
                        activeOpacity={0.8}
                        disabled={editLoading}
                      >
                        <View style={[s.checkboxBox, eDesayuno && s.checkboxBoxActive]}>
                          {eDesayuno && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                        </View>
                        <Text style={s.checkboxLabel}>Desayuno</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={s.checkbox}
                        onPress={() => !editLoading && setECombo(!eCombo)}
                        activeOpacity={0.8}
                        disabled={editLoading}
                      >
                        <View style={[s.checkboxBox, eCombo && s.checkboxBoxActive]}>
                          {eCombo && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                        </View>
                        <Text style={s.checkboxLabel}>Combo</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={s.readOnlySection}>
                      <Text style={s.readOnlyTitle}>Solo lectura:</Text>
                      <Text style={s.readOnlyText}>DCP: {editItem.dcp ? "Sí" : "No"}</Text>
                      <Text style={s.readOnlyText}>KDM: {editItem.kdm ? "Sí" : "No"}</Text>
                    </View>
                  </>
                )}

                <View style={s.modalActions}>
                  <TouchableOpacity
                    style={[s.btnPrimary, editLoading && { opacity: 0.5 }]}
                    onPress={handleEditEvento}
                    activeOpacity={0.8}
                    disabled={editLoading}
                  >
                    {editLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.btnPrimaryText}>Guardar</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.btnSecondary}
                    onPress={() => !editLoading && setEditModalVisible(false)}
                    activeOpacity={0.8}
                    disabled={editLoading}
                  >
                    <Text style={s.btnSecondaryText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Seleccionar Cine */}
      <Modal
        visible={cinePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCinePickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCinePickerVisible(false)}>
          <View style={s.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[s.modalCard, { maxHeight: "80%" }]}>
                <Text style={s.modalTitle}>Seleccionar Cine</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {cines.map((cine) => (
                    <TouchableOpacity
                      key={cine.cineId}
                      style={[s.cinePickerOption, cCineId === cine.cineId && s.cinePickerOptionActive]}
                      onPress={() => {
                        setCCineId(cine.cineId);
                        setCinePickerVisible(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.cinePickerOptionText, cCineId === cine.cineId && s.cinePickerOptionTextActive]}>
                        {cine.nombre}
                      </Text>
                      {cCineId === cine.cineId && (
                        <MaterialCommunityIcons name="check" size={20} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.bg,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.xl,
  },
  loadingText: {
    marginTop: THEME.spacing.sm,
    color: COLORS.muted,
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: "700",
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    marginTop: THEME.spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: THEME.fontSize.sm,
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#e2e8f0",
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
  },
  btnSecondaryText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: THEME.fontSize.sm,
  },
  selectContainer: {
    marginTop: 8,
  },
  cineChipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.md,
    backgroundColor: "#f1f5f9",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  cineChipCompactActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  cineChipCompactText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.muted,
  },
  cineChipCompactTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  eventoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eventoInfo: {
    flex: 1,
  },
  eventoPelicula: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  eventoDetalle: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginBottom: 8,
  },
  eventoBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
  },
  badgeSuccess: {
    backgroundColor: "#d1fae5",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: "#f1caca",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: THEME.spacing.lg,
  },
  label: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    marginTop: THEME.spacing.sm,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: THEME.spacing.sm,
  },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.md,
    backgroundColor: "#f1f5f9",
    borderWidth: 2,
    borderColor: "transparent",
  },
  pickerOptionActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  pickerOptionText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.muted,
  },
  pickerOptionTextActive: {
    color: COLORS.primary,
  },
  pickerOptionCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.md,
    backgroundColor: "#f1f5f9",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    minWidth: 80,
  },
  pickerOptionCompactActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  pickerOptionCompactText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.muted,
  },
  pickerOptionCompactTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  dateButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  dateButtonText: {
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
  },
  checkboxRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxLabel: {
    fontSize: THEME.fontSize.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: THEME.spacing.lg,
  },
  infoText: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    fontStyle: "italic",
    marginVertical: THEME.spacing.sm,
  },
  readOnlySection: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    backgroundColor: "#f8fafc",
    borderRadius: THEME.radius.md,
  },
  readOnlyTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 6,
  },
  readOnlyText: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.text,
    marginBottom: 4,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  selectButtonText: {
    fontSize: THEME.fontSize.md,
    color: COLORS.text,
    flex: 1,
  },
  cinePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cinePickerOptionActive: {
    backgroundColor: COLORS.primarySoft,
  },
  cinePickerOptionText: {
    fontSize: THEME.fontSize.md,
    color: COLORS.text,
    fontWeight: "600",
  },
  cinePickerOptionTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
});

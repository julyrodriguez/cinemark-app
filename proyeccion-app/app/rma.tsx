import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import PageTitle from "@/components/PageTitle";
import { auth, db, CINES_COLLECTION } from "../lib/firebaseConfig";
import { COLORS, THEME } from "../lib/theme";
import { useAuthUser } from "../lib/useAuthUser";

import RmaItem from "../components/rmaItem";
import { Rma } from "../lib/types";

export default function RmaTab({ readOnly = false }: { readOnly?: boolean }) {
  const { user, cineId, loading: sessionLoading, displayName } = useAuthUser();

  const [loading, setLoading] = useState(true);
  const [rmas, setRmas] = useState<Rma[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [rmaNumber, setRmaNumber] = useState("");
  const [incidentNumber, setIncidentNumber] = useState("");
  const [details, setDetails] = useState("");

  const [showMenu, setShowMenu] = useState(false);
  const [menuRma, setMenuRma] = useState<Rma | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rmaToDelete, setRmaToDelete] = useState<Rma | null>(null);

  useEffect(() => {
    let unsub: any;

    (async () => {
      if (sessionLoading) {
        setLoading(true);
        return;
      }
      if (!user || !cineId) {
        setRmas([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, CINES_COLLECTION, cineId, "rma"),
        orderBy("createdAt", "desc")
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          const arr = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as Rma[];

          setRmas(arr);
          setLoading(false);
        },
        (err) => {
          console.error(err);
          setLoading(false);
          Alert.alert("RMA", "No se pudieron cargar los registros.");
        }
      );
    })();

    return () => unsub && unsub();
  }, [user, cineId, sessionLoading]);

  const openNew = () => {
    setRmaNumber("");
    setIncidentNumber("");
    setDetails("");
    setShowForm(true);
  };

  const addRma = async () => {
    if (!user || !cineId) return;

    if (!rmaNumber.trim()) {
      Alert.alert("RMA", "Ingresá el número de RMA (obligatorio).");
      return;
    }

    try {
      const storedDisplayName =
        (await AsyncStorage.getItem("displayName")) ||
        displayName ||
        user.email?.split("@")[0] ||
        "Usuario";

      await addDoc(collection(db, CINES_COLLECTION, cineId, "rma"), {
        rmaNumber: rmaNumber.trim(),
        incidentNumber: incidentNumber.trim() || null,
        details: details.trim() || null,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdName: storedDisplayName,
      });
      setShowForm(false);
      setRmaNumber("");
      setIncidentNumber("");
      setDetails("");
    } catch (e) {
      console.error(e);
      Alert.alert("RMA", "No se pudo crear el RMA.");
    }
  };

  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });

  const openMenuForRma = (r: Rma, e?: any) => {
    if (e && e.nativeEvent) {
      setMenuAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    }
    setMenuRma(r);
    setShowMenu(true);
  };

  const closeMenu = () => {
    setShowMenu(false);
    setMenuRma(null);
  };

  const removeRma = (r: Rma) => {
    setRmaToDelete(r);
    setShowDeleteConfirm(true);
  };

  const confirmRemoveRma = async () => {
    if (!rmaToDelete || !cineId) return;

    try {
      await deleteDoc(
        doc(db, CINES_COLLECTION, cineId, "rma", rmaToDelete.id)
      );
      setShowDeleteConfirm(false);
      setRmaToDelete(null);
    } catch (e) {
      console.error(e);
      Alert.alert("RMA", "No se pudo eliminar.");
    }
  };

  return (
    <View style={{ flex: 1 }}>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={rmas}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.rmaRowWrap}>
              <View style={{ flex: 1 }}>
                <RmaItem
                  item={item}
                  onLongPress={removeRma}
                  COLORS={COLORS}
                  stylesRef={{
                    taskItem: styles.taskItem,
                    taskTitle: styles.taskTitle,
                    taskMeta: styles.taskMeta,
                  }}
                />
              </View>

              {!readOnly && (
                <Pressable
                  onPress={(e) => openMenuForRma(item, e)}
                  style={styles.moreBtn}
                >
                  <Text style={styles.moreBtnText}>⋮</Text>
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Sin RMAs aún</Text>
          }
        />
      )}

      {!readOnly && (
        <TouchableOpacity
          style={styles.fabBR}
          onPress={openNew}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="plus" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={[styles.menuBackdrop, { justifyContent: "flex-start", alignItems: "flex-start" }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuCard, { position: "absolute", top: menuAnchor.y > 10 ? menuAnchor.y : 100, left: menuAnchor.x - 200 > 10 ? menuAnchor.x - 200 : 20 }]}>
                <Pressable
                  style={styles.menuAction}
                  onPress={() => {
                    const r = menuRma;
                    closeMenu();
                    if (r) removeRma(r);
                  }}
                >
                  <Text style={styles.menuDeleteText}>🗑️ Borrar</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowDeleteConfirm(false);
          setRmaToDelete(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Eliminar RMA</Text>

            <Text style={styles.confirmText}>
              {rmaToDelete
                ? `¿Eliminar RMA ${rmaToDelete.rmaNumber}?`
                : "¿Eliminar este RMA?"}
            </Text>

            <View style={styles.modalActionsModern}>
              <TouchableOpacity
                style={styles.cancelBtnModern}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setRmaToDelete(null);
                }}
              >
                <Text style={styles.cancelBtnTextModern}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtnModern}
                onPress={confirmRemoveRma}
              >
                <Text style={styles.deleteBtnTextModern}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showForm}
        animationType="fade"
        transparent
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardModern}>
            <Text style={styles.modalTitleModern}>Nuevo RMA</Text>
            <Text style={styles.modalSubtitleModern}>
              Completá los datos para registrar un nuevo ingreso.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Número de RMA</Text>
              <TextInput
                style={styles.modalInputModern}
                placeholder="Ej: RMA-2548"
                value={rmaNumber}
                onChangeText={setRmaNumber}
                returnKeyType="next"
                autoCapitalize="characters"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Número de incidente</Text>
              <TextInput
                style={styles.modalInputModern}
                placeholder="Opcional"
                value={incidentNumber}
                onChangeText={setIncidentNumber}
                returnKeyType="next"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Detalles</Text>
              <TextInput
                style={[styles.modalInputModern, styles.textAreaModern]}
                placeholder="Agregá una descripción breve..."
                value={details}
                onChangeText={setDetails}
                multiline
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.modalActionsModern}>
              <TouchableOpacity
                style={styles.cancelBtnModern}
                onPress={() => setShowForm(false)}
              >
                <Text style={styles.cancelBtnTextModern}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtnModern} onPress={addRma}>
                <Text style={styles.saveBtnTextModern}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  listContent: {
    padding: 16,
    paddingBottom: 24,
  },

  headerBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  rmaRowWrap: {
    position: "relative",
    marginBottom: 10,
  },

  moreBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  moreBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 16,
  },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.10)",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 16,
  },
  menuCard: {
    width: 170,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  menuAction: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuDeleteText: {
    color: "#b91c1c",
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },

  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: THEME.spacing.sm,
  },
  confirmText: {
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 12,
  },

  modalCardModern: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  modalTitleModern: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  modalSubtitleModern: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },

  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  modalInputModern: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontSize: 15,
  },
  textAreaModern: {
    height: 110,
    textAlignVertical: "top",
  },

  modalActionsModern: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  cancelBtnModern: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  cancelBtnTextModern: {
    color: COLORS.text,
    fontWeight: "700",
  },
  saveBtnModern: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  saveBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  deleteBtnModern: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#b91c1c",
  },
  deleteBtnTextModern: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 24,
  },

  taskItem: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fabBR: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1000,
  },
  taskTitle: {
    fontSize: THEME.fontSize.lg,
    color: COLORS.text,
    fontWeight: "700",
  },
  taskMeta: {
    color: COLORS.muted,
    marginTop: 4,
    fontSize: THEME.fontSize.sm,
  },
});
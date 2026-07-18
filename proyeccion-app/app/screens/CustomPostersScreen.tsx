import React, { useState, useEffect } from "react";
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
  Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  doc,
} from "@/lib/dbService";
import { useAuthUser } from "../../lib/useAuthUser";
import { COLORS, THEME } from "../../lib/theme";
import { db } from "../../lib/firebaseConfig";
import * as DocumentPicker from "expo-document-picker";

interface CustomPoster {
  id: string;
  title: string;
  imageUrl: string;
  createdAt: string;
  createdBy: string;
}

// Helper para convertir ArrayBuffer a Base64 de forma compatible con Web y React Native
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    
    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3 = i + 1 < len ? ((b2 & 15) << 2) | (b3 >> 6) : 64;
    const enc4 = i + 2 < len ? b3 & 63 : 64;
    
    base64 += chars.charAt(enc1) + chars.charAt(enc2) + 
              (enc3 === 64 ? "=" : chars.charAt(enc3)) + 
              (enc4 === 64 ? "=" : chars.charAt(enc4));
  }
  return base64;
}

export default function CustomPostersScreen() {
  const { cineId } = useAuthUser();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 600;

  const [posters, setPosters] = useState<CustomPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
  } | null>(null);

  // Cargar posters de MongoDB
  const loadPosters = async () => {
    try {
      setLoading(true);
      const colRef = collection(db, "cines", "global", "custom_posters");
      const snap = await getDocs(colRef);
      const list: CustomPoster[] = snap.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || "Sin título",
          imageUrl: data.imageUrl || "",
          createdAt: data.createdAt || "",
          createdBy: data.createdBy || "",
        };
      });
      // Ordenar por fecha de creación desc
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPosters(list);
    } catch (e) {
      console.error("Error loading custom posters:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosters();
  }, []);

  // Seleccionar imagen
  const handlePickImage = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const asset = res.assets[0];
      const sizeMB = (asset.size || 0) / (1024 * 1024);

      if (sizeMB > 1.2) {
        Alert.alert(
          "Archivo muy pesado",
          "Por favor elige una imagen de póster de menos de 1MB para optimizar el rendimiento de la aplicación."
        );
        return;
      }

      let buffer: ArrayBuffer;
      const maybeFile = (asset as any).file as File | undefined;
      if (maybeFile && typeof maybeFile.arrayBuffer === "function") {
        buffer = await maybeFile.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        buffer = await response.arrayBuffer();
      }

      const base64 = arrayBufferToBase64(buffer);
      const mimeType = asset.mimeType || "image/jpeg";

      setSelectedFile({
        name: asset.name,
        base64,
        mimeType,
      });
    } catch (e) {
      console.error("Error picking image:", e);
      Alert.alert("Error", "No se pudo cargar el archivo seleccionado.");
    }
  };

  // Crear póster personalizado en MongoDB
  const handleSavePoster = async () => {
    if (!title.trim()) {
      Alert.alert("Campos incompletos", "Por favor ingresa el título de la película o evento.");
      return;
    }
    if (!selectedFile) {
      Alert.alert("Archivo requerido", "Por favor selecciona una imagen de póster.");
      return;
    }

    try {
      setSaving(true);
      const colRef = collection(db, "cines", "global", "custom_posters");
      
      const imageUrl = `data:${selectedFile.mimeType};base64,${selectedFile.base64}`;

      await addDoc(colRef, {
        title: title.trim(),
        imageUrl,
        createdBy: cineId || "desconocido",
        createdAt: new Date().toISOString(),
      });

      Alert.alert("Éxito", "Póster personalizado guardado correctamente.");
      setTitle("");
      setSelectedFile(null);
      setShowAddForm(false);
      await loadPosters();
    } catch (e) {
      console.error("Error saving poster:", e);
      Alert.alert("Error", "Ocurrió un error al guardar el póster.");
    } finally {
      setSaving(false);
    }
  };

  // Borrar póster
  const handleDeletePoster = (id: string, movieTitle: string) => {
    const performDelete = async () => {
      try {
        const docRef = doc(db, "cines", "global", "custom_posters", id);
        await deleteDoc(docRef);
        Alert.alert("Éxito", "Póster eliminado correctamente.");
        await loadPosters();
      } catch (e) {
        console.error("Error deleting poster:", e);
        Alert.alert("Error", "No se pudo eliminar el póster.");
      }
    };

    if (Platform.OS === "web") {
      if (confirm(`¿Estás seguro de eliminar el póster para "${movieTitle}"?`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Confirmar eliminación",
        `¿Estás seguro de eliminar el póster para "${movieTitle}"?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: performDelete },
        ]
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={s.scrollContainer} showsVerticalScrollIndicator={false}>
      {/* Encabezado */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🎨 Pósters Personalizados</Text>
          <Text style={s.subtitle}>
            Administra pósters e imágenes para películas o eventos que no figuran en TMDB.
          </Text>
        </View>
        <TouchableOpacity
          style={[s.addToggleBtn, showAddForm && s.addToggleBtnActive]}
          onPress={() => setShowAddForm(!showAddForm)}
        >
          <MaterialCommunityIcons
            name={showAddForm ? "close" : "plus"}
            size={20}
            color="#FFF"
          />
          <Text style={s.addToggleBtnText}>{showAddForm ? "Cancelar" : "Nuevo Póster"}</Text>
        </TouchableOpacity>
      </View>

      {/* Formulario de Carga */}
      {showAddForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>Cargar nuevo póster</Text>
          
          <View style={s.formRow}>
            {/* Campo Título */}
            <View style={[s.fieldGroup, { flex: 1 }]}>
              <Text style={s.label}>Título de la película / evento *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ej: Festival de Cine Coreano 2026"
                placeholderTextColor={COLORS.muted}
                style={s.input}
              />
            </View>

            {/* Selector de Imagen */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Archivo de póster *</Text>
              <TouchableOpacity style={s.pickBtn} onPress={handlePickImage}>
                <MaterialCommunityIcons name="image-plus" size={20} color={COLORS.primary} />
                <Text style={s.pickBtnText} numberOfLines={1}>
                  {selectedFile ? selectedFile.name : "Seleccionar imagen"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Previsualización */}
          {selectedFile && (
            <View style={s.previewContainer}>
              <Text style={s.label}>Previsualización del póster</Text>
              <View style={s.previewFrame}>
                <Image
                  source={{ uri: `data:${selectedFile.mimeType};base64,${selectedFile.base64}` }}
                  style={s.previewImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          )}

          {/* Botones de acción */}
          <TouchableOpacity
            style={s.saveBtn}
            onPress={handleSavePoster}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save" size={18} color="#FFF" />
                <Text style={s.saveBtnText}>Guardar Póster</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Listado de Pósters */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={s.loadingText}>Cargando pósters personalizados...</Text>
        </View>
      ) : posters.length === 0 ? (
        <View style={s.emptyCard}>
          <MaterialCommunityIcons name="image-multiple-outline" size={48} color={COLORS.muted} />
          <Text style={s.emptyTitle}>No hay pósters cargados</Text>
          <Text style={s.emptyText}>
            Usa el botón "Nuevo Póster" de arriba para registrar una imagen personalizada.
          </Text>
        </View>
      ) : (
        <View style={s.gridContainer}>
          {posters.map((item) => (
            <View key={item.id} style={s.posterCard}>
              <View style={s.posterImageFrame}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={s.posterImg} resizeMode="cover" />
                ) : (
                  <View style={s.noImagePlaceholder}>
                    <MaterialCommunityIcons name="image-off" size={32} color={COLORS.muted} />
                  </View>
                )}
                {/* Botón de borrado */}
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => handleDeletePoster(item.id, item.title)}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
              <View style={s.posterMeta}>
                <Text style={s.posterTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={s.posterSubMeta}>
                  <Text style={s.posterCine}>Cine: {item.createdBy.toUpperCase()}</Text>
                  <Text style={s.posterDate}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrollContainer: {
    padding: 16,
    gap: 16,
  },
  center: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.muted,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  addToggleBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    ...THEME.shadow.soft,
  },
  addToggleBtnActive: {
    backgroundColor: COLORS.muted,
  },
  addToggleBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...THEME.shadow.soft,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  formRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
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
  pickBtn: {
    backgroundColor: COLORS.bg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    minWidth: 200,
  },
  pickBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  previewContainer: {
    gap: 6,
  },
  previewFrame: {
    height: 160,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  saveBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 18,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 8,
  },
  posterCard: {
    width: Platform.OS === "web" ? "18%" : "45%",
    minWidth: 140,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...THEME.shadow.soft,
  },
  posterImageFrame: {
    height: 200,
    backgroundColor: COLORS.bg,
    position: "relative",
  },
  posterImg: {
    width: "100%",
    height: "100%",
  },
  noImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(239, 68, 68, 0.85)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  posterMeta: {
    padding: 10,
    gap: 6,
  },
  posterTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    lineHeight: 16,
  },
  posterSubMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  posterCine: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
  },
  posterDate: {
    fontSize: 10,
    color: COLORS.muted,
  },
});

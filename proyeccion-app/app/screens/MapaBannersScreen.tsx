import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";

// Types
interface BannerElement {
  id: string;
  name: string;
  type: "banner" | "poster" | "proximamente" | "standee" | "estructura" | "otro";
  movieName: string;
  posterUrl: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width?: number; // percentage width
  height?: number; // percentage height
  locked?: boolean; // toggle to lock dragging
}

interface FloorPlan {
  id: string;
  name: string;
  elements: BannerElement[];
}

interface MarketingMapsConfig {
  floors: FloorPlan[];
  updatedAt?: string;
  updatedBy?: string;
}

const ELEMENT_TYPE_META = {
  banner: { label: "Banner", icon: "image-filter-frames" as const, color: "#10b981" },
  poster: { label: "Poster", icon: "picture-in-picture-bottom-right" as const, color: "#3b82f6" },
  proximamente: { label: "Proximamente", icon: "clock-outline" as const, color: "#ec4899" },
  standee: { label: "Standee", icon: "human-male-board" as const, color: "#8b5cf6" },
  estructura: { label: "Estructura", icon: "pillar" as const, color: "#f59e0b" },
  otro: { label: "Otro", icon: "help-box" as const, color: "#6b7280" },
};

// TMDB API Search Helper
interface TmdbResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
}

export default function MapaBannersScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 800;
  const WorkspaceContainer = isMobile ? ScrollView : View;

  const { cineId, user } = useAuthUser();
  const userEmail = user?.email || "";

  const [floors, setFloors] = useState<FloorPlan[]>([
    { id: "floor-pb", name: "Planta Baja", elements: [] },
  ]);
  const [selectedFloorId, setSelectedFloorId] = useState<string>("floor-pb");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Dragging states
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number } | null>(null);

  // Firestore & loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const isMovingWithKeysRef = useRef(false);
  const [snapToGrid, setSnapToGrid] = useState(false);

  // TMDB Poster Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TmdbResult[]>([]);
  const [searchingPoster, setSearchingPoster] = useState(false);

  // Load configuration from Firestore
  useEffect(() => {
    if (!cineId) return;

    const docRef = doc(db, CINES_COLLECTION, cineId, "marketing_maps", "config");

    // Use onSnapshot for real-time sync
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as MarketingMapsConfig;
            if (data.floors && data.floors.length > 0) {
              const sanitizedFloors = data.floors.map(floor => ({
                ...floor,
                elements: (floor.elements || []).map(el => {
                  let type: any = el.type;
                  if (type === "marquesina") type = "poster";
                  if (type === "columna") type = "estructura";
                  return { ...el, type };
                })
              }));
              setFloors(sanitizedFloors);
            // Verify if selected floor still exists
            const exists = data.floors.some((f) => f.id === selectedFloorId);
            if (!exists) {
              setSelectedFloorId(data.floors[0].id);
            }
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error loading marketing maps:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [cineId]);

  const activeFloor = useMemo(() => {
    return floors.find((f) => f.id === selectedFloorId) || floors[0];
  }, [floors, selectedFloorId]);

  const selectedElement = useMemo(() => {
    if (!selectedElementId || !activeFloor) return null;
    return activeFloor.elements.find((el) => el.id === selectedElementId) || null;
  }, [activeFloor, selectedElementId]);

  // Save changes manually to Firestore
  const handleSaveChanges = async (customFloors = floors) => {
    if (!cineId) return;

    try {
      setSaving(true);
      const docRef = doc(db, CINES_COLLECTION, cineId, "marketing_maps", "config");
      await setDoc(docRef, {
        floors: customFloors,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail || "sistema",
      });
    } catch (e: any) {
      console.error("Error saving marketing maps:", e);
      Alert.alert("Error", e.message || "No se pudo guardar el mapa.");
    } finally {
      setSaving(false);
    }
  };

  // Listen to arrow keys to move selected element on Web
  useEffect(() => {
    if (Platform.OS !== "web" || !selectedElementId || !activeFloor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid moving if typing inside input fields
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      let dx = 0;
      let dy = 0;
      const step = 0.5; // step size in percentage

      if (e.key === "ArrowUp") {
        dy = -step;
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        dy = step;
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        dx = -step;
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        dx = step;
        e.preventDefault();
      }

      if (dx !== 0 || dy !== 0) {
        const el = activeFloor.elements.find(item => item.id === selectedElementId);
        if (el && !el.locked) {
          isMovingWithKeysRef.current = true;
          const newX = Math.max(0, Math.min(100, el.x + dx));
          const newY = Math.max(0, Math.min(100, el.y + dy));

          setFloors((prevFloors) =>
            prevFloors.map((f) => {
              if (f.id === selectedFloorId) {
                return {
                  ...f,
                  elements: f.elements.map((item) =>
                    item.id === selectedElementId ? { ...item, x: newX, y: newY } : item
                  ),
                };
              }
              return f;
            })
          );
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isMovingWithKeysRef.current && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        isMovingWithKeysRef.current = false;
        handleSaveChanges();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedElementId, activeFloor, selectedFloorId, floors, handleSaveChanges]);

  // Add Floor
  const handleAddFloor = () => {
    const id = `floor-${Date.now()}`;
    const newFloor: FloorPlan = {
      id,
      name: `Nuevo Piso (${floors.length + 1})`,
      elements: [],
    };
    const updated = [...floors, newFloor];
    setFloors(updated);
    setSelectedFloorId(id);
    handleSaveChanges(updated);
  };

  // Delete Floor
  const handleDeleteFloor = (id: string) => {
    if (floors.length <= 1) {
      Alert.alert("Acción no permitida", "Debe haber al menos un piso en el mapa.");
      return;
    }

    const askDelete = () => {
      const updated = floors.filter((f) => f.id !== id);
      setFloors(updated);
      setSelectedFloorId(updated[0].id);
      setSelectedElementId(null);
      handleSaveChanges(updated);
    };

    if (Platform.OS === "web") {
      if (confirm("¿Estás seguro de que querés eliminar este piso y todos sus elementos?")) {
        askDelete();
      }
    } else {
      Alert.alert(
        "Eliminar Piso",
        "¿Estás seguro de que querés eliminar este piso y todos sus elementos?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: askDelete },
        ]
      );
    }
  };

  // Rename Floor
  const handleRenameFloor = (id: string, newName: string) => {
    const updated = floors.map((f) => (f.id === id ? { ...f, name: newName } : f));
    setFloors(updated);
    handleSaveChanges(updated);
  };

  // Add Element to current Floor
  const handleAddElement = (type: keyof typeof ELEMENT_TYPE_META) => {
    if (!activeFloor) return;

    const newElement: BannerElement = {
      id: `el-${Date.now()}`,
      name: `${ELEMENT_TYPE_META[type].label} #${activeFloor.elements.length + 1}`,
      type,
      movieName: "",
      posterUrl: "",
      x: 45, // center x
      y: 45, // center y
      width: 8, // default width
      height: 12, // default height
      locked: false, // default unlocked
    };

    const updatedFloors = floors.map((f) => {
      if (f.id === selectedFloorId) {
        return {
          ...f,
          elements: [...f.elements, newElement],
        };
      }
      return f;
    });

    setFloors(updatedFloors);
    setSelectedElementId(newElement.id);
    handleSaveChanges(updatedFloors);
  };

  // Delete Selected Element
  const handleDeleteElement = (id: string) => {
    if (!activeFloor) return;

    const updatedFloors = floors.map((f) => {
      if (f.id === selectedFloorId) {
        return {
          ...f,
          elements: f.elements.filter((el) => el.id !== id),
        };
      }
      return f;
    });

    setFloors(updatedFloors);
    setSelectedElementId(null);
    handleSaveChanges(updatedFloors);
  };

  // Update Element Position
  const updateElementPosition = (id: string, x: number, y: number) => {
    setFloors((prevFloors) =>
      prevFloors.map((f) => {
        if (f.id === selectedFloorId) {
          return {
            ...f,
            elements: f.elements.map((el) => (el.id === id ? { ...el, x, y } : el)),
          };
        }
        return f;
      })
    );
  };

  // Drag handlers for Web (using direct mouse events for absolute smoothness)
  const handleMouseMove = (e: any) => {
    if (!activeDragId || !canvasLayout || Platform.OS !== "web") return;

    // Safety check to ensure we do not drag a locked element
    const element = activeFloor?.elements.find((el) => el.id === activeDragId);
    if (element?.locked) {
      setActiveDragId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    let x = (clientX / canvasLayout.width) * 100;
    let y = (clientY / canvasLayout.height) * 100;

    if (snapToGrid) {
      const snapStep = 2.5;
      x = Math.round(x / snapStep) * snapStep;
      y = Math.round(y / snapStep) * snapStep;
    }

    x = Math.max(1, Math.min(99, x));
    y = Math.max(1, Math.min(99, y));

    updateElementPosition(activeDragId, x, y);
  };

  const handleMouseUp = () => {
    if (activeDragId) {
      setActiveDragId(null);
      handleSaveChanges();
    }
  };

  // Search TMDB helper
  const handleSearchPoster = async () => {
    if (!searchQuery.trim()) return;

    try {
      setSearchingPoster(true);
      setSearchResults([]);

      const searchPosterFunc = httpsCallable<{ query: string }, { results: TmdbResult[] }>(
        functions,
        "searchMoviePoster"
      );
      const response = await searchPosterFunc({ query: searchQuery });
      const results = response.data.results || [];

      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert("Sin resultados", "No encontramos películas que coincidan con la búsqueda.");
      }
    } catch (e) {
      console.error("Error searching poster:", e);
      Alert.alert("Error", "Ocurrió un error buscando el póster de la película.");
    } finally {
      setSearchingPoster(false);
    }
  };

  // Select Search result and assign to element
  const assignPoster = (movieTitle: string, posterPath: string | null | undefined) => {
    if (!selectedElementId || !activeFloor) return;

    const originalUrl = posterPath
      ? posterPath.startsWith("http")
        ? posterPath
        : `https://image.tmdb.org/t/p/w500${posterPath}`
      : "";

    const posterUrl = originalUrl
      ? `https://apivacas.jariel.com.ar/api/cinemark/poster?url=${encodeURIComponent(originalUrl)}`
      : "";

    const updatedFloors = floors.map((f) => {
      if (f.id === selectedFloorId) {
        return {
          ...f,
          elements: f.elements.map((el) =>
            el.id === selectedElementId
              ? { ...el, movieName: movieTitle, posterUrl }
              : el
          ),
        };
      }
      return f;
    });

    setFloors(updatedFloors);
    setSearchResults([]);
    setSearchQuery("");
    handleSaveChanges(updatedFloors);
  };

  // Custom modification input handles
  const updateElementDetail = (id: string, field: "name" | "movieName", value: string) => {
    setFloors((prevFloors) =>
      prevFloors.map((f) => {
        if (f.id === selectedFloorId) {
          return {
            ...f,
            elements: f.elements.map((el) => (el.id === id ? { ...el, [field]: value } : el)),
          };
        }
        return f;
      })
    );
  };

  const updateElementSize = (id: string, width: number, height: number) => {
    const updated = floors.map((f) => {
      if (f.id === selectedFloorId) {
        return {
          ...f,
          elements: f.elements.map((el) => (el.id === id ? { ...el, width, height } : el)),
        };
      }
      return f;
    });
    setFloors(updated);
    handleSaveChanges(updated);
  };

  // Print PDF Layout Generator
  const handlePrint = async () => {
    try {
      setPrinting(true);

      const esc = (val: string) =>
        String(val ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");

      const floorsHtml = floors
        .map((floor) => {
          // Generate marker badges on canvas representation
          const canvasRepresentation = floor.elements
            .map((el, index) => {
              const color = ELEMENT_TYPE_META[el.type]?.color || "#6b7280";
              const showZocalo = ["banner", "poster", "standee", "proximamente"].includes(el.type);
              const posterContent = el.posterUrl
                ? `<img class="print-poster-img" src="${el.posterUrl}" alt="Poster" />`
                : `<div class="print-marker-fallback" style="background-color: ${color}; ${showZocalo ? 'padding-bottom: 12px;' : ''}">
                     <span class="fallback-text">${esc(el.movieName || el.name)}</span>
                   </div>`;
              const width = el.width || 8;
              const height = el.height || 12;
              const left = el.x - width / 2;
              const top = el.y - height / 2;
              const zocaloHtml = showZocalo
                ? `<div class="print-marker-zocalo" style="background-color: ${color};">${esc(ELEMENT_TYPE_META[el.type]?.label || el.type)}</div>`
                : "";
              return `
              <div class="print-marker" style="left: ${left}%; top: ${top}%; width: ${width}%; height: ${height}%; border-color: ${color};">
                ${posterContent}
                ${zocaloHtml}
              </div>
            `;
            })
            .join("");

          return `
            <div class="floor-section">
              <h2>${esc(floor.name)}</h2>
              <div class="print-canvas">
                <div class="canvas-grid-line h"></div>
                <div class="canvas-grid-line v"></div>
                ${canvasRepresentation}
              </div>
            </div>
          `;
        })
        .join("");

      const html = `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Plano de Banners y Marquesinas</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 0;
              background: #fff;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .floor-section {
              page-break-after: always;
              width: 100%;
              max-width: 1000px;
              margin-bottom: 40px;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .floor-section:last-child {
              page-break-after: avoid;
              margin-bottom: 0;
            }
            .floor-section h2 {
              font-size: 20px;
              margin-top: 10px;
              margin-bottom: 15px;
              color: #0f172a;
              text-align: center;
              font-weight: 700;
            }
            .print-canvas {
              width: 100%;
              aspect-ratio: 16/9;
              background-color: #ffffff;
              border: 2px solid #94a3b8;
              border-radius: 8px;
              position: relative;
              overflow: hidden;
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            }
            .canvas-grid-line {
              position: absolute;
              opacity: 0.15;
            }
            .canvas-grid-line.h {
              width: 100%;
              height: 0;
              border-top: 1.5px dashed #64748b;
              top: 50%;
            }
            .canvas-grid-line.v {
              width: 0;
              height: 100%;
              border-left: 1.5px dashed #64748b;
              left: 50%;
            }
            .print-marker {
              position: absolute;
              box-sizing: border-box;
              border-width: 2.5px;
              border-style: solid;
              border-radius: 6px;
              overflow: hidden;
              background-color: #ffffff;
              box-shadow: 0 2px 4px rgba(0,0,0,0.12);
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .print-poster-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              background-color: #ffffff;
            }
            .print-marker-fallback {
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 4px;
              box-sizing: border-box;
            }
            .fallback-text {
              color: #ffffff;
              font-size: 9px;
              font-weight: bold;
              text-align: center;
              line-height: 1.2;
              word-break: break-word;
            }
            .print-marker-zocalo {
              position: absolute;
              bottom: 0;
              left: 0;
              width: 100%;
              height: 12px;
              color: #ffffff;
              font-size: 7px;
              font-weight: bold;
              text-align: center;
              text-transform: uppercase;
              line-height: 12px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              z-index: 5;
            }
          </style>
        </head>
        <body>
          ${floorsHtml}
        </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          throw new Error("El navegador bloqueó la ventana de impresión.");
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        
        const doPrint = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 500);
        };

        if (printWindow.document.readyState === "complete") {
          doPrint();
        } else {
          printWindow.onload = doPrint;
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      console.error("Error generating printout:", e);
      Alert.alert("Error de Impresión", e.message || "No se pudo generar la impresión.");
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Cargando mapa de banners...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* HEADER CONTROLS */}
      <View style={[s.topBar, isMobile && { flexDirection: "column", alignItems: "stretch", gap: 10 }]}>
        <View style={s.floorsTabsScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.floorsTabs}>
            {floors.map((floor) => {
              const isSelected = floor.id === selectedFloorId;
              return (
                <View key={floor.id} style={[s.floorTabWrap, isSelected && s.floorTabActive]}>
                  {isSelected ? (
                    <TextInput
                      style={[s.floorTabText, s.floorTabInput]}
                      value={floor.name}
                      onChangeText={(val) => handleRenameFloor(floor.id, val)}
                      placeholder="Nombre del Piso"
                    />
                  ) : (
                    <Pressable onPress={() => { setSelectedFloorId(floor.id); setSelectedElementId(null); }}>
                      <Text style={[s.floorTabText, s.floorTabInactiveText]}>{floor.name}</Text>
                    </Pressable>
                  )}
                  {isSelected && (
                    <Pressable style={s.floorDeleteBtn} onPress={() => handleDeleteFloor(floor.id)}>
                      <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.danger} />
                    </Pressable>
                  )}
                </View>
              );
            })}
            <Pressable style={s.addFloorBtn} onPress={handleAddFloor}>
              <MaterialCommunityIcons name="plus" size={16} color={COLORS.primary} />
              <Text style={s.addFloorText}>Piso</Text>
            </Pressable>
          </ScrollView>
        </View>

        <View style={s.actionsRow}>
          <Pressable style={[s.iconBtn, printing && s.btnDisabled]} onPress={handlePrint} disabled={printing}>
            {printing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="printer" size={18} color="#fff" />
                <Text style={s.btnText}>Imprimir / PDF</Text>
              </>
            )}
          </Pressable>

          <Pressable style={[s.iconBtn, s.saveBtn, saving && s.btnDisabled]} onPress={() => handleSaveChanges()} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                <Text style={s.btnText}>Guardar</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {isMobile && (
        <View style={s.mobileWarningBanner}>
          <MaterialCommunityIcons name="monitor-screenshot" size={16} color="#856404" />
          <Text style={s.mobileWarningText}>
            Se recomienda diseñar el mapa desde una computadora para mayor comodidad.
          </Text>
        </View>
      )}

      {/* CANVAS + EDITOR SIDEBAR */}
      <WorkspaceContainer style={[s.mainWorkspace, isMobile && { flexDirection: "column" }]} contentContainerStyle={isMobile ? { paddingBottom: 40 } : undefined}>
        
        {/* ELEMENT GENERATOR PALETTE */}
        <View style={[
          s.paletteCard,
          isMobile && {
            width: "100%",
            borderRightWidth: 0,
            borderBottomWidth: 1,
            padding: 12,
          }
        ]}>
          <Text style={s.paletteTitle}>Añadir Elemento</Text>
          <View style={[s.paletteButtons, isMobile && { flexDirection: "row" }]}>
            {Object.entries(ELEMENT_TYPE_META).map(([key, meta]) => (
              <Pressable
                key={key}
                style={[s.paletteBtn, { borderLeftColor: meta.color }]}
                onPress={() => handleAddElement(key as any)}
              >
                <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
                <Text style={s.paletteBtnText}>{meta.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* DRAG AND DROP CANVAS */}
        <View style={s.canvasContainer}>
          <View style={s.canvasHeader}>
            <Text style={s.canvasHelpText}>
              Arrastrá los elementos en el mapa para posicionarlos en el plano de la planta.
            </Text>
            <Pressable
              style={[s.snapToggleBtn, snapToGrid && s.snapToggleBtnActive]}
              onPress={() => setSnapToGrid(!snapToGrid)}
            >
              <MaterialCommunityIcons
                name={snapToGrid ? "grid" : "grid-off"}
                size={14}
                color={snapToGrid ? "#fff" : COLORS.muted}
              />
              <Text style={[s.snapToggleText, snapToGrid && { color: "#fff" }]}>
                Ajustar a Cuadrícula (2.5%)
              </Text>
            </Pressable>
          </View>

          <View
            style={s.canvas}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setCanvasLayout({ width, height });
            }}
            {...({
              onMouseMove: handleMouseMove,
              onMouseUp: handleMouseUp,
            } as any)}
          >
            {/* Center guides */}
            <View style={s.guideLineH} />
            <View style={s.guideLineV} />

            {/* Elements markers */}
            {activeFloor?.elements.map((el, index) => {
              const meta = ELEMENT_TYPE_META[el.type] || ELEMENT_TYPE_META.otro;
              const isSelected = el.id === selectedElementId;
              const hasPoster = !!el.posterUrl;
              const showZocalo = ["banner", "poster", "standee", "proximamente"].includes(el.type);

              return (
                <Pressable
                  key={el.id}
                  style={[
                    s.elementMarker,
                    {
                      width: `${el.width || 8}%`,
                      height: `${el.height || 12}%`,
                      left: `${el.x - (el.width || 8) / 2}%`,
                      top: `${el.y - (el.height || 12) / 2}%`,
                      borderColor: isSelected ? COLORS.primary : meta.color,
                      backgroundColor: isSelected ? COLORS.primarySoft : COLORS.card,
                    },
                    hasPoster && s.elementMarkerWithPoster,
                  ]}
                  onPress={() => setSelectedElementId(el.id)}
                  onPressIn={() => {
                    setSelectedElementId(el.id);
                    if (Platform.OS === "web" && !el.locked) {
                      setActiveDragId(el.id);
                    }
                  }}
                >
                  {hasPoster ? (
                    <Image source={{ uri: el.posterUrl }} style={s.elementPosterBg as any} resizeMode="contain" />
                  ) : (
                    <Text style={[s.elementMarkerCenterText, showZocalo && { paddingBottom: 12 }]} numberOfLines={4}>
                      {el.movieName || el.name}
                    </Text>
                  )}
                  {showZocalo && (
                    <View style={[s.elementZocalo, { backgroundColor: meta.color }]}>
                      <Text style={s.elementZocaloText} numberOfLines={1}>
                        {meta.label}
                      </Text>
                    </View>
                  )}
                  <View style={[s.elementMarkerNumberBadge, { backgroundColor: meta.color }]}>
                    <Text style={s.elementMarkerNumberText}>{index + 1}</Text>
                  </View>
                  {el.locked && (
                    <View style={s.lockBadge}>
                      <MaterialCommunityIcons name="lock" size={10} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* SIDEBAR PROPERTIES EDITOR */}
        <View style={[
          s.sidebar,
          isMobile && {
            width: "100%",
            borderLeftWidth: 0,
            borderTopWidth: 1,
          }
        ]}>
          {selectedElement ? (
            <ScrollView contentContainerStyle={s.sidebarContent}>
              <View style={s.sidebarHeader}>
                <Text style={s.sidebarTitle}>Editar Elemento</Text>
                <View style={s.sidebarActionsHeader}>
                  <Pressable
                    style={[s.lockToggleBtn, selectedElement.locked && s.lockToggleBtnActive]}
                    onPress={() => {
                      const updated = floors.map((f) => {
                        if (f.id === selectedFloorId) {
                          return {
                            ...f,
                            elements: f.elements.map((el) =>
                              el.id === selectedElement.id ? { ...el, locked: !el.locked } : el
                            ),
                          };
                        }
                        return f;
                      });
                      setFloors(updated);
                      handleSaveChanges(updated);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={selectedElement.locked ? "lock" : "lock-open-outline"}
                      size={14}
                      color={selectedElement.locked ? "#fff" : COLORS.muted}
                    />
                    <Text style={[s.lockToggleBtnText, selectedElement.locked && { color: "#fff" }]}>
                      {selectedElement.locked ? "Fijo" : "Fijar"}
                    </Text>
                  </Pressable>

                  <Pressable style={s.deleteBtn} onPress={() => handleDeleteElement(selectedElement.id)}>
                    <MaterialCommunityIcons name="delete-outline" size={20} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>Nombre del Elemento</Text>
                <TextInput
                  style={s.textInput}
                  value={selectedElement.name}
                  onChangeText={(val) => updateElementDetail(selectedElement.id, "name", val)}
                  onBlur={() => handleSaveChanges()}
                />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>Tipo de Banner</Text>
                <View style={s.typesRow}>
                  {Object.entries(ELEMENT_TYPE_META).map(([key, meta]) => {
                    const isActive = selectedElement.type === key;
                    return (
                      <Pressable
                        key={key}
                        style={[
                          s.typeSelectBtn,
                          isActive && { backgroundColor: meta.color + "22", borderColor: meta.color },
                        ]}
                        onPress={() => {
                          const updated = floors.map((f) => {
                            if (f.id === selectedFloorId) {
                              return {
                                ...f,
                                elements: f.elements.map((el) =>
                                  el.id === selectedElement.id ? { ...el, type: key as any } : el
                                ),
                              };
                            }
                            return f;
                          });
                          setFloors(updated);
                          handleSaveChanges(updated);
                        }}
                      >
                        <MaterialCommunityIcons
                          name={meta.icon}
                          size={16}
                          color={isActive ? meta.color : COLORS.muted}
                        />
                        <Text style={[s.typeSelectText, isActive && { color: meta.color, fontWeight: "800" }]}>
                          {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* TAMAÑO / DIMENSIONES */}
              <View style={s.sizeControlRow}>
                <View style={s.sizeControlField}>
                  <Text style={s.fieldLabel}>Ancho (Plano)</Text>
                  <View style={s.stepperRow}>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newWidth = Math.max(3, (selectedElement.width || 8) - 5);
                        updateElementSize(selectedElement.id, newWidth, selectedElement.height || 12);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-5</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newWidth = Math.max(3, (selectedElement.width || 8) - 1);
                        updateElementSize(selectedElement.id, newWidth, selectedElement.height || 12);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-1</Text>
                    </Pressable>
                    
                    <TextInput
                      style={s.stepperInput}
                      keyboardType="numeric"
                      value={selectedElement.width === 0 ? "" : String(selectedElement.width || 8)}
                      onChangeText={(val) => {
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed)) {
                          const constrained = Math.max(1, Math.min(100, parsed));
                          updateElementSize(selectedElement.id, constrained, selectedElement.height || 12);
                        } else if (val === "") {
                          updateElementSize(selectedElement.id, 0, selectedElement.height || 12);
                        }
                      }}
                      onBlur={() => {
                        if (!selectedElement.width) {
                          updateElementSize(selectedElement.id, 8, selectedElement.height || 12);
                        }
                      }}
                    />
                    <Text style={s.percentSymbol}>%</Text>

                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newWidth = Math.min(100, (selectedElement.width || 8) + 1);
                        updateElementSize(selectedElement.id, newWidth, selectedElement.height || 12);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+1</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newWidth = Math.min(100, (selectedElement.width || 8) + 5);
                        updateElementSize(selectedElement.id, newWidth, selectedElement.height || 12);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+5</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={s.sizeControlField}>
                  <Text style={s.fieldLabel}>Alto (Plano)</Text>
                  <View style={s.stepperRow}>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newHeight = Math.max(3, (selectedElement.height || 12) - 5);
                        updateElementSize(selectedElement.id, selectedElement.width || 8, newHeight);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-5</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newHeight = Math.max(3, (selectedElement.height || 12) - 1);
                        updateElementSize(selectedElement.id, selectedElement.width || 8, newHeight);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-1</Text>
                    </Pressable>
                    
                    <TextInput
                      style={s.stepperInput}
                      keyboardType="numeric"
                      value={selectedElement.height === 0 ? "" : String(selectedElement.height || 12)}
                      onChangeText={(val) => {
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed)) {
                          const constrained = Math.max(1, Math.min(100, parsed));
                          updateElementSize(selectedElement.id, selectedElement.width || 8, constrained);
                        } else if (val === "") {
                          updateElementSize(selectedElement.id, selectedElement.width || 8, 0);
                        }
                      }}
                      onBlur={() => {
                        if (!selectedElement.height) {
                          updateElementSize(selectedElement.id, selectedElement.width || 8, 12);
                        }
                      }}
                    />
                    <Text style={s.percentSymbol}>%</Text>

                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newHeight = Math.min(100, (selectedElement.height || 12) + 1);
                        updateElementSize(selectedElement.id, selectedElement.width || 8, newHeight);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+1</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newHeight = Math.min(100, (selectedElement.height || 12) + 5);
                        updateElementSize(selectedElement.id, selectedElement.width || 8, newHeight);
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+5</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={s.sizeControlRow}>
                <View style={s.sizeControlField}>
                  <Text style={s.fieldLabel}>Posición X (Centro)</Text>
                  <View style={s.stepperRow}>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newX = Math.max(0, (selectedElement.x) - 5);
                        updateElementPosition(selectedElement.id, newX, selectedElement.y);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-5</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newX = Math.max(0, (selectedElement.x) - 1);
                        updateElementPosition(selectedElement.id, newX, selectedElement.y);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-1</Text>
                    </Pressable>
                    
                    <TextInput
                      style={s.stepperInput}
                      keyboardType="numeric"
                      value={String(selectedElement.x)}
                      onChangeText={(val) => {
                        const parsed = parseFloat(val);
                        if (!isNaN(parsed)) {
                          const constrained = Math.max(0, Math.min(100, parsed));
                          updateElementPosition(selectedElement.id, constrained, selectedElement.y);
                        }
                      }}
                      onBlur={() => handleSaveChanges()}
                    />
                    <Text style={s.percentSymbol}>%</Text>

                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newX = Math.min(100, (selectedElement.x) + 1);
                        updateElementPosition(selectedElement.id, newX, selectedElement.y);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+1</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newX = Math.min(100, (selectedElement.x) + 5);
                        updateElementPosition(selectedElement.id, newX, selectedElement.y);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+5</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={s.sizeControlField}>
                  <Text style={s.fieldLabel}>Posición Y (Centro)</Text>
                  <View style={s.stepperRow}>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newY = Math.max(0, (selectedElement.y) - 5);
                        updateElementPosition(selectedElement.id, selectedElement.x, newY);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-5</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newY = Math.max(0, (selectedElement.y) - 1);
                        updateElementPosition(selectedElement.id, selectedElement.x, newY);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>-1</Text>
                    </Pressable>
                    
                    <TextInput
                      style={s.stepperInput}
                      keyboardType="numeric"
                      value={String(selectedElement.y)}
                      onChangeText={(val) => {
                        const parsed = parseFloat(val);
                        if (!isNaN(parsed)) {
                          const constrained = Math.max(0, Math.min(100, parsed));
                          updateElementPosition(selectedElement.id, selectedElement.x, constrained);
                        }
                      }}
                      onBlur={() => handleSaveChanges()}
                    />
                    <Text style={s.percentSymbol}>%</Text>

                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newY = Math.min(100, (selectedElement.y) + 1);
                        updateElementPosition(selectedElement.id, selectedElement.x, newY);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+1</Text>
                    </Pressable>
                    <Pressable
                      style={s.stepperSmallBtn}
                      onPress={() => {
                        const newY = Math.min(100, (selectedElement.y) + 5);
                        updateElementPosition(selectedElement.id, selectedElement.x, newY);
                        handleSaveChanges();
                      }}
                    >
                      <Text style={s.stepperSmallBtnText}>+5</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={s.divider} />

              {/* MOVIE ASSIGNMENT & TMDB POSTER FETCH */}
              <View style={s.field}>
                <Text style={s.sidebarSectionTitle}>Asignar Película / Poster</Text>
                {selectedElement.posterUrl ? (
                  <View style={s.currentPosterContainer}>
                    <Image source={{ uri: selectedElement.posterUrl }} style={s.currentPosterImage as any} />
                    <View style={s.currentPosterInfo}>
                      <Text style={s.currentPosterMovieName}>{selectedElement.movieName}</Text>
                      <Pressable
                        style={s.removePosterBtn}
                        onPress={() => {
                          const updated = floors.map((f) => {
                            if (f.id === selectedFloorId) {
                              return {
                                ...f,
                                elements: f.elements.map((el) =>
                                  el.id === selectedElement.id
                                    ? { ...el, movieName: "", posterUrl: "" }
                                    : el
                                ),
                              };
                            }
                            return f;
                          });
                          setFloors(updated);
                          handleSaveChanges(updated);
                        }}
                      >
                        <MaterialCommunityIcons name="image-remove" size={14} color={COLORS.danger} />
                        <Text style={s.removePosterBtnText}>Quitar Póster</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={s.noPosterBadge}>
                    <Text style={s.noPosterText}>No hay póster asignado</Text>
                  </View>
                )}

                <View style={s.searchFieldWrap}>
                  <TextInput
                    style={s.textInputSearch}
                    placeholder="Escribir título de la película..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearchPoster}
                  />
                  <Pressable
                    style={[s.searchSubmitBtn, searchingPoster && s.searchSubmitBtnDisabled]}
                    onPress={handleSearchPoster}
                    disabled={searchingPoster}
                  >
                    {searchingPoster ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialCommunityIcons name="magnify" size={18} color="#fff" />
                    )}
                  </Pressable>
                </View>
              </View>

              {/* SEARCH SUGGESTIONS */}
              {searchResults.length > 0 && (
                <View style={s.searchResultsCard}>
                  <Text style={s.searchResultsTitle}>Resultados de Búsqueda:</Text>
                  {searchResults.map((movie) => (
                    <Pressable
                      key={movie.id}
                      style={s.searchResultRow}
                      onPress={() => assignPoster(movie.title, movie.poster_path)}
                    >
                      {movie.poster_path ? (
                        <Image
                          source={{
                            uri: `https://apivacas.jariel.com.ar/api/cinemark/poster?url=${encodeURIComponent(
                              movie.poster_path.startsWith("http")
                                ? movie.poster_path
                                : `https://image.tmdb.org/t/p/w92${movie.poster_path}`
                            )}`,
                          }}
                          style={s.searchResultThumb as any}
                        />
                      ) : (
                        <View style={s.searchResultThumbFallback}>
                          <MaterialCommunityIcons name="movie-outline" size={14} color={COLORS.muted} />
                        </View>
                      )}
                      <View style={s.searchResultTextContainer}>
                        <Text style={s.searchResultName} numberOfLines={1}>
                          {movie.title}
                        </Text>
                        {!!movie.release_date && (
                          <Text style={s.searchResultMeta}>Año: {movie.release_date.split("-")[0]}</Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={s.sidebarEmpty}>
              <MaterialCommunityIcons name="gesture-tap" size={32} color={COLORS.muted} />
              <Text style={s.sidebarEmptyText}>
                Hacé clic en cualquier elemento del mapa para editar sus detalles o asignarle una película.
              </Text>
            </View>
          )}
        </View>

      </WorkspaceContainer>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: "600",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    zIndex: 10,
  },
  floorsTabsScroll: {
    flex: 1,
    marginRight: 16,
  },
  floorsTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  floorTabWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    height: 36,
  },
  floorTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  floorTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  floorTabInactiveText: {
    color: COLORS.muted,
  },
  floorTabInput: {
    padding: 0,
    minWidth: 80,
    color: COLORS.primary,
  },
  floorDeleteBtn: {
    marginLeft: 6,
    padding: 2,
  },
  addFloorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
  },
  addFloorText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#64748b",
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  mainWorkspace: {
    flex: 1,
    flexDirection: Platform.OS === "web" ? "row" : "column",
  },
  paletteCard: {
    width: Platform.OS === "web" ? 180 : "100%",
    backgroundColor: COLORS.card,
    borderRightWidth: Platform.OS === "web" ? 1 : 0,
    borderBottomWidth: Platform.OS === "web" ? 0 : 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  paletteTitle: {
    fontSize: 12.5,
    fontWeight: "900",
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  paletteButtons: {
    gap: 8,
    flexDirection: Platform.OS === "web" ? "column" : "row",
    flexWrap: "wrap",
  },
  paletteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    minWidth: 120,
  },
  paletteBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.text,
  },
  canvasContainer: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  canvasHelpText: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: "italic",
  },
  canvas: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "#f1f5f9" : "#e2e8f0",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    position: "relative",
    overflow: "hidden",
    minHeight: 400,
    ...Platform.select({
      web: {
        backgroundImage: "radial-gradient(#cbd5e1 1.2px, #f8fafc 1.2px)",
        backgroundSize: "20px 20px",
      },
    }),
  },
  guideLineH: {
    position: "absolute",
    width: "100%",
    height: 0,
    borderTopWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    top: "50%",
    opacity: 0.5,
  },
  guideLineV: {
    position: "absolute",
    width: 0,
    height: "100%",
    borderLeftWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    left: "50%",
    opacity: 0.5,
  },
  elementMarker: {
    position: "absolute",
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    backgroundColor: COLORS.card,
    ...THEME.shadow.soft,
    ...Platform.select({
      web: {
        cursor: "move",
        userSelect: "none",
      } as any,
      default: {},
    }),
  },
  elementMarkerWithPoster: {
    borderWidth: 1,
  },
  elementPosterBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
    opacity: 0.85,
  },
  elementMarkerNumberBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
    zIndex: 5,
  },
  elementMarkerNumberText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#fff",
  },
  elementMarkerCenterText: {
    fontSize: 9,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  elementZocalo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  elementZocaloText: {
    color: "#fff",
    fontSize: 7.5,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  sidebar: {
    width: Platform.OS === "web" ? 300 : "100%",
    backgroundColor: COLORS.card,
    borderLeftWidth: Platform.OS === "web" ? 1 : 0,
    borderTopWidth: Platform.OS === "web" ? 0 : 1,
    borderColor: COLORS.border,
  },
  sidebarContent: {
    padding: 20,
    gap: 16,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: COLORS.dangerSoft,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  sidebarSectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.text,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  typesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: COLORS.bg,
  },
  typeSelectText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  noPosterBadge: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  noPosterText: {
    fontSize: 12,
    color: COLORS.muted,
    fontStyle: "italic",
  },
  currentPosterContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    gap: 12,
  },
  currentPosterImage: {
    width: 60,
    height: 90,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currentPosterInfo: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  currentPosterMovieName: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.text,
  },
  removePosterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  removePosterBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.danger,
  },
  searchFieldWrap: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  textInputSearch: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  searchSubmitBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchSubmitBtnDisabled: {
    opacity: 0.6,
  },
  searchResultsCard: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  searchResultsTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
    marginBottom: 2,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchResultThumb: {
    width: 24,
    height: 36,
    borderRadius: 4,
  },
  searchResultThumbFallback: {
    width: 24,
    height: 36,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultTextContainer: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },
  searchResultMeta: {
    fontSize: 9.5,
    color: COLORS.muted,
    marginTop: 2,
  },
  sidebarEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 16,
  },
  sidebarEmptyText: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  sizeControlRow: {
    flexDirection: "column",
    gap: 12,
  },
  sizeControlField: {
    flex: 1,
    gap: 6,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    height: 38,
    overflow: "hidden",
  },
  stepperSmallBtn: {
    width: 28,
    height: "100%",
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperSmallBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.text,
  },
  stepperInput: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.text,
    padding: 0,
    height: "100%",
  },
  percentSymbol: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
    marginRight: 4,
  },
  sidebarActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lockToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 32,
    backgroundColor: COLORS.bg,
  },
  lockToggleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  lockToggleBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
  },
  lockBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
    zIndex: 5,
    ...THEME.shadow.soft,
  },
  mobileWarningBanner: {
    backgroundColor: "#fff3cd",
    borderColor: "#ffeeba",
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mobileWarningText: {
    color: "#856404",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  canvasHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  snapToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORS.bg,
  },
  snapToggleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  snapToggleText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "700",
  },
});

// components/RmaItem.tsx
import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Rma } from "@/lib/types";
type Props = {
  item: Rma;
  onPress?: (r: Rma) => void;        // si en el futuro querés editar/ver más
  onLongPress?: (r: Rma) => void;    // eliminar
  COLORS: any;
  stylesRef: {
    taskItem: any;   // reutilizo tus estilos de tarjeta
    taskTitle: any;
    taskMeta: any;
  };
};

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") {
    try {
      const d = v.toDate();
      return d instanceof Date && !isNaN(+d) ? d : null;
    } catch { return null; }
  }
  if (v instanceof Date) return isNaN(+v) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  return null;
}

export default function RmaItem({ item, onPress, onLongPress, COLORS, stylesRef }: Props) {
  const created = toDateSafe(item.createdAt);
  const createdStr = created
    ? created.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
    : "pendiente…";

  return (
    <TouchableOpacity
      onPress={() => onPress?.(item)}
      onLongPress={() => onLongPress?.(item)}
      style={[stylesRef.taskItem]}
      activeOpacity={0.8}
    >
      {/* Título: Nº de RMA */}
      <Text style={[stylesRef.taskTitle]} numberOfLines={1}>
        RMA: {item.rmaNumber}
      </Text>

      {/* Línea secundaria: Incidente */}
      {!!item.incidentNumber && (
        <Text style={[stylesRef.taskMeta, { marginTop: 2 }]}>
          Incidente: {item.incidentNumber}
        </Text>
      )}

      {/* Detalles */}
      {!!item.details && (
        <Text style={[stylesRef.taskMeta, { marginTop: 4 }]} numberOfLines={3}>
          {item.details}
        </Text>
      )}

      {/* Metas */}
      <View style={{ marginTop: 6, gap: 2 }}>
        <Text style={stylesRef.taskMeta}>Creado: {createdStr}</Text>
        {!!item.createdName && (
          <Text style={stylesRef.taskMeta}>Por: {item.createdName}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

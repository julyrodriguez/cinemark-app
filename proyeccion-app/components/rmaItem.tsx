// components/rmaItem.tsx
import React, { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet, Animated, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Rma } from "@/lib/types";
import { THEME } from "@/lib/theme";

type Props = {
  item: Rma;
  onPress?: (r: Rma) => void;
  onLongPress?: (r: Rma) => void;
  COLORS: any;
  stylesRef?: {
    taskItem?: any;
    taskTitle?: any;
    taskMeta?: any;
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

export default function RmaItem({ item, onPress, onLongPress, COLORS }: Props) {
  const created = toDateSafe(item.createdAt);
  const createdStr = created
    ? created.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
    : "pendiente…";

  const [isHovered, setIsHovered] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity
        onPress={() => onPress?.(item)}
        onLongPress={() => onLongPress?.(item)}
        activeOpacity={0.7}
        {...({
          onMouseEnter: Platform.OS === "web" ? () => setIsHovered(true) : undefined,
          onMouseLeave: Platform.OS === "web" ? () => setIsHovered(false) : undefined,
        } as any)}
        style={[
          styles.card,
          isHovered && styles.cardHovered,
          { borderColor: isHovered ? COLORS.primary : COLORS.border }
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleContainer}>
            <View style={[styles.iconContainer, { backgroundColor: COLORS.primarySoft }]}>
              <MaterialCommunityIcons name="wrench-outline" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.titleText}>
              RMA: {item.rmaNumber}
            </Text>
          </View>
        </View>

        {!!item.incidentNumber && (
          <View style={styles.incidentBadge}>
            <MaterialCommunityIcons name="alert-circle-outline" size={13} color={COLORS.info} style={{ marginRight: 4 }} />
            <Text style={[styles.incidentText, { color: COLORS.info }]}>
              Incidente: {item.incidentNumber}
            </Text>
          </View>
        )}

        {!!item.details && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsText} numberOfLines={4}>
              {item.details}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.footer}>
          <View style={styles.footerItem}>
            <MaterialCommunityIcons name="calendar-clock" size={14} color={COLORS.muted} style={{ marginRight: 4 }} />
            <Text style={styles.footerText}>Creado: {createdStr}</Text>
          </View>
          {!!item.createdName && (
            <View style={styles.footerItem}>
              <MaterialCommunityIcons name="account-circle-outline" size={14} color={COLORS.muted} style={{ marginRight: 4 }} />
              <Text style={styles.footerText}>Por: {item.createdName}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...Platform.select({
      web: {
        ...THEME.shadow.web,
        transition: "all 0.2s ease-in-out",
      } as any,
      default: THEME.shadow.soft,
    }),
  },
  cardHovered: {
    ...Platform.select({
      web: {
        transform: [{ translateY: -2 }],
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
      } as any,
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: THEME.spacing.sm,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    fontSize: THEME.fontSize.md + 1,
    fontWeight: "800",
    color: THEME.colors.text,
    letterSpacing: -0.2,
  },
  incidentBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(30, 64, 175, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: THEME.spacing.sm,
  },
  incidentText: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailsContainer: {
    backgroundColor: THEME.colors.bgMobile,
    borderRadius: THEME.radius.md - 2,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  detailsText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.text,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: THEME.spacing.md,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: THEME.colors.textSoft,
    fontWeight: "500",
  },
});

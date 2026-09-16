import React from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, THEME } from "../../lib/theme";

export default function CoordinadoresProgramacionScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="calendar-clock" size={32} color={COLORS.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Programación Operativa</Text>
          <Text style={styles.subtitle}>Coordinación y gestión de turnos</Text>
        </View>
      </View>

      <View style={styles.card}>
        <MaterialCommunityIcons name="clock-outline" size={48} color={COLORS.muted} style={{ marginBottom: 12 }} />
        <Text style={styles.cardTitle}>Módulo en Configuración</Text>
        <Text style={styles.cardDesc}>
          Esta sección está lista para configurarse con la metodología de programación que definas.
        </Text>
      </View>
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
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: THEME.spacing.xl,
    gap: THEME.spacing.md,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
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
  card: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: THEME.spacing.md,
  },
  cardTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: THEME.spacing.xs,
  },
  cardDesc: {
    fontSize: THEME.fontSize.md,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 480,
    lineHeight: 22,
  },
});

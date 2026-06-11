import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS, THEME } from "../lib/theme";

export function IpAccessGate({
  visible,
  cineLabel,
  ip,
  loading,
  error,
  onSubmit,
  onLogout,
}: {
  visible: boolean;
  cineLabel: string;
  ip: string;
  loading: boolean;
  error: string | null;
  onSubmit: (payload: { pin: string; label: string }) => void;
  onLogout: () => void;
}) {
  const [pin, setPin] = useState("");
  const [label, setLabel] = useState(
    Platform.OS === "web" ? "PC" : "Dispositivo"
  );

  const safeCineLabel = useMemo(() => cineLabel || "Cine", [cineLabel]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>IP no autorizada</Text>
          <Text style={s.subtitle}>
            Esta IP no está habilitada para <Text style={s.strong}>{safeCineLabel}</Text>.
          </Text>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>IP actual</Text>
            <Text style={s.infoValue}>{ip || "—"}</Text>
          </View>

          <Text style={s.label}>Nombre / etiqueta</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Ej: PC boletería"
            placeholderTextColor={COLORS.muted}
            style={s.input}
            editable={!loading}
          />

          <Text style={s.label}>PIN del cine</Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\s+/g, ""))}
            placeholder="****"
            placeholderTextColor={COLORS.muted}
            style={s.input}
            keyboardType="number-pad"
            secureTextEntry
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            editable={!loading}
          />

          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.primaryBtn, loading && s.btnDisabled]}
            onPress={() => onSubmit({ pin, label })}
            activeOpacity={0.9}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryText}>Autorizar y entrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryBtn, loading && s.btnDisabled]}
            onPress={onLogout}
            activeOpacity={0.9}
            disabled={loading}
          >
            <Text style={s.secondaryText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: THEME.spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  title: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },
  strong: { fontWeight: "800", color: COLORS.text },
  infoRow: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  infoValue: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 7,
    marginTop: 8,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 16,
  },
  errorBox: {
    marginTop: 12,
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--danger, #fecaca)" : "#fecaca",
    borderRadius: 14,
    padding: 10,
  },
  errorText: { color: COLORS.danger, fontWeight: "700", textAlign: "center" },
  primaryBtn: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: COLORS.text, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },
});


import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";

import { auth } from "../lib/firebaseConfig";
import { COLORS, THEME } from "../lib/theme";

type Props = {
  variant?: "icon" | "pill";
  label?: string;
};

export default function LogoutButton({
  variant = "icon",
  label = "Salir",
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConfirmLogout = async () => {
    try {
      await signOut(auth);
      setShowConfirm(false);
    } catch (e) {
      console.error(e);
      setShowConfirm(false);
      setErrorMsg("No se pudo cerrar la sesión.");
    }
  };

  return (
    <>
      {variant === "pill" ? (
        <TouchableOpacity
          onPress={() => setShowConfirm(true)}
          activeOpacity={0.85}
          style={s.pill}
        >
          <Text style={s.pillText}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setShowConfirm(true)}
          activeOpacity={0.9}
          style={s.icon}
        >
          <MaterialCommunityIcons name="logout" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Cerrar sesión</Text>
            <Text style={s.modalText}>¿Seguro que querés salir?</Text>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setShowConfirm(false)}
              >
                <Text style={s.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnDanger]}
                onPress={handleConfirmLogout}
              >
                <Text style={s.modalBtnDangerText}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!errorMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorMsg(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Error</Text>
            <Text style={s.modalText}>{errorMsg ?? ""}</Text>

            <View style={[s.modalActions, { justifyContent: "center" }]}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnPrimary]}
                onPress={() => setErrorMsg(null)}
              >
                <Text style={s.modalBtnPrimaryText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },

  pill: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  pillText: {
    color: "#fff",
    fontWeight: "800",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },

  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
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

  modalText: {
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: THEME.spacing.lg,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: THEME.spacing.md,
  },

  modalBtn: {
    minWidth: 90,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBtnCancel: {
    backgroundColor: COLORS.border,
  },

  modalBtnDanger: {
    backgroundColor: "#b91c1c",
  },

  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
  },

  modalBtnCancelText: {
    color: COLORS.text,
    fontWeight: "600",
  },

  modalBtnDangerText: {
    color: "#fff",
    fontWeight: "700",
  },

  modalBtnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { getCineConfig, saveCineConfig } from "@/lib/cineConfig";
import { changeCinemaPassword, updateProyeccionPin } from "@/lib/ipAccess";
import { COLORS, THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";
import { db, CINES_COLLECTION } from "@/lib/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

type Props = {
  visible: boolean;
  cineId: string;
  fallbackTitle?: string;
  onClose: () => void;
};

export default function CineProfileModal({
  visible,
  cineId,
  fallbackTitle = "Cine",
  onClose,
}: Props) {
  const { isMobile } = useAppLayout();

  const [loading, setLoading] = useState(true);

  const [savingConfig, setSavingConfig] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [nombre, setNombre] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [salasCount, setSalasCount] = useState("");

  const [configError, setConfigError] = useState<string | null>(null);
  const [configOkMsg, setConfigOkMsg] = useState<string | null>(null);

  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordOkMsg, setPasswordOkMsg] = useState<string | null>(null);

  const [newProyeccionPin, setNewProyeccionPin] = useState("");
  const [repeatProyeccionPin, setRepeatProyeccionPin] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [proyeccionPinError, setProyeccionPinError] = useState<string | null>(null);
  const [proyeccionPinOkMsg, setProyeccionPinOkMsg] = useState<string | null>(null);
  const [updatingProyeccionPin, setUpdatingProyeccionPin] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!visible || !cineId) return;

      setLoading(true);
      setConfigError(null);
      setConfigOkMsg(null);
      setPasswordError(null);
      setPasswordOkMsg(null);
      setRefreshStatus(null);
      setRefreshError(null);
      setPin("");
      setNewPassword("");
      setRepeatPassword("");
      setNewProyeccionPin("");
      setRepeatProyeccionPin("");
      setMasterPin("");
      setProyeccionPinError(null);
      setProyeccionPinOkMsg(null);

      try {
        const cfg = await getCineConfig(cineId);

        if (cancelled) return;

        setNombre(cfg?.nombre || fallbackTitle);
        setAuthEmail(cfg?.authEmail || "");
        setSalasCount(
          cfg?.salasCount != null && !Number.isNaN(cfg.salasCount)
            ? String(cfg.salasCount)
            : ""
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setConfigError("No se pudo cargar la configuración del cine.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [visible, cineId, fallbackTitle]);

  const handleSaveConfig = async () => {
    setConfigError(null);
    setConfigOkMsg(null);

    const parsed = Number(salasCount);

    if (!Number.isFinite(parsed) || parsed < 1) {
      setConfigError("La cantidad de salas debe ser un número mayor o igual a 1.");
      return;
    }

    try {
      setSavingConfig(true);

      await saveCineConfig(cineId, {
        nombre: nombre.trim(),
        authEmail: authEmail.trim(),
        salasCount: Math.floor(parsed),
      });

      setConfigOkMsg("Configuración guardada.");
    } catch (e) {
      console.error(e);
      setConfigError("No se pudo guardar la configuración.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordOkMsg(null);

    const cleanPin = pin.trim();
    const pass = newPassword;
    const repeat = repeatPassword;

    if (!cleanPin) {
      setPasswordError("Ingresá el PIN.");
      return;
    }

    if (!pass) {
      setPasswordError("Ingresá la nueva contraseña.");
      return;
    }

    if (pass.length < 6) {
      setPasswordError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (pass !== repeat) {
      setPasswordError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setChangingPassword(true);

      const res = await changeCinemaPassword({
        pin: cleanPin,
        newPassword: pass,
      });

      if (!res.ok) {
        setPasswordError(res.message);
        return;
      }

      setPasswordOkMsg(res.message);
      setPin("");
      setNewPassword("");
      setRepeatPassword("");
    } catch (e) {
      console.error(e);
      setPasswordError("No se pudo cambiar la contraseña.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveProyeccionPin = async () => {
    setProyeccionPinError(null);
    setProyeccionPinOkMsg(null);

    const cleanMasterPin = masterPin.trim();
    const cleanProjPin = newProyeccionPin.trim();
    const cleanRepeatProjPin = repeatProyeccionPin.trim();

    if (!cleanProjPin) {
      setProyeccionPinError("Ingresá el nuevo PIN proyeccion.");
      return;
    }

    if (cleanProjPin !== cleanRepeatProjPin) {
      setProyeccionPinError("Los PINs no coinciden.");
      return;
    }

    if (!cleanMasterPin) {
      setProyeccionPinError("Ingresá el PIN maestro.");
      return;
    }

    try {
      setUpdatingProyeccionPin(true);

      const res = await updateProyeccionPin({
        pin: cleanMasterPin,
        proyeccionPin: cleanProjPin,
      });

      if (!res.ok) {
        setProyeccionPinError(res.message);
        return;
      }

      setProyeccionPinOkMsg(res.message);
      setNewProyeccionPin("");
      setRepeatProyeccionPin("");
      setMasterPin("");
    } catch (e) {
      console.error(e);
      setProyeccionPinError("No se pudo actualizar el PIN de proyección.");
    } finally {
      setUpdatingProyeccionPin(false);
    }
  };

  const handleRefreshSession = async () => {
    setRefreshing(true);
    setRefreshStatus(null);
    setRefreshError(null);

    let backendUrl = "https://apivacas.jariel.com.ar";
    try {
      const globalConfigSnap = await getDoc(doc(db, CINES_COLLECTION, "global", "info", "config"));
      if (globalConfigSnap.exists() && globalConfigSnap.data()?.dataProcessorUrl) {
        backendUrl = globalConfigSnap.data()?.dataProcessorUrl;
      } else {
        const cineConfigSnap = await getDoc(doc(db, CINES_COLLECTION, cineId, "info", "config"));
        if (cineConfigSnap.exists() && cineConfigSnap.data()?.dataProcessorUrl) {
          backendUrl = cineConfigSnap.data()?.dataProcessorUrl;
        }
      }
    } catch (err) {
      console.error("Error al buscar backend URL en Firestore:", err);
    }

    try {
      const res = await fetch(`${backendUrl}/api/cinemark/session/refresh`, {
        method: "POST",
      });

      if (res.ok) {
        const resJson = await res.json() as any;
        if (resJson?.success) {
          setRefreshStatus("¡Sesión de Cinemark renovada con éxito!");
        } else {
          setRefreshError(`Error: ${resJson?.error || "Desconocido"}`);
        }
      } else {
        setRefreshError(`Error del servidor: ${res.status}`);
      }
    } catch (err: any) {
      console.error("Error renovando sesión:", err);
      setRefreshError(`Error: No se pudo conectar con el servidor.`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={[s.card, isMobile && s.cardMobile]}>
          <Text style={s.title}>Perfil del cine</Text>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator />
              <Text style={s.loadingText}>Cargando configuración…</Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.scrollContent}
            >
              <Text style={s.sectionTitle}>Configuración</Text>

              {(cineId === "parquebrown" || authEmail.toLowerCase().includes("parquebrown")) && (
                <View style={s.warningBanner}>
                  <Text style={s.warningBannerText}>
                    ⚠️ El control de acceso por IP (checkIpAccess) se encuentra desactivado para este usuario.
                  </Text>
                </View>
              )}

              <Text style={s.label}>Nombre</Text>
              <TextInput
                value={nombre}
                editable={false}
                style={[s.input, s.inputDisabled]}
                placeholderTextColor={COLORS.muted}
              />

              <Text style={s.label}>Email de acceso</Text>
              <TextInput
                value={authEmail}
                editable={false}
                style={[s.input, s.inputDisabled]}
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
              />

              <Text style={s.label}>Cine ID</Text>
              <TextInput
                value={cineId}
                editable={false}
                style={[s.input, s.inputDisabled]}
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
              />

              <Text style={s.label}>Cantidad de salas</Text>
              <TextInput
                value={salasCount}
                onChangeText={setSalasCount}
                keyboardType="number-pad"
                style={s.input}
                placeholder="Ej: 8"
                placeholderTextColor={COLORS.muted}
              />

              {configError ? <Text style={s.errorText}>{configError}</Text> : null}
              {configOkMsg ? <Text style={s.okText}>{configOkMsg}</Text> : null}

              <TouchableOpacity
                style={[s.btn, s.btnPrimary, s.sectionBtn]}
                onPress={handleSaveConfig}
                disabled={savingConfig}
              >
                <Text style={s.btnPrimaryText}>
                  {savingConfig ? "Guardando..." : "Guardar configuración"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.btn,
                  { backgroundColor: COLORS.border || "#333", marginTop: 12 },
                  s.btnMobile
                ]}
                onPress={handleRefreshSession}
                disabled={refreshing}
              >
                <Text style={[s.btnPrimaryText, { color: COLORS.text }]}>
                  {refreshing ? "Renovando sesión..." : "Renovar sesión"}
                </Text>
              </TouchableOpacity>

              {refreshError ? <Text style={s.errorText}>{refreshError}</Text> : null}
              {refreshStatus ? <Text style={s.okText}>{refreshStatus}</Text> : null}

              <View style={s.divider} />

              <Text style={s.sectionTitle}>Cambiar contraseña</Text>

              <Text style={s.helpText}>
                Para cambiar la contraseña del usuario del cine, ingresá el PIN
                actual y la nueva contraseña.
              </Text>

              <Text style={s.label}>PIN</Text>
              <TextInput
                value={pin}
                onChangeText={setPin}
                style={s.input}
                placeholder="Ingresá el PIN"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
              />

              <Text style={s.label}>Nueva contraseña</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                style={s.input}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                autoCapitalize="none"
              />

              <Text style={s.label}>Repetir nueva contraseña</Text>
              <TextInput
                value={repeatPassword}
                onChangeText={setRepeatPassword}
                style={s.input}
                placeholder="Repetí la contraseña"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                autoCapitalize="none"
              />

              {passwordError ? <Text style={s.errorText}>{passwordError}</Text> : null}
              {passwordOkMsg ? <Text style={s.okText}>{passwordOkMsg}</Text> : null}

              <TouchableOpacity
                style={[s.btn, s.btnPrimary, s.sectionBtn]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                <Text style={s.btnPrimaryText}>
                  {changingPassword ? "Actualizando..." : "Cambiar contraseña"}
                </Text>
              </TouchableOpacity>

              <View style={s.divider} />

              <Text style={s.sectionTitle}>Pin proyeccion</Text>

              <Text style={s.helpText}>
                Para configurar o modificar el PIN de proyección, ingresá el nuevo PIN
                y autorizalo con el PIN maestro.
              </Text>

              <Text style={s.label}>Nuevo PIN proyeccion</Text>
              <TextInput
                value={newProyeccionPin}
                onChangeText={setNewProyeccionPin}
                style={s.input}
                placeholder="Ej: 1234"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                keyboardType="number-pad"
              />

              <Text style={s.label}>Repetir PIN proyeccion</Text>
              <TextInput
                value={repeatProyeccionPin}
                onChangeText={setRepeatProyeccionPin}
                style={s.input}
                placeholder="Repetir PIN proyeccion"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                keyboardType="number-pad"
              />

              <Text style={s.label}>PIN maestro</Text>
              <TextInput
                value={masterPin}
                onChangeText={setMasterPin}
                style={s.input}
                placeholder="PIN maestro"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
              />

              {proyeccionPinError ? <Text style={s.errorText}>{proyeccionPinError}</Text> : null}
              {proyeccionPinOkMsg ? <Text style={s.okText}>{proyeccionPinOkMsg}</Text> : null}

              <TouchableOpacity
                style={[s.btn, s.btnPrimary, s.sectionBtn]}
                onPress={handleSaveProyeccionPin}
                disabled={updatingProyeccionPin}
              >
                <Text style={s.btnPrimaryText}>
                  {updatingProyeccionPin ? "Guardando..." : "Guardar Pin proyeccion"}
                </Text>
              </TouchableOpacity>

              <View style={[s.actions, isMobile && s.actionsMobile]}>
                <TouchableOpacity
                  style={[s.btn, s.btnGhost, isMobile && s.btnMobile]}
                  onPress={onClose}
                  disabled={savingConfig || changingPassword}
                >
                  <Text style={s.btnGhostText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },

  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.xl,
  },

  cardMobile: {
    padding: 18,
    borderRadius: 16,
    maxHeight: "92%",
  },

  title: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: THEME.spacing.md,
  },

  scrollContent: {
    paddingBottom: 4,
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

  sectionTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },

  label: {
    color: COLORS.muted,
    marginBottom: 6,
    marginTop: THEME.spacing.sm,
    fontWeight: "700",
    fontSize: THEME.fontSize.sm,
  },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
  },

  inputDisabled: {
    backgroundColor: COLORS.bgMobile,
    color: COLORS.muted,
  },

  helpText: {
    marginTop: THEME.spacing.xs,
    color: COLORS.muted,
    lineHeight: 20,
    fontSize: THEME.fontSize.sm,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: THEME.spacing.lg,
  },

  errorText: {
    marginTop: THEME.spacing.md,
    color: "#b91c1c",
    fontWeight: "700",
  },

  okText: {
    marginTop: THEME.spacing.md,
    color: "#15803d",
    fontWeight: "700",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: THEME.spacing.lg,
  },

  actionsMobile: {
    flexDirection: "column",
  },

  btn: {
    minWidth: 120,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  btnMobile: {
    width: "100%",
    minWidth: 0,
  },

  btnGhost: {
    backgroundColor: COLORS.border,
  },

  btnGhostText: {
    color: COLORS.text,
    fontWeight: "700",
  },

  btnPrimary: {
    backgroundColor: COLORS.primary,
  },

  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
  },

  sectionBtn: {
    marginTop: THEME.spacing.md,
  },

  warningBanner: {
    backgroundColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
  },

  warningBannerText: {
    color: COLORS.warning,
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    lineHeight: 20,
  },
});
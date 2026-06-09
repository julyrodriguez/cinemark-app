import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  APP_AUTH_DOMAIN,
  auth,
} from "../lib/firebaseConfig";
import { COLORS } from "../lib/theme";
import { sanitizeCineId } from "@/shared/utils";

export default function Login() {
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cineIdPreview = useMemo(() => sanitizeCineId(username), [username]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthed(!!u);
      setChecked(true);
    });

    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    const cleanUser = sanitizeCineId(username);
    const email = `${cleanUser}@${APP_AUTH_DOMAIN}`;

    setError(null);

    if (!cleanUser || !pass.trim()) {
      setError("Completá cine/usuario y contraseña.");
      return;
    }

    try {
      setLoading(true);

      const cred = await signInWithEmailAndPassword(auth, email, pass);

      void cred;

      const displayName = username.trim() || cleanUser;

      await AsyncStorage.multiSet([
        ["displayName", displayName],
        ["cineId", cleanUser],
      ]);
    } catch (e: any) {
      let msg = "Error al iniciar sesión.";

      switch (e?.code) {
        case "auth/invalid-email":
          msg = "Usuario inválido.";
          break;
        case "auth/user-not-found":
          msg = "Ese usuario no existe.";
          break;
        case "auth/wrong-password":
        case "auth/invalid-credential":
          msg = "Usuario o contraseña incorrectos.";
          break;
        case "auth/too-many-requests":
          msg = "Demasiados intentos. Probá de nuevo más tarde.";
          break;
      }

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!checked) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (authed) return <Redirect href="/" />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.hero}>
            <View style={styles.logoCircle}>
              <MaterialCommunityIcons
                name="movie-open-check-outline"
                size={34}
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.title}>Bienvenido</Text>
            <Text style={styles.subtitle}>
              Ingresá con el usuario del cine para acceder al panel.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Iniciar sesión</Text>
             
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Cine / Usuario</Text>

              <View style={styles.inputWrap}>
                <MaterialCommunityIcons
                  name="account-outline"
                  size={20}
                  color={COLORS.muted}
                  style={styles.leftIcon}
                />

                <TextInput
                  placeholder="Ej: abasto"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    if (error) setError(null);
                  }}
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Contraseña</Text>

              <View style={styles.inputWrap}>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={20}
                  color={COLORS.muted}
                  style={styles.leftIcon}
                />

                <TextInput
                  placeholder="Contraseña"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={secure}
                  value={pass}
                  onChangeText={(text) => {
                    setPass(text);
                    if (error) setError(null);
                  }}
                  style={[styles.input, styles.passwordInput]}
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                />

                <TouchableOpacity
                  onPress={() => setSecure((s) => !s)}
                  style={styles.eyeBtn}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={secure ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={18}
                  color={COLORS.danger}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.btnText}>Entrar</Text>
                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={18}
                    color="#fff"
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },

  scrollContent: {
    flexGrow: 1,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },

  hero: {
    width: "100%",
    maxWidth: 460,
    alignItems: "center",
    marginBottom: 22,
  },

  logoCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f1caca",
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.8,
  },

  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
    textAlign: "center",
    maxWidth: 360,
  },

  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  cardHeader: {
    marginBottom: 18,
  },

  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },

  cardSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 20,
    textAlign: "center",
  },

  fieldBlock: {
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 7,
  },

  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.muted,
  },

  inputWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingLeft: 44,
    paddingRight: 12,
  },

  leftIcon: {
    position: "absolute",
    left: 14,
  },

  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 14,
    paddingRight: 10,
  },

  passwordInput: {
    paddingRight: 42,
  },

  eyeBtn: {
    position: "absolute",
    right: 10,
    padding: 8,
  },

  errorBox: {
    marginTop: 4,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  errorText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "600",
  },

  btn: {
    height: 54,
    marginTop: 6,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  btnDisabled: {
    opacity: 0.75,
  },

  btnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.2,
  },
}); 
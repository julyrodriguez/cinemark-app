import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
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

import NavHeader from "@/components/NavHeader";
import PageContainer from "@/components/PageContainer";
import PageTitle from "@/components/PageTitle";
import SectionCard from "@/components/SectionCard";
import {
  adminChangeCinePassword,
  adminCreateCine,
  adminListAuthorizedIps,
  adminListCines,
  adminRemoveAuthorizedIp,
  adminSetOficinasRole,
  adminUpdateCine,
  adminUpsertAuthorizedIp,
  AuthorizedIpItem,
  CineListItem,
} from "@/lib/adminCines";
import { checkIpAccess, authorizeCurrentIp } from "@/lib/ipAccess";
import { COLORS, THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";
import { useAuthUser } from "@/lib/useAuthUser";

type AdminView = "list" | "create" | "edit";

export default function AdminCinesScreen() {
  const { isWeb, isMobile, isDesktop } = useAppLayout();
  const { user, loading: authLoading, isLoggedIn, isAdmin } = useAuthUser();

  const [view, setView] = useState<AdminView>("list");
  const [cines, setCines] = useState<CineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [selectedCine, setSelectedCine] = useState<CineListItem | null>(null);

  const [formCineId, setFormCineId] = useState("");
  const [formNombre, setFormNombre] = useState("");
  const [formAuthEmail, setFormAuthEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSalasCount, setFormSalasCount] = useState("");
  const [formInitialIps, setFormInitialIps] = useState("");

  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [ipsModalVisible, setIpsModalVisible] = useState(false);
  const [ips, setIps] = useState<AuthorizedIpItem[]>([]);
  const [ipsLoading, setIpsLoading] = useState(false);
  const [newIpModalVisible, setNewIpModalVisible] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState("");
  const [newIpLabel, setNewIpLabel] = useState("");
  const [newIpType, setNewIpType] = useState<"fixed" | "mobile">("fixed");

  const [ipCheckState, setIpCheckState] = useState<"checking" | "authorized" | "not_authorized" | "error">("checking");
  const [ipCheckError, setIpCheckError] = useState<string | null>(null);
  const [adminPin, setAdminPin] = useState("");
  const [adminIpLabel, setAdminIpLabel] = useState("");
  const [adminIpLoading, setAdminIpLoading] = useState(false);
  const [adminIpError, setAdminIpError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      checkAdminIpAccess();
    }
  }, [isLoggedIn, isAdmin]);

  useEffect(() => {
    if (ipCheckState === "authorized") {
      loadCines();
    }
  }, [ipCheckState]);

  const checkAdminIpAccess = async () => {
    try {
      setIpCheckState("checking");
      const res = await checkIpAccess();

      if (res.state === "authorized") {
        setIpCheckState("authorized");
      } else if (res.state === "not_authorized") {
        setIpCheckState("not_authorized");
      } else if (res.state === "error") {
        setIpCheckState("error");
        setIpCheckError(res.message);
      }
    } catch (e: any) {
      setIpCheckState("error");
      setIpCheckError(e?.message || "Error al validar IP.");
    }
  };

  const handleAdminIpAuthorization = async () => {
    if (!adminPin.trim()) {
      setAdminIpError("Ingresá el PIN.");
      return;
    }
    if (!adminIpLabel.trim()) {
      setAdminIpError("Ingresá un nombre para esta IP.");
      return;
    }

    try {
      setAdminIpLoading(true);
      setAdminIpError(null);

      const res = await authorizeCurrentIp({
        pin: adminPin,
        label: adminIpLabel,
      });

      if (res.ok) {
        setIpCheckState("authorized");
        setAdminPin("");
        setAdminIpLabel("");
      } else {
        setAdminIpError(res.message);
      }
    } catch (e: any) {
      setAdminIpError(e?.message || "Error al autorizar IP.");
    } finally {
      setAdminIpLoading(false);
    }
  };

  const loadCines = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminListCines({ query: searchQuery });
      setCines(res.items);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Error al cargar cines.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCine = async () => {
    setFormError(null);
    setFormSuccess(null);

    if (!formCineId.trim()) {
      setFormError("CineId requerido.");
      return;
    }
    if (!formNombre.trim()) {
      setFormError("Nombre requerido.");
      return;
    }
    if (!formPassword || formPassword.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!formPin.trim()) {
      setFormError("PIN requerido.");
      return;
    }

    const initialIps = formInitialIps
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((ip) => ({ ip, label: "Inicial", type: "fixed" as const }));

    const salasCount = formSalasCount.trim() ? parseInt(formSalasCount) : 0;

    try {
      setFormLoading(true);
      await adminCreateCine({
        cineId: formCineId.trim(),
        nombre: formNombre.trim(),
        authEmail: formAuthEmail.trim() || undefined,
        initialPassword: formPassword,
        accessPin: formPin.trim(),
        active: formActive,
        salasCount: salasCount > 0 ? salasCount : undefined,
        initialIps: initialIps.length > 0 ? initialIps : undefined,
      });

      setFormSuccess("Cine creado exitosamente.");
      setFormCineId("");
      setFormNombre("");
      setFormAuthEmail("");
      setFormPassword("");
      setFormPin("");
      setFormActive(true);
      setFormSalasCount("");
      setFormInitialIps("");

      await loadCines();

      setTimeout(() => {
        setView("list");
        setFormSuccess(null);
      }, 1500);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Error al crear cine.";
      setFormError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateCine = async () => {
    if (!selectedCine) return;

    setFormError(null);
    setFormSuccess(null);

    const patch: any = { cineId: selectedCine.cineId };
    if (formNombre.trim() && formNombre !== selectedCine.nombre) {
      patch.nombre = formNombre.trim();
    }
    if (formAuthEmail.trim() && formAuthEmail !== selectedCine.authEmail) {
      patch.authEmail = formAuthEmail.trim();
    }
    if (formPin.trim()) {
      patch.accessPin = formPin.trim();
    }
    if (formActive !== selectedCine.active) {
      patch.active = formActive;
    }

    if (Object.keys(patch).length === 1) {
      setFormError("No hay cambios para guardar.");
      return;
    }

    try {
      setFormLoading(true);
      await adminUpdateCine(patch);
      setFormSuccess("Cine actualizado.");
      await loadCines();

      setTimeout(() => {
        setView("list");
        setSelectedCine(null);
        setFormSuccess(null);
      }, 1500);
    } catch (e: any) {
      console.error(e);
      setFormError(e?.message || "Error al actualizar cine.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditCine = (cine: CineListItem) => {
    setSelectedCine(cine);
    setFormCineId(cine.cineId);
    setFormNombre(cine.nombre);
    setFormAuthEmail(cine.authEmail);
    setFormPin("");
    setFormActive(cine.active);
    setFormError(null);
    setFormSuccess(null);
    setView("edit");
  };

  const handleViewIps = async (cine: CineListItem) => {
    setSelectedCine(cine);
    setIpsModalVisible(true);
    setIpsLoading(true);
    try {
      const res = await adminListAuthorizedIps({ cineId: cine.cineId });
      setIps(res.items);
    } catch (e: any) {
      console.error(e);
      setIps([]);
    } finally {
      setIpsLoading(false);
    }
  };

  const handleAddIp = async () => {
    if (!selectedCine) return;
    if (!newIpAddress.trim() || !newIpLabel.trim()) {
      alert("IP y Label requeridos.");
      return;
    }

    try {
      await adminUpsertAuthorizedIp({
        cineId: selectedCine.cineId,
        ip: newIpAddress.trim(),
        label: newIpLabel.trim(),
        type: newIpType,
        active: true,
      });

      setNewIpModalVisible(false);
      setNewIpAddress("");
      setNewIpLabel("");
      setNewIpType("fixed");

      const res = await adminListAuthorizedIps({ cineId: selectedCine.cineId });
      setIps(res.items);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error al agregar IP.");
    }
  };

  const handleRemoveIp = async (ip: string) => {
    if (!selectedCine) return;
    if (!confirm(`¿Eliminar IP ${ip}?`)) return;

    try {
      await adminRemoveAuthorizedIp({ cineId: selectedCine.cineId, ip });
      const res = await adminListAuthorizedIps({ cineId: selectedCine.cineId });
      setIps(res.items);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error al eliminar IP.");
    }
  };

  const handleChangePassword = async () => {
    if (!selectedCine) return;
    
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    if (!newPasswordValue || newPasswordValue.length < 8) {
      setPasswordChangeError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    try {
      setPasswordChangeLoading(true);
      const res = await adminChangeCinePassword({
        cineId: selectedCine.cineId,
        newPassword: newPasswordValue,
      });
      
      setPasswordChangeSuccess(res.message);
      setNewPasswordValue("");
      
      setTimeout(() => {
        setChangePasswordModalVisible(false);
        setPasswordChangeSuccess(null);
      }, 1500);
    } catch (e: any) {
      console.error(e);
      setPasswordChangeError(e?.message || "Error al cambiar contraseña.");
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleSetOficinasRole = async (cineId: string) => {
    if (!confirm(`¿Convertir "${cineId}" a rol OFICINAS? Este usuario podrá ver eventos de todos los cines. El usuario debe cerrar sesión y volver a iniciar para que el cambio tome efecto.`)) {
      return;
    }

    try {
      const res = await adminSetOficinasRole({ cineId });
      alert(res.message + "\n\nEl usuario debe cerrar sesión y volver a iniciar.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error al convertir a rol oficinas.");
    }
  };

  if (authLoading) {
    return (
      <View style={s.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isLoggedIn || !user) {
    return <Redirect href="/login" />;
  }

  if (!isAdmin) {
    return (
      <View style={s.loadingScreen}>
        <Text style={s.errorText}>Acceso denegado. Requiere rol admin.</Text>
      </View>
    );
  }

  if (ipCheckState === "checking") {
    return (
      <View style={s.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Validando IP...</Text>
      </View>
    );
  }

  if (ipCheckState === "error") {
    return (
      <View style={s.loadingScreen}>
        <Text style={s.errorText}>{ipCheckError || "Error al validar IP."}</Text>
        <TouchableOpacity
          style={[s.btnPrimary, { marginTop: 16 }]}
          onPress={checkAdminIpAccess}
        >
          <Text style={s.btnPrimaryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (ipCheckState === "not_authorized") {
    return (
      <View style={s.loadingScreen}>
        <SectionCard style={{ maxWidth: 400, width: "100%" }}>
          <Text style={s.ipGateTitle}>Validación de IP - Admin</Text>
          <Text style={s.ipGateText}>
            Para acceder al panel de administración, debes autorizar tu IP actual.
          </Text>

          <Text style={s.label}>PIN de Acceso</Text>
          <TextInput
            value={adminPin}
            onChangeText={setAdminPin}
            placeholder="Ingresá el PIN"
            placeholderTextColor={COLORS.muted}
            style={s.input}
            secureTextEntry
            editable={!adminIpLoading}
          />

          <Text style={s.label}>Nombre de esta IP</Text>
          <TextInput
            value={adminIpLabel}
            onChangeText={setAdminIpLabel}
            placeholder="Ej: Oficina, Casa, etc."
            placeholderTextColor={COLORS.muted}
            style={s.input}
            editable={!adminIpLoading}
          />

          {adminIpError && <Text style={s.errorText}>{adminIpError}</Text>}

          <TouchableOpacity
            style={[s.btnPrimary, { marginTop: 16 }, adminIpLoading && { opacity: 0.5 }]}
            onPress={handleAdminIpAuthorization}
            disabled={adminIpLoading}
          >
            {adminIpLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.btnPrimaryText}>Autorizar IP</Text>
            )}
          </TouchableOpacity>
        </SectionCard>
      </View>
    );
  }

  return (
    <View
      style={[
        s.container,
        { backgroundColor: isWeb ? THEME.colors.bg : THEME.colors.bgMobile },
      ]}
    >
      <NavHeader title="Admin Cines" subtitle="Gestión de cines y usuarios" />

 <ScrollView
    style={s.scroll}
    contentContainerStyle={s.scrollContent}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
  >
      <PageContainer>
        {view === "list" && (
          <>
            <PageTitle
              title="Cines"
              subtitle="Gestión de cines y usuarios"
              right={
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => {
                    setFormCineId("");
                    setFormNombre("");
                    setFormAuthEmail("");
                    setFormPassword("");
                    setFormPin("");
                    setFormActive(true);
                    setFormInitialIps("");
                    setFormError(null);
                    setFormSuccess(null);
                    setView("create");
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                  <Text style={s.btnPrimaryText}>Crear cine</Text>
                </TouchableOpacity>
              }
            />

            <SectionCard>
              <Text style={s.label}>Buscar</Text>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Nombre, cineId o email..."
                placeholderTextColor={COLORS.muted}
                style={s.input}
              />
              <TouchableOpacity
                style={[s.btnSecondary, { marginTop: 12 }]}
                onPress={loadCines}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="magnify"
                  size={18}
                  color={COLORS.text}
                />
                <Text style={s.btnSecondaryText}>Buscar</Text>
              </TouchableOpacity>
            </SectionCard>

            {loading ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator />
                <Text style={s.loadingText}>Cargando cines...</Text>
              </View>
            ) : error ? (
              <Text style={s.errorText}>{error}</Text>
            ) : cines.length === 0 ? (
              <Text style={s.emptyText}>No hay cines.</Text>
            ) : (
              <View style={s.cinesList}>
                {cines.map((cine) => (
                  <SectionCard key={cine.cineId} style={{ marginBottom: 12 }}>
                    <View style={s.cineRow}>
                      <View style={s.cineInfo}>
                        <Text style={s.cineName}>{cine.nombre}</Text>
                        <Text style={s.cineDetail}>ID: {cine.cineId}</Text>
                        <Text style={s.cineDetail}>Email: {cine.authEmail}</Text>
                        <View style={s.statusRow}>
                          <View
                            style={[
                              s.statusBadge,
                              cine.active ? s.statusActive : s.statusInactive,
                            ]}
                          >
                            <Text
                              style={[
                                s.statusText,
                                cine.active
                                  ? s.statusTextActive
                                  : s.statusTextInactive,
                              ]}
                            >
                              {cine.active ? "Activo" : "Inactivo"}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={s.cineActions}>
                        <TouchableOpacity
                          style={s.iconBtn}
                          onPress={() => handleEditCine(cine)}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons
                            name="pencil"
                            size={18}
                            color={COLORS.primary}
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.iconBtn}
                          onPress={() => handleViewIps(cine)}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons
                            name="ip-network"
                            size={18}
                            color={COLORS.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </SectionCard>
                ))}
              </View>
            )}
          </>
        )}

        {view === "create" && (
          <>
            <PageTitle
              title="Crear cine"
              right={
                <TouchableOpacity
                  style={s.btnSecondary}
                  onPress={() => setView("list")}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={18}
                    color={COLORS.text}
                  />
                  <Text style={s.btnSecondaryText}>Volver</Text>
                </TouchableOpacity>
              }
            />

            <SectionCard>
              <Text style={s.label}>Cine ID *</Text>
              <TextInput
                value={formCineId}
                onChangeText={setFormCineId}
                placeholder="ej: abasto"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                autoCapitalize="none"
              />

              <Text style={s.label}>Nombre *</Text>
              <TextInput
                value={formNombre}
                onChangeText={setFormNombre}
                placeholder="ej: Cine Abasto"
                placeholderTextColor={COLORS.muted}
                style={s.input}
              />

              <Text style={s.label}>Email (opcional)</Text>
              <TextInput
                value={formAuthEmail}
                onChangeText={setFormAuthEmail}
                placeholder="Dejar vacío para auto-generar"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={s.label}>Contraseña inicial * (mín 8 caracteres)</Text>
              <TextInput
                value={formPassword}
                onChangeText={setFormPassword}
                placeholder="Contraseña"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                secureTextEntry
              />

              <Text style={s.label}>PIN de acceso *</Text>
              <TextInput
                value={formPin}
                onChangeText={setFormPin}
                placeholder="PIN"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                secureTextEntry
              />

              <Text style={s.label}>Cantidad de salas (opcional)</Text>
              <TextInput
                value={formSalasCount}
                onChangeText={setFormSalasCount}
                placeholder="Dejar vacío para 0"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                keyboardType="number-pad"
              />

              <View style={s.checkboxRow}>
                <TouchableOpacity
                  style={s.checkbox}
                  onPress={() => setFormActive(!formActive)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={formActive ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={24}
                    color={formActive ? COLORS.primary : COLORS.muted}
                  />
                  <Text style={s.checkboxLabel}>Activo</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>IPs autorizadas iniciales (opcional)</Text>
              <TextInput
                value={formInitialIps}
                onChangeText={setFormInitialIps}
                placeholder="Una IP por línea"
                placeholderTextColor={COLORS.muted}
                style={[s.input, s.textArea]}
                multiline
                numberOfLines={4}
              />

              {formError && <Text style={s.errorText}>{formError}</Text>}
              {formSuccess && <Text style={s.successText}>{formSuccess}</Text>}

              <TouchableOpacity
                style={[s.btnPrimary, { marginTop: 16 }]}
                onPress={handleCreateCine}
                disabled={formLoading}
                activeOpacity={0.8}
              >
                {formLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    <Text style={s.btnPrimaryText}>Crear cine</Text>
                  </>
                )}
              </TouchableOpacity>
            </SectionCard>
          </>
        )}

        {view === "edit" && selectedCine && (
          <>
            <PageTitle
              title={`Editar: ${selectedCine.nombre}`}
              right={
                <TouchableOpacity
                  style={s.btnSecondary}
                  onPress={() => {
                    setView("list");
                    setSelectedCine(null);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={18}
                    color={COLORS.text}
                  />
                  <Text style={s.btnSecondaryText}>Volver</Text>
                </TouchableOpacity>
              }
            />

            <SectionCard>
              <Text style={s.label}>Cine ID (no editable)</Text>
              <TextInput
                value={formCineId}
                editable={false}
                style={[s.input, s.inputDisabled]}
              />

              <Text style={s.label}>Nombre</Text>
              <TextInput
                value={formNombre}
                onChangeText={setFormNombre}
                placeholder="Nombre"
                placeholderTextColor={COLORS.muted}
                style={s.input}
              />

              <Text style={s.label}>Email</Text>
              <TextInput
                value={formAuthEmail}
                onChangeText={setFormAuthEmail}
                placeholder="Email"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={s.label}>Nuevo PIN (dejar vacío para no cambiar)</Text>
              <TextInput
                value={formPin}
                onChangeText={setFormPin}
                placeholder="Nuevo PIN"
                placeholderTextColor={COLORS.muted}
                style={s.input}
                secureTextEntry
              />

              <View style={s.checkboxRow}>
                <TouchableOpacity
                  style={s.checkbox}
                  onPress={() => setFormActive(!formActive)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={formActive ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={24}
                    color={formActive ? COLORS.primary : COLORS.muted}
                  />
                  <Text style={s.checkboxLabel}>Activo</Text>
                </TouchableOpacity>
              </View>

              {formError && <Text style={s.errorText}>{formError}</Text>}
              {formSuccess && <Text style={s.successText}>{formSuccess}</Text>}

              <TouchableOpacity
                style={[s.btnPrimary, { marginTop: 16 }]}
                onPress={handleUpdateCine}
                disabled={formLoading}
                activeOpacity={0.8}
              >
                {formLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    <Text style={s.btnPrimaryText}>Guardar cambios</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btnSecondary, { marginTop: 12 }]}
                onPress={() => {
                  setPasswordChangeError(null);
                  setPasswordChangeSuccess(null);
                  setNewPasswordValue("");
                  setChangePasswordModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="lock-reset" size={18} color={COLORS.text} />
                <Text style={s.btnSecondaryText}>Cambiar contraseña</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btnSecondary, { marginTop: 12, backgroundColor: "#fef3c7", borderColor: "#f59e0b" }]}
                onPress={() => handleSetOficinasRole(selectedCine.cineId)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="office-building" size={18} color="#f59e0b" />
                <Text style={[s.btnSecondaryText, { color: "#f59e0b" }]}>Convertir a Rol Oficinas</Text>
              </TouchableOpacity>
            </SectionCard>
          </>
        )}
      </PageContainer>
</ScrollView>
      <Modal
        visible={ipsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIpsModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isMobile && s.modalCardMobile]}>
            <Text style={s.modalTitle}>
              IPs autorizadas: {selectedCine?.nombre}
            </Text>

            {ipsLoading ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator />
              </View>
            ) : (
              <ScrollView style={s.ipsScroll}>
                {ips.length === 0 ? (
                  <Text style={s.emptyText}>No hay IPs autorizadas.</Text>
                ) : (
                  ips.map((ipItem) => (
                    <View key={ipItem.id} style={s.ipRow}>
                      <View style={s.ipInfo}>
                        <Text style={s.ipAddress}>{ipItem.ip}</Text>
                        <Text style={s.ipLabel}>{ipItem.label}</Text>
                        <Text style={s.ipType}>
                          {ipItem.type === "fixed" ? "PC/Desktop" : "Móvil"}
                          {ipItem.active ? "" : " (Inactiva)"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={s.iconBtnDanger}
                        onPress={() => handleRemoveIp(ipItem.ip)}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons
                          name="delete"
                          size={18}
                          color="#b91c1c"
                        />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => setNewIpModalVisible(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                <Text style={s.btnPrimaryText}>Agregar IP</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => setIpsModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={s.btnSecondaryText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={newIpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewIpModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isMobile && s.modalCardMobile]}>
            <Text style={s.modalTitle}>Agregar IP autorizada</Text>

            <Text style={s.label}>Dirección IP</Text>
            <TextInput
              value={newIpAddress}
              onChangeText={setNewIpAddress}
              placeholder="ej: 192.168.1.100"
              placeholderTextColor={COLORS.muted}
              style={s.input}
            />

            <Text style={s.label}>Etiqueta</Text>
            <TextInput
              value={newIpLabel}
              onChangeText={setNewIpLabel}
              placeholder="ej: PC boletería"
              placeholderTextColor={COLORS.muted}
              style={s.input}
            />

            <Text style={s.label}>Tipo</Text>
            <View style={s.radioGroup}>
              <TouchableOpacity
                style={s.radioOption}
                onPress={() => setNewIpType("fixed")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={
                    newIpType === "fixed"
                      ? "radiobox-marked"
                      : "radiobox-blank"
                  }
                  size={24}
                  color={newIpType === "fixed" ? COLORS.primary : COLORS.muted}
                />
                <Text style={s.radioLabel}>Fija</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.radioOption}
                onPress={() => setNewIpType("mobile")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={
                    newIpType === "mobile"
                      ? "radiobox-marked"
                      : "radiobox-blank"
                  }
                  size={24}
                  color={newIpType === "mobile" ? COLORS.primary : COLORS.muted}
                />
                <Text style={s.radioLabel}>Móvil</Text>
              </TouchableOpacity>
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleAddIp}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="check" size={18} color="#fff" />
                <Text style={s.btnPrimaryText}>Agregar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => {
                  setNewIpModalVisible(false);
                  setNewIpAddress("");
                  setNewIpLabel("");
                  setNewIpType("fixed");
                }}
                activeOpacity={0.8}
              >
                <Text style={s.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={changePasswordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChangePasswordModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, isMobile && s.modalCardMobile]}>
            <Text style={s.modalTitle}>
              Cambiar contraseña: {selectedCine?.nombre}
            </Text>

            <Text style={s.label}>Nueva contraseña (mín 8 caracteres)</Text>
            <TextInput
              value={newPasswordValue}
              onChangeText={setNewPasswordValue}
              placeholder="Nueva contraseña"
              placeholderTextColor={COLORS.muted}
              style={s.input}
              secureTextEntry
              editable={!passwordChangeLoading}
            />

            {passwordChangeError && <Text style={s.errorText}>{passwordChangeError}</Text>}
            {passwordChangeSuccess && <Text style={s.successText}>{passwordChangeSuccess}</Text>}

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleChangePassword}
                disabled={passwordChangeLoading}
                activeOpacity={0.8}
              >
                {passwordChangeLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    <Text style={s.btnPrimaryText}>Cambiar</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => {
                  setChangePasswordModalVisible(false);
                  setNewPasswordValue("");
                  setPasswordChangeError(null);
                  setPasswordChangeSuccess(null);
                }}
                disabled={passwordChangeLoading}
                activeOpacity={0.8}
              >
                <Text style={s.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.bg,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.xl,
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: "700",
    marginTop: THEME.spacing.md,
  },
  successText: {
    color: "#15803d",
    fontWeight: "700",
    marginTop: THEME.spacing.md,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    marginTop: THEME.spacing.lg,
  },
  label: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    marginTop: THEME.spacing.sm,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    color: COLORS.text,
    fontSize: THEME.fontSize.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: THEME.spacing.xl,
  },

  inputDisabled: {
    backgroundColor: COLORS.bgMobile,
    color: COLORS.muted,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radius.md,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: THEME.fontSize.md,
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.border,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radius.md,
  },
  btnSecondaryText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: THEME.fontSize.md,
  },
  checkboxRow: {
    marginTop: THEME.spacing.md,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkboxLabel: {
    fontSize: THEME.fontSize.md,
    color: COLORS.text,
    fontWeight: "600",
  },
  cinesList: {
    marginTop: THEME.spacing.md,
  },
  cineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cineInfo: {
    flex: 1,
  },
  cineName: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  cineDetail: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginBottom: 2,
  },
  statusRow: {
    marginTop: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: "#d1fae5",
  },
  statusInactive: {
    backgroundColor: "#fee2e2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusTextActive: {
    color: "#15803d",
  },
  statusTextInactive: {
    color: "#b91c1c",
  },
  cineActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: "#f1caca",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDanger: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },
  modalCard: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80%",
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCardMobile: {
    width: "100%",
    maxWidth: 360,
    padding: 18,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: THEME.spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: THEME.spacing.lg,
  },
  ipsScroll: {
    maxHeight: 300,
  },
  ipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  ipInfo: {
    flex: 1,
  },
  ipAddress: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
  },
  ipLabel: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginTop: 2,
  },
  ipType: {
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    marginTop: 2,
  },
  radioGroup: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  radioLabel: {
    fontSize: THEME.fontSize.md,
    color: COLORS.text,
    marginLeft: 8,
  },
  ipGateTitle: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: THEME.spacing.sm,
    textAlign: "center",
  },
  ipGateText: {
    fontSize: THEME.fontSize.md,
    color: COLORS.muted,
    marginBottom: THEME.spacing.lg,
    textAlign: "center",
    lineHeight: 22,
  },
  loadingText: {
    marginTop: THEME.spacing.sm,
    color: COLORS.muted,
    fontSize: THEME.fontSize.md,
  },
});

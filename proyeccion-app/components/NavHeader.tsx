import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";
import LogoutButton from "@/components/LogoutButton";

type Props = {
  title?: string;
  subtitle?: string;
  onPressSettings?: () => void;
  onPressMenu?: () => void;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
};

export default function NavHeader({
  title,
  subtitle,
  onPressSettings,
  onPressMenu,
  themeMode = "light",
  onToggleTheme,
}: Props) {
  const { isWeb, isMobile, contentMaxWidth } = useAppLayout();

  return (
    <View style={[s.wrap, isWeb ? s.wrapWeb : s.wrapMobile]}>
      <View
        style={[
          s.row,
          isWeb && {
            maxWidth: contentMaxWidth,
          },
        ]}
      >
        <View style={s.side}>
          {isMobile && onPressMenu ? (
            <TouchableOpacity
              style={s.menuBtn}
              onPress={onPressMenu}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="menu"
                size={24}
                color={COLORS.text}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={s.centerBlock}>
          <Text style={[s.title, isWeb && s.titleWeb]} numberOfLines={1}>
            Panel de gestión
          </Text>
        </View>

        <View style={[s.sideRightWrap]}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={onToggleTheme}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={themeMode === "dark" ? "weather-sunny" : "weather-night"}
              size={isMobile ? 22 : 24}
              color={COLORS.text}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  wrapWeb: {
    height: 72,
    paddingHorizontal: THEME.spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    ...THEME.shadow.web,
  },

  wrapMobile: {
    paddingTop: 48,
    paddingBottom: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },

  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },

  side: {
    width: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  centerBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  logoCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: "#f1caca",
    alignItems: "center",
    justifyContent: "center",
  },

  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  title: {
    fontSize: THEME.fontSize.xl,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.3,
    textAlign: "center",
  },

  titleWeb: {
    fontSize: THEME.fontSize.xxl,
  },

  subtitle: {
    marginTop: 2,
    fontSize: THEME.fontSize.sm,
    color: COLORS.muted,
    fontWeight: "600",
    textAlign: "center",
  },

  sideRightWrap: {
    width: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
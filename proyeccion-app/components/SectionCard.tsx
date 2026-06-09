import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export default function SectionCard({ children, style }: Props) {
  const { isWeb } = useAppLayout();

  return (
    <View style={[styles.base, isWeb ? styles.webCard : styles.mobileCard, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: "100%",
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },

  webCard: {
    ...THEME.shadow.web,
  },

  mobileCard: {
    ...THEME.shadow.soft,
  },
});
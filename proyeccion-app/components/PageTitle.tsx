import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  center?: boolean;
};

export default function PageTitle({ title, subtitle, right, center }: Props) {
  const { isDesktop, isWeb } = useAppLayout();

  return (
    <View style={[styles.wrap, isDesktop && styles.wrapDesktop, center && { alignItems: "center", justifyContent: "center" }]}>
      <View style={[styles.left, center && { alignItems: "center" }]}>
        <Text
          style={[
            styles.title,
            { fontSize: isWeb ? THEME.fontSize.xxl : THEME.fontSize.xl },
            center && { textAlign: "center" },
          ]}
        >
          {title}
        </Text>

        {!!subtitle && (
          <Text style={[styles.subtitle, center && { textAlign: "center" }]}>
            {subtitle}
          </Text>
        )}
      </View>

      {!!right && <View style={styles.right}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginBottom: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },

  wrapDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  left: {
    flexShrink: 1,
  },

  right: {
    marginTop: 8,
  },

  title: {
    fontWeight: "800",
    color: THEME.colors.text,
    letterSpacing: -0.4,
  },

  subtitle: {
    marginTop: 4,
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textSoft,
  },
});
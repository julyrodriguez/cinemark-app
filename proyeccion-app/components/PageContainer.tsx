import React from "react";
import { StyleSheet, View } from "react-native";

import { THEME } from "@/lib/theme";
import { useAppLayout } from "@/lib/useAppLayout";

type Props = {
  children: React.ReactNode;
};

export default function PageContainer({ children }: Props) {
  const { isWeb, pagePadding, contentMaxWidth } = useAppLayout();

  return (
    <View
      style={[
        styles.outer,
        { backgroundColor: isWeb ? THEME.colors.bg : THEME.colors.bgMobile },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            maxWidth: contentMaxWidth,
            paddingHorizontal: pagePadding,
            paddingTop: 0,
            paddingBottom: 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  inner: {
    flex: 1,
    width: "100%",
  },
}); 
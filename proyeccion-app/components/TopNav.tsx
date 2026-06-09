import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { COLORS, THEME } from "../lib/theme";
import { useAppLayout } from "../lib/useAppLayout";

type TabKey = "index" | "eventos" | "creditos" | "rma";

type Props = {
  active: TabKey;
};

const TAB_LABELS: Record<TabKey, string> = {
  index: "Calendario",
  eventos: "Eventos",
  creditos: "Créditos",
  rma: "RMA",
};

export default function TopNav({ active }: Props) {
  const router = useRouter();
  const { isWeb, contentMaxWidth } = useAppLayout();

  function goTo(tab: TabKey) {
    router.replace(`/${tab === "index" ? "" : tab}`);
  }

  return (
    <View style={[st.wrap, isWeb && st.wrapWeb]}>
      <View style={[st.innerWrap, isWeb && { maxWidth: contentMaxWidth }]}>
        <ScrollView
          horizontal={!isWeb}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[st.row, !isWeb && st.rowMobile]}
        >
          {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => {
            const isActive = active === tab;

            return (
              <TouchableOpacity
                key={tab}
                onPress={() => goTo(tab)}
                style={[
                  st.btn,
                  !isWeb && st.btnMobile,
                  isActive && st.btnActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={[st.btnText, isActive && st.btnTextActive]}>
                  {TAB_LABELS[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },

  wrapWeb: {
    alignItems: "center",
    ...THEME.shadow.web,
  },

  innerWrap: {
    width: "100%",
  },

  row: {
    flexDirection: "row",
    width: "100%",
    paddingHorizontal: THEME.spacing.sm,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },

  rowMobile: {
    paddingHorizontal: 6,
  },

  btn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  btnMobile: {
    flex: undefined,
    minWidth: 120,
  },

  btnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  btnText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: THEME.fontSize.sm,
  },

  btnTextActive: {
    color: "#fff",
  },
});
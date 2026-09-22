import { Platform } from "react-native";

export const COLORS = {
  bg: Platform.OS === "web" ? "var(--bg, #F8FAFC)" : "#F8FAFC",
  bgMobile: Platform.OS === "web" ? "var(--bg-mobile, #F1F5F9)" : "#F1F5F9",
  primary: Platform.OS === "web" ? "var(--primary, #890404)" : "#890404",
  primaryDark: Platform.OS === "web" ? "var(--primary-dark, #6f0303)" : "#6f0303",
  primarySoft: Platform.OS === "web" ? "var(--primary-soft, #FBEAEA)" : "#FBEAEA",
  text: Platform.OS === "web" ? "var(--text, #0F172A)" : "#0F172A",
  muted: Platform.OS === "web" ? "var(--muted, #64748B)" : "#64748B",
  textSoft: Platform.OS === "web" ? "var(--text-soft, #64748B)" : "#64748B",
  card: Platform.OS === "web" ? "var(--card, #FFFFFF)" : "#FFFFFF",
  border: Platform.OS === "web" ? "var(--border, #E2E8F0)" : "#E2E8F0",
  successBg: Platform.OS === "web" ? "var(--success-bg, #D1FAE5)" : "#D1FAE5",
  success: Platform.OS === "web" ? "var(--success, #047857)" : "#047857",
  successBorder: Platform.OS === "web" ? "var(--success-border, #BBF7D0)" : "#BBF7D0",
  danger: Platform.OS === "web" ? "var(--danger, #DC2626)" : "#DC2626",
  dangerSoft: Platform.OS === "web" ? "var(--danger-soft, #FEE2E2)" : "#FEE2E2",
  warning: Platform.OS === "web" ? "var(--warning, #8a5a00)" : "#8a5a00",
  warningBg: Platform.OS === "web" ? "var(--warning-bg, #fff4d6)" : "#fff4d6",
  warningBorder: Platform.OS === "web" ? "var(--warning-border, #ead9a5)" : "#ead9a5",
  info: Platform.OS === "web" ? "var(--info, #1E40AF)" : "#1E40AF",
  infoBg: Platform.OS === "web" ? "var(--info-bg, #F0F7FF)" : "#F0F7FF",
  infoBorder: Platform.OS === "web" ? "var(--info-border, #b8d4f0)" : "#b8d4f0",
  teal: Platform.OS === "web" ? "var(--teal, #0D9488)" : "#0D9488",
  tealBg: Platform.OS === "web" ? "var(--teal-bg, #F0FDFA)" : "#F0FDFA",
  tealBorder: Platform.OS === "web" ? "var(--teal-border, #CCFBF1)" : "#CCFBF1",
  betaBg: Platform.OS === "web" ? "var(--beta-bg, #F5F3FF)" : "#F5F3FF",
  betaBorder: Platform.OS === "web" ? "var(--beta-border, #8B5CF6)" : "#8B5CF6",
  betaText: Platform.OS === "web" ? "var(--beta-text, #7C3AED)" : "#7C3AED",
  betaTextSoft: Platform.OS === "web" ? "var(--beta-text-soft, #6D28D9)" : "#6D28D9",
  betaBadgeBg: Platform.OS === "web" ? "var(--beta-badge-bg, #EDE9FE)" : "#EDE9FE",
  betaFilePickerBg: Platform.OS === "web" ? "var(--beta-file-picker-bg, #F3E8FF)" : "#F3E8FF",
  betaFilePickerText: Platform.OS === "web" ? "var(--beta-file-picker-text, #4C1D95)" : "#4C1D95",
  betaDivider: Platform.OS === "web" ? "var(--beta-divider, #DDD6FE)" : "#DDD6FE",
  betaBtnDisabled: Platform.OS === "web" ? "var(--beta-btn-disabled, #C084FC)" : "#C084FC",
};

export const THEME = {
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 26,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  colors: {
    ...COLORS,
    surface: COLORS.card,
  },
  shadow: {
    web: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    soft: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
    },
  },
} as const;

/**
 * Aplica el tema CSS a document.documentElement para web.
 * Modo oscuro configurado en tonos grises muy oscuros / neutros (zinc/charcoal), sin tintes azules.
 */
export function applyTheme(mode: "light" | "dark") {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const root = document.documentElement;

  if (mode === "dark") {
    // ── Paleta de grises muy oscuros / zinc neutro (cero tinte azul) ──
    root.style.setProperty("--bg", "#121214");
    root.style.setProperty("--bg-mobile", "#0C0C0E");
    root.style.setProperty("--card", "#18181B");
    root.style.setProperty("--border", "#27272A");
    root.style.setProperty("--text", "#E4E4E7");
    root.style.setProperty("--muted", "#A1A1AA");
    root.style.setProperty("--text-soft", "#A1A1AA");

    // Marca Cinemark / Primario
    root.style.setProperty("--primary", "#E11D48");
    root.style.setProperty("--primary-dark", "#9F1239");
    root.style.setProperty("--primary-soft", "#2A1417");

    // Estados
    root.style.setProperty("--success-bg", "#0F261B");
    root.style.setProperty("--success", "#10B981");
    root.style.setProperty("--success-border", "#165A3E");

    root.style.setProperty("--danger", "#EF4444");
    root.style.setProperty("--danger-soft", "#2D1416");

    root.style.setProperty("--warning", "#F59E0B");
    root.style.setProperty("--warning-bg", "#281D0D");
    root.style.setProperty("--warning-border", "#5E3B0E");

    // Info ajustado a fondo gris neutro con acento
    root.style.setProperty("--info", "#38BDF8");
    root.style.setProperty("--info-bg", "#181B22");
    root.style.setProperty("--info-border", "#283344");

    // Teal (Lentes 3D)
    root.style.setProperty("--teal", "#14B8A6");
    root.style.setProperty("--teal-bg", "#0E2320");
    root.style.setProperty("--teal-border", "#15524B");

    // Beta / Púrpura
    root.style.setProperty("--beta-bg", "#1B1626");
    root.style.setProperty("--beta-border", "#6D28D9");
    root.style.setProperty("--beta-text", "#C4B5FD");
    root.style.setProperty("--beta-text-soft", "#A78BFA");
    root.style.setProperty("--beta-badge-bg", "#351C62");
    root.style.setProperty("--beta-file-picker-bg", "#161220");
    root.style.setProperty("--beta-file-picker-text", "#DDD6FE");
    root.style.setProperty("--beta-divider", "#351C62");
    root.style.setProperty("--beta-btn-disabled", "#4C1D95");
  } else {
    // ── Modo claro ──
    root.style.setProperty("--bg", "#F8FAFC");
    root.style.setProperty("--bg-mobile", "#F1F5F9");
    root.style.setProperty("--card", "#FFFFFF");
    root.style.setProperty("--border", "#E2E8F0");
    root.style.setProperty("--text", "#0F172A");
    root.style.setProperty("--muted", "#64748B");
    root.style.setProperty("--text-soft", "#64748B");

    root.style.setProperty("--primary", "#890404");
    root.style.setProperty("--primary-dark", "#6f0303");
    root.style.setProperty("--primary-soft", "#FBEAEA");

    root.style.setProperty("--success-bg", "#D1FAE5");
    root.style.setProperty("--success", "#047857");
    root.style.setProperty("--success-border", "#BBF7D0");

    root.style.setProperty("--danger", "#DC2626");
    root.style.setProperty("--danger-soft", "#FEE2E2");

    root.style.setProperty("--warning", "#8a5a00");
    root.style.setProperty("--warning-bg", "#fff4d6");
    root.style.setProperty("--warning-border", "#ead9a5");

    root.style.setProperty("--info", "#1E40AF");
    root.style.setProperty("--info-bg", "#F0F7FF");
    root.style.setProperty("--info-border", "#b8d4f0");

    root.style.setProperty("--teal", "#0D9488");
    root.style.setProperty("--teal-bg", "#F0FDFA");
    root.style.setProperty("--teal-border", "#CCFBF1");

    root.style.setProperty("--beta-bg", "#F5F3FF");
    root.style.setProperty("--beta-border", "#8B5CF6");
    root.style.setProperty("--beta-text", "#7C3AED");
    root.style.setProperty("--beta-text-soft", "#6D28D9");
    root.style.setProperty("--beta-badge-bg", "#EDE9FE");
    root.style.setProperty("--beta-file-picker-bg", "#F3E8FF");
    root.style.setProperty("--beta-file-picker-text", "#4C1D95");
    root.style.setProperty("--beta-divider", "#DDD6FE");
    root.style.setProperty("--beta-btn-disabled", "#C084FC");
  }

  // Actualizar meta theme-color para navegadores móviles y desktop
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", mode === "dark" ? "#121214" : "#F8FAFC");
  }

  // Notificar al motor de render del navegador
  root.style.colorScheme = mode;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function getSavedTheme(): "light" | "dark" {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    const saved = localStorage.getItem("theme_mode");
    if (saved === "dark" || saved === "light") {
      return saved;
    }
  }
  return "light";
}

export function saveTheme(mode: "light" | "dark") {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem("theme_mode", mode);
  }
}
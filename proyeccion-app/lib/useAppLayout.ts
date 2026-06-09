import { Platform, useWindowDimensions } from "react-native";

export function useAppLayout() {
  const { width, height } = useWindowDimensions();

  const isWeb = Platform.OS === "web";
  const isNative = Platform.OS !== "web";

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1100;
  const isDesktop = isWeb && width >= 1100;
  const isLargeDesktop = isWeb && width >= 1440;

  const pagePadding = isLargeDesktop ? 32 : isDesktop ? 28 : isTablet ? 20 : 14;
  const contentMaxWidth = isLargeDesktop
    ? 1500
    : isDesktop
    ? 1320
    : isTablet
    ? 1000
    : 700;

  const columns = isLargeDesktop ? 3 : isDesktop ? 2 : 1;

  return {
    width,
    height,
    isWeb,
    isNative,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    pagePadding,
    contentMaxWidth,
    columns,
  };
}
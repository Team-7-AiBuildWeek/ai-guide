/**
 * The website's frosted glass (.glass, .panel--glass), as Liquid Glass.
 *
 * Only for what floats over the map — the back button, the turn card, status
 * panels — never for reading text. Where Liquid Glass is unavailable (before
 * iOS 26, Android) or the walker has turned on Reduce Transparency, every
 * surface goes back to the website's solid fallback.
 */

import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, shadow } from "@/lib/theme";

function glassSupported(): boolean {
  return Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

/** Whether to draw real glass right now (supported, and Reduce Transparency is off). */
export function useGlass(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    // An iOS setting; the browser preview has neither it nor the glass.
    if (Platform.OS !== "ios") return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);
    return () => sub.remove();
  }, []);
  return glassSupported() && !reduceTransparency;
}

/**
 * Light glass for buttons with short ink labels (.glass); dark for panels with
 * on-dark text (.panel--glass). Never opacity on GlassView: below 1 it stops
 * rendering the effect.
 */
export function GlassSurface({
  tone = "light",
  style,
  interactive,
  children,
}: {
  tone?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const glass = useGlass();
  if (glass) {
    return (
      <GlassView
        style={[shadow.lift, style]}
        glassEffectStyle="regular"
        colorScheme={tone}
        tintColor={tone === "dark" ? "rgba(31,31,31,0.72)" : "rgba(255,255,255,0.55)"}
        isInteractive={interactive}
      >
        {children}
      </GlassView>
    );
  }
  return <View style={[tone === "dark" ? styles.dark : styles.light, shadow.lift, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  light: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  dark: { backgroundColor: colors.dark },
});

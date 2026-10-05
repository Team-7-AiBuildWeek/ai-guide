/**
 * Liquid Glass for the navigation layer: controls that float above content.
 *
 * Apple's rule, followed throughout the app: glass is for controls and
 * navigation only, never for content (lists, text, the map). Every surface here
 * falls back to a solid one when glass is unavailable — iOS before 26, Android,
 * a build made without the iOS 26 SDK — or when the walker has turned on
 * Reduce Transparency, which Apple asks apps to respect.
 */

import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/lib/theme";

function glassSupported(): boolean {
  return Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

/** Whether to draw real glass right now (supported, and Reduce Transparency is off). */
export function useGlass(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);
    return () => sub.remove();
  }, []);
  return glassSupported() && !reduceTransparency;
}

type SurfaceProps = {
  style?: StyleProp<ViewStyle>;
  tint?: string;
  interactive?: boolean;
  children?: ReactNode;
};

/** A glass panel, or a solid one where glass should not be drawn. */
export function GlassSurface({ style, tint, interactive, children }: SurfaceProps) {
  const glass = useGlass();
  if (glass) {
    return (
      // Light until the app has a dark theme: its text colours are for light surfaces.
      <GlassView style={style} glassEffectStyle="regular" colorScheme="light" tintColor={tint} isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.solid, tint ? { backgroundColor: tint } : null, style]}>{children}</View>;
}

/**
 * Glass that sits close together must share a container: glass cannot sample
 * other glass, and grouped pieces blend and morph as one.
 */
export function GlassGroup({ spacing = 12, style, children }: { spacing?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const glass = useGlass();
  if (glass) return <GlassContainer spacing={spacing} style={style}>{children}</GlassContainer>;
  return <View style={style}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** The screen's main action: tinted, like SwiftUI's .glassProminent. */
  prominent?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function GlassButton({ label, onPress, prominent, disabled, style, accessibilityLabel }: ButtonProps) {
  const glass = useGlass();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      // The whole capsule is tappable, not only the label (glass hit-testing
      // pitfall). Interactive glass animates its own press; the solid fallback
      // gets a small scale instead. Never opacity on glass: below 1 it stops
      // rendering the effect, so a disabled button is shown by its label.
      style={({ pressed }) => [!glass && pressed && styles.pressed, !glass && disabled && styles.disabled, style]}
    >
      <GlassSurface
        style={styles.button}
        tint={prominent && !disabled ? colors.mint : undefined}
        interactive={!disabled}
      >
        <Text style={[styles.label, prominent && !disabled && styles.labelProminent, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  button: { borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 17, fontWeight: "600", color: colors.mint },
  labelProminent: { color: "#fff" },
  labelDisabled: { color: colors.inkMute },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.97 }] },
});

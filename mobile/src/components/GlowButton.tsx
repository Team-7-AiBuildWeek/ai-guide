/**
 * The glow button — the website's components/ui/glow-button.tsx, natively:
 * the one press that sets the AI to work ("Create the tour"). Mint pill,
 * sparkles, and a soft mint halo that breathes behind it; it squeezes for
 * 200ms when pressed. The halo is still with Reduce Motion, and gone when the
 * button is disabled.
 */

import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useReduceMotion } from "@/lib/motion";
import { colors, fonts, radius, size } from "@/lib/theme";

export default function GlowButton({
  label = "Generate",
  onPress,
  disabled,
  style,
}: {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const still = useReduceMotion();
  const [breath] = useState(() => new Animated.Value(0));
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (still || disabled) {
      breath.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, disabled, breath]);

  const press = () => {
    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    onPress?.();
  };

  return (
    <View style={style}>
      {!disabled ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }),
              transform: [{ scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.03] }) }],
            },
          ]}
        />
      ) : null}
      <Pressable
        onPress={press}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={[styles.button, disabled ? styles.disabled : styles.live, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Text style={[styles.label, disabled && { color: colors.inkMute }]}>{label}</Text>
        <SymbolView
          name={{ ios: "sparkles", android: "auto_awesome", web: "auto_awesome" } as never}
          size={16}
          tintColor={disabled ? colors.inkMute : colors.ink}
          fallback={<Text style={styles.label}>✦</Text>}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: "absolute",
    top: 6,
    bottom: -4,
    left: 10,
    right: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    shadowColor: colors.mint,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 20,
  },
  live: { backgroundColor: colors.mint, borderWidth: 2, borderColor: "#b8f5d6" },
  disabled: { backgroundColor: colors.line },
  label: { fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
});

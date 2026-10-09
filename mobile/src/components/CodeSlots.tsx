/**
 * The six-digit sign-in code, one slot per digit — the website's CodeSlots
 * (after React Bits), drawn natively.
 *
 * Each digit springs in and fills its slot; a code pasted or filled in from
 * Mail lands in a cascade. A rejected code drains last to first in red and
 * clears; an accepted one fills the row with one mint wash and a tick.
 *
 * One hidden TextInput does the typing, so the number pad, paste and iOS's
 * "From Mail" code suggestion all work as they do in any field.
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useReduceMotion } from "@/lib/motion";
import { colors, fonts } from "@/lib/theme";

export type CodeStatus = "idle" | "error" | "success";

const CASCADE_MS = 20;
const SETTLE_MS = 300;
const RISE = 8;

const digitsOf = (raw: string) => raw.replace(/\D/g, "");

export default function CodeSlots({
  length = 6,
  value,
  onChange,
  onComplete,
  status = "idle",
  autoFocus = false,
  disabled = false,
  slotSize = 46,
  gap = 8,
  radius = 12,
}: {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  status?: CodeStatus;
  autoFocus?: boolean;
  disabled?: boolean;
  slotSize?: number;
  gap?: number;
  radius?: number;
}) {
  const still = useReduceMotion();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [draining, setDraining] = useState(false);
  const [fills] = useState(() => Array.from({ length }, () => new Animated.Value(0)));
  const [wash] = useState(() => new Animated.Value(0));
  const height = Math.round(slotSize * 1.18);
  const digits = digitsOf(value).slice(0, length);
  /** The code as it was when it was rejected, drawn while it drains away. */
  const [held, setHeld] = useState("");

  // Digits that arrive spring in, a cascade when several land at once; digits taken away drain.
  const previous = useRef("");
  useEffect(() => {
    const prev = previous.current;
    previous.current = digits;
    let landing = 0;
    for (let i = 0; i < length; i++) {
      const was = prev[i] ?? "";
      const now = digits[i] ?? "";
      if (now && now !== was) {
        fills[i].setValue(0);
        Animated.spring(fills[i], {
          toValue: 1,
          delay: still ? 0 : landing * CASCADE_MS,
          speed: 18,
          bounciness: 6,
          useNativeDriver: true,
        }).start();
        landing++;
      } else if (!now && was && !draining) {
        Animated.timing(fills[i], { toValue: 0, duration: still ? 0 : 150, useNativeDriver: true }).start();
      }
    }
  }, [digits, length, fills, still, draining]);

  // Rejected: drain last to first in red, then clear the code.
  useEffect(() => {
    if (status !== "error") return;
    const filled = [...digits].map((_, i) => i).reverse();
    if (!filled.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraining(true);
    setHeld(digits);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.stagger(
      still ? 0 : CASCADE_MS,
      filled.map((i) => Animated.timing(fills[i], { toValue: 0, duration: still ? 0 : SETTLE_MS, useNativeDriver: true })),
    ).start(() => {
      setDraining(false);
      setHeld("");
      onChange("");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Accepted: one wash over the whole row, and a tick.
  useEffect(() => {
    if (status !== "success") {
      wash.setValue(0);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.timing(wash, { toValue: 1, duration: still ? 0 : 300, useNativeDriver: true }).start();
  }, [status, wash, still]);

  const busy = disabled || draining || status === "success";
  const active = Math.min(digits.length, length - 1);
  const danger = status === "error";

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityRole="none" style={{ alignSelf: "center" }}>
      <View style={[styles.row, { gap }]}>
        {Array.from({ length }, (_, i) => {
          const ch = digits[i] ?? "";
          const isActive = focused && !busy && i === active && !ch;
          return (
            <View
              key={i}
              style={[
                styles.slot,
                { width: slotSize, height, borderRadius: radius },
                danger && { backgroundColor: "#f6dcdc" },
                isActive && { borderColor: colors.mint, borderWidth: 2 },
              ]}
            >
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: radius, backgroundColor: danger ? colors.danger : colors.mint, transform: [{ scale: fills[i] }] },
                ]}
              />
              <Animated.Text
                style={[
                  styles.digit,
                  { fontSize: Math.round(slotSize * 0.5), color: danger ? "#fff" : colors.ink },
                  {
                    opacity: fills[i],
                    transform: [{ translateY: fills[i].interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
                  },
                ]}
              >
                {ch || held[i] || ""}
              </Animated.Text>
              {isActive ? <Caret height={height * 0.5} /> : null}
            </View>
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[styles.wash, { borderRadius: radius, opacity: wash, transform: [{ scaleX: wash.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}
        >
          <Text style={styles.tick}>✓</Text>
        </Animated.View>
      </View>
      <TextInput
        ref={input}
        value={digits}
        onChangeText={(raw) => {
          if (busy) return;
          const next = digitsOf(raw).slice(0, length);
          onChange(next);
          if (next.length === length && digits.length < length) onComplete?.(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        editable={!busy}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        accessibilityLabel="Six-digit code"
        style={styles.hidden}
      />
    </Pressable>
  );
}

/** The blinking caret in the slot waiting for the next digit. */
function Caret({ height }: { height: number }) {
  const [blink] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 0, delay: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 0, delay: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return <Animated.View style={[styles.caret, { height, opacity: blink }]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", position: "relative" },
  slot: { backgroundColor: "#f3f4f6", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  digit: { fontFamily: fonts.display, fontVariant: ["tabular-nums"] },
  caret: { position: "absolute", width: 2, borderRadius: 1, backgroundColor: colors.ink },
  wash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  tick: { fontSize: 26, color: colors.ink, fontFamily: fonts.display },
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0 },
});

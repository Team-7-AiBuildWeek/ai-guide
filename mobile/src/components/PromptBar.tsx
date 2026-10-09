/**
 * "Ask anything" — the website's PromptBar (after React Bits), drawn natively.
 *
 * A field that grows with the question, and a send tile that turns ink once
 * there is something to send; while the guide answers, its arrow morphs into
 * a stop square, with the original's mid-morph squash and lean. No mic: the
 * iPhone keyboard's own dictation does that, in every language.
 */

import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { tick, useReduceMotion } from "@/lib/motion";
import { colors, fonts, radius, size } from "@/lib/theme";

const ARROW_UP = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const MORPH_MS = 240;
const SQUASH = 0.12;
const TILT = 8;
const LINE = 24;
const MAX_ROWS = 5;

const pathAt = (t: number) => {
  let d = "";
  for (let i = 0; i < ARROW_UP.length; i += 2) {
    const x = ARROW_UP[i] + (SQUARE[i] - ARROW_UP[i]) * t;
    const y = ARROW_UP[i + 1] + (SQUARE[i + 1] - ARROW_UP[i + 1]) * t;
    d += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
};

/** The arrow that becomes a square while an answer is coming. */
function SendGlyph({ busy, color }: { busy: boolean; color: string }) {
  const still = useReduceMotion();
  const [t] = useState(() => new Animated.Value(busy ? 1 : 0));
  const [d, setD] = useState(() => pathAt(busy ? 1 : 0));
  const [dir, setDir] = useState(busy ? 1 : -1);

  useEffect(() => {
    const id = t.addListener(({ value }) => setD(pathAt(value)));
    return () => t.removeListener(id);
  }, [t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDir(busy ? 1 : -1);
    Animated.timing(t, {
      toValue: busy ? 1 : 0,
      duration: still ? 0 : MORPH_MS,
      easing: Easing.bezier(0.77, 0, 0.175, 1),
      useNativeDriver: false,
    }).start();
  }, [busy, still, t]);

  // Pinched and leaning halfway through, upright at both ends.
  const goo = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
  return (
    <Animated.View
      style={{
        transform: [
          { rotate: goo.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${dir * TILT}deg`] }) },
          { scaleX: goo.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - SQUASH] }) },
          { scaleY: goo.interpolate({ inputRange: [0, 1], outputRange: [1, 1 / (1 - SQUASH)] }) },
        ],
      }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d={d} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

export default function PromptBar({
  placeholder = "Ask anything",
  busy = false,
  onSend,
  onStop,
}: {
  placeholder?: string;
  busy?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [press] = useState(() => new Animated.Value(1));
  const canSend = draft.trim().length > 0;
  const armed = busy || canSend;

  const send = () => {
    if (!canSend || busy) return;
    tick();
    onSend(draft.trim());
    setDraft("");
  };

  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMute}
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="send"
        onSubmitEditing={send}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        style={styles.input}
      />
      <View style={styles.bar}>
        <Animated.View style={{ transform: [{ scale: press }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? "Stop" : "Send"}
            disabled={!armed}
            onPressIn={() => Animated.timing(press, { toValue: 0.96, duration: 80, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(press, { toValue: 1, speed: 30, bounciness: 6, useNativeDriver: true }).start()}
            onPress={() => (busy ? onStop?.() : send())}
            style={[styles.send, armed && styles.sendArmed]}
          >
            <SendGlyph busy={busy} color={armed ? "#ffffff" : colors.lineStrong} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
    paddingTop: 12,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.panel,
    backgroundColor: colors.surface,
  },
  fieldFocused: { borderColor: colors.inkMute },
  input: {
    minHeight: LINE,
    maxHeight: LINE * MAX_ROWS,
    padding: 0,
    fontFamily: fonts.body,
    fontSize: size.body,
    lineHeight: LINE,
    color: colors.ink,
  },
  bar: { flexDirection: "row", justifyContent: "flex-end" },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  sendArmed: { backgroundColor: colors.ink },
});

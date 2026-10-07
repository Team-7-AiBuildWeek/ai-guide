/**
 * The first screen: what Walk is, and a way in.
 *
 * Laid out like Luma's welcome — things orbiting a mark, a two-line promise, one
 * button — but drawn in the app's own language: the plain canvas, white
 * surfaces with a hairline, mint as the one fill, ink text, and the same sheet
 * that slides over the map. "Get started" lifts it: an email, a six-digit code,
 * and the walker is signed in. Signing in is never required; the sheet always
 * offers the way past it.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SignInSheet, { sheetChrome } from "@/components/SignInSheet";
import { Btn } from "@/components/ui";
import { accountsEnabled } from "@/lib/accounts";
import { markWelcomed } from "@/lib/auth";
import { colors, fonts, shadow, type } from "@/lib/theme";

type Orbiter = { icon: string; bg: string; size: number; angle: number };

/** Two rings of what a walk is made of, turning slowly in opposite directions. */
const INNER: Orbiter[] = [
  { icon: "🏛", bg: colors.surface, size: 64, angle: 200 },
  { icon: "🎧", bg: colors.mintWash, size: 60, angle: 330 },
  { icon: "📍", bg: colors.surface, size: 58, angle: 80 },
];
const OUTER: Orbiter[] = [
  { icon: "🏰", bg: colors.mintWash, size: 70, angle: 15 },
  { icon: "🎨", bg: colors.surface, size: 62, angle: 95 },
  { icon: "🗺", bg: colors.surface, size: 66, angle: 160 },
  { icon: "☕", bg: colors.mintWash, size: 58, angle: 235 },
  { icon: "🎵", bg: colors.surface, size: 60, angle: 300 },
];

function Ring({
  radius: r,
  items,
  spin,
  reverse,
}: {
  radius: number;
  items: Orbiter[];
  spin: Animated.Value;
  reverse?: boolean;
}) {
  const turn = spin.interpolate({ inputRange: [0, 1], outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"] });
  const counter = spin.interpolate({ inputRange: [0, 1], outputRange: reverse ? ["0deg", "360deg"] : ["360deg", "0deg"] });
  return (
    <Animated.View style={[styles.ring, { width: r * 2, height: r * 2, borderRadius: r, transform: [{ rotate: turn }] }]}>
      {items.map((o) => {
        const a = (o.angle * Math.PI) / 180;
        return (
          <Animated.View
            key={o.icon}
            style={[
              styles.orbiter,
              {
                width: o.size,
                height: o.size,
                borderRadius: o.size / 2,
                backgroundColor: o.bg,
                left: r + r * Math.cos(a) - o.size / 2,
                top: r + r * Math.sin(a) - o.size / 2,
                transform: [{ rotate: counter }],
              },
            ]}
          >
            <Text style={{ fontSize: o.size * 0.5 }}>{o.icon}</Text>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

export default function Welcome() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sheet?: string }>();
  const [open, setOpen] = useState(params.sheet === "1");
  const [spin] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(params.sheet === "1" ? 1 : 0));
  const unit = Math.min(width, 430);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let gone = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      // The screen may have closed before the answer came back.
      if (gone || still) return;
      loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 90_000, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => {
      gone = true;
      loop?.stop();
    };
  }, [spin]);

  useEffect(() => {
    Animated.spring(lift, { toValue: open ? 1 : 0, useNativeDriver: true, bounciness: 3, speed: 12 }).start();
  }, [open, lift]);

  const finish = () => {
    markWelcomed();
    router.replace("/");
  };

  const orbitY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.12] });
  const textOpacity = lift.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" });
  const sheetY = lift.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <View style={styles.screen}>

      <Animated.View style={[styles.orbit, { top: height * 0.36, transform: [{ translateY: orbitY }] }]} pointerEvents="none">
        <View style={[styles.ring, { width: unit * 1.3, height: unit * 1.3, borderRadius: unit * 0.65 }]} />
        <Ring radius={unit * 0.43} items={OUTER} spin={spin} reverse />
        <Ring radius={unit * 0.27} items={INNER} spin={spin} />
        <View style={[styles.ring, styles.core, { width: unit * 0.3, height: unit * 0.3, borderRadius: unit * 0.15 }]}>
          <Image source={require("../../assets/logo.png")} style={styles.mark} />
        </View>
      </Animated.View>

      <Animated.View style={[styles.bottom, { paddingBottom: insets.bottom + 16, opacity: textOpacity }]} pointerEvents={open ? "none" : "auto"}>
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>walk</Text>
          <View style={styles.wordmarkDot} />
        </View>
        <Text style={styles.headline}>Audio tours anywhere</Text>
        <Text style={[styles.headline, { color: colors.mintInk }]}>Start walking</Text>
        <Btn variant="primary" large label="Get started" onPress={() => (accountsEnabled ? setOpen(true) : finish())} style={styles.cta} />
      </Animated.View>

      {accountsEnabled ? (
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: sheetY }] }]} pointerEvents={open ? "auto" : "none"}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[sheetChrome.panel, { paddingBottom: Math.max(24, insets.bottom + 8) }]}>
              <View style={sheetChrome.grabber} />
              <SignInSheet onDone={finish} onSkip={finish} onClose={() => setOpen(false)} />
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, overflow: "hidden" },
  orbit: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center", height: 0 },
  ring: { position: "absolute", borderWidth: 1, borderColor: colors.line },
  core: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, ...shadow.card },
  mark: { width: 64, height: 64, borderRadius: 16 },
  orbiter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, alignItems: "center" },
  wordmark: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  wordmarkText: { fontFamily: fonts.displayMedium, fontSize: 30, color: colors.inkMute, letterSpacing: -0.6 },
  wordmarkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint, marginLeft: 2, marginTop: 6 },
  headline: { ...type.h1, textAlign: "center" },
  cta: { alignSelf: "stretch", marginTop: 32 },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
});


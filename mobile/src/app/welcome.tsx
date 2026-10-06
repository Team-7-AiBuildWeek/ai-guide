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
import { Btn, Field, TextLink } from "@/components/ui";
import { accountsEnabled } from "@/lib/accounts";
import { markWelcomed, useEmailCode } from "@/lib/auth";
import { colors, fonts, radius, shadow, size, type } from "@/lib/theme";

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

function SignInSheet({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const auth = useEmailCode();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  if (auth.step === "code") {
    return (
      <View style={{ gap: 12 }}>
        <Text style={type.h3}>Check your email</Text>
        <Text style={type.body}>
          We sent a 6-digit code to <Text style={{ fontFamily: fonts.bodySemi, color: colors.ink }}>{auth.email}</Text>.
        </Text>
        <Field
          value={code}
          onChangeText={(c) => {
            setCode(c);
            if (c.replace(/\D/g, "").length === 6) void auth.verify(c).then((ok) => ok && onDone());
          }}
          placeholder="000000"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          style={styles.code}
          accessibilityLabel="Six-digit code"
        />
        {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
        <Btn
          variant="primary"
          large
          label={auth.busy ? "Checking…" : "Continue"}
          disabled={auth.busy || code.replace(/\D/g, "").length < 6}
          onPress={() => void auth.verify(code).then((ok) => ok && onDone())}
        />
        <View style={styles.links}>
          <TextLink label="Send a new code" onPress={() => void auth.resend()} />
          <TextLink
            label="Use a different email"
            onPress={() => {
              setCode("");
              auth.restart();
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sheetTop}>
        <View style={styles.badge}>
          <Image source={require("../../assets/logo.png")} style={styles.badgeLogo} />
        </View>
        <Btn label="✕" onPress={onClose} accessibilityLabel="Close" />
      </View>
      <Text style={type.h3}>Get started</Text>
      <Text style={type.body}>Keep your walks and pick them up on any device — this iPhone or the website.</Text>
      <Field
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => void auth.send(email)}
        style={{ minHeight: 52 }}
        accessibilityLabel="Email address"
      />
      {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
      <Btn
        variant="primary"
        large
        label={auth.busy ? "Sending…" : "Continue with email"}
        disabled={auth.busy || !email.includes("@")}
        onPress={() => void auth.send(email)}
      />
      <TextLink label="Continue without an account" onPress={onDone} />
    </View>
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
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (still) return;
      loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 90_000, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => loop?.stop();
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
        <View style={[styles.ringLine, { width: unit * 1.3, height: unit * 1.3, borderRadius: unit * 0.65 }]} />
        <Ring radius={unit * 0.43} items={OUTER} spin={spin} reverse />
        <Ring radius={unit * 0.27} items={INNER} spin={spin} />
        <View style={[styles.ringLine, styles.core, { width: unit * 0.3, height: unit * 0.3, borderRadius: unit * 0.15 }]}>
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
            <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 8) }]}>
              <View style={styles.grabber} />
              <SignInSheet onDone={finish} onClose={() => setOpen(false)} />
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
  ringLine: { position: "absolute", borderWidth: 1, borderColor: colors.line },
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
  /** The map's sheet: rounded on top, a hairline, the lifted shadow. */
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 0,
    ...shadow.lift,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginVertical: 12 },
  sheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.mintWash, alignItems: "center", justifyContent: "center" },
  badgeLogo: { width: 40, height: 40, borderRadius: 10 },
  code: { minHeight: 60, fontFamily: fonts.display, fontSize: 28, letterSpacing: 10, textAlign: "center" },
  error: { fontFamily: fonts.body, fontSize: size.caption, color: colors.danger },
  links: { flexDirection: "row", justifyContent: "space-between" },
});


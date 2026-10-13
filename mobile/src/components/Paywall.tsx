/**
 * The paywall on the phone — the website's components/Paywall.tsx, drawn
 * natively: a full-screen page with a dark hero that shows a walk in progress
 * (the route drawing itself, the player with its voice going), then one large
 * card per plan, swiped sideways with the next one peeking in.
 *
 * Buying needs an account. The plans show signed out too; choosing one asks
 * for sign-in right here and then carries on to checkout with that plan.
 * Checkout is the website's Stripe page in an in-app browser (lib/billing.ts);
 * when it closes, the caller re-reads what the account has.
 *
 * No badges WalkDots has not earned: savings say "up to", because they assume
 * every walk is used.
 */

import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import SignInSheet from "./SignInSheet";
import { BASE } from "@/lib/api";
import { buy, PRODUCTS, type Product, type ProductId } from "@/lib/billing";
import { tick, useReduceMotion } from "@/lib/motion";
import { colors, fonts, size } from "@/lib/theme";

const WHY: Record<string, { title: string; body: string }> = {
  signin_for_free: { title: "Your first walk is on us", body: "A few free walks were already taken from this connection today. Sign in and yours is free." },
  signin: { title: "Keep walking", body: "You've had your free walk. Pick what suits your trip — every walk is built just for you." },
  no_walks: { title: "Keep walking", body: "Pick what suits your trip — every walk is built just for you." },
  fair_use_pass: { title: "That's today's walks", body: "Your pass includes three walks a day, with more tomorrow. Need one now?" },
  fair_use_annual: { title: "That's this month's walks", body: "Your plan includes ten walks a month. One more is a tap away." },
};

const INK = "#0b1220";
const AnimatedPath = Animated.createAnimatedComponent(Path);
const ROUTE_LENGTH = 420;

/** A walk in progress: streets, the route drawing itself, the stops, and the player with its voice going. */
function HeroArt({ open }: { open: boolean }) {
  const still = useReduceMotion();
  const [draw] = useState(() => new Animated.Value(ROUTE_LENGTH));
  const [wave] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!open) return;
    if (still) {
      draw.setValue(0);
      return;
    }
    draw.setValue(ROUTE_LENGTH);
    const a = Animated.timing(draw, { toValue: 0, duration: 1600, delay: 250, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    const w = Animated.loop(Animated.sequence([
      Animated.timing(wave, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(wave, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    w.start();
    return () => {
      a.stop();
      w.stop();
    };
  }, [open, still, draw, wave]);

  const stops: [number, number, string][] = [
    [40, 160, "1"],
    [96, 132, "2"],
    [168, 92, "3"],
    [284, 44, "4"],
  ];
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg viewBox="0 0 320 200" width="100%" height={200}>
        <G stroke="rgba(255,255,255,0.08)" strokeWidth={10} strokeLinecap="round" fill="none">
          <Path d="M-10 60 H330" />
          <Path d="M-10 140 H330" />
          <Path d="M70 -10 V210" />
          <Path d="M210 -10 V210" />
          <Path d="M120 -10 L260 210" />
        </G>
        <AnimatedPath
          d="M40 160 C 70 160, 70 140, 96 132 S 150 90, 168 92 S 214 70, 214 58 S 250 40, 284 44"
          fill="none"
          stroke={colors.mint}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${ROUTE_LENGTH}`}
          strokeDashoffset={draw}
        />
        {stops.map(([x, y, n], i) => (
          <G key={n}>
            <Circle cx={x} cy={y} r={13} fill={i === 2 ? colors.mint : "#111827"} stroke={colors.mint} strokeWidth={3} />
            <SvgText x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontWeight="700" fill={i === 2 ? "#111827" : "#ffffff"}>
              {n}
            </SvgText>
          </G>
        ))}
      </Svg>
      <View style={styles.player}>
        <View style={styles.play}>
          <SymbolView name="pause.fill" size={14} tintColor={INK} fallback={<Text style={{ color: INK }}>❚❚</Text>} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.playerTitle}>
            Stop 3 · The Old Town Hall
          </Text>
          <View style={styles.bar}>
            <View style={styles.barFill} />
          </View>
        </View>
        <View style={styles.wave}>
          {[0.5, 0.9, 0.6, 1, 0.7].map((h, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                { transform: [{ scaleY: wave.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [h, 0.3] : [0.3, h] }) }] },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function Card({ p, width, busy, onChoose }: { p: Product; width: number; busy: boolean; onChoose: () => void }) {
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{p.badge}</Text>
      </View>
      <Text style={styles.title}>{p.name}</Text>
      <Text style={styles.tagline}>{p.tagline}</Text>
      <View style={styles.priceRow}>
        <View>
          <Text>
            <Text style={styles.amount}>{p.headline}</Text>
            <Text style={styles.per}> {p.per}</Text>
          </Text>
          <Text style={styles.small}>{p.small}</Text>
        </View>
        {p.saving ? (
          <View style={styles.saving}>
            <Text style={styles.savingText}>{p.saving}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={onChoose}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${p.name}, ${p.headline} ${p.per}. Continue`}
        style={({ pressed }) => [styles.cta, (pressed || busy) && { transform: [{ scale: 0.98 }], opacity: busy ? 0.6 : 1 }]}
      >
        <Text style={styles.ctaText}>{busy ? "Opening checkout…" : "Continue"}</Text>
      </Pressable>
      <View style={{ gap: 14, marginTop: 20 }}>
        {p.features.map((f) => (
          <View key={f.text} style={styles.feature}>
            <SymbolView name={f.symbol as never} size={20} tintColor={colors.mintInk} fallback={<Text style={{ color: colors.mintInk }}>•</Text>} />
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Paywall({
  open,
  reason,
  signedIn,
  onClose,
  onBought,
}: {
  open: boolean;
  reason: string | null;
  signedIn: boolean;
  onClose: () => void;
  /** Back from checkout, or just signed in: re-read what the account has. */
  onBought: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [signingIn, setSigningIn] = useState(false);
  const [pending, setPending] = useState<ProductId | null>(null);
  const [busy, setBusy] = useState<ProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  /** Signed in here, before the caller has re-read the account. */
  const [justSignedIn, setJustSignedIn] = useState(false);
  const isSignedIn = signedIn || justSignedIn;
  const rail = useRef<ScrollView>(null);
  const why = WHY[reason ?? "no_walks"] ?? WHY.no_walks;
  const freeBehindSignIn = reason === "signin_for_free";
  const offers = reason === "fair_use_pass" || reason === "fair_use_annual" ? PRODUCTS.filter((p) => p.id === "single") : PRODUCTS;
  const cardWidth = Math.min(width - 44, 420);
  const step = cardWidth + 12;

  const checkout = async (id: ProductId) => {
    setBusy(id);
    setError(null);
    try {
      await buy(id);
      onBought();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout isn't available right now.");
    } finally {
      setBusy(null);
    }
  };

  const choose = (id: ProductId) => {
    tick();
    if (!isSignedIn) {
      setPending(id);
      setSigningIn(true);
      return;
    }
    void checkout(id);
  };

  const close = () => {
    setSigningIn(false);
    setPending(null);
    setError(null);
    onClose();
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / step);
    setIndex(Math.max(0, Math.min(offers.length - 1, i)));
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="overFullScreen" transparent={false} onRequestClose={close}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} bounces={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
              <Defs>
                <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#0b1220" />
                  <Stop offset="0.62" stopColor="#111827" />
                  <Stop offset="1" stopColor="#1a2a24" />
                </LinearGradient>
                <RadialGradient id="mint" cx="85" cy="0" rx="70" ry="45" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={colors.mint} stopOpacity="0.45" />
                  <Stop offset="1" stopColor={colors.mint} stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="blue" cx="0" cy="35" rx="60" ry="40" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor="#2563eb" stopOpacity="0.28" />
                  <Stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100" height="100" fill="url(#bg)" />
              <Rect x="0" y="0" width="100" height="100" fill="url(#mint)" />
              <Rect x="0" y="0" width="100" height="100" fill="url(#blue)" />
            </Svg>
            {/* Melts into the page only below the words, where the first card crosses the seam. */}
            <Svg style={styles.fade} width="100%" height={96} preserveAspectRatio="none" viewBox="0 0 100 100">
              <Defs>
                <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.canvas} stopOpacity="0" />
                  <Stop offset="1" stopColor={colors.canvas} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100" height="100" fill="url(#fade)" />
            </Svg>
            <View style={styles.topRow}>
              <View style={styles.brand}>
                <Text style={styles.brandText}>WalkDots</Text>
                <View style={styles.brandTag}>
                  <Text style={styles.brandTagText}>WALKS</Text>
                </View>
              </View>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={8}>
                <SymbolView name="xmark" size={16} weight="bold" tintColor="#ffffff" fallback={<Text style={{ color: "#fff", fontSize: 18 }}>✕</Text>} />
              </Pressable>
            </View>
            <HeroArt open={open} />
            <Text style={styles.whyTitle}>{why.title}</Text>
            <Text style={styles.whyBody}>{why.body}</Text>
          </View>

          {signingIn ? (
            <View style={[styles.card, styles.single, { width: cardWidth }]}>
              <SignInSheet
                onDone={() => {
                  setSigningIn(false);
                  setJustSignedIn(true);
                  onBought();
                  if (pending) {
                    const p = pending;
                    setPending(null);
                    void checkout(p);
                  }
                }}
                onClose={() => {
                  setSigningIn(false);
                  setPending(null);
                }}
              />
            </View>
          ) : freeBehindSignIn ? (
            <View style={[styles.card, styles.single, { width: cardWidth }]}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>FREE</Text>
              </View>
              <Text style={styles.title}>Your first walk</Text>
              <Text style={styles.tagline}>A full walk built around what you want to see — free when you sign in.</Text>
              <Pressable onPress={() => setSigningIn(true)} accessibilityRole="button" style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.98 }] }]}>
                <Text style={styles.ctaText}>Sign in — it&apos;s free</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                ref={rail}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={step}
                decelerationRate="fast"
                onScroll={onScroll}
                scrollEventThrottle={32}
                style={styles.rail}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              >
                {offers.map((p) => (
                  <Card key={p.id} p={p} width={cardWidth} busy={busy === p.id} onChoose={() => choose(p.id)} />
                ))}
              </ScrollView>
              {offers.length > 1 ? (
                <View style={styles.dots}>
                  {offers.map((p, i) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={p.name}
                      accessibilityState={{ selected: i === index }}
                      onPress={() => rail.current?.scrollTo({ x: i * step, animated: true })}
                      hitSlop={10}
                      style={[styles.dot, i === index && styles.dotOn]}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )}

          <View style={styles.foot}>
            {error ? <Text style={[styles.footText, { color: colors.danger, marginBottom: 10 }]}>{error}</Text> : null}
            <Text style={styles.footText}>
              Walking one of your tours again is always free. Prices include VAT; paid securely with Stripe.{" "}
              <Text style={{ textDecorationLine: "underline" }} onPress={() => void Linking.openURL(`${BASE}/terms`)}>
                Terms
              </Text>
            </Text>
            <Pressable onPress={close} accessibilityRole="button" style={styles.later} hitSlop={6}>
              <Text style={styles.laterText}>Not now</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: 16, paddingBottom: 92, overflow: "hidden" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  brandText: { fontFamily: fonts.display, fontSize: 18, color: "#fff" },
  brandTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: INK },
  brandTagText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.8, color: colors.mint },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  art: { marginTop: 16, alignSelf: "center", width: "100%", maxWidth: 352 },
  player: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: -8,
    marginHorizontal: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(17,24,39,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  play: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.mint },
  playerTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: "#fff" },
  bar: { height: 4, marginTop: 6, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  barFill: { width: "42%", height: "100%", borderRadius: 2, backgroundColor: colors.mint },
  wave: { flexDirection: "row", alignItems: "center", gap: 3, height: 22 },
  waveBar: { width: 3, height: 22, borderRadius: 2, backgroundColor: colors.mint },
  whyTitle: { marginTop: 24, textAlign: "center", fontFamily: fonts.display, fontSize: size.h2, color: "#fff" },
  whyBody: { marginTop: 6, textAlign: "center", fontFamily: fonts.body, fontSize: size.body, lineHeight: size.body * 1.45, color: "rgba(255,255,255,0.72)" },
  rail: { marginTop: -64 },
  card: {
    padding: 24,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    shadowColor: "#111827",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  single: { alignSelf: "center", marginTop: -64 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas },
  badgeText: { fontFamily: fonts.display, fontSize: 12.5, letterSpacing: 0.8, color: colors.ink },
  title: { marginTop: 16, fontFamily: fonts.display, fontSize: size.h3, color: colors.ink },
  tagline: { marginTop: 6, fontFamily: fonts.body, fontSize: size.body, lineHeight: size.body * 1.45, color: colors.inkMute },
  priceRow: { marginTop: 20, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  amount: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
  per: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.ink },
  small: { marginTop: 2, fontFamily: fonts.body, fontSize: size.body, color: colors.inkMute },
  saving: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.mintWash },
  savingText: { fontFamily: fonts.display, fontSize: 12.5, letterSpacing: 0.4, color: colors.mintInk },
  cta: {
    marginTop: 20,
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint,
    shadowColor: colors.mintInk,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaText: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  feature: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureText: { flex: 1, fontFamily: fonts.body, fontSize: size.body, color: colors.inkSoft },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  dotOn: { width: 22, backgroundColor: colors.ink },
  foot: { marginTop: 24, paddingHorizontal: 24, alignItems: "center" },
  footText: { textAlign: "center", fontFamily: fonts.body, fontSize: size.caption, lineHeight: size.caption * 1.45, color: colors.inkMute },
  later: { marginTop: 12, minHeight: 44, paddingHorizontal: 16, justifyContent: "center" },
  laterText: { fontFamily: fonts.displayMedium, fontSize: size.body, color: colors.inkSoft },
});

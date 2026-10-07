/**
 * The splash: the Walk mark, walked.
 *
 * Starts as an exact copy of the native splash (the same logo, the same size,
 * the same #1f1f1f), so the hand-over from the system's still image is
 * invisible. Then a small dot walks the mark's route — from the left stop, up
 * to the mint one, on to the right — and each stop sends out a soft mint ripple
 * as it is reached. The mark lifts, the splash fades, and the app is there.
 *
 * About a second and a half. With Reduce Motion on it simply fades.
 */

import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

/** The native splash's image width (app.json → expo-splash-screen → imageWidth). */
const SIZE = 200;
/** The mark's stops, measured on the 512px logo. */
const STOPS = [
  { x: 150, y: 368 },
  { x: 256, y: 232 },
  { x: 362, y: 300 },
];
const K = SIZE / 512;
const at = (p: { x: number; y: number }) => ({ x: p.x * K, y: p.y * K });

const LEG_1 = Math.hypot(STOPS[1].x - STOPS[0].x, STOPS[1].y - STOPS[0].y);
const LEG_2 = Math.hypot(STOPS[2].x - STOPS[1].x, STOPS[2].y - STOPS[1].y);
/** Where along the walk the middle stop falls, so the dot keeps one speed. */
const MID = LEG_1 / (LEG_1 + LEG_2);

const DOT = 14;
const RING = 34;

function Ripple({ stop, value }: { stop: { x: number; y: number }; value: Animated.Value }) {
  const p = at(stop);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: p.x - RING / 2,
          top: p.y - RING / 2,
          opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] }) }],
        },
      ]}
    />
  );
}

export default function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [walk] = useState(() => new Animated.Value(0));
  const [ripples] = useState(() => STOPS.map(() => new Animated.Value(0)));
  const [lift] = useState(() => new Animated.Value(0));
  const [walked, setWalked] = useState(false);

  // The native splash can go the moment this one is on screen: they are identical.
  const handOver = () => void SplashScreen.hideAsync().catch(() => {});

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (cancelled) return;
      if (still) return setWalked(true);
      const ripple = (v: Animated.Value) =>
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      Animated.sequence([
        Animated.delay(150),
        Animated.parallel([
          ripple(ripples[0]),
          Animated.timing(walk, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.sequence([Animated.delay(1000 * MID), ripple(ripples[1])]),
          Animated.sequence([Animated.delay(1000), ripple(ripples[2])]),
        ]),
      ]).start(() => !cancelled && setWalked(true));
    });
    return () => {
      cancelled = true;
    };
  }, [walk, ripples]);

  // Leave once the walk is over and the app underneath is ready to be seen.
  useEffect(() => {
    if (!walked || !ready) return;
    Animated.timing(lift, { toValue: 1, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(onDone);
  }, [walked, ready, lift, onDone]);

  const [a, b, c] = STOPS.map(at);
  const dotX = walk.interpolate({ inputRange: [0, MID, 1], outputRange: [a.x, b.x, c.x] });
  const dotY = walk.interpolate({ inputRange: [0, MID, 1], outputRange: [a.y, b.y, c.y] });

  return (
    <Animated.View
      onLayout={handOver}
      pointerEvents={walked ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, styles.screen, { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
      accessibilityLabel="Walk"
      accessibilityRole="image"
    >
      <Animated.View
        style={[
          styles.mark,
          { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] },
        ]}
      >
        <Image source={require("../../assets/logo.png")} style={styles.logo} />
        {STOPS.map((s, i) => (
          <Ripple key={i} stop={s} value={ripples[i]} />
        ))}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dot,
            {
              opacity: walk.interpolate({ inputRange: [0, 0.04, 0.96, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateX: Animated.subtract(dotX, DOT / 2) }, { translateY: Animated.subtract(dotY, DOT / 2) }],
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.dark, alignItems: "center", justifyContent: "center", zIndex: 100 },
  mark: { width: SIZE, height: SIZE },
  logo: { width: SIZE, height: SIZE },
  ring: { position: "absolute", width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: colors.mint },
  dot: {
    position: "absolute",
    left: 0,
    top: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    // White, like the mark's stops: a mint dot would vanish on the mint line it walks.
    backgroundColor: colors.onDark,
    shadowColor: colors.mint,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});

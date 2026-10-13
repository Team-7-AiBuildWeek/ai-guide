/**
 * A walk, drawing itself over and over on a dark card — the generating
 * screen's "something to watch" while the walk is being built (the website's
 * components/RouteArt.tsx with `live`). The same streets and route as the
 * paywall's hero.
 */

import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { useReduceMotion } from "@/lib/motion";
import { colors } from "@/lib/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const LENGTH = 420;

export default function RouteArt() {
  const still = useReduceMotion();
  const [draw] = useState(() => new Animated.Value(still ? 0 : LENGTH));
  useEffect(() => {
    if (still) {
      draw.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(draw, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(draw, { toValue: -LENGTH, duration: 900, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(draw, { toValue: LENGTH, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, draw]);

  const stops: [number, number, string][] = [
    [40, 160, "1"],
    [96, 132, "2"],
    [168, 92, "3"],
    [284, 44, "4"],
  ];
  return (
    <View style={styles.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="rbg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0b1220" />
            <Stop offset="0.7" stopColor="#111827" />
            <Stop offset="1" stopColor="#1a2a24" />
          </LinearGradient>
          <RadialGradient id="rmint" cx="85" cy="0" rx="70" ry="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.mint} stopOpacity="0.38" />
            <Stop offset="1" stopColor={colors.mint} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#rbg)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#rmint)" />
      </Svg>
      <Svg viewBox="0 0 320 200" width="100%" height={180}>
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
          strokeDasharray={`${LENGTH}`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, overflow: "hidden", paddingVertical: 8, paddingHorizontal: 8 },
});

/**
 * The walk, drawn before it exists — the website's RouteSketch: a loop with a
 * dot for every stop. More time adds dots, a faster pace widens the loop;
 * dots that stay slide to their new places and new ones pop in.
 */

import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { tourShape } from "@/lib/flow";
import { EASE } from "@/lib/motion";
import { t } from "@/lib/strings";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { Draft } from "@/lib/types";

const W = 168;
const H = 112;

/** A hand-drawn-looking closed loop: an ellipse with a little wobble. */
function loopPoint(theta: number, scale: number) {
  const wobble = 1 + 0.1 * Math.sin(3 * theta + 0.6) + 0.05 * Math.cos(5 * theta);
  return {
    x: W / 2 + Math.cos(theta) * 70 * scale * wobble,
    y: H / 2 + Math.sin(theta) * 42 * scale * wobble,
  };
}

const LOOP_PATH = (() => {
  const pts = Array.from({ length: 96 }, (_, i) => loopPoint((i / 96) * Math.PI * 2 - Math.PI / 2, 1));
  return `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}Z`;
})();

function loopScale(km: number) {
  return Math.min(1, 0.55 + km / 10);
}

/** One stop: slides to wherever it now belongs, and pops in when it first appears. */
function Dot({ x, y, r, start }: { x: number; y: number; r: number; start: boolean }) {
  const pos = useRef(new Animated.ValueXY({ x, y })).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [pop]);
  useEffect(() => {
    Animated.timing(pos, { toValue: { x, y }, duration: 400, easing: EASE, useNativeDriver: true }).start();
  }, [x, y, pos]);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: r * 2 + 4,
          height: r * 2 + 4,
          marginLeft: -(r + 2),
          marginTop: -(r + 2),
          backgroundColor: start ? colors.ink : colors.mint,
          transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale: pop }],
        },
      ]}
    />
  );
}

/** A number that rolls up into place when it changes. Keyed on the value by the caller. */
function RollIn({ children, style }: { children: string; style: StyleProp<TextStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, easing: EASE, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.Text
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.Text>
  );
}

export function Roll({ value, style }: { value: string; style: StyleProp<TextStyle> }) {
  return <RollIn key={value} style={style}>{value}</RollIn>;
}

export default function RouteSketch({ draft }: { draft: Draft }) {
  const { stops, km } = tourShape(draft);
  const scale = loopScale(km);
  const loop = useRef(new Animated.Value(scale)).current;
  useEffect(() => {
    Animated.timing(loop, { toValue: scale, duration: 400, easing: EASE, useNativeDriver: true }).start();
  }, [scale, loop]);

  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Roll value={String(stops)} style={styles.count} />
        <Text style={styles.label}>{t("sketch.stops")}</Text>
        <Roll value={`≈ ${km} km · ${t(`durationShort.${draft.durationMinutes}`)}`} style={[type.caption, { marginTop: 2 }]} />
      </View>
      <View style={{ width: W, height: H }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: loop }] }]}>
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <Path d={LOOP_PATH} fill="none" stroke={colors.mintInk} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        {Array.from({ length: stops }, (_, i) => {
          const p = loopPoint((i / stops) * Math.PI * 2 - Math.PI / 2, scale);
          return <Dot key={i} x={p.x} y={p.y} r={i === 0 ? 7 : stops > 12 ? 4 : 5} start={i === 0} />;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.card,
    backgroundColor: colors.mintWash,
  },
  count: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink, fontVariant: ["tabular-nums"] },
  label: { marginTop: 4, fontFamily: fonts.displayMedium, fontSize: size.body, color: colors.ink },
  dot: { position: "absolute", left: 0, top: 0, borderRadius: 999, borderWidth: 2, borderColor: "#fff" },
});

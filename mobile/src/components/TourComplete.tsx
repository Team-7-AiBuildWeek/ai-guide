/**
 * The end of a walk, on the phone — the website's components/TourComplete.tsx:
 * the route drawn as a picture on the dark hero, the walk in numbers, the
 * places you saw, and share or walk somewhere new. Opens at the last stop; the
 * narration keeps playing underneath ("Keep listening" just closes this).
 */

import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop as GradStop, Text as SvgText } from "react-native-svg";
import PlaceImage from "./PlaceImage";
import { Btn } from "./ui";
import { formatKm } from "@/lib/history";
import { useReduceMotion } from "@/lib/motion";
import { colors, fonts, size, type } from "@/lib/theme";
import type { StoredTour } from "@/lib/types";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const W = 320;
const H = 200;
const PAD = 22;

/** The route fitted into the box, with its drawn length (for the drawing animation). */
function routeArt(tour: StoredTour) {
  const line = (tour.route?.geometry as { coordinates?: number[][] } | undefined)?.coordinates;
  const coords: number[][] = line?.length ? line : tour.plan.stops.map((s) => [s.lng, s.lat]);
  const all = [...coords, ...tour.plan.stops.map((s) => [s.lng, s.lat])];
  const lats = all.map((c) => c[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = all.map((c) => c[0] * kx);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...lats), Math.max(...lats)];
  const scale = Math.min((W - PAD * 2) / Math.max(maxX - minX, 1e-6), (H - PAD * 2) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (H - (maxY - minY) * scale) / 2;
  const at = ([lng, lat]: number[]): [number, number] => [ox + (lng * kx - minX) * scale, H - (oy + (lat - minY) * scale)];
  const pts = coords.map(at);
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { d, length: Math.max(1, length), stops: tour.plan.stops.map((s) => at([s.lng, s.lat])) };
}

export default function TourComplete({
  open,
  tour,
  minutesWalked,
  lang,
  onClose,
  onNew,
}: {
  open: boolean;
  tour: StoredTour;
  minutesWalked: number | null;
  lang: string;
  onClose: () => void;
  onNew: () => void;
}) {
  const insets = useSafeAreaInsets();
  const still = useReduceMotion();
  const art = useMemo(() => routeArt(tour), [tour]);
  const [draw] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!open) return;
    draw.setValue(still ? 0 : art.length);
    if (still) return;
    const a = Animated.timing(draw, { toValue: 0, duration: 1800, delay: 300, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [open, still, draw, art.length]);

  const share = () =>
    void Share.share({
      message: `I just walked "${tour.plan.title}" — ${formatKm(tour.meters)}, ${tour.plan.stops.length} stops, with WalkDots.`,
    }).catch(() => {});

  return (
    <Modal visible={open} animationType="slide" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} bounces={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="cbg" x1="0" y1="0" x2="0" y2="1">
                <GradStop offset="0" stopColor="#0b1220" />
                <GradStop offset="0.7" stopColor="#111827" />
                <GradStop offset="1" stopColor="#1a2a24" />
              </LinearGradient>
              <RadialGradient id="cmint" cx="85" cy="0" rx="70" ry="45" gradientUnits="userSpaceOnUse">
                <GradStop offset="0" stopColor={colors.mint} stopOpacity="0.42" />
                <GradStop offset="1" stopColor={colors.mint} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#cbg)" />
            <Rect x="0" y="0" width="100" height="100" fill="url(#cmint)" />
          </Svg>
          <Text style={styles.eyebrow}>WALK COMPLETE</Text>
          <Text style={styles.title}>{tour.plan.title}</Text>
          <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={210} style={{ marginTop: 12 }}>
            <Path d={art.d} fill="none" stroke={colors.mint} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.22} />
            <AnimatedPath
              d={art.d}
              fill="none"
              stroke={colors.mint}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${art.length}`}
              strokeDashoffset={draw}
            />
            {art.stops.map(([x, y], i) => (
              <G key={i}>
                <Circle cx={x} cy={y} r={9} fill="#111827" stroke={colors.mint} strokeWidth={2.5} />
                <SvgText x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight="700" fill="#fff">
                  {i + 1}
                </SvgText>
              </G>
            ))}
          </Svg>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>{formatKm(tour.meters)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Stops</Text>
              <Text style={styles.statValue}>{tour.plan.stops.length}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{minutesWalked ? `${minutesWalked} min` : "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={type.section}>What you saw</Text>
          <View style={styles.grid}>
            {tour.plan.stops.slice(0, 8).map((s, i) => (
              <View key={s.id ?? i} style={styles.cell}>
                <PlaceImage
                  place={{ name: s.name, localName: s.localName, lat: s.lat, lng: s.lng, lang }}
                  style={styles.photo}
                  fallback={
                    <View style={[styles.photo, styles.photoFallback]}>
                      <Text style={styles.photoNum}>{i + 1}</Text>
                    </View>
                  }
                />
                <Text numberOfLines={2} style={styles.placeName}>
                  {s.name}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 8, marginTop: 24 }}>
            <Btn variant="primary" large label="Share your walk" onPress={share} />
            <Btn label="Walk somewhere new" onPress={onNew} />
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.later}>
              <Text style={styles.laterText}>Keep listening</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 28, alignItems: "center", overflow: "hidden", borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  eyebrow: { fontFamily: fonts.display, fontSize: size.caption, letterSpacing: 1.4, color: colors.mint },
  title: { marginTop: 6, textAlign: "center", fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: "#fff" },
  stats: { flexDirection: "row", gap: 28, marginTop: 16 },
  stat: { alignItems: "center" },
  statLabel: { fontFamily: fonts.body, fontSize: size.caption, color: "rgba(255,255,255,0.6)" },
  statValue: { marginTop: 2, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.5, color: "#fff", fontVariant: ["tabular-nums"] },
  body: { paddingHorizontal: 20, paddingTop: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  cell: { width: "47%" },
  photo: { height: 104, borderRadius: 16 },
  photoFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.mintWash },
  photoNum: { fontFamily: fonts.display, fontSize: 24, color: colors.mintInk },
  placeName: { marginTop: 6, fontFamily: fonts.display, fontSize: size.caption, color: colors.ink },
  later: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  laterText: { fontFamily: fonts.displayMedium, fontSize: size.body, color: colors.inkSoft },
});

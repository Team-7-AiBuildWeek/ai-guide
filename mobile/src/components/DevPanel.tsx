/**
 * The developer panel, for developer accounts only — the website's DevPanel:
 * a small "DEV" tab on the left edge of the walk, opening a sheet with the
 * tour's details, what it roughly cost to make, what the server runs on, and
 * every stop to jump straight to.
 */

import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import OverlaySheet from "./OverlaySheet";
import { Eyebrow } from "./ui";
import { BASE } from "@/lib/api";
import { useDeveloper } from "@/lib/developer";
import { estimateTourCost } from "@/lib/flow";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { StoredTour } from "@/lib/types";

/** A third decimal under a cent, so a cheap voice does not read as free. */
const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function DevPanel({
  tour,
  currentIndex,
  onJump,
}: {
  tour: StoredTour;
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const { developer, info, tts } = useDeveloper();
  const [open, setOpen] = useState(false);
  if (!developer) return null;

  const req = tour.req;
  const cost = estimateTourCost(tour.plan.stops.length, req?.detail, { tts, lang: req?.lang });

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Developer panel" style={styles.tab}>
        <Text style={styles.tabText}>DEV</Text>
      </Pressable>
      <OverlaySheet open={open} onClose={() => setOpen(false)}>
        <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 14 }}>
          <View>
            <Eyebrow>Developer · this tour</Eyebrow>
            <Text style={[type.h3, { marginTop: 4 }]}>{tour.plan.title}</Text>
          </View>

          <View style={styles.box}>
            <Fact label="Stops" value={String(tour.plan.stops.length)} />
            <Fact label="Route" value={`${(tour.meters / 1000).toFixed(1)} km`} />
            {req ? (
              <>
                <Fact label="Asked for" value={`${req.durationMinutes} min · ${req.detail} · ${req.pace}`} />
                <Fact label="Interests" value={req.interests.join(", ") || "none"} />
                <Fact label="Language" value={req.lang} />
                {req.city ? <Fact label="City" value={req.city.name} /> : null}
                {req.freeText ? <Fact label="Typed" value={`“${req.freeText}”`} /> : null}
              </>
            ) : null}
            {tour.demo ? <Fact label="Source" value="Demo tour" /> : null}
          </View>

          <View style={[styles.box, { backgroundColor: colors.mintWash }]}>
            <Fact label="Narration" value={`≈ ${Math.round(cost.audioMinutes)} min of audio`} />
            <Fact label="Writing" value={`≈ ${usd(cost.writing)}`} />
            <Fact label={`Voice (${cost.voiceName})`} value={`≈ ${usd(cost.voice)}`} />
            <Fact label="Cost to make" value={`≈ ${usd(cost.total)}`} />
            <Text style={styles.note}>Estimate at today&apos;s prices for the voice this language gets now; recordings already kept cost nothing.</Text>
          </View>

          {info ? (
            <View style={styles.box}>
              {Object.entries(info).map(([k, v]) => (
                <Fact key={k} label={k[0].toUpperCase() + k.slice(1)} value={v} />
              ))}
            </View>
          ) : null}

          <View>
            <Eyebrow>Jump to a stop</Eyebrow>
            <View style={{ marginTop: 8, gap: 4 }}>
              {tour.plan.stops.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    onJump(i);
                    setOpen(false);
                  }}
                  style={[styles.stop, i === currentIndex && styles.stopOn]}
                >
                  <Text style={styles.stopN}>{i + 1}</Text>
                  <Text numberOfLines={1} style={[styles.stopName, i === currentIndex && { fontFamily: fonts.display }]}>
                    {s.name}
                  </Text>
                  {s.script ? <Text style={styles.written}>written</Text> : null}
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable onPress={() => void Linking.openURL(`${BASE}/dev/tours`)} style={styles.link}>
            <Text style={styles.linkText}>Saved tours (opens the website)</Text>
          </Pressable>
        </ScrollView>
      </OverlaySheet>
    </>
  );
}

const styles = StyleSheet.create({
  tab: {
    position: "absolute",
    left: 0,
    top: "45%",
    zIndex: 40,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderTopRightRadius: radius.control,
    borderBottomRightRadius: radius.control,
    backgroundColor: colors.ink,
  },
  tabText: { color: "#fff", fontFamily: fonts.display, fontSize: 11, letterSpacing: 1.5 },
  box: { borderRadius: radius.control, backgroundColor: colors.canvas, paddingHorizontal: 12, paddingVertical: 8 },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 3 },
  factLabel: { fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute },
  factValue: { flexShrink: 1, textAlign: "right", fontFamily: fonts.bodySemi, fontSize: size.caption, color: colors.ink },
  note: { marginTop: 4, fontFamily: fonts.body, fontSize: 11, color: colors.inkMute },
  stop: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: radius.control },
  stopOn: { backgroundColor: colors.mint },
  stopN: { width: 20, fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute, fontVariant: ["tabular-nums"] },
  stopName: { flex: 1, fontFamily: fonts.body, fontSize: size.caption, color: colors.ink },
  written: { fontFamily: fonts.body, fontSize: 11, color: colors.mintInk },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "center" },
  linkText: { fontFamily: fonts.displayMedium, fontSize: size.caption, color: colors.mintInk, textDecorationLine: "underline" },
});

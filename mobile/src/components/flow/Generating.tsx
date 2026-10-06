/**
 * "Making your personal tour…": the website's GeneratingStep. The route spine
 * with the working step's words lighting up one at a time, and the itinerary
 * as soon as it exists so the wait has something to be spent on.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { Btn, TextLink } from "@/components/ui";
import { t } from "@/lib/strings";
import { colors, fonts, size, type } from "@/lib/theme";
import type { TourPreview } from "@/lib/types";

const WORD_MS = 150;
const HOLD_MS = 550;

const PHASES: { key: string; label: string; covers: string[] }[] = [
  { key: "stops", label: "Choosing your stops", covers: ["stops", "locating", "ordering", "route"] },
  { key: "writing", label: "Writing the first stop", covers: ["writing"] },
  { key: "done", label: "Ready", covers: ["done"] },
];

function WordWave({ text }: { text: string }) {
  const words = text.split(" ");
  const [still, setStill] = useState(false);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill);
  }, []);
  useEffect(() => {
    if (still) return;
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      index = index > words.length ? 0 : index + 1;
      setLit(index);
      timer = setTimeout(run, index > words.length ? HOLD_MS : WORD_MS);
    };
    timer = setTimeout(run, WORD_MS);
    return () => clearTimeout(timer);
  }, [still, words.length]);
  return (
    <Text style={styles.title}>
      {words.map((w, i) => (
        <Text key={i} style={{ color: still || i < lit ? colors.mintInk : colors.lineStrong }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </Text>
      ))}
    </Text>
  );
}

function Elapsed({ note }: { note: string | null }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const line = [note, seconds > 2 ? `${seconds}s` : null].filter(Boolean).join(" · ");
  return line ? <Text style={[styles.meta, { marginTop: 4 }]}>{line}</Text> : null;
}

function Intro({ preview }: { preview: TourPreview }) {
  return (
    <View>
      <Text style={type.h2}>{preview.title}</Text>
      <Text style={[type.body, { marginTop: 8 }]}>{preview.summary}</Text>
      <View style={{ marginTop: 20, gap: 12 }}>
        {preview.stops.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12 }}>
            <View style={styles.smallNode}>
              <Text style={styles.smallNodeText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stopName}>{s.name}</Text>
              <Text style={[type.caption, { marginTop: 2 }]}>{s.angle}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Generating({
  phase,
  message,
  preview,
  error,
  onCancel,
  onRetry,
  onContinue,
}: {
  phase: string;
  message: string | null;
  preview: TourPreview | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
  /** Present once the tour is built: the stops stay on screen until the walker moves on. */
  onContinue?: () => void;
}) {
  const active = onContinue ? PHASES.length : PHASES.findIndex((p) => p.covers.includes(phase));

  if (error) {
    return (
      <View style={{ gap: 20, paddingTop: 24 }}>
        <View>
          <Text style={type.h2}>{t("gen.failed")}</Text>
          <Text style={[type.body, { marginTop: 12 }]}>{error}</Text>
        </View>
        <Btn variant="primary" large label={t("gen.retry")} onPress={onRetry} />
        <Btn label={t("gen.changeDetails")} onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={{ gap: 20, paddingTop: preview ? 0 : 24 }}>
      {preview ? (
        <Intro preview={preview} />
      ) : (
        <View>
          <Text style={type.h2}>{t("gen.title")}</Text>
          <Text style={[type.body, { marginTop: 12 }]}>{t("gen.wait")}</Text>
        </View>
      )}

      <View accessibilityLiveRegion="polite">
        {PHASES.map((p, i) => {
          const done = active > i;
          const working = active === i;
          const last = i === PHASES.length - 1;
          return (
            <View key={p.key} style={[styles.item, last && { paddingBottom: 0 }]}>
              {!last ? <View style={[styles.line, working && styles.lineWorking]} /> : null}
              <View
                style={[
                  styles.node,
                  done && styles.nodeDone,
                  working && styles.nodeCurrent,
                  !done && !working && styles.nodePending,
                ]}
              >
                <Text
                  style={[
                    styles.nodeText,
                    done && { color: colors.mintInk },
                    working && { color: colors.mint },
                    !done && !working && { color: colors.inkMute },
                  ]}
                >
                  {done ? "✓" : i + 1}
                </Text>
              </View>
              {working ? <WordWave key={p.key} text={p.label} /> : <Text style={styles.title}>{p.label}</Text>}
              {working ? <Elapsed key={`${p.key}-t`} note={message && message !== p.label ? message : null} /> : null}
            </View>
          );
        })}
      </View>

      {onContinue ? (
        <Btn variant="primary" large label="Continue to tour" onPress={onContinue} />
      ) : (
        <TextLink label={t("gen.cancel")} onPress={onCancel} />
      )}
    </View>
  );
}

const NODE = 34;

const styles = StyleSheet.create({
  item: { position: "relative", paddingLeft: 50, paddingBottom: 28, minHeight: NODE },
  line: { position: "absolute", left: NODE / 2 - 1, top: NODE + 2, bottom: 0, width: 2, backgroundColor: colors.mint },
  lineWorking: { opacity: 0.45 },
  node: {
    position: "absolute",
    left: 0,
    top: 0,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint,
  },
  nodeCurrent: { backgroundColor: colors.ink, shadowColor: colors.mint, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  nodeDone: { backgroundColor: colors.mintWash },
  nodePending: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  nodeText: { fontFamily: fonts.display, fontSize: size.caption, color: colors.ink, fontVariant: ["tabular-nums"] },
  title: { fontFamily: fonts.display, fontSize: size.lead, lineHeight: size.lead * 1.2, color: colors.ink, paddingTop: 4 },
  meta: { fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute, fontVariant: ["tabular-nums"] },
  smallNode: {
    marginTop: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.mintWash,
    alignItems: "center",
    justifyContent: "center",
  },
  smallNodeText: { fontFamily: fonts.display, fontSize: size.caption - 1, color: colors.mintInk },
  stopName: { fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
});

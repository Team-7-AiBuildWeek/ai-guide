/**
 * The rest of the walk, as on the website: the stop row and "Ask anything"
 * (TourStep), the turn card in the corner (TurnCard), and the written
 * directions that drop down from it (DirectionsPanel).
 */

import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/Glass";
import { Btn, Eyebrow, Field } from "@/components/ui";
import { formatDistance, TRUSTED_M } from "@/lib/geo";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { ManeuverKind, Stop, TourPlan, TourRide } from "@/lib/types";

const RIDE_WORDS: Record<TourRide["mode"], string> = {
  tram: "Tram",
  bus: "Bus",
  trolleybus: "Trolleybus",
  subway: "Metro",
  light_rail: "Train",
};

// ----------------------------------------------------------- stop row --

export function StopRow({
  plan,
  currentIndex,
  onPrev,
  onNext,
  onAsk,
}: {
  plan: TourPlan;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onAsk: () => void;
}) {
  const stop = plan.stops[currentIndex];
  return (
    <View style={styles.stopRow}>
      <Btn label="‹" disabled={currentIndex <= 0} onPress={onPrev} accessibilityLabel="Previous stop" textStyle={styles.chev} />
      <Pressable onPress={onAsk} style={styles.askBox} accessibilityRole="button">
        <Text numberOfLines={1} style={styles.askTitle}>
          Ask anything
        </Text>
        <Text numberOfLines={1} style={type.caption}>
          Stop {currentIndex + 1} of {plan.stops.length} · {stop?.name}
        </Text>
      </Pressable>
      <Btn
        variant="primary"
        label="›"
        disabled={currentIndex >= plan.stops.length - 1}
        onPress={onNext}
        accessibilityLabel="Next stop"
        textStyle={styles.chev}
      />
    </View>
  );
}

// ---------------------------------------------------------------- ask --

type QA = { question: string; answer: string | null; failed?: boolean };

export function AskAnything({ onAsk }: { onAsk: (q: string) => Promise<string> }) {
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);

  const submit = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setThread((th) => [...th, { question: q, answer: null }]);
    setBusy(true);
    try {
      const answer = await onAsk(q);
      setThread((th) => th.map((x, i) => (i === th.length - 1 ? { ...x, answer } : x)));
    } catch (err) {
      const answer = err instanceof Error ? err.message : "Could not answer.";
      setThread((th) => th.map((x, i) => (i === th.length - 1 ? { ...x, answer, failed: true } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16, paddingBottom: Math.max(8, insets.bottom) }}>
      {thread.length === 0 ? (
        <View>
          <Text style={type.body}>
            Ask about what you are looking at — who built it, what happened here, whether it is worth going inside.
          </Text>
          <View style={{ marginTop: 16, gap: 8 }}>
            {["What am I looking at?", "Who built this and when?", "Is it worth going inside?"].map((q) => (
              <Pressable key={q} onPress={() => setQuestion(q)} style={styles.suggestion}>
                <Text style={type.body}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd()} style={{ maxHeight: 420 }}>
          <View style={{ gap: 16 }}>
            {thread.map((qa, i) => (
              <View key={i}>
                <Text style={styles.question}>{qa.question}</Text>
                <Text style={[type.body, { marginTop: 8 }, qa.failed && { color: colors.danger }]}>
                  {qa.answer ?? "Thinking…"}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <View style={styles.askForm}>
        <Field
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask anything"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          style={{ flex: 1, minHeight: 48 }}
        />
        <Btn variant="primary" label={busy ? "…" : "Ask"} disabled={busy || !question.trim()} onPress={() => void submit()} />
      </View>
    </View>
  );
}

// ----------------------------------------------------------- turn card --

const ARROW: Record<ManeuverKind, { ios: string; glyph: string; label: string }> = {
  straight: { ios: "arrow.up", glyph: "↑", label: "Carry straight on" },
  left: { ios: "arrow.turn.up.left", glyph: "↰", label: "Turn left" },
  right: { ios: "arrow.turn.up.right", glyph: "↱", label: "Turn right" },
  uturn: { ios: "arrow.uturn.down", glyph: "↶", label: "Turn back" },
  arrive: { ios: "mappin.and.ellipse", glyph: "◉", label: "You arrive" },
};

export function TurnCard({
  kind,
  meters,
  street,
  onOpen,
}: {
  kind: ManeuverKind;
  meters: number;
  street?: string;
  onOpen: () => void;
}) {
  const a = ARROW[kind];
  const distance = formatDistance(meters);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${a.label}${meters >= 10 ? ` in ${distance}` : " now"}${street ? `, ${street}` : ""}. Open directions.`}
      style={({ pressed }) => pressed && { opacity: 0.85 }}
    >
      <GlassSurface tone="dark" style={styles.turn}>
        <SymbolView
          name={{ ios: a.ios, android: "north", web: "north" } as never}
          size={34}
          tintColor={colors.mint}
          weight="semibold"
          fallback={<Text style={{ fontSize: 30, color: colors.mint }}>{a.glyph}</Text>}
        />
        <Text style={styles.turnDistance}>{distance}</Text>
        {street ? (
          <Text numberOfLines={1} style={styles.turnStreet}>
            {street}
          </Text>
        ) : null}
      </GlassSurface>
    </Pressable>
  );
}

// ---------------------------------------------------------- directions --

export function Directions({
  stop,
  cue,
  distanceMeters,
  accuracy,
  turnInstruction,
  turnMeters,
  ride,
  onClose,
  onSpeak,
}: {
  stop: Stop;
  cue: string;
  distanceMeters: number | null;
  accuracy: number | null;
  turnInstruction?: string;
  turnMeters?: number;
  ride: TourRide | null;
  onClose: () => void;
  onSpeak: (text: string) => void;
}) {
  return (
    <GlassSurface tone="dark" style={styles.directions}>
      <View style={styles.dirTop}>
        <View style={{ flex: 1 }}>
          <Eyebrow style={{ color: colors.onDarkMute }}>Next: {stop.name}</Eyebrow>
          {distanceMeters !== null ? (
            <Text style={styles.dirMeta}>
              {distanceMeters < 1000
                ? `${Math.round(distanceMeters)} m away`
                : `${(distanceMeters / 1000).toFixed(1)} km away`}
            </Text>
          ) : null}
          {accuracy !== null && accuracy > TRUSTED_M ? (
            <Text style={[styles.dirMeta, { color: colors.warn }]}>
              Weak signal · ±{Math.round(accuracy)} m — advance by hand
            </Text>
          ) : null}
        </View>
        <Btn label="✕" onPress={onClose} accessibilityLabel="Close directions" />
      </View>

      {ride ? (
        <View style={styles.ride}>
          <Text style={styles.dirLead}>
            <Text style={{ color: colors.mint }}>
              {RIDE_WORDS[ride.mode]} {ride.ref}
            </Text>{" "}
            from {ride.board.name}
          </Text>
          <Text style={styles.dirMeta}>
            {ride.headsign ? `Towards ${ride.headsign} · ` : ""}
            {ride.stops} {ride.stops === 1 ? "stop" : "stops"} · about {ride.minutes} min
          </Text>
          <Text style={[styles.dirBody, { marginTop: 8, fontFamily: fonts.bodySemi }]}>Get off at {ride.alight.name}</Text>
          <Text style={styles.dirMeta}>Times vary — check the stop.</Text>
        </View>
      ) : null}

      {!ride && turnInstruction ? (
        <Text style={[styles.dirLead, { marginTop: 16 }]}>
          {turnInstruction}
          {typeof turnMeters === "number" && turnMeters >= 10 ? (
            <Text style={{ color: colors.mint }}> · {Math.round(turnMeters)} m</Text>
          ) : null}
        </Text>
      ) : null}

      {cue ? (
        <Text style={[styles.dirCue, turnInstruction ? { marginTop: 12, color: colors.onDarkMute } : { marginTop: 16 }]}>
          {cue}
        </Text>
      ) : null}

      <Btn
        variant="primary"
        label="Repeat directions"
        style={{ marginTop: 20 }}
        onPress={() =>
          onSpeak(
            ride
              ? `Take ${RIDE_WORDS[ride.mode]} ${ride.ref} from ${ride.board.name}, ${ride.stops} stops, and get off at ${ride.alight.name}.`
              : [turnInstruction, cue].filter(Boolean).join(". ") || `Continue to ${stop.name}.`,
          )
        }
      />
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  stopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  chev: { fontSize: 22, lineHeight: 24 },
  askBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  askTitle: { fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  question: { fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  askForm: { flexDirection: "row", gap: 8, alignItems: "center" },

  turn: { width: 92, borderRadius: radius.panel, alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 12 },
  turnDistance: { fontFamily: fonts.display, fontSize: size.lead, color: colors.onDark, fontVariant: ["tabular-nums"] },
  turnStreet: { width: "100%", textAlign: "center", fontFamily: fonts.body, fontSize: size.caption, color: colors.onDarkMute },

  directions: { borderRadius: radius.panel, padding: 16 },
  dirTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  dirMeta: { marginTop: 4, fontFamily: fonts.body, fontSize: size.caption, color: colors.onDarkMute, fontVariant: ["tabular-nums"] },
  dirLead: { fontFamily: fonts.display, fontSize: size.lead, lineHeight: size.lead * 1.35, color: colors.onDark },
  dirBody: { fontFamily: fonts.body, fontSize: size.body, color: colors.onDark },
  dirCue: { fontFamily: fonts.body, fontSize: size.lead, lineHeight: size.lead * 1.5, color: colors.onDark },
  ride: { marginTop: 16, borderWidth: 1, borderColor: colors.mint, borderRadius: radius.control, padding: 12 },
});

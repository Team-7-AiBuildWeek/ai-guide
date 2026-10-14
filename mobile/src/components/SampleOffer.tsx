/**
 * "Try a tour of Vienna" — the website's components/SampleOffer.tsx, on the
 * phone. Shown once after the welcome: a ready walk of the walker's city (the
 * famous sights, and a local secret or two) to judge the app by. The city is
 * the one the location says, or the connection's when location is off
 * (the Explore tab decides).
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReadingGlass, useGlass } from "./Glass";
import PlaceImage from "./PlaceImage";
import { Btn, Eyebrow } from "./ui";
import { sampleTour } from "@/lib/api";
import { formatKm } from "@/lib/history";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { City, StoredTour } from "@/lib/types";

type Load = { state: "loading" } | { state: "ready"; tour: StoredTour } | { state: "failed"; error: string };

export default function SampleOffer({
  open,
  city,
  cityUnknown = false,
  lang,
  onStart,
  onChooseCity,
  onClose,
}: {
  open: boolean;
  /** Null while it is still being worked out. */
  city: City | null;
  /** Neither the location nor the connection said where: ask for a city. */
  cityUnknown?: boolean;
  lang: string;
  onStart: (tour: StoredTour) => void;
  onChooseCity: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const glass = useGlass();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !city) return;
    const ctrl = new AbortController();
    queueMicrotask(() => setLoad({ state: "loading" }));
    sampleTour(city, lang, ctrl.signal)
      .then((tour) => setLoad({ state: "ready", tour }))
      .catch((err: Error) => {
        if (!ctrl.signal.aborted) setLoad({ state: "failed", error: err.message });
      });
    return () => ctrl.abort();
  }, [open, city, lang, attempt]);

  const tour = load.state === "ready" ? load.tour : null;
  const stops = tour?.plan.stops ?? [];
  const minutes = tour ? Math.round((tour.seconds || 0) / 60 + stops.length * 4) : 60;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.card, glass && styles.cardGlass, { marginBottom: Math.max(16, insets.bottom), maxHeight: "86%" }]}>
        {glass ? <ReadingGlass /> : null}
        <ScrollView contentContainerStyle={styles.body} bounces={false}>
          {city ? (
            <PlaceImage place={{ name: city.name, lat: city.lat, lng: city.lng, lang, kind: "city" }} style={styles.photo} credit />
          ) : cityUnknown ? null : (
            <View style={[styles.photo, styles.photoWait]} />
          )}
          <Eyebrow>Try it on a city you know</Eyebrow>
          <Text style={styles.title}>
            {city ? `Try a tour of ${city.name}` : cityUnknown ? "Try a tour of a city you know" : "Finding your city…"}
          </Text>
          <Text style={[type.body, { marginTop: 8 }]}>
            {tour
              ? `${stops.length} stops · about ${minutes} min · ${formatKm(tour.meters)}. The famous sights, and a local secret or two. You don't need to be there — it plays stop after stop.`
              : "The famous sights, and a local secret or two. You don't need to be there."}
          </Text>

          {tour ? (
            <View style={styles.stops}>
              {stops.map((s, i) => (
                <View key={s.id ?? i} style={styles.stop}>
                  <View style={styles.num}>
                    <Text style={styles.numText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stopName}>{s.name}</Text>
                  {s.secret ? (
                    <View style={styles.secret}>
                      <Text style={styles.secretText}>Local secret</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : load.state === "failed" && city ? (
            <Text style={[type.body, { marginTop: 16, color: colors.danger }]}>{load.error}</Text>
          ) : city ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={colors.mintInk} />
              <Text style={styles.waitingText}>Getting the walk ready — the first time for {city.name} takes about a minute.</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          {cityUnknown && !city ? (
            <Btn variant="primary" large label="Choose a city" onPress={onChooseCity} />
          ) : load.state === "failed" ? (
            <Btn variant="primary" large label="Try again" onPress={() => setAttempt((n) => n + 1)} />
          ) : (
            <Btn
              variant="primary"
              large
              disabled={!tour}
              label={tour ? "Start the walk" : "Getting it ready…"}
              onPress={() => tour && onStart(tour)}
            />
          )}
          {city ? <Btn label="Choose another city" onPress={onChooseCity} /> : null}
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.later}>
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(17,24,39,0.28)" },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    borderRadius: radius.panel,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardGlass: { backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.6)" },
  body: { padding: 16, paddingBottom: 8 },
  photo: { height: 128, borderRadius: 22, marginBottom: 14 },
  photoWait: { backgroundColor: colors.line },
  title: { marginTop: 4, fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.ink },
  stops: { marginTop: 14, gap: 6 },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  numText: { fontFamily: fonts.display, fontSize: size.caption, color: "#fff" },
  stopName: { flex: 1, fontFamily: fonts.displayMedium, fontSize: size.caption, color: colors.ink },
  secret: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.mintWash },
  secretText: { fontFamily: fonts.display, fontSize: 11, color: colors.mintInk },
  waiting: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  waitingText: { flex: 1, fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute },
  actions: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 8 },
  later: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  laterText: { fontFamily: fonts.displayMedium, fontSize: size.body, color: colors.inkSoft },
});

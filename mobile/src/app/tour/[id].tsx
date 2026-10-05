/**
 * One tour: its stops, and the download that makes it work offline.
 * A saved tour opens straight from the phone with no network at all.
 */

import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassButton } from "@/components/Glass";
import { tourBundle } from "@/lib/api";
import { formatMinutes } from "@/lib/geo";
import { loadTour, saveTour } from "@/lib/offline";
import { colors, THEME_LABEL } from "@/lib/theme";
import type { Bundle, SavedTour } from "@/lib/types";

export default function TourScreen() {
  const { id, city } = useLocalSearchParams<{ id: string; city?: string }>();
  const tourId = Number(id);
  const [saved, setSaved] = useState<SavedTour | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let alive = true;
    (async () => {
      const local = await loadTour(tourId);
      if (!alive) return;
      if (local) {
        setSaved(local);
        return;
      }
      try {
        const remote = await tourBundle(tourId);
        if (alive) setBundle(remote);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load this tour.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [tourId]);

  const tour = saved ?? bundle;
  const megabytes = bundle ? bundle.stops.reduce((sum, s) => sum + (s.audio?.bytes ?? 0), 0) / 1_000_000 : 0;

  async function download() {
    if (!bundle) return;
    setError(null);
    try {
      // Fetched again so the signed audio links are fresh at the moment of download.
      const fresh = await tourBundle(tourId);
      setSaved(await saveTour(fresh, city ?? "", (done, total) => setProgress({ done, total })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The download failed.");
    } finally {
      setProgress(null);
    }
  }

  if (!tour) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.mint} />}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: THEME_LABEL[tour.tour.theme] ?? "Tour" }} />
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}>
        <Text style={styles.title}>
          {THEME_LABEL[tour.tour.theme] ?? tour.tour.theme} · {city || (saved?.cityName ?? "")}
        </Text>
        <Text style={styles.meta}>
          {tour.stops.length} stops · {formatMinutes(tour.tour.total_duration_ms)}
          {tour.tour.total_walk_m ? ` · ${(tour.tour.total_walk_m / 1000).toFixed(1)} km walking` : ""}
        </Text>

        {saved ? <Text style={styles.note}>Saved on this phone: works without signal.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.heading}>Stops</Text>
        {tour.stops.map((s) => (
          <View key={s.position} style={styles.stop}>
            <Text style={styles.stopNumber}>{s.position + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stopName}>{s.name}</Text>
              {s.local_name && s.local_name !== s.name ? <Text style={styles.stopLocal}>{s.local_name}</Text> : null}
              <Text style={styles.stopMeta}>{formatMinutes(s.audio?.duration_ms)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* The screen's one action floats above the list: the navigation layer, in glass. */}
      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        {saved ? (
          <GlassButton
            prominent
            label="Start the walk"
            onPress={() => router.push({ pathname: "/walk/[id]", params: { id: String(tourId) } })}
          />
        ) : (
          <GlassButton
            prominent
            disabled={!!progress}
            label={progress ? `Downloading ${progress.done} of ${progress.total}…` : `Download for offline · ${megabytes.toFixed(0)} MB`}
            onPress={download}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  page: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 15, color: colors.inkMute, marginTop: 4, marginBottom: 16 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  note: { fontSize: 13, color: colors.inkMute, marginTop: 8 },
  error: { fontSize: 15, color: colors.danger, marginTop: 12 },
  heading: { fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: 24, marginBottom: 8 },
  stop: { flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  stopNumber: {
    width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, overflow: "hidden",
    backgroundColor: colors.mintWash, color: colors.mint, fontWeight: "700",
  },
  stopName: { fontSize: 16, fontWeight: "600", color: colors.ink },
  stopLocal: { fontSize: 14, color: colors.inkMute },
  stopMeta: { fontSize: 13, color: colors.inkMute, marginTop: 2 },
});

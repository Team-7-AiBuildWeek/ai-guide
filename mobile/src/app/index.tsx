/**
 * Home: ready-made tours near the walker, and tours already saved on the phone.
 * Outside a covered city it offers Bratislava, so the app can be tried anywhere.
 */

import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { TourRow } from "@/components/TourRow";
import { nearbyTours } from "@/lib/api";
import { formatMinutes } from "@/lib/geo";
import { savedTours } from "@/lib/offline";
import { colors, LANGUAGE_LABEL, THEME_LABEL } from "@/lib/theme";
import type { Nearby, SavedTour } from "@/lib/types";

const BRATISLAVA = { latitude: 48.1435, longitude: 17.1073 };

export default function Home() {
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [saved, setSaved] = useState<SavedTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const load = useCallback(async (forceBratislava = false) => {
    setLoading(true);
    setError(null);
    setSaved(await savedTours());
    try {
      let here = BRATISLAVA;
      let fallback = forceBratislava;
      if (!forceBratislava) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          here = pos.coords;
        } else {
          fallback = true;
        }
      }
      let result = await nearbyTours(here.latitude, here.longitude);
      if (!result.city && !fallback) {
        // Not in a covered city: show Bratislava so there is something to try.
        result = await nearbyTours(BRATISLAVA.latitude, BRATISLAVA.longitude);
        fallback = true;
      }
      setUsedFallback(fallback);
      setNearby(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tours.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const city = nearby?.city?.name ?? "Bratislava";

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}>
      {saved.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>On this phone</Text>
          {saved.map((t) => (
            <TourRow
              key={t.tour.id}
              title={`${THEME_LABEL[t.tour.theme] ?? t.tour.theme} · ${t.cityName}`}
              subtitle={`${t.stops.length} stops · ${formatMinutes(t.tour.total_duration_ms)}`}
              badge="Offline"
              onPress={() => router.push({ pathname: "/tour/[id]", params: { id: String(t.tour.id), city: t.cityName } })}
            />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.heading}>{usedFallback ? `Tours in ${city}` : `Tours near you · ${city}`}</Text>
        {usedFallback && (
          <Text style={styles.note}>No recorded tours where you are yet, so here is {city} to try.</Text>
        )}
        {loading && !nearby ? <ActivityIndicator color={colors.mint} style={{ marginTop: 24 }} /> : null}
        {error ? (
          <Pressable onPress={() => load()}>
            <Text style={styles.error}>{error} Tap to try again.</Text>
          </Pressable>
        ) : null}
        {nearby?.tours.map((t) => (
          <TourRow
            key={t.id}
            title={THEME_LABEL[t.theme] ?? t.theme}
            subtitle={`${t.stops} stops · ${t.minutes} min · ${LANGUAGE_LABEL[t.language] ?? t.language}`}
            onPress={() => router.push({ pathname: "/tour/[id]", params: { id: String(t.id), city } })}
          />
        ))}
        {nearby && nearby.tours.length === 0 && !error ? <Text style={styles.note}>No ready-made tours here yet.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48 },
  section: { marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 12 },
  note: { fontSize: 14, color: colors.inkMute, marginBottom: 12 },
  error: { fontSize: 15, color: colors.danger, marginVertical: 12 },
});

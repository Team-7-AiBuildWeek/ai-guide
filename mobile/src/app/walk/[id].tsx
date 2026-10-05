/**
 * The walk itself, entirely from files on the phone.
 *
 * The map shows the stops and the walking legs between them. Each stop's story
 * starts on its own when the walker comes within its trigger radius; they can
 * also play any stop by hand. Narration keeps playing with the screen locked,
 * and shows on the lock screen.
 *
 * Arrival is watched only while the app is open. Starting a stop with the phone
 * locked in a pocket needs background location, which needs the app's own build
 * (not Expo Go) — the next step.
 */

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Location from "expo-location";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { decodePolyline, metersBetween, type LatLng } from "@/lib/geo";
import { loadTour } from "@/lib/offline";
import { colors, THEME_LABEL } from "@/lib/theme";
import type { SavedTour } from "@/lib/types";

const MIN_TRIGGER_M = 25; // GPS in old towns wanders; never trigger tighter than this

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function WalkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tour, setTour] = useState<SavedTour | null>(null);
  const [current, setCurrent] = useState(0);
  const [played, setPlayed] = useState<Set<number>>(new Set());
  const [here, setHere] = useState<LatLng | null>(null);
  const [showText, setShowText] = useState(false);
  const [loaded, setLoaded] = useState<number | null>(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    void loadTour(Number(id)).then(setTour);
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  }, [id]);

  function play(index: number) {
    if (!tour) return;
    const stop = tour.stops[index];
    if (loaded !== index) {
      player.replace({ uri: stop.localAudio, name: stop.name });
      setLoaded(index);
    } else if (status.duration > 0 && status.currentTime >= status.duration - 0.5) {
      void player.seekTo(0); // it had finished: play it again from the start
    }
    player.setActiveForLockScreen(true, { title: stop.name, artist: `${THEME_LABEL[tour.tour.theme] ?? ""} · ${tour.cityName}` });
    player.play();
    setCurrent(index);
    setPlayed((p) => new Set(p).add(index));
  }

  // The location callback runs outside React's render cycle, so it reads the
  // latest state and play() through a ref rather than closing over stale ones.
  const latest = useRef({ tour, played, playing: status.playing, play });
  useEffect(() => {
    latest.current = { tour, played, playing: status.playing, play };
  });

  // Arrival: each position update checks whether the walker is inside the radius
  // of a stop they have not heard yet, and starts it unless something is playing.
  useEffect(() => {
    if (!tour) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted" || cancelled) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, (pos) => {
        const at = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setHere(at);
        const { tour: t, played: heard, playing, play: start } = latest.current;
        if (!t || playing) return;
        const arrived = t.stops.findIndex((st, i) => !heard.has(i) &&
          metersBetween(at, { latitude: st.lat, longitude: st.lng }) <= Math.max(MIN_TRIGGER_M, st.trigger_radius_m));
        if (arrived !== -1) start(arrived);
      });
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [tour]);

  const route = useMemo(
    () => (tour ? tour.stops.flatMap((s) => (s.walk_to_next ? decodePolyline(s.walk_to_next.polyline) : [])) : []),
    [tour],
  );

  if (!tour) return <View style={styles.center}><ActivityIndicator color={colors.mint} /></View>;

  const stop = tour.stops[current];
  const nextStop = tour.stops[current + 1];
  const distanceToStop = here ? Math.round(metersBetween(here, { latitude: stop.lat, longitude: stop.lng })) : null;
  const isLoaded = loaded === current;

  return (
    <>
      <Stack.Screen options={{ title: `Stop ${current + 1} of ${tour.stops.length}` }} />
      <MapView
        style={styles.map}
        showsUserLocation
        initialRegion={{ latitude: tour.stops[0].lat, longitude: tour.stops[0].lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
      >
        {route.length > 1 && <Polyline coordinates={route} strokeColor={colors.mint} strokeWidth={4} />}
        {tour.stops.map((s, i) => (
          <Marker
            key={s.position}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={`${i + 1}. ${s.name}`}
            pinColor={i === current ? colors.mint : played.has(i) ? "gray" : "orange"}
            onCalloutPress={() => play(i)}
          />
        ))}
      </MapView>

      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.stopName}>{stop.name}</Text>
        {stop.local_name && stop.local_name !== stop.name ? <Text style={styles.local}>{stop.local_name}</Text> : null}
        <Text style={styles.meta}>
          {distanceToStop !== null ? `${distanceToStop} m away · ` : ""}
          {played.has(current) ? "playing from here" : "starts when you arrive"}
        </Text>

        <View style={styles.controls}>
          <Pressable style={styles.secondary} disabled={current === 0} onPress={() => play(current - 1)}>
            <Text style={[styles.secondaryText, current === 0 && styles.dim]}>◀︎ Back</Text>
          </Pressable>
          <Pressable style={styles.play} onPress={() => (status.playing ? player.pause() : play(current))}>
            <Text style={styles.playText}>{status.playing ? "Pause" : isLoaded ? "Resume" : "Play now"}</Text>
          </Pressable>
          <Pressable style={styles.secondary} disabled={!nextStop} onPress={() => play(current + 1)}>
            <Text style={[styles.secondaryText, !nextStop && styles.dim]}>Next ▶︎</Text>
          </Pressable>
        </View>
        {isLoaded ? (
          <Text style={styles.time}>{clock(status.currentTime)} / {clock(status.duration || (stop.audio?.duration_ms ?? 0) / 1000)}</Text>
        ) : null}

        {stop.walk_to_next && nextStop ? (
          <Text style={styles.next}>
            Next: {nextStop.name} · {stop.walk_to_next.distance_m} m, about {Math.max(1, Math.round(stop.walk_to_next.duration_s / 60))} min walk
          </Text>
        ) : null}

        <Pressable onPress={() => setShowText((v) => !v)}>
          <Text style={styles.link}>{showText ? "Hide the text" : "Read along"}</Text>
        </Pressable>
        {showText && stop.transcript ? <Text style={styles.transcript}>{stop.transcript}</Text> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  map: { height: "45%" },
  sheet: { flex: 1, backgroundColor: colors.paper },
  stopName: { fontSize: 24, fontWeight: "700", color: colors.ink },
  local: { fontSize: 16, color: colors.inkMute },
  meta: { fontSize: 14, color: colors.inkMute, marginTop: 4 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 8 },
  play: { flex: 1, backgroundColor: colors.mint, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  playText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  secondary: { paddingVertical: 14, paddingHorizontal: 12 },
  secondaryText: { color: colors.mint, fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.35 },
  time: { textAlign: "center", color: colors.inkMute, marginTop: 8, fontVariant: ["tabular-nums"] },
  next: { fontSize: 15, color: colors.ink, marginTop: 16 },
  link: { color: colors.mint, fontSize: 15, fontWeight: "600", marginTop: 16 },
  transcript: { fontSize: 16, lineHeight: 24, color: colors.ink, marginTop: 8 },
});

/**
 * The walk itself, entirely from files on the phone.
 *
 * The map is the content and fills the screen. The navigation bar and the
 * player float above it as Liquid Glass (the navigation layer); the narration
 * text opens in its own sheet, where it stays solid, because glass is never for
 * content. Each stop's story starts on its own when the walker comes within its
 * trigger radius; they can also play any stop by hand. Narration keeps playing
 * with the screen locked, and shows on the lock screen.
 *
 * Arrival is watched only while the app is open. Starting a stop with the phone
 * locked in a pocket needs background location, which needs the app's own build
 * (not Expo Go) — the next step.
 */

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Location from "expo-location";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassButton, GlassGroup, GlassSurface, useGlass } from "@/components/Glass";
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
  const [loaded, setLoaded] = useState<number | null>(null);
  const player = useAudioPlayer(null);
  const glass = useGlass();
  const insets = useSafeAreaInsets();
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
  const total = status.duration || (stop.audio?.duration_ms ?? 0) / 1000;
  const progress = isLoaded && total > 0 ? Math.min(1, status.currentTime / total) : 0;

  return (
    <View style={styles.screen}>
      {/* Over the map the bar is glass; without glass it stays an ordinary opaque bar. */}
      <Stack.Screen options={{ title: `Stop ${current + 1} of ${tour.stops.length}`, headerTransparent: glass }} />
      <MapView
        style={StyleSheet.absoluteFill}
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

      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <GlassGroup spacing={10} style={styles.group}>
          {/* The player: a floating control, like the system's now-playing bar. */}
          <GlassSurface style={styles.player}>
            <Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {distanceToStop !== null ? `${distanceToStop} m away · ` : ""}
              {played.has(current) ? "playing from here" : "starts when you arrive"}
            </Text>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.time}>{isLoaded ? `${clock(status.currentTime)} / ${clock(total)}` : clock(total)}</Text>
            <View style={styles.controls}>
              <IconButton
                symbol={{ ios: "backward.end.fill", android: "skip_previous", web: "skip_previous", glyph: "⏮" }}
                label="Previous stop"
                disabled={current === 0}
                onPress={() => play(current - 1)}
              />
              <IconButton
                symbol={status.playing
                  ? { ios: "pause.fill", android: "pause", web: "pause", glyph: "❚❚" }
                  : { ios: "play.fill", android: "play_arrow", web: "play_arrow", glyph: "▶" }}
                label={status.playing ? "Pause" : isLoaded ? "Resume" : "Play now"}
                large
                onPress={() => (status.playing ? player.pause() : play(current))}
              />
              <IconButton
                symbol={{ ios: "forward.end.fill", android: "skip_next", web: "skip_next", glyph: "⏭" }}
                label="Next stop"
                disabled={!nextStop}
                onPress={() => play(current + 1)}
              />
            </View>
          </GlassSurface>

          <View style={styles.row}>
            {stop.walk_to_next && nextStop ? (
              <GlassSurface style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  Next: {nextStop.name} · {Math.max(1, Math.round(stop.walk_to_next.duration_s / 60))} min
                </Text>
              </GlassSurface>
            ) : <View style={{ flex: 1 }} />}
            <GlassButton
              label="Read along"
              onPress={() => router.push({ pathname: "/walk/text", params: { id: String(tour.tour.id), stop: String(current) } })}
            />
          </View>
        </GlassGroup>
      </View>
    </View>
  );
}

/** An SF Symbol (iOS), a Material symbol (Android, web), and a text glyph if neither renders. */
type Symbol = { ios: string; android: string; web: string; glyph: string };

function IconButton({ symbol, label, onPress, disabled, large }: {
  symbol: Symbol; label: string; onPress: () => void; disabled?: boolean; large?: boolean;
}) {
  const size = large ? 34 : 24;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={12}
      style={({ pressed }) => [styles.icon, large && styles.iconLarge, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <SymbolView
        name={{ ios: symbol.ios, android: symbol.android, web: symbol.web } as never}
        size={size}
        tintColor={disabled ? colors.inkMute : large ? "#fff" : colors.mint}
        fallback={<Text style={{ fontSize: size * 0.7, color: large ? "#fff" : colors.mint }}>{symbol.glyph}</Text>}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  group: { gap: 10 },
  player: { borderRadius: 28, padding: 16 },
  stopName: { fontSize: 20, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 14, color: colors.inkMute, marginTop: 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.12)", marginTop: 12, overflow: "hidden" },
  trackFill: { height: 4, backgroundColor: colors.mint },
  time: { fontSize: 12, color: colors.inkMute, marginTop: 4, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", marginTop: 8 },
  icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  iconLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.mint },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  chip: { flex: 1, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 16 },
  chipText: { fontSize: 15, color: colors.ink },
});

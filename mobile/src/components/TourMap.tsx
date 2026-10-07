/**
 * The map under everything — the website's TourMap on Apple Maps.
 *
 * Mounted once; only what is drawn on it changes. Memoized: the screen above
 * re-renders with every tick of the narration, and the map need not. Mint is the walk, blue and
 * dashed is a ride. Stops are the website's numbered nodes: mint ahead, ink
 * with a mint number for the one you are on, pale for the ones behind you.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, type MapPressEvent } from "react-native-maps";
import { colors, fonts } from "@/lib/theme";
import type { Fix, LatLng, Point, TourRide } from "@/lib/types";

type MapStop = { id: string; name: string; lat: number; lng: number };

const coord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export default memo(function TourMap({
  center,
  fix,
  route,
  rides,
  stops,
  currentStopIndex,
  onSelectStop,
  pins,
  picking,
  onPick,
  bottomInset,
  follow,
  lookAt,
  fitKey,
}: {
  center: LatLng;
  fix: Fix | null;
  route: LatLng[];
  rides: TourRide[];
  stops: MapStop[];
  currentStopIndex: number;
  onSelectStop: (i: number) => void;
  pins: { kind: "start" | "end"; point: Point }[];
  picking: boolean;
  onPick: (p: LatLng) => void;
  bottomInset: number;
  follow: boolean;
  lookAt: (LatLng & { key: string }) | null;
  fitKey: string | null;
}) {
  const map = useRef<MapView>(null);
  const followed = useRef(false);

  // The walk, framed whole once, when it first appears.
  useEffect(() => {
    if (!fitKey) return;
    const points = route.length > 1 ? route : stops;
    if (points.length === 0) return;
    const id = setTimeout(() => {
      map.current?.fitToCoordinates(points.map(coord), {
        edgePadding: { top: 120, right: 48, bottom: bottomInset + 48, left: 48 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // A city chosen by hand: fly there.
  useEffect(() => {
    if (!lookAt) return;
    map.current?.animateCamera({ center: coord(lookAt), zoom: 13 }, { duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookAt?.key]);

  // Before the walk, the map comes to the walker once, when they are first found.
  useEffect(() => {
    if (!follow || !fix || followed.current) return;
    followed.current = true;
    map.current?.animateCamera({ center: coord(fix), zoom: 15 }, { duration: 700 });
  }, [follow, fix]);

  const routeCoords = useMemo(() => route.map(coord), [route]);

  const rideLines = useMemo(
    () =>
      rides.map((r) => ({
        key: `${r.from}-${r.to}-${r.ref}`,
        coords: [coord(r.board), coord(r.alight)],
      })),
    [rides],
  );

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={{ ...coord(center), latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      mapType="mutedStandard"
      showsUserLocation
      showsCompass={false}
      showsMyLocationButton={false}
      pitchEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
      onPress={(e: MapPressEvent) => {
        if (!picking) return;
        const { latitude, longitude } = e.nativeEvent.coordinate;
        onPick({ lat: latitude, lng: longitude });
      }}
    >
      {route.length > 1 ? (
        <>
          <Polyline coordinates={routeCoords} strokeColor="#ffffff" strokeWidth={8} lineCap="round" lineJoin="round" />
          <Polyline coordinates={routeCoords} strokeColor={colors.mintInk} strokeWidth={5} lineCap="round" lineJoin="round" />
        </>
      ) : null}
      {rideLines.map((r) => (
        <Polyline key={r.key} coordinates={r.coords} strokeColor={colors.transit} strokeWidth={5} lineDashPattern={[8, 6]} />
      ))}

      {stops.map((s, i) => {
        const current = i === currentStopIndex;
        const done = i < currentStopIndex;
        return (
          <Marker
            key={`${s.id}-${current ? "c" : done ? "d" : "a"}`}
            coordinate={coord(s)}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onSelectStop(i)}
            tracksViewChanges={false}
            accessibilityLabel={`Stop ${i + 1}, ${s.name}`}
            zIndex={current ? 2 : 1}
          >
            <View style={[styles.node, current && styles.nodeCurrent, done && styles.nodeDone]}>
              <Text style={[styles.nodeText, current && { color: colors.mint }, done && { color: colors.mintInk }]}>
                {i + 1}
              </Text>
            </View>
          </Marker>
        );
      })}

      {pins.map((p) => (
        <Marker
          key={`${p.kind}-${p.point.lat}-${p.point.lng}`}
          coordinate={coord(p.point)}
          pinColor={p.kind === "start" ? colors.mintInk : colors.ink}
          title={p.kind === "start" ? "Start" : "Finish"}
          description={p.point.label}
        />
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  node: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCurrent: { backgroundColor: colors.ink, width: 36, height: 36, borderRadius: 18 },
  nodeDone: { backgroundColor: colors.mintWash },
  nodeText: { fontFamily: fonts.display, fontSize: 14, color: colors.ink, fontVariant: ["tabular-nums"] },
});

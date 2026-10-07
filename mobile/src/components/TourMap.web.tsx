/**
 * TourMap for the browser preview: react-native-maps draws Apple Maps and has
 * no web version, so the preview gets a plain backdrop where the map goes.
 * Metro picks this file over TourMap.tsx when bundling for web.
 */

import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/lib/theme";

export default function TourMap(_props: Record<string, unknown>) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.map]}>
      <Text style={[type.caption, styles.note]}>The map shows on the phone</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { backgroundColor: colors.canvas, alignItems: "center", paddingTop: 120 },
  note: { color: colors.inkMute },
});

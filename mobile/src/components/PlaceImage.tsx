/**
 * A place's real photograph, filling whatever box it is given, faded in once it
 * has loaded (lib/placePhoto.ts). With no photograph it draws nothing, or
 * `fallback`. The website's components/PlaceImage.tsx.
 */

import { useState, type ReactNode } from "react";
import { Animated, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { usePlacePhoto, type Place } from "@/lib/placePhoto";
import { colors } from "@/lib/theme";

export default function PlaceImage({
  place,
  style,
  fallback = null,
  children,
  credit = false,
}: {
  place: Place | null;
  style?: StyleProp<ViewStyle>;
  fallback?: ReactNode;
  /** Drawn over the photo. */
  children?: ReactNode;
  /** A small "Wikimedia" credit in the corner, opening where the photo came from. */
  credit?: boolean;
}) {
  const photo = usePlacePhoto(place);
  const [opacity] = useState(() => new Animated.Value(0));
  if (photo === null) return <>{fallback}</>;
  return (
    <View style={[styles.box, style]}>
      {photo ? (
        <Animated.Image
          source={{ uri: photo.url }}
          style={[StyleSheet.absoluteFill, { opacity }]}
          resizeMode="cover"
          accessibilityLabel={place?.name}
          onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }).start()}
        />
      ) : null}
      {children}
      {credit && photo ? (
        <Pressable onPress={() => void Linking.openURL(photo.page)} style={styles.credit} hitSlop={6}>
          <Text style={styles.creditText} numberOfLines={1}>
            {photo.title} · Wikimedia
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", backgroundColor: colors.line },
  credit: { position: "absolute", right: 8, bottom: 6, maxWidth: "80%", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "rgba(0,0,0,0.35)" },
  creditText: { fontSize: 11, color: "rgba(255,255,255,0.9)" },
});

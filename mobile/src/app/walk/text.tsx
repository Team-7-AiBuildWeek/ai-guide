/**
 * Read along: the stop's narration and where its facts come from.
 *
 * Opened as a partial-height sheet, which iOS 26 draws in Liquid Glass by itself
 * (no custom background — the system handles it). The text inside is content,
 * so it stays plain and readable.
 */

import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text } from "react-native";
import { loadTour } from "@/lib/offline";
import { colors } from "@/lib/theme";
import type { SavedTour } from "@/lib/types";

export default function ReadAlong() {
  const { id, stop } = useLocalSearchParams<{ id: string; stop: string }>();
  const [tour, setTour] = useState<SavedTour | null>(null);
  useEffect(() => {
    void loadTour(Number(id)).then(setTour);
  }, [id]);

  const s = tour?.stops[Number(stop)];
  if (!s) return null;

  return (
    <>
      <Stack.Screen options={{ title: s.name }} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.text}>{s.transcript}</Text>
        {s.sources.length > 0 && (
          <>
            <Text style={styles.heading}>Sources</Text>
            {s.sources.map((src) => (
              <Text key={src.url} style={styles.source} onPress={() => Linking.openURL(src.url)}>
                {src.url.replace(/^https?:\/\//, "")} · {src.license}
              </Text>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48 },
  text: { fontSize: 17, lineHeight: 26, color: colors.ink },
  heading: { fontSize: 15, fontWeight: "700", color: colors.inkMute, marginTop: 24, marginBottom: 6 },
  source: { fontSize: 14, color: colors.mint, marginBottom: 6 },
});

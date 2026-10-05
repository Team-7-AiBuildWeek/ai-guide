import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function TourRow({ title, subtitle, badge, onPress }: { title: string; subtitle: string; badge?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 14,
    backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, marginBottom: 10,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.inkMute, marginTop: 2 },
  badge: {
    fontSize: 12, fontWeight: "600", color: colors.mint, backgroundColor: colors.mintWash,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: "hidden",
  },
});

/** "Use headphones for the best experience.": the website's HeadphonesStep. */

import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";
import { Btn } from "@/components/ui";
import { colors, type } from "@/lib/theme";

export default function Headphones({
  title,
  stopCount,
  minutes,
  onStart,
}: {
  title: string;
  stopCount: number;
  minutes: number;
  onStart: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <SymbolView
          name={{ ios: "headphones", android: "headphones", web: "headphones" } as never}
          size={48}
          tintColor={colors.mintInk}
          fallback={<Text style={{ fontSize: 40 }}>🎧</Text>}
        />
      </View>
      <View>
        <Text style={[type.h2, styles.center]}>Use headphones for the best experience.</Text>
        <Text style={[type.lead, styles.center, { marginTop: 16, color: colors.inkSoft }]}>
          The guide talks as you walk, so keep the phone in your pocket if you like.
        </Text>
      </View>
      <Text style={[type.body, styles.center, { color: colors.inkMute }]}>
        {title} · {stopCount} stops · about {minutes} minutes
      </Text>
      <Btn variant="primary" large label="Start the tour" onPress={onStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20, paddingTop: 32 },
  badge: {
    alignSelf: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.mintWash,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
});

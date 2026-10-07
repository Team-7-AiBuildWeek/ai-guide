/**
 * The Tours tab: the walk you are on, if there is one, and every walk built on
 * this phone (and, signed in, on your account) — the website's Tours page.
 */

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WalkCard from "@/components/WalkCard";
import { Btn, Eyebrow } from "@/components/ui";
import { loadTour } from "@/lib/flow";
import { forgetWalk, loadWalks } from "@/lib/history";
import { t } from "@/lib/strings";
import { requestResume } from "@/lib/tabbar";
import { colors, radius, type } from "@/lib/theme";
import type { StoredTour } from "@/lib/types";

export default function ToursTab() {
  const insets = useSafeAreaInsets();
  const [walks, setWalks] = useState(loadWalks);
  const [current, setCurrent] = useState<StoredTour | null>(loadTour);

  // Fresh each time the tab is opened: a walk may have been built on Explore.
  useFocusEffect(
    useCallback(() => {
      setWalks(loadWalks());
      setCurrent(loadTour());
    }, []),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, paddingTop: Math.max(16, insets.top), paddingBottom: 32, gap: 24 }}
    >
      <Text style={type.h2}>Tours</Text>

      {current ? (
        <View style={styles.card}>
          <Eyebrow>{t("landing.paused")}</Eyebrow>
          <Text style={type.h3}>{current.plan.title}</Text>
          <Text style={type.caption}>
            {current.plan.stops.length} stops · {current.plan.stops.slice(0, 3).map((s) => s.name).join(", ")}
            {current.plan.stops.length > 3 ? "…" : ""}
          </Text>
          <Btn
            variant="primary"
            large
            label={t("landing.carryOn")}
            onPress={() => {
              requestResume();
              router.navigate("/");
            }}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={type.h3}>No walk in progress</Text>
          <Text style={type.caption}>Build one around what you want to see. It takes about a minute.</Text>
          <Btn variant="primary" large label={t("landing.build")} onPress={() => router.navigate("/")} />
        </View>
      )}

      <View style={{ gap: 12 }}>
        <Text style={type.h3}>{t("profile.past")}</Text>
        {walks.length === 0 ? (
          <Text style={type.body}>{t("profile.empty")}</Text>
        ) : (
          walks.map((w) => <WalkCard key={w.at} walk={w} onForget={() => setWalks(forgetWalk(w.at))} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 },
});

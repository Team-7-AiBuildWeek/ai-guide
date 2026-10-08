/**
 * One past walk, folded: what it was, and opened: its stops, walk it again, delete it.
 * Swipe it left for "Again" and "Delete"; a long swipe deletes it (SwipeRow).
 */

import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import SwipeRow from "@/components/SwipeRow";
import { Btn, Eyebrow, LanguageSelect, Stat } from "@/components/ui";
import { canWalkAgain, formatKm, formatWhen, planFor, saveRebuild, type WalkRecord } from "@/lib/history";
import { languageName } from "@/lib/languages";
import { t } from "@/lib/strings";
import { colors, fonts, radius, size, type } from "@/lib/theme";

export default function WalkCard({ walk, onForget }: { walk: WalkRecord; onForget: () => void }) {
  const [open, setOpen] = useState(false);
  const [againLang, setAgainLang] = useState(walk.lang);

  const walkAgain = () => {
    const plan = planFor(walk);
    if (!walk.req || !plan) return;
    saveRebuild({ req: { ...walk.req, lang: againLang }, plan });
    // Explore picks this up when it comes into view and builds it.
    router.navigate("/");
  };

  const again = canWalkAgain(walk);

  return (
    <SwipeRow
      actions={[
        { id: "delete", label: t("swipe.delete"), symbol: "trash" },
        ...(again ? [{ id: "again", label: t("swipe.again"), symbol: "arrow.counterclockwise", onSelect: walkAgain }] : []),
      ]}
      onCommit={onForget}
    >
    <View style={styles.body}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.walkHead}>
        <View style={{ flex: 1 }}>
          <Text style={type.lead}>{walk.title}</Text>
          <Text style={[type.caption, { marginTop: 4 }]}>
            {[walk.city, formatWhen(walk.at), `${walk.stopNames.length} stops`, formatKm(walk.meters)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Text style={{ color: colors.inkMute }}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 16 }}>
          <View style={styles.stats}>
            <Stat label="Asked for" value={`${walk.minutes} min`} />
            <Stat label="Walking" value={`${Math.max(1, Math.round(walk.seconds / 60))} min`} />
            <Stat label={t("brief.language")} value={languageName(walk.lang)} />
          </View>
          {walk.freeText ? <Text style={styles.quote}>“{walk.freeText}”</Text> : null}
          <Eyebrow style={{ marginTop: 16 }}>{t("profile.theStops")}</Eyebrow>
          <View style={{ marginTop: 8, gap: 4 }}>
            {walk.stopNames.map((name, i) => (
              <Text key={i} style={[type.caption, { color: colors.inkSoft }]}>
                <Text style={{ color: colors.inkMute }}>{i + 1}.</Text> {name}
              </Text>
            ))}
          </View>
          {again ? (
            <View style={styles.again}>
              <LanguageSelect label={t("brief.language")} value={againLang} onChange={setAgainLang} />
              <Btn variant="primary" label={t("profile.walkAgain")} onPress={walkAgain} style={{ marginTop: 12 }} />
              <Text style={[type.caption, { marginTop: 8 }]}>{t("profile.walkAgainHint")}</Text>
            </View>
          ) : null}
          <Pressable onPress={onForget} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", marginTop: 8 }}>
            <Text style={styles.delete}>{t("profile.deleteOne")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
  walkHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  quote: {
    marginTop: 16,
    backgroundColor: colors.canvas,
    borderRadius: radius.control,
    padding: 12,
    fontFamily: fonts.body,
    fontStyle: "italic",
    fontSize: size.caption,
    color: colors.inkSoft,
  },
  again: { marginTop: 16, backgroundColor: colors.canvas, borderRadius: radius.control, padding: 12 },
  delete: { fontFamily: fonts.display, fontSize: size.caption, color: colors.danger, textDecorationLine: "underline" },
});

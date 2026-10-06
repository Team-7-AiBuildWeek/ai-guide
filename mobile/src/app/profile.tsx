/** "My profile": the website's Profile — totals, settings, and every walk built here. */

import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Eyebrow, LanguageSelect, TextLink } from "@/components/ui";
import { BASE } from "@/lib/api";
import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/flow";
import { canWalkAgain, forgetWalk, formatKm, formatWhen, loadWalks, planFor, saveRebuild, type WalkRecord } from "@/lib/history";
import { LANGUAGES } from "@/lib/languages";
import { t } from "@/lib/strings";
import { colors, fonts, radius, size, type } from "@/lib/theme";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <Text style={[type.lead, { marginTop: 4 }]}>{value}</Text>
    </View>
  );
}

function Walk({ walk, onForget }: { walk: WalkRecord; onForget: () => void }) {
  const [open, setOpen] = useState(false);
  const [againLang, setAgainLang] = useState(walk.lang);
  const language = LANGUAGES.find((l) => l.code === walk.lang)?.english ?? walk.lang;

  const walkAgain = () => {
    const plan = planFor(walk);
    if (!walk.req || !plan) return;
    saveRebuild({ req: { ...walk.req, lang: againLang }, plan });
    router.back();
  };

  return (
    <View style={styles.card}>
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
            <Stat label={t("brief.language")} value={language} />
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
          {canWalkAgain(walk) ? (
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
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const [walks, setWalks] = useState(loadWalks);
  const [lang, setLang] = useState(() => loadDraft()?.lang ?? EMPTY_DRAFT.lang);
  const walked = walks.reduce((m, w) => m + w.meters, 0);
  const stops = walks.reduce((n, w) => n + w.stopNames.length, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 16, paddingTop: Math.max(16, insets.top), paddingBottom: insets.bottom + 32, gap: 24 }}
    >
      <View style={styles.header}>
        <Btn label="←" onPress={() => router.back()} accessibilityLabel="Back to the map" textStyle={{ fontSize: 20 }} />
        <Text style={type.h2}>{t("profile.title")}</Text>
      </View>

      <View style={[styles.card, styles.stats]}>
        <Stat label={t("profile.built")} value={String(walks.length)} />
        <Stat label={t("profile.stops")} value={String(stops)} />
        <Stat label={t("profile.distance")} value={formatKm(walked)} />
      </View>

      <View>
        <Text style={type.h3}>Settings</Text>
        <Text style={[type.caption, { marginTop: 4, marginBottom: 12 }]}>
          These carry over to every new walk. Each one can still be changed while building a tour.
        </Text>
        <LanguageSelect
          label={t("brief.language")}
          value={lang}
          onChange={(next) => {
            setLang(next);
            saveDraft({ ...(loadDraft() ?? EMPTY_DRAFT), lang: next });
          }}
        />
      </View>

      <View style={{ gap: 12 }}>
        <Text style={type.h3}>{t("profile.past")}</Text>
        {walks.length === 0 ? (
          <Text style={type.body}>{t("profile.empty")}</Text>
        ) : (
          walks.map((w) => <Walk key={w.at} walk={w} onForget={() => setWalks(forgetWalk(w.at))} />)
        )}
      </View>
      {walks.length === 0 ? <TextLink label={t("landing.build")} onPress={() => router.back()} /> : null}
      <TextLink muted label="Privacy" onPress={() => void Linking.openURL(`${BASE}/privacy`)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 },
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

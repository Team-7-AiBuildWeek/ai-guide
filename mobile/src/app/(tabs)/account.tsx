/** The Account tab: totals, the account, settings, and the privacy page. Walks are on the Tours tab. */

import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Account from "@/components/Account";
import { LanguageSelect, Stat, TextLink } from "@/components/ui";
import { accountsEnabled } from "@/lib/accounts";
import { BASE } from "@/lib/api";
import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/flow";
import { formatKm, loadWalks } from "@/lib/history";
import { t } from "@/lib/strings";
import { colors, surface, type } from "@/lib/theme";

export default function AccountTab() {
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
      <Text style={type.h2}>Account</Text>

      <View style={[surface.card, styles.stats]}>
        <Stat label={t("profile.built")} value={String(walks.length)} />
        <Stat label={t("profile.stops")} value={String(stops)} />
        <Stat label={t("profile.distance")} value={formatKm(walked)} />
      </View>

      {accountsEnabled ? <Account onWalks={setWalks} /> : null}

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

      <TextLink muted label="Privacy" onPress={() => void Linking.openURL(`${BASE}/privacy`)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
});

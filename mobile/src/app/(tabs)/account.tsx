/** The Account tab: what all the walks add up to, and the menu (account, language, support). Walks are on the Tours tab. */

import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AccountMenu from "@/components/AccountMenu";
import { Stat } from "@/components/ui";
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

      <AccountMenu
        lang={lang}
        onLang={(next) => {
          setLang(next);
          saveDraft({ ...(loadDraft() ?? EMPTY_DRAFT), lang: next });
        }}
        onWalks={setWalks}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
});

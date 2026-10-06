/** "Build my tour": the website's BriefStep, with its footer. */

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Btn, Eyebrow, Field, LanguageSelect, Pill, Segmented, Stepper, TextLink } from "@/components/ui";
import { DETAILS, DURATIONS, EMPTY_DRAFT, INTERESTS, PACES } from "@/lib/flow";
import { t } from "@/lib/strings";
import { colors, fonts, size, type } from "@/lib/theme";
import type { Detail, Draft, Interest, Pace } from "@/lib/types";

export function BriefFooter({ onChange, onContinue }: { onChange: (p: Partial<Draft>) => void; onContinue: () => void }) {
  return (
    <View style={{ gap: 4 }}>
      <TextLink
        muted
        label={t("brief.clearAll")}
        onPress={() =>
          onChange({
            freeText: "",
            durationMinutes: EMPTY_DRAFT.durationMinutes,
            detail: EMPTY_DRAFT.detail,
            pace: EMPTY_DRAFT.pace,
            interests: EMPTY_DRAFT.interests,
          })
        }
        style={{ minHeight: 36 }}
      />
      <Btn variant="primary" large label={t("brief.plan")} onPress={onContinue} textStyle={{ fontFamily: fonts.display }} />
    </View>
  );
}

export default function Brief({ draft, onChange }: { draft: Draft; onChange: (p: Partial<Draft>) => void }) {
  const [personalise, setPersonalise] = useState(() => draft.freeText.trim().length > 0);
  const durationIndex = DURATIONS.indexOf(draft.durationMinutes);

  const toggleInterest = (i: Interest) =>
    onChange({
      interests: draft.interests.includes(i) ? draft.interests.filter((x) => x !== i) : [...draft.interests, i],
    });

  return (
    <View style={{ gap: 16 }}>
      <LanguageSelect label={t("brief.language")} value={draft.lang} onChange={(lang) => onChange({ lang })} />

      <Stepper
        label={t("brief.howLong")}
        value={t(`duration.${draft.durationMinutes}`)}
        atMin={durationIndex <= 0}
        atMax={durationIndex >= DURATIONS.length - 1}
        onStep={(d) => {
          const next = DURATIONS[Math.min(DURATIONS.length - 1, Math.max(0, durationIndex + d))];
          if (next) onChange({ durationMinutes: next });
        }}
      />
      <Segmented
        label={t("brief.detail")}
        options={DETAILS.map((d) => ({ value: d, label: t(`detail.${d}`) }))}
        value={draft.detail}
        onChange={(v) => onChange({ detail: v as Detail })}
      />
      <Segmented
        label={t("brief.pace")}
        options={PACES.map((p) => ({ value: p, label: t(`pace.${p}`) }))}
        value={draft.pace}
        onChange={(v) => onChange({ pace: v as Pace })}
      />

      <View>
        <Eyebrow>{t("brief.interests")}</Eyebrow>
        <View style={styles.pills}>
          {INTERESTS.map((i) => (
            <Pill
              key={i.value}
              icon={i.icon}
              label={t(`interest.${i.value}`)}
              on={draft.interests.includes(i.value)}
              onPress={() => toggleInterest(i.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.divider}>
        <Btn variant="primary" large onPress={() => setPersonalise((v) => !v)} accessibilityLabel={t("brief.personalise")}>
          <View style={styles.personaliseRow}>
            <Text style={styles.personaliseText}>{t("brief.personalise")}</Text>
            <Text style={styles.personaliseCaret}>{personalise ? "▲" : "▼"}</Text>
          </View>
        </Btn>
        {!personalise ? (
          <Text style={[type.caption, { textAlign: "center", marginTop: 8 }]}>
            {draft.freeText.trim() ? t("brief.personaliseSet") : t("brief.personaliseHint")}
          </Text>
        ) : null}
      </View>

      {personalise ? (
        <View>
          <Text style={type.lead}>{t("brief.ownWords")}</Text>
          <Text style={[type.caption, { marginTop: 4 }]}>{t("brief.ownWordsHint")}</Text>
          <Field
            multiline
            value={draft.freeText}
            onChangeText={(freeText) => onChange({ freeText })}
            placeholder="Old town history, not too much walking, something about the coronations"
            style={styles.textarea}
            textAlignVertical="top"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  divider: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 16 },
  personaliseRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  personaliseText: { fontFamily: fonts.displayMedium, fontSize: size.body, color: colors.ink },
  personaliseCaret: { fontSize: size.caption, color: colors.ink },
  textarea: { marginTop: 12, minHeight: 96, paddingTop: 12, lineHeight: size.body * 1.5 },
});

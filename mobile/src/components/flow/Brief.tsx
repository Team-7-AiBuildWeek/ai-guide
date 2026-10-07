/**
 * "Build my tour": the website's BriefStep, with its footer.
 *
 *   How long → What interests you → Style → Anything else → Narration
 *
 * The estimate in the footer and the style note come from tourShape, the same
 * numbers the planner uses.
 */

import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Btn, Eyebrow, Field, LanguageSelect, Pill, Segmented, TextLink } from "@/components/ui";
import { DETAILS, DURATIONS, EMPTY_DRAFT, INTERESTS, PACES, SCRIPT_MINUTES, WALK_MINUTES, tourShape } from "@/lib/flow";
import { tick, usePop } from "@/lib/motion";
import { t } from "@/lib/strings";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { Detail, Draft, Interest, Pace } from "@/lib/types";
import RouteSketch, { Roll } from "./RouteSketch";

/** Phrases a tap adds to the free-text box. */
const SUGGESTIONS = ["suggest.kids", "suggest.stepFree", "suggest.crowds", "suggest.coffee", "suggest.photos", "suggest.rain"];

export function BriefFooter({
  draft,
  onChange,
  onContinue,
}: {
  draft: Draft;
  onChange: (p: Partial<Draft>) => void;
  onContinue: () => void;
}) {
  const shape = tourShape(draft);
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.footerRow}>
        <View style={{ flexShrink: 1 }} accessibilityLiveRegion="polite">
          <Roll
            value={`${t(`durationShort.${draft.durationMinutes}`)} · ${t("brief.estimate", { stops: shape.stops, km: shape.km })}`}
            style={styles.estimate}
          />
        </View>
        <TextLink
          muted
          label={t("brief.reset")}
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
      </View>
      <Btn variant="primary" large label={t("brief.next")} onPress={onContinue} textStyle={{ fontFamily: fonts.display }} />
    </View>
  );
}

/** The interest chips, as a row: shared with the get-to-know-you screen. */
export function InterestPills({
  value,
  onChange,
  style,
}: {
  value: Interest[];
  onChange: (next: Interest[]) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pills, style]}>
      {INTERESTS.map((i) => {
        const on = value.includes(i.value);
        return (
          <Pill
            key={i.value}
            icon={i.icon}
            label={t(`interest.${i.value}`)}
            on={on}
            onPress={() => onChange(on ? value.filter((x) => x !== i.value) : [...value, i.value])}
          />
        );
      })}
    </View>
  );
}

/** One interest as a tile: a soft colour and a big icon, mint with a tick when chosen. */
function Tile({ icon, tint, label, on, onPress }: { icon: string; tint: string; label: string; on: boolean; onPress: () => void }) {
  const pop = usePop(on);
  return (
    <Animated.View style={[styles.tileCell, { transform: [{ scale: pop }] }]}>
      <Pressable
        onPress={() => {
          tick();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={({ pressed }) => [styles.tile, { backgroundColor: on ? colors.mint : tint }, pressed && { transform: [{ scale: 0.97 }] }]}
      >
        <Text style={styles.tileIcon}>{icon}</Text>
        <Text style={[styles.tileText, on && { fontFamily: fonts.display }]}>{label}</Text>
        {on ? (
          <View style={styles.tick}>
            <Text style={styles.tickText}>✓</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The interests as tiles, two to a row; the get-to-know-you sheet keeps the pills. */
function InterestTiles({ value, onChange }: { value: Interest[]; onChange: (next: Interest[]) => void }) {
  return (
    <View style={styles.tiles}>
      {INTERESTS.map((i) => {
        const on = value.includes(i.value);
        return (
          <Tile
            key={i.value}
            icon={i.icon}
            tint={i.tint}
            label={t(`interest.${i.value}`)}
            on={on}
            onPress={() => onChange(on ? value.filter((x) => x !== i.value) : [...value, i.value])}
          />
        );
      })}
    </View>
  );
}

/** The words a suggestion adds, and the box with them taken out again. */
function hasPhrase(text: string, phrase: string) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}
function withPhrase(text: string, phrase: string) {
  const trimmed = text.trim().replace(/[,.]$/, "");
  return trimmed ? `${trimmed}, ${phrase.toLowerCase()}` : phrase;
}
function withoutPhrase(text: string, phrase: string) {
  const at = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return text;
  return (text.slice(0, at) + text.slice(at + phrase.length))
    .replace(/\s*,\s*,/g, ",")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .trim();
}

export default function Brief({ draft, onChange }: { draft: Draft; onChange: (p: Partial<Draft>) => void }) {
  const picked = draft.interests.length;

  return (
    <View style={{ gap: 24 }}>
      <Eyebrow style={{ marginBottom: -12 }}>{t("brief.step")}</Eyebrow>
      <RouteSketch draft={draft} />

      <View>
        <Eyebrow>{t("brief.howLong")}</Eyebrow>
        <View style={[styles.pills, { marginTop: 8 }]}>
          {DURATIONS.map((d) => (
            <Pill
              key={d}
              label={t(`durationShort.${d}`)}
              on={draft.durationMinutes === d}
              onPress={() => onChange({ durationMinutes: d })}
            />
          ))}
        </View>
      </View>

      <View>
        <View style={styles.headingRow}>
          <Eyebrow>{t("brief.interests")}</Eyebrow>
          {picked > 0 ? <Text style={type.caption}>{t("brief.interestsCount", { n: picked })}</Text> : null}
        </View>
        <InterestTiles value={draft.interests} onChange={(interests) => onChange({ interests })} />
        {picked === 0 ? <Text style={[type.caption, { marginTop: 8 }]}>{t("brief.interestsNone")}</Text> : null}
      </View>

      <View style={{ gap: 12 }}>
        <Eyebrow>{t("brief.style")}</Eyebrow>
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
        <Text style={type.caption}>
          {t("brief.styleNote", { listen: SCRIPT_MINUTES[draft.detail], walk: WALK_MINUTES[draft.pace] })}
        </Text>
      </View>

      <View>
        <Eyebrow>{t("brief.anythingElse")}</Eyebrow>
        <Field
          multiline
          value={draft.freeText}
          onChangeText={(freeText) => onChange({ freeText })}
          placeholder="Old town history, not too much walking, something about the coronations"
          style={styles.textarea}
          textAlignVertical="top"
          accessibilityLabel={t("brief.anythingElse")}
        />
        <Text style={[type.caption, { marginTop: 4 }]}>{t("brief.anythingElseHint")}</Text>
        <View style={[styles.pills, { marginTop: 12 }]}>
          {SUGGESTIONS.map((key) => {
            const phrase = t(key);
            const on = hasPhrase(draft.freeText, phrase);
            return (
              <Pill
                key={key}
                icon={on ? "✓" : "+"}
                label={phrase}
                on={on}
                onPress={() =>
                  onChange({ freeText: on ? withoutPhrase(draft.freeText, phrase) : withPhrase(draft.freeText, phrase) })
                }
              />
            );
          })}
        </View>
      </View>

      <View style={styles.divider}>
        <LanguageSelect label={t("brief.narration")} value={draft.lang} onChange={(lang) => onChange({ lang })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  estimate: { fontFamily: fonts.displayMedium, fontSize: size.caption, color: colors.ink, fontVariant: ["tabular-nums"] },
  tiles: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tileCell: { width: "48.5%" },
  tile: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.card },
  tileIcon: { fontSize: 26 },
  tileText: { flex: 1, fontFamily: fonts.displayMedium, fontSize: size.caption, lineHeight: size.caption * 1.25, color: colors.ink },
  tick: { position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  tickText: { color: "#fff", fontSize: 11, lineHeight: 13 },
  divider: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 16 },
  textarea: { marginTop: 8, minHeight: 72, paddingTop: 12, lineHeight: size.body * 1.5 },
});

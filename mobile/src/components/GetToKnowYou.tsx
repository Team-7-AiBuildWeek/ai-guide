/**
 * "Get to know you": the two short questions after a new walker confirms their
 * email — what to call them, and a small version of the tour settings. Same
 * screens as the website's components/GetToKnowYou.tsx.
 */

import { useUser } from "@clerk/expo";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { InterestPills } from "@/components/flow/Brief";
import { Btn, Eyebrow, Field, Segmented, TextLink } from "@/components/ui";
import { DETAILS } from "@/lib/flow";
import { applyPrefs, defaultPrefs, profileOf, type Prefs } from "@/lib/profile";
import { t } from "@/lib/strings";
import { colors, size, type } from "@/lib/theme";
import type { Detail } from "@/lib/types";

function Progress({ step }: { step: 1 | 2 }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${step} of 2`}>
      {[1, 2].map((n) => (
        <View key={n} style={[styles.bar, { backgroundColor: n <= step ? colors.mint : colors.line }]} />
      ))}
    </View>
  );
}

export default function GetToKnowYou({ onDone }: { onDone: () => void }) {
  const { user } = useUser();
  const known = profileOf(user);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(known.name ?? user?.firstName ?? "");
  const [prefs, setPrefs] = useState<Prefs>(known.prefs ?? defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<Prefs>) => setPrefs((x) => ({ ...x, ...p }));

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await user?.update({
        unsafeMetadata: { ...(user.unsafeMetadata ?? {}), name: name.trim() || undefined, prefs, onboarded: true },
      });
      applyPrefs(prefs);
      onDone();
    } catch {
      setError("Could not save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (step === 1) {
    return (
      <View style={{ gap: 12 }}>
        <Progress step={1} />
        <Eyebrow style={{ marginTop: 8 }}>Get to know you</Eyebrow>
        <Text style={type.h3}>What should we call you?</Text>
        <Text style={type.body}>The guide will use it now and then. You can leave it empty.</Text>
        <Field
          value={name}
          onChangeText={setName}
          placeholder="Your first name"
          textContentType="givenName"
          autoComplete="given-name"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => setStep(2)}
          style={{ minHeight: 52 }}
          accessibilityLabel="Your first name"
        />
        <Btn variant="primary" large label="Continue" onPress={() => setStep(2)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Progress step={2} />
      <View>
        <Eyebrow>Get to know you</Eyebrow>
        <Text style={[type.h3, { marginTop: 4 }]}>
          {name.trim() ? `What do you like to see, ${name.trim()}?` : "What do you like to see?"}
        </Text>
        <Text style={[type.caption, { marginTop: 4 }]}>Every new tour starts from this. You can change it each time.</Text>
      </View>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        <InterestPills value={prefs.interests} onChange={(interests) => patch({ interests })} />
        <Segmented
          label={t("brief.detail")}
          options={DETAILS.map((d) => ({ value: d, label: t(`detail.${d}`) }))}
          value={prefs.detail}
          onChange={(v) => patch({ detail: v as Detail })}
        />
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Btn variant="primary" large label={saving ? "Saving…" : "Start walking"} disabled={saving} onPress={() => void finish()} />
      <TextLink label="Back" onPress={() => setStep(1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: 8 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  error: { fontSize: size.caption, color: colors.danger },
});

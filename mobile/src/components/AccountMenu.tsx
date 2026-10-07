/**
 * The Account tab's menu — the website's components/AccountMenu.tsx: one card,
 * two sections, a row for everything that can be done here, laid out like a
 * settings sidebar (small grey section headings, an icon and a label per row,
 * a soft highlight under the finger).
 *
 * Only rows that do something: Walk has no billing, notifications or themes,
 * and a row that leads nowhere is worse than no row (Apple agrees).
 *
 *   Account   Profile (or Sign in) · Language · Sign out · Delete account
 *   Support   Contact us · Privacy policy
 */

import { useAuth, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import GetToKnowYou from "./GetToKnowYou";
import OverlaySheet from "./OverlaySheet";
import SignInSheet from "./SignInSheet";
import { Btn, pickLanguage } from "./ui";
import { accountsEnabled, deleteAccount, syncWalks } from "@/lib/accounts";
import { BASE } from "@/lib/api";
import { forgetWelcome } from "@/lib/auth";
import type { WalkRecord } from "@/lib/history";
import { languageName } from "@/lib/languages";
import { profileOf } from "@/lib/profile";
import { colors, fonts, radius, size, surface, type } from "@/lib/theme";

const CONTACT = "jurajkolesar1976@gmail.com";

const ICONS = {
  profile: "person",
  language: "globe",
  signOut: "rectangle.portrait.and.arrow.right",
  delete: "trash",
  contact: "envelope",
  privacy: "hand.raised",
} as const;

function Row({
  icon,
  label,
  detail,
  danger,
  onPress,
}: {
  icon: keyof typeof ICONS;
  label: string;
  detail?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const tint = danger ? colors.danger : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <SymbolView name={{ ios: ICONS[icon], android: "circle", web: "circle" } as never} size={20} tintColor={tint} />
      <Text numberOfLines={1} style={[styles.label, { color: tint }]}>
        {label}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={styles.detail}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.section}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ account }: { account: ReactNode }) {
  return (
    <View style={[surface.card, styles.card]}>
      <Section title="Account">{account}</Section>
      <View style={styles.rule} />
      <Section title="Support">
        <Row icon="contact" label="Contact us" onPress={() => void Linking.openURL(`mailto:${CONTACT}?subject=Walk`)} />
        <Row icon="privacy" label="Privacy policy" onPress={() => void Linking.openURL(`${BASE}/privacy`)} />
      </Section>
    </View>
  );
}

function WithAccount({ language, onWalks }: { language: ReactNode; onWalks: (walks: WalkRecord[]) => void }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn, signOut } = useAuth();
  const [sheet, setSheet] = useState<"signIn" | "profile" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in: bring this phone's walks and the account's together, once.
  const synced = useRef(false);
  useEffect(() => {
    if (!isSignedIn || synced.current) return;
    synced.current = true;
    void syncWalks().then((walks) => walks && onWalks(walks));
  }, [isSignedIn, onWalks]);

  /** Out, and back through the front door. */
  const leave = async () => {
    forgetWelcome();
    await signOut();
    router.replace("/welcome");
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await deleteAccount())) throw new Error();
      setSheet(null);
      await leave();
    } catch {
      setError("The account could not be deleted. Try again, or write to us from Contact us.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => setSheet(null);
  const name = profileOf(user).name;
  const email = user?.primaryEmailAddress?.emailAddress;

  const account = !isLoaded ? null : isSignedIn ? (
    <>
      <Row icon="profile" label="Profile" detail={name ?? email} onPress={() => setSheet("profile")} />
      {language}
      <Row icon="signOut" label="Sign out" onPress={() => void leave()} />
      <Row icon="delete" label="Delete account" danger onPress={() => setSheet("delete")} />
    </>
  ) : (
    <>
      <Row icon="profile" label="Sign in" onPress={() => setSheet("signIn")} />
      {language}
    </>
  );

  return (
    <>
      <Card account={account} />
      <OverlaySheet open={sheet === "signIn"} onClose={close}>
        <SignInSheet onDone={close} onClose={close} />
      </OverlaySheet>
      <OverlaySheet open={sheet === "profile"} onClose={close}>
        {/* Remounted on each open, so it starts from what the account holds now. */}
        {sheet === "profile" ? <GetToKnowYou onDone={close} /> : <View />}
      </OverlaySheet>
      <OverlaySheet open={sheet === "delete"} onClose={close}>
        <View style={{ gap: 12 }}>
          <Text style={type.h3}>Delete your account?</Text>
          <Text style={type.body}>
            This deletes your account and the walks kept with it, everywhere. Walks on this phone stay until you delete
            them on the Tours tab.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Btn variant="dark" large label={busy ? "Deleting…" : "Delete account"} disabled={busy} onPress={() => void remove()} />
          <Btn label="Keep it" onPress={close} />
        </View>
      </OverlaySheet>
    </>
  );
}

export default function AccountMenu({
  lang,
  onLang,
  onWalks,
}: {
  lang: string;
  onLang: (code: string) => void;
  /** The account's walks, merged in after signing in, for the totals above. */
  onWalks: (walks: WalkRecord[]) => void;
}) {
  const language = <Row icon="language" label="Language" detail={languageName(lang)} onPress={() => pickLanguage("Language", onLang)} />;
  return accountsEnabled ? <WithAccount language={language} onWalks={onWalks} /> : <Card account={language} />;
}

const styles = StyleSheet.create({
  card: { padding: 8, gap: 8 },
  section: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, fontFamily: fonts.displayMedium, fontSize: size.caption, color: colors.inkMute },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: radius.control },
  rowPressed: { backgroundColor: colors.canvas },
  label: { flex: 1, fontFamily: fonts.displayMedium, fontSize: size.body },
  detail: { maxWidth: "45%", fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: 12 },
  error: { fontFamily: fonts.body, fontSize: size.caption, color: colors.danger },
});

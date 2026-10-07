/**
 * The account card on the Account tab — the website's components/Account.tsx.
 *
 * Signing in only keeps walks in step between this phone and the website.
 * Deleting the account deletes what was kept for it, then the account itself,
 * from inside the app, as Apple requires.
 */

import { useAuth, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SignInSheet, { sheetChrome } from "@/components/SignInSheet";
import { Btn, Eyebrow, TextLink } from "@/components/ui";
import { deleteAccount, syncWalks } from "@/lib/accounts";
import { forgetWelcome } from "@/lib/auth";
import type { WalkRecord } from "@/lib/history";
import { colors, fonts, radius, size, surface, type } from "@/lib/theme";

export default function Account({ onWalks }: { onWalks: (walks: WalkRecord[]) => void }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn, signOut } = useAuth();
  /** Out, and back through the front door. */
  const leave = async () => {
    forgetWelcome();
    await signOut();
    router.replace("/welcome");
  };
  const [confirming, setConfirming] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in: bring this phone's walks and the account's together, once.
  const synced = useRef(false);
  useEffect(() => {
    if (!isSignedIn || synced.current) return;
    synced.current = true;
    void syncWalks().then((walks) => walks && onWalks(walks));
  }, [isSignedIn, onWalks]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <View style={styles.card}>
        <Text style={type.h3}>Account</Text>
        <Text style={type.caption}>
          Sign in to keep your walks on this iPhone and the website alike. Everything else works without it.
        </Text>
        <Btn variant="primary" label="Sign in with email" onPress={() => setSigningIn(true)} />
        {/* The welcome screen's own sheet, over the Account tab; signing in keeps you here. */}
        <Modal visible={signingIn} transparent animationType="slide" onRequestClose={() => setSigningIn(false)}>
          <Pressable style={styles.backdrop} onPress={() => setSigningIn(false)} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[sheetChrome.panel, { paddingBottom: Math.max(24, insets.bottom + 8) }]}>
              <View style={sheetChrome.grabber} />
              <SignInSheet onDone={() => setSigningIn(false)} onClose={() => setSigningIn(false)} />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await deleteAccount())) throw new Error();
      await leave();
    } catch {
      setError("The account could not be deleted. Try again, or write to the address on the privacy page.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={type.h3}>Account</Text>
      <View>
        <Eyebrow>Signed in as</Eyebrow>
        <Text numberOfLines={1} style={styles.email}>
          {user?.primaryEmailAddress?.emailAddress}
        </Text>
      </View>
      <Text style={type.caption}>Your walks are kept with your account, so they are here and on the website.</Text>
      <Btn label="Sign out" onPress={() => void leave()} />
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={[type.caption, { color: colors.inkSoft }]}>
            This deletes your account and the walks kept with it, everywhere. Walks on this phone stay until you
            delete them here.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Btn label="Keep it" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
            <Btn variant="dark" label={busy ? "Deleting…" : "Delete"} disabled={busy} onPress={() => void remove()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <TextLink label="Delete account" onPress={() => setConfirming(true)} style={{ alignSelf: "flex-start" }} />
      )}
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  card: { ...surface.card, gap: 12 },
  email: { marginTop: 4, fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  confirm: { backgroundColor: "#fef2f2", borderRadius: radius.control, padding: 12 },
});

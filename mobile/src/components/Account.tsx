/**
 * The account card on the profile — the website's components/Account.tsx.
 *
 * Signing in only keeps walks in step between this phone and the website.
 * Deleting the account deletes what was kept for it, then the account itself,
 * from inside the app, as Apple requires.
 */

import { useAuth, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Btn, Eyebrow, TextLink } from "@/components/ui";
import { BASE } from "@/lib/api";
import { loadWalks, mergeWalks, type WalkRecord } from "@/lib/history";
import { colors, fonts, radius, size, type } from "@/lib/theme";

/** A request to the website's /api/me routes, signed with this phone's session. */
export function useMe() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${BASE}/api/me${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
    },
    [getToken],
  );
}

export default function Account({
  onWalks,
  bindForget,
}: {
  onWalks: (walks: WalkRecord[]) => void;
  /** Hands the profile a way to forget a walk on the account too. */
  bindForget: (forget: ((at: number) => void) | null) => void;
}) {
  const { user, isLoaded } = useUser();
  const { isSignedIn, signOut } = useAuth();
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in: bring this phone's walks and the account's together, once.
  const synced = useRef(false);
  useEffect(() => {
    if (!isSignedIn || synced.current) return;
    synced.current = true;
    void (async () => {
      try {
        const res = await me("/walks", { method: "POST", body: JSON.stringify({ walks: loadWalks() }) });
        if (!res.ok) return;
        const body = (await res.json()) as { walks?: WalkRecord[] };
        onWalks(mergeWalks(body.walks ?? []));
      } catch {
        /* offline: they sync next time */
      }
    })();
  }, [isSignedIn, me, onWalks]);

  useEffect(() => {
    bindForget(isSignedIn ? (at) => void me(`/walks?at=${at}`, { method: "DELETE" }).catch(() => {}) : null);
    return () => bindForget(null);
  }, [isSignedIn, me, bindForget]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <View style={styles.card}>
        <Text style={type.h3}>Account</Text>
        <Text style={type.caption}>
          Sign in to keep your walks on this iPhone and the website alike. Everything else works without it.
        </Text>
        <Btn variant="primary" label="Sign in with email" onPress={() => router.push({ pathname: "/welcome", params: { sheet: "1" } })} />
      </View>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await me("", { method: "DELETE" });
      if (!res.ok) throw new Error();
      await signOut();
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
      <Btn label="Sign out" onPress={() => void signOut()} />
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
  card: { gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 },
  email: { marginTop: 4, fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  confirm: { backgroundColor: "#fef2f2", borderRadius: radius.control, padding: 12 },
});

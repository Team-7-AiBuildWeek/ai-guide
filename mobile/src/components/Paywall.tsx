/**
 * The paywall on the phone — the website's components/Paywall.tsx: why, then
 * what to buy. Buying opens Stripe in an in-app browser (lib/billing.ts); when
 * it closes, the caller re-reads what the account has.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import OverlaySheet from "./OverlaySheet";
import { Btn } from "./ui";
import { buy, PRODUCTS, type ProductId } from "@/lib/billing";
import { colors, fonts, radius, size, type } from "@/lib/theme";

const WHY: Record<string, { title: string; body: string }> = {
  signin_for_free: { title: "Sign in for your free walk", body: "A few free walks were already taken from this connection today. Sign in on the Account tab and your first walk is free." },
  signin: { title: "You've had your free walk", body: "Sign in on the Account tab to get more walks — they work on the website too." },
  no_walks: { title: "Ready for another walk?", body: "Pick what suits your trip. Every walk is built just for you." },
  fair_use_pass: { title: "That's today's walks on your pass", body: "Your pass includes three walks a day. A single walk adds one now." },
  fair_use_annual: { title: "That's this month's walks", body: "Your plan includes ten walks a month. A single walk adds one more." },
};

export default function Paywall({
  open,
  reason,
  signedIn,
  onClose,
  onBought,
}: {
  open: boolean;
  reason: string | null;
  signedIn: boolean;
  onClose: () => void;
  /** The browser closed: re-read what the account has. */
  onBought: () => void;
}) {
  const [busy, setBusy] = useState<ProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const why = WHY[reason ?? "no_walks"] ?? WHY.no_walks;
  const offers = reason === "fair_use_pass" || reason === "fair_use_annual" ? PRODUCTS.filter((p) => p.id === "single") : PRODUCTS;

  const pick = async (id: ProductId) => {
    setBusy(id);
    setError(null);
    try {
      await buy(id);
      onBought();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout isn't available right now.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <OverlaySheet open={open} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={type.h3}>{why.title}</Text>
          <Text style={styles.body}>{why.body}</Text>
        </View>
        {signedIn
          ? offers.map((p) => (
              <Pressable
                key={p.id}
                disabled={busy !== null}
                onPress={() => void pick(p.id)}
                style={({ pressed }) => [styles.offer, (pressed || busy === p.id) && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${p.price}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.caption}>{p.detail}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.name}>{busy === p.id ? "Opening…" : p.price}</Text>
                  <Text style={styles.caption}>{p.perWalk}</Text>
                </View>
              </Pressable>
            ))
          : null}
        {error ? <Text style={[styles.caption, { color: colors.danger }]}>{error}</Text> : null}
        <Text style={styles.caption}>
          {signedIn ? "Prices include VAT. Paid securely with Stripe. " : ""}Walking one of your tours again is always free.
        </Text>
        <Btn label="Not now" onPress={onClose} />
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.body, fontSize: size.body, lineHeight: size.body * 1.5, color: colors.inkSoft },
  offer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  name: { fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  caption: { fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute },
});

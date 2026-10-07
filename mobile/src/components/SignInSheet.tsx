/**
 * Signing in: an email, a six-digit code, and for a new account the two
 * get-to-know-you questions. The same sheet wherever it is opened from — the
 * welcome screen, or "Sign in" on the Account tab.
 */

import { useClerk } from "@clerk/expo";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import GetToKnowYou from "@/components/GetToKnowYou";
import { Btn, Field, TextLink } from "@/components/ui";
import { useEmailCode } from "@/lib/auth";
import { applyPrefs, profileOf } from "@/lib/profile";
import { colors, fonts, radius, shadow, size, type } from "@/lib/theme";

export default function SignInSheet({
  onDone,
  onClose,
  onSkip,
}: {
  onDone: () => void;
  onClose: () => void;
  /** The welcome screen's way past without an account; absent where you are already in. */
  onSkip?: () => void;
}) {
  const auth = useEmailCode();
  const clerk = useClerk();
  /** Signed in, and new: the two get-to-know-you questions before the map. */
  const [gettingToKnow, setGettingToKnow] = useState(false);

  const check = async (value: string) => {
    if (!(await auth.verify(value))) return;
    const profile = profileOf(clerk.user);
    if (profile.onboarded) {
      // Back on a new phone: take what they told us last time and go.
      applyPrefs(profile.prefs);
      onDone();
    } else {
      setGettingToKnow(true);
    }
  };
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  if (gettingToKnow) return <GetToKnowYou onDone={onDone} />;

  if (auth.step === "code") {
    return (
      <View style={{ gap: 12 }}>
        <Text style={type.h3}>Check your email</Text>
        <Text style={type.body}>
          We sent a 6-digit code to <Text style={{ fontFamily: fonts.bodySemi, color: colors.ink }}>{auth.email}</Text>.
        </Text>
        <Field
          value={code}
          onChangeText={(c) => {
            setCode(c);
            if (c.replace(/\D/g, "").length === 6) void check(c);
          }}
          placeholder="000000"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          style={styles.code}
          accessibilityLabel="Six-digit code"
        />
        {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
        <Btn
          variant="primary"
          large
          label={auth.busy ? "Checking…" : "Continue"}
          disabled={auth.busy || code.replace(/\D/g, "").length < 6}
          onPress={() => void check(code)}
        />
        <View style={styles.links}>
          <TextLink label="Send a new code" onPress={() => void auth.resend()} />
          <TextLink
            label="Use a different email"
            onPress={() => {
              setCode("");
              auth.restart();
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sheetTop}>
        <View style={styles.badge}>
          <Image source={require("../../assets/logo.png")} style={styles.badgeLogo} />
        </View>
        <Btn label="✕" onPress={onClose} accessibilityLabel="Close" />
      </View>
      <Text style={type.h3}>Get started</Text>
      <Text style={type.body}>Keep your walks and pick them up on any device — this iPhone or the website.</Text>
      <Field
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => void auth.send(email)}
        style={{ minHeight: 52 }}
        accessibilityLabel="Email address"
      />
      {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
      <Btn
        variant="primary"
        large
        label={auth.busy ? "Sending…" : "Continue with email"}
        disabled={auth.busy || !email.includes("@")}
        onPress={() => void auth.send(email)}
      />
      {onSkip ? <TextLink label="Continue without an account" onPress={onSkip} /> : null}
    </View>
  );
}

/** The sheet's own look — the map's sheet: rounded on top, a hairline, the lifted shadow. */
export const sheetChrome = StyleSheet.create({
  /** The map's sheet: rounded on top, a hairline, the lifted shadow. */
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 0,
    ...shadow.lift,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginVertical: 12 },
});

const styles = StyleSheet.create({
  sheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.mintWash, alignItems: "center", justifyContent: "center" },
  badgeLogo: { width: 40, height: 40, borderRadius: 10 },
  code: { minHeight: 60, fontFamily: fonts.display, fontSize: 28, letterSpacing: 10, textAlign: "center" },
  error: { fontFamily: fonts.body, fontSize: size.caption, color: colors.danger },
  links: { flexDirection: "row", justifyContent: "space-between" },
});

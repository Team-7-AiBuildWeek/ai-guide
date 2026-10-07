/**
 * Sign-in with an emailed code, and nothing else: no passwords.
 *
 * One flow for new and returning walkers alike. The address is tried as a
 * sign-in first; when Clerk does not know it, the same address becomes a
 * sign-up. Either way the walker types a six-digit code and is in.
 *
 * Accounts are optional. Everything in Walk works signed out; signing in only
 * keeps past walks and settings in step between the website and the phone.
 */

import { useSignIn, useSignUp } from "@clerk/expo";
import { useState } from "react";
import { accountsEnabled } from "./accounts";
import { readJson, writeJson } from "./store";

const WELCOME_KEY = "welcome-v1";

/** Through the welcome screen since the app was opened. */
let passedThisLaunch = false;

/**
 * Whether this walker may skip the welcome screen. With accounts, a signed-out
 * walker goes through it every time the app is opened (signed in, they never
 * see it — see the tabs' layout); without accounts, once is enough.
 */
export function welcomed(): boolean {
  return passedThisLaunch || (!accountsEnabled && readJson<{ at: number }>(WELCOME_KEY) !== null);
}

export function markWelcomed() {
  passedThisLaunch = true;
  writeJson(WELCOME_KEY, { at: Date.now() });
}

/** Signing out sends the walker back through the front door. */
export function forgetWelcome() {
  passedThisLaunch = false;
}

/**
 * Kept in step with lib/accounts/client.ts (the two apps cannot share a module yet).
 *
 * Clerk's errors carry the useful part one level down: an API error's own code
 * is generic, and the field's code and sentence are in `errors[0]`.
 */
type ClerkErr = {
  code?: string;
  longMessage?: string;
  errors?: { code?: string; longMessage?: string; message?: string }[];
} | null;

function codeOf(err: ClerkErr): string | undefined {
  return err?.errors?.[0]?.code ?? err?.code;
}

function say(err: ClerkErr, fallback: string): string {
  if (!err) return fallback;
  const code = codeOf(err);
  if (code === "form_code_incorrect") return "That code is not right. Check the email and try again.";
  if (code === "verification_expired") return "That code has expired. Ask for a new one.";
  if (code === "form_param_format_invalid") return "That does not look like an email address.";
  return err.errors?.[0]?.longMessage ?? err.longMessage ?? fallback;
}

export type EmailCode = {
  step: "email" | "code";
  email: string;
  busy: boolean;
  error: string | null;
  send: (email: string) => Promise<void>;
  verify: (code: string) => Promise<boolean>;
  resend: () => Promise<void>;
  restart: () => void;
};

export function useEmailCode(): EmailCode {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<"email" | "code">("email");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (address: string) => {
    const clean = address.trim().toLowerCase();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const tried = await signIn.emailCode.sendCode({ emailAddress: clean });
      if (!tried.error) {
        setMode("in");
      } else if (codeOf(tried.error) === "form_identifier_not_found") {
        // A new walker: the same address, as a sign-up.
        const made = await signUp.create({ emailAddress: clean });
        if (made.error) return setError(say(made.error, "Could not start with that address."));
        const sent = await signUp.verifications.sendEmailCode();
        if (sent.error) return setError(say(sent.error, "Could not send the code."));
        setMode("up");
      } else {
        return setError(say(tried.error, "Could not send the code."));
      }
      setEmail(clean);
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string): Promise<boolean> => {
    const clean = code.replace(/\D/g, "");
    if (clean.length < 6) return false;
    setBusy(true);
    setError(null);
    try {
      if (mode === "in") {
        const checked = await signIn.emailCode.verifyCode({ code: clean });
        if (checked.error) return (setError(say(checked.error, "Could not check the code.")), false);
        if (signIn.status !== "complete") return (setError("Signing in needs another step this app cannot do yet."), false);
        const done = await signIn.finalize();
        if (done.error) return (setError(say(done.error, "Could not sign you in.")), false);
      } else {
        const checked = await signUp.verifications.verifyEmailCode({ code: clean });
        if (checked.error) return (setError(say(checked.error, "Could not check the code.")), false);
        if (signUp.status !== "complete") return (setError("Creating the account needs another step this app cannot do yet."), false);
        const done = await signUp.finalize();
        if (done.error) return (setError(say(done.error, "Could not create your account.")), false);
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    const sent = mode === "in" ? await signIn.emailCode.sendCode() : await signUp.verifications.sendEmailCode();
    if (sent.error) setError(say(sent.error, "Could not send a new code."));
  };

  return {
    step,
    email,
    busy,
    error,
    send,
    verify,
    resend,
    restart: () => {
      setStep("email");
      setError(null);
    },
  };
}

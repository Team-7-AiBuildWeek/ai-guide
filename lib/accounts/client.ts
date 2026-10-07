"use client";

/**
 * Accounts in the browser: sign-in with an emailed code, and keeping walks in
 * step with the phone. The same flow as the iPhone app (mobile/src/lib/auth.ts).
 *
 * Accounts are optional. Without Clerk's publishable key the site runs as it
 * always has, and nothing here is reached.
 */

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { useState } from "react";
import { mergeWalks, type WalkRecord } from "@/lib/tour/history";

export const accountsEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Whether this visitor has been through the welcome screen.
 *
 * With accounts, a signed-out visitor goes through it on every visit (this
 * browser session); a signed-in one never needs to — see WelcomeGate. Without
 * accounts there is nothing to sign in to, so once is enough.
 */
const WELCOME_SESSION_KEY = "btour:welcome:session";
const WELCOME_KEY = "btour:welcome:v1";

export function welcomed(): boolean {
  try {
    return accountsEnabled
      ? sessionStorage.getItem(WELCOME_SESSION_KEY) !== null
      : localStorage.getItem(WELCOME_KEY) !== null;
  } catch {
    return true; // storage unavailable: never trap anyone on the welcome screen
  }
}

export function markWelcomed() {
  try {
    sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
    localStorage.setItem(WELCOME_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/** Signing out sends the walker back through the front door. */
export function forgetWelcome() {
  try {
    sessionStorage.removeItem(WELCOME_SESSION_KEY);
  } catch {
    /* private mode */
  }
}

// ------------------------------------------------------------- syncing --

/** Sends this browser's walks, takes back the account's, keeps the union. */
export async function syncWalks(local: WalkRecord[]): Promise<WalkRecord[] | null> {
  try {
    const res = await fetch("/api/me/walks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walks: local }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { walks?: WalkRecord[] };
    return mergeWalks(body.walks ?? []);
  } catch {
    return null;
  }
}

export async function forgetWalkEverywhere(at: number): Promise<void> {
  try {
    await fetch(`/api/me/walks?at=${at}`, { method: "DELETE" });
  } catch {
    /* offline: it stays deleted here, and is gone from the account next time */
  }
}

export async function deleteAccount(): Promise<boolean> {
  const res = await fetch("/api/me", { method: "DELETE" });
  return res.ok;
}

// ------------------------------------------------------- email and code --

/**
 * Kept in step with mobile/src/lib/auth.ts (the two apps cannot share a module yet).
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

export function useEmailCode() {
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
      const flow = mode === "in" ? signIn : signUp;
      const checked =
        mode === "in"
          ? await signIn.emailCode.verifyCode({ code: clean })
          : await signUp.verifications.verifyEmailCode({ code: clean });
      if (checked.error) return (setError(say(checked.error, "Could not check the code.")), false);
      if (flow.status !== "complete") return (setError("Signing in needs another step this site cannot do yet."), false);
      const done = await flow.finalize();
      if (done.error) return (setError(say(done.error, "Could not sign you in.")), false);
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

  return { step, email, busy, error, send, verify, resend, restart: () => (setStep("email"), setError(null)) };
}

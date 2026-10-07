"use client";

/**
 * Signing in: an email, a six-digit code, and for a new account the two
 * get-to-know-you questions. The same sheet wherever it is opened from — the
 * welcome screen, or "Sign in" on the Account tab.
 */

import { useClerk } from "@clerk/nextjs";
import Image from "next/image";
import { useState } from "react";
import GetToKnowYou from "./GetToKnowYou";
import { syncWalks, useEmailCode } from "@/lib/accounts/client";
import { applyPrefs, profileOf } from "@/lib/accounts/profile";
import { loadWalks } from "@/lib/tour/history";

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
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /** Signed in, and new: the two get-to-know-you questions before the map. */
  const [gettingToKnow, setGettingToKnow] = useState(false);

  const check = async (value: string) => {
    if (!(await auth.verify(value))) return;
    // In the background: moving on should not wait for the account's walks.
    void syncWalks(loadWalks());
    const profile = profileOf(clerk.user);
    if (profile.onboarded) {
      // Back on a new device: take what they told us last time and go.
      applyPrefs(profile.prefs);
      onDone();
    } else {
      setGettingToKnow(true);
    }
  };

  if (gettingToKnow) return <GetToKnowYou onDone={onDone} />;

  if (auth.step === "code") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void check(code);
        }}
      >
        <h2 className="text-[length:var(--text-h3)]">Check your email</h2>
        <p>
          We sent a 6-digit code to <strong className="text-[color:var(--ink)]">{auth.email}</strong>.
        </p>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (e.target.value.replace(/\D/g, "").length === 6) void check(e.target.value);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          placeholder="000000"
          aria-label="Six-digit code"
          className="min-h-[60px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-center font-[family-name:var(--font-display)] text-[28px] tracking-[0.4em] text-[color:var(--ink)]"
        />
        {auth.error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{auth.error}</p> : null}
        <button type="submit" disabled={auth.busy || code.replace(/\D/g, "").length < 6} className="btn btn--primary btn--lg w-full">
          {auth.busy ? "Checking…" : "Continue"}
        </button>
        <div className="flex justify-between">
          <button type="button" onClick={() => void auth.resend()} className="min-h-[44px] font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setCode("");
              auth.restart();
            }}
            className="min-h-[44px] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void auth.send(email);
      }}
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--mint-wash)]">
          <Image src="/icons/icon-512.png" alt="" width={40} height={40} className="rounded-[10px]" />
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="btn btn--quiet shrink-0 px-4">
          ✕
        </button>
      </div>
      <h2 className="text-[length:var(--text-h3)]">Get started</h2>
      <p>Keep your walks and pick them up on any device — this browser or the iPhone app.</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="you@example.com"
        aria-label="Email address"
        className="min-h-[52px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
      />
      {auth.error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{auth.error}</p> : null}
      <button type="submit" disabled={auth.busy || !email.includes("@")} className="btn btn--primary btn--lg w-full">
        {auth.busy ? "Sending…" : "Continue with email"}
      </button>
      {onSkip ? (
        <button type="button" onClick={onSkip} className="min-h-[44px] self-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
          Continue without an account
        </button>
      ) : null}
      {/* Clerk's bot check renders here when it needs to. */}
      <div id="clerk-captcha" />
    </form>
  );
}

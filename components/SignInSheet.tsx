"use client";

/**
 * Signing in: an email, a six-digit code, and for a new account the two
 * get-to-know-you questions. The same sheet wherever it is opened from — the
 * welcome screen, or "Sign in" on the Account tab.
 */

import { useClerk } from "@clerk/nextjs";
import Image from "next/image";
import { useState } from "react";
import CodeSlots, { type CodeStatus } from "./CodeSlots";
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
  /** What the code slots show: typing, a wrong code draining away, or the tick. */
  const [codeStatus, setCodeStatus] = useState<CodeStatus>("idle");
  /** Signed in, and new: the two get-to-know-you questions before the map. */
  const [gettingToKnow, setGettingToKnow] = useState(false);

  const check = async (value: string) => {
    if (!(await auth.verify(value))) {
      setCodeStatus("error");
      return;
    }
    // Long enough to see the tick land before the sheet moves on.
    setCodeStatus("success");
    await new Promise((r) => setTimeout(r, 650));
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
        <div className="flex justify-center py-1">
          <CodeSlots
            length={6}
            value={code}
            status={codeStatus}
            onChange={(next) => {
              setCode(next);
              // A wrong code clears itself when it has drained; typing again starts afresh.
              if (next && codeStatus === "error") setCodeStatus("idle");
            }}
            onComplete={(full) => void check(full)}
            autoFocus
            disabled={auth.busy && codeStatus === "idle"}
            ariaLabel="Six-digit code"
            accentColor="#5eda9b"
            inkColor="#111827"
            slotColor="#f3f4f6"
            digitColor="#111827"
            dangerColor="#b91c1c"
            slotSize={46}
            gap={8}
            radius={12}
          />
        </div>
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
              setCodeStatus("idle");
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

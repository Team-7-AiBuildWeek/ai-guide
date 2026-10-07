"use client";

/**
 * The first screen: what Walk is, and a way in — the same screen as the iPhone
 * app's (mobile/src/app/welcome.tsx).
 *
 * Laid out like Luma's welcome — things orbiting a mark, a two-line promise, one
 * button — in the site's own language: the plain canvas, white surfaces with a
 * hairline, mint as the one fill, and the same sheet that slides over the map.
 * "Get started" lifts it: an email and a six-digit code.
 * Signing in is never required; the sheet always offers the way past it.
 */

import { useClerk } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountsEnabled, markWelcomed, syncWalks, useEmailCode } from "@/lib/accounts/client";
import GetToKnowYou from "./GetToKnowYou";
import { applyPrefs, profileOf } from "@/lib/accounts/profile";
import { loadWalks } from "@/lib/tour/history";

type Orbiter = { icon: string; bg: string; size: number; angle: number };

const INNER: Orbiter[] = [
  { icon: "🏛", bg: "var(--surface)", size: 64, angle: 200 },
  { icon: "🎧", bg: "var(--mint-wash)", size: 60, angle: 330 },
  { icon: "📍", bg: "var(--surface)", size: 58, angle: 80 },
];
const OUTER: Orbiter[] = [
  { icon: "🏰", bg: "var(--mint-wash)", size: 70, angle: 15 },
  { icon: "🎨", bg: "var(--surface)", size: 62, angle: 95 },
  { icon: "🗺", bg: "var(--surface)", size: 66, angle: 160 },
  { icon: "☕", bg: "var(--mint-wash)", size: 58, angle: 235 },
  { icon: "🎵", bg: "var(--surface)", size: 60, angle: 300 },
];

function Ring({ r, items, reverse }: { r: number; items: Orbiter[]; reverse?: boolean }) {
  return (
    <div
      className={`welcome-ring ${reverse ? "welcome-ring--reverse" : ""}`}
      style={{ width: `${r * 2}vmin`, height: `${r * 2}vmin`, marginLeft: `${-r}vmin`, marginTop: `${-r}vmin` }}
    >
      {items.map((o) => {
        const a = (o.angle * Math.PI) / 180;
        return (
          <span
            key={o.icon}
            aria-hidden="true"
            className="welcome-orbiter"
            style={{
              width: o.size,
              height: o.size,
              background: o.bg,
              fontSize: o.size * 0.5,
              left: `calc(${r + r * Math.cos(a)}vmin - ${o.size / 2}px)`,
              top: `calc(${r + r * Math.sin(a)}vmin - ${o.size / 2}px)`,
            }}
          >
            {o.icon}
          </span>
        );
      })}
    </div>
  );
}

function SignInSheet({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const auth = useEmailCode();
  const clerk = useClerk();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /** Signed in, and new: the two get-to-know-you questions before the map. */
  const [gettingToKnow, setGettingToKnow] = useState(false);

  const check = async (value: string) => {
    if (!(await auth.verify(value))) return;
    await syncWalks(loadWalks());
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
      <button type="button" onClick={onDone} className="min-h-[44px] self-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
        Continue without an account
      </button>
      {/* Clerk's bot check renders here when it needs to. */}
      <div id="clerk-captcha" />
    </form>
  );
}

export default function Welcome({ openSheet = false }: { openSheet?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(openSheet);

  const finish = () => {
    markWelcomed();
    router.replace("/");
  };

  return (
    <main className={`welcome ${open ? "welcome--open" : ""}`}>
      <div className="welcome-orbit" aria-hidden="true">
        <div className="welcome-ring welcome-ring--still" style={{ width: "130vmin", height: "130vmin", marginLeft: "-65vmin", marginTop: "-65vmin" }} />
        <Ring r={43} items={OUTER} reverse />
        <Ring r={27} items={INNER} />
        <div className="welcome-core">
          <Image src="/icons/icon-512.png" alt="" width={64} height={64} priority className="rounded-[16px]" />
        </div>
      </div>

      <div className="welcome-copy">
        <p className="welcome-wordmark">
          walk<span aria-hidden="true" />
        </p>
        <h1>
          Audio tours anywhere
          <span className="block text-[color:var(--mint-ink)]">Start walking</span>
        </h1>
        <button
          type="button"
          onClick={() => (accountsEnabled ? setOpen(true) : finish())}
          className="btn btn--primary btn--lg mt-8 w-full"
        >
          Get started
        </button>
      </div>

      {accountsEnabled ? (
        <div className="welcome-sheet" role="dialog" aria-modal="true" aria-label="Get started" aria-hidden={!open} inert={!open}>
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--line-strong)]" />
          <SignInSheet onDone={finish} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </main>
  );
}

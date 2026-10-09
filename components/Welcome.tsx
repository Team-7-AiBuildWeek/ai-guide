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

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SignInSheet from "./SignInSheet";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { accountsEnabled, markWelcomed } from "@/lib/accounts/client";

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

export default function Welcome({ openSheet = false }: { openSheet?: boolean }) {
  const keyboard = useKeyboardInset();
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
        <div
          className="welcome-sheet t-panel-slide"
          data-open={open}
          role="dialog"
          aria-modal="true"
          aria-label="Get started"
          aria-hidden={!open}
          inert={!open}
          // Above the iPhone keyboard while the email or code is being typed.
          style={keyboard > 0 ? { position: "fixed", bottom: keyboard } : undefined}
        >
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--line-strong)]" />
          <SignInSheet onDone={finish} onSkip={finish} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </main>
  );
}

"use client";

/**
 * The app as it looks on a phone, on a big screen — developers only.
 *
 * The real app in a frame the size of an iPhone's screen: an iframe, so it gets
 * a phone-sized viewport of its own and every media query, `dvh` and fixed
 * sheet inside it behaves exactly as on the device. Pick a model, reload, or
 * open any path of the app in it.
 */

import Link from "next/link";
import { useState } from "react";
import { useDeveloper } from "@/lib/accounts/useDeveloper";

const PHONES = [
  { key: "se", name: "iPhone SE", w: 375, h: 667, notch: false },
  { key: "15", name: "iPhone 15", w: 393, h: 852, notch: true },
  { key: "max", name: "iPhone 15 Pro Max", w: 430, h: 932, notch: true },
] as const;

export default function PhoneViewPage() {
  const { developer } = useDeveloper();
  const [phone, setPhone] = useState<(typeof PHONES)[number]>(PHONES[1]);
  const [path, setPath] = useState("/");
  const [loaded, setLoaded] = useState("/");
  const [reloads, setReloads] = useState(0);

  if (!developer) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-[length:var(--text-h2)]">Developers only</h1>
        <p className="mt-2 text-[color:var(--ink-soft)]">Sign in with a developer account to use the phone view.</p>
        <Link href="/profile" className="btn btn--primary mt-4">
          Go to Account
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center gap-5 bg-[color:var(--dark)] px-4 py-6">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {PHONES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPhone(p)}
            className={`btn btn--small ${p.key === phone.key ? "btn--primary" : "btn--quiet"}`}
          >
            {p.name}
          </button>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setLoaded(path.startsWith("/") ? path : `/${path}`);
            setReloads((n) => n + 1);
          }}
        >
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label="Path to open"
            className="min-h-[36px] w-36 rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 text-[length:var(--text-caption)]"
          />
          <button type="submit" className="btn btn--quiet btn--small">
            Open
          </button>
        </form>
        <button type="button" onClick={() => setReloads((n) => n + 1)} className="btn btn--quiet btn--small">
          Reload
        </button>
        <Link href="/profile" className="btn btn--quiet btn--small">
          Exit
        </Link>
      </div>

      {/* The phone: a dark body, a rounded screen, a notch where the model has one. */}
      <div
        className="relative shrink-0 rounded-[56px] bg-black p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
        style={{ width: phone.w + 24, height: phone.h + 24 }}
      >
        <iframe
          key={`${phone.key}-${loaded}-${reloads}`}
          src={loaded}
          title={`WalkDots on ${phone.name}`}
          className="block h-full w-full overflow-hidden rounded-[44px] bg-white"
          style={{ width: phone.w, height: phone.h }}
          allow="geolocation; microphone; autoplay"
        />
        {phone.notch ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[22px] h-[30px] w-[110px] -translate-x-1/2 rounded-full bg-black"
          />
        ) : null}
      </div>

      <p className="text-[length:var(--text-caption)] text-[color:var(--on-dark-mute,#9ca3af)]">
        {phone.name} · {phone.w} × {phone.h} — the real app, signed in as you
      </p>
    </main>
  );
}

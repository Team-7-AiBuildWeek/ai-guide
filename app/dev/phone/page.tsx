"use client";

/**
 * The app as it looks on a phone, on a big screen — developers only.
 *
 * The real app in a frame the size of an iPhone's screen: an iframe, so it gets
 * a phone-sized viewport of its own and every media query, `dvh` and fixed
 * sheet inside it behaves as on the device.
 *
 * Edge to edge, like the installed app: the app fills the whole screen and
 * the status bar and home indicator are drawn over it. Inside a frame the
 * system's safe-area insets are zero, so the frame hands the app the device's
 * real ones through --safe-top / --safe-bottom (globals.css), and the map and
 * the splash run up under the clock while headings and buttons stay clear of
 * it. The whole phone is scaled to fit the window.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDeveloper } from "@/lib/accounts/useDeveloper";

const PHONES = [
  // Status bar and home-indicator heights are the devices' own safe areas.
  { key: "se", name: "iPhone SE", w: 375, h: 667, top: 20, bottom: 0, island: false },
  { key: "15", name: "iPhone 15", w: 393, h: 852, top: 54, bottom: 34, island: true },
  { key: "max", name: "iPhone 15 Pro Max", w: 430, h: 932, top: 54, bottom: 34, island: true },
] as const;

const BEZEL = 12;

/** Drawn over the app, in white with a difference blend so it reads on the dark splash and the light map alike. */
function StatusBar({ height, island }: { height: number; island: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-end justify-between px-7 pb-[6px] font-[family-name:var(--font-display)] text-[15px] font-semibold text-white mix-blend-difference"
      style={{ height }}
      aria-hidden="true"
    >
      <span className={island ? "pl-3" : ""}>9:41</span>

      <span className="flex items-center gap-[5px]">
        <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="6" rx="1" />
          <rect x="10" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="15" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <path d="M8 2.2c2.2 0 4.2.9 5.7 2.3l1.1-1.2C13 1.6 10.6.6 8 .6S3 1.6 1.2 3.3l1.1 1.2C3.8 3.1 5.8 2.2 8 2.2Zm0 3.2c1.3 0 2.5.5 3.4 1.3l1.1-1.2C11.3 4.4 9.7 3.8 8 3.8s-3.3.6-4.5 1.7l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3Zm0 3.2c-.5 0-1 .2-1.3.5L8 10.4l1.3-1.3c-.3-.3-.8-.5-1.3-.5Z" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="19" height="8" rx="2" fill="currentColor" />
          <rect x="24" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

export default function PhoneViewPage() {
  const { developer } = useDeveloper();
  const [phone, setPhone] = useState<(typeof PHONES)[number]>(PHONES[1]);
  const [path, setPath] = useState("/");
  const [loaded, setLoaded] = useState("/");
  const [reloads, setReloads] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // As big as fits the space under the controls, never bigger than life size.
  const outerW = phone.w + BEZEL * 2;
  const outerH = phone.h + BEZEL * 2;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientHeight - 24) / outerH, (el.clientWidth - 24) / outerW));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [outerW, outerH, developer]);

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
    <main className="flex h-[100dvh] flex-col items-center gap-3 overflow-hidden bg-[color:var(--dark)] px-4 py-3">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
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

      {/* Whatever height is left, the phone is scaled into. */}
      <div ref={stage} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div style={{ width: outerW * scale, height: outerH * scale }}>
          <div
            className="relative origin-top-left rounded-[56px] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
            style={{ width: outerW, height: outerH, padding: BEZEL, transform: `scale(${scale})` }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-[44px] bg-[color:var(--canvas)]">
              <iframe
                key={`${phone.key}-${loaded}-${reloads}`}
                src={loaded}
                title={`WalkDots on ${phone.name}`}
                className="absolute inset-0 block h-full w-full border-0"
                allow="geolocation; microphone; autoplay"
                onLoad={(e) => {
                  // Same origin, so the app's own variables can be set: the
                  // device's safe areas, re-applied on every full page load.
                  const root = e.currentTarget.contentDocument?.documentElement;
                  root?.style.setProperty("--safe-top", `${phone.top}px`);
                  root?.style.setProperty("--safe-bottom", `${phone.bottom}px`);
                }}
              />
              <StatusBar height={phone.top} island={phone.island} />
              {phone.island ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[11px] z-20 h-[35px] w-[124px] -translate-x-1/2 rounded-full bg-black"
                />
              ) : null}
              {phone.bottom ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[8px] left-1/2 z-10 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-white mix-blend-difference"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <p className="shrink-0 text-[length:var(--text-caption)] text-[#9ca3af]">
        {phone.name} · {phone.w} × {phone.h}
        {scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : ""} — the real app, signed in as you
      </p>
    </main>
  );
}

"use client";

/**
 * The developer panel, for developer accounts only (useDeveloper): a small
 * "DEV" tab on the left edge of the walk, opening a sheet with the tour's
 * details, what it roughly cost to make, what the server runs on, and every
 * stop to jump straight to — for checking a tour without walking it.
 */

import Link from "next/link";
import { useState } from "react";
import OverlaySheet from "./OverlaySheet";
import { useDeveloper } from "@/lib/accounts/useDeveloper";
import type { StoredTour } from "@/lib/tour/flow";
import { estimateTourCost, usd } from "@/lib/tour/cost";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[length:var(--text-caption)]">
      <span className="text-[color:var(--ink-mute)]">{label}</span>
      <span className="text-right font-medium text-[color:var(--ink)]">{value}</span>
    </div>
  );
}

export default function DevPanel({
  tour,
  currentIndex,
  onJump,
}: {
  tour: StoredTour;
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const { developer, info, tts } = useDeveloper();
  const [open, setOpen] = useState(false);
  if (!developer) return null;

  const req = tour.req;
  const cost = estimateTourCost(tour.plan.stops.length, req?.detail, { tts, lang: req?.lang });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-[var(--radius-control)] bg-[color:var(--ink)] px-2 py-3 font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.12em] text-white [writing-mode:vertical-rl]"
        aria-label="Developer panel"
      >
        DEV
      </button>
      <OverlaySheet open={open} onClose={() => setOpen(false)} label="Developer panel">
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <div>
            <p className="u-eyebrow">Developer · this tour</p>
            <h2 className="mt-1 text-[length:var(--text-h3)]">{tour.plan.title}</h2>
          </div>

          <div className="rounded-[var(--radius-control)] bg-[color:var(--canvas)] px-3 py-2">
            <Fact label="Stops" value={String(tour.plan.stops.length)} />
            <Fact label="Route" value={`${(tour.meters / 1000).toFixed(1)} km`} />
            {req ? (
              <>
                <Fact label="Asked for" value={`${req.durationMinutes} min · ${req.detail} · ${req.pace}`} />
                <Fact label="Interests" value={req.interests.join(", ") || "none"} />
                <Fact label="Language" value={req.lang} />
                {req.city ? <Fact label="City" value={req.city.name} /> : null}
                {req.freeText ? <Fact label="Typed" value={`“${req.freeText}”`} /> : null}
              </>
            ) : null}
            {tour.demo ? <Fact label="Source" value="Demo tour" /> : null}
          </div>

          <div className="rounded-[var(--radius-control)] bg-[color:var(--mint-wash)] px-3 py-2">
            <Fact label="Narration" value={`≈ ${Math.round(cost.audioMinutes)} min of audio`} />
            <Fact label="Writing" value={`≈ ${usd(cost.writing)}`} />
            <Fact label={`Voice (${cost.voiceName})`} value={`≈ ${usd(cost.voice)}`} />
            <Fact label="Cost to make" value={`≈ ${usd(cost.total)}`} />
            <p className="pt-1 text-[11px] text-[color:var(--ink-mute)]">
              Estimate at today&apos;s prices for the voice this language gets now; recordings
              already kept in R2 cost nothing.
            </p>
          </div>

          {info ? (
            <div className="rounded-[var(--radius-control)] bg-[color:var(--canvas)] px-3 py-2">
              {Object.entries(info).map(([k, v]) => (
                <Fact key={k} label={k[0].toUpperCase() + k.slice(1)} value={v} />
              ))}
            </div>
          ) : null}

          <div>
            <p className="u-eyebrow">Jump to a stop</p>
            <ol className="mt-2 flex flex-col gap-1">
              {tour.plan.stops.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onJump(i);
                      setOpen(false);
                    }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-[length:var(--text-caption)] ${
                      i === currentIndex ? "bg-[color:var(--mint)] font-semibold" : "hover:bg-[color:var(--canvas)]"
                    }`}
                  >
                    <span className="w-5 tabular-nums text-[color:var(--ink-mute)]">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.script ? <span className="text-[11px] text-[color:var(--mint-ink)]">written</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex gap-2">
            <Link href="/dev/tours" className="btn btn--quiet flex-1">
              Saved tours
            </Link>
            <Link href="/dev/phone" className="btn btn--quiet flex-1">
              Phone view
            </Link>
          </div>
        </div>
      </OverlaySheet>
    </>
  );
}

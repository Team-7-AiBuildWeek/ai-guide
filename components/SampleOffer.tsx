"use client";

/**
 * "Try a tour of Vienna" — the first thing after the welcome.
 *
 * People judge a guide by pointing it at a city they know, so the first offer
 * is a ready walk of theirs (lib/tour/sample.ts): the famous sights that prove
 * it knows the place, and a local secret or two as the surprise. The city is
 * the one their location says, or their connection's when location is off
 * (TourFlow decides). It opens at once when the city's sample exists, and is
 * written now — about a minute, once for everyone — when it does not.
 */

import { useEffect, useState } from "react";
import PlaceImage from "./PlaceImage";
import type { City } from "@/lib/providers/types";
import type { StoredTour } from "@/lib/tour/flow";
import { formatDistance } from "@/lib/tour/history";

type Load = { state: "loading" } | { state: "ready"; tour: StoredTour } | { state: "failed"; error: string };

export default function SampleOffer({
  open,
  city,
  cityUnknown = false,
  lang,
  onStart,
  onChooseCity,
  onClose,
}: {
  open: boolean;
  /** Null while it is still being worked out. */
  city: City | null;
  /** Neither the location nor the connection said where: ask for a city. */
  cityUnknown?: boolean;
  lang: string;
  onStart: (tour: StoredTour) => void;
  onChooseCity: () => void;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !city) return;
    const ctrl = new AbortController();
    queueMicrotask(() => setLoad({ state: "loading" }));
    const q = new URLSearchParams({ name: city.name, label: city.label, lat: String(city.lat), lng: String(city.lng), lang });
    fetch(`/api/sample?${q}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { tour?: StoredTour; error?: string };
        if (!res.ok || !body.tour) throw new Error(body.error ?? "The sample walk could not be made.");
        setLoad({ state: "ready", tour: body.tour });
      })
      .catch((err: Error) => {
        if (!ctrl.signal.aborted) setLoad({ state: "failed", error: err.message });
      });
    return () => ctrl.abort();
  }, [open, city, lang, attempt]);

  const tour = load.state === "ready" ? load.tour : null;
  const stops = tour?.plan.stops ?? [];
  const minutes = tour ? Math.round((tour.seconds || 0) / 60 + stops.length * 4) : 60;

  return (
    <div className="sample-offer" data-open={open} role="dialog" aria-modal="true" aria-label="Try a sample walk" aria-hidden={!open} inert={!open}>
      <div className="sample-offer__scrim" onClick={onClose} />
      <section className="sample-offer__card sheet--glass sheet--glass-read">
        {city ? (
          <PlaceImage
            place={{ name: city.name, lat: city.lat, lng: city.lng, lang, kind: "city" }}
            className="h-32 w-full rounded-[22px]"
            credit
          />
        ) : cityUnknown ? null : (
          <div className="h-32 w-full animate-pulse rounded-[22px] bg-[color:var(--line)]" />
        )}

        <p className="u-eyebrow mt-4">Try it on a city you know</p>
        <h2 className="mt-1 text-[clamp(1.7rem,7vw,2.1rem)] leading-[1.08] tracking-[-0.02em]">
          {city ? `Try a tour of ${city.name}` : cityUnknown ? "Try a tour of a city you know" : "Finding your city…"}
        </h2>
        <p className="mt-2 text-[color:var(--ink-soft)]">
          {tour
            ? `${stops.length} stops · about ${minutes} min · ${formatDistance(tour.meters)}. The famous sights, and a local secret or two. You don't need to be there — it plays stop after stop.`
            : "The famous sights, and a local secret or two. You don't need to be there."}
        </p>

        {tour ? (
          <ol className="sample-offer__stops">
            {stops.map((s, i) => (
              <li key={s.id ?? i}>
                <span className="sample-offer__num">{i + 1}</span>
                <span className="min-w-0 flex-1 leading-tight">{s.name}</span>
                {s.secret ? <span className="sample-offer__secret">Local secret</span> : null}
              </li>
            ))}
          </ol>
        ) : load.state === "failed" ? (
          <p className="mt-4 text-[color:var(--danger)]">{load.error}</p>
        ) : city ? (
          <p className="mt-4 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Getting the walk ready — the first time for {city.name} takes about a minute.
          </p>
        ) : null}

        <div className="sample-offer__actions">
          {cityUnknown && !city ? (
            <button type="button" onClick={onChooseCity} className="btn btn--primary btn--lg w-full">
              Choose a city
            </button>
          ) : load.state === "failed" ? (
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn btn--primary btn--lg w-full">
              Try again
            </button>
          ) : (
            <button
              type="button"
              disabled={!tour}
              onClick={() => tour && onStart(tour)}
              className="btn btn--primary btn--lg w-full"
            >
              {tour ? "Start the walk" : "Getting it ready…"}
            </button>
          )}
          {city ? (
            <button type="button" onClick={onChooseCity} className="btn btn--quiet w-full">
              Choose another city
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] font-[family-name:var(--font-display)] font-medium text-[color:var(--ink-soft)]"
          >
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}

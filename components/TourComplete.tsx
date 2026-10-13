"use client";

/**
 * The end of a walk — the moment it will be remembered by (the peak-end rule):
 * not a toast, a page. Your route drawn as a picture, what you did in numbers,
 * the places you saw, and something to do with it (share it, or walk
 * somewhere new). Strava's activity page and Polarsteps' trip summary are the
 * models; the look is the paywall hero's, so finishing feels like an occasion.
 *
 * It opens when the last stop is reached. The last stop's narration keeps
 * playing underneath — "Keep listening" just closes this.
 */

import { useMemo } from "react";
import PlaceImage from "./PlaceImage";
import type { StoredTour } from "@/lib/tour/flow";
import { formatDistance } from "@/lib/tour/history";

/** The route, fitted into a box, as SVG path data (equirectangular is plenty at walking scale). */
function routePath(tour: StoredTour, w: number, h: number, pad: number): { d: string; stops: [number, number][] } {
  const line = (tour.route?.geometry as { type?: string; coordinates?: number[][] } | undefined)?.coordinates;
  const coords: number[][] = line?.length ? line : tour.plan.stops.map((s) => [s.lng, s.lat]);
  const all = [...coords, ...tour.plan.stops.map((s) => [s.lng, s.lat])];
  const lngs = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const minX = Math.min(...lngs) * kx;
  const maxX = Math.max(...lngs) * kx;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const scale = Math.min((w - pad * 2) / Math.max(maxX - minX, 1e-6), (h - pad * 2) / Math.max(maxY - minY, 1e-6));
  const ox = (w - (maxX - minX) * scale) / 2;
  const oy = (h - (maxY - minY) * scale) / 2;
  const at = ([lng, lat]: number[]): [number, number] => [ox + (lng * kx - minX) * scale, h - (oy + (lat - minY) * scale)];
  const d = coords.map((c, i) => `${i ? "L" : "M"}${at(c)[0].toFixed(1)} ${at(c)[1].toFixed(1)}`).join(" ");
  return { d, stops: tour.plan.stops.map((s) => at([s.lng, s.lat])) };
}

export default function TourComplete({
  open,
  tour,
  minutesWalked,
  points,
  lang,
  onClose,
  onNew,
}: {
  open: boolean;
  tour: StoredTour;
  /** From the first arrival to now, when known. */
  minutesWalked: number | null;
  /** Points this walk earned, when loyalty is on and it counted. */
  points: number;
  lang: string;
  onClose: () => void;
  onNew: () => void;
}) {
  const art = useMemo(() => routePath(tour, 320, 200, 22), [tour]);
  const stops = tour.plan.stops;

  const share = async () => {
    const text = `I just walked "${tour.plan.title}" — ${formatDistance(tour.meters)}, ${stops.length} stops, with WalkDots.`;
    try {
      if (navigator.share) await navigator.share({ title: tour.plan.title, text, url: location.origin });
      else await navigator.clipboard.writeText(`${text} ${location.origin}`);
    } catch {
      /* the share sheet was closed */
    }
  };

  return (
    <div className="complete" data-open={open} role="dialog" aria-modal="true" aria-label="Walk complete" aria-hidden={!open} inert={!open}>
      <div className="complete__scroll">
        <header className="complete__hero">
          <p className="complete__eyebrow">Walk complete</p>
          <h2 className="complete__title">{tour.plan.title}</h2>
          <svg viewBox="0 0 320 200" className="complete__art" aria-hidden="true">
            <path d={art.d} fill="none" stroke="#5eda9b" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
            <path className="complete__route" d={art.d} fill="none" stroke="#5eda9b" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
            {art.stops.map(([x, y], i) => (
              <g key={i} className="complete__stop" style={{ animationDelay: `${0.6 + (i / Math.max(stops.length, 1)) * 1.2}s` }}>
                <circle cx={x} cy={y} r="9" fill="#111827" stroke="#5eda9b" strokeWidth="2.5" />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff">
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
          <dl className="complete__stats">
            <div>
              <dt>Distance</dt>
              <dd>{formatDistance(tour.meters)}</dd>
            </div>
            <div>
              <dt>Stops</dt>
              <dd>{stops.length}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{minutesWalked ? `${minutesWalked} min` : "—"}</dd>
            </div>
            {points > 0 ? (
              <div>
                <dt>Points</dt>
                <dd className="text-[color:var(--mint)]">+{points}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        <section className="complete__body">
          <h3 className="u-section">What you saw</h3>
          <ul className="complete__places">
            {stops.slice(0, 8).map((s, i) => (
              <li key={s.id ?? i}>
                <PlaceImage
                  place={{ name: s.name, localName: s.localName, lat: s.lat, lng: s.lng, lang }}
                  className="h-24 w-full rounded-2xl"
                  sizes="160px"
                  fallback={<span className="grid h-24 w-full place-items-center rounded-2xl bg-[color:var(--mint-wash)] font-[family-name:var(--font-display)] text-2xl font-semibold text-[color:var(--mint-ink)]">{i + 1}</span>}
                />
                <span>{s.name}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={() => void share()} className="btn btn--primary btn--lg w-full">
              Share your walk
            </button>
            <button type="button" onClick={onNew} className="btn btn--quiet w-full">
              Walk somewhere new
            </button>
            <button type="button" onClick={onClose} className="mt-1 min-h-[44px] font-[family-name:var(--font-display)] font-medium text-[color:var(--ink-soft)]">
              Keep listening
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

/**
 * Every tour people have made, newest first — developers only (the list comes
 * from /api/me/tours, which checks). Not linked to anyone: what was asked for,
 * where, how long, and in what language.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDeveloper } from "@/lib/accounts/useDeveloper";
import type { SavedTourSummary } from "@/lib/tour/saved";
import { estimateTourCost, usd } from "@/lib/tour/cost";

type Detail = "highlights" | "story" | "everything";

export default function SavedToursPage() {
  const { developer } = useDeveloper();
  const [tours, setTours] = useState<SavedTourSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** When the page opened, for "today". */
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!developer) return;
    void fetch("/api/me/tours?limit=500")
      .then(async (r) => {
        const body = (await r.json()) as { tours?: SavedTourSummary[]; error?: string };
        if (!r.ok) throw new Error(body.error ?? `Could not load the tours (${r.status}).`);
        setTours(body.tours ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, [developer]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!tours || !q) return tours ?? [];
    return tours.filter((t) =>
      [t.title, t.city, t.lang, t.freeText, t.interests.join(" ")].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [tours, query]);

  const cities = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of tours ?? []) n.set(t.city ?? "—", (n.get(t.city ?? "—") ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [tours]);

  const spent = useMemo(
    () => (tours ?? []).reduce((sum, t) => sum + (t.demo ? 0 : estimateTourCost(t.stops, (t.detail as Detail) ?? "story").total), 0),
    [tours],
  );

  if (!developer) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-[length:var(--text-h2)]">Developers only</h1>
        <p className="mt-2 text-[color:var(--ink-soft)]">Sign in with a developer account to see the saved tours.</p>
        <Link href="/profile" className="btn btn--primary mt-4">
          Go to Account
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 pb-16 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="u-eyebrow">Developer</p>
          <h1 className="text-[length:var(--text-h2)]">Saved tours</h1>
        </div>
        <Link href="/profile" className="btn btn--quiet btn--small">
          ← Account
        </Link>
      </div>

      {error ? <p className="mt-4 text-[color:var(--danger)]">{error}</p> : null}
      {!tours && !error ? <p className="mt-4 text-[color:var(--ink-mute)]">Loading…</p> : null}

      {tours ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Tours" value={String(tours.length)} />
            <Stat label="Today" value={String(tours.filter((t) => now - Date.parse(t.createdAt) < 86_400_000).length)} />
            <Stat label="Top city" value={cities[0]?.[0] ?? "—"} />
            <Stat label="Cost to make (est.)" value={`≈ ${usd(spent)}`} />
          </div>

          {cities.length ? (
            <p className="mt-3 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
              {cities.map(([c, n]) => `${c} ${n}`).join(" · ")}
            </p>
          ) : null}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title, city, language, interest or words…"
            className="mt-6 min-h-[44px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3"
          />

          <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)]">
            <table className="w-full text-left text-[length:var(--text-caption)]">
              <thead className="bg-[color:var(--canvas)] text-[color:var(--ink-mute)]">
                <tr>
                  {["When", "Tour", "City", "Asked for", "Interests", "Lang", "Stops", "Cost (est.)", "Typed"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-t border-[color:var(--line)] align-top">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--ink-mute)]">
                      {new Date(t.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2 font-medium text-[color:var(--ink)]">
                      {t.title}
                      {t.demo ? <span className="ml-2 rounded-full bg-[color:var(--mint-wash)] px-2 text-[11px] text-[color:var(--mint-ink)]">demo</span> : null}
                    </td>
                    <td className="px-3 py-2">{t.city ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{[t.minutes ? `${t.minutes} min` : null, t.detail, t.pace].filter(Boolean).join(" · ")}</td>
                    <td className="px-3 py-2">{t.interests.join(", ") || "—"}</td>
                    <td className="px-3 py-2">{t.lang ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{t.stops}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      <CostCell tour={t} />
                    </td>
                    <td className="max-w-[16rem] px-3 py-2 italic text-[color:var(--ink-soft)]">{t.freeText ? `“${t.freeText}”` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 ? <p className="p-4 text-[color:var(--ink-mute)]">No tours match.</p> : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

/** A tour's estimated cost, with what it is made of on hover. Demos cost nothing. */
function CostCell({ tour }: { tour: SavedTourSummary }) {
  if (tour.demo) return <span className="text-[color:var(--ink-mute)]">$0.00</span>;
  const c = estimateTourCost(tour.stops, (tour.detail as Detail) ?? "story");
  return (
    <span title={`Writing ${usd(c.writing)} + voice ${usd(c.voice)} (${Math.round(c.audioMinutes)} min of audio)`}>
      ≈ {usd(c.total)}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-3">
      <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-semibold">{value}</p>
    </div>
  );
}

"use client";

/**
 * The whole flow, in order.
 *
 *   start -> brief -> points -> generating -> headphones -> tour
 *
 * The map is mounted once and never torn down; only the sheet's contents and
 * height change. That is what makes the first screen become the second without
 * a page transition — and it means the tiles are paid for once.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TourMap, { type MapPin } from "./TourMap";
import BottomSheet from "./BottomSheet";
import BriefStep from "./flow/BriefStep";
import PointsStep from "./flow/PointsStep";
import GeneratingStep from "./flow/GeneratingStep";
import HeadphonesStep from "./flow/HeadphonesStep";
import TourStep, { DirectionsPanel } from "./flow/TourStep";
import { useLiveLocation } from "@/lib/tour/useLiveLocation";
import { distanceMeters } from "@/lib/tour/route";
import {
  EMPTY_DRAFT,
  clearTour,
  loadDraft,
  loadTour,
  saveDraft,
  saveTour,
  type Draft,
  type Stage,
  type StoredTour,
} from "@/lib/tour/flow";
import type { Duration, Interest, TourRequest } from "@/lib/providers/types";

const SHEET_INSET = 190;

/** The handoff carries free numbers and strings; the flow needs its own
 *  unions, so both are narrowed here rather than trusted. */
const DURATION_CHOICES: Duration[] = [30, 45, 60, 90];

function nearestDuration(minutes: number | null): Duration {
  if (!minutes) return EMPTY_DRAFT.durationMinutes;
  return DURATION_CHOICES.reduce((best, d) =>
    Math.abs(d - minutes) < Math.abs(best - minutes) ? d : best,
  );
}

const KNOWN_INTERESTS: Interest[] = ["history", "architecture", "food", "art", "hidden"];

function keepKnownInterests(values: string[]): Interest[] {
  const kept = values.filter((v): v is Interest =>
    (KNOWN_INTERESTS as string[]).includes(v),
  );
  return kept.length ? kept : EMPTY_DRAFT.interests;
}



/** What the planner can hand over in the URL, so the walk starts already
 *  knowing what this day is meant to be about. */
export type Handoff = {
  brief: string | null;
  label: string | null;
  interests: string[];
  minutes: number | null;
  start: { lat: number; lng: number } | null;
  autostart: boolean;
};

export default function TourFlow({
  styleUrl,
  center,
  initialSimulate,
  handoff,
}: {
  styleUrl: string;
  center: { lat: number; lng: number };
  initialSimulate: boolean;
  handoff?: Handoff;
}) {
  const [stage, setStage] = useState<Stage>("start");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [tour, setTour] = useState<StoredTour | null>(null);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const [phase, setPhase] = useState("stops");
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autostartRef = useRef(false);

  const { fix, status, simulating, toggleSimulation } = useLiveLocation(initialSimulate);

  // Restore whatever the last session left behind — unless the planner sent
  // us here with a brief, which is a fresh intent and wins over the old one.
  useEffect(() => {
    // localStorage is unreadable during SSR, so this cannot be a lazy initial
    // state without a hydration mismatch. Deferred a tick so it never writes
    // state during the mount commit.
    queueMicrotask(() => {
      if (handoff?.brief) {
        const next: Draft = {
          ...EMPTY_DRAFT,
          freeText: handoff.brief,
          useSimpleSettings: false,
          durationMinutes: nearestDuration(handoff.minutes),
          interests: keepKnownInterests(handoff.interests),
          start: handoff.start
            ? { ...handoff.start, label: handoff.label ?? undefined }
            : null,
        };
        setDraft(next);
        saveDraft(next);
        // With a starting point we can go straight to generating; without one
        // the walker still has to say where they are.
        if (handoff.autostart && next.start) autostartRef.current = true;
        setStage(next.start ? "brief" : "points");
        return;
      }

      const d = loadDraft();
      if (d) setDraft(d);
      const t = loadTour();
      if (t) {
        setTour(t);
        setStage("tour");
      }
    });
  }, [handoff]);

  const patchDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
  }, []);

  // ------------------------------------------------------------- generate --
  const generate = useCallback(async () => {
    if (!draft.start) return;
    setStage("generating");
    setPhase("stops");
    setPhaseMessage(null);
    setGenError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const body: TourRequest = {
      freeText: draft.useSimpleSettings ? undefined : draft.freeText || undefined,
      durationMinutes: draft.durationMinutes,
      detail: draft.detail,
      pace: draft.pace,
      interests: draft.interests,
      start: draft.start,
      end: draft.end ?? undefined,
      lang: draft.lang,
    };

    try {
      const res = await fetch("/api/tours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Server said ${res.status}.`);

      // Parse the SSE stream by hand — EventSource cannot POST.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let cut = buffer.indexOf("\n\n");
        while (cut !== -1) {
          const chunk = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf("\n\n");
          if (!chunk.startsWith("data:")) continue;

          const evt = JSON.parse(chunk.slice(5).trim()) as {
            phase: string;
            message?: string;
            data?: StoredTour;
          };
          setPhase(evt.phase);
          if (evt.message) setPhaseMessage(evt.message);

          if (evt.phase === "error") throw new Error(evt.message ?? "Generation failed.");
          if (evt.phase === "done" && evt.data) {
            setTour(evt.data);
            saveTour(evt.data);
            setCurrentIndex(0);
            setStage("headphones");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setGenError(err instanceof Error ? err.message : "Could not build the tour.");
    }
  }, [draft]);

  // The draft is set a tick after mount, so generation waits for it rather
  // than reading a stale closure.
  useEffect(() => {
    if (!autostartRef.current) return;
    if (!draft.start || !draft.freeText) return;
    autostartRef.current = false;
    void generate();
  }, [draft, generate]);

  // ------------------------------------------------------------ tour data --
  const stops = useMemo(
    () =>
      tour?.plan.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) ?? [],
    [tour],
  );

  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    if (stage !== "tour" && draft.start) out.push({ kind: "start", ...draft.start });
    if (stage !== "tour" && draft.end) out.push({ kind: "end", ...draft.end });
    return out;
  }, [stage, draft.start, draft.end]);

  const currentStop = tour?.plan.stops[currentIndex] ?? null;
  const distanceToStop =
    fix && currentStop ? distanceMeters(fix, { lat: currentStop.lat, lng: currentStop.lng }) : null;

  const ask = useCallback(
    async (question: string) => {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          stopName: currentStop?.name,
          lat: fix?.lat ?? currentStop?.lat,
          lng: fix?.lng ?? currentStop?.lng,
          lang: draft.lang,
        }),
      });
      const body = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !body.answer) throw new Error(body.error ?? "Could not answer.");
      return body.answer;
    },
    [currentStop, fix, draft.lang],
  );

  /** Speech synthesis is free and offline — good enough to repeat a cue. */
  const speak = useCallback(
    (text: string) => {
      if (typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = draft.lang === "sk" ? "sk-SK" : "en-GB";
      u.rate = 0.95;
      speechSynthesis.speak(u);
    },
    [draft.lang],
  );

  const startOver = useCallback(() => {
    clearTour();
    setTour(null);
    setStage("start");
    setAskOpen(false);
    setDirectionsOpen(false);
  }, []);

  // ----------------------------------------------------------------- view --
  const sheetFull =
    stage === "brief" ||
    stage === "points" ||
    stage === "generating" ||
    stage === "headphones" ||
    (stage === "tour" && askOpen);

  // While dropping a pin the sheet must get out of the way of the map.
  const sheetHidden = picking !== null && stage === "points";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <TourMap
        styleUrl={styleUrl}
        center={center}
        fix={fix}
        route={stage === "tour" ? tour?.route ?? null : null}
        stops={stage === "tour" ? stops : []}
        currentStopIndex={stage === "tour" ? currentIndex : -1}
        pins={pins}
        picking={picking !== null}
        onPick={(p) => {
          const label = `Pin at ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
          patchDraft(picking === "end" ? { end: { ...p, label } } : { start: { ...p, label } });
          setPicking(null);
        }}
        bottomInset={sheetFull ? 0 : SHEET_INSET}
        follow={stage !== "tour"}
        fitTo={stage === "tour" ? tour?.plan.title ?? null : null}
      />

      {/* Directions live behind a small icon, top right, out of the way. */}
      {stage === "tour" ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="pointer-events-auto mx-auto flex w-full max-w-lg items-start justify-between gap-3">
              <button type="button" onClick={startOver} className="btn btn--quiet px-4" aria-label="End the tour">
                ←
              </button>
              <button
                type="button"
                onClick={() => setDirectionsOpen((o) => !o)}
                className="btn btn--dark px-4"
                aria-label="Walking directions"
                aria-expanded={directionsOpen}
              >
                {/* A signpost arrow, not a hamburger. */}
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                  <path
                    d="M12 21V10M12 4v2M4 7h11l3 3-3 3H4z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <DirectionsPanel
            stop={currentStop}
            distanceMeters={distanceToStop}
            open={directionsOpen}
            onClose={() => setDirectionsOpen(false)}
            onSpeak={speak}
          />
        </>
      ) : null}

      {/* Location trouble is reported once, above the sheet, not per screen. */}
      {status.kind === "error" && stage === "start" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto mx-auto w-full max-w-lg panel-dark px-4 py-3">
            <p className="font-[family-name:var(--font-display)] font-semibold">{status.message}</p>
            {status.hint ? (
              <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--on-dark-mute)]">
                {status.hint}
              </p>
            ) : null}
            <button type="button" onClick={toggleSimulation} className="btn btn--primary mt-3 w-full">
              {simulating ? "Stop simulating" : "Simulate a walk instead"}
            </button>
          </div>
        </div>
      ) : null}

      {sheetHidden ? null : (
        <BottomSheet
          height={sheetFull ? "full" : "collapsed"}
          title={
            stage === "brief"
              ? "Build my tour"
              : stage === "points"
                ? "Where do you start?"
                : stage === "tour"
                  ? "Ask anything"
                  : undefined
          }
          onCollapse={
            stage === "brief"
              ? () => setStage("start")
              : stage === "points"
                ? () => setStage("brief")
                : stage === "tour" && askOpen
                  ? () => setAskOpen(false)
                  : undefined
          }
          collapsedContent={
            stage === "tour" && tour ? (
              <TourStep
                plan={tour.plan}
                currentIndex={currentIndex}
                onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                onNext={() =>
                  setCurrentIndex((i) => Math.min((tour.plan.stops.length ?? 1) - 1, i + 1))
                }
                onAsk={ask}
                expanded={false}
                onToggleExpand={() => setAskOpen(true)}
              />
            ) : (
              <>
                <h1 className="text-[length:var(--text-h3)]">
                  {handoff?.label ? `Walk ${handoff.label}` : "Walk Bratislava old town"}
                </h1>
                <p className="mt-2 text-[color:var(--ink-soft)]">
                  A guide in your ear, built around what you actually want to see.
                </p>
                <button
                  type="button"
                  onClick={() => setStage("brief")}
                  className="btn btn--primary btn--lg mt-4 w-full"
                >
                  Build my tour
                </button>
                <p className="mt-3 text-center">
                  <Link
                    href="/plan"
                    className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)] underline"
                  >
                    Or plan a whole trip first
                  </Link>
                </p>
              </>
            )
          }
        >
          {stage === "brief" ? (
            <BriefStep draft={draft} onChange={patchDraft} onContinue={() => setStage("points")} />
          ) : stage === "points" ? (
            <PointsStep
              draft={draft}
              onChange={patchDraft}
              onContinue={generate}
              fix={fix}
              picking={picking}
              setPicking={setPicking}
            />
          ) : stage === "generating" ? (
            <GeneratingStep
              phase={phase}
              message={phaseMessage}
              error={genError}
              onCancel={() => {
                abortRef.current?.abort();
                setStage("points");
              }}
              onRetry={generate}
            />
          ) : stage === "headphones" && tour ? (
            <HeadphonesStep
              title={tour.plan.title}
              stopCount={tour.plan.stops.length}
              minutes={Math.max(1, Math.round(tour.seconds / 60)) || draft.durationMinutes}
              onStart={() => {
                // The gesture that unlocks audio on iOS. Priming speech here
                // means the first real cue can speak without another tap.
                if (typeof speechSynthesis !== "undefined") {
                  speechSynthesis.speak(new SpeechSynthesisUtterance(""));
                }
                setStage("tour");
              }}
            />
          ) : stage === "tour" && tour ? (
            <TourStep
              plan={tour.plan}
              currentIndex={currentIndex}
              onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              onNext={() => setCurrentIndex((i) => Math.min(tour.plan.stops.length - 1, i + 1))}
              onAsk={ask}
              expanded
              onToggleExpand={() => setAskOpen(false)}
            />
          ) : null}
        </BottomSheet>
      )}
    </div>
  );
}

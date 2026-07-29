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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TourMap, { type MapPin } from "./TourMap";
import BottomSheet from "./BottomSheet";
import BriefStep from "./flow/BriefStep";
import PointsStep from "./flow/PointsStep";
import GeneratingStep from "./flow/GeneratingStep";
import HeadphonesStep from "./flow/HeadphonesStep";
import TourStep, { DirectionsPanel } from "./flow/TourStep";
import TurnCard from "./flow/TurnCard";
import { nextTurn } from "@/lib/tour/navigation";
import Player from "./flow/Player";
import MiniPlayer from "./flow/MiniPlayer";
import LayerSwitcher from "./flow/LayerSwitcher";
import { useTourAudio } from "@/lib/audio/useTourAudio";
import { audioEngine, clearPlayback, type Depth } from "@/lib/audio/engine";
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
import type { MapStyle, TourRequest } from "@/lib/providers/types";

/** Roughly how much of the map each sheet state covers. */
const INSET_MINI = 120;
const INSET_PLAYER = 340;

export default function TourFlow({
  styleUrl,
  styles,
  center,
  initialSimulate,
}: {
  styleUrl: string;
  styles: MapStyle[];
  center: { lat: number; lng: number };
  initialSimulate: boolean;
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
  const [depth, setDepth] = useState<Depth>("short");
  /** The tour sheet starts retracted so the route is visible. */
  const [playerOpen, setPlayerOpen] = useState(false);
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const abortRef = useRef<AbortController | null>(null);

  const { fix, status, simulating, toggleSimulation } = useLiveLocation(initialSimulate);

  // Restore whatever the last session left behind.
  useEffect(() => {
    // localStorage is unreadable during SSR, so this cannot be a lazy initial
    // state without a hydration mismatch. Deferred a tick so it never writes
    // state during the mount commit.
    queueMicrotask(() => {
      const d = loadDraft();
      if (d) setDraft(d);
      const t = loadTour();
      if (t) {
        setTour(t);
        setStage("tour");
      }
    });
  }, []);

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

    // A stream that stops arriving is not the same as a stream that ends. Some
    // hosts cut a long-running function mid-flight and the socket simply goes
    // quiet, so without a ceiling the screen waits for ever.
    const HARD_LIMIT_MS = 180_000;
    const timeout = window.setTimeout(() => controller.abort(), HARD_LIMIT_MS);

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

    let sawDone = false;
    let lastPhase = "stops";
    const started = Date.now();

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
          lastPhase = evt.phase;
          if (evt.message) setPhaseMessage(evt.message);

          if (evt.phase === "error") throw new Error(evt.message ?? "Generation failed.");
          if (evt.phase === "done" && evt.data) {
            sawDone = true;
            setTour(evt.data);
            saveTour(evt.data);
            setCurrentIndex(0);
            setStage("headphones");
          }
        }
      }
      // The loop ended. If "done" never arrived the connection was cut, which
      // on a serverless host almost always means the function hit its time
      // limit — worth saying, because it is not something a retry will fix.
      if (!sawDone) {
        const seconds = Math.round((Date.now() - started) / 1000);
        throw new Error(
          `The connection closed after ${seconds}s, during "${lastPhase}", ` +
            `before the tour was finished. If this host caps how long a request ` +
            `may run, generation is being cut off rather than failing.`,
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Our own hard limit, not the user pressing cancel.
        if (controller.signal.reason !== "cancelled") {
          setGenError("Generation took too long and was stopped.");
        }
        return;
      }
      setGenError(err instanceof Error ? err.message : "Could not build the tour.");
    } finally {
      window.clearTimeout(timeout);
    }
  }, [draft]);

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

  /** Recomputed on every fix — this is the arrow in the corner. */
  const turn = useMemo(
    () => nextTurn(tour?.route ?? null, tour?.maneuvers, fix),
    [tour?.route, tour?.maneuvers, fix],
  );

  const currentStop = tour?.plan.stops[currentIndex] ?? null;
  const distanceToStop =
    fix && currentStop ? distanceMeters(fix, { lat: currentStop.lat, lng: currentStop.lng }) : null;

  // ---------------------------------------------------------------- audio --
  const audioStops = useMemo(
    () =>
      tour?.plan.stops.map((s) => ({
        id: s.id,
        name: s.name,
        scriptShort: s.scriptShort,
        scriptFull: s.scriptFull,
      })) ?? [],
    [tour],
  );

  const advance = useCallback(() => {
    // End of a stop walks on by itself, so there is no silence between stops.
    setCurrentIndex((i) => Math.min(audioStops.length - 1, i + 1));
  }, [audioStops.length]);

  const audio = useTourAudio({
    stops: audioStops,
    lang: draft.lang,
    index: currentIndex,
    depth,
    onAdvance: advance,
    active: stage === "tour",
  });

  /**
   * Stops already triggered by proximity.
   *
   * Without this, standing near a stop re-triggers it every time GPS jitters,
   * and stepping back toward the previous one drags the tour backwards.
   */
  const arrivedRef = useRef<Set<string>>(new Set());
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [justArrived, setJustArrived] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== "tour" || !autoAdvance || !fix || !tour) return;

    // 35 m: tighter than a GPS fix is reliable in a street of tall buildings,
    // and the stops are close together in an old town.
    const ARRIVAL_M = 35;
    let best: { index: number; name: string; id: string; d: number } | null = null;

    tour.plan.stops.forEach((s, i) => {
      if (arrivedRef.current.has(s.id)) return;
      const d = distanceMeters(fix, { lat: s.lat, lng: s.lng });
      if (d <= ARRIVAL_M && (!best || d < best.d)) best = { index: i, name: s.name, id: s.id, d };
    });

    if (!best) return;
    const arrival = best as { index: number; name: string; id: string; d: number };
    arrivedRef.current.add(arrival.id);
    // Mark everything before it as seen too, so skipping a stop on the ground
    // does not send the tour backwards later.
    tour.plan.stops.slice(0, arrival.index).forEach((s) => arrivedRef.current.add(s.id));

    if (arrival.index !== currentIndex) setCurrentIndex(arrival.index);
    setJustArrived(arrival.name);
  }, [fix, stage, autoAdvance, tour, currentIndex]);

  const ask = useCallback(
    async (question: string) => {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          lang: draft.lang,
          // The brief from the setup screens. Without it the answer is generic
          // and the walker may as well have used a search engine.
          freeText: draft.freeText || undefined,
          interests: draft.interests,
          detail: draft.detail,
          tourTitle: tour?.plan.title,
          stopName: currentStop?.name,
          stopContext: currentStop
            ? depth === "full"
              ? currentStop.scriptFull
              : currentStop.scriptShort
            : undefined,
          lat: fix?.lat ?? currentStop?.lat,
          lng: fix?.lng ?? currentStop?.lng,
        }),
      });
      const body = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !body.answer) throw new Error(body.error ?? "Could not answer.");
      return body.answer;
    },
    [currentStop, fix, draft, depth, tour],
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

  useEffect(() => {
    if (!justArrived) return;
    const id = window.setTimeout(() => setJustArrived(null), 6000);
    return () => window.clearTimeout(id);
  }, [justArrived]);

  /**
   * Back goes exactly one step, and never destroys anything.
   *
   * It used to run straight to the landing screen AND delete the tour — and
   * because the map's top bar sits above the sheet, the button you hit while
   * asking a question was that one, not the sheet's own chevron.
   */
  const goBack = useCallback(() => {
    if (askOpen) {
      setAskOpen(false);
      return;
    }
    if (directionsOpen) {
      setDirectionsOpen(false);
      return;
    }
    if (playerOpen) {
      setPlayerOpen(false);
      return;
    }
    // Leaving the tour keeps it: the landing screen offers to resume.
    audioEngine.pause();
    setStage("start");
  }, [askOpen, directionsOpen, playerOpen]);

  const startOver = useCallback(() => {
    audioEngine.pause();
    clearPlayback();
    clearTour();
    arrivedRef.current.clear();
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

  // Hidden while the player is open: on a phone-sized screen the expanded
  // sheet reaches up past the button, and it is the sheet that has the text.
  // A 430x900 window has the clearance a real phone does not.
  const showLayerSwitcher =
    !directionsOpen && !playerOpen && (sheetHidden || (stage === "tour" && !sheetFull));

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
        bottomInset={sheetFull ? 0 : stage === "tour" && !playerOpen ? INSET_MINI : INSET_PLAYER}
        follow={stage !== "tour"}
        fitTo={stage === "tour" ? tour?.plan.title ?? null : null}
        showZoom={stage !== "tour"}
        styles={styles}
        styleId={styleId}
      />

      {/* Directions live behind a small icon, top right, out of the way. */}
      {/* Hidden while the sheet is full: the sheet has its own chevron, and two
          back buttons stacked on top of each other is how you end up deleting
          a tour when you meant to close a question. */}
      {stage === "tour" && !askOpen ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="pointer-events-auto mx-auto flex w-full max-w-lg items-start justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                className="btn btn--quiet px-4"
                aria-label={directionsOpen ? "Close directions" : "Leave the tour"}
              >
                ←
              </button>
              {/* With a routed tour this is the arrow and the distance to it.
                  Without maneuvers — mock provider, or routing that failed —
                  it falls back to the signpost that opens the written cue. */}
              {turn ? (
                <TurnCard
                  kind={turn.maneuver.kind}
                  meters={turn.meters}
                  street={turn.maneuver.street}
                  open={directionsOpen}
                  onOpen={() => setDirectionsOpen((o) => !o)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setDirectionsOpen((o) => !o)}
                  className="btn btn--dark px-4"
                  aria-label="Walking directions"
                  aria-expanded={directionsOpen}
                >
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
              )}
            </div>
          </div>
          <DirectionsPanel
            stop={currentStop}
            distanceMeters={distanceToStop}
            turnInstruction={turn?.maneuver.instruction}
            turnMeters={turn?.meters}
            open={directionsOpen}
            onClose={() => setDirectionsOpen(false)}
            onSpeak={speak}
          />
        </>
      ) : null}

      {/* Basemap switcher, under the back button and out of the turn card's way.
          It only exists where the basemap is worth changing: walking the tour,
          and choosing a point by tapping the map, where satellite is what tells
          you which building is which. Everywhere else — the landing screen, a
          full sheet, the directions panel — it is a floating icon over someone
          else's words. */}
      {showLayerSwitcher ? (
        <div className="pointer-events-none absolute left-0 top-20 z-30 p-4">
          <div className="pointer-events-auto">
            <LayerSwitcher styles={styles} value={styleId} onChange={setStyleId} />
          </div>
        </div>
      ) : null}

      {/* Arrival, and the switch that turns it off. GPS moving the tour under
          the walker is right most of the time and infuriating the rest, so it
          has to be visible and it has to be defeatable. */}
      {stage === "tour" && !askOpen ? (
        <div className="pointer-events-none absolute inset-x-0 top-36 z-20 px-4">
          <div className="pointer-events-auto mx-auto flex w-full max-w-lg flex-col items-end gap-2">
            {justArrived ? (
              <div className="panel-dark w-full px-4 py-3">
                <p className="u-eyebrow" style={{ color: "var(--on-dark-mute)" }}>
                  You&apos;ve arrived
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold">
                  {justArrived}
                </p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setAutoAdvance((v) => !v)}
              aria-pressed={autoAdvance}
              className={`btn ${autoAdvance ? "btn--primary" : "btn--quiet"} px-4 py-2`}
              style={{ minHeight: 44 }}
            >
              {autoAdvance ? "Auto-play on arrival" : "Manual stops"}
            </button>
          </div>
        </div>
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
            stage === "tour" && tour && !playerOpen ? (
              <MiniPlayer
                stopName={currentStop?.name ?? ""}
                index={currentIndex}
                total={tour.plan.stops.length}
                playing={audio.playing}
                preparing={audio.preparing}
                position={audio.position}
                duration={audio.duration}
                onToggle={audio.toggle}
                onExpand={() => setPlayerOpen(true)}
                onAsk={() => setAskOpen(true)}
              />
            ) : stage === "tour" && tour ? (
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => setPlayerOpen(false)}
                  className="mx-auto -mt-2 flex min-h-[44px] items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[color:var(--ink-mute)]"
                  aria-label="Retract the player"
                >
                  ▾ Hide controls
                </button>
                <Player
                  stopName={currentStop?.name ?? ""}
                  index={currentIndex}
                  total={tour.plan.stops.length}
                  depth={depth}
                  onDepth={setDepth}
                  playing={audio.playing}
                  preparing={audio.preparing}
                  failed={audio.failed}
                  usingDeviceVoice={audio.usingDeviceVoice}
                  voiceMode={audio.voiceMode}
                  onVoiceMode={audio.setVoiceMode}
                  position={audio.position}
                  duration={audio.duration}
                  onToggle={audio.toggle}
                  onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  onNext={() =>
                    setCurrentIndex((i) => Math.min(tour.plan.stops.length - 1, i + 1))
                  }
                  onSeek={audio.seek}
                  onRetry={() => setDepth((d) => d)}
                />
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
              </div>
            ) : tour ? (
              // Backing out of a tour is not the same as ending it. The walk is
              // still here, at the stop it was left on.
              <>
                <p className="u-eyebrow">Your tour, paused</p>
                <h1 className="mt-1 text-[length:var(--text-h3)]">{tour.plan.title}</h1>
                <p className="mt-2 text-[color:var(--ink-soft)]">
                  Stop {currentIndex + 1} of {tour.plan.stops.length} ·{" "}
                  {tour.plan.stops[currentIndex]?.name}
                </p>
                <button
                  type="button"
                  onClick={() => setStage("tour")}
                  className="btn btn--primary btn--lg mt-4 w-full"
                >
                  Carry on walking
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  className="mt-3 min-h-[44px] w-full text-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
                >
                  Build a different tour
                </button>
              </>
            ) : (
              <>
                <h1 className="text-[length:var(--text-h3)]">Walk Bratislava old town</h1>
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
                abortRef.current?.abort("cancelled");
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
                // The tap that unlocks audio on iOS. It must happen
                // synchronously, here, or nothing will ever play.
                audio.start();
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

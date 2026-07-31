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
import Link from "next/link";
import Image from "next/image";
import TourMap, { type MapPin } from "./TourMap";
import BottomSheet, { type SheetHeight } from "./BottomSheet";
import BriefStep, { BriefFooter } from "./flow/BriefStep";
import PointsStep, { PointsFooter } from "./flow/PointsStep";
import CityPicker from "./flow/CityPicker";
import FullscreenButton from "./flow/FullscreenButton";
import GeneratingStep, { type TourPreview } from "./flow/GeneratingStep";
import HeadphonesStep from "./flow/HeadphonesStep";
import TourStep, { DirectionsPanel } from "./flow/TourStep";
import TurnCard from "./flow/TurnCard";
import { nextTurn, snapToRoute } from "@/lib/tour/navigation";
import Player from "./flow/Player";
import MiniPlayer from "./flow/MiniPlayer";
import LayerSwitcher from "./flow/LayerSwitcher";
import { useTourAudio } from "@/lib/audio/useTourAudio";
import { audioEngine, clearPlayback } from "@/lib/audio/engine";
import { useLiveLocation } from "@/lib/tour/useLiveLocation";
import { requestHeadingPermission, useHeading } from "@/lib/tour/useHeading";
import { distanceMeters } from "@/lib/tour/route";
import { normaliseLang, speechLocale } from "@/lib/i18n/languages";
import { announceUiLang, useT } from "@/lib/i18n/ui";
import { isTrusted } from "@/lib/tour/fixQuality";
import { tourMinutes } from "@/lib/tour/timing";
import {
  EMPTY_DRAFT,
  clearTour,
  loadDraft,
  loadTour,
  resetDraft,
  saveDraft,
  saveTour,
  takeRebuild,
  type Draft,
  type Stage,
  type StoredTour,
} from "@/lib/tour/flow";
import type { City, MapStyle, TourPlan, TourRequest } from "@/lib/providers/types";
import { cityAt } from "@/lib/tour/city";
import { rememberWalk } from "@/lib/tour/history";

/** Roughly how much of the map each sheet state covers. */
const INSET_MINI = 120;
const INSET_PLAYER = 340;

/** Past this from the city we hold, the walker is somewhere else and the name
 *  is worth looking up again. Generous, because cities are big and a second
 *  lookup costs a request. */
const CITY_RADIUS_M = 30_000;

/** How long the map stays uncovered after a pin lands, so the walker can see
 *  where it went before the sheet slides back over it. */
const PIN_PAUSE_MS = 1000;

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
  const t = useT();
  const [stage, setStage] = useState<Stage>("start");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [tour, setTour] = useState<StoredTour | null>(null);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  /**
   * The pin has landed and the sheet has not come back up yet.
   *
   * Without the pause the sheet slid over the map the instant the map was
   * tapped, so the one thing worth seeing — where the pin actually went —
   * was covered before it could be looked at. A second is long enough to
   * see it and short enough not to feel stuck.
   */
  const [pinLanded, setPinLanded] = useState(false);
  const pinPause = useRef<number | null>(null);
  /** The city search, opened from the landing screen. */
  const [cityOpen, setCityOpen] = useState(false);
  const [phase, setPhase] = useState("stops");
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  /** The itinerary, as soon as it exists — see GeneratingStep. */
  const [preview, setPreview] = useState<TourPreview | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  /**
   * Where the walker has dragged the sheet, when they have.
   *
   * Null means "wherever this screen naturally sits" — the forms want the
   * whole screen, the tour wants the map visible — and a drag overrides that
   * until the screen changes under it.
   */
  const [sheetDrag, setSheetDrag] = useState<SheetHeight | null>(null);
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");

  // The screens that are forms need the whole screen; the tour needs the map.
  const sheetFull =
    stage === "brief" ||
    stage === "points" ||
    stage === "generating" ||
    stage === "headphones" ||
    (stage === "tour" && askOpen);
  /**
   * A new screen starts at its own height rather than inheriting a drag.
   *
   * Adjusted during render rather than in an effect: the drag belongs to the
   * screen it happened on, so a screen change makes it stale immediately, and
   * an effect would paint one frame of the old height first.
   */
  const screen = `${stage}:${askOpen}`;
  const [shownScreen, setShownScreen] = useState(screen);
  if (screen !== shownScreen) {
    setShownScreen(screen);
    setSheetDrag(null);
  }

  const sheetHeight: SheetHeight =
    (screen === shownScreen ? sheetDrag : null) ?? (sheetFull ? "full" : "collapsed");
  /** On the tour, the player is simply the sheet being open at all. */
  const playerOpen = stage === "tour" && !askOpen && sheetHeight !== "collapsed";
  const [detectingCity, setDetectingCity] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** One city lookup in flight at a time. */
  const cityLookupRef = useRef(false);
  /**
   * Set once the walker picks a city by hand. State rather than a ref because
   * the map has to stop following the GPS fix when it happens — otherwise
   * choosing Vienna from a sofa in Bratislava flies there and is dragged back
   * on the next tick.
   */
  const [cityPinned, setCityPinned] = useState<City | null>(null);

  const { fix, status, simulating, toggleSimulation } = useLiveLocation(initialSimulate);
  /** Which way the walker is facing, for the cone on the dot. */
  const heading = useHeading(!simulating);

  /**
   * `generate` as it is *now*, for the mount effect below.
   *
   * That effect runs once and must not be re-run when the draft changes, but
   * it needs a version of `generate` that is not the one captured on the first
   * render. A ref is the seam between the two.
   */
  const generateRef = useRef<(again?: { req: TourRequest; plan: TourPlan }) => void>(() => {});

  // Restore whatever the last session left behind.
  // The pause after a pin lands outlives nothing: if this screen goes away
  // first, the timer must not come back to set state on it.
  useEffect(() => () => { if (pinPause.current) clearTimeout(pinPause.current); }, []);

  useEffect(() => {
    // localStorage is unreadable during SSR, so this cannot be a lazy initial
    // state without a hydration mismatch. Deferred a tick so it never writes
    // state during the mount commit.
    queueMicrotask(() => {
      const d = loadDraft();
      // Nothing saved: open in the browser's own language when it is one of
      // ours, so most walkers never have to find the picker at all.
      if (d) setDraft(d);
      else setDraft((prev) => ({ ...prev, lang: normaliseLang(navigator.language) }));

      /**
       * A walk asked for again from the profile wins over the one in progress.
       *
       * Checked before the restore, and taken rather than read: pressing the
       * button is a decision to walk something else, so landing back on the
       * old tour would be the app ignoring it. The previous walk is still in
       * its own slot until this one finishes building.
       */
      const again = takeRebuild();
      if (again) {
        // The walk's language is the app's too, or a Japanese walk is narrated
        // in Japanese under English buttons.
        setDraft((prev) => ({ ...prev, lang: again.req.lang }));
        announceUiLang(again.req.lang);
        void generateRef.current(again);
        return;
      }

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
    // The language is both the guide's and the app's, so changing it here has
    // to reach every screen and not just the next tour.
    if (patch.lang) announceUiLang(patch.lang);
  }, []);

  // ------------------------------------------------------------- generate --
  /**
   * Build a tour and walk to it.
   *
   * `again` is a walk being repeated from the profile: its brief and its
   * itinerary come from the record rather than from the draft on screen, so
   * the walker gets the same stops in whatever language they picked. Passed as
   * an argument rather than read from state because the ask arrives on the
   * same tick as the navigation, well before any draft has been set from it.
   */
  const generate = useCallback(async (again?: { req: TourRequest; plan: TourPlan }) => {
    if (!again && !draft.start) return;
    setStage("generating");
    setPhase("stops");
    setPhaseMessage(null);
    setGenError(null);
    // Last run's itinerary is not this run's. Cleared here rather than on
    // arrival so a retry does not spend its first seconds showing the walk it
    // is replacing.
    setPreview(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // A stream that stops arriving is not the same as a stream that ends. Some
    // hosts cut a long-running function mid-flight and the socket simply goes
    // quiet, so without a ceiling the screen waits for ever.
    const HARD_LIMIT_MS = 180_000;
    const timeout = window.setTimeout(() => controller.abort(), HARD_LIMIT_MS);

    const body: TourRequest = again?.req ?? {
      // Both go, always: the settings are the floor and the brief is what
      // outranks them. The prompt is written to resolve that, and there is no
      // longer a mode in which one of them is meant not to count.
      freeText: draft.freeText.trim() || undefined,
      city: draft.city ?? undefined,
      durationMinutes: draft.durationMinutes,
      detail: draft.detail,
      pace: draft.pace,
      interests: draft.interests,
      start: draft.start!,
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
        // The itinerary rides along only when there is one to reuse; without
        // it the server chooses the stops as it always has.
        body: JSON.stringify(again ? { ...body, plan: again.plan } : body),
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
            preview?: TourPreview;
          };
          setPhase(evt.phase);
          lastPhase = evt.phase;
          if (evt.message) setPhaseMessage(evt.message);
          // Arrives with the first event, roughly a third of the way in, and
          // gives the remaining wait something to be spent on.
          if (evt.preview) setPreview(evt.preview);

          if (evt.phase === "error") throw new Error(evt.message ?? "Generation failed.");
          if (evt.phase === "done" && evt.data) {
            sawDone = true;
            // The brief travels with the tour: stops written later in the walk
            // must be written from the same one, or stop nine reads like a
            // different guide from stop one.
            const built: StoredTour = { ...evt.data, req: body };
            setTour(built);
            saveTour(built);
            // Remembered when it is built rather than when it is finished: a
            // walk abandoned at stop three still happened, and a walker
            // looking for "that tour I made in Vienna" means the one they
            // made, not the one they completed.
            rememberWalk(built);
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
  generateRef.current = generate;

  // ------------------------------------------------------------------ city --
  /**
   * The fix says where; this says where that is. Runs once per city: a walker
   * moving around town must not re-trigger it, so a fix is only looked up when
   * there is no city yet or the fix has left the one we have.
   */
  useEffect(() => {
    if (!fix || cityLookupRef.current) return;
    const known = draft.city;
    if (known && distanceMeters(fix, { lat: known.lat, lng: known.lng }) < CITY_RADIUS_M) return;
    // A city chosen by hand outranks the fix — someone planning tomorrow's
    // walk in Vienna does not want their sofa in Bratislava to win.
    if (cityPinned) return;

    cityLookupRef.current = true;
    // Deferred a tick: setting state straight from an effect body cascades a
    // render, and this one is about to wait on the network regardless.
    queueMicrotask(() => setDetectingCity(true));
    cityAt(fix.lat, fix.lng, draft.lang)
      .then((c) => {
        if (c) patchDraft({ city: c });
      })
      .finally(() => {
        setDetectingCity(false);
        cityLookupRef.current = false;
      });
  }, [fix, draft.city, draft.lang, cityPinned, patchDraft]);

  /** Choosing a city moves the map and, if nothing is set yet, the start. */
  const chooseCity = useCallback(
    (c: City) => {
      setCityPinned(c);
      // A start belonging to a different city is not a deliberate choice worth
      // keeping — it is the last city's leftovers, and keeping it builds a walk
      // that begins hundreds of kilometres from the city it claims to be in.
      // Now that the city can be changed from the landing screen, that is a
      // couple of taps away rather than something nobody would stumble into.
      const inCity = (p: { lat: number; lng: number } | null) =>
        !!p && distanceMeters(p, { lat: c.lat, lng: c.lng }) < CITY_RADIUS_M;
      patchDraft({
        city: c,
        // A city centre is a defensible starting point and saves a second search.
        start: inCity(draft.start) ? draft.start : { lat: c.lat, lng: c.lng, label: c.name },
        // No such fallback for the end: a loop is the default, and inventing a
        // finish nobody asked for is worse than having none.
        end: inCity(draft.end) ? draft.end : null,
      });
    },
    [patchDraft, draft.start, draft.end],
  );

  // ------------------------------------------------------------ tour data --
  const stops = useMemo(
    () =>
      tour?.plan.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) ?? [],
    [tour],
  );

  /**
   * Only while the walk's ends are being chosen.
   *
   * They used to draw on every screen before the tour, which put a pin from a
   * walk somebody set up yesterday on the opening map — a marker on a screen
   * with nothing to explain it, pointing at a decision they had not made yet.
   * The pin answers "where will this start", so it belongs on the screen that
   * asks.
   */
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    if (stage !== "points") return out;
    if (draft.start) out.push({ kind: "start", ...draft.start });
    if (draft.end) out.push({ kind: "end", ...draft.end });
    return out;
  }, [stage, draft.start, draft.end]);

  /** Recomputed on every fix — this is the arrow in the corner. */
  const turn = useMemo(
    () => nextTurn(tour?.route ?? null, tour?.maneuvers, fix),
    [tour?.route, tour?.maneuvers, fix],
  );

  /**
   * The dot on the street rather than in the building beside it.
   *
   * Only ever moved as far as the fix's own stated error, with a floor of a
   * few metres so a good fix can still be tidied off a doorway. A walk that
   * has genuinely left the route — a detour, a wrong turn — is drawn where it
   * really is, which is the moment being drawn honestly matters most.
   */
  const SNAP_FLOOR_M = 12;
  const snapped = useMemo(
    () =>
      stage === "tour" && fix
        ? snapToRoute(tour?.route ?? null, fix, Math.max(fix.accuracy, SNAP_FLOOR_M))
        : null,
    [stage, tour?.route, fix],
  );

  const currentStop = tour?.plan.stops[currentIndex] ?? null;

  /**
   * The ride that gets the walker to the stop they are heading for, if this
   * leg is one.
   *
   * A ride's `to` indexes the tour's points, where 0 is the starting point and
   * the stops run from 1 — so the leg arriving at stop `n` is the ride whose
   * `to` is `n + 1`. Off by one in either direction and the walker is told to
   * catch a tram on the leg before or after the one that needs it.
   */
  const rideToCurrent = tour?.rides?.find((r) => r.to === currentIndex + 1) ?? null;
  const distanceToStop =
    fix && currentStop ? distanceMeters(fix, { lat: currentStop.lat, lng: currentStop.lng }) : null;

  // ---------------------------------------------------------------- audio --
  const audioStops = useMemo(() => tour?.plan.stops ?? [], [tour]);

  const advance = useCallback(() => {
    // End of a stop walks on by itself, so there is no silence between stops.
    setCurrentIndex((i) => Math.min(audioStops.length - 1, i + 1));
  }, [audioStops.length]);

  const audio = useTourAudio({
    stops: audioStops,
    // Stops written mid-walk need the same brief the first one was written
    // from, so the tour keeps its own copy of the request.
    req: tour?.req ?? null,
    lang: draft.lang,
    album: draft.city?.name,
    index: currentIndex,
    onAdvance: advance,
    active: stage === "tour",
    // The headphones screen is a tap and a paragraph of reading — long enough
    // to make the first stop in, and it is the last thing standing between the
    // walker and the first word.
    warm: stage === "headphones",
  });

  /**
   * Asking a question silences the guide.
   *
   * A walker types with the narration still going, then reads an answer over
   * the top of it — two voices for one question. Here rather than on each way
   * in, because there are several: the mini player, the collapsed row, and the
   * sheet's own controls all open it.
   */
  const pauseAll = audio.pauseAll;
  useEffect(() => {
    if (askOpen) pauseAll();
  }, [askOpen, pauseAll]);

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
    if (stage !== "tour" || !autoAdvance || !tour) return;
    // A ±150 m fix sits inside 35 m of a stop while you are two streets away,
    // and starts the wrong narration. Better to wait for a fix that knows
    // which street it is on — the panel says why, and the arrows still work.
    if (!isTrusted(fix)) return;

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

  /**
   * Tapping a numbered stop on the map goes to it.
   *
   * Everything before it counts as seen, the same as walking there would make
   * it: without that, choosing stop seven while standing beside stop two hands
   * the walk straight back to the arrival check, which sees an unvisited stop
   * within thirty-five metres and drags the tour back to it.
   */
  const chooseStop = useCallback(
    (index: number) => {
      if (!tour) return;
      tour.plan.stops.slice(0, index).forEach((s) => arrivedRef.current.add(s.id));
      setCurrentIndex(index);
      setJustArrived(null);
    },
    [tour],
  );

  /**
   * The screen stays awake for as long as the walk is running.
   *
   * Not a comfort: a browser stops delivering positions to a page it considers
   * hidden, so a phone that sleeps in a pocket stops navigating, and wakes
   * convinced you are still standing where you locked it.
   */
  useEffect(() => {
    if (stage !== "tour") return;
    const lock = navigator.wakeLock;
    if (!lock) return;

    let held: WakeLockSentinel | null = null;
    let done = false;

    const acquire = async () => {
      if (held && !held.released) return;
      try {
        const sentinel = await lock.request("screen");
        // The effect can be torn down while the request is in flight.
        if (done) void sentinel.release();
        else held = sentinel;
      } catch {
        // Refused, or the battery is too low to be generous. The walk still
        // works; the screen just goes dark the way it always did.
      }
    };

    // The lock is dropped whenever the page is hidden and is never handed back
    // on its own, so coming back to the tab has to ask again.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (held && !held.released) void held.release();
    };
  }, [stage]);

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
          city: draft.city?.label,
          tourTitle: tour?.plan.title,
          stopName: currentStop?.name,
          stopContext: currentStop?.script,
          lat: fix?.lat ?? currentStop?.lat,
          lng: fix?.lng ?? currentStop?.lng,
        }),
      });
      const body = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !body.answer) throw new Error(body.error ?? "Could not answer.");
      return body.answer;
    },
    [currentStop, fix, draft, tour],
  );

  /** Speech synthesis is free and offline — good enough to repeat a cue. */
  const speak = useCallback(
    (text: string) => {
      if (typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = speechLocale(draft.lang);
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
      setSheetDrag("collapsed");
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
    // A different tour means a different brief. Everything the last walk was
    // built from goes with it — the typed request most of all, since it is the
    // one setting that is somebody's own words. See resetDraft.
    setDraft((d) => resetDraft(d.lang));
    setPreview(null);
    setPicking(null);
    setStage("start");
    setAskOpen(false);
    setDirectionsOpen(false);
  }, []);

  // ----------------------------------------------------------------- view --
  // While dropping a pin the sheet must get out of the way of the map.
  const sheetHidden = picking !== null && stage === "points";

  // Hidden while the player is open: on a phone-sized screen the expanded
  // sheet reaches up past the button, and it is the sheet that has the text.
  // A 430x900 window has the clearance a real phone does not.
  const showLayerSwitcher =
    !directionsOpen &&
    !playerOpen &&
    (sheetHidden || (stage === "tour" && sheetHeight === "collapsed"));

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <TourMap
        styleUrl={styleUrl}
        center={center}
        fix={fix}
        dot={snapped}
        heading={heading}
        route={stage === "tour" ? tour?.route ?? null : null}
        stops={stage === "tour" ? stops : []}
        currentStopIndex={stage === "tour" ? currentIndex : -1}
        onSelectStop={chooseStop}
        pins={pins}
        // Off the moment the pin lands, so the second spent looking at it
        // cannot be spent accidentally moving it.
        picking={picking !== null && !pinLanded}
        onPick={(p) => {
          const label = `Pin at ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
          patchDraft(picking === "end" ? { end: { ...p, label } } : { start: { ...p, label } });
          setPinLanded(true);
          if (pinPause.current) clearTimeout(pinPause.current);
          pinPause.current = window.setTimeout(() => {
            setPicking(null);
            setPinLanded(false);
          }, PIN_PAUSE_MS);
        }}
        // How much of the map the sheet is sitting on, so the camera centres in
        // what is left of it. Read from where the sheet actually is, not from
        // where this screen would put it — the walker can drag it now.
        bottomInset={
          sheetHeight === "full" ? 0 : sheetHeight === "collapsed" ? INSET_MINI : INSET_PLAYER
        }
        follow={stage !== "tour" && !cityPinned}
        fitTo={stage === "tour" ? tour?.plan.title ?? null : null}
        lookAt={
          cityPinned && stage !== "tour"
            ? { lat: cityPinned.lat, lng: cityPinned.lng, key: cityPinned.label }
            : null
        }
        showZoom={stage !== "tour"}
        styles={styles}
        styleId={styleId}
      />

      {/* The app's own mark, top left, and the way into the profile.
          Only where the corner is free: on the walk that corner is the way
          out of the tour, and two round buttons in one corner is how you
          leave a tour when you meant to check your walks. */}
      {stage === "start" && !sheetHidden ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto w-full max-w-lg">
            <Link
              href="/profile"
              aria-label="My profile"
              className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] shadow-[var(--shadow-card)]"
            >
              <Image src="/icons/icon-192.png" alt="" width={48} height={48} priority />
            </Link>
          </div>
        </div>
      ) : null}

      {/* Dropping a pin takes the sheet away so the map is reachable, which
          also takes away everything that said what to do. This is the only
          thing on screen at that moment, so it carries both the instruction
          and the way out. */}
      {sheetHidden ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-between gap-3 panel-dark px-4 py-3">
            {/* Once the pin is down the instruction is finished, and leaving
                it up reads as though the tap did not register. */}
            <p className="min-w-0 font-[family-name:var(--font-display)] font-semibold">
              {pinLanded
                ? `${picking === "end" ? "End" : "Starting"} point set`
                : `Tap the map to place the ${picking === "end" ? "end" : "start"} point`}
            </p>
            <button
              type="button"
              onClick={() => setPicking(null)}
              className="btn btn--quiet shrink-0 px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Directions live behind a small icon, top right, out of the way. */}
      {/* Hidden whenever the sheet reaches the top of the screen: the sheet has
          its own chevron there, and two back buttons stacked on top of each
          other is how you end up deleting a tour when you meant to close a
          question. That used to mean "while asking"; now the walker can drag
          the sheet up to full themselves, so it means what it says. */}
      {stage === "tour" && !askOpen && sheetHeight !== "full" ? (
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
            accuracy={fix?.accuracy ?? null}
            turnInstruction={turn?.maneuver.instruction}
            turnMeters={turn?.meters}
            ride={rideToCurrent}
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
      {stage === "tour" && !askOpen && sheetHeight !== "full" ? (
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
            {/* A setting, not an action — it should read as smaller than the
                turn card and the player. The full sentence stays in the label
                for anyone who cannot see which of the two states is lit. */}
            <button
              type="button"
              onClick={() => setAutoAdvance((v) => !v)}
              aria-pressed={autoAdvance}
              aria-label={
                autoAdvance
                  ? "Auto-play when you arrive at a stop. Switch to manual."
                  : "Stops are played manually. Switch to auto-play on arrival."
              }
              className={`btn btn--small ${autoAdvance ? "btn--primary" : "btn--quiet"}`}
            >
              {autoAdvance ? "Auto-play" : "Manual"}
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
          height={sheetHeight}
          // Only the walk resizes. The landing screen's whole content is the
          // collapsed row, so pulling it open showed an empty panel; the forms
          // are already the whole screen, and dragging one down would uncover
          // the landing screen behind it.
          onHeightChange={stage === "tour" && !askOpen ? setSheetDrag : undefined}
          title={
            stage === "brief"
              ? t("brief.title")
              : stage === "points"
                ? t("points.title")
                : stage === "tour" && askOpen
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
                  : stage === "tour"
                    ? () => setSheetDrag("collapsed")
                    : undefined
          }
          footer={
            stage === "brief" ? (
              <BriefFooter onChange={patchDraft} onContinue={() => setStage("points")} />
            ) : stage === "points" ? (
              <PointsFooter draft={draft} onContinue={generate} />
            ) : undefined
          }
          collapsedContent={
            stage === "tour" && tour ? (
              <MiniPlayer
                stopName={currentStop?.name ?? ""}
                index={currentIndex}
                total={tour.plan.stops.length}
                playing={audio.playing}
                preparing={audio.preparing}
                waitingFor={audio.waitingFor}
                position={audio.position}
                duration={audio.duration}
                onToggle={audio.toggle}
                onExpand={() => setSheetDrag("half")}
                onAsk={() => setAskOpen(true)}
              />
            ) : tour ? (
              // Backing out of a tour is not the same as ending it. The walk is
              // still here, at the stop it was left on.
              <>
                <p className="u-eyebrow">{t("landing.paused")}</p>
                <h1 className="mt-1 text-[length:var(--text-h3)]">{tour.plan.title}</h1>
                <p className="mt-2 text-[color:var(--ink-soft)]">
                  {t("landing.stopOf", {
                    n: currentIndex + 1,
                    total: tour.plan.stops.length,
                  })}{" "}
                  · {tour.plan.stops[currentIndex]?.name}
                </p>
                <button
                  type="button"
                  onClick={() => setStage("tour")}
                  className="btn btn--primary btn--lg mt-4 w-full"
                >
                  {t("landing.carryOn")}
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  className="mt-3 min-h-[44px] w-full text-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
                >
                  {t("landing.different")}
                </button>
              </>
            ) : (
              <>
                <h1 className="text-[length:var(--text-h3)]">
                  {draft.city
                    ? t("landing.walkCity", { city: draft.city.name })
                    : t("landing.walkAnywhere")}
                </h1>
                <p className="mt-2 text-[color:var(--ink-soft)]">
                  {t("landing.pitch")}
                </p>
                <button
                  type="button"
                  onClick={() => setStage("brief")}
                  className="btn btn--primary btn--lg mt-4 w-full"
                >
                  {t("landing.build")}
                </button>
                {/* The heading names whichever city the GPS landed in, which
                    reads as the only answer available. Somebody planning
                    tomorrow's walk in another country needs the way out to be
                    on this screen, not three steps into a flow. */}
                {cityOpen ? (
                  <div className="mt-3">
                    <CityPicker
                      city={draft.city}
                      detecting={detectingCity}
                      lang={draft.lang}
                      open
                      onOpenChange={setCityOpen}
                      onChange={chooseCity}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCityOpen(true)}
                    className="btn btn--quiet btn--lg mt-3 w-full"
                  >
                    {t("landing.chooseCity")}
                  </button>
                )}
                {/* Offered here and nowhere else: the walk itself should not
                    carry a control for the browser it happens to be in. */}
                <FullscreenButton />
              </>
            )
          }
        >
          {stage === "brief" ? (
            <BriefStep draft={draft} onChange={patchDraft} />
          ) : stage === "points" ? (
            <PointsStep
              draft={draft}
              onChange={patchDraft}
              fix={fix}
              picking={picking}
              setPicking={setPicking}
              detectingCity={detectingCity}
              onCity={chooseCity}
            />
          ) : stage === "generating" ? (
            <GeneratingStep
              phase={phase}
              message={phaseMessage}
              preview={preview}
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
              // Walking plus standing still at every stop, at a tourist's
              // speed rather than a commuter's — see lib/tour/timing.ts.
              minutes={tourMinutes(tour) || draft.durationMinutes}
              onStart={() => {
                // The tap that unlocks audio on iOS. It must happen
                // synchronously, here, or nothing will ever play.
                audio.start();
                if (typeof speechSynthesis !== "undefined") {
                  speechSynthesis.speak(new SpeechSynthesisUtterance(""));
                }
                // iOS only grants the compass from inside a tap, and this is
                // the last tap before the walk begins.
                void requestHeadingPermission();
                setStage("tour");
              }}
            />
          ) : stage === "tour" && tour && askOpen ? (
            <TourStep
              plan={tour.plan}
              currentIndex={currentIndex}
              onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              onNext={() => setCurrentIndex((i) => Math.min(tour.plan.stops.length - 1, i + 1))}
              onAsk={ask}
              expanded
              onToggleExpand={() => setAskOpen(false)}
            />
          ) : stage === "tour" && tour ? (
            /* Dragged open: the controls, what is being said, and the whole
               narration to read. How much of it you see is the drag. */
            <div className="flex flex-col gap-4">
              <Player
                stopName={currentStop?.name ?? ""}
                index={currentIndex}
                total={tour.plan.stops.length}
                playing={audio.playing}
                preparing={audio.preparing}
                waitingFor={audio.waitingFor}
                buffered={audio.buffered}
                failed={audio.failed}
                held={audio.held}
                failReason={audio.failReason}
                failedPart={audio.failedPart}
                usingDeviceVoice={audio.usingDeviceVoice}
                photo={{
                  name: currentStop?.name ?? "",
                  localName: currentStop?.localName,
                  lat: currentStop?.lat ?? 0,
                  lng: currentStop?.lng ?? 0,
                  lang: draft.lang,
                }}
                speedrun={audio.speedrun}
                onSpeedrun={audio.setSpeedrun}
                chunks={audio.chunks}
                chunkIndex={audio.chunkIndex}
                chunkStart={audio.chunkStart}
                chunkDuration={audio.chunkDuration}
                position={audio.position}
                duration={audio.duration}
                onToggle={audio.toggle}
                onSeek={audio.seek}
                onRetry={() => setCurrentIndex((i) => i)}
              />
              <TourStep
                plan={tour.plan}
                currentIndex={currentIndex}
                onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                onNext={() => setCurrentIndex((i) => Math.min(tour.plan.stops.length - 1, i + 1))}
                onAsk={ask}
                expanded={false}
                onToggleExpand={() => setAskOpen(true)}
              />
            </div>
          ) : null}
        </BottomSheet>
      )}
    </div>
  );
}

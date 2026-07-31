"use client";

/**
 * Binds the engine and the library to a tour, and to React.
 *
 * Everything the player UI needs is here: what is playing, how much of it has
 * been written and spoken so far, and the things a walker can do — play, skip
 * and seek.
 *
 * Which voice reads the tour is no longer among them. A walk is read by the
 * guide; the phone's own voice steps in only when the guide's cannot be made.
 * Nobody was ever going to choose the worse voice on purpose, and asking made
 * the walker responsible for a decision that is really about whether a
 * synthesis call succeeded.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { audioEngine, restorePlayback, type EngineState } from "./engine";
import { AudioLibrary, type StopState } from "./library";
import { deviceVoice, type DeviceVoiceState } from "./deviceVoice";
import type { Stop, TourRequest } from "@/lib/providers/types";

/** Hoisted: returning a fresh object from getServerSnapshot loops forever. */
const NO_STATES: Record<string, StopState> = {};

const NO_SPEECH: DeviceVoiceState = { speaking: false, paused: false };


const SERVER_STATE: EngineState = {
  ready: false,
  track: null,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  buffered: 0,
  chunkIndex: 0,
  chunkStart: 0,
  chunkDuration: 0,
  error: null,
};

const IDLE_STOP: StopState = {
  script: "idle",
  voice: "idle",
  chunksReady: 0,
  chunksTotal: 0,
  playable: false,
  error: null,
};

export function useTourAudio({
  stops,
  req,
  lang,
  album,
  index,
  onAdvance,
  active,
  warm = false,
}: {
  stops: Stop[];
  /** The brief, so a stop written mid-walk matches the one written up front. */
  req: TourRequest | null;
  lang: string;
  /** Lock-screen album — the city. */
  album?: string;
  index: number;
  /** Called when a stop finishes, so the tour can walk on by itself. */
  onAdvance: () => void;
  /** False before the walk begins — nothing should be *played* yet. */
  active: boolean;
  /**
   * Build the first stop, but do not speak it.
   *
   * The screens between "make me a tour" and the first word are dead time the
   * walker is already spending; the words and the voice for stop one can be
   * made during it instead of after it. Separate from `active` because the
   * difference is playback: turning `active` on early would have the phone
   * start reading the tour aloud over the headphones screen.
   */
  warm?: boolean;
}) {
  const engine = useSyncExternalStore(
    audioEngine.subscribe,
    audioEngine.getState,
    () => SERVER_STATE,
  );

  const library = useMemo(
    () =>
      new AudioLibrary(stops, req, lang, (stopId, i, url) => {
        audioEngine.setChunk(stopId, i, url);
      }),
    [stops, req, lang],
  );
  useEffect(() => () => library.dispose(), [library]);

  const stopStates = useSyncExternalStore(library.subscribe, library.getSnapshot, () => NO_STATES);

  const speech = useSyncExternalStore(deviceVoice.subscribe, deviceVoice.getState, () => NO_SPEECH);

  const stop = stops[index];
  const stopState: StopState = stop ? (stopStates[stop.id] ?? IDLE_STOP) : IDLE_STOP;

  /**
   * Tracks whether the element exists yet, so the loading effect re-runs the
   * moment it does. Without this a tour restored from localStorage lands on
   * the tour screen having skipped the headphones tap, and stays silent for
   * ever — the play button calls into an engine with no element.
   */
  const [unlocked, setUnlocked] = useState(audioEngine.unlocked);

  /**
   * A play tap that arrived before there was anything to play it on, waiting
   * for the stop to be loaded. Nothing else starts a sound on its own.
   */
  const playOnLoad = useRef(false);

  /**
   * The short way round.
   *
   * A stop is four to five minutes, and a walker with an hour and thirteen
   * stops does not have thirteen of those. In this mode only the opening piece
   * of each stop is spoken — the one the guide leads with, which is where the
   * fact people actually want lives — and the walk moves on by itself.
   */
  const [speedrun, setSpeedrun] = useState(false);

  /**
   * The understudy.
   *
   * The phone reads only when the guide cannot, and only when there is
   * something for it to read: a stop whose *words* failed has nothing for
   * either voice, so the phone is no use there and pretending otherwise gets
   * it reading an empty string. The fallback is specifically for the case
   * where the words exist and the synthesis of them did not arrive.
   */
  const haveWords = stopState.script === "ready";
  const guideUnavailable = stopState.voice === "failed";
  const usingDeviceVoice = guideUnavailable && haveWords && deviceVoice.supported;

  /** Nothing can read this stop: no words, or no voice able to say them. */
  const broken = stopState.script === "failed" || (guideUnavailable && !usingDeviceVoice);

  /**
   * Held back by the rate-limit brake, which is not the same as broken and
   * must not be folded into it: `broken` offers a retry, and a held stop has
   * nothing to retry — it was never attempted.
   */
  const held = stopState.script === "held";

  /**
   * How far into each stop the walker had got.
   *
   * Leaving a stop used to throw its position away, so stepping forward to see
   * where the next one was and stepping back again restarted five minutes of
   * narration from the first word. The engine could always be told where to
   * open — nobody was telling it.
   *
   * Memory only, and per tour: a stop id belongs to the tour that made it, and
   * the walk itself is what localStorage keeps.
   */
  const heardUpToRef = useRef<Record<string, number>>({});

  /** Below this it is not worth resuming; within this of the end, they heard it. */
  const RESUME_MIN_S = 5;
  const RESUME_TAIL_S = 10;

  const rememberPosition = useCallback((stopId: string, position: number, duration: number) => {
    const worthResuming =
      position > RESUME_MIN_S && (duration <= 0 || position < duration - RESUME_TAIL_S);
    // A stop played to the end is not "in progress" — coming back to it should
    // start it again, not drop the walker on its last sentence.
    if (worthResuming) heardUpToRef.current[stopId] = position;
    else delete heardUpToRef.current[stopId];
  }, []);

  /**
   * The same question after a reload.
   *
   * The engine has been writing the playing stop's position to localStorage on
   * every tick from the beginning, and nothing has ever read it back — so a
   * tab the phone killed in a pocket cost the walker the stop they were in the
   * middle of. Seeded here, where it becomes just another remembered position.
   */
  useEffect(() => {
    const saved = restorePlayback();
    if (!saved || heardUpToRef.current[saved.stopId] !== undefined) return;
    // Positions belong to the tour that made them; a stop id from a previous
    // walk is not ours to resume.
    if (!stops.some((s) => s.id === saved.stopId)) return;
    rememberPosition(saved.stopId, saved.position, 0);
  }, [stops, rememberPosition]);

  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  // Lock-screen next/previous and end-of-stop auto-advance.
  useEffect(() => {
    audioEngine.setHandlers({
      onEnded: () => onAdvanceRef.current(),
      onNext: () => onAdvanceRef.current(),
    });
  }, []);

  /**
   * Fetch the words, and the voice, for whatever stop the tour is on.
   *
   * Deliberately NOT gated on the engine being unlocked. It used to be, and
   * that deadlocked: nothing was fetched until the walker pressed play, and
   * play was disabled until something had been fetched. Neither of these calls
   * touches the audio element, so there is nothing to wait for.
   */
  useEffect(() => {
    if (!active || !stop) return;
    let cancelled = false;

    void (async () => {
      // The words come first either way: the phone's own voice needs them just
      // as much as the synthesised one does.
      const written = await library.ensureScript(stop.id);
      if (cancelled || !written) return; // the failed state drives the fallback

      deviceVoice.stop();
      // Started before the synthesis rather than after it: writing the next
      // stop takes about ninety seconds and hits a different endpoint, so it
      // costs nothing to run it alongside. Waiting until this stop was fully
      // recorded spent the walker's listening time twice over.
      library.prefetchAround(index);
      // Makes the voice; does not play it. Nothing here starts a sound — that
      // is the walker's tap, and only the walker's tap.
      await library.ensureAudio(stop.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [active, stop, index, library]);

  /**
   * The same work, minus the playing, before the walk starts.
   *
   * Skipped once `active` is true so the two never race for the same stop —
   * and harmless if it did, since both go through the library's job maps and
   * the second caller joins the first one's promise.
   *
   * Both halves are made up front. The phone's voice needs the same words, and
   * writing them is the slow half; the guide's voice is made in advance
   * because it can be, and because a walker who taps play should hear
   * something immediately rather than wait for the first recording.
   */
  useEffect(() => {
    if (!warm || active || !stop) return;
    let cancelled = false;
    void (async () => {
      const written = await library.ensureScript(stop.id);
      if (cancelled || !written) return;
      await library.ensureAudio(stop.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [warm, active, stop, library]);

  /**
   * The narration as written, in the pieces it is spoken in.
   *
   * Read through `chunksTotal` rather than held in state: the library fills
   * these in when the script arrives, and that is the change that says so.
   */
  const chunks = useMemo(
    () => (stop ? library.chunksOf(stop.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop, library, stopState.chunksTotal],
  );

  /** The piece being spoken now — the caption. */
  const caption = engine.track?.stopId === stop?.id ? (chunks[engine.chunkIndex] ?? null) : null;

  /**
   * In the short version, one piece is the whole stop, so its end is the end.
   *
   * Watched here rather than handled in the engine because "how much of a stop
   * counts as enough" is a decision about the tour, and the engine knows only
   * about pieces.
   */
  useEffect(() => {
    if (!speedrun || !active || usingDeviceVoice) return;
    if (engine.track?.stopId !== stop?.id) return;
    if (engine.chunkIndex >= 1) onAdvanceRef.current();
  }, [speedrun, active, usingDeviceVoice, engine.chunkIndex, engine.track?.stopId, stop?.id]);

  /**
   * Point the engine at the current stop, once there is an element to point.
   *
   * Separate from the fetching above because the two are unlocked at different
   * moments: pieces of narration can pile up in the library long before the
   * walker taps anything, and they are handed over here rather than lost.
   */
  useEffect(() => {
    if (!active || !stop || !unlocked || usingDeviceVoice) return;
    let cancelled = false;

    void (async () => {
      const leaving = audioEngine.getState();
      if (leaving.track?.stopId === stop.id) return;

      // Written down before the engine is pointed anywhere else, because that
      // is the last moment this position exists.
      if (leaving.track) {
        rememberPosition(leaving.track.stopId, leaving.position, leaving.duration);
      }

      // The estimates are the whole stop's length, known from the word count
      // before a second of it has been recorded — so the scrubber has a scale
      // from the start rather than growing as pieces arrive.
      await audioEngine.loadStop(
        {
          stopId: stop.id,
          index,
          title: stop.name,
          subtitle: `Stop ${index + 1} of ${stops.length}`,
          album,
          chunkEstimates: library.estimatesFor(stop.id),
        },
        // Loaded, cued, and silent. Arriving at a stop is not asking to hear
        // it: the walker may be reading the map, crossing a road, or still
        // catching up with the last one. The narration waits for the tap.
        { autoplay: false, startAt: heardUpToRef.current[stop.id] ?? 0 },
      );
      if (cancelled) return;
      // Anything already synthesised while we were locked.
      for (const [i, url] of library.readyChunks(stop.id)) {
        audioEngine.setChunk(stop.id, i, url);
      }
      // The one place a sound starts without a fresh tap — and only because a
      // tap is exactly what put this here.
      if (playOnLoad.current) {
        playOnLoad.current = false;
        void audioEngine.play();
      }
    })();

    return () => {
      cancelled = true;
    };
    // `album` is in here only to satisfy the linter — it is settled on the
    // city screen, long before `active` is ever true, so it cannot re-run this.
  }, [
    active,
    stop,
    index,
    library,
    stops.length,
    unlocked,
    usingDeviceVoice,
    album,
    stopState.chunksTotal,
    rememberPosition,
  ]);

  useEffect(() => {
    if (!active) deviceVoice.stop();
  }, [active]);

  const start = useCallback(() => {
    // Synchronous, inside the tap. This is the whole ballgame on iOS.
    audioEngine.unlock();
    setUnlocked(true);
  }, []);

  /**
   * Quiet, whichever voice is talking.
   *
   * `pause` only reaches the engine, and the walker cannot tell which of the
   * two is speaking — nor should they have to. Paused rather than stopped, so
   * whatever interrupted the narration can hand it back where it left off.
   */
  const pauseAll = useCallback(() => {
    audioEngine.pause();
    const speaking = deviceVoice.getState();
    if (speaking.speaking && !speaking.paused) deviceVoice.toggle();
  }, []);

  /**
   * Any play gesture also counts as the unlocking tap.
   *
   * Nothing speaks until this runs. Since the fetching effects no longer start
   * the phone's voice, the first tap on a fallback stop has to *begin* the
   * reading rather than toggle a stream that was never started — toggling one
   * that does not exist is how the play button became a button that did
   * nothing.
   */
  const toggle = useCallback(() => {
    if (usingDeviceVoice) {
      if (!deviceVoice.getState().speaking && stop) {
        // The phone's voice has no pieces to stop after, so the short way
        // round has to be done by handing it less to read.
        const spoken = speedrun
          ? (library.chunksOf(stop.id)[0] ?? library.scriptOf(stop.id) ?? "")
          : (library.scriptOf(stop.id) ?? "");
        deviceVoice.speak(spoken, lang, () => onAdvanceRef.current());
        return;
      }
      deviceVoice.toggle();
      return;
    }
    if (!audioEngine.unlocked) {
      audioEngine.unlock();
      setUnlocked(true);
      /**
       * Remembered rather than played, because there is nothing to play yet:
       * the stop is loaded by the effect below, on the render after this one,
       * and `loadStop` clears any play intent the engine was holding. Calling
       * play() here would be silently undone a moment later.
       *
       * This is the path a tour restored from localStorage takes — it lands on
       * the tour screen having never seen the headphones tap, so the play
       * button is the first thing touched.
       */
      playOnLoad.current = true;
      return;
    }
    audioEngine.toggle();
  }, [usingDeviceVoice, stop, speedrun, library, lang]);

  return {
    ...engine,
    // While the phone is reading, it is the thing that is playing.
    playing: usingDeviceVoice ? speech.speaking && !speech.paused : engine.playing,
    stopState,
    usingDeviceVoice,
    speedrun,
    setSpeedrun,
    /** The whole narration, for reading rather than listening. */
    chunks,
    /** The piece being spoken, for following along. */
    caption,
    /**
     * True until there is something to press play on. The device voice needs
     * only the words; the synthesised voice needs them and its first recording.
     */
    preparing: usingDeviceVoice
      ? active && stopState.script !== "ready" && !broken && !held
      : active && !stopState.playable && !broken && !held,
    /** What the walker is waiting for, in words. */
    waitingFor:
      stopState.script === "writing"
        ? "Writing this stop"
        : !stopState.playable && stopState.script === "ready"
          ? "Recording the first minute"
          : null,
    failed: broken,
    /**
     * Deliberately not written — the rate-limit brake, not a fault. The player
     * says so instead of spinning for words that were never coming.
     */
    held,
    /** What went wrong, in the provider's own words, and which half of it. */
    failReason: stopState.error,
    failedPart: stopState.script === "failed" ? ("script" as const) : ("voice" as const),
    start,
    play: () => audioEngine.play(),
    pause: () => audioEngine.pause(),
    pauseAll,
    toggle,
    seek: (s: number) => audioEngine.seek(s),
    nudge: (d: number) => audioEngine.nudge(d),
  };
}

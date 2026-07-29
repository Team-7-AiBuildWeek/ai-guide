"use client";

/**
 * Binds the engine and the library to a tour, and to React.
 *
 * Everything the player UI needs is here: what is playing, whether it is
 * ready, and the four things a walker can do — play, change depth, skip, seek.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { audioEngine, type Depth, type EngineState } from "./engine";
import { AudioLibrary, type ClipState, type LibraryStop } from "./library";
import { deviceVoice, type DeviceVoiceState } from "./deviceVoice";

/** Hoisted: returning a fresh object from getServerSnapshot loops forever. */
const NO_CLIPS: Record<string, ClipState> = {};

const NO_SPEECH: DeviceVoiceState = { speaking: false, paused: false };

const SERVER_STATE: EngineState = {
  ready: false,
  track: null,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  error: null,
};

export function useTourAudio({
  stops,
  lang,
  index,
  depth,
  onAdvance,
  active,
}: {
  stops: LibraryStop[];
  lang: string;
  index: number;
  depth: Depth;
  /** Called when a stop finishes, so the tour can walk on by itself. */
  onAdvance: () => void;
  /** False before the headphones screen — nothing should be fetched yet. */
  active: boolean;
}) {
  const engine = useSyncExternalStore(
    audioEngine.subscribe,
    audioEngine.getState,
    () => SERVER_STATE,
  );

  const library = useMemo(() => new AudioLibrary(stops, lang), [stops, lang]);
  useEffect(() => () => library.dispose(), [library]);

  const clipStates = useSyncExternalStore(
    library.subscribe,
    library.getSnapshot,
    () => NO_CLIPS,
  );

  const speech = useSyncExternalStore(
    deviceVoice.subscribe,
    deviceVoice.getState,
    () => NO_SPEECH,
  );

  const stop = stops[index];
  const clipState: ClipState = stop ? (clipStates[`${stop.id}:${depth}`] ?? "idle") : "idle";
  /** True once real synthesis failed and the phone is reading instead. */
  const usingDeviceVoice = clipState === "failed" && deviceVoice.supported;

  /**
   * Tracks whether the element exists yet, so the loading effect re-runs the
   * moment it does. Without this a tour restored from localStorage lands on
   * the tour screen having skipped the headphones tap, and stays silent for
   * ever — the play button calls into an engine with no element.
   */
  const [unlocked, setUnlocked] = useState(audioEngine.unlocked);

  /**
   * Set while a depth change is being synthesised.
   *
   * The short recording can run out during that wait, and end-of-stop
   * auto-advance would then walk the tour on to the next stop — so asking for
   * more detail would silently skip you forward. Advancing is suppressed until
   * the swap lands.
   */
  const swapPendingRef = useRef(false);

  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  // Lock-screen next/previous and end-of-stop auto-advance.
  useEffect(() => {
    audioEngine.setHandlers({
      onEnded: () => {
        if (swapPendingRef.current) return;
        onAdvanceRef.current();
      },
      onNext: () => onAdvanceRef.current(),
    });
  }, []);

  /**
   * Load whatever the tour says is current. Keyed on stop and depth only —
   * position is the engine's business, not this effect's.
   */
  useEffect(() => {
    if (!active || !stop || !unlocked) return;
    let cancelled = false;

    // Captured NOW, before the await. Synthesising the other depth takes
    // tens of seconds, and reading the ratio afterwards measures wherever the
    // old recording had drifted to by then — usually its very end.
    const ratioAtSwitch = audioEngine.ratio;
    const wasListening = audioEngine.getState().playing;

    // A depth change on the stop already loaded: hold the auto-advance until
    // the new recording is in.
    const current = audioEngine.getState().track;
    const isDepthChange = current?.stopId === stop.id && current.depth !== depth;
    if (isDepthChange) swapPendingRef.current = true;

    void (async () => {
      const clip = await library.fetch(stop.id, depth);
      if (cancelled) return;

      if (!clip) {
        // Synthesis failed — usually the daily quota. Read it with the phone's
        // own voice rather than leaving the walker in silence.
        swapPendingRef.current = false;
        if (deviceVoice.supported) {
          audioEngine.pause();
          const text = depth === "short" ? stop.scriptShort : stop.scriptFull;
          deviceVoice.speak(text, lang, () => onAdvanceRef.current());
        }
        return;
      }
      deviceVoice.stop();

      const now = audioEngine.getState().track;
      const sameStop = now?.stopId === stop.id;
      const track = {
        stopId: stop.id,
        index,
        depth,
        src: clip.url,
        title: stop.name,
        subtitle: `Stop ${index + 1} of ${stops.length}`,
      };

      if (sameStop && now?.depth !== depth) {
        // Depth toggle: keep the walker's place in the story.
        await audioEngine.swapDepth(track, ratioAtSwitch, wasListening);
      } else if (!sameStop || !now) {
        await audioEngine.load(track, { autoplay: true });
      }
      swapPendingRef.current = false;
      library.prefetchAround(index, depth);
    })();

    return () => {
      cancelled = true;
      swapPendingRef.current = false;
    };
  }, [active, stop, index, depth, library, stops.length, lang, unlocked]);

  useEffect(() => {
    if (!active) deviceVoice.stop();
  }, [active]);

  const start = useCallback(() => {
    // Synchronous, inside the tap. This is the whole ballgame on iOS.
    audioEngine.unlock();
    setUnlocked(true);
  }, []);

  /** Any play gesture also counts as the unlocking tap. */
  const toggle = useCallback(() => {
    if (usingDeviceVoice) {
      deviceVoice.toggle();
      return;
    }
    if (!audioEngine.unlocked) {
      audioEngine.unlock();
      setUnlocked(true);
      return; // the effect below loads and plays as soon as it sees this
    }
    audioEngine.toggle();
  }, [usingDeviceVoice]);

  return {
    ...engine,
    // While the phone is reading, it is the thing that is playing.
    playing: usingDeviceVoice ? speech.speaking && !speech.paused : engine.playing,
    clipState,
    usingDeviceVoice,
    /** True while the current stop is still being synthesized. */
    preparing: clipState === "loading" || (clipState === "idle" && active),
    failed: clipState === "failed",
    start,
    play: () => audioEngine.play(),
    pause: () => audioEngine.pause(),
    toggle,
    seek: (s: number) => audioEngine.seek(s),
    nudge: (d: number) => audioEngine.nudge(d),
  };
}

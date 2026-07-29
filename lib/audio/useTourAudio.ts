"use client";

/**
 * Binds the engine and the library to a tour, and to React.
 *
 * Everything the player UI needs is here: what is playing, whether it is
 * ready, and the four things a walker can do — play, change depth, skip, seek.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
   * Load whatever the tour says is current. Keyed on stop and depth only —
   * position is the engine's business, not this effect's.
   */
  useEffect(() => {
    if (!active || !stop || !audioEngine.unlocked) return;
    let cancelled = false;

    void (async () => {
      const clip = await library.fetch(stop.id, depth);
      if (cancelled) return;

      if (!clip) {
        // Synthesis failed — usually the daily quota. Read it with the phone's
        // own voice rather than leaving the walker in silence.
        if (deviceVoice.supported) {
          audioEngine.pause();
          const text = depth === "short" ? stop.scriptShort : stop.scriptFull;
          deviceVoice.speak(text, lang, () => onAdvanceRef.current());
        }
        return;
      }
      deviceVoice.stop();

      const current = audioEngine.getState().track;
      const sameStop = current?.stopId === stop.id;
      const track = {
        stopId: stop.id,
        index,
        depth,
        src: clip.url,
        title: stop.name,
        subtitle: `Stop ${index + 1} of ${stops.length}`,
      };

      if (sameStop && current?.depth !== depth) {
        // Depth toggle: keep the walker's place in the story.
        await audioEngine.swapDepth(track, audioEngine.ratio);
      } else if (!sameStop || !current) {
        await audioEngine.load(track, { autoplay: true });
      }
      library.prefetchAround(index, depth);
    })();

    return () => {
      cancelled = true;
    };
  }, [active, stop, index, depth, library, stops.length, lang]);

  useEffect(() => {
    if (!active) deviceVoice.stop();
  }, [active]);

  const start = useCallback(() => {
    // Synchronous, inside the tap. This is the whole ballgame on iOS.
    audioEngine.unlock();
  }, []);

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
    toggle: () => (usingDeviceVoice ? deviceVoice.toggle() : audioEngine.toggle()),
    seek: (s: number) => audioEngine.seek(s),
    nudge: (d: number) => audioEngine.nudge(d),
  };
}

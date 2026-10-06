/**
 * The guide's voice, the way the website does it (lib/audio/library.ts and
 * useTourAudio.ts), on the phone's own audio player.
 *
 * Two things arrive from the server, in order: the words, then the voice. Only
 * the stop the walker is on and the one after it are written; a stop is voiced
 * in pieces that are saved on the phone and played back to back, so a stop
 * starts as soon as its first piece exists. Voicing runs one request at a time:
 * piece two is worthless until piece one exists, and parallel requests trip the
 * speech quota.
 *
 * When the words or the voice cannot be had, the phone reads the stop itself,
 * which is worse than the guide and better than silence.
 */

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepRecording, speak, writeStop } from "./api";
import { chunkScript, estimateSeconds } from "./chunk";
import { speechLocale } from "./languages";
import type { Stop, StoredTour, TourRequest } from "./types";

// ------------------------------------------------------- early voicing --

/** Pieces being voiced right now, so the same text is never asked for twice. */
const IN_FLIGHT = new Map<string, Promise<string>>();

function voice(text: string, lang: string): Promise<string> {
  const key = `${lang}\u0000${text}`;
  const held = IN_FLIGHT.get(key);
  if (held) return held;
  const job = speak(text, lang).finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, job);
  return job;
}

/**
 * The first stop's first words arrive while the tour is still being built:
 * start voicing them now so they are ready when the walk begins.
 */
export function prefetchSpeech(text: string, lang: string): void {
  void voice(text, lang).catch(() => {});
}

// -------------------------------------------------------------- library --

export type StopState = {
  script: "idle" | "writing" | "ready" | "failed";
  voice: "idle" | "recording" | "ready" | "failed";
  chunksReady: number;
  chunksTotal: number;
  error: string | null;
};

type Entry = {
  stop: Stop;
  script: string | null;
  cue: string | null;
  chunks: string[];
  uris: (string | null)[];
  /** A finished backend recording: one piece, its length known. */
  recordingMs: number | null;
  state: StopState;
};

const IDLE: StopState = { script: "idle", voice: "idle", chunksReady: 0, chunksTotal: 0, error: null };

class Library {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private version = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private scriptJobs = new Map<string, Promise<boolean>>();
  private audioJobs = new Map<string, Promise<void>>();
  disposed = false;

  constructor(
    private stops: Stop[],
    private req: TourRequest | null,
    private lang: string,
  ) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  entry(index: number): Entry | null {
    const stop = this.stops[index];
    if (!stop) return null;
    const held = this.entries.get(stop.id);
    if (held) return held;
    const fresh: Entry = {
      stop,
      script: stop.script ?? null,
      cue: stop.walkingCueToHere ?? null,
      chunks: [],
      uris: [],
      recordingMs: null,
      state: { ...IDLE },
    };
    if (fresh.script) this.prepare(fresh, stop.audio ?? null);
    this.entries.set(stop.id, fresh);
    return fresh;
  }

  private prepare(e: Entry, recording: { src: string; durationMs: number } | null) {
    if (recording) {
      e.chunks = [e.script ?? ""];
      e.uris = [null];
      e.recordingMs = recording.durationMs;
      e.state = { ...e.state, script: "ready", chunksTotal: 1 };
      // Fetched straight away: one file, and nothing to synthesise.
      void keepRecording(recording.src)
        .then((uri) => {
          e.uris = [uri];
          e.state = { ...e.state, voice: "ready", chunksReady: 1 };
        })
        .catch((err: Error) => {
          e.state = { ...e.state, voice: "failed", error: err.message };
        })
        .finally(() => this.emit());
      return;
    }
    e.chunks = chunkScript(e.script ?? "");
    e.uris = new Array(e.chunks.length).fill(null);
    e.state = { ...e.state, script: "ready", chunksTotal: e.chunks.length };
  }

  ensureScript(index: number): Promise<boolean> {
    const e = this.entry(index);
    if (!e) return Promise.resolve(false);
    if (e.script) return Promise.resolve(true);
    if (!this.req) return Promise.resolve(false);
    const running = this.scriptJobs.get(e.stop.id);
    if (running) return running;
    e.state = { ...e.state, script: "writing", error: null };
    this.emit();
    const job = writeStop(this.req, this.stops, index)
      .then((written) => {
        if (this.disposed) return false;
        e.script = written.script;
        e.cue = written.walkingCueToHere || e.cue;
        this.prepare(e, written.audio ?? null);
        return true;
      })
      .catch((err: Error) => {
        e.state = { ...e.state, script: "failed", error: err.message || "Could not write this stop." };
        return false;
      })
      .finally(() => {
        this.scriptJobs.delete(e.stop.id);
        this.emit();
      });
    this.scriptJobs.set(e.stop.id, job);
    return job;
  }

  ensureAudio(index: number): Promise<void> {
    const e = this.entry(index);
    if (!e) return Promise.resolve();
    const running = this.audioJobs.get(e.stop.id);
    if (running) return running;
    const job = (async () => {
      const ok = await this.ensureScript(index);
      if (!ok || this.disposed || e.recordingMs !== null) return;
      e.state = { ...e.state, voice: "recording" };
      this.emit();
      for (let i = 0; i < e.chunks.length; i++) {
        if (this.disposed) return;
        if (e.uris[i]) continue;
        const text = e.chunks[i];
        // Chained so requests go one at a time; the tail is caught so one
        // failure cannot poison every later piece.
        const made = this.queue.then(() => voice(text, this.lang));
        this.queue = made.catch(() => null);
        try {
          e.uris[i] = await made;
        } catch (err) {
          e.state = { ...e.state, voice: "failed", error: (err as Error).message || "The guide's voice was unavailable." };
          this.emit();
          return;
        }
        const last = i === e.chunks.length - 1;
        e.state = { ...e.state, chunksReady: i + 1, voice: last ? "ready" : "recording" };
        this.emit();
      }
    })().finally(() => this.audioJobs.delete(e.stop.id));
    this.audioJobs.set(e.stop.id, job);
    return job;
  }
}

// ----------------------------------------------------------------- hook --

export type Narration = {
  playing: boolean;
  preparing: boolean;
  waitingFor: string | null;
  position: number;
  duration: number;
  chunks: string[];
  chunkIndex: number;
  chunkStart: number;
  chunkDuration: number;
  failed: boolean;
  failReason: string | null;
  usingDeviceVoice: boolean;
  speedrun: boolean;
  cue: string | null;
  script: string | null;
  setSpeedrun: (on: boolean) => void;
  start: () => void;
  toggle: () => void;
  pauseAll: () => void;
  seek: (seconds: number) => void;
  retry: () => void;
};

export function useNarration({
  tour,
  lang,
  index,
  onAdvance,
  active,
  warm,
  album,
}: {
  tour: StoredTour | null;
  lang: string;
  index: number;
  onAdvance: () => void;
  active: boolean;
  warm: boolean;
  album?: string;
}): Narration {
  const [attempt, setAttempt] = useState(0);
  const library = useMemo(
    () => (tour ? new Library(tour.plan.stops, tour.req ?? null, tour.req?.lang ?? lang) : null),
    // A new library for a new tour (or a retry), not for every render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tour, attempt],
  );
  useEffect(() => () => {
    if (library) library.disposed = true;
  }, [library]);

  const noop = useCallback(() => () => {}, []);
  useSyncExternalStore(library?.subscribe ?? noop, library?.getVersion ?? (() => 0));

  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [wantPlay, setWantPlay] = useState(false);
  const [speedrun, setSpeedrun] = useState(false);
  /** Which piece the player holds: `${stopId}:${chunk}`. A ref for the effects, state for the screen. */
  const loaded = useRef<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /** The stop the phone's own voice has been asked to read. */
  const readAloud = useRef<string | null>(null);

  const entry = library?.entry(index) ?? null;
  const stop = tour?.plan.stops[index] ?? null;

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  }, []);

  // Words for this stop and the next, the voice for this one.
  useEffect(() => {
    if (!library || !(active || warm)) return;
    void library.ensureAudio(index);
    void library.ensureScript(index + 1);
  }, [library, index, active, warm]);

  // A new stop starts at its beginning.
  const [shownIndex, setShownIndex] = useState(index);
  if (shownIndex !== index) {
    setShownIndex(index);
    setChunkIndex(0);
  }

  const stopFailed = entry ? entry.state.script === "failed" || entry.state.voice === "failed" : false;

  // Load and play the piece the walker should be hearing, once it exists.
  useEffect(() => {
    if (!entry || !wantPlay || stopFailed) return;
    const key = `${entry.stop.id}:${chunkIndex}`;
    const uri = entry.uris[chunkIndex];
    if (loaded.current === key || !uri) return;
    loaded.current = key;
    queueMicrotask(() => setLoadedKey(key));
    player.replace({ uri, name: entry.stop.name });
    player.setActiveForLockScreen(true, { title: entry.stop.name, artist: album ?? tour?.plan.title ?? "Walk" });
    player.play();
  });

  // The end of a piece goes on to the next, and the end of a stop to the next stop.
  const onFinish = useRef(() => {});
  useEffect(() => {
    onFinish.current = () => {
      if (!entry) return;
      const lastPiece = speedrun || chunkIndex >= entry.chunks.length - 1;
      if (!lastPiece) setChunkIndex((c) => c + 1);
      else if (tour && index < tour.plan.stops.length - 1) onAdvance();
      else setWantPlay(false);
    };
  });
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) onFinish.current();
    });
    return () => sub.remove();
  }, [player]);

  // The phone's own voice when the guide's cannot be had.
  const deviceVoice = wantPlay && stopFailed;
  useEffect(() => {
    if (!deviceVoice || !stop || readAloud.current === stop.id) return;
    readAloud.current = stop.id;
    player.pause();
    Speech.stop();
    Speech.speak(entry?.script ?? `${stop.name}. ${stop.angle}`, {
      language: speechLocale(tour?.req?.lang ?? lang),
      rate: 0.95,
      onDone: () => {
        if (tour && index < tour.plan.stops.length - 1) onAdvance();
        else setWantPlay(false);
      },
    });
  }, [deviceVoice, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  const pauseAll = useCallback(() => {
    setWantPlay(false);
    readAloud.current = null;
    player.pause();
    Speech.stop();
  }, [player]);

  // Leaving the walk silences it.
  useEffect(() => {
    if (active || warm) return;
    player.pause();
    Speech.stop();
  }, [active, warm, player]);

  const start = useCallback(() => setWantPlay(true), []);

  const toggle = useCallback(() => {
    if (status.playing || deviceVoice) {
      pauseAll();
      return;
    }
    setWantPlay(true);
    if (entry && loaded.current === `${entry.stop.id}:${chunkIndex}`) player.play();
  }, [status.playing, deviceVoice, entry, chunkIndex, player, pauseAll]);

  // Lengths: the real one for the piece playing, estimates for the rest.
  const estimates = entry
    ? entry.recordingMs !== null
      ? [entry.recordingMs / 1000]
      : entry.chunks.map(estimateSeconds)
    : [];
  const heard = speedrun ? estimates.slice(0, 1) : estimates;
  const pieceLoaded = entry && loadedKey === `${entry.stop.id}:${chunkIndex}`;
  const chunkDuration = pieceLoaded && status.duration > 0 ? status.duration : heard[chunkIndex] ?? 0;
  const chunkStart = heard.slice(0, chunkIndex).reduce((a, b) => a + b, 0);
  const duration = heard.reduce((a, b) => a + b, 0) - (heard[chunkIndex] ?? 0) + chunkDuration;
  const position = chunkStart + (pieceLoaded ? status.currentTime : 0);

  const seek = useCallback(
    (seconds: number) => {
      if (!entry) return;
      let at = 0;
      for (let i = 0; i < heard.length; i++) {
        const len = i === chunkIndex ? chunkDuration : heard[i];
        if (seconds < at + len || i === heard.length - 1) {
          if (i === chunkIndex) void player.seekTo(Math.max(0, seconds - at));
          else if (entry.uris[i]) {
            setChunkIndex(i);
            setWantPlay(true);
          }
          return;
        }
        at += len;
      }
    },
    [entry, heard, chunkIndex, chunkDuration, player],
  );

  const waitingFor = !entry
    ? null
    : entry.state.script === "writing" || entry.state.script === "idle"
      ? "Writing…"
      : !entry.uris[chunkIndex]
        ? "Recording…"
        : null;

  return {
    playing: status.playing || deviceVoice,
    preparing: wantPlay && !status.playing && !deviceVoice && !stopFailed,
    waitingFor,
    position,
    duration,
    chunks: entry?.chunks ?? [],
    chunkIndex,
    chunkStart,
    chunkDuration,
    failed: stopFailed,
    failReason: entry?.state.error ?? null,
    usingDeviceVoice: deviceVoice,
    speedrun,
    cue: entry?.cue ?? null,
    script: entry?.script ?? null,
    setSpeedrun,
    start,
    toggle,
    pauseAll,
    seek,
    retry: () => {
      loaded.current = null;
      readAloud.current = null;
      setLoadedKey(null);
      setAttempt((a) => a + 1);
    },
  };
}

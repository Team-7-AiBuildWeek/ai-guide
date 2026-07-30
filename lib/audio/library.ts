"use client";

/**
 * Fetches and holds the narration for a tour.
 *
 * Two things arrive from the server, in this order: the words, then the voice.
 * Both are slow, and both are hidden from the walker the same way — by getting
 * a little of it now rather than all of it eventually.
 *
 *   - Scripts are written one stop at a time. The stop being listened to, and
 *     the one after it, are fetched; nothing else is written until the walker
 *     gets near it. A four-hour tour is twenty-odd stops and most walkers stop
 *     at six.
 *   - A script is synthesised in pieces. The first is ~25 seconds of speech and
 *     lands in a few seconds; the rest are made while it plays.
 *
 * Blobs are held as object URLs rather than base64 in localStorage — a long
 * tour is many megabytes, well past the storage quota, and object URLs are what
 * the <audio> element wants anyway.
 */

import { chunkScript, estimateSeconds } from "./chunk";
import type { Stop, TourRequest } from "@/lib/providers/types";

export type StopState = {
  /** Have we got the words yet. */
  script: "idle" | "writing" | "ready" | "failed";
  /**
   * Have we got the voice. Tracked apart from the words because they fail for
   * different reasons and only one of them is about Gemini's speech quota —
   * telling a walker "the Gemini voice was unavailable" when it was the script
   * that failed sends them looking in the wrong place.
   */
  voice: "idle" | "recording" | "ready" | "failed";
  /** Pieces synthesised out of pieces wanted. */
  chunksReady: number;
  chunksTotal: number;
  /** The first piece is the only one anyone waits for. */
  playable: boolean;
  /** Why it failed, in the provider's own words. */
  error: string | null;
};

const IDLE: StopState = {
  script: "idle",
  voice: "idle",
  chunksReady: 0,
  chunksTotal: 0,
  playable: false,
  error: null,
};

type Entry = {
  stop: Stop;
  script: string | null;
  cue: string | null;
  chunks: string[];
  urls: (string | null)[];
  state: StopState;
};

export class AudioLibrary {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot: Record<string, StopState> = {};
  private scriptJobs = new Map<string, Promise<void>>();
  private audioJobs = new Map<string, Promise<void>>();
  /**
   * Synthesis runs one at a time. Firing several pieces together trips the
   * Gemini free-tier quota and returns 429 for all but the first — and the
   * order matters more than the parallelism, because piece two is worthless
   * until piece one exists.
   */
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private stops: Stop[],
    private req: TourRequest | null,
    private lang: string,
    /** Called with each finished piece, in the order they were asked for. */
    private onChunk: (stopId: string, index: number, url: string) => void,
  ) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  /** Stable object identity between changes, so useSyncExternalStore behaves. */
  getSnapshot = () => this.snapshot;

  private emit() {
    const next: Record<string, StopState> = {};
    for (const [id, e] of this.entries) next[id] = e.state;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private entry(stopId: string): Entry | null {
    const held = this.entries.get(stopId);
    if (held) return held;
    const stop = this.stops.find((s) => s.id === stopId);
    if (!stop) return null;
    const fresh: Entry = {
      stop,
      script: stop.script ?? null,
      cue: stop.walkingCueToHere ?? null,
      chunks: [],
      urls: [],
      state: { ...IDLE, script: stop.script ? "ready" : "idle" },
    };
    if (fresh.script) this.prepareChunks(fresh);
    this.entries.set(stopId, fresh);
    return fresh;
  }

  stateOf(stopId: string): StopState {
    return this.snapshot[stopId] ?? this.entries.get(stopId)?.state ?? IDLE;
  }

  scriptOf(stopId: string): string | null {
    return this.entries.get(stopId)?.script ?? null;
  }

  cueOf(stopId: string): string | null {
    return this.entries.get(stopId)?.cue ?? null;
  }

  /**
   * The narration, in the pieces it is spoken in.
   *
   * Split at sentence ends for synthesis, which makes them the right size to
   * show as captions too — a caption that changed mid-sentence would be worse
   * than none.
   */
  chunksOf(stopId: string): string[] {
    return this.entries.get(stopId)?.chunks ?? [];
  }

  /** Seconds each piece should run, for the scrubber before they exist. */
  estimatesFor(stopId: string): number[] {
    const e = this.entries.get(stopId);
    return e ? e.chunks.map(estimateSeconds) : [];
  }

  /**
   * Pieces already synthesised, for an engine that has just been pointed at
   * this stop. Without this, everything made before the walker's first tap is
   * made and then thrown away.
   */
  readyChunks(stopId: string): [number, string][] {
    const e = this.entries.get(stopId);
    if (!e) return [];
    const out: [number, string][] = [];
    e.urls.forEach((u, i) => {
      if (u) out.push([i, u]);
    });
    return out;
  }

  private prepareChunks(e: Entry) {
    e.chunks = chunkScript(e.script ?? "");
    e.urls = new Array(e.chunks.length).fill(null);
    e.state = { ...e.state, script: "ready", chunksTotal: e.chunks.length };
  }

  // --------------------------------------------------------------- words --

  /** Write the narration for a stop, if it has not been written already. */
  async ensureScript(stopId: string): Promise<boolean> {
    const e = this.entry(stopId);
    if (!e) return false;
    if (e.script) return true;
    if (!this.req) return false;

    const running = this.scriptJobs.get(stopId);
    if (running) {
      await running;
      return !!this.entries.get(stopId)?.script;
    }

    e.state = { ...e.state, script: "writing" };
    this.emit();

    const position = this.stops.findIndex((s) => s.id === stopId);
    const job = (async () => {
      try {
        const res = await fetch("/api/stops/script", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            req: this.req,
            stop: e.stop,
            previous: position > 0 ? this.stops[position - 1] : null,
            position: position + 1,
            total: this.stops.length,
          }),
        });
        const body = (await res.json()) as {
          script?: string;
          walkingCueToHere?: string;
          error?: string;
        };
        if (!res.ok || !body.script) {
          throw new Error(body?.error ?? `Could not write this stop (${res.status})`);
        }
        if (this.disposed) return;
        e.script = body.script;
        e.cue = body.walkingCueToHere ?? e.cue;
        this.prepareChunks(e);
      } catch (err) {
        e.state = {
          ...e.state,
          script: "failed",
          error: err instanceof Error ? err.message : "Could not write this stop.",
        };
      } finally {
        this.scriptJobs.delete(stopId);
        this.emit();
      }
    })();

    this.scriptJobs.set(stopId, job);
    await job;
    return !!e.script;
  }

  // --------------------------------------------------------------- voice --

  /**
   * Synthesise a stop, piece by piece, in order.
   *
   * Returns as soon as the first piece is playable; the rest carry on in the
   * background. Each finished piece is handed straight to the engine, which is
   * either already playing it or waiting for it.
   */
  async ensureAudio(stopId: string): Promise<void> {
    const existing = this.audioJobs.get(stopId);
    if (existing) return existing;

    const job = (async () => {
      const ok = await this.ensureScript(stopId);
      const e = this.entries.get(stopId);
      if (!ok || !e || this.disposed) return;

      e.state = { ...e.state, voice: "recording" };
      this.emit();

      for (let i = 0; i < e.chunks.length; i++) {
        if (this.disposed) return;
        if (e.urls[i]) continue;
        const made = await this.synthesise(e.chunks[i]);
        if (this.disposed) return;
        if ("error" in made) {
          // One failed piece stops this stop rather than leaving a hole in the
          // middle of a sentence; the caller falls back to the device voice.
          e.state = { ...e.state, voice: "failed", error: made.error };
          this.emit();
          return;
        }
        e.urls[i] = made.url;
        e.state = {
          ...e.state,
          chunksReady: i + 1,
          playable: true,
          voice: i === e.chunks.length - 1 ? "ready" : "recording",
        };
        this.emit();
        this.onChunk(stopId, i, made.url);
      }
    })().finally(() => {
      this.audioJobs.delete(stopId);
    });

    this.audioJobs.set(stopId, job);
    return job;
  }

  private synthesise(text: string): Promise<{ url: string } | { error: string }> {
    // Chained onto the queue so requests are serialised, and the tail is
    // caught so one failure cannot poison every later piece.
    const job = this.queue.then(async (): Promise<{ url: string } | { error: string }> => {
      try {
        const res = await fetch("/api/audio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, lang: this.lang }),
        });
        if (!res.ok) {
          // The route answers failures as JSON, and the provider puts the
          // useful sentence in there — "daily speech quota is spent", not
          // "502". Losing it is what made this unexplainable to a walker.
          let message = `Could not record this stop (${res.status})`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            /* not JSON — keep the status */
          }
          return { error: message };
        }
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob) };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Could not reach the voice." };
      }
    });
    this.queue = job.catch(() => ({ error: "Could not reach the voice." }) as const);
    return job;
  }

  /**
   * Get the next stop's words ready while the walker is still on this one.
   *
   * Words only, not voice: synthesis is serialised, and putting the next
   * stop's audio in the queue would make the current stop's later pieces wait
   * behind it — the walker would hear a gap in what they are listening to now
   * to save a wait they may never reach.
   */
  prefetchAround(index: number) {
    const next = this.stops[index + 1];
    if (next) void this.ensureScript(next.id);
  }

  /** Object URLs are not garbage collected on their own. */
  dispose() {
    this.disposed = true;
    for (const e of this.entries.values()) {
      for (const u of e.urls) if (u) URL.revokeObjectURL(u);
    }
    this.entries.clear();
    this.scriptJobs.clear();
    this.audioJobs.clear();
    this.emit();
  }
}

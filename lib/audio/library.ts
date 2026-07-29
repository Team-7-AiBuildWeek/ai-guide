"use client";

/**
 * Fetches and holds the narration for a tour.
 *
 * Synthesis takes about eight seconds, which is an eternity standing on a
 * street corner. So the library fetches ahead: the current stop first, then
 * the next one, in the background, while the walker listens. By the time they
 * reach stop two it is already in memory.
 *
 * Blobs are held as object URLs rather than base64 in localStorage — a
 * six-stop tour at two depths is several megabytes, well past the storage
 * quota, and object URLs are what the <audio> element wants anyway.
 */

import type { Depth } from "./engine";

export type Clip = { url: string; bytes: number };
export type ClipState = "idle" | "loading" | "ready" | "failed";

export type LibraryStop = {
  id: string;
  name: string;
  scriptShort: string;
  scriptFull: string;
};

type Key = `${string}:${Depth}`;

const key = (stopId: string, depth: Depth): Key => `${stopId}:${depth}`;

export class AudioLibrary {
  private clips = new Map<Key, Clip>();
  private states = new Map<Key, ClipState>();
  private inflight = new Map<Key, Promise<Clip | null>>();
  private listeners = new Set<() => void>();
  private snapshot: Record<string, ClipState> = {};
  /**
   * Synthesis runs one at a time. Firing the current stop, the other depth and
   * the next stop together is three concurrent calls, which trips the Gemini
   * free-tier quota and returns 429 for two of them.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private stops: LibraryStop[],
    private lang: string,
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
    this.snapshot = Object.fromEntries(this.states) as Record<string, ClipState>;
    this.listeners.forEach((l) => l());
  }

  stateOf(stopId: string, depth: Depth): ClipState {
    return this.states.get(key(stopId, depth)) ?? "idle";
  }

  urlOf(stopId: string, depth: Depth): string | null {
    return this.clips.get(key(stopId, depth))?.url ?? null;
  }

  /** Fetch one recording, or return the one already held. */
  async fetch(stopId: string, depth: Depth): Promise<Clip | null> {
    const k = key(stopId, depth);
    const held = this.clips.get(k);
    if (held) return held;

    const running = this.inflight.get(k);
    if (running) return running;

    const stop = this.stops.find((s) => s.id === stopId);
    if (!stop) return null;
    const text = depth === "short" ? stop.scriptShort : stop.scriptFull;
    if (!text?.trim()) return null;

    this.states.set(k, "loading");
    this.emit();

    // Chained onto the queue, so requests are serialised. The tail is caught
    // so one failure cannot poison every later fetch.
    const job = this.queue.then(async () => {
      try {
        const res = await fetch("/api/audio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, lang: this.lang }),
        });
        if (!res.ok) throw new Error(`Synthesis failed (${res.status})`);
        const blob = await res.blob();
        const clip: Clip = { url: URL.createObjectURL(blob), bytes: blob.size };
        this.clips.set(k, clip);
        this.states.set(k, "ready");
        this.emit();
        return clip;
      } catch {
        this.states.set(k, "failed");
        this.emit();
        return null;
      } finally {
        this.inflight.delete(k);
      }
    });

    this.queue = job.catch(() => null);
    this.inflight.set(k, job);
    return job;
  }

  /**
   * Warm the stop after this one, so walking to it costs no wait. Deliberately
   * one stop deep: fetching the whole tour up front is a dozen calls the
   * walker may never listen to.
   */
  prefetchAround(index: number, depth: Depth) {
    // The other depth of the stop you are standing at comes FIRST. It is the
    // control most likely to be pressed in the next minute, and the queue is
    // serial — putting the next stop ahead of it means a depth toggle waits
    // through someone else's synthesis before its own.
    const here = this.stops[index];
    if (here) void this.fetch(here.id, depth === "short" ? "full" : "short");
    const next = this.stops[index + 1];
    if (next) void this.fetch(next.id, depth);
  }

  /** Object URLs are not garbage collected on their own. */
  dispose() {
    this.clips.forEach((c) => URL.revokeObjectURL(c.url));
    this.clips.clear();
    this.states.clear();
    this.inflight.clear();
    this.emit();
  }
}

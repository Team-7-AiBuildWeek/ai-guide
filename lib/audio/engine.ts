/**
 * The audio engine.
 *
 * Rules this file exists to enforce, all of them learned the hard way on iOS:
 *
 *  1. ONE <audio> element for the whole session. Born on the first user
 *     gesture, never destroyed, never replaced. Changing stop means changing
 *     `src` on that same element. Construct a new Audio() later and iOS will
 *     refuse to play it, silently.
 *  2. Nothing plays outside a user gesture. `unlock()` is the only place the
 *     element is created, and it must be called synchronously from a tap.
 *  3. Media Session is wired, so lock-screen and earbud controls work — which
 *     is the whole point of an app you walk with the phone in your pocket.
 *  4. Position and stop are persisted on every meaningful change, so a reload
 *     or a killed tab costs the walker nothing.
 *
 * No React in here: this has to survive re-renders, fast refresh and route
 * changes.
 */

export type Depth = "short" | "full";

export type Track = {
  /** Stable across depth changes — this is the stop, not the recording. */
  stopId: string;
  index: number;
  depth: Depth;
  src: string;
  title: string;
  subtitle?: string;
  /** Shown on the lock screen. The city, when we know which one. */
  album?: string;
};

export type EngineState = {
  ready: boolean;
  track: Track | null;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  error: string | null;
};

export type Persisted = {
  stopId: string;
  index: number;
  depth: Depth;
  position: number;
  updatedAt: number;
};

const STORAGE_KEY = "btour:playback:v1";
const PERSIST_EVERY_MS = 1000;

type Listener = () => void;

class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private lastPersist = 0;
  private onEnded: (() => void) | null = null;
  private onNext: (() => void) | null = null;
  private onPrev: (() => void) | null = null;

  private state: EngineState = {
    ready: false,
    track: null,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    error: null,
  };

  // ----------------------------------------------------------------- store

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getState = (): EngineState => this.state;

  private set(patch: Partial<EngineState>) {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof EngineState)[]) {
      if (this.state[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---------------------------------------------------------------- unlock

  /**
   * Must be called synchronously inside a tap. Creates the one and only
   * <audio> element, so every later play() — including ones triggered by
   * auto-advance or the lock screen — is already blessed.
   */
  unlock(): HTMLAudioElement {
    if (this.el) return this.el;

    const el = document.createElement("audio");
    el.preload = "auto";
    el.setAttribute("data-audio-engine", "true");
    el.style.display = "none";
    document.body.appendChild(el);

    el.addEventListener("play", () => {
      this.set({ playing: true });
      this.syncPlaybackState();
    });
    el.addEventListener("pause", () => {
      this.set({ playing: false });
      this.syncPlaybackState();
      this.persist(true);
    });
    el.addEventListener("timeupdate", () => {
      this.set({ position: el.currentTime });
      this.persist(false);
      this.syncPosition();
    });
    el.addEventListener("loadedmetadata", () => {
      this.set({ duration: el.duration || 0 });
      this.syncPosition();
    });
    el.addEventListener("canplay", () => this.set({ loading: false }));
    el.addEventListener("waiting", () => this.set({ loading: true }));
    el.addEventListener("ended", () => {
      this.set({ playing: false });
      this.persist(true);
      this.onEnded?.();
    });
    el.addEventListener("error", () => {
      const code = el.error?.code;
      this.set({ loading: false, error: code ? `Audio error ${code}` : "Audio error" });
    });

    // A killed tab never fires 'pause'. These are the last chance to write.
    const flush = () => this.persist(true);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });

    this.el = el;
    this.set({ ready: true });
    this.installHandlers();
    return el;
  }

  get unlocked() {
    return this.el !== null;
  }

  // --------------------------------------------------------------- control

  /** Point the element at a stop. */
  async load(track: Track, opts: { startAt?: number; autoplay?: boolean } = {}) {
    const el = this.el ?? this.unlock();
    const startAt = opts.startAt ?? 0;

    this.set({ track, loading: true, error: null, position: startAt, duration: 0 });
    el.src = track.src;
    el.load();
    if (startAt > 0) this.seekWhenReady(startAt);

    this.setMetadata(track);
    this.persist(true);
    if (opts.autoplay) await this.play();
  }

  /**
   * Swap short <-> full for the stop the walker is already standing at.
   *
   * The two recordings are different lengths, so position is carried across
   * proportionally rather than absolutely — landing at the same *point in the
   * story* rather than the same number of seconds, which would drop you into
   * the middle of a sentence or past the end entirely.
   */
  async swapDepth(track: Track, ratio: number, resume?: boolean) {
    const el = this.el ?? this.unlock();
    // `resume` is the caller's intent, captured when the walker tapped. The
    // element's own paused flag is not enough: synthesising the other depth
    // can outlast the recording that was playing, so by now it has ended and
    // looks paused — but the walker did ask to keep listening.
    const wasPlaying = resume ?? !el.paused;

    this.set({ track, loading: true, error: null, duration: 0 });
    el.src = track.src;
    el.load();

    const seek = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) el.currentTime = Math.min(d - 0.25, d * ratio);
    };
    if (el.readyState >= 1) seek();
    el.addEventListener("loadedmetadata", seek, { once: true });

    this.setMetadata(track);
    this.persist(true);
    // Allowed without a fresh gesture: the element was unlocked long ago.
    if (wasPlaying) await this.play();
  }

  private seekWhenReady(t: number) {
    const el = this.el;
    if (!el) return;
    const apply = () => {
      try {
        el.currentTime = Math.max(0, t);
      } catch {
        /* seeking before metadata; the listener retries */
      }
    };
    if (el.readyState >= 1) apply();
    el.addEventListener("loadedmetadata", apply, { once: true });
  }

  async play() {
    const el = this.el;
    if (!el || !el.src) return;
    try {
      await el.play();
      this.set({ error: null });
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : "Playback blocked" });
    }
  }

  pause() {
    this.el?.pause();
  }

  toggle() {
    if (!this.el) return;
    if (this.el.paused) void this.play();
    else this.pause();
  }

  seek(seconds: number) {
    const el = this.el;
    if (!el) return;
    const d = el.duration || 0;
    el.currentTime = Math.min(Math.max(0, seconds), d > 0 ? d : seconds);
    this.set({ position: el.currentTime });
    this.persist(true);
  }

  nudge(delta: number) {
    if (this.el) this.seek(this.el.currentTime + delta);
  }

  /** 0–1 through the current recording, for carrying position across a swap. */
  get ratio(): number {
    const el = this.el;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return 0;
    return el.currentTime / el.duration;
  }

  setHandlers(h: { onEnded?: () => void; onNext?: () => void; onPrev?: () => void }) {
    if ("onEnded" in h) this.onEnded = h.onEnded ?? null;
    if ("onNext" in h) this.onNext = h.onNext ?? null;
    if ("onPrev" in h) this.onPrev = h.onPrev ?? null;
    this.installHandlers();
  }

  // -------------------------------------------------------- media session

  private setMetadata(track: Track) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.subtitle ?? "Walking tour",
        album: track.album ?? "Walking tour",
        artwork: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
    } catch {
      /* MediaMetadata unsupported */
    }
  }

  private installHandlers() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const safe = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* action unsupported here */
      }
    };
    safe("play", () => void this.play());
    safe("pause", () => this.pause());
    safe("stop", () => this.pause());
    safe("seekbackward", (d) => this.nudge(-(d.seekOffset ?? 15)));
    safe("seekforward", (d) => this.nudge(d.seekOffset ?? 15));
    safe("seekto", (d) => {
      if (typeof d.seekTime === "number") this.seek(d.seekTime);
    });
    safe("previoustrack", this.onPrev ? () => this.onPrev?.() : null);
    safe("nexttrack", this.onNext ? () => this.onNext?.() : null);
  }

  private syncPlaybackState() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = this.state.playing ? "playing" : "paused";
  }

  private syncPosition() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const el = this.el;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: el.duration,
        playbackRate: el.playbackRate || 1,
        position: Math.min(el.currentTime, el.duration),
      });
    } catch {
      /* Safari throws if position > duration mid-seek */
    }
  }

  // ----------------------------------------------------------- persistence

  private persist(force: boolean) {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (!force && now - this.lastPersist < PERSIST_EVERY_MS) return;
    this.lastPersist = now;
    const { track, position } = this.state;
    if (!track) return;
    try {
      const payload: Persisted = {
        stopId: track.stopId,
        index: track.index,
        depth: track.depth,
        position,
        updatedAt: now,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* private mode / quota */
    }
  }

  static restore(): Persisted | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as Persisted;
      return typeof p?.stopId === "string" ? p : null;
    } catch {
      return null;
    }
  }

  static clear() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Survive fast refresh and double module evaluation in dev. */
const KEY = "__btour_audio_engine__";
type G = typeof globalThis & { [KEY]?: AudioEngine };
const g = globalThis as G;

export const audioEngine: AudioEngine = g[KEY] ?? (g[KEY] = new AudioEngine());
export const restorePlayback = AudioEngine.restore;
export const clearPlayback = AudioEngine.clear;

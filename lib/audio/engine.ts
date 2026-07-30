/**
 * The audio engine.
 *
 * Rules this file exists to enforce, all of them learned the hard way on iOS:
 *
 *  1. ONE <audio> element for the whole session. Born on the first user
 *     gesture, never destroyed, never replaced. Changing what is playing means
 *     changing `src` on that same element. Construct a new Audio() later and
 *     iOS will refuse to play it, silently.
 *  2. Nothing plays outside a user gesture. `unlock()` is the only place the
 *     element is created, and it must be called synchronously from a tap.
 *  3. Media Session is wired, so lock-screen and earbud controls work — which
 *     is the whole point of an app you walk with the phone in your pocket.
 *  4. Position and stop are persisted on every meaningful change, so a reload
 *     or a killed tab costs the walker nothing.
 *
 * A stop's narration is not one recording but several, spoken in order. Five
 * minutes of speech takes about half a minute to synthesise and the walker
 * spends all of it watching a spinner; in pieces, the first arrives in a few
 * seconds and the rest are made while they listen. Everything outside this
 * file — the scrubber, the skip buttons, the lock screen — still sees one
 * continuous recording with one position and one duration, which is what the
 * bookkeeping below is for.
 *
 * No React in here: this has to survive re-renders, fast refresh and route
 * changes.
 */

export type Track = {
  stopId: string;
  index: number;
  title: string;
  subtitle?: string;
  /** Shown on the lock screen. The city, when we know which one. */
  album?: string;
  /**
   * Seconds each piece is expected to run, from its word count. The scrubber
   * needs a total before the last piece exists, and "unknown" is not something
   * you can draw.
   */
  chunkEstimates: number[];
};

export type EngineState = {
  ready: boolean;
  track: Track | null;
  playing: boolean;
  /** Fetching or synthesising — including waiting for the next piece. */
  loading: boolean;
  /** Seconds into the whole stop, not into the piece currently sounding. */
  position: number;
  /** Real where known, estimated for pieces that do not exist yet. */
  duration: number;
  /** How much of the narration has actually arrived, 0–1. */
  buffered: number;
  /**
   * Which piece is sounding.
   *
   * The pieces are split at sentence ends, so this is the closest thing to a
   * cursor into the written narration that exists without word timings — which
   * is what the captions are built on.
   */
  chunkIndex: number;
  error: string | null;
};

export type Persisted = {
  stopId: string;
  index: number;
  position: number;
  updatedAt: number;
};

const STORAGE_KEY = "btour:playback:v2";
const PERSIST_EVERY_MS = 1000;

type Listener = () => void;

class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private lastPersist = 0;
  private onEnded: (() => void) | null = null;
  private onNext: (() => void) | null = null;
  private onPrev: (() => void) | null = null;

  // ------------------------------------------------------------- playlist
  /** One object URL per piece; null until that piece has been synthesised. */
  private chunks: (string | null)[] = [];
  /** Real durations, filled in as each piece loads. */
  private measured: number[] = [];
  private playIndex = 0;
  /** True when a piece ended and the next one has not arrived yet. */
  private starving = false;
  /** Set while the walker is playing, so a late piece starts by itself. */
  private wantPlay = false;

  private state: EngineState = {
    ready: false,
    track: null,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    buffered: 0,
    chunkIndex: 0,
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

  // ------------------------------------------------------------ bookkeeping

  /**
   * How wrong the estimates are turning out to be, as a ratio.
   *
   * The estimates come from a word count at an assumed speaking rate, and the
   * voice does not read at exactly that rate. Without this the total shown on
   * the scrubber falls as each piece plays and its real length replaces its
   * guess — a five-minute stop visibly shrinking to three while you listen to
   * it. Measuring the drift once and applying it to what is left keeps the
   * total still.
   */
  private get calibration(): number {
    const est = this.state.track?.chunkEstimates ?? [];
    let measured = 0;
    let expected = 0;
    for (let i = 0; i < this.measured.length; i++) {
      if (this.measured[i] > 0 && (est[i] ?? 0) > 0) {
        measured += this.measured[i];
        expected += est[i];
      }
    }
    return expected > 0 ? measured / expected : 1;
  }

  /** Best known length of one piece: measured if it has played, else guessed. */
  private lengthOf(i: number): number {
    const m = this.measured[i];
    if (Number.isFinite(m) && m > 0) return m;
    return (this.state.track?.chunkEstimates[i] ?? 0) * this.calibration;
  }

  private get totalDuration(): number {
    const n = this.state.track?.chunkEstimates.length ?? 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.lengthOf(i);
    return sum;
  }

  /** Seconds of narration before the piece at `i`. */
  private elapsedBefore(i: number): number {
    let sum = 0;
    for (let k = 0; k < i; k++) sum += this.lengthOf(k);
    return sum;
  }

  private syncDerived() {
    const el = this.el;
    const within = el && Number.isFinite(el.currentTime) ? el.currentTime : 0;
    const ready = this.chunks.filter((c) => c !== null).length;
    const total = this.chunks.length || 1;
    this.set({
      position: this.elapsedBefore(this.playIndex) + within,
      duration: this.totalDuration,
      buffered: ready / total,
      chunkIndex: this.playIndex,
    });
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
      // A piece ending fires 'pause' on some browsers before 'ended'. While
      // pieces are still being handed over, that is not the walker stopping.
      if (!this.starving) this.set({ playing: false });
      this.syncPlaybackState();
      this.persist(true);
    });
    el.addEventListener("timeupdate", () => {
      this.syncDerived();
      this.persist(false);
      this.syncPosition();
    });
    el.addEventListener("loadedmetadata", () => {
      // The real length of this piece replaces its estimate, which nudges the
      // total towards the truth as the walk goes on.
      if (Number.isFinite(el.duration) && el.duration > 0) {
        this.measured[this.playIndex] = el.duration;
      }
      this.syncDerived();
      this.syncPosition();
    });
    el.addEventListener("canplay", () => this.set({ loading: false }));
    el.addEventListener("waiting", () => this.set({ loading: true }));
    el.addEventListener("ended", () => this.onChunkEnded());
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

  /**
   * Point the engine at a stop.
   *
   * The pieces arrive afterwards, through `setChunk`. Calling this with none
   * of them ready is normal: playback starts the moment the first lands.
   */
  async loadStop(track: Track, opts: { startAt?: number; autoplay?: boolean } = {}) {
    const el = this.el ?? this.unlock();
    el.pause();
    el.removeAttribute("src");

    this.chunks = new Array(track.chunkEstimates.length).fill(null);
    this.measured = new Array(track.chunkEstimates.length).fill(0);
    this.playIndex = 0;
    this.starving = false;
    this.wantPlay = opts.autoplay ?? false;

    this.set({
      track,
      loading: true,
      error: null,
      position: opts.startAt ?? 0,
      duration: track.chunkEstimates.reduce((a, b) => a + b, 0),
      buffered: 0,
      chunkIndex: 0,
      playing: false,
    });

    this.setMetadata(track);
    this.persist(true);

    if (opts.startAt && opts.startAt > 0) {
      this.pendingSeek = opts.startAt;
      // Open at the piece the walker had reached rather than at the first one.
      // Without this, the first piece to arrive is the one that starts playing
      // — a minute of narration they already heard — while the seek sits
      // waiting for a piece further in.
      const at = this.chunkAt(opts.startAt);
      if (at) this.playIndex = at.index;
    }
  }

  /** Where to jump to as soon as enough pieces exist to get there. */
  private pendingSeek: number | null = null;

  /**
   * Hand a finished piece to the engine.
   *
   * Ignored if it belongs to a stop the walker has already left — a slow
   * synthesis landing after they walked on must not interrupt what is playing.
   */
  setChunk(stopId: string, i: number, url: string) {
    if (this.state.track?.stopId !== stopId) return;
    if (this.chunks[i]) return;
    this.chunks[i] = url;
    this.syncDerived();

    // Nothing playing yet, and this is the piece we are waiting on.
    const idle = !this.el?.src || this.starving;
    if (idle && i === this.playIndex) {
      void this.playChunk(this.playIndex, { autoplay: this.wantPlay || this.starving });
    }
    if (this.pendingSeek !== null) {
      const target = this.pendingSeek;
      const reachable = this.chunkAt(target);
      if (reachable !== null && this.chunks[reachable.index]) {
        this.pendingSeek = null;
        this.seek(target);
      }
    }
  }

  /** Which piece a moment in the narration falls in, and how far into it. */
  private chunkAt(seconds: number): { index: number; offset: number } | null {
    const n = this.chunks.length;
    if (n === 0) return null;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const len = this.lengthOf(i);
      if (seconds < acc + len || i === n - 1) return { index: i, offset: Math.max(0, seconds - acc) };
      acc += len;
    }
    return { index: n - 1, offset: 0 };
  }

  private async playChunk(i: number, opts: { autoplay: boolean; offset?: number }) {
    const el = this.el ?? this.unlock();
    const url = this.chunks[i];
    if (!url) {
      // Not made yet. Sit still and let setChunk restart us.
      this.starving = true;
      this.set({ loading: true });
      return;
    }
    this.starving = false;
    this.playIndex = i;
    this.set({ loading: true, error: null });
    el.src = url;
    el.load();

    const offset = opts.offset ?? 0;
    if (offset > 0) {
      const apply = () => {
        try {
          el.currentTime = Math.min(offset, (el.duration || offset) - 0.1);
        } catch {
          /* metadata not in yet; the listener below retries */
        }
      };
      if (el.readyState >= 1) apply();
      else el.addEventListener("loadedmetadata", apply, { once: true });
    }

    this.syncDerived();
    if (opts.autoplay) await this.play();
  }

  private onChunkEnded() {
    const last = this.playIndex >= this.chunks.length - 1;
    if (last) {
      this.starving = false;
      this.wantPlay = false;
      this.set({ playing: false });
      this.persist(true);
      this.onEnded?.();
      return;
    }

    const next = this.playIndex + 1;
    if (this.chunks[next]) {
      void this.playChunk(next, { autoplay: true });
    } else {
      // The narration has outrun the synthesis. Hold position and wait — the
      // walker sees "still writing", not a stop that ended early.
      this.playIndex = next;
      this.starving = true;
      this.wantPlay = true;
      this.set({ loading: true });
      this.syncDerived();
    }
  }

  async play() {
    const el = this.el;
    if (!el) return;
    this.wantPlay = true;
    // Asked to play while waiting on a piece: remember the intent, and the
    // moment it lands it starts by itself.
    if (!el.src) {
      const url = this.chunks[this.playIndex];
      if (!url) {
        this.starving = true;
        this.set({ loading: true });
        return;
      }
      await this.playChunk(this.playIndex, { autoplay: true });
      return;
    }
    try {
      await el.play();
      this.set({ error: null });
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : "Playback blocked" });
    }
  }

  pause() {
    this.wantPlay = false;
    this.starving = false;
    this.el?.pause();
    this.set({ playing: false });
  }

  toggle() {
    if (this.state.playing || this.starving) this.pause();
    else void this.play();
  }

  /** Seconds into the whole stop, across pieces. */
  seek(seconds: number) {
    const el = this.el;
    if (!el) return;
    const total = this.totalDuration;
    const target = Math.min(Math.max(0, seconds), total > 0 ? total : seconds);
    const at = this.chunkAt(target);
    if (!at) return;

    if (at.index === this.playIndex && el.src) {
      try {
        el.currentTime = at.offset;
      } catch {
        /* not seekable yet */
      }
      this.syncDerived();
      this.persist(true);
      return;
    }

    if (!this.chunks[at.index]) {
      // Scrubbing past what has been made. Remember it and go as far as we can.
      this.pendingSeek = target;
      this.set({ loading: true });
      return;
    }
    void this.playChunk(at.index, { autoplay: this.state.playing || this.wantPlay, offset: at.offset });
    this.persist(true);
  }

  nudge(delta: number) {
    this.seek(this.state.position + delta);
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
    const { position, duration } = this.state;
    if (!(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: this.el?.playbackRate || 1,
        position: Math.min(position, duration),
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

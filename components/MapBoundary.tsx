"use client";

/**
 * The map's own safety net.
 *
 * The map is the backdrop, not the walk. When something inside it throws — the
 * WebGL context Safari takes back, a style that arrives broken, a bug nobody
 * has met yet — the error used to climb to the page's boundary and replace the
 * whole screen with "Something went wrong", taking the player, the directions
 * and the narration with it. Caught here, only the map is lost, and only for a
 * moment: it is built again from scratch, and everything on top of it carries
 * on.
 *
 * The map can also ask for this itself (MapRebuild, below) when it has stopped
 * drawing without anything throwing — the commonest failure of all on Safari.
 *
 * Rebuilt a few times with a growing pause, then left as a plain background
 * with a button, so a map that cannot be drawn on this device does not spin in
 * a loop of rebuilding it. Every catch is reported to /api/client-error, so a
 * failure that is being hidden from the walker is not hidden from us.
 */

import { Component, createContext, type ReactNode } from "react";

/**
 * Asks for the map to be thrown away and built again, for failures that do not
 * throw: a WebGL context the browser never gives back, a style that never
 * arrives. The map is alive but draws nothing, so there is no error to catch —
 * the map has to say so itself (see TourMap).
 */
export const MapRebuild = createContext<(reason: string) => void>(() => {});

/** Rebuilds tried before giving up until asked. */
const MAX_REBUILDS = 3;

/** A quiet stretch after which earlier failures stop counting. */
const FORGIVE_MS = 60_000;

type State = { failed: boolean; gaveUp: boolean; generation: number };

export default class MapBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, gaveUp: false, generation: 0 };
  /** Failures in the current run, and when the last one was. Not state: nothing is drawn from them. */
  private attempt = 0;
  private lastFailAt = 0;
  private timer: number | undefined;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.fail(error.message, error.stack);
  }

  /** The map is alive but not drawing; rebuild it as if it had thrown. */
  private requestRebuild = (reason: string) => {
    if (this.state.failed) return;
    this.setState({ failed: true });
    this.fail(reason);
  };

  private fail(message: string, stack?: string) {
    const now = Date.now();
    this.attempt = now - this.lastFailAt > FORGIVE_MS ? 1 : this.attempt + 1;
    this.lastFailAt = now;
    const attempt = this.attempt;
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        stack: stack?.split("\n").slice(0, 6).join("\n"),
        path: location.pathname,
        agent: navigator.userAgent,
        where: `map (rebuild ${attempt}${attempt > MAX_REBUILDS ? ", gave up" : ""})`,
      }),
    }).catch(() => {});
    window.clearTimeout(this.timer);
    // Rebuilt from a timer rather than from here, so no state changes while
    // React is still handling the error.
    this.timer = window.setTimeout(
      attempt <= MAX_REBUILDS ? this.rebuild : () => this.setState({ gaveUp: true }),
      attempt <= MAX_REBUILDS ? 400 * attempt : 0,
    );
  }

  componentWillUnmount() {
    window.clearTimeout(this.timer);
  }

  private rebuild = () => this.setState((s) => ({ failed: false, gaveUp: false, generation: s.generation + 1 }));

  private retry = () => {
    this.attempt = 0;
    this.lastFailAt = 0;
    this.rebuild();
  };

  render() {
    if (!this.state.failed) {
      // Keyed by the attempt, so a rebuild is a fresh map rather than the
      // broken one handed back.
      return (
        <MapRebuild.Provider value={this.requestRebuild}>
          <div key={this.state.generation} className="contents">
            {this.props.children}
          </div>
        </MapRebuild.Provider>
      );
    }
    return (
      <div className="flex h-full w-full items-start justify-center bg-[color:var(--canvas)] pt-[max(5rem,calc(var(--safe-top)+4rem))]">
        {this.state.gaveUp ? (
          <button
            type="button"
            onClick={this.retry}
            className="btn btn--quiet btn--small"
          >
            Map unavailable — try again
          </button>
        ) : null}
      </div>
    );
  }
}

"use client";

/**
 * "Thinking…" while the guide works out an answer — React Bits' ThoughtLine.
 *
 * The line breathes and a sheen sweeps it while the answer is coming, a clock
 * counts beside it, and when the answer lands the words crossfade into
 * "Thought for 3.2s" and the clock glides over to sit after them.
 *
 * Ported from the JavaScript original as it came, with one change: the three
 * icons (sparkle, chevron, tick) are drawn inline rather than pulled from
 * @hugeicons, the same choice PromptBar made — one component's worth of icons
 * is not worth an icon package.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const GLYPH_DONE = 0.55;
const EMPTY_STEPS: string[] = [];

const fmt = (ds: number) =>
  ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`;
const spoken = (ds: number) =>
  ds < 600
    ? `${(ds / 10).toFixed(1)} seconds`
    : `${Math.floor(ds / 600)} minutes ${((ds % 600) / 10).toFixed(1)} seconds`;

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
      <path d="M18.5 15.5c.25 1.6 1 2.35 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.15 2.25-.9 2.5-2.5Z" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Tick() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function ThoughtLine({
  label = "Thinking…",
  doneLabel = "",
  renderLabel,
  glyph = "sparkle",
  steps = EMPTY_STEPS,
  collapsible = true,
  collapseOnSettle = true,
  color = "currentColor",
  glyphColor = "",
  fontSize = 16,
  breathPeriod = 1.6,
  breathDepth = 0.45,
  shimmer = true,
  shimmerDuration = 1.8,
  settleDuration = 350,
  settleBlur = 2,
  working = true,
  settleAfter = 0,
  elapsed,
  showTimer = true,
  onSettle,
  className = "",
  style,
}: {
  /** The working line. It breathes, and it is the spoken text. */
  label?: string;
  /** The settled line. Empty gives "Thought for", or "Done thinking" without the timer. */
  doneLabel?: string;
  /** Wraps either string, for a sheen or a link. Inline content only. */
  renderLabel?: (text: string, working: boolean) => ReactNode;
  /** The mark that breathes and dims. */
  glyph?: "sparkle" | "dot" | "none" | ReactNode;
  /** The trace beneath the line; the last step is current, earlier ones tick. */
  steps?: string[];
  /** The line becomes a toggle for the trace, with a chevron. */
  collapsible?: boolean;
  /** Fold the trace into the line when it settles. */
  collapseOnSettle?: boolean;
  color?: string;
  /** The glyph alone. Empty follows the ink. */
  glyphColor?: string;
  fontSize?: number;
  /** One breath, up and down, in seconds. */
  breathPeriod?: number;
  /** How far the glyph and label dim at the trough. 0 is no breath. */
  breathDepth?: number;
  /** A band of ink sweeps the working label. */
  shimmer?: boolean;
  shimmerDuration?: number;
  /** The settle chord, in ms: crossfade, dim, glide, fold. */
  settleDuration?: number;
  /** Blur through the crossfade seam, in px. */
  settleBlur?: number;
  /** Working or settled. True again starts a new clock. */
  working?: boolean;
  /** Seconds after which the line settles by itself. 0 waits for `working`. */
  settleAfter?: number;
  /** Controlled seconds. The internal clock never runs. */
  elapsed?: number;
  /** The live clock that freezes into the sentence. */
  showTimer?: boolean;
  /** Once per settle, with the frozen time. */
  onSettle?: (seconds: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const [autoSettled, setAutoSettled] = useState(false);
  const [open, setOpen] = useState(true);
  const isWorking = working && !autoSettled;
  const doneText = doneLabel || (showTimer ? "Thought for" : "Done thinking");
  const hasTrace = steps.length > 0;
  const depth = reduce ? Math.min(breathDepth, 0.2) : breathDepth;
  const period = reduce ? breathPeriod * 1.5 : breathPeriod;
  const trough = 1 - depth;
  const sheen = shimmer && !reduce;

  const glyphRef = useRef<HTMLSpanElement>(null);
  const breathRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const stackRef = useRef<HTMLSpanElement>(null);
  const workRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef<HTMLSpanElement>(null);
  const dsRef = useRef(0);
  const prevWorking = useRef(isWorking);
  const latest = useRef<{ onSettle?: (seconds: number) => void }>({});
  useEffect(() => {
    latest.current = { onSettle };
  });
  const [announce, setAnnounce] = useState(label);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (working) setAutoSettled(false);
  }, [working]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isWorking) setOpen(true);
    else if (collapseOnSettle) setOpen(false);
  }, [isWorking, collapseOnSettle]);

  useEffect(() => {
    const glyphEl = glyphRef.current;
    const breathEl = breathRef.current;
    if (!breathEl) return undefined;
    const s = settleDuration / 1000;
    const loop = (el: Element, delay: number) =>
      animate(el, { opacity: [trough, 1, trough] }, { duration: period, ease: EASE_IN_OUT, repeat: Infinity, delay });
    let cancelled = false;
    const running: AnimationPlaybackControls[] = [];
    if (isWorking) {
      if (depth > 0) {
        if (sheen) running.push(animate(breathEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }));
        if (glyphEl) {
          const lead = animate(glyphEl, { opacity: trough }, { duration: 0.2, ease: EASE_OUT });
          running.push(lead);
          void lead.then(() => {
            if (cancelled) return;
            running.push(loop(glyphEl, 0));
            if (!sheen) running.push(loop(breathEl, 0.14));
          });
        } else if (!sheen) {
          running.push(loop(breathEl, 0.14));
        }
      } else {
        if (glyphEl) running.push(animate(glyphEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }));
        running.push(animate(breathEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }));
      }
    } else {
      if (glyphEl) running.push(animate(glyphEl, { opacity: GLYPH_DONE }, { duration: s, ease: EASE_OUT }));
      running.push(animate(breathEl, { opacity: 1 }, { duration: s, ease: EASE_OUT }));
    }
    return () => {
      cancelled = true;
      running.forEach((a) => a.stop());
    };
  }, [isWorking, period, depth, trough, settleDuration, glyph, sheen]);

  useLayoutEffect(() => {
    const paint = (ds: number) => {
      dsRef.current = ds;
      if (timerRef.current) timerRef.current.textContent = fmt(ds);
    };
    if (elapsed != null) {
      paint(Math.round(elapsed * 10));
      return undefined;
    }
    if (!isWorking) return undefined;
    const startedAt = performance.now();
    paint(0);
    const id = setInterval(() => {
      const ds = Math.floor((performance.now() - startedAt) / 100);
      paint(ds);
      if (settleAfter > 0 && ds >= Math.round(settleAfter * 10)) setAutoSettled(true);
    }, 100);
    return () => clearInterval(id);
  }, [isWorking, elapsed, settleAfter]);

  useLayoutEffect(() => {
    const t = timerRef.current;
    const stack = stackRef.current;
    if (!t || !stack) return undefined;
    const place = (glide: boolean) => {
      const active = isWorking ? workRef.current : doneRef.current;
      if (!active) return;
      const shift = active.offsetWidth - stack.offsetWidth;
      if (!glide) t.style.transition = "none";
      t.style.transform = `translateX(${shift}px)`;
      if (!glide) {
        void t.offsetWidth;
        t.style.transition = "";
      }
    };
    place(prevWorking.current !== isWorking);
    prevWorking.current = isWorking;
    const ro = new ResizeObserver(() => place(false));
    if (workRef.current) ro.observe(workRef.current);
    if (doneRef.current) ro.observe(doneRef.current);
    return () => ro.disconnect();
  }, [isWorking, label, doneText, fontSize, showTimer]);

  useEffect(() => {
    if (isWorking) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnounce(label);
      return;
    }
    setAnnounce(showTimer ? `${doneText} ${spoken(dsRef.current)}` : doneText);
    latest.current.onSettle?.(dsRef.current / 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorking]);

  const toggle = hasTrace && collapsible;
  const head = (
    <>
      {glyph !== "none" ? (
        <span ref={glyphRef} className="thought-line__glyph" aria-hidden="true">
          {glyph === "sparkle" ? <Sparkle /> : glyph === "dot" ? <span className="thought-line__dot" /> : glyph}
        </span>
      ) : null}
      <span ref={stackRef} className="thought-line__label" aria-hidden="true">
        <span ref={workRef} className="thought-line__text" data-active={isWorking ? "" : undefined}>
          <span ref={breathRef} className="thought-line__breath" data-shimmer={sheen ? "" : undefined}>
            {renderLabel ? renderLabel(label, true) : label}
          </span>
        </span>
        <span ref={doneRef} className="thought-line__text thought-line__text--done" data-active={isWorking ? undefined : ""}>
          {renderLabel ? renderLabel(doneText, false) : doneText}
        </span>
      </span>
      {showTimer ? (
        <span ref={timerRef} className="thought-line__timer" data-done={isWorking ? undefined : ""} aria-hidden="true">
          0.0s
        </span>
      ) : null}
      {collapsible ? (
        <span className="thought-line__chevron" data-on={hasTrace ? "" : undefined} aria-hidden="true">
          <Chevron />
        </span>
      ) : null}
      <span className="thought-line__sr" role="status">
        {announce}
      </span>
    </>
  );

  return (
    <div
      className={`thought-line${className ? ` ${className}` : ""}`}
      data-working={isWorking ? "" : undefined}
      data-open={open && hasTrace ? "" : undefined}
      style={
        {
          "--tl-font": `${fontSize}px`,
          "--tl-color": color,
          "--tl-glyph": glyphColor || color,
          "--tl-settle": `${settleDuration}ms`,
          "--tl-blur": `${settleBlur}px`,
          "--tl-shimmer": `${shimmerDuration}s`,
          ...style,
        } as CSSProperties
      }
    >
      {collapsible ? (
        <button
          type="button"
          className="thought-line__head"
          data-toggle={toggle ? "" : undefined}
          aria-expanded={toggle ? open : undefined}
          tabIndex={toggle ? 0 : -1}
          onClick={() => {
            if (toggle) setOpen((v) => !v);
          }}
        >
          {head}
        </button>
      ) : (
        <div className="thought-line__head">{head}</div>
      )}
      {hasTrace ? (
        <div className="thought-line__trace" data-open={open ? "" : undefined} aria-hidden={!open}>
          <div className="thought-line__fold">
            <div className="thought-line__steps">
              {steps.map((text, i) => {
                const done = !isWorking || i < steps.length - 1;
                return (
                  <div key={`${i}-${text}`} className="thought-line__step" data-done={done ? "" : undefined}>
                    <span className="thought-line__mark" aria-hidden="true">
                      {done ? <Tick /> : <i className="thought-line__pulse" />}
                    </span>
                    <span className="thought-line__step-text">{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

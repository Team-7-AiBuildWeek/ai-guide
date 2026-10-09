"use client";

/**
 * The "Ask anything" field — React Bits' PromptBar, cut down to what a walk
 * needs.
 *
 * Kept: the field that grows with the question, Enter to send, the send tile
 * whose arrow morphs into a stop square while the guide is answering (with
 * the original's mid-morph squash and lean), the press scale, and dictation
 * with the listening bars. Left out: the model picker, the effort slider, the
 * @ sources and / commands menus and attachments — there is one guide and
 * nothing to attach. Icons are drawn inline rather than from an icon package.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";

const ARROW_UP = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const LINE = 24;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pathAt = (a: number[], b: number[], t: number) => {
  let d = "";
  for (let i = 0; i < a.length; i += 2) d += `${i ? "L" : "M"}${mix(a[i], b[i], t).toFixed(2)} ${mix(a[i + 1], b[i + 1], t).toFixed(2)}`;
  return `${d}Z`;
};

/** The arrow that becomes a square while an answer is coming. */
function SendGlyph({ busy, morphDuration, squash, tilt }: { busy: boolean; morphDuration: number; squash: number; tilt: number }) {
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dir = useRef(busy ? 1 : -1);
  const t = useMotionValue(busy ? 1 : 0);

  useEffect(() => {
    const target = busy ? 1 : 0;
    dir.current = busy ? 1 : -1;
    if (t.get() === target) return undefined;
    const controls = animate(t, target, reduce ? { duration: 0 } : { duration: morphDuration / 1000, ease: EASE_IN_OUT });
    return () => controls.stop();
  }, [busy, morphDuration, reduce, t]);

  useMotionValueEvent(t, "change", (v) => {
    pathRef.current?.setAttribute("d", pathAt(ARROW_UP, SQUARE, v));
    const goo = reduce ? 0 : Math.sin(v * Math.PI);
    const sx = 1 - squash * goo;
    if (svgRef.current) svgRef.current.style.transform = goo ? `rotate(${dir.current * tilt * goo}deg) scale(${sx}, ${1 / sx})` : "";
  });

  return (
    <svg
      ref={svgRef}
      className="prompt-bar__glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path ref={pathRef} d={pathAt(ARROW_UP, SQUARE, busy ? 1 : 0)} />
    </svg>
  );
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** The browser's own speech recognition, where there is one (Safari and Chrome). */
function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function PromptBar({
  placeholder = "Ask anything",
  busy = false,
  onSend,
  onStop,
  lang = "en",
  maxRows = 5,
  morphDuration = 240,
  squash = 0.12,
  tilt = 8,
  pressScale = 0.96,
  className = "",
}: {
  placeholder?: string;
  /** An answer is on its way: the tile turns into a stop square. */
  busy?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** For dictation: the language the walker speaks. */
  lang?: string;
  maxRows?: number;
  morphDuration?: number;
  squash?: number;
  tilt?: number;
  pressScale?: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const canSend = draft.trim().length > 0;
  const armed = busy || canSend;

  // Known only in the browser, so decided after the first render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanDictate(recognitionClass() !== null);
    return () => recognition.current?.stop();
  }, []);

  // The field grows with the question, up to maxRows, then scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const max = LINE * maxRows;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [draft, maxRows]);

  const focusInput = () => inputRef.current?.focus({ preventScroll: true });

  const send = () => {
    if (!canSend || busy) return;
    onSend(draft.trim());
    setDraft("");
    focusInput();
  };

  const toggleListen = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Rec = recognitionClass();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = lang;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text));
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      focusInput();
    };
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className={`prompt-bar${className ? ` ${className}` : ""}`} data-busy={busy ? "" : undefined} style={{ "--pb-press": pressScale } as CSSProperties}>
      <div className="prompt-bar__field" role="presentation" onClick={focusInput}>
        <textarea
          ref={inputRef}
          className="prompt-bar__input"
          rows={1}
          value={draft}
          placeholder={listening ? "Listening…" : placeholder}
          aria-label={placeholder}
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="prompt-bar__bar">
          <span className="prompt-bar__spacer" />
          {canDictate ? (
            <button
              type="button"
              className="prompt-bar__tool"
              aria-label={listening ? "Stop listening" : "Ask out loud"}
              aria-pressed={listening}
              data-on={listening ? "" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleListen}
            >
              {listening ? (
                <span className="prompt-bar__eq" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="prompt-bar__send"
            disabled={!armed}
            aria-label={busy ? "Stop" : "Send"}
            data-armed={armed ? "" : undefined}
            data-pressed={pressed ? "" : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button === 0 && armed) setPressed(true);
            }}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onClick={() => (busy ? onStop?.() : send())}
          >
            <SendGlyph busy={busy} morphDuration={morphDuration} squash={squash} tilt={tilt} />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * The device's own voice, as a fallback.
 *
 * Gemini's free tier allows ten speech requests a day, which is less than one
 * tour. Rather than let the walker stand in a square listening to nothing, the
 * phone reads the stop itself: free, offline, instant, and available on every
 * browser we care about.
 *
 * It is a fallback, not the product — `speechSynthesis` has no seekable
 * position and cannot drive the lock screen, so the player hides scrubbing
 * while it is speaking and says whose voice you are hearing.
 */

import { speechLocale } from "@/lib/i18n/languages";

export type DeviceVoiceState = {
  speaking: boolean;
  paused: boolean;
};

type Listener = () => void;

class DeviceVoice {
  private listeners = new Set<Listener>();
  private state: DeviceVoiceState = { speaking: false, paused: false };
  private onDone: (() => void) | null = null;

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<DeviceVoiceState>) {
    const next = { ...this.state, ...patch };
    if (next.speaking === this.state.speaking && next.paused === this.state.paused) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  speak(text: string, lang: string, onDone?: () => void) {
    if (!this.supported) return;
    this.onDone = onDone ?? null;
    window.speechSynthesis.cancel();

    // Chunked at sentence boundaries: several browsers silently truncate a
    // single utterance somewhere past a couple hundred characters.
    const chunks = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    const merged: string[] = [];
    for (const c of chunks) {
      const last = merged[merged.length - 1];
      if (last && last.length + c.length < 200) merged[merged.length - 1] = last + c;
      else merged.push(c);
    }

    merged.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.lang = speechLocale(lang);
      u.rate = 0.95;
      if (i === 0) u.onstart = () => this.set({ speaking: true, paused: false });
      if (i === merged.length - 1) {
        u.onend = () => {
          this.set({ speaking: false, paused: false });
          this.onDone?.();
        };
      }
      u.onerror = () => this.set({ speaking: false, paused: false });
      window.speechSynthesis.speak(u);
    });
  }

  toggle() {
    if (!this.supported) return;
    const s = window.speechSynthesis;
    if (s.paused) {
      s.resume();
      this.set({ paused: false });
    } else if (s.speaking) {
      s.pause();
      this.set({ paused: true });
    }
  }

  stop() {
    if (!this.supported) return;
    this.onDone = null;
    window.speechSynthesis.cancel();
    this.set({ speaking: false, paused: false });
  }
}

const KEY = "__btour_device_voice__";
type G = typeof globalThis & { [KEY]?: DeviceVoice };
const g = globalThis as G;

export const deviceVoice: DeviceVoice = g[KEY] ?? (g[KEY] = new DeviceVoice());

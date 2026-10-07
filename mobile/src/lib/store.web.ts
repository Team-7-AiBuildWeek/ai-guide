/**
 * store.ts for the browser preview (`npx expo start`, then open it on the
 * web): localStorage, which is what the files stand in for on the phone.
 * Metro picks this file over store.ts when bundling for web.
 *
 * The preview is for looking at screens. The guide's voice is kept as files,
 * so a tour's narration does not play here — use the phone for that.
 */

import type { Directory } from "expo-file-system";

const PREFIX = "walk:";

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn("[walk] could not save", key, err);
  }
}

export function removeJson(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* already gone */
  }
}

export function audioDir(): Directory {
  throw new Error("The guide's voice plays on the phone, not in the browser preview.");
}

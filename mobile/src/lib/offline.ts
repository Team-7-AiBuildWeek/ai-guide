/**
 * Tours saved on the phone, so a walk needs no signal.
 *
 * Each recording is stored once, named by its id (the backend's audio hash), so
 * two tours that share a stop share the file. A tour is a small JSON manifest
 * next to them pointing at those files.
 */

import { Directory, File, Paths } from "expo-file-system";
import type { Bundle, SavedTour } from "./types";

const ROOT = new Directory(Paths.document, "walk");
const AUDIO = new Directory(ROOT, "audio");
const TOURS = new Directory(ROOT, "tours");

function ensureDirs() {
  AUDIO.create({ intermediates: true, idempotent: true });
  TOURS.create({ intermediates: true, idempotent: true });
}

export async function saveTour(
  bundle: Bundle,
  cityName: string,
  onProgress: (done: number, total: number) => void,
): Promise<SavedTour> {
  ensureDirs();
  const playable = bundle.stops.filter((s) => s.audio);
  const stops: SavedTour["stops"] = [];
  let done = 0;
  onProgress(done, playable.length);
  for (const stop of bundle.stops) {
    if (!stop.audio) continue;
    const file = new File(AUDIO, `${stop.audio.id}.mp3`);
    if (!file.exists) await File.downloadFileAsync(stop.audio.url, file, { idempotent: true });
    stops.push({ ...stop, localAudio: file.uri });
    onProgress(++done, playable.length);
  }
  const saved: SavedTour = { ...bundle, cityName, savedAt: new Date().toISOString(), stops };
  const manifest = new File(TOURS, `${bundle.tour.id}.json`);
  manifest.create({ overwrite: true });
  manifest.write(JSON.stringify(saved));
  return saved;
}

export async function loadTour(id: number): Promise<SavedTour | null> {
  const manifest = new File(TOURS, `${id}.json`);
  if (!manifest.exists) return null;
  return JSON.parse(await manifest.text()) as SavedTour;
}

export async function savedTours(): Promise<SavedTour[]> {
  if (!TOURS.exists) return [];
  const out: SavedTour[] = [];
  for (const entry of TOURS.list()) {
    if (entry instanceof File && entry.name.endsWith(".json")) {
      try {
        out.push(JSON.parse(await entry.text()) as SavedTour);
      } catch {
        /* a half-written manifest: ignore it */
      }
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * What the website keeps in localStorage, kept in small JSON files instead.
 *
 * Synchronous on purpose, like localStorage: these are a few kilobytes, read
 * once on launch and written when something changes.
 */

import { Directory, File, Paths } from "expo-file-system";

const ROOT = new Directory(Paths.document, "walk");

function fileFor(key: string): File {
  ROOT.create({ intermediates: true, idempotent: true });
  return new File(ROOT, `${key}.json`);
}

export function readJson<T>(key: string): T | null {
  try {
    const file = fileFor(key);
    return file.exists ? (JSON.parse(file.textSync()) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    const file = fileFor(key);
    if (!file.exists) file.create();
    file.write(JSON.stringify(value));
  } catch (err) {
    // A failed save must not take the walk down with it, but it is said out
    // loud, because the consequence is a tour lost on the next launch.
    console.warn("[walk] could not save", key, err);
  }
}

export function removeJson(key: string): void {
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {
    /* already gone */
  }
}

/** Where the guide's voice is kept once it has been made. */
export function audioDir(): Directory {
  const dir = new Directory(ROOT, "voice");
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

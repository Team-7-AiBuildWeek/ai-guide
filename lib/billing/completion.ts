"use client";

/**
 * Telling the server a walk was finished on foot, for points
 * (app/api/me/walks/complete). Real arrivals only — the ones the walk itself
 * detected within 35 m with a trusted fix — never stops skipped with the arrows
 * or chosen on the map. Sent once per walk, when most of its stops have been
 * reached or the last one has; kept in localStorage until it gets through, so
 * a walk finished without signal still counts later.
 */

export type Visit = { i: number; t: number; lat: number; lng: number; acc: number };

const SENT = (walkId: string) => `wd:completed:${walkId}`;
const PENDING = "wd:completion-pending";

function readPending(): { walkId: string; visits: Visit[]; simulated: boolean }[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING) ?? "[]");
  } catch {
    return [];
  }
}

function writePending(list: { walkId: string; visits: Visit[]; simulated: boolean }[]) {
  try {
    localStorage.setItem(PENDING, JSON.stringify(list.slice(-5)));
  } catch {
    /* private mode: the walk simply earns nothing */
  }
}

/** Whether enough of the walk has been reached on foot to call it completed. */
export function walkComplete(visits: Map<number, Visit>, stopCount: number): boolean {
  if (stopCount === 0) return false;
  return visits.size >= Math.ceil(0.8 * stopCount) || (visits.has(stopCount - 1) && visits.size >= Math.ceil(0.5 * stopCount));
}

async function send(item: { walkId: string; visits: Visit[]; simulated: boolean }): Promise<"done" | "retry"> {
  try {
    const res = await fetch("/api/me/walks/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    });
    // Signed out, or points off: nothing to retry.
    if (res.status === 401 || res.status === 403 || res.ok) return "done";
    return res.status >= 500 ? "retry" : "done";
  } catch {
    return "retry"; // offline
  }
}

/** Reports a completed walk once; queued if it cannot get through now. */
export async function reportCompletion(walkId: string, visits: Visit[], simulated: boolean): Promise<void> {
  try {
    if (localStorage.getItem(SENT(walkId))) return;
    localStorage.setItem(SENT(walkId), "1");
  } catch {
    /* carry on */
  }
  const item = { walkId, visits, simulated };
  if ((await send(item)) === "retry") writePending([...readPending().filter((p) => p.walkId !== walkId), item]);
}

/** Tries queued completions again — called when the app opens. */
export async function flushCompletions(): Promise<void> {
  const pending = readPending();
  if (!pending.length) return;
  const left = [];
  for (const item of pending) if ((await send(item)) === "retry") left.push(item);
  writePending(left);
}

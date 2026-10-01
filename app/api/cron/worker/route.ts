/**
 * Vercel Cron's daily backstop for walk-backend's generation queue.
 *
 * Most of the queue is moved by nudges from real traffic (see kickWorker). This
 * catches whatever was left: Gemini batches that finished overnight, prewarm
 * runs nobody has walked yet. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */

import { kickWorker } from "@/lib/backend/client";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!config.workerSecret || request.headers.get("authorization") !== `Bearer ${config.workerSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const passes = [];
  for (let i = 0; i < 4; i++) {
    const stats = await kickWorker(10);
    passes.push(stats);
    if (!stats || !Object.values(stats).some(Boolean)) break;
  }
  return Response.json({ passes });
}

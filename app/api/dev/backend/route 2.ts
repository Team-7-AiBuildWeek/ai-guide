/**
 * Is walk-backend reachable and working? For the operator, like /dev/providers.
 *
 * The backend checks its database, writes and reads back a small file in storage,
 * and says whether generation is configured. Statuses only: no keys, no URLs.
 */

import { BackendError, backendEnabled, backendHealth } from "@/lib/backend/client";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!backendEnabled()) return Response.json({ enabled: false, reason: "BACKEND_URL is not set" });
  if (!config.workerSecret) return Response.json({ enabled: true, ok: false, reason: "CRON_SECRET is not set" });
  try {
    return Response.json({ enabled: true, ...(await backendHealth()) });
  } catch (err) {
    const status = err instanceof BackendError ? err.status : 0;
    return Response.json(
      { enabled: true, ok: false, reason: `backend answered ${status || "nothing"}: ${err instanceof Error ? err.message : err}` },
      { status: 502 },
    );
  }
}

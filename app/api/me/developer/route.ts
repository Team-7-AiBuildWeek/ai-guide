/**
 * GET: whether the signed-in account is a developer (see
 * lib/accounts/developer.ts), and for one, what the server is running on.
 * Anyone else gets `{ developer: false }` and nothing more.
 */

import { backendEnabled } from "@/lib/backend/client";
import { config } from "@/lib/config";
import { isDeveloper } from "@/lib/accounts/developer";
import { signedInUser } from "@/lib/accounts/server";
import { r2Enabled } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await signedInUser();
  if (userId instanceof Response || !(await isDeveloper(userId))) return Response.json({ developer: false });
  return Response.json({
    developer: true,
    info: {
      llm: config.llmProvider === "google" ? `Gemini (${config.geminiModel})` : config.llmProvider,
      voice: `${config.ttsProvider} (${config.ttsModel})`,
      maps: config.mapProvider,
      storage: r2Enabled() ? "R2 on — recordings kept" : "R2 off — recordings not kept",
      database: process.env.DATABASE_URL ? "on" : "off",
      backend: backendEnabled() ? "connected" : "off",
    },
  });
}

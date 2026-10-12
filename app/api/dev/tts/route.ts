/**
 * Synthesis endpoint for the /dev/tts bench.
 *
 * The key is server-side only, so the browser asks us and we ask the provider.
 *
 * It speaks any text it is given and caches nothing, so in production it is
 * for developer accounts only — open, it was a free voice for anyone on the
 * internet, billed to us. On a local dev server it stays open for the bench.
 */

import { developerOnly } from "@/lib/accounts/developer";
import { normaliseLang } from "@/lib/i18n/languages";
import { getTTS } from "@/lib/providers/factory";

/** Null to go ahead; otherwise the response to send instead. */
async function gate(): Promise<Response | null> {
  if (process.env.NODE_ENV === "development") return null;
  const who = await developerOnly();
  return who instanceof Response ? who : null;
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function synthesize(text: string, lang: string, voice?: string) {
  const tts = getTTS();
  const started = Date.now();
  const audio = await tts.synthesize(text, { lang: normaliseLang(lang), voice });
  return new Response(audio, {
    headers: {
      "content-type": tts.mimeType,
      "content-length": String(audio.byteLength),
      // Read by the bench so it can report size and latency without a
      // second request.
      "x-tts-provider": tts.name,
      "x-tts-ms": String(Date.now() - started),
      "cache-control": "no-store",
    },
  });
}

function fail(err: unknown) {
  return Response.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 502 },
  );
}

export async function GET(request: Request) {
  const denied = await gate();
  if (denied) return denied;
  const url = new URL(request.url);
  try {
    return await synthesize(
      url.searchParams.get("text") ?? "Michalská brána. Testing the voice.",
      url.searchParams.get("lang") ?? "en",
      url.searchParams.get("voice") ?? undefined,
    );
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const denied = await gate();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { text?: string; lang?: string; voice?: string };
    if (!body.text?.trim()) {
      return Response.json({ error: "Nothing to say." }, { status: 400 });
    }
    return await synthesize(body.text.trim(), body.lang ?? "en", body.voice);
  } catch (err) {
    return fail(err);
  }
}

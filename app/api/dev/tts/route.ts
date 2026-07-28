/**
 * Serves synthesized audio so the /dev/providers page can actually play it.
 * Development aid — delete or gate this before the app is public.
 */

import { getTTS } from "@/lib/providers/factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? "Michalská brána. Testing the mock voice.";
  const lang = url.searchParams.get("lang") ?? "en";

  const tts = getTTS();
  try {
    const audio = await tts.synthesize(text, { lang });
    return new Response(audio, {
      headers: {
        "content-type": tts.mimeType,
        "content-length": String(audio.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

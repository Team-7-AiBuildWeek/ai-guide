/**
 * A screen broke in someone's browser: put the error in the server log, where
 * it can be read with `vercel logs`. Only the error, the page and the browser's
 * name are kept, trimmed; nothing that says who.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    console.error(
      "[client-error]",
      JSON.stringify({
        message: clip(body.message, 500),
        digest: clip(body.digest, 100),
        stack: clip(body.stack, 1500),
        path: clip(body.path, 200),
        agent: clip(body.agent, 300),
      }),
    );
  } catch {
    /* not JSON: nothing worth logging */
  }
  return new Response(null, { status: 204 });
}

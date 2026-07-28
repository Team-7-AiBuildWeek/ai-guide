/**
 * The map screen.
 *
 * Server component: it reads the style URL from the map provider, because the
 * factory touches API keys and must never run in the browser. The URL it hands
 * down does carry the key — MapLibre has to fetch tiles from the browser, so
 * that key is public by necessity and needs a domain allowlist on the provider
 * side rather than secrecy.
 *
 * The bottom sheet and "Build my tour" are the rest of step 1.
 */

import Link from "next/link";
import MapView from "@/components/MapView";
import { getMaps } from "@/lib/providers/factory";
import { config, DEFAULT_CENTER } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Map" };

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let styleUrl: string | null = null;
  let error: string | null = null;

  try {
    styleUrl = getMaps().tileStyleUrl();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!styleUrl) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-10">
        <h1 className="text-[length:var(--text-h2)]">No map provider</h1>
        <p className="rounded-[var(--radius-control)] bg-[#fef2f2] p-3 text-[color:var(--danger)]">
          {error}
        </p>
        <p>
          Set <code>MAP_PROVIDER</code> and its key in <code>.env.local</code>, then restart the
          dev server.
        </p>
        <Link href="/" className="btn btn--quiet">
          Back
        </Link>
      </main>
    );
  }

  return (
    // 100dvh, not flex-1: the body is `min-h-full`, which leaves the flex
    // container's height indefinite, so a flex-1 child resolves to zero and
    // MapLibre silently falls back to a 300px canvas. dvh also tracks the
    // mobile URL bar collapsing, which vh does not.
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <MapView styleUrl={styleUrl} center={DEFAULT_CENTER} initialSimulate={"sim" in params} />

      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3">
          <Link href="/" className="btn btn--quiet shrink-0" aria-label="Back to the start">
            ←
          </Link>
          <span className="tag tag--quiet">tiles · {config.mapProvider}</span>
        </div>
      </div>
    </div>
  );
}

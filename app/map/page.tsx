/**
 * Raw map with live GPS — kept as a diagnostic, separate from the tour flow.
 * If location is misbehaving on a device, this is the smallest thing that
 * still reproduces it.
 */

import Link from "next/link";
import MapDiagnostic from "@/components/MapDiagnostic";
import { getMaps } from "@/lib/providers/factory";
import { config, DEFAULT_CENTER } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Map diagnostic" };

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
        <Link href="/walk" className="btn btn--quiet">Back</Link>
      </main>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <MapDiagnostic styleUrl={styleUrl} center={DEFAULT_CENTER} initialSimulate={"sim" in params} />
      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3">
          <Link href="/walk" className="btn btn--quiet shrink-0" aria-label="Back">←</Link>
          <span className="tag tag--quiet">tiles · {config.mapProvider}</span>
        </div>
      </div>
    </div>
  );
}

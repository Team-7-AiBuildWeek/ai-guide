/**
 * The first screen: the map, with the sheet resting at the bottom.
 *
 * Server component so the map key never reaches the browser except in the
 * style URL, which needs it. Everything after this is one client flow.
 */

import Link from "next/link";
import TourFlow from "@/components/TourFlow";
import { getMaps } from "@/lib/providers/factory";
import { DEFAULT_CENTER } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home({
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
        <Link href="/dev/providers" className="btn btn--quiet">
          Provider check
        </Link>
      </main>
    );
  }

  return (
    <TourFlow styleUrl={styleUrl} center={DEFAULT_CENTER} initialSimulate={"sim" in params} />
  );
}

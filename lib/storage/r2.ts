/**
 * Cloudflare R2, for the guide's voice.
 *
 * Narration is the expensive part of a tour and the bulky part — a stop is a
 * few megabytes of audio, too big for the database — so every piece the
 * guide speaks is kept here once it has been made, named by exactly what made
 * it (see /api/audio). The same words in the same voice are then never paid
 * for twice, by this walker or any other, and a saved tour can be played back
 * entirely from storage.
 *
 * Private bucket: everything goes through the server, signed with an R2 API
 * token, so nothing needs a public URL or CORS. Off (every call a no-op) until
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are set.
 */

import { AwsClient } from "aws4fetch";

let client: AwsClient | null = null;

function r2(): { aws: AwsClient; base: string } | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  client ??= new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  return { aws: client, base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}` };
}

export function r2Enabled(): boolean {
  return r2() !== null;
}

/** The object, or null when it is not there (or R2 is off or unreachable). */
export async function r2Get(key: string): Promise<{ body: ArrayBuffer; mimeType: string } | null> {
  const c = r2();
  if (!c) return null;
  try {
    const res = await c.aws.fetch(`${c.base}/${key}`);
    if (!res.ok) return null;
    return { body: await res.arrayBuffer(), mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Whether the object exists, without downloading it. */
export async function r2Has(key: string): Promise<boolean> {
  const c = r2();
  if (!c) return false;
  try {
    const res = await c.aws.fetch(`${c.base}/${key}`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Keep it. Failures are logged and swallowed: a voice not kept is only a voice paid for again. */
export async function r2Put(key: string, body: ArrayBuffer, mimeType: string): Promise<void> {
  const c = r2();
  if (!c) return;
  try {
    const res = await c.aws.fetch(`${c.base}/${key}`, {
      method: "PUT",
      body,
      headers: { "content-type": mimeType },
    });
    if (!res.ok) console.warn("[r2] put failed", key, res.status);
  } catch (err) {
    console.warn("[r2] put failed", key, err);
  }
}

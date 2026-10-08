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
 * token, so nothing needs a public URL or CORS. R2 speaks the S3 protocol, so
 * it reads the project's S3 settings — S3_ENDPOINT_URL, S3_BUCKET,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, optional S3_REGION — or the R2_*
 * names (R2_ACCOUNT_ID in place of the endpoint). Off, every call a no-op,
 * until one set is complete. Narration lives under `narration/`, clear of
 * anything else in the bucket.
 */

import { AwsClient } from "aws4fetch";

let client: AwsClient | null = null;

function settings() {
  const e = process.env;
  const endpoint =
    e.S3_ENDPOINT_URL ?? (e.R2_ACCOUNT_ID ? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  const bucket = e.S3_BUCKET ?? e.R2_BUCKET;
  const accessKeyId = e.S3_ACCESS_KEY_ID ?? e.R2_ACCESS_KEY_ID;
  const secretAccessKey = e.S3_SECRET_ACCESS_KEY ?? e.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), bucket, accessKeyId, secretAccessKey, region: e.S3_REGION || "auto" };
}

function r2(): { aws: AwsClient; base: string } | null {
  const s = settings();
  if (!s) return null;
  client ??= new AwsClient({
    accessKeyId: s.accessKeyId,
    secretAccessKey: s.secretAccessKey,
    service: "s3",
    region: s.region,
  });
  return { aws: client, base: `${s.endpoint}/${s.bucket}` };
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
    // R2 refuses an upload whose length it is not told up front (411).
    const res = await c.aws.fetch(`${c.base}/${key}`, {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "content-type": mimeType, "content-length": String(body.byteLength) },
    });
    if (!res.ok) console.warn("[r2] put failed", key, res.status);
  } catch (err) {
    console.warn("[r2] put failed", key, err);
  }
}

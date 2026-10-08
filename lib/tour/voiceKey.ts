/**
 * The name a piece of narration is kept under, in memory and in R2: exactly
 * what determines the sound. Shared by /api/audio, which keeps the voice, and
 * /api/demo-tour, which checks a saved tour's voice is all there.
 */

import { createHash } from "crypto";
import { config } from "@/lib/config";

export function voiceKey(text: string, lang: string, voice?: string): string {
  return createHash("sha256")
    .update([config.ttsProvider, config.ttsModel, voice ?? "provider-default", lang, text].join(" "))
    .digest("hex");
}

/** Where that piece lives in the bucket. */
export function voiceObject(key: string): string {
  return `narration/${key}`;
}

/**
 * Gemini text-to-speech, via @google/genai.
 *
 * Server-side only. The key is passed in explicitly rather than letting the
 * SDK read the environment, so `lib/config.ts` remains the single place that
 * touches `process.env` — and so nothing can accidentally construct this in a
 * client bundle and expect it to work.
 *
 * The one thing that will bite you: the response is raw PCM with NO container.
 * 24 kHz, 16-bit, mono, base64, straight out of `inlineData.data`. Handed to an
 * <audio> element as-is it plays nothing and reports no error, so every buffer
 * goes through `pcmToWav` before it leaves this file.
 */

import { GoogleGenAI } from "@google/genai";
import { config, requireKey } from "@/lib/config";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { applyLexicon } from "./lexicon";
import { GEMINI_PCM, pcmToWav } from "./wav";

/**
 * Gemini's 30 prebuilt voices, with the character Google gives each one.
 * There is no list endpoint — the set is fixed and documented.
 */
const VOICES: { id: string; character: string }[] = [
  { id: "Zephyr", character: "Bright" },
  { id: "Puck", character: "Upbeat" },
  { id: "Charon", character: "Informative" },
  { id: "Kore", character: "Firm" },
  { id: "Fenrir", character: "Excitable" },
  { id: "Leda", character: "Youthful" },
  { id: "Orus", character: "Firm" },
  { id: "Aoede", character: "Breezy" },
  { id: "Callirrhoe", character: "Easy-going" },
  { id: "Autonoe", character: "Bright" },
  { id: "Enceladus", character: "Breathy" },
  { id: "Iapetus", character: "Clear" },
  { id: "Umbriel", character: "Easy-going" },
  { id: "Algieba", character: "Smooth" },
  { id: "Despina", character: "Smooth" },
  { id: "Erinome", character: "Clear" },
  { id: "Algenib", character: "Gravelly" },
  { id: "Rasalgethi", character: "Informative" },
  { id: "Laomedeia", character: "Upbeat" },
  { id: "Achernar", character: "Soft" },
  { id: "Alnilam", character: "Firm" },
  { id: "Schedar", character: "Even" },
  { id: "Gacrux", character: "Mature" },
  { id: "Pulcherrima", character: "Forward" },
  { id: "Achird", character: "Friendly" },
  { id: "Zubenelgenubi", character: "Casual" },
  { id: "Vindemiatrix", character: "Gentle" },
  { id: "Sadachbia", character: "Lively" },
  { id: "Sadaltager", character: "Knowledgeable" },
  { id: "Sulafat", character: "Warm" },
];

/** Informative, mature, unhurried — a guide, not a presenter. */
const DEFAULT_VOICE = "Charon";

export class GoogleTTSProvider implements TTSProvider {
  readonly name = "google";
  readonly mimeType = "audio/wav";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.geminiApiKey, "GEMINI_API_KEY", "google");
    const ai = new GoogleGenAI({ apiKey });

    // Gemini TTS takes plain text and is steered by prose, not SSML — so the
    // lexicon respells names rather than supplying IPA, and the delivery note
    // rides along in the prompt.
    const spoken = applyLexicon(text);
    const language = opts.lang === "sk" ? "Slovak" : "English";
    const prompt =
      `Read the following aloud in ${language}, as a walking-tour guide speaking ` +
      `to one person beside you. Unhurried and warm, never announcer-like. ` +
      `Read only the text, and do not add any commentary:\n\n${spoken}`;

    /**
     * The free tier allows 10 TTS requests a rolling minute. When it says no
     * it also says exactly how long to wait — "Please retry in 14.5s" — so
     * honour that rather than guessing, which is how a fixed backoff ends up
     * retrying half a second too early and failing twice.
     */
    const isRateLimit = (e: unknown) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String(e));
    /**
     * A per-DAY quota also reports "please retry in 55s", which is a lie you
     * can wait on for a very long time. Only a per-minute quota is worth
     * retrying; a daily one has to be reported to the user.
     */
    const isDailyQuota = (e: unknown) => /PerDay|RequestsPerDay/i.test(String(e));
    const retryAfterMs = (e: unknown) => {
      const m = String(e).match(/retry in ([\d.]+)s/i);
      const seconds = m ? Number(m[1]) : NaN;
      // A second of headroom; capped so a bad number cannot hang a request.
      return Math.min(45_000, (Number.isFinite(seconds) ? seconds : 15) * 1000 + 1000);
    };

    const call = () =>
      ai.models.generateContent({
        model: config.geminiTtsModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: opts.voice ?? DEFAULT_VOICE },
            },
          },
        },
      });

    let res;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await call();
        break;
      } catch (err) {
        lastErr = err;
        if (!isRateLimit(err)) {
          throw new ProviderError(this.name, err instanceof Error ? err.message : String(err), err);
        }
        if (isDailyQuota(err)) {
          throw new ProviderError(
            this.name,
            "Gemini free-tier daily speech quota is spent (10 requests a day). " +
              "Enable billing on the project, or set TTS_PROVIDER=mock.",
            err,
          );
        }
        if (attempt === 2) break;
        await new Promise((r) => setTimeout(r, retryAfterMs(err)));
      }
    }
    if (!res) {
      throw new ProviderError(
        this.name,
        "rate limited by Gemini — the free tier allows 10 speech requests a minute",
        lastErr,
      );
    }

    const base64 = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) {
      // A refusal or a safety block arrives as a normal response with no audio.
      const reason = res.candidates?.[0]?.finishReason ?? "no finishReason";
      throw new ProviderError(this.name, `no audio returned (${reason})`);
    }

    const pcm = new Uint8Array(Buffer.from(base64, "base64"));
    return pcmToWav(pcm, GEMINI_PCM);
  }

  async listVoices(): Promise<Voice[]> {
    return VOICES.map((v) => ({
      id: v.id,
      name: `${v.id} — ${v.character}`,
      // Gemini TTS is multilingual and picks the language from the prompt.
      langs: ["sk", "en"],
    }));
  }
}

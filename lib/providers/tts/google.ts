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

    let res;
    try {
      res = await ai.models.generateContent({
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
    } catch (err) {
      throw new ProviderError(this.name, err instanceof Error ? err.message : String(err), err);
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

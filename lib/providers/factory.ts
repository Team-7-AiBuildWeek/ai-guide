/**
 * The one place that decides which vendor is in play.
 *
 * Everything else in the app imports `getLLM()` / `getTTS()` / `getMaps()` and
 * never learns which implementation it got. Swapping vendors is an env var.
 *
 * Server-only: these read API keys. Do not import from a client component.
 */

import { config } from "@/lib/config";

import type { LLMProvider } from "./llm";
import { MockLLMProvider } from "./llm/mock";
import { AnthropicLLMProvider } from "./llm/anthropic";
import { OpenAILLMProvider } from "./llm/openai";
import { GoogleLLMProvider } from "./llm/google";

import type { TTSProvider } from "./tts";
import { MockTTSProvider } from "./tts/mock";
import { ElevenLabsTTSProvider } from "./tts/elevenlabs";
import { OpenAITTSProvider } from "./tts/openai";
import { GoogleTTSProvider } from "./tts/google";

import type { MapProvider } from "./maps";
import { MockMapProvider } from "./maps/mock";
import { StadiaMapProvider } from "./maps/stadia";
import { MapTilerMapProvider } from "./maps/maptiler";
import { MapboxMapProvider } from "./maps/mapbox";
import { OSMMapProvider } from "./maps/osm";

let llm: LLMProvider | null = null;
let tts: TTSProvider | null = null;
let maps: MapProvider | null = null;

export function getLLM(): LLMProvider {
  if (llm) return llm;
  switch (config.llmProvider) {
    case "anthropic":
      return (llm = new AnthropicLLMProvider());
    case "openai":
      return (llm = new OpenAILLMProvider());
    case "google":
      return (llm = new GoogleLLMProvider());
    default:
      return (llm = new MockLLMProvider());
  }
}

export function getTTS(): TTSProvider {
  if (tts) return tts;
  switch (config.ttsProvider) {
    case "elevenlabs":
      return (tts = new ElevenLabsTTSProvider());
    case "openai":
      return (tts = new OpenAITTSProvider());
    case "google":
      return (tts = new GoogleTTSProvider());
    default:
      return (tts = new MockTTSProvider());
  }
}

export function getMaps(): MapProvider {
  if (maps) return maps;
  switch (config.mapProvider) {
    case "stadia":
      return (maps = new StadiaMapProvider());
    case "maptiler":
      return (maps = new MapTilerMapProvider());
    case "mapbox":
      return (maps = new MapboxMapProvider());
    case "osm":
      return (maps = new OSMMapProvider());
    default:
      return (maps = new MockMapProvider());
  }
}

/** Which implementations are actually live right now. For the dev page. */
export function activeProviders() {
  return {
    llm: config.llmProvider,
    tts: config.ttsProvider,
    map: config.mapProvider,
  };
}

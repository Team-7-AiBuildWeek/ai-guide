/**
 * What a tour costs to make, roughly — for the developer panel.
 *
 * An estimate, not a bill: Gemini 3.6 Flash for the writing (one call to choose
 * the stops, about a cent, and one per stop, just under), and Gemini's speech at
 * about $0.015 a minute of audio for the voice, which is most of it. Google's
 * listed prices for both double on 1 January 2027. Recordings already kept in
 * R2, and walk-backend's prepared tours, cost nothing, which this does not know.
 */

import type { Detail } from "@/lib/providers/types";
import { SCRIPT_MINUTES } from "@/lib/tour/shape";

const PLAN_USD = 0.01;
const SCRIPT_USD_PER_STOP = 0.009;
const VOICE_USD_PER_MINUTE = 0.015;

export function estimateTourCost(stops: number, detail: Detail = "story") {
  const audioMinutes = stops * SCRIPT_MINUTES[detail];
  const writing = PLAN_USD + stops * SCRIPT_USD_PER_STOP;
  const voice = audioMinutes * VOICE_USD_PER_MINUTE;
  return { audioMinutes, writing, voice, total: writing + voice };
}

export const usd = (n: number) => `$${n.toFixed(2)}`;

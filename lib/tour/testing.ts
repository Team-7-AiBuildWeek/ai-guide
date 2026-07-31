/**
 * TEMPORARY — the rate-limit brake. Turn this off to get the real app back.
 *
 * Gemini's free tier is a small number of requests a minute, and a normal walk
 * spends them fast: one call for the itinerary, then one per stop for the
 * narration, plus one synthesis call per piece of narration on top. Testing the
 * *flow* does not need any of that volume, and running out mid-test tells you
 * nothing about the thing you were testing.
 *
 * So while this is on:
 *   - narration is two minutes a stop instead of four or five;
 *   - only the stop the walker is actually on is written — the next one is no
 *     longer fetched ahead while they listen.
 *
 * WHAT IT DOES NOT CHANGE, on purpose: how many stops the walk has. Stop count
 * is duration divided by (narration + walking), so shortening the narration
 * *adds* stops — a 60-minute walk goes from 8 to 12, which is more generation,
 * not less. The planner keeps using the real narration length so the itinerary
 * comes out the shape it really is.
 *
 * TO REVERT: set this to false. That restores five-minute stops and the
 * prefetch of the next stop's words. Nothing else needs touching — every
 * other file reads this flag rather than keeping its own copy.
 */
export const RATE_LIMIT_MODE = true;

/** Minutes of narration per stop while the brake is on. */
export const TESTING_SCRIPT_MINUTES = 2;

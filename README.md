# Walk Bratislava old town

AI audio walking tour, MVP. Mobile-first PWA, no accounts, no database.

## Build status

- **Step 0 — skeleton and provider layer. Done.**
- **Steps 1–6 — the whole flow. Done.** One page, one map, six stages:
  `start → brief → points → generating → headphones → tour`.
- **Step 0.5 — audio engine. Done.** One `<audio>` element per session, born on
  the headphones tap, Media Session wired, position persisted, short/full depth
  toggle, auto-advance between stops.
- Step 7 — the €8 question. Not started.

## Personalisation, length, and arrival

**Length is measured, not requested.** Models return roughly half of whatever
word count you ask for. `lib/prompts/tour-plan.ts` sets a floor per `detail`
setting, and `generateTourPlanVia` counts the words that came back and hands
the shortfall to the model stop by stop for one expansion pass. If it is still
thin the walker gets the shorter tour rather than an error — a real tour beats
a failed one. Measured: a 60-minute "tell me everything" brief produced 8 stops
and 4,038 words of narration, about 26 minutes spoken.

**The brief goes everywhere.** The walker's own words outrank the sliders in
the tour prompt, and they are sent with every question too. The same question
at the same cathedral answers differently depending on what they set out for —
coronation regalia, or roasted oxen and free wine, or sandstone and mason
marks. `answerQuestion` is a first-class method on `LLMProvider`, not a tour
request in disguise.

**Stops trigger on approach.** Within 35 m of a stop the tour moves to it and
plays. Each stop fires once, and everything before it is marked seen, so GPS
jitter cannot re-trigger and stepping back toward the previous stop does not
drag the tour backwards. Visible, and defeatable: **Auto-play on arrival** ↔
**Manual stops**.

## The flow

`components/TourFlow.tsx` is the state machine. The map mounts once and is
never torn down; only the sheet's contents and height change, which is what
makes the first screen become the second without a page transition — and means
the tiles are paid for once.

| Stage | Screen |
|---|---|
| `start` | Map, sheet resting at the bottom: **Build my tour** |
| `brief` | Sheet full screen: free text, or **simple settings** sliders |
| `points` | Start point by typing, GPS, or dropping a pin; end point optional |
| `generating` | Real phases streamed over SSE, not a timer |
| `headphones` | Use headphones. The tap on Start is the iOS audio-unlock gesture |
| `tour` | Route drawn, stops numbered, directions behind the top-right icon, **Ask anything** |

Back always goes exactly one step and never destroys anything:
`ask → tour`, `directions → tour`, `tour → landing (tour kept, resumable)`.
The map's top bar is hidden while the sheet is full — it sits at `z-30` above
the sheet's `z-20`, so two back chevrons used to stack and the one you hit
while asking a question was the tour's.

`POST /api/tours` streams progress as server-sent events so the status lines
are true — each one is emitted when that stage actually begins. `EventSource`
cannot POST, so the client parses the stream by hand.

`/api/geocode` and `/api/ask` exist so the browser never sees a provider key.

## Run it

```bash
npm run dev            # http://localhost:3000
open http://localhost:3000/dev/providers
```

**No `.env` file is needed.** All three providers default to `mock`, so the whole
app runs offline with no API keys and no spend. Copy `.env.example` to
`.env.local` only when you want to point at a real vendor.

## The provider layer

Three interfaces, each with a mock plus real implementations, all selected by
one env var. Nothing outside `lib/providers/` reads `process.env`.

| Interface | Env var | Implementations |
|---|---|---|
| `LLMProvider` | `LLM_PROVIDER` | `mock`, `anthropic`, `openai`, `google` |
| `TTSProvider` | `TTS_PROVIDER` | `mock`, `elevenlabs`, `openai`, `google`, `google-cloud` |
| `MapProvider` | `MAP_PROVIDER` | `mock`, `stadia`, `maptiler`, `mapbox`, `osm` |

```
lib/config.ts                 provider selection + keys. Defaults everything to mock.
lib/prompts/tour-plan.ts      the guide's voice. Edit without touching provider code.
lib/providers/types.ts        shared domain types + Zod schemas.
lib/providers/factory.ts      getLLM() / getTTS() / getMaps(). Server-only.
lib/providers/llm/            index.ts holds the shared validate-and-retry-once logic.
lib/providers/tts/lexicon.ts  pronunciation map, applied before every synthesis.
lib/providers/maps/           index.ts holds haversine + the straight-line fallback.
```

### Gemini (`LLM_PROVIDER=google`, `TTS_PROVIDER=google`)

Both go through `@google/genai` on one `GEMINI_API_KEY`, server-side only.
Set it in `.env.local` and hear a voice at **`/dev/tts`** without walking the
whole app.

Two things that will cost you an afternoon if you don't know them:

- **Gemini TTS returns raw PCM with no container.** 24 kHz, 16-bit, mono,
  base64, straight out of `inlineData.data`. Handed to an `<audio>` element
  as-is it plays nothing and reports no error. Every buffer goes through
  `pcmToWav` in `lib/providers/tts/wav.ts` first.
- **`gemini-2.5-flash` 404s for new keys** — "no longer available to new
  users". `GEMINI_MODEL` defaults to `gemini-3.6-flash`. To see what a given
  key can actually reach:
  `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY"`.

`TTS_PROVIDER=google-cloud` is the separate Cloud Text-to-Speech service. It
takes SSML, so it pronounces Slovak names from IPA rather than respelling —
better for place names, but a different API and often a different key.

**Stadia Maps is the one to reach for** — tiles, geocoding and walking routes
from a single key. Put the key in `.env.local`:

```
MAP_PROVIDER=stadia
STADIA_API_KEY=your-key-here
```

then reload `/dev/providers`, which exercises all four methods. Optional:
`STADIA_BASE_URL=https://api-eu.stadiamaps.com` (closer for a Bratislava app)
and `STADIA_STYLE` (`alidade_smooth` by default — a quiet light basemap that
lets the mint route line carry the eye).

### Narration and the daily quota

`/api/audio` synthesizes one stop and caches by content hash, so replaying a
stop costs nothing. The client fetches one stop ahead and both depths of the
current stop — **serialised**, because three concurrent calls trip the quota.

> **The Gemini free tier allows 10 speech requests per day.**
> `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue: 10`.
> One six-stop tour needs six to twelve. Enable billing or you will hear the
> real voice about once.
>
> The 429 says *"please retry in 55s"* even for the daily quota, which is a lie
> you can wait on for a very long time — the provider checks the `quotaId` and
> fails immediately with a useful message instead of retrying.

Three things the depth toggle taught us, all fixed:

- Synthesising the other depth can take longer than the recording currently
  playing. When the short version ran out, end-of-stop auto-advance fired and
  walked the tour on — so asking for *more* detail silently skipped you to the
  next stop. Advancing is suppressed while a swap is in flight.
- The position ratio has to be captured when the walker taps, not after the
  synthesis await, or it measures wherever the old recording drifted to.
- `wasPlaying` has to be the caller's intent for the same reason: by the time
  the new clip arrives the old one has ended and the element looks paused.

The other depth of the current stop is therefore prefetched **before** the next
stop — the queue is serial, and the toggle is the control most likely to be
pressed next.

When synthesis is unavailable, **the phone reads the stop itself** via
`speechSynthesis` and the player says so. It is a fallback, not the product:
no seeking, no lock-screen control. But the tour is never silent, and it works
offline and free, which makes the app demoable on a dead quota.

### Keeping the key out of the page

Tiles are fetched by the browser, so a key in the style URL is readable by
anyone — that is inherent to client-side maps, not a leak. Stadia's answer is
**domain-based authentication**: add the domain under *Manage Properties →
Authentication Configuration*, then set `STADIA_DOMAIN_AUTH=true` and the style
URL carries no key at all. Requests are authorised by the browser's `Origin`.

Geocoding and routing are unaffected: they run in server components and keep
using `STADIA_API_KEY`, which never reaches the browser.

| | dev (localhost) | production |
|---|---|---|
| `STADIA_DOMAIN_AUTH` | `false` | `true` |
| Key in the page | yes | **no** |
| Geocoding / routing | key, server-side | key, server-side |

Turn it on only after the domain is registered — until then every tile 401s.

Routing is Valhalla, and its leg geometry is an encoded polyline with **six**
digits of precision where almost every library defaults to five. Decoding it
wrong is silent and puts the route in the Gulf of Guinea, so
`scripts/polyline-test.mjs` round-trips the decoder.

**No Google Maps or Places implementation, deliberately.** Their terms forbid
text-to-speech use of their content and forbid generating content from Maps
data — which is exactly what this app does. `MAP_PROVIDER=osm` is the fully
open stack: OpenRouteService routing, Nominatim geocoding, OpenFreeMap tiles.

**Notes on the real implementations.** They call the vendor REST APIs with
`fetch` rather than three vendor SDKs — one dependency per vendor plus three
upgrade schedules is a lot to carry for a layer whose whole job is being
swappable. If we settle on one vendor, its official SDK is the better call.

**The mocks are useful, not empty.** The LLM returns six real old-town stops
with genuine short/full scripts; the TTS returns a playable WAV whose pitch is
derived from the text and whose length matches a real speaking rate, so the
audio engine can be built against it; the map provider serves real OpenFreeMap
tiles and geocodes real landmarks.

Known mock artifact: mock stops are clustered tightly, so a 45-minute request
routes to about 400 m of walking. Real plans and real routing fix this.

## The map (`/map`)

MapLibre GL JS, style URL from whichever `MAP_PROVIDER` is set. Live position
via `watchPosition` — foreground only, because background geolocation does not
exist on the web. First fix centres the camera; dragging the map stops it
following you, and **Recentre** resumes.

### Simulated walking (`?sim`)

A Mac has no GPS chip — it positions itself by looking up nearby wifi access
points in Apple's database. On a wired machine with no wifi association there
is nothing to look up, so **every** browser returns `POSITION_UNAVAILABLE`. No
amount of permission-granting fixes it.

So the map offers a simulated walk instead, and `/map?sim=1` starts one
straight away. It follows the six old-town stops at a real walking pace (sped
up 8×) and emits the same shape as `watchPosition`, so nothing downstream can
tell the difference. The coordinates live in `lib/tour/route.ts`, shared with
the mock LLM so the two cannot drift.

This is not only a workaround for a wired Mac — the tour cannot be tested from
a desk any other way.

**GPS needs a secure context.** On `localhost` it works. Over a plain
`http://192.168.x.x` LAN address the browser blocks it and reports a permission
denial, which sends you hunting for a setting that was never the problem — the
map names the real cause instead. To test on a phone you need HTTPS.

**Pinned to `maplibre-gl` 5.x on purpose.** Version 6.0.0 never starts its web
worker under Turbopack: the style, sprite and TileJSON all load with a 200, the
canvas sizes correctly, WebGL2 is present, and no error is logged anywhere —
but zero `.pbf` tiles are ever requested, because the worker is what fetches
and parses them. The result is a blank grey map that looks like a bad API key.
Do not upgrade to 6.x without checking that vector tiles still load.

Three traps worth remembering, all of which bit this build:

- `flex-1` inside a `min-h-full` parent resolves to **zero height**. The flex
  container's height is indefinite, so there is no free space to distribute,
  and MapLibre silently falls back to a 300px canvas. The map page uses
  `h-[100dvh]` instead — `dvh` also tracks the mobile URL bar collapsing.
- `maplibre-gl.css` forces `position: relative` on its own container, which
  cancels `absolute inset-0`. Size the container explicitly.

## Design language

Adapted from **smaut.tech**. Tokens live in `app/globals.css`; the reference
sheet is **`/dev/design`** — open it on a phone, outdoors, to judge it.

Borrowed as-is: Space Grotesk over Inter, the mint accent `#5EDA9B`, the
near-black surfaces `#1F1F1F` / `#2A2E2C`, the grey-900 heading / grey-700 body
split, the tight 4px control radius against softer 14–20px cards, and the
six-step timeline — which becomes the **route spine**, the signature element.
Numbering is honest there: stops are walked in order, so the number is the
instruction.

Changed on purpose, because this is read in sunlight, one-handed, by someone
between 45 and 60:

| Source | Here | Why |
|---|---|---|
| 16px base | 18px | The 17px+ floor |
| Mint under white text | Mint under **ink** text | Mint on white is 1.75:1; on ink it is 10.1:1 |
| Primary = near-black + white | Primary = mint + ink | Findable with the sun behind you |
| 14px control padding | 16px (48px tall) | Clears the 44px target |
| Light + dark | Light only | Dark is harder to read at full brightness in daylight |

Contrast ratios are computed on `/dev/design` rather than asserted. Every
palette pair passes AA; mint is marked fill-only.

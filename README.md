# Walk Bratislava old town

AI audio walking tour, MVP. Mobile-first PWA, no accounts, no database.

## Build status

- **Step 0 — skeleton and provider layer. Done.**
- **Step 1 — map with live GPS at `/map`. Done.** The bottom sheet and
  "Build my tour" are the remaining half of this step.
- Step 0.5 — audio engine at `/dev/audio`. Not started.
- Steps 2–7 — screens. Not started.

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
| `TTSProvider` | `TTS_PROVIDER` | `mock`, `elevenlabs`, `openai`, `google` |
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

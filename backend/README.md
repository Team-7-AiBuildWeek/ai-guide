# walk-backend

The Python service behind the web app in this repository (the repo root). Both
deploy together as one Vercel project; see "Deploying" below.

Backend for a GPS-triggered, AI-narrated walking-tour app. It has one job: **never
generate the same thing twice.** Generating a minute of narration costs hundreds of
times more than serving a stored file, so everything here is built around reuse.

The reusable unit is a **segment**: one POI's narration for a given
`(poi, language, persona, depth, script_version)`. A tour is an ordered list of
segment references plus walking legs. Two people asking for different tours of the
same city share every stop their tours have in common.

## How a tour request resolves

```
POST /tours {city, theme, language, persona, depth, minutes}
  1. select POIs that fit the time budget (popularity, theme tags), order them
     (nearest neighbour + 2-opt; our own ordering, not a guidebook's)
  2. for each stop:
       exact hit   ready segment with today's script hash + audio hash   -> $0
       stale hit   older rendering of the same stop (facts/voice changed) -> $0 now,
                   regenerated later by `walk prewarm`
       miss        claim it (INSERT ... ON CONFLICT DO NOTHING), queue it,
                   reserve its expected cost against the request + daily caps
  3. walking legs from cache or OpenRouteService
  4. record the request and each stop's hit/miss
  -> 200 ready, or 202 pending while the worker generates the misses
```

The worker (`walk worker`) turns queued work into audio:

```
draft (Gemini Flash, Batch API) -> fact-check against sources (Flash, Batch)
   -> [fail: one redraft, then reject] -> SSML + lexicon -> Chirp 3: HD -> R2
German/Slovak scripts are translated from a ready English one by Flash-Lite (Batch),
skipping the second draft and fact-check.
```

## Guarantees, and where they are enforced

| Guarantee | Enforced by |
|---|---|
| Same inputs are never paid for twice | `scripts.input_hash` and `segments.input_hash` are `UNIQUE`; claims are `INSERT ... ON CONFLICT DO NOTHING` |
| Concurrent requests for the same miss create one job | partial unique index `jobs_one_live` on live jobs |
| Budget caps are a hard stop | `budgets` `CHECK (reserved_usd + spent_usd <= cap_usd)`; every paid call is reserved at its worst case *before* it is made |
| Every paid call is recorded | `app/ledger.py` is the only spend path; one `cost_ledger` row per call; real spend beyond a reservation goes to `overrun_usd`, never dropped |
| No generation outside the Batch API | the LLM provider interface has no synchronous method; a test fails if any code calls `generate_content` |
| No keys reach the client | the app receives object keys turned into short-lived signed URLs, nothing else |
| Stale content is detectable | `poi_facts.content_hash`; a POI's `facts_hash` is part of its scripts' identity, so changed sources make their narration stale |

### What goes into each hash

- **Script:** poi, language, persona, depth, `SCRIPT_VERSION`, facts hash. The LLM model is
  metadata, not identity: switching models is a deliberate `SCRIPT_VERSION` bump.
- **Audio:** script hash + script text, TTS provider/model, voice, and only the lexicon
  entries that script actually uses. A new voice re-renders audio without paying for
  scripts again; fixing one pronunciation re-renders only the clips containing that word.

## Prices (verified 1 October 2026)

| | Price | Note |
|---|---|---|
| Gemini 3.8 / 3.6 Flash, Batch | $0.375 in / $1.875 out per MTok | promotional until 31 Dec 2026, then $0.75 / $3.75 |
| Gemini 3.5 Flash-Lite, Batch | $0.15 / $1.25 per MTok | |
| Chirp 3: HD | $30 per 1M characters, first 1M/month free | SSML tags are billed; requests are capped at 5,000 **bytes** |

Prices live in `model_prices` with effective dates (`migrations/sql/0002_seed_prices.sql`),
so the January price change needs no code. The ledger records list price, so it
overstates spend inside the Chirp free tier rather than understating it.

Rough cost of one ~4-minute segment: draft ~$0.007 + fact-check ~$0.003 + audio ~$0.105.
**Audio is about 90% of the bill**, which is why audio is cached separately from scripts.

## Local setup

### With Docker

```sh
cp .env.example .env          # fakes by default: offline, $0
docker compose up -d --build  # Postgres, MinIO (stands in for R2), API on :8000, worker
docker compose exec api walk seed-demo
```

### Without Docker

Any Postgres 14+ works.

Keep the virtualenv **outside** `backend/` (the repo's gitignored `.local/` is the
place): Vercel bundles everything inside a service's folder, and a local `.venv`
there pushes the function over its 500 MB limit.

```sh
# from backend/
python3.12 -m venv ../.local/venv && ../.local/venv/bin/pip install -e '.[dev]'
export DATABASE_URL=postgresql+psycopg://user@localhost:5432/walk
export LLM_PROVIDER=fake TTS_PROVIDER=fake ROUTING_PROVIDER=fake STORAGE_BACKEND=local ADMIN_TOKEN=change-me
../.local/venv/bin/alembic upgrade head
../.local/venv/bin/walk storage-init
../.local/venv/bin/uvicorn app.api.main:app --reload --port 8000   # API
../.local/venv/bin/walk worker                                     # queue, in another terminal
```

`STORAGE_BACKEND=local` writes MP3s to `./local-audio` and serves them from this API at
`/files/...` with expiring signed links. It's for development on one machine only.

On macOS with Python 3.13+, if `walk` fails with `No module named 'app'`, macOS has
marked the install hook as hidden and Python skips hidden `.pth` files. Run
`chflags nohidden ../.local/venv/lib/python3*/site-packages/*.pth`, or use
`python -m app.cli` in place of `walk`.

## Worked example: seed a city, generate a tour, see what it cost

This is real output from a clean database with the fake providers. The fakes bill
simulated usage at the real providers' list prices, so the numbers show what a real run
would cost. Ledger rows say `fake-gemini` / `fake-tts`, so the two are never confused.

```text
$ walk seed-demo
seeded Bratislava (city id 1)

$ walk tour --city bratislava --minutes 45
tour 1: pending, 0/6 segments from cache (0%), $0.735622 reserved for the misses

$ walk worker --once        # 1st pass: drafts submitted as one batch and collected
worker: {'recovered': 0, 'submitted': 6, 'advanced': 6, 'audio': 0, 'tours_ready': 0}
$ walk worker --once        # 2nd pass: fact-checks pass, audio rendered, tour ready
worker: {'recovered': 0, 'submitted': 6, 'advanced': 6, 'audio': 6, 'tours_ready': 1}

$ walk tour --city bratislava --minutes 45                  # someone asks again
tour 1: ready, 6/6 segments from cache (100%), $0 reserved for the misses [existing tour]

$ walk tour --city bratislava --theme architecture --minutes 60   # a different tour
tour 2: pending, 5/7 segments from cache (71%), $0.245200 reserved for the misses

$ walk costs
Total spend, last 30 days: $0.628826
  2026-10-01  fake-tts          chirp3-hd              standard tts           8 calls  $0.604440
  2026-10-01  fake-gemini       gemini-3.8-flash       batch    draft         8 calls  $0.015939
  2026-10-01  fake-gemini       gemini-3.8-flash       batch    check         8 calls  $0.008447
Cache: 11/19 segments served from cache across 3 requests (hit ratio 0.5789)
Recent requests:
  request    3 -> tour 2: 5/7 hits, misses cost $0.159678
  request    2 -> tour 1: 6/6 hits, misses cost $0
  request    1 -> tour 1: 0/6 hits, misses cost $0.469148
Tours (content cost, whoever paid):
  tour    2 architecture en storyteller full  ready   7 stops  $0.555595
  tour    1 highlights   en storyteller full  ready   6 stops  $0.469148
```

What to notice:

- **Reservations are released.** Request 1 reserved $0.74, but its misses actually cost $0.47; the rest went back to the budget.
- **Repeats are free.** The second, identical request cost nothing.
- **Different tours share stops.** The architecture tour reused 5 of its 7 stops and paid only for the 2 new ones.
- **Audio dominates.** TTS is 96% of the spend.

The same numbers are available as JSON from `GET /admin/costs` with the `X-Admin-Token` header.

The bundle the app downloads (`GET /tours/1/bundle`), one stop shown:

```json
{
  "position": 0, "poi_id": 6, "name": "Bratislava Castle", "local_name": "Bratislavský hrad",
  "lat": 48.14226, "lng": 17.10001, "trigger_radius_m": 40,
  "audio": {"url": "<signed URL>", "duration_ms": 165966, "bytes": 2655456,
            "content_type": "audio/mpeg", "id": "ffbf452a..."},
  "transcript": "...",
  "sources": [{"url": "demo://bratislava/DEMO6", "license": "CC0-1.0"}],
  "walk_to_next": {"distance_m": 442, "duration_s": 368, "polyline": "cxydHazjgBh@q[",
                   "polyline_precision": 5, "instructions": [...]}
}
```

## Real providers

```sh
# .env
LLM_PROVIDER=gemini      GEMINI_API_KEY=...
TTS_PROVIDER=chirp       GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
ROUTING_PROVIDER=ors     ORS_API_KEY=...
WIKIMEDIA_CONTACT="you@example.com"     # Wikimedia requires a contact in the User-Agent
S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com  S3_ACCESS_KEY_ID=...  S3_SECRET_ACCESS_KEY=...
```

```sh
walk seed-city vienna --name Vienna --country AT --local-language de \
     --bbox 48.195,16.355,48.220,16.390 --limit 60
walk prewarm --city vienna --budget-usd 5 --dry-run   # see the plan, spend nothing
walk prewarm --city vienna --budget-usd 5             # reserve and queue, never above $5
walk worker                                           # polls batches every 30 s until done
```

- **`seed-city`** pulls POIs from Wikidata within the bounding box, then stores Wikidata
  facts and Wikipedia article text in `poi_facts` with source URL, revision and licence.
  - It keeps only places a walker can stand in front of: churches, palaces, squares,
    monuments and so on. Political parties and events that carry an address are dropped.
  - Popularity is the 12-month median of monthly Wikipedia pageviews (English plus the
    local edition) with a smaller sitelink term.
  - Re-running it refreshes facts. POIs whose sources changed are reported, and their
    narration becomes stale.
- **`prewarm`** ranks missing segments in this order:
  1. combinations that real requests missed or got stale in the last 30 days;
  2. the top-N POIs, favouring en / storyteller / full until demand says otherwise.

  With `--tours` (the default) it first builds one ready-made tour per theme for
  `GET /cities/{id}/tours`. Every item is reserved before it is queued, and the run
  stops taking items once the cap is reached.

Batch jobs usually finish within minutes and can take up to 24 hours. Custom tours with
misses stay `pending` until then; the app polls `GET /tours/{id}`.

## API

| | |
|---|---|
| `GET /cities` | active cities |
| `GET /cities/{id}/tours` | ready-made tours, the fast path |
| `POST /tours` | existing tour, or a new one built from cache with misses queued. `200` ready, `202` pending, `429` when the request or daily generation cap is reached |
| `GET /tours/{id}` | status and stops |
| `GET /tours/{id}/bundle` | offline manifest: ordered stops, lat/lng, trigger radius, signed MP3 URL, duration, transcript, sources, walking directions. `409` until ready |
| `GET /admin/costs` | spend by day/model, cache-hit ratio, miss cost per request, content cost per tour. Needs `X-Admin-Token` |

## The web app

The web app at the repo root uses this backend when its `BACKEND_URL` is set (see
the root README, "Pre-recorded tours"). Everything goes through the web app's own
server, so the browser never talks to this API. It relies on:

- `GET /meta` and `GET /cities` to decide whether a walker's brief is one this backend serves
- `POST /tours` with `start_lat` / `start_lng`, so the tour begins at the stops nearest
  the walker. Starts are rounded to ~100 m, so neighbours share a tour.
- `GET /tours/{id}/bundle?partial=true`: the tour while it is still generating, with
  `audio` and `transcript` null on the stops that are not ready
- `GET /segments/{id}`: a freshly signed URL for one recording, so saved walks outlive
  the links in them

With `STORAGE_BACKEND=local`, audio is served by this API at `/files/...` behind an
expiring HMAC signature (set `PUBLIC_BASE_URL` to where the browser can reach the API).
In production it comes straight from R2.

## Deploying

One Vercel project serves both halves (`vercel.json` at the repo root, Vercel
Services, beta): the Next.js app is the public service; this API is private,
reachable only through the web app's service binding, which sets `BACKEND_URL`.

Vercel functions do not run forever, so there is no `walk worker` there. The queue
moves through `POST /internal/worker/tick`, which the web app calls after a tour
that missed and while a walker waits for a stop, and which Vercel Cron calls once
a day (`/api/cron/worker`) as a backstop. Both sides share `CRON_SECRET`. Running
`walk worker` from a laptop against the production database works too, and is the
fastest way to finish a big `prewarm`.

Project environment variables (shared by both services):

| Variable | |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://...` (Neon or Supabase) |
| `MIGRATE_ON_START=true` | apply migrations when the API starts; serverless has no deploy hook |
| `CRON_SECRET` | any long random string |
| `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` | |
| `TTS_PROVIDER=chirp`, `GOOGLE_CREDENTIALS_JSON` | the service-account JSON itself, not a path |
| `ROUTING_PROVIDER=ors`, `ORS_API_KEY` | |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION=auto` | Cloudflare R2 |
| `REQUEST_BUDGET_USD`, `DAILY_BUDGET_USD`, `ADMIN_TOKEN` | optional |

Until these are set the backend fails to start, and the web app quietly writes every
tour live, exactly as it did before the backend existed.

## Tests

```sh
export TEST_DATABASE_URL=postgresql+psycopg://walk:walk@localhost:5432/walk_test   # compose's Postgres
.venv/bin/pytest
```

Tests run against real Postgres, because the guarantees under test live in the database.
The schema is built by the real migrations. The suite covers:

- **Cache hits:** repeats, overlapping tours, voice and lexicon changes, stale facts, translation.
- **Idempotency:** the unique constraints, and 8 concurrent requests for the same miss producing one job and one reservation.
- **Budget enforcement:** the DB CHECK, prewarm at three caps, the daily cap returning 429, and the worker refusing uncovered work.
- **Ledger completeness and dated prices.**
- **SSML byte chunking.**
- **The batch-only rule.**
- **Crash recovery.**
- **The API.**

## Layout

```
migrations/sql/          plain SQL; Alembic only tracks what has run
app/config.py            personas, depths, languages, themes, caps
app/hashing.py           cache identity
app/budget.py            reserve / settle / release
app/ledger.py            the only way spend is recorded
app/pricing.py           dated price lookup
app/ssml.py              lexicon -> <phoneme>, byte-bounded chunks
app/providers/           Gemini Batch, Chirp 3: HD, OpenRouteService, and fakes
app/pipeline/            prompts, work claiming, the worker
app/tours/               POI selection, ordering, resolution
app/prewarm.py           budget-capped pre-generation
app/ingest/              Wikidata/Wikipedia seeding, demo fixture
app/api/                 FastAPI
```

## Known gaps

- **Real providers are untested.** The Gemini Batch, Chirp 3: HD and OpenRouteService
  clients are written against their current SDKs and docs but have only run against the
  fakes. Before trusting them, run a $1 `prewarm` with real keys and listen to the output.
- **Chirp 3: HD SSML is Pre-GA.** Whether `<phoneme>` works in sk-SK, cs-CZ and hu-HU
  narration is unverified. (Google's separate `custom_pronunciations` field is
  documented as unavailable in those locales.) The lexicon entries in the demo
  fixture are unverified guesses copied from the web app.
- **Overture Maps is not used yet.** Coordinates come from Wikidata. Correcting them
  against Overture `places` would tighten trigger points.
- **Tours pin the segments they were built with.** When prewarm regenerates a stale
  segment, existing tours keep serving the old one; new requests get the new one.
- **Licensing.** Wikipedia text is CC BY-SA 4.0. Narration is written from it, not copied,
  and every stop's sources and licences are in the bundle for attribution. Have someone
  check the attribution wording before launch.
- **Docker Compose is untested.** It hasn't been run, because Docker wasn't available
  where this was built. Everything else was run against Postgres 16 directly.

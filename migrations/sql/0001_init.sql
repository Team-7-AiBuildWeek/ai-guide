-- walk-backend initial schema.
--
-- The guarantees that matter live here rather than in application code:
--   * scripts.input_hash / segments.input_hash UNIQUE  -> same inputs never paid for twice
--   * budgets CHECK (reserved + spent <= cap)            -> a budget cap is a hard stop
--   * jobs_one_live unique index                         -> one live job per piece of work
-- Plain Postgres only: no extensions, so Supabase, Neon or a laptop all work.

CREATE TABLE cities (
    id              bigserial PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    name            text NOT NULL,
    country_code    char(2) NOT NULL,
    local_language  text NOT NULL,              -- Wikipedia edition used for local pageviews
    min_lat         double precision NOT NULL,
    min_lng         double precision NOT NULL,
    max_lat         double precision NOT NULL,
    max_lng         double precision NOT NULL,
    centroid_lat    double precision NOT NULL,
    centroid_lng    double precision NOT NULL,
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (min_lat < max_lat AND min_lng < max_lng)
);

CREATE TABLE pois (
    id                bigserial PRIMARY KEY,
    city_id           bigint NOT NULL REFERENCES cities (id),
    name              text NOT NULL,
    local_name        text,                     -- as written on the building, with diacritics
    lat               double precision NOT NULL,
    lng               double precision NOT NULL,
    trigger_radius_m  integer NOT NULL DEFAULT 40 CHECK (trigger_radius_m > 0),
    wikidata_qid      text UNIQUE,
    overture_id       text UNIQUE,
    category          text,
    tags              text[] NOT NULL DEFAULT '{}',   -- theme tags used for selection only
    popularity_score  double precision NOT NULL DEFAULT 0,
    facts_hash        text,                     -- hash of the current poi_facts set
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pois_city_active ON pois (city_id) WHERE is_active;

-- Grounding material. Rows are never edited: a changed source gets a new row and the
-- old one is marked superseded, so a script can always point at exactly what it used.
CREATE TABLE poi_facts (
    id               bigserial PRIMARY KEY,
    poi_id           bigint NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
    source_type      text NOT NULL CHECK (source_type IN ('wikidata', 'wikipedia', 'overture', 'manual')),
    source_url       text NOT NULL,
    source_revision  text,
    license          text NOT NULL,
    language         text NOT NULL,
    content          text NOT NULL,
    content_hash     text NOT NULL,
    retrieved_at     timestamptz NOT NULL DEFAULT now(),
    superseded_at    timestamptz,
    UNIQUE (poi_id, source_url, content_hash)
);
CREATE UNIQUE INDEX poi_facts_one_current ON poi_facts (poi_id, source_url) WHERE superseded_at IS NULL;

-- One narration text. input_hash covers (poi, language, persona, depth, script_version,
-- facts_hash); the model that wrote it is recorded but is not part of the identity.
CREATE TABLE scripts (
    id                         bigserial PRIMARY KEY,
    poi_id                     bigint NOT NULL REFERENCES pois (id),
    language                   text NOT NULL,
    persona                    text NOT NULL,
    depth_level                text NOT NULL,
    script_version             integer NOT NULL,
    facts_hash                 text NOT NULL,
    input_hash                 text NOT NULL UNIQUE,
    status                     text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'drafted', 'ready', 'rejected', 'failed')),
    script_text                text,
    word_count                 integer,
    llm_model                  text,
    fact_check                 jsonb,
    qa_status                  text NOT NULL DEFAULT 'unchecked'
                               CHECK (qa_status IN ('unchecked', 'passed', 'failed', 'inherited')),
    draft_attempts             integer NOT NULL DEFAULT 0,
    translated_from_script_id  bigint REFERENCES scripts (id),
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'ready' OR script_text IS NOT NULL)
);
CREATE INDEX scripts_lookup ON scripts (poi_id, language, persona, depth_level, status);

CREATE TABLE script_sources (
    script_id    bigint NOT NULL REFERENCES scripts (id) ON DELETE CASCADE,
    poi_fact_id  bigint NOT NULL REFERENCES poi_facts (id),
    PRIMARY KEY (script_id, poi_fact_id)
);

-- One rendered audio file. input_hash covers the script, voice, TTS model and only the
-- lexicon entries the script actually uses, so a voice change re-renders audio without
-- paying for a new script.
CREATE TABLE segments (
    id             bigserial PRIMARY KEY,
    script_id      bigint NOT NULL REFERENCES scripts (id),
    poi_id         bigint NOT NULL REFERENCES pois (id),
    language       text NOT NULL,
    persona        text NOT NULL,
    depth_level    text NOT NULL,
    tts_provider   text NOT NULL,
    tts_model      text NOT NULL,
    voice_id       text NOT NULL,
    lexicon_hash   text NOT NULL,
    ssml           text NOT NULL,
    input_hash     text NOT NULL UNIQUE,
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
    audio_key      text,                        -- object key; URLs are signed per request
    audio_bytes    integer,
    duration_ms    integer,
    billed_chars   integer,
    error          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'ready' OR (audio_key IS NOT NULL AND duration_ms IS NOT NULL))
);
CREATE INDEX segments_lookup ON segments (poi_id, language, persona, depth_level, status);

CREATE TABLE walking_legs (
    id            bigserial PRIMARY KEY,
    from_poi_id   bigint NOT NULL REFERENCES pois (id),
    to_poi_id     bigint NOT NULL REFERENCES pois (id),
    provider      text NOT NULL,
    language      text NOT NULL,                -- language of the turn-by-turn instructions
    distance_m    integer NOT NULL,
    duration_s    integer NOT NULL,
    polyline      text NOT NULL,                -- encoded polyline, precision 5
    instructions  jsonb NOT NULL DEFAULT '[]',
    retrieved_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (from_poi_id, to_poi_id, provider, language)
);

CREATE TABLE tours (
    id                   bigserial PRIMARY KEY,
    city_id              bigint NOT NULL REFERENCES cities (id),
    params_hash          text NOT NULL UNIQUE,  -- identical requests resolve to one tour
    theme                text NOT NULL,
    language             text NOT NULL,
    persona              text NOT NULL,
    depth_level          text NOT NULL,
    target_duration_min  integer NOT NULL CHECK (target_duration_min > 0),
    start_poi_id         bigint REFERENCES pois (id),
    status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
    route_geojson        jsonb,
    total_walk_m         integer,
    total_duration_ms    bigint,
    is_prewarmed         boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tours_city_ready ON tours (city_id) WHERE status = 'ready';

CREATE TABLE tour_stops (
    tour_id         bigint NOT NULL REFERENCES tours (id) ON DELETE CASCADE,
    position        integer NOT NULL CHECK (position >= 0),
    poi_id          bigint NOT NULL REFERENCES pois (id),
    script_id       bigint NOT NULL REFERENCES scripts (id),
    segment_id      bigint REFERENCES segments (id),   -- null until the audio exists
    leg_to_next_id  bigint REFERENCES walking_legs (id),
    PRIMARY KEY (tour_id, position)
);

-- Price list with effective dates: the 2027 Gemini price change is a data row, not code.
CREATE TABLE model_prices (
    id               bigserial PRIMARY KEY,
    provider         text NOT NULL,
    model            text NOT NULL,
    tier             text NOT NULL CHECK (tier IN ('standard', 'batch', 'flex')),
    unit_type        text NOT NULL CHECK (unit_type IN ('input_token', 'output_token', 'cached_input_token', 'character', 'request')),
    usd_per_million  numeric(14, 6) NOT NULL CHECK (usd_per_million >= 0),
    effective_from   date NOT NULL,
    effective_to     date,                      -- exclusive; null = open-ended
    source_url       text NOT NULL,
    UNIQUE (provider, model, tier, unit_type, effective_from),
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Spend caps. Work reserves its worst-case cost before any paid call and settles to the
-- actual cost afterwards. The CHECK makes an over-cap reservation fail in the database.
-- overrun_usd records any amount a provider charged beyond its reservation, so real
-- spend is never dropped to satisfy the constraint.
CREATE TABLE budgets (
    id            bigserial PRIMARY KEY,
    scope         text NOT NULL CHECK (scope IN ('prewarm_run', 'daily', 'tour_request')),
    label         text NOT NULL,
    day           date,                         -- set for scope = 'daily'
    cap_usd       numeric(12, 6) NOT NULL CHECK (cap_usd >= 0),
    reserved_usd  numeric(12, 6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
    spent_usd     numeric(12, 6) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
    overrun_usd   numeric(12, 6) NOT NULL DEFAULT 0 CHECK (overrun_usd >= 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT budget_hard_cap CHECK (reserved_usd + spent_usd <= cap_usd),
    CHECK ((scope = 'daily') = (day IS NOT NULL))
);
CREATE UNIQUE INDEX budgets_one_per_day ON budgets (day) WHERE scope = 'daily';

CREATE TABLE tour_requests (
    id              bigserial PRIMARY KEY,
    city_id         bigint NOT NULL REFERENCES cities (id),
    params          jsonb NOT NULL,
    tour_id         bigint REFERENCES tours (id),
    budget_id       bigint REFERENCES budgets (id),
    segments_total  integer NOT NULL DEFAULT 0,
    segments_hit    integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (segments_hit <= segments_total)
);

-- Per-stop outcome of a request. Misses grouped by (poi, language, persona, depth) are
-- the demand signal for pre-warming.
CREATE TABLE request_items (
    tour_request_id  bigint NOT NULL REFERENCES tour_requests (id) ON DELETE CASCADE,
    position         integer NOT NULL,
    poi_id           bigint NOT NULL REFERENCES pois (id),
    language         text NOT NULL,
    persona          text NOT NULL,
    depth_level      text NOT NULL,
    script_id        bigint REFERENCES scripts (id),
    segment_id       bigint REFERENCES segments (id),
    was_hit          boolean NOT NULL,
    was_stale        boolean NOT NULL DEFAULT false,
    PRIMARY KEY (tour_request_id, position)
);
CREATE INDEX request_items_misses ON request_items (poi_id, language, persona, depth_level) WHERE NOT was_hit;

CREATE TABLE pronunciation_lexicon (
    id            bigserial PRIMARY KEY,
    locale        text NOT NULL,                -- narration locale, e.g. en-US
    surface_form  text NOT NULL,
    alphabet      text NOT NULL CHECK (alphabet IN ('ipa', 'x-sampa')),
    phoneme       text NOT NULL,
    poi_id        bigint REFERENCES pois (id),
    notes         text,
    verified_by   text,                         -- null = unverified guess
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (locale, surface_form)
);

CREATE TABLE jobs (
    id                 bigserial PRIMARY KEY,
    job_type           text NOT NULL CHECK (job_type IN ('script', 'audio')),
    payload            jsonb NOT NULL,
    dedupe_key         text NOT NULL,
    status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'submitted', 'done', 'failed', 'over_budget')),
    priority           integer NOT NULL DEFAULT 0,
    attempts           integer NOT NULL DEFAULT 0,
    max_attempts       integer NOT NULL DEFAULT 3,
    run_after          timestamptz NOT NULL DEFAULT now(),
    locked_by          text,
    locked_at          timestamptz,
    external_batch_id  text,
    budget_id          bigint REFERENCES budgets (id),
    daily_budget_id    bigint REFERENCES budgets (id),   -- on-demand work also draws on the daily cap
    reserved_usd       numeric(12, 6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),  -- still held for this job
    error              text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    started_at         timestamptz,
    finished_at        timestamptz
);
-- One live job per piece of work; a failed or over-budget job can be retried later.
CREATE UNIQUE INDEX jobs_one_live ON jobs (dedupe_key) WHERE status IN ('queued', 'running', 'submitted');
CREATE INDEX jobs_ready ON jobs (job_type, priority DESC, id) WHERE status = 'queued';
CREATE INDEX jobs_submitted ON jobs (external_batch_id) WHERE status = 'submitted';

-- Every paid call writes exactly one row here. No row, no spend.
CREATE TABLE cost_ledger (
    id                   bigserial PRIMARY KEY,
    job_id               bigint REFERENCES jobs (id),
    budget_id            bigint REFERENCES budgets (id),
    provider             text NOT NULL,
    model                text NOT NULL,
    tier                 text NOT NULL,
    operation            text NOT NULL,         -- draft | fact_check | translate | tts | route
    units                jsonb NOT NULL,        -- e.g. {"input_token": 3120, "output_token": 2410}
    cost_usd             numeric(12, 6) NOT NULL CHECK (cost_usd >= 0),
    script_id            bigint REFERENCES scripts (id),
    segment_id           bigint REFERENCES segments (id),
    external_request_id  text,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cost_ledger_created ON cost_ledger (created_at);
CREATE INDEX cost_ledger_script ON cost_ledger (script_id);
CREATE INDEX cost_ledger_segment ON cost_ledger (segment_id);

"""The point of the whole backend: never pay for the same thing twice."""

import dataclasses
from decimal import Decimal

from sqlalchemy import select, text

from app.ingest.store import upsert_fact
from app.models import Poi, Script, Segment, Tour
from app.pipeline.content import refresh_facts_hash
from app.prewarm import prewarm
from app.reports import cost_report
from app.tours.resolve import TourParams, resolve_tour


def request(sessions, providers, settings, **params):
    with sessions.begin() as session:
        return resolve_tour(session, TourParams(**params), providers, settings)


def test_first_request_misses_then_generates_once(sessions, providers, settings, worker, city, ledger_rows):
    r = request(sessions, providers, settings, city_id=city.id, duration_min=45)
    assert r.tour.status == "pending"
    assert r.request.segments_hit == 0 and r.request.segments_total > 0
    worker.drain()
    with sessions() as session:
        assert session.get(Tour, r.tour.id).status == "ready"
    n = r.request.segments_total
    assert ledger_rows("operation = 'draft'") == n
    assert ledger_rows("operation = 'check'") == n
    assert ledger_rows("operation = 'tts'") == n


def test_identical_request_is_all_hits_and_free(sessions, providers, settings, worker, city, ledger_rows):
    request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    before = ledger_rows()
    again = request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    assert again.reused_tour
    assert again.hit_ratio == 1.0
    assert ledger_rows() == before


def test_different_tours_share_segments(sessions, providers, settings, worker, city, ledger_rows):
    """A different theme and length still reuses every stop the two tours have in common."""
    first = request(sessions, providers, settings, city_id=city.id, theme="highlights", duration_min=45)
    worker.drain()
    before = ledger_rows("operation = 'tts'")
    second = request(sessions, providers, settings, city_id=city.id, theme="architecture", duration_min=60)
    worker.drain()
    with sessions() as session:
        stops_first = set(session.scalars(text(f"SELECT poi_id FROM tour_stops WHERE tour_id = {first.tour.id}")))
        stops_second = set(session.scalars(text(f"SELECT poi_id FROM tour_stops WHERE tour_id = {second.tour.id}")))
    shared = stops_first & stops_second
    assert shared, "fixture should produce overlapping tours"
    assert second.request.segments_hit == len(shared)
    assert ledger_rows("operation = 'tts'") - before == len(stops_second - stops_first)


def test_hit_ratio_and_miss_cost_are_reported(sessions, providers, settings, worker, city, total_spend):
    first = request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    request(sessions, providers, settings, city_id=city.id, duration_min=45)
    with sessions() as session:
        report = cost_report(session)
    by_id = {r["request_id"]: r for r in report["recent_requests"]}
    assert by_id[first.request.id]["miss_cost_usd"] == total_spend() > 0
    second = next(r for r in report["recent_requests"] if r["request_id"] != first.request.id)
    assert second["hit_ratio"] == 1 and second["miss_cost_usd"] == 0
    assert report["cache"]["hit_ratio"] == 0.5


def test_voice_change_rerenders_audio_but_not_scripts(sessions, providers, settings, worker, city, engine):
    request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    with sessions() as session:
        existing = set(session.scalars(select(Script.id).where(Script.status == "ready")))

    def llm_rows_for_existing() -> int:
        with engine.connect() as conn:
            return conn.execute(text("SELECT count(*) FROM cost_ledger WHERE operation IN ('draft', 'check') "
                                     "AND script_id = ANY(:ids)"), {"ids": list(existing)}).scalar_one()

    llm_before = llm_rows_for_existing()
    new_voice = dataclasses.replace(settings, voice_name="Kore")
    # A request under the new voice is served the old audio (stale) at no cost...
    r = request(sessions, providers, new_voice, city_id=city.id, duration_min=50)
    assert r.hit_ratio == 1.0
    with sessions() as session:
        assert session.scalar(text(f"SELECT bool_and(was_stale) FROM request_items WHERE tour_request_id = {r.request.id}"))
    # ...and prewarm re-renders the audio without paying for those scripts again.
    with sessions.begin() as session:
        prewarm(session, new_voice, providers, city_id=city.id, budget_usd=Decimal("5"), top_n=8, with_tours=False)
    type(worker)(sessions, providers, worker.storage, new_voice).drain()
    assert llm_rows_for_existing() == llm_before
    with sessions() as session:
        rerendered = session.scalars(select(Segment.script_id).where(
            Segment.voice_id.like("%-Kore"), Segment.status == "ready")).all()
    assert existing <= set(rerendered)


def test_lexicon_edit_rerenders_only_affected_audio(sessions, providers, settings, worker, city):
    request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    with sessions.begin() as session:
        hashes_before = dict(session.execute(select(Segment.id, Segment.input_hash)).all())
        # The fake narration mentions each POI's English name; add a pronunciation for one.
        poi = session.scalars(select(Poi).where(Poi.name == "Main Square")).one()
        session.execute(text("INSERT INTO pronunciation_lexicon (locale, surface_form, alphabet, phoneme) "
                             "VALUES ('en-US', 'Main Square', 'ipa', 'meɪn skwɛər')"))
    from app.pipeline.work import planned_segment
    with sessions() as session:
        changed = []
        for segment in session.scalars(select(Segment)):
            script = session.get(Script, segment.script_id)
            new_hash, _ = planned_segment(session, script, settings, providers.tts)
            if new_hash != hashes_before[segment.id]:
                changed.append(segment.poi_id)
    assert changed == [poi.id]


def test_changed_facts_serve_stale_then_prewarm_regenerates(sessions, providers, settings, worker, city, ledger_rows):
    first = request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    with sessions.begin() as session:
        stop_poi = session.scalar(text(f"SELECT poi_id FROM tour_stops WHERE tour_id = {first.tour.id} LIMIT 1"))
        poi = session.get(Poi, stop_poi)
        upsert_fact(session, poi.id, source_type="manual", source_url=f"demo://bratislava/{poi.wikidata_qid}",
                    license="CC0-1.0", language="en", content="The entrance has moved to the north side.")
        refresh_facts_hash(session, poi)
    before = ledger_rows()
    r = request(sessions, providers, settings, city_id=city.id, duration_min=50)
    assert r.hit_ratio == 1.0 and ledger_rows() == before  # served stale, nothing spent on the request path
    with sessions.begin() as session:
        report = prewarm(session, settings, providers, city_id=city.id, budget_usd=Decimal("0.20"),
                         top_n=8, with_tours=False)
    assert any(c.poi_id == poi.id and c.reason.startswith("demand") for c in report.queued)
    worker.drain()
    with sessions() as session:
        fresh = session.scalars(select(Script).where(Script.poi_id == poi.id, Script.facts_hash == poi.facts_hash,
                                                     Script.status == "ready")).first()
        assert fresh is not None


def test_other_languages_translate_from_english(sessions, providers, settings, worker, city, ledger_rows):
    request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    drafts = ledger_rows("operation = 'draft'")
    de = request(sessions, providers, settings, city_id=city.id, duration_min=45, language="de")
    worker.drain()
    assert ledger_rows("operation = 'draft'") == drafts
    assert ledger_rows(f"operation = 'translate' AND model = '{settings.mechanical_model}'") == de.request.segments_total
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM scripts WHERE language = 'de' AND qa_status = 'inherited' "
                                   "AND translated_from_script_id IS NOT NULL")) == de.request.segments_total


def test_fact_check_failure_rejects_after_one_redraft(sessions, settings, worker, city, ledger_rows):
    from app.providers import Providers
    from app.providers.llm import FakeLLMProvider
    from app.providers.routing import FakeRoutingProvider
    from app.providers.tts import FakeTTSProvider

    strict = Providers(FakeLLMProvider(fact_check_verdict="fail"), FakeTTSProvider(), FakeRoutingProvider())
    r = request(sessions, strict, settings, city_id=city.id, duration_min=20)
    type(worker)(sessions, strict, worker.storage, settings).drain()
    n = r.request.segments_total
    assert ledger_rows("operation = 'draft'") == 2 * n
    assert ledger_rows("operation = 'tts'") == 0
    with sessions() as session:
        assert session.get(Tour, r.tour.id).status == "failed"
        assert session.scalar(text("SELECT count(*) FROM scripts WHERE status = 'rejected'")) == n

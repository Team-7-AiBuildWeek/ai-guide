from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.models import Job
from app.tours.resolve import TourParams, resolve_tour


def test_crash_between_submit_and_commit_is_recovered_without_resubmitting(sessions, providers, settings, worker, city):
    with sessions.begin() as session:
        resolve_tour(session, TourParams(city_id=city.id, duration_min=20), providers, settings)
    # Simulate: jobs marked with a pending token, the batch created, then the process died.
    worker.submit_script_batches()
    with sessions.begin() as session:
        batch_id = session.scalar(select(Job.external_batch_id).where(Job.status == "submitted"))
        token = providers.llm.batches[batch_id][0]
        session.execute(text("UPDATE jobs SET status = 'running', external_batch_id = :t, locked_at = :old"),
                        {"t": "pending:" + token, "old": datetime.now(UTC) - timedelta(hours=1)})
    submitted_before = len(providers.llm.submitted)
    assert worker.recover_pending_submissions() > 0
    with sessions() as session:
        assert set(session.scalars(select(Job.external_batch_id))) == {batch_id}
    worker.drain()
    first_draft_round = submitted_before
    # Recovery reused the batch: the only new submissions are the fact-check round.
    assert len(providers.llm.submitted) == first_draft_round * 2


def test_failed_tts_is_retried_without_a_ledger_row(sessions, providers, settings, worker, city, ledger_rows):
    with sessions.begin() as session:
        resolve_tour(session, TourParams(city_id=city.id, duration_min=20), providers, settings)
    original = providers.tts.synthesize
    calls = {"n": 0}

    def flaky(chunks, voice, locale):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("503 from TTS")
        return original(chunks, voice, locale)

    providers.tts.synthesize = flaky
    worker.drain()
    with sessions.begin() as session:  # skip the retry backoff
        session.execute(text("UPDATE jobs SET run_after = now() WHERE status = 'queued'"))
    worker.drain()
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM segments WHERE status = 'ready'")) == ledger_rows("operation = 'tts'")
        assert session.scalar(text("SELECT count(*) FROM segments WHERE status <> 'ready'")) == 0

"""The DB-backed worker. One loop, four steps, each in its own transaction:

  1. submit queued script work as Gemini batches (draft, fact-check, translate)
  2. poll submitted batches and advance each script
  3. voice the scripts that are ready: as a Gemini TTS batch (collected by step 2), or
     one segment at a time for a synchronous voice (Chirp)
  4. mark tours ready once every stop has audio

Spend safety: a batch is reserved and its jobs marked submitted-pending in a committed
transaction *before* the provider call, and the batch carries that token as its display
name, so a crash between "submit" and "commit" is recovered by looking the batch up
instead of submitting it twice. TTS ledger rows are committed straight after the call.
"""

import io
import json
import logging
import os
import socket
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import mutagen.mp3
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session, sessionmaker

from app.audio import mp3_duration_ms, pcm_from, pcm_to_mp3
from app.budget import BudgetExceeded, ensure_reserved, release_job
from app.config import DEPTHS, LANGUAGES, Settings
from app.ledger import record
from app.models import Job, Poi, Script, ScriptSource, Segment
from app.pipeline import prompts
from app.pipeline.content import current_facts
from app.pipeline.work import Funding, claim_segment, enqueue_audio
from app.pricing import cost
from app.providers import Providers
from app.providers.llm import LLMRequest
from app.providers.tts import TTSInput, TTSRequest, TTSResult
from app.storage import Storage

log = logging.getLogger("walk.worker")
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"
PENDING_PREFIX = "pending:"
MAX_DRAFTS = 2
BUDGET_RETRY_DELAY = timedelta(minutes=2)


@dataclass
class Worker:
    sessions: sessionmaker[Session]
    providers: Providers
    storage: Storage
    settings: Settings
    batch_size: int = 200

    def today(self) -> date:
        return datetime.now(UTC).date()

    # ------------------------------------------------------------------ loop

    def run_once(self) -> dict[str, int]:
        stats = {
            "recovered": self.recover_pending_submissions(),
            "submitted": self.submit_script_batches(),
            "advanced": self.poll_script_batches(),
            "audio": self.run_audio_jobs(),
        }
        with self.sessions.begin() as session:
            stats["tours_ready"] = finalize_tours(session)
        return stats

    def drain(self, max_rounds: int = 20) -> None:
        """Run until no work moves. Fake providers finish in one poll; for real batches use
        `walk worker`, which keeps polling."""
        for _ in range(max_rounds):
            stats = self.run_once()
            if not any(stats.values()):
                return

    # ------------------------------------------------------- 1. submit batches

    def _request_for(self, session: Session, job: Job) -> LLMRequest:
        script = session.get(Script, job.payload["script_id"])
        poi = session.get(Poi, script.poi_id)
        stage = job.payload["stage"]
        facts = [(f.source_url, f.content) for f in current_facts(session, poi.id)]
        if stage == "draft":
            system, prompt = prompts.draft(
                place=poi.name, local_name=poi.local_name, facts=facts, language=script.language,
                persona=script.persona, depth_level=script.depth_level, feedback=job.payload.get("feedback"))
            return LLMRequest(str(job.id), self.settings.script_model, system, prompt,
                              DEPTHS[script.depth_level].max_output_tokens)
        if stage == "check":
            system, prompt = prompts.fact_check(place=poi.name, facts=facts, script_text=script.script_text)
            return LLMRequest(str(job.id), self.settings.script_model, system, prompt,
                              prompts.FACT_CHECK_MAX_TOKENS, json_schema=prompts.FACT_CHECK_SCHEMA)
        if stage == "translate":
            source = session.get(Script, job.payload["source_script_id"])
            system, prompt = prompts.translate(place=poi.name, source_text=source.script_text,
                                               language=script.language, persona=script.persona)
            return LLMRequest(str(job.id), self.settings.mechanical_model, system, prompt,
                              prompts.translate_max_tokens(script.depth_level))
        raise ValueError(f"unknown stage {stage}")

    def submit_script_batches(self) -> int:
        llm = self.providers.llm
        submissions: list[tuple[str, list[LLMRequest], list[int]]] = []
        with self.sessions.begin() as session:
            jobs = session.scalars(
                select(Job).where(Job.job_type == "script", Job.status == "queued", Job.run_after <= func.now())
                .order_by(Job.priority.desc(), Job.id).limit(self.batch_size).with_for_update(skip_locked=True)
            ).all()
            by_model: dict[str, list[tuple[Job, LLMRequest]]] = {}
            for job in jobs:
                request = self._request_for(session, job)
                in_tokens = llm.count_tokens(request.model, request.system, request.prompt)
                worst = cost(session, llm.pricing_provider, request.model, llm.tier,
                             {"input_token": in_tokens, "output_token": request.max_output_tokens},
                             self.today(), round_up=True)
                try:
                    ensure_reserved(session, job, worst)
                except BudgetExceeded as exc:
                    self._stop_over_budget(session, job, exc)
                    continue
                by_model.setdefault(request.model, []).append((job, request))
            for items in by_model.values():
                token = f"walk-{uuid.uuid4().hex}"
                for job, _ in items:
                    job.status, job.locked_by, job.locked_at = "running", WORKER_ID, func.now()
                    job.started_at, job.attempts = func.now(), job.attempts + 1
                    job.external_batch_id = PENDING_PREFIX + token
                submissions.append((token, [r for _, r in items], [j.id for j, _ in items]))

        for token, requests, job_ids in submissions:
            try:
                batch_id = llm.submit(requests, display_name=token)
            except Exception as exc:  # nothing was created: put the work back
                log.exception("batch submit failed")
                with self.sessions.begin() as session:
                    for job in session.scalars(select(Job).where(Job.id.in_(job_ids))):
                        self._retry_or_fail(session, job, f"submit failed: {exc}")
                continue
            with self.sessions.begin() as session:
                session.execute(update(Job).where(Job.id.in_(job_ids))
                                .values(status="submitted", external_batch_id=batch_id))
        return sum(len(j) for _, _, j in submissions)

    def recover_pending_submissions(self, older_than: timedelta = timedelta(minutes=10)) -> int:
        """Jobs left 'running' with a pending token by a crash: find the batch or retry."""
        recovered = 0
        with self.sessions.begin() as session:
            stuck = session.scalars(select(Job).where(
                Job.status == "running", Job.external_batch_id.startswith(PENDING_PREFIX),
                Job.locked_at < datetime.now(UTC) - older_than,
            ).with_for_update(skip_locked=True)).all()
            tokens = {(j.external_batch_id, j.job_type) for j in stuck}
            for token, job_type in tokens:
                provider = self.providers.llm if job_type == "script" else self.providers.tts
                batch_id = provider.find_batch(token.removeprefix(PENDING_PREFIX))
                for job in (j for j in stuck if j.external_batch_id == token):
                    if batch_id:
                        job.status, job.external_batch_id = "submitted", batch_id
                    else:
                        self._retry_or_fail(session, job, "submission lost")
                    recovered += 1
        return recovered

    # -------------------------------------------------------- 2. poll batches

    def poll_script_batches(self) -> int:
        """Collect every finished batch, scripts and (Gemini) audio alike."""
        advanced = 0
        with self.sessions.begin() as session:
            batches = session.execute(
                select(Job.external_batch_id, Job.job_type).where(Job.status == "submitted").distinct()).all()
        for batch_id, job_type in batches:
            provider = self.providers.llm if job_type == "script" else self.providers.tts
            poll = provider.poll(batch_id)
            if poll.state == "running":
                continue
            with self.sessions.begin() as session:
                jobs = {str(j.id): j for j in session.scalars(
                    select(Job).where(Job.external_batch_id == batch_id, Job.status == "submitted")
                    .with_for_update(skip_locked=True))}
                if poll.state == "failed":
                    for job in jobs.values():
                        self._retry_or_fail(session, job, poll.error or "batch failed")
                    continue
                for result in poll.results:
                    job = jobs.pop(result.key, None)
                    if job is None:
                        continue
                    with session.begin_nested():
                        if job_type == "script":
                            self._apply_result(session, job, result, batch_id)
                        else:
                            self._apply_audio_result(session, job, result, batch_id)
                    advanced += 1
                for job in jobs.values():  # no result came back for these
                    self._retry_or_fail(session, job, "missing from batch output")
        return advanced

    def _apply_result(self, session: Session, job: Job, result, batch_id: str) -> None:
        script = session.get(Script, job.payload["script_id"])
        stage = job.payload["stage"]
        model = self.settings.mechanical_model if stage == "translate" else self.settings.script_model
        if any(result.billed_units.values()):
            record(session, job=job, provider=self.providers.llm.name,
                   pricing_provider=self.providers.llm.pricing_provider, model=model,
                   tier=self.providers.llm.tier, operation=stage, units=result.billed_units,
                   on=self.today(), script_id=script.id, external_request_id=f"{batch_id}#{result.key}")
        if result.error or not result.text:
            self._retry_or_fail(session, job, result.error or "empty response")
            return

        if stage == "draft":
            script.script_text = result.text.strip()
            script.word_count = len(script.script_text.split())
            script.llm_model = model
            script.status = "drafted"
            script.draft_attempts += 1
            session.query(ScriptSource).filter_by(script_id=script.id).delete()
            for fact in current_facts(session, script.poi_id):
                session.add(ScriptSource(script_id=script.id, poi_fact_id=fact.id))
            self._requeue(job, {**job.payload, "stage": "check"})
        elif stage == "check":
            verdict = _parse_verdict(result.text)
            script.fact_check = verdict
            if verdict.get("verdict") == "pass":
                script.status, script.qa_status = "ready", "passed"
                self._script_ready(session, job, script)
            elif script.draft_attempts < MAX_DRAFTS:
                script.qa_status = "failed"
                self._requeue(job, {**job.payload, "stage": "draft",
                                    "feedback": verdict.get("unsupported_claims", [])})
            else:
                script.status, script.qa_status = "rejected", "failed"
                self._finish(session, job, "done", "rejected by fact-check")
        elif stage == "translate":
            script.script_text = result.text.strip()
            script.word_count = len(script.script_text.split())
            script.llm_model = model
            script.translated_from_script_id = job.payload["source_script_id"]
            session.query(ScriptSource).filter_by(script_id=script.id).delete()
            for source in session.scalars(select(ScriptSource).where(
                    ScriptSource.script_id == job.payload["source_script_id"])).all():
                session.add(ScriptSource(script_id=script.id, poi_fact_id=source.poi_fact_id))
            script.status, script.qa_status = "ready", "inherited"
            self._script_ready(session, job, script)
        script.updated_at = func.now()

    def _script_ready(self, session: Session, job: Job, script: Script) -> None:
        """Hand the rest of the job's reservation to the audio job that follows."""
        session.flush()
        segment = claim_segment(session, script, self.settings, self.providers.tts)
        held, job.reserved_usd = job.reserved_usd, Decimal(0)
        funding = Funding(job.budget_id, job.daily_budget_id)
        audio_job = enqueue_audio(session, segment, funding, self.settings, self.providers.tts, self.today(),
                                  priority=job.priority, reserved=held)
        if audio_job is None:  # audio already queued or done: give the reservation back
            job.reserved_usd = held
        self._finish(session, job, "done")

    # ------------------------------------------------------------ 3. audio

    def run_audio_jobs(self, limit: int = 50) -> int:
        """Batch voices (Gemini) are submitted here and collected by poll_batches; sync
        voices (Chirp) are synthesised here, one segment at a time."""
        if self.providers.tts.mode == "batch":
            return self.submit_audio_batches()
        done = 0
        for _ in range(limit):
            claimed = self._claim_audio_job()
            if claimed is None:
                break
            if claimed:
                self._synthesize(*claimed)
                done += 1
        return done

    def _claim_audio_job(self) -> tuple[int, int, Decimal] | bool | None:
        """Returns (job_id, segment_id, exact_cost), False if the claimed job ended early,
        or None when the queue is empty."""
        tts = self.providers.tts
        with self.sessions.begin() as session:
            job = session.scalars(
                select(Job).where(Job.job_type == "audio", Job.status == "queued", Job.run_after <= func.now())
                .order_by(Job.priority.desc(), Job.id).limit(1).with_for_update(skip_locked=True)
            ).first()
            if job is None:
                return None
            segment = session.get(Segment, job.payload["segment_id"])
            if segment.status == "ready":
                self._finish(session, job, "done")
                return False
            units = tts.worst_case_units(TTSInput(chunks=segment.ssml.split("\n"), lexicon_hash=segment.lexicon_hash))
            exact = cost(session, tts.pricing_provider, tts.model, tts.tier, units, self.today())
            try:
                ensure_reserved(session, job, exact)
            except BudgetExceeded as exc:
                self._stop_over_budget(session, job, exc)
                return False
            job.status, job.locked_by, job.locked_at = "running", WORKER_ID, func.now()
            job.started_at, job.attempts = func.now(), job.attempts + 1
            return job.id, segment.id, exact

    def _synthesize(self, job_id: int, segment_id: int, exact: Decimal) -> None:
        tts = self.providers.tts
        with self.sessions.begin() as session:
            segment = session.get(Segment, segment_id)
            chunks, voice_id, language = segment.ssml.split("\n"), segment.voice_id, segment.language
        try:
            parts = tts.synthesize(chunks, voice_id, LANGUAGES[language])
        except Exception as exc:
            log.exception("tts failed for segment %s", segment_id)
            with self.sessions.begin() as session:
                self._retry_or_fail(session, session.get(Job, job_id), f"tts failed: {exc}")
            return
        billed = sum(len(c) for c in chunks)
        with self.sessions.begin() as session:  # record spend before anything else can fail
            record(session, job=session.get(Job, job_id), provider=tts.name, pricing_provider=tts.pricing_provider,
                   model=tts.model, tier=tts.tier, operation="tts",
                   units={"character": billed}, on=self.today(), segment_id=segment_id)
        audio = b"".join(parts)
        duration_ms = round(mutagen.mp3.MP3(io.BytesIO(audio)).info.length * 1000)
        with self.sessions.begin() as session:
            segment = session.get(Segment, segment_id)
            key = f"audio/{segment.language}/{segment.input_hash}.mp3"
            self.storage.put(key, audio, "audio/mpeg")
            segment.audio_key, segment.audio_bytes, segment.duration_ms = key, len(audio), duration_ms
            segment.billed_chars, segment.status, segment.updated_at = billed, "ready", func.now()
            self._finish(session, session.get(Job, job_id), "done")

    def submit_audio_batches(self) -> int:
        """Queued audio jobs as one Gemini TTS batch, each reserved at its worst case:
        its text in, plus the audio-token cap it is sent with."""
        tts = self.providers.tts
        with self.sessions.begin() as session:
            jobs = session.scalars(
                select(Job).where(Job.job_type == "audio", Job.status == "queued", Job.run_after <= func.now())
                .order_by(Job.priority.desc(), Job.id).limit(self.batch_size).with_for_update(skip_locked=True)
            ).all()
            requests, job_ids = [], []
            for job in jobs:
                segment = session.get(Segment, job.payload["segment_id"])
                if segment.status == "ready":
                    self._finish(session, job, "done")
                    continue
                tts_input = TTSInput(chunks=segment.ssml.split("\n"), lexicon_hash=segment.lexicon_hash)
                units = tts.worst_case_units(tts_input)
                worst = cost(session, tts.pricing_provider, tts.model, tts.tier, units, self.today(), round_up=True)
                try:
                    ensure_reserved(session, job, worst)
                except BudgetExceeded as exc:
                    self._stop_over_budget(session, job, exc)
                    continue
                requests.append(TTSRequest(key=str(job.id), text=tts_input.document, voice=segment.voice_id,
                                           max_output_tokens=units["output_token"]))
                job_ids.append(job.id)
            if not requests:
                return 0
            token = f"walk-tts-{uuid.uuid4().hex}"
            for job in jobs:
                if job.id in job_ids:
                    job.status, job.locked_by, job.locked_at = "running", WORKER_ID, func.now()
                    job.started_at, job.attempts = func.now(), job.attempts + 1
                    job.external_batch_id = PENDING_PREFIX + token
        try:
            batch_id = tts.submit(requests, display_name=token)
        except Exception as exc:
            log.exception("tts batch submit failed")
            with self.sessions.begin() as session:
                for job in session.scalars(select(Job).where(Job.id.in_(job_ids))):
                    self._retry_or_fail(session, job, f"submit failed: {exc}")
            return 0
        with self.sessions.begin() as session:
            session.execute(update(Job).where(Job.id.in_(job_ids)).values(status="submitted", external_batch_id=batch_id))
        return len(job_ids)

    def _apply_audio_result(self, session: Session, job: Job, result: TTSResult, batch_id: str) -> None:
        tts = self.providers.tts
        segment = session.get(Segment, job.payload["segment_id"])
        if any(result.billed_units.values()):
            record(session, job=job, provider=tts.name, pricing_provider=tts.pricing_provider, model=tts.model,
                   tier=tts.tier, operation="tts", units=result.billed_units, on=self.today(),
                   segment_id=segment.id, external_request_id=f"{batch_id}#{result.key}")
        if result.error or not result.audio:
            self._retry_or_fail(session, job, result.error or "no audio")
            return
        try:
            pcm, rate = pcm_from(result.audio, result.mime_type)
            mp3 = pcm_to_mp3(pcm, rate)
        except Exception as exc:  # a malformed response is a failed attempt, not a crashed poll
            self._retry_or_fail(session, job, f"could not encode audio: {exc}")
            return
        key = f"audio/{segment.language}/{segment.input_hash}.mp3"
        self.storage.put(key, mp3, "audio/mpeg")
        segment.audio_key, segment.audio_bytes, segment.duration_ms = key, len(mp3), mp3_duration_ms(mp3)
        segment.status, segment.updated_at = "ready", func.now()
        self._finish(session, job, "done")

    # --------------------------------------------------------------- helpers

    def _requeue(self, job: Job, payload: dict) -> None:
        job.payload = payload
        job.status, job.external_batch_id, job.locked_by, job.locked_at = "queued", None, None, None

    def _finish(self, session: Session, job: Job, status: str, error: str | None = None) -> None:
        release_job(session, job)
        job.status, job.error, job.finished_at = status, error, func.now()
        job.locked_by = job.locked_at = None

    def _retry_or_fail(self, session: Session, job: Job, error: str) -> None:
        if job.attempts < job.max_attempts:
            self._requeue(job, job.payload)
            job.error = error
            job.run_after = datetime.now(UTC) + timedelta(minutes=2 ** job.attempts)
        else:
            self._finish(session, job, "failed", error)
            _mark_failed(session, job)

    def _stop_over_budget(self, session: Session, job: Job, exc: BudgetExceeded) -> None:
        """Out of budget for now, or for good?

        Reservations are worst cases and settle lower, so while work on the same budget
        is in flight (submitted or running), money is likely to come back: wait and
        retry. Queued jobs don't count: they can't free anything, and two waiting jobs
        counting each other would wait forever."""
        held_elsewhere = session.execute(text("""
            SELECT coalesce(sum(reserved_usd), 0) FROM jobs
            WHERE id <> :job AND status IN ('running', 'submitted')
              AND (budget_id = :budget OR daily_budget_id = :budget)
        """), {"job": job.id, "budget": exc.budget_id}).scalar_one()
        if held_elsewhere > 0:
            log.info("job %s waits for budget %s (%s still reserved by other work)", job.id, exc.budget_id, held_elsewhere)
            self._requeue(job, job.payload)
            job.error = f"waiting for budget: {exc}"
            job.run_after = datetime.now(UTC) + BUDGET_RETRY_DELAY
            return
        log.warning("job %s stopped: %s", job.id, exc)
        self._finish(session, job, "over_budget", str(exc))


def _mark_failed(session: Session, job: Job) -> None:
    if job.job_type == "script":
        session.execute(update(Script).where(Script.id == job.payload["script_id"], Script.status != "ready")
                        .values(status="failed", updated_at=func.now()))
    else:
        session.execute(update(Segment).where(Segment.id == job.payload["segment_id"])
                        .values(status="failed", error=job.error, updated_at=func.now()))


def _parse_verdict(raw: str) -> dict:
    try:
        verdict = json.loads(raw)
    except json.JSONDecodeError:
        return {"verdict": "fail", "unsupported_claims": [], "error": "unparseable fact-check"}
    return verdict if isinstance(verdict, dict) else {"verdict": "fail", "unsupported_claims": []}


def finalize_tours(session: Session) -> int:
    """Attach finished audio to tour stops and flip tours to ready (or failed)."""
    session.execute(text("""
        UPDATE tour_stops ts SET segment_id = s.id
        FROM (SELECT DISTINCT ON (script_id) id, script_id FROM segments
              WHERE status = 'ready' ORDER BY script_id, id DESC) s
        WHERE ts.segment_id IS NULL AND ts.script_id = s.script_id
    """))
    session.execute(text("""
        UPDATE tours t SET status = 'failed', updated_at = now()
        WHERE t.status = 'pending' AND EXISTS (
            SELECT 1 FROM tour_stops ts JOIN scripts sc ON sc.id = ts.script_id
            LEFT JOIN segments sg ON sg.script_id = sc.id AND sg.status = 'failed'
            WHERE ts.tour_id = t.id AND ts.segment_id IS NULL
              AND (sc.status IN ('rejected', 'failed') OR sg.id IS NOT NULL))
    """))
    result = session.execute(text("""
        UPDATE tours t SET status = 'ready', updated_at = now(),
            total_duration_ms = (
                SELECT sum(sg.duration_ms) FROM tour_stops ts JOIN segments sg ON sg.id = ts.segment_id
                WHERE ts.tour_id = t.id)
              + (SELECT coalesce(sum(wl.duration_s), 0) * 1000 FROM tour_stops ts
                 JOIN walking_legs wl ON wl.id = ts.leg_to_next_id WHERE ts.tour_id = t.id)
        WHERE t.status = 'pending'
          AND NOT EXISTS (SELECT 1 FROM tour_stops ts WHERE ts.tour_id = t.id AND ts.segment_id IS NULL)
    """))
    return result.rowcount

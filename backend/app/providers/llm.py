"""Script generation goes through the Gemini Batch API and nothing else.

The provider interface has no synchronous generate() on purpose: the pipeline is
offline, batch is half price, and a method that does not exist cannot be called by
mistake. count_tokens is free and is only used to size budget reservations.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class LLMRequest:
    key: str                         # correlation id, echoed back in the result
    model: str
    system: str
    prompt: str
    max_output_tokens: int           # thinking included; bounds the reservation
    json_schema: dict[str, Any] | None = None


@dataclass(frozen=True)
class LLMResult:
    key: str
    text: str | None
    error: str | None
    input_tokens: int = 0            # uncached prompt tokens
    cached_input_tokens: int = 0
    output_tokens: int = 0           # candidates + thinking: both bill as output

    @property
    def billed_units(self) -> dict[str, int]:
        return {"input_token": self.input_tokens, "cached_input_token": self.cached_input_tokens,
                "output_token": self.output_tokens}


@dataclass
class BatchPoll:
    state: str                       # "running" | "succeeded" | "failed"
    results: list[LLMResult] = field(default_factory=list)
    error: str | None = None


class LLMBatchProvider(Protocol):
    name: str                        # who serves the call, written to the ledger
    pricing_provider: str            # whose price list applies
    tier: str                        # always "batch"

    def count_tokens(self, model: str, system: str, prompt: str) -> int: ...
    def submit(self, requests: list[LLMRequest], display_name: str) -> str: ...
    def poll(self, batch_id: str) -> BatchPoll: ...
    def find_batch(self, display_name: str) -> str | None: ...


class GeminiBatchProvider:
    name = "google-gemini"
    pricing_provider = "google-gemini"
    tier = "batch"

    _DONE_OK = {"JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED"}
    _DONE_BAD = {"JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"}

    def __init__(self, api_key: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)

    def count_tokens(self, model: str, system: str, prompt: str) -> int:
        response = self.client.models.count_tokens(model=model, contents=f"{system}\n\n{prompt}")
        return int(response.total_tokens or 0)

    def submit(self, requests: list[LLMRequest], display_name: str) -> str:
        models = {r.model for r in requests}
        if len(models) != 1:
            raise ValueError(f"one model per batch, got {sorted(models)}")
        inlined = []
        for r in requests:
            config: dict[str, Any] = {
                "system_instruction": r.system,
                "max_output_tokens": r.max_output_tokens,
                "thinking_config": {"thinking_level": "LOW"},
            }
            if r.json_schema is not None:
                config["response_mime_type"] = "application/json"
                config["response_json_schema"] = r.json_schema
            inlined.append({
                "contents": [{"role": "user", "parts": [{"text": r.prompt}]}],
                "metadata": {"key": r.key},
                "config": config,
            })
        job = self.client.batches.create(model=models.pop(), src=inlined, config={"display_name": display_name})
        return job.name

    def poll(self, batch_id: str) -> BatchPoll:
        job = self.client.batches.get(name=batch_id)
        state = job.state.name if hasattr(job.state, "name") else str(job.state)
        if state in self._DONE_BAD:
            return BatchPoll("failed", error=f"{state}: {job.error}")
        if state not in self._DONE_OK:
            return BatchPoll("running")
        results = []
        for item in (job.dest.inlined_responses if job.dest else None) or []:
            key = (item.metadata or {}).get("key", "")
            if item.error is not None or item.response is None:
                results.append(LLMResult(key=key, text=None, error=str(item.error)))
                continue
            usage = item.response.usage_metadata
            cached = (usage.cached_content_token_count or 0) if usage else 0
            results.append(LLMResult(
                key=key,
                text=item.response.text,
                error=None,
                input_tokens=((usage.prompt_token_count or 0) - cached) if usage else 0,
                cached_input_tokens=cached,
                output_tokens=((usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)) if usage else 0,
            ))
        return BatchPoll("succeeded", results)

    def find_batch(self, display_name: str) -> str | None:
        for job in self.client.batches.list(config={"page_size": 100}):
            if job.display_name == display_name:
                return job.name
        return None


class FakeLLMProvider:
    """Deterministic, offline, instant. Bills simulated usage at Gemini's batch prices so
    a demo shows what the real run would cost; the ledger says provider=fake-gemini."""

    name = "fake-gemini"
    pricing_provider = "google-gemini"
    tier = "batch"

    def __init__(self, fact_check_verdict: str = "pass"):
        self.batches: dict[str, tuple[str, list[LLMRequest]]] = {}
        self.fact_check_verdict = fact_check_verdict
        self.submitted: list[LLMRequest] = []

    def count_tokens(self, model: str, system: str, prompt: str) -> int:
        return (len(system) + len(prompt)) // 4 + 1

    def submit(self, requests: list[LLMRequest], display_name: str) -> str:
        batch_id = f"batches/fake-{uuid.uuid4().hex[:12]}"
        self.batches[batch_id] = (display_name, list(requests))
        self.submitted.extend(requests)
        return batch_id

    def poll(self, batch_id: str) -> BatchPoll:
        _, requests = self.batches[batch_id]
        return BatchPoll("succeeded", [self._answer(r) for r in requests])

    def find_batch(self, display_name: str) -> str | None:
        return next((b for b, (name, _) in self.batches.items() if name == display_name), None)

    def _answer(self, r: LLMRequest) -> LLMResult:
        if r.json_schema is not None:  # fact-check
            text = '{"verdict": "%s", "unsupported_claims": []}' % self.fact_check_verdict
        else:
            words = _target_words(r.prompt)
            subject = _subject(r.prompt)
            sentence = f"Here at {subject}, the story of the place unfolds around you. "
            text = "\n\n".join(sentence * max(1, words // 60) for _ in range(4)).strip()
        input_tokens = self.count_tokens(r.model, r.system, r.prompt)
        return LLMResult(key=r.key, text=text, error=None, input_tokens=input_tokens,
                         output_tokens=len(text) // 4 + 400)  # +400: simulated thinking


def _target_words(prompt: str) -> int:
    for line in prompt.splitlines():
        if line.startswith("Length:"):
            digits = "".join(ch for ch in line if ch.isdigit())
            if digits:
                return int(digits)
    return 200


def _subject(prompt: str) -> str:
    for line in prompt.splitlines():
        if line.startswith("Place:"):
            return line.removeprefix("Place:").strip()
    return "this place"

"""A non-batch generation call is a bug. Make it impossible to write one by accident."""

import pathlib
import re

from app.providers.llm import GeminiBatchProvider, LLMBatchProvider

APP = pathlib.Path(__file__).resolve().parents[1] / "app"


def test_llm_interface_has_no_synchronous_generation():
    for cls in (LLMBatchProvider, GeminiBatchProvider):
        public = {m for m in dir(cls) if not m.startswith("_") and callable(getattr(cls, m))}
        assert public == {"count_tokens", "submit", "poll", "find_batch"}, cls
    assert GeminiBatchProvider.tier == "batch"


def test_no_code_calls_gemini_generate_content():
    offenders = [str(p) for p in APP.rglob("*.py")
                 if re.search(r"generate_content|models\.generate|\.interactions\.create", p.read_text())]
    assert offenders == []

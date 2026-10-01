"""Prompts. Changing anything here that alters output should bump SCRIPT_VERSION."""

from app.config import DEPTHS, PERSONAS

LANGUAGE_NAMES = {"en": "English", "de": "German", "sk": "Slovak"}
MAX_FACT_CHARS = 12_000

FACT_CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["pass", "fail"]},
        "unsupported_claims": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["verdict", "unsupported_claims"],
}


def facts_block(facts: list[tuple[str, str]]) -> str:
    """facts: (source_url, content). Truncated to keep input cost bounded and predictable."""
    parts, used = [], 0
    for url, content in facts:
        room = MAX_FACT_CHARS - used
        if room <= 200:
            break
        snippet = content[:room]
        parts.append(f"[source: {url}]\n{snippet}")
        used += len(snippet)
    return "\n\n".join(parts)


def draft(*, place: str, local_name: str | None, facts: list[tuple[str, str]], language: str,
          persona: str, depth_level: str, feedback: list[str] | None = None) -> tuple[str, str]:
    system = (
        "You write narration for a GPS-triggered audio walking tour. The listener is standing "
        "at the place, looking at it, listening on headphones. Write spoken prose only: no "
        "headings, lists, stage directions, markdown or URLs. Separate paragraphs with a blank "
        "line. Use only facts from the provided sources; if something is not in the sources, "
        "leave it out. Never invent dates, names or numbers. Write place names exactly as given."
    )
    lines = [
        f"Place: {place}",
        f"Local name: {local_name or place}",
        f"Language: {LANGUAGE_NAMES[language]}",
        f"Narrator: {PERSONAS[persona]}",
        f"Length: about {DEPTHS[depth_level].words} words",
        "",
        "Sources:",
        facts_block(facts),
    ]
    if feedback:
        lines += ["", "A fact-check rejected the previous draft. Do not repeat these claims:",
                  *(f"- {claim}" for claim in feedback)]
    return system, "\n".join(lines)


def fact_check(*, place: str, facts: list[tuple[str, str]], script_text: str) -> tuple[str, str]:
    system = (
        "You are a fact-checker. Compare the narration against the sources. List every factual "
        "claim (dates, names, numbers, events, attributions) that the sources do not support. "
        "Atmosphere and description of what the listener can see are not claims. Verdict 'fail' "
        "if any unsupported claim exists, otherwise 'pass'."
    )
    prompt = f"Place: {place}\n\nSources:\n{facts_block(facts)}\n\nNarration:\n{script_text}"
    return system, prompt


def translate(*, place: str, source_text: str, language: str, persona: str) -> tuple[str, str]:
    system = (
        "Translate audio-tour narration for listening, not reading: natural spoken "
        f"{LANGUAGE_NAMES[language]}, same paragraphs, same facts, nothing added or removed. "
        "Keep proper names of places and people in their local form."
    )
    prompt = (f"Place: {place}\nNarrator: {PERSONAS[persona]}\n"
              f"Target language: {LANGUAGE_NAMES[language]}\n\nNarration:\n{source_text}")
    return system, prompt


def translate_max_tokens(depth_level: str) -> int:
    return DEPTHS[depth_level].words * 4 + 1024


FACT_CHECK_MAX_TOKENS = 2048

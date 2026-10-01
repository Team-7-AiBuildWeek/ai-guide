"""Script text -> SSML chunks for Cloud TTS.

Two limits shape this:
  * a request may carry at most 5,000 *bytes* (not characters) of SSML; IPA symbols and
    diacritics are 2 bytes each and CJK text 3, so chunks are measured in UTF-8 bytes;
  * every tag except <mark> is billed as characters, so cost is computed on the SSML.
Chunks break at paragraphs, then sentences, and their MP3s are concatenated.
"""

import re
from dataclasses import dataclass
from xml.sax.saxutils import escape, quoteattr

from app.hashing import stable_hash

MAX_REQUEST_BYTES = 5000
CHUNK_BYTES = 4800  # headroom under the hard limit
FAKE_SECONDS_PER_CHAR = 0.065  # ~15 characters per second of speech


@dataclass(frozen=True)
class Pronunciation:
    surface_form: str
    alphabet: str  # "ipa" | "x-sampa"
    phoneme: str


@dataclass(frozen=True)
class SsmlBuild:
    chunks: list[str]
    used: list[Pronunciation]
    lexicon_hash: str

    @property
    def billed_chars(self) -> int:
        return sum(len(chunk) for chunk in self.chunks)

    @property
    def document(self) -> str:
        return "\n".join(self.chunks)


def lexicon_hash(locale: str, used: list[Pronunciation]) -> str:
    """Only the entries a script actually uses: editing an unrelated entry must not
    re-render this audio."""
    return stable_hash({"locale": locale, "entries": sorted((p.surface_form, p.alphabet, p.phoneme) for p in used)})


def _apply_lexicon(text: str, lexicon: list[Pronunciation]) -> tuple[str, list[Pronunciation]]:
    """Escape text for XML and wrap lexicon matches in <phoneme>. Longest match wins so
    'Michalská brána' beats 'Michalská'."""
    entries = sorted(lexicon, key=lambda p: len(p.surface_form), reverse=True)
    if not entries:
        return escape(text), []
    pattern = re.compile("|".join(rf"(?<!\w){re.escape(p.surface_form)}(?!\w)" for p in entries))
    by_form = {p.surface_form: p for p in entries}
    used: dict[str, Pronunciation] = {}
    out, pos = [], 0
    for match in pattern.finditer(text):
        entry = by_form[match.group(0)]
        used[entry.surface_form] = entry
        out.append(escape(text[pos:match.start()]))
        out.append(f"<phoneme alphabet={quoteattr(entry.alphabet)} ph={quoteattr(entry.phoneme)}>"
                   f"{escape(match.group(0))}</phoneme>")
        pos = match.end()
    out.append(escape(text[pos:]))
    return "".join(out), list(used.values())


def _nbytes(s: str) -> int:
    return len(s.encode("utf-8"))


def _split_sentences(paragraph: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", paragraph) if s]


def build_ssml(script_text: str, locale: str, lexicon: list[Pronunciation]) -> SsmlBuild:
    used_all: dict[str, Pronunciation] = {}
    units: list[str] = []  # SSML fragments that must not be split
    for paragraph in (p.strip() for p in re.split(r"\n\s*\n", script_text)):
        if not paragraph:
            continue
        body, used = _apply_lexicon(paragraph, lexicon)
        used_all.update({p.surface_form: p for p in used})
        fragment = f"<p>{body}</p>"
        if _nbytes(fragment) + _nbytes("<speak></speak>") <= CHUNK_BYTES:
            units.append(fragment)
            continue
        for sentence in _split_sentences(paragraph):
            body, _ = _apply_lexicon(sentence, lexicon)
            fragment = f"<s>{body}</s>"
            if _nbytes(fragment) + _nbytes("<speak></speak>") > CHUNK_BYTES:
                raise ValueError(f"a single sentence exceeds {CHUNK_BYTES} bytes of SSML")
            units.append(fragment)

    chunks, current = [], ""
    for unit in units:
        if current and _nbytes(f"<speak>{current}{unit}</speak>") > CHUNK_BYTES:
            chunks.append(f"<speak>{current}</speak>")
            current = ""
        current += unit
    if current:
        chunks.append(f"<speak>{current}</speak>")
    if not chunks:
        raise ValueError("empty script")
    assert all(_nbytes(c) <= MAX_REQUEST_BYTES for c in chunks)
    used = list(used_all.values())
    return SsmlBuild(chunks=chunks, used=used, lexicon_hash=lexicon_hash(locale, used))


def silent_mp3(seconds: float) -> bytes:
    """Valid MPEG-1 Layer III frames (128 kbps, 44.1 kHz) of silence, for fakes/tests."""
    header = bytes([0xFF, 0xFB, 0x90, 0x00])
    frame = header + bytes(417 - len(header))
    frames = max(1, round(seconds / 0.026122))
    return frame * frames

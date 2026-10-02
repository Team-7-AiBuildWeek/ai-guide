"""Turning what a TTS model returns into the MP3 the app downloads."""

import io
import wave

import lameenc
import mutagen.mp3

MP3_KBPS = 64  # mono speech: about 1.9 MB for a four-minute stop


def pcm_from(data: bytes, mime_type: str | None) -> tuple[bytes, int]:
    """(16-bit mono PCM, sample rate) from a WAV file or raw `audio/L16;rate=N` data."""
    if data[:4] == b"RIFF":
        with wave.open(io.BytesIO(data)) as w:
            if w.getsampwidth() != 2 or w.getnchannels() != 1:
                raise ValueError(f"expected 16-bit mono, got {w.getsampwidth() * 8}-bit x{w.getnchannels()}")
            return w.readframes(w.getnframes()), w.getframerate()
    rate = 24000
    for part in (mime_type or "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == "rate" and value.isdigit():
            rate = int(value)
    return data, rate


def pcm_to_mp3(pcm: bytes, sample_rate: int) -> bytes:
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(MP3_KBPS)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return bytes(encoder.encode(pcm) + encoder.flush())


def mp3_duration_ms(mp3: bytes) -> int:
    return round(mutagen.mp3.MP3(io.BytesIO(mp3)).info.length * 1000)

"""Wiro Whisper provider for speech-to-text transcription with timestamps."""
from __future__ import annotations

import re

import httpx

from src.log import emit as log
from src.models import CaptionSegment, CaptionWord, ProviderConfig
from src.providers.wiro_client import WiroClient

WHISPER_RUN_URL = "https://api.wiro.ai/v1/Run/openai/whisper-large-v3"


def _parse_timestamp(ts: str) -> float:
    """Parse 'MM:SS.D' or 'HH:MM:SS.D' into seconds."""
    parts = ts.strip().split(":")
    if len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    elif len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0


def _distribute_words(text: str, start: float, end: float) -> list[CaptionWord]:
    """Distribute word timings proportionally by character length within a segment."""
    words = text.split()
    if not words:
        return []
    total_chars = sum(len(w) for w in words)
    if total_chars == 0:
        return []
    duration = end - start
    cursor = start
    result = []
    for w in words:
        word_dur = duration * (len(w) / total_chars)
        result.append(CaptionWord(word=w, start=round(cursor, 3), end=round(cursor + word_dur, 3)))
        cursor += word_dur
    return result


def _parse_whisper_output(text: str) -> list[CaptionSegment]:
    """Parse Whisper output lines like '00:00.0 - 00:03.5 /  Text here'."""
    segments: list[CaptionSegment] = []
    pattern = re.compile(r"(\d[\d:.]+)\s*-\s*(\d[\d:.]+)\s*/\s*(.*)")
    for line in text.strip().splitlines():
        m = pattern.match(line.strip())
        if not m:
            continue
        start = _parse_timestamp(m.group(1))
        end = _parse_timestamp(m.group(2))
        segment_text = m.group(3).strip()
        if not segment_text:
            continue
        words = _distribute_words(segment_text, start, end)
        segments.append(CaptionSegment(text=segment_text, start=start, end=end, words=words))
    return segments


class WiroWhisperProvider:
    """Transcribe audio via Wiro's Whisper endpoint, returning timed caption segments."""

    def __init__(self, config: ProviderConfig) -> None:
        self.client = WiroClient(config)

    async def transcribe(self, audio_url: str, language: str = "English") -> list[CaptionSegment]:
        """Submit audio URL to Whisper and return parsed caption segments."""
        payload = {
            "inputAudioUrl": audio_url,
            "language": language,
            "maxNewTokens": 256,
            "chunkLength": 30,
            "batchSize": "8",
            "numSpeakers": 1,
        }

        log(f"whisper submit: {audio_url[-30:]}")
        task = await self.client.run_and_poll(WHISPER_RUN_URL, payload)

        urls = WiroClient.get_output_urls(task)
        if not urls:
            log("whisper: no output URLs")
            return []

        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.get(urls[0])
            resp.raise_for_status()
            raw_text = resp.text

        segments = _parse_whisper_output(raw_text)
        word_count = sum(len(s.words) for s in segments)
        log(f"whisper done: {len(segments)} segments, {word_count} words")
        return segments

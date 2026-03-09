from __future__ import annotations

from pathlib import Path

import httpx

from src.models import ProviderConfig
from src.providers.base import VoiceProvider
from src.providers.wiro_client import WiroClient

RUN_URL = "https://api.wiro.ai/v1/Run/elevenlabs/text-to-speech"


class WiroVoiceProvider(VoiceProvider):
    """Wiro-based voice provider using elevenlabs/text-to-speech."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        self.client = WiroClient(config)
        self.model = config.extra.get("tts_model", "eleven_flash_v2_5")
        self.voice = config.voice_id or "EXAVITQu4vr4xnSDxMaL"  # Sarah
        self.output_format = config.extra.get("output_format", "mp3_44100_128")

    async def generate_speech(self, text: str, output_path: Path) -> tuple[float, str | None]:
        """Generate speech. Returns (duration, cdn_url)."""
        output_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "prompt": text,
            "model": self.model,
            "voice": self.voice,
            "outputFormat": self.output_format,
        }

        task = await self.client.run_and_poll(RUN_URL, payload)

        urls = WiroClient.get_output_urls(task)
        if not urls:
            raise RuntimeError("No audio output from Wiro TTS task.")

        cdn_url = urls[0]

        async with httpx.AsyncClient(timeout=60.0) as http:
            resp = await http.get(cdn_url)
            resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(resp.content)

        from moviepy import AudioFileClip

        clip = AudioFileClip(str(output_path))
        duration = clip.duration
        clip.close()

        return duration, cdn_url

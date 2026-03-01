from __future__ import annotations

import os
from pathlib import Path

from openai import AsyncOpenAI

from src.models import ProviderConfig
from src.providers.base import VoiceProvider


class OpenAIVoiceProvider(VoiceProvider):
    """OpenAI TTS provider for voice generation."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        api_key = os.environ.get(config.api_key_env, "")
        self.client = AsyncOpenAI(api_key=api_key)
        self.voice = config.voice_id or "alloy"

    async def generate_speech(self, text: str, output_path: Path) -> float:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        response = await self.client.audio.speech.create(
            model="tts-1-hd",
            voice=self.voice,
            input=text,
            response_format="mp3",
        )

        await response.astream_to_file(str(output_path))

        # Get audio duration using moviepy
        from moviepy import AudioFileClip

        clip = AudioFileClip(str(output_path))
        duration = clip.duration
        clip.close()

        return duration

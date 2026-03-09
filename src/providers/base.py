from __future__ import annotations

import abc
from pathlib import Path

from src.models import Script, ProviderConfig


class LLMProvider(abc.ABC):
    """Abstract base class for LLM script generation."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @abc.abstractmethod
    async def generate_script(
        self, topic: str, num_sections: int, subtitles: list[str] | None = None,
        image_style: str = "", images_per_section: int = 1,
        custom_instructions: str = "", video_length: str = "medium",
    ) -> Script:
        """Generate a structured listicle script for the given topic."""
        ...


class VoiceProvider(abc.ABC):
    """Abstract base class for text-to-speech generation."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @abc.abstractmethod
    async def generate_speech(self, text: str, output_path: Path) -> tuple[float, str | None]:
        """Generate speech audio for the given text.

        Returns (duration_seconds, cdn_url_or_none).
        """
        ...


class ImageProvider(abc.ABC):
    """Abstract base class for image generation."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @abc.abstractmethod
    async def generate_image(self, prompt: str, output_path: Path) -> Path:
        """Generate an image from the given prompt and save to output_path.

        Returns the path to the saved image.
        """
        ...


class VideoGenProvider(abc.ABC):
    """Abstract base class for AI video generation (text-to-video)."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @abc.abstractmethod
    async def generate_video(self, prompt: str, output_path: Path, duration: int = 5) -> Path:
        """Generate a video from the given prompt and save to output_path.

        Returns the path to the saved video.
        """
        ...

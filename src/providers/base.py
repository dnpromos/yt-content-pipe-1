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
        custom_instructions: str = "",
    ) -> Script:
        """Generate a structured listicle script for the given topic."""
        ...


class VoiceProvider(abc.ABC):
    """Abstract base class for text-to-speech generation."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @abc.abstractmethod
    async def generate_speech(self, text: str, output_path: Path) -> float:
        """Generate speech audio for the given text.

        Returns the duration of the generated audio in seconds.
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

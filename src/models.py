from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


class Section(BaseModel):
    """A single listicle section."""

    number: int
    heading: str
    narration: str
    image_prompt: str = ""
    image_prompts: list[str] = Field(default_factory=list)
    # Populated during generation
    audio_path: Optional[Path] = None
    image_path: Optional[Path] = None
    image_paths: list[Path] = Field(default_factory=list)
    duration: Optional[float] = None  # seconds, derived from audio length


class Script(BaseModel):
    """Full listicle script produced by the LLM."""

    title: str
    intro_narration: str
    intro_image_prompt: str = ""
    sections: list[Section] = Field(default_factory=list)
    outro_narration: str
    outro_image_prompt: str = ""
    # Populated during generation
    intro_audio_path: Optional[Path] = None
    outro_audio_path: Optional[Path] = None
    intro_image_path: Optional[Path] = None
    outro_image_path: Optional[Path] = None
    intro_duration: Optional[float] = None
    outro_duration: Optional[float] = None


class VideoConfig(BaseModel):
    """Video assembly settings."""

    resolution: tuple[int, int] = (1920, 1080)
    fps: int = 30
    transition: str = "crossfade"  # crossfade | slide | cut
    transition_duration: float = 0.8
    section_gap: float = 0.5  # seconds of silence between sections
    ken_burns: bool = True
    encoding_preset: str = "fast"  # ultrafast | fast | medium | slow
    font: str = "assets/fonts/Montserrat-Bold.ttf"
    images_per_section: int = 1  # 1-5 images per section


class ProviderConfig(BaseModel):
    """Configuration for a single AI provider."""

    provider: str
    model: Optional[str] = None
    api_key_env: str = ""
    voice_id: Optional[str] = None
    size: Optional[str] = None
    extra: dict = Field(default_factory=dict)


class AppConfig(BaseModel):
    """Top-level application configuration."""

    llm: ProviderConfig
    voice: ProviderConfig
    image: ProviderConfig
    video: VideoConfig = Field(default_factory=VideoConfig)

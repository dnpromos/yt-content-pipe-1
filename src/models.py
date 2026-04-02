from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


class CaptionWord(BaseModel):
    """A single word with timing info for captions."""
    word: str
    start: float  # seconds
    end: float    # seconds


class CaptionSegment(BaseModel):
    """A timed segment of caption text with per-word timing."""
    text: str
    start: float
    end: float
    words: list[CaptionWord] = Field(default_factory=list)


class Section(BaseModel):
    """A single listicle section."""

    number: int
    heading: str
    narration: str
    image_prompt: str = ""
    image_prompts: list[str] = Field(default_factory=list)
    video_prompts: list[str] = Field(default_factory=list)
    # Populated during generation
    video_prompt: str = ""
    # Populated during generation
    audio_path: Optional[Path] = None
    image_path: Optional[Path] = None
    image_paths: list[Path] = Field(default_factory=list)
    video_path: Optional[Path] = None
    video_paths: list[Path] = Field(default_factory=list)
    duration: Optional[float] = None  # seconds, derived from audio length
    audio_cdn_url: Optional[str] = None
    captions: list[CaptionSegment] = Field(default_factory=list)


class Script(BaseModel):
    """Full script produced by the LLM."""

    title: str
    format: str = "listicle"
    intro_narration: str
    intro_image_prompt: str = ""
    sections: list[Section] = Field(default_factory=list)
    outro_narration: str
    outro_image_prompt: str = ""
    # Populated during generation
    intro_audio_path: Optional[Path] = None
    outro_audio_path: Optional[Path] = None
    intro_image_path: Optional[Path] = None
    intro_image_paths: list[Path] = Field(default_factory=list)
    intro_video_paths: list[Path] = Field(default_factory=list)
    outro_image_path: Optional[Path] = None
    intro_duration: Optional[float] = None
    outro_duration: Optional[float] = None
    intro_audio_cdn_url: Optional[str] = None
    outro_audio_cdn_url: Optional[str] = None
    intro_captions: list[CaptionSegment] = Field(default_factory=list)
    outro_captions: list[CaptionSegment] = Field(default_factory=list)


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
    section_media_type: str = "image"  # "image" or "video"
    videos_per_section: int = 1  # 1-5 video clips per section
    video_gen_duration: int = 5  # 1-10 seconds per clip
    intro_video_count: int = 2  # number of overview video clips for intro
    captions_enabled: bool = True
    caption_font: str = "assets/fonts/Montserrat-Bold.ttf"
    caption_font_size: int = 0  # 0 = auto-detect based on resolution
    caption_text_color: str = "#FFFFFF"
    caption_active_color: str = "#FFFF32"
    caption_bg_color: str = "#000000"
    caption_bg_opacity: int = 160  # 0-255
    caption_uppercase: bool = True
    caption_position: int = 75  # vertical position as % from top (0=top, 100=bottom)


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
    video_gen: Optional[ProviderConfig] = None
    video: VideoConfig = Field(default_factory=VideoConfig)

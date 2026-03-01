from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from moviepy import (
    AudioFileClip,
    CompositeVideoClip,
    ImageClip,
    concatenate_videoclips,
)
from PIL import Image
from rich.console import Console

from src.log import emit as log
from src.models import Script, VideoConfig
from src.video.effects import apply_ken_burns, resize_image_to_fill
from src.video.text_overlay import (
    add_heading_overlay,
    add_section_number_badge,
    create_title_card,
)
from src.video.transitions import join_clips

console = Console()


def _build_section_clip(
    image_path: Path,
    audio_path: Path,
    heading: str,
    number: int,
    config: VideoConfig,
) -> CompositeVideoClip:
    """Build a single section clip with image, audio, effects, and overlays.

    Args:
        image_path: Path to the section image.
        audio_path: Path to the section audio.
        heading: Section heading text.
        number: Section number.
        config: Video configuration.

    Returns:
        A composited video clip for this section.
    """
    resolution = tuple(config.resolution)

    # Load audio to determine duration
    audio = AudioFileClip(str(audio_path))
    duration = audio.duration + 1.0  # 1s padding

    # Create base image clip with Ken Burns or static
    if config.ken_burns:
        direction = "in" if number % 2 == 1 else "out"
        base_clip = apply_ken_burns(
            str(image_path),
            duration=duration,
            resolution=resolution,
            direction=direction,
        )
    else:
        base_clip = resize_image_to_fill(str(image_path), resolution)
        base_clip = base_clip.with_duration(duration)

    # Add section number badge
    clip = add_section_number_badge(base_clip, number, config.font, resolution)

    # Add heading overlay
    clip = add_heading_overlay(clip, heading, config.font, resolution)

    # Attach audio (centered in the clip with 0.5s lead-in)
    audio = audio.with_start(0.5)
    clip = clip.with_audio(audio)

    return clip


def _build_narration_clip(
    audio_path: Path,
    title: str,
    config: VideoConfig,
    card_type: str = "intro",
) -> CompositeVideoClip:
    """Build an intro or outro clip with title card and narration.

    Args:
        audio_path: Path to the narration audio.
        title: Title text for the card.
        config: Video configuration.
        card_type: "intro" or "outro".

    Returns:
        A video clip for the intro/outro.
    """
    resolution = tuple(config.resolution)
    audio = AudioFileClip(str(audio_path))
    duration = audio.duration + 1.5

    if card_type == "intro":
        bg_color = (15, 15, 25)
    else:
        bg_color = (25, 15, 15)

    clip = create_title_card(
        title=title,
        font_path=config.font,
        duration=duration,
        resolution=resolution,
        bg_color=bg_color,
    )

    audio = audio.with_start(0.75)
    clip = clip.with_audio(audio)

    return clip


def compose_video(
    script: Script,
    config: VideoConfig,
    output_path: Path,
) -> Path:
    """Compose the final video from a fully populated script.

    Args:
        script: The script with all audio_path and image_path fields populated.
        config: Video configuration.
        output_path: Path to write the final video.

    Returns:
        Path to the output video file.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    resolution = tuple(config.resolution)
    clips = []

    # Intro
    if script.intro_audio_path and script.intro_audio_path.exists():
        log("building intro clip...")
        intro = _build_narration_clip(
            script.intro_audio_path,
            script.title,
            config,
            card_type="intro",
        )
        clips.append(intro)

    # Sections
    for section in script.sections:
        if not section.image_path or not section.audio_path:
            log(f"skip section {section.number}: missing assets")
            continue
        log(f"building section {section.number}: {section.heading}")
        section_clip = _build_section_clip(
            image_path=section.image_path,
            audio_path=section.audio_path,
            heading=section.heading,
            number=section.number,
            config=config,
        )
        clips.append(section_clip)

    # Outro
    if script.outro_audio_path and script.outro_audio_path.exists():
        log("building outro clip...")
        outro_title = "Thanks for watching!"
        outro = _build_narration_clip(
            script.outro_audio_path,
            outro_title,
            config,
            card_type="outro",
        )
        clips.append(outro)

    if not clips:
        raise RuntimeError("No clips were generated. Check that all assets exist.")

    # Join with transitions
    log(f"joining {len(clips)} clips with '{config.transition}' transition...")
    final = join_clips(clips, config.transition, config.transition_duration)

    total_dur = sum(c.duration for c in clips)
    log(f"total duration: {total_dur:.1f}s -- encoding to {output_path.name}...")
    log("ffmpeg encoding started (this may take several minutes)...")

    final.write_videofile(
        str(output_path),
        fps=config.fps,
        codec="libx264",
        audio_codec="aac",
        threads=os.cpu_count() or 8,
        preset="ultrafast",
        logger="bar",
    )

    # Clean up
    for clip in clips:
        clip.close()
    final.close()

    file_mb = output_path.stat().st_size / (1024 * 1024)
    log(f"video saved: {output_path.name} ({file_mb:.1f} MB)")
    return output_path

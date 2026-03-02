from __future__ import annotations

import os
import time
from pathlib import Path

import numpy as np
from moviepy import (
    AudioFileClip,
    ColorClip,
    CompositeVideoClip,
    ImageClip,
    concatenate_videoclips,
)
from PIL import Image
from proglog import ProgressBarLogger
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


class _FrameLogger(ProgressBarLogger):
    """Custom MoviePy logger that emits frame progress to our log system."""

    def __init__(self, total_frames: int = 0):
        super().__init__()
        self.total_frames = total_frames
        self._last_log_time = 0

    def callback(self, **changes):
        bars = changes.get("bars", {})
        for bar_name, bar_data in bars.items():
            if "index" in bar_data:
                self._emit_progress(bar_data["index"])

    def bars_callback(self, bar, attr, value, old_value=None):
        if attr == "index":
            self._emit_progress(value)

    def _emit_progress(self, value):
        now = time.time()
        if now - self._last_log_time >= 2:
            self._last_log_time = now
            if self.total_frames > 0:
                pct = min(100, int(value / self.total_frames * 100))
                log(f"encoding: frame {value}/{self.total_frames} ({pct}%)")
            else:
                log(f"encoding: frame {value}")


def _build_section_clip(
    image_path: Path,
    audio_path: Path,
    heading: str,
    number: int,
    config: VideoConfig,
    image_paths: list[Path] | None = None,
) -> CompositeVideoClip:
    """Build a single section clip with one or more images and audio.

    When multiple images are provided, the audio duration is split evenly
    across them and each sub-clip is concatenated.
    """
    resolution = tuple(config.resolution)
    audio = AudioFileClip(str(audio_path))
    total_duration = audio.duration + 1.0  # 1s padding

    # Determine image list (fall back to single image)
    paths = [p for p in (image_paths or []) if p and Path(p).exists()]
    if not paths:
        paths = [image_path]
    n_images = len(paths)

    # Calculate per-image duration, compensating for transition overlap.
    # With crossfade/slide: joined_dur = N * per_dur - (N-1) * trans_dur
    # Solve for per_dur so joined_dur == total_duration.
    if n_images > 1:
        trans_dur = min(config.transition_duration, total_duration / n_images * 0.3)
        per_image_dur = (total_duration + (n_images - 1) * trans_dur) / n_images
    else:
        trans_dur = 0
        per_image_dur = total_duration

    sub_clips = []
    for idx, img in enumerate(paths):
        directions = ["in", "out"]
        if config.ken_burns:
            clip = apply_ken_burns(
                str(img),
                duration=per_image_dur,
                resolution=resolution,
                direction=directions[(number + idx) % 2],
            )
        else:
            clip = resize_image_to_fill(str(img), resolution)
            clip = clip.with_duration(per_image_dur)
        sub_clips.append(clip)

    if len(sub_clips) == 1:
        clip = sub_clips[0]
    else:
        from src.video.transitions import join_clips as _join
        clip = _join(sub_clips, config.transition, trans_dur)

    # Attach audio (centered in the clip with 0.5s lead-in)
    audio = audio.with_start(0.5)
    clip = clip.with_audio(audio)

    return clip


def _build_narration_clip(
    audio_path: Path,
    title: str,
    config: VideoConfig,
    card_type: str = "intro",
    image_path: Path | None = None,
) -> CompositeVideoClip:
    """Build an intro or outro clip with title card and narration.

    Args:
        audio_path: Path to the narration audio.
        title: Title text for the card.
        config: Video configuration.
        card_type: "intro" or "outro".
        image_path: Optional background image. Uses title card if None.

    Returns:
        A video clip for the intro/outro.
    """
    resolution = tuple(config.resolution)
    audio = AudioFileClip(str(audio_path))
    duration = audio.duration + 1.5

    if image_path and image_path.exists():
        if config.ken_burns:
            clip = apply_ken_burns(
                str(image_path),
                duration=duration,
                resolution=resolution,
                direction="in" if card_type == "intro" else "out",
            )
        else:
            clip = resize_image_to_fill(str(image_path), resolution)
            clip = clip.with_duration(duration)
    else:
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
            image_path=script.intro_image_path,
        )
        clips.append(intro)

    # Sections
    section_clips_added = 0
    for section in script.sections:
        if not section.image_path or not section.audio_path:
            log(f"skip section {section.number}: missing assets")
            continue
        # Insert silent gap between sections
        if section_clips_added > 0 and config.section_gap > 0:
            gap = ColorClip(resolution, color=(0, 0, 0), duration=config.section_gap)
            clips.append(gap)
        log(f"building section {section.number}: {section.heading}")
        section_clip = _build_section_clip(
            image_path=section.image_path,
            audio_path=section.audio_path,
            heading=section.heading,
            number=section.number,
            config=config,
            image_paths=section.image_paths or None,
        )
        clips.append(section_clip)
        section_clips_added += 1

    # Outro
    if script.outro_audio_path and script.outro_audio_path.exists():
        log("building outro clip...")
        outro_title = "Thanks for watching!"
        outro = _build_narration_clip(
            script.outro_audio_path,
            outro_title,
            config,
            card_type="outro",
            image_path=script.outro_image_path,
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

    total_frames = int(final.duration * config.fps)
    frame_logger = _FrameLogger(total_frames=total_frames)
    log(f"encoding {total_frames} frames at {config.fps}fps...")

    final.write_videofile(
        str(output_path),
        fps=config.fps,
        codec="libx264",
        audio_codec="aac",
        threads=os.cpu_count() or 8,
        preset=config.encoding_preset,
        pixel_format="yuv420p",
        ffmpeg_params=["-c:v", "h264_videotoolbox"],
        logger=frame_logger,
    )

    # Clean up
    for clip in clips:
        clip.close()
    final.close()

    file_mb = output_path.stat().st_size / (1024 * 1024)
    log(f"video saved: {output_path.name} ({file_mb:.1f} MB)")
    return output_path

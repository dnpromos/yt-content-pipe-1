from __future__ import annotations

import os
import platform
import time
import traceback
from pathlib import Path

import numpy as np
from moviepy import (
    AudioFileClip,
    ColorClip,
    CompositeVideoClip,
    ImageClip,
    VideoFileClip,
    concatenate_videoclips,
)
from PIL import Image
from proglog import ProgressBarLogger
from rich.console import Console

from src.log import emit as log
from src.models import CaptionSegment, Script, VideoConfig
from src.video.captions import render_captions
from src.video.effects import apply_ken_burns, resize_image_to_fill
from src.video.text_overlay import create_title_card
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
    captions: list[CaptionSegment] | None = None,
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

    if captions and config.captions_enabled:
        clip = render_captions(clip, captions, config, resolution, audio_offset=0.5)

    return clip


def _resize_video_to_fill(vid: VideoFileClip, resolution: tuple[int, int]):
    """Resize and center-crop a video clip to fill target resolution."""
    w, h = resolution
    scale = max(w / vid.w, h / vid.h)
    vid = vid.resized((int(vid.w * scale), int(vid.h * scale)))
    vid = vid.cropped(
        x_center=vid.w / 2, y_center=vid.h / 2,
        width=w, height=h,
    )
    return vid


def _build_video_section_clip(
    video_path: Path,
    audio_path: Path,
    heading: str,
    number: int,
    config: VideoConfig,
    video_paths: list[Path] | None = None,
    captions: list[CaptionSegment] | None = None,
) -> CompositeVideoClip:
    """Build a section clip from one or more AI-generated video files with narration audio.

    Multiple videos are joined with transitions to fill the narration duration.
    If total video is shorter than narration, the last clip is looped.
    """
    resolution = tuple(config.resolution)
    audio = AudioFileClip(str(audio_path))
    total_duration = audio.duration + 1.0

    # Gather valid video paths
    paths = [p for p in (video_paths or []) if p and Path(p).exists()]
    if not paths:
        paths = [video_path]

    # Load and resize all clips
    raw_clips = []
    sub_clips = []
    for vp in paths:
        v = VideoFileClip(str(vp))
        raw_clips.append(v)
        v = _resize_video_to_fill(v, resolution)
        v = v.without_audio()
        sub_clips.append(v)

    if len(sub_clips) == 1:
        vid = sub_clips[0]
        # Loop if too short
        if vid.duration < total_duration:
            loops_needed = int(total_duration / vid.duration) + 1
            vid = concatenate_videoclips([vid.copy() if i > 0 else vid for i in range(loops_needed)])
        vid = vid.subclipped(0, total_duration)
    else:
        # Join multiple clips with transitions
        trans_dur = min(config.transition_duration, 0.5)
        vid = join_clips(sub_clips, config.transition, trans_dur)
        # If combined is too short, loop the whole thing
        if vid.duration < total_duration:
            loops_needed = int(total_duration / vid.duration) + 1
            vid = concatenate_videoclips([vid.copy() if i > 0 else vid for i in range(loops_needed)])
        vid = vid.subclipped(0, total_duration)

    # NOTE: Do NOT close raw_clips here — derived clips share the same
    # reader. They will be cleaned up when compose_video closes everything.

    # Attach narration audio
    audio = audio.with_start(0.5)
    clip = vid.with_audio(audio)

    if captions and config.captions_enabled:
        clip = render_captions(clip, captions, config, resolution, audio_offset=0.5)

    return clip


def _build_narration_clip(
    audio_path: Path,
    title: str,
    config: VideoConfig,
    card_type: str = "intro",
    image_path: Path | None = None,
    captions: list[CaptionSegment] | None = None,
) -> CompositeVideoClip:
    """Build an intro or outro clip with title card and narration.

    Args:
        audio_path: Path to the narration audio.
        title: Title text for the card.
        config: Video configuration.
        card_type: "intro" or "outro".
        image_path: Optional background image. Uses title card if None.
        captions: Optional caption segments for overlay.

    Returns:
        A video clip for the intro/outro.
    """
    resolution = tuple(config.resolution)
    audio = AudioFileClip(str(audio_path))
    duration = audio.duration + 1.5

    if image_path and image_path.exists():
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

    if captions and config.captions_enabled:
        clip = render_captions(clip, captions, config, resolution, audio_offset=0.75)

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
        intro_vids = [p for p in (script.intro_video_paths or []) if p and Path(p).exists()]
        has_intro_image = script.intro_image_path and Path(script.intro_image_path).exists()

        if intro_vids and has_intro_image:
            # Dynamic intro: 3s title image + AI video clips for the rest
            audio = AudioFileClip(str(script.intro_audio_path))
            total_dur = audio.duration + 1.0
            IMAGE_HOLD = 3.0

            # Title image clip (3 seconds)
            if config.ken_burns:
                title_img = apply_ken_burns(str(script.intro_image_path), IMAGE_HOLD, resolution)
            else:
                title_img = resize_image_to_fill(str(script.intro_image_path), resolution)
                title_img = title_img.with_duration(IMAGE_HOLD)

            # Load and resize video clips
            vid_clips = []
            for vp in intro_vids:
                v = VideoFileClip(str(vp))
                v = _resize_video_to_fill(v, resolution)
                v = v.without_audio()
                vid_clips.append(v)

            # Join video clips, loop/trim to fill remaining duration
            remaining = total_dur - IMAGE_HOLD + config.transition_duration
            if len(vid_clips) == 1:
                vid_part = vid_clips[0]
            else:
                trans_dur = min(config.transition_duration, 0.5)
                vid_part = join_clips(vid_clips, config.transition, trans_dur)
            if vid_part.duration < remaining:
                loops = int(remaining / vid_part.duration) + 1
                vid_part = concatenate_videoclips([vid_part] * loops)
            vid_part = vid_part.subclipped(0, remaining)

            # Join title image + video clips with transition
            intro = join_clips(
                [title_img, vid_part], config.transition, config.transition_duration
            )
            intro = intro.subclipped(0, total_dur)
            audio = audio.with_start(0.5)
            intro = intro.with_audio(audio)
            if script.intro_captions and config.captions_enabled:
                intro = render_captions(intro, script.intro_captions, config, resolution, audio_offset=0.5)
            log(f"intro: {IMAGE_HOLD}s image + {remaining:.1f}s video clips")
        else:
            # Fallback: image-only intro (multiple images or single)
            intro_paths = [p for p in (script.intro_image_paths or []) if p and Path(p).exists()]
            if has_intro_image:
                main_intro = Path(script.intro_image_path)
                if main_intro not in [Path(p) for p in intro_paths]:
                    intro_paths.insert(0, main_intro)
            if len(intro_paths) > 1:
                audio = AudioFileClip(str(script.intro_audio_path))
                total_dur = audio.duration + 1.5
                n_imgs = len(intro_paths)
                trans_dur = min(config.transition_duration, total_dur / n_imgs * 0.3)
                per_img_dur = (total_dur + (n_imgs - 1) * trans_dur) / n_imgs
                sub_clips = []
                for ip in intro_paths:
                    sc = resize_image_to_fill(str(ip), resolution)
                    sc = sc.with_duration(per_img_dur)
                    sub_clips.append(sc)
                intro = join_clips(sub_clips, config.transition, trans_dur)
                intro = intro.subclipped(0, total_dur)
                audio = audio.with_start(0.75)
                intro = intro.with_audio(audio)
                if script.intro_captions and config.captions_enabled:
                    intro = render_captions(intro, script.intro_captions, config, resolution, audio_offset=0.75)
            else:
                intro = _build_narration_clip(
                    script.intro_audio_path,
                    script.title,
                    config,
                    card_type="intro",
                    image_path=script.intro_image_path,
                    captions=script.intro_captions,
                )
        clips.append(intro)

    # Sections
    section_clips_added = 0
    for section in script.sections:
        has_video = section.video_path and Path(section.video_path).exists()
        has_image = section.image_path and Path(section.image_path).exists()
        if not section.audio_path or (not has_video and not has_image):
            log(f"skip section {section.number}: missing assets")
            continue
        # Insert silent gap between sections (only for cut transitions;
        # crossfade/slide already provide visual separation)
        if section_clips_added > 0 and config.section_gap > 0 and config.transition == "cut":
            gap = ColorClip(resolution, color=(0, 0, 0), duration=config.section_gap)
            gap = gap.with_fps(config.fps)
            clips.append(gap)
        log(f"building section {section.number}: {section.heading}")
        if has_video:
            section_clip = _build_video_section_clip(
                video_path=section.video_path,
                audio_path=section.audio_path,
                heading=section.heading,
                number=section.number,
                config=config,
                video_paths=section.video_paths or None,
                captions=section.captions or None,
            )
        else:
            section_clip = _build_section_clip(
                image_path=section.image_path,
                audio_path=section.audio_path,
                heading=section.heading,
                number=section.number,
                config=config,
                image_paths=section.image_paths or None,
                captions=section.captions or None,
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
            captions=script.outro_captions,
        )
        clips.append(outro)

    if not clips:
        raise RuntimeError("No clips were generated. Check that all assets exist.")

    # Validate all clips before joining
    for i, c in enumerate(clips):
        if c is None:
            log(f"WARNING: clip {i} is None, removing")
        elif not hasattr(c, 'duration') or c.duration is None:
            log(f"WARNING: clip {i} has no duration")
        else:
            log(f"clip {i}: duration={c.duration:.1f}s, size={getattr(c, 'size', 'unknown')}")
    clips = [c for c in clips if c is not None]

    # Join with transitions
    log(f"joining {len(clips)} clips with '{config.transition}' transition...")
    final = join_clips(clips, config.transition, config.transition_duration)
    log(f"total duration: {final.duration:.1f}s -- encoding to {output_path.name}...")
    log("ffmpeg encoding started (this may take several minutes)...")

    total_frames = int(final.duration * config.fps)
    frame_logger = _FrameLogger(total_frames=total_frames)
    log(f"encoding {total_frames} frames at {config.fps}fps...")

    try:
        if platform.system() == "Darwin":
            # VideoToolbox does not support libx264 -preset values;
            # use ffmpeg_params for HW-encoder options instead.
            final.write_videofile(
                str(output_path),
                fps=config.fps,
                codec="h264_videotoolbox",
                audio_codec="aac",
                threads=os.cpu_count() or 8,
                pixel_format="yuv420p",
                ffmpeg_params=["-realtime", "0", "-allow_sw", "1"],
                logger=frame_logger,
            )
        else:
            final.write_videofile(
                str(output_path),
                fps=config.fps,
                codec="libx264",
                audio_codec="aac",
                threads=os.cpu_count() or 8,
                preset=config.encoding_preset,
                pixel_format="yuv420p",
                logger=frame_logger,
            )
    except Exception as e:
        log(f"ENCODING ERROR: {e}")
        log(traceback.format_exc())
        raise
    finally:
        for clip in clips:
            try:
                clip.close()
            except Exception:
                pass
        try:
            final.close()
        except Exception:
            pass

    file_mb = output_path.stat().st_size / (1024 * 1024)
    log(f"video saved: {output_path.name} ({file_mb:.1f} MB)")
    return output_path

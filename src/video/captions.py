"""TikTok-style word-by-word caption renderer for MoviePy clips."""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from moviepy import CompositeVideoClip, ImageClip, VideoClip
from PIL import Image, ImageDraw, ImageFont

from src.models import CaptionSegment, CaptionWord, VideoConfig

# Padding/radius as fraction of font size for proportional scaling
_PAD_X_RATIO = 0.55
_PAD_Y_RATIO = 0.50
_RADIUS_RATIO = 0.35


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    """Convert '#RRGGBB' to (R, G, B, A)."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return (255, 255, 255, alpha)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, alpha)


@dataclass
class CaptionStyle:
    """Resolved caption style from VideoConfig."""
    font_path: str
    font_size: int
    text_color: tuple[int, int, int, int]
    active_color: tuple[int, int, int, int]
    bg_color: tuple[int, int, int, int]
    shadow_color: tuple[int, int, int, int]
    uppercase: bool
    position: int  # vertical position as % from top (0-100)

    @classmethod
    def from_config(cls, config: VideoConfig, resolution: tuple[int, int]) -> CaptionStyle:
        font_size = config.caption_font_size
        if font_size <= 0:
            font_size = _auto_font_size(resolution)
        return cls(
            font_path=config.caption_font or config.font,
            font_size=font_size,
            text_color=_hex_to_rgba(config.caption_text_color),
            active_color=_hex_to_rgba(config.caption_active_color),
            bg_color=_hex_to_rgba(config.caption_bg_color, config.caption_bg_opacity),
            shadow_color=(0, 0, 0, 220),
            uppercase=config.caption_uppercase,
            position=config.caption_position,
        )


def _load_font(font_path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        path = font_path
        if getattr(sys, 'frozen', False) and not Path(path).exists():
            path = str(Path(sys._MEIPASS) / font_path)
        return ImageFont.truetype(path, size)
    except (OSError, IOError):
        return ImageFont.load_default()


def _is_portrait(resolution: tuple[int, int]) -> bool:
    return resolution[1] > resolution[0]


def _auto_font_size(resolution: tuple[int, int]) -> int:
    """Auto font size based on resolution and aspect ratio.

    Portrait (9:16): uses ~8% of width for readable captions on narrow screens.
    Landscape (16:9): uses ~5.5% of height for proportional captions.
    """
    w, h = resolution
    if h > w:
        return max(36, int(w * 0.08))
    else:
        return max(36, int(h * 0.055))


def _get_words_per_group(resolution: tuple[int, int]) -> int:
    return 2 if _is_portrait(resolution) else 3


def _get_y_position(resolution: tuple[int, int], text_h: int, position_pct: int) -> int:
    """Calculate Y pixel position from percentage (0=top, 100=bottom)."""
    _w, h = resolution
    pct = max(5, min(95, position_pct)) / 100.0
    return int(h * pct) - text_h // 2


def _build_word_groups(captions: list[CaptionSegment], group_size: int) -> list[list[CaptionWord]]:
    groups: list[list[CaptionWord]] = []
    for seg in captions:
        words = seg.words
        for i in range(0, len(words), group_size):
            groups.append(words[i:i + group_size])
    return groups


def _render_caption_frame(
    words: list[CaptionWord],
    active_idx: int,
    font: ImageFont.FreeTypeFont,
    resolution: tuple[int, int],
    style: CaptionStyle,
) -> np.ndarray:
    """Render a single caption frame with highlighted active word."""
    w, h = resolution
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if style.uppercase:
        texts = [word.word.upper() for word in words]
    else:
        texts = [word.word for word in words]
    full_text = " ".join(texts)

    # Auto-shrink font if text exceeds available width (with margins)
    max_text_w = int(w * 0.90)
    current_font = font
    bbox = draw.textbbox((0, 0), full_text, font=current_font)
    text_w = bbox[2] - bbox[0]
    if text_w > max_text_w:
        scale = max_text_w / text_w
        shrunk_size = max(16, int(style.font_size * scale))
        current_font = _load_font(style.font_path, shrunk_size)
        bbox = draw.textbbox((0, 0), full_text, font=current_font)
        text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    y_pos = _get_y_position(resolution, text_h, style.position)
    x_start = (w - text_w) // 2

    effective_size = current_font.size if hasattr(current_font, 'size') else style.font_size
    pad_x = int(effective_size * _PAD_X_RATIO)
    pad_y = int(effective_size * _PAD_Y_RATIO)
    radius = int(effective_size * _RADIUS_RATIO)
    bg_left = max(4, x_start - pad_x)
    bg_top = y_pos + bbox[1] - pad_y
    bg_right = min(w - 4, x_start + text_w + pad_x)
    bg_bottom = y_pos + bbox[3] + pad_y
    draw.rounded_rectangle(
        [bg_left, bg_top, bg_right, bg_bottom],
        radius=radius,
        fill=style.bg_color,
    )

    cursor_x = x_start
    shadow_offset = max(2, effective_size // 20)
    for i, word_text in enumerate(texts):
        color = style.active_color if i == active_idx else style.text_color

        draw.text((cursor_x + shadow_offset, y_pos + shadow_offset), word_text, font=current_font, fill=style.shadow_color)
        draw.text((cursor_x, y_pos), word_text, font=current_font, fill=color)

        word_bbox = draw.textbbox((0, 0), word_text + " ", font=current_font)
        cursor_x += word_bbox[2] - word_bbox[0]

    return np.array(img)


def render_captions(
    clip: VideoClip,
    captions: list[CaptionSegment],
    config: VideoConfig,
    resolution: tuple[int, int],
    audio_offset: float = 0.5,
) -> CompositeVideoClip:
    """Overlay TikTok-style captions on a video clip.

    Args:
        clip: Base video clip.
        captions: List of caption segments with word-level timing.
        config: VideoConfig with caption style settings.
        resolution: Video resolution (w, h).
        audio_offset: Audio start offset in the clip (captions shift by this).

    Returns:
        CompositeVideoClip with caption overlays.
    """
    if not captions or not any(s.words for s in captions):
        return clip

    style = CaptionStyle.from_config(config, resolution)
    group_size = _get_words_per_group(resolution)
    groups = _build_word_groups(captions, group_size)
    if not groups:
        return clip

    font = _load_font(style.font_path, style.font_size)

    windows: list[tuple[float, float, int, list]] = []
    for group in groups:
        for word_idx, word in enumerate(group):
            word_start = word.start + audio_offset
            word_end = word.end + audio_offset
            if word_start >= clip.duration:
                continue
            word_end = min(word_end, clip.duration)
            if word_end <= word_start:
                continue
            windows.append((word_start, word_end, word_idx, group))

    if not windows:
        return clip

    _frame_cache: dict[tuple[int, int], np.ndarray] = {}

    def make_caption_frame(t: float) -> np.ndarray:
        w, h = resolution
        for start, end, active_idx, group in windows:
            if start <= t < end:
                cache_key = (id(group), active_idx)
                if cache_key not in _frame_cache:
                    _frame_cache[cache_key] = _render_caption_frame(group, active_idx, font, resolution, style)
                return _frame_cache[cache_key]
        return np.zeros((h, w, 4), dtype=np.uint8)

    caption_clip = VideoClip(make_caption_frame, duration=clip.duration, is_mask=False)
    caption_clip = caption_clip.with_fps(getattr(clip, 'fps', None) or 30)

    return CompositeVideoClip([clip, caption_clip], size=resolution, bg_color=None)

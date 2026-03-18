from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from moviepy import ImageClip, CompositeVideoClip, VideoClip
from PIL import Image, ImageDraw, ImageFont


def _resolve_font(font_path: str) -> str:
    """Resolve font path, checking PyInstaller bundle if needed."""
    if getattr(sys, 'frozen', False) and not Path(font_path).exists():
        return str(Path(sys._MEIPASS) / font_path)
    return font_path


def create_text_image(
    text: str,
    size: tuple[int, int],
    font_path: str,
    font_size: int = 60,
    text_color: tuple[int, int, int, int] = (255, 255, 255, 255),
    bg_color: tuple[int, int, int, int] = (0, 0, 0, 0),
    padding: int = 20,
    align: str = "center",
) -> np.ndarray:
    """Render text onto a transparent RGBA image.

    Args:
        text: Text to render.
        size: Image size (width, height).
        font_path: Path to .ttf font file.
        font_size: Font size in pixels.
        text_color: RGBA text color.
        bg_color: RGBA background color.
        padding: Padding around text.
        align: Text alignment ("left", "center", "right").

    Returns:
        NumPy array (RGBA) of the rendered text image.
    """
    w, h = size
    img = Image.new("RGBA", (w, h), bg_color)
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype(_resolve_font(font_path), font_size)
    except (OSError, IOError):
        font = ImageFont.load_default()

    # Calculate text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Position text
    if align == "center":
        x = (w - text_w) // 2
    elif align == "right":
        x = w - text_w - padding
    else:
        x = padding
    y = (h - text_h) // 2

    # Draw shadow for readability
    shadow_offset = max(2, font_size // 20)
    draw.text(
        (x + shadow_offset, y + shadow_offset),
        text,
        font=font,
        fill=(0, 0, 0, 180),
    )
    # Draw main text
    draw.text((x, y), text, font=font, fill=text_color)

    return np.array(img)


def add_section_number_badge(
    clip: VideoClip,
    number: int,
    font_path: str,
    resolution: tuple[int, int] = (1920, 1080),
) -> CompositeVideoClip:
    """Add a number badge (circle with number) to the top-left of a clip.

    Args:
        clip: The base video clip.
        number: Section number to display.
        font_path: Path to font file.
        resolution: Output resolution.

    Returns:
        Composite clip with the badge overlay.
    """
    badge_size = 100
    badge_img = Image.new("RGBA", (badge_size, badge_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badge_img)

    # Draw circle
    margin = 5
    draw.ellipse(
        [margin, margin, badge_size - margin, badge_size - margin],
        fill=(220, 50, 50, 230),
        outline=(255, 255, 255, 255),
        width=3,
    )

    # Draw number
    try:
        font = ImageFont.truetype(_resolve_font(font_path), 48)
    except (OSError, IOError):
        font = ImageFont.load_default()

    text = str(number)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text(
        ((badge_size - text_w) // 2, (badge_size - text_h) // 2 - 4),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )

    badge_clip = (
        ImageClip(np.array(badge_img))
        .with_duration(clip.duration)
        .with_position((40, 40))
    )

    return CompositeVideoClip([clip, badge_clip], size=resolution)


def add_heading_overlay(
    clip: VideoClip,
    heading: str,
    font_path: str,
    resolution: tuple[int, int] = (1920, 1080),
    position: str = "bottom",
) -> CompositeVideoClip:
    """Add a heading text bar overlay to a clip.

    Args:
        clip: The base video clip.
        heading: Heading text to display.
        font_path: Path to font file.
        resolution: Output resolution.
        position: "bottom" or "top".

    Returns:
        Composite clip with the heading overlay.
    """
    w, h = resolution
    bar_height = 100

    # Create semi-transparent bar with text
    text_img = create_text_image(
        text=heading,
        size=(w, bar_height),
        font_path=font_path,
        font_size=44,
        text_color=(255, 255, 255, 255),
        bg_color=(0, 0, 0, 160),
        align="center",
    )

    y_pos = h - bar_height - 40 if position == "bottom" else 40
    text_clip = (
        ImageClip(text_img)
        .with_duration(clip.duration)
        .with_position((0, y_pos))
    )

    return CompositeVideoClip([clip, text_clip], size=resolution)


def create_title_card(
    title: str,
    font_path: str,
    duration: float = 3.0,
    resolution: tuple[int, int] = (1920, 1080),
    bg_color: tuple[int, int, int] = (15, 15, 25),
    text_color: tuple[int, int, int, int] = (255, 255, 255, 255),
) -> VideoClip:
    """Create a title card (intro/outro) clip.

    Args:
        title: Title text.
        font_path: Path to font file.
        duration: Duration of the title card.
        resolution: Output resolution.
        bg_color: Background color (RGB).
        text_color: Text color (RGBA).

    Returns:
        A video clip showing the title card.
    """
    w, h = resolution

    # Create background
    bg = Image.new("RGB", (w, h), bg_color)
    draw = ImageDraw.Draw(bg)

    # Add decorative line
    line_y = h // 2 + 50
    line_margin = w // 4
    draw.line(
        [(line_margin, line_y), (w - line_margin, line_y)],
        fill=(220, 50, 50),
        width=3,
    )

    bg_array = np.array(bg)
    bg_clip = ImageClip(bg_array).with_duration(duration)

    # Create title text overlay
    text_img = create_text_image(
        text=title,
        size=(w, h),
        font_path=font_path,
        font_size=72,
        text_color=text_color,
        bg_color=(0, 0, 0, 0),
        align="center",
    )

    text_clip = (
        ImageClip(text_img)
        .with_duration(duration)
        .with_position("center")
    )

    return CompositeVideoClip([bg_clip, text_clip], size=resolution)

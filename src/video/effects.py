from __future__ import annotations

import numpy as np
from moviepy import ImageClip, vfx


def apply_ken_burns(
    image_path: str,
    duration: float,
    resolution: tuple[int, int] = (1920, 1080),
    zoom_ratio: float = 0.08,
    direction: str = "in",
) -> ImageClip:
    """Apply a Ken Burns (zoom + pan) effect to a still image.

    Args:
        image_path: Path to the source image.
        duration: Duration of the clip in seconds.
        resolution: Output resolution (width, height).
        zoom_ratio: How much to zoom over the duration (0.08 = 8%).
        direction: "in" for zoom-in, "out" for zoom-out.

    Returns:
        A MoviePy clip with the Ken Burns effect applied.
    """
    w, h = resolution
    clip = ImageClip(image_path).with_duration(duration)

    # Resize image to be larger than output to allow for zoom/pan
    scale_factor = 1 + zoom_ratio
    clip = clip.resized((int(w * scale_factor), int(h * scale_factor)))

    def make_frame(get_frame, t):
        """Apply progressive zoom by cropping from the scaled image."""
        progress = t / duration if duration > 0 else 0

        if direction == "out":
            progress = 1 - progress

        # Interpolate zoom level
        current_scale = 1 + zoom_ratio * (1 - progress)
        crop_w = int(w / current_scale * scale_factor)
        crop_h = int(h / current_scale * scale_factor)

        frame = get_frame(t)
        frame_h, frame_w = frame.shape[:2]

        # Center crop
        x_start = (frame_w - crop_w) // 2
        y_start = (frame_h - crop_h) // 2

        # Clamp
        x_start = max(0, min(x_start, frame_w - crop_w))
        y_start = max(0, min(y_start, frame_h - crop_h))

        cropped = frame[y_start : y_start + crop_h, x_start : x_start + crop_w]

        # Resize back to output resolution
        from PIL import Image

        img = Image.fromarray(cropped)
        img = img.resize((w, h), Image.BILINEAR)
        return np.array(img)

    return clip.transform(make_frame, apply_to="mask" if False else []).with_duration(
        duration
    )


def resize_image_to_fill(
    image_path: str, resolution: tuple[int, int] = (1920, 1080)
) -> ImageClip:
    """Resize an image to fill the target resolution, cropping if needed.

    Maintains aspect ratio, scales to cover, then center-crops.
    """
    from PIL import Image

    w, h = resolution
    img = Image.open(image_path).convert("RGB")
    img_w, img_h = img.size

    # Scale to cover
    scale = max(w / img_w, h / img_h)
    new_w = int(img_w * scale)
    new_h = int(img_h * scale)
    img = img.resize((new_w, new_h), Image.BILINEAR)

    # Center crop
    left = (new_w - w) // 2
    top = (new_h - h) // 2
    img = img.crop((left, top, left + w, top + h))

    return ImageClip(np.array(img))

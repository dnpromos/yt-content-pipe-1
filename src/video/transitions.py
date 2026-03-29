from __future__ import annotations

import numpy as np
from moviepy import CompositeVideoClip, VideoClip, concatenate_videoclips
from moviepy.video.fx import CrossFadeIn


def crossfade(clips: list[VideoClip], duration: float = 0.8) -> VideoClip:
    """Join clips with crossfade transitions.

    Args:
        clips: List of video clips to join.
        duration: Duration of each crossfade in seconds.

    Returns:
        A single composite clip with crossfade transitions.
    """
    if not clips:
        raise ValueError("No clips provided")
    if len(clips) == 1:
        return clips[0]

    # Set start times with overlap
    current_time = 0.0
    for i, clip in enumerate(clips):
        clips[i] = clip.with_start(current_time)
        if i < len(clips) - 1:
            current_time += clip.duration - duration
        else:
            current_time += clip.duration

    # Apply crossfade: each clip (except the first) fades in
    processed = [clips[0]]
    for i in range(1, len(clips)):
        faded = clips[i].with_effects([CrossFadeIn(duration)])
        processed.append(faded)

    return CompositeVideoClip(processed, size=clips[0].size).with_duration(
        current_time
    )


def slide_transition(
    clip_a: VideoClip,
    clip_b: VideoClip,
    duration: float = 0.8,
    direction: str = "left",
) -> VideoClip:
    """Create a slide transition between two clips.

    Args:
        clip_a: The outgoing clip.
        clip_b: The incoming clip.
        duration: Duration of the slide.
        direction: Slide direction ("left" or "right").

    Returns:
        A composite clip with the slide transition.
    """
    w, h = clip_a.size

    def position_a(t):
        progress = t / duration if duration > 0 else 1
        if direction == "left":
            return (-int(w * progress), 0)
        return (int(w * progress), 0)

    def position_b(t):
        progress = t / duration if duration > 0 else 1
        if direction == "left":
            return (int(w * (1 - progress)), 0)
        return (-int(w * (1 - progress)), 0)

    # Take only the transition portion from each clip
    a_end = clip_a.with_duration(duration).with_position(position_a)
    b_start = clip_b.with_duration(duration).with_position(position_b)

    return CompositeVideoClip([a_end, b_start], size=(w, h)).with_duration(duration)


def join_clips(
    clips: list[VideoClip],
    transition: str = "crossfade",
    transition_duration: float = 0.8,
) -> VideoClip:
    """Join multiple clips with the specified transition type.

    Args:
        clips: List of video clips.
        transition: Transition type ("crossfade", "slide", "cut").
        transition_duration: Duration of each transition.

    Returns:
        A single video clip with transitions applied.
    """
    if not clips:
        raise ValueError("No clips provided")
    if len(clips) == 1:
        return clips[0]

    if transition == "crossfade":
        return crossfade(clips, transition_duration)
    elif transition == "slide":
        # Build with slide transitions
        result_parts = []
        for i in range(len(clips) - 1):
            # Add the main portion of clip_a (minus transition duration)
            main_dur = clips[i].duration - transition_duration
            if main_dur > 0:
                result_parts.append(clips[i].with_duration(main_dur))
            # Add the slide transition
            trans = slide_transition(
                clips[i], clips[i + 1], transition_duration, direction="left"
            )
            result_parts.append(trans)
        # Add the remainder of the last clip
        last_main_dur = clips[-1].duration - transition_duration
        if last_main_dur > 0:
            result_parts.append(
                clips[-1].subclipped(transition_duration)
            )
        else:
            result_parts.append(clips[-1])
        return concatenate_videoclips(result_parts, method="compose")
    else:
        # Simple cut
        return concatenate_videoclips(clips, method="compose")

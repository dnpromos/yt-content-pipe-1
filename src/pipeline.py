from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from pathlib import Path

from rich.console import Console

from src.log import emit as log
from src.models import AppConfig, Script
from src.providers.base import ImageProvider, LLMProvider, VoiceProvider, VideoGenProvider
from src.providers.image_provider import OpenAIImageProvider
from src.providers.llm_provider import OpenAILLMProvider
from src.providers.voice_provider import OpenAIVoiceProvider
from src.providers.wiro_image_provider import WiroImageProvider
from src.providers.wiro_llm_provider import WiroLLMProvider
from src.providers.wiro_voice_provider import WiroVoiceProvider
from src.providers.wiro_video_provider import WiroVideoProvider
from src.providers.wiro_whisper_provider import WiroWhisperProvider
from src.models import CaptionSegment
from src.video.composer import compose_video

console = Console()

PROVIDER_REGISTRY: dict[str, dict[str, type]] = {
    "llm": {
        "openai": OpenAILLMProvider,
        "wiro": WiroLLMProvider,
    },
    "voice": {
        "openai": OpenAIVoiceProvider,
        "wiro": WiroVoiceProvider,
    },
    "image": {
        "openai": OpenAIImageProvider,
        "wiro": WiroImageProvider,
    },
    "video_gen": {
        "wiro": WiroVideoProvider,
    },
}


def _get_provider(kind: str, name: str, config):
    """Instantiate a provider by kind and name."""
    registry = PROVIDER_REGISTRY.get(kind, {})
    cls = registry.get(name)
    if cls is None:
        available = ", ".join(registry.keys()) or "none"
        raise ValueError(
            f"Unknown {kind} provider '{name}'. Available: {available}"
        )
    return cls(config)


def _create_run_dir(base: Path = Path("output")) -> Path:
    """Create a timestamped run directory."""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    run_dir = base / f"run_{timestamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


async def _generate_voice_for_section(
    voice: VoiceProvider, text: str, output_path: Path, label: str
) -> tuple[float, str | None]:
    """Generate voice for a single piece of text. Returns (duration, cdn_url)."""
    log(f"voice start: {label}")
    console.print(f"  Generating voice: {label}")
    duration, cdn_url = await voice.generate_speech(text, output_path)
    log(f"voice done: {label} ({duration:.1f}s, cdn={'yes' if cdn_url else 'no'})")
    console.print(f"  Voice done: {label} ({duration:.1f}s)")
    return duration, cdn_url


async def _transcribe_audio(
    whisper: WiroWhisperProvider, audio_url: str, label: str,
) -> list[CaptionSegment]:
    """Transcribe an audio URL via Whisper. Returns caption segments."""
    log(f"caption start: {label}")
    segments = await whisper.transcribe(audio_url)
    log(f"caption done: {label} ({sum(len(s.words) for s in segments)} words)")
    return segments


async def _generate_image_for_section(
    image_gen: ImageProvider, prompt: str, output_path: Path, label: str
) -> Path:
    """Generate an image for a single section."""
    log(f"image start: {label}")
    console.print(f"  Generating image: {label}")
    path = await image_gen.generate_image(prompt, output_path)
    log(f"image done: {label}")
    console.print(f"  Image done: {label}")
    return path


async def _generate_video_for_section(
    video_gen: VideoGenProvider, prompt: str, output_path: Path, label: str,
    duration: int = 5,
) -> Path:
    """Generate an AI video clip for a single section."""
    prompt = f"{prompt}. Do NOT include any text, captions, titles, headlines, or written words in the video."
    log(f"video gen start: {label}")
    console.print(f"  Generating video: {label}")
    path = await video_gen.generate_video(prompt, output_path, duration=duration)
    log(f"video gen done: {label}")
    console.print(f"  Video done: {label}")
    return path


async def regenerate_single_image(
    config: AppConfig, prompt: str, output_path: Path,
) -> Path:
    """Regenerate a single section image."""
    image_gen: ImageProvider = _get_provider("image", config.image.provider, config.image)
    log(f"retrying image: {output_path.name}")
    path = await image_gen.generate_image(prompt, output_path)
    log(f"image retry done: {output_path.name}")
    return path


async def regenerate_section_images(
    config: AppConfig, prompts: list[str], section_number: int, images_dir: Path,
) -> list[Path]:
    """Regenerate all images for a section in parallel."""
    image_gen: ImageProvider = _get_provider("image", config.image.provider, config.image)
    images_dir.mkdir(parents=True, exist_ok=True)

    tasks = []
    paths = []
    for idx, prompt in enumerate(prompts):
        suffix = "" if idx == 0 else f"_{chr(97 + idx)}"
        img_path = images_dir / f"section_{section_number:02d}{suffix}.png"
        paths.append(img_path)
        tasks.append(
            _generate_image_for_section(
                image_gen, prompt, img_path, f"Section {section_number} img {idx + 1}"
            )
        )

    log(f"retrying {len(tasks)} image(s) for section {section_number}...")
    await asyncio.gather(*tasks)
    generated = [p for p in paths if p.exists()]
    log(f"section {section_number}: {len(generated)}/{len(tasks)} images done")
    return paths


async def regenerate_section_videos(
    config: AppConfig, prompts: list[str], section_number: int, videos_dir: Path,
) -> list[Path]:
    """Regenerate video clips for a section in parallel."""
    if not config.video_gen:
        raise ValueError("No video_gen provider configured")
    videos_dir.mkdir(parents=True, exist_ok=True)
    video_gen = _get_provider("video_gen", config.video_gen.provider, config.video_gen)
    dur = config.video.video_gen_duration
    tasks = []
    paths = []
    for i, prompt in enumerate(prompts):
        suffix = f"_{chr(97 + i)}" if i > 0 else ""
        vid_path = videos_dir / f"section_{section_number:02d}{suffix}.mp4"
        paths.append(vid_path)
        tasks.append(
            _generate_video_for_section(
                video_gen, prompt, vid_path,
                f"Section {section_number} video {i + 1}",
                duration=dur,
            )
        )
    await asyncio.gather(*tasks)
    return [p for p in paths if p.exists()]


async def generate_script(
    config: AppConfig, topic: str, num_sections: int,
    subtitles: list[str] | None = None,
    custom_instructions: str = "",
    video_length: str = "medium",
) -> Script:
    """Step 1: Generate the listicle script via LLM."""
    log("step 1/4: generating script...")
    console.print("Step 1/4: Generating script...")
    llm: LLMProvider = _get_provider("llm", config.llm.provider, config.llm)
    image_style = config.image.extra.get("image_style", "") if config.image.extra else ""
    images_per_section = config.video.images_per_section
    script = await llm.generate_script(
        topic, num_sections, subtitles=subtitles,
        image_style=image_style, images_per_section=images_per_section,
        custom_instructions=custom_instructions,
        video_length=video_length,
    )
    log(f"script done: '{script.title}' ({len(script.sections)} sections)")
    console.print(f"Script generated: '{script.title}'")
    console.print(f"  Sections: {len(script.sections)}")
    return script


async def generate_assets(
    config: AppConfig, script: Script, run_dir: Path,
    force_images: bool = False,
    on_progress: Callable[[Script], Awaitable[None]] | None = None,
) -> Script:
    """Steps 2 & 3: Generate voice and images in parallel.

    Each asset task updates the script immediately on completion and
    calls ``on_progress`` so the caller can broadcast live updates.
    """
    log("step 2-3/4: generating voice + images (parallel)...")
    console.print("Step 2-3/4: Generating voice & images (parallel)...")

    voice: VoiceProvider = _get_provider("voice", config.voice.provider, config.voice)
    image_gen: ImageProvider = _get_provider("image", config.image.provider, config.image)
    video_gen = None
    use_video = config.video.section_media_type == "video" and config.video_gen is not None
    if use_video:
        video_gen = _get_provider("video_gen", config.video_gen.provider, config.video_gen)
        log("video mode: sections will use AI-generated video clips")

    audio_dir = run_dir / "audio"
    images_dir = run_dir / "images"
    videos_dir = run_dir / "videos"
    audio_dir.mkdir(exist_ok=True)
    images_dir.mkdir(exist_ok=True)
    videos_dir.mkdir(exist_ok=True)

    sections_by_num = {s.number: s for s in script.sections}

    # ------------------------------------------------------------------
    # Helper: run a coroutine, apply result to script, notify caller
    # ------------------------------------------------------------------
    _error_count = [0]

    async def _run_task(coro, task_type, task_key):
        try:
            result = await coro
        except Exception as e:
            _error_count[0] += 1
            log(f"asset error: {e}")
            console.print(f"Error: {e}")
            return

        if task_type == "intro_voice":
            duration, cdn_url = result
            script.intro_audio_path = intro_audio_path
            script.intro_duration = duration
            script.intro_audio_cdn_url = cdn_url
        elif task_type == "intro_image":
            script.intro_image_path = intro_image_path
        elif task_type == "intro_video":
            vid_path = videos_dir / f"intro_{task_key:02d}.mp4"
            if vid_path not in script.intro_video_paths:
                script.intro_video_paths.append(vid_path)
        elif task_type == "sec_voice":
            duration, cdn_url = result
            sec = sections_by_num[task_key]
            sec.audio_path = audio_dir / f"section_{task_key:02d}.mp3"
            sec.duration = duration
            sec.audio_cdn_url = cdn_url
        elif task_type == "sec_video":
            sec_number, vid_idx = task_key
            sec = sections_by_num[sec_number]
            suffix = "" if vid_idx == 0 else f"_{chr(97 + vid_idx)}"
            vid_path = videos_dir / f"section_{sec_number:02d}{suffix}.mp4"
            if vid_idx == 0:
                sec.video_path = vid_path
            if vid_path not in sec.video_paths:
                sec.video_paths.append(vid_path)
        elif task_type == "sec_image":
            sec_number, img_idx = task_key
            sec = sections_by_num[sec_number]
            suffix = "" if img_idx == 0 else f"_{chr(97 + img_idx)}"
            img_path = images_dir / f"section_{sec_number:02d}{suffix}.png"
            if img_idx == 0:
                sec.image_path = img_path
            if img_path not in sec.image_paths:
                sec.image_paths.append(img_path)
        elif task_type == "outro_voice":
            duration, cdn_url = result
            script.outro_audio_path = outro_audio_path
            script.outro_duration = duration
            script.outro_audio_cdn_url = cdn_url
        elif task_type == "outro_image":
            script.outro_image_path = outro_image_path

        if on_progress:
            try:
                await on_progress(script)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Build the wrapped task list
    # ------------------------------------------------------------------
    wrapped_tasks: list = []

    # Intro voice
    intro_audio_path = audio_dir / "intro.mp3"
    if not intro_audio_path.exists():
        wrapped_tasks.append(_run_task(
            _generate_voice_for_section(voice, script.intro_narration, intro_audio_path, "Intro"),
            "intro_voice", None,
        ))
    else:
        log("skip intro voice (exists)")
        script.intro_audio_path = intro_audio_path

    # Intro image (always generated — shown for first 3s)
    intro_image_path = images_dir / "intro.png"
    if script.intro_image_prompt and (force_images or not intro_image_path.exists()):
        wrapped_tasks.append(_run_task(
            _generate_image_for_section(image_gen, script.intro_image_prompt, intro_image_path, "Intro"),
            "intro_image", None,
        ))
    elif intro_image_path.exists():
        log("skip intro image (exists)")
        script.intro_image_path = intro_image_path

    # Intro overview video clips (give a visual preview of the whole video)
    if use_video and video_gen:
        n_intro_vids = config.video.intro_video_count
        vid_dur = config.video.video_gen_duration
        headings = [s.heading for s in script.sections]
        for vid_idx in range(n_intro_vids):
            intro_vid = videos_dir / f"intro_{vid_idx:02d}.mp4"
            if force_images or not intro_vid.exists():
                chunk_size = max(1, len(headings) // n_intro_vids)
                start = vid_idx * chunk_size
                relevant = headings[start:start + chunk_size] or headings
                overview_prompt = (
                    f"Cinematic montage preview showing: {', '.join(relevant)}. "
                    f"Dynamic camera movement, dramatic lighting, fast-paced visual overview, "
                    f"high energy, professional documentary style"
                )
                wrapped_tasks.append(_run_task(
                    _generate_video_for_section(video_gen, overview_prompt, intro_vid, f"Intro vid {vid_idx + 1}", duration=vid_dur),
                    "intro_video", vid_idx,
                ))
            else:
                log(f"skip intro vid {vid_idx + 1} (exists)")
                if intro_vid not in script.intro_video_paths:
                    script.intro_video_paths.append(intro_vid)

    # Section voices and images/videos
    for section in script.sections:
        sec_audio = audio_dir / f"section_{section.number:02d}.mp3"

        if not sec_audio.exists():
            wrapped_tasks.append(_run_task(
                _generate_voice_for_section(voice, section.narration, sec_audio, f"Section {section.number}"),
                "sec_voice", section.number,
            ))
        else:
            log(f"skip section {section.number} voice (exists)")
            section.audio_path = sec_audio

        if use_video and video_gen:
            n_vids = config.video.videos_per_section
            vid_dur = config.video.video_gen_duration
            prompts = section.image_prompts if section.image_prompts else [section.image_prompt]
            base_prompt = section.video_prompt or (prompts[0] if prompts else section.heading)
            for vid_idx in range(n_vids):
                suffix = "" if vid_idx == 0 else f"_{chr(97 + vid_idx)}"
                sec_video = videos_dir / f"section_{section.number:02d}{suffix}.mp4"
                vid_prompt = prompts[vid_idx] if vid_idx < len(prompts) else base_prompt
                if force_images or not sec_video.exists():
                    wrapped_tasks.append(_run_task(
                        _generate_video_for_section(video_gen, vid_prompt, sec_video, f"Section {section.number} vid {vid_idx + 1}", duration=vid_dur),
                        "sec_video", (section.number, vid_idx),
                    ))
                else:
                    log(f"skip section {section.number} vid {vid_idx + 1} (exists)")
                    if vid_idx == 0:
                        section.video_path = sec_video
                    if sec_video not in section.video_paths:
                        section.video_paths.append(sec_video)
        else:
            prompts = section.image_prompts if section.image_prompts else [section.image_prompt]
            for img_idx, prompt in enumerate(prompts):
                suffix = "" if img_idx == 0 else f"_{chr(97 + img_idx)}"
                sec_image = images_dir / f"section_{section.number:02d}{suffix}.png"
                if force_images or not sec_image.exists():
                    wrapped_tasks.append(_run_task(
                        _generate_image_for_section(image_gen, prompt, sec_image, f"Section {section.number} img {img_idx + 1}"),
                        "sec_image", (section.number, img_idx),
                    ))
                else:
                    log(f"skip section {section.number} img {img_idx + 1} (exists)")
                    if img_idx == 0:
                        section.image_path = sec_image
                    if sec_image not in section.image_paths:
                        section.image_paths.append(sec_image)

    # Outro voice
    outro_audio_path = audio_dir / "outro.mp3"
    if not outro_audio_path.exists():
        wrapped_tasks.append(_run_task(
            _generate_voice_for_section(voice, script.outro_narration, outro_audio_path, "Outro"),
            "outro_voice", None,
        ))
    else:
        log("skip outro voice (exists)")
        script.outro_audio_path = outro_audio_path

    # Outro image
    outro_image_path = images_dir / "outro.png"
    if script.outro_image_prompt and (force_images or not outro_image_path.exists()):
        wrapped_tasks.append(_run_task(
            _generate_image_for_section(image_gen, script.outro_image_prompt, outro_image_path, "Outro"),
            "outro_image", None,
        ))
    elif outro_image_path.exists():
        log("skip outro image (exists)")
        script.outro_image_path = outro_image_path

    # Run all tasks in parallel — each updates the script on completion
    log(f"launching {len(wrapped_tasks)} asset tasks in parallel...")
    await asyncio.gather(*wrapped_tasks)

    # Clear stale captions before re-transcribing
    script.intro_captions = []
    script.outro_captions = []
    for sec in script.sections:
        sec.captions = []

    # Transcribe audio for captions (if enabled and CDN URLs available)
    if config.video.captions_enabled:
        whisper = WiroWhisperProvider(config.voice)
        caption_tasks = []
        caption_map: list[tuple[str, int | None]] = []

        missing_urls = 0
        if script.intro_audio_cdn_url:
            caption_tasks.append(_transcribe_audio(whisper, script.intro_audio_cdn_url, "Intro"))
            caption_map.append(("intro", None))
        elif script.intro_audio_path:
            missing_urls += 1
        for sec in script.sections:
            if sec.audio_cdn_url:
                caption_tasks.append(_transcribe_audio(whisper, sec.audio_cdn_url, f"Section {sec.number}"))
                caption_map.append(("section", sec.number))
            elif sec.audio_path:
                missing_urls += 1
        if script.outro_audio_cdn_url:
            caption_tasks.append(_transcribe_audio(whisper, script.outro_audio_cdn_url, "Outro"))
            caption_map.append(("outro", None))
        elif script.outro_audio_path:
            missing_urls += 1

        if missing_urls > 0:
            log(f"captions: {missing_urls} audio clip(s) have no CDN URL — regenerate voice to enable captions for them")

        if caption_tasks:
            log(f"transcribing {len(caption_tasks)} audio clip(s) for captions...")
            cap_results = await asyncio.gather(*caption_tasks, return_exceptions=True)
            for i, (cap_type, cap_num) in enumerate(caption_map):
                cap_result = cap_results[i]
                if isinstance(cap_result, Exception):
                    log(f"caption error ({cap_type} {cap_num}): {cap_result}")
                    continue
                if cap_type == "intro":
                    script.intro_captions = cap_result
                elif cap_type == "section":
                    sections_by_num[cap_num].captions = cap_result
                elif cap_type == "outro":
                    script.outro_captions = cap_result
            log("captions done")
        elif missing_urls > 0 and not caption_tasks:
            log("captions: no audio clips have CDN URLs — skipping transcription")

    if _error_count[0]:
        log(f"assets done with {_error_count[0]} error(s) — you can retry or upload manually")
    else:
        log("all assets generated")
    console.print("Assets processing complete.")
    return script


def assemble_video(config: AppConfig, script: Script, run_dir: Path) -> Path:
    """Step 4: Assemble the final video."""
    log("step 4/4: assembling video...")
    console.print("Step 4/4: Assembling video...")
    output_path = run_dir / "final_video.mp4"
    return compose_video(script, config.video, output_path)


def save_script(script: Script, run_dir: Path) -> Path:
    """Save the script as JSON for re-use."""
    script_path = run_dir / "script.json"
    data = json.loads(script.model_dump_json())
    # Normalize all path separators to forward slashes for cross-platform compat
    for key in ("intro_audio_path", "outro_audio_path", "intro_image_path", "outro_image_path"):
        if data.get(key):
            data[key] = data[key].replace("\\", "/")
    for sec in data.get("sections", []):
        for key in ("audio_path", "image_path"):
            if sec.get(key):
                sec[key] = sec[key].replace("\\", "/")
        if sec.get("image_paths"):
            sec["image_paths"] = [p.replace("\\", "/") for p in sec["image_paths"]]
    for key in ("intro_image_paths", "intro_video_paths"):
        if data.get(key):
            data[key] = [p.replace("\\", "/") for p in data[key]]
    with open(script_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return script_path


def load_script(script_path: Path) -> Script:
    """Load a script from JSON, discovering assets from disk when paths are missing."""
    script_path = Path(script_path)
    with open(script_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    run_dir = script_path.parent
    audio_dir = run_dir / "audio"
    images_dir = run_dir / "images"

    # Resolve or discover top-level paths
    _top_level_files = {
        "intro_audio_path": audio_dir / "intro.mp3",
        "outro_audio_path": audio_dir / "outro.mp3",
        "intro_image_path": images_dir / "intro.png",
        "outro_image_path": images_dir / "outro.png",
    }
    for key, default_path in _top_level_files.items():
        if data.get(key):
            p = Path(data[key].replace("\\", "/"))
            if not p.is_absolute():
                subdir = "images" if "image" in key else "audio"
                p = run_dir / subdir / p.name
            data[key] = str(p)
        elif default_path.exists():
            data[key] = str(default_path)

    # Resolve or discover section paths
    for sec in data.get("sections", []):
        num = sec.get("number", 0)
        _sec_files = {
            "audio_path": audio_dir / f"section_{num:02d}.mp3",
            "image_path": images_dir / f"section_{num:02d}.png",
        }
        for key, default_path in _sec_files.items():
            if sec.get(key):
                p = Path(sec[key].replace("\\", "/"))
                if not p.is_absolute():
                    subdir = "audio" if key == "audio_path" else "images"
                    p = run_dir / subdir / p.name
                sec[key] = str(p)
            elif default_path.exists():
                sec[key] = str(default_path)

        # Resolve or discover multi-image paths
        resolved_paths = []
        if sec.get("image_paths"):
            for ip in sec["image_paths"]:
                p = Path(ip.replace("\\", "/"))
                if not p.is_absolute():
                    p = images_dir / p.name
                if p.exists():
                    resolved_paths.append(str(p))
        else:
            # Discover from disk: section_01.png, section_01_b.png, section_01_c.png, ...
            for suffix in ["", "_b", "_c", "_d", "_e"]:
                candidate = images_dir / f"section_{num:02d}{suffix}.png"
                if candidate.exists():
                    resolved_paths.append(str(candidate))
        sec["image_paths"] = resolved_paths

    # Resolve or discover intro_image_paths
    videos_dir = run_dir / "videos"
    resolved_intro_images = []
    if data.get("intro_image_paths"):
        for ip in data["intro_image_paths"]:
            p = Path(ip.replace("\\", "/"))
            if not p.is_absolute():
                p = images_dir / p.name
            if p.exists():
                resolved_intro_images.append(str(p))
    else:
        # Discover from disk: intro_b.png, intro_c.png, intro_toc.png, ...
        for suffix in ["_b", "_c", "_d", "_e", "_toc"]:
            candidate = images_dir / f"intro{suffix}.png"
            if candidate.exists():
                resolved_intro_images.append(str(candidate))
    data["intro_image_paths"] = resolved_intro_images

    # Resolve or discover intro_video_paths
    resolved_intro_videos = []
    if data.get("intro_video_paths"):
        for vp in data["intro_video_paths"]:
            p = Path(vp.replace("\\", "/"))
            if not p.is_absolute():
                p = videos_dir / p.name
            if p.exists():
                resolved_intro_videos.append(str(p))
    else:
        # Discover from disk: intro_00.mp4, intro_01.mp4, ...
        for i in range(10):
            candidate = videos_dir / f"intro_{i:02d}.mp4"
            if candidate.exists():
                resolved_intro_videos.append(str(candidate))
    data["intro_video_paths"] = resolved_intro_videos

    return Script(**data)


async def run_full_pipeline(
    config: AppConfig,
    topic: str,
    num_sections: int,
    output_base: Path = Path("output"),
) -> Path:
    """Run the complete pipeline: script → assets → video.

    Args:
        config: Application configuration.
        topic: Video topic.
        num_sections: Number of listicle sections.
        output_base: Base directory for output.

    Returns:
        Path to the final video file.
    """
    run_dir = _create_run_dir(output_base)
    console.print(f"[bold]Run directory: {run_dir}[/bold]\n")

    # Step 1: Generate script
    script = await generate_script(config, topic, num_sections)
    save_script(script, run_dir)
    console.print(f"  Script saved to {run_dir / 'script.json'}\n")

    # Steps 2-3: Generate assets in parallel
    script = await generate_assets(config, script, run_dir)

    # Save updated script with asset paths
    save_script(script, run_dir)

    # Step 4: Assemble video
    video_path = assemble_video(config, script, run_dir)

    console.print(f"\n[bold green]Pipeline complete! Video: {video_path}[/bold green]")
    return video_path


async def run_assemble_only(
    config: AppConfig,
    script_path: Path,
) -> Path:
    """Re-assemble video from an existing script JSON (skip LLM + asset gen).

    Args:
        config: Application configuration.
        script_path: Path to script.json.

    Returns:
        Path to the final video file.
    """
    run_dir = script_path.parent
    script = load_script(script_path)
    console.print(f"[bold]Loaded script: '{script.title}'[/bold]")
    console.print(f"Run directory: {run_dir}\n")

    video_path = assemble_video(config, script, run_dir)
    console.print(f"\n[bold green]Assembly complete! Video: {video_path}[/bold green]")
    return video_path

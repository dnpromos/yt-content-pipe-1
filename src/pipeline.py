from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from rich.console import Console

from src.log import emit as log
from src.models import AppConfig, Script
from src.providers.base import ImageProvider, LLMProvider, VoiceProvider
from src.providers.image_provider import OpenAIImageProvider
from src.providers.llm_provider import OpenAILLMProvider
from src.providers.voice_provider import OpenAIVoiceProvider
from src.providers.wiro_image_provider import WiroImageProvider
from src.providers.wiro_llm_provider import WiroLLMProvider
from src.providers.wiro_voice_provider import WiroVoiceProvider
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
) -> float:
    """Generate voice for a single piece of text."""
    log(f"voice start: {label}")
    console.print(f"  Generating voice: {label}")
    duration = await voice.generate_speech(text, output_path)
    log(f"voice done: {label} ({duration:.1f}s)")
    console.print(f"  Voice done: {label} ({duration:.1f}s)")
    return duration


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


async def generate_script(
    config: AppConfig, topic: str, num_sections: int,
    subtitles: list[str] | None = None,
    custom_instructions: str = "",
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
    )
    log(f"script done: '{script.title}' ({len(script.sections)} sections)")
    console.print(f"Script generated: '{script.title}'")
    console.print(f"  Sections: {len(script.sections)}")
    return script


async def generate_assets(
    config: AppConfig, script: Script, run_dir: Path
) -> Script:
    """Steps 2 & 3: Generate voice and images in parallel."""
    log("step 2-3/4: generating voice + images (parallel)...")
    console.print("Step 2-3/4: Generating voice & images (parallel)...")

    voice: VoiceProvider = _get_provider("voice", config.voice.provider, config.voice)
    image_gen: ImageProvider = _get_provider("image", config.image.provider, config.image)

    audio_dir = run_dir / "audio"
    images_dir = run_dir / "images"
    audio_dir.mkdir(exist_ok=True)
    images_dir.mkdir(exist_ok=True)

    tasks = []
    # Track task order: (type, label) for mapping results back
    task_map = []

    # Intro voice
    intro_audio_path = audio_dir / "intro.mp3"
    if not intro_audio_path.exists():
        tasks.append(
            _generate_voice_for_section(
                voice, script.intro_narration, intro_audio_path, "Intro"
            )
        )
        task_map.append(("intro_voice", None))
    else:
        log("skip intro voice (exists)")
        script.intro_audio_path = intro_audio_path

    # Intro image
    intro_image_path = images_dir / "intro.png"
    if script.intro_image_prompt and not intro_image_path.exists():
        tasks.append(
            _generate_image_for_section(
                image_gen, script.intro_image_prompt, intro_image_path, "Intro"
            )
        )
        task_map.append(("intro_image", None))
    elif intro_image_path.exists():
        log("skip intro image (exists)")
        script.intro_image_path = intro_image_path

    # Section voices and images
    for section in script.sections:
        sec_audio = audio_dir / f"section_{section.number:02d}.mp3"

        if not sec_audio.exists():
            tasks.append(
                _generate_voice_for_section(
                    voice, section.narration, sec_audio, f"Section {section.number}"
                )
            )
            task_map.append(("sec_voice", section.number))
        else:
            log(f"skip section {section.number} voice (exists)")
            section.audio_path = sec_audio

        # Generate multiple images per section
        prompts = section.image_prompts if section.image_prompts else [section.image_prompt]
        for img_idx, prompt in enumerate(prompts):
            suffix = "" if img_idx == 0 else f"_{chr(97 + img_idx)}"  # _a, _b, _c...
            sec_image = images_dir / f"section_{section.number:02d}{suffix}.png"
            if not sec_image.exists():
                tasks.append(
                    _generate_image_for_section(
                        image_gen, prompt, sec_image, f"Section {section.number} img {img_idx + 1}"
                    )
                )
                task_map.append(("sec_image", (section.number, img_idx)))
            else:
                log(f"skip section {section.number} img {img_idx + 1} (exists)")
                if img_idx == 0:
                    section.image_path = sec_image
                if sec_image not in section.image_paths:
                    section.image_paths.append(sec_image)

    # Outro voice
    outro_audio_path = audio_dir / "outro.mp3"
    if not outro_audio_path.exists():
        tasks.append(
            _generate_voice_for_section(
                voice, script.outro_narration, outro_audio_path, "Outro"
            )
        )
        task_map.append(("outro_voice", None))
    else:
        log("skip outro voice (exists)")
        script.outro_audio_path = outro_audio_path

    # Outro image
    outro_image_path = images_dir / "outro.png"
    if script.outro_image_prompt and not outro_image_path.exists():
        tasks.append(
            _generate_image_for_section(
                image_gen, script.outro_image_prompt, outro_image_path, "Outro"
            )
        )
        task_map.append(("outro_image", None))
    elif outro_image_path.exists():
        log("skip outro image (exists)")
        script.outro_image_path = outro_image_path

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Log errors but don't abort — allow partial success
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        for err in errors:
            log(f"asset error: {err}")
            console.print(f"Error: {err}")

    # Map results back to script (skip failed ones)
    sections_by_num = {s.number: s for s in script.sections}

    for idx, (task_type, sec_num) in enumerate(task_map):
        result = results[idx]
        is_err = isinstance(result, Exception)

        if task_type == "intro_voice" and not is_err:
            script.intro_audio_path = intro_audio_path
            script.intro_duration = result
        elif task_type == "intro_image" and not is_err:
            script.intro_image_path = intro_image_path
        elif task_type == "sec_voice" and not is_err:
            sec = sections_by_num[sec_num]
            sec.audio_path = audio_dir / f"section_{sec_num:02d}.mp3"
            sec.duration = result
        elif task_type == "sec_image" and not is_err:
            sec_number, img_idx = sec_num
            sec = sections_by_num[sec_number]
            suffix = "" if img_idx == 0 else f"_{chr(97 + img_idx)}"
            img_path = images_dir / f"section_{sec_number:02d}{suffix}.png"
            if img_idx == 0:
                sec.image_path = img_path
            if img_path not in sec.image_paths:
                sec.image_paths.append(img_path)
        elif task_type == "outro_voice" and not is_err:
            script.outro_audio_path = outro_audio_path
            script.outro_duration = result
        elif task_type == "outro_image" and not is_err:
            script.outro_image_path = outro_image_path

    if errors:
        log(f"assets done with {len(errors)} error(s) — you can retry or upload manually")
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

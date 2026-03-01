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


async def generate_script(
    config: AppConfig, topic: str, num_sections: int,
    subtitles: list[str] | None = None,
) -> Script:
    """Step 1: Generate the listicle script via LLM."""
    log("step 1/4: generating script...")
    console.print("Step 1/4: Generating script...")
    llm: LLMProvider = _get_provider("llm", config.llm.provider, config.llm)
    script = await llm.generate_script(topic, num_sections, subtitles=subtitles)
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

    # Intro voice
    intro_audio_path = audio_dir / "intro.mp3"
    tasks.append(
        _generate_voice_for_section(
            voice, script.intro_narration, intro_audio_path, "Intro"
        )
    )

    # Section voices and images
    for section in script.sections:
        sec_audio = audio_dir / f"section_{section.number:02d}.mp3"
        sec_image = images_dir / f"section_{section.number:02d}.png"

        tasks.append(
            _generate_voice_for_section(
                voice, section.narration, sec_audio, f"Section {section.number}"
            )
        )
        tasks.append(
            _generate_image_for_section(
                image_gen,
                section.image_prompt,
                sec_image,
                f"Section {section.number}",
            )
        )

    # Outro voice
    outro_audio_path = audio_dir / "outro.mp3"
    tasks.append(
        _generate_voice_for_section(
            voice, script.outro_narration, outro_audio_path, "Outro"
        )
    )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Check for errors
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        for err in errors:
            log(f"asset error: {err}")
            console.print(f"Error: {err}")
        raise RuntimeError(f"{len(errors)} asset generation task(s) failed.")

    # Map results back to script
    idx = 0

    # Intro duration
    script.intro_audio_path = intro_audio_path
    script.intro_duration = results[idx]
    idx += 1

    # Sections
    for section in script.sections:
        section.audio_path = audio_dir / f"section_{section.number:02d}.mp3"
        section.duration = results[idx]
        idx += 1

        section.image_path = images_dir / f"section_{section.number:02d}.png"
        idx += 1  # skip image result (it's a Path)

    # Outro duration
    script.outro_audio_path = outro_audio_path
    script.outro_duration = results[idx]

    log("all assets generated")
    console.print("All assets generated.")
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
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(script.model_dump_json(indent=2))
    return script_path


def load_script(script_path: Path) -> Script:
    """Load a script from JSON."""
    with open(script_path, "r", encoding="utf-8") as f:
        data = json.load(f)
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

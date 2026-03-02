"""Async wrapper functions for background generation tasks."""
from __future__ import annotations

from pathlib import Path

from src.pipeline import (
    _create_run_dir,
    generate_assets,
    generate_script,
    regenerate_single_image,
    regenerate_section_images,
    assemble_video,
    save_script,
)


async def bg_gen_script(config, topic, num_sections, subs):
    """Generate script only."""
    script = await generate_script(config, topic, num_sections, subtitles=subs)
    run_dir = _create_run_dir()
    save_script(script, run_dir)
    return {"type": "gen_script", "script": script, "run_dir": run_dir}


async def bg_gen_assets(config, script, run_dir):
    """Generate voice + image assets."""
    script = await generate_assets(config, script, run_dir)
    save_script(script, run_dir)
    return {"type": "gen_assets", "script": script}


async def bg_full_pipeline(config, topic, num_sections, subs):
    """Full pipeline: script -> assets -> video."""
    script = await generate_script(config, topic, num_sections, subtitles=subs)
    run_dir = _create_run_dir()
    save_script(script, run_dir)
    script = await generate_assets(config, script, run_dir)
    save_script(script, run_dir)
    missing = [
        s for s in script.sections
        if not s.image_path or not Path(s.image_path).exists()
    ]
    if missing:
        return {
            "type": "full_pipeline",
            "script": script,
            "run_dir": run_dir,
            "stage": "assets_done",
            "missing": len(missing),
        }
    video_path = assemble_video(config, script, run_dir)
    return {
        "type": "full_pipeline",
        "script": script,
        "run_dir": run_dir,
        "stage": "video_done",
        "video_path": str(video_path),
    }


async def bg_retry_single(config, prompt, img_path):
    """Retry a single image (intro/outro)."""
    path = await regenerate_single_image(config, prompt, img_path)
    return {
        "type": "retry_single",
        "image_path": str(path),
    }


async def bg_retry_section(config, prompts, section_number, images_dir):
    """Retry all images for a single section."""
    paths = await regenerate_section_images(config, prompts, section_number, images_dir)
    return {
        "type": "retry_section",
        "section_number": section_number,
        "image_paths": [str(p) for p in paths],
    }


async def bg_assemble(config, script, run_dir):
    """Assemble/reassemble video from existing assets."""
    from src.pipeline import load_script as _load

    script_file = run_dir / "script.json"
    if script_file.exists():
        script = _load(script_file)
    video_path = assemble_video(config, script, run_dir)
    return {
        "type": "assemble",
        "script": script,
        "video_path": str(video_path),
    }

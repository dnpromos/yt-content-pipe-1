from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from src.models import AppConfig
from src.pipeline import (
    generate_script,
    run_assemble_only,
    run_full_pipeline,
    save_script,
    _create_run_dir,
)
from src.utils.config import load_config

app = typer.Typer(
    name="yt-content-pipe",
    help="YouTube listicle video generation pipeline.",
    add_completion=False,
)
console = Console()


def _load_cfg(config_path: str) -> AppConfig:
    try:
        return load_config(config_path)
    except FileNotFoundError:
        console.print(
            f"[red]Config file not found: {config_path}[/red]\n"
            f"Copy config.example.yaml to config.yaml and fill in your settings."
        )
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]Config error: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def generate(
    topic: str = typer.Option(..., "--topic", "-t", help="Video topic"),
    sections: int = typer.Option(5, "--sections", "-n", help="Number of sections"),
    config_path: str = typer.Option("config.yaml", "--config", "-c", help="Config file path"),
    output: str = typer.Option("output", "--output", "-o", help="Output base directory"),
):
    """Run the full pipeline: script → voice + images → video."""
    cfg = _load_cfg(config_path)
    console.print(f'[bold]Topic:[/bold] "{topic}"')
    console.print(f"[bold]Sections:[/bold] {sections}\n")

    try:
        video_path = asyncio.run(
            run_full_pipeline(cfg, topic, sections, Path(output))
        )
    except Exception as e:
        console.print(f"\n[bold red]Pipeline failed: {e}[/bold red]")
        raise typer.Exit(1)


@app.command()
def script(
    topic: str = typer.Option(..., "--topic", "-t", help="Video topic"),
    sections: int = typer.Option(5, "--sections", "-n", help="Number of sections"),
    config_path: str = typer.Option("config.yaml", "--config", "-c", help="Config file path"),
    output: str = typer.Option("output", "--output", "-o", help="Output base directory"),
):
    """Generate only the script (no voice/image/video)."""
    cfg = _load_cfg(config_path)
    console.print(f'[bold]Topic:[/bold] "{topic}"')
    console.print(f"[bold]Sections:[/bold] {sections}\n")

    try:
        result = asyncio.run(generate_script(cfg, topic, sections))
        run_dir = _create_run_dir(Path(output))
        script_path = save_script(result, run_dir)
        console.print(f"\n[bold green]Script saved: {script_path}[/bold green]")
    except Exception as e:
        console.print(f"\n[bold red]Script generation failed: {e}[/bold red]")
        raise typer.Exit(1)


@app.command()
def assemble(
    script_path: str = typer.Option(
        ..., "--script", "-s", help="Path to script.json from a previous run"
    ),
    config_path: str = typer.Option("config.yaml", "--config", "-c", help="Config file path"),
):
    """Re-assemble video from an existing script.json (skip LLM + asset generation)."""
    cfg = _load_cfg(config_path)
    path = Path(script_path)

    if not path.exists():
        console.print(f"[red]Script file not found: {path}[/red]")
        raise typer.Exit(1)

    try:
        video_path = asyncio.run(run_assemble_only(cfg, path))
    except Exception as e:
        console.print(f"\n[bold red]Assembly failed: {e}[/bold red]")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()

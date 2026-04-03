"""FastAPI backend wrapping the existing Python pipeline."""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Optional

# When running as a PyInstaller bundle (Tauri sidecar), the cwd is inside
# the read-only .app bundle.  Redirect to a writable user directory.
if getattr(sys, 'frozen', False):
    _data_dir = Path.home() / "Documents" / "clipmatic"
    _data_dir.mkdir(parents=True, exist_ok=True)
    os.chdir(_data_dir)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src.models import AppConfig, ProviderConfig, VideoConfig, Script
from src.providers.wiro_client import WiroClient
from src.pipeline import (
    _create_run_dir,
    _get_provider,
    generate_script,
    generate_voiceovers,
    generate_media,
    generate_assets,
    assemble_video,
    regenerate_single_image,
    regenerate_section_images,
    regenerate_section_videos,
    save_script,
    load_script,
)
from src import log as pipelog

app = FastAPI(title="yt-content-pipe")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# WebSocket manager — broadcasts logs to all connected clients
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        self.connections.remove(ws)

    async def broadcast(self, message: dict):
        for ws in self.connections[:]:
            try:
                await ws.send_json(message)
            except Exception:
                self.connections.remove(ws)

manager = ConnectionManager()

# Bridge pipeline logs → WebSocket
_loop: Optional[asyncio.AbstractEventLoop] = None

def _ws_log_callback(line: str):
    if _loop and manager.connections:
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({"type": "log", "message": line}),
            _loop,
        )

pipelog.clear_callbacks()
pipelog.add_callback(_ws_log_callback)

# ---------------------------------------------------------------------------
# In-memory task tracking
# ---------------------------------------------------------------------------
tasks: dict[str, dict] = {}
_active_pipeline_tasks: set[asyncio.Task] = set()

async def _broadcast_task(task_id: str, data: dict):
    await manager.broadcast({"type": "task", "task_id": task_id, **data})

@app.on_event("shutdown")
async def _on_shutdown():
    """Cancel all in-flight pipeline and Wiro tasks on server shutdown."""
    for task in _active_pipeline_tasks:
        task.cancel()
    _active_pipeline_tasks.clear()
    try:
        from src.providers.wiro_client import active_wiro_tasks
        active_wiro_tasks.clear()
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class ConfigRequest(BaseModel):
    wiro_api_key: str = ""
    wiro_api_secret: str = ""
    voice_provider: str = "elevenlabs"  # "elevenlabs" or "gemini"
    voice_id: str = "EXAVITQu4vr4xnSDxMaL"
    tts_model: str = "eleven_flash_v2_5"
    image_style: str = "cinematic realistic"
    image_resolution: str = "2K"
    image_aspect: str = "16:9"
    images_per_section: int = 1
    video_resolution: tuple[int, int] = (1280, 720)
    video_fps: int = 30
    video_transition: str = "crossfade"
    video_transition_duration: float = 0.8
    video_section_gap: float = 0.5
    video_ken_burns: bool = True
    video_preset: str = "ultrafast"
    section_media_type: str = "image"  # "image" or "video"
    video_gen_resolution: str = "720p"
    video_gen_fps: str = "24"
    video_gen_draft: str = "false"
    videos_per_section: int = 1
    video_gen_duration: int = 5
    intro_image_count: int = 1
    intro_video_count: int = 2
    captions_enabled: bool = True
    caption_font: str = "assets/fonts/Montserrat-Bold.ttf"
    caption_font_size: int = 0
    caption_text_color: str = "#FFFFFF"
    caption_active_color: str = "#FFFF32"
    caption_bg_color: str = "#000000"
    caption_bg_opacity: int = 160
    caption_uppercase: bool = True
    caption_position: int = 75
    video_length: str = "medium"  # "short" | "medium" | "long"
    script_format: str = "listicle"

class GenerateScriptRequest(BaseModel):
    config: ConfigRequest
    topic: str
    num_sections: int = 5
    subtitles: list[str] | None = None
    custom_instructions: str = ""

class GenerateAssetsRequest(BaseModel):
    config: ConfigRequest
    run_id: str
    force_images: bool = False

class AssembleRequest(BaseModel):
    config: ConfigRequest
    run_id: str

class RetryMissingRequest(BaseModel):
    config: ConfigRequest
    run_id: str

class RetrySectionRequest(BaseModel):
    config: ConfigRequest
    run_id: str
    section_number: int

class RetryImageRequest(BaseModel):
    config: ConfigRequest
    run_id: str
    prompt: str
    image_path: str

class GenerateExtraImagesRequest(BaseModel):
    config: ConfigRequest
    run_id: str
    section_number: int
    prompt: str = ""
    count: int = 1

class RegenerateSpecialImageRequest(BaseModel):
    config: ConfigRequest
    run_id: str
    kind: str  # "intro" or "outro"
    prompt: str = ""

class GenerateTocImageRequest(BaseModel):
    config: ConfigRequest
    run_id: str

class UpdateSectionImagesRequest(BaseModel):
    run_id: str
    section_number: int
    image_paths: list[str]

class DeleteImageRequest(BaseModel):
    run_id: str
    image_path: str

class DeleteVideoRequest(BaseModel):
    run_id: str
    video_path: str

class RegenerateSectionVideoRequest(BaseModel):
    config: ConfigRequest
    run_id: str
    section_number: int

class UpdateSectionVideosRequest(BaseModel):
    run_id: str
    section_number: int
    video_paths: list[str]

class TopicIdeasRequest(BaseModel):
    config: ConfigRequest
    script_format: str = "listicle"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _build_config(req: ConfigRequest) -> AppConfig:
    if req.wiro_api_key:
        os.environ["WIRO_API_KEY"] = req.wiro_api_key
    if req.wiro_api_secret:
        os.environ["WIRO_API_SECRET"] = req.wiro_api_secret

    wiro_extra = {"api_secret_env": "WIRO_API_SECRET"}

    return AppConfig(
        llm=ProviderConfig(provider="wiro", api_key_env="WIRO_API_KEY", extra=wiro_extra),
        voice=ProviderConfig(
            provider="wiro_gemini" if req.voice_provider == "gemini" else "wiro",
            voice_id=req.voice_id,
            api_key_env="WIRO_API_KEY",
            extra={**wiro_extra, "tts_model": req.tts_model, "output_format": "mp3_44100_128"},
        ),
        image=ProviderConfig(
            provider="wiro",
            api_key_env="WIRO_API_KEY",
            extra={
                **wiro_extra,
                "image_style": req.image_style,
                "aspect_ratio": req.image_aspect,
                "resolution": req.image_resolution,
                "safety_setting": "OFF",
            },
        ),
        video_gen=ProviderConfig(
            provider="wiro",
            api_key_env="WIRO_API_KEY",
            extra={
                **wiro_extra,
                "video_ratio": req.image_aspect,
                "video_gen_resolution": req.video_gen_resolution,
                "video_gen_fps": req.video_gen_fps,
                "video_draft": req.video_gen_draft,
            },
        ) if req.section_media_type == "video" else None,
        video=VideoConfig(
            resolution=req.video_resolution,
            fps=req.video_fps,
            transition=req.video_transition,
            transition_duration=req.video_transition_duration,
            section_gap=req.video_section_gap,
            ken_burns=req.video_ken_burns,
            encoding_preset=req.video_preset,
            images_per_section=req.images_per_section,
            section_media_type=req.section_media_type,
            videos_per_section=req.videos_per_section,
            video_gen_duration=req.video_gen_duration,
            intro_image_count=req.intro_image_count,
            intro_video_count=req.intro_video_count,
            captions_enabled=req.captions_enabled,
            caption_font=req.caption_font,
            caption_font_size=req.caption_font_size,
            caption_text_color=req.caption_text_color,
            caption_active_color=req.caption_active_color,
            caption_bg_color=req.caption_bg_color,
            caption_bg_opacity=req.caption_bg_opacity,
            caption_uppercase=req.caption_uppercase,
            caption_position=req.caption_position,
        ),
    )

def _script_to_dict(script: Script) -> dict:
    data = json.loads(script.model_dump_json())
    return data

def _get_run_dir(run_id: str) -> Path:
    return Path("output") / run_id

def _save_run_config(run_dir: Path, config: ConfigRequest):
    """Save UI config (excluding secrets) alongside the run."""
    data = config.model_dump(exclude={"wiro_api_key", "wiro_api_secret"})
    with open(run_dir / "config.json", "w") as f:
        json.dump(data, f, indent=2)

def _load_run_config(run_dir: Path) -> dict | None:
    """Load saved UI config for a run, or None if not found."""
    cfg_file = run_dir / "config.json"
    if not cfg_file.exists():
        return None
    try:
        with open(cfg_file) as f:
            return json.load(f)
    except Exception:
        return None

# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    global _loop
    _loop = asyncio.get_event_loop()
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)

# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/runs")
async def list_runs():
    output = Path("output")
    if not output.exists():
        return {"runs": []}
    runs = []
    for d in sorted(output.iterdir(), reverse=True):
        if d.is_dir() and d.name.startswith("run_"):
            script_file = d / "script.json"
            title = d.name
            if script_file.exists():
                try:
                    with open(script_file) as f:
                        data = json.load(f)
                    title = data.get("title", d.name)
                except Exception:
                    pass
            runs.append({"id": d.name, "title": title})
    return {"runs": runs}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    run_dir = _get_run_dir(run_id)
    script_file = run_dir / "script.json"
    if not script_file.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    script = load_script(script_file)
    config_data = _load_run_config(run_dir)
    return {"script": _script_to_dict(script), "run_id": run_id, "config": config_data}


class SaveScriptRequest(BaseModel):
    run_id: str
    script: dict

@app.post("/api/save-script")
async def api_save_script(req: SaveScriptRequest):
    run_dir = _get_run_dir(req.run_id)
    script_file = run_dir / "script.json"
    if not run_dir.exists():
        return {"error": "Run not found"}
    with open(script_file, "w") as f:
        json.dump(req.script, f, indent=2, default=str)
    return {"ok": True}


CONFIG_FILE = Path("ui_config.json")

@app.get("/api/config")
async def get_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {}

@app.post("/api/config")
async def save_config(data: dict):
    with open(CONFIG_FILE, "w") as f:
        json.dump(data, f, indent=2)
    return {"ok": True}


@app.post("/api/kill-all")
async def kill_all_tasks():
    """Cancel every active Wiro task and broadcast a reset."""
    from src.providers.wiro_client import WiroClient, active_wiro_tasks

    count = len(active_wiro_tasks)
    if count == 0:
        await manager.broadcast({"type": "log", "message": "No active tasks to kill."})
        return {"ok": True, "cancelled": 0}

    await manager.broadcast({"type": "log", "message": f"Killing {count} active task(s)..."})

    api_key = os.environ.get("WIRO_API_KEY", "")
    api_secret = os.environ.get("WIRO_API_SECRET", "")
    if api_key and api_secret:
        from src.models import ProviderConfig
        config = ProviderConfig(
            provider="wiro", api_key_env="WIRO_API_KEY",
            extra={"api_secret_env": "WIRO_API_SECRET"},
        )
        client = WiroClient(config)
        cancelled = await client.cancel_all()
    else:
        active_wiro_tasks.clear()
        cancelled = 0

    await manager.broadcast({"type": "kill-all", "cancelled": cancelled})
    await manager.broadcast({"type": "log", "message": f"Killed {cancelled}/{count} task(s)."})
    return {"ok": True, "cancelled": cancelled}


@app.get("/api/files/{file_path:path}")
async def serve_file(file_path: str):
    output_dir = Path("output").resolve()
    full_path = Path(file_path).resolve()
    if not str(full_path).startswith(str(output_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path)


@app.post("/api/topic-ideas")
async def api_topic_ideas(req: TopicIdeasRequest):
    """Generate topic ideas based on script format using Gemini."""
    if req.config.wiro_api_key:
        os.environ["WIRO_API_KEY"] = req.config.wiro_api_key
    if req.config.wiro_api_secret:
        os.environ["WIRO_API_SECRET"] = req.config.wiro_api_secret

    from src.providers.format_prompts import FORMATS
    fmt = FORMATS.get(req.script_format, FORMATS["listicle"])
    label = fmt["label"]

    prompt = (
        f"Generate 8 creative, trending, and highly clickable YouTube video topic ideas "
        f"for the \"{label}\" format.\n\n"
        f"Format description: {fmt['system_prompt'].split(chr(10))[0]}\n\n"
        f"Rules:\n"
        f"- Each topic must be a short, catchy title (max 10 words)\n"
        f"- Topics should be diverse within the format\n"
        f"- Topics should be trending, interesting, or evergreen\n"
        f"- Output ONLY a JSON array of strings, nothing else\n\n"
        f'Example: ["Topic One", "Topic Two", ...]'
    )

    wiro_config = ProviderConfig(
        provider="wiro", api_key_env="WIRO_API_KEY",
        extra={"api_secret_env": "WIRO_API_SECRET"},
    )
    client = WiroClient(wiro_config)
    run_url = "https://api.wiro.ai/v1/Run/google/gemini-3-flash"
    task = await client.run_and_poll(run_url, {
        "prompt": prompt,
        "systemInstructions": "You are a YouTube content strategist. Output ONLY valid JSON arrays, nothing else.",
        "thinkingLevel": "low",
    })

    # Extract text from Wiro Gemini response
    text = ""
    outputs = task.get("outputs", [])
    if outputs:
        content = outputs[0].get("content", {})
        # Try 'raw' field first, then join 'answer' list
        text = content.get("raw", "") or ""
        if not text.strip():
            answer = content.get("answer", [])
            if answer:
                text = "\n".join(a for a in answer if a)
    # Fallback: output file URLs
    if not text.strip():
        urls = WiroClient.get_output_urls(task)
        if urls:
            async with httpx.AsyncClient(timeout=30.0) as http:
                resp = await http.get(urls[0])
                resp.raise_for_status()
                text = resp.text
    # Fallback: debugoutput
    if not text.strip():
        text = task.get("debugoutput", "") or ""

    if not text.strip():
        raise HTTPException(status_code=500, detail="Empty response from LLM")

    text = text.strip()
    text = re.sub(r"```(?:json)?\s*", "", text)
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise HTTPException(status_code=500, detail="Invalid response from LLM")
    ideas = json.loads(text[start:end+1])
    return {"ideas": ideas}


class VoicePreviewRequest(BaseModel):
    config: ConfigRequest
    voice_provider: str = "elevenlabs"  # "elevenlabs" or "gemini"
    voice_id: str = ""  # ElevenLabs voice ID or Gemini voice name
    voice_name: str = ""  # Human-readable name for the file

@app.post("/api/generate-voice-preview")
async def api_generate_voice_preview(req: VoicePreviewRequest):
    """Generate a short TTS preview clip and save to web/public/voices/."""
    if req.config.wiro_api_key:
        os.environ["WIRO_API_KEY"] = req.config.wiro_api_key
    if req.config.wiro_api_secret:
        os.environ["WIRO_API_SECRET"] = req.config.wiro_api_secret

    wiro_config = ProviderConfig(
        provider="wiro", api_key_env="WIRO_API_KEY",
        extra={"api_secret_env": "WIRO_API_SECRET"},
    )
    client = WiroClient(wiro_config)

    preview_text = "Hey there! This is a quick voice preview so you can hear what I sound like. Pretty cool, right?"
    name_lower = req.voice_name.lower().replace(" ", "_")

    if req.voice_provider == "gemini":
        out_dir = BASE_DIR / "web" / "public" / "voices" / "gemini"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{name_lower}.mp3"
        if out_file.exists():
            return {"path": f"/voices/gemini/{name_lower}.mp3", "exists": True}

        run_url = "https://api.wiro.ai/v1/Run/google/gemini-2-5-tts"
        task = await client.run_and_poll(run_url, {"prompt": preview_text, "voice": req.voice_id})
    else:
        out_dir = BASE_DIR / "web" / "public" / "voices"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{name_lower}.mp3"
        if out_file.exists():
            return {"path": f"/voices/{name_lower}.mp3", "exists": True}

        run_url = "https://api.wiro.ai/v1/Run/elevenlabs/text-to-speech"
        task = await client.run_and_poll(run_url, {
            "prompt": preview_text, "model": "eleven_flash_v2_5",
            "voice": req.voice_id, "outputFormat": "mp3_44100_128",
        })

    urls = WiroClient.get_output_urls(task)
    if not urls:
        raise HTTPException(status_code=500, detail="No audio output from TTS task")

    async with httpx.AsyncClient(timeout=60.0) as http:
        resp = await http.get(urls[0])
        resp.raise_for_status()

    with open(out_file, "wb") as f:
        f.write(resp.content)

    rel_path = f"/voices/gemini/{name_lower}.mp3" if req.voice_provider == "gemini" else f"/voices/{name_lower}.mp3"
    return {"path": rel_path, "exists": False}


@app.post("/api/generate-script")
async def api_generate_script(req: GenerateScriptRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "script"})
            script = await generate_script(
                config, req.topic, req.num_sections,
                subtitles=req.subtitles,
                custom_instructions=req.custom_instructions,
                video_length=req.config.video_length,
                script_format=req.config.script_format,
            )
            run_dir = _create_run_dir()
            save_script(script, run_dir)
            _save_run_config(run_dir, req.config)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "script",
                "run_id": run_dir.name,
                "script": _script_to_dict(script),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "script", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/generate-voiceovers")
async def api_generate_voiceovers(req: GenerateAssetsRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")

    async def _on_progress(updated: Script):
        save_script(updated, run_dir)
        await _broadcast_task(task_id, {
            "status": "progress",
            "step": "voiceovers",
            "run_id": req.run_id,
            "script": _script_to_dict(updated),
        })

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "voiceovers"})
            updated = await generate_voiceovers(config, script, run_dir, on_progress=_on_progress)
            save_script(updated, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "voiceovers",
                "run_id": req.run_id,
                "script": _script_to_dict(updated),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "voiceovers", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/generate-media")
async def api_generate_media(req: GenerateAssetsRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")

    async def _on_progress(updated: Script):
        save_script(updated, run_dir)
        await _broadcast_task(task_id, {
            "status": "progress",
            "step": "media",
            "run_id": req.run_id,
            "script": _script_to_dict(updated),
        })

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "media"})
            updated = await generate_media(config, script, run_dir, force=req.force_images, on_progress=_on_progress)
            save_script(updated, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "media",
                "run_id": req.run_id,
                "script": _script_to_dict(updated),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "media", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/generate-assets")
async def api_generate_assets(req: GenerateAssetsRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")

    async def _on_asset_progress(updated: Script):
        save_script(updated, run_dir)
        await _broadcast_task(task_id, {
            "status": "progress",
            "step": "assets",
            "run_id": req.run_id,
            "script": _script_to_dict(updated),
        })

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "assets"})
            updated = await generate_assets(config, script, run_dir, force_images=req.force_images, on_progress=_on_asset_progress)
            save_script(updated, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "assets",
                "run_id": req.run_id,
                "script": _script_to_dict(updated),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "assets", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/assemble-video")
async def api_assemble_video(req: AssembleRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "video"})
            loop = asyncio.get_event_loop()
            video_path = await loop.run_in_executor(None, assemble_video, config, script, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "video",
                "run_id": req.run_id,
                "video_path": str(video_path),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "video", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/full-pipeline")
async def api_full_pipeline(req: GenerateScriptRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "script"})
            script = await generate_script(
                config, req.topic, req.num_sections,
                subtitles=req.subtitles,
                custom_instructions=req.custom_instructions,
                video_length=req.config.video_length,
                script_format=req.config.script_format,
            )
            run_dir = _create_run_dir()
            save_script(script, run_dir)
            _save_run_config(run_dir, req.config)
            await _broadcast_task(task_id, {
                "status": "running",
                "step": "assets",
                "run_id": run_dir.name,
                "script": _script_to_dict(script),
            })

            async def _on_asset_progress(updated: Script):
                save_script(updated, run_dir)
                await _broadcast_task(task_id, {
                    "status": "progress",
                    "step": "assets",
                    "run_id": run_dir.name,
                    "script": _script_to_dict(updated),
                })

            script = await generate_assets(config, script, run_dir, on_progress=_on_asset_progress)
            save_script(script, run_dir)

            missing = [
                s for s in script.sections
                if not s.image_path or not Path(str(s.image_path)).exists()
            ]
            if missing:
                await _broadcast_task(task_id, {
                    "status": "done",
                    "step": "assets",
                    "run_id": run_dir.name,
                    "script": _script_to_dict(script),
                    "missing": len(missing),
                })
                return

            await _broadcast_task(task_id, {"status": "running", "step": "video"})
            loop = asyncio.get_event_loop()
            video_path = await loop.run_in_executor(None, assemble_video, config, script, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "video",
                "run_id": run_dir.name,
                "script": _script_to_dict(script),
                "video_path": str(video_path),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "assets", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/retry-missing")
async def api_retry_missing(req: RetryMissingRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")

    async def _on_retry_progress(updated: Script):
        save_script(updated, run_dir)
        await _broadcast_task(task_id, {
            "status": "progress",
            "step": "retry",
            "run_id": req.run_id,
            "script": _script_to_dict(updated),
        })

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "retry"})
            updated = await generate_assets(config, script, run_dir, on_progress=_on_retry_progress)
            save_script(updated, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "retry",
                "run_id": req.run_id,
                "script": _script_to_dict(updated),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "retry", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/retry-section")
async def api_retry_section(req: RetrySectionRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == req.section_number), None)
    if not section:
        return {"error": "Section not found"}

    prompts = section.image_prompts if section.image_prompts else [section.image_prompt]
    images_dir = run_dir / "images"

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "retry_section"})
            paths = await regenerate_section_images(config, prompts, req.section_number, images_dir)
            section.image_paths = [p for p in paths if p.exists()]
            if section.image_paths:
                section.image_path = section.image_paths[0]
            save_script(script, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "retry_section",
                "run_id": req.run_id,
                "section_number": req.section_number,
                "image_paths": [str(p) for p in section.image_paths],
                "script": _script_to_dict(script),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "retry_section", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/generate-extra-images")
async def api_generate_extra_images(req: GenerateExtraImagesRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == req.section_number), None)
    if not section:
        return {"error": "Section not found"}

    images_dir = run_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    prompt = req.prompt.strip() or (section.image_prompts[0] if section.image_prompts else section.image_prompt)
    existing = list(images_dir.glob(f"section_{req.section_number:02d}*.png"))
    start_idx = len(existing)

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "extra_images"})
            image_gen = _get_provider("image", config.image.provider, config.image)
            new_paths = []
            tasks = []
            for i in range(req.count):
                idx = start_idx + i
                suffix = f"_{chr(97 + idx)}" if idx > 0 else ""
                img_path = images_dir / f"section_{req.section_number:02d}{suffix}.png"
                new_paths.append(img_path)
                tasks.append(
                    _generate_image_extra(image_gen, prompt, img_path, f"Section {req.section_number} extra {i+1}")
                )
            await asyncio.gather(*tasks)
            generated = [p for p in new_paths if p.exists()]
            for p in generated:
                if p not in section.image_paths:
                    section.image_paths.append(p)
            if not section.image_path and section.image_paths:
                section.image_path = section.image_paths[0]
            save_script(script, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "extra_images",
                "run_id": req.run_id,
                "script": _script_to_dict(script),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "extra_images", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


async def _generate_image_extra(image_gen, prompt, output_path, label):
    from src.log import emit as log
    log(f"image start: {label}")
    path = await image_gen.generate_image(prompt, output_path)
    log(f"image done: {label}")
    return path


@app.post("/api/update-section-images")
async def api_update_section_images(req: UpdateSectionImagesRequest):
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == req.section_number), None)
    if not section:
        return {"error": "Section not found"}
    section.image_paths = [Path(p) for p in req.image_paths]
    section.image_path = section.image_paths[0] if section.image_paths else None
    save_script(script, run_dir)
    return {"ok": True, "script": _script_to_dict(script)}


class UpdateIntroImagesRequest(BaseModel):
    run_id: str
    image_paths: list[str]

@app.post("/api/update-intro-images")
async def api_update_intro_images(req: UpdateIntroImagesRequest):
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    all_paths = [Path(p) for p in req.image_paths]
    script.intro_image_path = all_paths[0] if all_paths else None
    script.intro_image_paths = all_paths[1:] if len(all_paths) > 1 else []
    save_script(script, run_dir)
    return {"ok": True, "script": _script_to_dict(script)}


@app.post("/api/delete-image")
async def api_delete_image(req: DeleteImageRequest):
    run_dir = _get_run_dir(req.run_id)
    img_path = Path(req.image_path)
    # Paths from frontend are already relative to project root (e.g. "output/run_xxx/images/intro.png")
    img_str = str(img_path.resolve())
    if img_path.exists():
        img_path.unlink()
    script = load_script(run_dir / "script.json")
    for section in script.sections:
        section.image_paths = [p for p in section.image_paths if str(Path(str(p)).resolve()) != img_str]
        if section.image_path and str(Path(str(section.image_path)).resolve()) == img_str:
            section.image_path = section.image_paths[0] if section.image_paths else None
    if script.intro_image_path and str(Path(str(script.intro_image_path)).resolve()) == img_str:
        script.intro_image_path = None
    script.intro_image_paths = [
        p for p in (script.intro_image_paths or [])
        if str(Path(str(p)).resolve()) != img_str
    ]
    # Promote next intro image as primary if primary was deleted
    if not script.intro_image_path and script.intro_image_paths:
        script.intro_image_path = script.intro_image_paths.pop(0)
    if script.outro_image_path and str(Path(str(script.outro_image_path)).resolve()) == img_str:
        script.outro_image_path = None
    save_script(script, run_dir)
    return {"ok": True, "script": _script_to_dict(script)}


@app.post("/api/delete-video")
async def api_delete_video(req: DeleteVideoRequest):
    run_dir = _get_run_dir(req.run_id)
    # Paths from frontend are relative to project root (e.g. "output/run_xxx/videos/clip.mp4")
    vid_path = Path(req.video_path)
    vid_str = str(vid_path.resolve())
    if vid_path.exists():
        vid_path.unlink()
    script = load_script(run_dir / "script.json")
    for section in script.sections:
        section.video_paths = [p for p in section.video_paths if str(Path(str(p)).resolve()) != vid_str]
        if section.video_path and str(Path(str(section.video_path)).resolve()) == vid_str:
            section.video_path = section.video_paths[0] if section.video_paths else None
    script.intro_video_paths = [
        p for p in (script.intro_video_paths or [])
        if str(Path(str(p)).resolve()) != vid_str
    ]
    save_script(script, run_dir)
    return {"ok": True, "script": _script_to_dict(script)}


@app.post("/api/update-section-videos")
async def api_update_section_videos(req: UpdateSectionVideosRequest):
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == req.section_number), None)
    if not section:
        return {"error": "Section not found"}
    section.video_paths = [Path(p) for p in req.video_paths]
    section.video_path = section.video_paths[0] if section.video_paths else None
    save_script(script, run_dir)
    return {"ok": True, "script": _script_to_dict(script)}


@app.post("/api/add-section-video")
async def api_add_section_video(req: RegenerateSectionVideoRequest):
    """Generate one extra video clip and APPEND to existing section.video_paths."""
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == req.section_number), None)
    if not section:
        return {"error": "Section not found"}

    prompt = section.video_prompt or (section.image_prompts[0] if section.image_prompts else section.heading)
    videos_dir = run_dir / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    existing = list(videos_dir.glob(f"section_{req.section_number:02d}*.mp4"))
    idx = len(existing)
    suffix = f"_{chr(97 + idx)}" if idx > 0 else ""
    vid_path = videos_dir / f"section_{req.section_number:02d}{suffix}.mp4"

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "retry_section"})
            video_gen = _get_provider("video_gen", config.video_gen.provider, config.video_gen)
            await video_gen.generate_video(prompt, vid_path, duration=config.video.video_gen_duration)
            if vid_path.exists():
                if vid_path not in section.video_paths:
                    section.video_paths.append(vid_path)
                if not section.video_path:
                    section.video_path = vid_path
            save_script(script, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "retry_section",
                "run_id": req.run_id,
                "script": _script_to_dict(script),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "retry_section", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/regenerate-section-video")
async def api_regenerate_section_video(req: RegenerateSectionVideoRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == req.section_number), None)
    if not section:
        return {"error": "Section not found"}

    # Build prompts: use video_prompt if available, fall back to image_prompts or heading
    vps = config.video.videos_per_section
    if section.video_prompt:
        prompts = [section.video_prompt] * vps
    elif section.image_prompts:
        prompts = (section.image_prompts * ((vps // len(section.image_prompts)) + 1))[:vps]
    else:
        prompts = [section.heading] * vps

    videos_dir = run_dir / "videos"

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "retry_section"})
            paths = await regenerate_section_videos(config, prompts, req.section_number, videos_dir)
            section.video_paths = paths
            section.video_path = paths[0] if paths else None
            save_script(script, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "retry_section",
                "run_id": req.run_id,
                "section_number": req.section_number,
                "script": _script_to_dict(script),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "retry_section", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/upload-image")
async def api_upload_image(
    run_id: str = Form(...),
    section_number: int = Form(...),
    file: UploadFile = File(...),
):
    run_dir = _get_run_dir(run_id)
    images_dir = run_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    existing = list(images_dir.glob(f"section_{section_number:02d}*.png"))
    idx = len(existing)
    suffix = f"_{chr(97 + idx)}" if idx > 0 else ""
    img_path = images_dir / f"section_{section_number:02d}{suffix}.png"
    content = await file.read()
    with open(img_path, "wb") as f:
        f.write(content)
    script = load_script(run_dir / "script.json")
    section = next((s for s in script.sections if s.number == section_number), None)
    if section:
        if img_path not in section.image_paths:
            section.image_paths.append(img_path)
        if not section.image_path:
            section.image_path = img_path
        save_script(script, run_dir)
    return {"ok": True, "image_path": str(img_path), "script": _script_to_dict(script)}


@app.post("/api/regenerate-special-image")
async def api_regenerate_special_image(req: RegenerateSpecialImageRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    images_dir = run_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    if req.kind == "intro":
        prompt = req.prompt.strip() or script.intro_image_prompt or ""
        base_name = "intro"
    else:
        prompt = req.prompt.strip() or script.outro_image_prompt or ""
        base_name = "outro"

    if not prompt:
        return {"error": "No prompt available"}

    # Determine a unique filename: if primary already exists, use next suffix
    primary_path = images_dir / f"{base_name}.png"
    if primary_path.exists() and req.kind == "intro":
        suffixes = ["_b", "_c", "_d", "_e", "_f", "_g", "_h"]
        img_path = primary_path  # fallback
        for s in suffixes:
            candidate = images_dir / f"{base_name}{s}.png"
            if not candidate.exists():
                img_path = candidate
                break
    else:
        img_path = primary_path

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "extra_images"})
            image_gen = _get_provider("image", config.image.provider, config.image)
            await _generate_image_extra(image_gen, prompt, img_path, f"{req.kind.title()} image")
            script_fresh = load_script(run_dir / "script.json")
            if req.kind == "intro":
                if not script_fresh.intro_image_path or not Path(str(script_fresh.intro_image_path)).exists():
                    script_fresh.intro_image_path = img_path
                existing = {str(p) for p in script_fresh.intro_image_paths}
                if str(img_path) not in existing:
                    script_fresh.intro_image_paths.append(img_path)
            else:
                script_fresh.outro_image_path = img_path
            save_script(script_fresh, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "extra_images",
                "run_id": req.run_id,
                "script": _script_to_dict(script_fresh),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "extra_images", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


@app.post("/api/upload-special-image")
async def api_upload_special_image(
    run_id: str = Form(...),
    kind: str = Form(...),
    file: UploadFile = File(...),
):
    run_dir = _get_run_dir(run_id)
    images_dir = run_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # Determine a unique filename for intro uploads
    primary_path = images_dir / f"{kind}.png"
    if primary_path.exists() and kind == "intro":
        suffixes = ["_b", "_c", "_d", "_e", "_f", "_g", "_h"]
        img_path = primary_path  # fallback
        for s in suffixes:
            candidate = images_dir / f"{kind}{s}.png"
            if not candidate.exists():
                img_path = candidate
                break
    else:
        img_path = primary_path

    content = await file.read()
    with open(img_path, "wb") as f:
        f.write(content)
    script = load_script(run_dir / "script.json")
    if kind == "intro":
        if not script.intro_image_path or not Path(str(script.intro_image_path)).exists():
            script.intro_image_path = img_path
        existing = {str(p) for p in script.intro_image_paths}
        if str(img_path) not in existing:
            script.intro_image_paths.append(img_path)
    else:
        script.outro_image_path = img_path
    save_script(script, run_dir)
    return {"ok": True, "script": _script_to_dict(script)}


@app.post("/api/generate-toc-image")
async def api_generate_toc_image(req: GenerateTocImageRequest):
    task_id = str(uuid.uuid4())[:8]
    config = _build_config(req.config)
    run_dir = _get_run_dir(req.run_id)
    script = load_script(run_dir / "script.json")
    images_dir = run_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    img_path = images_dir / "intro_toc.png"

    titles_list = "\n".join(f"{s.number}. {s.heading}" for s in script.sections)
    prompt = (
        f"A dark chalkboard background with elegant chalk-style handwritten text listing these topics:\n"
        f"{titles_list}\n\n"
        f"Title at top: \"{script.title}\"\n"
        f"Style: realistic chalkboard with chalk dust, slightly messy handwriting, "
        f"warm classroom lighting, green or dark slate chalkboard, numbered list clearly readable, "
        f"cinematic 16:9 composition, high detail"
    )

    async def _run():
        try:
            await _broadcast_task(task_id, {"status": "running", "step": "extra_images"})
            image_gen = _get_provider("image", config.image.provider, config.image)
            await _generate_image_extra(image_gen, prompt, img_path, "TOC chalkboard")
            script_fresh = load_script(run_dir / "script.json")
            if img_path not in script_fresh.intro_image_paths:
                script_fresh.intro_image_paths.append(img_path)
            save_script(script_fresh, run_dir)
            await _broadcast_task(task_id, {
                "status": "done",
                "step": "extra_images",
                "run_id": req.run_id,
                "script": _script_to_dict(script_fresh),
            })
        except Exception as e:
            await _broadcast_task(task_id, {"status": "error", "step": "extra_images", "error": str(e)})

    t = asyncio.create_task(_run())
    _active_pipeline_tasks.add(t)
    t.add_done_callback(_active_pipeline_tasks.discard)
    return {"task_id": task_id}


if __name__ == "__main__":
    import socket
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    # Check if port is available before starting uvicorn
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            print(f"ERROR: port {port} is already in use. "
                  f"Kill the other process or set PORT env var.",
                  file=sys.stderr)
            sys.exit(1)
    uvicorn.run(app, host="0.0.0.0", port=port)

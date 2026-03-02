from __future__ import annotations

import asyncio
import json
import os
import platform
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image as PILImage
import streamlit as st

load_dotenv()

import src.log as pipelog
from src.bg_task import start_task
from src.bg_wrappers import bg_gen_script, bg_gen_assets, bg_full_pipeline, bg_assemble, bg_retry_section
from src.models import AppConfig, ProviderConfig, Script, Section, VideoConfig
from src.pipeline import (
    _create_run_dir,
    generate_assets,
    generate_script,
    regenerate_single_image,
    assemble_video,
    load_script,
    save_script,
)

# -- Voices lookup for Wiro/ElevenLabs --
VOICE_OPTIONS = {
    "Rachel": "21m00Tcm4TlvDq8ikWAM",
    "Drew": "29vD33N1CtxCmqQRPOHJ",
    "Clyde": "2EiwWnXFnvU5JabPnv8n",
    "Paul": "5Q0t7uMcjvnagumLfvZi",
    "Aria": "9BWtsMINqrJLrRacOk9x",
    "Domi": "AZnzlk1XvdvUeBnXmlld",
    "Dave": "CYw3kZ02Hs0563khs1Fj",
    "Roger": "CwhRBWXzGAHq8TQ4Fs17",
    "Fin": "D38z5RcWu1voky8WS1ja",
    "Sarah": "EXAVITQu4vr4xnSDxMaL",
    "Antoni": "ErXwobaYiN019PkySvjV",
    "Laura": "FGY2WhTYpPnrIDTdsKH5",
    "Thomas": "GBv7mTt0atIp3Br8iCZE",
    "Charlie": "IKne3meq5aSn9XLyUdCD",
    "George": "JBFqnCBsd6RMkjVDRZzb",
    "Emily": "LcfcDJNUP1GQjkzn1xUU",
    "Elli": "MF3mGyEYCl7XYWbV9V6O",
    "Callum": "N2lVS1w4EtoT3dr4eOWO",
    "Patrick": "ODq5zmih8GrVes37Dizd",
    "River": "SAz9YHcvj6GT2YYXdXww",
}

st.set_page_config(
    page_title="yt-content-pipe",
    page_icon=None,
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

    html, body, p, input, textarea, select, button, label, a,
    h1, h2, h3, h4, h5, h6, li, td, th, code, pre,
    [data-testid="stMarkdownContainer"],
    [data-testid="stText"],
    .stTextInput, .stTextArea, .stSelectbox {
        font-family: 'JetBrains Mono', 'Courier New', monospace !important;
    }

    .block-container { padding-top: 1.5rem; }

    h1, h2, h3, h4, h5, h6 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 500 !important;
        letter-spacing: -0.02em;
    }

    /* Tighter vertical spacing */
    [data-testid="stVerticalBlock"] { gap: 0.75rem !important; }

    /* Muted label style */
    .label { color: #666; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }

    /* Section divider */
    .sep { border-top: 1px solid #1e1e1e; margin: 1rem 0; }

    /* Step indicator */
    .step {
        display: inline-block;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 0.65rem;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 8px;
    }
    .step.done { border-color: #333; color: #4a4; }

    /* Metric */
    .metric {
        background: #111;
        border: 1px solid #1e1e1e;
        border-radius: 4px;
        padding: 12px;
        text-align: center;
    }
    .metric .val { font-size: 1.2rem; color: #ccc; font-weight: 600; }
    .metric .lbl { font-size: 0.6rem; color: #555; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }

    /* Kill all Streamlit rerun animations */
    .stApp * {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
    }

    /* Hide streamlit branding, deploy, toolbar */
    #MainMenu, footer, header, [data-testid="stToolbar"],
    [data-testid="stDecoration"], [data-testid="stStatusWidget"],
    .stDeployButton { display: none !important; }

    /* Sidebar tweaks */
    section[data-testid="stSidebar"] {
        background: #0d0d0d;
        border-right: 1px solid #1a1a1a;
    }
    section[data-testid="stSidebar"] .block-container { padding-top: 1rem; }

    /* Button style */
    .stButton > button {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.8rem !important;
        letter-spacing: 0.02em;
        border-radius: 4px !important;
        border: 1px solid #333 !important;
        transition: all 0.15s ease;
    }
    .stButton > button:hover {
        border-color: #555 !important;
        background: #1a1a1a !important;
    }
    .stButton > button[kind="primary"] {
        background: #1a1a1a !important;
        color: #ccc !important;
        border-color: #444 !important;
    }
    .stButton > button[kind="primary"]:hover {
        background: #252525 !important;
        border-color: #666 !important;
    }

    /* Input fields */
    .stTextInput input, .stTextArea textarea, .stSelectbox select {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.85rem !important;
        background: #111 !important;
        border: 1px solid #222 !important;
        border-radius: 4px !important;
    }

    /* Expander */
    div[data-testid="stExpander"] {
        border: 1px solid #1a1a1a;
        border-radius: 4px;
        background: #0d0d0d;
    }

    /* Progress bar */
    .stProgress > div > div > div { background: #555 !important; }

    /* Log panel */
    .log-panel {
        position: sticky;
        top: 3.5rem;
        height: 80vh;
        overflow-y: auto;
        background: #0a0a0a;
        border: 1px solid #1a1a1a;
        border-radius: 4px;
        padding: 0.75rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        line-height: 1.5;
        color: #888;
        white-space: pre-wrap;
        word-break: break-word;
    }
</style>
""",
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------
for key, val in {
    "config": None,
    "script": None,
    "run_dir": None,
    "stage": "idle",
    "logs": [],
    "task": None,
}.items():
    if key not in st.session_state:
        st.session_state[key] = val

# Capture list reference — safe to use from background threads (GIL protects append)
_log_list = st.session_state.logs

_live_log_placeholder = None


def _set_log_placeholder(placeholder):
    global _live_log_placeholder
    _live_log_placeholder = placeholder


def _flush_logs():
    """Rewrite the log placeholder with current logs (newest first)."""
    if _live_log_placeholder is not None and _log_list:
        log_html = "\n".join(reversed(_log_list))
        _live_log_placeholder.markdown(f'<div class="log-panel">{log_html}</div>', unsafe_allow_html=True)


def _log(msg: str):
    _log_list.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    _flush_logs()


def _pipe_log_callback(line: str):
    _log_list.append(line)

pipelog.clear_callbacks()
pipelog.add_callback(_pipe_log_callback)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    with st.expander("credentials", expanded=False):
        wiro_api_key = st.text_input(
            "api key", type="password", key="wiro_key", label_visibility="collapsed",
            placeholder="WIRO_API_KEY", value=os.environ.get("WIRO_API_KEY", ""),
        )
        wiro_api_secret = st.text_input(
            "api secret", type="password", key="wiro_secret", label_visibility="collapsed",
            placeholder="WIRO_API_SECRET", value=os.environ.get("WIRO_API_SECRET", ""),
        )

    with st.expander("voice", expanded=True):
        voice_name = st.selectbox(
            "voice", list(VOICE_OPTIONS.keys()),
            index=list(VOICE_OPTIONS.keys()).index("Sarah"),
            key="voice_sel", label_visibility="collapsed",
        )
        tts_model = st.selectbox(
            "model",
            ["eleven_flash_v2_5", "eleven_v3", "eleven_flash_v2", "eleven_turbo_v2_5", "eleven_turbo_v2"],
            key="tts_model_sel", label_visibility="collapsed",
        )

    with st.expander("image", expanded=True):
        IMAGE_STYLES = [
            "cinematic realistic", "photorealistic", "3D render", "digital art",
            "anime", "watercolor", "oil painting", "comic book", "pixel art",
        ]
        img_style = st.selectbox("style", IMAGE_STYLES, index=0, key="img_style", label_visibility="collapsed")
        c1, c2 = st.columns(2)
        with c1:
            img_resolution = st.selectbox("resolution", ["1K", "2K", "4K"], index=1, key="img_res", label_visibility="collapsed")
        with c2:
            img_aspect = st.selectbox("aspect", ["16:9", "1:1", "3:2", "4:3", "9:16", "21:9"], key="img_asp", label_visibility="collapsed")
        imgs_per_section = st.selectbox("images per section", [1, 2, 3, 4, 5], index=0, key="imgs_per_sec")

    with st.expander("video", expanded=True):
        VIDEO_RESOLUTIONS = {
            "720p": (1280, 720),
            "1080p": (1920, 1080),
            "1440p": (2560, 1440),
            "4K": (3840, 2160),
        }
        v_res_label = st.selectbox("resolution", list(VIDEO_RESOLUTIONS.keys()), index=0, key="v_res")
        v_resolution = VIDEO_RESOLUTIONS[v_res_label]
        c3, c4 = st.columns(2)
        with c3:
            v_transition = st.selectbox("transition", ["crossfade", "slide", "cut"], key="v_trans", label_visibility="collapsed")
        with c4:
            v_fps = st.selectbox("fps", [24, 30, 60], index=1, key="v_fps", label_visibility="collapsed")
        c5, c6 = st.columns(2)
        with c5:
            v_trans_dur = st.number_input("trans dur", 0.2, 2.0, 0.8, 0.1, key="v_td")
        with c6:
            v_section_gap = st.number_input("section gap", 0.0, 2.0, 0.5, 0.1, key="v_gap")
        c7, c8 = st.columns(2)
        with c7:
            v_ken_burns = st.toggle("ken burns", value=True, key="v_kb")
        with c8:
            PRESET_OPTIONS = {"ultrafast": "ultrafast", "fast": "fast", "medium": "medium", "slow": "slow"}
            v_preset_label = st.selectbox("encode", list(PRESET_OPTIONS.keys()), index=0, key="v_preset", label_visibility="collapsed")
            v_preset = PRESET_OPTIONS[v_preset_label]

    def _get_ffmpeg_procs() -> list[dict]:
        try:
            if platform.system() == "Windows":
                out = subprocess.check_output(
                    'tasklist /FI "IMAGENAME eq ffmpeg*" /FO CSV /NH',
                    shell=True, text=True, stderr=subprocess.DEVNULL,
                )
                procs = []
                for line in out.strip().splitlines():
                    parts = line.strip('"').split('","')
                    if len(parts) >= 5 and "ffmpeg" in parts[0].lower():
                        procs.append({"pid": parts[1], "info": parts[4]})
                return procs
            else:
                out = subprocess.check_output(
                    ["pgrep", "-lf", "ffmpeg"],
                    text=True, stderr=subprocess.DEVNULL,
                )
                procs = []
                for line in out.strip().splitlines():
                    parts = line.strip().split(None, 1)
                    if len(parts) >= 1:
                        procs.append({"pid": parts[0], "info": parts[1] if len(parts) > 1 else "ffmpeg"})
                return procs
        except Exception:
            return []

    ffmpeg_procs = _get_ffmpeg_procs()
    n = len(ffmpeg_procs)
    fc1, fc2 = st.columns([3, 1])
    with fc1:
        st.markdown(
            f'<span style="color:{"#e55" if n else "#444"};font-size:0.7rem;">ffmpeg: {n} running</span>',
            unsafe_allow_html=True,
        )
    with fc2:
        if n:
            st.button("kill", key="kill_ffmpeg", use_container_width=True,
                      on_click=lambda: (
                          subprocess.run(['pkill', '-f', 'ffmpeg'], capture_output=True)
                          if platform.system() != 'Windows'
                          else subprocess.run('taskkill /F /IM "ffmpeg*"', shell=True, capture_output=True)
                      ))


def _build_config() -> AppConfig:
    if wiro_api_key:
        os.environ["WIRO_API_KEY"] = wiro_api_key
    if wiro_api_secret:
        os.environ["WIRO_API_SECRET"] = wiro_api_secret

    wiro_extra = {"api_secret_env": "WIRO_API_SECRET"}

    return AppConfig(
        llm=ProviderConfig(
            provider="wiro",
            api_key_env="WIRO_API_KEY",
            extra=wiro_extra,
        ),
        voice=ProviderConfig(
            provider="wiro",
            voice_id=VOICE_OPTIONS[voice_name],
            api_key_env="WIRO_API_KEY",
            extra={
                **wiro_extra,
                "tts_model": tts_model,
                "output_format": "mp3_44100_128",
            },
        ),
        image=ProviderConfig(
            provider="wiro",
            api_key_env="WIRO_API_KEY",
            extra={
                **wiro_extra,
                "aspect_ratio": img_aspect,
                "resolution": img_resolution,
                "safety_setting": "OFF",
                "image_style": img_style,
            },
        ),
        video=VideoConfig(
            resolution=v_resolution,
            fps=v_fps,
            transition=v_transition,
            transition_duration=v_trans_dur,
            section_gap=v_section_gap,
            ken_burns=v_ken_burns,
            encoding_preset=v_preset,
            font="assets/fonts/Montserrat-Bold.ttf",
            images_per_section=imgs_per_section,
        ),
    )


def _check_creds() -> bool:
    k = os.environ.get("WIRO_API_KEY", "")
    s = os.environ.get("WIRO_API_SECRET", "")
    if not k or not s:
        st.error("enter wiro api key and secret in the sidebar")
        return False
    return True


# ---------------------------------------------------------------------------
# Layout: main content (left) + logs (right)
# ---------------------------------------------------------------------------
main_col, log_col = st.columns([5, 3])


def _find_previous_runs() -> list[Path]:
    output_dir = Path("output").resolve()
    if not output_dir.exists():
        return []
    return sorted(
        [d / "script.json" for d in output_dir.iterdir()
         if d.is_dir() and d.name.startswith("run_") and (d / "script.json").exists()],
        reverse=True,
    )


# ===== RIGHT COLUMN: LOGS =====
with log_col:
    @st.fragment(run_every=2)
    def _log_fragment():
        # Poll background task — only this fragment reruns, no full-page blink
        _task = st.session_state.task
        if _task is not None and _task.done:
            if _task.error:
                _log(f"ERROR: {_task.error}")
            else:
                result = _task.result
                rtype = result.get("type", "")
                if rtype == "gen_script":
                    st.session_state.script = result["script"]
                    st.session_state.run_dir = result["run_dir"]
                    st.session_state.stage = "scripted"
                    _log(f"script saved: {result['run_dir'].name}")
                elif rtype == "gen_assets":
                    st.session_state.script = result["script"]
                    st.session_state.stage = "assets_done"
                    missing = [s for s in result["script"].sections if not s.image_path or not Path(s.image_path).exists()]
                    if missing:
                        _log(f"{len(missing)} image(s) missing — retry or upload below")
                    else:
                        _log("assets ready")
                elif rtype == "full_pipeline":
                    st.session_state.script = result["script"]
                    st.session_state.run_dir = result["run_dir"]
                    st.session_state.stage = result["stage"]
                    if result["stage"] == "video_done":
                        _log(f"pipeline complete: {result.get('video_path', '')}")
                    else:
                        _log(f"{result.get('missing', 0)} image(s) missing — retry or upload below")
                elif rtype == "assemble":
                    st.session_state.script = result["script"]
                    st.session_state.stage = "video_done"
                    _log(f"video done: {result.get('video_path', '')}")
                elif rtype == "retry_section":
                    sec_num = result["section_number"]
                    new_paths = [Path(p) for p in result["image_paths"]]
                    script = st.session_state.script
                    for sec in script.sections:
                        if sec.number == sec_num:
                            sec.image_path = new_paths[0] if new_paths else sec.image_path
                            sec.image_paths = new_paths
                            break
                    save_script(script, st.session_state.run_dir)
                    _log(f"section {sec_num}: {len(new_paths)} image(s) regenerated")
                elif rtype == "retry_single":
                    save_script(st.session_state.script, st.session_state.run_dir)
                    _log(f"image regenerated: {Path(result['image_path']).name}")
            st.session_state.task = None
            st.rerun()

        # Render logs
        if _log_list:
            log_html = "\n".join(reversed(_log_list))
            st.markdown(f'<div class="log-panel">{log_html}</div>', unsafe_allow_html=True)
        else:
            st.markdown(
                '<span style="color:#444;font-size:0.75rem;">no logs yet</span>',
                unsafe_allow_html=True,
            )
        if st.button("clear logs", use_container_width=True):
            _log_list.clear()

    _log_fragment()

# ===== LEFT COLUMN: MAIN =====
with main_col:
    stage = st.session_state.stage
    steps = [
        ("script", stage in ("scripted", "assets_done", "video_done")),
        ("assets", stage in ("assets_done", "video_done")),
        ("video", stage == "video_done"),
    ]
    step_html = " ".join(
        f'<span class="step {"done" if done else ""}">{name}</span>' for name, done in steps
    )
    st.markdown(
        f'<span style="color:#888;font-size:0.85rem;font-weight:600;">yt-content-pipe</span>&nbsp;&nbsp;{step_html}',
        unsafe_allow_html=True,
    )
    st.markdown('<div class="sep"></div>', unsafe_allow_html=True)

    # -- Topic --
    st.markdown('<p class="label">topic</p>', unsafe_allow_html=True)
    topic = st.text_input(
        "topic", placeholder="Top 5 AI Tools in 2026", key="topic", label_visibility="collapsed",
    )

    st.markdown('<p class="label">subtitles (one per line, optional)</p>', unsafe_allow_html=True)
    subtitles_raw = st.text_area(
        "subtitles", placeholder="FlowState.ai\nMoodBoard Studio\nCodeWhisper Pro",
        key="subtitles", label_visibility="collapsed", height=68,
    )

    def _parse_subtitles() -> list[str] | None:
        lines = [l.strip() for l in subtitles_raw.strip().splitlines() if l.strip()]
        return lines if lines else None

    _task_active = st.session_state.task is not None and (st.session_state.task.running or not st.session_state.task.done)

    btn_a, btn_b, btn_c = st.columns([1, 2, 2])
    with btn_a:
        num_sections = st.number_input("sections", 2, 20, 5, key="n_sec", label_visibility="collapsed")
    with btn_b:
        gen_script_btn = st.button("generate script", use_container_width=True, disabled=_task_active)
    with btn_c:
        full_btn = st.button("full pipeline", type="primary", use_container_width=True, disabled=_task_active)

    # -- Generate script only --
    if gen_script_btn and not _task_active:
        if not topic.strip():
            st.error("enter a topic")
        else:
            config = _build_config()
            if _check_creds():
                subs = _parse_subtitles()
                if subs:
                    _log(f"subtitles: {subs}")
                _log("starting script generation...")
                st.session_state.config = config
                st.session_state.task = start_task(
                    bg_gen_script,
                    args=(config, topic.strip(), num_sections, subs),
                    label="generating script",
                )
                st.rerun()

    # -- Full pipeline --
    if full_btn and not _task_active:
        if not topic.strip():
            st.error("enter a topic")
        else:
            config = _build_config()
            if _check_creds():
                subs = _parse_subtitles()
                if subs:
                    _log(f"subtitles: {subs}")
                _log("starting full pipeline...")
                st.session_state.config = config
                st.session_state.task = start_task(
                    bg_full_pipeline,
                    args=(config, topic.strip(), num_sections, subs),
                    label="full pipeline",
                )
                st.rerun()

    # -- Script editor --
    if st.session_state.script is not None:
        script: Script = st.session_state.script
        st.markdown('<div class="sep"></div>', unsafe_allow_html=True)

        with st.expander(f"**{script.title}** — {len(script.sections)} sections", expanded=False):
            new_intro = st.text_area("intro", value=script.intro_narration, key="ed_intro", height=60)

            edited_sections = []
            for i, sec in enumerate(script.sections):
                new_heading = st.text_input(f"{sec.number}.", value=sec.heading, key=f"h_{i}")
                lc, rc = st.columns(2)
                with lc:
                    new_narr = st.text_area("narration", value=sec.narration, key=f"n_{i}", height=70, label_visibility="collapsed")
                with rc:
                    new_img = st.text_area("image prompt", value=sec.image_prompt, key=f"ip_{i}", height=70, label_visibility="collapsed")
                edited_sections.append(
                    Section(
                        number=sec.number, heading=new_heading, narration=new_narr,
                        image_prompt=new_img, audio_path=sec.audio_path,
                        image_path=sec.image_path, duration=sec.duration,
                    )
                )

            new_outro = st.text_area("outro", value=script.outro_narration, key="ed_outro", height=60)

            if st.button("save edits", use_container_width=True):
                st.session_state.script = Script(
                    title=script.title, intro_narration=new_intro,
                    sections=edited_sections, outro_narration=new_outro,
                    intro_audio_path=script.intro_audio_path,
                    outro_audio_path=script.outro_audio_path,
                    intro_duration=script.intro_duration,
                    outro_duration=script.outro_duration,
                )
                save_script(st.session_state.script, st.session_state.run_dir)
                _log("script edits saved")
                st.success("saved")

    # -- Assets --
    if st.session_state.stage in ("scripted", "assets_done", "video_done"):
        st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
        if st.session_state.stage in ("assets_done", "video_done"):
            _script = st.session_state.script
            _run_dir = Path(st.session_state.run_dir).resolve()
            _missing = [
                s for s in _script.sections
                if not s.audio_path or not Path(s.audio_path).exists()
                or not s.image_path or not Path(s.image_path).exists()
            ]
            if _missing:
                st.warning(f"{len(_missing)} section(s) missing audio or images: {', '.join(str(s.number) for s in _missing)}")
                if st.button("retry missing assets", use_container_width=True, disabled=_task_active) and not _task_active:
                    config = _build_config()
                    st.session_state.config = config
                    _log(f"retrying assets for {len(_missing)} section(s)...")
                    st.session_state.task = start_task(
                        bg_gen_assets,
                        args=(config, st.session_state.script, _run_dir),
                        label="retrying missing assets",
                    )
                    st.rerun()
        if st.session_state.stage == "scripted":
            if st.button("generate assets", use_container_width=True, disabled=_task_active) and not _task_active:
                config = _build_config()
                st.session_state.config = config
                _log("generating assets...")
                st.session_state.task = start_task(
                    bg_gen_assets,
                    args=(config, st.session_state.script, st.session_state.run_dir),
                    label="generating assets",
                )
                st.rerun()

    if st.session_state.stage in ("assets_done", "video_done"):
        script = st.session_state.script
        run_dir = Path(st.session_state.run_dir).resolve()

        with st.expander("preview assets", expanded=True):
            # -- helper to render an image row --
            def _asset_row(label, audio_path, img_path_resolved, img_save_path, retry_prompt, key_prefix,
                           section_number=None, section_prompts=None):
                c_img, c_aud, c_act = st.columns([3, 2, 1])
                with c_img:
                    st.caption(label)
                    if img_path_resolved:
                        st.image(str(img_path_resolved), use_container_width=True)
                    else:
                        st.caption("no image")
                with c_aud:
                    if audio_path and audio_path.exists():
                        st.audio(str(audio_path))
                with c_act:
                    if st.button("retry", key=f"retry_{key_prefix}", use_container_width=True, disabled=_task_active):
                        config = _build_config()
                        if _check_creds() and retry_prompt:
                            if section_number is not None and section_prompts:
                                _log(f"retrying {len(section_prompts)} image(s) for section {section_number}...")
                                images_dir = run_dir / "images"
                                st.session_state.task = start_task(
                                    bg_retry_section,
                                    args=(config, section_prompts, section_number, images_dir),
                                    label=f"retrying section {section_number}",
                                )
                                st.rerun()
                            else:
                                from src.bg_wrappers import bg_retry_single
                                _log(f"retrying {label} image...")
                                img_save_path.parent.mkdir(parents=True, exist_ok=True)
                                st.session_state.task = start_task(
                                    bg_retry_single,
                                    args=(config, retry_prompt, img_save_path),
                                    label=f"retrying {label}",
                                )
                                st.rerun()
                    uploaded = st.file_uploader(
                        "upload", type=["png", "jpg", "jpeg", "webp"],
                        key=f"upload_{key_prefix}", label_visibility="collapsed",
                    )
                    if uploaded is not None:
                        img_save_path.parent.mkdir(parents=True, exist_ok=True)
                        img = PILImage.open(uploaded).convert("RGB")
                        img.save(str(img_save_path), "PNG")
                        save_script(st.session_state.script, run_dir)
                        _log(f"uploaded {label} image")
                        st.rerun()

            # -- Intro --
            intro_audio = run_dir / "audio" / "intro.mp3"
            intro_img_path = run_dir / "images" / "intro.png"
            intro_img_file = None
            if script.intro_image_path and Path(script.intro_image_path).resolve().exists():
                intro_img_file = Path(script.intro_image_path).resolve()
            elif intro_img_path.exists():
                intro_img_file = intro_img_path
            intro_prompt = script.intro_image_prompt or f"Cinematic wide shot representing: {script.title}, dramatic lighting, high detail, 16:9"
            _asset_row("intro", intro_audio, intro_img_file, intro_img_path, intro_prompt, "intro_img")
            if intro_img_file and not script.intro_image_path:
                script.intro_image_path = intro_img_path

            # -- Sections --
            for sec in script.sections:
                # Primary image
                img_file = None
                if sec.image_path and Path(sec.image_path).resolve().exists():
                    img_file = Path(sec.image_path).resolve()
                else:
                    candidate = run_dir / "images" / f"section_{sec.number:02d}.png"
                    if candidate.exists():
                        img_file = candidate
                aud_file = None
                if sec.audio_path and Path(sec.audio_path).resolve().exists():
                    aud_file = Path(sec.audio_path).resolve()
                else:
                    candidate = run_dir / "audio" / f"section_{sec.number:02d}.mp3"
                    if candidate.exists():
                        aud_file = candidate
                target_path = run_dir / "images" / f"section_{sec.number:02d}.png"
                sec_prompts = sec.image_prompts if sec.image_prompts else [sec.image_prompt]
                _asset_row(
                    f"{sec.number}. {sec.heading}",
                    Path(aud_file) if aud_file else None,
                    img_file, target_path,
                    sec.image_prompt, f"img_{sec.number}",
                    section_number=sec.number, section_prompts=sec_prompts,
                )
                if img_file:
                    sec.image_path = target_path
                if aud_file:
                    sec.audio_path = aud_file

                # Extra images (multi-image)
                extra_paths = sec.image_paths[1:] if len(sec.image_paths) > 1 else []
                if not extra_paths:
                    # Discover from disk
                    for suffix in ["_b", "_c", "_d", "_e"]:
                        p = run_dir / "images" / f"section_{sec.number:02d}{suffix}.png"
                        if p.exists():
                            extra_paths.append(p)
                if extra_paths:
                    cols = st.columns(len(extra_paths))
                    for ci, ep in enumerate(extra_paths):
                        ep = Path(ep)
                        if ep.exists():
                            with cols[ci]:
                                st.image(str(ep), width=120)

            # -- Outro --
            outro_audio = run_dir / "audio" / "outro.mp3"
            outro_img_path = run_dir / "images" / "outro.png"
            outro_img_file = None
            if script.outro_image_path and Path(script.outro_image_path).resolve().exists():
                outro_img_file = Path(script.outro_image_path).resolve()
            elif outro_img_path.exists():
                outro_img_file = outro_img_path
            outro_prompt = script.outro_image_prompt or f"Cinematic closing shot for a video about: {script.title}, warm lighting, high detail, 16:9"
            _asset_row("outro", outro_audio, outro_img_file, outro_img_path, outro_prompt, "outro_img")
            if outro_img_file and not script.outro_image_path:
                script.outro_image_path = outro_img_path

    # -- Video --
    if st.session_state.stage in ("assets_done", "video_done"):
        st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
        assemble_btn = st.button(
            "assemble video" if st.session_state.stage == "assets_done" else "reassemble video",
            type="primary", use_container_width=True, disabled=_task_active,
        )

        encode_trigger = assemble_btn
        if encode_trigger and not _task_active:
            config = _build_config()
            _log("assembling video (encoding may take several minutes)...")
            st.session_state.task = start_task(
                bg_assemble,
                args=(config, st.session_state.script, Path(st.session_state.run_dir)),
                label="encoding video",
            )
            st.rerun()

    if st.session_state.stage == "video_done":
        run_dir = st.session_state.run_dir
        video_file = run_dir / "final_video.mp4"

        if video_file.exists():
            st.video(str(video_file))
            file_mb = video_file.stat().st_size / (1024 * 1024)
            sc = st.session_state.script
            m1, m2, m3, m4 = st.columns(4)
            with m1:
                st.markdown(f'<div class="metric"><div class="val">{len(sc.sections)}</div><div class="lbl">sections</div></div>', unsafe_allow_html=True)
            with m2:
                st.markdown(f'<div class="metric"><div class="val">{file_mb:.1f} mb</div><div class="lbl">size</div></div>', unsafe_allow_html=True)
            with m3:
                st.markdown(f'<div class="metric"><div class="val">{run_dir.name[-6:]}</div><div class="lbl">run</div></div>', unsafe_allow_html=True)
            with m4:
                with open(video_file, "rb") as f:
                    st.download_button("download", data=f, file_name=f"{sc.title}.mp4", mime="video/mp4", use_container_width=True)

    # -- Load previous run --
    st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
    prev_runs = _find_previous_runs()
    if prev_runs:
        lr_sel, lr_btn = st.columns([3, 1])
        run_labels = {str(p): p.parent.name for p in prev_runs}
        with lr_sel:
            selected_run = st.selectbox(
                "run", options=[str(p) for p in prev_runs],
                format_func=lambda x: run_labels.get(x, x),
                key="prev_run_sel", label_visibility="collapsed",
            )
        with lr_btn:
            load_btn = st.button("load", use_container_width=True)
        if load_btn:
            if not selected_run:
                st.error("select a run first")
            else:
                p = Path(selected_run)
                try:
                    script = load_script(p)
                    st.session_state.script = script
                    st.session_state.run_dir = p.parent
                    has_audio = any(
                        (p.parent / "audio" / f"section_{s.number:02d}.mp3").exists()
                        for s in script.sections
                    )
                    has_video = (p.parent / "final_video.mp4").exists()
                    if has_video:
                        st.session_state.stage = "video_done"
                    elif has_audio:
                        st.session_state.stage = "assets_done"
                    else:
                        st.session_state.stage = "scripted"
                    _log(f"loaded: {p.parent.name}")
                    st.rerun()
                except Exception as e:
                    st.error(f"failed: {e}")


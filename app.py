from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv
import streamlit as st

load_dotenv()

import src.log as pipelog
from src.models import AppConfig, ProviderConfig, Script, Section, VideoConfig
from src.pipeline import (
    _create_run_dir,
    generate_assets,
    generate_script,
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

    *, html, body, [class*="st-"] {
        font-family: 'JetBrains Mono', 'Courier New', monospace !important;
    }

    .block-container { padding-top: 2rem; }

    h1, h2, h3, h4, h5, h6 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 500 !important;
        letter-spacing: -0.02em;
    }

    /* Muted label style */
    .label { color: #666; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }

    /* Section divider */
    .sep { border-top: 1px solid #1e1e1e; margin: 2rem 0; }

    /* Step indicator */
    .step {
        display: inline-block;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 0.7rem;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 8px;
    }
    .step.active { border-color: #555; color: #aaa; }
    .step.done { border-color: #333; color: #4a4; }

    /* Metric */
    .metric {
        background: #111;
        border: 1px solid #1e1e1e;
        border-radius: 4px;
        padding: 16px;
        text-align: center;
    }
    .metric .val { font-size: 1.4rem; color: #ccc; font-weight: 600; }
    .metric .lbl { font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }

    /* Hide streamlit branding */
    #MainMenu, footer, header { visibility: hidden; }

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
    /* Hide expander arrow icons */
    div[data-testid="stExpander"] svg {
        display: none !important;
    }

    /* Progress bar */
    .stProgress > div > div > div { background: #555 !important; }
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
}.items():
    if key not in st.session_state:
        st.session_state[key] = val


def _log(msg: str):
    st.session_state.logs.append(f"[{time.strftime('%H:%M:%S')}] {msg}")


# Wire pipeline logging into session state
def _pipe_log_callback(line: str):
    st.session_state.logs.append(line)

pipelog.clear_callbacks()
pipelog.add_callback(_pipe_log_callback)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### config")

    st.markdown('<p class="label">wiro credentials</p>', unsafe_allow_html=True)
    wiro_api_key = st.text_input(
        "api key", type="password", key="wiro_key", label_visibility="collapsed",
        placeholder="WIRO_API_KEY",
        value=os.environ.get("WIRO_API_KEY", ""),
    )
    wiro_api_secret = st.text_input(
        "api secret", type="password", key="wiro_secret", label_visibility="collapsed",
        placeholder="WIRO_API_SECRET",
        value=os.environ.get("WIRO_API_SECRET", ""),
    )

    st.markdown("---")
    st.markdown('<p class="label">voice</p>', unsafe_allow_html=True)
    voice_name = st.selectbox(
        "voice", list(VOICE_OPTIONS.keys()), index=list(VOICE_OPTIONS.keys()).index("Sarah"),
        key="voice_sel", label_visibility="collapsed",
    )
    tts_model = st.selectbox(
        "tts model",
        ["eleven_flash_v2_5", "eleven_v3", "eleven_flash_v2", "eleven_turbo_v2_5", "eleven_turbo_v2"],
        key="tts_model_sel", label_visibility="collapsed",
    )

    st.markdown("---")
    st.markdown('<p class="label">image</p>', unsafe_allow_html=True)
    img_resolution = st.selectbox("resolution", ["1K", "2K", "4K"], index=1, key="img_res", label_visibility="collapsed")
    img_aspect = st.selectbox(
        "aspect ratio",
        ["16:9", "1:1", "3:2", "4:3", "9:16", "21:9"],
        key="img_asp",
        label_visibility="collapsed",
    )

    st.markdown("---")
    st.markdown('<p class="label">video</p>', unsafe_allow_html=True)
    v_transition = st.selectbox("transition", ["crossfade", "slide", "cut"], key="v_trans", label_visibility="collapsed")
    v_trans_dur = st.slider("transition sec", 0.2, 2.0, 0.8, 0.1, key="v_td", label_visibility="collapsed")
    v_ken_burns = st.toggle("ken burns", value=True, key="v_kb")
    v_fps = st.selectbox("fps", [24, 30, 60], index=1, key="v_fps", label_visibility="collapsed")

    # -- Process monitor --
    st.markdown("---")
    st.markdown('<p class="label">processes</p>', unsafe_allow_html=True)

    def _get_ffmpeg_procs() -> list[dict]:
        try:
            out = subprocess.check_output(
                'tasklist /FI "IMAGENAME eq ffmpeg*" /FO CSV /NH',
                shell=True, text=True, stderr=subprocess.DEVNULL,
            )
            procs = []
            for line in out.strip().splitlines():
                parts = line.strip('"').split('","')
                if len(parts) >= 5 and "ffmpeg" in parts[0].lower():
                    procs.append({
                        "name": parts[0],
                        "pid": parts[1],
                        "mem": parts[4],
                    })
            return procs
        except Exception:
            return []

    ffmpeg_procs = _get_ffmpeg_procs()
    if ffmpeg_procs:
        for p in ffmpeg_procs:
            st.text(f"PID {p['pid']}  {p['mem']}")
        if st.button("kill all ffmpeg", use_container_width=True, type="primary"):
            try:
                subprocess.run(
                    'taskkill /F /IM "ffmpeg*"',
                    shell=True, capture_output=True,
                )
                _log("killed all ffmpeg processes")
                st.rerun()
            except Exception as e:
                st.error(str(e))
    else:
        st.text("no ffmpeg running")


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
            },
        ),
        video=VideoConfig(
            resolution=(1920, 1080),
            fps=v_fps,
            transition=v_transition,
            transition_duration=v_trans_dur,
            ken_burns=v_ken_burns,
            font="assets/fonts/Montserrat-Bold.ttf",
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
    output_dir = Path("output")
    if not output_dir.exists():
        return []
    return sorted(
        [d / "script.json" for d in output_dir.iterdir()
         if d.is_dir() and d.name.startswith("run_") and (d / "script.json").exists()],
        reverse=True,
    )


# ===== RIGHT COLUMN: LOGS =====
with log_col:
    st.markdown('<p class="label">logs</p>', unsafe_allow_html=True)
    log_placeholder = st.empty()
    if st.button("clear logs", use_container_width=True):
        st.session_state.logs = []
        st.rerun()

# ===== LEFT COLUMN: MAIN =====
with main_col:
    st.markdown("# yt-content-pipe")
    st.markdown(
        '<span style="color:#555;font-size:0.8rem;">topic > script > voice + images > video</span>',
        unsafe_allow_html=True,
    )

    # Step indicators
    stage = st.session_state.stage
    steps = [
        ("script", stage in ("scripted", "assets_done", "video_done")),
        ("assets", stage in ("assets_done", "video_done")),
        ("video", stage == "video_done"),
    ]
    step_html = " ".join(
        f'<span class="step {"done" if done else ""}">{name}</span>' for name, done in steps
    )
    st.markdown(step_html, unsafe_allow_html=True)
    st.markdown('<div class="sep"></div>', unsafe_allow_html=True)

    # -- Topic --
    st.markdown('<p class="label">topic</p>', unsafe_allow_html=True)
    topic = st.text_input(
        "topic", placeholder="Top 5 AI Tools in 2026", key="topic", label_visibility="collapsed",
    )

    st.markdown('<p class="label">subtitles (one per line, optional)</p>', unsafe_allow_html=True)
    subtitles_raw = st.text_area(
        "subtitles", placeholder="FlowState.ai\nMoodBoard Studio\nCodeWhisper Pro",
        key="subtitles", label_visibility="collapsed", height=100,
    )

    col_a, col_b = st.columns([1, 4])
    with col_a:
        num_sections = st.number_input("sections", 2, 20, 5, key="n_sec", label_visibility="collapsed")

    def _parse_subtitles() -> list[str] | None:
        lines = [l.strip() for l in subtitles_raw.strip().splitlines() if l.strip()]
        return lines if lines else None

    st.markdown("")

    # -- Buttons --
    gen_script_btn = st.button("generate script", use_container_width=True)
    full_btn = st.button("full pipeline", type="primary", use_container_width=True)

    # -- Generate script only --
    if gen_script_btn:
        if not topic.strip():
            st.error("enter a topic")
        else:
            config = _build_config()
            if _check_creds():
                _log("starting script generation...")
                with st.status("generating script...", expanded=True) as status:
                    try:
                        subs = _parse_subtitles()
                        if subs:
                            _log(f"subtitles: {subs}")
                        st.write("submitting to LLM...")
                        script = asyncio.run(generate_script(config, topic.strip(), num_sections, subtitles=subs))
                        run_dir = _create_run_dir()
                        save_script(script, run_dir)
                        st.session_state.script = script
                        st.session_state.run_dir = run_dir
                        st.session_state.config = config
                        st.session_state.stage = "scripted"
                        _log(f"script saved: {run_dir.name}")
                        status.update(label="script done", state="complete")
                        st.rerun()
                    except Exception as e:
                        _log(f"ERROR: {e}")
                        status.update(label="failed", state="error")
                        st.error(f"failed: {e}")

    # -- Full pipeline --
    if full_btn:
        if not topic.strip():
            st.error("enter a topic")
        else:
            config = _build_config()
            if _check_creds():
                st.session_state.config = config
                _log("starting full pipeline...")
                with st.status("running full pipeline...", expanded=True) as status:
                    try:
                        subs = _parse_subtitles()
                        if subs:
                            _log(f"subtitles: {subs}")
                        st.write("generating script...")
                        script = asyncio.run(generate_script(config, topic.strip(), num_sections, subtitles=subs))
                        run_dir = _create_run_dir()
                        save_script(script, run_dir)
                        st.session_state.script = script
                        st.session_state.run_dir = run_dir
                        _log(f"script saved: {run_dir.name}")

                        st.write("generating voice + images...")
                        _log("generating assets...")
                        script = asyncio.run(generate_assets(config, script, run_dir))
                        st.session_state.script = script
                        save_script(script, run_dir)

                        st.write("encoding video (this may take several minutes)...")
                        _log("assembling video...")
                        video_path = assemble_video(config, script, run_dir)
                        st.session_state.stage = "video_done"
                        _log(f"pipeline complete: {video_path}")

                        status.update(label="pipeline complete", state="complete")
                        st.rerun()
                    except Exception as e:
                        _log(f"PIPELINE ERROR: {e}")
                        status.update(label="pipeline failed", state="error")
                        st.error(f"pipeline failed: {e}")

    # -- Script editor --
    if st.session_state.script is not None:
        script: Script = st.session_state.script
        st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
        st.markdown(f"**{script.title}** / {len(script.sections)} sections")

        st.markdown('<p class="label">edit script</p>', unsafe_allow_html=True)
        new_intro = st.text_area("intro", value=script.intro_narration, key="ed_intro", height=70)

        edited_sections = []
        for i, sec in enumerate(script.sections):
            st.markdown(f"**{sec.number}. {sec.heading}**")
            new_heading = st.text_input("heading", value=sec.heading, key=f"h_{i}", label_visibility="collapsed")
            lc, rc = st.columns(2)
            with lc:
                new_narr = st.text_area("narration", value=sec.narration, key=f"n_{i}", height=90, label_visibility="collapsed")
            with rc:
                new_img = st.text_area("image prompt", value=sec.image_prompt, key=f"ip_{i}", height=90, label_visibility="collapsed")
            edited_sections.append(
                Section(
                    number=sec.number, heading=new_heading, narration=new_narr,
                    image_prompt=new_img, audio_path=sec.audio_path,
                    image_path=sec.image_path, duration=sec.duration,
                )
            )

        new_outro = st.text_area("outro", value=script.outro_narration, key="ed_outro", height=70)

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
        if st.session_state.stage == "scripted":
            if st.button("generate assets", use_container_width=True):
                config = _build_config()
                st.session_state.config = config
                _log("generating assets...")
                with st.status("generating voice + images...", expanded=True) as status:
                    try:
                        script = asyncio.run(
                            generate_assets(config, st.session_state.script, st.session_state.run_dir)
                        )
                        st.session_state.script = script
                        st.session_state.stage = "assets_done"
                        save_script(script, st.session_state.run_dir)
                        _log("assets ready")
                        status.update(label="assets done", state="complete")
                        st.rerun()
                    except Exception as e:
                        _log(f"ASSET ERROR: {e}")
                        status.update(label="failed", state="error")
                        st.error(f"failed: {e}")

    if st.session_state.stage in ("assets_done", "video_done"):
        script = st.session_state.script
        run_dir = Path(st.session_state.run_dir).resolve()

        st.markdown('<p class="label">preview assets</p>', unsafe_allow_html=True)
        intro_audio = run_dir / "audio" / "intro.mp3"
        if intro_audio.exists():
            st.caption("intro")
            st.audio(str(intro_audio))

        for sec in script.sections:
            st.markdown(f"**{sec.number}. {sec.heading}**")
            # Find image: try script path, then discover from run_dir
            img_file = None
            if sec.image_path and Path(sec.image_path).resolve().exists():
                img_file = Path(sec.image_path).resolve()
            else:
                candidate = run_dir / "images" / f"section_{sec.number:02d}.png"
                if candidate.exists():
                    img_file = candidate
            # Find audio: try script path, then discover from run_dir
            aud_file = None
            if sec.audio_path and Path(sec.audio_path).resolve().exists():
                aud_file = Path(sec.audio_path).resolve()
            else:
                candidate = run_dir / "audio" / f"section_{sec.number:02d}.mp3"
                if candidate.exists():
                    aud_file = candidate

            lc, rc = st.columns([2, 1])
            with lc:
                if img_file:
                    st.image(str(img_file), use_container_width=True)
            with rc:
                if aud_file:
                    st.audio(str(aud_file))
                if sec.duration:
                    st.caption(f"{sec.duration:.1f}s")

        outro_audio = run_dir / "audio" / "outro.mp3"
        if outro_audio.exists():
            st.caption("outro")
            st.audio(str(outro_audio))

    # -- Video --
    if st.session_state.stage == "assets_done":
        st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
        if st.button("assemble video", type="primary", use_container_width=True):
            config = _build_config()
            _log("assembling video (encoding may take several minutes)...")
            with st.status("encoding video (this may take several minutes)...", expanded=True) as status:
                try:
                    st.write("building clips...")
                    video_path = assemble_video(config, st.session_state.script, st.session_state.run_dir)
                    st.session_state.stage = "video_done"
                    _log(f"video done: {video_path}")
                    status.update(label="video done", state="complete")
                    st.rerun()
                except Exception as e:
                    _log(f"VIDEO ERROR: {e}")
                    status.update(label="encoding failed", state="error")
                    st.error(f"failed: {e}")

    if st.session_state.stage in ("assets_done", "video_done"):
        if st.button("reassemble video", use_container_width=True):
            config = _build_config()
            _log("reassembling video...")
            with st.status("encoding video (this may take several minutes)...", expanded=True) as status:
                try:
                    st.write("building clips...")
                    video_path = assemble_video(config, st.session_state.script, st.session_state.run_dir)
                    st.session_state.stage = "video_done"
                    _log(f"video done: {video_path}")
                    status.update(label="video done", state="complete")
                    st.rerun()
                except Exception as e:
                    _log(f"VIDEO ERROR: {e}")
                    status.update(label="encoding failed", state="error")
                    st.error(f"failed: {e}")

    if st.session_state.stage == "video_done":
        run_dir = st.session_state.run_dir
        video_file = run_dir / "final_video.mp4"

        if video_file.exists():
            st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
            st.video(str(video_file))

            with open(video_file, "rb") as f:
                st.download_button(
                    "download .mp4", data=f,
                    file_name=f"{st.session_state.script.title}.mp4",
                    mime="video/mp4", use_container_width=True,
                )

            file_mb = video_file.stat().st_size / (1024 * 1024)
            sc = st.session_state.script
            m1, m2, m3 = st.columns(3)
            with m1:
                st.markdown(
                    f'<div class="metric"><div class="val">{len(sc.sections)}</div><div class="lbl">sections</div></div>',
                    unsafe_allow_html=True,
                )
            with m2:
                st.markdown(
                    f'<div class="metric"><div class="val">{file_mb:.1f} mb</div><div class="lbl">file size</div></div>',
                    unsafe_allow_html=True,
                )
            with m3:
                st.markdown(
                    f'<div class="metric"><div class="val">{run_dir.name}</div><div class="lbl">run id</div></div>',
                    unsafe_allow_html=True,
                )

    # -- Load previous run --
    st.markdown('<div class="sep"></div>', unsafe_allow_html=True)
    prev_runs = _find_previous_runs()
    if prev_runs:
        st.markdown('<p class="label">load previous run</p>', unsafe_allow_html=True)
        run_labels = {str(p): p.parent.name for p in prev_runs}
        selected_run = st.selectbox(
            "select run", options=[str(p) for p in prev_runs],
            format_func=lambda x: run_labels.get(x, x),
            key="prev_run_sel", label_visibility="collapsed",
        )
        if st.button("load run", use_container_width=True):
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

# ===== RENDER LOGS =====
with log_col:
    if st.session_state.logs:
        log_text = "\n".join(st.session_state.logs)
        log_placeholder.code(log_text, language=None)
    else:
        log_placeholder.markdown(
            '<span style="color:#444;font-size:0.75rem;">no logs yet</span>',
            unsafe_allow_html=True,
        )

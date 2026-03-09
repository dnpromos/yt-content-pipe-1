"""Generate voice preview MP3 files for all voices using Wiro TTS API directly.

No project dependencies required — only uses stdlib + curl.
Usage: python3 scripts/generate_voice_previews.py
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "web" / "public" / "voices"

# Load .env
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("WIRO_API_KEY", "")
API_SECRET = os.environ.get("WIRO_API_SECRET", "")

RUN_URL = "https://api.wiro.ai/v1/Run/elevenlabs/text-to-speech"
DETAIL_URL = "https://api.wiro.ai/v1/Task/Detail"

VOICES: dict[str, str] = {
    "Rachel": "21m00Tcm4TlvDq8ikWAM", "Drew": "29vD33N1CtxCmqQRPOHJ",
    "Clyde": "2EiwWnXFnvU5JabPnv8n", "Paul": "5Q0t7uMcjvnagumLfvZi",
    "Aria": "9BWtsMINqrJLrRacOk9x", "Sarah": "EXAVITQu4vr4xnSDxMaL",
    "Laura": "FGY2WhTYpPnrIDTdsKH5", "Charlie": "IKne3meq5aSn9XLyUdCD",
    "George": "JBFqnCBsd6RMkjVDRZzb", "Emily": "LcfcDJNUP1GQjkzn1xUU",
    "Callum": "N2lVS1w4EtoT3dr4eOWO", "Liam": "TX3LPaxmHKxFdv7VOQHJ",
    "Charlotte": "XB0fDUnXU5powFXDhCwa", "Daniel": "onwK4e9ZLuTAKqWW03F9",
    "River": "SAz9YHcvj6GT2YYXdXww",
}

PREVIEW_TEMPLATE = (
    "Hello, my name is {name}. The weather today is sunny with clear blue skies "
    "and a light breeze coming from the west. Tomorrow we can expect some clouds "
    "rolling in by the afternoon, but temperatures should stay comfortable around "
    "twenty two degrees."
)

SCRIPTS: dict[str, str] = {name: PREVIEW_TEMPLATE.format(name=name) for name in VOICES}


def _auth_headers() -> list[str]:
    nonce = str(int(time.time()))
    message = API_SECRET + nonce
    signature = hmac.new(API_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()
    return [
        "-H", f"x-api-key: {API_KEY}",
        "-H", f"x-nonce: {nonce}",
        "-H", f"x-signature: {signature}",
        "-H", "Content-Type: application/json",
    ]


def _post(url: str, body: dict) -> dict:
    cmd = ["curl", "-s", "-X", "POST", url, *_auth_headers(), "-d", json.dumps(body)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)


def _download(url: str, path: Path) -> None:
    subprocess.run(["curl", "-s", "-o", str(path), url], check=True, timeout=120)


def generate_one(name: str, voice_id: str) -> None:
    mp3_path = OUTPUT_DIR / f"{name.lower()}.mp3"
    if mp3_path.exists():
        print(f"  [skip] {name} — already exists")
        return

    text = SCRIPTS[name]
    payload = {"prompt": text, "model": "eleven_flash_v2_5", "voice": voice_id, "outputFormat": "mp3_44100_128"}

    print(f"  [submit] {name}...")
    run = _post(RUN_URL, payload)
    if not run.get("result"):
        print(f"  [error] {name}: {run.get('errors', [])}")
        return

    task_id = run["taskid"]
    print(f"  [poll] {name} task={task_id[:8]}...")

    for _ in range(300):
        time.sleep(2)
        detail = _post(DETAIL_URL, {"taskid": task_id})
        tasks = detail.get("tasklist", [])
        if not tasks:
            continue
        status = tasks[0].get("status", "")
        if status == "task_postprocess_end":
            outputs = tasks[0].get("outputs", [])
            urls = [o["url"] for o in outputs if "url" in o]
            if urls:
                _download(urls[0], mp3_path)
                print(f"  [done] {name}")
            else:
                print(f"  [error] {name}: no output URLs")
            return
        elif status == "task_cancel":
            print(f"  [cancelled] {name}")
            return

    print(f"  [timeout] {name}")


def main() -> None:
    if not API_KEY or not API_SECRET:
        print("ERROR: WIRO_API_KEY and WIRO_API_SECRET must be set in .env")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Generating voice previews to {OUTPUT_DIR}\n")

    for name, voice_id in VOICES.items():
        generate_one(name, voice_id)

    generated = list(OUTPUT_DIR.glob("*.mp3"))
    print(f"\nDone! {len(generated)}/{len(VOICES)} previews generated.")


if __name__ == "__main__":
    main()

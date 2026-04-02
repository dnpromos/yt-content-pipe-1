"""Batch-generate Gemini TTS voice previews in parallel.

Usage:
    python scripts/generate_gemini_previews.py

Requires WIRO_API_KEY and WIRO_API_SECRET env vars to be set.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.providers.wiro_client import WiroClient
from src.models import ProviderConfig
import httpx

RUN_URL = "https://api.wiro.ai/v1/Run/google/gemini-2-5-tts"
PREVIEW_TEXT = "Hey there! This is a quick voice preview so you can hear what I sound like. Pretty cool, right?"
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "voices" / "gemini"

GEMINI_VOICES = [
    "Achernar", "Achird", "Algenib", "Algieba", "Alnilam",
    "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
    "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus",
    "Kore", "Laomedeia", "Leda", "Orus", "Pulcherrima",
    "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
    "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi",
]

# Max concurrent requests to avoid overwhelming the API
CONCURRENCY = 5


async def generate_preview(client: WiroClient, voice: str, semaphore: asyncio.Semaphore) -> str:
    out_file = OUT_DIR / f"{voice.lower()}.mp3"
    if out_file.exists():
        print(f"  ✓ {voice} — already exists, skipping")
        return f"{voice}: skipped"

    async with semaphore:
        print(f"  ⏳ {voice} — submitting...")
        try:
            task = await client.run_and_poll(RUN_URL, {
                "prompt": PREVIEW_TEXT,
                "voice": voice,
            })

            urls = WiroClient.get_output_urls(task)
            if not urls:
                print(f"  ✗ {voice} — no audio output")
                return f"{voice}: no output"

            cdn_url = urls[0]
            async with httpx.AsyncClient(timeout=60.0) as http:
                resp = await http.get(cdn_url)
                resp.raise_for_status()

            with open(out_file, "wb") as f:
                f.write(resp.content)

            size_kb = len(resp.content) / 1024
            print(f"  ✓ {voice} — saved ({size_kb:.0f} KB)")
            return f"{voice}: ok"

        except Exception as e:
            print(f"  ✗ {voice} — error: {e}")
            return f"{voice}: error ({e})"


async def main():
    if not os.environ.get("WIRO_API_KEY") or not os.environ.get("WIRO_API_SECRET"):
        print("Error: Set WIRO_API_KEY and WIRO_API_SECRET environment variables")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    config = ProviderConfig(
        provider="wiro",
        api_key_env="WIRO_API_KEY",
        extra={"api_secret_env": "WIRO_API_SECRET"},
    )
    client = WiroClient(config)
    semaphore = asyncio.Semaphore(CONCURRENCY)

    print(f"Generating previews for {len(GEMINI_VOICES)} Gemini voices...")
    print(f"Output: {OUT_DIR}")
    print(f"Concurrency: {CONCURRENCY}\n")

    tasks = [generate_preview(client, voice, semaphore) for voice in GEMINI_VOICES]
    results = await asyncio.gather(*tasks)

    print(f"\n--- Results ---")
    ok = sum(1 for r in results if "ok" in r)
    skipped = sum(1 for r in results if "skipped" in r)
    errors = sum(1 for r in results if "error" in r or "no output" in r)
    print(f"  OK: {ok}  |  Skipped: {skipped}  |  Errors: {errors}")


if __name__ == "__main__":
    asyncio.run(main())

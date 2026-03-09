from __future__ import annotations

from pathlib import Path

import httpx

from src.models import ProviderConfig
from src.providers.base import VideoGenProvider
from src.providers.wiro_client import WiroClient

RUN_URL = "https://api.wiro.ai/v1/Run/pruna/p-video"


class WiroVideoProvider(VideoGenProvider):
    """Wiro-based video provider using pruna/p-video."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        self.client = WiroClient(config)
        self.ratio = config.extra.get("video_ratio", "16:9")
        self.resolution = config.extra.get("video_gen_resolution", "720p")
        self.fps = config.extra.get("video_gen_fps", "24")
        self.draft = config.extra.get("video_draft", "false")
        self.prompt_upsampling = config.extra.get("video_prompt_upsampling", "true")

    async def generate_video(self, prompt: str, output_path: Path, duration: int = 5) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "prompt": prompt,
            "ratio": self.ratio,
            "duration": min(max(duration, 1), 10),
            "resolution": self.resolution,
            "fps": self.fps,
            "seed": "0",
            "saveAudio": "false",
            "draft": self.draft,
            "promptUpsampling": self.prompt_upsampling,
        }

        task = await self.client.run_and_poll(RUN_URL, payload)

        urls = WiroClient.get_output_urls(task)
        if not urls:
            raise RuntimeError("No video output from Wiro task.")

        async with httpx.AsyncClient(timeout=120.0) as http:
            resp = await http.get(urls[0])
            resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(resp.content)

        return output_path

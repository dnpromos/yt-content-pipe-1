from __future__ import annotations

from pathlib import Path

import httpx

from src.models import ProviderConfig
from src.providers.base import ImageProvider
from src.providers.wiro_client import WiroClient

RUN_URL = "https://api.wiro.ai/v1/Run/google/nano-banana-2"


class WiroImageProvider(ImageProvider):
    """Wiro-based image provider using google/nano-banana-pro."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        self.client = WiroClient(config)
        self.aspect_ratio = config.extra.get("aspect_ratio", "16:9")
        self.resolution = config.extra.get("resolution", "2K")
        self.safety_setting = config.extra.get("safety_setting", "OFF")

    async def generate_image(self, prompt: str, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "prompt": prompt,
            "aspectRatio": self.aspect_ratio,
            "resolution": self.resolution,
            "safetySetting": self.safety_setting,
        }

        task = await self.client.run_and_poll(RUN_URL, payload)

        urls = WiroClient.get_output_urls(task)
        if not urls:
            raise RuntimeError("No image output from Wiro task.")

        async with httpx.AsyncClient(timeout=60.0) as http:
            resp = await http.get(urls[0])
            resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(resp.content)

        return output_path

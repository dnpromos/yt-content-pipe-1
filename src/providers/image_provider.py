from __future__ import annotations

import os
from pathlib import Path

import httpx
from openai import AsyncOpenAI

from src.models import ProviderConfig
from src.providers.base import ImageProvider


class OpenAIImageProvider(ImageProvider):
    """OpenAI DALL-E provider for image generation."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        api_key = os.environ.get(config.api_key_env, "")
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = config.model or "dall-e-3"
        self.size = config.size or "1792x1024"

    async def generate_image(self, prompt: str, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        response = await self.client.images.generate(
            model=self.model,
            prompt=prompt,
            size=self.size,
            quality="hd",
            n=1,
        )

        image_url = response.data[0].url

        async with httpx.AsyncClient() as http:
            img_response = await http.get(image_url)
            img_response.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(img_response.content)

        return output_path

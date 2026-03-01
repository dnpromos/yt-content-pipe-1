from __future__ import annotations

import json
import os

from openai import AsyncOpenAI

from src.models import ProviderConfig, Script, Section
from src.providers.base import LLMProvider

SYSTEM_PROMPT = """\
You are a professional YouTube script writer specializing in engaging listicle videos.
You produce structured JSON scripts that are informative, entertaining, and optimized for voiceover narration.
Keep narration conversational and punchy. Each section should be self-contained but flow naturally into the next.
"""

USER_PROMPT_TEMPLATE = """\
Create a listicle YouTube video script about: "{topic}"

Requirements:
- Exactly {num_sections} numbered sections
- An engaging intro narration (2-3 sentences that hook the viewer)
- Each section needs: a short heading, narration text (3-5 sentences), and a descriptive image prompt for AI image generation
- A brief outro narration (1-2 sentences with a call to action)
- Image prompts should be vivid, detailed, and suitable for AI image generation (cinematic, high quality)

Respond ONLY with valid JSON in this exact format:
{{
  "title": "Video Title Here",
  "intro_narration": "Welcome to... hook the viewer...",
  "sections": [
    {{
      "number": 1,
      "heading": "Section Heading",
      "narration": "Detailed narration text for this section...",
      "image_prompt": "A vivid description for AI image generation, cinematic lighting, high detail"
    }}
  ],
  "outro_narration": "Thanks for watching... call to action..."
}}
"""


class OpenAILLMProvider(LLMProvider):
    """OpenAI-based LLM provider for script generation."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        api_key = os.environ.get(config.api_key_env, "")
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = config.model or "gpt-4o"

    async def generate_script(
        self, topic: str, num_sections: int, subtitles: list[str] | None = None,
    ) -> Script:
        user_prompt = USER_PROMPT_TEMPLATE.format(
            topic=topic, num_sections=num_sections
        )

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        data = json.loads(content)

        sections = []
        for s in data["sections"]:
            if not s.get("image_prompt"):
                heading = s.get("heading", "")
                s["image_prompt"] = (
                    f"A cinematic, high-quality illustration representing: {heading}. "
                    f"Professional photography style, dramatic lighting, 16:9 aspect ratio."
                )
            sections.append(Section(**s))

        return Script(
            title=data.get("title", topic),
            intro_narration=data.get("intro_narration", ""),
            sections=sections,
            outro_narration=data.get("outro_narration", ""),
        )

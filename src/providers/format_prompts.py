"""Format-specific LLM prompt templates for script generation."""

# ---------------------------------------------------------------------------
# Formats that tell a continuous story — visual continuity across sections
# ---------------------------------------------------------------------------
CONTINUOUS_FORMATS = {"true_crime", "history", "story"}

# ---------------------------------------------------------------------------
# Shared JSON schema
# ---------------------------------------------------------------------------
_JSON_SCHEMA = """\
{{
  "title": "catchy video title",
  "intro_narration": "intro narration following the length guidelines above",
  "intro_image_prompt": "{intro_image_style}",
  "sections": [
    {{
      "number": 1,
      "heading": "section heading",
      "narration": "{narration_example}",
      "image_prompts": [
        "{first_image_style}",
        "{second_image_style}"
      ],
      "video_prompts": [
        "{first_video_style}",
        "{second_video_style}"
      ]
    }}
  ],
  "outro_narration": "outro narration following the length guidelines above",
  "outro_image_prompt": "{outro_image_style}"
}}"""

# ---------------------------------------------------------------------------
# Shared visual storytelling rules (appended for all formats)
# ---------------------------------------------------------------------------
_IMAGE_NARRATIVE_BEATS = (
    "- image_prompts: REQUIRED array of exactly {images_per_section} prompts per section\n"
    "  - When multiple images per section, they must follow narrative beats:\n"
    "    - Image 1: ESTABLISH the subject or scene (the setup)\n"
    "    - Image 2: ZOOM INTO a key detail, reaction, or turning point (the focus)\n"
    "    - Image 3+: Show the RESULT, consequence, or aftermath (the payoff)\n"
    "  - Each prompt must be a single detailed sentence, unique and strictly relevant"
)

_VIDEO_MOTION_RULES = (
    "- video_prompts: REQUIRED array of exactly {videos_per_section} prompts per section\n"
    "  - Every video prompt MUST describe camera movement and action — NEVER a static scene, NO TEXT or words in any video\n"
    "  - Use cinematic language: 'Slow dolly forward revealing...', 'Tracking shot following...', "
    "'Aerial pull-back showing...', 'Time-lapse of...', 'Push-in close-up on...'\n"
    "  - Within a section, video clips must form a CONTINUOUS VISUAL SEQUENCE:\n"
    "    - Clip 1 sets up the scene with an establishing movement\n"
    "    - Clip 2 pushes deeper into a detail or follows the action\n"
    "    - Clip 3+ reveals the outcome or transitions to the next beat\n"
    "  - Each clip should feel like the NEXT SHOT in a film, not a disconnected scene"
)

_CONTINUITY_RULES = (
    "- CROSS-SECTION VISUAL CONTINUITY (critical):\n"
    "  - This is a continuous story — all image and video prompts must share a coherent visual world\n"
    "  - Maintain the SAME characters, locations, and visual motifs across sections\n"
    "  - Each section's visuals should feel like the next scene in a film, not a separate shoot\n"
    "  - Evolve lighting and mood across the story arc:\n"
    "    - Early sections: neutral or warm tones, establishing atmosphere\n"
    "    - Middle sections: rising tension — darker, more dramatic lighting, tighter framing\n"
    "    - Climax sections: peak intensity — harsh contrast, extreme angles, saturated color\n"
    "    - Final sections: resolution — softer light, wider shots, calmer palette"
)

_PACING_RULES = (
    "- EMOTIONAL PACING in visuals:\n"
    "  - Intro: curiosity and intrigue — wide establishing shots, mysterious or inviting mood\n"
    "  - Early sections: build familiarity — medium shots, steady camera, warm tones\n"
    "  - Mid sections: escalate tension — tighter framing, dynamic angles, cooler/darker tones\n"
    "  - Late sections: climax — dramatic close-ups, high contrast, intense color\n"
    "  - Outro: resolution — return to wide shots, golden/warm lighting, sense of closure"
)

# ---------------------------------------------------------------------------
# Per-format configuration
# ---------------------------------------------------------------------------

FORMATS = {
    "listicle": {
        "label": "Listicle",
        "continuous": False,
        "system_prompt": (
            "You are an engaging YouTube script writer. Output ONLY valid JSON, nothing else.\n"
            "Write narration that sounds natural when read aloud — conversational, vivid, and entertaining.\n"
            "Image prompts should be one detailed sentence each.\n"
            "Video prompts must always describe camera movement and action."
        ),
        "narration_example": "Start with 'Number One, heading!' then narration following the length guidelines above",
        "intro_image_style": "eye-catching YouTube thumbnail with short catchy bold white text in the center of the image related to the topic, vibrant colorful background, dramatic lighting, high contrast, clickbait style, 16:9",
        "first_image_style": "detailed image with bold text overlay reading the section heading in the center, cinematic lighting, high quality",
        "second_image_style": "close-up detail shot revealing a key aspect of the subject, NO TEXT, purely visual, cinematic lighting",
        "first_video_style": "Slow push-in on the subject establishing the scene, cinematic lighting, smooth camera movement",
        "second_video_style": "Orbiting tracking shot around the subject revealing details from a new angle, dynamic camera, cinematic",
        "outro_image_style": "cinematic image relevant to the video topic with a semi-transparent subscribe button and like/thumbs-up button overlaid in the bottom corner, 16:9",
        "rules": (
            "- Each section narration MUST begin with announcing the number and heading like "
            "\"Number One, FlowState AI!\" or \"Number Three, CodeWhisper Pro!\"\n"
            "- The FIRST image_prompt per section MUST include bold readable text overlay of the section heading\n"
            "- All OTHER image prompts must have NO TEXT — purely visual imagery"
        ),
    },
    "true_crime": {
        "label": "True Crime",
        "continuous": True,
        "system_prompt": (
            "You are a compelling true-crime documentary narrator. Output ONLY valid JSON, nothing else.\n"
            "Write narration that is suspenseful, gripping, and mysterious — like a Netflix documentary.\n"
            "Use dramatic pauses, rhetorical questions, and cliffhangers between sections.\n"
            "Image prompts should describe dark, moody, cinematic scenes.\n"
            "Video prompts must describe camera movement — tracking shots, slow reveals, push-ins — never static."
        ),
        "narration_example": "Suspenseful narration that flows naturally into the next chapter, building tension",
        "intro_image_style": "dark cinematic thumbnail with mysterious shadowy figure or crime scene tape, bold white text hook in center, noir lighting, 16:9",
        "first_image_style": "dark moody establishing shot of the scene — a dimly lit location tied to the chapter, noir shadows, atmospheric fog, NO TEXT",
        "second_image_style": "tight close-up on a critical detail or piece of evidence from the scene, shallow depth of field, dramatic shadows, NO TEXT",
        "first_video_style": "Slow tracking shot through the dimly lit scene, camera creeping forward, noir shadows, building suspense",
        "second_video_style": "Gradual push-in close-up on a key piece of evidence or a shadowy figure, rack focus, tension building",
        "outro_image_style": "haunting cinematic wide shot, dim lighting, unresolved atmosphere, subscribe overlay in corner, 16:9",
        "rules": (
            "- Narration should flow like a documentary — NO numbered announcements\n"
            "- Each section is a chapter in the story, building suspense toward the next\n"
            "- End each section with a cliffhanger or dramatic question to keep viewers hooked\n"
            "- ALL image and video prompts must be atmospheric, moody, cinematic — NO TEXT in any image"
        ),
    },
    "history": {
        "label": "History / Documentary",
        "continuous": True,
        "system_prompt": (
            "You are an authoritative yet engaging history documentary narrator. Output ONLY valid JSON, nothing else.\n"
            "Write narration that is educational, rich with historical detail, and tells a compelling story.\n"
            "Use vivid descriptions to bring historical events to life.\n"
            "Image prompts should describe historical scenes, archival-style imagery, or cinematic recreations.\n"
            "Video prompts must describe camera movement through historical settings — pans across battlefields, "
            "slow reveals of monuments, tracking shots through period locations."
        ),
        "narration_example": "Historically accurate narration that flows chronologically, rich with period detail and storytelling",
        "intro_image_style": "epic cinematic historical scene with bold title text overlay, dramatic lighting, period-accurate, 16:9",
        "first_image_style": "wide cinematic establishing shot of the historical setting for this chapter, period-accurate architecture and atmosphere, dramatic lighting, NO TEXT",
        "second_image_style": "close-up on a historically significant detail — a document, weapon, face, or artifact from this chapter, period-accurate, NO TEXT",
        "first_video_style": "Sweeping aerial or dolly shot establishing the historical location, period-accurate environment, golden hour lighting",
        "second_video_style": "Slow push-in on a historically significant artifact or figure, shallow depth of field, dramatic period lighting",
        "outro_image_style": "sweeping cinematic historical landscape or monument, golden hour lighting, subscribe overlay in corner, 16:9",
        "rules": (
            "- Narration should flow chronologically like a documentary — NO numbered announcements\n"
            "- Each section covers a key period, event, or figure in the story\n"
            "- Use transitions between sections that connect historical events naturally\n"
            "- ALL image and video prompts must be historically themed, cinematic — NO TEXT in any image"
        ),
    },
    "tutorial": {
        "label": "Tutorial / How-To",
        "continuous": False,
        "system_prompt": (
            "You are a clear, friendly, and expert tutorial presenter. Output ONLY valid JSON, nothing else.\n"
            "Write narration that is instructional, easy to follow, and encouraging.\n"
            "Break complex topics into simple steps. Use direct language like 'First, you'll want to...'.\n"
            "Image prompts should describe clean, well-lit instructional visuals.\n"
            "Video prompts must describe camera movement showing the process — top-down shots, push-ins on details, "
            "smooth pans across workspaces."
        ),
        "narration_example": "Clear step-by-step instruction following the length guidelines, friendly and encouraging tone",
        "intro_image_style": "clean modern thumbnail with bold text showing the tutorial topic, bright professional lighting, 16:9",
        "first_image_style": "clean overhead or medium shot showing the setup for this step, bright even lighting, professional, NO TEXT",
        "second_image_style": "close-up on the key detail or result of this step, sharp focus, clean background, NO TEXT",
        "first_video_style": "Smooth overhead tracking shot showing hands performing this step, bright even lighting, clean workspace",
        "second_video_style": "Push-in close-up on the result or key detail of this step, shallow depth of field, professional lighting",
        "outro_image_style": "polished final result shot with subscribe and like buttons overlaid in corner, bright lighting, 16:9",
        "rules": (
            "- Narration should be step-by-step — NO numbered countdown announcements\n"
            "- Use natural transitions like 'Next, we'll...' or 'Now that we have that set up...'\n"
            "- Each section is a logical step in the process\n"
            "- ALL image and video prompts must be clean, instructional visuals — NO TEXT in any image"
        ),
    },
    "story": {
        "label": "Story / Narrative",
        "continuous": True,
        "system_prompt": (
            "You are a masterful storyteller and YouTube narrator. Output ONLY valid JSON, nothing else.\n"
            "Write narration that is immersive, vivid, and emotionally engaging — like a great audiobook.\n"
            "Use descriptive language, character development, and dramatic pacing.\n"
            "Image prompts should describe cinematic, story-driven visuals with consistent characters and settings.\n"
            "Video prompts must describe camera movement that follows the action — tracking characters, "
            "revealing environments, building tension through motion."
        ),
        "narration_example": "Immersive narrative that draws the viewer into the story, vivid and emotionally engaging",
        "intro_image_style": "cinematic widescreen thumbnail with dramatic scene and bold hook text in center, atmospheric lighting, 16:9",
        "first_image_style": "wide cinematic establishing shot capturing the setting and mood of this chapter, atmospheric lighting, NO TEXT",
        "second_image_style": "intimate close-up on a character's expression or a pivotal story moment, emotional lighting, shallow depth of field, NO TEXT",
        "first_video_style": "Slow cinematic establishing shot of the chapter's setting, atmospheric lighting, steady camera revealing the scene",
        "second_video_style": "Tracking shot following the main action or character, dynamic camera matching the emotional intensity of the moment",
        "outro_image_style": "atmospheric closing shot with reflective mood, subscribe overlay in corner, cinematic lighting, 16:9",
        "rules": (
            "- Narration should flow as continuous storytelling — NO numbered announcements\n"
            "- Each section is a chapter that advances the narrative arc\n"
            "- Build emotional tension and release across chapters\n"
            "- ALL image and video prompts must be cinematic, story-driven — NO TEXT in any image\n"
            "- Describe the SAME characters and settings consistently across all sections"
        ),
    },
    "essay": {
        "label": "Video Essay",
        "continuous": False,
        "system_prompt": (
            "You are a thoughtful, analytical video essayist. Output ONLY valid JSON, nothing else.\n"
            "Write narration that is intellectual, persuasive, and thought-provoking.\n"
            "Present arguments, counterarguments, and insights with a clear thesis.\n"
            "Image prompts should describe conceptual, artistic, or symbolic visuals.\n"
            "Video prompts must describe camera movement through visual metaphors — slow reveals of symbols, "
            "abstract transitions, contemplative camera work."
        ),
        "narration_example": "Analytical narration that builds an argument, thought-provoking and well-structured",
        "intro_image_style": "artistic conceptual thumbnail with bold thesis text in center, modern design, thought-provoking imagery, 16:9",
        "first_image_style": "conceptual or symbolic wide shot representing this argument point, artistic lighting, NO TEXT",
        "second_image_style": "different visual metaphor — an abstract or symbolic close-up reinforcing the argument, NO TEXT, artistic composition",
        "first_video_style": "Slow contemplative dolly shot establishing a visual metaphor for this point, artistic lighting, moody atmosphere",
        "second_video_style": "Smooth push-in on a symbolic detail that reinforces the argument, shallow depth of field, artistic composition",
        "outro_image_style": "thought-provoking closing visual with subscribe overlay in corner, artistic composition, 16:9",
        "rules": (
            "- Narration should flow as a cohesive essay — NO numbered announcements\n"
            "- Each section presents a key argument, point, or perspective\n"
            "- Use intellectual transitions that connect ideas logically\n"
            "- ALL image and video prompts must be conceptual, artistic, or symbolic — NO TEXT in any image"
        ),
    },
}


def _build_json_block(f: dict) -> str:
    """Render the JSON schema with format-specific examples."""
    return _JSON_SCHEMA.format(
        intro_image_style=f["intro_image_style"],
        narration_example=f["narration_example"],
        first_image_style=f["first_image_style"],
        second_image_style=f["second_image_style"],
        first_video_style=f["first_video_style"],
        second_video_style=f["second_video_style"],
        outro_image_style=f["outro_image_style"],
    )


def _build_media_rules(
    f: dict, images_per_section: int, videos_per_section: int = 1,
) -> str:
    """Build the image + video + continuity + pacing rules block."""
    parts = [
        _IMAGE_NARRATIVE_BEATS.format(images_per_section=images_per_section),
        _VIDEO_MOTION_RULES.format(videos_per_section=videos_per_section),
    ]
    if f.get("continuous"):
        parts.append(_CONTINUITY_RULES)
    parts.append(_PACING_RULES)
    return "\n".join(parts)


def build_user_prompt(
    fmt: str, topic: str, num_sections: int,
    style_instruction: str, length_instruction: str,
    images_per_section: int, videos_per_section: int = 1,
) -> str:
    """Build the user prompt for a given format."""
    f = FORMATS.get(fmt, FORMATS["listicle"])

    json_block = _build_json_block(f)
    format_rules = f["rules"]
    media_rules = _build_media_rules(f, images_per_section, videos_per_section)
    section_label = "sections" if fmt == "listicle" else "chapters"

    return (
        f'Create a {f["label"].lower()} script about: "{topic}"\n'
        f"{style_instruction}\n"
        f"{length_instruction}\n\n"
        f"Return ONLY this JSON (no other text):\n"
        f"{json_block}\n\n"
        f"Rules:\n"
        f"- Exactly {num_sections} {section_label}\n"
        f"- STRICTLY follow the VIDEO LENGTH guidelines above for narration length in intro, sections, and outro\n"
        f"- intro_image_prompt: must be an eye-catching YouTube thumbnail with short catchy bold text centered in the image\n"
        f"{format_rules}\n"
        f"{media_rules}\n"
        f"- outro_image_prompt: must be a visually striking image RELEVANT to the video topic, with subscribe and like buttons overlaid in a corner\n"
        f"- All narration should sound natural when spoken aloud"
    )


def build_custom_prompt(
    fmt: str, topic: str, num_sections: int,
    style_instruction: str, length_instruction: str,
    images_per_section: int, custom_instructions: str,
    videos_per_section: int = 1,
) -> str:
    """Build a custom-instructions prompt for a given format."""
    f = FORMATS.get(fmt, FORMATS["listicle"])

    json_block = _build_json_block(f)
    format_rules = f["rules"]
    media_rules = _build_media_rules(f, images_per_section, videos_per_section)
    section_label = "sections" if fmt == "listicle" else "chapters"

    return (
        f"Use the following custom instructions to write the script:\n\n"
        f"--- CUSTOM INSTRUCTIONS ---\n"
        f"{custom_instructions}\n"
        f"--- END CUSTOM INSTRUCTIONS ---\n\n"
        f'Topic: "{topic}"\n'
        f"{style_instruction}\n"
        f"{length_instruction}\n\n"
        f"You MUST output ONLY valid JSON in this exact format (no other text):\n"
        f"{json_block}\n\n"
        f"Rules:\n"
        f"- Exactly {num_sections} {section_label}\n"
        f"- STRICTLY follow the VIDEO LENGTH guidelines above for narration length in intro, sections, and outro\n"
        f"- intro_image_prompt: must be an eye-catching YouTube thumbnail with short catchy bold text centered in the image\n"
        f"{format_rules}\n"
        f"{media_rules}\n"
        f"- All narration should sound natural when spoken aloud\n"
        f"- Follow the custom instructions above for content, tone, and structure — but always output the JSON format specified"
    )


def get_system_prompt(fmt: str) -> str:
    """Return the system prompt for a given format."""
    f = FORMATS.get(fmt, FORMATS["listicle"])
    return f["system_prompt"]

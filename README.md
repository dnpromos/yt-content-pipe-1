# yt-content-pipe


A Python pipeline that generates listicle YouTube videos by orchestrating LLM script writing, AI voice synthesis, AI image generation, and automated video assembly with effects.

## Pipeline

```
Topic → LLM Script → Voice + Images (parallel) → Video Assembly → final_video.mp4
```

## Features

- **LLM Script Generation** — structured listicle scripts with intro, numbered sections, and outro
- **Parallel Asset Generation** — voice and images generated concurrently via asyncio
- **Ken Burns Effect** — zoom/pan on still images for cinematic motion
- **Text Overlays** — section number badges, heading bars, title cards
- **Transitions** — crossfade, slide, or hard cut between sections
- **Pluggable Providers** — swap LLM, TTS, and image providers via config

## Prerequisites

- **Python 3.10+**
- **FFmpeg** — must be installed and on your PATH
  - Windows: `winget install FFmpeg` or download from https://ffmpeg.org
  - macOS: `brew install ffmpeg`
- API keys for your chosen AI providers

## Setup

```bash
# Clone and enter the project
cd yt-content-pipe

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit config
cp config.example.yaml config.yaml
# Edit config.yaml with your API keys and settings

# Set API key environment variable
# Windows:
set OPENAI_API_KEY=sk-your-key-here
# macOS/Linux:
export OPENAI_API_KEY=sk-your-key-here
```

## Usage

### Web UI (recommended)

```bash
streamlit run app.py
```

Opens at `http://localhost:8501`. Enter your API keys in the sidebar credentials section, configure voice/image/video settings, then either:
- **Step-by-step** — generate script → edit → generate assets → preview → assemble video
- **One-click** — run the full pipeline with a single button
- **Load previous runs** — resume from any `script.json`

### Full Pipeline (topic → video)

```bash
python -m src generate --topic "Top 5 AI Tools in 2026" --sections 5
```

### Script Only (no voice/image/video)

```bash
python -m src script --topic "Top 5 AI Tools in 2026" --sections 5
```

### Re-assemble Video (from existing script.json)

```bash
python -m src assemble --script output/run_20260301_230000/script.json
```

### Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--topic` | `-t` | required | Video topic |
| `--sections` | `-n` | 5 | Number of listicle sections |
| `--config` | `-c` | config.yaml | Config file path |
| `--output` | `-o` | output | Output base directory |

## Output Structure

Each run creates a timestamped directory:

```
output/run_20260301_230000/
├── script.json          # Generated script (reusable)
├── audio/
│   ├── intro.mp3
│   ├── section_01.mp3
│   ├── section_02.mp3
│   └── outro.mp3
├── images/
│   ├── section_01.png
│   └── section_02.png
└── final_video.mp4      # The final video
```

## Configuration

See `config.example.yaml` for all options. Key settings:

- **`video.transition`** — `crossfade`, `slide`, or `cut`
- **`video.ken_burns`** — enable/disable zoom effect on images
- **`video.transition_duration`** — seconds for each transition
- **Provider settings** — swap `provider` field to use different AI services

## Adding New Providers

1. Create a new class in the appropriate `src/providers/` file
2. Inherit from the base class (`LLMProvider`, `VoiceProvider`, or `ImageProvider`)
3. Register it in `PROVIDER_REGISTRY` in `src/pipeline.py`

## License

MIT

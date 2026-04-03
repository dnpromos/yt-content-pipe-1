# yt-content-pipe


source .venv/bin/activate
python3 server.py

cd /Users/onurozcan/Documents/GitHub/yt-content-pipe/web
npm run dev

A Python pipeline that generates listicle YouTube videos by orchestrating LLM script writing, AI voice synthesis, AI image generation, and automated video assembly with effects.

## Quick Start

```bash
git clone https://github.com/onurozcan/yt-content-pipe.git
cd yt-content-pipe
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit with your Wiro API credentials
streamlit run app.py
```

Opens at `http://localhost:8501`.

## Environment Variables

Create a `.env` file in the project root:

```env
WIRO_API_KEY=your-wiro-api-key
WIRO_API_SECRET=your-wiro-api-secret
```

You can also enter these in the sidebar credentials section of the UI.

## Prerequisites

- **Python 3.10+**
- **FFmpeg** — must be installed and on your PATH
  - macOS: `brew install ffmpeg`
  - Windows: `winget install FFmpeg`

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
- **Background Tasks** — generation runs in background threads, survives UI interactions
- **Hardware Encoding** — uses Apple VideoToolbox on macOS for fast GPU encoding

## Usage

### Web UI (recommended)

```bash
streamlit run app.py
```

- **Step-by-step** — generate script → edit → generate assets → preview → assemble video
- **One-click** — run the full pipeline with a single button
- **Load previous runs** — resume from any `script.json`

### CLI

```bash
# Full pipeline
python -m src generate --topic "Top 5 AI Tools in 2026" --sections 5

# Script only
python -m src script --topic "Top 5 AI Tools in 2026" --sections 5

# Re-assemble video from existing script
python -m src assemble --script output/run_20260301_230000/script.json
```

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

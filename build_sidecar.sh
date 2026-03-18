#!/bin/bash
# Build the Python backend as a standalone binary for Tauri sidecar
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Detect target triple
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

if [ "$OS" = "darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        TARGET_TRIPLE="aarch64-apple-darwin"
    else
        TARGET_TRIPLE="x86_64-apple-darwin"
    fi
elif [ "$OS" = "linux" ]; then
    TARGET_TRIPLE="x86_64-unknown-linux-gnu"
else
    TARGET_TRIPLE="x86_64-pc-windows-msvc"
fi

echo "Building sidecar for: $TARGET_TRIPLE"

# Activate venv
source .venv/bin/activate

# Install PyInstaller if not present
pip install pyinstaller -q

# Build the backend as a single binary
pyinstaller \
    --onefile \
    --name "python-backend-${TARGET_TRIPLE}" \
    --add-data "assets:assets" \
    --add-data "src:src" \
    --hidden-import uvicorn \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.protocols \
    --hidden-import uvicorn.protocols.http \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.lifespan \
    --hidden-import uvicorn.lifespan.on \
    --hidden-import uvicorn.loops \
    --hidden-import uvicorn.loops.auto \
    --hidden-import fastapi \
    --hidden-import PIL \
    --hidden-import httpx \
    --hidden-import pydantic \
    --hidden-import numpy \
    --collect-all moviepy \
    --collect-all imageio_ffmpeg \
    --collect-all imageio \
    --clean \
    --noconfirm \
    server.py

# Copy to Tauri binaries directory
BINARIES_DIR="web/src-tauri/binaries"
mkdir -p "$BINARIES_DIR"
cp "dist/python-backend-${TARGET_TRIPLE}" "$BINARIES_DIR/"

echo "Sidecar binary copied to $BINARIES_DIR/python-backend-${TARGET_TRIPLE}"
echo "Done!"

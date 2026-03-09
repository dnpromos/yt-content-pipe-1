# Build the Python backend as a standalone binary for Tauri sidecar (Windows)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Detect target triple
$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($Arch -eq "Arm64") {
    $TargetTriple = "aarch64-pc-windows-msvc"
} else {
    $TargetTriple = "x86_64-pc-windows-msvc"
}

Write-Host "Building sidecar for: $TargetTriple"

# Activate venv
if (Test-Path ".venv\Scripts\Activate.ps1") {
    & ".venv\Scripts\Activate.ps1"
} else {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
    & ".venv\Scripts\Activate.ps1"
}

# Install PyInstaller if not present
pip install pyinstaller -q

# Build the backend as a single binary
pyinstaller `
    --onefile `
    --name "python-backend-$TargetTriple" `
    --add-data "assets;assets" `
    --add-data "src;src" `
    --hidden-import uvicorn `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.protocols `
    --hidden-import uvicorn.protocols.http `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.http.h11_impl `
    --hidden-import uvicorn.protocols.http.httptools_impl `
    --hidden-import uvicorn.protocols.websockets `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.protocols.websockets.wsproto_impl `
    --hidden-import uvicorn.protocols.websockets.websockets_impl `
    --hidden-import uvicorn.lifespan `
    --hidden-import uvicorn.lifespan.on `
    --hidden-import uvicorn.lifespan.off `
    --hidden-import uvicorn.loops `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.loops.asyncio `
    --hidden-import fastapi `
    --hidden-import moviepy `
    --hidden-import PIL `
    --hidden-import httpx `
    --hidden-import pydantic `
    --hidden-import numpy `
    --clean `
    --noconfirm `
    server.py

# Copy to Tauri binaries directory
$BinariesDir = "web\src-tauri\binaries"
if (-not (Test-Path $BinariesDir)) {
    New-Item -ItemType Directory -Path $BinariesDir -Force | Out-Null
}
Copy-Item "dist\python-backend-$TargetTriple.exe" "$BinariesDir\"

Write-Host "Sidecar binary copied to $BinariesDir\python-backend-$TargetTriple.exe"
Write-Host "Done!"

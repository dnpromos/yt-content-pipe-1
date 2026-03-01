from __future__ import annotations

import os
from pathlib import Path

import yaml

from src.models import AppConfig


def load_config(path: str | Path = "config.yaml") -> AppConfig:
    """Load application configuration from a YAML file."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    return AppConfig(**raw)


def resolve_api_key(env_var: str) -> str:
    """Resolve an API key from an environment variable."""
    key = os.environ.get(env_var, "")
    if not key:
        raise EnvironmentError(
            f"Environment variable '{env_var}' is not set. "
            f"Please set it with your API key."
        )
    return key

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time

import httpx

from src.models import ProviderConfig
from src.log import emit as log

TERMINAL_STATUSES = {"task_postprocess_end", "task_cancel"}
RUNNING_STATUSES = {
    "task_queue",
    "task_accept",
    "task_assign",
    "task_preprocess_start",
    "task_preprocess_end",
    "task_start",
    "task_output",
}

POLL_INTERVAL = 2.0
MAX_POLL_ATTEMPTS = 300


class WiroClient:
    """Shared Wiro API client with HMAC-SHA256 auth, task submission, and polling."""

    def __init__(self, config: ProviderConfig) -> None:
        self.api_key = os.environ.get(config.api_key_env, "")
        self.api_secret = os.environ.get(
            config.extra.get("api_secret_env", "WIRO_API_SECRET"), ""
        )
        if not self.api_key:
            raise EnvironmentError(
                f"Wiro API key not set. Set env var: {config.api_key_env}"
            )
        if not self.api_secret:
            raise EnvironmentError(
                "Wiro API secret not set. Set env var: WIRO_API_SECRET"
            )

    def _make_headers(self) -> dict[str, str]:
        nonce = str(int(time.time()))
        message = self.api_secret + nonce
        signature = hmac.new(
            self.api_key.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return {
            "x-api-key": self.api_key,
            "x-nonce": nonce,
            "x-signature": signature,
        }

    async def submit_task(self, run_url: str, payload: dict) -> dict:
        """Submit a task to a Wiro model endpoint.

        Returns the run response dict with taskid and socketaccesstoken.
        """
        model_name = run_url.split("/")[-1] if "/" in run_url else run_url
        log(f"submit -> {model_name}")
        headers = self._make_headers()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                run_url,
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        if not data.get("result"):
            errors = data.get("errors", [])
            raise RuntimeError(f"Wiro task submission failed: {errors}")

        task_id = data.get("taskid", "?")
        log(f"task {task_id[:8]}... submitted")
        return data

    async def poll_task(self, task_id: str) -> dict:
        """Poll task detail until it reaches a terminal status.

        Returns the first task object from tasklist on success.
        Raises on cancellation or timeout.
        """
        short_id = task_id[:8]
        last_status = ""
        for attempt in range(MAX_POLL_ATTEMPTS):
            headers = self._make_headers()
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.wiro.ai/v1/Task/Detail",
                    headers=headers,
                    json={"taskid": task_id},
                )
                resp.raise_for_status()
                data = resp.json()

            tasklist = data.get("tasklist", [])
            if not tasklist:
                await asyncio.sleep(POLL_INTERVAL)
                continue

            task = tasklist[0]
            status = task.get("status", "")

            if status != last_status:
                log(f"task {short_id}... {status}")
                last_status = status

            if status == "task_postprocess_end":
                log(f"task {short_id}... done")
                return task
            elif status == "task_cancel":
                raise RuntimeError(f"Wiro task {task_id} was cancelled.")
            elif status in RUNNING_STATUSES:
                await asyncio.sleep(POLL_INTERVAL)
                continue
            else:
                await asyncio.sleep(POLL_INTERVAL)
                continue

        raise TimeoutError(
            f"Wiro task {task_id} did not complete after {MAX_POLL_ATTEMPTS} polls."
        )

    async def run_and_poll(self, run_url: str, payload: dict) -> dict:
        """Submit a task and poll until completion. Returns the completed task dict."""
        run_resp = await self.submit_task(run_url, payload)
        task_id = run_resp["taskid"]
        return await self.poll_task(task_id)

    @staticmethod
    def get_output_urls(task: dict) -> list[str]:
        """Extract output file URLs from a completed task."""
        outputs = task.get("outputs", [])
        return [o["url"] for o in outputs if "url" in o]

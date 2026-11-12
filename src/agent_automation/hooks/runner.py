"""The hooks of settings.yaml, run at the agent's events: the event goes in as JSON, and the exit code answers.

Exit 0 goes on, and JSON on standard output can change the step. Exit 2 stops it, with standard error as the reason. Any
other exit, a timeout, or a command that cannot start is reported and the agent goes on: a broken hook never stops a search.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from agent_automation.home import Home, Hook

EVENTS = ("session_start", "before_apply", "letter_written", "after_apply")
BLOCK = 2
# What a hook never sees: the keys to the model and the dashboard, and the account's password.
SECRET_WORDS = ("KEY", "TOKEN", "SECRET", "PASSWORD")


@dataclass
class Answer:
    """What the hooks of one event said: whether one stopped the step and why, and what they asked to change."""

    blocked: bool = False
    reason: str = ""
    changes: dict[str, Any] = field(default_factory=dict)


def _environment() -> dict[str, str]:
    return {name: value for name, value in os.environ.items() if not any(word in name.upper() for word in SECRET_WORDS)}


def _command(hook: Hook) -> list[str]:
    first, *rest = hook.run
    words = [sys.executable if first in ("python", "python3") else first]
    for word in rest:
        candidate = hook.folder / word
        words.append(str(candidate) if not os.path.isabs(word) and candidate.exists() else word)
    return words


async def _one(hook: Hook, payload: str, log: Callable[[str], None]) -> tuple[int, str, str]:
    try:
        process = await asyncio.create_subprocess_exec(
            *_command(hook), cwd=hook.folder, env=_environment(),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
    except OSError as error:
        log(f"hook {' '.join(hook.run)} ({hook.event}) did not start: {error}")
        return -1, "", ""
    try:
        out, err = await asyncio.wait_for(process.communicate(payload.encode()), hook.timeout)
    except TimeoutError:
        process.kill()
        await process.wait()
        log(f"hook {' '.join(hook.run)} ({hook.event}) took longer than {hook.timeout:g}s and was stopped")
        return -1, "", ""
    return process.returncode or 0, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


async def run_hooks(home: Home, event: str, payload: dict[str, Any], log: Callable[[str], None]) -> Answer:
    """Every hook of `event`, in order, until one stops the step."""
    if event not in EVENTS:
        raise ValueError(f"no hook event {event!r}: the events are {', '.join(EVENTS)}")
    answer = Answer()
    for hook in home.hooks(event):
        code, out, err = await _one(hook, json.dumps({"event": event, **payload}, ensure_ascii=False, default=str), log)
        if code == BLOCK:
            return Answer(True, err.strip() or f"a {event} hook said no", answer.changes)
        if code != 0:
            if code > 0:
                log(f"hook {' '.join(hook.run)} ({event}) failed with exit {code}: {err.strip()[:300]}")
            continue
        if out.strip():
            try:
                said = json.loads(out)
            except json.JSONDecodeError:
                log(f"hook {' '.join(hook.run)} ({event}) printed something that is not JSON: ignored")
                continue
            if isinstance(said, dict):
                answer.changes |= said
    return answer

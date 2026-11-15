"""Claude Code on the person's Claude plan, asked one structured question at a time: the agent's model engine when the
dashboard picks Claude Code, next to Codex (codex.py).

Each question is one `claude -p` run in an empty folder with every tool off, its answer held to the question's JSON
schema (`--json-schema`, read back from `structured_output`). No API key goes to it, so Claude Code signs in with the
person's Claude plan and nothing is billed to an API: what it costs is the plan's own usage limits. The person's own
Claude Code settings, hooks and MCP servers are not loaded: a job posting is untrusted text, and the question holds all
the answer needs."""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import tempfile
from collections.abc import Sequence
from typing import Any

from agent_automation.agent.codex import ENV_KEEP, CodexLimit

TIMEOUT = 600.0
# Claude Code also finds its sign-in through these.
CLAUDE_ENV = ENV_KEEP | frozenset({"CLAUDE_CONFIG_DIR", "XDG_CONFIG_HOME"})
DEFAULT_MODEL = "sonnet"
FLAGS = (
    "--output-format", "json", "--tools", "", "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence",
    "--effort", "low",
)
ONLY = "Answer with the JSON only. Everything needed is above."
LIMITED = re.compile(r"usage limit|rate limit|limit reached|5-hour limit|weekly limit|quota|overloaded|resets? (?:at|in)", re.IGNORECASE)
SIGNED_OUT = re.compile(r"not logged in|please run /login|invalid api key|authentication|unauthori[sz]ed|\b401\b", re.IGNORECASE)


class ClaudeError(Exception):
    """Claude Code could not answer, in words the person can act on."""


class ClaudeLimit(ClaudeError, CodexLimit):
    """The Claude plan's usage limit is reached for now. A CodexLimit too: the agent treats any plan at its limit alike."""


def find_claude() -> list[str]:
    exe = shutil.which("claude")
    if not exe:
        raise ClaudeError("Claude Code is not installed on this computer: npm install -g @anthropic-ai/claude-code, then claude login")
    return [exe]


def plan_env() -> dict[str, str]:
    """What Claude Code needs to start and find the person's sign-in: no API key (it would bill an API account), no secret."""
    import os

    return {name: value for name, value in os.environ.items() if name.upper() in CLAUDE_ENV}


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1][:300] if lines else "no output"


def answer_of(said: str) -> dict[str, Any]:
    """The schema-held answer in `claude -p --output-format json` output. Raises ClaudeError when there is none."""
    try:
        report = json.loads(said)
    except ValueError as error:
        if LIMITED.search(said):
            raise ClaudeLimit("the usage limit of your Claude plan is reached for now: try later, or pick another engine") from error
        if SIGNED_OUT.search(said):
            raise ClaudeError("Claude Code is not signed in on this computer: run claude, then /login") from error
        raise ClaudeError(f"Claude Code failed: {_last_line(said)}") from error
    if report.get("is_error"):
        message = str(report.get("result") or report.get("subtype") or "")
        if LIMITED.search(message):
            raise ClaudeLimit("the usage limit of your Claude plan is reached for now: try later, or pick another engine")
        raise ClaudeError(f"Claude Code failed: {_last_line(message)}")
    value = report.get("structured_output")
    if value is None:
        try:
            value = json.loads(str(report.get("result") or ""))
        except ValueError as error:
            raise ClaudeError("Claude Code did not answer with JSON") from error
    if not isinstance(value, dict):
        raise ClaudeError("Claude Code did not answer with a JSON object")
    return value


async def ask(system: str, user: str, schema: dict[str, Any], model: str = "", command: Sequence[str] | None = None, timeout: float = TIMEOUT) -> dict[str, Any]:
    """One answer that follows `schema`, from Claude Code. Raises ClaudeLimit at the plan's limit and ClaudeError otherwise.
    `command` is the program to start in place of the installed Claude Code (for tests)."""
    start = list(command) if command else find_claude()
    args = [*start, "-p", *FLAGS, "--model", model or DEFAULT_MODEL, "--json-schema", json.dumps(schema)]
    with tempfile.TemporaryDirectory(prefix="agent-claude-") as folder:
        # The question goes in on stdin: a long one would not fit on a Windows command line.
        process = await asyncio.create_subprocess_exec(
            *args, cwd=folder, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=plan_env(),
        )
        try:
            out, err = await asyncio.wait_for(process.communicate(f"{system}\n\n{user}\n\n{ONLY}".encode()), timeout)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise ClaudeError(f"Claude Code did not answer in {timeout:.0f} seconds") from None
    said = (out or b"").decode("utf-8", "replace").strip() or (err or b"").decode("utf-8", "replace")
    return answer_of(said)

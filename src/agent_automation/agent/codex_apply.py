"""Filling a form with Codex on the person's ChatGPT plan, when the dashboard's engine is Codex.

The same shape as claude_apply.py: Codex gets no tool of its own (every feature of codex.TOOLS_OFF is off: no shell, no
browser of its own, no computer use, no plugins, no web search) and only the browser, through this process's MCP server for
the form (claude_apply.drive), where every call goes through apply.Hands: the dry-run guard, the sent-page and mailbox stops,
the wait for typing. finish_form ends it. It runs in an empty folder, read-only, with the person's Codex config and rule
files left out, and the environment of codex.plan_env: no API key, no secret."""

from __future__ import annotations

import json
import shutil
from typing import Any

from agent_automation.agent.apply import Browser, Report, instructions
from agent_automation.agent.claude_apply import drive
from agent_automation.agent.codex import EFFORTS, TOOLS_OFF, CodexError, plan_env

# A browser call can wait minutes while a long answer is typed at a person's pace.
TOOL_SECONDS = 900
EFFORT = "medium"


def picked() -> tuple[str, str]:
    """The model and effort the dashboard picked for the plan's engine (llm.ENGINE), each "" for the default."""
    from agent_automation.agent.llm import ENGINE

    return ENGINE.model, ENGINE.effort


def command(url: str) -> list[str]:
    model, effort = picked()
    exe = shutil.which("codex")
    if not exe:
        raise CodexError("Codex is not installed on this computer: npm install -g @openai/codex, then codex login")
    return [
        exe, "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "-s", "read-only",
        "-c", f"mcp_servers.browser.url={json.dumps(url)}", "-c", f"mcp_servers.browser.tool_timeout_sec={TOOL_SECONDS}",
        "-c", "mcp_servers.browser.startup_timeout_sec=60", "-c", 'mcp_servers.browser.default_tools_approval_mode="approve"',
        "-c", 'approval_policy="never"', "-c", 'web_search="disabled"',
        "-c", f"model_reasoning_effort={effort if effort in EFFORTS else EFFORT}", *(["-m", model] if model else []),
        *(part for tool in TOOLS_OFF for part in ("--disable", tool)), "-",
    ]


def _codex_said(event: dict[str, Any]) -> str:
    """What Codex said in a JSON line: its messages, and why it stopped when it failed."""
    item = event.get("item") or {}
    if event.get("type") == "item.completed" and item.get("type") == "agent_message":
        return str(item.get("text") or "")
    if event.get("type") in ("turn.failed", "error"):
        error = event.get("error")
        return str((error.get("message") if isinstance(error, dict) else event.get("message")) or "Codex stopped with an error")
    return ""


async def fill_form_with_codex(session: Browser, tools: list[dict[str, Any]], brief: str, guidance: str = "", page_rules: str = "") -> Report:
    """Codex works on the open page until it calls finish_form, or the agent stops it; how the form ended."""
    prompt = (
        f"{instructions(guidance, page_rules)}\n\nYou act only through the browser tools of the `browser` MCP server. "
        f"End with finish_form, then stop.\n\n{brief}\n"
    )
    return await drive(session, tools, prompt, command, plan_env(), _codex_said, "Codex")

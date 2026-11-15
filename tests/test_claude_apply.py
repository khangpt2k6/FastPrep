"""Filling a form with Claude Code (agent/claude_apply.py): a stand-in for Claude Code that is a real MCP client over HTTP,
driving a scripted browser through the agent's checks."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import pytest

from agent_automation.agent import apply as apply_module
from agent_automation.agent import claude_apply
from agent_automation.agent.claude_apply import fill_form_with_claude
from fakes import ScriptedBrowser

TOOLS = [
    {"type": "function", "function": {"name": "browser_click", "description": "click", "parameters": {"type": "object", "properties": {"selector": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "browser_navigate", "description": "go", "parameters": {"type": "object", "properties": {"url": {"type": "string"}}}}},
]


def stand_in(tmp_path: Path, calls: list[tuple[str, dict[str, Any]]]) -> list[str]:
    """A program that connects to the URL in the agent's command, lists the tools, makes `calls` in order, and writes
    what it saw: the tool names and each answer's text."""
    script = tmp_path / "fake_claude.py"
    script.write_text(f'''
import asyncio, json, sys
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    url = sys.argv[1]
    sys.stdin.read()
    async with streamablehttp_client(url) as (read, write, _), ClientSession(read, write) as session:
        await session.initialize()
        names = [tool.name for tool in (await session.list_tools()).tools]
        answers = []
        for name, arguments in json.loads({json.dumps(json.dumps(calls))}):
            result = await session.call_tool(name, arguments)
            answers.append(" ".join(part.text for part in result.content if getattr(part, "type", "") == "text"))
    open({str(tmp_path / "seen.json")!r}, "w").write(json.dumps({{"names": names, "answers": answers}}))
    print(json.dumps({{"type": "result", "result": "done"}}))

asyncio.run(main())
''', encoding="utf-8")
    return [sys.executable, str(script)]


def run(tmp_path: Path, browser: ScriptedBrowser, calls: list[tuple[str, dict[str, Any]]]) -> tuple[Any, dict[str, Any]]:
    seen: dict[str, Any] = {}
    original = apply_module.instructions

    async def go() -> Any:
        # The stand-in reads its URL from argv: the real command line is built, then swapped for it.
        from agent_automation.agent import claude_apply

        def argv_for(url: str, model: str = "") -> list[str]:
            return [*stand_in(tmp_path, calls), url]

        claude_apply_command = claude_apply.command
        claude_apply.command = argv_for  # type: ignore[assignment]
        try:
            return await fill_form_with_claude(browser, TOOLS, "brief")  # type: ignore[arg-type]
        finally:
            claude_apply.command = claude_apply_command  # type: ignore[assignment]

    report = asyncio.run(go())
    apply_module.instructions = original
    seen_file = tmp_path / "seen.json"
    if seen_file.exists():
        seen = json.loads(seen_file.read_text(encoding="utf-8"))
    return report, seen


def test_claude_code_sees_only_the_browser_and_finish_form_and_its_report_comes_back(tmp_path: Path) -> None:
    browser = ScriptedBrowser({"#send": {"tag": "button", "text": "Submit"}})
    report, seen = run(tmp_path, browser, [
        ("browser_click", {"selector": "#first-name"}),
        ("finish_form", {"status": "ready", "summary": "Filled.", "submit_selector": "#send", "blocked_by": "", "made_account": False,
                         "written_answers": [{"question": "Why us?", "answer": "Mission."}]}),
    ])
    assert seen["names"] == ["browser_click", "browser_navigate", "finish_form"]
    assert ("browser_click", {"selector": "#first-name"}) in browser.calls
    assert report.status == "ready" and report.submit_selector == "#send" and report.written == (("Why us?", "Mission."),)
    assert "Recorded" in seen["answers"][-1]


def test_a_dry_run_keeps_its_guard_around_every_action(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(apply_module.DRY_RUN_ENV, "1")
    browser = ScriptedBrowser()
    report, _ = run(tmp_path, browser, [("browser_click", {"selector": "#next"}), ("finish_form", {"status": "blocked", "summary": "x", "submit_selector": "", "blocked_by": "other", "made_account": False, "written_answers": []})])
    guards = [i for i, (name, arguments) in enumerate(browser.calls) if name == "browser_evaluate" and "__aaDryRun" in arguments.get("expression", "")]
    click = browser.calls.index(("browser_click", {"selector": "#next"}))
    assert any(i < click for i in guards) and any(i > click for i in guards), "the guard is put in before and read after the click"
    assert report.status == "blocked"


def test_a_page_that_looks_sent_in_a_dry_run_stops_the_form(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(apply_module.DRY_RUN_ENV, "1")
    browser = ScriptedBrowser(page={"url": "https://jobs.example/apply/thanks", "text": ""})
    report, seen = run(tmp_path, browser, [("browser_click", {"selector": "#send"}), ("browser_click", {"selector": "#again"})])
    assert report.blocked_by == apply_module.SENT_IN_DRY_RUN
    assert "Stopped here" in seen["answers"][0] and "Stopped here" in seen["answers"][1]
    assert ("browser_click", {"selector": "#again"}) not in browser.calls


def test_ending_without_finish_form_is_a_stop_not_a_ready_form(tmp_path: Path) -> None:
    report, _ = run(tmp_path, ScriptedBrowser(), [("browser_click", {"selector": "#a"})])
    assert report.status == "blocked" and report.blocked_by == apply_module.STUCK


def test_claude_code_waits_for_the_browser_server_before_its_first_turn(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without MCP_CONNECTION_NONBLOCKING=0 the real CLI starts with the server "pending" and no tool, and the form ends
    stuck before it is touched (seen on 2026-11-15). The form filler's environment has it, and still no key."""
    seen: dict[str, dict[str, str]] = {}

    async def drive(session: Any, tools: Any, prompt: str, argv_for: Any, env: dict[str, str], read: Any, engine: str) -> str:
        seen["env"] = env
        return "report"

    monkeypatch.setattr(claude_apply, "drive", drive)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-not-for-claude")
    assert asyncio.run(claude_apply.fill_form_with_claude(None, [], "brief")) == "report"  # type: ignore[arg-type]
    assert seen["env"]["MCP_CONNECTION_NONBLOCKING"] == "0" and "OPENAI_API_KEY" not in seen["env"]

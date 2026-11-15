"""Filling a form with Codex (agent/codex_apply.py): its command line, its JSON lines, and a stand-in for Codex that is a
real MCP client over HTTP driving a scripted browser through the agent's checks."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import pytest

from agent_automation.agent import apply as apply_module
from agent_automation.agent import codex_apply
from agent_automation.agent.codex import TOOLS_OFF
from fakes import ScriptedBrowser
from test_claude_apply import TOOLS


def test_codex_gets_only_the_browser_server_with_its_tools_approved_and_everything_else_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(codex_apply.shutil, "which", lambda name: "/bin/codex")
    argv = codex_apply.command("http://127.0.0.1:5000/abc/mcp")
    assert argv[:3] == ["/bin/codex", "exec", "--json"] and argv[-1] == "-"
    assert {"--ignore-user-config", "--ignore-rules", "--ephemeral"} <= set(argv) and argv[argv.index("-s") + 1] == "read-only"
    settings = [argv[i + 1] for i, part in enumerate(argv) if part == "-c"]
    assert 'mcp_servers.browser.url="http://127.0.0.1:5000/abc/mcp"' in settings
    assert 'mcp_servers.browser.default_tools_approval_mode="approve"' in settings and 'approval_policy="never"' in settings
    assert 'web_search="disabled"' in settings
    off = {argv[i + 1] for i, part in enumerate(argv) if part == "--disable"}
    assert set(TOOLS_OFF) <= off and {"computer_use", "shell_tool", "browser_use"} <= off


def test_what_codex_said_is_its_messages_and_its_failures() -> None:
    assert codex_apply._codex_said({"type": "item.completed", "item": {"type": "agent_message", "text": "Filled."}}) == "Filled."
    assert codex_apply._codex_said({"type": "turn.failed", "error": {"message": "usage limit reached"}}) == "usage limit reached"
    assert codex_apply._codex_said({"type": "item.completed", "item": {"type": "mcp_tool_call"}}) == ""


def stand_in(tmp_path: Path, calls: list[tuple[str, dict[str, Any]]]) -> list[str]:
    """A program that reads the browser server's URL from Codex's own -c setting, makes `calls`, and prints JSON lines."""
    script = tmp_path / "fake_codex.py"
    script.write_text(f'''
import asyncio, json, sys
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    url = next(json.loads(a.split("=", 1)[1]) for a in sys.argv if a.startswith("mcp_servers.browser.url="))
    sys.stdin.read()
    async with streamablehttp_client(url) as (read, write, _), ClientSession(read, write) as session:
        await session.initialize()
        for name, arguments in json.loads({json.dumps(json.dumps(calls))}):
            await session.call_tool(name, arguments)
    print(json.dumps({{"type": "item.completed", "item": {{"type": "agent_message", "text": "I stopped."}}}}))

asyncio.run(main())
''', encoding="utf-8")
    return [sys.executable, str(script)]


def run(tmp_path: Path, browser: ScriptedBrowser, calls: list[tuple[str, dict[str, Any]]], monkeypatch: pytest.MonkeyPatch) -> Any:
    real = codex_apply.command

    def argv_for(url: str) -> list[str]:
        return [*stand_in(tmp_path, calls), *real(url)[1:]]

    monkeypatch.setattr(codex_apply.shutil, "which", lambda name: "/bin/codex")
    monkeypatch.setattr(codex_apply, "command", argv_for)
    return asyncio.run(codex_apply.fill_form_with_codex(browser, TOOLS, "brief"))  # type: ignore[arg-type]


def test_codex_fills_through_the_checks_and_its_report_comes_back(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(apply_module.DRY_RUN_ENV, "1")
    browser = ScriptedBrowser({"#send": {"tag": "button", "text": "Submit"}})
    report = run(tmp_path, browser, [
        ("browser_click", {"selector": "#name"}),
        ("finish_form", {"status": "ready", "summary": "Filled.", "submit_selector": "#send", "blocked_by": "", "made_account": False, "written_answers": []}),
    ], monkeypatch)
    assert report.status == "ready" and report.submit_selector == "#send"
    guards = [i for i, (name, arguments) in enumerate(browser.calls) if name == "browser_evaluate" and "__aaDryRun" in arguments.get("expression", "")]
    click = browser.calls.index(("browser_click", {"selector": "#name"}))
    assert any(i < click for i in guards) and any(i > click for i in guards)


def test_codex_ending_without_finish_form_says_what_it_said_last(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    report = run(tmp_path, ScriptedBrowser(), [("browser_click", {"selector": "#a"})], monkeypatch)
    assert report.status == "blocked" and report.blocked_by == apply_module.STUCK and "I stopped." in report.summary


def test_codex_fills_with_the_dashboards_model_and_effort(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_automation.agent.llm import ENGINE

    monkeypatch.setattr(codex_apply.shutil, "which", lambda name: "/bin/codex")
    monkeypatch.setattr(ENGINE, "model", "gpt-6.1-sol")
    monkeypatch.setattr(ENGINE, "effort", "high")
    argv = codex_apply.command("http://127.0.0.1:1/x/mcp")
    assert argv[argv.index("-m") + 1] == "gpt-6.1-sol" and "model_reasoning_effort=high" in argv
    monkeypatch.setattr(ENGINE, "model", "")
    monkeypatch.setattr(ENGINE, "effort", "")
    argv = codex_apply.command("http://127.0.0.1:1/x/mcp")
    assert "-m" not in argv and f"model_reasoning_effort={codex_apply.EFFORT}" in argv

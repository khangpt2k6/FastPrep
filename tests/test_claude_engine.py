"""Claude Code as the agent's engine (agent/claude_engine.py), with a stand-in for the CLI."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pytest

from agent_automation.agent import claude_engine
from agent_automation.agent.claude_engine import ClaudeError, ClaudeLimit, answer_of, ask

SCHEMA = {"type": "object", "properties": {"score": {"type": "number"}}, "required": ["score"]}


def fake(tmp_path: Path, printed: str, code: int = 0) -> list[str]:
    """A program that records its arguments, stdin and environment, prints `printed` and exits with `code`."""
    script = tmp_path / "fake_claude.py"
    script.write_text(
        "import json, os, sys\n"
        f"open({str(tmp_path / 'seen.json')!r}, 'w').write(json.dumps({{'argv': sys.argv[1:], 'stdin': sys.stdin.read(), "
        "'env': sorted(os.environ), 'cwd': os.getcwd()}))\n"
        f"print({printed!r})\nsys.exit({code})\n",
        encoding="utf-8",
    )
    return [sys.executable, str(script)]


def test_the_answer_is_the_schema_held_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    printed = json.dumps({"type": "result", "is_error": False, "result": '{"score": 4}', "structured_output": {"score": 4}})
    assert asyncio.run(ask("Score the jobs.", "Job: Python intern", SCHEMA, command=fake(tmp_path, printed))) == {"score": 4}
    seen = json.loads((tmp_path / "seen.json").read_text(encoding="utf-8"))
    argv = seen["argv"]
    assert argv[0] == "-p" and argv[argv.index("--tools") + 1] == "" and argv[argv.index("--model") + 1] == "sonnet"
    assert json.loads(argv[argv.index("--json-schema") + 1]) == SCHEMA and "--strict-mcp-config" in argv
    assert seen["stdin"].startswith("Score the jobs.\n\nJob: Python intern")
    assert "ANTHROPIC_API_KEY" not in seen["env"] and "OPENAI_API_KEY" not in seen["env"]
    assert Path(seen["cwd"]).name.startswith("agent-claude-")


def test_limits_sign_in_and_bad_answers_are_said_in_words() -> None:
    with pytest.raises(ClaudeLimit):
        answer_of("Claude AI usage limit reached|1763400000")
    with pytest.raises(ClaudeLimit):
        answer_of(json.dumps({"is_error": True, "result": "You've hit your 5-hour limit · resets 12:40am"}))
    with pytest.raises(ClaudeError, match="not signed in"):
        answer_of("Invalid API key · Please run /login")
    with pytest.raises(ClaudeError, match="JSON object"):
        answer_of(json.dumps({"is_error": False, "result": "[1, 2]"}))
    assert answer_of(json.dumps({"is_error": False, "result": '{"score": 2}'})) == {"score": 2}


def test_a_missing_claude_is_said(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(claude_engine.shutil, "which", lambda name: None)
    with pytest.raises(ClaudeError, match="not installed"):
        asyncio.run(ask("s", "u", SCHEMA))

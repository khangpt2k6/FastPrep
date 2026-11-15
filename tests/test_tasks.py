"""Dashboard tasks run by Claude Code or Codex on this computer (ui/tasks.py), with a fake table and fake engines."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from agent_automation.ui import tasks
from agent_automation.ui.tasks import TABLE, Progress, command, next_task, read_claude, recover


class Table:
    user_id = "u1"

    def __init__(self, *rows: dict[str, Any]) -> None:
        self.rows = [dict(row) for row in rows]

    @staticmethod
    def _matches(row: dict[str, Any], params: dict[str, str]) -> bool:
        for column, condition in params.items():
            if column in ("select", "order", "limit"):
                continue
            how, _, value = condition.partition(".")
            if how == "eq" and str(row.get(column)) != value:
                return False
        return True

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        assert table == TABLE
        return [dict(row) for row in self.rows if self._matches(row, params)][: int(params.get("limit", "100"))]

    async def update(self, table: str, params: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        changed = []
        for row in self.rows:
            if self._matches(row, params):
                row.update(values)
                changed.append(dict(row))
        return changed


def found(name: str) -> str:
    return f"/bin/{name}"


def claude_lines(*events: dict[str, Any]) -> list[str]:
    return [json.dumps(event) + "\n" for event in events]


def engine(lines: list[str], code: int = 0, cancel_after: int | None = None):
    seen: dict[str, Any] = {}

    async def run(argv: list[str], on_line, cancelled, stdin_text: str = "") -> int:
        seen["argv"] = argv
        for number, line in enumerate(lines):
            on_line(line)
            if cancel_after is not None and number == cancel_after:
                tasks.time.sleep(0)  # the write pace is checked by time: let the next check through
                seen["stopped"] = await cancelled()
                if seen["stopped"]:
                    return -1
        return code

    return run, seen


def test_claude_runs_with_the_rules_and_a_fixed_set_of_tools() -> None:
    argv = command("claude", "Prep me for the Morgan Stanley Superday", found)
    assert argv[:3] == ["/bin/claude", "-p", "Prep me for the Morgan Stanley Superday"]
    assert "stream-json" in argv and "--append-system-prompt" in argv
    allowed = argv[argv.index("--allowedTools") + 1 : argv.index("--disallowedTools")]
    assert "WebSearch" in allowed and "Bash(git push:*)" not in allowed
    assert "Bash(git push:*)" in argv[argv.index("--disallowedTools") + 1 :]
    assert argv[argv.index("--setting-sources") + 1] == "project" and argv[argv.index("--permission-mode") + 1] == "default"
    settings = json.loads(argv[argv.index("--settings") + 1])
    assert "Read(**/.env)" in settings["permissions"]["deny"] and "Bash" not in settings["permissions"]["allow"]
    codex = command("codex", "x", found)
    assert codex[:3] == ["/bin/codex", "exec", "--json"] and codex[-1] == "-"
    off = [codex[i + 1] for i, part in enumerate(codex) if part == "--disable"]
    assert {"computer_use", "browser_use", "plugins"} <= set(off) and "shell_tool" not in off
    assert codex[codex.index("-s") + 1] == "workspace-write"
    assert tasks.stdin_for("codex", "x").endswith("Task: x" + chr(10)) and tasks.stdin_for("claude", "x") == ""
    with pytest.raises(RuntimeError, match="Codex is not installed"):
        command("codex", "x", lambda name: None)


def test_the_stream_gives_the_step_the_words_and_the_answer() -> None:
    progress = Progress()
    for line in claude_lines(
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "Looking at your mail."}]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Grep", "input": {"pattern": "Superday"}}]}},
    ):
        read_claude(line, progress)
    assert progress.step == "Grep: Superday" and progress.output == "Looking at your mail."
    read_claude(json.dumps({"type": "result", "subtype": "success", "result": "Here is your plan.", "num_turns": 4, "duration_ms": 9000}), progress)
    assert progress.output == "Here is your plan." and not progress.failed and progress.note.startswith("4 turns")
    read_claude("not json", progress)


def test_a_pending_task_is_claimed_run_and_ended_with_the_answer() -> None:
    db = Table({"id": 1, "user_id": "u1", "engine": "claude", "prompt": "hi", "status": "pending", "created_at": "1"})
    run, seen = engine(claude_lines({"type": "result", "subtype": "success", "result": "Hello.", "num_turns": 1}))
    assert asyncio.run(next_task(db, run, found)) == "done"
    row = db.rows[0]
    assert row["status"] == "done" and row["output"] == "Hello." and row["started_at"] and row["finished_at"]
    assert seen["argv"][0] == "/bin/claude"
    assert asyncio.run(next_task(db, run, found)) is None


def test_an_engine_that_is_missing_or_fails_says_so_on_the_row() -> None:
    db = Table({"id": 2, "user_id": "u1", "engine": "codex", "prompt": "x", "status": "pending", "created_at": "1"})
    run, _ = engine([])
    assert asyncio.run(next_task(db, run, lambda name: None)) == "failed"
    assert "Codex is not installed" in db.rows[0]["error"]
    db = Table({"id": 3, "user_id": "u1", "engine": "claude", "prompt": "x", "status": "pending", "created_at": "1"})
    run, _ = engine(claude_lines({"type": "result", "subtype": "error_max_turns", "result": "", "is_error": True}), code=1)
    assert asyncio.run(next_task(db, run, found)) == "failed" and db.rows[0]["status"] == "failed"


def test_a_task_cancelled_on_the_page_is_stopped_and_stays_cancelled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tasks, "WRITE_EVERY", 0.0)
    db = Table({"id": 4, "user_id": "u1", "engine": "claude", "prompt": "long", "status": "pending", "created_at": "1"})
    lines = claude_lines({"type": "assistant", "message": {"content": [{"type": "text", "text": "Working."}]}})

    async def run(argv, on_line, cancelled, stdin_text: str = "") -> int:
        on_line(lines[0])
        assert await cancelled() is False  # still running: its words are written
        assert db.rows[0]["output"] == "Working."
        db.rows[0]["status"] = "cancelled"  # the page's Cancel
        assert await cancelled() is True
        return -1

    assert asyncio.run(next_task(db, run, found)) == "cancelled"
    assert db.rows[0]["status"] == "cancelled" and db.rows[0]["finished_at"]


def test_a_task_left_running_by_an_earlier_run_ends_as_failed() -> None:
    db = Table({"id": 5, "user_id": "u1", "status": "running"}, {"id": 6, "user_id": "u1", "status": "done"})
    asyncio.run(recover(db))
    assert [row["status"] for row in db.rows] == ["failed", "done"]


def test_no_api_key_reaches_the_engines(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    seen: dict[str, Any] = {}

    async def fake_exec(*argv: str, **kwargs: Any) -> Any:
        seen.update(kwargs["env"])
        raise RuntimeError("stop here")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    with pytest.raises(RuntimeError, match="stop here"):
        asyncio.run(tasks.run_process(["claude"], lambda line: None, lambda: asyncio.sleep(0, False)))
    assert "OPENAI_API_KEY" not in seen and "ANTHROPIC_API_KEY" not in seen and seen["PYTHONIOENCODING"] == "utf-8"


def test_the_codex_stream_gives_the_step_and_the_last_message_as_the_answer() -> None:
    progress = Progress()
    wrapped = '"C:/WINDOWS/powershell.exe" -Command "rg --files src"'
    lines = [
        {"type": "thread.started", "thread_id": "t"},
        {"type": "item.completed", "item": {"type": "agent_message", "text": "I'll count the files."}},
        {"type": "item.started", "item": {"type": "command_execution", "command": wrapped}},
        {"type": "item.completed", "item": {"type": "agent_message", "text": "9"}},
        {"type": "turn.completed", "usage": {"input_tokens": 1000, "output_tokens": 20}},
    ]
    for event in lines[:3]:
        tasks.read_codex(json.dumps(event), progress)
    assert progress.step == "Run: rg --files src"
    for event in lines[3:]:
        tasks.read_codex(json.dumps(event), progress)
    assert progress.output == "9" and progress.note == "1,020 tokens of plan usage" and not progress.failed
    tasks.read_codex(json.dumps({"type": "turn.failed", "error": {"message": "usage limit reached"}}), progress)
    assert progress.failed and progress.note == "usage limit reached"
    tasks.read_codex("Reading additional input from stdin...", progress)


def test_each_step_lands_on_the_timeline_with_what_it_gave_back() -> None:
    progress = Progress()
    claude = [
        {"type": "assistant", "message": {"content": [{"type": "thinking", "thinking": "Need the calendar rows."}]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "python read.py"}}]}},
        {"type": "user", "message": {"content": [{"type": "tool_result", "content": "2 events"}]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Grep", "input": {"pattern": "calendar"}}]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "TodoWrite", "input": {"todos": []}}]}},
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "Two interviews."}]}},
    ]
    for event in claude:
        read_claude(json.dumps(event), progress)
    assert [(e["kind"], e["text"]) for e in progress.events][:4] == [
        ("think", "Need the calendar rows."), ("run", "python read.py"), ("search", "calendar"), ("tool", "TodoWrite: {\"todos\": []}")]
    assert progress.events[1]["detail"] == "2 events" and progress.events[-1]["kind"] == "say"
    codex = Progress()
    for event in [
        {"type": "item.completed", "item": {"type": "reasoning", "text": "Counting."}},
        {"type": "item.started", "item": {"type": "command_execution", "command": "rg --files"}},
        {"type": "item.completed", "item": {"type": "command_execution", "command": "rg --files", "aggregated_output": "a.py\nb.py"}},
        {"type": "item.completed", "item": {"type": "file_change", "changes": [{"path": "notes.md"}]}},
    ]:
        tasks.read_codex(json.dumps(event), codex)
    assert [e["kind"] for e in codex.events] == ["think", "run", "edit"] and codex.events[1]["detail"] == "a.py\nb.py"


def test_the_steps_are_left_out_while_the_table_has_no_events_column(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    monkeypatch.setattr(tasks, "_events_column", True)
    db = Table({"id": 7, "user_id": "u1", "engine": "claude", "prompt": "hi", "status": "pending", "created_at": "1"})
    plain = db.update

    async def update(table: str, params: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        if "events" in values:
            request = httpx.Request("PATCH", "https://x/rest/v1/automation_tasks")
            raise httpx.HTTPStatusError("400", request=request, response=httpx.Response(400, json={"code": "PGRST204"}, request=request))
        return await plain(table, params, values)

    db.update = update  # type: ignore[method-assign]
    run, _ = engine(claude_lines({"type": "result", "subtype": "success", "result": "Hello.", "num_turns": 1}))
    assert asyncio.run(next_task(db, run, found)) == "done"
    assert db.rows[0]["output"] == "Hello." and "events" not in db.rows[0] and tasks._events_column is False

"""Filling a form with Claude Code on the person's Claude plan, when the dashboard's engine is Claude Code.

Claude Code gets no tool of its own (no shell, no files): only the browser, through a small MCP server this process runs
for the length of one form, on 127.0.0.1 under a random path. Each call it makes goes through apply.Hands, the same checks
the API's model goes through: the dry-run guard before and after every action, the stop at a page that looks sent during a
dry run, the mailbox's two visits and its sign-in, the wait for long typing. finish_form is one more tool there; its report
is what apply.run_on_page goes on with, exactly as with the API: in a dry run nothing is sent, otherwise the code clicks
the send control itself and reads the page after it.

No API key goes to Claude Code (claude_engine.plan_env): nothing is billed to an API, only the plan's usage limits."""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import shutil
import socket
import tempfile
import time
from collections.abc import Callable
from contextlib import suppress
from typing import Any

import uvicorn
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

from agent_automation.agent.apply import (
    FINISH_TOOL,
    LOOP_STOP,
    NOTE,
    STUCK,
    Browser,
    Hands,
    Report,
    _blocked,
    _not_one,
    _Watch,
    instructions,
    written_answers,
)
from agent_automation.agent.claude_engine import EFFORTS, ClaudeError, picked, plan_env

MODEL = "sonnet"
# The MCP server's own lines (a session started, a request served) would fill the agent's log at every step.
for _name in ("mcp.server.streamable_http", "mcp.server.streamable_http_manager", "mcp.server.lowlevel.server", "uvicorn.error"):
    logging.getLogger(_name).setLevel(logging.WARNING)
# One form's limits: its steps (each a browser call) and its time.
STEP_LIMIT = 250
FORM_SECONDS = 45 * 60
# After finish_form, how long Claude Code may take to end its turn before it is stopped.
END_GRACE = 30.0
ROLE = (
    "You fill one job application form in a web browser, for the candidate, through the browser tools only. The first "
    "message holds your instructions, the job, the CV and the answers. Follow it. End with finish_form, then stop."
)
FINISHED = "Recorded. The form is done on your side: stop now, with no further tool calls."
STOPPED = "Stopped here by the agent: {why} Make no further tool calls."


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _contents(result: Any, said: str) -> list[types.TextContent | types.ImageContent]:
    """What the model reads of a tool's result: its pictures, then the words Hands made of it."""
    out: list[types.TextContent | types.ImageContent] = [
        types.ImageContent(type="image", data=part.data, mimeType=getattr(part, "mimeType", "image/png"))
        for part in getattr(result, "content", None) or [] if getattr(part, "type", "") == "image"
    ]
    out.append(types.TextContent(type="text", text=said or "Done: what it shows comes next."))
    return out


class _Form:
    """One form's MCP server: the browser's tools and finish_form, each call through Hands, until a report is in."""

    def __init__(self, session: Browser, tools: list[dict[str, Any]]) -> None:
        self.session = session
        self.watch = _Watch()
        self.hands = Hands(session, self.watch)
        self.report: Report | None = None
        self.done = asyncio.Event()
        self.tools = [
            types.Tool(name=t["function"]["name"], description=t["function"].get("description") or t["function"]["name"],
                       inputSchema=t["function"].get("parameters") or {"type": "object", "properties": {}})
            for t in [*tools, FINISH_TOOL]
        ]
        self.server: Server = Server("browser")
        self.server.list_tools()(self._list)
        self.server.call_tool(validate_input=False)(self._call)

    async def _list(self) -> list[types.Tool]:
        return self.tools

    def _end(self, report: Report) -> None:
        if self.report is None:
            self.report = report
        self.done.set()

    async def _call(self, name: str, arguments: dict[str, Any] | None) -> list[types.TextContent | types.ImageContent]:
        arguments = arguments or {}
        if self.done.is_set():
            return [types.TextContent(type="text", text=STOPPED.format(why="the form is already finished."))]
        self.watch.turn()
        if self.watch.turns > STEP_LIMIT:
            self._end(_blocked(f"Stopped after {STEP_LIMIT} browser steps without finishing the form.", STUCK, self.watch.turns))
            return [types.TextContent(type="text", text=STOPPED.format(why="too many steps."))]
        if name == "finish_form":
            if arguments.get("status") == "ready" and (doubt := await _not_one(self.session, str(arguments.get("submit_selector", "")))):
                self.watch.saw(name, arguments, doubt)
                return [types.TextContent(type="text", text=doubt)]
            self._end(Report(
                str(arguments.get("status", "")), str(arguments.get("summary", "")), str(arguments.get("submit_selector", "")),
                str(arguments.get("blocked_by") or ""), bool(arguments.get("made_account")), self.watch.turns, written_answers(arguments),
            ))
            return [types.TextContent(type="text", text=FINISHED)]
        if note := NOTE.get():
            note(f"Claude Code: {name}")
        result, said, stop = await self.hands.act(name, arguments)
        if stop is not None:
            self._end(stop)
            return [types.TextContent(type="text", text=STOPPED.format(why=stop.summary))]
        self.watch.saw(name, arguments, said)
        if cycle := self.watch._repeats(LOOP_STOP):
            calls = ", ".join(call.name for call in self.watch.calls[-cycle:])
            self._end(_blocked(f"Stopped going round in circles: {calls}, the same {cycle} call(s) {LOOP_STOP} times in a row.", STUCK, self.watch.turns))
            return [types.TextContent(type="text", text=STOPPED.format(why="the same calls keep repeating."))]
        return _contents(result, said)


async def _serve(form: _Form, path: str, port: int) -> tuple[uvicorn.Server, asyncio.Task[None], Any]:
    manager = StreamableHTTPSessionManager(app=form.server, json_response=True, stateless=True)

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http" and scope["path"].rstrip("/") == path:
            await manager.handle_request(scope, receive, send)
        elif scope["type"] == "http":
            await send({"type": "http.response.start", "status": 404, "headers": []})
            await send({"type": "http.response.body", "body": b""})

    running = manager.run()
    await running.__aenter__()
    web = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="off", access_log=False))
    task = asyncio.create_task(web.serve())
    for _ in range(100):
        if web.started:
            break
        await asyncio.sleep(0.05)
    return web, task, running


def command(url: str, model: str = "") -> list[str]:
    exe = shutil.which("claude")
    if not exe:
        raise ClaudeError("Claude Code is not installed on this computer: npm install -g @anthropic-ai/claude-code, then claude login")
    config = {"mcpServers": {"browser": {"type": "http", "url": url}}}
    return [
        exe, "-p", "--output-format", "stream-json", "--verbose", "--system-prompt", ROLE, "--tools", "",
        "--mcp-config", json.dumps(config), "--strict-mcp-config", "--allowedTools", "mcp__browser",
        "--setting-sources", "project", "--permission-mode", "default", "--no-session-persistence",
        "--model", model or picked()[0] or MODEL, *(["--effort", effort] if (effort := picked()[1]) in EFFORTS else []),
    ]


async def drive(session: Browser, tools: list[dict[str, Any]], prompt: str, argv_for: Callable[[str], list[str]], env: dict[str, str],
                read: Callable[[dict[str, Any]], str], engine: str) -> Report:
    """One engine at work on the open page through this process's browser server: `argv_for(url)` starts it, `prompt` goes
    in on stdin, `read` turns each JSON line it prints into what it said ("" for nothing). It ends at finish_form (with
    END_GRACE to end its turn), at a stop the checks make, or after FORM_SECONDS. How the form ended."""
    form = _Form(session, tools)
    path, port = f"/{secrets.token_urlsafe(18)}/mcp", _free_port()
    web, task, running = await _serve(form, path, port)
    said: list[str] = []
    try:
        args = argv_for(f"http://127.0.0.1:{port}{path}")
        with tempfile.TemporaryDirectory(prefix="agent-form-") as folder:
            process = await asyncio.create_subprocess_exec(
                *args, cwd=folder, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                env=env, limit=8 * 1024 * 1024,
            )
            assert process.stdin is not None and process.stdout is not None
            process.stdin.write(prompt.encode())
            await process.stdin.drain()
            process.stdin.close()
            started, finished_at = time.monotonic(), None
            while True:
                try:
                    raw = await asyncio.wait_for(process.stdout.readline(), timeout=1.0)
                except TimeoutError:
                    raw = None
                if raw == b"":
                    break
                if raw:
                    with suppress(ValueError):
                        event = json.loads(raw)
                        if isinstance(event, dict) and (words := read(event)):
                            said.append(words)
                if form.done.is_set() and finished_at is None:
                    finished_at = time.monotonic()
                if (finished_at and time.monotonic() - finished_at > END_GRACE) or time.monotonic() - started > FORM_SECONDS:
                    break
            if process.returncode is None:
                with suppress(ProcessLookupError):
                    process.kill()
            await process.wait()
    finally:
        web.should_exit = True
        with suppress(Exception):
            await asyncio.wait_for(task, 10)
        with suppress(Exception):
            await running.__aexit__(None, None, None)
    if form.report is not None:
        return form.report
    why = " ".join(said[-2:]).strip() or f"{engine} ended without calling finish_form."
    return _blocked(f"{engine} stopped before the form was done: {why[:300]}", STUCK, form.watch.turns)


def _claude_said(event: dict[str, Any]) -> str:
    return str(event.get("result") or event.get("subtype") or "") if event.get("type") == "result" else ""


async def fill_form_with_claude(session: Browser, tools: list[dict[str, Any]], brief: str, guidance: str = "", page_rules: str = "",
                                model: str = "") -> Report:
    """Claude Code works on the open page until it calls finish_form, or the agent stops it; how the form ended."""
    prompt = f"{instructions(guidance, page_rules)}\n\n{brief}\n"
    return await drive(session, tools, prompt, lambda url: command(url, model), claude_env(), _claude_said, "Claude Code")


def claude_env() -> dict[str, str]:
    """Claude Code's environment for a form: the plan's, and its MCP servers connected before the first turn. Without that,
    Claude Code starts with the browser server still "pending" and no tool at all, says what it would do, and ends: the
    form was never touched (two applications ended "stuck" that way on 2026-11-15)."""
    return {**plan_env(), "MCP_CONNECTION_NONBLOCKING": "0"}

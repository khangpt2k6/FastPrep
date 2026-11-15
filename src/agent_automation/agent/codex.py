"""Codex on the person's ChatGPT plan, asked one structured question at a time: the agent's model engine when the
dashboard picks Codex.

Each question is one `codex exec` run in an empty folder, read-only, its answer held to the question's JSON schema. No API
key goes to it, so Codex signs in with the person's ChatGPT plan and nothing is billed to the API: what it costs is the
plan's own usage limits. A run takes several seconds where the API takes one, and every run carries Codex's own
instructions (some 16k tokens of the plan's limits), so the agent asks Codex only its structured questions: scores, cover
letters, resume reading, company names. Filling a form stays on the API, which drives Chrome step by step with tools.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any

TIMEOUT = 600.0
# The only variables Codex gets: what it needs to start, reach the network and find the person's sign-in. No API key (it
# would bill an API account instead of the plan) and none of the agent's own secrets (Supabase, Gmail).
ENV_KEEP = frozenset({
    "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "APPDATA",
    "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "ALLUSERSPROFILE", "PUBLIC", "TEMP", "TMP",
    "USERNAME", "USERDOMAIN", "COMPUTERNAME", "OS", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "CODEX_HOME", "LANG", "LC_ALL",
    "TERM", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
})
# Codex's tools, all off: a question is answered from its own words. Job postings are untrusted text, and a tool would let
# one that says "run this" or "open that page" act on the person's computer or send their data out.
TOOLS_OFF = (
    "shell_tool", "unified_exec", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "in_app_browser",
    "apps", "plugins", "remote_plugin", "image_generation", "skill_search",
)
# The reasoning efforts Codex takes, from the lightest.
EFFORTS = ("low", "medium", "high", "xhigh", "max", "ultra")
# No web search, and nothing from the person's own Codex config or rule files: the question holds all it needs.
FLAGS = (
    "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "-s", "read-only",
    "-c", 'web_search="disabled"', *(part for tool in TOOLS_OFF for part in ("--disable", tool)),
)
ONLY = "Answer with the JSON only. Run no commands and read no files: everything needed is above."
LIMITED = re.compile(r"usage limit|rate limit|quota|too many requests|limit reached|try again (?:at|in)", re.IGNORECASE)
SIGNED_OUT = re.compile(r"not logged in|codex login|unauthori[sz]ed|\b401\b", re.IGNORECASE)


class CodexError(Exception):
    """Codex could not answer, in words the person can act on."""


class CodexLimit(CodexError):
    """The ChatGPT plan's Codex usage limit is reached for now."""


def find_codex() -> list[str]:
    """The command that starts Codex. Raises when it is not installed."""
    exe = shutil.which("codex")
    if not exe:
        raise CodexError("Codex is not installed on this computer: npm install -g @openai/codex, then codex login")
    return [exe]


def plan_env() -> dict[str, str]:
    """The variables of ENV_KEEP from this process's environment: Codex signs in with the person's ChatGPT plan, and
    sees no key or secret."""
    return {name: value for name, value in os.environ.items() if name.upper() in ENV_KEEP}


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1][:300] if lines else "no output"


async def ask(
    system: str, user: str, schema: dict[str, Any], model: str = "", command: Sequence[str] | None = None, timeout: float = TIMEOUT, effort: str = "",
) -> dict[str, Any]:
    """One answer that follows `schema`, from Codex. Raises CodexLimit at the plan's limit and CodexError otherwise.
    `command` is the program to start in place of the installed Codex (for tests)."""
    start = list(command) if command else find_codex()
    with tempfile.TemporaryDirectory(prefix="agent-codex-") as folder:
        where = Path(folder)
        (where / "schema.json").write_text(json.dumps(schema), encoding="utf-8")
        answer = where / "answer.json"
        args = [*start, "exec", *FLAGS, "-C", folder, "--output-schema", str(where / "schema.json"), "-o", str(answer)]
        # Low effort unless the dashboard picked one: a structured question rarely needs more.
        args += ["-c", f"model_reasoning_effort={effort if effort in EFFORTS else 'low'}"]
        if model:
            args += ["-m", model]
        # The question goes in on stdin ("-"): a long one would not fit on a Windows command line.
        process = await asyncio.create_subprocess_exec(
            *args, "-", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=plan_env(),
        )
        try:
            out, err = await asyncio.wait_for(process.communicate(f"{system}\n\n{user}\n\n{ONLY}".encode()), timeout)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise CodexError(f"Codex did not answer in {timeout:.0f} seconds") from None
        said = (err or b"").decode("utf-8", "replace") + "\n" + (out or b"").decode("utf-8", "replace")
        if process.returncode != 0 or not answer.is_file():
            if LIMITED.search(said):
                raise CodexLimit("the Codex usage limit of your ChatGPT plan is reached for now: try later, or set the engine to API")
            if SIGNED_OUT.search(said):
                raise CodexError("Codex is not signed in on this computer: run codex login")
            raise CodexError(f"Codex failed: {_last_line(said)}")
        text = answer.read_text(encoding="utf-8").strip()
    try:
        value = json.loads(text)
    except ValueError as error:
        raise CodexError("Codex did not answer with JSON") from error
    if not isinstance(value, dict):
        raise CodexError("Codex did not answer with a JSON object")
    return value

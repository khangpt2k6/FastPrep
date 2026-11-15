"""The form filler's debugging aid: with AGENT_STEP_SHOTS set, each step's page is kept and logged, typed values left out."""

from __future__ import annotations

import asyncio
import base64
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from agent_automation.agent.apply import STEP_SHOTS_ENV, _step_shot

PNG = base64.b64encode(b"\x89PNG fake").decode()


class Page:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        if self.fail:
            raise RuntimeError("the browser went away")
        return SimpleNamespace(content=[SimpleNamespace(type="image", data=PNG)])


def test_each_step_is_kept_as_a_picture_and_a_line_without_what_was_typed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(STEP_SHOTS_ENV, str(tmp_path / "shots"))
    asyncio.run(_step_shot(Page(), 3, "browser_type", {"selector": "#email", "text": "ada@example.com"}, "Typed.\nThe field holds it."))
    assert (tmp_path / "shots" / "003-browser_type.png").read_bytes() == b"\x89PNG fake"
    log = (tmp_path / "shots" / "steps.log").read_text(encoding="utf-8")
    assert "003 browser_type" in log and "#email" in log and "Typed. The field holds it." in log
    assert "ada@example.com" not in log


def test_without_the_folder_nothing_is_kept_and_a_broken_browser_never_stops_the_form(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(STEP_SHOTS_ENV, raising=False)
    asyncio.run(_step_shot(Page(fail=True), 1, "browser_click", {}, ""))
    monkeypatch.setenv(STEP_SHOTS_ENV, str(tmp_path / "shots"))
    asyncio.run(_step_shot(Page(fail=True), 1, "browser_click", {"selector": "#go"}, "Clicked."))
    assert not list((tmp_path / "shots").glob("*.png")) and "browser_click" in (tmp_path / "shots" / "steps.log").read_text(encoding="utf-8")

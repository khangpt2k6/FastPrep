"""The model picker's back end with no network: the models this computer's engines offer, the model and effort the page
picks, and Codex asked with them."""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

from agent_automation.agent import codex
from agent_automation.agent.llm import ENGINE
from agent_automation.agent.session import Session
from agent_automation.ui.worker import Settings, model_catalog, settings_from
from test_worker import Remote, agent_for, session_at


@pytest.fixture(autouse=True)
def engine_back() -> Iterator[None]:
    saved = (ENGINE.name, ENGINE.model, ENGINE.effort)
    yield
    ENGINE.name, ENGINE.model, ENGINE.effort = saved


@pytest.fixture
def session(tmp_path: Path) -> Iterator[Session]:
    made = session_at(tmp_path / "home")
    yield made
    made.close()


def level(effort: str) -> dict[str, str]:
    return {"effort": effort, "description": effort}


def test_the_catalog_lists_the_codex_models_the_plan_shows_and_claudes(tmp_path: Path) -> None:
    (tmp_path / "models_cache.json").write_text(json.dumps({"models": [
        {"slug": "gpt-6.1-sol", "display_name": "GPT-6.1-Sol", "description": "Workhorse.", "visibility": "list",
         "default_reasoning_level": "low", "supported_reasoning_levels": [level("low"), level("max"), level("nonsense")]},
        {"slug": "gpt-hidden", "display_name": "Hidden", "visibility": "hide", "supported_reasoning_levels": []},
        {"slug": "bad name; rm", "display_name": "Bad", "visibility": "list", "supported_reasoning_levels": []},
    ]}), encoding="utf-8")
    catalog = model_catalog(tmp_path)
    assert catalog["codex"] == [{"id": "gpt-6.1-sol", "name": "GPT-6.1-Sol", "description": "Workhorse.", "efforts": ["low", "max"], "effort": "low"}]
    assert [m["id"] for m in catalog["claude"]] == ["claude-opus-5-5", "claude-fable-5-2", "claude-sonnet-5-5", "claude-haiku-5-5"]
    # No cache: no Codex models, Claude's still.
    assert model_catalog(tmp_path / "nowhere")["codex"] == [] and len(model_catalog(tmp_path / "nowhere")["claude"]) == 4


def test_the_page_picks_the_engines_model_and_effort_and_nothing_else_gets_through() -> None:
    picked = settings_from({"engine": "codex", "engine_model": "gpt-6-luna", "engine_effort": "max"})
    assert (picked.engine, picked.engine_model, picked.engine_effort) == ("codex", "gpt-6-luna", "max")
    odd = settings_from({"engine": "claude", "engine_model": "x --dangerously-skip-permissions", "engine_effort": "turbo"})
    assert (odd.engine_model, odd.engine_effort) == ("", "")
    assert (settings_from(None).engine_model, settings_from(None).engine_effort) == ("", "")


def test_the_engine_takes_the_model_only_from_a_database_that_has_it(session: Session) -> None:
    agent = agent_for(session, Remote())
    agent.use_engine(Settings(engine="claude", engine_model="claude-sonnet-5-5", engine_effort="high"))
    assert (ENGINE.name, ENGINE.model, ENGINE.effort) == ("claude", "claude-sonnet-5-5", "high")
    agent.support.models = False
    agent.use_engine(Settings(engine="claude", engine_model="claude-sonnet-5-5", engine_effort="high"))
    assert (ENGINE.model, ENGINE.effort) == ("", "")


FAKE = """
import json, sys
args = sys.argv[1:]
sys.stdin.read()
seen = {"model": args[args.index("-m") + 1] if "-m" in args else "", "effort": [a for a in args if a.startswith("model_reasoning_effort=")]}
open(args[args.index("-o") + 1], "w", encoding="utf-8").write(json.dumps(seen))
"""


def test_codex_is_asked_with_the_picked_model_and_effort_and_low_effort_otherwise(tmp_path: Path) -> None:
    fake = tmp_path / "codex.py"
    fake.write_text(FAKE, encoding="utf-8")
    run = [sys.executable, str(fake)]
    picked = asyncio.run(codex.ask("s", "u", {}, "gpt-6-astra", command=run, effort="xhigh"))
    assert picked == {"model": "gpt-6-astra", "effort": ["model_reasoning_effort=xhigh"]}
    plain = asyncio.run(codex.ask("s", "u", {}, command=run, effort="bogus"))
    assert plain == {"model": "", "effort": ["model_reasoning_effort=low"]}

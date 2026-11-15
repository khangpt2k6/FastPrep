"""The AI engine and its budget with no network: Codex answers the structured questions on the person's plan, the API
is counted in dollars, and at the budget the agent takes no new work that goes to the API."""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from agent_automation.agent import codex, llm
from agent_automation.agent.apply import Outcome
from agent_automation.agent.llm import BUDGET, ENGINE, SPEND, BudgetReached, structured
from agent_automation.agent.session import Session
from agent_automation.memory.config import DRY_RUN_ENV
from agent_automation.memory.store import Stored
from agent_automation.ui import worker
from agent_automation.ui.worker import Settings, needs_api, settings_from
from test_worker import Remote, agent_for, scored, session_at


@pytest.fixture(autouse=True)
def clean_counts() -> Iterator[None]:
    """SPEND, BUDGET and ENGINE are the process's own: each test starts from zero and leaves them so."""
    saved = (SPEND.total, SPEND.calls, dict(SPEND.tokens), ENGINE.name, ENGINE.runs, dict(SPEND.by_kind), dict(ENGINE.by_kind))
    SPEND.total, SPEND.calls, SPEND.tokens, SPEND.by_kind = 0.0, 0, {}, {}
    ENGINE.use("api")
    ENGINE.runs, ENGINE.by_kind = 0, {}
    BUDGET.day = BUDGET.month = None
    BUDGET.start(0.0, 0.0)
    yield
    SPEND.total, SPEND.calls, SPEND.tokens, ENGINE.name, ENGINE.runs = saved[0], saved[1], saved[2], saved[3], saved[4]
    SPEND.by_kind, ENGINE.by_kind = saved[5], saved[6]
    BUDGET.day = BUDGET.month = None
    BUDGET.start(0.0, 0.0)


@pytest.fixture
def session(tmp_path: Path) -> Iterator[Session]:
    made = session_at(tmp_path / "home")
    yield made
    made.close()


class Ledger(Remote):
    """The test Remote, also taking "gte." filters (the usage table's month)."""

    @staticmethod
    def _matches(row: dict[str, Any], params: dict[str, str]) -> bool:
        plain = {column: condition for column, condition in params.items() if not condition.startswith("gte.")}
        floors = {column: condition[4:] for column, condition in params.items() if condition.startswith("gte.")}
        return Remote._matches(row, plain) and all(str(row.get(column)) >= floor for column, floor in floors.items())


def answer(content: str, prompt: int = 1000, completion: int = 100) -> Any:
    usage = SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion, prompt_tokens_details=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))], usage=usage)


def api_client(content: str = '{"x": 1}') -> Any:
    asked: list[dict[str, Any]] = []

    async def create(**request: Any) -> Any:
        asked.append(request)
        return answer(content)

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)), asked=asked)


# The gateway: prices, the budget's line, the engine.


def test_the_api_is_counted_in_dollars_at_openais_price() -> None:
    client = api_client()
    assert asyncio.run(structured(client, "gpt-5.4-mini", "s", "u", "n", {})) == {"x": 1}
    # 1000 prompt tokens at $0.75 a million and 100 completion tokens at $4.50 a million.
    assert SPEND.total == pytest.approx(0.0012) and SPEND.calls == 1


def test_at_the_budget_new_work_stops_and_the_gateway_lets_a_form_end_within_its_margin() -> None:
    BUDGET.day, BUDGET.month = 1.0, 20.0
    BUDGET.start(day_before=1.10, month_before=5.0)
    assert BUDGET.reached() == "today's AI budget ($1.00) is used up"
    # Past the budget but within its margin (a quarter, at least 25 cents): a form under way still gets its answers.
    assert BUDGET.reached(hard=True) == ""
    assert asyncio.run(structured(api_client(), "gpt-5.4-mini", "s", "u", "n", {})) == {"x": 1}
    BUDGET.start(day_before=1.30, month_before=5.0)
    with pytest.raises(BudgetReached, match="today's AI budget"):
        asyncio.run(structured(api_client(), "gpt-5.4-mini", "s", "u", "n", {}))
    BUDGET.day = None
    BUDGET.start(day_before=1.30, month_before=25.5)
    assert BUDGET.reached(hard=True) == "this month's AI budget ($20.00) is used up"


def test_with_the_codex_engine_codex_answers_and_the_form_fillers_checks_stay_on_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[tuple[str, str]] = []

    async def ask(system: str, user: str, schema: dict[str, Any], model: str = "", effort: str = "") -> dict[str, Any]:
        asked.append((system, user))
        return {"from": "codex"}

    monkeypatch.setattr(codex, "ask", ask)
    ENGINE.use("codex")
    # Past any budget: Codex is the person's plan, not the API.
    BUDGET.day = 0.0
    client = api_client()
    assert asyncio.run(structured(client, "gpt-5.4-mini", "rules", "jobs", "verdicts", {})) == {"from": "codex"}
    assert asked == [("rules", "jobs")] and ENGINE.runs == 1 and client.asked == [] and SPEND.total == 0
    BUDGET.day = None
    assert asyncio.run(structured(client, "gpt-5.4-mini", "s", "u", "loop_check", {}, api_only=True)) == {"x": 1}
    assert len(client.asked) == 1 and ENGINE.runs == 1


# Codex itself: one `codex exec` run per question.

FAKE_CODEX = """
import json, os, sys
args = sys.argv[1:]
prompt = sys.stdin.read()
if "AT THE LIMIT" in prompt:
    print("ERROR: You've hit your usage limit. Try again in 3 hours.", file=sys.stderr)
    sys.exit(1)
disabled = {args[i + 1] for i, arg in enumerate(args) if arg == "--disable"}
seen = {
    "secrets": sorted(name for name in os.environ if name in ("OPENAI_API_KEY", "SUPABASE_DB_PASSWORD", "GMAIL_APP_PASSWORD")),
    "home": "USERPROFILE" in os.environ or "HOME" in os.environ,
    "asked": "Score these" in prompt and prompt.rstrip().endswith("everything needed is above."),
    "schema": json.load(open(args[args.index("--output-schema") + 1])),
    "sandbox": args[args.index("-s") + 1], "stdin": args[-1] == "-", "ephemeral": "--ephemeral" in args,
    "no_tools": {"shell_tool", "unified_exec", "browser_use", "computer_use"} <= disabled, "no_web": 'web_search="disabled"' in args,
}
open(args[args.index("-o") + 1], "w", encoding="utf-8").write(json.dumps(seen))
"""


def test_codex_gets_the_question_on_stdin_with_no_tools_no_web_and_no_secret(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = tmp_path / "codex.py"
    fake.write_text(FAKE_CODEX, encoding="utf-8")
    for name in ("OPENAI_API_KEY", "SUPABASE_DB_PASSWORD", "GMAIL_APP_PASSWORD"):
        monkeypatch.setenv(name, "must-not-reach-codex")
    schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}
    seen = asyncio.run(codex.ask("Score these jobs.", "Job 1", schema, command=[sys.executable, str(fake)]))
    assert seen == {
        "secrets": [], "home": True, "asked": True, "schema": schema, "sandbox": "read-only", "stdin": True, "ephemeral": True,
        "no_tools": True, "no_web": True,
    }


def test_codex_at_its_limit_says_so_in_words(tmp_path: Path) -> None:
    fake = tmp_path / "codex.py"
    fake.write_text(FAKE_CODEX, encoding="utf-8")
    with pytest.raises(codex.CodexLimit, match="usage limit of your ChatGPT plan"):
        asyncio.run(codex.ask("AT THE LIMIT", "u", {}, command=[sys.executable, str(fake)]))


# The worker: the page's switches, the usage table, and work held at the budget.


def test_the_engine_and_the_budget_come_from_the_page_with_defaults_and_no_limit_as_null() -> None:
    assert settings_from(None) == Settings(engine="api", budget_day=2.0, budget_month=20.0)
    row = {"paused": False, "engine": "codex", "budget_day": None, "budget_month": "12.5"}
    assert (settings_from(row).engine, settings_from(row).budget_day, settings_from(row).budget_month) == ("codex", None, 12.5)
    assert settings_from({"engine": "gemini", "budget_day": -3}).engine == "api"
    assert settings_from({"budget_day": -3}).budget_day == 2.0


def test_only_work_on_the_api_waits_for_the_budget() -> None:
    assert needs_api({"kind": "apply"}) and needs_api({"kind": "search"}) and not needs_api({"kind": "calendar_add"})
    # On a plan the engine fills forms too (codex_apply.py, claude_apply.py): nothing waits for the API's budget.
    for engine in ("codex", "claude"):
        ENGINE.use(engine)
        assert not needs_api({"kind": "apply"}) and not needs_api({"kind": "search"}) and not needs_api({"kind": "cover_letter"})


def test_past_the_budget_api_commands_are_refused_and_codex_ones_run(session: Session) -> None:
    def command(number: int, kind: str) -> dict[str, Any]:
        return {"id": number, "user_id": "u1", "kind": kind, "status": "pending", "job_ids": [], "dry_run": True}

    db = Remote(automation_commands=[command(1, "search")])
    agent = agent_for(session, db)

    async def run() -> None:
        agent.use_settings(Settings(budget_day=1.0))
        BUDGET.start(day_before=1.5, month_before=1.5)
        await agent.next_command()
        refused = db.row("automation_commands", id=1)
        assert refused["status"] == "failed" and refused["error"] == worker.REFUSED_BUDGET.format(why="today's AI budget ($1.00) is used up")
        # On Codex the search costs the API nothing: it runs. Applying fills forms on the plan too, so the budget does not
        # hold it back either (needs_api; the apply itself is not run here).
        agent.use_settings(Settings(engine="codex", budget_day=1.0))
        db.tables["automation_commands"] += [command(2, "search")]
        await agent.next_command()
        assert db.row("automation_commands", id=2)["status"] == "done"
        assert not needs_api({"kind": "apply"})

    asyncio.run(run())


def test_a_batch_of_applications_stops_before_the_next_form_once_the_budget_is_used_up(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    ids = scored(session, 1, 2, 3)
    db = Remote(
        automation_commands=[{"id": 7, "user_id": "u1", "kind": "apply", "status": "pending", "job_ids": ids, "dry_run": True}],
        automation_jobs=[{"user_id": "u1", "id": job_id, "status": "scored"} for job_id in ids],
    )
    agent = agent_for(session, db)
    applied: list[str] = []

    async def apply(item: Stored, *_: Any, **__: Any) -> Outcome:
        applied.append(item.job.id)
        # This form took the day past its budget.
        BUDGET.start(day_before=2.4, month_before=2.4)
        return Outcome("submitted", "sent")

    monkeypatch.setattr(session, "apply", apply)
    # apply_all sets the dry run in the environment: put back as it was after the test.
    monkeypatch.setenv(DRY_RUN_ENV, "")

    async def run() -> None:
        agent.use_settings(Settings())
        await agent.next_command()

    asyncio.run(run())
    command = db.tables["automation_commands"][0]
    assert applied == ids[:1]
    assert command["status"] == "failed" and command["error"].startswith("Stopped after 1 of 3 jobs: today's AI budget ($2.00) is used up.")


class Clock(date):
    """date with a today() the test sets."""

    now = date(2026, 11, 15)

    @classmethod
    def today(cls) -> date:  # type: ignore[override]
        return cls.now


def test_the_budget_counts_on_from_the_usage_table_and_starts_again_each_day_and_month(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "date", Clock)
    Clock.now = date(2026, 11, 15)
    db = Ledger(automation_usage=[
        {"user_id": "u1", "day": "2026-10-31", "api_usd": 9.0, "api_calls": 50, "codex_runs": 0, "tokens_in": 1, "tokens_out": 1},
        {"user_id": "u1", "day": "2026-11-02", "api_usd": 3.5, "api_calls": 20, "codex_runs": 0, "tokens_in": 1, "tokens_out": 1},
        {"user_id": "u1", "day": "2026-11-15", "api_usd": 1.25, "api_calls": 10, "codex_runs": 4, "tokens_in": 100, "tokens_out": 10},
    ])
    agent = agent_for(session, db)

    async def run() -> None:
        await agent.load_usage()
        # October is another month; earlier today counts for today and the month.
        assert BUDGET.spent() == pytest.approx((1.25, 4.75))
        SPEND.total += 0.5
        SPEND.calls += 3
        SPEND.tokens["gpt-5.4-mini"] = (900, 90)
        ENGINE.runs += 2
        await agent.sync_usage()
        today = db.row("automation_usage", day="2026-11-15")
        assert (today["api_usd"], today["api_calls"], today["codex_runs"], today["tokens_in"], today["tokens_out"]) == (1.75, 13, 6, 1000, 100)
        assert BUDGET.spent() == pytest.approx((1.75, 5.25))
        # A new day: today's spending starts again, the month's goes on.
        Clock.now = date(2026, 11, 16)
        SPEND.total += 0.25
        await agent.sync_usage()
        assert db.row("automation_usage", day="2026-11-15")["api_usd"] == 2.0
        assert db.row("automation_usage", day="2026-11-16")["api_usd"] == 0.0
        assert BUDGET.spent() == pytest.approx((0.0, 5.5))
        # A new month starts the month's budget again too.
        Clock.now = date(2026, 12, 1)
        await agent.sync_usage()
        assert BUDGET.spent() == pytest.approx((0.0, 0.0))

    asyncio.run(run())


def test_a_database_without_the_engine_or_the_budget_keeps_the_api_and_no_limit(session: Session) -> None:
    agent = agent_for(session, Remote())
    agent.support.budget = False
    agent.use_engine(Settings(engine="codex", budget_day=0.5))
    assert not ENGINE.codex and BUDGET.day is None and BUDGET.month is None


def test_a_usage_row_that_did_not_change_is_not_written_again(session: Session) -> None:
    db = Ledger()
    agent = agent_for(session, db)
    writes: list[Any] = []
    original = db.upsert

    async def upsert(table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        writes.append(json.dumps(rows, default=str))
        await original(table, rows, conflict)

    db.upsert = upsert  # type: ignore[method-assign]

    async def run() -> None:
        await agent.load_usage()
        await agent.sync_usage()
        await agent.sync_usage()
        SPEND.total += 0.1
        await agent.sync_usage()

    asyncio.run(run())
    assert len(writes) == 2 and llm.SPEND is SPEND


def test_with_the_claude_engine_claude_code_answers_on_the_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_automation.agent import claude_engine

    asked: list[tuple[str, str]] = []

    async def ask(system: str, user: str, schema: dict[str, Any], model: str = "") -> dict[str, Any]:
        asked.append((system, user))
        return {"from": "claude"}

    monkeypatch.setattr(claude_engine, "ask", ask)
    ENGINE.use("claude")
    assert ENGINE.on_plan and not ENGINE.codex and ENGINE.label == "Claude Code"
    BUDGET.day = 0.0
    client = api_client()
    assert asyncio.run(structured(client, "gpt-5.4-mini", "rules", "jobs", "verdicts", {})) == {"from": "claude"}
    assert asked == [("rules", "jobs")] and ENGINE.runs == 1 and client.asked == [] and SPEND.total == 0
    ENGINE.use("anything else")
    assert ENGINE.name == "api" and not ENGINE.on_plan



def test_what_the_ai_went_on_is_kept_by_kind_for_the_day_and_counts_on_after_a_restart(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "date", Clock)
    Clock.now = date(2026, 11, 15)
    earlier = {"usd": {"forms": 0.5}, "runs": {"letters": 2.0}}
    db = Ledger(automation_usage=[
        {"user_id": "u1", "day": "2026-11-15", "api_usd": 0.5, "api_calls": 4, "codex_runs": 2, "tokens_in": 1, "tokens_out": 1, "breakdown": earlier},
    ])
    agent = agent_for(session, db)

    async def run() -> None:
        await agent.load_usage()
        # Scoring on the API, then letters on a plan.
        assert await structured(api_client('{"answers": []}'), "gpt-5.4-mini", "s", "u", "verdicts", {}) == {"answers": []}
        SPEND.note("gpt-5.4-mini", answer("").usage)
        ENGINE.by_kind["letters"] = ENGINE.by_kind.get("letters", 0) + 1
        await agent.sync_usage()

    asyncio.run(run())
    row = db.row("automation_usage", day="2026-11-15")
    assert row["breakdown"] == {"usd": {"forms": pytest.approx(0.5012), "scoring": pytest.approx(0.0012)}, "runs": {"letters": 3.0}}
    assert row["api_usd"] == pytest.approx(0.5024)

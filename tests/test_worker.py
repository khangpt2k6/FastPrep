"""The web dashboard's worker with no network: the Agent page's switches, auto-fetch, resumes from the page, a database
that does not have the newer schema yet, and stopping."""

from __future__ import annotations

import asyncio
import json
import re
import time
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import yaml
from click.testing import CliRunner

from agent_automation.agent import session as session_module
from agent_automation.agent.apply import Outcome
from agent_automation.agent.cover_letter import load_skills
from agent_automation.agent.session import Session
from agent_automation.memory.config import ConfigError, load_config
from agent_automation.memory.profile import install_resume
from agent_automation.memory.store import Store, Stored
from agent_automation.tools.database import Job
from agent_automation.ui import keeper, worker
from agent_automation.ui.worker import Agent, Settings, next_fetch, schema_missing, settings_from, storage_name, upload_name

CV = "# Ada Rossi\n\nSoftware engineering intern at Acme: Python and Go, backend services and data pipelines.\n"
NEW_CV = "# Ada Rossi\n\nPython engineer, two internships in backend services, now in Milan and open to moving.\n"
GOALS = "Backend internships, as I wrote them."
PLAN = {
    "nodes": [{"id": "role", "weight": 1.0, "forms": [
        {"text": "Software Engineer Intern", "weight": 1.0}, {"text": "software engineer intern", "weight": 0.9}, {"text": "Backend Intern", "weight": 1.0},
    ]}],
    "arcs": [],
}
PROFILE = {
    "plan": {"nodes": [{"id": "role", "weight": 1.5, "forms": [{"text": "Python Engineer", "weight": 1.0}, {"text": "Python Developer", "weight": 1.0}]}], "arcs": []},
    "cities": ["Milan", "Milano"],
    "locations": ["Italy"],
    "countries": ["it"],
    "goals": "Senior Python work.",
    "answers": {"email": "ada@example.com", "phone": "", "location": "Milan", "linkedin": "", "website": "", "current_company": ""},
}
PREFILLED = {
    "personal": {"first_name": "Ada", "last_name": "Rossi", "email": "ada@example.com", "phone": "", "city": "Milan", "state": "", "country": "Italy",
                 "linkedin": "", "github": "", "website": ""},
    "education": [],
    "experience": [{"company": "Acme", "title": "Intern", "location": "", "start": "2025-06", "end": "Present", "description": ""}],
    "skills": ["Python"],
}


def refusal(table: str, code: str, status: int = 0) -> httpx.HTTPStatusError:
    """Supabase's answer that something is not there, as httpx raises it."""
    request = httpx.Request("GET", f"https://example.supabase.co/rest/v1/{table}")
    status = status or (404 if code in ("PGRST205", "42P01") else 400)
    return httpx.HTTPStatusError(f"{status} for {table}", request=request, response=httpx.Response(status, json={"code": code, "message": "not there"}, request=request))


class Remote:
    """Supabase as the worker sees it: tables as lists of rows, the files in the bucket, and the parts of the schema it does
    not have yet, each a table or a table.column."""

    def __init__(self, *missing: str, **tables: list[dict[str, Any]]) -> None:
        self.user_id = "u1"
        self.email = "ada@example.com"
        self.tables = {name: [dict(row) for row in rows] for name, rows in tables.items()}
        self.files: dict[str, tuple[bytes, str]] = {}
        self.missing = set(missing)
        self.ids = 100

    def _check(self, table: str, columns: Any, code: str = "42703") -> None:
        if table in self.missing:
            raise refusal(table, "PGRST205")
        if any(f"{table}.{column}" in self.missing for column in columns):
            raise refusal(table, code)

    @staticmethod
    def _matches(row: dict[str, Any], params: dict[str, str]) -> bool:
        for column, condition in params.items():
            if column in ("select", "order", "limit"):
                continue
            how, _, value = condition.partition(".")
            have = row.get(column)
            text = str(have).lower() if isinstance(have, bool) else str(have)
            if (how == "eq" and text != value) or (how == "neq" and text == value) or (how == "in" and text not in value.strip("()").split(",")):
                return False
        return True

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        self._check(table, [column for column in params.get("select", "").split(",") if column not in ("", "*")])
        rows = [dict(row) for row in self.tables.get(table, []) if self._matches(row, params)]
        return rows[: int(params["limit"])] if "limit" in params else rows

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        for row in rows:
            self._check(table, row, "PGRST204")
        kept = self.tables.setdefault(table, [])
        for row in rows:
            old = next((each for each in kept if all(each.get(key) == row.get(key) for key in conflict.split(","))), None)
            if old is None:
                kept.append(dict(row))
            else:
                old.update(row)

    async def update(self, table: str, params: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        self._check(table, values, "PGRST204")
        changed = []
        for row in self.tables.get(table, []):
            if self._matches(row, params):
                row.update(values)
                changed.append(dict(row))
        return changed

    async def insert(self, table: str, rows: list[dict[str, Any]]) -> None:
        for row in rows:
            self._check(table, row, "PGRST204")
            self.ids += 1
            self.tables.setdefault(table, []).append({"id": self.ids, **row})

    async def delete(self, table: str, params: dict[str, str]) -> None:
        self._check(table, ())
        self.tables[table] = [row for row in self.tables.get(table, []) if not self._matches(row, params)]

    async def upload(self, path: str, data: bytes, content_type: str = "image/png") -> None:
        self.files[path] = (data, content_type)

    async def download(self, path: str) -> bytes:
        if path not in self.files:
            raise refusal("storage", "not_found")
        return self.files[path][0]

    async def close(self) -> None:
        pass

    def row(self, table: str, **where: Any) -> dict[str, Any]:
        return next(row for row in self.tables[table] if all(row.get(key) == value for key, value in where.items()))


class Schemas:
    """A model that answers each structured request with the answer kept under its schema's name."""

    def __init__(self, **answers: Any) -> None:
        self.answers = answers
        self.asked: list[str] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **request: Any) -> Any:
        name = request["response_format"]["json_schema"]["name"]
        self.asked.append(name)
        message = SimpleNamespace(content=json.dumps(self.answers[name]), tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def session_at(folder: Path) -> Session:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "cv.md").write_text(CV, encoding="utf-8")
    kept = folder / "data" / "cvs"
    kept.mkdir(parents=True)
    (kept / "original-cv.pdf").write_bytes(b"%PDF-1.4 the cv")
    (kept / "cv-name.txt").write_text("Ada Rossi CV.pdf", encoding="utf-8")
    settings = {"goals": GOALS, "filters": {
        "include": ["role"], "require": ["Intern"], "locations": ["Tampa", "United States"], "cities": ["Tampa"], "countries": ["US"], "plan": PLAN,
    }}
    (folder / "automation.yaml").write_text(yaml.safe_dump(settings, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return Session(folder)


@pytest.fixture
def session(tmp_path: Path) -> Iterator[Session]:
    made = session_at(tmp_path / "home")
    yield made
    made.close()


def agent_for(session: Session, db: Remote) -> Agent:
    agent = Agent(session, db, None)  # type: ignore[arg-type]
    # No company names: no model is asked for them.
    agent.naming_paused_until = float("inf")
    return agent


def job(number: int, lexical: float = 1.0) -> Job:
    url = f"https://jobs.example/{number}"
    return Job(url, "Acme", "Software Engineer Intern", "Tampa", url, url, "", lexical)


def scored(session: Session, *numbers: int) -> list[str]:
    for number in numbers:
        session.store.add(job(number))
        session.store.set_score(job(number).id, 3.0)
    return [job(number).id for number in numbers]


async def settle() -> None:
    """The heartbeats that say() started, run."""
    for _ in range(3):
        await asyncio.sleep(0)


# The switches and their schedule.


def test_the_switches_in_a_row_fall_back_to_their_defaults_as_on_the_page() -> None:
    assert settings_from(None) == Settings() == Settings(paused=False, auto_fetch=True, fetch_hours=3, fetch_limit=40)
    assert settings_from({"paused": True, "auto_fetch": False, "fetch_hours": 6, "fetch_limit": 0}) == Settings(True, False, 6, 0)
    assert settings_from({"paused": "yes", "auto_fetch": None, "fetch_hours": 0, "fetch_limit": 500}) == Settings()
    assert settings_from({"fetch_hours": "12", "fetch_limit": 2.5}) == Settings(fetch_hours=12)
    assert settings_from({"fetch_hours": True, "fetch_limit": "many"}) == Settings()


def test_auto_fetch_comes_fetch_hours_after_the_last_round_and_sooner_after_one_that_failed() -> None:
    assert next_fetch(None, Settings()) is None
    assert next_fetch(1000.0, Settings()) == 1000.0 + 3 * 3600
    assert next_fetch(1000.0, Settings(fetch_hours=48)) == 1000.0 + 48 * 3600
    assert next_fetch(1000.0, Settings(), failed=True) == 1000.0 + worker.FETCH_RETRY_SECONDS
    assert next_fetch(1000.0, Settings(paused=True)) is None
    assert next_fetch(1000.0, Settings(auto_fetch=False)) is None


def test_only_supabases_own_answer_that_a_table_or_column_is_not_there_counts() -> None:
    assert all(schema_missing(refusal("t", code)) for code in ("42703", "42P01", "PGRST204", "PGRST205"))
    assert not schema_missing(refusal("t", "23505"))
    assert not schema_missing(refusal("t", "PGRST205", status=503))
    assert not schema_missing(httpx.ConnectError("no network"))
    request = httpx.Request("GET", "https://example.supabase.co")
    assert not schema_missing(httpx.HTTPStatusError("400", request=request, response=httpx.Response(400, text="not json", request=request)))


def test_file_names_from_the_page_are_kept_as_given_where_this_computer_allows() -> None:
    assert upload_name("C:\\fakepath\\My CV.pdf") == "My CV.pdf"
    assert upload_name("Bật CV.docx") == "Bật CV.docx"
    assert upload_name('a<b>:c?.pdf') == "a_b__c_.pdf"
    assert upload_name("CON.pdf") == "resume-CON.pdf"
    assert upload_name("", ".pdf") == "resume.pdf"
    assert upload_name("notes", ".txt") == "notes.txt"
    # As the page names files in storage.
    assert storage_name("Bật CV (final).pdf") == "Ba_t_CV_final_.pdf"
    assert storage_name("...") == "resume.pdf"


# A database without the newer schema.


def test_without_the_newer_schema_the_agent_sends_what_it_sent_before(session: Session, capsys: pytest.CaptureFixture[str]) -> None:
    db = Remote(
        "automation_settings", "automation_agent.fetched_at", "automation_jobs.found_at", "automation_resumes", "automation_rules", "automation_documents",
        "automation_calendar",
    )
    scored(session, 1)
    agent = agent_for(session, db)

    async def run() -> None:
        await agent.detect()
        await agent.read_settings()
        agent.fetched_at = agent.last_round = time.time()
        await agent._beat()
        await agent.push_jobs()
        await agent.publish_resume()
        await agent.publish_rules()
        assert await agent.rules_text() == ""

    asyncio.run(run())
    assert not any(vars(agent.support).values())
    assert agent.settings == Settings() and agent.go.is_set()
    beat = db.tables["automation_agent"][0]
    assert beat["state"] == "starting" and not {"fetched_at", "next_fetch_at", "fetched_new"} & beat.keys()
    assert "found_at" not in db.tables["automation_jobs"][0]
    assert "automation_resumes" not in db.tables and db.files == {}
    said = capsys.readouterr().out
    for part in worker.PARTS.values():
        assert said.count(f"{part} is not in the database yet") == 1


def test_with_the_newer_schema_the_page_learns_when_jobs_were_fetched_and_found(session: Session) -> None:
    db = Remote()
    ids = scored(session, 1, 2)
    agent = agent_for(session, db)
    agent.last_round, agent.fetched_at = 1_000_000.0, 1_000_000.0
    agent.round_from = "2000-01-01T00:00:00+00:00"

    async def run() -> None:
        await agent.detect()
        await agent._beat()
        await agent.push_jobs()

    asyncio.run(run())
    assert all(vars(agent.support).values())
    beat = db.tables["automation_agent"][0]
    assert beat["fetched_at"] == "1970-01-12T13:46:40+00:00" and beat["next_fetch_at"] == "1970-01-12T16:46:40+00:00" and beat["fetched_new"] == 2
    for job_id in ids:
        row, item = db.row("automation_jobs", id=job_id), session.store.get(job_id)
        assert item is not None and item.first_seen and row["found_at"] == item.first_seen
    # A time the store holds that is not one goes up as none, rather than stopping the push.
    assert agent._row(Stored(job(3), "scored", 2.0, None, "yesterday"), {})["found_at"] is None
    agent.round_from = "2999-01-01T00:00:00+00:00"
    assert agent.fetch_columns()["fetched_new"] == 0


def test_a_column_that_turns_out_missing_later_is_left_out_and_the_heartbeat_and_push_go_on(session: Session) -> None:
    db = Remote("automation_agent.next_fetch_at", "automation_jobs.found_at")
    scored(session, 1)
    agent = agent_for(session, db)

    async def run() -> None:
        await agent._beat()
        await agent.push_jobs()

    asyncio.run(run())
    assert not agent.support.fetch and not agent.support.found_at and agent.support.settings
    assert db.tables["automation_agent"][0]["state"] == "starting" and len(db.tables["automation_jobs"]) == 1


# Pause.


def test_paused_takes_no_command_and_going_on_again_says_ready(session: Session) -> None:
    db = Remote(
        automation_settings=[{"user_id": "u1", "paused": True, "auto_fetch": True, "fetch_hours": 3, "fetch_limit": 40}],
        automation_commands=[{"id": 1, "user_id": "u1", "kind": "search", "status": "pending", "job_ids": [], "dry_run": True}],
    )
    agent = agent_for(session, db)

    async def run() -> None:
        await agent.read_settings()
        await settle()
        assert (agent.state, agent.message, agent.go.is_set()) == ("paused", worker.PAUSED, False)
        assert db.tables["automation_agent"][0]["state"] == "paused"
        await agent.next_command()
        assert db.tables["automation_commands"][0]["status"] == "pending"
        db.tables["automation_settings"][0]["paused"] = False
        await agent.read_settings()
        assert agent.state == "ready" and agent.go.is_set()
        await agent.next_command()
        assert db.tables["automation_commands"][0]["status"] == "done" and agent.wake.is_set()

    asyncio.run(run())


def test_a_pause_lets_the_form_under_way_finish_and_stops_before_the_next(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    ids = scored(session, 1, 2, 3)
    db = Remote(
        automation_commands=[{"id": 7, "user_id": "u1", "kind": "apply", "status": "pending", "job_ids": ids, "dry_run": True}],
        automation_jobs=[{"user_id": "u1", "id": job_id, "status": "scored"} for job_id in ids],
    )
    agent = agent_for(session, db)
    applied: list[str] = []

    async def apply(item: Stored, *_: Any, **__: Any) -> Outcome:
        applied.append(item.job.id)
        # The page pauses while the first form is being filled.
        agent.use_settings(Settings(paused=True))
        assert agent.state != "paused"
        return Outcome("submitted", "sent")

    monkeypatch.setattr(session, "apply", apply)
    asyncio.run(agent.next_command())
    command = db.tables["automation_commands"][0]
    assert applied == ids[:1]
    assert command["status"] == "failed" and command["error"] == "Paused after 1 of 3 jobs. Select the rest and apply again."
    assert [db.row("automation_jobs", id=job_id)["status"] for job_id in ids] == ["submitted", "scored", "scored"]
    assert agent.state == "paused" and agent.busy == 0


def test_a_paused_search_waits_until_the_agent_goes_on(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    agent = agent_for(session, Remote())
    found: list[bool] = []

    async def find() -> int:
        found.append(True)
        return 0

    monkeypatch.setattr(session, "find", find)
    monkeypatch.setattr(session.library, "has_postings", lambda: True)

    async def run() -> None:
        agent.use_settings(Settings(paused=True))
        task = asyncio.create_task(agent.searching())
        agent.wake.set()
        await asyncio.sleep(0.05)
        assert found == []
        agent.use_settings(Settings())
        await asyncio.sleep(0.05)
        task.cancel()

    asyncio.run(run())
    assert found == [True]


# Auto-fetch.


def test_a_round_of_auto_fetch_brings_new_postings_and_scores_at_most_fetch_limit(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    synced: list[bool] = []

    async def sync(progress: Any, arrived: Any, on_bytes: Any = None) -> None:
        synced.append(True)

    async def find() -> int:
        return session.store.add_all([job(number, 1.0 - number / 100) for number in range(6)])

    asked: list[int] = []

    async def read(log: Any, most: int = 200) -> int:
        asked.append(most)
        batch = session.store.with_status("new")[:most]
        for item in batch:
            session.store.set_score(item.job.id, 3.0)
        return len(batch)

    monkeypatch.setattr(session, "sync", sync)
    monkeypatch.setattr(session, "find", find)
    monkeypatch.setattr(session, "read", read)
    db = Remote(automation_settings=[{"user_id": "u1", "paused": False, "auto_fetch": True, "fetch_hours": 3, "fetch_limit": 4}])
    agent = agent_for(session, db)

    async def run() -> None:
        await agent.read_settings()
        await agent.fetch_round()
        await agent._beat()

    agent.target = 900
    asyncio.run(run())
    # A Find more waiting for the round keeps its own target.
    assert synced == [True] and asked == [4] and agent.scored() == 4 and agent.target == 900
    assert len(db.tables["automation_jobs"]) == 4 and all(row["found_at"] for row in db.tables["automation_jobs"])
    assert agent.state == "ready" and agent.message == "6 new jobs since the last check. 4 jobs scored. Pick the ones to apply to."
    beat = db.tables["automation_agent"][0]
    assert beat["fetched_new"] == 6 and beat["fetched_at"]


def test_auto_fetch_waits_for_its_hour_and_tries_a_failed_round_again_sooner(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "FETCH_CHECK_SECONDS", 0.01)
    agent = agent_for(session, Remote())
    rounds: list[float] = []

    async def fetch_round() -> None:
        rounds.append(time.time())
        raise RuntimeError("no network")

    monkeypatch.setattr(agent, "fetch_round", fetch_round)

    async def run(seconds: float) -> None:
        task = asyncio.create_task(agent.fetching())
        await asyncio.sleep(seconds)
        task.cancel()

    agent.last_round = time.time() - 3600
    asyncio.run(run(0.1))
    assert rounds == []
    agent.settings = Settings(paused=True)
    agent.last_round = time.time() - 4 * 3600
    asyncio.run(run(0.1))
    assert rounds == []
    agent.settings = Settings()
    asyncio.run(run(0.2))
    assert len(rounds) == 1 and agent.round_failed and agent.state == "error" and "no network" in agent.message
    assert next_fetch(agent.last_round, agent.settings, agent.round_failed) == agent.last_round + worker.FETCH_RETRY_SECONDS


def test_reading_scores_no_more_postings_than_asked(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    for number in range(5):
        session.store.add(job(number))
    seen: list[int] = []

    async def fits(client: Any, model: str, cv: str, jobs: list[Job], asked: str, why: Any) -> list[float]:
        seen.append(len(jobs))
        return [0.9] * len(jobs)

    monkeypatch.setattr(session_module, "fits", fits)
    monkeypatch.setattr(session.library, "descriptions", lambda urls: [""] * len(urls))
    session._client = object()  # type: ignore[assignment]
    assert asyncio.run(session.read(lambda line: None, most=2)) == 2 and seen == [2]
    assert asyncio.run(session.read(lambda line: None)) == 3 and seen == [2, 3]


# Resumes on the page.


def test_a_new_resume_keeps_the_goals_written_by_hand_when_asked(tmp_path: Path) -> None:
    (tmp_path / "automation.yaml").write_text(yaml.safe_dump({"goals": GOALS, "filters": {"require": ["Intern"]}}), encoding="utf-8")
    resume = tmp_path / "resume.txt"
    resume.write_text(NEW_CV, encoding="utf-8")
    store = Store(tmp_path / "data" / "jobs.db")
    try:
        profile = asyncio.run(install_resume(Schemas(search_profile=PROFILE), load_config(tmp_path), resume, store, keep_goals=True))  # type: ignore[arg-type]
        config = load_config(tmp_path)
        assert config.goals == GOALS == profile["goals"] and config.filters.require == ("Intern",)
        assert config.filters.countries == ("IT",)
        asyncio.run(install_resume(Schemas(search_profile=PROFILE), load_config(tmp_path), resume, store))  # type: ignore[arg-type]
        assert load_config(tmp_path).goals == "Senior Python work."
        (tmp_path / "automation.yaml").write_text(yaml.safe_dump({"goals": "  "}), encoding="utf-8")
        asyncio.run(install_resume(Schemas(search_profile=PROFILE), load_config(tmp_path), resume, store, keep_goals=True))  # type: ignore[arg-type]
        assert load_config(tmp_path).goals == "Senior Python work."
    finally:
        store.close()


def test_a_resume_uploaded_on_the_page_becomes_the_one_in_use(session: Session) -> None:
    tried, untried = job(1), job(2)
    session.store.add_all([tried, untried])
    session.store.set_status(tried.id, "submitted", "sent")
    session.store.set_score(untried.id, 3.0)
    path = "u1/resumes/1731400000000-Ada_CV_2026.txt"
    db = Remote(
        automation_resumes=[
            {"id": 1, "user_id": "u1", "name": "Ada Rossi CV.pdf", "path": "u1/resumes/1-Ada_Rossi_CV.pdf", "status": "active"},
            {"id": 2, "user_id": "u1", "name": "Ada CV 2026.txt", "path": path, "status": "uploaded"},
        ],
        automation_profile=[{"user_id": "u1", "data": {"authorization": {"countries": ["United States"]}, "personal": {"city": "Tampa"}}}],
        automation_commands=[{"id": 5, "user_id": "u1", "kind": "resume", "status": "pending", "payload": {"resume_id": 2}, "job_ids": [], "dry_run": True}],
        automation_jobs=[{"user_id": "u1", "id": untried.id, "status": "scored"}, {"user_id": "u1", "id": tried.id, "status": "submitted"}],
    )
    db.files[path] = (NEW_CV.encode(), "text/plain")
    model = Schemas(search_profile=PROFILE, profile=PREFILLED)
    session._client = model  # type: ignore[assignment]
    agent = agent_for(session, db)
    agent.target = 900

    asyncio.run(agent.next_command())
    assert db.tables["automation_commands"][0]["status"] == "done"
    row = db.row("automation_resumes", id=2)
    assert row["status"] == "active" and row["error"] == "" and row["text"] == NEW_CV.strip()
    assert row["data"]["search"] == {
        "goals": GOALS, "cities": ["Tampa", "Milan", "Milano"], "countries": ["US"], "titles": ["Python Engineer", "Python Developer"],
    }
    assert row["data"]["profile"]["personal"]["first_name"] == "Ada" and row["data"]["profile"]["skills"] == ["Python"]
    assert db.row("automation_resumes", id=1)["status"] == "old"
    # The file as the person named it, which the settings show, and the copy every application sends.
    cvs = session.config.data_dir / "cvs"
    assert (cvs / "uploads" / "Ada CV 2026.txt").read_text(encoding="utf-8") == NEW_CV
    assert (cvs / "cv-name.txt").read_text(encoding="utf-8") == "Ada CV 2026.txt" == session.resume_name()
    assert [file.name for file in cvs.glob("original-cv.*")] == ["original-cv.txt"]
    # Goals and must-have words written by hand stay, and the places picked on the page win.
    config = session.config
    assert config.goals == GOALS and config.filters.require == ("Intern",) and config.filters.countries == ("US",)
    # The jobs not tried give way to the new search's, here and on the page.
    assert session.store.get(untried.id) is None and session.store.get(tried.id) is not None
    assert [row["id"] for row in db.tables["automation_jobs"]] == [tried.id]
    assert agent.target == worker.SCORE_TARGET and agent.wake.is_set() and agent.state == "searching"
    assert sorted(model.asked) == ["profile", "search_profile"]


def test_a_resume_that_cannot_be_read_says_why_on_its_row_and_changes_nothing(session: Session) -> None:
    path = "u1/resumes/1731400000000-scan.txt"
    db = Remote(
        automation_resumes=[
            {"id": 1, "user_id": "u1", "name": "Ada Rossi CV.pdf", "path": "u1/resumes/1-Ada_Rossi_CV.pdf", "status": "active"},
            {"id": 2, "user_id": "u1", "name": "scan.txt", "path": path, "status": "uploaded"},
        ],
        automation_commands=[{"id": 5, "user_id": "u1", "kind": "resume", "status": "pending", "payload": {"resume_id": 2}, "job_ids": [], "dry_run": True}],
    )
    db.files[path] = (b"Too short.", "text/plain")
    model = Schemas()
    session._client = model  # type: ignore[assignment]
    agent = agent_for(session, db)

    asyncio.run(agent.next_command())
    command, row = db.tables["automation_commands"][0], db.row("automation_resumes", id=2)
    assert command["status"] == "failed" and "has no text to read" in command["error"]
    assert row["status"] == "failed" and "has no text to read" in row["error"]
    assert db.row("automation_resumes", id=1)["status"] == "active" and model.asked == []
    assert session.resume_name() == "Ada Rossi CV.pdf" and session.config.goals == GOALS
    assert (session.config.data_dir / "cvs" / "original-cv.pdf").is_file()

    # A file gone from storage says so too.
    db.tables["automation_resumes"][1]["path"] = "u1/resumes/gone.pdf"
    db.tables["automation_commands"].append({"id": 6, "user_id": "u1", "kind": "resume", "status": "pending", "payload": {"resume_id": 2}})
    asyncio.run(agent.next_command())
    assert db.row("automation_commands", id=6)["status"] == "failed" and db.row("automation_resumes", id=2)["status"] == "failed"


def test_the_resume_in_use_goes_on_the_page_when_the_page_has_none(session: Session) -> None:
    db = Remote()
    agent = agent_for(session, db)
    asyncio.run(agent.publish_resume())
    (path, (data, kind)), = db.files.items()
    assert re.fullmatch(r"u1/resumes/\d{13}-Ada_Rossi_CV\.pdf", path) and data == b"%PDF-1.4 the cv" and kind == "application/pdf"
    row, = db.tables["automation_resumes"]
    assert {key: row[key] for key in ("name", "path", "size", "status", "text")} == {
        "name": "Ada Rossi CV.pdf", "path": path, "size": len(b"%PDF-1.4 the cv"), "status": "active", "text": CV,
    }
    assert row["data"] == {"search": {
        "goals": GOALS, "cities": ["Tampa"], "countries": ["US"], "titles": ["Software Engineer Intern", "Backend Intern"],
    }}
    # Once the page has one, a start adds none; a resume given on the command line is put up as the new one.
    asyncio.run(agent.publish_resume())
    assert len(db.tables["automation_resumes"]) == 1
    asyncio.run(agent.publish_resume(again=True))
    assert [row["status"] for row in db.tables["automation_resumes"]] == ["old", "active"]


# Stopping, and one agent per home.


def test_the_stop_file_ends_the_agent_and_its_loops(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "STOP_SECONDS", 0.01)
    agent = agent_for(session, Remote())
    ran: list[str] = []

    async def forever() -> None:
        try:
            await asyncio.sleep(3600)
        finally:
            ran.append("ended")

    async def done_at_once() -> None:
        ran.append("done")

    async def run() -> None:
        task = asyncio.create_task(agent.until_stopped(forever(), done_at_once()))
        await asyncio.sleep(0.05)
        # A job that is done leaves the others running.
        assert not task.done() and ran == ["done"]
        (session.config.data_dir / keeper.STOP_FILE).touch()
        await asyncio.wait_for(task, 2)

    asyncio.run(run())
    assert ran == ["done", "ended"]


def test_a_loop_that_breaks_ends_the_agent_with_its_error(session: Session) -> None:
    agent = agent_for(session, Remote())

    async def forever() -> None:
        await asyncio.sleep(3600)

    async def broken() -> None:
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(agent.until_stopped(forever(), broken()))


def test_a_second_agent_for_the_same_home_ends_at_once_and_says_why(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "load_dotenv", lambda *folders: None)
    monkeypatch.setattr(worker, "default_home", lambda: tmp_path)
    for name, value in {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_ANON_KEY": "key", "AGENT_EMAIL": "a@example.com", "AGENT_PASSWORD": "p"}.items():
        monkeypatch.setenv(name, value)
    first = keeper.hold_lock(tmp_path / "data" / keeper.LOCK_FILE)
    assert first is not None
    try:
        result = CliRunner().invoke(worker.main, [])
    finally:
        keeper.release(first)
    assert isinstance(result.exception, ConfigError) and "already running" in str(result.exception)
    assert not (tmp_path / "data" / "jobs.db").exists()


# The Rules page.


def test_shipped_rules_go_on_the_page_and_an_edited_one_keeps_its_text(session: Session) -> None:
    db = Remote(automation_rules=[
        {"user_id": "u1", "id": "cover-letter/plain", "kind": "cover_letter", "body": "My own text.", "updated_by": "web", "enabled": True, "builtin": True},
        {"user_id": "u1", "id": "cover-letter/voice", "kind": "cover_letter", "body": "old shipped", "updated_by": "agent", "enabled": True, "builtin": True},
    ])
    agent = agent_for(session, db)
    asyncio.run(agent.publish_rules())
    plain, voice = db.row("automation_rules", id="cover-letter/plain"), db.row("automation_rules", id="cover-letter/voice")
    assert plain["body"] == "My own text." and "recruiter" in plain["default_body"]
    assert voice["body"] == voice["default_body"] != "old shipped"
    truth = db.row("automation_rules", id="cover-letter/truth")
    assert truth["builtin"] and truth["updated_by"] == "agent" and truth["body"] == truth["default_body"]
    assert db.row("automation_rules", id="always/builtin")["kind"] == "always"


def test_rules_from_the_page_reach_the_letters_and_the_brief(session: Session) -> None:
    db = Remote(automation_preferences=[], automation_memory=[], automation_rules=[
        {"user_id": "u1", "id": "cover-letter/plain", "kind": "cover_letter", "title": "Keep it light on tech", "body": "No tool names at all.",
         "updated_by": "web", "enabled": True, "builtin": True, "sort": 5},
        {"user_id": "u1", "id": "answer/why", "kind": "answer", "title": "Why this company", "body": "One specific reason.", "enabled": True},
    ])
    agent = agent_for(session, db)
    text, _ = asyncio.run(agent.writing())
    assert "- Why this company: One specific reason." in text
    skills = {skill.name: skill for skill in load_skills(session.home)}
    assert skills["Keep it light on tech"].body == "No tool names at all."


def test_the_transcript_on_the_page_is_kept_before_applying_and_goes_when_the_page_has_none(session: Session, capsys: pytest.CaptureFixture[str]) -> None:
    db = Remote(automation_documents=[{"id": 1, "user_id": "u1", "kind": "transcript", "name": "Fall 2026.pdf", "path": "u1/documents/1-Fall_2026.pdf"}])
    db.files["u1/documents/1-Fall_2026.pdf"] = (b"%PDF-1.4 grades", "application/pdf")
    agent = agent_for(session, db)
    asyncio.run(agent.sync_transcript())
    kept = session.transcript()
    assert kept is not None and kept.name == "transcript.pdf" and kept.read_bytes() == b"%PDF-1.4 grades"

    # Already here: not brought again, even with the file gone from the bucket.
    db.files.clear()
    capsys.readouterr()
    asyncio.run(agent.sync_transcript())
    assert session.transcript() == kept and "not brought" not in capsys.readouterr().out

    # A new upload that cannot be brought leaves the old one, and says so.
    db.tables["automation_documents"][0]["path"] = "u1/documents/2-new.pdf"
    asyncio.run(agent.sync_transcript())
    assert session.transcript() == kept and "transcript not brought from the page" in capsys.readouterr().out

    db.tables["automation_documents"].clear()
    asyncio.run(agent.sync_transcript())
    assert session.transcript() is None


def test_without_the_documents_table_the_transcript_kept_here_stays(session: Session) -> None:
    kept = session.keep_transcript("mine.pdf", b"%PDF-1.4 mine")
    agent = agent_for(session, Remote("automation_documents"))
    asyncio.run(agent.sync_transcript())
    assert session.transcript() == kept and not agent.support.documents


def test_a_linkedin_profile_from_the_page_adds_to_the_profile_and_is_never_the_resume(session: Session) -> None:
    path = "u1/linkedin/1731400000000-Profile.txt"
    profile = {"personal": {"first_name": "Ada", "city": "Tampa"}, "skills": ["Go"], "authorization": {"countries": ["United States"]}}
    db = Remote(
        automation_profile=[{"user_id": "u1", "data": profile, "completed": True, "updated_by": "web", "updated_at": "2026-11-01T00:00:00+00:00"}],
        automation_commands=[{"id": 9, "user_id": "u1", "kind": "linkedin", "status": "pending", "payload": {"path": path, "name": "Profile.pdf"}, "job_ids": [], "dry_run": True}],
    )
    db.files[path] = (NEW_CV.encode(), "text/plain")
    model = Schemas(profile=PREFILLED)
    session._client = model  # type: ignore[assignment]
    agent = agent_for(session, db)
    before = session.config.cv.read_text(encoding="utf-8")

    asyncio.run(agent.next_command())
    assert db.tables["automation_commands"][0]["status"] == "done"
    row = db.tables["automation_profile"][0]
    data = row["data"]
    # What was there stays; the rest comes in. The person's review still stands.
    assert data["personal"]["first_name"] == "Ada" and data["personal"]["city"] == "Tampa" and data["personal"]["last_name"] == "Rossi"
    assert data["skills"] == ["Go", "Python"] and [e["company"] for e in data["experience"]] == ["Acme"]
    assert row["completed"] is True and row["updated_by"] == "web" and row["updated_at"] != "2026-11-01T00:00:00+00:00"
    assert agent.state == "ready" and agent.message.startswith("LinkedIn profile read: added 1 role, 1 skill")
    # The answers follow at once, and the resume and its search are untouched.
    assert session.store.answers()["last_name"] == "Rossi"
    assert session.config.cv.read_text(encoding="utf-8") == before and session.resume_name() == "Ada Rossi CV.pdf"
    assert not list((session.config.data_dir / "cvs").rglob("linkedin*")) and model.asked == ["profile"]


def test_a_linkedin_command_for_a_file_outside_the_persons_folder_is_refused(session: Session) -> None:
    db = Remote(
        automation_commands=[{"id": 9, "user_id": "u1", "kind": "linkedin", "status": "pending", "payload": {"path": "u2/linkedin/x.pdf"}, "job_ids": [], "dry_run": True}],
    )
    db.files["u2/linkedin/x.pdf"] = (b"%PDF", "application/pdf")
    agent = agent_for(session, db)
    asyncio.run(agent.next_command())
    command = db.tables["automation_commands"][0]
    assert command["status"] == "failed" and command["error"] == "the command names no LinkedIn file" and "automation_profile" not in db.tables


# The Calendar page.


def test_an_event_from_the_page_goes_to_google_and_the_command_says_how_it_went(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    made: list[dict[str, Any]] = []

    async def add(db: Any, workspace: Path, payload: dict[str, Any]) -> dict[str, Any]:
        made.append(payload)
        return {"id": "u-1", "title": payload["title"]}

    monkeypatch.setattr(worker.calendar_push, "add", add)
    payload = {"title": "Call with Stripe", "starts_at": "2026-11-20T15:00:00-05:00", "kind": "call", "company": "Stripe"}
    db = Remote(automation_commands=[{"id": 7, "user_id": "u1", "kind": "calendar_add", "status": "pending", "payload": payload, "job_ids": []}])
    agent = agent_for(session, db)
    asyncio.run(agent.next_command())
    assert made == [payload]
    assert db.row("automation_commands", id=7)["status"] == "done"
    assert agent.message == "Added to your calendar: Call with Stripe"


def test_a_calendar_error_fails_the_command_with_its_sentence(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    async def add(db: Any, workspace: Path, payload: dict[str, Any]) -> dict[str, Any]:
        raise ConfigError("Google Calendar is not set up: add GMAIL_APP_PASSWORD to .env.")

    monkeypatch.setattr(worker.calendar_push, "add", add)
    db = Remote(automation_commands=[{"id": 8, "user_id": "u1", "kind": "calendar_add", "status": "pending", "payload": {"title": "x"}, "job_ids": []}])
    asyncio.run(agent_for(session, db).next_command())
    row = db.row("automation_commands", id=8)
    assert row["status"] == "failed" and "GMAIL_APP_PASSWORD" in row["error"]


def test_without_the_calendar_table_the_sync_never_starts(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[bool] = []

    async def keep(*arguments: Any, **keywords: Any) -> None:
        started.append(True)

    monkeypatch.setattr(worker.calendar_push, "keep_current", keep)
    agent = agent_for(session, Remote("automation_calendar"))

    async def run() -> None:
        await agent.detect()
        await agent.calendar_loop()

    asyncio.run(run())
    assert started == [] and not agent.support.calendar

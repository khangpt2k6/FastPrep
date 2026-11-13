"""agent-automation: the local half of the web dashboard.

The web page (web/, on Vercel) cannot run a browser, so this process does the work on your computer. It signs in to
Supabase as you, keeps the scored jobs in sync there, and runs the applications the page asks for, with the same Session
the terminal interface uses. Everything goes through Supabase's REST API with your own login, so RLS applies.

The Agent page can pause it and have it fetch new jobs on its own every few hours, and a resume uploaded on the page
becomes the one in use. A database whose schema is older than those parts runs as before: each part is asked about once
at the start, and left out when Supabase says it is not there. keeper.py keeps this process running in the background.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import re
import sys
import time
import unicodedata
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import click
import httpx

from agent_automation.agent.companies import company_key, key_of, name_companies
from agent_automation.agent.cover_letter import Letter
from agent_automation.agent.cover_letter.sync import CoverLetters
from agent_automation.agent.scoring import NotAnswering
from agent_automation.agent.session import Session
from agent_automation.hooks.runner import run_hooks
from agent_automation.memory.config import DRY_RUN_ENV, Config, ConfigError, default_home, load_config, load_dotenv
from agent_automation.memory.profile import read_resume, set_search_places
from agent_automation.memory.store import SENT_WORDS, SUBMITTED, Stored, safe_name
from agent_automation.memory.web_profile import mirror_to_home, prefill, profile_answers, writing_text
from agent_automation.memory.web_rules import answer_rules_text, builtin_rules, mirror_rules
from agent_automation.ui.inbox_push import keep_current
from agent_automation.ui.keeper import LOCK_FILE, STOP_FILE, keeper_running, release, take_lock

HEARTBEAT_SECONDS = 10
POLL_SECONDS = 2
PROFILE_SECONDS = 5
# How often the Agent page's switches are read again, and the stop file looked for.
SETTINGS_SECONDS = 5
STOP_SECONDS = 2
# How often auto-fetch looks whether a round is due. A round that failed is tried again after FETCH_RETRY_SECONDS.
FETCH_CHECK_SECONDS = 30
FETCH_RETRY_SECONDS = 900
# How many jobs get scored before the agent waits for the page to ask for more.
SCORE_TARGET = 300
SCORE_MORE = 200
PUSH_LIMIT = 300
BUCKET = "automation-proofs"
# After a failed try at naming the companies, the next try waits this long, so a model with no credit is not asked on
# every push.
NAMING_PAUSE_SECONDS = 600
AGENT_SETTINGS = "automation_settings"
RESUMES = "automation_resumes"
RULES = "automation_rules"
PAUSED = "Paused from the dashboard"
# Supabase's answer when a table or column is not there: supabase/schema.sql was not run again since it got it.
MISSING = frozenset({"42703", "42P01", "PGRST204", "PGRST205"})
# The parts of the newer schema the agent asks about, and what each one brings.
PARTS = {
    "settings": "automation_settings (pause and auto-fetch)",
    "fetch": "automation_agent.fetched_at (when new jobs were last fetched)",
    "found_at": "automation_jobs.found_at (when each job was found)",
    "resumes": "automation_resumes (resumes uploaded on the page)",
    "rules": "automation_rules (rules edited on the Rules page)",
}
CONTENT_TYPES = {
    ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".txt": "text/plain",
    ".md": "text/markdown",
}
# Names Windows keeps for its devices: no file can have one.
DEVICE_NAMES = frozenset({"con", "prn", "aux", "nul", *(f"com{n}" for n in range(1, 10)), *(f"lpt{n}" for n in range(1, 10))})


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _at(moment: float | None) -> str | None:
    """A time.time() as Supabase takes a timestamptz."""
    return None if moment is None else datetime.fromtimestamp(moment, UTC).isoformat(timespec="seconds")


def _stamp(text: str) -> str | None:
    """A time the store wrote, as Supabase takes it; None for one that is not a time, which must not stop a push."""
    try:
        return datetime.fromisoformat(text).isoformat() if text else None
    except ValueError:
        return None


def _env(*names: str) -> str:
    return next((os.environ[name].strip() for name in names if os.environ.get(name, "").strip()), "")


def _quiet(loop: asyncio.AbstractEventLoop, context: dict[str, Any]) -> None:
    """Windows' event loop reports a connection the other side already closed as an error with a traceback; it is not one."""
    error = context.get("exception")
    if isinstance(error, (ConnectionAbortedError, ConnectionResetError)) and "_call_connection_lost" in repr(context.get("handle") or context.get("message")):
        return
    loop.default_exception_handler(context)


def _moving(answers: dict[str, str]) -> bool:
    return answers.get("willing_to_relocate", "").strip().lower().startswith("y")


def schema_missing(error: BaseException) -> bool:
    """Whether Supabase answered that a table or column is not there, as opposed to failing to answer at all."""
    if not isinstance(error, httpx.HTTPStatusError) or not 400 <= error.response.status_code < 500:
        return False
    try:
        said = error.response.json()
    except ValueError:
        return False
    return isinstance(said, dict) and str(said.get("code") or "") in MISSING


@dataclass(frozen=True)
class Settings:
    """The Agent page's switches (automation_settings). With no row, or no table, these defaults: the agent then runs as it
    did before the switches."""

    paused: bool = False
    auto_fetch: bool = True
    fetch_hours: int = 3
    fetch_limit: int = 40


def settings_from(row: dict[str, Any] | None) -> Settings:
    """The switches in a row of automation_settings. A value that is missing, of the wrong kind or out of the table's range
    gives way to its default, as on the page."""
    row = row or {}
    default = Settings()

    def switch(name: str) -> bool:
        value = row.get(name)
        return value if isinstance(value, bool) else getattr(default, name)

    def number(name: str, low: int, high: int) -> int:
        value = row.get(name)
        try:
            amount = float(value) if not isinstance(value, bool) else float("nan")
        except (TypeError, ValueError):
            return getattr(default, name)
        return int(amount) if amount.is_integer() and low <= amount <= high else getattr(default, name)

    return Settings(switch("paused"), switch("auto_fetch"), number("fetch_hours", 1, 48), number("fetch_limit", 0, 200))


def next_fetch(last: float | None, settings: Settings, failed: bool = False) -> float | None:
    """When the next round of auto-fetch is due, as a time.time(): fetch_hours after the last round ended, or
    FETCH_RETRY_SECONDS after one that failed. None while none is due: auto-fetch off, paused, or the first download of the
    run not done yet."""
    if last is None or settings.paused or not settings.auto_fetch:
        return None
    return last + (FETCH_RETRY_SECONDS if failed else settings.fetch_hours * 3600)


def places_of(data: dict[str, Any]) -> tuple[list[str], str]:
    """The countries the person wants to work in and their own city, from the web profile."""
    auth = data.get("authorization") if isinstance(data.get("authorization"), dict) else {}
    personal = data.get("personal") if isinstance(data.get("personal"), dict) else {}
    return [str(name) for name in auth.get("countries") or [] if str(name).strip()], str(personal.get("city") or "")


def search_summary(config: Config) -> dict[str, Any]:
    """The search a resume set up, as the page shows it: the goals, the places, and the titles looked for (the plan's
    wordings, each once)."""
    titles: dict[str, str] = {}
    for node in config.filters.plan.nodes:
        for form in node.forms:
            titles.setdefault(form.text.strip().lower(), form.text.strip())
    return {
        "goals": config.goals, "cities": list(config.filters.cities), "countries": list(config.filters.countries),
        "titles": [title for title in titles.values() if title][:20],
    }


def upload_name(name: str, suffix: str = "") -> str:
    """A file name from the page, as one this computer can keep: no folder, no character Windows refuses. `suffix` is the
    kind of file when the name gives none."""
    base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", name.replace("\\", "/").rsplit("/", 1)[-1]).strip().rstrip(".")
    stem, kind = Path(base).stem.strip()[:100], Path(base).suffix or suffix
    if not stem or stem.lower() in DEVICE_NAMES:
        stem = f"resume-{stem}" if stem else "resume"
    return stem + kind


def storage_name(name: str) -> str:
    """A file name as the page writes one into storage: letters, digits, dot, dash and underscore."""
    cleaned = re.sub(r"[^\w.-]+", "_", unicodedata.normalize("NFKD", name), flags=re.ASCII)
    return re.sub(r"_+", "_", cleaned).lstrip("_.")[-80:] or "resume.pdf"


def keep_upload(data_dir: Path, name: str, data: bytes, suffix: str = "") -> Path:
    """A resume uploaded on the page, kept under data/cvs/uploads/ by the name the person gave it: the settings show it."""
    folder = data_dir / "cvs" / "uploads"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / upload_name(name, suffix)
    path.write_bytes(data)
    return path


class Support:
    """Which parts of the newer schema the database has. Each is taken as there until Supabase says it is not; that is said
    once, and from then on the agent does what it did before that part came."""

    def __init__(self) -> None:
        self.settings = self.fetch = self.found_at = self.resumes = self.rules = True

    def drop(self, part: str) -> None:
        if getattr(self, part):
            setattr(self, part, False)
            click.echo(f"{PARTS[part]} is not in the database yet: run supabase/schema.sql to have it. The agent goes on without it.")


class Paused(Exception):
    """The page paused the agent in the middle of a command: what is done stays done, the rest waits for the person."""


class Supabase:
    """The few Supabase calls the agent needs, signed in as the person so RLS applies."""

    def __init__(self, url: str, key: str, email: str, password: str) -> None:
        self.url = url.rstrip("/")
        self.key = key
        self.email = email
        self.password = password
        self.http = httpx.AsyncClient(timeout=30)
        self.token = ""
        self.refresh = ""
        self.expires_at = 0.0
        self.user_id = ""

    async def sign_in(self) -> None:
        reply = await self.http.post(
            f"{self.url}/auth/v1/token", params={"grant_type": "password"}, headers={"apikey": self.key},
            json={"email": self.email, "password": self.password},
        )
        if reply.status_code != 200:
            raise ConfigError(f"Supabase sign-in failed for {self.email}: add that user in Supabase (Authentication > Users), then check AGENT_PASSWORD")
        self._take(reply.json())

    def _take(self, data: dict[str, Any]) -> None:
        self.token = data["access_token"]
        self.refresh = data["refresh_token"]
        self.expires_at = time.time() + int(data.get("expires_in") or 3600)
        self.user_id = data["user"]["id"]

    async def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        if time.time() > self.expires_at - 120:
            reply = await self.http.post(
                f"{self.url}/auth/v1/token", params={"grant_type": "refresh_token"}, headers={"apikey": self.key}, json={"refresh_token": self.refresh},
            )
            if reply.status_code == 200:
                self._take(reply.json())
            else:
                await self.sign_in()
        return {"apikey": self.key, "Authorization": f"Bearer {self.token}", **(extra or {})}

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        for start in range(0, len(rows), 500):
            reply = await self.http.post(
                f"{self.url}/rest/v1/{table}", params={"on_conflict": conflict},
                headers=await self._headers({"Prefer": "resolution=merge-duplicates,return=minimal"}), json=rows[start : start + 500],
            )
            reply.raise_for_status()

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        reply = await self.http.get(f"{self.url}/rest/v1/{table}", params=params, headers=await self._headers())
        reply.raise_for_status()
        return reply.json()

    async def update(self, table: str, params: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        reply = await self.http.patch(
            f"{self.url}/rest/v1/{table}", params=params, headers=await self._headers({"Prefer": "return=representation"}), json=values,
        )
        reply.raise_for_status()
        return reply.json()

    async def insert(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        reply = await self.http.post(f"{self.url}/rest/v1/{table}", headers=await self._headers({"Prefer": "return=minimal"}), json=rows)
        reply.raise_for_status()

    async def delete(self, table: str, params: dict[str, str]) -> None:
        reply = await self.http.delete(f"{self.url}/rest/v1/{table}", params=params, headers=await self._headers({"Prefer": "return=minimal"}))
        reply.raise_for_status()

    async def upload(self, path: str, data: bytes, content_type: str = "image/png") -> None:
        reply = await self.http.post(
            f"{self.url}/storage/v1/object/{BUCKET}/{path}", headers=await self._headers({"Content-Type": content_type, "x-upsert": "true"}), content=data,
        )
        reply.raise_for_status()

    async def download(self, path: str) -> bytes:
        """A file of the bucket, as the page uploaded it. Its path is quoted: a name may hold spaces or other letters."""
        reply = await self.http.get(f"{self.url}/storage/v1/object/{BUCKET}/{quote(path, safe='/')}", headers=await self._headers())
        reply.raise_for_status()
        return reply.content

    async def close(self) -> None:
        await self.http.aclose()


class Agent:
    def __init__(self, session: Session, db: Supabase, resume: Path | None) -> None:
        self.session = session
        self.db = db
        self.resume = resume
        self.state = "starting"
        self.message = ""
        self.download = ""
        self.wake = asyncio.Event()
        self.target = SCORE_TARGET
        self.profile_seen = ""
        self.letters = CoverLetters(db, session, click.echo)
        # One search at a time: a change of places must not land in the middle of a round.
        self.search_lock = asyncio.Lock()
        self.fresh = True
        # Naming the companies runs beside the pushes, one at a time.
        self.naming: asyncio.Task[None] | None = None
        self.naming_paused_until = 0.0
        # The jobs tried before get their company's name once a run: they are not pushed again.
        self.tried_named = False
        # Which parts of the newer schema the database has, and the Agent page's switches.
        self.support = Support()
        self.settings = Settings()
        # Set while the agent is not paused: what a pause holds back waits on it.
        self.go = asyncio.Event()
        self.go.set()
        # Commands and auto-fetch rounds under way: a pause that comes meanwhile is said when they end.
        self.busy = 0
        # Auto-fetch. last_round: when the last round ended, the run's first download counting as one; round_failed: whether
        # it failed, so the next comes sooner. fetched_at: when the job database last came down; the jobs first seen since
        # round_from are what that brought.
        self.last_round: float | None = None
        self.round_failed = False
        self.fetched_at: float | None = None
        self.round_from = _now()

    # What the page shows about the agent.

    def say(self, state: str, message: str = "") -> None:
        self.state, self.message = state, message
        click.echo(f"[{state}] {message}")
        asyncio.get_running_loop().create_task(self._beat())

    def scored(self) -> int:
        return sum(1 for item in self.session.store.all() if item.score is not None)

    def ready_message(self) -> str:
        return f"{self.scored()} jobs scored. Pick the ones to apply to."

    def idle(self, message: str = "") -> None:
        """Done for now: ready with this message, or paused when the page paused the agent meanwhile."""
        if self.settings.paused:
            self.say("paused", PAUSED)
        else:
            self.say("ready", message or self.ready_message())

    def say_error(self, message: str) -> None:
        """An error in something that ran on its own. Paused meanwhile, the page then says paused again: that is what the
        person set, and going on again starts from it."""
        self.say("error", message)
        if self.settings.paused:
            self.say("paused", PAUSED)

    def fetch_columns(self) -> dict[str, Any]:
        """For the Agent page: when the job database last came down, how many new jobs that brought, and when the next
        round of auto-fetch is. Nothing when the table has no such columns."""
        if not self.support.fetch:
            return {}
        due = None if self.state == "offline" else next_fetch(self.last_round, self.settings, self.round_failed)
        columns: dict[str, Any] = {"next_fetch_at": _at(due)}
        if self.fetched_at is not None:
            columns |= {"fetched_at": _at(self.fetched_at), "fetched_new": self.session.store.found_since(self.round_from)}
        return columns

    async def _beat(self) -> None:
        items = self.session.store.all()
        message = " | ".join(part for part in (self.message, self.download) if part)
        row = {
            "user_id": self.db.user_id, "state": self.state, "message": message[:500], "resume_name": self.session.resume_name(),
            "model": self.session.config.model, "jobs_found": len(items), "jobs_scored": sum(1 for item in items if item.score is not None),
            "last_seen": _now(),
        }
        fetch = self.fetch_columns()
        try:
            await self.db.upsert("automation_agent", [{**row, **fetch}], "user_id")
        except Exception as error:  # noqa: BLE001  A missed heartbeat only makes the page wait for the next one.
            if fetch and schema_missing(error):
                # The columns turned out not to be there: the heartbeat goes on without them.
                self.support.drop("fetch")
                await self._beat()
                return
            click.echo(f"heartbeat failed: {error}")

    async def heartbeat(self) -> None:
        while True:
            await self._beat()
            await asyncio.sleep(HEARTBEAT_SECONDS)

    # The jobs: download, search, score, push.

    def _row(self, item: Stored, companies: dict[str, tuple[str, str]]) -> dict[str, Any]:
        job = item.job
        name, domain = companies.get(company_key(job), ("", ""))
        row = {
            "user_id": self.db.user_id, "id": job.id, "title": job.title, "company": job.company, "location": job.location,
            "url": job.url, "score": item.score, "status": item.status, "note": (item.note or "")[:2000], "updated_at": _now(),
            "company_name": name, "company_domain": domain,
        }
        if self.support.found_at:
            row["found_at"] = _stamp(item.first_seen)
        return row

    async def push_jobs(self) -> None:
        items = self.session.store.all()
        # Only the jobs not tried yet: a tried one's row is written when its application ends, and pushing it again would
        # only move its time to now.
        scored = [item for item in items if item.score is not None and item.status not in SENT_WORDS][:PUSH_LIMIT]
        try:
            await self._push(scored)
        except Exception as error:
            if not (self.support.found_at and schema_missing(error)):
                raise
            self.support.drop("found_at")
            await self._push(scored)
        # The names come after the rows, so the page never waits on them.
        if self.naming is None or self.naming.done():
            tried = [item for item in items if item.status in SENT_WORDS]
            self.naming = asyncio.create_task(self.know_companies(scored + tried))

    async def _push(self, items: list[Stored]) -> None:
        companies = self.session.store.companies()
        await self.db.upsert("automation_jobs", [self._row(item, companies) for item in items], "user_id,id")

    async def push_all(self) -> None:
        """The jobs pushed after a search. The first push of this run replaces what an earlier run left on the page, so the
        two agree."""
        if self.fresh:
            await self.db.delete("automation_jobs", {"user_id": f"eq.{self.db.user_id}", "status": "in.(new,scored,passed_over)"})
            self.fresh = False
        await self.push_jobs()

    async def know_companies(self, items: list[Stored]) -> None:
        """Names the employers of these jobs not named yet, for the page's names and logos, and writes them on their
        rows. Only the two company columns are written, so a status the page shows is never put back. A failure leaves
        them unnamed for now: the jobs go on without them."""
        store = self.session.store
        try:
            known = store.companies()
            unnamed = [item.job for item in items if company_key(item.job) not in known]
            if unnamed and time.monotonic() >= self.naming_paused_until:
                try:
                    named = await name_companies(self.session.client, self.session.config.quick_model, unnamed)
                except Exception as error:  # noqa: BLE001  Names and logos are only for the page.
                    self.naming_paused_until = time.monotonic() + NAMING_PAUSE_SECONDS
                    click.echo(f"company names: {error}")
                    named = {}
                store.set_companies({key: (company.name, company.domain) for key, company in named.items()})
                known = store.companies()
                fresh = {item.job.company for item in items if company_key(item.job) in named}
                for company in fresh:
                    name, domain = known[key_of(company)]
                    where = {"user_id": f"eq.{self.db.user_id}", "company": f"eq.{company}"}
                    await self.db.update("automation_jobs", where, {"company_name": name, "company_domain": domain})
            if not self.tried_named:
                # Jobs tried in an earlier run whose company was named then, but whose rows were never given it.
                for item in items:
                    if item.status in SENT_WORDS and company_key(item.job) in known:
                        name, domain = known[company_key(item.job)]
                        where = {"user_id": f"eq.{self.db.user_id}", "id": f"eq.{item.job.id}"}
                        await self.db.update("automation_jobs", where, {"company_name": name, "company_domain": domain})
                self.tried_named = True
        except Exception as error:  # noqa: BLE001  Tried again on the next push.
            click.echo(f"company names on the page: {error}")

    async def sync_jobs(self, arrived: Callable[[], None]) -> None:
        """The job database brought to its newest build, how far along shown on the page; `arrived` is told as in Session.sync."""
        session = self.session

        def chunks(done: int, size: int) -> None:
            self.download = "" if session.library.complete() else f"Downloading the job database: {done}/{size} parts"

        try:
            await session.sync(chunks, arrived)
        finally:
            self.download = ""

    async def bring_jobs(self) -> None:
        try:
            await self.sync_jobs(self.wake.set)
            self.fetched_at = time.time()
        except Exception as error:  # noqa: BLE001  The jobs already here can still be searched.
            click.echo(f"job database: {error}")
            self.round_failed = True
        # This first download counts as the first round of auto-fetch: the next one comes fetch_hours after it.
        self.last_round = time.time()
        self.wake.set()
        self.session.bring_engine()

    async def searching(self) -> None:
        while True:
            await self.wake.wait()
            # Paused on the page: the search waits, and runs once the agent is resumed.
            await self.go.wait()
            self.wake.clear()
            if not self.session.library.has_postings():
                continue
            try:
                async with self.search_lock:
                    self.say("searching", "Searching the job database")
                    await self.session.find()
                    await self.score_rounds()
                    await self.push_all()
                self.idle()
            except Exception as error:  # noqa: BLE001  Said on the page; the next search tries again.
                self.say_error(f"Search failed: {error}")

    async def score_rounds(self, until: int | None = None) -> None:
        """The jobs not scored yet, scored a round at a time until `until` jobs are scored (the target when None), or none
        are left."""
        session = self.session
        failures = 0
        while session.store.with_status("new") and self.scored() < (goal := self.target if until is None else until):
            self.say("scoring", f"Scoring jobs against your resume ({self.scored()} so far)")
            try:
                # No more than asked for: a round of auto-fetch scores fetch_limit jobs at most.
                await session.read(click.echo, most=goal - self.scored())
            except NotAnswering:
                failures += 1
                if failures > 3:
                    return
                await asyncio.sleep(10 * failures)
                continue
            await self.push_jobs()

    async def fetching(self) -> None:
        """Auto-fetch: a fetch_round every fetch_hours, while the page has it on and the agent is not paused."""
        while True:
            await asyncio.sleep(FETCH_CHECK_SECONDS)
            due = next_fetch(self.last_round, self.settings, self.round_failed)
            if due is None or time.time() < due:
                continue
            self.busy += 1
            try:
                await self.fetch_round()
                self.round_failed = False
            except Exception as error:  # noqa: BLE001  Said on the page; the round is tried again after FETCH_RETRY_SECONDS.
                self.round_failed = True
                self.say_error(f"Checking for new jobs failed: {error}")
            finally:
                self.busy -= 1
                self.last_round = time.time()

    async def fetch_round(self) -> None:
        """What is new in the job database brought down and searched, then the best of the jobs not scored yet scored,
        fetch_limit of them at most. The page's Find more stays apart from this: it scores more of what is already here."""
        session = self.session
        self.say("searching", "Checking for new jobs")
        await self.sync_jobs(lambda: None)
        self.fetched_at, self.round_from = time.time(), _now()
        async with self.search_lock:
            new = await session.find()
            # Its own limit, not the target: a Find more waiting for this round keeps what it asked for.
            await self.score_rounds(until=self.scored() + self.settings.fetch_limit)
            await self.push_all()
        self.idle(f"{new} new job{'' if new == 1 else 's'} since the last check. {self.ready_message()}")

    # The profile from the page's wizard: the answers the forms are given.

    async def sync_profile(self, first: bool = False) -> None:
        rows = await self.db.select("automation_profile", {"user_id": f"eq.{self.db.user_id}", "select": "data,updated_by,updated_at"})
        row = rows[0] if rows else None
        if row is None or not row.get("data"):
            if first:
                self.say("reading", "Prefilling your profile from the resume")
                cv = self.session.config.cv.read_text(encoding="utf-8-sig")
                data = await prefill(self.session.client, self.session.config.quick_model, cv)
                await self.db.upsert(
                    "automation_profile", [{"user_id": self.db.user_id, "data": data, "completed": False, "updated_by": "agent", "updated_at": _now()}], "user_id",
                )
                click.echo("Profile prefilled from the resume: check it on the dashboard.")
            return
        if row["updated_at"] == self.profile_seen:
            return
        self.profile_seen = row["updated_at"]
        if row.get("updated_by") != "web":
            return
        data = row["data"]
        answers = profile_answers(data)
        moving_before = _moving(self.session.store.answers())
        for name, value in answers.items():
            self.session.store.set_answer(name, value, source="web")
        click.echo(f"Profile from the dashboard: {len(answers)} answers updated.")
        await self.follow_places(data, rescore=_moving(self.session.store.answers()) != moving_before)

    async def follow_places(self, data: dict[str, Any], rescore: bool = False) -> None:
        """The countries the person wants to work in decide where the search looks, and whether they will relocate decides
        how far: a change drops the jobs not tried yet, here and on the page, and searches and scores again."""
        countries, city = places_of(data)
        async with self.search_lock:
            if not set_search_places(self.session.config, countries, city) and not rescore:
                return
            await self.new_search()
        if not self.settings.paused:
            self.say("searching", f"Looking for jobs in {', '.join(countries) or 'your area'}")
        self.wake.set()

    async def new_search(self) -> None:
        """The search changed: its settings read again, and the jobs not tried yet dropped, here and on the page, so the
        list is the new search's own. Called with the search lock held."""
        self.session.config = load_config(self.session.workspace)
        self.session.store.forget_untried()
        await self.db.delete("automation_jobs", {"user_id": f"eq.{self.db.user_id}", "status": "in.(new,scored,passed_over)"})
        self.target = SCORE_TARGET

    async def web_profile(self) -> dict[str, Any]:
        rows = await self.db.select("automation_profile", {"user_id": f"eq.{self.db.user_id}", "select": "data"})
        data = rows[0].get("data") if rows else None
        return data if isinstance(data, dict) else {}

    async def profile_loop(self) -> None:
        while True:
            await asyncio.sleep(PROFILE_SECONDS)
            try:
                await self.sync_profile()
            except Exception as error:  # noqa: BLE001  Tried again on the next round.
                click.echo(f"profile sync failed: {error}")

    # The Agent page's switches: pause, and auto-fetch.

    async def detect(self) -> None:
        """Which parts of the newer schema the database has, asked once at the start with a select of each new table or
        column. One Supabase says is not there is left out for this run. One it could not answer about is kept: the call
        that uses it finds out, and leaves it out then."""
        for part, table, columns in (
            ("settings", AGENT_SETTINGS, "paused,auto_fetch,fetch_hours,fetch_limit"),
            ("fetch", "automation_agent", "fetched_at,next_fetch_at,fetched_new"),
            ("found_at", "automation_jobs", "found_at"),
            ("resumes", RESUMES, "id,status,data"),
            ("rules", RULES, "id,kind,body,enabled"),
        ):
            try:
                await self.db.select(table, {"select": columns, "limit": "1"})
            except Exception as error:  # noqa: BLE001  Only Supabase's own answer that it is missing turns a part off.
                if schema_missing(error):
                    self.support.drop(part)
                else:
                    click.echo(f"could not ask Supabase about {table}: {error}")

    async def read_settings(self) -> None:
        if not self.support.settings:
            return
        where = {"user_id": f"eq.{self.db.user_id}", "select": "paused,auto_fetch,fetch_hours,fetch_limit"}
        try:
            rows = await self.db.select(AGENT_SETTINGS, where)
        except Exception as error:
            if not schema_missing(error):
                raise
            self.support.drop("settings")
            rows = []
        self.use_settings(settings_from(rows[0] if rows else None))

    def use_settings(self, settings: Settings) -> None:
        """The page's switches taken in. A pause is said on the page at once, or, while a command or a round of auto-fetch
        runs, when that ends; going on again says ready."""
        was = self.settings.paused
        self.settings = settings
        if settings.paused and not was:
            self.go.clear()
            if not self.busy and not self.search_lock.locked():
                self.say("paused", PAUSED)
        elif was and not settings.paused:
            self.go.set()
            if self.state == "paused":
                self.say("ready", self.ready_message())

    async def settings_loop(self) -> None:
        while True:
            await asyncio.sleep(SETTINGS_SECONDS)
            try:
                await self.read_settings()
            except Exception as error:  # noqa: BLE001  The switches stay as they were until the next read.
                click.echo(f"settings: {error}")

    # What the page asks for.

    async def commands(self) -> None:
        while True:
            # Paused on the page: no command is taken, and they wait there until the agent is resumed.
            await self.go.wait()
            try:
                await self.next_command()
            except Exception as error:  # noqa: BLE001  The next poll tries again.
                click.echo(f"command poll failed: {error}")
            await asyncio.sleep(POLL_SECONDS)

    async def next_command(self) -> None:
        """The oldest command the page left, run; none while paused."""
        if self.settings.paused:
            return
        rows = await self.db.select(
            "automation_commands",
            {"status": "eq.pending", "kind": "in.(apply,search,cover_letter,resume)", "user_id": f"eq.{self.db.user_id}", "order": "created_at.asc", "limit": "1"},
        )
        if rows and not self.settings.paused:
            await self.handle(rows[0])

    async def handle(self, command: dict[str, Any]) -> None:
        claimed = await self.db.update("automation_commands", {"id": f"eq.{command['id']}", "status": "eq.pending"}, {"status": "running"})
        if not claimed:
            return
        self.busy += 1
        try:
            if command["kind"] == "search":
                self.target = self.scored() + SCORE_MORE
                self.wake.set()
            elif command["kind"] == "cover_letter":
                await self.write_letters(command["job_ids"])
            elif command["kind"] == "apply":
                await self.apply_all(command["job_ids"], bool(command["dry_run"]))
            elif command["kind"] == "resume":
                await self.read_upload(command.get("payload") or {})
            await self.db.update("automation_commands", {"id": f"eq.{command['id']}"}, {"status": "done"})
        except Paused as stop:
            click.echo(str(stop))
            await self.db.update("automation_commands", {"id": f"eq.{command['id']}"}, {"status": "failed", "error": str(stop)[:500]})
        except Exception as error:  # noqa: BLE001  The page shows the command as failed, with why.
            self.say("error", str(error))
            await self.db.update("automation_commands", {"id": f"eq.{command['id']}"}, {"status": "failed", "error": str(error)[:500]})
        finally:
            self.busy -= 1
        if self.settings.paused:
            self.say("paused", PAUSED)

    async def writing(self) -> tuple[str, bool]:
        """The writing preferences and the kept answers, as text for the forms, and whether to learn from what is written."""
        where = {"user_id": f"eq.{self.db.user_id}"}
        try:
            rows = await self.db.select("automation_preferences", where)
        except Exception as error:  # noqa: BLE001  Applications run without preferences rather than not at all.
            click.echo(f"preferences: {error}")
            rows = []
        try:
            memory = await self.db.select("automation_memory", {**where, "order": "pinned.desc,updated_at.desc", "limit": "200"})
        except Exception as error:  # noqa: BLE001  Same.
            click.echo(f"memory: {error}")
            memory = []
        preferences = rows[0] if rows else {}
        try:
            # A copy in the person's home, one way: the dashboard stays where these are edited.
            mirror_to_home(self.session.home, preferences, memory)
        except Exception as error:  # noqa: BLE001  The copy is for reading; the applications use what was read above.
            click.echo(f"preferences and memory not copied to {self.session.home.personal}: {error}")
        text = "\n\n".join(part for part in (writing_text(preferences, memory), await self.rules_text()) if part)
        return text, preferences.get("learn", True) is not False

    # The Rules page.

    async def publish_rules(self) -> None:
        """The rules the project ships, put on the Rules page: new ones added, and the shipped text of the others kept up to
        date. A rule the person changed on the page keeps their text; one they never touched follows the project's."""
        if not self.support.rules:
            return
        mine = {"user_id": f"eq.{self.db.user_id}"}
        try:
            known = {str(row["id"]): row for row in await self.db.select(RULES, {**mine, "select": "id,updated_by"})}
        except Exception as error:
            if not schema_missing(error):
                raise
            self.support.drop("rules")
            return
        fresh = []
        for rule in builtin_rules(self.session.home):
            if rule["id"] not in known:
                fresh.append({**rule, "user_id": self.db.user_id, "body": rule["default_body"], "enabled": True, "updated_by": "agent", "updated_at": _now()})
                continue
            values = {name: rule[name] for name in ("title", "description", "default_body", "sort")}
            if known[rule["id"]].get("updated_by") != "web":
                values["body"] = rule["default_body"]
            await self.db.update(RULES, {**mine, "id": f"eq.{rule['id']}"}, values)
        if fresh:
            await self.db.insert(RULES, fresh)

    async def rules_text(self) -> str:
        """The page's rules taken in before anything is written: the cover letter ones and the standing ones copied into the
        person's home, where the letters read them, and the answer ones as text for the forms' brief."""
        if not self.support.rules:
            return ""
        try:
            rows = await self.db.select(RULES, {"user_id": f"eq.{self.db.user_id}"})
        except Exception as error:  # noqa: BLE001  Letters and answers go on with the rules already copied.
            if schema_missing(error):
                self.support.drop("rules")
            else:
                click.echo(f"rules: {error}")
            return ""
        try:
            mirror_rules(self.session.home, rows)
        except Exception as error:  # noqa: BLE001  The copies are what letters read; the last ones stay.
            click.echo(f"rules not copied to {self.session.home.personal}: {error}")
        return answer_rules_text(rows)

    async def learn(self, item: Stored, written: tuple[tuple[str, str], ...]) -> None:
        """What the model wrote in its own words on this form, kept in Memory for the person to review and reuse."""
        rows = [
            {"user_id": self.db.user_id, "question": question[:1000], "answer": answer[:5000], "source": "learned",
             "company": item.job.company, "job_title": item.job.title, "job_id": item.job.id}
            for question, answer in written
        ]
        try:
            await self.db.insert("automation_memory", rows)
            if rows:
                click.echo(f"Memory: {len(rows)} answer(s) learned at {item.job.company}")
        except Exception as error:  # noqa: BLE001  The application itself is already recorded.
            click.echo(f"memory: {error}")

    async def letter(self, item: Stored, always: bool = False) -> Letter | None:
        """The job's cover letter as the page set it up, or None: letters off, or one that could not be written, which is
        said and does not stop the application."""
        try:
            return await self.letters.for_job(item, always)
        except Exception as error:  # noqa: BLE001  Said on the page; the application goes on without a letter.
            self.say(self.state, f"No cover letter for {item.job.company}: {error}")
            return None

    async def write_letters(self, job_ids: list[str]) -> None:
        """Cover letters for these jobs, to read and edit on the page before applying. Nothing is sent."""
        await self.writing()
        for number, job_id in enumerate(job_ids, 1):
            item = self.session.store.get(job_id)
            if item is None:
                continue
            self.say("writing", f"Cover letter {number}/{len(job_ids)}: {item.job.company}")
            await self.letter(item, always=True)
        self.say("ready", f"{len(job_ids)} cover letter(s) written. Read them on the page before applying.")

    async def apply_all(self, job_ids: list[str], dry: bool) -> None:
        session = self.session
        os.environ[DRY_RUN_ENV] = "1" if dry else ""
        writing, learning = await self.writing()
        mode = " (dry run, nothing is sent)" if dry else ""
        for number, job_id in enumerate(job_ids, 1):
            # A pause from the page lets the application under way finish, and starts no other.
            if self.settings.paused:
                raise Paused(f"Paused after {number - 1} of {len(job_ids)} jobs. Select the rest and apply again.")
            item = session.store.get(job_id)
            if item is None or item.status in SUBMITTED:
                continue
            label = f"{number}/{len(job_ids)} {item.job.company}: {item.job.title}"
            where = {"user_id": f"eq.{self.db.user_id}", "id": f"eq.{job_id}"}
            await self.db.update("automation_jobs", where, {"status": "applying", "note": "", "dry_run": dry, "updated_at": _now()})
            self.say("applying", f"{label}{mode}")

            def note(line: str, label: str = label) -> None:
                if line:
                    self.say("applying", f"{label}: {line}")

            letter = await self.letter(item)
            if letter is not None:
                self.say("applying", f"{label}: cover letter ready ({letter.template_id}){mode}")
            outcome = await session.apply(item, click.echo, note, writing, cover=letter)
            if learning and outcome.written:
                await self.learn(item, outcome.written)
            shot = ""
            if outcome.proof.screenshot and Path(outcome.proof.screenshot).is_file():
                shot = f"{self.db.user_id}/{safe_name(job_id)}.png"
                try:
                    await self.db.upload(shot, Path(outcome.proof.screenshot).read_bytes())
                except Exception as error:  # noqa: BLE001  The result still goes up without its picture.
                    click.echo(f"screenshot upload failed: {error}")
                    shot = ""
            await self.db.update("automation_jobs", where, {
                "status": outcome.status, "note": outcome.summary[:2000], "reason": outcome.reason, "screenshot_path": shot,
                "dry_run": dry, "updated_at": _now(),
            })
            self.say("applied", f"{label}: {outcome.status}")
            if outcome.reason == "no_credit":
                break
        self.say("ready", f"Done with {len(job_ids)} application(s){mode}.")

    # Resumes on the page.

    async def read_upload(self, payload: dict[str, Any]) -> None:
        """A resume uploaded on the page, made the one in use. It is read, its search set up (goals written by hand and the
        places picked on the page stay), and its row on the page filled in; the jobs not tried yet give way to the new
        search's. A resume that cannot be read changes nothing here, and its row says why."""
        try:
            number = int(payload["resume_id"])
        except (KeyError, TypeError, ValueError):
            raise ConfigError("the command names no resume") from None
        session = self.session
        where = {"user_id": f"eq.{self.db.user_id}", "id": f"eq.{number}"}
        try:
            rows = await self.db.select(RESUMES, {**where, "select": "id,name,path"})
            if not rows:
                raise ConfigError(f"resume {number} is not on the page any more")
            name, path = str(rows[0]["name"]), str(rows[0]["path"])
            await self.db.update(RESUMES, where, {"status": "reading", "error": "", "updated_at": _now()})
            self.say("reading", f"Reading {name}")
            file = keep_upload(session.config.data_dir, name, await self.db.download(path), Path(path).suffix)
            # The profile first: the resume changes nothing here until everything about it could be read.
            cv = await asyncio.to_thread(read_resume, file)
            profile = await prefill(session.client, session.config.quick_model, cv)
            countries, city = places_of(await self.web_profile())
            async with self.search_lock:
                await session.load_resume(file, keep_goals=True)
                # The places picked on the page win over the ones read from the resume.
                set_search_places(session.config, countries, city)
                await self.new_search()
            text = session.config.cv.read_text(encoding="utf-8-sig")
            await self.db.update(RESUMES, {"user_id": f"eq.{self.db.user_id}", "status": "eq.active", "id": f"neq.{number}"}, {"status": "old", "updated_at": _now()})
            await self.db.update(RESUMES, where, {
                "status": "active", "error": "", "text": text, "data": {"search": search_summary(session.config), "profile": profile}, "updated_at": _now(),
            })
        except Exception as error:
            try:
                await self.db.update(RESUMES, where, {"status": "failed", "error": str(error)[:500], "updated_at": _now()})
            except Exception as again:  # noqa: BLE001  The command still says what went wrong.
                click.echo(f"resume row: {again}")
            raise
        click.echo(f"Resume {name} is the one in use now.")
        if not self.settings.paused:
            self.say("searching", f"Searching again for {name}")
        self.wake.set()

    async def publish_resume(self, again: bool = False) -> None:
        """The resume in use, put on the page as the active one: when the page has none yet (a resume from before the page
        took them), or `again`, when one was just given on the command line. No model is asked: its search is already in
        the settings."""
        if not self.support.resumes:
            return
        mine = {"user_id": f"eq.{self.db.user_id}"}
        try:
            if not again and await self.db.select(RESUMES, {**mine, "select": "id", "limit": "1"}):
                return
        except Exception as error:
            if not schema_missing(error):
                raise
            self.support.drop("resumes")
            return
        config = self.session.config
        kept = sorted((config.data_dir / "cvs").glob("original-cv.*"))
        if not kept:
            return
        file = kept[0]
        name = self.session.resume_name() or file.name
        remote = f"{self.db.user_id}/resumes/{int(time.time() * 1000)}-{storage_name(name)}"
        await self.db.upload(remote, file.read_bytes(), CONTENT_TYPES.get(file.suffix.lower(), "application/octet-stream"))
        await self.db.update(RESUMES, {**mine, "status": "eq.active"}, {"status": "old", "updated_at": _now()})
        await self.db.insert(RESUMES, [{
            "user_id": self.db.user_id, "name": name, "path": remote, "size": file.stat().st_size, "status": "active",
            "text": config.cv.read_text(encoding="utf-8-sig"), "data": {"search": search_summary(config)},
        }])
        click.echo(f"Resume {name} is on the page now.")

    async def recover(self) -> None:
        """What an earlier run left half done when it stopped: its command ends as failed, and a job it was applying to
        goes back to how this computer last recorded it, so nothing on the page says "applying" forever."""
        mine = {"user_id": f"eq.{self.db.user_id}"}
        try:
            await self.db.update(
                "automation_commands", {**mine, "status": "eq.running"},
                {"status": "failed", "error": "The agent stopped before it finished. Select the jobs and apply again."},
            )
            for row in await self.db.select("automation_jobs", {**mine, "status": "eq.applying", "select": "id"}):
                item = self.session.store.get(row["id"])
                await self.db.update("automation_jobs", {**mine, "id": f"eq.{row['id']}"}, {
                    "status": item.status if item else "scored", "updated_at": _now(),
                })
        except Exception as error:  # noqa: BLE001  The page catches up on the next push either way.
            click.echo(f"recover: {error}")

    # Running, and stopping.

    async def stopped(self) -> None:
        """Returns once the stop file is there: `python -m agent_automation.ui.keeper stop` asks the agent to end that way."""
        stop = self.session.config.data_dir / STOP_FILE
        while not stop.exists():
            await asyncio.sleep(STOP_SECONDS)
        click.echo("Asked to stop: closing.")

    async def until_stopped(self, *jobs: Coroutine[Any, Any, None]) -> None:
        """Runs these side by side until the stop file appears, then ends them all. One that fails ends them too, with its
        error; one that is done (the first download) leaves the others running."""
        watch = asyncio.create_task(self.stopped())
        pending: set[asyncio.Task[None]] = {watch, *(asyncio.create_task(job) for job in jobs)}
        try:
            while watch in pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if task is not watch and not task.cancelled() and (error := task.exception()) is not None:
                        raise error
        finally:
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

    async def run(self) -> None:
        asyncio.get_running_loop().set_exception_handler(_quiet)
        # A library the agent loads logs every HTTP request at INFO: with a poll every 2 s that alone would fill agent.log
        # by tens of MB a day in the background.
        for name in ("httpx", "httpcore"):
            logging.getLogger(name).setLevel(logging.WARNING)
        await self.db.sign_in()
        click.echo(f"Signed in to Supabase as {self.db.email}")
        try:
            await self.detect()
            if self.resume:
                self.say("reading", f"Reading {self.resume.name}")
                await self.session.load_resume(self.resume)
            if self.session.needs_resume():
                raise ConfigError("no resume yet: run  agent-automation path/to/resume.pdf")
            self.say("starting", "Agent online")
            await self.recover()
            await run_hooks(self.session.home, "session_start", {"preferences": self.session.home.preferences()[0]}, click.echo)
            try:
                await self.letters.publish()
            except Exception as error:  # noqa: BLE001  The page shows no templates until the next start; letters still work.
                click.echo(f"cover letter templates not published: {error}")
            try:
                await self.publish_rules()
            except Exception as error:  # noqa: BLE001  The Rules page shows what it had; letters still follow the files.
                click.echo(f"rules not published: {error}")
            try:
                # The page shows the resume in use: the one given on the command line, or one from before the page took them.
                await self.publish_resume(again=self.resume is not None)
            except Exception as error:  # noqa: BLE001  The page shows no resume until the next start; nothing else needs it.
                click.echo(f"resume not put on the page: {error}")
            # The profile first: its countries may change where the first search looks.
            try:
                await self.sync_profile(first=True)
            except Exception as error:  # noqa: BLE001  The applications still run on the answers already here.
                click.echo(f"profile: {error}")
            try:
                await self.read_settings()
            except Exception as error:  # noqa: BLE001  The defaults until the next read.
                click.echo(f"settings: {error}")
            await self.until_stopped(
                self.heartbeat(), self.profile_loop(), self.settings_loop(), self.commands(), self.bring_jobs(), self.searching(), self.fetching(),
                # The Gmail inbox on the page's Inbox: every 15 minutes, or said once and ended when Gmail is not set up.
                keep_current(self.db, self.session.workspace),
            )
        finally:
            self.state, self.message, self.download = "offline", "", ""
            await self._beat()
            await self.db.close()


@click.command()
@click.argument("resume", required=False, type=click.Path(exists=True, dir_okay=False, path_type=Path))
def main(resume: Path | None) -> None:
    """Run the local agent for the web dashboard. Give a resume the first time, or to change it."""
    load_dotenv(Path.cwd(), default_home(), Path(__file__).resolve().parents[3])
    url = _env("SUPABASE_URL", "VITE_SUPABASE_URL")
    key = _env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    email, password = _env("AGENT_EMAIL"), _env("AGENT_PASSWORD")
    missing = [name for name, value in (("SUPABASE_URL", url), ("SUPABASE_ANON_KEY", key), ("AGENT_EMAIL", email), ("AGENT_PASSWORD", password)) if not value]
    if missing:
        raise ConfigError(f"set {', '.join(missing)} in .env (the email and password of your dashboard account)")
    home = default_home().resolve()
    data = Config(workspace=home).data_dir
    # One agent per home: two would take the same commands and send the same applications twice.
    lock = take_lock(data / LOCK_FILE)
    if lock is None:
        raise ConfigError(f"an agent is already running for {home}. Stop it first (python -m agent_automation.ui.keeper stop), or close its window.")
    try:
        if not keeper_running(data):
            # A stop asked of an agent that is gone, with no keeper left to clear it.
            (data / STOP_FILE).unlink(missing_ok=True)
        session = Session(home)
        agent = Agent(session, Supabase(url, key, email, password), resume.resolve() if resume else None)
        try:
            asyncio.run(agent.run())
        except KeyboardInterrupt:
            click.echo("Agent stopped.")
        finally:
            session.close()
    finally:
        release(lock)


def run() -> None:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        main()
    except ConfigError as error:
        raise SystemExit(f"agent-automation: {error}") from error


if __name__ == "__main__":
    run()

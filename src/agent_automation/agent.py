"""agent-automation: the local half of the web dashboard.

The web page (web/, on Vercel) cannot run a browser, so this process does the work on your computer. It signs in to
Supabase as you, keeps the scored jobs in sync there, and runs the applications the page asks for, with the same Session
the terminal interface uses. Everything goes through Supabase's REST API with your own login, so RLS applies.
"""

from __future__ import annotations

import asyncio
import io
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import click
import httpx

from agent_automation.config import DRY_RUN_ENV, ConfigError, default_home, load_config, load_dotenv
from agent_automation.profile import set_search_places
from agent_automation.scoring import NotAnswering
from agent_automation.session import Session
from agent_automation.store import SENT_WORDS, SUBMITTED, Stored, safe_name
from agent_automation.web_profile import prefill, profile_answers, writing_text

HEARTBEAT_SECONDS = 10
POLL_SECONDS = 2
PROFILE_SECONDS = 5
# How many jobs get scored before the agent waits for the page to ask for more.
SCORE_TARGET = 300
SCORE_MORE = 200
PUSH_LIMIT = 300
BUCKET = "automation-proofs"


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _env(*names: str) -> str:
    return next((os.environ[name].strip() for name in names if os.environ.get(name, "").strip()), "")


def _moving(answers: dict[str, str]) -> bool:
    return answers.get("willing_to_relocate", "").strip().lower().startswith("y")


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
            raise ConfigError(f"Supabase sign-in failed for {self.email}: make the account on the dashboard first, then check AGENT_PASSWORD")
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

    async def upload(self, path: str, data: bytes) -> None:
        reply = await self.http.post(
            f"{self.url}/storage/v1/object/{BUCKET}/{path}", headers=await self._headers({"Content-Type": "image/png", "x-upsert": "true"}), content=data,
        )
        reply.raise_for_status()

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
        # One search at a time: a change of places must not land in the middle of a round.
        self.search_lock = asyncio.Lock()

    # What the page shows about the agent.

    def say(self, state: str, message: str = "") -> None:
        self.state, self.message = state, message
        click.echo(f"[{state}] {message}")
        asyncio.get_running_loop().create_task(self._beat())

    def scored(self) -> int:
        return sum(1 for item in self.session.store.all() if item.score is not None)

    async def _beat(self) -> None:
        items = self.session.store.all()
        message = " | ".join(part for part in (self.message, self.download) if part)
        row = {
            "user_id": self.db.user_id, "state": self.state, "message": message[:500], "resume_name": self.session.resume_name(),
            "model": self.session.config.model, "jobs_found": len(items), "jobs_scored": sum(1 for item in items if item.score is not None),
            "last_seen": _now(),
        }
        try:
            await self.db.upsert("automation_agent", [row], "user_id")
        except Exception as error:  # noqa: BLE001  A missed heartbeat only makes the page wait for the next one.
            click.echo(f"heartbeat failed: {error}")

    async def heartbeat(self) -> None:
        while True:
            await self._beat()
            await asyncio.sleep(HEARTBEAT_SECONDS)

    # The jobs: download, search, score, push.

    def _row(self, item: Stored) -> dict[str, Any]:
        job = item.job
        return {
            "user_id": self.db.user_id, "id": job.id, "title": job.title, "company": job.company, "location": job.location,
            "url": job.url, "score": item.score, "status": item.status, "note": (item.note or "")[:2000], "updated_at": _now(),
        }

    async def push_jobs(self) -> None:
        items = self.session.store.all()
        scored = [item for item in items if item.score is not None and item.status not in SENT_WORDS][:PUSH_LIMIT]
        tried = [item for item in items if item.status in SENT_WORDS]
        await self.db.upsert("automation_jobs", [self._row(item) for item in scored + tried], "user_id,id")

    async def bring_jobs(self) -> None:
        session = self.session

        def chunks(done: int, size: int) -> None:
            self.download = "" if session.library.complete() else f"Downloading the job database: {done}/{size} parts"

        try:
            await session.sync(chunks, self.wake.set)
        except Exception as error:  # noqa: BLE001  The jobs already here can still be searched.
            click.echo(f"job database: {error}")
        self.download = ""
        self.wake.set()
        session.bring_engine()

    async def searching(self) -> None:
        while True:
            await self.wake.wait()
            self.wake.clear()
            if not self.session.library.has_postings():
                continue
            try:
                async with self.search_lock:
                    self.say("searching", "Searching the job database")
                    await self.session.find()
                    await self.score_rounds()
                    await self.push_jobs()
                self.say("ready", f"{self.scored()} jobs scored. Pick the ones to apply to.")
            except Exception as error:  # noqa: BLE001  Said on the page; the next search tries again.
                self.say("error", f"Search failed: {error}")

    async def score_rounds(self) -> None:
        session = self.session
        failures = 0
        while session.store.with_status("new") and self.scored() < self.target:
            self.say("scoring", f"Scoring jobs against your resume ({self.scored()} so far)")
            try:
                await session.read(click.echo)
            except NotAnswering:
                failures += 1
                if failures > 3:
                    return
                await asyncio.sleep(10 * failures)
                continue
            await self.push_jobs()

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
        auth = data.get("authorization") if isinstance(data.get("authorization"), dict) else {}
        personal = data.get("personal") if isinstance(data.get("personal"), dict) else {}
        countries = [str(name) for name in auth.get("countries") or [] if str(name).strip()]
        async with self.search_lock:
            if not set_search_places(self.session.config, countries, str(personal.get("city") or "")) and not rescore:
                return
            self.session.config = load_config(self.session.workspace)
            self.session.store.forget_untried()
            await self.db.delete("automation_jobs", {"user_id": f"eq.{self.db.user_id}", "status": "in.(new,scored,passed_over)"})
            self.target = SCORE_TARGET
        self.say("searching", f"Looking for jobs in {', '.join(countries) or 'your area'}")
        self.wake.set()

    async def profile_loop(self) -> None:
        while True:
            await asyncio.sleep(PROFILE_SECONDS)
            try:
                await self.sync_profile()
            except Exception as error:  # noqa: BLE001  Tried again on the next round.
                click.echo(f"profile sync failed: {error}")

    # What the page asks for.

    async def commands(self) -> None:
        while True:
            try:
                rows = await self.db.select(
                    "automation_commands", {"status": "eq.pending", "user_id": f"eq.{self.db.user_id}", "order": "created_at.asc", "limit": "1"},
                )
                if rows:
                    await self.handle(rows[0])
            except Exception as error:  # noqa: BLE001  The next poll tries again.
                click.echo(f"command poll failed: {error}")
            await asyncio.sleep(POLL_SECONDS)

    async def handle(self, command: dict[str, Any]) -> None:
        claimed = await self.db.update("automation_commands", {"id": f"eq.{command['id']}", "status": "eq.pending"}, {"status": "running"})
        if not claimed:
            return
        try:
            if command["kind"] == "search":
                self.target = self.scored() + SCORE_MORE
                self.wake.set()
            else:
                await self.apply_all(command["job_ids"], bool(command["dry_run"]))
            await self.db.update("automation_commands", {"id": f"eq.{command['id']}"}, {"status": "done"})
        except Exception as error:  # noqa: BLE001  The page shows the command as failed, with why.
            self.say("error", str(error))
            await self.db.update("automation_commands", {"id": f"eq.{command['id']}"}, {"status": "failed", "error": str(error)[:500]})

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
        return writing_text(preferences, memory), preferences.get("learn", True) is not False

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

    async def apply_all(self, job_ids: list[str], dry: bool) -> None:
        session = self.session
        os.environ[DRY_RUN_ENV] = "1" if dry else ""
        writing, learning = await self.writing()
        mode = " (dry run, nothing is sent)" if dry else ""
        for number, job_id in enumerate(job_ids, 1):
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

            outcome = await session.apply(item, click.echo, note, writing)
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

    async def run(self) -> None:
        await self.db.sign_in()
        click.echo(f"Signed in to Supabase as {self.db.email}")
        try:
            if self.resume:
                self.say("reading", f"Reading {self.resume.name}")
                await self.session.load_resume(self.resume)
            if self.session.needs_resume():
                raise ConfigError("no resume yet: run  agent-automation path/to/resume.pdf")
            self.say("starting", "Agent online")
            # The profile first: its countries may change where the first search looks.
            try:
                await self.sync_profile(first=True)
            except Exception as error:  # noqa: BLE001  The applications still run on the answers already here.
                click.echo(f"profile: {error}")
            await asyncio.gather(self.heartbeat(), self.profile_loop(), self.commands(), self.bring_jobs(), self.searching())
        finally:
            self.state, self.message, self.download = "offline", "", ""
            await self._beat()
            await self.db.close()


@click.command()
@click.argument("resume", required=False, type=click.Path(exists=True, dir_okay=False, path_type=Path))
def main(resume: Path | None) -> None:
    """Run the local agent for the web dashboard. Give a resume the first time, or to change it."""
    load_dotenv(Path.cwd(), default_home(), Path(__file__).resolve().parents[2])
    url = _env("SUPABASE_URL", "VITE_SUPABASE_URL")
    key = _env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    email, password = _env("AGENT_EMAIL"), _env("AGENT_PASSWORD")
    missing = [name for name, value in (("SUPABASE_URL", url), ("SUPABASE_ANON_KEY", key), ("AGENT_EMAIL", email), ("AGENT_PASSWORD", password)) if not value]
    if missing:
        raise ConfigError(f"set {', '.join(missing)} in .env (the email and password of your dashboard account)")
    session = Session(default_home().resolve())
    agent = Agent(session, Supabase(url, key, email, password), resume.resolve() if resume else None)
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        click.echo("Agent stopped.")
    finally:
        session.close()


def run() -> None:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        main()
    except ConfigError as error:
        raise SystemExit(f"agent-automation: {error}") from error

"""The inbox sync, shown on the dashboard: one row per application in `automation_inbox`, signed in as the person so RLS
keeps the rows theirs.

What leaves the computer is what the page shows: the company, the role, where the application stands, its dates, and of
each of its mails who wrote it, when, the subject and the first lines of its text (see PREVIEW_CHARS in tools/inbox.py).
Never a whole mail, never an attachment, and only mail the rules read as news of an application.

Run it once with `python -m agent_automation.ui.inbox_push`, or let the agent keep it current with `keep_current`.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import click

from agent_automation.memory.config import ConfigError, default_home, load_dotenv
from agent_automation.tools.inbox import DEFAULT_DAYS, Application, InboxError, company_key
from agent_automation.tools.inbox_sync import sync

TABLE = "automation_inbox"
# How often the agent reads the mailbox again while it runs.
EVERY_SECONDS = 15 * 60
SUBJECT_CHARS = 200
# Columns added after the table was first made. A database that does not have one yet still gets the rest.
LATER_COLUMNS = ("applied_known", "domain", "messages")

Reading = Callable[[Path, int], tuple[int, list[Application]]]


class Database(Protocol):
    """What is used of the worker's Supabase client."""

    user_id: str

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None: ...
    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]: ...
    async def delete(self, table: str, params: dict[str, str]) -> None: ...


def row_id(item: Application) -> str:
    """The same application gets the same id at every sync, so its row is updated in place."""
    role = re.sub(r"[^a-z0-9]+", "-", item.role.lower()).strip("-")
    # Two applications to one company that name no role are told apart by the day each began.
    return f"{company_key(item.company) or 'unknown'}_{role or item.applied_at[:10]}"[:160]


def rows_of(found: list[Application], user_id: str, synced_at: str) -> list[dict[str, Any]]:
    """One row per application. Two that end up under one id are one row: the one with the newest mail."""
    rows: dict[str, dict[str, Any]] = {}
    for item in sorted(found, key=lambda application: application.updated_at):
        rows[row_id(item)] = {
            "user_id": user_id, "id": row_id(item), "company": item.company, "role": item.role, "status": item.status,
            "applied_at": item.applied_at, "updated_at": item.updated_at, "subject": item.subject[:SUBJECT_CHARS], "mails": item.mails,
            "by_agent": item.by_agent, "synced_at": synced_at,
            # Whether a receipt dated the application (else applied_at is only its first mail), and the employer's own
            # site as its mail shows it, for the page's logo.
            "applied_known": item.applied_known, "domain": getattr(item, "domain", "") or "",
            # The application's mails for the page to open: who wrote, when, the subject, the start of the text and what
            # it meant. The newest first, a dozen at most; never a whole mail, never an attachment.
            "messages": [asdict(message) for message in getattr(item, "messages", ())],
        }
    return list(rows.values())


async def _missing(db: Database) -> set[str]:
    """The later columns this database does not have yet: asking for one that is not there is refused."""
    missing = set()
    for column in LATER_COLUMNS:
        try:
            await db.select(TABLE, {"select": column, "limit": "1"})
        except Exception:  # noqa: BLE001  Not there, or not reachable: the row goes without it and the write says which.
            missing.add(column)
    return missing


async def push(db: Database, workspace: Path, days: int = DEFAULT_DAYS, reading: Reading = sync) -> int:
    """Read what is new in the mailbox and make the table say what the sync now knows; how many applications that is.
    A row the sync no longer has (a mail it read wrongly before, a forgotten sync) is taken away."""
    _, found = await asyncio.to_thread(reading, workspace, days)
    rows = rows_of(found, db.user_id, datetime.now(UTC).isoformat(timespec="seconds"))
    if rows:
        if missing := await _missing(db):
            rows = [{name: value for name, value in row.items() if name not in missing} for row in rows]
        await db.upsert(TABLE, rows, "user_id,id")
    kept = {row["id"] for row in rows}
    known = await db.select(TABLE, {"select": "id", "user_id": f"eq.{db.user_id}"})
    gone = [row["id"] for row in known if row["id"] not in kept]
    for start in range(0, len(gone), 50):
        listed = ",".join('"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"' for name in gone[start : start + 50])
        await db.delete(TABLE, {"user_id": f"eq.{db.user_id}", "id": f"in.({listed})"})
    return len(rows)


async def keep_current(db: Database, workspace: Path, say: Callable[[str], None] = click.echo, every: float = EVERY_SECONDS, reading: Reading = sync) -> None:
    """Push now and then every `every` seconds, for as long as the agent runs. With no Gmail set up it says so once and
    ends; any other failure is said and tried again at the next round."""
    while True:
        try:
            count = await push(db, workspace, reading=reading)
            say(f"inbox: {count} applications on the dashboard")
        except InboxError as error:
            say(f"inbox not synced: {error}")
            return
        except Exception as error:  # noqa: BLE001  The network or Supabase, for a moment: the next round tries again.
            say(f"inbox sync failed, trying again later: {error}")
        await asyncio.sleep(every)


@click.command()
@click.option("--days", default=DEFAULT_DAYS, show_default=True, help="How far back to read the mailbox.")
def main(days: int) -> None:
    """Read your Gmail (read-only) and show where each application stands on the dashboard."""
    # The worker's client is imported here, so that importing this module costs the agent's start nothing.
    from agent_automation.ui.worker import Supabase, _env

    home = default_home()
    load_dotenv(Path.cwd(), home, Path(__file__).resolve().parents[3])
    url, key = _env("SUPABASE_URL", "VITE_SUPABASE_URL"), _env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    email, password = _env("AGENT_EMAIL"), _env("AGENT_PASSWORD")
    missing = [name for name, value in (("SUPABASE_URL", url), ("SUPABASE_ANON_KEY", key), ("AGENT_EMAIL", email), ("AGENT_PASSWORD", password)) if not value]
    if missing:
        raise ConfigError(f"set {', '.join(missing)} in .env")

    async def once() -> int:
        db = Supabase(url, key, email, password)
        try:
            await db.sign_in()
            return await push(db, home.resolve(), days)
        finally:
            await db.close()

    click.echo(f"{asyncio.run(once())} applications on the dashboard")


def run() -> None:
    try:
        main()
    except (InboxError, ConfigError) as error:
        raise SystemExit(f"inbox push: {error}") from error


if __name__ == "__main__":
    run()

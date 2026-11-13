"""The calendar, shown on the dashboard: one row per event in `automation_calendar`, signed in as the person so RLS keeps
the rows theirs.

`push` reads Google Calendar and makes the table say the same. `add` is the page's "add to calendar": it puts the event on
Google Calendar first and then writes its row, so the two never disagree about what exists.

Run it once with `python -m agent_automation.ui.calendar_push`, or let the agent keep it current with `keep_current`.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import click
import httpx

from agent_automation.memory.config import ConfigError, default_home, load_dotenv
from agent_automation.tools.calendar import CalendarError, Event, create, credentials, upcoming

TABLE = "automation_calendar"
# How often the agent reads the calendar again while it runs.
EVERY_SECONDS = 10 * 60

Reading = Callable[[Path], list[Event]]
Making = Callable[[str, str, dict[str, object]], Event]


class Database(Protocol):
    """What is used of the worker's Supabase client."""

    user_id: str

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None: ...
    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]: ...
    async def delete(self, table: str, params: dict[str, str]) -> None: ...


def row_of(event: Event, user_id: str, synced_at: str) -> dict[str, Any]:
    return {
        "user_id": user_id, "id": event.id[:300], "title": event.title, "starts_at": event.starts_at, "ends_at": event.ends_at,
        "all_day": event.all_day, "location": event.location, "url": event.url, "kind": event.kind, "company": event.company,
        "notes": event.notes, "source": event.source, "synced_at": synced_at,
    }


async def push(db: Database, workspace: Path, reading: Reading = upcoming) -> int:
    """Read the calendar and make the table say what is on it; how many events that is. An event that left the calendar,
    or fell out of the window, leaves the table. What the person chose for an event they added here (its kind, its
    company, its notes) is kept: the calendar itself does not carry those."""
    events = await asyncio.to_thread(reading, workspace)
    known = await db.select(TABLE, {"select": "id,kind,company,notes,source", "user_id": f"eq.{db.user_id}"})
    chosen = {row["id"]: row for row in known if row.get("source") in ("web", "agent")}
    synced_at = datetime.now(UTC).isoformat(timespec="seconds")
    rows: dict[str, dict[str, Any]] = {}
    for event in events:
        kept = chosen.get(event.id[:300])
        if kept:
            event = replace(event, kind=kept["kind"], company=kept["company"], notes=kept["notes"], source=kept["source"])
        rows[event.id[:300]] = row_of(event, db.user_id, synced_at)
    if rows:
        await db.upsert(TABLE, list(rows.values()), "user_id,id")
    gone = [row["id"] for row in known if row["id"] not in rows]
    for start in range(0, len(gone), 50):
        listed = ",".join('"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"' for name in gone[start : start + 50])
        await db.delete(TABLE, {"user_id": f"eq.{db.user_id}", "id": f"in.({listed})"})
    return len(rows)


async def add(db: Database, workspace: Path, payload: dict[str, Any], making: Making = create) -> dict[str, Any]:
    """Put one event on Google Calendar and on the dashboard; the row it became. `payload`: title and starts_at (ISO, with
    its offset), and if wanted ends_at, all_day, location, url, notes, kind, company. Whatever goes wrong is raised as a
    CalendarError that can be shown to the person as it is."""
    address, password = credentials()
    try:
        event = await asyncio.to_thread(making, address, password, dict(payload))
    except httpx.HTTPError as error:
        raise CalendarError(f"Google Calendar could not be reached: {error}") from error
    row = row_of(event, db.user_id, datetime.now(UTC).isoformat(timespec="seconds"))
    await db.upsert(TABLE, [row], "user_id,id")
    return row


async def keep_current(db: Database, workspace: Path, say: Callable[[str], None] = click.echo, every: float = EVERY_SECONDS, reading: Reading = upcoming) -> None:
    """Push now and then every `every` seconds, for as long as the agent runs. With no Gmail set up, or a password Google
    refuses, it says so once and ends; any other failure is said and tried again at the next round."""
    while True:
        try:
            count = await push(db, workspace, reading)
            say(f"calendar: {count} events on the dashboard")
        except CalendarError as error:
            say(f"calendar not synced: {error}")
            return
        except Exception as error:  # noqa: BLE001  The network or Supabase, for a moment: the next round tries again.
            say(f"calendar sync failed, trying again later: {error}")
        await asyncio.sleep(every)


@click.command()
def main() -> None:
    """Read your Google Calendar and show what is coming up on the dashboard."""
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
            return await push(db, home.resolve())
        finally:
            await db.close()

    click.echo(f"{asyncio.run(once())} events on the dashboard")


def run() -> None:
    try:
        main()
    except (CalendarError, ConfigError) as error:
        raise SystemExit(f"calendar push: {error}") from error


if __name__ == "__main__":
    run()

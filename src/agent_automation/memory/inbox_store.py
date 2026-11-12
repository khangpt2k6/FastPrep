"""What the inbox sync keeps, in its own SQLite file: the messages that are about an application, and the numbers of
every message already read so none is fetched twice. No message's full text is kept."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from agent_automation.tools.inbox import Event

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    mail_id TEXT PRIMARY KEY,
    thread TEXT NOT NULL,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    sender TEXT NOT NULL,
    subject TEXT NOT NULL,
    snippet TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seen (uid INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class InboxStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)
        self._db.commit()

    def close(self) -> None:
        self._db.close()

    def _meta(self, name: str) -> str:
        row = self._db.execute("SELECT value FROM meta WHERE name = ?", (name,)).fetchone()
        return row["value"] if row else ""

    def _set_meta(self, name: str, value: str) -> None:
        self._db.execute("INSERT INTO meta (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value", (name, value))

    def known(self, validity: int, uids: list[int]) -> set[int]:
        """Which of these message numbers were read before. The numbers of another validity are another mailbox's, or the
        same one renumbered: they are forgotten, and every message is read again. The events stay, known by Gmail's own ids."""
        if self._meta("validity") != str(validity):
            self._db.execute("DELETE FROM seen")
            self._set_meta("validity", str(validity))
            self._db.commit()
            return set()
        seen = {row["uid"] for row in self._db.execute("SELECT uid FROM seen")}
        return seen.intersection(uids)

    def add(self, uids: list[int], events: list[Event], synced_at: str) -> int:
        """The messages just read are seen, and those about an application are kept; how many of them are new."""
        self._db.executemany("INSERT OR IGNORE INTO seen (uid) VALUES (?)", [(uid,) for uid in uids])
        before = self._db.execute("SELECT count(*) FROM events").fetchone()[0]
        self._db.executemany(
            "INSERT OR IGNORE INTO events (mail_id, thread, at, kind, company, role, sender, subject, snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(e.mail_id, e.thread, e.at, e.kind, e.company, e.role, e.sender, e.subject, e.snippet) for e in events],
        )
        self._set_meta("synced_at", synced_at)
        self._db.commit()
        return self._db.execute("SELECT count(*) FROM events").fetchone()[0] - before

    def events(self) -> list[Event]:
        rows = self._db.execute("SELECT * FROM events ORDER BY at").fetchall()
        return [Event(r["mail_id"], r["thread"], r["at"], r["kind"], r["company"], r["role"], r["sender"], r["subject"], r["snippet"]) for r in rows]

    def synced_at(self) -> str:
        return self._meta("synced_at")

    def forget(self) -> None:
        """Everything the sync kept, so the next one reads the mailbox from the start."""
        self._db.executescript("DELETE FROM events; DELETE FROM seen; DELETE FROM meta;")
        self._db.commit()

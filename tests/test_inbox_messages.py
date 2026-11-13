"""The mails of an application as the dashboard opens them: who wrote, when, the subject, a readable start with the older
mail it answers cut away, and what the mail meant. Every name here is made up."""

from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path
from typing import Any

from agent_automation.memory.inbox_store import InboxStore
from agent_automation.tools.inbox import MESSAGES, PREVIEW_CHARS, Application, Event, Mail, Message, applications, classify, preview_of
from agent_automation.ui.inbox_push import push, rows_of


def test_the_preview_keeps_the_mails_own_lines_and_cuts_what_it_answers() -> None:
    text = (
        "Hi Sam,\n\n\n\nThank you   for applying.\nWe would like to invite you to an interview.\n\n"
        "On Tue, Nov 10, 2026 at 5:05 PM Sam Lee <sam@example.com>\nwrote:\n> I am writing to apply\n> for the role"
    )
    assert preview_of(text) == "Hi Sam,\n\nThank you for applying.\nWe would like to invite you to an interview."
    assert preview_of("Thanks.\n\n-----Original Message-----\nFrom: Sam") == "Thanks."
    assert preview_of("Thanks.\n> quoted line\nmore") == "Thanks."
    assert len(preview_of("word " * 400)) <= PREVIEW_CHARS


def test_a_classified_mail_keeps_who_wrote_it_and_its_readable_start() -> None:
    mail = Mail(
        1, "m1", "t1", "2026-11-10T17:05:15+00:00", "campus@northwind.com", '"Northwind Campus Recruiting"', "Thank you for applying to Northwind",
        "Hi Sam,\n\nThank you for applying to the Software Engineer Intern role at Northwind.\nWe received your application.",
    )
    event = classify(mail, "Sam Lee")
    assert event is not None and event.kind == "applied"
    assert event.sender_name == "Northwind Campus Recruiting"
    assert event.preview.startswith("Hi Sam,\n\nThank you for applying to the Software Engineer Intern role")


def test_an_application_lists_its_mails_newest_first_and_no_more_than_a_dozen() -> None:
    def at(day: int) -> str:
        return f"2026-07-{day:02d}T10:00:00+00:00"

    events = [Event(f"m{day}", "t1", at(day), "applied" if day == 1 else "interview", "Northwind", "Software Engineer Intern", "dana@northwind.com",
                    f"Mail {day}", f"short {day}", "Dana Reyes", f"Hello,\nmail {day}") for day in range(1, 16)]
    [found] = applications(events)
    assert found.mails == 15 and len(found.messages) == MESSAGES == 12
    assert found.messages[0] == Message(at(15), "Dana Reyes", "dana@northwind.com", "Mail 15", "Hello,\nmail 15", "interview")
    assert found.messages[0].gmail_url == "", "an id that is not Gmail's number makes no link"
    assert [message.at for message in found.messages] == sorted((message.at for message in found.messages), reverse=True)
    # A mail read before previews were kept still shows the short start the rules kept.
    [old] = applications([Event("m1", "t1", at(1), "applied", "Northwind", "Intern", "dana@northwind.com", "Received", "short start")])
    assert old.messages == (Message(at(1), "", "dana@northwind.com", "Received", "short start", "applied"),)


def test_a_store_made_before_previews_gets_them_and_keeps_its_events(tmp_path: Path) -> None:
    path = tmp_path / "inbox.db"
    old = sqlite3.connect(path)
    old.executescript(
        "CREATE TABLE events (mail_id TEXT PRIMARY KEY, thread TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, company TEXT NOT NULL,"
        " role TEXT NOT NULL, sender TEXT NOT NULL, subject TEXT NOT NULL, snippet TEXT NOT NULL);"
        "INSERT INTO events VALUES ('m0', 't0', '2026-07-01T10:00:00+00:00', 'applied', 'Northwind', 'Intern', 'a@northwind.com', 'Received', 'short');"
    )
    old.commit()
    old.close()
    store = InboxStore(path)
    new = Event("m1", "t1", "2026-07-02T10:00:00+00:00", "interview", "Northwind", "Intern", "dana@northwind.com", "Interview", "short", "Dana Reyes", "Hello,\nSam")
    store.add([1], [new], "now")
    kept = store.events()
    store.close()
    assert [(event.mail_id, event.sender_name, event.preview) for event in kept] == [("m0", "", ""), ("m1", "Dana Reyes", "Hello,\nSam")]


class Table:
    user_id = "user-1"

    def __init__(self, without: tuple[str, ...] = ()) -> None:
        self.rows: dict[str, dict[str, Any]] = {}
        self.without = without

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        assert not any(name in row for row in rows for name in self.without)
        self.rows.update({row["id"]: row for row in rows})

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        if "user_id" not in params and params["select"] in self.without:
            raise RuntimeError("no such column")
        return []

    async def delete(self, table: str, params: dict[str, str]) -> None:
        raise AssertionError("nothing to delete")


def test_the_mails_go_to_the_dashboard_as_plain_rows_once_the_table_can_hold_them() -> None:
    message = Message("2026-07-02T10:00:00+00:00", "Dana Reyes", "dana@northwind.com", "Interview", "Hello,\nSam", "interview")
    found = [Application("Northwind", "Intern", "interview", "2026-07-01T10:00:00+00:00", "2026-07-02T10:00:00+00:00", "Interview", 2, messages=(message,))]
    [row] = rows_of(found, "user-1", "now")
    assert row["messages"] == [{
        "at": "2026-07-02T10:00:00+00:00", "from_name": "Dana Reyes", "from_address": "dana@northwind.com", "subject": "Interview",
        "snippet": "Hello,\nSam", "status": "interview", "gmail_url": "",
    }]
    before, after = Table(without=("messages",)), Table()
    asyncio.run(push(before, Path("."), reading=lambda workspace, days: (1, found)))
    asyncio.run(push(after, Path("."), reading=lambda workspace, days: (1, found)))
    assert "messages" not in next(iter(before.rows.values())) and next(iter(after.rows.values()))["messages"] == row["messages"]


def test_each_mail_links_to_itself_in_gmail_in_the_right_account() -> None:
    event = Event("1848217352870012345", "t1", "2026-07-02T10:00:00+00:00", "applied", "Northwind", "Intern", "dana@northwind.com", "Received", "short")
    assert applications([event])[0].messages[0].gmail_url == "https://mail.google.com/mail/u/0/#all/19a62fe3e187a5b9"
    [found] = applications([event], address="sam.lee@gmail.com")
    assert found.messages[0].gmail_url == "https://mail.google.com/mail/?authuser=sam.lee%40gmail.com#all/19a62fe3e187a5b9"


def test_a_line_that_only_marks_a_picture_is_not_shown() -> None:
    assert preview_of("[Image]\n[cid:image002.jpg@01DD6D3E.9543EE80]\nCongratulations, Sam.") == "Congratulations, Sam."

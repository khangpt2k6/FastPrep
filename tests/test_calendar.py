"""The calendar: what is read out of Google's answer, what an event is told to be about, the event that is written, and
the rows on the dashboard. No network: the request is a function handed in, and a table in memory stands in for Supabase.
Every name and company in an invitation here is made up."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from agent_automation.tools.calendar import MADE_HERE, CalendarError, Event, classify, create, new_event, parse, read, remove
from agent_automation.tools.inbox import Application
from agent_automation.ui.calendar_push import TABLE, add, keep_current, push

START = datetime(2026, 11, 1, tzinfo=UTC)
END = datetime(2026, 12, 1, tzinfo=UTC)


def answer(*events: str) -> str:
    """A calendar query's answer, the way Google wraps each event."""
    parts = [
        f"<D:response><D:href>/e{number}.ics</D:href><caldav:calendar-data>BEGIN:VCALENDAR\r\n{event.strip()}\r\nEND:VCALENDAR</caldav:calendar-data></D:response>"
        for number, event in enumerate(events)
    ]
    return f'<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">{"".join(parts)}</D:multistatus>'


def vevent(*lines: str) -> str:
    return "\r\n".join(["BEGIN:VEVENT", *lines, "END:VEVENT"])


def application(company: str, role: str, status: str = "applied") -> Application:
    return Application(company, role, status, "2026-10-01T10:00:00+00:00", "2026-10-02T10:00:00+00:00", "", 1)


def event(title: str, **more: Any) -> Event:
    return Event(id="e1", title=title, starts_at="2026-11-16T21:00:00+00:00", ends_at="2026-11-16T21:30:00+00:00", **more)


# ---- reading ----


def test_an_event_is_read_in_utc_with_its_link_and_not_its_reminder() -> None:
    text = answer(vevent(
        "DTSTART;TZID=America/New_York:20261116T160000", "DTEND;TZID=America/New_York:20261116T163000",
        "ORGANIZER;CN=dana.reyes@northwind.example:mailto:dana.reyes@northwind.example", "UID:abc@google.com",
        "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
        "DESCRIPTION:&lt;b&gt;Booked by&lt;/b&gt;\\nSam Lee\\n&lt;br&gt;A short meet and greet\\, 15 minutes\\; bring",
        "  questions.", "LOCATION:", "STATUS:CONFIRMED", "SUMMARY:Northwind Meet &amp; Greet (Sam Lee)",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:This is an event reminder", "TRIGGER:-P0DT0H10M0S", "END:VALARM",
    ))
    [found] = parse(text, START, END)
    assert (found.id, found.title) == ("abc@google.com", "Northwind Meet & Greet (Sam Lee)")
    assert (found.starts_at, found.ends_at, found.all_day) == ("2026-11-16T21:00:00+00:00", "2026-11-16T21:30:00+00:00", False)
    assert found.url == "https://meet.google.com/abc-defg-hij"
    assert found.notes == "Booked by\nSam Lee\n\nA short meet and greet, 15 minutes; bring questions."
    assert found.organizer == "dana.reyes@northwind.example" and found.source == "google" and found.repeats is False


def test_a_whole_day_runs_from_midnight_to_midnight() -> None:
    [found] = parse(answer(vevent("DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261121", "UID:day@google.com", "SUMMARY:Offer deadline")), START, END)
    assert (found.starts_at, found.ends_at, found.all_day) == ("2026-11-20T00:00:00+00:00", "2026-11-21T00:00:00+00:00", True)


def test_what_is_outside_the_window_or_called_off_is_left_out() -> None:
    text = answer(
        vevent("DTSTART:20261001T100000Z", "DTEND:20261001T103000Z", "UID:old@google.com", "SUMMARY:Before"),
        vevent("DTSTART:20261110T100000Z", "DTEND:20261110T103000Z", "UID:off@google.com", "SUMMARY:Called off", "STATUS:CANCELLED"),
        vevent("DTSTART:20261111T100000Z", "DTEND:20261111T103000Z", "UID:in@google.com", "SUMMARY:Inside"),
    )
    assert [found.title for found in parse(text, START, END)] == ["Inside"]


def test_a_repeating_event_is_one_event_a_day_with_its_skipped_and_moved_days() -> None:
    # Mondays and Wednesdays at 10:15 in Los Angeles, from before the clock change until the 18th.
    master = vevent(
        "DTSTART;TZID=America/Los_Angeles:20261026T101500", "DTEND;TZID=America/Los_Angeles:20261026T103000",
        "RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20261118T181500Z;INTERVAL=1;BYDAY=MO,WE", "EXDATE;TZID=America/Los_Angeles:20261104T101500",
        "UID:standup", "SUMMARY:Standup",
    )
    moved = vevent(
        "DTSTART;TZID=America/Los_Angeles:20261109T130000", "DTEND;TZID=America/Los_Angeles:20261109T131500",
        "RECURRENCE-ID;TZID=America/Los_Angeles:20261109T101500", "UID:standup", "SUMMARY:Standup (moved)",
    )
    found = parse(answer(master, moved), START, END)
    # 10:15 in Los Angeles is 18:15 UTC once the clocks went back on November 1st.
    assert [(item.starts_at, item.title) for item in found] == [
        ("2026-11-02T18:15:00+00:00", "Standup"), ("2026-11-09T21:00:00+00:00", "Standup (moved)"), ("2026-11-11T18:15:00+00:00", "Standup"),
        ("2026-11-16T18:15:00+00:00", "Standup"), ("2026-11-18T18:15:00+00:00", "Standup"),
    ]
    assert all(item.repeats for item in found)
    assert found[1].id == "standup_20261109T181500Z" and len({item.id for item in found}) == 5


def test_a_yearly_whole_day_lands_on_its_day_in_the_window() -> None:
    text = answer(vevent("DTSTART;VALUE=DATE:20060227", "DTEND;VALUE=DATE:20060228", "RRULE:FREQ=YEARLY", "UID:bday", "SUMMARY:Birthday"))
    [found] = parse(text, datetime(2027, 1, 1, tzinfo=UTC), datetime(2027, 6, 1, tzinfo=UTC))
    assert (found.id, found.starts_at, found.all_day) == ("bday_20270227", "2027-02-27T00:00:00+00:00", True)


def test_a_daily_event_stops_after_its_count() -> None:
    text = answer(vevent("DTSTART:20261102T090000Z", "DTEND:20261102T093000Z", "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3", "UID:three", "SUMMARY:Three"))
    assert [item.starts_at[:10] for item in parse(text, START, END)] == ["2026-11-02", "2026-11-04", "2026-11-06"]


# ---- what an event is about ----


def test_an_interview_is_told_by_its_title_and_named_by_the_known_company() -> None:
    known = [application("NORTHWIND", "AI Marketing Intern", "interview")]
    told = classify(event("Northwind Meet & Greet - Ai Marketing (Sam Lee)", notes="Thank you for your interest in the role."), known)
    assert (told.kind, told.company) == ("interview", "NORTHWIND")
    assert told.notes == "Thank you for your interest in the role."


def test_an_invitation_that_names_only_the_role_goes_to_the_application_at_that_stage() -> None:
    known = [
        application("Harbor Bank", "2027 Technology Summer Analyst Program (New York)", "interview"),
        application("Harbor Bank", "2027 Technology Summer Analyst Program (Chicago)", "rejected"),
        application("Atlas Bank", "Global Technology Summer Analyst 2027", "assessment"),
    ]
    told = classify(event("Interview : 2027 Technology Analyst Program Superday (11/17) -", notes="You have been invited for an interview."), known)
    assert (told.kind, told.company) == ("interview", "Harbor Bank")


def test_the_company_is_the_sender_when_nothing_else_names_it() -> None:
    told = classify(event("Phone screen", organizer="dana.reyes@mail.northwind.example"))
    assert (told.kind, told.company) == ("interview", "Northwind")
    assert classify(event("Phone screen", organizer="someone@gmail.com")).company == ""


def test_a_call_counts_only_when_it_is_about_a_job() -> None:
    known = [application("Northwind", "Software Engineer Intern")]
    assert classify(event("Intro call", organizer="dana@northwind.com"), known).kind == "call"
    assert classify(event("Chat about the internship role")).kind == "call"
    assert classify(event("Call mom")).kind == "other"
    assert classify(event("Coding challenge due")).kind == "assessment"
    assert classify(event("Application deadline, Northwind"), known).kind == "deadline"


def test_a_repeating_event_is_never_about_the_job_hunt_and_keeps_no_text() -> None:
    known = [application("Microsoft", "Software Engineer Intern")]
    told = classify(event("Team interview prep sync", notes="Join the Microsoft Teams meeting. Candidate pipeline review.", repeats=True), known)
    assert (told.kind, told.company, told.notes) == ("other", "", "")


def test_the_maker_of_the_meeting_room_is_not_the_company() -> None:
    known = [application("Microsoft", "Software Engineer Intern"), application("Object", "Intern")]
    told = classify(event("Recruiter chat", notes="Join the Microsoft Teams meeting. This is the object of the call."), known)
    assert (told.kind, told.company) == ("call", "")


# ---- writing ----


def test_a_new_event_is_written_in_utc_with_the_link_where_calendars_show_it() -> None:
    made, text = new_event(
        {"title": "  Northwind  interview ", "starts_at": "2026-11-20T15:00:00-05:00", "url": "https://northwind.zoom.us/j/123", "notes": "Bring: resume, questions; ID", "kind": "interview", "company": "Northwind"},
        now=datetime(2026, 11, 12, 12, 0, tzinfo=UTC),
    )
    assert made.id.endswith(MADE_HERE) and made.source == "web"
    assert (made.title, made.starts_at, made.ends_at, made.kind, made.company) == ("Northwind interview", "2026-11-20T20:00:00+00:00", "2026-11-20T20:30:00+00:00", "interview", "Northwind")
    lines = re.sub(r"\r\n ", "", text).split("\r\n")
    assert f"UID:{made.id}" in lines and "DTSTART:20261120T200000Z" in lines and "DTEND:20261120T203000Z" in lines
    assert "SUMMARY:Northwind interview" in lines and "LOCATION:https://northwind.zoom.us/j/123" in lines
    assert "DESCRIPTION:https://northwind.zoom.us/j/123\\n\\nBring: resume\\, questions\\; ID" in lines
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))
    # What was written reads back as the same event, also after Google gave it a Meet room of its own.
    kept = text.split("BEGIN:VCALENDAR")[1].split("END:VCALENDAR")[0].replace("END:VEVENT", "X-GOOGLE-CONFERENCE:https://meet.google.com/zzz-zzzz-zzz\r\nEND:VEVENT")
    [back] = parse(answer(kept), START, END)
    assert (back.id, back.title, back.starts_at, back.ends_at, back.url, back.source) == (made.id, made.title, made.starts_at, made.ends_at, made.url, "web")


def test_a_whole_day_event_is_written_as_dates() -> None:
    made, text = new_event({"title": "Offer deadline", "starts_at": "2026-11-20T09:00:00-05:00", "all_day": True, "kind": "deadline"})
    assert (made.starts_at, made.ends_at, made.all_day) == ("2026-11-20T00:00:00+00:00", "2026-11-21T00:00:00+00:00", True)
    assert "DTSTART;VALUE=DATE:20261120\r\n" in text and "DTEND;VALUE=DATE:20261121\r\n" in text


@pytest.mark.parametrize("wanted", [
    {"starts_at": "2026-11-20T15:00:00-05:00"},
    {"title": "Call"},
    {"title": "Call", "starts_at": "next week"},
    {"title": "Call", "starts_at": "2026-11-20T15:00:00-05:00", "ends_at": "2026-11-20T14:00:00-05:00"},
    {"title": "Call", "starts_at": "2026-11-20T15:00:00-05:00", "kind": "party"},
])
def test_an_event_that_cannot_be_is_refused_in_words(wanted: dict[str, object]) -> None:
    with pytest.raises(CalendarError):
        new_event(wanted)


class Google:
    """The calendar's address, answering what it is told to."""

    def __init__(self, status: int = 207, text: str = "") -> None:
        self.status, self.text = status, text
        self.asked: list[tuple[str, str, dict[str, str], bytes]] = []

    def __call__(self, method: str, url: str, headers: dict[str, str], body: bytes) -> tuple[int, str]:
        self.asked.append((method, url, headers, body))
        return self.status, self.text


def test_reading_asks_for_the_window_and_changes_nothing() -> None:
    google = Google(text=answer(vevent("DTSTART:20261111T100000Z", "DTEND:20261111T103000Z", "UID:in@google.com", "SUMMARY:Inside")))
    assert [found.title for found in read("sam@gmail.com", "abcd efgh ijkl mnop", START, END, google)] == ["Inside"]
    [(method, url, headers, body)] = google.asked
    assert method == "REPORT" and url == "https://www.google.com/calendar/dav/sam%40gmail.com/events/"
    assert headers["Authorization"].startswith("Basic ") and b'start="20261101T000000Z" end="20261201T000000Z"' in body


def test_a_refused_or_missing_password_is_said_as_it_is() -> None:
    with pytest.raises(CalendarError, match="app password"):
        read("sam@gmail.com", "wrong", START, END, Google(status=401))
    with pytest.raises(CalendarError, match="GMAIL_APP_PASSWORD"):
        read("sam@gmail.com", "", START, END, Google())
    with pytest.raises(CalendarError, match="GMAIL_ADDRESS"):
        read("", "abcd", START, END, Google())


def test_creating_never_writes_over_an_event_and_removing_touches_only_its_own() -> None:
    google = Google(status=201)
    made = create("sam@gmail.com", "abcd", {"title": "Call", "starts_at": "2026-11-20T15:00:00-05:00"}, google)
    [(method, url, headers, body)] = google.asked
    assert method == "PUT" and url.endswith(f"/events/{made.id.replace('@', '%40')}.ics")
    assert headers["If-None-Match"] == "*" and b"SUMMARY:Call" in body
    with pytest.raises(CalendarError):
        create("sam@gmail.com", "abcd", {"title": "Call", "starts_at": "2026-11-20T15:00:00-05:00"}, Google(status=412))
    with pytest.raises(CalendarError, match="only an event added"):
        remove("sam@gmail.com", "abcd", "abc@google.com", google)
    remove("sam@gmail.com", "abcd", made.id, Google(status=204))


# ---- the dashboard ----


class Table:
    """automation_calendar as the worker's client sees it."""

    user_id = "user-1"

    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = {row["id"]: row for row in rows or []}

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        assert table == TABLE and conflict == "user_id,id"
        assert len({row["id"] for row in rows}) == len(rows), "one statement cannot write a row twice"
        self.rows.update({row["id"]: row for row in rows})

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        assert table == TABLE and params["user_id"] == "eq.user-1"
        return [dict(row) for row in self.rows.values()]

    async def delete(self, table: str, params: dict[str, str]) -> None:
        for name in re.findall(r'"((?:[^"\\]|\\.)*)"', params["id"]):
            self.rows.pop(re.sub(r"\\(.)", r"\1", name), None)


def reading(events: list[Event]):
    return lambda workspace: events


def test_one_row_per_event_and_what_left_the_calendar_leaves_the_table() -> None:
    db = Table([{"id": "gone@google.com", "kind": "other", "company": "", "notes": "", "source": "google"}])
    found = [event("Northwind interview", kind="interview", company="Northwind", url="https://meet.google.com/abc", organizer="dana@northwind.com")]
    assert asyncio.run(push(db, Path("."), reading(found))) == 1
    assert set(db.rows) == {"e1"}
    assert set(db.rows["e1"]) == {"user_id", "id", "title", "starts_at", "ends_at", "all_day", "location", "url", "kind", "company", "notes", "source", "synced_at"}
    assert (db.rows["e1"]["user_id"], db.rows["e1"]["kind"], db.rows["e1"]["source"]) == ("user-1", "interview", "google")


def test_what_the_person_chose_for_an_event_they_added_is_kept() -> None:
    name = f"abc{MADE_HERE}"
    db = Table([{"id": name, "kind": "deadline", "company": "Northwind", "notes": "Sign by Friday", "source": "web"}])
    back = Event(id=name, title="Decide", starts_at="2026-11-20T00:00:00+00:00", ends_at="2026-11-21T00:00:00+00:00", all_day=True, source="web")
    asyncio.run(push(db, Path("."), reading([back])))
    assert (db.rows[name]["kind"], db.rows[name]["company"], db.rows[name]["notes"], db.rows[name]["title"]) == ("deadline", "Northwind", "Sign by Friday", "Decide")


def test_a_meeting_link_found_in_mail_stays_while_the_invite_has_none() -> None:
    db = Table([{"id": "e1", "kind": "interview", "company": "Northwind", "notes": "", "source": "google",
                 "url": "https://northwind.zoom.us/j/1", "location": "Zoom"}])
    bare = event("Northwind interview", kind="interview", company="Northwind")
    asyncio.run(push(db, Path("."), reading([bare])))
    assert (db.rows["e1"]["url"], db.rows["e1"]["location"]) == ("https://northwind.zoom.us/j/1", "Zoom")
    # The calendar's own link wins once the invite carries one.
    linked = event("Northwind interview", kind="interview", company="Northwind", url="https://meet.google.com/abc")
    asyncio.run(push(db, Path("."), reading([linked])))
    assert db.rows["e1"]["url"] == "https://meet.google.com/abc"


def test_adding_puts_the_event_on_the_calendar_first_and_then_on_the_table(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GMAIL_ADDRESS", "sam@gmail.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "abcd")
    db, calls = Table(), []

    def making(address: str, password: str, wanted: dict[str, object]) -> Event:
        calls.append((address, password, wanted["title"]))
        return new_event(wanted)[0]

    row = asyncio.run(add(db, Path("."), {"title": "Northwind call", "starts_at": "2026-11-20T15:00:00-05:00", "kind": "call", "company": "Northwind"}, making))
    assert calls == [("sam@gmail.com", "abcd", "Northwind call")]
    assert db.rows[row["id"]] == row and (row["kind"], row["company"], row["source"], row["starts_at"]) == ("call", "Northwind", "web", "2026-11-20T20:00:00+00:00")

    def refusing(address: str, password: str, wanted: dict[str, object]) -> Event:
        raise CalendarError("Google refused")

    with pytest.raises(CalendarError):
        asyncio.run(add(db, Path("."), {"title": "x", "starts_at": "2026-11-20T15:00:00-05:00"}, refusing))
    assert len(db.rows) == 1


def test_the_loop_ends_when_nothing_is_set_up_and_tries_again_otherwise() -> None:
    said: list[str] = []

    def not_set_up(workspace: Path) -> list[Event]:
        raise CalendarError("no Google app password is set")

    asyncio.run(keep_current(Table(), Path("."), said.append, 0, not_set_up))
    assert said == ["calendar not synced: no Google app password is set"]

    said.clear()
    turns = iter([OSError("network down"), [event("Call")], CalendarError("stop")])

    def flaky(workspace: Path) -> list[Event]:
        turn = next(turns)
        if isinstance(turn, Exception):
            raise turn
        return turn

    asyncio.run(keep_current(Table(), Path("."), said.append, 0, flaky))
    assert said == ["calendar sync failed, trying again later: network down", "calendar: 1 events on the dashboard", "calendar not synced: stop"]

"""The inbox on the dashboard: the rows a sync becomes, that stale rows go, and that nothing of a message's text or
sender is in a row. No network: a table in memory stands in for Supabase."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any

from agent_automation.tools.inbox import Application, InboxError
from agent_automation.ui.inbox_push import TABLE, keep_current, push, row_id, rows_of


class Table:
    """automation_inbox as the worker's client sees it."""

    user_id = "user-1"

    def __init__(self, rows: list[dict[str, Any]] | None = None, without: tuple[str, ...] = ()) -> None:
        self.rows = {row["id"]: row for row in rows or []}
        # Columns this database was made before.
        self.without = without
        self.deletes: list[dict[str, str]] = []

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        assert table == TABLE and conflict == "user_id,id"
        assert len({row["id"] for row in rows}) == len(rows), "one statement cannot write a row twice"
        assert not any(name in row for row in rows for name in self.without), "a column the table does not have"
        self.rows.update({row["id"]: row for row in rows})

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        if "user_id" not in params:
            # The check for a column added later.
            if params["select"] in self.without:
                raise RuntimeError(f"column {params['select']} does not exist")
            return []
        assert params["user_id"] == "eq.user-1"
        return [{"id": name} for name in self.rows]

    async def delete(self, table: str, params: dict[str, str]) -> None:
        self.deletes.append(params)
        # PostgREST's list: each value in double quotes, a quote or backslash inside it escaped.
        for name in re.findall(r'"((?:[^"\\]|\\.)*)"', params["id"]):
            self.rows.pop(re.sub(r"\\(.)", r"\1", name), None)


def application(company: str, role: str = "Software Engineer Intern", status: str = "applied", updated: str = "2026-11-02T10:00:00+00:00", **more: Any) -> Application:
    return Application(company, role, status, "2026-11-01T10:00:00+00:00", updated, f"Thank you for applying to {company}", 1, **more)


def reading(found: list[Application]):
    return lambda workspace, days: (len(found), found)


def test_one_row_per_application_with_only_what_the_page_lists() -> None:
    db = Table()
    found = [application("Stripe", by_agent=True), application("Morgan Stanley", "Technology Summer Analyst", "interview")]
    assert asyncio.run(push(db, Path("."), reading=reading(found))) == 2
    row = db.rows[row_id(found[1])]
    assert (row["company"], row["role"], row["status"], row["by_agent"]) == ("Morgan Stanley", "Technology Summer Analyst", "interview", False)
    assert db.rows[row_id(found[0])]["by_agent"] is True
    assert set(row) == {
        "user_id", "id", "company", "role", "status", "applied_at", "updated_at", "subject", "mails", "by_agent", "synced_at", "applied_known",
        "domain",
    }
    assert (row["applied_known"], row["domain"]) == (True, "")
    assert row["user_id"] == "user-1"


def test_the_same_application_keeps_its_id_and_its_row_is_updated() -> None:
    db = Table()
    asyncio.run(push(db, Path("."), reading=reading([application("Stripe, Inc.")])))
    asyncio.run(push(db, Path("."), reading=reading([application("Stripe", status="rejected")])))
    assert len(db.rows) == 1
    assert next(iter(db.rows.values()))["status"] == "rejected"


def test_a_row_the_sync_no_longer_has_is_taken_away() -> None:
    db = Table([{"id": "reddit_2026-11-01", "user_id": "user-1"}, {"id": 'odd"name_', "user_id": "user-1"}])
    asyncio.run(push(db, Path("."), reading=reading([application("Stripe")])))
    assert list(db.rows) == [row_id(application("Stripe"))]
    assert db.deletes and all(params["user_id"] == "eq.user-1" for params in db.deletes)


def test_nothing_found_empties_the_table_without_an_empty_write() -> None:
    db = Table([{"id": "stripe_software-engineer-intern", "user_id": "user-1"}])
    assert asyncio.run(push(db, Path("."), reading=reading([]))) == 0
    assert db.rows == {}


def test_two_applications_under_one_id_are_one_row_the_newest() -> None:
    old = application("Stripe", status="applied", updated="2026-11-02T10:00:00+00:00")
    new = application("Stripe Inc", status="interview", updated="2026-11-05T10:00:00+00:00")
    rows = rows_of([new, old], "user-1", "2026-11-06T00:00:00+00:00")
    assert len(rows) == 1 and rows[0]["status"] == "interview"


def test_a_database_made_before_the_later_columns_still_gets_the_rest() -> None:
    db = Table(without=("applied_known", "domain"))
    unknown = Application("Stripe", "Intern", "rejected", "2026-06-18T10:00:00+00:00", "2026-06-18T10:00:00+00:00", "Update", 1, applied_known=False)
    assert asyncio.run(push(db, Path("."), reading=reading([unknown]))) == 1
    assert "applied_known" not in db.rows[row_id(unknown)] and db.rows[row_id(unknown)]["status"] == "rejected"
    newer = Table()
    asyncio.run(push(newer, Path("."), reading=reading([unknown])))
    assert newer.rows[row_id(unknown)]["applied_known"] is False


def test_two_applications_that_name_no_role_are_two_rows() -> None:
    first = Application("Tesla", "", "rejected", "2026-05-17T10:00:00+00:00", "2026-06-01T10:00:00+00:00", "Thank you", 2)
    second = Application("Tesla", "", "applied", "2026-09-03T10:00:00+00:00", "2026-09-03T10:00:00+00:00", "Received", 1)
    assert [row["id"] for row in rows_of([first, second], "user-1", "now")] == ["tesla_2026-05-17", "tesla_2026-09-03"]


def test_a_long_subject_is_cut() -> None:
    long = Application("Stripe", "", "applied", "2026-11-01T10:00:00+00:00", "2026-11-01T10:00:00+00:00", "x" * 900, 1)
    assert len(rows_of([long], "user-1", "now")[0]["subject"]) == 200


def test_with_no_gmail_set_up_the_loop_says_so_once_and_ends() -> None:
    said: list[str] = []

    def refused(workspace: Path, days: int):
        raise InboxError("set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env")

    asyncio.run(keep_current(Table(), Path("."), said.append, every=0, reading=refused))
    assert len(said) == 1 and "GMAIL_APP_PASSWORD" in said[0]


def test_a_passing_failure_is_said_and_tried_again() -> None:
    said: list[str] = []
    calls = 0

    def flaky(workspace: Path, days: int):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise OSError("network down")
        if calls == 2:
            return 1, [application("Stripe")]
        raise InboxError("stop the test")

    db = Table()
    asyncio.run(keep_current(db, Path("."), said.append, every=0, reading=flaky))
    assert "trying again" in said[0] and "1 applications" in said[1]
    assert len(db.rows) == 1

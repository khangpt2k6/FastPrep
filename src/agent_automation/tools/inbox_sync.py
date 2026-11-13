"""`agent-automation-inbox`: read the Gmail inbox for news of applications and list where each one stands."""

from __future__ import annotations

import io
import json
import os
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from agent_automation.agent.companies import key_of
from agent_automation.memory.config import ConfigError, default_home, load_config, load_dotenv
from agent_automation.memory.inbox_store import InboxStore
from agent_automation.memory.store import SUBMITTED, Store
from agent_automation.tools.inbox import (
    ADDRESS_ENV,
    DEFAULT_DAYS,
    PASSWORD_ENV,
    PASSWORD_URL,
    RULES,
    STATUS_WORDS,
    Application,
    Connect,
    InboxError,
    applications,
    classify,
    connect,
    read,
)

INBOX_FILE = "inbox.db"
STATUS_STYLE = {"applied": "white", "assessment": "yellow", "interview": "cyan", "offer": "bold green", "rejected": "red", "withdrawn": "dim"}


def address_of(store: Store) -> str:
    """The Gmail address to read: the one set in .env, or else the address the applications are sent with."""
    return (os.environ.get(ADDRESS_ENV) or store.answers().get("email") or "").strip()


def sent_by_agent(store: Store) -> list[str]:
    """Every name of the companies Agent Automation applied to: as the job database writes them and as the employer is called."""
    named = store.companies()
    names = []
    for sent in store.sent():
        if sent.status in SUBMITTED:
            names.append(sent.job.company)
            names.append(named.get(key_of(sent.job.company), ("", ""))[0])
    return [name for name in names if name]


def sync(workspace: Path, days: int = DEFAULT_DAYS, connecting: Connect = connect) -> tuple[int, list[Application]]:
    """Read what is new in the mailbox and keep it; how many new messages were about an application, and every
    application known so far."""
    config = load_config(workspace)
    store = Store(config.store_file)
    inbox = InboxStore(config.data_dir / INBOX_FILE)
    try:
        address = address_of(store)
        if not address.lower().endswith(("@gmail.com", "@googlemail.com")):
            raise InboxError(f"the inbox sync reads Gmail only, and the address here is {address or 'not set'}: set {ADDRESS_ENV} in .env")
        # What older rules made of the mail is not what these would: it is read again.
        inbox.keep_rules(RULES)
        _, mails = read(address, os.environ.get(PASSWORD_ENV, ""), days, inbox.known, connecting)
        answers = store.answers()
        me = " ".join(answers.get(name, "") for name in ("first_name", "last_name", "full_name", "preferred_name"))
        events = [event for event in (classify(mail, me) for mail in mails) if event is not None]
        new = inbox.add([mail.uid for mail in mails], events, datetime.now(UTC).isoformat(timespec="seconds"))
        return new, applications(inbox.events(), sent_by_agent(store))
    finally:
        inbox.close()
        store.close()


def known(workspace: Path) -> list[Application]:
    """The applications the last syncs found, with no mailbox read."""
    config = load_config(workspace)
    store = Store(config.store_file)
    inbox = InboxStore(config.data_dir / INBOX_FILE)
    try:
        return applications(inbox.events(), sent_by_agent(store))
    finally:
        inbox.close()
        store.close()


def _table(found: list[Application]) -> Table:
    table = Table(show_lines=False, header_style="bold")
    for column in ("Company", "Role", "Status", "Applied", "Last mail", "Sent by"):
        table.add_column(column, overflow="fold")
    for item in found:
        # With no receipt read, all that is known is that it was sent before the first mail about it.
        applied = item.applied_at[:10] if item.applied_known else f"before {item.applied_at[:10]}"
        table.add_row(
            item.company, item.role or "-", f"[{STATUS_STYLE[item.status]}]{STATUS_WORDS[item.status]}[/]", applied, item.updated_at[:10],
            "agent" if item.by_agent else "you",
        )
    return table


@click.command()
@click.option("--days", default=DEFAULT_DAYS, show_default=True, help="How far back to read the mailbox.")
@click.option("--json", "as_json", is_flag=True, help="Print the applications as JSON.")
@click.option("--offline", is_flag=True, help="List what the last sync found, without reading the mailbox.")
@click.option("--forget", is_flag=True, help="Drop what earlier syncs kept and read the mailbox from the start.")
def main(days: int, as_json: bool, offline: bool, forget: bool) -> None:
    """Read your Gmail (read-only) for news of your applications and list where each one stands."""
    home = default_home()
    load_dotenv(Path.cwd(), home, Path(__file__).resolve().parents[3])
    workspace = home.resolve()
    if forget:
        inbox = InboxStore(load_config(workspace).data_dir / INBOX_FILE)
        inbox.forget()
        inbox.close()
    new = 0
    if offline:
        found = known(workspace)
    else:
        new, found = sync(workspace, days)
    if as_json:
        click.echo(json.dumps([asdict(item) for item in found], ensure_ascii=False, indent=2))
        return
    console = Console()
    if not found:
        console.print(f"No mail about an application in the last {days} days.")
        return
    console.print(_table(found))
    counts = {status: sum(1 for item in found if item.status == status) for status in STATUS_WORDS}
    said = ", ".join(f"{count} {STATUS_WORDS[status].lower()}" for status, count in counts.items() if count)
    console.print(f"{len(found)} applications: {said}." + ("" if offline else f" {new} new messages about them since the last sync."))


def run() -> None:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        main()
    except (InboxError, ConfigError) as error:
        raise SystemExit(f"agent-automation-inbox: {error}") from error


__all__ = ["PASSWORD_URL", "known", "run", "sync"]

"""The person's Gmail for Claude Code, or any MCP client: search, read, draft and send in their real account.

An MCP server on stdin and stdout, which the client starts on this computer:

    claude mcp add --scope user gmail -- <the venv's python> -m agent_automation.tools.gmail

It signs in with the Google app password the inbox sync uses (GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env): IMAP to
search, read and keep drafts, SMTP to send. Search and read open the mailbox read-only and fetch with PEEK, so nothing is
marked as read. draft_mail only puts an email in Drafts. send_mail alone sends, and what the model is told says to use it
only when the person asked for the email to go out.
"""

from __future__ import annotations

import asyncio
import imaplib
import json
import os
import re
import smtplib
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import formataddr, formatdate, getaddresses, make_msgid
from pathlib import Path
from typing import Any
from urllib.parse import quote

from mcp.server.fastmcp import FastMCP

from agent_automation.memory.config import default_home, load_dotenv
from agent_automation.tools.inbox import (
    ADDRESS_ENV,
    PASSWORD_ENV,
    PASSWORD_URL,
    Connect,
    InboxError,
    Mail,
    _all_mail,
    _check,
    _text,
    connect,
    gmail_link,
    parse_fetch,
)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
# A search gives this many messages unless asked for another number, and never more than MOST.
LIMIT = 15
MOST = 50
# Enough of each message found for its headers and the start of its text; a message read gets this much of itself.
SEARCH_BYTES = 20_000
READ_BYTES = 500_000
SNIPPET_CHARS = 240

Smtp = Callable[[], smtplib.SMTP]

INSTRUCTIONS = """The person's own Gmail account.

search_mail finds messages with Gmail's search words and gives each one's id; read_mail opens one. draft_mail saves an
email in Drafts for the person to check and send themselves. send_mail sends at once and cannot be taken back: use it only
when the person asked for the email to be sent, and say to whom and what first. To reply, pass the message's id as
reply_to_id: the email then stays in that thread."""

mcp = FastMCP("gmail", instructions=INSTRUCTIONS, log_level="WARNING")


# The account.


def account() -> tuple[str, str]:
    """The address and the app password from the environment (.env), the password without the spaces Google shows it with."""
    address = os.environ.get(ADDRESS_ENV, "").strip()
    password = os.environ.get(PASSWORD_ENV, "").replace(" ", "").strip()
    if not address or not password:
        missing = " and ".join(name for name, value in ((ADDRESS_ENV, address), (PASSWORD_ENV, password)) if not value)
        raise InboxError(f"set {missing} in .env: make the app password at {PASSWORD_URL} (it needs 2-Step Verification on)")
    return address, password


def _refused(address: str) -> InboxError:
    return InboxError(f"Gmail refused the sign-in for {address}. It needs an app password, made at {PASSWORD_URL}, in .env as {PASSWORD_ENV}.")


@contextmanager
def mailbox(connecting: Connect = connect, open_all: bool = True) -> Iterator[imaplib.IMAP4]:
    """Gmail signed in to over IMAP, with All Mail open read-only (no folder open with `open_all` false, for a draft).
    Signed out at the end, whatever happened."""
    address, password = account()
    try:
        client = connecting()
    except OSError as error:
        raise InboxError(f"cannot reach Gmail: {error}") from error
    try:
        try:
            client.login(address, password)
        except imaplib.IMAP4.error as error:
            raise _refused(address) from error
        if open_all:
            folder = _all_mail(client)
            _check(client.select(f'"{folder}"', readonly=True), f"open {folder}")
        yield client
    except imaplib.IMAP4.error as error:
        raise InboxError(f"Gmail answered with an error: {error}") from error
    finally:
        try:
            client.logout()
        except (OSError, imaplib.IMAP4.error):
            pass


def _folder(client: imaplib.IMAP4, flag: str, fallback: str) -> str:
    """The folder Gmail marks with this flag ("\\Drafts"), whatever language the mailbox names it in."""
    status, folders = client.list()
    if status == "OK":
        for line in folders or []:
            text = line.decode("utf-8", "replace") if isinstance(line, bytes) else str(line)
            if flag in text:
                found = re.search(r'"((?:[^"\\]|\\.)*)"\s*$', text)
                if found:
                    return found.group(1)
    return fallback


def _uids(found: list[Any]) -> list[int]:
    words = (part.decode("ascii", "replace") if isinstance(part, bytes) else str(part) for part in found if part)
    return sorted(int(number) for line in words for number in line.split() if number.isdigit())


def _search(client: imaplib.IMAP4, query: str) -> list[int]:
    """The messages Gmail's own search finds for these words, as typed in its search box, the oldest first."""
    if query.isascii():
        quoted = query.replace("\\", "\\\\").replace('"', '\\"')
        return _uids(_check(client.uid("SEARCH", "X-GM-RAW", f'"{quoted}"'), "search the mailbox"))
    # Words beyond ASCII go as UTF-8 in a literal, which Gmail reads as typed.
    client.literal = query.encode("utf-8")  # type: ignore[assignment]
    return _uids(_check(client.uid("SEARCH", "CHARSET", "UTF-8", "X-GM-RAW"), "search the mailbox"))


def _uid_of(client: imaplib.IMAP4, mail_id: str) -> int:
    """The message's number in the folder open, from Gmail's own id for it: the id search_mail gives."""
    mail_id = mail_id.strip()
    if not mail_id.isdigit():
        raise InboxError(f"{mail_id!r} is not a message id: use one that search_mail gave")
    found = _uids(_check(client.uid("SEARCH", "X-GM-MSGID", mail_id), "find the message"))
    if not found:
        raise InboxError(f"no message has the id {mail_id}")
    return found[-1]


def _fetch(client: imaplib.IMAP4, uid: int, part: str) -> bytes:
    data = _check(client.uid("FETCH", str(uid), f"({part})"), "read the message")
    raw = next((item[1] for item in data if isinstance(item, tuple) and len(item) >= 2), None)
    if not isinstance(raw, bytes):
        raise InboxError("Gmail gave nothing for the message")
    return raw


def _parsed(raw: bytes) -> EmailMessage:
    message = message_from_bytes(raw, policy=policy.default)
    if not isinstance(message, EmailMessage):
        raise InboxError("Gmail gave a message that cannot be read")
    return message


def _header(message: EmailMessage, name: str) -> str:
    return " ".join(str(message.get(name) or "").split())


# Searching and reading.


def find(query: str, limit: int = LIMIT, connecting: Connect = connect) -> list[dict[str, str]]:
    """The newest `limit` messages the search finds (MOST at most), the newest first, as search_mail gives them."""
    address = account()[0]
    with mailbox(connecting) as client:
        uids = _search(client, query.strip() or "in:inbox")[-max(1, min(MOST, limit)):]
        if not uids:
            return []
        part = f"X-GM-MSGID X-GM-THRID BODY.PEEK[]<0.{SEARCH_BYTES}>"
        fetched = _check(client.uid("FETCH", ",".join(str(uid) for uid in uids), f"({part})"), "read the messages")
    return [_found(mail, address) for mail in sorted(parse_fetch(fetched), key=lambda mail: mail.at, reverse=True)]


def _found(mail: Mail, address: str) -> dict[str, str]:
    return {
        "id": mail.id, "date": mail.at, "from": formataddr((mail.sender_name, mail.sender)) if mail.sender_name else mail.sender,
        "subject": mail.subject, "snippet": " ".join(mail.text.split())[:SNIPPET_CHARS], "link": gmail_link(mail.id, address),
    }


def open_message(mail_id: str, connecting: Connect = connect) -> dict[str, Any]:
    """One message as read_mail gives it: its headers, its text and the names of its attachments."""
    address = account()[0]
    with mailbox(connecting) as client:
        message = _parsed(_fetch(client, _uid_of(client, mail_id), f"BODY.PEEK[]<0.{READ_BYTES}>"))
    try:
        attachments = [part.get_filename() or "unnamed" for part in message.iter_attachments()]
    except Exception:  # noqa: BLE001  A message cut short or broken still has its headers and text.
        attachments = []
    return {
        "id": mail_id.strip(), "date": _header(message, "Date"), "from": _header(message, "From"), "to": _header(message, "To"),
        "cc": _header(message, "Cc"), "reply_to": _header(message, "Reply-To"), "subject": _header(message, "Subject"),
        "text": _text(message), "attachments": attachments, "link": gmail_link(mail_id.strip(), address),
    }


# Writing.


def _addresses(text: str) -> list[str]:
    """The addresses in "a@x.com, Ann <b@y.com>" as a header takes them. A part that is no address is refused."""
    found = []
    for name, addr in getaddresses([text.replace(";", ",")]):
        if not name and not addr:
            continue
        if "@" not in addr or any(char.isspace() for char in addr):
            raise InboxError(f"{name or addr!r} is not an email address")
        found.append(formataddr((name, addr)) if name else addr)
    return found


def compose(address: str, to: str, subject: str, body: str, cc: str = "", original: EmailMessage | None = None) -> EmailMessage:
    """The email as it goes out, from the person's own address. A reply (`original` given) goes to the original's sender,
    or to whom the person wrote when the original is their own, unless `to` says otherwise; it takes "Re: " and the
    original's subject unless one is given, and stays in its thread."""
    recipients = _addresses(to)
    if not recipients and original is not None:
        sender = _addresses(str(original.get("Reply-To") or original.get("From") or ""))
        mine = bool(sender) and all(address.lower() in each.lower() for each in sender)
        recipients = _addresses(str(original.get("To") or "")) if mine else sender
    if not recipients:
        raise InboxError("say who the email goes to (to)")
    if original is not None and not subject.strip():
        before = _header(original, "Subject")
        subject = before if before.lower().startswith("re:") else f"Re: {before}"
    if not subject.strip():
        raise InboxError("give the email a subject")
    if not body.strip():
        raise InboxError("give the email a body")
    message = EmailMessage()
    message["From"] = address
    message["To"] = ", ".join(recipients)
    if copies := _addresses(cc):
        message["Cc"] = ", ".join(copies)
    message["Subject"] = " ".join(subject.split())
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=address.rsplit("@", 1)[-1])
    if original is not None and (parent := _header(original, "Message-ID")):
        message["In-Reply-To"] = parent
        message["References"] = " ".join(part for part in (_header(original, "References"), parent) if part)
    message.set_content(body.strip() + "\n")
    return message


def written(to: str, subject: str, body: str, cc: str = "", reply_to_id: str = "", connecting: Connect = connect) -> EmailMessage:
    """The email draft_mail and send_mail are asked for; a reply's original is read first, its headers only."""
    address = account()[0]
    original = None
    if reply_to_id.strip():
        with mailbox(connecting) as client:
            original = _parsed(_fetch(client, _uid_of(client, reply_to_id), "BODY.PEEK[HEADER]"))
    return compose(address, to, subject, body, cc, original)


def save_draft(message: EmailMessage, connecting: Connect = connect) -> None:
    """The email put in Drafts, as Gmail marks a draft: nothing is sent."""
    with mailbox(connecting, open_all=False) as client:
        folder = _folder(client, "\\Drafts", "[Gmail]/Drafts")
        _check(client.append(f'"{folder}"', "(\\Draft)", time.time(), message.as_bytes()), "save the draft")


def _smtp() -> smtplib.SMTP:
    return smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=60)


def send_now(message: EmailMessage, smtp: Smtp = _smtp) -> None:
    """The email sent through Gmail, which keeps a copy in Sent."""
    address, password = account()
    try:
        with smtp() as server:
            server.login(address, password)
            server.send_message(message)
    except smtplib.SMTPAuthenticationError as error:
        raise _refused(address) from error
    except (smtplib.SMTPException, OSError) as error:
        raise InboxError(f"Gmail did not take the email: {error}") from error


# The tools.


@mcp.tool()
async def search_mail(query: str = "in:inbox", limit: int = LIMIT) -> str:
    """Search the mailbox with Gmail's own search words, as in Gmail's search box: `from:stripe.com newer_than:7d`,
    `subject:interview`, `is:unread in:inbox`, `"next steps"`. Gives the newest `limit` messages (50 at most), each with
    its id (for read_mail, or reply_to_id), date, sender, subject, the start of its text and a Gmail link. Nothing is
    marked as read."""
    return json.dumps(await asyncio.to_thread(find, query, limit), ensure_ascii=False, indent=1)


@mcp.tool()
async def read_mail(mail_id: str) -> str:
    """One message in full: from, to, cc, reply-to, date, subject, its text and the names of its attachments. `mail_id`
    is an id search_mail gave. Nothing is marked as read."""
    return json.dumps(await asyncio.to_thread(open_message, mail_id), ensure_ascii=False, indent=1)


@mcp.tool()
async def draft_mail(to: str = "", subject: str = "", body: str = "", cc: str = "", reply_to_id: str = "") -> str:
    """Save an email in Gmail's Drafts, from the person's own address, without sending it: they check it and send it
    from Gmail. `to` and `cc` are addresses separated by commas; `body` is plain text. With `reply_to_id` (an id from
    search_mail) it is a reply in that message's thread: `to` defaults to its sender, `subject` to "Re: " and its subject."""
    message = await asyncio.to_thread(written, to, subject, body, cc, reply_to_id)
    await asyncio.to_thread(save_draft, message)
    drafts = f"https://mail.google.com/mail/?authuser={quote(account()[0])}#drafts"
    return f'Saved in Drafts, not sent: to {message["To"]}, "{message["Subject"]}". Open it: {drafts}'


@mcp.tool()
async def send_mail(to: str = "", subject: str = "", body: str = "", cc: str = "", reply_to_id: str = "") -> str:
    """Send an email now, from the person's own address. It cannot be taken back: only when the person asked for it to
    be sent, otherwise use draft_mail. Same arguments as draft_mail; a reply stays in its thread. Gmail keeps it in Sent."""
    message = await asyncio.to_thread(written, to, subject, body, cc, reply_to_id)
    await asyncio.to_thread(send_now, message)
    copies = f", cc {message['Cc']}" if message["Cc"] else ""
    return f'Sent to {message["To"]}{copies}: "{message["Subject"]}". Gmail keeps it in Sent.'


def main() -> None:
    # The .env the agent and the inbox sync read, wherever the client starts this from.
    load_dotenv(Path.cwd(), default_home(), Path(__file__).resolve().parents[3])
    mcp.run()


if __name__ == "__main__":
    main()

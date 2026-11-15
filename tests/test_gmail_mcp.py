"""The Gmail MCP server with no network: search and read touch nothing, a draft only lands in Drafts, a reply stays in its
thread, and only send_mail sends."""

from __future__ import annotations

import asyncio
import imaplib
from email import policy
from email.message import EmailMessage
from typing import Any, Self

import pytest

from agent_automation.tools import gmail
from agent_automation.tools.inbox import ADDRESS_ENV, PASSWORD_ENV, InboxError

ME = "ada@example.com"


def raw(number: int, sender: str, subject: str, body: str, day: int, to: str = ME, attachment: str = "") -> bytes:
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = sender, to, subject
    message["Date"] = f"Sun, {day:02d} Nov 2026 10:00:00 +0000"
    message["Message-ID"] = f"<m{number}@mail.example>"
    message.set_content(body)
    if attachment:
        message.add_attachment(b"%PDF-1.4", maintype="application", subtype="pdf", filename=attachment)
    return message.as_bytes(policy=policy.SMTP)


class FakeImap:
    """Just enough of imaplib.IMAP4: the messages by their number, and every command given. Gmail's id of message n is
    1000 + n."""

    def __init__(self, messages: dict[int, bytes], refuse: bool = False) -> None:
        self.messages, self.refuse = messages, refuse
        self.commands: list[tuple[Any, ...]] = []
        self.appended: list[tuple[str, str, bytes]] = []
        self.literal: bytes | None = None

    def login(self, address: str, password: str) -> tuple[str, list[Any]]:
        self.commands.append(("LOGIN", address, password))
        if self.refuse:
            raise imaplib.IMAP4.error("[AUTHENTICATIONFAILED] Invalid credentials")
        return "OK", [b"done"]

    def list(self) -> tuple[str, list[Any]]:
        return "OK", [
            b'(\\HasNoChildren) "/" "INBOX"', b'(\\All \\HasNoChildren) "/" "[Gmail]/All Mail"', b'(\\Drafts \\HasNoChildren) "/" "[Gmail]/Drafts"',
        ]

    def select(self, folder: str, readonly: bool = False) -> tuple[str, list[Any]]:
        self.commands.append(("SELECT", folder, readonly))
        return "OK", [b"3"]

    def uid(self, command: str, *args: str) -> tuple[str, list[Any]]:
        literal, self.literal = self.literal, None
        self.commands.append((command, *args) + ((literal,) if literal is not None else ()))
        if command == "SEARCH":
            if args[0] == "X-GM-MSGID":
                number = int(args[1]) - 1000
                return "OK", [str(number).encode() if number in self.messages else b""]
            return "OK", [" ".join(str(number) for number in sorted(self.messages)).encode()]
        data: list[Any] = []
        for number in (int(each) for each in args[0].split(",")):
            body = self.messages[number]
            if "HEADER" in args[1]:
                body = body.split(b"\r\n\r\n", 1)[0] + b"\r\n\r\n"
            data.append((f"{number} (X-GM-MSGID {1000 + number} X-GM-THRID {2000 + number} UID {number} BODY[] {{{len(body)}}}".encode(), body))
            data.append(b")")
        return "OK", data

    def append(self, mailbox: str, flags: str, date_time: object, message: bytes) -> tuple[str, list[Any]]:
        self.appended.append((mailbox, flags, message))
        return "OK", [b"APPEND completed"]

    def logout(self) -> tuple[str, list[Any]]:
        self.commands.append(("LOGOUT",))
        return "BYE", []


class FakeSmtp:
    def __init__(self) -> None:
        self.logins: list[tuple[str, str]] = []
        self.sent: list[EmailMessage] = []

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def login(self, address: str, password: str) -> None:
        self.logins.append((address, password))

    def send_message(self, message: EmailMessage) -> None:
        self.sent.append(message)


@pytest.fixture(autouse=True)
def signed_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(ADDRESS_ENV, ME)
    # As Google shows it: four groups.
    monkeypatch.setenv(PASSWORD_ENV, "abcd efgh ijkl mnop")


def mailbox() -> FakeImap:
    return FakeImap({
        11: raw(11, '"Stripe Recruiting" <no-reply@stripe.com>', "Thank you for applying", "We got your application for the intern role.", 1),
        12: raw(12, "Rita <rita@acme.example>", "Interview", "Could you meet on Tuesday at 10?", 3, attachment="schedule.pdf"),
        13: raw(13, "news@shop.example", "Weekly digest", "Deals of the week.", 2),
    })


def test_a_search_gives_the_newest_first_with_ids_and_links_and_marks_nothing_read() -> None:
    fake = mailbox()
    found = gmail.find("from:stripe.com OR subject:interview", 2, connecting=lambda: fake)
    # The two highest numbers, by date: the interview (Nov 3), then the digest (Nov 2).
    assert [each["id"] for each in found] == ["1012", "1013"]
    first = found[0]
    assert first["from"] == "Rita <rita@acme.example>" and first["subject"] == "Interview" and first["snippet"] == "Could you meet on Tuesday at 10?"
    assert first["link"] == f"https://mail.google.com/mail/?authuser=ada%40example.com#all/{1012:x}"
    assert ("LOGIN", ME, "abcdefghijklmnop") in fake.commands
    assert ("SELECT", '"[Gmail]/All Mail"', True) in fake.commands
    assert ("SEARCH", "X-GM-RAW", '"from:stripe.com OR subject:interview"') in fake.commands
    fetch = next(command for command in fake.commands if command[0] == "FETCH")
    assert fetch[1] == "12,13" and "BODY.PEEK[]" in fetch[2]
    assert fake.commands[-1] == ("LOGOUT",) and fake.appended == []


def test_a_search_beyond_ascii_goes_as_utf8() -> None:
    fake = mailbox()
    gmail.find("Tuấn", connecting=lambda: fake)
    assert ("SEARCH", "CHARSET", "UTF-8", "X-GM-RAW", "Tuấn".encode()) in fake.commands


def test_read_gives_the_headers_the_text_and_the_attachments_names() -> None:
    fake = mailbox()
    message = gmail.open_message("1012", connecting=lambda: fake)
    assert (message["from"], message["to"], message["subject"]) == ("Rita <rita@acme.example>", ME, "Interview")
    assert message["text"] == "Could you meet on Tuesday at 10?" and message["attachments"] == ["schedule.pdf"]
    assert ("SEARCH", "X-GM-MSGID", "1012") in fake.commands
    with pytest.raises(InboxError, match="no message has the id 1099"):
        gmail.open_message("1099", connecting=lambda: fake)
    with pytest.raises(InboxError, match="not a message id"):
        gmail.open_message("abc", connecting=lambda: fake)


def test_a_reply_draft_lands_in_drafts_in_its_thread_and_nothing_is_sent() -> None:
    fake = mailbox()
    reply = gmail.written("", "", "Tuesday at 10 works.\n\nAda", reply_to_id="1012", connecting=lambda: fake)
    assert (reply["From"], reply["To"], reply["Subject"]) == (ME, "Rita <rita@acme.example>", "Re: Interview")
    assert reply["In-Reply-To"] == "<m12@mail.example>" and reply["References"] == "<m12@mail.example>"
    drafts = FakeImap({})
    gmail.save_draft(reply, connecting=lambda: drafts)
    [(folder, flags, data)] = drafts.appended
    assert (folder, flags) == ('"[Gmail]/Drafts"', "(\\Draft)") and b"Tuesday at 10 works." in data
    # A draft opens no folder: it is only appended.
    assert not any(command[0] == "SELECT" for command in drafts.commands)


def test_a_reply_to_the_persons_own_mail_goes_to_whom_they_wrote() -> None:
    fake = FakeImap({20: raw(20, ME, "Following up", "Any news?", 4, to="Rita <rita@acme.example>")})
    reply = gmail.written("", "", "One more thing.", reply_to_id="1020", connecting=lambda: fake)
    assert reply["To"] == "Rita <rita@acme.example>" and reply["Subject"] == "Re: Following up"


def test_send_signs_in_with_the_app_password_and_sends_from_the_persons_address() -> None:
    smtp = FakeSmtp()
    message = gmail.compose(ME, "Bob <bob@x.example>; carl@y.example", "Hello", "Hi there", cc="dee@z.example")
    gmail.send_now(message, smtp=lambda: smtp)  # type: ignore[arg-type, return-value]
    assert smtp.logins == [(ME, "abcdefghijklmnop")]
    [sent] = smtp.sent
    assert (sent["From"], sent["To"], sent["Cc"], sent["Subject"]) == (ME, "Bob <bob@x.example>, carl@y.example", "dee@z.example", "Hello")
    assert sent.get_content() == "Hi there\n"


def test_what_is_missing_or_wrong_is_said_in_words(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(InboxError, match="not an email address"):
        gmail.compose(ME, "bob at work", "Hi", "Hello")
    with pytest.raises(InboxError, match="who the email goes to"):
        gmail.compose(ME, "", "Hi", "Hello")
    with pytest.raises(InboxError, match="subject"):
        gmail.compose(ME, "bob@x.example", " ", "Hello")
    with pytest.raises(InboxError, match="body"):
        gmail.compose(ME, "bob@x.example", "Hi", "  ")
    # A subject cannot carry a line break into the headers.
    assert gmail.compose(ME, "bob@x.example", "Hi\r\nBcc: eve@evil.example", "Hello")["Subject"] == "Hi Bcc: eve@evil.example"
    with pytest.raises(InboxError, match="app password"):
        gmail.find("in:inbox", connecting=lambda: FakeImap({}, refuse=True))
    monkeypatch.delenv(PASSWORD_ENV)
    with pytest.raises(InboxError, match=PASSWORD_ENV):
        gmail.find("in:inbox", connecting=mailbox)


def test_the_server_offers_search_read_draft_and_send() -> None:
    tools = asyncio.run(gmail.mcp.list_tools())
    assert {tool.name for tool in tools} == {"search_mail", "read_mail", "draft_mail", "send_mail"}
    send = next(tool for tool in tools if tool.name == "send_mail")
    assert "cannot be taken back" in (send.description or "")

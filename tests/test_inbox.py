"""The inbox sync: what each kind of mail is read as, the applications they add up to, and that the mailbox is only ever
read. No network: a scripted IMAP connection stands in for Gmail."""

from __future__ import annotations

import imaplib
from email.message import EmailMessage
from pathlib import Path

import pytest

from agent_automation.memory.inbox_store import InboxStore
from agent_automation.tools import inbox
from agent_automation.tools.inbox import Event, InboxError, Mail, applications, classify, company_of, kind_of, parse_message, read, role_of


def mail(sender: str, subject: str, text: str, name: str = "", at: str = "2026-11-01T10:00:00+00:00", uid: int = 1, thread: str = "") -> Mail:
    return Mail(uid, f"m{uid}", thread or f"t{uid}", at, sender, name, subject, text)


CONFIRMATIONS = [
    # Greenhouse: the company is in the name the sender shows, never in its address.
    (mail("no-reply@us.greenhouse-mail.io", "Thank you for applying to Stripe",
          "Hi Khang,\nThank you for applying to the Software Engineer Intern position at Stripe. We have received your application "
          "and our team will review it. If your background is a match, we will reach out to schedule an interview.", "Stripe Recruiting"),
     "Stripe", "Software Engineer Intern"),
    # Lever.
    (mail("no-reply@hire.lever.co", "Thanks for applying to Figma!",
          "Thanks for applying to Figma! We've received your application for Software Engineering Intern, Summer 2027.", "Figma"),
     "Figma", "Software Engineering Intern, Summer 2027"),
    # Workday writes as the tenant.
    (mail("cisco@myworkday.com", "Application Received",
          "Dear Khang,\nThank you for your interest in Cisco. Your application for the Software Engineer Full-Stack / Backend I (Intern) "
          "role has been received.", "Workday"),
     "Cisco", "Software Engineer Full-Stack / Backend I (Intern)"),
    # LinkedIn's own receipt.
    (mail("jobs-noreply@linkedin.com", "Khang, your application was sent to Datadog",
          "Your application was sent to Datadog\nSoftware Engineer Intern\nDatadog · New York, NY", "LinkedIn"),
     "Datadog", ""),
    # The company's own address, with nothing but a generic name shown.
    (mail("careers@mail.brex.com", "We received your application", "Thanks for your interest! We have received your application.", "Careers"),
     "Brex", ""),
    # Ashby.
    (mail("no-reply@ashbyhq.com", "Thanks for applying to Ramp", "Thank you for applying for the Backend Engineer Intern role at Ramp.", "Ramp Hiring Team"),
     "Ramp", "Backend Engineer Intern"),
]


@pytest.mark.parametrize(("message", "company", "role"), CONFIRMATIONS)
def test_a_confirmation_is_an_application_with_its_company_and_role(message: Mail, company: str, role: str) -> None:
    event = classify(message)
    assert event is not None
    assert (event.kind, event.company, event.role) == ("applied", company, role)


def test_a_confirmation_that_only_mentions_an_interview_is_no_invitation() -> None:
    text = "Thank you for applying. If you are selected for an interview, a recruiter will contact you. Should your profile match, we may invite you to interview."
    assert kind_of("Application received", text) == "applied"


@pytest.mark.parametrize(
    ("subject", "text", "kind"),
    [
        ("Update on your application to Notion", "Unfortunately, we have decided to move forward with other candidates at this time.", "rejected"),
        ("Your application", "After careful review, we will not be moving forward with your application.", "rejected"),
        ("Thank you for interviewing", "Thank you for your interview with us. We regret to inform you the position has been filled.", "rejected"),
        ("Interview invitation: Software Engineer Intern", "We would like to schedule a 30 minute call with you.", "interview"),
        ("Next steps with Plaid", "We'd love to schedule a phone screen. Please share your availability for next week.", "interview"),
        ("Your Online Assessment for Amazon", "Please complete the online assessment within 7 days.", "assessment"),
        ("Coding challenge", "You have been invited to complete a HackerRank test for the SWE Intern role.", "assessment"),
        ("Your offer from Acme", "We are pleased to offer you the Software Engineer Intern position. Your offer letter is attached.", "offer"),
        ("About your application", "We are unable to offer you a position at this time.", "rejected"),
    ],
)
def test_each_stage_is_told_from_its_words(subject: str, text: str, kind: str) -> None:
    assert kind_of(subject, text) == kind


@pytest.mark.parametrize(
    ("subject", "text"),
    [
        ("Job alert: 12 new jobs for Software Engineer Intern", "Apply now to these jobs matching your search."),
        ("Your verification code", "Your verification code is 482913. It was requested for your application account."),
        ("Stripe is hiring: Software Engineer", "Apply now."),
        ("Finish your application to Meta", "You started an application. Complete your application today."),
        ("Lunch on Friday?", "Are you free on Friday?"),
        ("Your weekly digest", "Thank you for your interest in our newsletter."),
    ],
)
def test_mail_that_is_no_answer_to_an_application_is_left_out(subject: str, text: str) -> None:
    assert kind_of(subject, text) == ""
    assert classify(mail("news@example.com", subject, text, "Example")) is None


def test_a_carriers_own_name_is_never_the_company() -> None:
    message = mail("no-reply@greenhouse.io", "Thank you for applying", "Thank you for applying. We received your application.", "Greenhouse")
    assert company_of(message) == ""
    assert classify(message) is None


def test_the_role_is_empty_when_the_words_name_none() -> None:
    assert role_of(mail("jobs@stripe.com", "Thank you for applying to Stripe", "We received your application and will be in touch.")) == ""


def events(*items: tuple[str, str, str, str, str]) -> list[Event]:
    """(at, kind, company, role, thread) each."""
    return [Event(f"m{n}", thread, at, kind, company, role, "a@b.c", f"{kind} {company}", "") for n, (at, kind, company, role, thread) in enumerate(items)]


def test_messages_about_one_application_add_up_to_its_latest_stage() -> None:
    found = applications(events(
        ("2026-10-01", "applied", "Stripe", "Software Engineer Intern", "t1"),
        ("2026-10-05", "assessment", "Stripe, Inc.", "", "t2"),
        ("2026-10-12", "interview", "stripe", "", "t3"),
        ("2026-10-03", "applied", "Figma", "", "t4"),
        ("2026-10-20", "rejected", "Figma", "", "t5"),
    ))
    assert [(item.company, item.role, item.status, item.mails) for item in found] == [
        ("Figma", "", "rejected", 2),
        ("Stripe", "Software Engineer Intern", "interview", 3),
    ]
    assert found[1].applied_at == "2026-10-01" and found[1].updated_at == "2026-10-12"


def test_two_roles_at_one_company_are_two_applications_and_a_nameless_mail_follows_its_thread() -> None:
    found = applications(events(
        ("2026-10-01", "applied", "Amazon", "SDE Intern", "t1"),
        ("2026-10-02", "applied", "Amazon", "Data Engineer Intern", "t2"),
        ("2026-10-09", "rejected", "Amazon", "", "t1"),
    ))
    by_role = {item.role: item.status for item in found}
    assert by_role == {"SDE Intern": "rejected", "Data Engineer Intern": "applied"}


def test_a_role_named_later_names_the_application_that_had_none() -> None:
    found = applications(events(
        ("2026-10-01", "applied", "Brex", "", "t1"),
        ("2026-10-08", "interview", "Brex", "Software Engineer, Intern", "t2"),
    ))
    assert [(item.role, item.status, item.mails) for item in found] == [("Software Engineer, Intern", "interview", 2)]


def test_an_offer_after_a_rejection_is_the_news_and_a_rejection_after_an_interview_ends_it() -> None:
    assert applications(events(("2026-10-01", "interview", "Acme", "", "t"), ("2026-10-05", "rejected", "Acme", "", "t")))[0].status == "rejected"
    assert applications(events(("2026-10-01", "rejected", "Acme", "", "t"), ("2026-10-05", "offer", "Acme", "", "t")))[0].status == "offer"


def test_an_application_the_agent_sent_is_marked_whatever_way_the_company_is_written() -> None:
    found = applications(events(("2026-10-01", "applied", "Cisco", "", "t1"), ("2026-10-01", "applied", "Ramp", "", "t2")), ["cisco/wd5/cisco_careers", "Cisco"])
    assert {item.company: item.by_agent for item in found} == {"Cisco": True, "Ramp": False}


def raw_message(sender: str, subject: str, body: str, html: bool = False) -> bytes:
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = sender, "me@gmail.com", subject
    message["Date"] = "Sun, 01 Nov 2026 10:00:00 +0000"
    message.set_content(body, subtype="html" if html else "plain")
    return message.as_bytes()


def test_a_message_in_html_is_read_as_its_words() -> None:
    raw = raw_message('"Stripe Recruiting" <no-reply@us.greenhouse-mail.io>', "Thank you for applying to Stripe",
                      "<html><head><style>p{color:red}</style></head><body><p>Thank you for applying to the <b>Software Engineer Intern</b> position.</p><p>Bye</p></body></html>", html=True)
    read_back = parse_message(raw, 7, "99", "55")
    assert read_back is not None
    assert (read_back.uid, read_back.id, read_back.thread, read_back.sender, read_back.sender_name) == (7, "99", "55", "no-reply@us.greenhouse-mail.io", "Stripe Recruiting")
    assert "color:red" not in read_back.text and "Thank you for applying to the Software Engineer Intern position." in read_back.text
    assert read_back.at == "2026-11-01T10:00:00+00:00"


class FakeGmail:
    """Just enough of imaplib.IMAP4 for a read: it records every command it was given."""

    def __init__(self, messages: dict[int, bytes], validity: int = 3, refuse_login: bool = False) -> None:
        self.messages, self.validity, self.refuse_login = messages, validity, refuse_login
        self.commands: list[tuple] = []

    def login(self, address: str, password: str) -> tuple[str, list]:
        self.commands.append(("LOGIN", address, password))
        if self.refuse_login:
            raise imaplib.IMAP4.error("[AUTHENTICATIONFAILED] Invalid credentials")
        return "OK", [b"done"]

    def list(self) -> tuple[str, list]:
        return "OK", [b'(\\HasNoChildren) "/" "INBOX"', b'(\\All \\HasNoChildren) "/" "[Gmail]/Alle Nachrichten"']

    def select(self, folder: str, readonly: bool = False) -> tuple[str, list]:
        self.commands.append(("SELECT", folder, readonly))
        return "OK", [b"2"]

    def response(self, name: str) -> tuple[str, list]:
        return name, [str(self.validity).encode()]

    def uid(self, command: str, *args: str) -> tuple[str, list]:
        self.commands.append((command, *args))
        if command == "SEARCH":
            return "OK", [" ".join(str(uid) for uid in sorted(self.messages)).encode()]
        wanted = [int(uid) for uid in args[0].split(",")]
        data: list = []
        for uid in wanted:
            data.append((f"{uid} (X-GM-MSGID {1000 + uid} X-GM-THRID {2000 + uid} UID {uid} BODY[]<0> {{{len(self.messages[uid])}}}".encode(), self.messages[uid]))
            data.append(b")")
        return "OK", data

    def logout(self) -> tuple[str, list]:
        self.commands.append(("LOGOUT",))
        return "BYE", []


def gmail() -> FakeGmail:
    return FakeGmail({
        11: raw_message('"Stripe Recruiting" <no-reply@us.greenhouse-mail.io>', "Thank you for applying to Stripe", "Thank you for applying to the Software Engineer Intern position at Stripe."),
        12: raw_message("deals@shop.example", "Your weekly digest", "Thank you for your interest in our newsletter."),
    })


def test_the_mailbox_is_opened_read_only_and_every_message_is_only_peeked_at() -> None:
    server = gmail()
    validity, mails = read("me@gmail.com", "abcd efgh ijkl mnop", 30, connecting=lambda: server)  # type: ignore[arg-type, return-value]
    assert validity == 3 and [m.uid for m in mails] == [11, 12]
    assert ("LOGIN", "me@gmail.com", "abcdefghijklmnop") in server.commands
    # The folder with every message, by its flag and not its name, and read-only.
    assert ("SELECT", '"[Gmail]/Alle Nachrichten"', True) in server.commands
    sent = [command for command in server.commands if command[0] in ("SEARCH", "FETCH")]
    assert sent[0][1] == "X-GM-RAW" and "newer_than:30d" in sent[0][2] and "-from:me" in sent[0][2]
    assert "BODY.PEEK[]" in sent[1][2] and "BODY[]" not in sent[1][2].replace("BODY.PEEK[]", "")
    # Nothing that could change the mailbox was ever asked for.
    assert {command[0] for command in server.commands} == {"LOGIN", "SELECT", "SEARCH", "FETCH", "LOGOUT"}


def test_a_refused_sign_in_says_how_to_make_an_app_password_and_a_missing_one_is_said_before_any_connection() -> None:
    with pytest.raises(InboxError, match="app password"):
        read("me@gmail.com", "wrong", connecting=lambda: FakeGmail({}, refuse_login=True))  # type: ignore[arg-type, return-value]
    with pytest.raises(InboxError, match=inbox.PASSWORD_ENV):
        read("me@gmail.com", "", connecting=lambda: pytest.fail("no connection without a password"))  # type: ignore[arg-type, return-value]


def test_a_second_sync_fetches_nothing_already_read_and_a_renumbered_mailbox_is_read_again(tmp_path: Path) -> None:
    store = InboxStore(tmp_path / "inbox.db")

    def one_sync(server: FakeGmail) -> tuple[int, int]:
        _, mails = read("me@gmail.com", "pw", 30, store.known, lambda: server)  # type: ignore[arg-type, return-value]
        kept = [event for event in map(classify, mails) if event is not None]
        return len(mails), store.add([m.uid for m in mails], kept, "2026-11-12T00:00:00+00:00")

    assert one_sync(gmail()) == (2, 1)
    second = gmail()
    assert one_sync(second) == (0, 0)
    assert not [command for command in second.commands if command[0] == "FETCH"]
    # Another validity: the numbers mean other messages now. They are read again, and the one already kept is not doubled.
    renumbered = gmail()
    renumbered.validity = 4
    assert one_sync(renumbered) == (2, 0)
    assert [(event.kind, event.company) for event in store.events()] == [("applied", "Stripe")]
    assert store.synced_at() == "2026-11-12T00:00:00+00:00"
    store.close()

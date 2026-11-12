"""The person's Gmail read for what happened to their applications: confirmations, tests, interviews, rejections, offers.

Read only, over IMAP with a Google app password: the mailbox is opened read-only and every message is fetched with PEEK, so
nothing is marked as read, moved, deleted or sent. Only mail Gmail's own search finds for the words of an application is
fetched, and only what the rules below call an application's mail is kept: who sent it, its subject, its date, a short
start of its text. The rest is counted as seen and forgotten.
"""

from __future__ import annotations

import html
import imaplib
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import getaddresses, parsedate_to_datetime

HOST = "imap.gmail.com"
PORT = 993
ADDRESS_ENV = "GMAIL_ADDRESS"
PASSWORD_ENV = "GMAIL_APP_PASSWORD"
PASSWORD_URL = "https://myaccount.google.com/apppasswords"
DEFAULT_DAYS = 180
# The start of each message is enough to tell what it is; a long newsletter is not read to its end.
MESSAGE_BYTES = 60_000
BATCH = 40
SNIPPET_CHARS = 220

# What Gmail is asked for: mail that speaks of an application, not chats, spam or what the person sent.
QUERY = (
    "newer_than:{days}d -in:chats -in:spam -in:trash -from:me "
    '{{application applying applied candidacy interview assessment "coding challenge" "next steps" "offer letter"}}'
)

# The stages, the furthest last. A rejection ends an application whatever came before it.
KINDS = ("applied", "assessment", "interview", "offer", "rejected")
RANK = {"applied": 1, "assessment": 2, "interview": 3, "offer": 4}
STATUS_WORDS = {"applied": "Applied", "assessment": "Assessment", "interview": "Interview", "offer": "Offer", "rejected": "Rejected"}


class InboxError(Exception):
    """Said to the person as it is: what is missing, or what Gmail refused."""


@dataclass(frozen=True)
class Mail:
    """One message as it was read. `id` is Gmail's own id for it, the same in every folder."""

    uid: int
    id: str
    thread: str
    at: str
    sender: str
    sender_name: str
    subject: str
    text: str


@dataclass(frozen=True)
class Event:
    """What a message says happened: its kind, and the company and role it names, as far as they can be read."""

    mail_id: str
    thread: str
    at: str
    kind: str
    company: str
    role: str
    sender: str
    subject: str
    snippet: str


@dataclass(frozen=True)
class Application:
    """One application, from every message about it: where it stands now, and since when."""

    company: str
    role: str
    status: str
    applied_at: str
    updated_at: str
    subject: str
    mails: int
    # True when Agent Automation sent it; False when the person applied by hand.
    by_agent: bool = False


# Reading the mailbox.

Connect = Callable[[], imaplib.IMAP4]


def connect() -> imaplib.IMAP4:
    return imaplib.IMAP4_SSL(HOST, PORT, timeout=60)


def _check(answer: tuple[str, list], what: str) -> list:
    status, data = answer
    if status != "OK":
        raise InboxError(f"Gmail refused to {what}: {_plain(data)}")
    return data


def _plain(data: object) -> str:
    parts = data if isinstance(data, list) else [data]
    return " ".join(part.decode("utf-8", "replace") if isinstance(part, bytes) else str(part) for part in parts)


def _all_mail(client: imaplib.IMAP4) -> str:
    """The folder that holds every message, whatever language the mailbox names it in; the inbox when there is none."""
    status, folders = client.list()
    if status == "OK":
        for line in folders or []:
            text = line.decode("utf-8", "replace") if isinstance(line, bytes) else str(line)
            if "\\All" in text:
                found = re.search(r'"((?:[^"\\]|\\.)*)"\s*$', text)
                if found:
                    return found.group(1)
    return "INBOX"


def read(
    address: str, password: str, days: int = DEFAULT_DAYS, known: Callable[[int, list[int]], set[int]] | None = None,
    connecting: Connect = connect,
) -> tuple[int, list[Mail]]:
    """The mail about applications of the last `days` days that is not known yet, the oldest first, and the mailbox's
    validity number: its message numbers mean something only while that number stays the same. `known` is told the
    validity and the numbers found, and answers which of them were read before."""
    if not address or not password:
        missing = " and ".join(name for name, value in ((ADDRESS_ENV, address), (PASSWORD_ENV, password)) if not value)
        raise InboxError(f"set {missing} in .env: make the app password at {PASSWORD_URL} (it needs 2-Step Verification on)")
    try:
        client = connecting()
    except OSError as error:
        raise InboxError(f"cannot reach Gmail: {error}") from error
    try:
        try:
            # An app password is shown in four groups; Google takes it with or without the spaces.
            client.login(address, password.replace(" ", ""))
        except imaplib.IMAP4.error as error:
            raise InboxError(
                f"Gmail refused the sign-in for {address}. It needs an app password, not the account's own: turn on 2-Step "
                f"Verification, make one at {PASSWORD_URL} and put it in .env as {PASSWORD_ENV}."
            ) from error
        folder = _all_mail(client)
        # Read-only: nothing this connection does can change a message, not even mark it as read.
        _check(client.select(f'"{folder}"', readonly=True), f"open {folder}")
        validity = int((client.response("UIDVALIDITY")[1] or [b"0"])[0] or 0)
        query = QUERY.format(days=max(1, days)).replace("\\", "\\\\").replace('"', '\\"')
        found = _check(client.uid("SEARCH", "X-GM-RAW", f'"{query}"'), "search the mailbox")
        uids = sorted(int(number) for part in found if part for number in part.split())
        seen = known(validity, uids) if known else set()
        fresh = [uid for uid in uids if uid not in seen]
        mails: list[Mail] = []
        for start in range(0, len(fresh), BATCH):
            numbers = ",".join(str(uid) for uid in fresh[start : start + BATCH])
            data = _check(client.uid("FETCH", numbers, f"(X-GM-MSGID X-GM-THRID BODY.PEEK[]<0.{MESSAGE_BYTES}>)"), "read a message")
            mails.extend(parse_fetch(data))
        return validity, sorted(mails, key=lambda mail: mail.at)
    except imaplib.IMAP4.error as error:
        raise InboxError(f"Gmail answered with an error: {error}") from error
    finally:
        try:
            client.logout()
        except (OSError, imaplib.IMAP4.error):
            pass


def parse_fetch(data: Iterable[object]) -> list[Mail]:
    """The messages in one FETCH answer. Each comes as a pair: the line that names it, then its bytes."""
    mails = []
    for part in data:
        if not isinstance(part, tuple) or len(part) < 2:
            continue
        line = part[0].decode("utf-8", "replace") if isinstance(part[0], bytes) else str(part[0])
        uid, message_id, thread = (re.search(pattern, line) for pattern in (r"\bUID (\d+)", r"X-GM-MSGID (\d+)", r"X-GM-THRID (\d+)"))
        if not uid:
            continue
        mail = parse_message(part[1], int(uid.group(1)), message_id.group(1) if message_id else "", thread.group(1) if thread else "")
        if mail:
            mails.append(mail)
    return mails


def parse_message(raw: bytes, uid: int, message_id: str = "", thread: str = "") -> Mail | None:
    try:
        message = message_from_bytes(raw, policy=policy.default)
    except Exception:  # noqa: BLE001  A message the parser cannot read is skipped, not a reason to stop the sync.
        return None
    if not isinstance(message, EmailMessage):
        return None
    senders = getaddresses([str(message.get("From") or "")])
    name, sender = senders[0] if senders else ("", "")
    try:
        at = parsedate_to_datetime(str(message.get("Date") or "")).astimezone(UTC)
    except (TypeError, ValueError):
        at = datetime.now(UTC)
    return Mail(
        uid=uid, id=message_id or str(message.get("Message-ID") or uid), thread=thread or message_id, at=at.isoformat(timespec="seconds"),
        sender=sender.strip().lower(), sender_name=" ".join(name.split()), subject=" ".join(str(message.get("Subject") or "").split()),
        text=_text(message),
    )


def _text(message: EmailMessage) -> str:
    """The message in plain words. A message cut short at MESSAGE_BYTES may end mid-part: what could be read is kept."""
    try:
        body = message.get_body(preferencelist=("plain", "html"))
        content = body.get_content() if body is not None else ""
    except Exception:  # noqa: BLE001  A broken part: the subject and the sender still say what the message is.
        return ""
    if not isinstance(content, str):
        return ""
    if body is not None and body.get_content_subtype() == "html":
        content = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", content)
        content = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", content)
        content = html.unescape(re.sub(r"<[^>]+>", " ", content))
    lines = (" ".join(line.split()) for line in content.replace("\u200c", "").replace("\xa0", " ").splitlines())
    return "\n".join(line for line in lines if line)[:8000]


# What a message says.

def _any(*phrases: str) -> re.Pattern[str]:
    return re.compile("|".join(phrases), re.IGNORECASE)


# Mail that speaks of jobs and is no answer to an application.
NOISE = _any(
    r"job alert", r"jobs? (?:you may|you might|for you|matching|recommended|based on)", r"new jobs?\b", r"recommended jobs",
    r"\bnewsletter\b", r"\bwebinar\b", r"\bunsubscribe from (?:job|these) alerts", r"apply now\b", r"is hiring\b", r"are hiring\b",
    r"your (?:weekly|daily) ", r"finish (?:your|the) application", r"complete your application", r"application is incomplete",
    r"don't forget to apply", r"still interested\?", r"verification code", r"verify your email", r"confirm your email",
    r"reset your password", r"security code", r"one[- ]time (?:pass|code)",
)
OFFER = _any(
    r"offer letter", r"pleased to (?:offer|extend)", r"(?:excited|delighted|happy|thrilled) to (?:offer|extend)", r"extend(?:ing)? (?:you )?an offer",
    r"offer of employment", r"your offer from", r"congratulations.{0,60}\boffer\b",
)
NO_OFFER = _any(r"unable to (?:offer|extend)", r"not (?:be )?(?:able to |in a position to )?(?:offer|extend)", r"cannot offer", r"won't be (?:making|extending)")
REJECTED = _any(
    r"not (?:be )?(?:moving|proceeding|going) forward", r"(?:move|moving|proceed|proceeding|moved) forward with (?:other|another|different)",
    r"pursue other (?:candidates|applicants)", r"other (?:candidates|applicants) (?:whose|who|that)", r"not (?:been )?selected",
    r"will not be (?:moving|proceeding|advancing|considered)", r"won't be (?:moving|proceeding|advancing)", r"no longer (?:under consideration|being considered)",
    r"position has (?:been|already been) filled", r"decided not to (?:move|proceed)", r"regret to inform", r"we regret",
    r"unable to (?:offer|move|proceed|advance)", r"not (?:a|the right) (?:match|fit) (?:for|at) this time",
    r"(?:unfortunately|regrettably).{0,200}(?:not|unable|other candidates|another candidate)",
    r"decided to (?:move|go|proceed) (?:forward |ahead )?(?:with|in) (?:other|another|a different)",
)
ASSESSMENT = _any(
    r"online assessment", r"coding (?:challenge|assessment|test|exercise)", r"technical (?:assessment|challenge|screen(?:ing)? test)", r"take[- ]home",
    r"\bcodesignal\b", r"\bhackerrank\b", r"\bcodility\b", r"\bkarat\b", r"\bhirevue\b", r"\bcoderpad\b", r"\bcodebyte\b",
    r"complete (?:the|this|your|an|our) (?:\w+ ){0,2}(?:assessment|challenge|test)\b", r"invit\w+ (?:you )?to (?:complete|take) (?:a|an|the|our)",
    r"\bassessment (?:invitation|link|invite)\b", r"skills? (?:assessment|test)",
)
INTERVIEW = _any(
    r"schedul\w+ (?:an?|your|the|a time for an?) (?:\w+ ){0,2}interview", r"invit\w+ (?:you )?(?:to|for) (?:an?|the) (?:\w+ ){0,2}interview",
    r"interview (?:invitation|invite|confirmation|request|details|schedule)", r"your (?:\w+ ){0,2}interview (?:with|is|has|on|at)\b",
    r"(?:like|love) to (?:schedule|set up|arrange|invite|speak|chat|talk|meet)", r"phone screen", r"recruiter (?:screen|call|chat)",
    r"(?:schedule|book|pick|select|choose) a time", r"share your availability", r"(?:send|provide) (?:us |me )?your availability",
    r"move(?:d)? (?:you )?(?:forward )?to the (?:next|interview) (?:round|stage|step)", r"next (?:round|stage) of (?:the |our )?interview",
    r"\bcalendly\.com\b", r"\bgoodtime\.io\b",
)
APPLIED = _any(
    r"thank(?:s| you) for (?:applying|your application|your interest|submitting|taking the time to apply)", r"application (?:has been |was |is )?(?:received|submitted|sent|complete)",
    r"(?:received|got|have) your application", r"application confirmation", r"successfully (?:applied|submitted)", r"we(?:'ve| have) received your",
    r"your application (?:to|for|at|with)\b", r"applied (?:to|for) (?:the )?", r"thank you for applying", r"application was sent to",
    r"reviewing your (?:application|resume|qualifications)",
)
# Words in a confirmation that only say what could come next: they are no invitation.
CONDITIONAL = _any(
    r"if (?:you are|you're|your (?:\w+ ){0,3}(?:is|are|match)|we|there is|selected|chosen|it looks)", r"should (?:your|we|you)\b", r"in the event",
    r"may (?:be )?(?:contact|reach|invite)", r"will (?:be in touch|contact you|reach out) if", r"only (?:those|candidates|applicants)",
)


def _sentences(text: str) -> list[str]:
    return [part for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def _strong(pattern: re.Pattern[str], subject: str, text: str) -> bool:
    """True when the subject says it, or a sentence of the text says it and is not a sentence about what may come."""
    if pattern.search(subject):
        return True
    return any(pattern.search(sentence) and not CONDITIONAL.search(sentence) for sentence in _sentences(text))


def kind_of(subject: str, text: str) -> str:
    """What the message is about, or empty when it is no answer to an application. The furthest stage wins, and a
    rejection wins over them all: a no that mentions the interview that was held is still a no."""
    whole = f"{subject}\n{text}"
    if NOISE.search(subject) and not APPLIED.search(subject):
        return ""
    if _strong(REJECTED, subject, text):
        return "rejected"
    if _strong(OFFER, subject, text) and not NO_OFFER.search(whole):
        return "offer"
    if _strong(INTERVIEW, subject, text):
        return "interview"
    if _strong(ASSESSMENT, subject, text):
        return "assessment"
    if APPLIED.search(whole) and not NOISE.search(whole[:1500]):
        return "applied"
    return ""


# Who it is from, and for which role.

# Hosts that send for many employers: the company is in the name the sender shows, or in the words.
CARRIERS = (
    "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "myworkday.com", "myworkdayjobs.com", "workday.com",
    "smartrecruiters.com", "icims.com", "jobvite.com", "workablemail.com", "workable.com", "bamboohr.com", "recruitee.com", "teamtailor.com",
    "breezy.hr", "jazzhr.com", "applytojob.com", "taleo.net", "oraclecloud.com", "successfactors.com", "successfactors.eu", "paylocity.com",
    "paycomonline.net", "adp.com", "ultipro.com", "ukg.com", "dayforcehcm.com", "personio.com", "rippling.com", "gem.com", "pinpointhq.com",
    "linkedin.com", "indeed.com", "indeedemail.com", "glassdoor.com", "ziprecruiter.com", "wellfound.com", "handshake.com", "joinhandshake.com",
    "simplify.jobs", "jobright.ai", "hackerrank.com", "codesignal.com", "codility.com", "hirevue.com", "karat.io", "karat.com", "calendly.com",
    "goodtime.io", "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com",
)
# Names a sender shows that are no company's.
GENERIC = re.compile(
    r"(?i)^(?:no[-_ .]?reply|do[-_ ]?not[-_ ]?reply|notifications?|recruiting|recruitment|recruiter|careers?|jobs?|talent(?: acquisition)?|"
    r"hiring(?: team)?|human resources|hr|people(?: team| ops| operations)?|team|admin|info|support|workday|greenhouse|lever|ashby|icims|"
    r"smartrecruiters|linkedin|indeed|handshake|applications?|candidates?|system|mailer|hello|hi)$"
)
SENDER_TAIL = re.compile(
    r"(?i)[\s,|@:-]*\b(?:recruiting|recruitment|recruiters?|careers?|jobs|talent acquisition|talent|hiring team|hiring|human resources|hr|"
    r"people team|people operations|people|team|university|campus|early careers?|notifications?|no[-_ ]?reply|via .*)\s*$"
)
SENDER_HEAD = re.compile(r"(?i)^(?:the\s+)?(?:team at|careers at|recruiting at|talent at|jobs at|hiring at)\s+")
COMPANY = r"([A-Z0-9][\w&.'’+-]*(?:[ ][A-Z0-9&][\w&.'’+-]*){0,4})"
COMPANY_IN_WORDS = (
    re.compile(rf"(?:applying|applied|application|apply)\b(?: (?:to|at|with)(?: the)?| for (?:a |an |the )?(?:[\w/&,+.()-]+ ){{1,10}}?(?:at|with)) {COMPANY}"),
    re.compile(rf"(?:interest|interested) in (?:joining |working (?:at|with|for) |a career (?:at|with) |employment (?:at|with) |opportunities (?:at|with) )?{COMPANY}"),
    re.compile(rf"(?:position|role|opening|opportunity|job|career|internship|co-op)s? (?:at|with) {COMPANY}"),
    re.compile(rf"application was sent to {COMPANY}"),
    re.compile(rf"(?:from|on behalf of|here at|team at|joining) {COMPANY}"),
    re.compile(rf"\b{COMPANY} (?:Recruiting|Talent|Careers|Hiring) (?:Team|Acquisition)\b"),
    re.compile(rf"^{COMPANY}(?: [-|:] | (?:application|careers|recruiting)\b)"),
)
# A word that ends a company's name when the pattern ran on into the sentence.
COMPANY_STOP = re.compile(
    r"(?i)\s+(?:and|for|as|in|on|is|has|was|we|our|the|your|you|to|with|at|careers?|recruiting|team|application|position|role|internship|"
    r"intern|opening|opportunity|job|thank|thanks|please|will|would|but|so|this|that|if|because|since|regarding|re)\b.*$"
)
NOT_A_COMPANY = re.compile(
    r"(?i)^(?:the|a|an|our|this|that|your|you|we|us|it|its|their|team|company|position|role|job|application|opportunity|opening|internship|"
    r"summer|fall|spring|winter|software|engineering|engineer|intern|new|grad|university|data|product|machine|learning|ai|full|backend|"
    r"frontend|thank|thanks|hello|hi|dear|update|re|fwd|action|important|reminder|interview|assessment|next)$"
)
ROLE = r"([A-Z0-9][^\n.!?;:|\"“”]{2,90}?)"
ROLE_IN_WORDS = (
    re.compile(rf"(?:for|to) (?:the |our |a |an )?(?:position|role|opening) (?:of |as |: ?)(?:the |a |an )?{ROLE}(?= (?:at|with|here|in our|on our)\b|[\n.!?,;]|$)"),
    re.compile(rf"(?:for|to) (?:the |our |a |an )?{ROLE} (?:position|role|opening|opportunity|job|vacancy|posting)\b"),
    re.compile(rf"(?:application|applying|applied|apply|candidacy|interest)(?: \w+){{0,2}} (?:for|to|in) (?:the |our |a |an )?{ROLE}(?= (?:at|with|here)\b|[\n.!?,;]|$)"),
    re.compile(rf"(?:position|role|job title|job|requisition|title)\s*[:\-]\s*{ROLE}(?=[\n.!?,;]|$)"),
    re.compile(rf"(?:application|applied)[^\n:\-|]{{0,30}}[:\-|] ?{ROLE}(?= (?:at|with|-|\|)\b|[\n.!?,;]|$)"),
)
ROLE_WORD = re.compile(
    r"(?i)\b(?:engineer\w*|developer|intern\w*|co-?op|scientist|analyst|designer|manager|associate|specialist|researcher|architect|programmer|"
    r"consultant|technician|administrator|swe|sde|sre|devops|software|data|machine learning|ml|ai|product|program|fellow|apprentice|trainee|"
    r"graduate|new grad|student|assistant|coordinator|lead|director|officer|representative|advisor)\b"
)


def _clean_company(name: str) -> str:
    name = " ".join(name.replace("’", "'").split()).strip(" .,-|:'\"")
    name = COMPANY_STOP.sub("", name).strip(" .,-|:'\"")
    name = re.sub(r"(?i),? (?:inc|llc|ltd|corp|corporation|co|gmbh|plc|s\.a\.|pbc|l\.p\.)\.?$", "", name).strip(" .,-")
    if len(name) < 2 or NOT_A_COMPANY.match(name) or all(NOT_A_COMPANY.match(word) for word in name.split()):
        return ""
    return name[:60]


def _from_sender_name(name: str) -> str:
    name = SENDER_HEAD.sub("", name.strip(" \"'"))
    before = None
    while before != name:
        before, name = name, SENDER_TAIL.sub("", name).strip(" \"'")
    # "Ada from Stripe", "Stripe via Greenhouse".
    said = re.search(r"(?i)\b(?:from|at|@)\s+(.+)$", name)
    if said:
        name = said.group(1)
    if not name or GENERIC.match(name) or "@" in name:
        return ""
    return _clean_company(name)


def _carried(host: str) -> bool:
    return any(host == carrier or host.endswith("." + carrier) for carrier in CARRIERS)


def _from_host(sender: str) -> str:
    local, _, host = sender.partition("@")
    if not host:
        return ""
    if host.endswith(("myworkday.com", "myworkdayjobs.com")) and local and not GENERIC.match(local):
        # Workday writes as <tenant>@myworkday.com.
        return _clean_company(re.sub(r"[-_.]+", " ", local).title())
    if _carried(host):
        return ""
    labels = host.split(".")
    # mail.stripe.com, careers.cisco.co.uk: the label before the public ending.
    ending = 2 if len(labels) > 2 and labels[-2] in ("co", "com", "org", "ac") and len(labels[-1]) == 2 else 1
    core = labels[-ending - 1] if len(labels) > ending else labels[0]
    return _clean_company(core.replace("-", " ").title())


def company_of(mail: Mail) -> str:
    """The employer the message is about: what its words say, then the name its sender shows, then the sender's own host."""
    host = mail.sender.partition("@")[2]
    shown = _from_sender_name(mail.sender_name)
    if shown and not _carried(host):
        return shown
    for source in (mail.subject, mail.text[:2500]):
        for pattern in COMPANY_IN_WORDS:
            for found in pattern.finditer(source):
                company = _clean_company(found.group(1))
                if company and not ROLE_WORD.search(company):
                    return company
    return shown or _from_host(mail.sender)


def role_of(mail: Mail, company: str = "") -> str:
    """The role the message names, when it names one."""
    for source in (mail.subject, mail.text[:2500]):
        for pattern in ROLE_IN_WORDS:
            for found in pattern.finditer(source):
                role = " ".join(found.group(1).split()).strip(" -,|:'\"")
                # A bracket the cut left open or closed alone goes; a whole "(Intern)" stays.
                if role.count("(") != role.count(")"):
                    role = role.strip("() ")
                role = re.sub(r"(?i)^(?:the|our|a|an|your)\s+", "", role)
                role = re.sub(r"(?i)\s+(?:position|role|opening|opportunity|job)$", "", role)
                if company and role.lower().endswith(f" at {company.lower()}"):
                    role = role[: -len(company) - 4]
                if 3 <= len(role) <= 90 and ROLE_WORD.search(role) and role.lower() != company.lower():
                    return role
    return ""


def classify(mail: Mail) -> Event | None:
    """What this message says happened, or None when it is not about an application."""
    kind = kind_of(mail.subject, mail.text)
    if not kind:
        return None
    company = company_of(mail)
    if not company:
        return None
    snippet = " ".join(mail.text.split())[:SNIPPET_CHARS]
    return Event(mail.id, mail.thread, mail.at, kind, company, role_of(mail, company), mail.sender, mail.subject, snippet)


# The applications the messages add up to.

def company_key(company: str) -> str:
    """A company under any of the ways mail writes it: "Stripe", "Stripe, Inc." and "stripe" are one."""
    key = re.sub(r"(?i)\b(?:inc|llc|ltd|corp|corporation|company|co|gmbh|plc|pbc|technologies|technology|labs|group|holdings|the)\b", " ", company.lower())
    return re.sub(r"[^a-z0-9]+", "", key) or re.sub(r"[^a-z0-9]+", "", company.lower())


def _role_key(role: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", role.lower()).strip()


def applications(events: Iterable[Event], sent_by_agent: Iterable[str] = ()) -> list[Application]:
    """One application per company and role, the newest news first. A message that names no role belongs to the company's
    application of that thread, or else to its latest one. `sent_by_agent` are the companies Agent Automation applied to."""
    agent = {company_key(name) for name in sent_by_agent if name}
    groups: dict[tuple[str, str], list[Event]] = {}
    threads: dict[tuple[str, str], tuple[str, str]] = {}
    for event in sorted(events, key=lambda item: item.at):
        company = company_key(event.company)
        role = _role_key(event.role)
        key = (company, role)
        if key not in groups:
            same_thread = threads.get((company, event.thread))
            of_company = [known for known in groups if known[0] == company]
            if same_thread in groups:
                key = same_thread
            elif not role and of_company:
                key = of_company[-1]
            elif role and (company, "") in groups:
                # The application was known without its role until this message named it.
                groups[key] = groups.pop((company, ""))
                threads.update({thread: key for thread, known in threads.items() if known == (company, "")})
        groups.setdefault(key, []).append(event)
        threads[(company, event.thread)] = key
    found = []
    for (company, _), items in groups.items():
        last = items[-1]
        rejected = [item for item in items if item.kind == "rejected"]
        furthest = max((item for item in items if item.kind != "rejected"), key=lambda item: (RANK[item.kind], item.at), default=None)
        # An offer after a no is the news; a no after anything else ends it.
        status = "rejected" if rejected and (furthest is None or furthest.kind != "offer" or rejected[-1].at > furthest.at) else furthest.kind
        named = max(items, key=lambda item: (len(item.role) > 0, item.at))
        found.append(Application(
            company=max((item.company for item in items), key=len), role=named.role, status=status, applied_at=items[0].at, updated_at=last.at,
            subject=last.subject, mails=len(items), by_agent=company in agent,
        ))
    return sorted(found, key=lambda item: item.updated_at, reverse=True)


def relabel(event: Event, company: str = "", role: str = "") -> Event:
    """The same event under a name the person corrected."""
    return replace(event, company=company or event.company, role=role or event.role)

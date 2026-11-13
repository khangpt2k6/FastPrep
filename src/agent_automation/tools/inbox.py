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
# The version of the rules below. A sync under another version reads the mailbox again from the start.
RULES = 3

# What Gmail is asked for: mail that speaks of an application, not chats, spam or what the person sent. A calendar
# booking for a first call says none of the usual words, only "appointment booked" or "meet and greet" and the role.
QUERY = (
    "newer_than:{days}d -in:chats -in:spam -in:trash -from:me "
    '{{application applying applied candidacy interview assessment "coding challenge" "next steps" "offer letter" '
    '"appointment booked" "meet and greet" "meet & greet" "intern role" "internship role" "phone screen"}}'
)

# The stages, the furthest last. A rejection, or the person's own withdrawal, ends an application whatever came before it.
KINDS = ("applied", "assessment", "interview", "offer", "rejected", "withdrawn")
RANK = {"applied": 1, "assessment": 2, "interview": 3, "offer": 4}
STATUS_WORDS = {"applied": "Applied", "assessment": "Assessment", "interview": "Interview", "offer": "Offer", "rejected": "Rejected", "withdrawn": "Withdrawn"}
# The kinds that end an application.
CLOSED = ("rejected", "withdrawn")


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
    # Sent to a list: a newsletter, a digest, a forum's notice. Its headers say so, whatever its words claim.
    bulk: bool = False


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
        text=_text(message), bulk=_bulk(message),
    )


def _bulk(message: EmailMessage) -> bool:
    precedence = str(message.get("Precedence") or "").strip().lower()
    return bool(message.get("List-Unsubscribe") or message.get("List-Id")) or precedence in ("bulk", "list", "junk")


def _text(message: EmailMessage) -> str:
    """The message in plain words. A message cut short at MESSAGE_BYTES may end mid-part: what could be read is kept."""
    try:
        body = message.get_body(preferencelist=("plain", "html"))
        content = body.get_content() if body is not None else ""
    except Exception:  # noqa: BLE001  A broken part: the subject and the sender still say what the message is.
        return ""
    if not isinstance(content, str):
        return ""
    # Some senders put a whole page in the part they call plain text.
    if (body is not None and body.get_content_subtype() == "html") or re.match(r"(?is)\s*<(?:!doctype|html|body|div|p|table)\b", content):
        content = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", content)
        content = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", content)
        content = html.unescape(re.sub(r"<[^>]+>", " ", content))
    lines = (" ".join(line.split()) for line in content.replace("\u200c", "").replace("\xa0", " ").splitlines())
    return "\n".join(line for line in lines if line)[:8000]


# What a message says.

def _any(*phrases: str) -> re.Pattern[str]:
    return re.compile("|".join(phrases), re.IGNORECASE)


# Senders that talk about jobs and are never an employer's answer: forums, course sites, digests, mail trackers.
FORUMS = (
    "redditmail.com", "reddit.com", "leetcode.com", "codeforces.com", "medium.com", "substack.com", "quora.com", "glassdoor.com", "naukri.com",
    "mailsuite.com", "coursera.org", "github.com", "algora.io", "tryexponent.com", "euron.one", "educative.io", "codingninjas.com", "fastprep.io",
    "hellointerview.com", "algo.monster", "resumeworded.com", "codecademy.com", "udemy.com", "edx.org", "kaggle.com", "devpost.com", "meetup.com",
    "eventbrite.com", "discord.com", "youtube.com", "facebookmail.com", "twitter.com", "x.com", "interviewing.io", "pramp.com", "neetcode.io",
)
# A subject that speaks of jobs and is no answer to an application.
NOISE = _any(
    r"job alert", r"jobs? (?:you may|you might|for you|matching|recommended|based on)", r"new jobs?\b", r"recommended jobs", r"\bnewsletter\b",
    r"\bwebinar\b", r"\bdigest\b", r"\bweekly\b", r"apply now\b", r"is hiring\b", r"are hiring\b", r"your (?:weekly|daily|monthly) ",
    r"finish (?:your|the) application", r"complete your application", r"confirm your application", r"application is incomplete",
    r"don't forget to apply", r"verification code", r"verify your (?:email|account)", r"confirm your email", r"reset your password",
    r"password reset", r"security code", r"one[- ]time (?:pass|code)", r"applications? (?:are|is) (?:now )?open", r"register now", r"\bregistration\b",
    r"career opportunities", r"campus events?", r"^cancel(?:l)?ed event", r"\bpromo\b", r"\(up to \$?\d+k", r"\bsale\b", r"% off\b", r"\bdiscount\b",
    r"\bfree\b.{0,30}\boffer\b", r"\boffer\b.{0,30}\b(?:inside|ends|expires)\b", r"claim your", r"pre-?order", r"\bworkshop\b",
    r"you(?:'|’)re registered", r"mock interview", r"interview prep", r"^how to\b", r"\btips\b", r"has been paused",
    r"behaviou?ral interview", r"has been deleted", r"log-?in code", r"\bfeedback\b", r"\bsurvey\b",
)
# Without one of these words anywhere, a message is not about work at all.
JOB = _any(
    r"\b(?:position|role|job|career|recruit\w*|hiring|intern|interns|internship|candidate|candidacy|resume|résumé|talent|opening|requisition|co-?op|"
    r"employment|applicant|interview|assessment|recruiter)s?\b", r"\byour (?:job )?application\b", r"\bappl(?:ying|ied)\b", r"\bphone screen\b",
)
WITHDRAWN = _any(
    r"withdr[ae]wn? your .{0,40}application", r"application (?:has been |was |is )?withdrawn", r"you(?:'ve|’ve| have) withdrawn", r"withdrawal of your application",
)
OFFER = _any(
    r"offer letter", r"pleased to (?:offer|extend)", r"(?:excited|delighted|happy|thrilled) to (?:offer|extend)", r"extend(?:ing)? (?:you )?an offer",
    r"offer of employment", r"your offer from", r"congratulations.{0,60}\boffer\b",
)
NO_OFFER = _any(r"unable to (?:offer|extend)", r"not (?:be )?(?:able to |in a position to )?(?:offer|extend)", r"cannot offer", r"won't be (?:making|extending)")
REJECTED = _any(
    r"not (?:be )?(?:moving|proceeding|going|progressing) forward", r"not to (?:move|proceed|go|progress) forward",
    r"(?:move|moving|proceed|proceeding|moved|progress|progressing|continue|continuing) (?:forward |ahead )?with (?:other|another|different)",
    r"pursue other (?:candidates|applicants)", r"other (?:candidates|applicants) (?:whose|who|that)", r"not (?:been )?selected",
    r"will not be (?:moving|proceeding|advancing|considered|progressing)", r"won't be (?:moving|proceeding|advancing|progressing)",
    r"no longer (?:under consideration|being considered)", r"position has (?:been|already been) filled", r"decided not to (?:move|proceed|progress)",
    r"regret to inform", r"we regret", r"unable to (?:offer|move|proceed|advance|progress)", r"not (?:a|the right) (?:match|fit) (?:for|at) this time",
    r"(?:unfortunately|regrettably).{0,200}(?:not|unable|other candidates|another candidate)",
    r"decided to (?:move|go|proceed|progress) (?:forward |ahead )?(?:with|in) (?:other|another|a different)",
    r"positions? ha(?:s|ve) (?:now |already )?been filled", r"no longer (?:hiring|recruiting|accepting applications) for",
    r"(?:weren't|wasn't|were not|was not|aren't|are not|didn't|did not) (?:able to|have enough) (?:move|offer|proceed|advance|\w+ bandwidth)",
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
    r"\bsuperday\b", r"\bcalendly\.com\b", r"\bgoodtime\.io\b", r"meet (?:and|&) greet", r"(?:like|love) to connect\b",
)
APPLIED = _any(
    r"thank(?:s| you) for (?:applying|your application|your interest|submitting|taking the time to apply)", r"thank(?:s| you) from\b",
    r"application (?:has been |was |is )?(?:received|submitted|sent|complete)", r"(?:received|got|have) your (?:\w+ )?application", r"application confirmation",
    r"successfully (?:applied|submitted)", r"your (?:\w+ ){0,3}application\b", r"application (?:status|update)", r"application was sent to",
    r"reviewing your (?:application|resume|qualifications)", r"(?:regarding|update on|information about) (?:your|the) ",
)
# What a subject alone may say; in a text the same words are too common to count.
SUBJECT_ASSESSMENT = _any(ASSESSMENT.pattern, r"\bassessments?\b")
SUBJECT_INTERVIEW = _any(INTERVIEW.pattern, r"\binterview\b", r"availability request", r"let(?:'|’)s chat")
# The words of a receipt, in a text: narrower than a subject's, since any text may say "your application".
APPLIED_TEXT = _any(
    r"thank(?:s| you) for (?:applying|your application|submitting your application|taking the time to apply|your interest in)",
    r"(?:received|reviewing|review) your application", r"your application (?:has been|was) (?:received|submitted)",
    r"successfully (?:applied|submitted your application)", r"application was sent to",
)
# Words in a receipt that only say what could come next: they are no invitation, and no refusal.
CONDITIONAL = _any(
    r"\bif (?:you|your|we|there|selected|chosen|it|our|a|an|the)\b", r"should (?:your|we|you)\b", r"in the event", r"\bwhether\b",
    r"may (?:be )?(?:contact|reach|invite)", r"will (?:be in touch|contact you|reach out) (?:if|should)", r"only (?:those|candidates|applicants)",
    r"\bonce we\b", r"as soon as\b",
)


def _sentences(text: str) -> list[str]:
    return [part for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def _strong(pattern: re.Pattern[str], text: str) -> bool:
    """True when a sentence of the text says it and is not a sentence about what may come."""
    return any(pattern.search(sentence) and not CONDITIONAL.search(sentence) for sentence in _sentences(text))


def _subject_kind(subject: str, bulk: bool = False) -> str:
    """What the subject alone says. Of mail sent to a list, the bare words "interview" or "assessment" say nothing: an
    article is about them too."""
    if WITHDRAWN.search(subject):
        return "withdrawn"
    if REJECTED.search(subject):
        return "rejected"
    if OFFER.search(subject) and not NO_OFFER.search(subject):
        return "offer"
    if (ASSESSMENT if bulk else SUBJECT_ASSESSMENT).search(subject):
        return "assessment"
    if (INTERVIEW if bulk else SUBJECT_INTERVIEW).search(subject):
        return "interview"
    if APPLIED.search(subject):
        return "applied"
    return ""


def kind_of(subject: str, text: str, bulk: bool = False) -> str:
    """What the message is about, or empty when it is no answer to an application.

    The subject speaks first: an invitation, a test or an offer named there is that, whatever the text goes on to say. A
    subject that reads as a receipt or an update is one, unless its text refuses or withdraws: most refusals come under
    "Thank you for your interest". A subject that says nothing leaves it to the text. Mail sent to a list counts only
    by its subject."""
    if NOISE.search(subject) or not JOB.search(f"{subject}\n{text}"):
        return ""
    said = _subject_kind(subject, bulk)
    if said and said != "applied":
        return said
    if bulk and not said:
        return ""
    if _strong(WITHDRAWN, text):
        return "withdrawn"
    if _strong(REJECTED, text):
        return "rejected"
    if said:
        return said
    if _strong(OFFER, text) and not NO_OFFER.search(text):
        return "offer"
    if _strong(INTERVIEW, text):
        return "interview"
    if _strong(ASSESSMENT, text):
        return "assessment"
    return "applied" if APPLIED_TEXT.search(text) else ""


# Who it is from, and for which role.

# Hosts that send for many employers: the company is in the name the sender shows, or in the words.
CARRIERS = (
    "greenhouse.io", "greenhouse-mail.io", "greenhouse-jobs.com", "lever.co", "ashbyhq.com", "myworkday.com", "myworkdayjobs.com", "workday.com",
    "smartrecruiters.com", "icims.com", "jobvite.com", "workablemail.com", "workable.com", "bamboohr.com", "recruitee.com", "teamtailor.com",
    "breezy.hr", "jazzhr.com", "applytojob.com", "taleo.net", "oraclecloud.com", "successfactors.com", "successfactors.eu", "paylocity.com",
    "paycomonline.net", "paycomonline.com", "adp.com", "ultipro.com", "ukg.com", "dayforcehcm.com", "personio.com", "rippling.com", "gem.com",
    "pinpointhq.com", "tal.net", "avature.net", "jobs2web.com", "eightfold.ai", "phenompeople.com", "brassring.com", "linkedin.com", "indeed.com",
    "indeedemail.com", "ziprecruiter.com", "wellfound.com", "handshake.com", "joinhandshake.com", "simplify.jobs", "jobright.ai",
    "hackerrank.com", "hackerrankforwork.com", "codesignal.com", "codility.com", "hirevue.com", "karat.io", "karat.com", "calendly.com",
    "goodtime.io", "ycombinator.com", "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
)
# Carriers that write as <employer>@carrier.
LOCAL_TENANTS = ("myworkday.com", "myworkdayjobs.com", "icims.com", "successfactors.com", "successfactors.eu")
# A label of a host, or the name before the @, that names no employer.
PLAIN_LABEL = re.compile(
    r"(?i)^(?:us|eu|uk|na|mail|email|e|m|mg|hire|app|ats|candidates?|talent|appreview|notifications?|careers?|jobs?|www|bounce|send|msg\w*|"
    r"no-?reply|do-?not-?reply|donotreply|noreply|recruiting|recruitment|info|admin|system|support|interviews?|campuscareers|careerhub|exchange|"
    r"news|marketing|updates?|hello|team|hr|\d+)$"
)
# Names a sender shows that are no company's.
GENERIC = re.compile(
    r"(?i)^(?:no[-_ .]?reply|do[-_ ]?not[-_ ]?reply|notifications?|recruiting|recruitment|recruiter|careers?|jobs?|talent(?: acquisition)?|"
    r"hiring(?: team)?|human resources|hr|people(?: team| ops| operations)?|team|admin|info|support|workday|greenhouse|lever|ashby|icims|"
    r"smartrecruiters|linkedin|indeed|handshake|hackerrank|hirevue|y combinator|work at a startup|applications?|candidates?|system(?: administrator)?|mailer|hello|hi)$"
)
SENDER_TAIL = re.compile(
    r"(?i)[\s,|@:-]*\b(?:recruiting|recruitment|recruiters?|careers?|jobs|talent acquisition|talent|hiring team|hiring|human resources|hr|"
    r"people team|people operations|people|team|university|campus|early careers?|notifications?|assessments?|no[-_ ]?reply|do[-_ ]?not[-_ ]?reply|"
    r"via .*)\s*$"
)
SENDER_HEAD = re.compile(r"(?i)^(?:the\s+)?(?:team at|careers at|recruiting at|talent at|jobs at|hiring at|do[-_ ]?not[-_ ]?reply|no[-_ ]?reply)\s+")
# A name as mail writes it: capitalised words, with "of" or "&" between them, as in Bank of America.
COMPANY = r"([A-Z0-9][\w&.'’+-]*(?:[ ](?:(?:of|&)[ ])?[A-Z0-9][\w&.'’+-]*){0,4})"
COMPANY_IN_SUBJECT = (
    re.compile(rf"\bat {COMPANY}\s*[!.]?$"),
    re.compile(rf"(?:applying|applied|application|apply|interest|interview|steps|update|you|opportunity|opportunities|career) (?:to|with|from|in|at)(?: joining| the)? {COMPANY}"),
    re.compile(rf"application (?:for|to|with|at) {COMPANY} [-–|:]"),
    re.compile(rf"(?:^|\| ){COMPANY}(?= \| |: | [-–] |$)"),
    re.compile(rf"\b{COMPANY} (?:job |candidate |internship )?(?:application|interview|assessment|recruiting)\b"),
    re.compile(rf"[-–|] {COMPANY}\s*$"),
    re.compile(rf"\b(?:from|with|at|to) {COMPANY}\b"),
)
COMPANY_IN_TEXT = (
    re.compile(rf"(?:applying|applied|application|apply)\b(?: (?:to|at|with)(?: the)?| for (?:a |an |the )?(?:[\w/&,+.()-]+ ){{1,10}}?(?:at|with)) {COMPANY}"),
    re.compile(rf"(?:interest|interested) in (?:joining |working (?:at|with|for) |a career (?:at|with) |employment (?:at|with) |opportunities (?:at|with) )?{COMPANY}"),
    re.compile(rf"(?:position|role|opening|opportunity|job|career|internship|co-op)s? (?:at|with) {COMPANY}"),
    re.compile(rf"application was sent to {COMPANY}"),
    re.compile(rf"\b{COMPANY} (?:has|have) invited you"),
    re.compile(rf"(?:on behalf of|here at|team at|joining) {COMPANY}"),
    re.compile(rf"\b{COMPANY} (?:Recruiting|Talent|Careers|Hiring) (?:Team|Acquisition)\b"),
)
# A word that ends a company's name when the pattern ran on into the sentence.
COMPANY_STOP = re.compile(
    r"(?i)\s+(?:and|for|as|in|on|is|has|have|was|we|our|the|your|you|to|with|at|careers?|recruiting|recruitment|team|application|applications|"
    r"position|role|internship|intern|opening|opportunity|job|thank|thanks|please|will|would|but|so|this|that|if|because|since|regarding|re|"
    r"candidate|interview|assessment|update|status|talent|campus|event|recruiter|securities quantitative|quantitative)\b.*$"
)
NOT_A_COMPANY = re.compile(
    r"(?i)^(?:the|a|an|our|this|that|your|you|we|us|it|its|their|team|company|position|role|job|application|opportunity|opening|internship|"
    r"summer|fall|spring|winter|software|engineering|engineer|intern|new|grad|university|data|product|machine|learning|ai|full|backend|"
    r"frontend|thank|thanks|hello|hi|dear|update|re|fwd|fw|action|required|important|reminder|interview|assessment|next|steps|follow-up|"
    r"entry-level|talent|recruiting|careers?|campus|greetings|invitation|response|information|status|regarding|hackerrank|hirevue|ext|"
    r"received|submitted|confirmation|complete|completed|video|form|request|event|ready|invited|position)$"
)
# A word no employer's name ends with, where a pattern took the start of a phrase for a name: "Application Received".
NOT_A_LAST_WORD = re.compile(
    r"(?i)^(?:talent|recruiting|careers?|campus|team|application|update|status|received|submitted|confirmation|complete|completed|video|form|"
    r"request|event|ready|invited|position|required|invitation|response|information|steps|the|your|our|a|an|interview|assessment|internship|intern)$"
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
ROLE_NOUN = re.compile(
    r"(?i)\b(?:engineers?|developers?|intern|interns|internships?|co-?op|scientists?|analysts?|designers?|managers?|associates?|specialists?|"
    r"researchers?|programmers?|trainees?|graduates?|students?)\b"
)
# Where a role's words ran on into the sentence after it.
ROLE_STOP = re.compile(r"\s+(?:and|or|but|as|so|because|has|have|is|was|will|we|you|at|with)\s+[a-z].*$")
GREETING = re.compile(r"(?m)^(?:Hi|Hello|Dear|Hey|Greetings)[ ,]+([A-Z][\w'’-]+(?: [A-Z][\w'’-]+){0,3})\s*[,!:.]?\s*$")


def _letters(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _clean_company(name: str) -> str:
    name = " ".join(name.replace("’", "'").split()).strip(" .,-|:'\"!")
    name = re.sub(r"(?i)^(?:your|the team at|team)\s+", "", name)
    # A sentence's end inside the match: "Dorsia. After". The dots of "D. E. Shaw" are not ends.
    name = re.sub(r"(?<=\w{3})\.\s.*$", "", name)
    name = COMPANY_STOP.sub("", name).strip(" .,-|:'\"!")
    name = re.sub(r"'s$", "", name)
    name = re.sub(r"(?i),? (?:inc|llc|ltd|corp|corporation|co|gmbh|plc|s\.a\.|pbc|l\.p\.)\.?$", "", name).strip(" .,-")
    words = name.split()
    if len(name) < 2 or not words or all(NOT_A_COMPANY.match(word) for word in words) or NOT_A_LAST_WORD.match(words[-1]):
        return ""
    # A year or a job's own noun: a role's words, not an employer's. "Beacon Software" is an employer.
    if re.search(r"\b(?:19|20)\d\d\b", name) or ROLE_NOUN.search(name):
        return ""
    return name[:60]


def _own_names(mail: Mail, me: str) -> set[str]:
    """The person's own names: what they are called in the greeting, and what the caller knows."""
    names = {_letters(word) for word in me.split()}
    for found in GREETING.finditer(mail.text[:400]):
        names.update(_letters(word) for word in found.group(1).split())
    return {name for name in names if name}


def _is_person(name: str, local: str) -> bool:
    """A sender who shows their own name: hdean@ is Holly Dean, not a company."""
    words = [_letters(word) for word in re.sub(r"\[.*?\]|\(.*?\)", " ", name).split()]
    words = [word for word in words if word]
    local = _letters(local.partition("+")[0])
    if not 2 <= len(words) <= 4 or not local:
        return False
    first, last = words[0], words[-1]
    return last in local or (len(first) > 2 and first in local) or local == first[0] + last


def _shown_company(mail: Mail) -> str:
    name = mail.sender_name.strip(" \"'")
    # "Ada Rossi [Acme Corporation]".
    bracket = re.search(r"\[([^\]]{3,})\]", name)
    if bracket and not re.fullmatch(r"(?i)ext(?:ernal)?", bracket.group(1).strip()):
        return _clean_company(bracket.group(1))
    name = re.sub(r"\[.*?\]", " ", name).strip()
    if _is_person(name, mail.sender.partition("@")[0]):
        return ""
    name = SENDER_HEAD.sub("", name)
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


def _host_core(host: str) -> str:
    """mail.stripe.com, careers.cisco.co.uk, hrt.careers: the label before the public ending."""
    labels = host.split(".")
    ending = 2 if len(labels) > 2 and labels[-2] in ("co", "com", "org", "ac") and len(labels[-1]) == 2 else 1
    return labels[-ending - 1] if len(labels) > ending else labels[0]


def _tenant(sender: str) -> str:
    """The employer a carrier writes for, when its address says so: cisco@myworkday.com, noreply@acme.tal.net."""
    local, _, host = sender.partition("@")
    carrier = next((name for name in CARRIERS if host == name or host.endswith("." + name)), "")
    if not carrier:
        return ""
    if carrier in LOCAL_TENANTS:
        local = re.sub(r"(?i)(?:do[-_]?not[-_]?reply|no[-_]?reply|autoreply)", "", local.partition("+")[0]).strip("-_.")
        if local and not PLAIN_LABEL.match(local):
            return _letters(local)
    before = host[: -len(carrier)].strip(".").split(".")
    label = before[-1] if before and before[-1] else ""
    return "" if not label or PLAIN_LABEL.match(label) else _letters(label)


def _spelled(core: str, text: str) -> str:
    """The name as the message writes it, for a name known only run together: morganstanley is "Morgan Stanley"."""
    if len(core) < 3:
        return ""
    words = list(re.finditer(r"[A-Za-z0-9][\w&'’]*", text))
    for start, first in enumerate(words):
        joined = ""
        for end in range(start, min(start + 5, len(words))):
            joined += _letters(words[end].group())
            if not core.startswith(joined):
                break
            if joined == core:
                found = text[first.start() : words[end].end()]
                before, after = text[max(0, first.start() - 1) : first.start()], text[words[end].end() : words[end].end() + 2]
                # Written as a name in a sentence: not a link's or an address's part, which says nothing of the spelling.
                in_address = before in ("@", "/", ".") or re.match(r"\.[a-z]", after) is not None
                if "\n" not in found and not in_address and any(char.isupper() for char in found):
                    return " ".join(found.split())
                break
    return ""


def _agrees(candidate: str, core: str) -> bool:
    """Whether a name read from the words is the sender's own: Notion and makenotion, D. E. Shaw and deshaw, HRT and hrt."""
    name = _letters(candidate)
    if len(name) < 3 or len(core) < 3:
        return len(name) > 1 and name == core
    initials = "".join(word[0] for word in re.findall(r"[A-Za-z0-9]+", candidate)).lower()
    first = _letters(candidate.split()[0])
    return name in core or core in name or initials == core or (len(first) > 3 and core.startswith(first))


def _in_words(mail: Mail, own: set[str], subject_only: bool = False, sure: bool = False) -> list[str]:
    """The names the words give, the subject's first. `sure` leaves out the subject's last pattern, a bare "with X" or
    "to X", which is as often a verb as a name."""
    found: list[str] = []
    sources = [(mail.subject, COMPANY_IN_SUBJECT[:-1] if sure else COMPANY_IN_SUBJECT)] + ([] if subject_only else [(mail.text[:2500], COMPANY_IN_TEXT)])
    for source, patterns in sources:
        for pattern in patterns:
            for match in pattern.finditer(source):
                company = _clean_company(match.group(1))
                if company and company not in found and not all(_letters(word) in own for word in company.split()):
                    found.append(company)
    return found


def company_of(mail: Mail, me: str = "") -> str:
    """The employer the message is about.

    A message from an employer's own address is that employer's: of the names its words and its sender give, the one
    that is the address's own, else the address's name as the message spells it. A message a carrier sends for an
    employer names it in its address when it can, then in its subject, then in the name the sender shows."""
    host = mail.sender.partition("@")[2]
    own = _own_names(mail, me)
    shown = _shown_company(mail)
    if shown and all(_letters(word) in own for word in shown.split()):
        shown = ""
    words = _in_words(mail, own)
    in_subject = _in_words(mail, own, subject_only=True, sure=True)
    read = f"{mail.subject}\n{mail.text[:3000]}"
    carried = _carried(host)
    core = _tenant(mail.sender) if carried else _letters(_host_core(host))
    if core:
        # The address's own name: as the sender shows it, else the plainest the words give ("HubSpot", not "HubSpot
        # Recruiter Zoom"), else the address's name as the message spells it.
        if shown and _agrees(shown, core):
            return shown
        own_names = [name for name in words if _agrees(name, core)]
        if own_names:
            return min(own_names, key=lambda name: abs(len(_letters(name)) - len(core)))
        spelled = _spelled(core, read)
        if spelled:
            return spelled
    if carried:
        if shown and (not in_subject or _letters(shown) in _letters(read)):
            return shown
        return next(iter(in_subject), "") or shown or next(iter(words), "") or _named(core)
    return shown or next(iter(in_subject), "") or _named(core)


def _named(core: str) -> str:
    """A name known only from an address: IMC, Stripe."""
    return _clean_company(core.upper() if len(core) <= 3 else core.title()) if core else ""


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
                # "Citadel's Software Engineer": whose role it is, is the company.
                role = re.sub(r"^[\w .&-]{2,40}?['’]s\s+", "", role)
                role = ROLE_STOP.sub("", role)
                role = re.sub(r"(?i)\s+(?:position|role|opening|opportunity|job)$", "", role).strip(" -,|:'\"")
                if company and role.lower().endswith(f" at {company.lower()}"):
                    role = role[: -len(company) - 4]
                if company and role.lower().startswith(company.lower()):
                    continue
                if 3 <= len(role) <= 90 and ROLE_WORD.search(role) and role.lower() != company.lower():
                    return role
    return ""


def classify(mail: Mail, me: str = "") -> Event | None:
    """What this message says happened, or None when it is not about an application. `me` is the person's own name,
    which is never a company's."""
    host = mail.sender.partition("@")[2]
    if any(host == forum or host.endswith("." + forum) for forum in FORUMS):
        return None
    kind = kind_of(mail.subject, mail.text, mail.bulk and not _tenant(mail.sender))
    if not kind:
        return None
    company = company_of(mail, me)
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
    application of that thread, or else to its latest one still open. `sent_by_agent` are the companies Agent Automation
    applied to."""
    agent = {company_key(name) for name in sent_by_agent if name}
    groups: dict[tuple[str, str], list[Event]] = {}
    threads: dict[tuple[str, str], tuple[str, str]] = {}
    for event in sorted(events, key=lambda item: item.at):
        company = company_key(event.company)
        # "IMC" and "IMC Trading", "Citadel" and "Citadel Securities": the same employer, written short and long.
        company = next((known for known, _ in groups if len(min(known, company, key=len)) > 2 and (known.startswith(company) or company.startswith(known))), company)
        role = _role_key(event.role)
        key = (company, role)
        if key not in groups:
            same_thread = threads.get((company, event.thread))
            of_company = [known for known in groups if known[0] == company]
            still_open = [known for known in of_company if not any(item.kind in CLOSED for item in groups[known])]
            if not role and same_thread in groups:
                key = same_thread
            elif not role and (still_open or (of_company and event.kind in CLOSED)):
                key = (still_open or of_company)[-1]
            elif not role and of_company:
                # News after every application there was closed is about another one: an invitation does not reopen a no.
                key = (company, f"after {event.mail_id}")
            elif role and (company, "") in groups:
                # The application was known without its role until this message named it.
                groups[key] = groups.pop((company, ""))
                threads.update({thread: key for thread, known in threads.items() if known == (company, "")})
        groups.setdefault(key, []).append(event)
        threads[(company, event.thread)] = key
    found = []
    for (company, _), items in groups.items():
        last = items[-1]
        closed = [item for item in items if item.kind in CLOSED]
        furthest = max((item for item in items if item.kind not in CLOSED), key=lambda item: (RANK[item.kind], item.at), default=None)
        # An offer after a no is the news; a no, or a withdrawal, after anything else ends it.
        ended = closed and (furthest is None or furthest.kind != "offer" or closed[-1].at > furthest.at)
        named = max(items, key=lambda item: (len(item.role) > 0, item.at))
        # The message that says where it stands: its subject is what the person reads beside the status.
        deciding = closed[-1] if ended else furthest
        found.append(Application(
            company=min((item.company for item in items), key=len), role=named.role, status=deciding.kind,
            applied_at=items[0].at, updated_at=last.at, subject=deciding.subject, mails=len(items), by_agent=company in agent,
        ))
    return sorted(found, key=lambda item: item.updated_at, reverse=True)


def relabel(event: Event, company: str = "", role: str = "") -> Event:
    """The same event under a name the person corrected."""
    return replace(event, company=company or event.company, role=role or event.role)

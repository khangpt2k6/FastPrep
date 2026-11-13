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
from itertools import combinations

HOST = "imap.gmail.com"
PORT = 993
ADDRESS_ENV = "GMAIL_ADDRESS"
PASSWORD_ENV = "GMAIL_APP_PASSWORD"
PASSWORD_URL = "https://myaccount.google.com/apppasswords"
# A year back: a refusal in the autumn answers a receipt of the winter before, and the receipt is what dates an application.
DEFAULT_DAYS = 365
# The start of each message is enough to tell what it is; a long newsletter is not read to its end.
MESSAGE_BYTES = 60_000
BATCH = 40
SNIPPET_CHARS = 220
# The version of the rules below. A sync under another version reads the mailbox again from the start.
RULES = 5

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
    # False when no receipt was read: `applied_at` is then only the first mail about it, often the refusal itself.
    applied_known: bool = True
    # The employer's own site, as the addresses of its mail show it: "stripe.com". Empty when every mail came through a
    # carrier. The dashboard finds the company's logo by it.
    domain: str = ""


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
    # A plain part with a page's leftovers in it: "&nbsp;", "&amp;".
    content = re.sub(r"&nbsp;?", " ", content).replace("&amp;", "&")
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
    r"behaviou?ral interview", r"has been deleted", r"log-?in code", r"\bfeedback\b", r"\bsurvey\b", r"join our (?:\w+ )?community",
    r"sign-?in link", r"^incomplete application", r"verify your (?:\w+ )?application", r"premium benefits", r"application deadline",
    r"submit your (?:\w+ )?application", r"incomplete applications?", r"started your (?:job )?application", r"\bstill (?:looking|interested)\b",
    r"thanks for filling out",
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
    r"positions? ha(?:s|ve) (?:now |already |just |since )?been filled", r"no longer (?:hiring|recruiting|accepting applications) for",
    r"(?:weren't|wasn't|were not|was not|aren't|are not|didn't|did not) (?:able to|have enough) (?:move|offer|proceed|advance|\w+ bandwidth)",
    r"(?:don't|don’t|do not) have a (?:match|fit|role|position|opening)\b", r"extend(?:ed)? an offer to another candidate",
    r"no longer (?:be )?(?:actively )?(?:hiring|recruiting|accepting|taking|considering|available)\b",
    r"(?:decision|decided) (?:not to|to not) (?:move|proceed|progress|continue)", r"(?:found|selected|identified) a finalist", r"concluding our search",
    r"(?:aren't|isn't|weren't|won't be) (?:moving|proceeding|progressing|continuing) (?:forward|ahead|with your)",
    r"(?:will not|won't|not) be able to (?:move|continue|proceed|advance|progress)\b", r"\bmade a hire\b",
    r"(?:will not|won't) (?:proceed|move forward|continue|progress) with your (?:candidacy|application)",
    r"(?:roles?|positions?|program|opening|requisition)(?: you applied (?:to|for))? ha(?:s|ve) (?:now |already |just |since |recently )?been (?:filled|closed)",
    r"(?:have|has|'ve) (?:now |already |just |recently )?filled (?:the|this|our)\b", r"decided to close (?:the|this|our)\b",
    r"(?:move|moving|proceed|proceeding) (?:forward |ahead )?with (?:a pool of |a group of )?candidates (?:who|whose)",
    r"(?:isn't|is not) (?:a|the right) (?:fit|match)\b", r"(?:haven't|have not|weren't|were not) been selected|weren't selected",
    r"decided not to pursue", r"not the (?:correct|right|best) (?:match|fit)\b", r"pausing (?:on )?(?:moving|hiring|recruiting)\b",
    r"not able to (?:move|offer|proceed|advance)\b",
)
# A sentence about the test's own rules, not about the application: "unfortunately, we're unable to offer retakes".
NOT_A_REFUSAL = _any(r"\bretakes?\b", r"\bextensions?\b", r"\breschedul\w+")
# The person signed up to hear of openings, and applied to none.
NOT_AN_APPLICATION = _any(
    r"\bthis is not an application\b",
    r"(?:thank(?:s| you)(?: so much)? for|you(?:'ve|’ve| have)) (?:joining|joined|signing up for|submitting your information to) (?:our |the )?(?:[\w-]+ ){0,3}talent (?:community|network)",
    r"\bwelcome to (?:our |the )?(?:[\w-]+ ){0,3}talent (?:community|network)",
)
# Paperwork for a place already given.
ONBOARDING = _any(r"\bonboarding instructions\b", r"\byour onboarding\b", r"\bnew hire (?:paperwork|orientation)\b")
# A subject about how to get ready, sent with a receipt or before a round: it invites to nothing.
GUIDE = _any(r"^(?:re: |fwd?: )*(?:prepar(?:e|ing)|get(?:ting)? ready) for\b", r"\bwhat to expect\b", r"^how to prepare\b")
# A test that was sent and is still waiting, said under a subject that reads as a receipt's or an update's.
ASSESSMENT_DUE = _any(
    r"(?:not yet|yet to|haven't|haven’t|have not) (?:yet )?(?:completed?|taken?|started|submitted|finish(?:ed)?) (?:your|the|our|an?) (?:\w+ ){0,2}(?:assessment|test|challenge)",
    r"asked you to (?:take|complete) (?:an?|the|our) (?:\w+ ){0,2}(?:test|assessment|challenge)",
    r"reminder to (?:take|complete) (?:your|the|our|an?) (?:\w+ ){0,2}(?:assessment|test|challenge)",
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
    r"(?:reply|respond) with your availability", r"(?:moving|move) forward with an? (?:\w+ ){0,2}interview",
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
    # A page turned to text breaks its lines mid-sentence: "you haven't / been selected" is one sentence.
    text = re.sub(r"(?<![.!?:;])\n(?=[a-z])", " ", text)
    return [part for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def _strong(pattern: re.Pattern[str], text: str) -> bool:
    """True when a sentence of the text says it and is not a sentence about what may come."""
    return any(pattern.search(sentence) and not CONDITIONAL.search(sentence) for sentence in _sentences(text))


def _refused(text: str) -> bool:
    """True when a sentence refuses. A plain refusal stands whatever follows it in its sentence ("we don't have a match,
    but will keep your resume if a position opens"); one read only from "unfortunately ... not" needs the whole sentence
    free of ifs, since receipts say that of what they cannot promise."""
    for sentence in _sentences(text):
        if NOT_A_REFUSAL.search(sentence):
            continue
        for hit in REJECTED.finditer(sentence):
            loose = hit.group(0).lower().startswith(("unfortunately", "regrettably"))
            if not CONDITIONAL.search(sentence if loose else sentence[: hit.start()]):
                return True
    return False


def _subject_kind(subject: str, bulk: bool = False) -> str:
    """What the subject alone says. Of mail sent to a list, the bare words "interview" or "assessment" say nothing: an
    article is about them too. Neither do they under a subject about getting ready."""
    if WITHDRAWN.search(subject):
        return "withdrawn"
    if REJECTED.search(subject):
        return "rejected"
    if OFFER.search(subject) and not NO_OFFER.search(subject):
        return "offer"
    if not bulk and ONBOARDING.search(subject):
        return "offer"
    if not GUIDE.search(subject):
        assessment = (ASSESSMENT if bulk else SUBJECT_ASSESSMENT).search(subject)
        interview = (INTERVIEW if bulk else SUBJECT_INTERVIEW).search(subject)
        # A subject that says both is what it says first: "HRT Interview - CoderPad & Zoom" is an interview held in a
        # test's tool, "Assessment before your interview" is a test.
        if assessment and interview:
            return "interview" if interview.start() < assessment.start() else "assessment"
        if assessment or interview:
            return "assessment" if assessment else "interview"
    if APPLIED.search(subject):
        return "applied"
    return ""


def kind_of(subject: str, text: str, bulk: bool = False) -> str:
    """What the message is about, or empty when it is no answer to an application.

    The subject speaks first: an invitation, a test or an offer named there is that, whatever the text goes on to say. A
    subject that reads as a receipt or an update is one, unless its text refuses or withdraws: most refusals come under
    "Thank you for your interest". A subject that says nothing leaves it to the text. Mail sent to a list counts only
    by its subject."""
    # Mail writes "won’t" as often as "won't": the rules read one.
    subject, text = subject.replace("’", "'"), text.replace("’", "'")
    if NOISE.search(subject) or not JOB.search(f"{subject}\n{text}") or NOT_AN_APPLICATION.search(text):
        return ""
    said = _subject_kind(subject, bulk)
    if said and said != "applied":
        return said
    if bulk and not said:
        return ""
    if _strong(WITHDRAWN, text):
        return "withdrawn"
    if _refused(text):
        return "rejected"
    if ASSESSMENT_DUE.search(text):
        return "assessment"
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
    "breezy-mail.com", "teamtailor-mail.com", "hirebridgemail.com", "clearcompany.com", "coderbyte.com", "sovaassessment.com", "ripplematch.com",
    "getripplematch.com", "resend.dev", "resend.com", "dover.io", "dover.com", "clinchtalent.com", "icims.eu", "brighthire.ai",
)
# Carriers that write as <employer>@carrier.
LOCAL_TENANTS = ("myworkday.com", "myworkdayjobs.com", "icims.com", "icims.eu", "successfactors.com", "successfactors.eu")
# A label of a host, or the name before the @, that names no employer.
PLAIN_LABEL = re.compile(
    r"(?i)^(?:us|eu|uk|na|mail|email|e|m|em|mg|hire|app|ats|candidates?|talent|appreview|notifications?|careers?|jobs?|www|bounce|send|msg\w*|"
    r"no-?reply|do-?not-?reply|donotreply|noreply|recruiting|recruitment|info|admin|system|support|interviews?|campuscareers|careerhub|exchange|"
    r"news|marketing|updates?|hello|team|hr|community|alerts?|messages?|workflow|ocs|onboarding|[a-z]{2}-[a-z]+-\d+|\d+)$"
)
# Names a sender shows that are no company's.
GENERIC = re.compile(
    r"(?i)^(?:no[-_ .]?reply|do[-_ ]?not[-_ ]?reply|notifications?|recruiting|recruitment|recruiter|careers?|jobs?|talent(?: acquisition)?|"
    r"hiring(?: team)?|human resources|hr|people(?: team| ops| operations)?|team|admin|info|support|workday|greenhouse|lever|ashby|icims|"
    r"smartrecruiters|linkedin|indeed|handshake|hackerrank|hirevue|y combinator|work at a startup|applications?|candidates?|system(?: administrator)?|"
    r"mailer|hello|hi|codesignal|coderbyte|codility|karat|workable|clearcompany|resend|ripplematch|hirebridge|dover|breezy|teamtailor)$"
)
SENDER_TAIL = re.compile(
    r"(?i)[\s,|@:-]*\b(?:recruiting|recruitment|recruiters?|careers?|jobs|talent acquisition|talent attraction|talent|hiring team|hiring|"
    r"human resources|hr|people team|people operations|people|team|university|campus|early careers?|notifications?|assessments?|founders|"
    r"no[-_ ]?reply|do[-_ ]?not[-_ ]?reply|workday\b.*|via .*)\s*$"
)
SENDER_HEAD = re.compile(r"(?i)^(?:the\s+)?(?:team at|careers at|recruiting at|talent at|jobs at|hiring at|do[-_ ]?not[-_ ]?reply|no[-_ ]?reply|hr)\s+")
# What an address adds to an employer's name: joinprox.com is Prox, sonyglobal is Sony.
HOST_HEAD = re.compile(r"^(?:join|get|try|use|go|hello|team|with|meet|hey|make|we|the|fly|at)(?=\w{3})")
HOST_TAIL = re.compile(r"(?<=\w{3})(?:global|group|groupe|inc|hq|careers|jobs|corp|usa|tech|labs|app|team|talent)$")
# A name as mail writes it: capitalised words, with "of" or "&" between them, as in Bank of America.
COMPANY = r"([A-Z0-9][\w&.'’+-]*(?:[ ](?:(?:of|&)[ ])?[A-Z0-9][\w&.'’+-]*){0,4})"
COMPANY_IN_SUBJECT = (
    re.compile(rf"\bat {COMPANY}(?:,? (?:Inc|LLC|Ltd|Corp|Co|PBC)\b\.?)?\s*[!.]?$"),
    re.compile(rf"(?:applying|applied|application|apply|interest|interview|steps|update|you|opportunity|opportunities|career) (?:to|with|from|in|at)(?: joining| the)? {COMPANY}"),
    re.compile(rf"application (?:for|to|with|at) {COMPANY} [-–|:]"),
    re.compile(rf"^{COMPANY} (?:has |have )?invited you\b"),
    re.compile(rf"(?:submitted|assessment|challenge|test) for {COMPANY}\s*$"),
    re.compile(rf"(?:^|\| ){COMPANY}(?= ?\||: | [-–] |$)"),
    # A calendar's invitation: "Interview with Khang - SkyTL @ Tue Jan 6".
    re.compile(rf"[-–|] {COMPANY} @ "),
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
# A subject that says outright, and says nothing else, whom the application went to: "Thank You for Applying to Epsilon!".
SUBJECT_NAMES = re.compile(r"(?:[Aa]pplying|[Aa]pplication|[Ii]nterest) (?:[Tt]o|[Ww]ith|[Ii]n|[Aa]t) ([A-Z][\w&'’-]*(?: [A-Z][\w&'’-]*){0,2})\s*[!.]?$")
# Two or three plain capitalised words: how a person's name looks, and few companies'.
PERSON = re.compile(r"[A-Z][a-z]+(?: [A-Z]\.?)?(?: [A-Z][a-z]+){1,2}")
# LinkedIn's receipt ends with the employer's whole name, small words and all: "sent to Built By The Trades".
SENT_TO = re.compile(r"application was sent to (.+?)\s*$")
# A word that ends a company's name when the pattern ran on into the sentence.
COMPANY_STOP = re.compile(
    r"(?i)\s+(?:and|for|as|in|on|is|has|have|was|we|our|the|your|you|to|with|at|careers?|recruiting|recruitment|team|application|applications|"
    r"position|role|internship|intern|opening|opportunity|job|thank|thanks|please|will|would|but|so|this|that|if|because|since|regarding|re|"
    r"candidate|interview|assessment|update|status|talent|campus|event|recruiter|securities quantitative|quantitative)\b.*$"
)
# The same for a name given whole, by a sender or at a subject's end: only what a recruiting desk adds to it is cut,
# so "Develop for Good" keeps its small words.
DESK_STOP = re.compile(
    r"(?i)\s+(?:careers?|recruiting|recruitment|team|application|applications|position|role|internship|intern|opening|opportunity|job|"
    r"candidate|interview|assessment|update|status|talent|campus|event|recruiter)\b.*$"
)
NOT_A_COMPANY = re.compile(
    r"(?i)^(?:the|a|an|our|this|that|your|you|we|us|it|its|their|team|company|position|role|job|application|opportunity|opening|internship|"
    r"summer|fall|spring|winter|software|engineering|engineer|intern|new|grad|university|data|product|machine|learning|ai|full|backend|"
    r"frontend|thank|thanks|hello|hi|dear|update|re|fwd|fw|action|required|important|reminder|interview|assessment|next|steps|follow-up|"
    r"entry-level|talent|recruiting|careers?|campus|greetings|invitation|response|information|status|regarding|hackerrank|hirevue|ext|"
    r"received|submitted|confirmation|complete|completed|video|form|request|event|ready|invited|position|schedule|scheduled|scheduling|"
    r"online|incomplete|dept|department|development|developer|program|programs|first|phone|screen|final|round|call|coderpad|zoom|teams|"
    r"codesignal|karat|codility|webex)$"
)
# A word no employer's name ends with, where a pattern took the start of a phrase for a name: "Application Received".
NOT_A_LAST_WORD = re.compile(
    r"(?i)^(?:talent|recruiting|careers?|campus|team|application|update|status|received|submitted|confirmation|complete|completed|video|form|"
    r"request|event|ready|invited|position|required|invitation|response|information|steps|the|your|our|a|an|interview|assessment|internship|intern|"
    r"up|screen|round|call)$"
)
# A title as mail writes it. What stands in brackets is one piece of it, commas and all: "(22nd June - 11th September, remote-US)".
ROLE = r"([A-Z0-9](?:\([^()\n]{1,60}\)|[^\n.!?;:|\"“”]){2,140}?)"


def _role_patterns(end: str) -> tuple[re.Pattern[str], ...]:
    """The ways mail names a role, for one reading of where a title ends."""
    return (
        re.compile(rf"(?:for|to) (?:the |our |a |an )?(?:position|role|opening) (?:of |as |: ?)(?:the |a |an )?{ROLE}(?= (?:at|with|here|in our|on our)\b|{end})"),
        re.compile(rf"(?:for|to) (?:the |our |a |an )?{ROLE} (?i:position|role|opening|opportunity|job|vacancy|posting)\b"),
        re.compile(rf"(?:application|applying|applied|apply|candidacy|interest)(?: \w+){{0,2}} (?:for|to|in) (?:the |our |a |an )?{ROLE}(?= (?:at|with|here)\b|{end})"),
        re.compile(rf"(?:position|role|job title|job|requisition|title)\s*[:\-]\s*{ROLE}(?={end})"),
        re.compile(rf"(?:application|applied)[^\n:\-|]{{0,30}}[:\-|] ?{ROLE}(?= (?:at|with|-|\|)\b|{end})"),
    )


# A comma ends a title unless the title goes on after it: "Intern, Software Engineering". Where that reading finds
# nothing (the sentence ran on too long), the title ends at its first comma.
ROLE_IN_WORDS = tuple(zip(_role_patterns(r"[\n.!?;]|,(?! ?[A-Z0-9(])|$"), _role_patterns(r"[\n.!?,;]|$"), strict=True))
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


def _clean_company(name: str, whole: bool = False) -> str:
    """A name as a pattern cut it, made a company's or nothing. `whole` is for a name given whole (by a sender, at a
    subject's end), whose small words are its own."""
    name = " ".join(name.replace("’", "'").split()).strip(" .,-|:'\"!")
    # What stands in brackets after a name is said about it: "(YC W26)", "(Do Not Reply)". A parent before a dash is
    # not the employer: "Google - Wing" is Wing.
    name = re.sub(r"\s*\([^()]*\)\s*$", "", name)
    if whole and " - " in name:
        name = name.rpartition(" - ")[2]
    name = re.sub(r"(?i)^(?:your|the team at|team)\s+", "", name)
    # A sentence's end inside the match: "Dorsia. After". The dots of "D. E. Shaw" are not ends.
    name = re.sub(r"(?<=\w{3})\.\s.*$", "", name)
    name = (DESK_STOP if whole else COMPANY_STOP).sub("", name).strip(" .,-|:'\"!")
    name = re.sub(r"'s$", "", name)
    name = re.sub(r"(?i),? (?:inc|llc|ltd|corp|corporation|co|gmbh|plc|s\.a\.|pbc|l\.p\.)\.?$", "", name).strip(" .,-")
    # A number beside the words names nothing: "Assessment 1" is no more a company than "Assessment".
    words = [word for word in name.split() if not word.isdigit() and word not in ("&", "and")]
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
    # An address or a host shown as the name ("cmu-workday andrew.cmu") is no one's name.
    if not name or GENERIC.match(name) or "@" in name or re.search(r"\w\.[a-z]{2,}\b", name):
        return ""
    if name.islower():
        # Typed into a form without its capitals: "empirical foods", "cmu".
        name = name.upper() if len(name) <= 4 else name.title()
    return _clean_company(name, whole=True)


def _carried(host: str) -> bool:
    return any(host == carrier or host.endswith("." + carrier) for carrier in CARRIERS)


def _own_domain(senders: Iterable[str]) -> str:
    """The employer's own site out of the addresses that wrote about one application: the one most of its mail came from,
    never a carrier's or a mailbox provider's. mail.stripe.com and careers.stripe.com are stripe.com."""
    counted: dict[str, int] = {}
    for sender in senders:
        host = sender.rpartition("@")[2].lower().strip(".")
        if "." not in host or _carried(host):
            continue
        labels = host.split(".")
        ending = 2 if len(labels) > 2 and labels[-2] in ("co", "com", "org", "ac") and len(labels[-1]) == 2 else 1
        site = ".".join(labels[-ending - 1 :])
        counted[site] = counted.get(site, 0) + 1
    return max(counted, key=lambda site: counted[site], default="")


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
    # admarketplace.na.teamtailor-mail.com: the nearest label that is a name and not a region or a desk.
    labels = [label for label in host[: -len(carrier)].strip(".").split(".") if label and not PLAIN_LABEL.match(label)]
    return _letters(labels[-1]) if labels else ""


def _spelled(core: str, text: str) -> str:
    """The name as the message writes it, for a name known only run together: morganstanley is "Morgan Stanley"."""
    if len(core) < 3:
        return ""
    words = list(re.finditer(r"[A-Za-z0-9][\w&'’]*", text))
    for start, first in enumerate(words):
        joined = ""
        for end in range(start, min(start + 5, len(words))):
            word = _letters(words[end].group())
            # An address cuts a last word short: bluenettech is "Bluenet Technologies".
            rest = core[len(joined) :]
            if end > start and len(rest) >= 4 and word.startswith(rest):
                word = rest
            joined += word
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


def _a_person(name: str, text: str) -> bool:
    """Whether the name a sender shows is a person's: it looks like one, and the text has it as who holds the interview
    or who signs."""
    if not PERSON.fullmatch(name):
        return False
    first = re.escape(name.split()[0])
    said = rf"(?i)(?:interviewers?(?:\(s\))?|recruiter|coordinator|regards|sincerely|thanks|thank you|best|cheers)\W{{0,4}}{re.escape(name)}"
    return re.search(said, text) is not None or re.search(rf"(?m)^{first}\s*,?\s*$", text) is not None


def _bare(core: str) -> str:
    """An address's name without what addresses add to names: joinprox is prox, sonyglobal is sony."""
    bare = HOST_TAIL.sub("", HOST_HEAD.sub("", core))
    return bare if len(bare) >= 3 and bare != core else ""


def _in_words(mail: Mail, own: set[str], subject_only: bool = False, sure: bool = False) -> list[str]:
    """The names the words give, the subject's first. `sure` leaves out the subject's last pattern, a bare "with X" or
    "to X", which is as often a verb as a name."""
    found: list[str] = []
    sent_to = SENT_TO.search(mail.subject)
    if sent_to:
        company = _clean_company(sent_to.group(1), whole=True)
        if company:
            found.append(company)
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
        # A group's address under a brand's subject: publicisgroupe writes "Thank You for Applying to Epsilon!".
        cores = [core] + ([_bare(core)] if _bare(core) else [])
        named = SUBJECT_NAMES.search(mail.subject)
        brand = _clean_company(named.group(1), whole=True) if carried and named else ""
        if brand and not any(_agrees(name, known) for name in [brand, *in_subject] for known in cores):
            return brand
        # The address's own name: as the sender shows it, else the plainest the words give ("HubSpot", not "HubSpot
        # Recruiter Zoom"), else the address's name as the message spells it, with or without what addresses add.
        if shown and any(_agrees(shown, known) for known in cores):
            return shown
        own_names = [name for name in words if any(_agrees(name, known) for known in cores)]
        # "Prox Software Engineering" is Prox and the start of a role.
        plain = [name for name in own_names if not any(NOT_A_COMPANY.match(word) for word in name.split()[1:])]
        if plain:
            return min(plain, key=lambda name: abs(len(_letters(name)) - len(core)))
        for known in cores:
            spelled = _spelled(known, read)
            if spelled:
                return spelled
        if own_names:
            return min(own_names, key=lambda name: abs(len(_letters(name)) - len(core)))
    if carried:
        # The name the sender shows, unless it is a person's: then the subject's ("Your interview with Advantive",
        # shown as from the recruiter who holds it).
        if shown and in_subject and _letters(shown) not in _letters(mail.subject) and _a_person(shown, mail.text):
            return in_subject[0]
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
        for pattern in (reading for readings in ROLE_IN_WORDS for reading in readings):
            for found in pattern.finditer(source):
                role = " ".join(found.group(1).split()).strip(" -,|:'\"")
                # A bracket the cut left open goes with what it held; a whole "(Intern)" stays.
                if role.count("(") != role.count(")"):
                    role = re.sub(r"\s*\([^)]*$", "", role).strip("() ")
                # A subject in capitals reads on from "for": "Your Interest in Our Full Stack Developer Intern".
                role = re.sub(r"(?i)^(?:(?:the|our|a|an|your)\s+)*(?:(?:interest|application|candidacy)\s+(?:in|for|to)\s+(?:(?:the|our|a|an|your)\s+)*)?", "", role)
                # "Citadel's Software Engineer": whose role it is, is the company.
                role = re.sub(r"^[\w .&-]{2,40}?['’]s\s+", "", role)
                role = ROLE_STOP.sub("", role)
                role = re.sub(r"(?i)\s+(?:positions?|roles?|openings?|opportunit(?:y|ies)|jobs?)(?:\(s\))?$", "", role).strip(" -,|:'\"")
                role = re.sub(r"\s+,", ",", role)
                if company and role.lower().endswith(f" at {company.lower()}"):
                    role = role[: -len(company) - 4]
                if company and role.lower().startswith(company.lower()):
                    continue
                if 3 <= len(role) <= 110 and ROLE_WORD.search(role) and role.lower() != company.lower():
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
    """A role under the ways mail writes it: "Quantitative Intern" and "Quantitative Internship" are one."""
    key = re.sub(r"[^a-z0-9]+", " ", role.lower())
    return " ".join(re.sub(r"\bintern(?:s|ships?)?\b", "intern", key).split())


def _same_role(one: str, other: str) -> bool:
    """Whether two role keys name one role: the same words, or one the other's start, as when a later mail leaves out
    the posting's number or its season. One word alone ("intern") is the start of too much to count."""
    short, long = sorted((one.split(), other.split()), key=len)
    return len(short) >= 2 and long[: len(short)] == short


def _names_nobody(event: Event) -> bool:
    """True when the employer is known only from the sender's address: the words shown name none, as in a template
    whose company was left blank ("the role at and the time you invested")."""
    host = event.sender.partition("@")[2]
    core = _letters(_host_core(host))
    return bool(core) and not _carried(host) and _letters(event.company) == core and core not in _letters(f"{event.subject} {event.snippet}")


@dataclass
class _Group:
    """The mail of one application as it is put together, the oldest first. `role` is empty until a message names it."""

    company: str
    role: str
    events: list[Event]

    @property
    def closed(self) -> bool:
        return any(item.kind in CLOSED for item in self.events)

    def has_thread(self, thread: str) -> bool:
        return any(item.thread == thread for item in self.events)


def _one_company(key: str, name: str, other_key: str, other_name: str) -> bool:
    """Whether two names are one employer's: written short and long ("IMC", "IMC Trading"), by its initials ("HRT",
    "Hudson River Trading"), or as its address runs some of its words together ("Hudsontrading")."""
    if len(min(key, other_key, key=len)) > 2 and (key.startswith(other_key) or other_key.startswith(key)):
        return True
    for short, long in ((key, other_name), (other_key, name)):
        words = [_letters(word) for word in re.findall(r"[A-Za-z0-9]+", long)]
        if len(short) < 3 or not 3 <= len(words) <= 5:
            continue
        if short == "".join(word[0] for word in words):
            return True
        middles = range(1, len(words))
        if any(short == words[0] + "".join(words[index] for index in kept) for size in middles for kept in combinations(middles, size)):
            return True
    return False


def _group_of(event: Event, company: str, role: str, groups: list[_Group]) -> _Group | None:
    """The application this message is about, among those known so far; None when it starts another."""
    mine = [group for group in groups if group.company == company]
    closing = event.kind in CLOSED
    # After a no, only another no or an offer is still about that application: a receipt or an invitation is a new one.
    joins_closed = closing or event.kind == "offer"
    if role:
        named = [group for group in mine if group.role == role] or [group for group in mine if group.role and _same_role(group.role, role)]
        still_open = [group for group in named if not group.closed]
        if still_open:
            return still_open[0]
        if named and (joins_closed or named[-1].has_thread(event.thread)):
            return named[-1]
        if named:
            return None
        if closing:
            # A refusal names the role loosely: "your application for the Fall 2026 internship" refuses the one open
            # application whose role has all those words, "Software Engineer Intern (Fall 2026)".
            said = set(role.split())
            holding = [group for group in mine if group.role and not group.closed and len(said) >= 3 and said <= set(group.role.split())]
            if len(holding) == 1:
                return holding[0]
        # The application was known without its role until this message named it. A second receipt names the role of
        # the first only when it comes with it; one that comes days later is another application's.
        unnamed = [group for group in mine if not group.role and not group.closed]
        if event.kind == "applied":
            unnamed = [group for group in unnamed if _days_between(group.events[-1].at, event.at) <= 1]
        if unnamed:
            unnamed[-1].role = role
            return unnamed[-1]
        if closing and len(role.split()) >= 4 and _names_nobody(event):
            # A refusal that names no employer, for a role only one open application anywhere has: it is that one's.
            same = [group for group in groups if group.role == role and not group.closed]
            if len(same) == 1:
                return same[0]
        return None
    of_thread = [group for group in mine if group.has_thread(event.thread) and (joins_closed or not group.closed)]
    if of_thread:
        return of_thread[-1]
    still_open = [group for group in mine if not group.closed]
    if still_open:
        return still_open[-1]
    return mine[-1] if mine and joins_closed else None


def _days_between(one: str, other: str) -> float:
    try:
        return abs((datetime.fromisoformat(other) - datetime.fromisoformat(one)).total_seconds()) / 86400
    except (TypeError, ValueError):
        return 0.0 if one[:10] == other[:10] else 999.0


def applications(events: Iterable[Event], sent_by_agent: Iterable[str] = ()) -> list[Application]:
    """One application per company and role, the newest news first. A message that names no role belongs to the company's
    application of that thread, or else to its latest one still open. `sent_by_agent` are the companies Agent Automation
    applied to."""
    agent = {company_key(name) for name in sent_by_agent if name}
    groups: list[_Group] = []
    for event in sorted(events, key=lambda item: item.at):
        company = company_key(event.company)
        company = next((group.company for group in groups if _one_company(company, event.company, group.company, group.events[0].company)), company)
        role = _role_key(event.role)
        group = _group_of(event, company, role, groups)
        if group is None:
            group = _Group(company, role, [])
            groups.append(group)
        group.events.append(event)
    # One name per employer on every row of it: the shortest, of two with the same letters the one written out
    # ("Luminate Data", not "Luminatedata"), and a name spelled out before its initials.
    written: dict[str, set[str]] = {}
    for group in groups:
        written.setdefault(group.company, set()).update(item.company for item in group.events)
    shown = {}
    for company, names in written.items():
        initials = {"".join(word[0] for word in re.findall(r"[A-Za-z0-9]+", name)).lower() for name in names if len(name.split()) > 2}
        spelled = [name for name in names if _letters(name) not in initials] or list(names)
        shown[company] = min(spelled, key=lambda name: (len(_letters(name)), -len(name), name))
    found = []
    for group in groups:
        items = group.events
        closed = [item for item in items if item.kind in CLOSED]
        furthest = max((item for item in items if item.kind not in CLOSED), key=lambda item: (RANK[item.kind], item.at), default=None)
        # An offer after a no is the news; a no, or a withdrawal, after anything else ends it.
        ended = closed and (furthest is None or furthest.kind != "offer" or closed[-1].at > furthest.at)
        # The role as its fullest mail writes it.
        named = max(items, key=lambda item: (len(_role_key(item.role)), item.at))
        # The message that says where it stands: its subject is what the person reads beside the status.
        deciding = closed[-1] if ended else furthest
        # The receipt dates the application. With none read, the first mail is all there is to go by.
        receipt = next((item for item in items if item.kind == "applied"), None)
        found.append(Application(
            company=shown[group.company], role=named.role, status=deciding.kind, applied_at=(receipt or items[0]).at, updated_at=items[-1].at, subject=deciding.subject, mails=len(items),
            by_agent=group.company in agent, applied_known=receipt is not None, domain=_own_domain(item.sender for item in items),
        ))
    return sorted(found, key=lambda item: item.updated_at, reverse=True)


def relabel(event: Event, company: str = "", role: str = "") -> Event:
    """The same event under a name the person corrected."""
    return replace(event, company=company or event.company, role=role or event.role)

"""The person's Google Calendar: what is coming up (interviews, calls with a company, tests) and a way to add an event.

Over CalDAV with the same Google app password the inbox sync uses, so there is no Google Cloud project and no token that
runs out. Reading asks for the events of a window and changes nothing. Writing happens only in `create` and `remove`,
each for one event the person asked for.

No model is asked anything here: what an event is about is told from its words by the rules below.
"""

from __future__ import annotations

import base64
import html
import os
import re
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from agent_automation.tools.inbox import ADDRESS_ENV, PASSWORD_ENV, PASSWORD_URL, Application, company_key

BASE = "https://www.google.com/calendar/dav/{address}/events/"
# What the page shows: a week back, so yesterday's interview is still there, and four months ahead.
DAYS_BACK = 7
DAYS_AHEAD = 120
KINDS = ("interview", "call", "assessment", "deadline", "other")
# The kinds that are about the job hunt.
JOB_KINDS = ("interview", "call", "assessment", "deadline")
# An event made here carries this at the end of its UID, so a later read knows where it came from.
MADE_HERE = "@agent-automation"
NOTES_CHARS = 600
DEFAULT_MINUTES = 30
# A repeating event is followed this many times at most: a daily one for ten years is still read in a blink.
MOST_REPEATS = 6000

ASSESSMENT = re.compile(r"(?i)\b(?:assessment|coding challenge|online test|hackerrank|codesignal|codility|take[- ]home)\b|\bOA\b")
INTERVIEW = re.compile(r"(?i)\b(?:interview|superday|super day|phone screen|technical screen|recruiter screen|on-?site|final round|meet (?:&|and) greet)\b")
CALL = re.compile(r"(?i)\b(?:call|chat|intro|introduction|conversation|info(?:rmation)? session|catch[- ]up|sync|meeting)\b|\b1:1\b")
DEADLINE = re.compile(r"(?i)\b(?:deadline|due|apply by|closes|expires)\b")
JOB = re.compile(r"(?i)\b(?:recruit\w*|hiring|candidate|intern(?:ship)?|co-?op|role|position|application|applied|careers?|talent|job offer|offer letter)\b")
LINK = re.compile(
    r"https://(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com|[\w.-]*webex\.com|[\w.-]*gotomeeting\.com|[\w.-]*whereby\.com|[\w.-]*chime\.aws)/[^\s<>\"')\]]+"
)
# Whoever sends the invitation for somebody else: their address says nothing of the company.
NOT_A_COMPANY = {
    "gmail", "googlemail", "google", "outlook", "hotmail", "live", "yahoo", "icloud", "proton", "protonmail", "calendly", "zoom", "microsoft",
    "greenhouse", "ashbyhq", "lever", "goodtime", "myworkday", "workday", "icims", "smartrecruiters", "paycomonline", "modernloop", "hackerrank",
    "codesignal", "hirevue", "brighthire", "calendar", "cal", "savvycal", "hubspot",
}
# Words every internship has in its name: two roles sharing only these are not the same role.
COMMON = {"intern", "internship", "software", "engineer", "engineering", "summer", "fall", "spring", "winter", "program", "the", "and", "for", "with", "interview"}
# Whose name is in every invitation because the meeting room is theirs.
ROOMS = {"google", "microsoft", "zoom", "cisco", "amazon"}
WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")

# How a request goes out: the method, the address, the headers, the body; back come the status and the text.
Send = Callable[[str, str, dict[str, str], bytes], tuple[int, str]]


class CalendarError(Exception):
    """Said to the person as it is: what is missing, or what Google refused."""


@dataclass(frozen=True)
class Event:
    """One event, or one day of a repeating one. Times are UTC; an all-day event runs from midnight to midnight."""

    id: str
    title: str
    starts_at: str
    ends_at: str
    all_day: bool = False
    location: str = ""
    url: str = ""
    kind: str = "other"
    company: str = ""
    notes: str = ""
    source: str = "google"
    organizer: str = ""
    # One day of an event that repeats: a standup, a class, a birthday.
    repeats: bool = False


def _send(method: str, url: str, headers: dict[str, str], body: bytes) -> tuple[int, str]:
    answer = httpx.request(method, url, headers=headers, content=body, timeout=60, follow_redirects=True)
    return answer.status_code, answer.text


def _headers(address: str, password: str) -> dict[str, str]:
    if not address:
        raise CalendarError(f"no Gmail address is set: put {ADDRESS_ENV} in .env")
    if not password:
        raise CalendarError(f"no Google app password is set: make one at {PASSWORD_URL} and put it in .env as {PASSWORD_ENV}")
    token = base64.b64encode(f"{address}:{password.replace(' ', '')}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _refused(status: int, doing: str) -> CalendarError:
    if status in (401, 403):
        return CalendarError(f"Google refused the app password while {doing}: check {PASSWORD_ENV} in .env, or make a new one at {PASSWORD_URL}")
    return CalendarError(f"Google Calendar answered {status} while {doing}")


def _stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="seconds")


# ---- reading what Google sends ----


def _unfold(text: str) -> list[str]:
    return re.sub(r"\r?\n[ \t]", "", text).splitlines()


def _unescape(value: str) -> str:
    return re.sub(r"\\([nN,;\\])", lambda found: "\n" if found.group(1) in "nN" else found.group(1), value)


_LINE = re.compile(r'^([A-Za-z0-9-]+)((?:;[^=;:]+=(?:"[^"]*"|[^;:]*))*):(.*)$')


def _blocks(text: str) -> list[dict[str, list[tuple[str, str]]]]:
    """Every VEVENT as its own lines: name -> [(parameters, value)]. What sits inside it (a reminder) is left out."""
    events: list[dict[str, list[tuple[str, str]]]] = []
    current: dict[str, list[tuple[str, str]]] | None = None
    depth = 0
    for line in _unfold(html.unescape(text)):
        if line.startswith("BEGIN:VEVENT"):
            current, depth = {}, 0
        elif line.startswith("END:VEVENT") and current is not None:
            events.append(current)
            current = None
        elif current is not None and line.startswith("BEGIN:"):
            depth += 1
        elif current is not None and line.startswith("END:"):
            depth -= 1
        elif current is not None and depth == 0:
            found = _LINE.match(line)
            if found:
                current.setdefault(found.group(1).upper(), []).append((found.group(2), found.group(3)))
    return events


def _zone(parameters: str) -> ZoneInfo | None:
    named = re.search(r'(?i);TZID="?([^";:]+)', parameters)
    if not named:
        return None
    try:
        return ZoneInfo(named.group(1))
    except (ZoneInfoNotFoundError, ValueError):
        return None


def _moment(parameters: str, value: str) -> tuple[datetime, bool]:
    """A time as Google writes it, and whether it is a whole day. A time with no zone at all is taken as UTC."""
    value = value.strip()
    if re.fullmatch(r"\d{8}", value):
        return datetime(int(value[:4]), int(value[4:6]), int(value[6:8]), tzinfo=UTC), True
    found = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)", value)
    if not found:
        raise ValueError(value)
    naive = datetime(*(int(part) for part in found.groups()[:6]))
    zone = UTC if found.group(7) else (_zone(parameters) or UTC)
    return naive.replace(tzinfo=zone), False


def _first(block: dict[str, list[tuple[str, str]]], name: str) -> tuple[str, str]:
    return block.get(name, [("", "")])[0]


def _plain(text: str) -> str:
    """An invitation's text as a person reads it: no tags, no runs of blank lines."""
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", _unescape(text))
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    lines = [" ".join(line.split()) for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _rule(value: str) -> dict[str, str]:
    return {name.upper(): part for name, _, part in (piece.partition("=") for piece in value.split(";")) if part}


def _repeats(start: datetime, rule: dict[str, str], until: datetime) -> Iterable[datetime]:
    """The starts of a repeating event, in its own zone so that a 10:15 stays a 10:15 across a clock change."""
    step = max(1, int(rule.get("INTERVAL", "1") or 1))
    count = int(rule["COUNT"]) if rule.get("COUNT", "").isdigit() else None
    last = until
    if rule.get("UNTIL"):
        try:
            ends, whole = _moment("", rule["UNTIL"])
            last = min(until, ends + timedelta(days=1) if whole else ends)
        except ValueError:
            pass
    days = [WEEKDAYS.index(day[-2:]) for day in rule.get("BYDAY", "").upper().split(",") if day[-2:] in WEEKDAYS]
    frequency = rule.get("FREQ", "").upper()
    local = start.replace(tzinfo=None)
    given = 0

    def out(moment: datetime) -> datetime:
        return moment.replace(tzinfo=start.tzinfo)

    if frequency == "WEEKLY":
        week = local - timedelta(days=local.weekday())
        for _ in range(MOST_REPEATS):
            for day in sorted(days) or [local.weekday()]:
                moment = week + timedelta(days=day)
                if moment < local:
                    continue
                if out(moment) > last or (count is not None and given >= count):
                    return
                given += 1
                yield out(moment)
            week += timedelta(weeks=step)
        return
    for turn in range(MOST_REPEATS):
        if frequency == "DAILY":
            moment: datetime | None = local + timedelta(days=turn * step)
        elif frequency in ("MONTHLY", "YEARLY"):
            months = turn * step * (12 if frequency == "YEARLY" else 1)
            year, month = local.year + (local.month - 1 + months) // 12, (local.month - 1 + months) % 12 + 1
            try:
                moment = local.replace(year=year, month=month)
            except ValueError:
                # No such day that month (the 31st, or the 29th of February): that turn is skipped, and still counted.
                moment = None
        else:
            return
        if moment is None:
            continue
        if frequency == "DAILY" and days and moment.weekday() not in days:
            continue
        if out(moment) > last or (count is not None and given >= count):
            return
        given += 1
        yield out(moment)


def _link(*texts: str) -> str:
    for text in texts:
        found = LINK.search(text)
        if found:
            return found.group(0).rstrip(".,;")
    return ""


def parse(text: str, start: datetime, end: datetime) -> list[Event]:
    """The events between two moments out of what a calendar query answered, each repeat of a repeating event on its own.
    Nothing is said yet of what an event is about: see `classify`."""
    blocks = _blocks(text)
    # A changed day of a repeating event comes as an event of its own that names the day it replaces.
    changed: dict[tuple[str, str], dict[str, list[tuple[str, str]]]] = {}
    for block in blocks:
        if "RECURRENCE-ID" in block:
            try:
                replaced, _ = _moment(*_first(block, "RECURRENCE-ID"))
            except ValueError:
                continue
            changed[(_first(block, "UID")[1].strip(), _stamp(replaced))] = block

    def event_of(block: dict[str, list[tuple[str, str]]], begins: datetime, ends: datetime, whole: bool, name: str) -> Event | None:
        if _first(block, "STATUS")[1].strip().upper() == "CANCELLED" or ends <= start or begins >= end:
            return None
        description = max((value for _, value in block.get("DESCRIPTION", [])), key=len, default="")
        location = _plain(_first(block, "LOCATION")[1])
        notes = _plain(description)
        organizer = re.sub(r"(?i)^mailto:", "", _first(block, "ORGANIZER")[1].strip())
        made_here = _first(block, "UID")[1].strip().endswith(MADE_HERE)
        room, written = _first(block, "X-GOOGLE-CONFERENCE")[1], (location, _first(block, "URL")[1], notes)
        # Google may add a Meet room of its own to an event made here: the link the person gave comes first then.
        return Event(
            id=name, title=" ".join(_unescape(_first(block, "SUMMARY")[1]).split()) or "(no title)", starts_at=_iso(begins), ends_at=_iso(ends),
            all_day=whole, location=location[:200], url=_link(*written, room) if made_here else _link(room, *written),
            notes=notes, source="web" if made_here else "google", organizer=organizer,
        )

    found: list[Event] = []
    for block in blocks:
        uid = _first(block, "UID")[1].strip()
        if not uid or "RECURRENCE-ID" in block or "DTSTART" not in block:
            continue
        try:
            begins, whole = _moment(*_first(block, "DTSTART"))
            ends = _moment(*_first(block, "DTEND"))[0] if "DTEND" in block else begins + (timedelta(days=1) if whole else timedelta(0))
        except ValueError:
            continue
        lasts = ends - begins
        if "RRULE" not in block:
            found.append(event_of(block, begins, ends, whole, uid))
            continue
        skipped = set()
        for parameters, values in block.get("EXDATE", []):
            for value in values.split(","):
                try:
                    skipped.add(_stamp(_moment(parameters, value)[0]))
                except ValueError:
                    pass
        for repeat in _repeats(begins, _rule(_first(block, "RRULE")[1]), end):
            stamp = _stamp(repeat)
            name = f"{uid}_{stamp[:8] if whole else stamp}"
            other = changed.get((uid, stamp))
            if other is not None:
                try:
                    moved, moved_whole = _moment(*_first(other, "DTSTART"))
                    moved_ends = _moment(*_first(other, "DTEND"))[0] if "DTEND" in other else moved + lasts
                except ValueError:
                    continue
                made = event_of(other, moved, moved_ends, moved_whole, name)
            elif stamp not in skipped:
                made = event_of(block, repeat, repeat + lasts, whole, name)
            else:
                made = None
            found.append(replace(made, repeats=True) if made else None)
    return sorted((event for event in found if event is not None), key=lambda event: (event.starts_at, event.id))


# ---- what an event is about ----


def _words(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2 and word not in COMMON}


def _named(text: str, companies: Iterable[str]) -> str:
    """The known company a text names, the longest name first so "Morgan Stanley" wins over "Morgan". A short name of
    one word ("Object", "NICE", "Guild") has to be written as the company writes it: "a nice chat" names nobody."""
    for company in sorted({name for name in companies if len(company_key(name)) > 2}, key=len, reverse=True):
        loose = "(?i)" if len(company) >= 8 or " " in company or company.isupper() else ""
        if re.search(rf"{loose}(?<![A-Za-z0-9]){re.escape(company)}(?![A-Za-z0-9])", text):
            return company
    return ""


def _sender(event: Event) -> str:
    """The name in the organizer's address: "fedcon" of somebody@mail.fedcon.com."""
    parts = event.organizer.rpartition("@")[2].lower().split(".")
    return parts[-2] if len(parts) >= 2 else ""


def _of_sender(event: Event, names: Iterable[str]) -> str:
    label = _sender(event)
    return next((name for name in names if label and label not in NOT_A_COMPANY and company_key(name) == label), "")


def _company(event: Event, applications: list[Application], kind: str) -> str:
    if kind not in JOB_KINDS:
        return ""
    names = [item.company for item in applications]
    found = _named(event.title, names) or _of_sender(event, names)
    if found:
        return found
    # An invitation that names only the role ("2027 Technology Analyst Program Superday"): the one application at that
    # stage whose role shares its words.
    title = _words(event.title)
    stages = ("assessment", "interview") if kind == "assessment" else ("interview", "assessment")
    for stage in stages:
        scored = sorted((len(title & _words(item.role)), item.company) for item in applications if item.status == stage)
        best = [(score, name) for score, name in scored if score >= 3]
        if best and (len(best) == 1 or best[-1][0] > best[-2][0] or best[-1][1] == best[-2][1]):
            return best[-1][1]
    label = _sender(event)
    if label and label not in NOT_A_COMPANY:
        return label.upper() if len(label) <= 4 else label.capitalize()
    # Last, a company the text names. Not the makers of the meeting room: every Teams link says "Microsoft".
    return _named(event.notes, [name for name in names if company_key(name) not in ROOMS])


def classify(event: Event, applications: Iterable[Application] = ()) -> Event:
    """The same event with what it is and the company it is with. `applications` are what the inbox sync knows: their
    companies are how a bare "Intro call" from somebody at one of them is told from a call with a friend. An event that
    repeats is never about the job hunt: nobody is interviewed every Monday."""
    known = list(applications)
    names = [item.company for item in known]
    with_company = bool(_named(event.title, names) or _of_sender(event, names))
    job = with_company or bool(JOB.search(event.title) or JOB.search(event.notes))
    if event.repeats:
        kind = "other"
    elif ASSESSMENT.search(event.title) or (job and ASSESSMENT.search(event.notes) and not INTERVIEW.search(event.title)):
        kind = "assessment"
    elif INTERVIEW.search(event.title) or (job and INTERVIEW.search(event.notes)):
        kind = "interview"
    elif job and DEADLINE.search(event.title):
        kind = "deadline"
    elif job and CALL.search(event.title):
        kind = "call"
    else:
        kind = "other"
    # What is not about the job hunt keeps its title, time and place; its text stays on the calendar.
    notes = event.notes[:NOTES_CHARS] if kind in JOB_KINDS else ""
    return replace(event, kind=kind, company=_company(event, known, kind), notes=notes)


# ---- asking Google ----


def read(address: str, password: str, start: datetime, end: datetime, sending: Send = _send) -> list[Event]:
    """The events of the main calendar between two moments. Changes nothing."""
    headers = {**_headers(address, password), "Depth": "1", "Content-Type": "application/xml; charset=utf-8"}
    body = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
        "<d:prop><d:getetag/><c:calendar-data/></d:prop>"
        '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'
        f'<c:time-range start="{_stamp(start)}" end="{_stamp(end)}"/>'
        "</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>"
    )
    status, text = sending("REPORT", BASE.format(address=quote(address)), headers, body.encode())
    if status not in (200, 207):
        raise _refused(status, "reading the calendar")
    return parse(text, start, end)


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\n").replace("\n", "\\n")


def _fold(line: str) -> str:
    """A line cut into pieces of at most 73 bytes, as the format wants, never in the middle of a letter."""
    pieces, piece, size = [], "", 0
    for letter in line:
        width = len(letter.encode())
        if size + width > 73:
            pieces.append(piece)
            piece, size = "", 0
        piece, size = piece + letter, size + width
    return "\r\n ".join([*pieces, piece])


def _when(value: object, name: str) -> datetime:
    if isinstance(value, datetime):
        moment = value
    else:
        try:
            moment = datetime.fromisoformat(str(value or "").strip())
        except ValueError:
            raise CalendarError(f"{name} is not a date and time: {value!r}") from None
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def new_event(wanted: dict[str, object], now: datetime | None = None) -> tuple[Event, str]:
    """The event a request describes, and it written the way a calendar reads it. Keys: title, starts_at, and if wanted
    ends_at, all_day, location, url, notes, kind, company, source."""
    title = " ".join(str(wanted.get("title") or "").split())
    if not title:
        raise CalendarError("the event needs a title")
    if not wanted.get("starts_at"):
        raise CalendarError("the event needs a start")
    begins = _when(wanted["starts_at"], "the start")
    whole = bool(wanted.get("all_day"))
    if whole:
        day = date(begins.year, begins.month, begins.day)
        begins = datetime(day.year, day.month, day.day, tzinfo=UTC)
        last = _when(wanted["ends_at"], "the end") if wanted.get("ends_at") else begins
        ends = max(datetime(last.year, last.month, last.day, tzinfo=UTC), begins) + timedelta(days=1)
    else:
        ends = _when(wanted["ends_at"], "the end") if wanted.get("ends_at") else begins + timedelta(minutes=DEFAULT_MINUTES)
        if ends <= begins:
            raise CalendarError("the event ends before it starts")
    kind = str(wanted.get("kind") or "other")
    if kind not in KINDS:
        raise CalendarError(f"an event is one of {', '.join(KINDS)}, not {kind!r}")
    location, url = str(wanted.get("location") or "").strip(), str(wanted.get("url") or "").strip()
    notes = str(wanted.get("notes") or "").strip()
    uid = f"{uuid.uuid4().hex}{MADE_HERE}"
    event = Event(
        id=uid, title=title[:200], starts_at=_iso(begins), ends_at=_iso(ends), all_day=whole, location=location[:200], url=url, kind=kind,
        company=str(wanted.get("company") or "").strip(), notes=notes[:NOTES_CHARS], source=str(wanted.get("source") or "web"),
    )
    # The link is written where every calendar shows it: as the place when there is none, and first in the text.
    described = "\n\n".join(part for part in (url, notes) if part)
    times = (
        [f"DTSTART;VALUE=DATE:{begins:%Y%m%d}", f"DTEND;VALUE=DATE:{ends:%Y%m%d}"] if whole else [f"DTSTART:{_stamp(begins)}", f"DTEND:{_stamp(ends)}"]
    )
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agent Automation//Calendar//EN", "BEGIN:VEVENT", f"UID:{uid}",
        f"DTSTAMP:{_stamp(now or datetime.now(UTC))}", *times, f"SUMMARY:{_escape(event.title)}",
        *([f"LOCATION:{_escape(location or url)}"] if location or url else []),
        *([f"DESCRIPTION:{_escape(described)}"] if described else []),
        "END:VEVENT", "END:VCALENDAR",
    ]
    return event, "\r\n".join(_fold(line) for line in lines) + "\r\n"


def _address_of(address: str, uid: str) -> str:
    return BASE.format(address=quote(address)) + quote(uid, safe="") + ".ics"


def create(address: str, password: str, wanted: dict[str, object], sending: Send = _send) -> Event:
    """Put one new event on the main calendar and answer with it. Never changes an event that is there: Google is told
    to refuse if the name is taken."""
    event, text = new_event(wanted)
    headers = {**_headers(address, password), "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*"}
    status, _ = sending("PUT", _address_of(address, event.id), headers, text.encode())
    if status not in (200, 201, 204):
        raise _refused(status, "adding the event")
    return event


def remove(address: str, password: str, uid: str, sending: Send = _send) -> None:
    """Take one event made here off the calendar. An event made anywhere else is never touched."""
    if not uid.endswith(MADE_HERE):
        raise CalendarError("only an event added from Agent Automation can be removed here")
    status, _ = sending("DELETE", _address_of(address, uid), _headers(address, password), b"")
    if status not in (200, 204, 404):
        raise _refused(status, "removing the event")


def credentials() -> tuple[str, str]:
    return (os.environ.get(ADDRESS_ENV) or "").strip(), os.environ.get(PASSWORD_ENV, "")


def upcoming(
    workspace: Path, now: datetime | None = None, sending: Send = _send, applications: Iterable[Application] | None = None,
) -> list[Event]:
    """What is on the calendar from a week ago to four months ahead, each event told what it is about."""
    now = now or datetime.now(UTC)
    address, password = credentials()
    events = read(address, password, now - timedelta(days=DAYS_BACK), now + timedelta(days=DAYS_AHEAD), sending)
    if applications is None:
        try:
            # What the inbox sync already knows, with no mailbox read.
            from agent_automation.tools.inbox_sync import known

            applications = known(workspace)
        except Exception:  # noqa: BLE001  No inbox yet: events are still told apart by their own words.
            applications = []
    known_applications = list(applications)
    return [classify(event, known_applications) for event in events]


__all__ = [
    "DAYS_AHEAD", "DAYS_BACK", "JOB_KINDS", "KINDS", "MADE_HERE", "CalendarError", "Event", "classify", "create", "credentials", "new_event",
    "parse", "read", "remove", "upcoming",
]

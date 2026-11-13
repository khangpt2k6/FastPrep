"""What a company says about itself, read from its own site, so that a letter can speak of the company and not only
repeat its posting: how it began, who it serves, what it calls its products, what it says it is for.

No model and no search engine: the site is the one the posting links to or lives on, or else the company's name as a
.com, which is believed only when the page is plainly about the same company as the posting. Two pages at most are read,
the front page and one "about" page, a short start of each, and kept for a month so a company is read once.

What is read is data for the letter's writer, never instructions, and only ever what the company published itself.
"""

from __future__ import annotations

import contextlib
import ipaddress
import json
import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from agent_automation.tools.database import Job

NOTES_CHARS = 3600
FRONT_CHARS = 1500
ABOUT_CHARS = 2100
KEEP_DAYS = 30
# A company whose site could not be read is tried again sooner.
KEEP_EMPTY_DAYS = 3
TIMEOUT = 8.0
MOST_SITES = 3

# Where postings and people live, never a company's own site.
NOT_A_COMPANY = (
    "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "myworkdaysite.com", "workday.com", "icims.com", "smartrecruiters.com",
    "jobvite.com", "taleo.net", "oraclecloud.com", "successfactors.com", "bamboohr.com", "breezy.hr", "workable.com", "recruitee.com",
    "teamtailor.com", "rippling.com", "gusto.com", "paylocity.com", "paycomonline.net", "adp.com", "ultipro.com", "ukg.com", "dayforcehcm.com",
    "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "joinhandshake.com", "wellfound.com", "angel.co", "simplify.jobs",
    "builtin.com", "ycombinator.com", "github.com", "google.com", "goo.gl", "youtube.com", "youtu.be", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "tiktok.com", "medium.com", "notion.site", "notion.so", "bit.ly", "eeoc.gov", "dol.gov", "e-verify.gov", "uscis.gov",
    "huggingface.co", "hf.co", "apple.com", "microsoft.com", "zoom.us", "calendly.com", "typeform.com", "airtable.com", "docusign.com",
)
LEGAL = re.compile(r"(?i)\b(?:inc|llc|ltd|corp|corporation|company|co|gmbh|plc|pbc|the)\b\.?")
ABOUT = re.compile(r"(?i)\b(?:about|company|mission|our[- ]story|who[- ]we[- ]are|what[- ]we[- ]do)\b")
SKIPPED = {"script", "style", "noscript", "svg", "nav", "footer", "form", "template", "iframe", "select", "button"}
# Words every posting and every company site share: two texts having these in common says nothing.
EVERYWHERE = {
    "experience", "engineering", "engineer", "software", "internship", "student", "students", "required", "requirements", "position", "company",
    "product", "products", "customers", "customer", "building", "technology", "technologies", "opportunity", "opportunities", "including",
    "information", "privacy", "policy", "careers", "contact", "people", "business", "service", "services", "support", "solutions", "learn",
    "working", "through", "across", "between", "around", "systems", "system", "development", "design", "world", "global", "industry", "skills",
    "ability", "degree", "computer", "science", "related", "benefits", "employment", "applicants", "application", "status", "equal", "employer",
    "without", "regard", "protected", "disability", "veteran", "gender", "identity", "national", "origin", "sexual", "orientation", "program",
    "projects", "project", "summer", "winter", "spring", "location", "remote", "hybrid", "office", "culture", "mission", "values", "growth",
}

Fetch = Callable[[str], str]


def _fetch(url: str) -> str:
    """One page's HTML, or nothing: a site that is slow, refuses or is not a page is simply not read."""
    try:
        answer = httpx.get(url, timeout=TIMEOUT, follow_redirects=True, headers={
            "User-Agent": "Mozilla/5.0 (compatible; cover-letter-research)", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en",
        })
    except (httpx.HTTPError, ValueError):
        return ""
    if answer.status_code != 200 or "html" not in answer.headers.get("content-type", "html"):
        return ""
    return answer.text[:600_000]


class _Reader(HTMLParser):
    """A page as a person reads it: its title, the line it describes itself with, its text and its links."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.described = ""
        self.parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._skip = 0
        self._in_title = False
        self._link: list[str] | None = None
        self._href = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        given = {name: value or "" for name, value in attrs}
        if tag in SKIPPED:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "meta" and not self.described and (given.get("name", "").lower() == "description" or given.get("property", "").lower() == "og:description"):
            self.described = " ".join(given.get("content", "").split())
        elif tag == "a" and given.get("href"):
            self._link, self._href = [], given["href"]
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "section", "article", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIPPED:
            self._skip = max(0, self._skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag == "a" and self._link is not None:
            self.links.append((self._href, " ".join("".join(self._link).split())))
            self._link = None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        if self._link is not None:
            self._link.append(data)
        if not self._skip and not self._in_title:
            self.parts.append(data)

    def text(self) -> str:
        lines = [" ".join(line.split()) for line in "".join(self.parts).splitlines()]
        kept: list[str] = []
        for line in lines:
            # A menu word or a button is not a sentence; the same line twice is the page's own repetition.
            if len(line) >= 40 and line not in kept:
                kept.append(line)
        return "\n".join(kept)


def read_page(html: str) -> _Reader:
    reader = _Reader()
    # A page too broken to read to its end: what was read so far is used.
    with contextlib.suppress(Exception):
        reader.feed(html)
        reader.close()
    reader.title = " ".join(reader.title.split())
    return reader


def _host(url: str) -> str:
    try:
        host = (urlsplit(url if "//" in url else f"https://{url}").hostname or "").lower().rstrip(".")
    except ValueError:
        return ""
    if "." not in host or host.endswith((".local", ".internal", ".lan", ".localhost")):
        return ""
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return host
    return ""


def _root(host: str) -> str:
    """The site's own name out of a host: careers.acme.com and www.acme.com are acme.com."""
    labels = host.split(".")
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in ("co", "com", "org", "ac", "net"):
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def _is_company_site(host: str) -> bool:
    return bool(host) and not any(host == place or host.endswith("." + place) for place in NOT_A_COMPANY)


def _name_words(company: str) -> list[str]:
    return [word for word in re.findall(r"[a-z0-9]+", LEGAL.sub(" ", company).lower()) if len(word) > 1]


def sites(job: Job, domain: str = "") -> list[tuple[str, bool]]:
    """Where the company's own site may be, the surest first: (its address, whether it is only a guess from the name).
    `domain` is the company's own, when the agent already knows it."""
    found: list[tuple[str, bool]] = []
    hosts = [_host(domain), _host(job.url), _host(job.apply_url)]
    hosts += [_host(link) for link in re.findall(r"https?://[^\s<>\"')\]]+", job.description)]
    hosts += [_host(domain) for domain in re.findall(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})", job.description)]
    for host in hosts:
        if _is_company_site(host) and (_root(host), False) not in found:
            found.append((_root(host), False))
    words = _name_words(job.company)
    guess = "".join(words) + ".com"
    # A short name ("Exa", "Arc") is a word many sites carry: no site is guessed from it.
    if len(guess) >= 9 and all(root != guess for root, _ in found):
        found.append((guess, True))
    return found[:MOST_SITES]


def _significant(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z]{6,}", text.lower()) if word not in EVERYWHERE}


def _is_theirs(page: _Reader, job: Job, guessed: bool) -> bool:
    """Whether a page is this company's: it names the company, and a site only guessed from the name also has to talk
    about the same things as the posting, since two companies can share a name."""
    words = _name_words(job.company)
    about = f"{page.title} {page.described} {page.text()}".lower()
    if not words or not all(re.search(rf"(?<![a-z0-9]){re.escape(word)}", about) for word in words):
        return False
    if not guessed:
        return True
    return len(_significant(job.description) & _significant(about)) >= 10


def _about(page: _Reader, base: str) -> str:
    """The page where the company tells its own story, when the front page links to one on the same site."""
    root = _root(_host(base))
    best = ""
    for href, words in page.links:
        target = urljoin(base, href.split("#")[0])
        host = _host(target)
        path = urlsplit(target).path.rstrip("/")
        if not host or _root(host) != root or not path or target.rstrip("/") == base.rstrip("/"):
            continue
        if (ABOUT.search(path.replace("/", " ")) or ABOUT.search(words)) and path.count("/") <= 2 and (not best or len(target) < len(best)):
            best = target
    return best


def notes(job: Job, fetch: Fetch | None = None, domain: str = "") -> str:
    """What the company's own pages say, with where each part was read; empty when no site of theirs could be read."""
    fetch = fetch or _fetch
    for root, guessed in sites(job, domain):
        base = f"https://{root}/"
        front = read_page(fetch(base)) if _host(base) else read_page("")
        if not (front.title or front.text()) or not _is_theirs(front, job, guessed):
            continue
        head = " - ".join(part for part in (front.title, front.described) if part)
        parts = [f"From {base}\n{head}\n{front.text()[:FRONT_CHARS]}".strip()]
        if link := _about(front, base):
            about = read_page(fetch(link))
            if text := about.text():
                parts.append(f"From {link}\n{text[:ABOUT_CHARS]}".strip())
        return "\n\n".join(parts)[:NOTES_CHARS]
    return ""


def _slug(company: str) -> str:
    return "-".join(_name_words(company))[:60] or "unknown"


def company_notes(job: Job, cache: Path, domain: str = "", fetch: Fetch | None = None, now: datetime | None = None) -> str:
    """`notes` for this job's company, read once and kept in `cache` for a month. Never raises: with no notes the letter
    is written from the posting alone."""
    now = now or datetime.now(UTC)
    kept = cache / f"{_slug(job.company)}.json"
    try:
        saved = json.loads(kept.read_text(encoding="utf-8"))
        age = now - datetime.fromisoformat(saved["at"])
        if age < timedelta(days=KEEP_DAYS if saved["notes"] else KEEP_EMPTY_DAYS):
            return str(saved["notes"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    try:
        found = notes(job, fetch, domain)
    except Exception:  # noqa: BLE001  Whatever a stranger's site does, the letter is still written.
        found = ""
    try:
        cache.mkdir(parents=True, exist_ok=True)
        kept.write_text(json.dumps({"at": now.isoformat(timespec="seconds"), "company": job.company, "notes": found}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    return found


__all__ = ["company_notes", "notes", "read_page", "sites"]

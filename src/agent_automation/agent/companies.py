"""Who is hiring behind each posting, for the dashboard: a short name to show and the company's own web address, from
which the page draws its logo. The job database names a company the way one source wrote it, which can be a careers-site
label ("DTCC Candidate Experience Site") or a Workday tenant ("cisco/wd5/cisco_careers"), so a model reads that name,
the posting's link and the start of its description, and names the employer. Each company is asked about once: the
store keeps the answer."""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from openai import AsyncOpenAI

from agent_automation.agent.llm import structured
from agent_automation.tools.database import Job

# Companies asked about in one request, and how much of each description goes with them.
BATCH = 25
DESCRIPTION_CHARS = 500
# Where the page draws a logo from. For a site it does not know, it answers 404 with a blank globe that a page cannot
# tell from a logo, so such a domain is dropped here and the page shows the name's first letter instead.
ICONS = "https://www.google.com/s2/favicons"
ICON_CHECKS_AT_ONCE = 8

# Hosts that carry other companies' postings, never an employer's own address: job boards and applicant tracking systems.
CARRIERS = (
    "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "myworkdaysite.com", "workable.com", "smartrecruiters.com",
    "breezy.hr", "bamboohr.com", "jobvite.com", "icims.com", "rippling.com", "recruitee.com", "teamtailor.com", "personio.de",
    "personio.com", "pinpointhq.com", "oraclecloud.com", "taleo.net", "successfactors.com", "ultipro.com", "paylocity.com",
    "adp.com", "jazzhr.com", "applytojob.com", "gem.com", "dover.com", "isolvedhire.com", "welcometothejungle.com", "otta.com",
    "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "wellfound.com", "builtin.com", "dice.com",
    "ycombinator.com", "workatastartup.com",
)
DOMAIN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")
# A domain a description writes, such as www.example.com or example.io/careers.
WRITTEN = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|org|tech|app|dev|so|us|health|xyz|eu|de|uk|ca))\b", re.IGNORECASE)

SYSTEM = """You name the employer behind each job posting, for a list of jobs that shows each company's name and logo.

For each posting give:
- name: the employer's usual short name, as people write it: "Cisco", "ElevenLabs", "Cadmus" for The Cadmus Group, Inc. Never the name of a job board, an applicant tracking system or a careers site ("Candidate Experience Site", "Careers", "wd5"). When the company field is a code or a site label, find the employer in the link or the description. A staffing agency or job platform that posts for a client it does not name is the employer itself.
- domain: the employer's own main website as a bare domain, such as "cisco.com" or "elevenlabs.io": no scheme, no www, no path. Never a job board's or an applicant tracking system's. Give it when you know the company's site, as you do for well-known companies (hackerrank.com, grafana.com, pwc.com), or when the posting shows it. Never make one up from the company field: a code such as "EKCM" is not ekcm.com. Leave it empty when you are not sure: a wrong domain shows another company's logo, an empty one only the first letter of the name.

Answer for every posting, and copy its id."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["companies"],
    "properties": {
        "companies": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "name", "domain"],
                "properties": {"id": {"type": "string"}, "name": {"type": "string"}, "domain": {"type": "string"}},
            },
        }
    },
}


@dataclass(frozen=True)
class Company:
    name: str
    domain: str


def key_of(company: str) -> str:
    """What a company's answer is kept under: its name as the job database writes it, in one case and spacing."""
    return " ".join(company.lower().split())


def company_key(job: Job) -> str:
    return key_of(job.company)


def carried(host: str) -> bool:
    """True for a job board's or an applicant tracking system's host."""
    host = host.lower()
    return any(host == carrier or host.endswith("." + carrier) for carrier in CARRIERS)


def clean_domain(text: str) -> str:
    """A bare domain from what was written ("https://www.Cisco.com/careers" is cisco.com); empty for anything else, and
    for a job board or an applicant tracking system."""
    text = text.strip().lower()
    if not text:
        return ""
    try:
        host = urlparse(text if "//" in text else f"//{text}").hostname or ""
    except ValueError:
        return ""
    host = host.removeprefix("www.").rstrip(".")
    if not DOMAIN.match(host) or carried(host):
        return ""
    return host


def seen_domains(job: Job, limit: int = 6) -> list[str]:
    """The addresses a posting shows that may be its employer's: its link's host when that is no job board, and the
    domains its description writes."""
    found: list[str] = []
    for link in (job.url, job.apply_url):
        domain = clean_domain(urlparse(link).hostname or "") if link.startswith("http") else ""
        if domain and domain not in found:
            found.append(domain)
    for match in WRITTEN.finditer(job.description or ""):
        if len(found) >= limit:
            break
        domain = clean_domain(match.group(1))
        if domain and domain not in found:
            found.append(domain)
    return found


def _posting(index: int, job: Job) -> str:
    seen = ", ".join(seen_domains(job)) or "none"
    start = " ".join((job.description or "").split())[:DESCRIPTION_CHARS]
    return f"### c{index:02d}\nCompany field: {job.company}\nLink: {job.url}\nDomains in the posting: {seen}\nDescription starts: {start}"


async def name_companies(client: AsyncOpenAI, model: str, jobs: list[Job]) -> dict[str, Company]:
    """The employer behind each company the jobs name, by company_key: one posting is asked about per company, BATCH
    companies a request. A company the model gave no answer for is left out, to be asked about again."""
    firsts: dict[str, Job] = {}
    for job in jobs:
        firsts.setdefault(company_key(job), job)
    keys = list(firsts)
    named: dict[str, Company] = {}
    for start in range(0, len(keys), BATCH):
        batch = keys[start : start + BATCH]
        user = "\n\n".join(_posting(index, firsts[key]) for index, key in enumerate(batch))
        reply = await structured(client, model, SYSTEM, user, "companies", SCHEMA)
        by_id = {f"c{index:02d}": key for index, key in enumerate(batch)}
        for answer in reply.get("companies", []):
            if not isinstance(answer, dict):
                continue
            key = by_id.get(str(answer.get("id", "")))
            if key is None:
                continue
            name = " ".join(str(answer.get("name") or "").split())[:80]
            named[key] = Company(name, clean_domain(str(answer.get("domain") or "")))
    return await without_unknown_domains(named)


async def without_unknown_domains(named: dict[str, Company]) -> dict[str, Company]:
    """The same companies, with no domain where the icon service knows no such site: a made-up domain, or one with no logo."""
    unknown = await unknown_to_icons(sorted({company.domain for company in named.values() if company.domain}))
    return {key: Company(company.name, "") if company.domain in unknown else company for key, company in named.items()}


async def unknown_to_icons(domains: list[str], transport: httpx.AsyncBaseTransport | None = None) -> set[str]:
    """The domains the icon service answers 404 for. A domain it could not be asked about is kept: a missing logo then
    only shows the globe, which is better than dropping a real one."""
    if not domains:
        return set()
    at_once = asyncio.Semaphore(ICON_CHECKS_AT_ONCE)
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, transport=transport) as http:

        async def unknown(domain: str) -> bool:
            async with at_once:
                try:
                    reply = await http.get(ICONS, params={"domain": domain, "sz": "64"})
                except httpx.HTTPError:
                    return False
                return reply.status_code == 404

        verdicts = await asyncio.gather(*(unknown(domain) for domain in domains))
    return {domain for domain, gone in zip(domains, verdicts, strict=True) if gone}

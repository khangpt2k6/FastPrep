import asyncio
from typing import Any

import pytest

from agent_automation.agent import companies
from agent_automation.agent.companies import Company, clean_domain, company_key, name_companies, seen_domains
from agent_automation.memory.store import Store
from agent_automation.tools.database import Job


def job(company: str, url: str = "https://jobs.ashbyhq.com/acme/1", description: str = "") -> Job:
    return Job(url, company, "Engineer", "Tampa, FL", url, url, description)


@pytest.mark.parametrize(
    ("written", "domain"),
    [
        ("https://www.Cisco.com/careers", "cisco.com"),
        ("elevenlabs.io", "elevenlabs.io"),
        ("www.dtcc.com/", "dtcc.com"),
        ("boards.greenhouse.io", ""),
        ("cisco.wd5.myworkdayjobs.com", ""),
        ("not a domain", ""),
        ("", ""),
    ],
)
def test_a_written_address_becomes_a_bare_domain_and_a_job_board_none(written: str, domain: str) -> None:
    assert clean_domain(written) == domain


def test_a_posting_shows_its_own_site_and_the_domains_its_description_writes_but_no_job_board() -> None:
    posting = job("Snap", "https://careers.snap.com/jobs/1", "Apply on boards.greenhouse.io. Learn more at www.snap.com or snapchat.com.")
    assert seen_domains(posting) == ["careers.snap.com", "snap.com", "snapchat.com"]


def test_each_company_is_asked_about_once_and_its_answer_is_cleaned(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[str] = []

    async def structured(_client: Any, _model: str, _system: str, user: str, _name: str, _schema: dict[str, Any]) -> dict[str, Any]:
        asked.append(user)
        return {"companies": [
            {"id": "c00", "name": " Cisco ", "domain": "https://www.cisco.com"},
            {"id": "c01", "name": "DTCC", "domain": "ebxr.fa.us2.oraclecloud.com"},
            {"id": "c99", "name": "Nobody", "domain": "nobody.com"},
        ]}

    monkeypatch.setattr(companies, "structured", structured)
    jobs = [job("cisco/wd5/cisco_careers"), job("Cisco/WD5/cisco_careers"), job("DTCC Candidate Experience Site")]
    named = asyncio.run(name_companies(None, "m", jobs))  # type: ignore[arg-type]
    assert len(asked) == 1 and asked[0].count("### c") == 2
    assert named == {
        "cisco/wd5/cisco_careers": Company("Cisco", "cisco.com"),
        # The model's careers-site host is no company domain: the page shows a letter instead of a wrong logo.
        "dtcc candidate experience site": Company("DTCC", ""),
    }


def test_many_companies_go_in_batches(monkeypatch: pytest.MonkeyPatch) -> None:
    sizes: list[int] = []

    async def structured(_client: Any, _model: str, _system: str, user: str, _name: str, _schema: dict[str, Any]) -> dict[str, Any]:
        sizes.append(user.count("### c"))
        return {"companies": []}

    monkeypatch.setattr(companies, "structured", structured)
    asyncio.run(name_companies(None, "m", [job(f"Company {n}") for n in range(companies.BATCH + 5)]))  # type: ignore[arg-type]
    assert sizes == [companies.BATCH, 5]


def test_the_store_keeps_each_companys_name_and_domain(tmp_path: Any) -> None:
    store = Store(tmp_path / "jobs.db")
    store.set_companies({company_key(job("Cisco")): ("Cisco", "cisco.com")})
    store.set_companies({"cisco": ("Cisco Systems", "cisco.com"), "dtcc": ("DTCC", "")})
    assert store.companies() == {"cisco": ("Cisco Systems", "cisco.com"), "dtcc": ("DTCC", "")}
    store.close()
    assert Store(tmp_path / "jobs.db").companies()["dtcc"] == ("DTCC", "")

"""Cover letters in the flow of an application: written before the form, its file and text in the brief, a hook's say, and
the web page's choice and edits through Supabase."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest

from agent_automation.agent import session as session_module
from agent_automation.agent.apply import Outcome, run_on_page
from agent_automation.agent.cover_letter import Letter, letter_key
from agent_automation.agent.cover_letter.sync import LETTERS, SETTINGS, TEMPLATES, CoverLetters
from agent_automation.agent.session import Session
from agent_automation.tools.database import Job
from fakes import ScriptedBrowser, ScriptedModel, tool_call

JOB = Job("gh:9", "Acme Robotics", "Backend Engineer", "Austin, TX", "https://acme.example/9", "https://acme.example/9", "Python and PostgreSQL.")
CV = "# Ada Rossi\nBackend engineer. Cut API latency 40% at Foo Inc."
SLOTS = {"opening": "I cut API latency 40% at Foo Inc.", "evidence": "Python and PostgreSQL daily.", "why_company": "Your fleet data.",
         "closing": "Could we talk?"}


def session_at(tmp_path: Path, preferences: str = "") -> Session:
    tmp_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "cv.md").write_text(CV, encoding="utf-8")
    (tmp_path / "data" / "cvs").mkdir(parents=True)
    (tmp_path / "data" / "cvs" / "original-cv.pdf").write_bytes(b"%PDF-1.4 cv")
    if preferences:
        (tmp_path / "preferences.md").write_text(preferences, encoding="utf-8")
    session = Session(tmp_path)
    session.store.add(JOB)
    session.store.set_answer("full_name", "Ada Rossi")
    session.store.set_answer("email", "ada@example.com")
    return session


def letter_model(**slots: str) -> ScriptedModel:
    return ScriptedModel(json.dumps(slots or SLOTS))


@pytest.mark.letters
def test_the_letter_follows_the_template_preferences_md_picks_and_its_pdf_sits_under_the_cv_folder(tmp_path: Path) -> None:
    session = session_at(tmp_path, "---\ncover_letter:\n  template: concise\n---\n")
    session._client = letter_model(opening="I cut latency 40%.", fit="Python daily.", closing="Could we talk?")  # type: ignore[assignment]
    letter = asyncio.run(session.cover_letter(session.store.get(JOB.id)))
    assert letter is not None and letter.template_id == "concise"
    assert letter.text.startswith("Dear Hiring Team,\n\nI cut latency 40%.")
    assert letter.pdf == tmp_path / "data" / "cvs" / "cover-letters" / letter_key(JOB.id) / "Cover_Letter_Ada_Rossi_Acme_Robotics.pdf"
    assert letter.pdf.read_bytes().startswith(b"%PDF")


@pytest.mark.letters
def test_a_letter_written_hook_can_change_the_letter_or_stop_it(tmp_path: Path) -> None:
    session = session_at(tmp_path)
    (tmp_path / "hooks").mkdir()
    (tmp_path / "hooks" / "sign.py").write_text(
        "import json, sys\nevent = json.load(sys.stdin)\n"
        "if 'Evil' in event['job']['company']:\n    print('not this one', file=sys.stderr); sys.exit(2)\n"
        "print(json.dumps({'letter': event['letter'] + 'P.S. Signed by hook.'}))\n", encoding="utf-8")
    (tmp_path / "settings.yaml").write_text("hooks:\n  letter_written:\n    - run: [python, hooks/sign.py]\n", encoding="utf-8")
    session._client = letter_model()  # type: ignore[assignment]
    letter = asyncio.run(session.cover_letter(session.store.get(JOB.id)))
    assert letter is not None and letter.text.endswith("P.S. Signed by hook.\n")
    session.store.add(Job("ev:1", "Evil Corp", "Engineer", "", "https://evil.example/1", "https://evil.example/1", ""))
    session._client = letter_model()  # type: ignore[assignment]
    said: list[str] = []
    assert asyncio.run(session.cover_letter(session.store.get("ev:1"), log=said.append)) is None
    assert said == ["No cover letter for Evil Corp: not this one"]


def captured(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    seen: dict[str, Any] = {}

    async def apply_to_job(*args: Any, **kwargs: Any) -> Outcome:
        seen.update(kwargs, guidance=args[8], answers=args[4])
        return Outcome("submitted", "sent")

    monkeypatch.setattr(session_module, "apply_to_job", apply_to_job)
    return seen


@pytest.mark.letters
def test_an_application_writes_its_letter_first_and_gives_the_form_its_text_and_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = session_at(tmp_path)
    session._client = letter_model()  # type: ignore[assignment]
    seen = captured(monkeypatch)
    outcome = asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None))
    assert outcome.status == "submitted"
    text, pdf = seen["cover"]
    assert "I cut API latency 40% at Foo Inc." in text and pdf.is_file() and pdf.suffix == ".pdf"
    assert "How to write as the candidate" in seen["guidance"] and "Never use an en dash" in seen["guidance"]


@pytest.mark.letters
def test_letters_off_in_preferences_md_or_none_given_sends_no_letter(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = session_at(tmp_path, "---\ncover_letter:\n  enabled: false\n---\n")
    session._client = ScriptedModel()  # type: ignore[assignment]
    seen = captured(monkeypatch)
    asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None))
    assert seen.get("cover") is None
    session = session_at(tmp_path / "two")
    session._client = ScriptedModel()  # type: ignore[assignment]
    seen = captured(monkeypatch)
    asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None, cover=None))
    assert seen.get("cover") is None


@pytest.mark.letters
def test_a_letter_that_cannot_be_written_never_stops_the_application(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = session_at(tmp_path)
    session._client = ScriptedModel("not json")  # type: ignore[assignment]
    seen = captured(monkeypatch)
    said: list[str] = []
    outcome = asyncio.run(session.apply(session.store.get(JOB.id), said.append))
    assert outcome.status == "submitted" and seen.get("cover") is None
    assert any(line.startswith("No cover letter for Acme Robotics") for line in said)


def test_a_before_apply_hook_skips_the_job_without_opening_the_form(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = session_at(tmp_path, "---\nskip_companies: [acme]\n---\n")
    seen = captured(monkeypatch)
    outcome = asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None))
    assert outcome.status == "blocked" and outcome.reason == "hook" and "skip_companies" in outcome.summary
    assert seen == {} and session.store.get(JOB.id).status == "blocked"


def test_the_brief_gives_the_letters_file_and_text_and_says_nothing_of_one_when_there_is_none(tmp_path: Path) -> None:
    pdf = tmp_path / "Cover_Letter.pdf"
    cases: list[tuple[tuple[str, Path] | None, bool]] = [(("Dear team,\nI build things.\n", pdf), True), (None, False)]
    for cover, expected in cases:
        model = ScriptedModel([tool_call("finish_form", status="blocked", summary="stop", submit_selector="", blocked_by="other")])
        asyncio.run(run_on_page(ScriptedBrowser(), [], model, "m", JOB, "cv", "answers", Path("cv.pdf"), tmp_path / "s.png", cover=cover))  # type: ignore[arg-type]
        brief = model.requests[0]["messages"][1]["content"]
        assert (f"The cover letter file to upload: {pdf}" in brief and "Dear team,\nI build things." in brief) is expected
        assert ("cover letter" in brief) is expected
        assert "A cover letter field, required or not, gets the cover letter" in model.requests[0]["messages"][0]["content"]


class Remote:
    """Supabase as the worker sees it: tables as lists of rows, and the files uploaded."""

    def __init__(self, **tables: list[dict[str, Any]]) -> None:
        self.user_id = "u1"
        self.tables = {name: list(rows) for name, rows in tables.items()}
        self.files: dict[str, tuple[bytes, str]] = {}

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        rows = self.tables.get(table, [])
        for column, condition in params.items():
            if condition.startswith("eq.") and column != "user_id":
                rows = [row for row in rows if str(row.get(column)) == condition[3:]]
        return rows

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        keys = [key for key in conflict.split(",") if key != "user_id"]
        kept = self.tables.setdefault(table, [])
        for row in rows:
            kept[:] = [old for old in kept if any(old.get(key) != row.get(key) for key in keys)] + [row]

    async def upload(self, path: str, data: bytes, content_type: str = "image/png") -> None:
        self.files[path] = (data, content_type)


@pytest.mark.letters
def test_the_page_gets_the_templates_and_the_letter_written_with_the_one_it_picked_as_a_pdf(tmp_path: Path) -> None:
    session = session_at(tmp_path)
    session._client = letter_model(opening="I cut latency.", fit="Python.", closing="Talk?")  # type: ignore[assignment]
    db = Remote(**{SETTINGS: [{"enabled": True, "template_id": "concise"}]})
    letters = CoverLetters(db, session, print)
    asyncio.run(letters.publish())
    assert {row["id"] for row in db.tables[TEMPLATES]} >= {"classic", "concise", "impact", "story", "new-grad"}
    assert all(row["builtin"] for row in db.tables[TEMPLATES])
    letter = asyncio.run(letters.for_job(session.store.get(JOB.id)))
    assert letter is not None and letter.template_id == "concise"
    row = db.tables[LETTERS][0]
    assert row["job_id"] == JOB.id and row["template_id"] == "concise" and row["updated_by"] == "agent" and "I cut latency." in row["body"]
    remote = f"u1/cover-letters/{letter_key(JOB.id)}.pdf"
    data, kind = db.files[remote]
    assert data.startswith(b"%PDF") and kind == "application/pdf" and row["pdf_path"] == remote


@pytest.mark.letters
def test_a_letter_edited_on_the_page_is_sent_as_the_person_left_it_with_no_model(tmp_path: Path) -> None:
    session = session_at(tmp_path)
    session._client = ScriptedModel()  # type: ignore[assignment]
    edited = "Dear Acme,\n\nMy own words.\n\nAda\n"
    db = Remote(**{LETTERS: [{"job_id": JOB.id, "template_id": "story", "body": edited, "updated_by": "web"}]})
    letter = asyncio.run(CoverLetters(db, session, print).for_job(session.store.get(JOB.id)))
    assert letter is not None and letter.text == edited and letter.template_id == "story" and session._client.requests == []
    assert db.tables[LETTERS][0]["updated_by"] == "web"


@pytest.mark.letters
def test_letters_off_on_the_page_write_nothing_unless_asked_for_and_a_page_template_is_used(tmp_path: Path) -> None:
    session = session_at(tmp_path)
    session._client = letter_model(hi="Hello from my template.")  # type: ignore[assignment]
    mine = {"id": "mine-x", "name": "Mine", "description": "", "body": "{{hi: one line}}\n{{full_name}}\n", "builtin": False}
    db = Remote(**{SETTINGS: [{"enabled": False, "template_id": "mine-x"}], TEMPLATES: [mine]})
    letters = CoverLetters(db, session, print)
    assert asyncio.run(letters.for_job(session.store.get(JOB.id))) is None
    letter = asyncio.run(letters.for_job(session.store.get(JOB.id), always=True))
    assert letter is not None and letter.text == "Hello from my template.\nAda Rossi\n" and letter.template_id == "mine-x"


def test_a_given_letter_goes_to_the_form_as_it_is(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = session_at(tmp_path)
    session._client = ScriptedModel()  # type: ignore[assignment]
    seen = captured(monkeypatch)
    pdf = tmp_path / "data" / "cvs" / "given.pdf"
    pdf.write_bytes(b"%PDF")
    asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None, cover=Letter("classic", "Given.\n", {}, pdf=pdf)))
    assert seen["cover"] == ("Given.\n", pdf)


@pytest.mark.letters
def test_a_job_whose_id_is_a_whole_url_still_gets_its_letter_in_a_short_path(tmp_path: Path) -> None:
    session = session_at(tmp_path)
    long_id = "https://cisco.wd5.myworkdayjobs.com/Cisco_Careers/job/San-Jose-California-US/Software-Engineer-Full-Stack-Backend-I-Intern_2001234"
    session.store.add(Job(long_id, "Cisco", "Software Engineer", "San Jose", long_id, long_id, "Python."))
    session._client = letter_model()  # type: ignore[assignment]
    letter = asyncio.run(session.cover_letter(session.store.get(long_id)))
    assert letter is not None and letter.pdf is not None and letter.pdf.is_file()
    folder = letter.pdf.parent.name
    assert len(folder) <= 43 and folder.startswith("https-cisco-wd5-myworkdayjobs-co")
    assert letter_key(long_id) != letter_key(long_id + "x")


def test_a_kept_transcript_goes_with_the_application_and_none_says_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = session_at(tmp_path)
    session._client = ScriptedModel()  # type: ignore[assignment]
    seen = captured(monkeypatch)
    asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None, cover=None))
    assert "transcript" not in seen and session.transcript() is None

    session = session_at(tmp_path / "two")
    session._client = ScriptedModel()  # type: ignore[assignment]
    session.keep_transcript("Fall 2026.PDF", b"%PDF-1.4 old")
    kept = session.keep_transcript("grades.png", b"png")
    assert kept == tmp_path / "two" / "data" / "cvs" / "documents" / "transcript.png" and [p.name for p in kept.parent.iterdir()] == ["transcript.png"]
    seen = captured(monkeypatch)
    asyncio.run(session.apply(session.store.get(JOB.id), lambda line: None, cover=None))
    assert seen["transcript"] == kept
    session.drop_transcript()
    assert session.transcript() is None


def test_the_brief_names_the_transcript_only_when_there_is_one(tmp_path: Path) -> None:
    pdf = tmp_path / "transcript.pdf"
    for transcript in (pdf, None):
        model = ScriptedModel([tool_call("finish_form", status="blocked", summary="stop", submit_selector="", blocked_by="other")])
        asyncio.run(run_on_page(ScriptedBrowser(), [], model, "m", JOB, "cv", "answers", Path("cv.pdf"), tmp_path / "s.png", transcript=transcript))  # type: ignore[arg-type]
        brief = model.requests[0]["messages"][1]["content"]
        assert (f"only where the form asks for a transcript: {pdf}" in brief) is (transcript is not None)
        assert ("transcript" in brief) is (transcript is not None)
        assert "A field that asks for a transcript" in model.requests[0]["messages"][0]["content"]

"""Cover letters: the templates and skills, the slots the model writes, the rules held after it, and the PDF."""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path

import pytest
from pypdf import PdfReader

from agent_automation.agent.cover_letter import (
    CoverLetterError,
    Template,
    candidate_voice,
    check_body,
    fields_for,
    file_name,
    fill,
    lint,
    load_skills,
    load_templates,
    parse_template,
    polish,
    render_pdf,
    write_letter,
)
from agent_automation.home import Home, bundled_home
from agent_automation.tools.database import Job
from fakes import ScriptedModel

JOB = Job("gh:1", "Acme Robotics", "Backend Engineer", "Austin, TX", "https://acme.example/jobs/1", "https://acme.example/jobs/1",
          "We need a backend engineer who knows Python and PostgreSQL to scale our fleet telemetry pipeline.")
ANSWERS = {
    "first_name": "Ada", "last_name": "Rossi", "full_name": "Ada Rossi", "email": "ada@example.com", "phone": "555-0100",
    "location": "Austin, TX", "linkedin": "https://linkedin.com/in/ada", "account_password": "hunter2-secret", "gender": "Female",
    "skills": "Python, PostgreSQL",
}
CV = "# Ada Rossi\nBackend engineer. Cut API latency 40% at Foo Inc. Python, PostgreSQL."
TODAY = date(2026, 11, 12)
PROJECT = Home(bundled_home(), None)


def test_every_bundled_template_parses_and_has_slots_for_the_model() -> None:
    templates = load_templates(PROJECT)
    assert {"classic", "concise", "impact", "story", "new-grad"} <= set(templates)
    for template in templates.values():
        assert template.builtin and template.name and template.description
        assert template.slots(), template.id
        assert "{{full_name}}" in template.body


def test_every_bundled_skill_loads_with_a_name_and_rules() -> None:
    skills = load_skills(PROJECT)
    assert len(skills) >= 7
    assert all(skill.name and skill.description and skill.body for skill in skills)
    voice = next(skill for skill in skills if "person" in skill.name.lower())
    assert "em dash" in voice.body


def test_a_slot_keeps_its_instruction_a_field_is_not_a_slot_and_a_repeated_slot_is_one() -> None:
    template = parse_template("t", "Dear {{hiring_manager}},\n{{hook: One line.\n  Be brief.}}\n{{hook}}\n{{other}}\n{{full_name}}")
    assert [(slot.name, slot.instruction) for slot in template.slots()] == [
        ("hook", "One line. Be brief."), ("other", "Two to four sentences that fit this place in the letter."),
    ]


@pytest.mark.parametrize("body", ["", "Hi {{name\nthere", "Hi {{first name}}", "Hi }} there", "{{hook: one line.\n\nBest,\n{{full_name}}"])
def test_a_broken_template_says_what_is_wrong(body: str) -> None:
    assert check_body(body)
    with pytest.raises(CoverLetterError):
        parse_template("bad", body)


def test_empty_fields_take_their_separators_and_their_line_with_them() -> None:
    body = "{{full_name}}\n{{location}} | {{email}} | {{phone}} | {{linkedin}}\n{{github}}\n\nDear {{hiring_manager}},\n\n{{hook: x}}\n"
    values = {"full_name": "Ada Rossi", "location": "", "email": "ada@example.com", "phone": "", "linkedin": "in/ada", "github": "",
              "hiring_manager": "Hiring Team", "hook": "I build backends."}
    assert fill(body, values) == "Ada Rossi\nada@example.com | in/ada\n\nDear Hiring Team,\n\nI build backends.\n"


def test_the_fields_come_from_the_profile_and_the_job_and_the_name_from_the_cv_when_the_profile_has_none() -> None:
    fields = fields_for(ANSWERS, JOB, CV, TODAY)
    assert fields["full_name"] == "Ada Rossi" and fields["company"] == "Acme Robotics" and fields["job_title"] == "Backend Engineer"
    assert fields["today"] == "November 12, 2026" and fields["hiring_manager"] == "Hiring Team"
    assert fields_for({}, JOB, CV, TODAY)["full_name"] == "Ada Rossi"
    assert fields_for({}, JOB, "ada@example.com\nstuff", TODAY)["full_name"] == ""


def test_polish_takes_out_dashes_markdown_quotes_and_labels() -> None:
    raw = '"**Why:** I led the move — it cut costs – a lot, from 2019–2021.\n* shipped it"'
    assert polish(raw) == "I led the move - it cut costs - a lot, from 2019-2021.\n- shipped it"


def test_lint_names_what_breaks_the_rules() -> None:
    assert lint("I built the billing service and cut errors by half.") == []
    found = lint("I am passionate about [Company]! Furthermore, synergy.")
    assert any("passionate" in problem for problem in found)
    assert "it has a placeholder in brackets" in found and "it has an exclamation mark" in found


def _reply(**slots: str) -> str:
    return json.dumps(slots)


def test_only_the_slots_are_written_and_the_rest_of_the_template_stays_as_it_is() -> None:
    template = load_templates(PROJECT)["concise"]
    model = ScriptedModel(_reply(opening="I cut API latency 40% at Foo Inc, and I want to do that for Acme's telemetry.",
                                 fit="Your posting names Python and PostgreSQL. I use both daily.",
                                 closing="Could we talk this week?"))
    letter = asyncio.run(write_letter(model, "m", template, JOB, CV, ANSWERS, load_skills(PROJECT), TODAY))  # type: ignore[arg-type]
    assert letter.text == (
        "Dear Hiring Team,\n\nI cut API latency 40% at Foo Inc, and I want to do that for Acme's telemetry.\n\n"
        "Your posting names Python and PostgreSQL. I use both daily.\n\nCould we talk this week?\n\n"
        "Best regards,\nAda Rossi\nada@example.com | 555-0100\n"
    )
    assert letter.problems == [] and letter.template_id == "concise"
    request = model.requests[0]
    assert request["response_format"]["json_schema"]["schema"]["required"] == ["opening", "fit", "closing"]
    system, brief = request["messages"][0]["content"], request["messages"][1]["content"]
    assert "Only true facts" in system and "Sound like a person" in system
    assert "fleet telemetry pipeline" in brief and "Cut API latency 40%" in brief


def test_the_password_and_the_private_answers_never_reach_the_letter_model() -> None:
    model = ScriptedModel(_reply(opening="a.", fit="b.", closing="c."))
    asyncio.run(write_letter(model, "m", load_templates(PROJECT)["concise"], JOB, CV, ANSWERS, load_skills(PROJECT), TODAY))  # type: ignore[arg-type]
    sent = json.dumps(model.requests[0]["messages"])
    assert "hunter2-secret" not in sent and "Female" not in sent
    assert "PostgreSQL" in sent


def test_a_slot_that_breaks_a_rule_is_written_once_more_with_the_reason() -> None:
    template = parse_template("t", "Dear {{hiring_manager}},\n\n{{hook: One line.}}\n\n{{full_name}}")
    model = ScriptedModel(_reply(hook="I am passionate about robots!"), _reply(hook="I build robot backends that stay up."))
    letter = asyncio.run(write_letter(model, "m", template, JOB, CV, ANSWERS, load_skills(PROJECT), TODAY))  # type: ignore[arg-type]
    assert len(model.requests) == 2
    retry = model.requests[1]["messages"][1]["content"]
    assert 'it says "passionate"' in retry and "exclamation" in retry
    assert "I build robot backends that stay up." in letter.text and letter.problems == []


def test_what_still_breaks_a_rule_after_the_second_try_is_kept_as_a_problem() -> None:
    template = parse_template("t", "{{hook: One line.}}")
    model = ScriptedModel(_reply(hook="Synergy."), _reply(hook="Synergy again."))
    letter = asyncio.run(write_letter(model, "m", template, JOB, CV, ANSWERS, load_skills(PROJECT), TODAY))  # type: ignore[arg-type]
    assert letter.problems == ['hook: it says "synergy"']


def test_a_template_with_no_slots_is_filled_with_no_model() -> None:
    model = ScriptedModel()
    letter = asyncio.run(write_letter(model, "m", parse_template("t", "Hello {{company}}, from {{full_name}}."), JOB, CV, ANSWERS, (), TODAY))  # type: ignore[arg-type]
    assert letter.text == "Hello Acme Robotics, from Ada Rossi.\n" and model.requests == []


def test_the_persons_own_templates_and_skills_win_over_bundled_ones_of_the_same_name(tmp_path: Path) -> None:
    (tmp_path / "styles" / "cover-letters").mkdir(parents=True)
    (tmp_path / "styles" / "cover-letters" / "classic.md").write_text("---\nname: Mine\n---\nHi {{company}}. {{body: x}}", encoding="utf-8")
    (tmp_path / "skills" / "cover-letter" / "voice").mkdir(parents=True)
    (tmp_path / "skills" / "cover-letter" / "voice" / "SKILL.md").write_text("---\nname: My voice\norder: 0\n---\nTalk plainly.", encoding="utf-8")
    home = Home(bundled_home(), tmp_path)
    templates = load_templates(home)
    assert templates["classic"].name == "Mine" and not templates["classic"].builtin
    assert templates["concise"].builtin
    names = [skill.name for skill in load_skills(home)]
    assert names[0] == "My voice" and "Sound like a person" not in names and "Only true facts" in names


def test_the_skills_come_in_their_order_and_the_candidates_voice_reaches_the_model(tmp_path: Path) -> None:
    assert [skill.name for skill in load_skills(PROJECT)][:2] == ["Only true facts", "Match the job with proof"]
    (tmp_path / "preferences.md").write_text("---\nstyle: warm\ntone: calm and direct\navoid: [salary]\n---\nI coach a robotics team.", encoding="utf-8")
    model = ScriptedModel(_reply(opening="a.", fit="b.", closing="c."))
    voice = candidate_voice(Home(bundled_home(), tmp_path))
    asyncio.run(write_letter(model, "m", load_templates(PROJECT)["concise"], JOB, CV, ANSWERS, load_skills(PROJECT), TODAY, voice))  # type: ignore[arg-type]
    system = model.requests[0]["messages"][0]["content"]
    for said in ("Writing style, Warm", "tone: calm and direct", "never mention: salary", "I coach a robotics team.", "Never use an en dash"):
        assert said in system


def test_the_pdf_holds_the_letter(tmp_path: Path) -> None:
    text = "Ada Rossi\nada@example.com\n\nDear Hiring Team,\n\nI build backends at Café Zürich.\n"
    path = render_pdf(text, tmp_path / "out" / "letter.pdf", "Cover letter", "Ada Rossi")
    assert path.read_bytes().startswith(b"%PDF")
    extracted = " ".join(PdfReader(str(path)).pages[0].extract_text().split())
    assert "Dear Hiring Team," in extracted and "Ada Rossi" in extracted and "backends" in extracted


def test_the_file_name_is_plain_and_names_the_person_and_the_company() -> None:
    assert file_name("Nguyễn Văn An", "Acme, Inc.") == "Cover_Letter_Nguyen_Van_An_Acme_Inc.pdf"
    assert file_name("", "Acme") == "Cover_Letter_Acme.pdf"


def test_a_template_made_on_the_page_is_a_template() -> None:
    template = Template("mine", "Mine", "", "Hi {{company}}.\n{{why: one line}}\n")
    assert [slot.name for slot in template.slots()] == ["why"]

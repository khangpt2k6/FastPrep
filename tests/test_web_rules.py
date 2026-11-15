"""The dashboard's Rules page, as the agent takes it in: what it publishes, and what it writes into the person's home."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agent_automation.agent.cover_letter import load_skills
from agent_automation.home import Home, bundled_home
from agent_automation.memory.web_rules import (
    ALWAYS_END,
    ALWAYS_START,
    SECTIONS_SKILL,
    answer_rules_text,
    builtin_rules,
    cover_letter_files,
    mirror_rules,
    with_block,
)


def home(tmp_path: Path) -> Home:
    return Home(bundled_home(), tmp_path)


def builtin(name: str, **rest: Any) -> dict[str, Any]:
    return {"id": f"cover-letter/{name}", "kind": "cover_letter", "title": name, "builtin": True, "enabled": True, "updated_by": "agent", **rest}


def test_the_shipped_rules_are_every_cover_letter_skill_and_the_agent_md(tmp_path: Path) -> None:
    rows = {row["id"]: row for row in builtin_rules(home(tmp_path))}
    assert {"cover-letter/truth", "cover-letter/plain", "cover-letter/voice", "always/builtin"} <= set(rows)
    plain = rows["cover-letter/plain"]
    assert plain["kind"] == "cover_letter" and plain["builtin"] and plain["sort"] == 5.0
    assert "recruiter" in plain["default_body"]
    assert rows["always/builtin"]["kind"] == "always"


def test_a_shipped_rule_nobody_touched_writes_no_file(tmp_path: Path) -> None:
    assert cover_letter_files([builtin("plain", body="x")]) == {}


def test_an_edited_or_turned_off_rule_overrides_the_project_one(tmp_path: Path) -> None:
    rows = [
        builtin("plain", body="Name at most one tool.", updated_by="web", sort=5),
        builtin("keywords", body="", default_body="Shipped text.", enabled=False),
    ]
    mine = home(tmp_path)
    mirror_rules(mine, rows)
    skills = {skill.name: skill for skill in load_skills(mine)}
    assert skills["plain"].body == "Name at most one tool."
    assert "Job Description Alignment" not in skills and "keywords" not in skills
    # The shipped rules nobody changed still apply.
    assert "Factual Accuracy" in skills


def test_own_rules_and_sections_become_skills(tmp_path: Path) -> None:
    rows = [
        {"id": "cover-letter/mine-short", "kind": "cover_letter", "title": "Short", "body": "Keep it under 200 words.", "builtin": False, "sort": 8},
        {"id": "cover-letter/mine-empty", "kind": "cover_letter", "title": "Empty", "body": "  ", "builtin": False},
        {"id": "section/why_company", "kind": "section", "title": "why_company", "body": "Name one product.", "enabled": True},
        {"id": "section/closing", "kind": "section", "title": "closing", "body": "Say thanks once.", "enabled": False},
    ]
    files = cover_letter_files(rows)
    assert set(files) == {"mine-short", SECTIONS_SKILL}
    assert "why_company: Name one product." in files[SECTIONS_SKILL] and "closing" not in files[SECTIONS_SKILL]
    mine = home(tmp_path)
    mirror_rules(mine, rows)
    names = [skill.name for skill in load_skills(mine)]
    assert "Short" in names and "Parts of the letter" in names


def test_files_the_agent_wrote_follow_the_page_and_hand_written_ones_stay(tmp_path: Path) -> None:
    mine = home(tmp_path)
    mirror_rules(mine, [builtin("plain", body="Edited.", updated_by="web")])
    written = tmp_path / "skills" / "cover-letter" / "plain" / "SKILL.md"
    assert written.is_file()
    # Reset on the page: the override goes, and the project's rule applies again.
    mirror_rules(mine, [builtin("plain", body="Shipped.")])
    assert not written.exists()

    hand = tmp_path / "skills" / "cover-letter" / "voice" / "SKILL.md"
    hand.parent.mkdir(parents=True)
    hand.write_text("---\nname: My voice\n---\nTalk plainly.\n", encoding="utf-8")
    mirror_rules(mine, [builtin("voice", body="From the page.", updated_by="web")])
    assert hand.read_text(encoding="utf-8") == "---\nname: My voice\n---\nTalk plainly.\n"
    mirror_rules(mine, [])
    assert hand.is_file()


def test_standing_rules_are_a_block_at_the_end_of_agent_md(tmp_path: Path) -> None:
    mine = home(tmp_path)
    agent_md = tmp_path / "AGENT.md"
    agent_md.write_text("# Mine\n\n- Never mention my old job.\n", encoding="utf-8")
    rules = [
        {"id": "always/builtin", "kind": "always", "builtin": True, "body": "Shipped, never copied."},
        {"id": "always/one", "kind": "always", "body": "Keep answers short.", "sort": 1},
        {"id": "always/two", "kind": "always", "body": "Off.", "enabled": False},
    ]
    mirror_rules(mine, rules)
    text = agent_md.read_text(encoding="utf-8")
    assert text.startswith("# Mine") and ALWAYS_START in text and "- Keep answers short." in text
    assert "Shipped, never copied." not in text and "Off." not in text
    assert "Keep answers short." in mine.agent_md()
    # Taken off the page: the block goes, the person's own text stays.
    mirror_rules(mine, [])
    assert agent_md.read_text(encoding="utf-8") == "# Mine\n\n- Never mention my old job.\n"


def test_an_agent_md_made_only_for_the_block_goes_with_it(tmp_path: Path) -> None:
    mine = home(tmp_path)
    mirror_rules(mine, [{"id": "always/one", "kind": "always", "body": "Be brief."}])
    assert (tmp_path / "AGENT.md").is_file()
    mirror_rules(mine, [])
    assert not (tmp_path / "AGENT.md").exists()


def test_the_block_is_replaced_not_stacked() -> None:
    once = with_block("Mine.", f"{ALWAYS_START}\nA\n{ALWAYS_END}")
    twice = with_block(once, f"{ALWAYS_START}\nB\n{ALWAYS_END}")
    assert twice.count(ALWAYS_START) == 1 and "\nB\n" in twice and "\nA\n" not in twice


def test_answer_rules_are_text_for_the_brief() -> None:
    rows = [
        {"id": "answer/why-company", "kind": "answer", "title": "Why this company", "body": "One specific reason.", "sort": 2},
        {"id": "answer/salary", "kind": "answer", "title": "Salary", "body": "Say negotiable.", "enabled": False},
        {"id": "answer/empty", "kind": "answer", "title": "Empty", "body": ""},
    ]
    text = answer_rules_text(rows)
    assert "- Why this company: One specific reason." in text
    assert "Salary" not in text and "Empty" not in text
    assert answer_rules_text([]) == ""

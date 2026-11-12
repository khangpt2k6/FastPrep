"""The agent's home: the project's .agent/ and the person's own folder, read the way Claude Code reads its .claude folders."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from agent_automation.home import Home, HomeError, Memory, bundled_home, slugify
from agent_automation.hooks.runner import run_hooks
from agent_automation.memory.web_profile import home_writing, mirror_to_home
from agent_automation.skills import load_skills, skill_for


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def test_the_projects_home_has_every_part_a_person_can_override() -> None:
    home = bundled_home()
    for part in ("AGENT.md", "settings.yaml", "preferences.md", "memory/MEMORY.md", "hooks/README.md"):
        assert (home / part).is_file(), part
    assert {"sites", "always", "cover-letter"} <= {folder.name for folder in (home / "skills").iterdir()}
    assert {"writing", "cover-letters"} <= {folder.name for folder in (home / "styles").iterdir()}
    project = Home(home, None)
    assert {"plain", "warm", "formal"} <= set(project.styles("writing"))
    assert project.style().name == "plain"
    assert "Never use an en dash" in project.standing() and "Writing style, Plain" in project.standing()


def test_both_agent_md_are_read_the_projects_first(tmp_path: Path) -> None:
    write(tmp_path / "AGENT.md", "Always mention I am open to remote work.")
    text = Home(bundled_home(), tmp_path).agent_md()
    assert text.index("Truth") < text.index("open to remote work")


def test_the_persons_preferences_win_key_by_key_and_their_notes_replace_the_projects(tmp_path: Path) -> None:
    write(tmp_path / "preferences.md", "---\nstyle: warm\ncover_letter:\n  template: impact\n---\nI like short answers.")
    values, notes = Home(bundled_home(), tmp_path).preferences()
    assert values["style"] == "warm" and values["cover_letter"] == {"enabled": True, "template": "impact"}
    assert values["skip_companies"] == [] and notes == "I like short answers."
    assert Home(bundled_home(), tmp_path).style().name == "warm"


def test_a_style_that_is_not_there_falls_back_to_plain(tmp_path: Path) -> None:
    write(tmp_path / "preferences.md", "---\nstyle: pirate\n---\n")
    assert Home(bundled_home(), tmp_path).style().name == "plain"


def test_the_persons_skill_in_the_new_layout_wins_and_an_old_plugins_file_is_still_read(tmp_path: Path) -> None:
    write(tmp_path / "skills" / "sites" / "greenhouse" / "SKILL.md", "---\nname: greenhouse\nhosts: [greenhouse.io]\n---\nMine.")
    write(tmp_path / "skills" / "always" / "tone" / "SKILL.md", "---\nname: tone\n---\nBe kind.")
    write(tmp_path / "plugins" / "mysite.md", "---\nhosts: [my.example]\n---\nOld style.")
    skills = load_skills(tmp_path)
    assert skill_for("https://boards.greenhouse.io/acme/jobs/1", skills).instructions == "Mine."
    assert skill_for("https://my.example/1", skills).instructions == "Old style."
    assert any(skill.name == "tone" and skill.always for skill in skills)


def test_every_bundled_site_skill_says_what_it_is_for() -> None:
    sites = Home(bundled_home(), None).skills("sites")
    assert len(sites) >= 14
    assert all(doc.meta.get("description") and doc.meta.get("hosts") for doc in sites.values())


def test_a_broken_front_matter_names_its_file(tmp_path: Path) -> None:
    write(tmp_path / "preferences.md", "---\nstyle: [\n---\n")
    with pytest.raises(HomeError, match="preferences.md"):
        Home(bundled_home(), tmp_path).preferences()


def test_memory_is_kept_one_file_per_answer_with_an_index_and_the_pinned_come_first(tmp_path: Path) -> None:
    home = Home(bundled_home(), tmp_path)
    home.remember(Memory("Why do you want to work here?", "I like robots.", company="Acme", updated="2026-11-01"))
    home.remember(Memory("Salary expectations?", "Open to discuss.", pinned=True, updated="2026-10-01"))
    assert sorted(path.name for path in (tmp_path / "memory").iterdir()) == ["MEMORY.md", "salary-expectations.md", "why-do-you-want-to-work-here.md"]
    index = (tmp_path / "memory" / "MEMORY.md").read_text(encoding="utf-8")
    assert "[Why do you want to work here?](why-do-you-want-to-work-here.md) - Acme" in index and "(pinned)" in index
    assert home.memory_text().startswith("Q: Salary expectations? (pinned: use as written)")
    home.forget("salary-expectations")
    assert [m.question for m in home.memories()] == ["Why do you want to work here?"]
    assert slugify("Tại sao bạn muốn làm ở đây?") == "tai-sao-ban-muon-lam-o-day"
    assert slugify("???").startswith("answer-")


def test_the_dashboard_is_mirrored_into_the_home_one_way_and_a_hand_written_answer_is_kept(tmp_path: Path) -> None:
    home = Home(bundled_home(), tmp_path)
    write(tmp_path / "preferences.md", "---\nstyle: formal\nskip_companies: [Evil Corp]\n---\nold notes")
    home.remember(Memory("My own question?", "Typed by hand."))
    rows = [
        {"id": 7, "question": "Why us?", "answer": "Your robots.", "source": "user", "pinned": True, "updated_at": "2026-11-10T10:00:00Z"},
        {"id": 8, "question": "Notice period?", "answer": "Two weeks.", "source": "learned", "company": "Acme", "updated_at": "2026-11-09T10:00:00Z"},
    ]
    mirror_to_home(home, {"tone": "warm", "length": "Short", "notes": "from the web", "learn": True}, rows)
    values, notes = home.preferences()
    assert values["tone"] == "warm" and values["style"] == "formal" and values["skip_companies"] == ["Evil Corp"] and notes == "from the web"
    assert {m.question for m in home.memories()} == {"Why us?", "Notice period?", "My own question?"}
    mirror_to_home(home, {"tone": "warm"}, rows[:1])
    assert {m.question for m in home.memories()} == {"Why us?", "My own question?"}
    text = home_writing(home)
    assert "tone: warm" in text and "Q: Why us?\nA (pinned): Your robots." in text and "Typed by hand." in text


def hook(tmp_path: Path, event: str, script: str, timeout: int = 15) -> Home:
    write(tmp_path / "hooks" / "h.py", script)
    write(tmp_path / "settings.yaml", f"hooks:\n  {event}:\n    - run: [python, hooks/h.py]\n      timeout: {timeout}\n")
    return Home(bundled_home(), tmp_path)


def test_the_bundled_hook_skips_a_company_in_skip_companies(tmp_path: Path) -> None:
    home = Home(bundled_home(), tmp_path)
    job = {"job": {"company": "Evil Corp Robotics"}}
    said = asyncio.run(run_hooks(home, "before_apply", {**job, "preferences": {"skip_companies": ["evil corp"]}}, print))
    assert said.blocked and "skip_companies" in said.reason
    assert not asyncio.run(run_hooks(home, "before_apply", {**job, "preferences": {"skip_companies": []}}, print)).blocked


def test_a_hook_gets_the_event_without_secrets_and_its_json_comes_back(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret")
    home = hook(tmp_path, "letter_written", (
        "import json, os, sys\nevent = json.load(sys.stdin)\n"
        "print(json.dumps({'letter': event['letter'].upper(), 'saw_key': 'OPENAI_API_KEY' in os.environ, 'event': event['event']}))\n"
    ))
    said = asyncio.run(run_hooks(home, "letter_written", {"letter": "dear team"}, print))
    assert said.changes == {"letter": "DEAR TEAM", "saw_key": False, "event": "letter_written"}


def test_a_hook_that_fails_or_hangs_is_reported_and_the_agent_goes_on(tmp_path: Path) -> None:
    logged: list[str] = []
    home = hook(tmp_path, "after_apply", "import sys\nprint('boom', file=sys.stderr)\nsys.exit(1)\n")
    assert not asyncio.run(run_hooks(home, "after_apply", {}, logged.append)).blocked
    assert "failed with exit 1: boom" in logged[-1]
    home = hook(tmp_path, "after_apply", "import time\ntime.sleep(10)\n", timeout=1)
    assert not asyncio.run(run_hooks(home, "after_apply", {}, logged.append)).blocked
    assert "took longer than 1s" in logged[-1]


def test_an_unknown_event_is_a_mistake_in_the_code() -> None:
    with pytest.raises(ValueError):
        asyncio.run(run_hooks(Home(bundled_home(), None), "before_lunch", {}, print))


def test_python_in_a_hook_is_the_agents_own_python(tmp_path: Path) -> None:
    home = hook(tmp_path, "session_start", "import json, sys\nprint(json.dumps({'python': sys.executable}))\n")
    said = asyncio.run(run_hooks(home, "session_start", {}, print))
    assert Path(said.changes["python"]).resolve() == Path(sys.executable).resolve()

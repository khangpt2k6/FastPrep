"""The rules the person edits on the dashboard's Rules page, and how the agent takes them in.

The page keeps them in automation_rules, one row each, by kind:

    cover_letter  a rule every part of a cover letter follows. The built-in ones are the project's
                  skills/cover-letter/<name>/SKILL.md, put on the page by the agent; the person can edit them, turn them
                  off, reset them, or add their own.
    section       how to write one part of the letter: a slot of the template, by its name ("why_company").
    answer        how to answer one kind of open question on a form ("Why this company").
    always        a standing instruction for everything written as the candidate. The project's AGENT.md is shown as a
                  built-in one the page cannot change; the person's own come after it.

The agent writes them into the person's home, one way, as it does with the preferences and the memory: a cover letter
rule edited, turned off or added on the page becomes skills/cover-letter/<name>/SKILL.md there, which wins over the
project's of the same name; the section rules become one more cover letter skill; the standing ones a marked block at the
end of the person's AGENT.md. The answer rules go with the writing preferences into each application's brief.

A file the agent writes says so in its front matter (source: dashboard), and only those are ever replaced or removed:
one the person wrote by hand stays as they left it.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from agent_automation.home import Home, front_matter

SOURCE = "dashboard"
COVER_LETTER = "cover-letter/"
SECTIONS_SKILL = "dashboard-sections"
# The section rules go after the rules on facts and voice, and before the format rule.
SECTIONS_ORDER = 6.8
ALWAYS_START = "<!-- dashboard rules: written by the agent from the Rules page. Edit them there. -->"
ALWAYS_END = "<!-- end of dashboard rules -->"
BUILTIN_ALWAYS = "always/builtin"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _on(row: dict[str, Any]) -> bool:
    return row.get("enabled") is not False


def folder_name(rule_id: str) -> str:
    """The skill folder a cover letter rule is written to: its id after cover-letter/, in letters, digits and dashes."""
    name = rule_id.removeprefix(COVER_LETTER)
    return re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")[:60] or "rule"


def builtin_rules(home: Home) -> list[dict[str, Any]]:
    """The rules the project ships, as the page shows them: each cover letter skill, then the project's AGENT.md as the
    built-in standing instructions. `default_body` is the shipped text, for the page's Reset."""
    project = Home(home.bundled, None)
    rows = []
    for name, doc in sorted(project.skills("cover-letter").items()):
        order = doc.meta.get("order")
        rows.append({
            "id": f"{COVER_LETTER}{name}", "kind": "cover_letter", "title": _text(doc.meta.get("name")) or name,
            "description": _text(doc.meta.get("description")), "default_body": doc.body.strip(), "builtin": True,
            "sort": float(99 if order is None else order),
        })
    if standing := project.agent_md().strip():
        rows.append({
            "id": BUILTIN_ALWAYS, "kind": "always", "title": "Built-in instructions",
            "description": "Every answer and letter follows these. They come with the agent.", "default_body": standing, "builtin": True,
            "sort": 0.0,
        })
    return rows


def _skill_text(meta: dict[str, Any], body: str) -> str:
    head = yaml.safe_dump(meta, sort_keys=False, allow_unicode=True).strip()
    return f"---\n# Written by the agent from the dashboard's Rules page. Edit it there.\n{head}\n---\n{body.strip()}\n"


def _ours(path: Path) -> bool:
    """Whether the agent wrote this file from the dashboard, so it may replace or remove it."""
    try:
        meta, _ = front_matter(str(path), path.read_text(encoding="utf-8-sig"))
    except Exception:  # noqa: BLE001  A file that cannot be read as a skill is the person's: left alone.
        return False
    return meta.get("source") == SOURCE


def cover_letter_files(rows: list[dict[str, Any]]) -> dict[str, str]:
    """The cover letter skills the person's home should hold from the dashboard, by folder name: a built-in rule only once
    the page changed it (edited or turned off), every rule of the person's own, and one skill for the section rules."""
    wanted: dict[str, str] = {}
    for row in rows:
        if row.get("kind") != "cover_letter":
            continue
        builtin, enabled, body = bool(row.get("builtin")), _on(row), _text(row.get("body"))
        if builtin and enabled and row.get("updated_by") != "web":
            continue  # As shipped: the project's own file applies.
        if not body:
            if not builtin:
                continue  # An empty rule of the person's own says nothing.
            body = _text(row.get("default_body")) or "Turned off on the dashboard."
        name = folder_name(str(row.get("id") or ""))
        meta: dict[str, Any] = {"name": _text(row.get("title")) or name, "description": _text(row.get("description")) or "A rule from the dashboard."}
        if row.get("sort") is not None:
            meta["order"] = float(row["sort"])
        meta |= {"enabled": enabled, "source": SOURCE}
        wanted[name] = _skill_text(meta, body)

    sections = sorted(
        (row for row in rows if row.get("kind") == "section" and _on(row) and _text(row.get("body"))),
        key=lambda row: (float(row.get("sort") or 0), str(row.get("id"))),
    )
    if sections:
        lines = [f"- The part named {_text(row.get('title')) or str(row.get('id')).split('/', 1)[-1]}: {_text(row.get('body'))}" for row in sections]
        body = "How the person wants these parts of the template written. Each one applies only to the part it names.\n\n" + "\n".join(lines)
        meta = {
            "name": "Parts of the letter", "description": "How the person wants named parts of the letter written.", "order": SECTIONS_ORDER,
            "enabled": True, "source": SOURCE,
        }
        wanted[SECTIONS_SKILL] = _skill_text(meta, body)
    return wanted


def always_block(rows: list[dict[str, Any]]) -> str:
    """The person's own standing instructions from the page, as the block that ends their AGENT.md; empty when there are none."""
    kept = sorted(
        (row for row in rows if row.get("kind") == "always" and not row.get("builtin") and _on(row) and _text(row.get("body"))),
        key=lambda row: (float(row.get("sort") or 0), str(row.get("id"))),
    )
    if not kept:
        return ""
    lines = "\n".join(f"- {_text(row.get('body'))}" for row in kept)
    return f"{ALWAYS_START}\n## From the dashboard\n\n{lines}\n{ALWAYS_END}"


def with_block(text: str, block: str) -> str:
    """AGENT.md with its dashboard block replaced by `block` (or taken out when it is empty); the rest as the person wrote it."""
    pattern = re.compile(re.escape(ALWAYS_START) + r".*?" + re.escape(ALWAYS_END), re.DOTALL)
    rest = pattern.sub("", text).strip()
    return "\n\n".join(part for part in (rest, block) if part) + ("\n" if rest or block else "")


def mirror_rules(home: Home, rows: list[dict[str, Any]]) -> None:
    """The dashboard's rules written into the person's home, one way: the files the agent wrote before are brought in step,
    and a file the person wrote by hand is never touched."""
    if home.personal is None:
        return
    folder = home.personal / "skills" / "cover-letter"
    wanted = cover_letter_files(rows)
    if folder.is_dir():
        for path in folder.glob("*/SKILL.md"):
            if path.parent.name not in wanted and _ours(path):
                path.unlink()
                try:
                    path.parent.rmdir()
                except OSError:
                    pass  # The person keeps something else in that folder.
    for name, text in wanted.items():
        path = folder / name / "SKILL.md"
        if path.is_file() and not _ours(path):
            continue  # The person's own file of that name wins over the dashboard.
        if path.is_file() and path.read_text(encoding="utf-8-sig") == text:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    agent_md = home.personal / "AGENT.md"
    before = agent_md.read_text(encoding="utf-8-sig") if agent_md.is_file() else ""
    after = with_block(before, always_block(rows))
    if after == before:
        return
    if after.strip():
        agent_md.parent.mkdir(parents=True, exist_ok=True)
        agent_md.write_text(after, encoding="utf-8")
    elif agent_md.is_file():
        agent_md.unlink()


def answer_rules_text(rows: list[dict[str, Any]]) -> str:
    """The answer rules, for the form-filling model's brief beside the writing preferences; empty when there are none."""
    kept = sorted(
        (row for row in rows if row.get("kind") == "answer" and _on(row) and _text(row.get("body"))),
        key=lambda row: (float(row.get("sort") or 0), str(row.get("id"))),
    )
    if not kept:
        return ""
    lines = "\n".join(f"- {_text(row.get('title')) or 'A question'}: {_text(row.get('body'))}" for row in kept)
    return (
        "How the candidate wants some kinds of open questions answered. Follow the one that matches the question asked; "
        f"the answers and the rules on truth still come first:\n{lines}"
    )

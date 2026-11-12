"""The agent's home: one folder, laid out like a .claude folder, that holds what the agent is told and what it keeps.

    AGENT.md          standing instructions for every model call that writes for the candidate
    settings.yaml     the hooks that run at the agent's events
    preferences.md    how the candidate wants to come across: style, tone, length, what to highlight or avoid
    skills/           sites/<name>/SKILL.md, always/<name>/SKILL.md, cover-letter/<name>/SKILL.md
    styles/           writing/<name>.md voices, cover-letters/<id>.md templates
    memory/           MEMORY.md, the index, and one file per answer remembered
    hooks/            the scripts settings.yaml runs

Two homes are read, as Claude Code reads ./.claude and ~/.claude: the project's, `.agent/` beside the code, and the
person's, their workspace (~/.agent-automation/). A skill or a style of the person's wins over the project's of the same
name. Both AGENT.md files are read, the project's first. Settings and preferences: the person's values win key by key, and
their hooks are added to the project's. Memory is the person's alone.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from importlib import resources
from pathlib import Path
from typing import Any

import yaml

HOME_DIR = ".agent"


class HomeError(Exception):
    """A file in a home that cannot be used."""


def bundled_home() -> Path:
    """The project's home: inside the installed package when it was built as a wheel, else `.agent/` in the repository."""
    packaged = Path(str(resources.files("agent_automation").joinpath("_home")))
    if packaged.is_dir():
        return packaged
    return Path(__file__).resolve().parents[2] / HOME_DIR


def front_matter(name: str, text: str) -> tuple[dict[str, Any], str]:
    """The YAML between the first two --- lines, and the text after it. A file with none is all text."""
    text = text.replace("\r\n", "\n").lstrip("﻿")
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        raise HomeError(f"{name}: its front matter has no closing --- line")
    try:
        meta = yaml.safe_load(text[4:end]) or {}
    except yaml.YAMLError as error:
        raise HomeError(f"{name}: its front matter is not valid YAML: {error}") from error
    if not isinstance(meta, dict):
        raise HomeError(f"{name}: its front matter must be names and values")
    return meta, text[end + 4 :].lstrip("\n")


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as error:
        raise HomeError(f"{path} is not UTF-8 text: save it again as UTF-8") from error


def _merge(base: dict[str, Any], over: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in over.items():
        out[key] = _merge(out[key], value) if isinstance(value, dict) and isinstance(out.get(key), dict) else value
    return out


@dataclass(frozen=True)
class Doc:
    """One Markdown file of a home: its name, front matter, text, and the folder of the home it came from."""

    name: str
    meta: dict[str, Any]
    body: str
    path: Path
    personal: bool = False


@dataclass(frozen=True)
class Hook:
    event: str
    run: tuple[str, ...]
    folder: Path
    timeout: float = 30.0


@dataclass(frozen=True)
class Memory:
    question: str
    answer: str
    source: str = "user"  # user: the candidate's own; learned: written by the agent on a form
    pinned: bool = False
    company: str = ""
    job_title: str = ""
    updated: str = ""
    slug: str = ""
    # The dashboard's id of an answer mirrored from it: a file with one is the dashboard's copy, rewritten from it.
    ident: str = ""


@dataclass(frozen=True)
class Home:
    bundled: Path = field(default_factory=bundled_home)
    personal: Path | None = None

    def layers(self) -> list[tuple[Path, bool]]:
        found = [(self.bundled, False)]
        if self.personal is not None and self.personal.resolve() != self.bundled.resolve():
            found.append((self.personal, True))
        return [(folder, mine) for folder, mine in found if folder.is_dir()]

    # Instructions, settings and preferences.

    def agent_md(self) -> str:
        """Every AGENT.md, the project's first: both apply."""
        paths = [folder / "AGENT.md" for folder, _ in self.layers()]
        return "\n\n".join(text for path in paths if path.is_file() and (text := _read(path).strip()))

    def style(self) -> Doc | None:
        """The writing style preferences.md names, from styles/writing/; the plain one when it names none or one not there."""
        styles = self.styles("writing")
        named = str(self.preferences()[0].get("style") or "plain")
        return styles.get(named) or styles.get("plain")

    def standing(self) -> str:
        """How to write as the candidate: every AGENT.md, then the writing style."""
        style = self.style()
        parts = [self.agent_md(), f"Writing style, {style.meta.get('name') or style.name}:\n{style.body.strip()}" if style else ""]
        return "\n\n".join(part for part in parts if part)

    def settings(self) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        for folder, _ in self.layers():
            path = folder / "settings.yaml"
            if path.is_file():
                try:
                    data = yaml.safe_load(_read(path)) or {}
                except yaml.YAMLError as error:
                    raise HomeError(f"{path} is not valid YAML: {error}") from error
                if not isinstance(data, dict):
                    raise HomeError(f"{path} must be names and values")
                data = {key: value for key, value in data.items() if key != "hooks"}
                merged = _merge(merged, data)
        return merged

    def preferences(self) -> tuple[dict[str, Any], str]:
        """The candidate's preferences, the person's keys over the project's, and their notes: the person's when they wrote some."""
        merged: dict[str, Any] = {}
        notes = ""
        for folder, mine in self.layers():
            path = folder / "preferences.md"
            if path.is_file():
                meta, body = front_matter(str(path), _read(path))
                merged = _merge(merged, meta)
                if mine or not notes:
                    notes = body.strip() or notes
        return merged, notes

    def personal_preferences(self) -> bool:
        return self.personal is not None and (self.personal / "preferences.md").is_file()

    def write_preferences(self, values: dict[str, Any], notes: str, source: str) -> Path:
        """The person's preferences.md, written whole: from the dashboard (`source` says who)."""
        if self.personal is None:
            raise HomeError("there is no personal home to write preferences to")
        path = self.personal / "preferences.md"
        head = yaml.safe_dump(values, sort_keys=False, allow_unicode=True).strip()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\n# Written by the agent from the {source}. Edit it on the dashboard, or here.\n{head}\n---\n{notes.strip()}\n", encoding="utf-8")
        return path

    # Skills and styles: one name, one file, the person's winning.

    def docs(self, *parts: str, skill: bool = False) -> dict[str, Doc]:
        """The Markdown files in `parts` of every home, by name: `<name>/SKILL.md` for skills, `<name>.md` for the rest."""
        found: dict[str, Doc] = {}
        for folder, mine in self.layers():
            where = folder.joinpath(*parts)
            if not where.is_dir():
                continue
            paths = sorted(where.glob("*/SKILL.md")) if skill else sorted(where.glob("*.md"))
            for path in paths:
                name = path.parent.name if skill else path.stem
                meta, body = front_matter(str(path), _read(path))
                found[name] = Doc(name, meta, body, path, mine)
        return found

    def skills(self, group: str) -> dict[str, Doc]:
        return self.docs("skills", group, skill=True)

    def styles(self, group: str) -> dict[str, Doc]:
        return self.docs("styles", group)

    # Hooks.

    def hooks(self, event: str) -> list[Hook]:
        """The hooks for `event`, the project's first, then the person's."""
        found = []
        for folder, _ in self.layers():
            path = folder / "settings.yaml"
            if not path.is_file():
                continue
            data = yaml.safe_load(_read(path)) or {}
            for entry in ((data.get("hooks") or {}).get(event) or []) if isinstance(data, dict) else []:
                run = entry.get("run") if isinstance(entry, dict) else None
                if isinstance(run, str):
                    run = run.split()
                if not isinstance(run, list) or not run or not all(isinstance(part, str) for part in run):
                    raise HomeError(f"{path}: a hook for {event} needs `run`, a command as a list of words")
                found.append(Hook(event, tuple(run), folder, float(entry.get("timeout") or 30)))
        return found

    # Memory: the person's answers to questions asked before.

    @property
    def memory_dir(self) -> Path | None:
        return self.personal / "memory" if self.personal is not None else None

    def memories(self) -> list[Memory]:
        folder = self.memory_dir
        if folder is None or not folder.is_dir():
            return []
        found = []
        for path in sorted(folder.glob("*.md")):
            if path.name == "MEMORY.md":
                continue
            meta, body = front_matter(str(path), _read(path))
            if not str(meta.get("question") or "").strip() or not body.strip():
                continue
            found.append(Memory(
                str(meta["question"]).strip(), body.strip(), str(meta.get("source") or "user"), bool(meta.get("pinned")),
                str(meta.get("company") or ""), str(meta.get("job_title") or ""), str(meta.get("updated") or ""), path.stem,
                str(meta.get("id") or ""),
            ))
        return found

    def remember(self, memory: Memory, index: bool = True) -> Path:
        """One answer kept, in its own file, and the index written again. The same question replaces its answer."""
        folder = self.memory_dir
        if folder is None:
            raise HomeError("there is no personal home to remember in")
        folder.mkdir(parents=True, exist_ok=True)
        slug = memory.slug or slugify(memory.question)
        head = {"question": memory.question, "source": memory.source, "pinned": memory.pinned, "company": memory.company,
                "job_title": memory.job_title, "updated": memory.updated or date.today().isoformat()}
        if memory.ident:
            head["id"] = memory.ident
        path = folder / f"{slug}.md"
        path.write_text(f"---\n{yaml.safe_dump(head, sort_keys=False, allow_unicode=True).strip()}\n---\n{memory.answer.strip()}\n", encoding="utf-8")
        if index:
            self.write_index()
        return path

    def forget(self, slug: str, index: bool = True) -> None:
        folder = self.memory_dir
        if folder is not None and (folder / f"{slug}.md").is_file():
            (folder / f"{slug}.md").unlink()
            if index:
                self.write_index()

    def write_index(self) -> None:
        folder = self.memory_dir
        if folder is None:
            return
        folder.mkdir(parents=True, exist_ok=True)
        lines = ["# Memory", "", "Answers given before, one file each. The agent keeps this index; edit the files, not this.", ""]
        lines += [f"- [{m.question}]({m.slug}.md)" + (f" - {m.company}" if m.company else "") + (" (pinned)" if m.pinned else "") for m in self.memories()]
        (folder / "MEMORY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    def memory_text(self, limit: int = 40) -> str:
        """The remembered answers as the model reads them: the pinned ones first, then the newest."""
        newest = sorted(self.memories(), key=lambda m: m.updated, reverse=True)
        chosen = ([m for m in newest if m.pinned] + [m for m in newest if not m.pinned])[:limit]
        return "\n\n".join(f"Q: {m.question}" + (" (pinned: use as written)" if m.pinned else "") + f"\nA: {m.answer}" for m in chosen)


def ascii_text(text: str) -> str:
    """Text in plain letters: accents dropped, and the letters that carry no accent to drop (đ, ł, ø) as their nearest."""
    text = text.translate(str.maketrans({"đ": "d", "Đ": "D", "ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "ß": "ss"}))
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def slugify(text: str) -> str:
    """A file name for a question: its words in plain letters, or a short hash when it has none."""
    plain = ascii_text(text)
    slug = re.sub(r"[^a-z0-9]+", "-", plain.casefold()).strip("-")[:60].rstrip("-")
    return slug or "answer-" + hashlib.sha1(text.encode()).hexdigest()[:8]


def home_for(workspace: Path | None) -> Home:
    return Home(bundled_home(), workspace)

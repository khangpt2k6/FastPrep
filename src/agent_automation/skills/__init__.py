"""Skills: what the model must know about one site's application forms, or about every form. A SKILL.md each.

    .agent/skills/sites/<name>/SKILL.md     front matter: name, description, hosts, and apply_path when the form is elsewhere
    .agent/skills/always/<name>/SKILL.md    front matter: name, description; added to every form's instructions

A skill is a prompt, not code. A site skill's body is added to the model's instructions when it fills a form on its hosts;
an always skill's body is added to every form's, beside the site's own. The mail skills are of that kind, and so is menus,
which says how any site's lists are worked. A skill helps the model on its site; every posting is tried, with one or without.

To support a new site, add a folder with a SKILL.md to .agent/skills/sites/, or to skills/sites/ in your own home
(~/.agent-automation/), where a skill of the same name wins over the project's. Files in <home>/plugins/*.md, where skills
were kept before, are still read: `hosts:` makes a site skill of one, `when: always` an always one.

The cover letter skills, in skills/cover-letter/, are read by agent/cover_letter, not here.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import yaml

from agent_automation.home import Home, home_for

GROUPS = ("sites", "always")


class SkillError(Exception):
    """A skill file cannot be used."""


@dataclass(frozen=True)
class Skill:
    name: str
    hosts: tuple[str, ...]
    instructions: str
    apply_path: str = ""
    always: bool = False
    description: str = ""

    def matches(self, url: str) -> bool:
        host = (urlsplit(url).hostname or "").lower()
        return any(host == known or host.endswith("." + known) for known in self.hosts)

    def form_url(self, url: str) -> str:
        """The link of the posting's form: the posting's own, or with the path that leads to the form."""
        if not self.apply_path:
            return url
        parts = urlsplit(url)
        path = parts.path.rstrip("/")
        if not path.endswith(self.apply_path):
            path += self.apply_path
        return parts._replace(path=path).geturl()


def parse_skill(name: str, text: str, group: str | None = None) -> Skill:
    """One skill from its file's text. `group` is the folder it is in (sites or always); None for an old plugins/ file,
    whose front matter says which it is."""
    text = text.replace("\r\n", "\n")
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise SkillError(f"skill {name}: it must start with a front matter between two --- lines")
    head, body = text[4:].split("\n---\n", 1)
    try:
        meta = yaml.safe_load(head) or {}
    except yaml.YAMLError as error:
        raise SkillError(f"skill {name}: its front matter is not valid YAML: {error}") from error
    if meta.get("when") not in (None, "always"):
        raise SkillError(f"skill {name}: `when` can only be always")
    always = group == "always" or meta.get("when") == "always"
    hosts = meta.get("hosts")
    if always and hosts is not None:
        raise SkillError(f"skill {name}: a skill for every form lists no hosts")
    if not always and (not isinstance(hosts, list) or not hosts or not all(isinstance(host, str) for host in hosts)):
        raise SkillError(f"skill {name}: `hosts` must list the sites it is for")
    if not body.strip():
        raise SkillError(f"skill {name}: it has no instructions")
    names = tuple(host.lower() for host in hosts or ())
    return Skill(str(meta.get("name") or name), names, body.strip(), str(meta.get("apply_path") or ""), always, str(meta.get("description") or ""))


def _read(path: Path, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as error:
        raise SkillError(f"skill {label}: it is not UTF-8 text, so it cannot be read: save it again as UTF-8") from error


def load_skills(workspace: Path | None = None, home: Home | None = None) -> tuple[Skill, ...]:
    """The project's skills and the person's own, whose files win over the project's of the same name."""
    home = home or home_for(workspace)
    found: dict[str, tuple[str, str, str | None]] = {}
    for folder, mine in home.layers():
        for group in GROUPS:
            for path in sorted((folder / "skills" / group).glob("*/SKILL.md")):
                found[path.parent.name] = (path.parent.name, _read(path, f"{group}/{path.parent.name}"), group)
        old = folder / "plugins"
        if mine and old.is_dir():
            for path in sorted(old.glob("*.md")):
                found[path.stem] = (path.stem, _read(path, path.name), None)
    return tuple(parse_skill(name, text, group) for _, (name, text, group) in sorted(found.items()))


def skill_for(url: str, skills: tuple[Skill, ...]) -> Skill | None:
    return next((skill for skill in skills if not skill.always and skill.matches(url)), None)


def always_skills(skills: tuple[Skill, ...]) -> tuple[Skill, ...]:
    """The skills that apply to every form, such as the mail ones; they explain no site."""
    return tuple(skill for skill in skills if skill.always)

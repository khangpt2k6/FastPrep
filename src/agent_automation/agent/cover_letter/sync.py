"""The cover letters of the web page: the templates it shows, the one the person picked, and the letter kept for each job.

The agent publishes the templates in its home so the page can show them; the page adds the person's own and says which
one is used, and whether letters are on. Before an application the agent writes the letter for that job, or takes the one
already kept for it: a letter the person edited on the page is sent as they left it. With no choice made on the page, the
person's preferences.md decides, as it does in the terminal app.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from agent_automation.agent.cover_letter import DEFAULT_TEMPLATE, Letter, Template, check_body, letter_key, load_templates
from agent_automation.memory.store import Stored

TEMPLATES = "automation_cover_templates"
SETTINGS = "automation_cover_settings"
LETTERS = "automation_cover_letters"


class Remote(Protocol):
    user_id: str

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]: ...

    async def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None: ...

    async def upload(self, path: str, data: bytes, content_type: str = "image/png") -> None: ...


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass(frozen=True)
class Choice:
    enabled: bool
    template: Template


class CoverLetters:
    """What the web worker does with cover letters. `session` is its Session, which writes the letters."""

    def __init__(self, db: Remote, session: Any, log: Callable[[str], None]) -> None:
        self.db = db
        self.session = session
        self.log = log

    async def publish(self) -> None:
        """The templates in the agent's home, for the page to show. The person's own ones from the page are not touched."""
        rows = [
            {"user_id": self.db.user_id, "id": template.id, "name": template.name, "description": template.description, "body": template.body,
             "builtin": True, "updated_at": _now()}
            for template in load_templates(self.session.home).values()
        ]
        await self.db.upsert(TEMPLATES, rows, "user_id,id")

    async def choice(self) -> Choice:
        """Whether letters are on, and the template to fill: the page's choice, else preferences.md's; the classic one when
        the one named is gone or broken."""
        rows = await self.db.select(SETTINGS, {"user_id": f"eq.{self.db.user_id}", "select": "enabled,template_id"})
        if rows:
            enabled, chosen = bool(rows[0]["enabled"]), str(rows[0]["template_id"])
        else:
            enabled, chosen = self.session.letters_on(), self.session.letter_template_name()
        templates = load_templates(self.session.home)
        template = templates.get(chosen)
        if template is None:
            found = await self.db.select(TEMPLATES, {"user_id": f"eq.{self.db.user_id}", "id": f"eq.{chosen}", "select": "id,name,description,body"})
            if found:
                row = found[0]
                template = Template(str(row["id"]), str(row["name"]), str(row.get("description") or ""), str(row["body"]))
        if template is None or check_body(template.body):
            self.log(f"cover letter template {chosen!r} cannot be used: the {DEFAULT_TEMPLATE} one is used instead")
            template = templates[DEFAULT_TEMPLATE]
        return Choice(enabled, template)

    async def for_job(self, item: Stored, always: bool = False, kept_only: bool = False) -> Letter | None:
        """The letter for this job, as a PDF beside the CV and kept on the page. None when letters are off (unless `always`)
        or a letter_written hook stopped it. With `kept_only` none is written: the kept letter's PDF is made again, and
        with none kept there is none, so no model is asked."""
        choice = await self.choice()
        if not choice.enabled and not always:
            return None
        job = item.job
        where = {"user_id": f"eq.{self.db.user_id}", "job_id": f"eq.{job.id}", "select": "template_id,body,updated_by"}
        kept = next(iter(await self.db.select(LETTERS, where)), None)
        edited = kept is not None and kept.get("updated_by") == "web"
        # One the person edited is theirs; one written with the template still picked is not written again.
        reuse = kept is not None and bool(str(kept.get("body") or "").strip()) and (kept_only or edited or kept.get("template_id") == choice.template.id)
        if kept_only and not reuse:
            return None
        letter = await self.session.cover_letter(item, choice.template, str(kept["body"]) if reuse and kept else "", self.log)
        if letter is None:
            return None
        if reuse and kept:
            letter.template_id = str(kept.get("template_id") or letter.template_id)
        remote = f"{self.db.user_id}/cover-letters/{letter_key(job.id)}.pdf"
        try:
            assert letter.pdf is not None
            await self.db.upload(remote, letter.pdf.read_bytes(), "application/pdf")
        except Exception as error:  # noqa: BLE001  The letter still goes with the application; the page shows its text.
            self.log(f"cover letter upload failed: {error}")
            remote = ""
        await self.db.upsert(LETTERS, [{
            "user_id": self.db.user_id, "job_id": job.id, "template_id": letter.template_id, "body": letter.text, "pdf_path": remote,
            "problems": "\n".join(letter.problems), "updated_by": "web" if edited and reuse else "agent", "updated_at": _now(),
        }], "user_id,job_id")
        return letter

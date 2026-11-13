"""The letter as a one-page PDF: a letterhead with the person's name and how to reach them, the letter itself set in
Times New Roman, and a logo at the foot when the person keeps one.

The letterhead is drawn here, from the profile, and not written in the template: the same letter as plain text (for a
form's text box) needs no header. What it shows comes from `letterhead/letterhead.md` in the agent's home, the person's
winning:

    ---
    tagline: Computer Science, Honors College
    contacts: [location, phone, email, linkedin, github]
    footer_logo: logo.png
    ---

With no such file the tagline is the degree's subject and the school, and there is no logo.
"""

from __future__ import annotations

import contextlib
import io
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agent_automation.agent.cover_letter.icons import ICONS, svg
from agent_automation.home import Home, HomeError, front_matter

LETTERHEAD_DIR = "letterhead"
DEFAULT_CONTACTS = ("location", "phone", "email", "linkedin", "github")

PAGE_WIDTH, PAGE_HEIGHT = 612.0, 792.0
SIDE = 68.0
TOP = 50.0
BOTTOM = 40.0
# The letter's size: the largest that keeps it on the page, between these.
LARGEST, SMALLEST, STEP = 11.5, 9.5, 0.25
LEADING = 1.3
PARAGRAPH_GAP = 0.62
FOOTER_LOGO_HEIGHT = 26.0
# The contact line may reach a little past the letter's own margins before it is made smaller or cut in two.
CONTACT_SIDE = 42.0
CONTACT_SIZES = (10.0, 9.75, 9.5, 9.25, 9.0)

# The PDF: Times New Roman, black on white, plain, as the person's documents are.
_FONT_PLACES = (
    (Path("C:/Windows/Fonts/times.ttf"), Path("C:/Windows/Fonts/timesbd.ttf")),
    (Path("/Library/Fonts/Times New Roman.ttf"), Path("/Library/Fonts/Times New Roman Bold.ttf")),
    (Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"), Path("/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf")),
    (Path("/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf"), Path("/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman_Bold.ttf")),
    (Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"), Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf")),
)


@dataclass(frozen=True)
class Contact:
    """One way to reach the person. `kind` picks the mark drawn before it; `link` is where a click goes."""

    kind: str
    text: str
    link: str = ""


@dataclass(frozen=True)
class Letterhead:
    name: str
    tagline: str = ""
    contacts: tuple[Contact, ...] = ()
    footer_logo: Path | None = None
    icons: bool = True


def _bare(link: str) -> str:
    """A link as a person reads it on paper: linkedin.com/in/ada, not https://www.linkedin.com/in/ada/."""
    return re.sub(r"(?i)^https?://(?:www\.)?", "", link.strip()).rstrip("/")


def _url(link: str) -> str:
    link = link.strip()
    return link if re.match(r"(?i)^https?://", link) else f"https://{link}"


def _contact(kind: str, fields: dict[str, str]) -> Contact | None:
    value = (fields.get(kind) or "").strip()
    if not value:
        return None
    if kind == "phone":
        return Contact("phone", value, "tel:" + re.sub(r"[^0-9+]", "", value))
    if kind == "email":
        return Contact("gmail" if value.lower().endswith(("@gmail.com", "@googlemail.com")) else "email", value, f"mailto:{value}")
    if kind in ("linkedin", "github", "website"):
        return Contact(kind, _bare(value), _url(value))
    return Contact(kind, value)


def _settings(home: Home | None) -> tuple[dict[str, Any], Path | None]:
    """What letterhead.md says, the person's file winning, and the folder it sits in."""
    found: tuple[dict[str, Any], Path | None] = ({}, None)
    for folder, _ in home.layers() if home is not None else []:
        path = folder / LETTERHEAD_DIR / "letterhead.md"
        if path.is_file():
            try:
                meta, _ = front_matter(str(path), path.read_text(encoding="utf-8-sig"))
            except (HomeError, OSError):
                continue
            found = (meta, path.parent)
    return found


def letterhead_for(fields: dict[str, str], answers: dict[str, str], home: Home | None = None) -> Letterhead:
    """The letterhead of this person's letters: their name, a line under it, how to reach them, and their logo."""
    meta, folder = _settings(home)
    tagline = str(meta.get("tagline") or "").strip()
    if not tagline:
        tagline = ", ".join(part for part in (answers.get("major", "").strip(), answers.get("school", "").strip()) if part)
    wanted = meta.get("contacts")
    kinds = [str(kind).strip().lower() for kind in wanted] if isinstance(wanted, list) and wanted else list(DEFAULT_CONTACTS)
    contacts = tuple(contact for kind in kinds if (contact := _contact(kind, fields)) is not None)
    logo = None
    if folder is not None and (named := str(meta.get("footer_logo") or "").strip()):
        candidate = (folder / named).resolve()
        # Only a picture inside the letterhead folder: the file names no other place on the computer.
        if candidate.is_file() and candidate.parent == folder.resolve() and candidate.suffix.lower() in (".png", ".jpg", ".jpeg"):
            logo = candidate
    return Letterhead(fields.get("full_name", "").strip(), tagline, contacts, logo, meta.get("icons", True) is not False)


def _latin(text: str) -> str:
    """Text the PDF's built-in Times can show: accents kept where Latin-1 has them, dropped where it does not."""
    out = []
    for char in text:
        try:
            char.encode("latin-1")
            out.append(char)
        except UnicodeEncodeError:
            plain = unicodedata.normalize("NFKD", char).encode("latin-1", "ignore").decode("latin-1")
            out.append({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2026": "..."}.get(char, plain))
    return "".join(out)


class _Page:
    """One letter page being drawn: the fonts, and the few moves a letter needs."""

    def __init__(self, title: str, author: str) -> None:
        from fpdf import FPDF

        self.pdf = FPDF(format="letter", unit="pt")
        self.pdf.set_margins(SIDE, TOP, SIDE)
        self.pdf.set_auto_page_break(False)
        self.pdf.set_title(title)
        if author:
            self.pdf.set_author(author)
        self.pdf.add_page()
        self.pdf.set_text_color(0, 0, 0)
        self.pdf.set_draw_color(0, 0, 0)
        fonts = next(((regular, bold) for regular, bold in _FONT_PLACES if regular.is_file()), None)
        if fonts is not None:
            self.family, self.show = "Body", str
            self.pdf.add_font("Body", "", str(fonts[0]))
            self.pdf.add_font("Body", "B", str(fonts[1] if fonts[1].is_file() else fonts[0]))
        else:
            self.family, self.show = "Times", _latin
        self.width = PAGE_WIDTH - 2 * SIDE

    def font(self, size: float, bold: bool = False) -> None:
        self.pdf.set_font(self.family, "B" if bold else "", size)

    def centered(self, text: str, y: float, size: float, bold: bool = False) -> None:
        self.font(size, bold)
        self.pdf.set_xy(SIDE, y)
        self.pdf.cell(self.width, size * 1.2, self.show(text), align="C")

    def lines(self, text: str, size: float, bold: bool = False) -> int:
        """How many lines a paragraph takes at this size."""
        self.font(size, bold)
        return len(self.pdf.multi_cell(self.width, size * LEADING, self.show(text), dry_run=True, output="LINES"))


def _rows(page: _Page, contacts: tuple[Contact, ...], icons: bool) -> tuple[float, list[list[Contact]]]:
    """The size the contact line is set in and its rows: one row when it fits, down to a smaller size, else two."""

    def width(row: list[Contact], size: float) -> float:
        page.font(size)
        mark, gap, between = size * 0.92, size * 0.42, size * 1.5
        marks = sum((mark * ICONS[item.kind][0] / ICONS[item.kind][1] + gap) for item in row if icons and item.kind in ICONS)
        return sum(page.pdf.get_string_width(page.show(item.text)) for item in row) + marks + between * (len(row) - 1)

    everyone = list(contacts)
    for size in CONTACT_SIZES:
        if width(everyone, size) <= PAGE_WIDTH - 2 * CONTACT_SIDE:
            return size, [everyone]
    half = (len(everyone) + 1) // 2
    return CONTACT_SIZES[0], [everyone[:half], everyone[half:]]


def _draw_contacts(page: _Page, head: Letterhead, y: float) -> tuple[float, float]:
    """The contact line under the name; the y below it and how wide its widest row is."""
    if not head.contacts:
        return y, 0.0
    widest = 0.0
    size, rows = _rows(page, head.contacts, head.icons)
    pdf = page.pdf
    mark, gap, between = size * 0.92, size * 0.42, size * 1.5
    for row in rows:
        page.font(size)
        pieces = []
        for item in row:
            box = ICONS.get(item.kind) if head.icons else None
            pieces.append((item, box, pdf.get_string_width(page.show(item.text))))
        total = sum(text + ((mark * box[0] / box[1] + gap) if box else 0) for _, box, text in pieces) + between * (len(pieces) - 1)
        x = (PAGE_WIDTH - total) / 2
        widest = max(widest, total)
        for index, (item, box, text_width) in enumerate(pieces):
            start = x
            if box:
                wide = mark * box[0] / box[1]
                pdf.image(io.BytesIO(svg(item.kind)), x=x, y=y + (size * 1.25 - mark) / 2, w=wide, h=mark)
                x += wide + gap
            pdf.text(x, y + size * 0.96, page.show(item.text))
            if item.link:
                # A hairline under what can be clicked, as on a printed letterhead.
                pdf.set_line_width(0.45)
                pdf.line(x, y + size * 1.2, x + text_width, y + size * 1.2)
                pdf.link(start, y, x + text_width - start, size * 1.3, item.link)
            x += text_width
            if index < len(pieces) - 1:
                pdf.set_line_width(0.5)
                pdf.line(x + between / 2, y + size * 0.22, x + between / 2, y + size * 1.08)
                x += between
        y += size * 1.75
    return y, widest


def _draw_head(page: _Page, head: Letterhead) -> float:
    """The letterhead; the y where the letter starts."""
    y = TOP
    if head.name:
        page.centered(head.name, y, 25, bold=True)
        y += 32
    if head.tagline:
        page.centered(head.tagline, y, 10.5)
        y += 15
    y, widest = _draw_contacts(page, head, y + 13)
    y += 8
    # The rule runs the width of the letter, or of the contact line when that reaches a little past it.
    reach = max(page.width, widest) / 2
    page.pdf.set_line_width(0.8)
    page.pdf.line(PAGE_WIDTH / 2 - reach, y, PAGE_WIDTH / 2 + reach, y)
    return y + 15


def _paragraphs(text: str, head: Letterhead | None) -> list[str]:
    """The letter's paragraphs. With a letterhead, a first block that only repeats the name and the contact line goes."""
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text.strip()) if part.strip()]
    if head is not None and head.name and paragraphs:
        first = paragraphs[0].splitlines()
        if first[0].strip().lower() == head.name.lower() and len(first) <= 3 and not any(line.strip().endswith(".") for line in first):
            paragraphs = paragraphs[1:]
    return paragraphs


def _is_bold(line: str) -> bool:
    # The subject line of a letter: "Re: Software Engineer Intern".
    return bool(re.match(r"(?i)^(?:re|subject|regarding):\s", line.strip()))


def _height(page: _Page, paragraphs: list[str], size: float) -> float:
    total = 0.0
    for paragraph in paragraphs:
        for line in paragraph.splitlines():
            total += page.lines(line, size, _is_bold(line)) * size * LEADING
        total += size * PARAGRAPH_GAP
    return total


def render_pdf(text: str, path: Path, title: str = "Cover letter", author: str = "", letterhead: Letterhead | None = None) -> Path:
    """The letter as a one-page PDF at `path`. With a `letterhead` its header is drawn above the letter and its logo at the
    foot; a letter too long for the page even in the smallest size runs onto a second one before anything is cut."""
    page = _Page(title, author)
    pdf = page.pdf
    y = _draw_head(page, letterhead) if letterhead is not None else TOP + 22
    foot = PAGE_HEIGHT - BOTTOM
    if letterhead is not None and letterhead.footer_logo is not None:
        # A picture that cannot be read is left out; the letter still goes.
        with contextlib.suppress(Exception):
            from PIL import Image

            with Image.open(letterhead.footer_logo) as picture:
                wide = min(FOOTER_LOGO_HEIGHT * picture.width / picture.height, page.width * 0.5)
            pdf.image(str(letterhead.footer_logo), x=(PAGE_WIDTH - wide) / 2, y=PAGE_HEIGHT - BOTTOM - FOOTER_LOGO_HEIGHT, w=wide)
            foot = PAGE_HEIGHT - BOTTOM - FOOTER_LOGO_HEIGHT - 14
    paragraphs = _paragraphs(text, letterhead)
    size = LARGEST
    while size > SMALLEST and _height(page, paragraphs, size) > foot - y:
        size -= STEP
    if _height(page, paragraphs, size) > foot - y:
        pdf.set_auto_page_break(True, BOTTOM)
    pdf.set_xy(SIDE, y)
    for paragraph in paragraphs:
        lines = paragraph.splitlines()
        for line in lines:
            bold = _is_bold(line)
            # A paragraph of prose is set flush on both sides; an address, a date or a sign-off keeps its own lines.
            prose = len(lines) == 1 and not bold and page.lines(line, size) > 1
            page.font(size, bold)
            pdf.set_x(SIDE)
            pdf.multi_cell(page.width, size * LEADING, page.show(line), align="J" if prose else "L", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(size * PARAGRAPH_GAP)
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(path))
    return path


__all__ = ["DEFAULT_CONTACTS", "LETTERHEAD_DIR", "Contact", "Letterhead", "letterhead_for", "render_pdf"]

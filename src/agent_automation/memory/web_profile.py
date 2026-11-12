"""The profile from the web page's wizard, turned into the answers the form-filling model reads, and a first draft of it
read from the resume. The keys of `data` are the ones web/ writes: see supabase/schema.sql and web/src."""

from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI

from agent_automation.agent.llm import structured
from agent_automation.home import Home, Memory, slugify


def empty_profile() -> dict[str, Any]:
    return {
        "personal": {name: "" for name in (
            "first_name", "last_name", "preferred_name", "email", "phone", "address", "city", "state", "zip", "country", "linkedin", "github", "website")},
        "education": [],
        "experience": [],
        "skills": [],
        "preferences": {name: "" for name in (
            "desired_roles", "desired_locations", "work_mode", "willing_to_relocate", "earliest_start", "desired_salary", "notice_period")},
        "authorization": {"countries": [], "citizen_us": "", "authorized_us": "", "needs_sponsorship": "", "authorization_basis": "", "visa_type": ""},
        "eeo": {"gender": "", "pronouns": "", "race": "", "hispanic_latino": "", "veteran": "", "disability": "", "lgbtq": "", "sexual_orientation": []},
        "extra": {"how_heard": "", "notes": "", "custom": []},
    }


def _text(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "").strip()


def _section(data: dict[str, Any], name: str) -> dict[str, Any]:
    value = data.get(name)
    return value if isinstance(value, dict) else {}


def _entries(data: dict[str, Any], name: str) -> list[dict[str, Any]]:
    value = data.get(name)
    return [entry for entry in value if isinstance(entry, dict)] if isinstance(value, list) else []


def _span(entry: dict[str, Any]) -> str:
    start, end = _text(entry.get("start")), _text(entry.get("end"))
    return f"{start} to {end}" if start and end else start or end


# A bare "No" to "Protected veteran" was typed into a Greenhouse list that has no "No", and the list kept its first option,
# "I identify as ... a protected veteran": the opposite. The answers say it in the words such lists use.
VETERAN_WORDS = {
    "no": "No, I am not a protected veteran",
    "yes": "Yes, I identify as one or more of the classifications of protected veteran",
    "prefer not to say": "Prefer not to say (I don't wish to answer)",
}
DISABILITY_WORDS = {
    "no": "No, I do not have a disability and have not had one in the past",
    "yes": "Yes, I have a disability (or previously had one)",
    "prefer not to say": "Prefer not to say (I do not want to answer)",
}


def _said(value: Any, words: dict[str, str]) -> str:
    text = _text(value)
    return words.get(text.lower(), text)


def profile_answers(data: dict[str, Any]) -> dict[str, str]:
    """name -> value for every field the person filled in; empty ones are left out."""
    personal, prefs = _section(data, "personal"), _section(data, "preferences")
    auth, eeo, extra = _section(data, "authorization"), _section(data, "eeo"), _section(data, "extra")
    out: dict[str, str] = {}

    first, last = _text(personal.get("first_name")), _text(personal.get("last_name"))
    city, state, zip_code, country = (_text(personal.get(name)) for name in ("city", "state", "zip", "country"))
    street = _text(personal.get("address"))
    out |= {
        "first_name": first, "last_name": last, "full_name": f"{first} {last}".strip(), "preferred_name": _text(personal.get("preferred_name")),
        "email": _text(personal.get("email")), "phone": _text(personal.get("phone")),
        "street_address": street, "city": city, "state": state, "zip_code": zip_code, "country": country,
        "address": ", ".join(part for part in (street, city, f"{state} {zip_code}".strip(), country) if part),
        "location": ", ".join(part for part in (city, state) if part),
        "linkedin": _text(personal.get("linkedin")), "github": _text(personal.get("github")), "website": _text(personal.get("website")),
    }

    schools = _entries(data, "education")
    out["education"] = "\n".join(
        ", ".join(part for part in (
            f"{_text(e.get('degree'))} {_text(e.get('field'))}".strip(), _text(e.get("school")), _span(e),
            f"GPA {_text(e.get('gpa'))}" if _text(e.get("gpa")) else "",
        ) if part) for e in schools
    )
    if schools:
        top = schools[0]
        out |= {"school": _text(top.get("school")), "degree": _text(top.get("degree")), "major": _text(top.get("field")),
                "gpa": _text(top.get("gpa")), "graduation_date": _text(top.get("end"))}

    jobs = _entries(data, "experience")
    out["work_experience"] = "\n\n".join(
        f"{_text(e.get('title'))} at {_text(e.get('company'))}" + (f", {_text(e.get('location'))}" if _text(e.get("location")) else "")
        + (f" ({_span(e)})" if _span(e) else "") + (f"\n{_text(e.get('description'))}" if _text(e.get("description")) else "")
        for e in jobs
    )
    if jobs:
        current = next((e for e in jobs if _text(e.get("end")).lower() == "present"), jobs[0])
        out |= {"current_company": _text(current.get("company")), "current_title": _text(current.get("title"))}

    out["skills"] = _text(data.get("skills"))
    out |= {
        "desired_roles": _text(prefs.get("desired_roles")), "desired_locations": _text(prefs.get("desired_locations")),
        "work_mode": _text(prefs.get("work_mode")), "willing_to_relocate": _text(prefs.get("willing_to_relocate")),
        "earliest_start_date": _text(prefs.get("earliest_start")), "desired_salary": _text(prefs.get("desired_salary")),
        "notice_period": _text(prefs.get("notice_period")),
        "countries_to_work_in": _text(auth.get("countries")), "us_citizen": _text(auth.get("citizen_us")),
        "authorized_to_work_in_us": _text(auth.get("authorized_us")), "requires_visa_sponsorship": _text(auth.get("needs_sponsorship")),
        "work_authorization_basis": _text(auth.get("authorization_basis")), "visa_type": _text(auth.get("visa_type")),
        "gender": _text(eeo.get("gender")), "pronouns": _text(eeo.get("pronouns")), "race_ethnicity": _text(eeo.get("race")),
        "hispanic_or_latino": _text(eeo.get("hispanic_latino")), "veteran_status": _said(eeo.get("veteran"), VETERAN_WORDS),
        "disability_status": _said(eeo.get("disability"), DISABILITY_WORDS), "lgbtq": _text(eeo.get("lgbtq")), "sexual_orientation": _text(eeo.get("sexual_orientation")),
        "how_did_you_hear": _text(extra.get("how_heard")), "additional_notes": _text(extra.get("notes")),
    }
    for pair in _entries(extra, "custom"):
        question, answer = _text(pair.get("question")), _text(pair.get("answer"))
        if question and answer:
            out[question] = answer
    return {name: value for name, value in out.items() if value}


_STRING = {"type": "string"}


def _object(*names: str) -> dict[str, Any]:
    return {"type": "object", "properties": {name: _STRING for name in names}, "required": list(names), "additionalProperties": False}


PREFILL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "personal": _object("first_name", "last_name", "email", "phone", "city", "state", "country", "linkedin", "github", "website"),
        "education": {"type": "array", "items": _object("school", "degree", "field", "gpa", "start", "end")},
        "experience": {"type": "array", "items": _object("company", "title", "location", "start", "end", "description")},
        "skills": {"type": "array", "items": _STRING},
    },
    "required": ["personal", "education", "experience", "skills"],
    "additionalProperties": False,
}

PREFILL_SYSTEM = """\
Read the CV and fill in what it states, nothing more. An empty string for anything it does not state.
Dates as YYYY-MM. A month name with a year gives that month: "Expected May 2028" is 2028-05, "Summer 2025" is 2025-06; only a
year gives YYYY. An ongoing role ends "Present"; a degree still in progress ends at its expected graduation date when the CV
gives one, else "Present".
Links as full URLs. Description: the role's bullet points, one per line, as written. Skills: one per item."""


async def prefill(client: AsyncOpenAI, model: str, cv: str) -> dict[str, Any]:
    """A first draft of the profile, read from the resume."""
    read = await structured(client, model, PREFILL_SYSTEM, cv, "profile", PREFILL_SCHEMA)
    data = empty_profile()
    data["personal"] |= {name: value for name, value in (read.get("personal") or {}).items() if name in data["personal"]}
    data["education"] = read.get("education") or []
    data["experience"] = read.get("experience") or []
    data["skills"] = read.get("skills") or []
    return data


LENGTHS = {"Short": "one or two sentences", "Medium": "three to five sentences", "Detailed": "up to 150 words"}
# How many kept answers go into one application's brief, after one per question is kept.
MEMORY_IN_BRIEF = 40


def same_question(question: str) -> str:
    """A question reduced to what makes it the same question: lower case, letters and digits, single spaces."""
    return " ".join("".join(char if char.isalnum() else " " for char in question.lower()).split())


def writing_text(preferences: dict[str, Any], memory: list[dict[str, Any]]) -> str:
    """The writing preferences and the kept answers, as the form-filling model reads them after the answers."""
    blocks = []
    lines = []
    if tone := _text(preferences.get("tone")):
        lines.append(f"- tone: {tone}")
    if length := _text(preferences.get("length")):
        lines.append(f"- length: {LENGTHS.get(length, length)}")
    for name, label in (("highlight", "emphasize"), ("avoid", "never say"), ("notes", "also")):
        if value := _text(preferences.get(name)):
            lines.append(f"- {label}: {value}")
    if sample := _text(preferences.get("sample")):
        lines.append(f"- match the candidate's own voice in this sample: {sample}")
    if lines:
        blocks.append("Writing preferences, for open questions answered in words:\n" + "\n".join(lines))

    # One answer per question: a pinned one first, then the candidate's own, then the newest written on an application.
    rank = {"user": 1, "learned": 2}
    kept: dict[str, dict[str, Any]] = {}
    ordered = sorted(
        (entry for entry in memory if _text(entry.get("question")) and _text(entry.get("answer"))),
        key=lambda entry: (not entry.get("pinned"), rank.get(str(entry.get("source")), 3), _negated(str(entry.get("updated_at") or ""))),
    )
    for entry in ordered:
        kept.setdefault(same_question(_text(entry.get("question"))), entry)
    if kept:
        pairs = [
            f"Q: {_text(entry.get('question'))}\nA{' (pinned)' if entry.get('pinned') else ''}: {_text(entry.get('answer'))}"
            for entry in list(kept.values())[:MEMORY_IN_BRIEF]
        ]
        blocks.append(
            "Answers the candidate keeps for questions forms asked before, their own or written on earlier applications. "
            "Reuse one when a question asks the same thing, fitted to this company; a pinned one word for word:\n" + "\n\n".join(pairs)
        )
    return "\n\n".join(blocks)


def _negated(stamp: str) -> tuple[int, ...]:
    """A sort key that puts the newest ISO time first."""
    return tuple(-ord(char) for char in stamp)


# The dashboard's preferences columns, as preferences.md names them. The file's other keys (style, skip_companies,
# cover_letter) are the file's own and are kept when the dashboard's are written in.
PREFERENCE_COLUMNS = ("tone", "length", "highlight", "avoid", "sample", "learn")


def home_writing(home: Home) -> str:
    """The writing preferences and kept answers in the person's home, as writing_text gives them: for the terminal app, which
    has no dashboard, and for any run the dashboard sent none to."""
    values, notes = home.preferences()
    preferences = {name: values.get(name) for name in PREFERENCE_COLUMNS} | {"notes": notes if home.personal_preferences() else ""}
    memory = [
        {"question": m.question, "answer": m.answer, "source": m.source, "pinned": m.pinned, "updated_at": m.updated}
        for m in home.memories()
    ]
    return writing_text(preferences, memory)


def mirror_to_home(home: Home, preferences: dict[str, Any], memory: list[dict[str, Any]]) -> None:
    """The dashboard's preferences and kept answers, written into the person's home: one way, from the dashboard to the files.
    An answer the person typed into memory/ themselves (no id) is never touched."""
    if home.personal is None:
        return
    values, notes = home.preferences() if home.personal_preferences() else ({}, "")
    values = {**values, **{name: preferences[name] for name in PREFERENCE_COLUMNS if name in preferences}}
    home.write_preferences(values, _text(preferences.get("notes")) or notes, "dashboard")
    kept = {m.ident: m for m in home.memories() if m.ident}
    seen = set()
    for row in memory:
        ident, question, answer = str(row.get("id") or ""), _text(row.get("question")), _text(row.get("answer"))
        if not ident or not question or not answer:
            continue
        seen.add(ident)
        slug = kept[ident].slug if ident in kept else f"{slugify(question)[:50]}-{ident}"
        home.remember(Memory(
            question, answer, str(row.get("source") or "user"), bool(row.get("pinned")), _text(row.get("company")), _text(row.get("job_title")),
            str(row.get("updated_at") or "")[:10], slug, ident,
        ), index=False)
    for ident, gone in kept.items():
        if ident not in seen:
            home.forget(gone.slug, index=False)
    home.write_index()

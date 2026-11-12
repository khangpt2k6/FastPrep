"""The profile from the web page's wizard, turned into the answers the form-filling model reads, and a first draft of it
read from the resume. The keys of `data` are the ones web/ writes: see supabase/schema.sql and web/src."""

from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI

from agent_automation.llm import structured


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
        "hispanic_or_latino": _text(eeo.get("hispanic_latino")), "veteran_status": _text(eeo.get("veteran")),
        "disability_status": _text(eeo.get("disability")), "lgbtq": _text(eeo.get("lgbtq")), "sexual_orientation": _text(eeo.get("sexual_orientation")),
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
Dates as YYYY-MM when the month is known, else YYYY; an ongoing role or degree ends "Present".
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

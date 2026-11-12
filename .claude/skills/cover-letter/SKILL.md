---
name: cover-letter
description: Write, review or change cover letters the way the Agent Automation agent does, from a template and the cover letter skills in .agent/. Use when asked to write or fix a cover letter, or to add or edit a cover letter template or rule.
---

# Cover letters in Agent Automation

The agent fills a template the person picked. Text outside `{{ }}` is fixed. `{{field}}` comes from the profile or the
job. `{{slot: note}}` is written by the model for each job, following the note after the colon.

## Where things are

- Templates: `.agent/styles/cover-letters/<id>.md` (front matter `name`, `description`). The person's own come from the
  web page (table `automation_cover_templates`, `builtin = false`) or `~/.agent-automation/styles/cover-letters/`.
- Rules every slot follows: `.agent/skills/cover-letter/<rule>/SKILL.md`, read in their `order`. A rule of the same
  name in `~/.agent-automation/skills/cover-letter/` replaces the project's.
- The candidate's voice: `.agent/AGENT.md`, `preferences.md` and `styles/writing/<style>.md`, both homes.
- Code: `src/agent_automation/agent/cover_letter/__init__.py` (`FIELDS`, `fill`, `polish`, `lint`, `write_letter`,
  `render_pdf`), `sync.py` for the web page, and `Session.cover_letter` in `agent/session.py`. The web copy of the syntax
  is `web/src/lib/coverLetter.ts`: keep its `FIELDS` in step with the agent's.

## Writing a letter by hand

1. Read every rule in `.agent/skills/cover-letter/` and `.agent/AGENT.md`, and follow them.
2. Pick the template, fill the fields from the profile and the job, and write only the slots.
3. Check the result the way `lint()` does: no en or em dashes, no labels like "Why:", no banned phrases, no placeholders.

## Changing templates or rules

- A template needs at least one slot and only `{{name}}` or `{{name: note}}` placeholders (letters, digits, `_`).
- A new field changes three places: `FIELDS` and `fields_for` in the agent, and `FIELDS` in the web lib.
- Run `.venv/Scripts/python -m pytest tests/test_cover_letter.py tests/test_cover_letter_flow.py` after a change.

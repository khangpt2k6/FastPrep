# .agent: the agent's home

Everything Agent Automation is told, and everything it keeps about how you present yourself, lives in one folder laid
out like a `.claude` folder. This one, in the repository, holds the project's defaults. Your own folder,
`~/.agent-automation/`, has the same layout and sits on top of it, the way `~/.claude` sits on top of a project's `.claude`.

```
.agent/
  AGENT.md                     standing instructions for every answer and letter written as you
  settings.yaml                hooks: commands run at the agent's events
  preferences.md               how you want to come across: style, tone, length, highlights, companies to skip
  skills/
    sites/<site>/SKILL.md      how one job site's forms work (Greenhouse, Lever, Workday...)
    always/<name>/SKILL.md     added to every form: reading a mailbox for a code, working dropdowns
    cover-letter/<rule>/SKILL.md   the rules every cover letter follows, in `order`
  styles/
    writing/<style>.md         voices for open questions and letters: plain, warm, formal
    cover-letters/<id>.md      cover letter templates: fixed text, {{fields}} and {{slots: what to write}}
  memory/
    MEMORY.md                  the index of answers given before (yours lives only in ~/.agent-automation)
  hooks/
    skip_companies.py          an example before_apply hook
```

## How the two folders combine

| Part | Rule |
|------|------|
| `AGENT.md` | Both are read, the project's first. Yours adds to it. |
| `settings.yaml` | Your hooks are added after the project's. |
| `preferences.md` | Your keys win, key by key. Your notes replace the project's. |
| `skills/`, `styles/` | One name, one file: yours wins over the project's of the same name. |
| `memory/` | Yours only. Never in the repository. |

## Where the dashboard fits

The web dashboard is where preferences and memory are edited. The agent copies them into your
`~/.agent-automation/preferences.md` and `memory/` each time it applies, one way, so you can read them there and so the
terminal app uses the same ones. An answer you add to `memory/` by hand (a file with no `id`) is never touched by the copy.

## Code

`src/agent_automation/home.py` reads both folders. `skills/__init__.py` loads the site skills, `hooks/runner.py` runs
the hooks, and `agent/cover_letter/` reads the cover letter skills and templates.

# Hooks

Commands the agent runs at moments of its work, listed under `hooks:` in settings.yaml. They work like Claude Code's
hooks: the event comes as JSON on standard input, and the exit code answers.

| Exit | Meaning |
|------|---------|
| 0    | Go on. JSON printed on standard output can change the step (see below). |
| 2    | Stop this step. Standard error is the reason, shown on the dashboard. |
| other | The hook failed: reported in the agent's log, and the agent goes on. |

## Events

| Event | When | What the JSON holds | What stdout can change |
|-------|------|---------------------|------------------------|
| `session_start` | The agent started | `preferences` | nothing |
| `before_apply` | Before a form is opened | `job`, `preferences`, `dry_run` | exit 2 skips the job |
| `letter_written` | A cover letter was written | `job`, `letter`, `template` | `{"letter": "..."}` replaces the text |
| `after_apply` | An application ended | `job`, `status`, `summary`, `dry_run` | nothing |

`job` is `{"id", "company", "title", "location", "url"}`.

## Writing one

A hook is any command. In `run`, `python` as the first word is the Python that runs the agent, and a relative path is read
from the folder of the settings.yaml that lists it. The agent's keys and passwords are not in a hook's environment.

```yaml
hooks:
  after_apply:
    - run: [python, hooks/log_to_sheet.py]
      timeout: 30
```

`skip_companies.py` here is a small example: it reads `skip_companies` from preferences.md and skips those companies.

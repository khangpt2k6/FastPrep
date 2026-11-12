# Contributing

Agent Automation is a command-line program in Python. The most useful contribution is a skill for a job site: a Markdown file that tells the model how that site's application form works. Write one by following [docs/skills.md](docs/skills.md).

## Setup

You need Python 3.11 or newer.

```sh
git clone https://github.com/khangpt2k6/agent-automation
cd Jobs_Applier_AI_Agent
python -m venv .venv
. .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
agent-automation-tui --help
```

The install pulls in `invisible-playwright-mcp` at its newest release from PyPI. It is not pinned, so run `pytest -m browser` after an update to see that a new release still works with Agent Automation.

Running `agent-automation-tui` for real needs an OrcaRouter key and makes model calls. The tests need neither: they use scripted fakes (`tests/fakes.py`) and make no network calls to a model.

Agent Automation keeps its files in `~/.agent-automation` (on Windows, `%USERPROFILE%.agent-automation`).

## Tests

```sh
pytest -m "not browser"     # unit tests: no browser, no model
pytest -m browser           # the real browser on a local form
```

The browser tests run the real `invisible-playwright-mcp` and its Firefox against a form served from `127.0.0.1`, not a live site. On Linux without a display, run them under `xvfb-run -a`.

## Lint

```sh
ruff check .
```

Ruff reads its settings from `[tool.ruff]` in `pyproject.toml`: the default rules only. The line length of 160 is set there but not enforced: `ruff check` does not run E501, so a longer line does not fail it.

## Before you open a pull request

- Run `ruff check .` and `pytest -m "not browser"`. Run `pytest -m browser` too if your change touches `apply.py`, the browser or the forms.
- Keep one change to one purpose. Say in the description what you tried and what you saw.
- For a skill, say which posting you tried it on and what the form did. See [docs/skills.md](docs/skills.md) for how to test one without sending anything.

## What not to send

- A plugin you have not tried on a real posting's form. A plugin is a prompt, and an untried prompt fills forms wrongly.
- Anything that weakens what the person controls: a change that lets the model send a form or an email without the person's yes, that lets a page's text steer the model past the rules in `apply.py`, that reads mail beyond what the mail plugins allow, or that gets around a captcha or a login.
- Real personal data in fixtures or examples: no real CVs, names, e-mail addresses, phone numbers or screenshots of someone's application. Invent the data.

Use the issue templates for bugs and plugin requests. For a security problem, do not open an issue: follow [SECURITY.md](SECURITY.md). Questions go to [Discussions](https://github.com/khangpt2k6/agent-automation/discussions).

## License

By contributing you agree that your change is released under the [MIT license](LICENSE).

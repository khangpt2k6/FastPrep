"""agent-automation-tui [your resume]: one command, the rest happens on the screen it opens."""

from __future__ import annotations

import io
import sys
from pathlib import Path

import click

from agent_automation import __version__
from agent_automation.memory.config import ConfigError, default_home, load_dotenv
from agent_automation.skills import SkillError
from agent_automation.tools.database import DatabaseError


@click.command()
@click.version_option(__version__)
@click.argument("resume", required=False, type=click.Path(exists=True, dir_okay=False, path_type=Path))
def main(resume: Path | None) -> None:
    """Give it your resume, get the jobs that fit, select them and apply."""
    # Imported here: the interface takes a moment to load, and --help should not wait for it.
    from agent_automation.ui.tui import AutomationApp

    AutomationApp(default_home().resolve(), resume.resolve() if resume else None).run()


def run() -> None:
    # A Windows console's code page cannot print every company's name.
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")
    load_dotenv(Path.cwd(), default_home(), Path(__file__).resolve().parents[3])
    try:
        main()
    except (ConfigError, DatabaseError, SkillError) as error:
        raise SystemExit(f"agent-automation-tui: {error}") from error

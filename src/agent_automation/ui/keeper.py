"""Keeps the web dashboard's agent running in the background on this computer: started at login, started again when it
ends, and stopped when asked.

    python -m agent_automation.ui.keeper run        the keeper itself: runs the agent and starts it again when it ends
    python -m agent_automation.ui.keeper start      the keeper in the background, with no window
    python -m agent_automation.ui.keeper stop       asks the agent to stop, and ends it after 20 seconds if it has not
    python -m agent_automation.ui.keeper status     whether it runs, and the end of its log
    python -m agent_automation.ui.keeper install    Windows: start it at login, and two shortcuts on the desktop
    python -m agent_automation.ui.keeper uninstall  Windows: take those away again

Everything lives in the agent's data folder (~/.agent-automation/data): the agent's log (agent.log), the file that asks it
to stop (agent.stop), and the locks that keep one agent and one keeper per home.
"""

from __future__ import annotations

import base64
import contextlib
import html
import io
import os
import re
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import IO

import click

from agent_automation.memory.config import Config, default_home

# In the data folder. The agent ends when STOP_FILE is there; LOCK_FILE and KEEPER_LOCK are held while one runs.
STOP_FILE = "agent.stop"
LOCK_FILE = "agent.lock"
KEEPER_LOCK = "keeper.lock"
PID_FILE = "keeper.pid"
LOG_FILE = "agent.log"
# agent.log becomes agent.log.1 past this size, before the agent is started again.
LOG_BYTES = 5_000_000
# The waits before the agent is started again, one more step each time it ends in a row; a run of RESET_SECONDS or
# more starts the steps over.
BACKOFF = (5, 10, 30, 60)
RESET_SECONDS = 600
STOP_WAIT_SECONDS = 20
ROOT = Path(__file__).resolve().parents[3]
WORKER = "from agent_automation.ui.worker import run; run()"
WINDOWS = sys.platform == "win32"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
DETACHED = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | NO_WINDOW
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE = "AgentAutomation"
# The desktop shortcuts install makes, and what each one runs.
SHORTCUTS = {"Bật Agent.lnk": "start", "Tắt Agent.lnk": "stop"}
# Windows' answers about a process.
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
STILL_ACTIVE = 259
ACCESS_DENIED = 5


def data_dir() -> Path:
    return Config(workspace=default_home().resolve()).data_dir


def console_python(executable: str = sys.executable) -> str:
    """The Python that runs the agent: python.exe beside pythonw.exe, so the agent has a console (with no window) whose
    output goes to the log."""
    path = Path(executable)
    if path.name.lower() == "pythonw.exe" and path.with_name("python.exe").is_file():
        return str(path.with_name("python.exe"))
    return executable


def window_python(executable: str = sys.executable) -> str:
    """The Python with no console, pythonw.exe beside python.exe, so the keeper never opens a window. Elsewhere, this one."""
    path = Path(executable)
    if path.name.lower() == "python.exe" and path.with_name("pythonw.exe").is_file():
        return str(path.with_name("pythonw.exe"))
    return executable


# One agent and one keeper per home: each holds a lock on a file in the data folder for as long as it runs. The system
# gives the lock back when the process ends, however it ends.


def hold_lock(path: Path) -> IO[bytes] | None:
    """The lock on this file, held until `release` or the end of this process; None when another one holds it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(path, "a+b")  # noqa: SIM115  Kept open: the lock lasts as long as the file is open.
    try:
        if WINDOWS:
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


def take_lock(path: Path, tries: int = 5) -> IO[bytes] | None:
    """The lock, tried a few times: `held` takes it for an instant when it asks, and that instant must not turn a start away."""
    for attempt in range(tries):
        handle = hold_lock(path)
        if handle is not None or attempt == tries - 1:
            return handle
        time.sleep(0.2)
    return None


def release(handle: IO[bytes]) -> None:
    if WINDOWS:
        import msvcrt

        handle.seek(0)
        with contextlib.suppress(OSError):
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    handle.close()


def held(path: Path) -> bool:
    """Whether a running process holds the lock on this file."""
    handle = hold_lock(path)
    if handle is None:
        return True
    release(handle)
    return False


def alive(pid: int) -> bool:
    """Whether the process with this id is running, asked of the system itself: no package beyond Python's own."""
    if pid <= 0:
        return False
    if WINDOWS:
        import ctypes
        from ctypes import wintypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
        kernel.GetExitCodeProcess.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
        kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
        handle = kernel.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            # Not allowed to look at it means it is there.
            return ctypes.get_last_error() == ACCESS_DENIED
        try:
            code = wintypes.DWORD()
            return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == STILL_ACTIVE
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def keeper_running(data: Path) -> bool:
    """Whether a keeper runs for this home. Its lock says so, not its pid file: a computer switched off with the keeper
    running leaves the file, and the id in it can belong to another process by the next login."""
    return held(data / KEEPER_LOCK)


def keeper_pid(data: Path) -> int | None:
    """The process id the running keeper wrote; None when there is no keeper, or it has not written it yet."""
    try:
        pid = int((data / PID_FILE).read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    return pid if keeper_running(data) and alive(pid) else None


def kill_tree(pid: int) -> None:
    """Ends this process and the ones it started, at once."""
    if WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=NO_WINDOW, check=False)
        return
    with contextlib.suppress(OSError):
        # The keeper `start` makes leads its own group, with the agent in it.
        if os.getpgid(pid) == pid:
            os.killpg(pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)


# The log.


def note(data: Path, line: str) -> None:
    """A line of the keeper's own in agent.log, with the time."""
    data.mkdir(parents=True, exist_ok=True)
    with (data / LOG_FILE).open("a", encoding="utf-8") as log:
        log.write(f"[keeper {time.strftime('%Y-%m-%d %H:%M:%S')}] {line}\n")


def rotate(log: Path) -> None:
    """agent.log moved to agent.log.1 once it is past LOG_BYTES, so the log never grows without end."""
    try:
        if log.stat().st_size > LOG_BYTES:
            os.replace(log, log.with_name(log.name + ".1"))
    except OSError:
        pass  # No log yet, or a reader holds it open for a moment: it is moved next time.


def tail(path: Path, count: int) -> list[str]:
    """The last lines of a text file; none when there is no file."""
    try:
        with path.open("rb") as file:
            file.seek(0, os.SEEK_END)
            file.seek(max(0, file.tell() - 64_000))
            data = file.read()
    except OSError:
        return []
    return data.decode("utf-8", errors="replace").splitlines()[-count:]


# The keeper.


def run_once(command: list[str], cwd: Path, log: Path) -> int:
    """The agent run until it ends, its output added to the log; its exit code."""
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    with log.open("ab") as out:
        try:
            child = subprocess.Popen(
                command, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT, creationflags=NO_WINDOW,
            )
        except OSError as error:
            out.write(f"[keeper] the agent could not be started: {error}\n".encode())
            return -1
        try:
            return child.wait()
        except BaseException:
            # The keeper itself is going: the agent goes with it.
            kill_tree(child.pid)
            raise


def wait_for_stop(stop: Path, seconds: float) -> None:
    """Waits this long, or less when the stop file appears meanwhile."""
    end = time.monotonic() + seconds
    while not stop.exists() and (left := end - time.monotonic()) > 0:
        time.sleep(min(1.0, left))


def supervise(data: Path, command: list[str], cwd: Path, clock: Callable[[], float] = time.monotonic) -> None:
    """Runs the agent until the stop file is there, and starts it again each time it ends: after 5, 10, 30, then 60 seconds
    while it keeps ending, from 5 seconds again once a run lasted RESET_SECONDS."""
    stop = data / STOP_FILE
    ended = 0
    while not stop.exists():
        rotate(data / LOG_FILE)
        started = clock()
        code = run_once(command, cwd, data / LOG_FILE)
        if stop.exists():
            break
        if clock() - started >= RESET_SECONDS:
            ended = 0
        pause = BACKOFF[min(ended, len(BACKOFF) - 1)]
        ended += 1
        note(data, f"the agent ended (exit code {code}), starting it again in {pause} s")
        wait_for_stop(stop, pause)


# Windows: at login, and on the desktop.


def set_autostart(command: str | None) -> None:
    """The Run value that starts the agent at login, written, or removed when `command` is None."""
    import winreg

    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if command is None:
            with contextlib.suppress(FileNotFoundError):
                winreg.DeleteValue(key, RUN_VALUE)
        else:
            winreg.SetValueEx(key, RUN_VALUE, 0, winreg.REG_SZ, command)


def quoted(text: str) -> str:
    """Text as a PowerShell string that reads it as it is."""
    return "'" + text.replace("'", "''") + "'"


def plain_name(action: str) -> str:
    return f"agent-automation-{action}.lnk"


def shortcuts_script(python: str) -> str:
    """PowerShell that puts the two shortcuts on the desktop. The desktop is asked of Windows, since OneDrive can move it.
    WScript.Shell saves a shortcut only under a name the system's code page can spell, which Bật is not on an English
    Windows: each one is saved under a plain name, then renamed."""
    lines = [
        "$ErrorActionPreference = 'Stop'", "$ProgressPreference = 'SilentlyContinue'", "$shell = New-Object -ComObject WScript.Shell",
        "$desktop = [Environment]::GetFolderPath('Desktop')",
    ]
    for name, action in SHORTCUTS.items():
        lines += [
            f"$plain = Join-Path $desktop {quoted(plain_name(action))}",
            "$link = $shell.CreateShortcut($plain)",
            f"$link.TargetPath = {quoted(python)}",
            f"$link.Arguments = {quoted(f'-m agent_automation.ui.keeper {action}')}",
            f"$link.WorkingDirectory = {quoted(str(ROOT))}",
            f"$link.Description = {quoted(f'Agent Automation: {action} the agent')}",
            "$link.Save()",
            f"Move-Item -LiteralPath $plain -Destination (Join-Path $desktop {quoted(name)}) -Force",
        ]
    return "\n".join(lines)


def removal_script() -> str:
    """PowerShell that takes the two shortcuts off the desktop, and a plain-named one a failed install may have left."""
    lines = ["$ErrorActionPreference = 'Stop'", "$ProgressPreference = 'SilentlyContinue'", "$desktop = [Environment]::GetFolderPath('Desktop')"]
    for name, action in SHORTCUTS.items():
        for each in (name, plain_name(action)):
            lines += [f"$file = Join-Path $desktop {quoted(each)}", "if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }"]
    return "\n".join(lines + ["exit 0"])


def powershell(script: str) -> None:
    """Runs a PowerShell script, given encoded so no quoting or code page can change it."""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    done = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], capture_output=True, creationflags=NO_WINDOW, check=False,
    )
    if done.returncode != 0:
        raise click.ClickException(f"PowerShell failed: {powershell_said(done.stderr)}")


def powershell_said(stderr: bytes) -> str:
    """PowerShell's errors in words: with no console to write to, it writes them as CLIXML."""
    text = stderr.decode("utf-8", errors="replace").strip()
    if not text.startswith("#< CLIXML"):
        return text
    errors = re.findall(r'<S S="Error">(.*?)</S>', text, flags=re.DOTALL)
    return html.unescape("".join(errors).replace("_x000D__x000A_", "\n")).strip() or text


def _windows_only(what: str) -> None:
    if not WINDOWS:
        raise click.ClickException(f"{what} is for Windows. Elsewhere, have your system run `python -m agent_automation.ui.keeper start` at login.")


# The commands.


@click.group()
def keeper() -> None:
    """Keep the agent running in the background on this computer."""


@keeper.command("run")
def run_command() -> None:
    """Run the agent, and start it again whenever it ends, until stop asks it to end."""
    data = data_dir()
    lock = take_lock(data / KEEPER_LOCK)
    if lock is None:
        raise click.ClickException(f"a keeper is already running for this home (pid {keeper_pid(data) or 'unknown'})")
    pid_file = data / PID_FILE
    try:
        pid_file.write_text(str(os.getpid()), encoding="utf-8")
        # A stop that was asked of an agent that is gone.
        (data / STOP_FILE).unlink(missing_ok=True)
        note(data, f"keeper started (pid {os.getpid()})")
        supervise(data, [console_python(), "-c", WORKER], ROOT)
        note(data, "keeper stopped")
    finally:
        pid_file.unlink(missing_ok=True)
        (data / STOP_FILE).unlink(missing_ok=True)
        release(lock)


@keeper.command()
def start() -> None:
    """Start the keeper in the background, with no window. Nothing happens when it already runs."""
    data = data_dir()
    if keeper_running(data):
        click.echo(f"The agent is already running (keeper pid {keeper_pid(data) or 'unknown'}).")
        return
    # With no keeper running, both are left from one that did not end on its own.
    (data / STOP_FILE).unlink(missing_ok=True)
    (data / PID_FILE).unlink(missing_ok=True)
    subprocess.Popen(
        [window_python(), "-m", "agent_automation.ui.keeper", "run"], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, creationflags=DETACHED if WINDOWS else 0, start_new_session=not WINDOWS, close_fds=True,
    )
    for _ in range(50):
        if (pid := keeper_pid(data)) is not None:
            click.echo(f"The agent is starting in the background (keeper pid {pid}). Its log: {data / LOG_FILE}")
            return
        time.sleep(0.1)
    click.echo(f"The keeper did not say it started. Look at {data / LOG_FILE}, or run it in this window: python -m agent_automation.ui.keeper run")


@keeper.command()
def stop() -> None:
    """Ask the agent to stop and wait for it. One still running after 20 seconds is ended, keeper and all."""
    data = data_dir()
    stop_file = data / STOP_FILE

    def running() -> bool:
        return keeper_running(data) or held(data / LOCK_FILE)

    if not running():
        stop_file.unlink(missing_ok=True)
        click.echo("The agent is not running.")
        return
    pid = keeper_pid(data)
    stop_file.parent.mkdir(parents=True, exist_ok=True)
    stop_file.touch()
    click.echo("Asked the agent to stop. Waiting for it...")
    deadline = time.monotonic() + STOP_WAIT_SECONDS
    while running() and time.monotonic() < deadline:
        time.sleep(0.5)
    if running() and pid is not None:
        kill_tree(pid)
        for _ in range(20):
            if not running():
                break
            time.sleep(0.25)
        (data / PID_FILE).unlink(missing_ok=True)
        click.echo(f"The agent did not stop within {STOP_WAIT_SECONDS} s, so it was ended (keeper pid {pid}).")
    elif running():
        # An agent started by hand, with no keeper: the stop file stays, and it ends at its next look.
        click.echo("The agent is still running. Close its window, or wait: it stops as soon as it can.")
        return
    else:
        click.echo("The agent stopped.")
    stop_file.unlink(missing_ok=True)


@keeper.command()
def status() -> None:
    """Whether the keeper and the agent run, and the last lines of the agent's log."""
    data = data_dir()
    if keeper_running(data):
        click.echo(f"Keeper: running (pid {keeper_pid(data) or 'unknown'})")
    else:
        click.echo("Keeper: not running")
    click.echo(f"Agent: {'running' if held(data / LOCK_FILE) else 'not running'}")
    log = data / LOG_FILE
    lines = tail(log, 20)
    click.echo(f"Last lines of {log}:" if lines else f"No log yet at {log}.")
    for line in lines:
        click.echo(f"  {line}")


@keeper.command()
def install() -> None:
    """Windows: start the agent at login, and put Bật Agent and Tắt Agent shortcuts on the desktop."""
    _windows_only("install")
    python = window_python()
    set_autostart(f'"{python}" -m agent_automation.ui.keeper start')
    powershell(shortcuts_script(python))
    click.echo(f"The agent now starts when you log in (Run value {RUN_VALUE}), and the desktop has {' and '.join(name[:-4] for name in SHORTCUTS)}.")
    click.echo("Start it now with: python -m agent_automation.ui.keeper start")


@keeper.command()
def uninstall() -> None:
    """Windows: no more start at login, and the two desktop shortcuts removed. A running agent keeps running until stop."""
    _windows_only("uninstall")
    set_autostart(None)
    powershell(removal_script())
    click.echo("The agent no longer starts at login, and its desktop shortcuts are gone.")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")
    keeper(prog_name="python -m agent_automation.ui.keeper")


if __name__ == "__main__":
    main()

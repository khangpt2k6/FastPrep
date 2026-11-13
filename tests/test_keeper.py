"""The keeper that runs the agent in the background, with no registry, no shortcut and no process left behind: what it
would start is recorded, and the agent it runs is a short Python line."""

from __future__ import annotations

import base64
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from typing import IO, Any

import pytest
from click.testing import CliRunner

from agent_automation.ui import keeper


@pytest.fixture
def data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """The agent's data folder, here; locks are taken once, with no waiting between tries."""
    monkeypatch.setattr(keeper, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(keeper, "take_lock", lambda path, tries=5: keeper.hold_lock(path))
    return tmp_path


def invoke(*args: str) -> Any:
    return CliRunner().invoke(keeper.keeper, list(args))


def a_keeper(data: Path) -> IO[bytes]:
    """A keeper as `run` leaves things: its lock held and its pid written."""
    lock = keeper.hold_lock(data / keeper.KEEPER_LOCK)
    assert lock is not None
    (data / keeper.PID_FILE).write_text(str(os.getpid()), encoding="utf-8")
    return lock


def test_the_agent_runs_on_python_exe_and_the_keeper_on_pythonw_exe(tmp_path: Path) -> None:
    scripts = tmp_path / "Scripts"
    scripts.mkdir()
    for name in ("python.exe", "pythonw.exe"):
        (scripts / name).touch()
    assert keeper.console_python(str(scripts / "pythonw.exe")) == str(scripts / "python.exe")
    assert keeper.console_python(str(scripts / "python.exe")) == str(scripts / "python.exe")
    assert keeper.window_python(str(scripts / "python.exe")) == str(scripts / "pythonw.exe")
    assert keeper.window_python(str(tmp_path / "bin" / "python3")) == str(tmp_path / "bin" / "python3")


def test_a_lock_is_one_process_at_a_time_until_it_is_given_back(tmp_path: Path) -> None:
    first = keeper.hold_lock(tmp_path / "data" / "x.lock")
    assert first is not None
    assert keeper.hold_lock(tmp_path / "data" / "x.lock") is None and keeper.held(tmp_path / "data" / "x.lock")
    keeper.release(first)
    assert not keeper.held(tmp_path / "data" / "x.lock")


def test_alive_knows_this_process_and_not_one_that_ended() -> None:
    assert keeper.alive(os.getpid())
    ended = subprocess.run([sys.executable, "-c", "import os; print(os.getpid())"], capture_output=True, text=True, check=True)
    assert not keeper.alive(int(ended.stdout))
    assert not keeper.alive(0) and not keeper.alive(-5)


def test_the_log_is_moved_aside_once_it_is_too_big(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keeper, "LOG_BYTES", 10)
    log = tmp_path / keeper.LOG_FILE
    log.write_text("x" * 11, encoding="utf-8")
    keeper.rotate(log)
    assert not log.exists() and (tmp_path / "agent.log.1").read_text(encoding="utf-8") == "x" * 11
    log.write_text("small", encoding="utf-8")
    keeper.rotate(log)
    assert log.read_text(encoding="utf-8") == "small"
    keeper.rotate(tmp_path / "none.log")


def test_one_run_of_the_agent_adds_its_output_to_the_log(tmp_path: Path) -> None:
    log = tmp_path / keeper.LOG_FILE
    log.write_text("before\n", encoding="utf-8")
    code = keeper.run_once([sys.executable, "-c", "import sys; print('Bật Agent: hello'); sys.exit(3)"], tmp_path, log)
    assert code == 3
    assert log.read_text(encoding="utf-8").splitlines() == ["before", "Bật Agent: hello"]
    assert keeper.run_once([str(tmp_path / "no-python.exe")], tmp_path, log) == -1
    assert "the agent could not be started" in log.read_text(encoding="utf-8")


def test_the_keeper_starts_the_agent_again_after_longer_waits_until_asked_to_stop(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    clock = [0.0]
    # How long each run of the agent lasts, in seconds; at the last one the stop file appears.
    runs = iter([1, 1, 1, 1, 1, 700, 1, None])
    pauses: list[float] = []

    def run_once(command: list[str], cwd: Path, log: Path) -> int:
        length = next(runs)
        if length is None:
            (tmp_path / keeper.STOP_FILE).touch()
            return 0
        clock[0] += length
        return 1

    monkeypatch.setattr(keeper, "run_once", run_once)
    monkeypatch.setattr(keeper, "wait_for_stop", lambda stop, seconds: pauses.append(seconds))
    keeper.supervise(tmp_path, ["python"], tmp_path, clock=lambda: clock[0])
    assert pauses == [5, 10, 30, 60, 60, 5, 10]
    notes = (tmp_path / keeper.LOG_FILE).read_text(encoding="utf-8").splitlines()
    assert len(notes) == 7 and notes[0].startswith("[keeper ") and notes[0].endswith("the agent ended (exit code 1), starting it again in 5 s")


def test_a_wait_between_runs_ends_early_when_the_stop_file_appears(tmp_path: Path) -> None:
    stop = tmp_path / keeper.STOP_FILE
    threading.Timer(0.2, stop.touch).start()
    started = time.monotonic()
    keeper.wait_for_stop(stop, 30)
    assert time.monotonic() - started < 5


def test_run_refuses_a_second_keeper_and_cleans_up_after_itself(data: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    lock = a_keeper(data)
    result = invoke("run")
    keeper.release(lock)
    assert result.exit_code != 0 and "a keeper is already running" in result.output
    seen: list[Any] = []

    def supervise(folder: Path, command: list[str], cwd: Path) -> None:
        seen.append((folder, command, cwd, (data / keeper.PID_FILE).read_text(encoding="utf-8"), (data / keeper.STOP_FILE).exists()))

    monkeypatch.setattr(keeper, "supervise", supervise)
    # A stop left from before is not this keeper's.
    (data / keeper.STOP_FILE).touch()
    assert invoke("run").exit_code == 0
    (folder, command, cwd, pid, stopping), = seen
    assert folder == data and command[1:] == ["-c", keeper.WORKER] and cwd == keeper.ROOT and pid == str(os.getpid()) and not stopping
    assert not (data / keeper.PID_FILE).exists() and not keeper.held(data / keeper.KEEPER_LOCK)
    assert "keeper started" in (data / keeper.LOG_FILE).read_text(encoding="utf-8")


def test_start_leaves_a_running_keeper_alone_and_otherwise_starts_one_with_no_window(data: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def no_second(*_: Any, **__: Any) -> None:
        raise AssertionError("a second keeper was started")

    lock = a_keeper(data)
    monkeypatch.setattr(keeper.subprocess, "Popen", no_second)
    result = invoke("start")
    keeper.release(lock)
    assert "already running" in result.output and str(os.getpid()) in result.output

    started: list[Any] = []
    locks: list[IO[bytes] | None] = []

    def spawn(command: list[str], **options: Any) -> SimpleNamespace:
        started.append((command, options))
        # The keeper takes its lock and writes its pid, as `run` does.
        locks.append(a_keeper(data))
        return SimpleNamespace(pid=os.getpid())

    monkeypatch.setattr(keeper.subprocess, "Popen", spawn)
    (data / keeper.STOP_FILE).touch()
    try:
        result = invoke("start")
    finally:
        for held in locks:
            if held is not None:
                keeper.release(held)
    (command, options), = started
    assert command[1:] == ["-m", "agent_automation.ui.keeper", "run"] and options["cwd"] == keeper.ROOT
    assert "starting in the background" in result.output and not (data / keeper.STOP_FILE).exists()
    if keeper.WINDOWS:
        assert Path(command[0]).name.lower() == "pythonw.exe"
        for flag in ("DETACHED_PROCESS", "CREATE_NEW_PROCESS_GROUP", "CREATE_NO_WINDOW"):
            assert options["creationflags"] & getattr(subprocess, flag)


def test_stop_asks_the_agent_first_and_ends_it_only_when_it_does_not_listen(data: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assert "not running" in invoke("stop").output

    killed: list[int] = []
    monkeypatch.setattr(keeper, "kill_tree", lambda pid: killed.append(pid))
    lock = a_keeper(data)

    def listens() -> None:
        while not (data / keeper.STOP_FILE).exists():
            time.sleep(0.05)
        keeper.release(lock)

    threading.Thread(target=listens, daemon=True).start()
    result = invoke("stop")
    assert "The agent stopped." in result.output and killed == [] and not (data / keeper.STOP_FILE).exists()

    monkeypatch.setattr(keeper, "STOP_WAIT_SECONDS", 0.3)
    stubborn = a_keeper(data)

    def kill(pid: int) -> None:
        killed.append(pid)
        keeper.release(stubborn)

    monkeypatch.setattr(keeper, "kill_tree", kill)
    result = invoke("stop")
    assert killed == [os.getpid()] and "so it was ended" in result.output
    assert not (data / keeper.STOP_FILE).exists() and not (data / keeper.PID_FILE).exists()


def test_status_says_what_runs_and_shows_the_end_of_the_log(data: Path) -> None:
    (data / keeper.LOG_FILE).write_text("".join(f"line {number}\n" for number in range(30)), encoding="utf-8")
    result = invoke("status")
    assert "Keeper: not running" in result.output and "Agent: not running" in result.output
    assert "  line 10\n" in result.output and "  line 29\n" in result.output and "  line 9\n" not in result.output
    agent = keeper.hold_lock(data / keeper.LOCK_FILE)
    lock = a_keeper(data)
    try:
        result = invoke("status")
    finally:
        keeper.release(lock)
        if agent is not None:
            keeper.release(agent)
    assert f"Keeper: running (pid {os.getpid()})" in result.output and "Agent: running" in result.output


@pytest.mark.skipif(not keeper.WINDOWS, reason="install is for Windows")
def test_install_writes_the_login_entry_and_two_desktop_shortcuts_and_uninstall_takes_them_away(monkeypatch: pytest.MonkeyPatch) -> None:
    entries: list[str | None] = []
    scripts: list[str] = []
    monkeypatch.setattr(keeper, "set_autostart", entries.append)
    monkeypatch.setattr(keeper, "powershell", scripts.append)
    result = invoke("install")
    assert result.exit_code == 0, result.output
    python = keeper.window_python()
    assert entries == [f'"{python}" -m agent_automation.ui.keeper start'] and python.lower().endswith("pythonw.exe")
    script = scripts[0]
    assert "[Environment]::GetFolderPath('Desktop')" in script and f"$link.WorkingDirectory = '{keeper.ROOT}'" in script
    assert "'Bật Agent.lnk'" in script and "'-m agent_automation.ui.keeper start'" in script
    assert "'Tắt Agent.lnk'" in script and "'-m agent_automation.ui.keeper stop'" in script
    # WScript.Shell cannot save under a name outside the code page: a plain name first, then renamed.
    assert "$shell.CreateShortcut($plain)" in script and "Move-Item -LiteralPath $plain -Destination (Join-Path $desktop 'Bật Agent.lnk')" in script
    assert invoke("uninstall").exit_code == 0
    assert entries[-1] is None and "Remove-Item" in scripts[-1] and "'Bật Agent.lnk'" in scripts[-1] and "'Tắt Agent.lnk'" in scripts[-1]
    assert scripts[-1].endswith("exit 0")


def test_powershell_gets_the_script_whole_whatever_its_letters_and_quotes(monkeypatch: pytest.MonkeyPatch) -> None:
    ran: list[list[str]] = []

    def run(command: list[str], **_: Any) -> SimpleNamespace:
        ran.append(command)
        return SimpleNamespace(returncode=0, stderr=b"")

    monkeypatch.setattr(keeper.subprocess, "run", run)
    script = f"Write-Output {keeper.quoted(chr(39) + 'Tắt Agent' + chr(39))}"
    keeper.powershell(script)
    assert ran[0][:4] == ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand"]
    assert base64.b64decode(ran[0][4]).decode("utf-16-le") == script == "Write-Output '''Tắt Agent'''"


def test_powershells_errors_are_said_in_words_not_clixml() -> None:
    said = (
        '#< CLIXML\r\n<Objs Version="1.1.0.1"><Obj S="progress" RefId="0"><AV>Preparing modules for first use.</AV></Obj>'
        '<S S="Error">Unable to save shortcut &quot;B?t Agent.lnk&quot;._x000D__x000A_</S><S S="Error">At line:8 char:1_x000D__x000A_</S></Objs>'
    )
    assert keeper.powershell_said(said.encode()) == 'Unable to save shortcut "B?t Agent.lnk".\nAt line:8 char:1'
    assert keeper.powershell_said(b"plain words\r\n") == "plain words"

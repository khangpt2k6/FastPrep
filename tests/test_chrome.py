"""tools/chrome.py: what its tools refuse, and the tools on a real Chrome (marked browser)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from agent_automation.agent.apply import DRY_RUN_GUARD, PAGE
from agent_automation.tools import chrome


@pytest.mark.parametrize("script", ["document.querySelector('#send').click()", "form.submit()", "f.requestSubmit()",
                                    "el.dispatchEvent(new Event('change'))", "input.value = 'x'", "box.checked=true"])
def test_a_script_that_acts_on_the_page_is_refused(script: str) -> None:
    assert chrome.ACTING.search(script)


@pytest.mark.parametrize("script", [DRY_RUN_GUARD, PAGE, "document.title", "input.value === 'x'", "list.length"])
def test_a_script_that_only_reads_passes(script: str) -> None:
    assert not chrome.ACTING.search(script)


def test_only_files_from_the_upload_folders_can_be_attached(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cvs, other = tmp_path / "cvs", tmp_path / "other"
    (cvs / ".secret").mkdir(parents=True)
    other.mkdir()
    for path in (cvs / "cv.pdf", cvs / ".secret" / "key.pdf", other / "x.pdf"):
        path.write_bytes(b"%PDF")
    monkeypatch.setenv(chrome.UPLOAD_DIRS_ENV, str(cvs))
    assert chrome._allowed(str(cvs / "cv.pdf")) == str((cvs / "cv.pdf").resolve())
    with pytest.raises(PermissionError):
        chrome._allowed(str(other / "x.pdf"))
    with pytest.raises(PermissionError):
        chrome._allowed(str(cvs / ".secret" / "key.pdf"))
    with pytest.raises(FileNotFoundError):
        chrome._allowed(str(cvs / "missing.pdf"))


FORM = """<!doctype html><title>Form</title><style>.hidden { opacity: 0; position: absolute; }</style>
<form><label for="123abc">Name</label><input id="123abc" name="name">
<fieldset><legend>Sponsorship</legend>
<input class="hidden" type="radio" name="visa" id="visa-yes" value="yes"><label for="visa-yes">Yes</label>
<input class="hidden" type="radio" name="visa" id="visa-no" value="no"><label for="visa-no">No</label></fieldset>
<select id="country"><option value="">Choose</option><option value="us">United States</option><option value="vn">Vietnam</option></select>
<input id="cv" type="file"><button type="button" id="send">Submit application</button></form>"""


@pytest.mark.browser
def test_the_tools_read_and_fill_a_form_in_chrome(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(chrome.HEADLESS_ENV, "1")
    monkeypatch.setenv(chrome.UPLOAD_DIRS_ENV, str(tmp_path))
    page = tmp_path / "form.html"
    page.write_text(FORM, encoding="utf-8")
    cv = tmp_path / "cv.pdf"
    cv.write_bytes(b"%PDF-1.4")

    async def fill() -> None:
        await chrome.browser_open(str(tmp_path / "profile"))
        try:
            assert "Status" in await chrome.browser_navigate(page.as_uri())
            snapshot = json.loads(await chrome.browser_snapshot())
            by_label = {item["label"]: item for item in snapshot["elements"]}
            # An id that starts with a digit gets a selector that works; a hidden radio is clicked through its label.
            assert by_label["Name"]["selector"] == '[id="123abc"]'
            assert by_label["No"]["click"] == 'label[for="visa-no"]'
            assert "all 9 characters" in await chrome.browser_type('[id="123abc"]', "Ada Rossi")
            await chrome.browser_click(by_label["No"]["click"])
            assert "United States" in await chrome.browser_select_option("#country", "United States")
            assert "cv.pdf" in await chrome.browser_upload_files("#cv", [str(cv)])
            state = json.loads(await chrome.browser_evaluate(
                "({name: document.querySelector('[id=\"123abc\"]').value, visa: document.querySelector('[name=visa]:checked')?.value,"
                " country: document.querySelector('#country').value, files: document.querySelector('#cv').files.length})"))
            assert state == {"name": "Ada Rossi", "visa": "no", "country": "us", "files": 1}
            assert 'value="Ada Rossi"' in await chrome.browser_read_html("form")
            with pytest.raises(PermissionError):
                await chrome.browser_evaluate("document.querySelector('#send').click()")
            with pytest.raises(ValueError, match="not a valid selector"):
                await chrome.browser_click("#123abc")
        finally:
            await chrome.browser_close()

    asyncio.run(fill())

"""The real browser on a form that asks for a cover letter: the letter's PDF reaches the file field and its text the box."""

from __future__ import annotations

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, ClassVar

import pytest

from agent_automation.agent.apply import apply_to_job
from agent_automation.agent.cover_letter import render_pdf
from agent_automation.tools.database import Job
from fakes import ScriptedModel, tool_call

pytestmark = pytest.mark.browser

FORM = b"""<!doctype html><title>Apply</title>
<form method="post" action="/sent" enctype="multipart/form-data">
<label>Name <input id="name" name="name"></label>
<label>Resume <input id="resume" type="file" name="resume"></label>
<label>Cover letter <input id="cover_letter" type="file" name="cover_letter"></label>
<label>Message to the hiring team <textarea id="message" name="message"></textarea></label>
<button id="send">Submit application</button>
</form>"""


class Form(BaseHTTPRequestHandler):
    posts: ClassVar[list[bytes]] = []

    def _page(self, body: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._page(FORM)

    def do_POST(self) -> None:
        Form.posts.append(self.rfile.read(int(self.headers["Content-Length"])))
        self._page(b"<title>Done</title><h1>Thank you, your application was received</h1>")

    def log_message(self, *args: Any) -> None:
        pass


@pytest.fixture
def site() -> Any:
    Form.posts = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), Form)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/"
    server.shutdown()


def test_the_cover_letter_pdf_and_its_text_reach_the_employer_with_the_cv(site: str, tmp_path: Path) -> None:
    cv = tmp_path / "cvs" / "original-cv.pdf"
    cv.parent.mkdir(parents=True)
    cv.write_bytes(b"%PDF-1.4 Ada Rossi CV")
    text = "Dear Hiring Team,\n\nI build backends that stay up.\n\nBest regards,\nAda Rossi\n"
    pdf = render_pdf(text, tmp_path / "cvs" / "cover-letters" / "t_1" / "Cover_Letter_Ada_Rossi_Acme.pdf")
    model = ScriptedModel(
        [tool_call("browser_type", selector="#name", text="Ada Rossi")],
        [tool_call("browser_upload_files", selector="#resume", paths=[str(cv)])],
        [tool_call("browser_upload_files", selector="#cover_letter", paths=[str(pdf)])],
        [tool_call("browser_type", selector="#message", text="I build backends that stay up.")],
        [tool_call("finish_form", status="ready", summary="name, CV and cover letter", submit_selector="#send")],
        json.dumps({"outcome": "submitted", "evidence": "thank you page"}),
    )
    job = Job("t:1", "Acme", "Engineer", "Rome", site, site, "d")
    outcome = asyncio.run(apply_to_job(model, "m", job, "cv", "answers", cv, tmp_path, tmp_path / "browser-profile", cover=(text, pdf)))  # type: ignore[arg-type]

    assert outcome.status == "submitted", outcome.summary
    assert len(Form.posts) == 1
    sent = Form.posts[0]
    assert b'filename="Cover_Letter_Ada_Rossi_Acme.pdf"' in sent and b"Ada Rossi CV" in sent
    assert b"I build backends that stay up." in sent
    brief = model.requests[0]["messages"][1]["content"]
    assert str(pdf) in brief and "I build backends that stay up." in brief

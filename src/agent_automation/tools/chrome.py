"""The agent's hands in Google Chrome.

This is an MCP server: for each form, the agent (agent/apply.py) starts it, and the model calls its tools to read the
page and to click, type, pick and upload, one step at a time, in a Chrome window the person can watch. Playwright is
what moves Chrome.

    agent/apply.py  --model picks a tool-->  this server  --Playwright-->  Chrome window  -->  the job's form

The tools have the names and arguments of invisible-playwright-mcp's, which drives Firefox, so the agent, its skills and
its dry-run guard work the same on both. AGENT_BROWSER=firefox goes back to Firefox.

Run it alone to try it: `python -m agent_automation.tools.chrome` speaks MCP on stdin and stdout.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP, Image
from playwright.async_api import BrowserContext, Locator, Page, Playwright, async_playwright
from playwright.async_api import Error as PlaywrightError

# Set by the agent: the folders whose files may be uploaded (the CV's), separated like PATH.
UPLOAD_DIRS_ENV = "AGENT_UPLOAD_DIRS"
# "1" runs Chrome with no window, for the tests. The agent always shows it.
HEADLESS_ENV = "AGENT_BROWSER_HEADLESS"

TEXT_CHARS = 40_000
HTML_CHARS = 60_000
MOST_ELEMENTS = 250
MOST_LINKS = 60
CLICK_TIMEOUT_MS = 10_000
# How long a click waits for its element to take it, before looking at what is in its way.
CLICK_TRY_MS = 4_000
NAVIGATE_TIMEOUT_MS = 45_000
# A person's pace, per key. A long answer goes faster, or it would take minutes.
KEY_DELAY_MS = (35, 90)
LONG_TEXT = 300
LONG_KEY_DELAY_MS = 8
WAIT_UNTIL = ("commit", "domcontentloaded", "load", "networkidle")

# browser_evaluate only reads: a script that clicks, submits, dispatches or sets a value acts with no person's pointer or
# keyboard behind it, which a page can tell.
ACTING = re.compile(r"\.(?:click|submit|requestSubmit)\s*\(|dispatchEvent\s*\(|\.(?:value|checked|selected)\s*=(?!=)")

RULES = """Drive the page the way a person would, in Google Chrome. Every click and key goes through the real pointer and keyboard.

1. Read the page with browser_snapshot. Each element has a `selector` and `at` (its centre in viewport pixels). Pass the
   selector verbatim to browser_click, browser_type, browser_select_option or browser_upload_files.
2. When no selector reaches the target (a canvas, a slider, a widget made of divs), use browser_click_at with the `at` numbers.
3. browser_read_html shows a form's structure and labels, browser_read_text its words, browser_take_screenshot what it looks like.
4. browser_evaluate only reads. It refuses scripts that click, submit, dispatch events or set values: use the tools for those.

A cookie or consent banner covers the page until it is answered: click one of its buttons first. A hidden radio or checkbox is
clicked through its label: the snapshot gives the label's selector as `click`. Selectors are Playwright's, so
`label:has-text("Yes")` works. An id that starts with a digit is written [id="..."], never #...

There is one page. To go somewhere else use browser_navigate; to go back, navigate to the address you came from.
When something cannot be done, say so in your answer instead of forcing it."""

mcp = FastMCP("agent-automation-chrome", instructions=RULES)


class _Chrome:
    """The one Chrome this server drives: its Playwright, its window (a persistent context on the agent's own profile), its page."""

    def __init__(self) -> None:
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None

    def need(self) -> Page:
        if self.page is None or self.page.is_closed():
            raise RuntimeError("The browser is not open: call browser_open first.")
        return self.page


chrome = _Chrome()


def _first_line(error: BaseException) -> str:
    text = str(error).strip()
    lines = [line for line in text.splitlines() if line.strip() and not line.startswith("Call log")]
    return " ".join(lines[:3])[:500]


async def _find(selector: str) -> Locator:
    """The first element matching `selector`, in the page or in one of its frames (an application form is often in one)."""
    page = chrome.need()
    frames = [page.main_frame, *[frame for frame in page.frames if frame != page.main_frame]]
    for frame in frames:
        try:
            matches = frame.locator(selector)
            if await matches.count():
                return matches.first
        except PlaywrightError as error:
            if frame == page.main_frame and ("selector" in str(error).lower() or "unexpected" in str(error).lower()):
                raise ValueError(f"{selector} is not a valid selector ({_first_line(error)}). An id starting with a digit is [id=\"...\"].") from error
    raise LookupError(f"Nothing on the page matches {selector}. Take a browser_snapshot for the selectors that exist.")


def _allowed(path: str) -> str:
    """A file the page may be given: a real file in one of the agent's upload folders, under no hidden name such as .env."""
    real = Path(path).expanduser().resolve()
    if not real.is_file():
        raise FileNotFoundError(f"{path} is not a file.")
    for folder in filter(None, os.environ.get(UPLOAD_DIRS_ENV, "").split(os.pathsep)):
        root = Path(folder).expanduser().resolve()
        if real.is_relative_to(root):
            hidden = [part for part in real.relative_to(root).parts if part.startswith(".")]
            if hidden:
                raise PermissionError(f"{path} lies under a hidden name ({hidden[0]}); not sent.")
            return str(real)
    raise PermissionError(f"{path} is outside the folders the agent may upload from; not sent.")


# What a click at an element's centre would land on: the element itself, something inside it, or the control a label is
# for (an Ashby radio, opacity 0, lies on its label) count as the element.
HIT = """(el) => {
  const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const ours = !!top && (top === el || el.contains(top) || (el.control && el.control === top) || (!!top.closest && top.closest('label') === el));
  const what = top ? top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + ' "' + (top.innerText || top.value || '').trim().slice(0, 60) + '"' : 'nothing';
  return { ours, what };
}"""


async def _click(found: Locator, selector: str) -> None:
    """A real click on `found`. When Playwright's own checks will not take it, the point is looked at: a click that lands
    on the element (or on the control its label is for) is made there with the pointer; one that lands on something else,
    such as a cookie banner or an open list, is refused with what is in the way."""
    try:
        await found.scroll_into_view_if_needed(timeout=CLICK_TIMEOUT_MS)
        await found.click(timeout=CLICK_TRY_MS)
        return
    except PlaywrightError as error:
        failure = error
    try:
        hit = await found.evaluate(HIT)
        box = await found.bounding_box()
    except PlaywrightError:
        raise RuntimeError(f"The click on {selector} did not land: {_first_line(failure)}") from failure
    if hit["ours"] and box:
        await chrome.need().mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        return
    raise RuntimeError(f"The click on {selector} did not land: it would land on {hit['what']} instead. Deal with that first.") from failure


async def _value(found: Locator) -> str:
    return str(await found.evaluate("el => ('value' in el && typeof el.value === 'string') ? el.value : (el.innerText || '')"))


SNAPSHOT = r"""() => {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0; };
  const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  const words = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const labelOf = (el) => {
    const aria = el.getAttribute('aria-label'); if (aria) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(words).join(' '); if (t) return t; }
    if (el.labels && el.labels.length) return words(el.labels[0]);
    const wrap = el.closest('label'); if (wrap) return words(wrap);
    return el.getAttribute('placeholder') || el.getAttribute('title') || words(el) || el.getAttribute('name') || '';
  };
  const selectorOf = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id && unique(`[id="${esc(el.id)}"]`)) return `[id="${esc(el.id)}"]`;
    if (tag === 'label' && el.htmlFor && unique(`label[for="${esc(el.htmlFor)}"]`)) return `label[for="${esc(el.htmlFor)}"]`;
    const name = el.getAttribute('name');
    if (name) {
      const s = `${tag}[name="${esc(name)}"]`; if (unique(s)) return s;
      const v = `${s}[value="${esc(el.getAttribute('value') || '')}"]`; if (unique(v)) return v;
    }
    for (const attr of ['aria-label', 'data-testid', 'data-qa', 'placeholder']) {
      const a = el.getAttribute(attr); if (a) { const s = `${tag}[${attr}="${esc(a)}"]`; if (unique(s)) return s; }
    }
    const parts = []; let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node !== el && node.id && unique(`[id="${esc(node.id)}"]`)) { parts.unshift(`[id="${esc(node.id)}"]`); break; }
      const parent = node.parentElement; if (!parent) break;
      const same = Array.from(parent.children).filter(c => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${node.tagName.toLowerCase()}:nth-of-type(${same.indexOf(node) + 1})` : node.tagName.toLowerCase());
      node = parent;
    }
    const path = parts.join(' > ');
    return unique(path) ? path : 'body > ' + path;
  };
  const pick = 'input, textarea, select, button, a[href], [role=button], [role=checkbox], [role=radio], [role=combobox], [role=option], [role=switch], [role=tab], [role=menuitem], [contenteditable=""], [contenteditable=true]';
  let links = 0;
  for (const el of document.querySelectorAll(pick)) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && el.type === 'hidden') continue;
    const shown = visible(el);
    const hiddenControl = !shown && tag === 'input' && ['radio', 'checkbox', 'file'].includes(el.type);
    if (!shown && !hiddenControl) continue;
    if (tag === 'a' && ++links > %LINKS%) continue;
    const label = hiddenControl && el.labels && el.labels[0] ? el.labels[0] : null;
    const box = (label || el).getBoundingClientRect();
    const role = el.getAttribute('role');
    const item = { kind: tag === 'input' ? `input ${el.type}` : (role ? `${tag} role=${role}` : tag), label: labelOf(el).slice(0, 100), selector: selectorOf(el), at: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] };
    if (label) item.click = selectorOf(label);
    if (tag === 'select') { item.value = el.selectedOptions[0] ? words(el.selectedOptions[0]) : ''; item.options = Array.from(el.options).slice(0, 25).map(o => words(o)); }
    else if (tag === 'input' || tag === 'textarea') {
      if (['checkbox', 'radio'].includes(el.type)) item.checked = el.checked;
      else if (el.type === 'file') item.files = Array.from(el.files || []).map(f => f.name);
      else item.value = (el.value || '').slice(0, 120);
    }
    if (role === 'checkbox' || role === 'radio' || role === 'switch') item.checked = el.getAttribute('aria-checked') === 'true';
    if (el.getAttribute('aria-expanded')) item.expanded = el.getAttribute('aria-expanded') === 'true';
    if (el.required || el.getAttribute('aria-required') === 'true') item.required = true;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
    if (tag === 'a') item.href = el.href;
    out.push(item);
    if (out.length >= %MOST%) break;
  }
  return out;
}""".replace("%LINKS%", str(MOST_LINKS)).replace("%MOST%", str(MOST_ELEMENTS))

READ_HTML = r"""(mode) => {
  const root = (mode === 'form' && (document.querySelector('form') || document.querySelector('main'))) || document.body;
  const copy = root.cloneNode(true);
  // The live values, which a copy of the markup does not carry.
  const live = [root, ...root.querySelectorAll('*')], copied = [copy, ...copy.querySelectorAll('*')];
  live.forEach((el, i) => {
    const twin = copied[i]; if (!twin) return;
    if (['INPUT', 'TEXTAREA'].includes(el.tagName) && !['password', 'file', 'checkbox', 'radio'].includes(el.type)) twin.setAttribute('value', el.value);
    if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) twin.setAttribute('checked', ''); else twin.removeAttribute('checked'); }
    if (el.tagName === 'OPTION') { if (el.selected) twin.setAttribute('selected', ''); else twin.removeAttribute('selected'); }
  });
  copy.querySelectorAll('script, style, noscript, svg, template, link, meta, img, video, canvas, picture, source').forEach(n => n.remove());
  const keep = (name) => ['id', 'name', 'type', 'value', 'placeholder', 'for', 'href', 'role', 'required', 'checked', 'selected', 'disabled', 'multiple', 'accept', 'title', 'class', 'contenteditable'].includes(name) || name.startsWith('aria-') || name.startsWith('data-test') || name === 'data-qa';
  for (const el of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of Array.from(el.attributes)) if (!keep(a.name)) el.removeAttribute(a.name);
    const cls = el.getAttribute('class');
    if (cls !== null) { const short = cls.split(/\s+/).filter(c => c && c.length < 30).slice(0, 3).join(' '); if (short) el.setAttribute('class', short); else el.removeAttribute('class'); }
  }
  return copy.outerHTML.replace(/\s{2,}/g, ' ');
}"""


# Opening and closing.


@mcp.tool()
async def browser_open(profile: str = "") -> str:
    """Open Chrome in a window on the screen, on the agent's own Chrome profile (its sign-ins are kept between runs).
    `profile` is that profile's folder. Opening an open browser does nothing."""
    if chrome.page is not None and not chrome.page.is_closed():
        return "Chrome is already open."
    # Chrome keeps its own folder inside the agent's browser profile: the files an older Firefox left there stay apart.
    folder = Path(profile).expanduser() / "chrome" if profile else Path.home() / ".agent-automation" / "browser-profile" / "chrome"
    folder.mkdir(parents=True, exist_ok=True)
    chrome.playwright = await async_playwright().start()
    try:
        chrome.context = await chrome.playwright.chromium.launch_persistent_context(
            str(folder),
            channel="chrome",
            headless=os.environ.get(HEADLESS_ENV) == "1",
            no_viewport=True,
            args=["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check", "--window-size=1366,900"],
            # No "controlled by automated test software" bar, and no flag a page reads as a robot.
            ignore_default_args=["--enable-automation"],
            accept_downloads=False,
        )
    except PlaywrightError as error:
        await chrome.playwright.stop()
        chrome.playwright = None
        raise RuntimeError(f"Google Chrome did not open: {_first_line(error)}. Install Chrome, or set AGENT_BROWSER=firefox.") from error
    chrome.page = chrome.context.pages[0] if chrome.context.pages else await chrome.context.new_page()
    # An alert or a "leave this page?" question would stop everything: it is answered yes.
    chrome.context.on("page", lambda page: page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept())))
    chrome.page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept()))
    return f"Chrome is open on the profile in {folder}."


@mcp.tool()
async def browser_close() -> str:
    """Close Chrome. Its sign-ins stay in the profile for the next browser_open."""
    if chrome.context is not None:
        await chrome.context.close()
    if chrome.playwright is not None:
        await chrome.playwright.stop()
    chrome.playwright = chrome.context = chrome.page = None
    return "Chrome is closed."


@mcp.tool()
async def browser_status() -> str:
    """Whether Chrome is open, and the address and title of its page. Nothing is ever typed in the background here."""
    page = chrome.page
    if page is None or page.is_closed():
        return json.dumps({"open": False, "browser": "Google Chrome"})
    return json.dumps({"open": True, "browser": "Google Chrome", "url": page.url, "title": await page.title(), "typing": "nothing is being typed"})


# Reading the page.


@mcp.tool()
async def browser_navigate(url: str, wait_until: str = "domcontentloaded") -> str:
    """Go to a url. Answers with the HTTP status and the address actually landed on, which a redirect can change.
    `wait_until`: commit, domcontentloaded (the default), load or networkidle."""
    page = chrome.need()
    response = await page.goto(url, wait_until=wait_until if wait_until in WAIT_UNTIL else "domcontentloaded", timeout=NAVIGATE_TIMEOUT_MS)
    status = response.status if response is not None else "none"
    return f"Status {status}. The page is at {page.url}"


@mcp.tool()
async def browser_snapshot() -> str:
    """The page's title, address, and the interactive elements a person can see: fields, buttons, links, options. Each has
    a `selector` to pass verbatim to the other tools, `at` (its centre, in viewport pixels) for browser_click_at, and what
    it holds now (`value`, `checked`, `options`). A hidden radio or checkbox has `click`: the selector of its label."""
    page = chrome.need()
    elements: list[dict[str, Any]] = []
    for frame in page.frames:
        try:
            found = await frame.evaluate(SNAPSHOT)
        except PlaywrightError:
            continue
        if frame != page.main_frame:
            # An element in a frame is placed on the page by where the frame is.
            box = await (await frame.frame_element()).bounding_box() if frame.parent_frame else None
            for item in found:
                item["frame"] = frame.name or frame.url[:80]
                if box:
                    item["at"] = [round(item["at"][0] + box["x"]), round(item["at"][1] + box["y"])]
        elements.extend(found)
    return json.dumps({"title": await page.title(), "url": page.url, "elements": elements[:MOST_ELEMENTS]}, ensure_ascii=False)


@mcp.tool()
async def browser_read_text(selector: str = "body") -> str:
    """The visible text of an element, whole, with the markup gone. The cheapest way to read a page."""
    text = await (await _find(selector)).inner_text(timeout=CLICK_TIMEOUT_MS)
    return text if len(text) <= TEXT_CHARS else text[:TEXT_CHARS] + "\n(cut: the text goes on)"


@mcp.tool()
async def browser_read_html(mode: str = "") -> str:
    """The page's HTML, cleaned down to what is worth reading: structure, labels, ids, names and the fields' live values.
    mode "form" reads only the first form."""
    html = str(await chrome.need().evaluate(READ_HTML, mode))
    return html if len(html) <= HTML_CHARS else html[:HTML_CHARS] + "\n(cut: the page goes on)"


@mcp.tool()
async def browser_take_screenshot() -> Image:
    """A picture of what the page shows now."""
    return Image(data=await chrome.need().screenshot(type="png"), format="png")


@mcp.tool()
async def browser_evaluate(expression: str) -> str:
    """READ from the page with JavaScript and get the result as JSON: a value held in a framework's state, a computed style,
    the length of a list. It refuses scripts that click, submit, dispatch events or set values."""
    if ACTING.search(expression):
        raise PermissionError("browser_evaluate only reads. Use browser_click, browser_type, browser_select_option or browser_press_key to act.")
    result = await chrome.need().evaluate(expression)
    return json.dumps(result, ensure_ascii=False, default=str)[:TEXT_CHARS]


# Acting on the page.


@mcp.tool()
async def browser_click(selector: str) -> str:
    """Click the first element matching a selector, with the real pointer. It is scrolled into view and waited for."""
    page = chrome.need()
    found = await _find(selector)
    before = page.url
    await _click(found, selector)
    await asyncio.sleep(0.4)
    return f"Clicked {selector}." + (f" The page is now at {page.url}" if page.url != before else "")


@mcp.tool()
async def browser_click_at(x: float, y: float, hold_seconds: float = 0) -> str:
    """Click (or press and hold) a point of the page, in viewport pixels: the `at` of a snapshot element. For targets no
    selector reaches."""
    page = chrome.need()
    await page.mouse.move(x, y, steps=6)
    if hold_seconds > 0:
        await page.mouse.down()
        await asyncio.sleep(min(hold_seconds, 15))
        await page.mouse.up()
    else:
        await page.mouse.click(x, y)
    under = await page.evaluate(
        "([x, y]) => { const el = document.elementFromPoint(x, y); if (!el) return 'nothing';"
        " return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' ' + (el.innerText || '').trim().slice(0, 60); }",
        [x, y],
    )
    return f"Clicked at ({x:.0f}, {y:.0f}), on {under}."


@mcp.tool()
async def browser_type(selector: str, text: str) -> str:
    """Type into a field, replacing what it holds, key by key at a person's pace. The answer says what the field kept: all
    of it, a cut, the page's reformatting, or nothing (a typeahead may want a row picked from its list)."""
    page = chrome.need()
    found = await _find(selector)
    await _click(found, selector)
    await page.keyboard.press("ControlOrMeta+A")
    await page.keyboard.press("Delete")
    delay = LONG_KEY_DELAY_MS if len(text) > LONG_TEXT else random.randint(*KEY_DELAY_MS)
    await found.press_sequentially(text, delay=delay)
    kept = await _value(found)
    if kept == text:
        return f"Typed into {selector}: it holds all {len(text)} characters."
    if not kept.strip():
        return f"Typed into {selector}, but it is empty now: the page took the text out. A typeahead wants a row picked from its list."
    return f"Typed into {selector}. It holds {len(kept)} characters now: {kept[:300]}"


@mcp.tool()
async def browser_select_option(selector: str, value: str) -> str:
    """Choose an option of a native <select> by its visible label or its value. A list made of divs is opened with a click
    and its row clicked instead."""
    found = await _find(selector)
    tag = await found.evaluate("el => el.tagName.toLowerCase()")
    if tag != "select":
        raise ValueError(f"{selector} is a <{tag}>, not a <select>: click it to open its list, then click the row.")
    for choice in ({"label": value}, {"value": value}):
        try:
            await found.select_option(**choice, timeout=5_000)
            break
        except PlaywrightError:
            continue
    else:
        labels: list[str] = await found.evaluate("el => Array.from(el.options).map(o => (o.label || o.text).trim())")
        near = [label for label in labels if value.lower() in label.lower()]
        if len(near) != 1:
            raise LookupError(f"No option of {selector} is {value!r}. Its options: {labels[:30]}")
        await found.select_option(label=near[0], timeout=5_000)
    chosen = await found.evaluate("el => el.selectedOptions[0] ? el.selectedOptions[0].text.trim() : ''")
    return f"Selected {chosen!r} in {selector}."


@mcp.tool()
async def browser_upload_files(selector: str, paths: list[str]) -> str:
    """Attach local files the way a person picks them. `selector` is the <input type=file> itself, or the button or label
    that opens its chooser. Only files from the agent's upload folders (the CV's) can be given."""
    page = chrome.need()
    files = [_allowed(path) for path in paths]
    found = await _find(selector)
    if await found.evaluate("el => el.tagName === 'INPUT' && el.type === 'file'"):
        await found.set_input_files(files)
    else:
        try:
            async with page.expect_file_chooser(timeout=8_000) as chooser:
                await found.click(timeout=CLICK_TIMEOUT_MS)
            await (await chooser.value).set_files(files)
        except PlaywrightError as error:
            raise RuntimeError(f"No file chooser opened from {selector}: pass the <input type=file> itself. ({_first_line(error)})") from error
    return f"Attached {', '.join(Path(file).name for file in files)} to {selector}."


@mcp.tool()
async def browser_press_key(key: str) -> str:
    """Press a key on whatever has focus: "Enter", "Tab", "Escape", "ArrowDown", "Control+a", or one character."""
    await chrome.need().keyboard.press(key)
    return f"Pressed {key}."


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

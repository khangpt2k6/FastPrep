---
name: pace
when: always
---
The browser types at a person's pace, a few characters a second, so a long answer of a few sentences takes one to three minutes. When browser_type answers that it is still typing, nothing is wrong and nothing is stuck: never call finish_form for it, and never type the same text again. Meanwhile actions are refused but reads work: plan the next fields with browser_snapshot or browser_read_text, then ask browser_status, and go on when it says the typing has finished.

Fill the short fields first (names, contacts, links, lists, yes or no) and type the long written answers last, one at a time, so most of the form is done while a long answer types.

An id that starts with a digit cannot follow `#` in a selector: `#2b49a7e0-85b8` is not valid CSS. Write it as `[id="2b49a7e0-85b8-42a2-ada1-ed2cccda6708"]`.

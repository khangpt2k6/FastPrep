---
name: menus
when: always
---
A field that makes you choose is one of five things, and which one decides what works. Read it with browser_snapshot or browser_read_html first, and tell them apart by what takes the focus.

1. A native `<select>`: `browser_select_option` with the option's value or its label. A click on it is wasted.
2. A listbox: what takes the focus is a div or a button, often showing "--" or "Select One". Click it to open its list, read the options, click the one you want. The list is named by the field's `aria-controls` or `aria-owns`, and where it is not, it is the element that appeared on the click; some sites name it with the field's own id and `__listbox` after it.
3. A typeahead: what takes the focus is an editable text input, and typing filters the rows. Type the words of your answer, read the rows, and click the row that matches it, or the first if they all do. A place is matched by city, state and country together: the top row for "Tampa" can be "La Pampa, Argentina". On some sites that row reads "Create" and your words, and still sets the value. Always pick a row: a list left open lies over the fields below it, and every click there lands on the list instead.
4. A radio or checkbox group drawn as a menu: nothing opens, the real input is hidden (often opacity 0), and a div or a label beside it takes the click. Click that div by what it holds, such as `div[role="radio"]:has(input[name="Q_1"][value="true"])`, or the option's label by its words inside the question's own container, such as `fieldset:has-text("current availability") label:has-text("Full-time")`. Never a bare position such as `button:nth-of-type(1)`: it matches the first such element on the whole page, usually in its header.
5. A tag field: one input that keeps several values, each added by typing it and pressing Enter. Add one value at a time and read the tags back.

A click the tool called a success often leaves the field empty: read the field's own text back and see your answer in it.

When a click does not land, and the tool says the event would have landed elsewhere or the element is not actionable, do not click it again: the option is under something else. There are two ways past it. With the list open, press ArrowDown and read which row is now highlighted, from the list's `aria-activedescendant` or the row's own class, and press Enter when it is yours. Or read that row's box with browser_evaluate and click its centre with browser_click_at: those numbers are viewport pixels, the same as a snapshot's `at`. Never take a point off a screenshot by eye, and never click from a script, because the browser refuses an event a script made.

When one field has beaten you three times, leave it. If it is optional, go on without it. If it is required, call finish_form with status blocked and name that field.

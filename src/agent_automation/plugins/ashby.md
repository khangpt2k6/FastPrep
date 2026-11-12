---
name: ashby
hosts: [jobs.ashbyhq.com]
apply_path: /application
---
The form is on the posting's Application tab (`#job-application-form`), at `/application`. It is one page, with two file inputs: the first is "Autofill from resume", the second is the real field, `#_systemfield_resume`. Upload the CV to `#_systemfield_resume`. Do not use the autofill input.

`#_systemfield_name` and `#_systemfield_email` are the name and the email, and `#_systemfield_location` the location. Every other field has a generated id, a bare uuid such as `ab317b70-8cd9-49f7-9d90-25dc8837a521`, so find each one by the label just before it and take the id from that label's `for`. Select it as `[id="<uuid>"]`, never `#<uuid>`: many of these uuids start with a digit, and `#` then is not a valid selector. The phone is labelled "Primary Phone Number" and has the placeholder "1-415-555-1234".

Location is a typeahead with the placeholder "Start typing...": type the city alone ("Tampa"), read the rows (`[role="option"]`) of the list it opens, and click the one that names that city in the right state and country ("Tampa, Florida, United States"), never simply the first: typing "Tampa, FL" once put "La Pampa, Argentina" on top. Read the field back. Until a row is picked the list stays open over the CV field below it, and the upload and every click there land on the list.

Questions with several answers to tick, or one to choose, are `fieldset`s whose inputs are hidden behind their labels (opacity 0). Click the option's label by its words inside its own question, as in `fieldset:has-text("current availability") label:has-text("Full-time")` or `fieldset:has-text("written English") label:has-text("Fluent")`, and read the input's `checked` back. A question that says "select up to 5" takes at most five.

Yes and No questions, such as work authorization or visa sponsorship, are answered by clicking a button labelled "Yes" or "No", and each pair follows its question's label. Those buttons carry generated ids, so take each one from its own question's container, most simply by the question's words: `div:has(> label:has-text("sponsorship")) button:has-text("No")`. On a real form `div:has(> label[for="<question uuid>"]) button:nth-of-type(2)` was No and the radio answers were reached by their own `label[for="<question uuid>_<option uuid>-labeled-..."]`. Read the page afterwards to see the answer selected.

A consent checkbox `#<uuid>__systemfield_data_consent_ack-labeled-checkbox` is required where the form has one.

The submit control is the button "Submit Application", which no id names: on a real form `#form > button:last-of-type` matched it alone. On two forms in the trials it stayed disabled and the click did not land, so nothing was sent: read the page for a required field still empty, fill it, and read the page again. If it stays disabled, call finish_form with status blocked and name the fields the page marks as missing. Why it stays disabled on a form that looks complete is not known.

After sending: a real send showed "Your application was successfully submitted. We'll contact you if there are next steps!". Read the page: if the form is still there, the application was not received.

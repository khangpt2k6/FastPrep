# Inbox sync

`agent-automation-inbox` reads your Gmail for news of your applications and lists where each one stands: applied, assessment, interview, offer, rejected or withdrawn. It covers the ones the agent sent and the ones you sent by hand.

## Set up, once

1. Turn on 2-Step Verification for the Google account, if it is off: https://myaccount.google.com/security
2. Make an app password at https://myaccount.google.com/apppasswords. Name it anything, such as "agent inbox". Google shows 16 letters once.
3. Add two lines to `.env` in the repo root:

```
GMAIL_ADDRESS=you@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

`GMAIL_ADDRESS` can be left out: the sync then reads the address your applications are sent with. Only Gmail addresses are read.

To take the access away, delete the app password on the same Google page. Nothing else needs undoing.

## Run

```powershell
.venv\Scripts\agent-automation-inbox              # read what is new, then list every application
.venv\Scripts\agent-automation-inbox --days 730   # look further back (default 365)
.venv\Scripts\agent-automation-inbox --offline    # list what the last sync found, no mailbox read
.venv\Scripts\agent-automation-inbox --json       # the same list as JSON
.venv\Scripts\agent-automation-inbox --forget     # drop what was kept and read from the start
```

The "Sent by" column says `agent` when Agent Automation applied to that company and `you` when you did. The "Applied" column is the date of the receipt ("Thank you for applying"). When no receipt was read, it says `before` and the date of the first mail about the application, which is often the refusal itself.

## What it reads and keeps

- It only reads. The mailbox is opened read-only over IMAP and each message is fetched with PEEK, so nothing is marked as read, moved, deleted or sent.
- Gmail's own search picks the mail to read: the last 365 days, not spam, trash or chats, not mail you sent, and holding words such as application, applied, interview, assessment or offer letter.
- Rules in `src/agent_automation/tools/inbox.py` decide what each message is. Job alerts, newsletters, verification codes and reminders to finish an application are left out. No message is sent to a model.
- Of a message about an application it keeps the sender, the subject, the date and the first 220 characters, in `~/.agent-automation/data/inbox.db`. Of any other message it keeps only its number, so it is not read twice.

## How it decides

- Forums, course sites and digests (Reddit, LeetCode, Glassdoor and the like) are never an application, whatever they talk about. Mail sent to a list counts only when its subject is an application's: an article about interviews is not an invitation.
- The subject speaks first. An invitation, a test or an offer named there is that. A subject that reads as a receipt ("Thank you for applying", "Update on your application") is a receipt unless the text refuses: most refusals come under such a subject.
- A confirmation that only says what may come next ("if you are selected for an interview", "we will reach out to schedule a time if...") stays applied. So does a receipt sent under a subject about getting ready ("Prepare for your interview with ...").
- A reminder that a test was sent and not taken is an assessment. Signing up to a talent community is no application.
- A rejection, or your own withdrawal, ends an application, whatever came before. An offer after a rejection is the news. Otherwise the furthest stage counts: offer, then interview, then assessment, then applied.
- The company is the sender's own when the mail comes from an employer's address: a recruiter's name is never the company, `hdean@hubspot.com` is HubSpot. Mail sent through Greenhouse, Lever, Workday, LinkedIn and the like never takes the carrier's name: the employer is read from the carrier's address when it names one (`cisco@myworkday.com`, `acme.tal.net`), then from the subject, then from the name the sender shows. Your own name is never a company.
- Messages about the same company and role are one application. A company's short and long names are one company ("IMC", "IMC Trading"), and so are its initials and its address ("HRT", "Hudson River Trading", `hudson-trading.com`). "Intern" and "Internship" are one role, and so is a role that is the start of another, as when a later mail leaves out the posting's number.
- A message that names no role joins the application of its thread, or else the company's latest one still open. A receipt or an invitation that comes after an application was closed starts another one.

When the rules change, the next sync drops what the old ones kept and reads the mailbox again.

A company or role the rules read wrongly can be reported with the message's subject and sender: the fix is a rule and a test in `tests/test_inbox_cases.py`.

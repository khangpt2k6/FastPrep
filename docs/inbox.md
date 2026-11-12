# Inbox sync

`agent-automation-inbox` reads your Gmail for news of your applications and lists where each one stands: applied, assessment, interview, offer or rejected. It covers the ones the agent sent and the ones you sent by hand.

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
.venv\Scripts\agent-automation-inbox --days 365   # look further back (default 180)
.venv\Scripts\agent-automation-inbox --offline    # list what the last sync found, no mailbox read
.venv\Scripts\agent-automation-inbox --json       # the same list as JSON
.venv\Scripts\agent-automation-inbox --forget     # drop what was kept and read from the start
```

The "Sent by" column says `agent` when Agent Automation applied to that company and `you` when you did.

## What it reads and keeps

- It only reads. The mailbox is opened read-only over IMAP and each message is fetched with PEEK, so nothing is marked as read, moved, deleted or sent.
- Gmail's own search picks the mail to read: the last 180 days, not spam, trash or chats, not mail you sent, and holding words such as application, applied, interview, assessment or offer letter.
- Rules in `src/agent_automation/tools/inbox.py` decide what each message is. Job alerts, newsletters, verification codes and reminders to finish an application are left out. No message is sent to a model.
- Of a message about an application it keeps the sender, the subject, the date and the first 220 characters, in `~/.agent-automation/data/inbox.db`. Of any other message it keeps only its number, so it is not read twice.

## How it decides

- A rejection ends an application, whatever came before. An offer after a rejection is the news.
- Otherwise the furthest stage counts: offer, then interview, then assessment, then applied.
- A confirmation that only mentions a later interview ("if you are selected for an interview") stays applied.
- The company comes from the message's words, then the name the sender shows, then the sender's own domain. Mail sent through Greenhouse, Lever, Workday, LinkedIn and the like never takes the carrier's name as the company.
- Messages about the same company and role are one application. A message that names no role joins the application of its thread, or else the company's latest one.

A company or role the rules read wrongly can be reported with the message's subject and sender: the fix is a rule and a test in `tests/test_inbox.py`.

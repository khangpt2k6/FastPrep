# Calendar sync

The agent reads your Google Calendar and shows what is coming up on the dashboard: interviews, calls with a company, tests and deadlines, beside everything else on the calendar. From the dashboard you can also add an event, and it lands on Google Calendar.

## Set up

Nothing new if the [inbox sync](inbox.md) is set up: the calendar uses the same two lines in `.env`.

```
GMAIL_ADDRESS=you@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

The app password reaches the calendar over CalDAV, so there is no Google Cloud project and no token that runs out. To take the access away, delete the app password at https://myaccount.google.com/apppasswords.

## Run

The agent keeps the dashboard current by itself, every 10 minutes while it runs. To push once by hand:

```powershell
.venv\Scripts\python -m agent_automation.ui.calendar_push
```

## What is read

The main calendar, from 7 days back to 120 days ahead. A repeating event becomes one row per day it happens. Cancelled events are left out.

Each event is told what it is by rules, with no model call:

- `interview`: the title says interview, superday, phone screen, final round, meet and greet and the like.
- `assessment`: a coding challenge, an online test, a take-home.
- `call`: a call, chat or intro that is about a job (a company you applied to, a recruiter, a role).
- `deadline`: a deadline or due date about a job.
- `other`: everything else, and every repeating event. Only the title, time, place and meeting link of these are shown; their text stays on the calendar.

The company comes from the title, then from who sent the invitation, then from the application at that stage in your inbox whose role the title names. So "Interview: 2027 Technology Analyst Program Superday" is matched to the bank that invited you, as long as the inbox sync has run.

## What is written

Only what you ask for. Adding an event from the dashboard puts one new event on the main calendar; an event that is already there is never changed. Events added here carry a mark in their id, and only those can be removed from here. The sync itself never writes to the calendar.

## Limits

- Only the main calendar is read, not other calendars you subscribed to.
- A monthly rule like "second Tuesday" is read as "same day of the month".
- Google may attach a Meet room of its own to an event you add; the link you gave is the one shown.

# Web dashboard

The dashboard in `web/` runs on Vercel. It cannot run a browser, so the work happens on your computer in `agent-automation`. The two talk through Supabase.

```
web page (Vercel)  --commands-->  Supabase  <--jobs, status, screenshots--  agent-automation (your PC)  -->  Firefox
```

## One-time setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor. Add one user under Authentication > Users (auto-confirmed): its email and password are `AGENT_EMAIL` and `AGENT_PASSWORD`. Then turn off "Allow new users to sign up" under Authentication > Sign In / Providers, so that account is the only one.
2. Copy `.env.example` to `.env` in the repo root and fill it in.
3. To deploy the page on Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project, then run `vercel deploy --prod` in `web/`. Do not set `AGENT_EMAIL` or `AGENT_PASSWORD` there: the page never needs them.
4. Install the agent: `python -m venv .venv`, then `.venv\Scripts\pip install -e .`
5. Optional, but needed for sites that email a code: run `agent-automation-tui your-resume.pdf` once and sign in to your mailbox when it asks.

## Sign-in

The page opens on a sign-in screen. Sign in with `AGENT_EMAIL` and `AGENT_PASSWORD`, the same Supabase user the agent writes with, so every row the agent writes is readable there. Nothing of the dashboard is shown, and no row is asked for, before that.

No login is built into the page's script. Only the Supabase url and the anon key are, and with those alone every table and the screenshot bucket answer with nothing: row level security gives each row to its own signed-in user. Sign out is in the page; it ends the session in that browser only, so the agent on your computer stays signed in.

To change the password, change it in Supabase (Authentication > Users) and in `.env`, then restart the agent. The page asks search engines not to index it.

## Run

```powershell
.venv\Scripts\agent-automation resumes\your-resume.pdf   # first time, or to change resume
.venv\Scripts\agent-automation                           # after that
```

The agent downloads the job database (about 250 MB the first time), scores about 300 jobs against your resume and pushes them to the dashboard. It also prefills your profile from the resume.

## Run it in the background

The keeper runs the agent with no window, starts it again when it stops, and can start it when you log in to Windows.

```powershell
.venv\Scripts\python -m agent_automation.ui.keeper install     # start at login, and two desktop shortcuts
.venv\Scripts\python -m agent_automation.ui.keeper start       # start it now, in the background
.venv\Scripts\python -m agent_automation.ui.keeper status      # is it running, and the end of its log
.venv\Scripts\python -m agent_automation.ui.keeper stop        # stop it
.venv\Scripts\python -m agent_automation.ui.keeper uninstall   # no more start at login, shortcuts removed
```

`install` is for Windows. It adds `AgentAutomation` to the programs that start when you log in, and puts two shortcuts on your desktop: **Bật Agent** starts the agent and **Tắt Agent** stops it. The log is `~/.agent-automation/data/agent.log`, moved to `agent.log.1` once it passes 5 MB. Only one agent runs for your account at a time: a second one says so and exits. When you stop it, the agent marks itself offline on the page and exits; one that is still running after 20 seconds is ended.

On the **Agent** page, **Pause** keeps the agent running but has it take no new command and fetch nothing. An application already under way finishes, and the batch it belongs to stops there: the command says how many jobs were done, and the rest can be selected and applied again. Turn Pause off and the agent picks up the commands that waited.

**Auto-fetch**, also on the Agent page, brings the newest postings every few hours (3 by default) and scores the best new jobs (40 at most by default), so a list left open for days stays fresh. The page shows when it last checked, how many new jobs that found and when it checks next, and new jobs carry a New tag for a day. **Find more** still scores more of the jobs already found.

On **Set up**, upload a resume as a PDF or Word file. The agent reads it, makes it the resume every application sends and searches again. The goals you wrote in `automation.yaml` and the countries in your profile stay as they are. The page then shows what it read: the titles and places it searches for, and a profile draft you can use.

These need the latest `supabase/schema.sql`. With an older schema the agent runs as it did before and says once in its log what it leaves out.

## Using the dashboard

1. **Open** the page. The orb in the top bar is the agent: it breathes while it waits, spins while it works and goes grey when the agent on your computer is off. Each job shows its company's logo: the agent names the employer behind every posting (a Workday tenant such as `cisco/wd5/cisco_careers` is Cisco, cisco.com) and the page draws the logo from that domain.
2. **Profile** opens as a popup the first time: check what the agent prefilled from your resume and add work authorization and the voluntary questions. The countries you want to work in, and whether you will relocate, decide where the search looks; changing them makes the agent search and score again.
3. **Preferences**: tone, length, what to emphasize or avoid, and a sample answer in your voice. They shape every open question the agent answers ("Why do you want to work here?").
4. **Jobs**: tick jobs and press Apply. Dry run (the switch at the top, on by default) fills each form and stops before sending.
5. **Applications** shows each form as it is worked on, with a screenshot and why it stopped. "Dry run again" retries one; with Dry run off the button reads "Apply for real" and asks before sending.
6. **Memory** keeps every open answer the agent wrote. Edit one to make it yours, pin one to have it reused word for word, or teach a new one.
7. **Cover letters**: pick a template, or duplicate one and edit it. Highlighted parts are written by the agent for each job; everything else is sent as you wrote it. With "Attach a cover letter to every application" on, each application gets its letter first, as a PDF uploaded to the form's cover letter field (or as text when the form only has a text box). To read letters before applying, tick jobs and press **Write letters**: they show up on this page, where you can edit one (the agent then sends your version), open its PDF, or have it written again.

## How cover letters are written

Only the parts of the template marked `{{part: note}}` are written by the model, following the rules in `.agent/skills/cover-letter/` (only true facts, match the posting with proof, why this company, plain human wording with no dashes or labels, the posting's own keywords, no apologies for gaps). Fields such as `{{full_name}}`, `{{company}}` or `{{today}}` come from your profile and the job. A part that breaks a rule is written once more; what still breaks one shows on the letter as "check wording". The PDF is Times New Roman, black on white. Templates live in `.agent/styles/cover-letters/` and in your own on this page; see [.agent/README.md](../.agent/README.md).

## How the agent answers questions

The model reads the CV, the answers from your profile, your preferences, the kept answers in Memory, and the skill for the site (`.agent/skills/sites/<site>/SKILL.md`). Facts (sponsorship, EEO, links) come only from the profile; it never invents one, and a required fact it does not have stops the form with "needs info from you". Open questions are written from the CV and the posting in your style and saved to Memory.

## Local dev of the page

```powershell
cd web
npm install
npm run dev
```

It reads the root `.env`. On Vercel, set the project root to `web` and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.

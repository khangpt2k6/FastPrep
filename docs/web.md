# Web dashboard

The dashboard in `web/` runs on Vercel. It cannot run a browser, so the work happens on your computer in `agent-automation`. The two talk through Supabase.

```
web page (Vercel)  --commands-->  Supabase  <--jobs, status, screenshots--  agent-automation (your PC)  -->  Firefox
```

## One-time setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor. Turn off "Confirm email" under Authentication if you want sign-up to work without an email link.
2. Copy `.env.example` to `.env` in the repo root and fill it in.
3. Install the agent: `python -m venv .venv`, then `.venv\Scripts\pip install -e .`
4. Optional, but needed for sites that email a code: run `agent-automation-tui your-resume.pdf` once and sign in to your mailbox when it asks.

## Run

```powershell
.venv\Scripts\agent-automation resumes\your-resume.pdf   # first time, or to change resume
.venv\Scripts\agent-automation                           # after that
```

The agent downloads the job database (about 250 MB the first time), scores about 300 jobs against your resume and pushes them to the dashboard. It also prefills your profile from the resume.

## Using the dashboard

1. **Sign in** with the same account as `AGENT_EMAIL`.
2. **Profile** opens as a popup the first time: check what the agent prefilled from your resume and add work authorization and the voluntary questions. The countries you want to work in, and whether you will relocate, decide where the search looks; changing them makes the agent search and score again.
3. **Preferences**: tone, length, what to emphasize or avoid, and a sample answer in your voice. They shape every open question the agent answers ("Why do you want to work here?").
4. **Jobs**: tick jobs and press Apply. Dry run (the switch at the top, on by default) fills each form and stops before sending.
5. **Applications** shows each form as it is worked on, with a screenshot and why it stopped. "Dry run again" retries one; with Dry run off the button reads "Apply for real" and asks before sending.
6. **Memory** keeps every open answer the agent wrote. Edit one to make it yours, pin one to have it reused word for word, or teach a new one.

## How the agent answers questions

The model reads the CV, the answers from your profile, your preferences, the kept answers in Memory, and the skill for the site (`src/agent_automation/plugins/*.md`). Facts (sponsorship, EEO, links) come only from the profile; it never invents one, and a required fact it does not have stops the form with "needs info from you". Open questions are written from the CV and the posting in your style and saved to Memory.

## Local dev of the page

```powershell
cd web
npm install
npm run dev
```

It reads the root `.env`. On Vercel, set the project root to `web` and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.

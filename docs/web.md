# Web dashboard

The dashboard in `web/` runs on Vercel. It cannot run a browser, so the work happens on your computer in `agent-automation`. The two talk through Supabase.

```
web page (Vercel)  --commands-->  Supabase  <--jobs, status, screenshots--  agent-automation (your PC)  -->  Firefox
```

## One-time setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor. Add one user under Authentication > Users (auto-confirmed): its email and password are `AGENT_EMAIL` and `AGENT_PASSWORD`.
2. Copy `.env.example` to `.env` in the repo root and fill it in.
3. To deploy the page on Vercel, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `AGENT_EMAIL`, `AGENT_PASSWORD` and `ACCESS_KEY` in the Vercel project, then run `vercel deploy --prod` in `web/`.
4. Install the agent: `python -m venv .venv`, then `.venv\Scripts\pip install -e .`
5. Optional, but needed for sites that email a code: run `agent-automation-tui your-resume.pdf` once and sign in to your mailbox when it asks.

## No sign-in, one private link

One person uses this dashboard, so it has no sign-in screen: the page logs in as `AGENT_EMAIL` by itself, the same Supabase user the agent writes with. That login is built into the page's script, so the deployed page is closed to everyone else: `web/middleware.ts` serves it only to a browser that came once through `https://<your-app>.vercel.app/?key=<ACCESS_KEY>`, which leaves a cookie for 400 days. Without it the page answers "Private". A Vercel build with no `ACCESS_KEY` fails on purpose. The local dev server (`npm run dev`) needs no link.

## Run

```powershell
.venv\Scripts\agent-automation resumes\your-resume.pdf   # first time, or to change resume
.venv\Scripts\agent-automation                           # after that
```

The agent downloads the job database (about 250 MB the first time), scores about 300 jobs against your resume and pushes them to the dashboard. It also prefills your profile from the resume.

## Using the dashboard

1. **Open** the page (the private link the first time on a new browser). The orb in the top bar is the agent: it breathes while it waits, spins while it works and goes grey when the agent on your computer is off. Each job shows its company's logo: the agent names the employer behind every posting (a Workday tenant such as `cisco/wd5/cisco_careers` is Cisco, cisco.com) and the page draws the logo from that domain.
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

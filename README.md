# Agent Automation

An AI agent that finds jobs that fit your resume and applies to them in a real browser.

You pick the jobs on a web dashboard. A local agent on your computer opens Firefox, fills each company's application form with your resume and profile, and reports back with a screenshot of what the page said.

```
web dashboard (Vercel)  --commands-->  Supabase  <--jobs, status, screenshots--  agent-automation (your PC)  -->  Firefox
```

## How it works

1. **Reads your resume** and turns it into a search: titles, skills and places.
2. **Searches** a database of about 6 million recent postings from public sources, on your computer.
3. **Scores** each posting against your resume, 1 to 5 (OpenAI `gpt-5.4-mini` by default, which judges seniority, timing and place strictly).
4. **You pick** jobs on the dashboard and press Apply. Dry run (fill, do not submit) is on by default.
5. **Applies**: the model drives Firefox through [invisible-playwright-mcp](https://pypi.org/project/invisible-playwright-mcp/), reading screenshots and calling browser tools (`gpt-5.4-mini` by default).
6. **Reports** each result live on the dashboard with a screenshot.

## Skills

What the agent knows about each job site is a **skill**: a Markdown file of plain instructions, not code. Workday, Greenhouse, Lever, Ashby, iCIMS, SmartRecruiters and others ship in `.agent/skills/sites/`. Supporting a new site means writing a new skill. See [docs/skills.md](docs/skills.md).

Everything the agent is told and keeps lives in one folder laid out like a `.claude` folder: `.agent/` in this repository, and your own `~/.agent-automation/` on top of it. See [.agent/README.md](.agent/README.md).

## Setup

Needs Python 3.11+, Node 20+ and a Supabase project.

1. Run [supabase/schema.sql](supabase/schema.sql) once in the Supabase SQL editor.
2. Create `.env` in the repo root:

   ```
   OPENAI_API_KEY=sk-...
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   AGENT_EMAIL=you@example.com      # the one Supabase user the agent and the dashboard both use
   AGENT_PASSWORD=...
   ACCESS_KEY=...                   # any long random string: the private link to the deployed dashboard
   ```

3. Install the agent:

   ```powershell
   python -m venv .venv
   .venv\Scripts\pip install -e .
   ```

4. Start the agent with your resume (only the first time, or to change it):

   ```powershell
   .venv\Scripts\agent-automation resumes\your-resume.pdf
   ```

5. Open the dashboard (`npm run dev` in `web/`, or the deployed page through its private link), finish the profile popup, pick jobs and apply. There is no sign-in: the page logs in as `AGENT_EMAIL` by itself.

The first run downloads the job database (about 250 MB) and, at the first application, Firefox (about 430 MB).

More: [web dashboard](docs/web.md), [configuration](docs/configuration.md), [supported sites](docs/sites.md), [data sources](docs/data-sources.md).

## Terminal UI

`agent-automation-tui your-resume.pdf` runs the whole flow in the terminal, without the dashboard. It is also where you sign in to your mailbox once, so the agent can read the codes some sites email you.

## Environment variables

| Name | What it does |
|---|---|
| `OPENAI_API_KEY` | Model key. With it, calls go straight to OpenAI. |
| `AGENT_PROVIDER` | `openai` or `orcarouter`. Default: OpenAI when an OpenAI key is set. |
| `AGENT_DRY_RUN` | Set to anything: fill forms, never submit. The dashboard sets this per Apply. |
| `AGENT_EMAIL`, `AGENT_PASSWORD` | Dashboard account the local agent signs in as. |

## Credits

A fork of [AIHawk](https://github.com/feder-cr/Jobs_Applier_AI_Agent) (MIT). See [LICENSE](LICENSE) and [NOTICE](NOTICE).

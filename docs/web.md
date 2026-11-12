# Web dashboard

The dashboard in `web/` runs on Vercel. It cannot run a browser, so the work happens on your computer in `aihawk-agent`. The two talk through Supabase.

```
web page (Vercel)  --commands-->  Supabase  <--jobs, status--  aihawk-agent (your PC)  -->  Firefox
```

## One-time setup

1. In the Supabase SQL editor, run `supabase/schema.sql`.
2. In the repo root `.env`:

   ```
   OPENAI_API_KEY=sk-...
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   AIHAWK_EMAIL=you@example.com
   AIHAWK_PASSWORD=...
   ```

   `AIHAWK_EMAIL` and `AIHAWK_PASSWORD` are the account you sign in with on the dashboard.

3. Install: `python -m venv .venv`, then `.venv\Scripts\pip install -e .`
4. Optional, but needed for sites that email a code: run `aihawk your-resume.pdf` once and sign in to your mailbox when it asks.

## Run

```powershell
.venv\Scripts\aihawk-agent resumes\your-resume.pdf   # first time, or to change resume
.venv\Scripts\aihawk-agent                           # after that
```

The agent downloads the job database (about 250 MB the first time), scores about 300 jobs against your resume and pushes them to the dashboard. Pick jobs on the page and press Apply. Dry run is on by default: the form is filled and nothing is sent.

## Local dev of the page

```powershell
cd web
npm install
npm run dev
```

It reads the root `.env`. On Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project env vars.

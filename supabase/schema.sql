-- Agent Automation web dashboard: run once in the Supabase SQL editor.
-- The local agent writes automation_agent and automation_jobs; the web page writes automation_commands.
-- Every row belongs to one signed-in user and RLS keeps it that way.

create table if not exists public.automation_agent (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state text not null default 'idle',
  message text not null default '',
  resume_name text not null default '',
  model text not null default '',
  jobs_found int not null default 0,
  jobs_scored int not null default 0,
  last_seen timestamptz not null default now()
);

create table if not exists public.automation_jobs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  title text not null,
  company text not null,
  location text not null default '',
  url text not null default '',
  score real,
  status text not null default 'new',
  note text not null default '',
  reason text not null default '',
  screenshot_path text not null default '',
  dry_run boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
-- The employer as the page shows it: a short name and its domain, for the logo. The agent names them; either can be empty.
alter table public.automation_jobs add column if not exists company_name text not null default '';
alter table public.automation_jobs add column if not exists company_domain text not null default '';
create index if not exists automation_jobs_user_score on public.automation_jobs (user_id, score desc nulls last);

create table if not exists public.automation_commands (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('apply', 'search')),
  job_ids text[] not null default '{}',
  dry_run boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  error text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists automation_commands_pending on public.automation_commands (user_id, created_at) where status = 'pending';

-- What the forms are told about you, filled in the page's profile wizard. The agent turns it into answers.
-- updated_by says who wrote last: 'agent' when it prefilled it from the resume, 'web' when you saved it.
create table if not exists public.automation_profile (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  updated_by text not null default 'web' check (updated_by in ('web', 'agent')),
  updated_at timestamptz not null default now()
);

alter table public.automation_profile enable row level security;
drop policy if exists "own profile" on public.automation_profile;
create policy "own profile" on public.automation_profile for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- How the agent writes answers to open questions ("Why this company?"), set on the Preferences page.
create table if not exists public.automation_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  tone text not null default '',
  length text not null default '' check (length in ('', 'Short', 'Medium', 'Detailed')),
  highlight text not null default '',
  avoid text not null default '',
  notes text not null default '',
  sample text not null default '',
  learn boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Answers to questions forms asked. 'learned': written by the agent while applying; 'user': written or edited by you.
-- The agent reuses them when a form asks the same question; a pinned answer is reused word for word.
create table if not exists public.automation_memory (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  question text not null,
  answer text not null,
  source text not null default 'user' check (source in ('user', 'learned')),
  pinned boolean not null default false,
  company text not null default '',
  job_title text not null default '',
  job_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_memory_user on public.automation_memory (user_id, updated_at desc);

alter table public.automation_preferences enable row level security;
drop policy if exists "own preferences" on public.automation_preferences;
create policy "own preferences" on public.automation_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.automation_memory enable row level security;
drop policy if exists "own memory" on public.automation_memory;
create policy "own memory" on public.automation_memory for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.automation_agent enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_commands enable row level security;

drop policy if exists "own agent" on public.automation_agent;
create policy "own agent" on public.automation_agent for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own jobs" on public.automation_jobs;
create policy "own jobs" on public.automation_jobs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own commands" on public.automation_commands;
create policy "own commands" on public.automation_commands for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Live updates on the page.
do $$
begin
  begin alter publication supabase_realtime add table public.automation_agent; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_jobs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_commands; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_profile; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_memory; exception when duplicate_object then null; end;
end $$;

-- Screenshots of each application, private, one folder per user.
insert into storage.buckets (id, name, public) values ('automation-proofs', 'automation-proofs', false)
on conflict (id) do nothing;

drop policy if exists "automation proofs read" on storage.objects;
create policy "automation proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'automation-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "automation proofs write" on storage.objects;
create policy "automation proofs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'automation-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "automation proofs update" on storage.objects;
create policy "automation proofs update" on storage.objects for update to authenticated
  using (bucket_id = 'automation-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Cover letters. The agent publishes its templates (builtin), the page adds the person's own and picks one, and the agent
-- keeps the letter it wrote for each job here: the page can show it, edit it (updated_by 'web') and the agent then uses
-- the edited text. The PDFs go in automation-proofs under <user id>/cover-letters/.
create table if not exists public.automation_cover_templates (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null,
  description text not null default '',
  body text not null,
  builtin boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.automation_cover_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  enabled boolean not null default true,
  template_id text not null default 'classic',
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_cover_letters (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  job_id text not null,
  template_id text not null default '',
  body text not null default '',
  pdf_path text not null default '',
  problems text not null default '',
  updated_by text not null default 'agent' check (updated_by in ('agent', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.automation_cover_templates enable row level security;
alter table public.automation_cover_settings enable row level security;
alter table public.automation_cover_letters enable row level security;

drop policy if exists "own cover templates" on public.automation_cover_templates;
create policy "own cover templates" on public.automation_cover_templates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own cover settings" on public.automation_cover_settings;
create policy "own cover settings" on public.automation_cover_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own cover letters" on public.automation_cover_letters;
create policy "own cover letters" on public.automation_cover_letters for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $$
begin
  begin alter publication supabase_realtime add table public.automation_cover_templates; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_cover_settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_cover_letters; exception when duplicate_object then null; end;
end $$;

-- A command can also ask for cover letters alone, to read them before applying, read a resume uploaded on the page
-- (kind 'resume', payload {"resume_id": n}), or add what a LinkedIn profile saved as a PDF says to the profile
-- (kind 'linkedin', payload {"path": the file under <user id>/linkedin/, "name": its name}).
alter table public.automation_commands add column if not exists payload jsonb not null default '{}'::jsonb;
do $$
declare
  found record;
begin
  for found in
    select conname from pg_constraint
    where conrelid = 'public.automation_commands'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.automation_commands drop constraint %I', found.conname);
  end loop;
end $$;
alter table public.automation_commands add constraint automation_commands_kind_check check (kind in ('apply', 'search', 'cover_letter', 'resume', 'linkedin', 'calendar_add'));

-- The agent's switches, set on the Agent page. paused: the agent keeps running but takes no command and fetches nothing
-- until resumed. auto_fetch: every fetch_hours it brings the newest postings and scores at most fetch_limit new jobs.
create table if not exists public.automation_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  paused boolean not null default false,
  auto_fetch boolean not null default true,
  fetch_hours int not null default 3 check (fetch_hours between 1 and 48),
  fetch_limit int not null default 40 check (fetch_limit between 0 and 200),
  updated_at timestamptz not null default now()
);

alter table public.automation_settings enable row level security;
drop policy if exists "own settings" on public.automation_settings;
create policy "own settings" on public.automation_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- When the agent last brought new postings, when it will next, and how many new jobs that round found.
alter table public.automation_agent add column if not exists fetched_at timestamptz;
alter table public.automation_agent add column if not exists next_fetch_at timestamptz;
alter table public.automation_agent add column if not exists fetched_new int not null default 0;

-- When the agent first found a job, for the page's New badge.
alter table public.automation_jobs add column if not exists found_at timestamptz;

-- Resumes. The page uploads the file to automation-proofs under <user id>/resumes/ and adds a row; the agent reads it,
-- keeps what it understood (text: the resume as plain text, data: {"search": ..., "profile": ...}) and makes it the
-- active one, the resume every application sends. Older ones stay as 'old' so the page can show the history.
create table if not exists public.automation_resumes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  path text not null default '',
  size int not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded', 'reading', 'active', 'failed', 'old')),
  error text not null default '',
  text text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_resumes_user on public.automation_resumes (user_id, created_at desc);

alter table public.automation_resumes enable row level security;
drop policy if exists "own resumes" on public.automation_resumes;
create policy "own resumes" on public.automation_resumes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Old resumes and letters can be removed from the page.
drop policy if exists "automation proofs delete" on storage.objects;
create policy "automation proofs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'automation-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$
begin
  begin alter publication supabase_realtime add table public.automation_settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.automation_resumes; exception when duplicate_object then null; end;
end $$;

-- The inbox on the dashboard: one row per application, as the inbox sync on the person's computer read it from their
-- mail (src/agent_automation/ui/inbox_push.py). Only what the page lists is kept: no message text, no sender.

create table if not exists public.automation_inbox (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  company text not null,
  role text not null default '',
  status text not null,
  applied_at timestamptz not null,
  updated_at timestamptz not null,
  subject text not null default '',
  mails integer not null default 1,
  by_agent boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists automation_inbox_user on public.automation_inbox (user_id, updated_at desc);

alter table public.automation_inbox enable row level security;
drop policy if exists "own inbox" on public.automation_inbox;
create policy "own inbox" on public.automation_inbox for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The page follows the table live; a delete needs the whole old row to be matched to its user.
alter table public.automation_inbox replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.automation_inbox; exception when duplicate_object then null; end;
end $$;

-- Rules, edited on the Rules page; the agent writes them into the person's home before it writes anything
-- (src/agent_automation/memory/web_rules.py). kind: 'cover_letter' (a rule for every part of a letter; the built-in ones
-- are put here by the agent with builtin = true and default_body = the shipped text), 'section' (one part of the
-- letter, by its slot name), 'answer' (one kind of open question on a form), 'always' (a standing instruction).
-- updated_by 'web' marks a rule the person changed: the agent never puts the shipped text back over it.
create table if not exists public.automation_rules (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null check (kind in ('cover_letter', 'section', 'answer', 'always')),
  title text not null default '',
  description text not null default '',
  body text not null default '',
  default_body text not null default '',
  enabled boolean not null default true,
  builtin boolean not null default false,
  sort real not null default 99,
  updated_by text not null default 'web' check (updated_by in ('web', 'agent')),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.automation_rules enable row level security;
drop policy if exists "own rules" on public.automation_rules;
create policy "own rules" on public.automation_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $$
begin
  begin alter publication supabase_realtime add table public.automation_rules; exception when duplicate_object then null; end;
end $$;

-- Other files a form may ask for, uploaded on the Profile page to automation-proofs under <user id>/documents/. For now
-- one kind, the transcript: before it applies, the agent keeps the newest one beside the resume and gives it to a form
-- only where the form asks for a transcript.
create table if not exists public.automation_documents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'transcript' check (kind in ('transcript')),
  name text not null,
  path text not null,
  size int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists automation_documents_user on public.automation_documents (user_id, kind, created_at desc);

alter table public.automation_documents enable row level security;
drop policy if exists "own documents" on public.automation_documents;
create policy "own documents" on public.automation_documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $$
begin
  begin alter publication supabase_realtime add table public.automation_documents; exception when duplicate_object then null; end;
end $$;

-- The calendar: upcoming interviews, calls with companies and deadlines, read from the person's Google Calendar by the
-- agent on their computer and pushed here, so the Calendar page can list them. The page adds one with a 'calendar_add'
-- command (payload: title, starts_at, ends_at, kind, company, url, notes); the agent puts it in Google Calendar and here.
-- kind: what the event is for the job hunt. source: where it came from ('google' read there, 'web' added on the page).
create table if not exists public.automation_calendar (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text not null default '',
  url text not null default '',
  kind text not null default 'other' check (kind in ('interview', 'call', 'assessment', 'deadline', 'other')),
  company text not null default '',
  notes text not null default '',
  source text not null default 'google' check (source in ('google', 'web', 'agent')),
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists automation_calendar_user on public.automation_calendar (user_id, starts_at);

alter table public.automation_calendar enable row level security;
drop policy if exists "own calendar" on public.automation_calendar;
create policy "own calendar" on public.automation_calendar for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.automation_calendar replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.automation_calendar; exception when duplicate_object then null; end;
end $$;

-- A person keeps several resumes (one per kind of role, say): each can carry a short label set on the page ("ML",
-- "Backend"). One is 'active', the one applications send; the others stay as 'old', read and ready to be made active.
alter table public.automation_resumes add column if not exists label text not null default '';

-- Whether the inbox found the receipt of the application: without one, applied_at is the first mail seen, not the day it
-- went out, and the page says so.
alter table public.automation_inbox add column if not exists applied_known boolean not null default true;
-- The employer's own domain, from the sender addresses of its mails (carriers left out), for the logo; '' when unknown.
alter table public.automation_inbox add column if not exists domain text not null default '';

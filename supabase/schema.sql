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

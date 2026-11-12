-- AIHawk web dashboard: run once in the Supabase SQL editor.
-- The local agent writes aihawk_agent and aihawk_jobs; the web page writes aihawk_commands.
-- Every row belongs to one signed-in user and RLS keeps it that way.

create table if not exists public.aihawk_agent (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state text not null default 'idle',
  message text not null default '',
  resume_name text not null default '',
  model text not null default '',
  jobs_found int not null default 0,
  jobs_scored int not null default 0,
  last_seen timestamptz not null default now()
);

create table if not exists public.aihawk_jobs (
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
create index if not exists aihawk_jobs_user_score on public.aihawk_jobs (user_id, score desc nulls last);

create table if not exists public.aihawk_commands (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('apply', 'search')),
  job_ids text[] not null default '{}',
  dry_run boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  error text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists aihawk_commands_pending on public.aihawk_commands (user_id, created_at) where status = 'pending';

alter table public.aihawk_agent enable row level security;
alter table public.aihawk_jobs enable row level security;
alter table public.aihawk_commands enable row level security;

drop policy if exists "own agent" on public.aihawk_agent;
create policy "own agent" on public.aihawk_agent for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own jobs" on public.aihawk_jobs;
create policy "own jobs" on public.aihawk_jobs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own commands" on public.aihawk_commands;
create policy "own commands" on public.aihawk_commands for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Live updates on the page.
do $$
begin
  begin alter publication supabase_realtime add table public.aihawk_agent; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.aihawk_jobs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.aihawk_commands; exception when duplicate_object then null; end;
end $$;

-- Screenshots of each application, private, one folder per user.
insert into storage.buckets (id, name, public) values ('aihawk-proofs', 'aihawk-proofs', false)
on conflict (id) do nothing;

drop policy if exists "own proofs read" on storage.objects;
create policy "own proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'aihawk-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own proofs write" on storage.objects;
create policy "own proofs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'aihawk-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own proofs update" on storage.objects;
create policy "own proofs update" on storage.objects for update to authenticated
  using (bucket_id = 'aihawk-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

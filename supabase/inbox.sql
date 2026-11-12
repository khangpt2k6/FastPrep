-- The inbox on the dashboard: one row per application, as the inbox sync on the person's computer read it from their
-- mail (src/agent_automation/ui/inbox_push.py). Only what the page lists is kept: no message text, no sender.
-- Safe to run again. To be folded into schema.sql.

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

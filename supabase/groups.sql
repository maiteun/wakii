-- wakii — groups (rooms) joinable by code
-- Run in Supabase: SQL Editor → New query → paste → Run.

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.groups enable row level security;
drop policy if exists "groups open" on public.groups;
create policy "groups open" on public.groups for all using (true) with check (true);

alter publication supabase_realtime add table public.groups;

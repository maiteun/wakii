-- wakii — profiles (display name → avatar photo, shared across devices)
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Identity is the name string for now (no real auth yet), so name is the key.

create table if not exists public.profiles (
  name        text primary key,
  avatar_url  text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles open" on public.profiles;
create policy "profiles open" on public.profiles for all using (true) with check (true);

alter publication supabase_realtime add table public.profiles;

-- wakii — profiles (email → display name + avatar photo, shared across devices)
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Identity key is the EMAIL (unique). name is the display name, avatar_url the
-- profile photo. Re-running drops the old (name-keyed) table — fine for beta.

drop table if exists public.profiles cascade;
create table public.profiles (
  email       text primary key,
  name        text,
  avatar_url  text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles open" on public.profiles;
create policy "profiles open" on public.profiles for all using (true) with check (true);

alter publication supabase_realtime add table public.profiles;

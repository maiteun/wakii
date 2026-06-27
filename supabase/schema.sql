-- wakii — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Auth is name-only for now (no Supabase Auth yet), so policies are open.
-- Tighten these once Kakao login is added.

-- ── decks: a thread within a room ────────────────────────────────────
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  room        text not null,
  label       text not null default '나',
  is_mission  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── cards: a photo inside a deck ─────────────────────────────────────
create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.decks(id) on delete cascade,
  author      text not null,
  image_url   text,
  is_reply    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── reactions: emoji reactions on a card ─────────────────────────────
create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.cards(id) on delete cascade,
  author      text not null,
  emoji       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists cards_deck_idx on public.cards(deck_id);
create index if not exists decks_room_idx on public.decks(room, created_at desc);
create index if not exists reactions_card_idx on public.reactions(card_id);

-- ── Row Level Security (open for the name-only prototype) ────────────
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.reactions enable row level security;

drop policy if exists "decks open" on public.decks;
drop policy if exists "cards open" on public.cards;
drop policy if exists "reactions open" on public.reactions;
create policy "decks open"     on public.decks     for all using (true) with check (true);
create policy "cards open"     on public.cards     for all using (true) with check (true);
create policy "reactions open" on public.reactions for all using (true) with check (true);

-- ── Realtime ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.decks;
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.reactions;

-- ── Storage bucket for photos (public read) ──────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos public read" on storage.objects;
drop policy if exists "photos open write" on storage.objects;
create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');
create policy "photos open write" on storage.objects
  for insert with check (bucket_id = 'photos');

-- wakii — storage only (photos bucket + policies)
-- The tables already exist; this just adds the image bucket that was missing.
-- Run in Supabase: SQL Editor → New query → paste → Run.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "photos public read" on storage.objects;
drop policy if exists "photos open write" on storage.objects;
drop policy if exists "photos open delete" on storage.objects;

create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');

create policy "photos open write" on storage.objects
  for insert with check (bucket_id = 'photos');

-- allows clearing/replacing photos (prototype; tighten before public release)
create policy "photos open delete" on storage.objects
  for delete using (bucket_id = 'photos');

-- wakii — 방 대표 사진(개설자가 임베드)
-- groups에 avatar_url 컬럼 추가. 홈 방 목록에서 🏠 대신 이 사진을 보여줌.
-- Run in Supabase: SQL Editor → New query → paste → Run.

alter table public.groups add column if not exists avatar_url text;

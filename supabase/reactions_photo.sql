-- wakii — 즉석 원형 사진 반응 영속화
-- reactions 행이 사진(이미지 URL)도 가질 수 있게 컬럼 추가.
-- image_url이 있으면 "즉석 사진 반응", 없으면 기존 이모지 반응.
-- Run in Supabase: SQL Editor → New query → paste → Run.

alter table public.reactions add column if not exists image_url text;

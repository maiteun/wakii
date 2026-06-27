-- wakii — ensure realtime is on for our tables (idempotent: safe to re-run)
do $$
begin
  begin alter publication supabase_realtime add table public.decks;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.cards;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end;
end $$;

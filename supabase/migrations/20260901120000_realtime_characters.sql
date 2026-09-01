-- Build step #7 (GitHub issue #20): publish characters for postgres_changes.
-- Realtime applies the table's RLS policies per subscriber, so a non-member
-- receives nothing (characters_select_owner_or_gm, 20260629150000_init.sql:203-205)
-- — that is what AC 23 rests on.
--
-- Default REPLICA IDENTITY is sufficient and REPLICA IDENTITY FULL is deliberately
-- NOT set: the client filters on `id` (the primary key) and reads only
-- `new.version`, and the WAL new-tuple always carries every column. FULL would only
-- inflate every WAL record with an OLD tuple no consumer reads.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'characters'
  ) then
    execute 'alter publication supabase_realtime add table public.characters';
  end if;
end $$;

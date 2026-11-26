begin;

create function public.personal_combat_is_valid(status jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  damage numeric;
  condition jsonb;
  label text;
begin
  if jsonb_typeof(status) is distinct from 'object' then return false; end if;
  if status - 'damage' - 'conditions' <> '{}'::jsonb
    or jsonb_typeof(status->'damage') is distinct from 'number'
    or jsonb_typeof(status->'conditions') is distinct from 'array'
  then return false; end if;

  damage := (status->>'damage')::numeric;
  if damage not between 0 and 999 or trunc(damage) <> damage
    or jsonb_array_length(status->'conditions') > 12
  then return false; end if;

  for condition in select value from jsonb_array_elements(status->'conditions') loop
    if jsonb_typeof(condition) <> 'string' then return false; end if;
    label := condition #>> '{}';
    -- Explicit ranges keep the wire format independent of database locale.
    if char_length(label) not between 1 and 64 or label <> btrim(label, ' ')
      or label collate "C" ~ U&'[\0001-\001F\007F\0085\2028\2029]'
      or label collate "C" ~ U&'^[ \00A0\1680\2000-\200A\202F\205F\3000]+$'
    then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.characters
  add column personal_combat jsonb not null default '{"damage":0,"conditions":[]}'::jsonb
  constraint characters_personal_combat_check check (public.personal_combat_is_valid(personal_combat));

create function public.update_character_personal_combat(p_id uuid, p_expected_version integer, p_status jsonb)
returns public.characters language plpgsql security definer set search_path = '' as $$
declare
  saved public.characters;
  failed_constraint text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  update public.characters
    -- Both SQL and JSON null reach the same status CHECK.
    set personal_combat = coalesce(p_status, 'null'::jsonb), version = version + 1
    where id = p_id and version = p_expected_version
      and (owner_id = auth.uid() or public.is_campaign_gm(campaign_id))
    returning * into saved;
  if not found then raise exception 'character version conflict' using errcode = 'PT409'; end if;
  return saved;
exception when check_violation then
  get stacked diagnostics failed_constraint = constraint_name;
  if failed_constraint = 'characters_personal_combat_check' then
    raise exception 'invalid personal combat status' using errcode = 'PT422';
  end if;
  raise;
end;
$$;

revoke execute on function public.update_character_personal_combat(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_character_personal_combat(uuid, integer, jsonb) to authenticated;

-- Supabase installations can grant table UPDATE and function EXECUTE by default.
-- Character updates go through authenticated, version-checked RPCs.
revoke update on public.characters from public, anon, authenticated;
revoke execute on function public.update_character(uuid, integer, jsonb) from public, anon;

commit;

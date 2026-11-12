-- Persist per-weapon firing locks alongside staged mech damage.
BEGIN;

ALTER TABLE public.characters DROP CONSTRAINT characters_mech_damage_check;

CREATE OR REPLACE FUNCTION public.mech_damage_is_valid(p_mech jsonb, p_damage jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
declare
  a jsonb := '[]'::jsonb;
  s jsonb := '[]'::jsonb;
  w jsonb := '[]'::jsonb;
  entries jsonb;
  entry jsonb;
  field text;
  key text;
  keys text[];
  n numeric;
  idx integer;
  slot_idx integer;
  seen integer[];
  identity integer;
begin
  if p_damage is null then return true; end if;
  if jsonb_typeof(p_damage) is distinct from 'object' then return false; end if;
  -- Empty firedWeapons adds 20 bytes to PostgreSQL JSONB text; cap the whole document.
  if octet_length(p_damage::text) > 16384 + 20
     or not (p_damage ?& array['armor','structure','criticals','heat','pilotHits','firedWeapons'])
     or (select count(*) from jsonb_object_keys(p_damage)) <> 6 then
    return false;
  end if;

  foreach key in array array['heat','pilotHits'] loop
    if jsonb_typeof(p_damage->key) is distinct from 'number' then return false; end if;
    n := (p_damage->key)::numeric;
    if n <> trunc(n) or n not between 0 and 999 then return false; end if;
  end loop;

  if jsonb_typeof(p_mech) = 'object' then
    if jsonb_typeof(p_mech->'weapons') = 'array' then w := p_mech->'weapons'; end if;
    if jsonb_typeof(p_mech->'armor') = 'array' then a := p_mech->'armor'; end if;
    if jsonb_typeof(p_mech->'criticalSlots') = 'array' then s := p_mech->'criticalSlots'; end if;
  elsif (p_damage->'heat')::numeric <> 0 then
    return false;
  end if;

  entries := p_damage->'firedWeapons';
  if jsonb_typeof(entries) is distinct from 'array' then return false; end if;
  if jsonb_array_length(entries) > 64 then return false; end if;
  seen := array[]::integer[];
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) is distinct from 'number' then return false; end if;
    n := entry::numeric;
    -- Bound before casting, including hostile 1e400 and decimal-scale integers.
    if n <> trunc(n) or n not between 0 and 63 then return false; end if;
    idx := n::integer;
    if idx >= jsonb_array_length(w) or idx = any(seen) then return false; end if;
    seen := array_append(seen, idx);
  end loop;

  foreach field in array array['armor','structure','criticals'] loop
    entries := p_damage->field;
    if jsonb_typeof(entries) is distinct from 'array' then return false; end if;
    if jsonb_array_length(entries) > (case when field = 'criticals' then 256 else 16 end) then
      return false;
    end if;
    keys := case field
      when 'armor' then array['index','lost']
      when 'structure' then array['index','max','lost']
      else array['section','slot'] end;
    seen := array[]::integer[];
    for entry in select value from jsonb_array_elements(entries) loop
      if jsonb_typeof(entry) is distinct from 'object' then return false; end if;
      if not (entry ?& keys)
         or (select count(*) from jsonb_object_keys(entry)) <> cardinality(keys) then
        return false;
      end if;
      foreach key in array keys loop
        if jsonb_typeof(entry->key) is distinct from 'number' then return false; end if;
        n := (entry->key)::numeric;
        if n <> trunc(n) or n < 0
           or n > (case when key in ('index','section','slot') then 15 else 999 end)
           or (key = 'max' and n < 1)
           or (field = 'armor' and key = 'lost' and n < 1) then
          return false;
        end if;
      end loop;
      -- All integer casts below are bounded numeric values, including hostile 1e400.
      if field = 'criticals' then
        idx := (entry->'section')::integer;
        slot_idx := (entry->'slot')::integer;
        if idx >= jsonb_array_length(s) then return false; end if;
        if jsonb_typeof(s->idx->'slots') is distinct from 'array' then return false; end if;
        if slot_idx >= jsonb_array_length(s->idx->'slots') then return false; end if;
        identity := idx * 16 + slot_idx;
      else
        idx := (entry->'index')::integer;
        identity := idx;
        if field = 'armor' then
          if idx >= jsonb_array_length(a) then return false; end if;
          if jsonb_typeof(a->idx->'value') is distinct from 'number' then return false; end if;
          if (entry->'lost')::numeric > (a->idx->'value')::numeric then return false; end if;
        else
          if idx >= jsonb_array_length(s)
             or (entry->'lost')::numeric > (entry->'max')::numeric then return false; end if;
        end if;
      end if;
      if identity = any(seen) then return false; end if;
      seen := array_append(seen, identity);
    end loop;
  end loop;
  return true;
exception when others then
  -- The CHECK must never surface a cast/shape error for hostile JSON.
  return false;
end;
$$;

-- Preserve existing fields and SQL NULL; invalidate pre-cutover staged writes.
UPDATE public.characters
SET mech_damage = mech_damage || '{"firedWeapons":[]}'::jsonb,
    version = version + 1
WHERE mech_damage IS NOT NULL
  AND jsonb_typeof(mech_damage) = 'object'
  AND NOT (mech_damage ? 'firedWeapons');

CREATE OR REPLACE FUNCTION public.reset_mech_damage_on_mech_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
begin
  if OLD.mech_damage is not null then
    NEW.mech_damage := case
      when coalesce((OLD.mech_damage->'pilotHits')::numeric::integer, 0) = 0 then null
      else jsonb_build_object('armor','[]'::jsonb,'structure','[]'::jsonb,'criticals','[]'::jsonb,
                             'firedWeapons','[]'::jsonb,'heat',0,'pilotHits',(OLD.mech_damage->'pilotHits')::numeric::integer)
    end;
  end if;
  return NEW;
end;
$$;
ALTER TABLE public.characters ADD CONSTRAINT characters_mech_damage_check
CHECK (public.mech_damage_is_valid(mech, mech_damage)) NOT VALID;
ALTER TABLE public.characters VALIDATE CONSTRAINT characters_mech_damage_check;

COMMIT;

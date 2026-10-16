-- Issue #66: damage is separate from the base mech and shares character versioning.
BEGIN;

ALTER TABLE public.characters ADD COLUMN mech_damage jsonb;

CREATE FUNCTION public.mech_damage_is_valid(p_mech jsonb, p_damage jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
declare
  a jsonb := '[]'::jsonb;
  s jsonb := '[]'::jsonb;
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
  if octet_length(p_damage::text) > 16384
     or not (p_damage ?& array['armor','structure','criticals','heat','pilotHits'])
     or (select count(*) from jsonb_object_keys(p_damage)) <> 5 then
    return false;
  end if;

  foreach key in array array['heat','pilotHits'] loop
    if jsonb_typeof(p_damage->key) is distinct from 'number' then return false; end if;
    n := (p_damage->key)::numeric;
    if n <> trunc(n) or n not between 0 and 999 then return false; end if;
  end loop;

  if jsonb_typeof(p_mech) = 'object' then
    if jsonb_typeof(p_mech->'armor') = 'array' then a := p_mech->'armor'; end if;
    if jsonb_typeof(p_mech->'criticalSlots') = 'array' then s := p_mech->'criticalSlots'; end if;
  elsif (p_damage->'heat')::numeric <> 0 then
    return false;
  end if;

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

-- Keep the pure validator executable by authenticated for direct INSERT CHECKs.
ALTER TABLE public.characters ADD CONSTRAINT characters_mech_damage_check
CHECK (public.mech_damage_is_valid(mech, mech_damage));

CREATE FUNCTION public.reset_mech_damage_on_mech_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
begin
  if OLD.mech_damage is not null then
    NEW.mech_damage := case
      when coalesce((OLD.mech_damage->'pilotHits')::numeric::integer, 0) = 0 then null
      else jsonb_build_object('armor','[]'::jsonb,'structure','[]'::jsonb,'criticals','[]'::jsonb,
                             'heat',0,'pilotHits',(OLD.mech_damage->'pilotHits')::numeric::integer)
    end;
  end if;
  return NEW;
end;
$$;
REVOKE EXECUTE ON FUNCTION public.reset_mech_damage_on_mech_change() FROM PUBLIC;
CREATE TRIGGER characters_reset_mech_damage BEFORE UPDATE OF mech ON public.characters
FOR EACH ROW WHEN (OLD.mech IS DISTINCT FROM NEW.mech)
EXECUTE FUNCTION public.reset_mech_damage_on_mech_change();

CREATE FUNCTION public.update_character_mech_damage(p_id uuid, p_expected_version integer, p_damage jsonb)
RETURNS public.characters LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare v_row public.characters; v_constraint text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_damage is not null and jsonb_typeof(p_damage) not in ('object','null') then
    raise exception 'invalid mech damage' using errcode = 'PT422';
  end if;
  begin
    update public.characters set
      mech_damage = case when p_damage is null or jsonb_typeof(p_damage) = 'null' then null else p_damage end,
      version = version + 1
    where id = p_id and version = p_expected_version
      and (owner_id = auth.uid() or public.is_campaign_gm(campaign_id))
    returning * into v_row;
    if not found then raise exception 'character version conflict' using errcode = 'PT409'; end if;
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'characters_mech_damage_check' then
      raise exception 'invalid mech damage' using errcode = 'PT422';
    end if;
    raise;
  end;
  return v_row;
end;
$$;
REVOKE EXECUTE ON FUNCTION public.update_character_mech_damage(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_character_mech_damage(uuid, integer, jsonb) TO authenticated;

COMMIT;

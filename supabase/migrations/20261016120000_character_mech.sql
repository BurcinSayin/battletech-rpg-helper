-- Issue #65: editable Mech tab. A character carries at most one mech, stored as a
-- nullable jsonb document (NULL = no mech). The shape/size CHECK is the only
-- guard for direct INSERTs; update_character enforces it for RPC writes too.
BEGIN;

ALTER TABLE public.characters
ADD COLUMN mech jsonb;

ALTER TABLE public.characters
ADD CONSTRAINT characters_mech_shape_check
CHECK (
  mech IS NULL
  OR (
    jsonb_typeof(mech) = 'object'
    AND octet_length(mech::text) <= 65536
  )
);

-- Everything except the mech handling is byte-identical to
-- 20261008180000_atomic_campaign_membership_revocation.sql (update_character).
-- Key absent leaves mech unchanged; key present with JSON null clears it; any
-- other value replaces it (the CHECK above rejects non-objects and oversize).
CREATE OR REPLACE FUNCTION public.update_character(
  p_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
RETURNS public.characters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_row             public.characters;
  v_owner           uuid;
  v_constraint_name text;
  v_change_campaign boolean := p_payload ? 'campaign_id';
  v_new_campaign    uuid    := (p_payload->>'campaign_id')::uuid;
  v_change_mech     boolean := p_payload ? 'mech';
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Authorize before probing owner membership; unreadable rows must not expose it.
  -- Absent campaign_id leaves attachment unchanged; explicit null detaches.
  if v_change_campaign and v_new_campaign is not null then
    select owner_id into v_owner from public.characters
     where id = p_id
       and (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));
    if v_owner is not null and not exists (
      select 1 from public.campaign_members
      where campaign_id = v_new_campaign and user_id = v_owner
    ) then
      raise exception 'character owner is not a member of target campaign'
        using errcode = 'PT403';
    end if;
  end if;

  begin
    update public.characters set
      name         = coalesce(p_payload->>'name', name),
      campaign_id  = case when v_change_campaign then v_new_campaign else campaign_id end,
      info         = coalesce(p_payload->'info', info),
      attributes   = coalesce(p_payload->'attributes', attributes),
      skills       = coalesce(p_payload->'skills', skills),
      traits       = coalesce(p_payload->'traits', traits),
      prerequisites = coalesce(p_payload->'prerequisites', prerequisites),
      notes        = coalesce(p_payload->>'notes', notes),
      mech         = case
                       when not v_change_mech then mech
                       when jsonb_typeof(p_payload->'mech') = 'null' then null
                       else p_payload->'mech'
                     end,
      version      = version + 1
    where id = p_id
      and version = p_expected_version
      and (owner_id = auth.uid() or public.is_campaign_gm(campaign_id))
    returning * into v_row;

    if not found then
      raise exception 'character version conflict' using errcode = 'PT409';
    end if;
  exception when foreign_key_violation then
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    if v_constraint_name = 'characters_campaign_owner_membership_fkey' then
      raise exception 'character owner is not a member of target campaign'
        using errcode = 'PT403';
    end if;
    raise;
  end;

  return v_row;
end;
$$;

COMMIT;

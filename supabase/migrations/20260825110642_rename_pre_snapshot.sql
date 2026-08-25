ALTER TABLE characters RENAME COLUMN pre_snapshot TO prerequisites;

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
  v_change_campaign boolean := p_payload ? 'campaign_id';
  v_new_campaign    uuid    := (p_payload->>'campaign_id')::uuid;  -- null when clearing
begin
  -- DEFINER runs as the owner, so reject anonymous callers explicitly.
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- A character may only be attached to a campaign the caller belongs to. The
  -- `? 'campaign_id'` test distinguishes "key absent" (leave as-is) from an
  -- explicit null (detach), so a character can also be removed from a campaign.
  if v_change_campaign
     and v_new_campaign is not null
     and not public.is_campaign_member(v_new_campaign)
     and not public.is_campaign_gm(v_new_campaign) then
    raise exception 'not a member of target campaign' using errcode = 'PT403';
  end if;

  update public.characters set
    name         = coalesce(p_payload->>'name', name),
    campaign_id  = case when v_change_campaign then v_new_campaign else campaign_id end,
    info         = coalesce(p_payload->'info', info),
    attributes   = coalesce(p_payload->'attributes', attributes),
    skills       = coalesce(p_payload->'skills', skills),
    traits       = coalesce(p_payload->'traits', traits),
    prerequisites = coalesce(p_payload->'prerequisites', prerequisites),
    notes        = coalesce(p_payload->>'notes', notes),
    version      = version + 1
  where id = p_id
    and version = p_expected_version
    and (owner_id = auth.uid() or public.is_campaign_gm(campaign_id))
  returning * into v_row;

  if not found then
    raise exception 'character version conflict' using errcode = 'PT409';
  end if;

  return v_row;
end;
$$;

-- Build step #7 (GitHub issue #20), AC 30: make update_character's campaign guard
-- OWNER-scoped instead of CALLER-scoped.
--
-- Defect: the guard below used to ask whether the *caller* belonged to the target
-- campaign. A GM may legitimately write a member's character (see the WHERE clause),
-- so a GM of two campaigns could relocate a player's character into the other one —
-- a campaign the owner never joined. The insert side already gets this right and
-- says so: characters_insert_owner (20260629150000_init.sql:210-219).
--
-- Everything except the guard block is byte-identical to
-- 20260825110642_rename_pre_snapshot.sql:17-53.
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
  v_change_campaign boolean := p_payload ? 'campaign_id';
  v_new_campaign    uuid    := (p_payload->>'campaign_id')::uuid;  -- null when clearing
begin
  -- DEFINER runs as the owner, so reject anonymous callers explicitly.
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- A character may only be attached to a campaign its OWNER belongs to — not one
  -- the CALLER belongs to. The `? 'campaign_id'` test distinguishes "key absent"
  -- (leave as-is) from an explicit null (detach), so a character can also be
  -- removed from a campaign.
  --
  -- is_campaign_member / is_campaign_gm are auth.uid()-scoped (init.sql:128-131,
  -- 141-145) and cannot express an owner-scoped check, hence the direct reads.
  -- Reading the membership tables directly inside a SECURITY DEFINER *function*
  -- is not the recursion hazard init.sql:112-118 warns about — that warning is
  -- about policies, and this is what the helpers themselves do.
  if v_change_campaign and v_new_campaign is not null then
    -- The lookup carries the SAME authorization predicate as the UPDATE below.
    -- Without it this SELECT reads any row (DEFINER bypasses RLS) and the guard
    -- becomes a membership oracle: PT403 vs PT409 would tell a caller whether an
    -- unreadable character's owner belongs to a campaign they can see.
    select owner_id into v_owner from public.characters
     where id = p_id
       and (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));
    -- v_owner null => no such row, OR the caller may not write it. Either way,
    -- fall through so the UPDATE's `not found` collapses to PT409 — identical to
    -- the pre-amendment behaviour and to init.sql:240-241's documented semantics.
    if v_owner is not null and not (
         exists (select 1 from public.campaign_members
                 where campaign_id = v_new_campaign and user_id = v_owner)
      or exists (select 1 from public.campaigns
                 where id = v_new_campaign and gm_id = v_owner)
    ) then
      raise exception 'character owner is not a member of target campaign'
        using errcode = 'PT403';
    end if;
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

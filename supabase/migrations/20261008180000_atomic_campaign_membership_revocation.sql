-- Issue #47: membership is the lifetime of a character's campaign attachment.
BEGIN;

LOCK TABLE public.campaign_members, public.characters IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION public.bump_detached_character_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
begin
  NEW.version := OLD.version + 1;
  return NEW;
end;
$$;
REVOKE EXECUTE ON FUNCTION public.bump_detached_character_version() FROM PUBLIC;

CREATE TRIGGER characters_bump_detach_version
BEFORE UPDATE OF campaign_id ON public.characters
FOR EACH ROW
WHEN (OLD.campaign_id IS NOT NULL AND NEW.campaign_id IS NULL AND NEW.version = OLD.version)
EXECUTE FUNCTION public.bump_detached_character_version();

-- Preserve orphaned characters, including GM-owned ones, without inventing membership.
UPDATE public.characters c SET campaign_id = NULL
WHERE c.campaign_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = c.campaign_id AND m.user_id = c.owner_id
  );

ALTER TABLE public.characters
ADD CONSTRAINT characters_campaign_owner_membership_fkey
FOREIGN KEY (campaign_id, owner_id)
REFERENCES public.campaign_members(campaign_id, user_id)
ON DELETE SET NULL (campaign_id)
NOT DEFERRABLE;

ALTER POLICY characters_insert_owner ON public.characters
WITH CHECK (
  owner_id = auth.uid()
  AND (campaign_id IS NULL OR public.is_campaign_member(campaign_id))
);

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

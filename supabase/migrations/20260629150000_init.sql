-- Build step #3 — cloud-save data model: tables, RLS, and write RPCs.
-- Highest-risk migration in the project (RLS recursion + GM cross-user write).
-- Authorization is enforced ONLY here (RLS), never in the UI.
--
-- Section map (mirrors GitHub issues #13–#16):
--   #13  core tables, enum, invite-code fn, GM-as-member + touch triggers, indexes
--   #14  SECURITY DEFINER RLS helpers + RLS policies on every table
--   #15  update_character RPC (optimistic concurrency)
--   #16  join_campaign RPC (self-join via invite code)

-- ============================================================================
-- #13  Core tables + supporting objects + triggers
-- ============================================================================

-- Short, unique, human-shareable invite code. gen_random_bytes lives in the
-- `extensions` schema, so it must be fully qualified under the empty search_path.
-- SECURITY DEFINER so the extensions.gen_random_bytes call runs as the table
-- owner even when this fires as the default for an `authenticated` insert.
create function public.generate_invite_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
$$;

create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  gm_id       uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  invite_code text not null unique default public.generate_invite_code(),
  created_at  timestamptz not null default now()
);

create type public.campaign_role as enum ('gm', 'player');

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references auth.users (id)      on delete cascade,
  role        public.campaign_role not null default 'player',
  created_at  timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- Document-shaped per PLAN ("store collections as JSONB"). The column mapping
-- keeps a `.btcc` parse → DB → serialize round-trip lossless (lib/btcc/types.ts
-- BtccDraft): info = scalars + equip/equipLoc/weapons/chrWeapons (verbatim),
-- attributes = attrs, skills/traits = BtccRow[], pre_snapshot = pre* sections.
create table public.characters (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  campaign_id  uuid references public.campaigns (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 100),
  info         jsonb not null default '{}'::jsonb,
  attributes   jsonb not null default '{}'::jsonb,
  skills       jsonb not null default '[]'::jsonb,
  traits       jsonb not null default '[]'::jsonb,
  pre_snapshot jsonb not null default '{}'::jsonb,
  notes        text not null default '',
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index characters_owner_id_idx     on public.characters (owner_id);
create index characters_campaign_id_idx  on public.characters (campaign_id);
create index campaign_members_user_id_idx on public.campaign_members (user_id);

-- The GM always shares their own campaign, so member/profile reads work for them
-- exactly as for players. DEFINER so the insert bypasses the GM-only members
-- INSERT policy added below.
create function public.handle_new_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.gm_id, 'gm');
  return new;
end;
$$;

create trigger on_campaign_created
  after insert on public.campaigns
  for each row
  execute function public.handle_new_campaign();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger characters_touch_updated_at
  before update on public.characters
  for each row
  execute function public.touch_updated_at();

alter table public.campaigns        enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters       enable row level security;

-- ============================================================================
-- #14  SECURITY DEFINER RLS helpers + policies
-- ============================================================================
-- All helpers are DEFINER + STABLE + empty search_path: they read the
-- membership tables with RLS bypassed, which is what breaks policy recursion.
-- is_campaign_*(null) → false, so campaign-less characters are owner-only with
-- no special-casing.

-- Authoritative GM check: reads campaigns.gm_id directly (no member recursion).
create function public.is_campaign_gm(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns
    where id = p_campaign_id and gm_id = auth.uid()
  );
$$;

create function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
  );
$$;

-- Does the current user share any campaign with p_user_id? (profiles read.)
create function public.shares_campaign(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members me
    join public.campaign_members peer on peer.campaign_id = me.campaign_id
    where me.user_id = auth.uid() and peer.user_id = p_user_id
  );
$$;

-- profiles — campaign peers can read each other's display names. (Existing
-- profiles_select_own from the profiles migration is replaced by this superset;
-- profiles_update_own is kept.)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_visible"
  on public.profiles for select
  using (auth.uid() = id or public.shares_campaign(id));

-- campaigns
create policy "campaigns_select_member"
  on public.campaigns for select
  using (gm_id = auth.uid() or public.is_campaign_member(id));

create policy "campaigns_insert_own"
  on public.campaigns for insert
  with check (gm_id = auth.uid());

create policy "campaigns_update_gm"
  on public.campaigns for update
  using (gm_id = auth.uid())
  with check (gm_id = auth.uid());

create policy "campaigns_delete_gm"
  on public.campaigns for delete
  using (gm_id = auth.uid());

-- campaign_members — GM adds players; self-join goes through join_campaign RPC.
create policy "members_select_self_or_gm"
  on public.campaign_members for select
  using (user_id = auth.uid() or public.is_campaign_gm(campaign_id));

create policy "members_insert_gm"
  on public.campaign_members for insert
  with check (public.is_campaign_gm(campaign_id));

create policy "members_delete_self_or_gm"
  on public.campaign_members for delete
  using (user_id = auth.uid() or public.is_campaign_gm(campaign_id));

-- characters — owner full control; campaign GM may read/write members' chars.
create policy "characters_select_owner_or_gm"
  on public.characters for select
  using (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));

-- A character may only be created unattached or inside a campaign the owner
-- actually belongs to — otherwise anyone could inject characters into (or force
-- GM oversight onto) a campaign they are not a member of.
create policy "characters_insert_owner"
  on public.characters for insert
  with check (
    owner_id = auth.uid()
    and (
      campaign_id is null
      or public.is_campaign_member(campaign_id)
      or public.is_campaign_gm(campaign_id)
    )
  );

-- NOTE: there is deliberately NO `for update` policy. All character updates go
-- through the `update_character` RPC (a SECURITY DEFINER function that carries
-- the same `owner_id = auth.uid() OR is_campaign_gm(...)` authorization in its
-- WHERE clause), and `authenticated` is NOT granted UPDATE on this table. That
-- is what makes the RPC the *only* write path: it guarantees the optimistic
-- `version` check runs atomically and that `owner_id` stays immutable (an RLS
-- WITH CHECK cannot enforce immutability because it cannot see the OLD row).

create policy "characters_delete_owner_or_gm"
  on public.characters for delete
  using (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));

-- ============================================================================
-- #15  update_character RPC — optimistic concurrency
-- ============================================================================
-- SECURITY DEFINER and the *only* write path for characters (authenticated has
-- no table UPDATE grant, so direct PATCH /characters is impossible). Because
-- DEFINER bypasses RLS, authorization is carried in the WHERE clause — the same
-- rule the old `for update` policy expressed: `owner_id = auth.uid() OR
-- is_campaign_gm(campaign_id)`. Wrong id / not permitted / stale version all
-- collapse to `not found` → PT409 conflict (client reloads). Whitelisted columns
-- only: owner_id, version, timestamps are never writable from the payload.
create function public.update_character(
  p_id               uuid,
  p_expected_version integer,
  p_payload          jsonb
)
returns public.characters
language plpgsql
security definer
set search_path = ''
as $$
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
    pre_snapshot = coalesce(p_payload->'pre_snapshot', pre_snapshot),
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

-- ============================================================================
-- #16  join_campaign RPC — self-join via invite code
-- ============================================================================
-- DEFINER is the intentional, audited bypass of members_insert (GM-only): the
-- function only ever inserts auth.uid() as 'player' — it cannot add other users
-- or grant GM. The explicit null guard prevents an anonymous insert running
-- with the owner's privileges.
create function public.join_campaign(p_invite_code text)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare v_campaign public.campaigns;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.campaigns
  where invite_code = p_invite_code;

  if not found then
    raise exception 'invalid invite code' using errcode = 'PT404';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign.id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;

  return v_campaign;
end;
$$;

revoke execute on function public.join_campaign(text) from anon;
grant execute on function public.join_campaign(text) to authenticated;

-- ============================================================================
-- Grants — RLS is necessary but NOT sufficient. Tables created by `postgres`
-- only grant Dxtm to authenticated by default, so without explicit DML grants
-- the policies above can never be reached. `anon` is deliberately left with no
-- DML — only signed-in users touch the data model.
-- ============================================================================

-- profiles existed before this migration with no role grants, so its step-#2
-- RLS policies were latent; activate them for signed-in users.
grant select, update on public.profiles to authenticated;

grant select, insert, update, delete on public.campaigns        to authenticated;
grant select, insert,         delete on public.campaign_members  to authenticated;
-- NO update on characters: writes go exclusively through update_character so the
-- optimistic `version` check is unbypassable and `owner_id` is immutable.
grant select, insert,         delete on public.characters        to authenticated;

-- update_character is SECURITY DEFINER; functions grant EXECUTE to PUBLIC by
-- default, so revoke that and re-grant narrowly to keep anon from invoking it.
revoke execute on function public.update_character(uuid, integer, jsonb) from public;
grant  execute on function public.update_character(uuid, integer, jsonb) to authenticated;

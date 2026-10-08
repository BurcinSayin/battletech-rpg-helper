-- RLS + atomic campaign-membership lifecycle matrix (GitHub issues #18, #20, #47).
-- Each membership deletion must preserve characters and revoke campaign-derived
-- access in the same database operation. Run with `supabase test db`.
--
-- Technique: authorization is enforced for the `authenticated` role, so each
-- RLS-sensitive check runs *as that role* (with a per-user JWT claim) and
-- materializes its result into a capture table. pgTAP assertions then run as the
-- privileged role reading those captures — this keeps pgTAP's own temp objects
-- owned by one role and avoids cross-role permission noise. Error-raising RPCs
-- are wrapped in a plpgsql block that records the SQLSTATE.

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions, pg_temp;

-- 30 existing/guard assertions + 22 per removal actor + 3 empty-membership
-- assertions + 11 GM-own-membership assertions + 2 campaign-delete assertions.
select plan(90);

-- ---------------------------------------------------------------------------
-- Fixtures (as the privileged role; bypasses RLS):
--   gm owns campaign `camp`; player A is a member; player B is not.
--   charA: owned by A, in `camp`.   charB: owned by B, campaign-less.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gm@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a@test.local'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'b@test.local');

-- direct insert; the on_campaign_created trigger auto-adds the GM membership
insert into public.campaigns (id, gm_id, name, invite_code)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Camp', 'TESTJOIN');

insert into public.campaign_members (campaign_id, user_id, role)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player');

insert into public.characters (id, owner_id, campaign_id, name) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'CharA'),   -- owner A, in camp
  ('ffffffff-ffff-ffff-ffff-ffffffffffff',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'CharB'); -- owner B, no camp

-- capture tables, created under `authenticated` so every authenticated context
-- (A, B, GM — same DB role, different JWT) and the privileged reader can use them
set local role authenticated;
create temp table cap_n (label text primary key, n bigint);
create temp table cap_e (label text primary key, code text);
create temp table cap_rows (label text primary key, data jsonb);
create temp table revocation_cases (
  label text primary key,
  actor_id uuid,
  owner_id uuid,
  campaign_id uuid,
  main_id uuid,
  extra_id uuid,
  inserted_id uuid,
  pre_version integer,
  control_ids uuid[]
);
reset role;

-- Helper macro is not available in plain SQL, so each check is spelled out:
-- switch role + claim, run the query, capture, reset.

-- 1) profiles cross-campaign read: A (shares camp) can read GM's profile.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
insert into cap_n values ('a_reads_gm_profile',
  (select count(*) from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
reset role;

-- 8) profiles: B (no shared campaign) cannot read A's profile.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into cap_n values ('b_reads_a_profile',
  (select count(*) from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
reset role;

-- 1) player A cannot read B's character.
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
insert into cap_n values ('a_reads_charB',
  (select count(*) from public.characters where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'));
reset role;

-- 5) owner isolation without campaign: B reads its own campaign-less character.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into cap_n values ('b_reads_charB',
  (select count(*) from public.characters where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'));
reset role;

-- 2) GM can read a member's (A's) character.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
insert into cap_n values ('gm_reads_charA',
  (select count(*) from public.characters where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'));
reset role;

-- 4) non-member B cannot read the campaign character.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
insert into cap_n values ('b_reads_charA',
  (select count(*) from public.characters where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'));
reset role;

-- 4) non-member B update via RPC → row invisible → PT409 conflict, no write.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
do $$ begin
  begin
    perform public.update_character('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 1, '{"name":"hax"}'::jsonb);
    insert into cap_e values ('b_update_charA', 'NOERROR');
  exception when others then
    insert into cap_e values ('b_update_charA', sqlstate);
  end;
end $$;
reset role;

-- 6) stale version: owner A with wrong expected version → PT409, row unchanged.
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
do $$ begin
  begin
    perform public.update_character('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 999, '{"name":"stale"}'::jsonb);
    insert into cap_e values ('a_stale_update', 'NOERROR');
  exception when others then
    insert into cap_e values ('a_stale_update', sqlstate);
  end;
end $$;
reset role;

-- charA version unchanged after the two failed writes (read privileged).
insert into cap_n values ('charA_version_after_fail',
  (select version from public.characters where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'));

-- 3) GM can write a member's character; version increments (RPC returns new row).
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
insert into cap_n select 'gm_update_returns_version', version
  from public.update_character('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 1, '{"name":"GM edit"}'::jsonb);
reset role;

insert into cap_n values ('charA_version_after_gm',
  (select version from public.characters where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'));

-- == write-path lockdown regressions (findings #1–#3) — B is still a non-member here ==

-- #1: authenticated must have NO direct UPDATE on characters (privileged read).
insert into cap_n values ('authenticated_has_update_priv',
  has_table_privilege('authenticated', 'public.characters', 'update')::int::bigint);

-- #1: a direct UPDATE by the owner is rejected for lack of table privilege (42501),
-- so the version guard cannot be bypassed outside update_character.
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
do $$ begin
  begin
    update public.characters set version = 1
      where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    insert into cap_e values ('a_direct_update', 'NOERROR');
  exception when others then
    insert into cap_e values ('a_direct_update', sqlstate);
  end;
end $$;
reset role;

-- #3: non-member B inserting a character into the campaign is denied (RLS WITH CHECK → 42501).
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
do $$ begin
  begin
    insert into public.characters (owner_id, campaign_id, name)
      values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
              'dddddddd-dddd-dddd-dddd-dddddddddddd', 'InjectedByB');
    insert into cap_e values ('b_insert_into_camp', 'NOERROR');
  exception when others then
    insert into cap_e values ('b_insert_into_camp', sqlstate);
  end;
end $$;
reset role;

-- #3: B attaching its own character to a campaign B is not a member of → PT403.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
do $$ begin
  begin
    perform public.update_character('ffffffff-ffff-ffff-ffff-ffffffffffff', 1,
      '{"campaign_id":"dddddddd-dddd-dddd-dddd-dddddddddddd"}'::jsonb);
    insert into cap_e values ('b_attach_foreign', 'NOERROR');
  exception when others then
    insert into cap_e values ('b_attach_foreign', sqlstate);
  end;
end $$;
reset role;

-- #4 (came along free): owner A can CLEAR campaign_id via the RPC (charA is at version 2).
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
insert into cap_n select 'charA_campaign_cleared', (campaign_id is null)::int::bigint
  from public.update_character('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 2,
    '{"campaign_id":null}'::jsonb);
insert into cap_n values ('charA_explicit_detach_version',
  (select version from public.characters where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'));
reset role;

-- 7) join_campaign: B self-joins with the valid invite code.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
do $$ begin perform public.join_campaign('TESTJOIN'); end $$;
insert into cap_n values ('b_membership_after_join',
  (select count(*) from public.campaign_members
   where campaign_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
     and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
-- idempotent re-join: still exactly one membership row.
do $$ begin perform public.join_campaign('TESTJOIN'); end $$;
insert into cap_n values ('b_membership_after_rejoin',
  (select count(*) from public.campaign_members
   where campaign_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
     and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
-- invalid code → PT404.
do $$ begin
  begin
    perform public.join_campaign('NOPE9999');
    insert into cap_e values ('b_join_bogus', 'NOERROR');
  exception when others then
    insert into cap_e values ('b_join_bogus', sqlstate);
  end;
end $$;
reset role;


-- ===========================================================================
-- Build step #7 (GitHub issue #20) — campaign lifecycle + owner-scoped guard.
--
-- A fresh fixture set with its own UUIDs (the a1..a7 block: 1111-/2222- collide
-- with supabase/seed.sql, which seeds a user and a character). It deliberately
-- does NOT reuse charA
-- or charB for the lifecycle cases: the blocks above already mutate charA's
-- campaign attachment (it is left detached at line 186-192), so entangling with
-- it would make these assertions order-dependent.
--
--   gm2 owns camp2, camp3, camp4 and camp5. C belongs to camp2 and camp3;
--   D belongs to camp5 and camp3. Neither belongs to camp4 (the guard target).
--   Each removal actor has two attached characters and two unaffected controls.
-- ===========================================================================
insert into auth.users (id, email) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'gm2@test.local'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'c@test.local'),
  ('a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', 'd@test.local');

insert into public.campaigns (id, gm_id, name, invite_code) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp2', 'TESTLV01'),
  ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp3', 'TESTDEL1'),
  ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp4', 'TESTREL1'),
  ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp5', 'TESTGM01');

-- C and D each belong to their removal campaign and to the cross-campaign control.
insert into public.campaign_members (campaign_id, user_id, role) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'player'),
  ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'player'),
  ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9',
   'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', 'player'),
  ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', 'player');

insert into public.characters (id, owner_id, campaign_id, name) values
  ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
   'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', 'CharC'),
  ('a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
   'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'CharC2');

insert into public.characters (id, owner_id, campaign_id, name, info, notes) values
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
   'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', 'C extra', '{"fixture":"c-extra"}', 'Preserve C extra'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', 'Camp2 other member', '{"fixture":"c-control"}', 'Unaffected'),
  ('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3',
   'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
   'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'CharD', '{"fixture":"d-main"}', 'Preserve D'),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4',
   'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
   'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'D extra', '{"fixture":"d-extra"}', 'Preserve D extra'),
  ('b5b5b5b5-b5b5-b5b5-b5b5-b5b5b5b5b5b5',
   'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
   'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'D cross-campaign', '{"fixture":"d-cross"}', 'Unaffected'),
  ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b6',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', 'Camp5 other member', '{"fixture":"d-control"}', 'Unaffected'),
  ('b7b7b7b7-b7b7-b7b7-b7b7-b7b7b7b7b7b7',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', 'GM own', '{"fixture":"gm-own"}', 'Preserve GM');

insert into revocation_cases values
  ('player', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
   'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
   'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 2,
   array['a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2']::uuid[]),
  ('gm', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', 'a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9',
   'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3', 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4',
   'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 1,
   array['b5b5b5b5-b5b5-b5b5-b5b5-b5b5b5b5b5b5', 'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b6']::uuid[]);

-- AC 24: GM2 can write a member's character. This establishes the access that
-- the leave sequence below then proves is revoked.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
insert into cap_n select 'gm2_update_returns_version', version
  from public.update_character('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 1,
    '{"name":"GM2 edit"}'::jsonb);
reset role;

-- AC 30: GM2 relocating a member's character into camp4 — a campaign GM2 belongs
-- to but the OWNER does not — must be refused. Under the old caller-scoped guard
-- this SUCCEEDED, because is_campaign_member(camp4) was true for the caller.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
do $$ begin
  begin
    perform public.update_character('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 2,
      '{"campaign_id":"a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7"}'::jsonb);
    insert into cap_e values ('gm2_relocate_charC', 'NOERROR');
  exception when others then
    insert into cap_e values ('gm2_relocate_charC', sqlstate);
  end;
end $$;
reset role;

-- The refusal must be total: neither column moved (privileged reads).
insert into cap_n values ('charC_campaign_after_reject',
  (select (campaign_id = 'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3')::int::bigint
     from public.characters where id = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4'));
insert into cap_n values ('charC_version_after_reject',
  (select version from public.characters
    where id = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4'));

-- AC 30 / finding N1: no membership oracle. GM2 probes charB — owner B, still
-- campaign-less (the only attach attempt above was refused), so GM2 cannot read
-- it. GM2 *is* in camp4 and B is not. The answer must be PT409 ("no row you may
-- write"), NOT PT403 ("that owner isn't in camp4") — the latter would leak B's
-- non-membership of a campaign GM2 can see.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
do $$ begin
  begin
    perform public.update_character('ffffffff-ffff-ffff-ffff-ffffffffffff', 1,
      '{"campaign_id":"a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7"}'::jsonb);
    insert into cap_e values ('gm2_probe_charB', 'NOERROR');
  exception when others then
    insert into cap_e values ('gm2_probe_charB', sqlstate);
  end;
end $$;
reset role;

-- Missing and unreadable RPC targets must share the same PT409 contract.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2"}';
do $$ begin
  begin
    perform public.update_character('c9c9c9c9-c9c9-c9c9-c9c9-c9c9c9c9c9c9', 1, '{}'::jsonb);
    insert into cap_e values ('missing_character', 'NOERROR');
  exception when others then
    insert into cap_e values ('missing_character', sqlstate);
  end;
end $$;
reset role;

-- AC 25 / issue #47: player removal and GM removal use independent memberships
-- and fresh character rows. Snapshot complete rows, not just their names.
insert into cap_rows
  select r.label || '_main_before', to_jsonb(c)
  from revocation_cases r join public.characters c on c.id = r.main_id;
insert into cap_rows
  select r.label || '_extra_before', to_jsonb(c)
  from revocation_cases r join public.characters c on c.id = r.extra_id;
insert into cap_rows
  select r.label || '_controls_before', jsonb_agg(to_jsonb(c) order by c.id)
  from revocation_cases r join public.characters c on c.id = any(r.control_ids)
  group by r.label;

-- There is deliberately no detach RPC: the single authenticated DELETE must
-- detach every character attached to that exact (campaign, owner) membership.
set local role authenticated;
do $$
declare r record; affected bigint;
begin
  for r in select * from revocation_cases order by label loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.actor_id)::text, true);
    with removed as (
      delete from public.campaign_members
      where campaign_id = r.campaign_id and user_id = r.owner_id returning 1
    ) select count(*) into affected from removed;
    insert into cap_n values (r.label || '_removed', affected);
  end loop;
end $$;
reset role;

insert into cap_rows
  select r.label || '_main_detached', to_jsonb(c)
  from revocation_cases r join public.characters c on c.id = r.main_id;
insert into cap_rows
  select r.label || '_extra_detached', to_jsonb(c)
  from revocation_cases r join public.characters c on c.id = r.extra_id;
insert into cap_n
  select r.label || '_membership_after', count(m.user_id)
  from revocation_cases r left join public.campaign_members m
    on m.campaign_id = r.campaign_id and m.user_id = r.owner_id group by r.label;

-- Deleting the already absent membership must not touch character versions.
set local role authenticated;
do $$
declare r record; affected bigint;
begin
  for r in select * from revocation_cases order by label loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.actor_id)::text, true);
    with removed as (
      delete from public.campaign_members
      where campaign_id = r.campaign_id and user_id = r.owner_id returning 1
    ) select count(*) into affected from removed;
    insert into cap_n values (r.label || '_removed_again', affected);
  end loop;
end $$;
reset role;
insert into cap_n
  select r.label || '_repeat_unchanged', (count(*) = 2)::int::bigint
  from revocation_cases r join public.characters c on c.id in (r.main_id, r.extra_id)
  join cap_rows s on s.label = r.label ||
    case when c.id = r.main_id then '_main_detached' else '_extra_detached' end
  where to_jsonb(c) = s.data group by r.label;

-- Use the actual post-removal version, even if a regression failed to bump it:
-- a stale-version error must never masquerade as proof of GM revocation.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
do $$
declare r record; target uuid; current_version integer; affected bigint; suffix text;
begin
  for r in select * from revocation_cases order by label loop
    insert into cap_n values (r.label || '_gm_reads',
      (select count(*) from public.characters where id in (r.main_id, r.extra_id)));
    foreach target in array array[r.main_id, r.extra_id] loop
      suffix := case when target = r.main_id then '_main' else '_extra' end;
      select (data ->> 'version')::integer into current_version
        from cap_rows where label = r.label || suffix || '_detached';
      begin
        perform public.update_character(target, current_version, '{"name":"GM forbidden"}'::jsonb);
        insert into cap_e values (r.label || '_gm_write' || suffix, 'NOERROR');
      exception when others then
        insert into cap_e values (r.label || '_gm_write' || suffix, sqlstate);
      end;
    end loop;
    with removed as (
      delete from public.characters where id in (r.main_id, r.extra_id) returning 1
    ) select count(*) into affected from removed;
    insert into cap_n values (r.label || '_gm_deletes', affected);
  end loop;
end $$;
reset role;

-- The owner still reads the complete preserved data, can save at the new
-- version, and cannot save stale data or restore the attachment without joining.
set local role authenticated;
do $$
declare r record; current_version integer; saved_version integer;
begin
  for r in select * from revocation_cases order by label loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.owner_id)::text, true);
    insert into cap_n values (r.label || '_owner_reads_preserved',
      (select count(*) from public.characters c join cap_rows s
        on s.label = r.label ||
          case when c.id = r.main_id then '_main_detached' else '_extra_detached' end
        where c.id in (r.main_id, r.extra_id) and to_jsonb(c) = s.data));
    select (data ->> 'version')::integer into current_version
      from cap_rows where label = r.label || '_main_detached';
    begin
      perform public.update_character(r.main_id, r.pre_version, '{"notes":"Stale overwrite"}'::jsonb);
      insert into cap_e values (r.label || '_owner_stale', 'NOERROR');
    exception when others then
      insert into cap_e values (r.label || '_owner_stale', sqlstate);
    end;
    begin
      perform public.update_character(r.main_id, current_version,
        jsonb_build_object('campaign_id', r.campaign_id));
      insert into cap_e values (r.label || '_reattach', 'NOERROR');
    exception when others then
      insert into cap_e values (r.label || '_reattach', sqlstate);
    end;
    begin
      insert into public.characters (id, owner_id, campaign_id, name)
        values (r.inserted_id, r.owner_id, r.campaign_id, 'Forbidden after removal');
      insert into cap_e values (r.label || '_insert', 'NOERROR');
    exception when others then
      insert into cap_e values (r.label || '_insert', sqlstate);
    end;
    insert into cap_rows
      select r.label || '_main_after_failures', to_jsonb(c)
      from public.characters c where id = r.main_id;
    select version into saved_version from public.update_character(r.main_id, current_version,
      jsonb_build_object('notes', 'Owner saved after ' || r.label || ' removal'));
    insert into cap_n values (r.label || '_owner_save_version', saved_version);
  end loop;
end $$;
reset role;

insert into cap_rows
  select r.label || '_main_saved', to_jsonb(c)
  from revocation_cases r join public.characters c on c.id = r.main_id;
insert into cap_n
  select r.label || '_insert_absent', count(c.id)
  from revocation_cases r left join public.characters c on c.id = r.inserted_id group by r.label;
insert into cap_n
  select r.label || '_extra_unchanged', count(c.id)
  from revocation_cases r join public.characters c on c.id = r.extra_id
  join cap_rows s on s.label = r.label || '_extra_detached'
  where to_jsonb(c) = s.data group by r.label;
insert into cap_rows
  select r.label || '_controls_after', jsonb_agg(to_jsonb(c) order by c.id)
  from revocation_cases r join public.characters c on c.id = any(r.control_ids)
  group by r.label;

-- A real membership with no attached characters can also be removed; unlike
-- the idempotent case above, this DELETE must affect one row.
-- Keep B outside camp4 until after the membership-oracle probe above.
insert into public.campaign_members (campaign_id, user_id, role) values
  ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'player');
insert into cap_rows select 'empty_removal_before', jsonb_agg(to_jsonb(c) order by c.id)
  from public.characters c;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
with removed as (
  delete from public.campaign_members
  where campaign_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
    and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' returning 1
) insert into cap_n select 'empty_removal_count', count(*) from removed;
reset role;
insert into cap_n values ('empty_removal_membership_after',
  (select count(*) from public.campaign_members
    where campaign_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
      and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
insert into cap_rows select 'empty_removal_after', jsonb_agg(to_jsonb(c) order by c.id)
  from public.characters c;

-- Campaign ownership is not an attachment-membership exception. The UI still
-- prohibits GM leave; the database permits this direct authenticated DELETE.
insert into cap_rows select 'gm_own_before', to_jsonb(c)
  from public.characters c where id = 'b7b7b7b7-b7b7-b7b7-b7b7-b7b7b7b7b7b7';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
with removed as (
  delete from public.campaign_members
  where campaign_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
    and user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1' returning 1
) insert into cap_n select 'gm_own_removed', count(*) from removed;
insert into cap_rows select 'gm_own_detached', to_jsonb(c)
  from public.characters c where id = 'b7b7b7b7-b7b7-b7b7-b7b7-b7b7b7b7b7b7';
insert into cap_n values ('gm_own_campaign_still_owned',
  (select count(*) from public.campaigns
    where id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
      and gm_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'));
do $$
declare current_version integer;
begin
  select (data ->> 'version')::integer into current_version
    from cap_rows where label = 'gm_own_detached';
  begin
    perform public.update_character('b7b7b7b7-b7b7-b7b7-b7b7-b7b7b7b7b7b7', current_version,
      '{"campaign_id":"a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7"}'::jsonb);
    insert into cap_e values ('gm_own_reattach', 'NOERROR');
  exception when others then
    insert into cap_e values ('gm_own_reattach', sqlstate);
  end;
  begin
    insert into public.characters (id, owner_id, campaign_id, name)
      values ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
        'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
        'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', 'Forbidden GM attachment');
    insert into cap_e values ('gm_own_insert', 'NOERROR');
  exception when others then
    insert into cap_e values ('gm_own_insert', sqlstate);
  end;
end $$;
insert into cap_rows select 'gm_own_after_failures', to_jsonb(c)
  from public.characters c where id = 'b7b7b7b7-b7b7-b7b7-b7b7-b7b7b7b7b7b7';
insert into cap_n select 'gm_own_save_version', version
  from public.update_character('b7b7b7b7-b7b7-b7b7-b7b7-b7b7b7b7b7b7', 2, '{"notes":"GM owner saved"}'::jsonb);
reset role;
insert into cap_n values ('gm_own_membership_after',
  (select count(*) from public.campaign_members
    where campaign_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
      and user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'));
insert into cap_n values ('gm_own_insert_absent',
  (select count(*) from public.characters where id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'));

-- AC 26: deleting a campaign detaches its members' characters rather than
-- deleting them (characters.campaign_id is ON DELETE SET NULL, init.sql:54).
insert into cap_rows select 'campaign_delete_before', to_jsonb(c)
  from public.characters c where id = 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
delete from public.campaigns where id = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5';
reset role;

insert into cap_n values ('charC2_survives_campaign_delete',
  (select count(*) from public.characters
    where id = 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6'));
insert into cap_n values ('charC2_detached_by_campaign_delete',
  (select (campaign_id is null)::int::bigint from public.characters
    where id = 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6'));
insert into cap_rows select 'campaign_delete_after', to_jsonb(c)
  from public.characters c where id = 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6';
-- Realtime publication (AC 17). Not an RLS check, but it belongs with them: the
-- editor's postgres_changes subscription is inert without it, and nothing else in
-- the suite would notice if a later migration dropped the table from the
-- publication.
insert into cap_n values ('characters_published',
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'characters'));

-- 'd' = default (primary key). Deliberately NOT 'f' (full): the client filters on
-- the primary key and reads only `new.version`, so FULL would inflate every WAL
-- record with an OLD tuple no consumer reads.
insert into cap_e values ('characters_replica_identity',
  (select relreplident::text from pg_class where oid = 'public.characters'::regclass));

-- ---------------------------------------------------------------------------
-- Assertions (privileged role reads the captures)
-- ---------------------------------------------------------------------------
select is((select n from cap_n where label = 'a_reads_gm_profile'),    1::bigint, 'profiles: campaign peer A can read GM profile');
select is((select n from cap_n where label = 'b_reads_a_profile'),     0::bigint, 'profiles: non-peer B cannot read A profile');
select is((select n from cap_n where label = 'a_reads_charB'),         0::bigint, 'characters: A cannot read B''s character');
select is((select n from cap_n where label = 'b_reads_charB'),         1::bigint, 'characters: B reads its own campaign-less character');
select is((select n from cap_n where label = 'gm_reads_charA'),        1::bigint, 'characters: GM reads a member''s character');
select is((select n from cap_n where label = 'b_reads_charA'),         0::bigint, 'characters: non-member B cannot read campaign character');
select is((select code from cap_e where label = 'b_update_charA'),     'PT409',   'update_character: non-member write → PT409');
select is((select code from cap_e where label = 'a_stale_update'),     'PT409',   'update_character: stale version → PT409');
select is((select n from cap_n where label = 'charA_version_after_fail'), 1::bigint, 'update_character: failed writes leave version unchanged');
select is((select n from cap_n where label = 'gm_update_returns_version'), 2::bigint, 'update_character: GM write returns incremented version');
select is((select n from cap_n where label = 'charA_version_after_gm'),  2::bigint, 'update_character: GM write persisted version bump');
select is((select n from cap_n where label = 'b_membership_after_join'),  1::bigint, 'join_campaign: valid code adds membership');
select is((select n from cap_n where label = 'b_membership_after_rejoin'),1::bigint, 'join_campaign: repeat join is idempotent');
select is((select code from cap_e where label = 'b_join_bogus'),       'PT404',   'join_campaign: invalid code → PT404');
-- write-path lockdown (findings #1–#3)
select is((select n from cap_n where label = 'authenticated_has_update_priv'), 0::bigint, 'grants: authenticated has NO direct UPDATE on characters');
select is((select code from cap_e where label = 'a_direct_update'),    '42501',   'characters: direct UPDATE by owner is denied (no table privilege)');
select is((select code from cap_e where label = 'b_insert_into_camp'), '42501',   'characters: non-member INSERT into a campaign is denied');
select is((select code from cap_e where label = 'b_attach_foreign'),   'PT403',   'update_character: attaching to a non-member campaign → PT403');
select is((select n from cap_n where label = 'charA_campaign_cleared'), 1::bigint, 'update_character: campaign_id can be cleared to null');
select is((select n from cap_n where label = 'charA_explicit_detach_version'), 3::bigint, 'update_character: explicit null detach increments version exactly once');
select is((select code from cap_e where label = 'missing_character'), 'PT409', 'update_character: missing character → PT409');

-- campaign lifecycle + owner-scoped campaign guard (GitHub issue #20)
select is((select n from cap_n where label = 'gm2_update_returns_version'),         2::bigint, 'update_character: GM write on a member''s character returns version 2');
select is((select code from cap_e where label = 'gm2_relocate_charC'),              'PT403',   'update_character: GM relocating a member''s character to a campaign the owner isn''t in → PT403');
select is((select n from cap_n where label = 'charC_campaign_after_reject'),        1::bigint, 'update_character: rejected relocation leaves campaign_id unchanged');
select is((select n from cap_n where label = 'charC_version_after_reject'),         2::bigint, 'update_character: rejected relocation leaves version unchanged');
select is((select code from cap_e where label = 'gm2_probe_charB'),                 'PT409',   'update_character: relocating an unreadable character → PT409, not PT403 (no membership oracle)');
-- Membership removal: each SELECT emits one assertion for each removal actor.
select is((select n from cap_n where label = r.label || '_removed'), 1::bigint,
  r.label || ' removal: direct membership DELETE affects one row')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_membership_after'), 0::bigint,
  r.label || ' removal: membership is absent')
  from revocation_cases r order by r.label;
select is((select data -> 'campaign_id' from cap_rows where label = r.label || '_main_detached'), 'null'::jsonb,
  r.label || ' removal: main character is detached')
  from revocation_cases r order by r.label;
select is((select (data ->> 'version')::integer from cap_rows where label = r.label || '_main_detached'),
  r.pre_version + 1, r.label || ' removal: main character version increments exactly once (CharC reaches 3)')
  from revocation_cases r order by r.label;
select is((select data - array['campaign_id', 'version', 'updated_at']
    from cap_rows where label = r.label || '_main_detached'),
  (select data - array['campaign_id', 'version', 'updated_at']
    from cap_rows where label = r.label || '_main_before'),
  r.label || ' removal: main character ownership and all data are preserved')
  from revocation_cases r order by r.label;
select ok((select data -> 'campaign_id' = 'null'::jsonb and (data ->> 'version')::integer = 2
    and data - array['campaign_id', 'version', 'updated_at'] =
      (select data - array['campaign_id', 'version', 'updated_at']
        from cap_rows where label = r.label || '_extra_before')
    from cap_rows where label = r.label || '_extra_detached'),
  r.label || ' removal: second character detaches once with ownership and all data preserved')
  from revocation_cases r order by r.label;
select is((select data from cap_rows where label = r.label || '_controls_after'),
  (select data from cap_rows where label = r.label || '_controls_before'),
  r.label || ' removal: same owner in another campaign and other member in this campaign are unchanged')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_removed_again'), 0::bigint,
  r.label || ' removal: repeated DELETE is idempotent')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_repeat_unchanged'), 1::bigint,
  r.label || ' removal: repeated DELETE leaves both complete rows and versions unchanged')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_gm_reads'), 0::bigint,
  r.label || ' removal: former GM SELECT sees neither character')
  from revocation_cases r order by r.label;
select is((select code from cap_e where label = r.label || '_gm_write_main'), 'PT409',
  r.label || ' removal: former GM main-character RPC at actual current version is denied')
  from revocation_cases r order by r.label;
select is((select code from cap_e where label = r.label || '_gm_write_extra'), 'PT409',
  r.label || ' removal: former GM second-character RPC at actual current version is denied')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_gm_deletes'), 0::bigint,
  r.label || ' removal: former GM DELETE returns zero rows')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_owner_reads_preserved'), 2::bigint,
  r.label || ' removal: owner can read both complete preserved rows after GM attempts')
  from revocation_cases r order by r.label;
select is((select code from cap_e where label = r.label || '_owner_stale'), 'PT409',
  r.label || ' removal: owner save at pre-detach version without campaign assignment is stale')
  from revocation_cases r order by r.label;
select is((select code from cap_e where label = r.label || '_reattach'), 'PT403',
  r.label || ' removal: owner cannot reattach without membership')
  from revocation_cases r order by r.label;
select is((select code from cap_e where label = r.label || '_insert'), '42501',
  r.label || ' removal: attached INSERT without membership is rejected by RLS')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_insert_absent'), 0::bigint,
  r.label || ' removal: forbidden INSERT creates no row')
  from revocation_cases r order by r.label;
select is((select data from cap_rows where label = r.label || '_main_after_failures'),
  (select data from cap_rows where label = r.label || '_main_detached'),
  r.label || ' removal: stale save and forbidden reattachment change neither data nor version')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_owner_save_version'),
  (r.pre_version + 2)::bigint, r.label || ' removal: owner saves successfully at new version')
  from revocation_cases r order by r.label;
select ok((select data ->> 'notes' = 'Owner saved after ' || r.label || ' removal'
    and data - array['notes', 'version', 'updated_at'] =
      (select data - array['notes', 'version', 'updated_at']
        from cap_rows where label = r.label || '_main_detached')
    from cap_rows where label = r.label || '_main_saved'),
  r.label || ' removal: owner save persists notes, preserving ownership, attachment and other data')
  from revocation_cases r order by r.label;
select is((select n from cap_n where label = r.label || '_extra_unchanged'), 1::bigint,
  r.label || ' removal: second character remains intact after all authorization attempts')
  from revocation_cases r order by r.label;

select is((select n from cap_n where label = 'empty_removal_count'), 1::bigint,
  'empty membership: authenticated DELETE succeeds without attached characters');
select is((select n from cap_n where label = 'empty_removal_membership_after'), 0::bigint,
  'empty membership: membership is removed');
select is((select data from cap_rows where label = 'empty_removal_after'),
  (select data from cap_rows where label = 'empty_removal_before'),
  'empty membership: no character data or version changes');

select is((select n from cap_n where label = 'gm_own_removed'), 1::bigint,
  'GM membership: GM can directly remove own membership');
select is((select n from cap_n where label = 'gm_own_membership_after'), 0::bigint,
  'GM membership: own membership is absent');
select is((select n from cap_n where label = 'gm_own_campaign_still_owned'), 1::bigint,
  'GM membership: campaign ownership remains after membership deletion');
select is((select data -> 'campaign_id' from cap_rows where label = 'gm_own_detached'), 'null'::jsonb,
  'GM membership: own character is detached and still readable as owner');
select is((select (data ->> 'version')::integer from cap_rows where label = 'gm_own_detached'), 2,
  'GM membership: own character version increments exactly once');
select is((select data - array['campaign_id', 'version', 'updated_at'] from cap_rows where label = 'gm_own_detached'),
  (select data - array['campaign_id', 'version', 'updated_at'] from cap_rows where label = 'gm_own_before'),
  'GM membership: own character ownership and all data are preserved');
select is((select code from cap_e where label = 'gm_own_reattach'), 'PT403',
  'GM membership: campaign ownership alone cannot reattach own character');
select is((select code from cap_e where label = 'gm_own_insert'), '42501',
  'GM membership: campaign ownership alone cannot INSERT an attached character');
select is((select n from cap_n where label = 'gm_own_insert_absent'), 0::bigint,
  'GM membership: forbidden INSERT creates no row');
select is((select data from cap_rows where label = 'gm_own_after_failures'),
  (select data from cap_rows where label = 'gm_own_detached'),
  'GM membership: rejected reattachment and INSERT leave character and version unchanged');
select is((select n from cap_n where label = 'gm_own_save_version'), 3::bigint,
  'GM membership: GM still saves detached character by ownership');

select is((select n from cap_n where label = 'charC2_survives_campaign_delete'),    1::bigint, 'campaign delete: member''s character still exists');
select is((select n from cap_n where label = 'charC2_detached_by_campaign_delete'), 1::bigint, 'campaign delete: member''s character has campaign_id null');
select is((select (data ->> 'version')::integer from cap_rows where label = 'campaign_delete_after'), 2,
  'campaign delete: overlapping campaign/membership FKs increment character version exactly once');
select is((select data - array['campaign_id', 'version', 'updated_at'] from cap_rows where label = 'campaign_delete_after'),
  (select data - array['campaign_id', 'version', 'updated_at'] from cap_rows where label = 'campaign_delete_before'),
  'campaign delete: character ownership and all data are preserved');

-- realtime publication (issue #20, AC 17)
select is((select n from cap_n where label = 'characters_published'),          1::bigint, 'realtime: public.characters is in the supabase_realtime publication');
select is((select code from cap_e where label = 'characters_replica_identity'), 'd',      'realtime: characters uses default replica identity, not FULL');

select * from finish();
rollback;

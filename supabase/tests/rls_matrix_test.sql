-- RLS + concurrency test matrix for build step #3 (GitHub issue #18).
-- The most security-critical verification in the project: PLAN mandates this
-- SQL matrix pass *before* any editor UI is built. Run with `supabase test db`.
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

select plan(31);

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
--   gm2 owns camp2, camp3 and camp4.  playerC is a member of camp2 and camp3,
--   and deliberately NOT of camp4 — camp4 exists only to prove AC 30.
--   charC: owner C, in camp2.   charC2: owner C, in camp3.
-- ===========================================================================
insert into auth.users (id, email) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'gm2@test.local'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'c@test.local');

insert into public.campaigns (id, gm_id, name, invite_code) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp2', 'TESTLV01'),
  ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp3', 'TESTDEL1'),
  ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Camp4', 'TESTREL1');

-- C joins camp2 and camp3 only. camp4 gets no C membership on purpose.
insert into public.campaign_members (campaign_id, user_id, role) values
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'player'),
  ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'player');

insert into public.characters (id, owner_id, campaign_id, name) values
  ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
   'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', 'CharC'),
  ('a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6',
   'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
   'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'CharC2');

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

-- AC 25: leaveCampaign's two steps, in the server action's order — detach the
-- leaver's characters first, then drop the membership row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2"}';
-- Wrapped like every other RPC call in this file: if an upstream regression has
-- already moved charC (see the relocation case above), this must fail the
-- assertions below rather than abort the whole run with an unhandled PT409.
do $$ begin
  begin
    perform public.update_character('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 2,
      '{"campaign_id":null}'::jsonb);
    insert into cap_e values ('c_detach_charC', 'NOERROR');
  exception when others then
    insert into cap_e values ('c_detach_charC', sqlstate);
  end;
end $$;
delete from public.campaign_members
  where campaign_id = 'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'
    and user_id     = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
reset role;

insert into cap_n values ('charC_detached_after_leave',
  (select (campaign_id is null)::int::bigint from public.characters
    where id = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4'));

-- GM2's access is gone: the character is now invisible, and a write at the
-- CORRECT version (3) still fails — so this is revocation, not staleness.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"}';
insert into cap_n values ('gm2_reads_charC_after_leave',
  (select count(*) from public.characters
    where id = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4'));
do $$ begin
  begin
    perform public.update_character('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 3,
      '{"name":"hax"}'::jsonb);
    insert into cap_e values ('gm2_write_after_leave', 'NOERROR');
  exception when others then
    insert into cap_e values ('gm2_write_after_leave', sqlstate);
  end;
end $$;
reset role;

-- AC 26: deleting a campaign detaches its members' characters rather than
-- deleting them (characters.campaign_id is ON DELETE SET NULL, init.sql:54).
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

-- campaign lifecycle + owner-scoped campaign guard (GitHub issue #20)
select is((select n from cap_n where label = 'gm2_update_returns_version'),         2::bigint, 'update_character: GM write on a member''s character returns version 2');
select is((select code from cap_e where label = 'gm2_relocate_charC'),              'PT403',   'update_character: GM relocating a member''s character to a campaign the owner isn''t in → PT403');
select is((select n from cap_n where label = 'charC_campaign_after_reject'),        1::bigint, 'update_character: rejected relocation leaves campaign_id unchanged');
select is((select n from cap_n where label = 'charC_version_after_reject'),         2::bigint, 'update_character: rejected relocation leaves version unchanged');
select is((select code from cap_e where label = 'gm2_probe_charB'),                 'PT409',   'update_character: relocating an unreadable character → PT409, not PT403 (no membership oracle)');
select is((select n from cap_n where label = 'charC_detached_after_leave'),         1::bigint, 'leave: leaver''s character has campaign_id null');
select is((select n from cap_n where label = 'gm2_reads_charC_after_leave'),        0::bigint, 'leave: GM select returns zero rows for the leaver''s character');
select is((select code from cap_e where label = 'gm2_write_after_leave'),           'PT409',   'leave: GM write on the leaver''s character → PT409');
select is((select n from cap_n where label = 'charC2_survives_campaign_delete'),    1::bigint, 'campaign delete: member''s character still exists');
select is((select n from cap_n where label = 'charC2_detached_by_campaign_delete'), 1::bigint, 'campaign delete: member''s character has campaign_id null');

-- realtime publication (issue #20, AC 17)
select is((select n from cap_n where label = 'characters_published'),          1::bigint, 'realtime: public.characters is in the supabase_realtime publication');
select is((select code from cap_e where label = 'characters_replica_identity'), 'd',      'realtime: characters uses default replica identity, not FULL');

select * from finish();
rollback;

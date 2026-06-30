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

select plan(19);

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

select * from finish();
rollback;

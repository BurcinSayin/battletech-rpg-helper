-- Issue #65: character mech persistence (characters.mech jsonb + update_character).
-- Runs with `supabase test db` alongside rls_matrix_test.sql. Self-contained: all
-- fixtures are inserted here and the whole file rolls back.
--
-- Technique matches rls_matrix_test.sql: RPC/DML checks run as the `authenticated`
-- role with a per-actor JWT claim; results are captured into postgres-owned temp
-- tables, and assertions read those captures as the privileged role.

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions, pg_temp;

select plan(66);

-- ---------------------------------------------------------------------------
-- Schema / privilege checks (privileged role)
-- ---------------------------------------------------------------------------
select col_type_is('public', 'characters', 'mech', 'jsonb', 'characters.mech is jsonb');
select col_is_null('public', 'characters', 'mech', 'characters.mech is nullable (NULL = no mech)');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.characters'::regclass
      and conname = 'characters_mech_shape_check'
      and contype = 'c'
  ),
  'characters_mech_shape_check CHECK constraint exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.characters', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.characters', 'mech', 'UPDATE'),
  'authenticated has no UPDATE privilege on characters or characters.mech'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.update_character(uuid,integer,jsonb)'::regprocedure),
  'update_character remains SECURITY DEFINER'
);
select ok(
  exists (
    select 1 from pg_proc p, unnest(p.proconfig) cfg
    where p.oid = 'public.update_character(uuid,integer,jsonb)'::regprocedure
      and cfg = 'search_path=""'
  ),
  'update_character keeps SET search_path = empty'
);
select ok(
  has_function_privilege('authenticated', 'public.update_character(uuid,integer,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.update_character(uuid,integer,jsonb)', 'EXECUTE'),
  'update_character is executable by authenticated and not anon'
);

-- ---------------------------------------------------------------------------
-- Fixtures (privileged; bypasses RLS)
--   gm G owns campaign C (owner O is a member) and campaign C2 (O is NOT a member).
--   O owns cA (campaign-less, the mech subject) and cB (in C; G is its GM).
--   S is an unrelated stranger.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('51515151-5151-5151-5151-515151515151', 'mech-owner@test.local'),
  ('52525252-5252-5252-5252-525252525252', 'mech-gm@test.local'),
  ('53535353-5353-5353-5353-535353535353', 'mech-stranger@test.local');

insert into public.campaigns (id, gm_id, name, invite_code) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', '52525252-5252-5252-5252-525252525252', 'MechCamp', 'MECHTST1'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '52525252-5252-5252-5252-525252525252', 'MechCamp2', 'MECHTST2');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', '51515151-5151-5151-5151-515151515151', 'player');

insert into public.characters (id, owner_id, campaign_id, name) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '51515151-5151-5151-5151-515151515151', null,
   'MechOwnerNoCamp'),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', '51515151-5151-5151-5151-515151515151',
   'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'MechOwnerInCamp');

-- ---------------------------------------------------------------------------
-- Captures (postgres-owned: every write below happens after `reset role`)
-- ---------------------------------------------------------------------------
create temp table cases (
  seq      integer primary key,
  label    text not null,
  actor    uuid not null,
  char_id  uuid not null,
  expected integer,
  payload  jsonb,
  stmt     text
);
create temp table cap_e (label text primary key, code text);
create temp table snap (
  label       text primary key,
  mech        jsonb,
  version     integer,
  name        text,
  campaign_id uuid
);

-- Scenario rows. Actors: O = owner (51..), G = campaign GM (52..), S = stranger (53..).
-- cA = d1.. (owner O, no campaign). cB = d2.. (owner O, in C; G is GM of C).
-- Rows with `stmt` run as raw SQL as `authenticated`; others call update_character.
-- The base for oversize payloads is the JSON text overhead of {"blob": ""}.
insert into cases (seq, label, actor, char_id, expected, payload, stmt) values
  -- owner set / replace / omit / empty / clear (sequential versions 1..6)
  (1,  'a_set',        '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 1, '{"mech":{"model":"Atlas","tons":100}}', null),
  (2,  'b_replace',    '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 2, '{"mech":{"model":"Hunchback"}}', null),
  (3,  'c_omit',       '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 3, '{"name":"Renamed"}', null),
  (4,  'd_empty',      '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 4, '{"mech":{}}', null),
  (5,  'e_clear',      '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 5, '{"mech":null}', null),
  -- version conflict with a mech payload (current version is 6)
  (6,  'f_stale',      '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 5, '{"mech":{"model":"Stale"}}', null),
  -- stranger: row invisible to them, so update_character cannot write it
  (7,  'g_stranger',   '53535353-5353-5353-5353-535353535353', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6, '{"mech":{"model":"Hax"}}', null),
  -- campaign GM: allowed on a member's character in their campaign, refused otherwise
  (8,  'h_gm_member',  '52525252-5252-5252-5252-525252525252', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 1, '{"mech":{"model":"GM edit"}}', null),
  (9,  'i_gm_other',   '52525252-5252-5252-5252-525252525252', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6, '{"mech":{"model":"GM cA"}}', null),
  -- atomicity: PT403 (owner not in C2) must not write the mech in the same payload
  (10, 'j_pt403',      '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6, '{"campaign_id":"c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2","mech":{"model":"Leaked"}}', null),
  -- CHECK rejections through the RPC (all at version 6, nothing written)
  (11, 'k_string',     '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6, '{"mech":"not-an-object"}', null),
  (12, 'l_array',      '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6, '{"mech":[1,2]}', null),
  (13, 'm_number',     '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6, '{"mech":5}', null),
  (14, 'n_oversize',   '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6,
   jsonb_build_object('mech', jsonb_build_object('blob', repeat('x', 65537 - octet_length(jsonb_build_object('blob', '')::text)))), null),
  -- exact limit (65536 bytes of jsonb text) is accepted
  (15, 'o_boundary',   '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 6,
   jsonb_build_object('mech', jsonb_build_object('blob', repeat('x', 65536 - octet_length(jsonb_build_object('blob', '')::text)))), null),
  -- direct DML bypassing the RPC is denied (no UPDATE privilege)
  (16, 'p_direct_upd_owner', '51515151-5151-5151-5151-515151515151', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', null, null,
   $s$update public.characters set mech = '{"model":"Direct"}'::jsonb where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'$s$),
  (17, 'q_direct_upd_gm',    '52525252-5252-5252-5252-525252525252', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', null, null,
   $s$update public.characters set mech = '{"model":"Direct"}'::jsonb where id = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'$s$),
  -- direct INSERT: column is writable, but the same shape/size CHECK applies
  (18, 'r_insert_string',    '51515151-5151-5151-5151-515151515151', 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', null, null,
   $s$insert into public.characters (id, owner_id, name, mech) values ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', '51515151-5151-5151-5151-515151515151', 'DirectBad', '"str"'::jsonb)$s$),
  (19, 's_insert_object',    '51515151-5151-5151-5151-515151515151', 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', null, null,
   $s$insert into public.characters (id, owner_id, name, mech) values ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', '51515151-5151-5151-5151-515151515151', 'DirectOk', '{"model":"Direct"}'::jsonb)$s$),
  (20, 't_insert_oversize',  '51515151-5151-5151-5151-515151515151', 'd5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d5d5', null, null,
   $s$insert into public.characters (id, owner_id, name, mech) values ('d5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d5d5', '51515151-5151-5151-5151-515151515151', 'DirectBig', jsonb_build_object('blob', repeat('x', 65537 - octet_length(jsonb_build_object('blob', '')::text))))$s$),
  -- owner detaches cB and sets mech in one call (cB is at version 2 after h)
  (21, 'u_detach_with_mech', '51515151-5151-5151-5151-515151515151', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 2, '{"campaign_id":null,"mech":{"model":"Detached"}}', null);

do $$
declare
  r    record;
  code text;
begin
  for r in select * from cases order by seq loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.actor)::text, true);
    code := 'NOERROR';
    begin
      if r.stmt is null then
        perform public.update_character(r.char_id, r.expected, r.payload);
      else
        execute r.stmt;
      end if;
    exception when others then
      code := sqlstate;
    end;
    execute 'reset role';
    insert into cap_e values (r.label, code);
    insert into snap
      select r.label, c.mech, c.version, c.name, c.campaign_id
      from public.characters c where c.id = r.char_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Assertions (privileged role reads the captures)
-- ---------------------------------------------------------------------------

-- owner set / replace / omit / empty / clear
select is((select code from cap_e where label = 'a_set'), 'NOERROR', 'owner sets mech via update_character');
select is((select mech from snap where label = 'a_set'), '{"model":"Atlas","tons":100}'::jsonb, 'set: mech stored as the payload object');
select is((select version from snap where label = 'a_set'), 2, 'set: version increments exactly once');

select is((select code from cap_e where label = 'b_replace'), 'NOERROR', 'owner replaces mech via update_character');
select is((select mech from snap where label = 'b_replace'), '{"model":"Hunchback"}'::jsonb, 'replace: mech is replaced wholesale (old keys gone)');
select is((select version from snap where label = 'b_replace'), 3, 'replace: version increments exactly once');

select is((select code from cap_e where label = 'c_omit'), 'NOERROR', 'owner saves without a mech key');
select is((select mech from snap where label = 'c_omit'), '{"model":"Hunchback"}'::jsonb, 'omitted key: mech unchanged');
select is((select name from snap where label = 'c_omit'), 'Renamed', 'omitted key: other fields still update in the same call');
select is((select version from snap where label = 'c_omit'), 4, 'omitted key: version increments exactly once');

select is((select code from cap_e where label = 'd_empty'), 'NOERROR', 'owner sets an empty object mech');
select is((select mech from snap where label = 'd_empty'), '{}'::jsonb, 'empty object is stored as {} (not treated as null)');
select is((select version from snap where label = 'd_empty'), 5, 'empty object: version increments exactly once');

select is((select code from cap_e where label = 'e_clear'), 'NOERROR', 'owner clears mech with JSON null');
select is((select mech from snap where label = 'e_clear'), null::jsonb, 'JSON null clears mech to SQL NULL');
select is((select version from snap where label = 'e_clear'), 6, 'clear: version increments exactly once');

-- version conflict and forbidden writers do not write
select is((select code from cap_e where label = 'f_stale'), 'PT409', 'stale expected version with mech payload is PT409');
select is((select mech from snap where label = 'f_stale'), null::jsonb, 'stale mech write leaves mech unchanged');
select is((select version from snap where label = 'f_stale'), 6, 'stale mech write leaves version unchanged');

select is((select code from cap_e where label = 'g_stranger'), 'PT409', 'stranger mech write is PT409');
select is((select mech from snap where label = 'g_stranger'), null::jsonb, 'stranger mech write leaves mech unchanged');

-- campaign GM: existing semantics (member character in their campaign: allowed)
select is((select code from cap_e where label = 'h_gm_member'), 'NOERROR', 'campaign GM can set mech on a member character in their campaign');
select is((select mech from snap where label = 'h_gm_member'), '{"model":"GM edit"}'::jsonb, 'GM write stores mech on member character');
select is((select version from snap where label = 'h_gm_member'), 2, 'GM write increments version');

select is((select code from cap_e where label = 'i_gm_other'), 'PT409', 'GM cannot set mech on a campaign-less character they do not own');
select is((select mech from snap where label = 'i_gm_other'), null::jsonb, 'GM refusal leaves mech unchanged');

-- atomicity of PT403 with a mech payload
select is((select code from cap_e where label = 'j_pt403'), 'PT403', 'attach to a campaign the owner is not in is PT403 even with mech in payload');
select is((select mech from snap where label = 'j_pt403'), null::jsonb, 'PT403 leaves mech unchanged');
select is((select campaign_id from snap where label = 'j_pt403'), null::uuid, 'PT403 leaves campaign_id unchanged');
select is((select version from snap where label = 'j_pt403'), 6, 'PT403 leaves version unchanged');

-- shape/size CHECK through the RPC
select is((select code from cap_e where label = 'k_string'), '23514', 'non-object mech (string) is rejected by CHECK');
select is((select mech from snap where label = 'k_string'), null::jsonb, 'rejected string leaves mech unchanged');
select is((select version from snap where label = 'k_string'), 6, 'rejected string leaves version unchanged');
select is((select code from cap_e where label = 'l_array'), '23514', 'array mech is rejected by CHECK');
select is((select mech from snap where label = 'l_array'), null::jsonb, 'rejected array leaves mech unchanged');
select is((select version from snap where label = 'l_array'), 6, 'rejected array leaves version unchanged');
select is((select code from cap_e where label = 'm_number'), '23514', 'number mech is rejected by CHECK');
select is((select mech from snap where label = 'm_number'), null::jsonb, 'rejected number leaves mech unchanged');
select is((select version from snap where label = 'm_number'), 6, 'rejected number leaves version unchanged');
select is((select code from cap_e where label = 'n_oversize'), '23514', 'mech one byte over 65536 is rejected by CHECK');
select is((select mech from snap where label = 'n_oversize'), null::jsonb, 'rejected oversize leaves mech unchanged');
select is((select version from snap where label = 'n_oversize'), 6, 'rejected oversize leaves version unchanged');
select is((select code from cap_e where label = 'o_boundary'), 'NOERROR', 'mech exactly 65536 bytes is accepted');
select is((select octet_length(mech::text) from snap where label = 'o_boundary'), 65536, 'boundary mech is stored at exactly 65536 bytes');
select is((select version from snap where label = 'o_boundary'), 7, 'boundary write increments version');

-- direct DML
select is((select code from cap_e where label = 'p_direct_upd_owner'), '42501', 'owner direct UPDATE of mech is denied (no table privilege)');
select is((select octet_length(mech::text) from snap where label = 'p_direct_upd_owner'), 65536, 'denied direct UPDATE leaves mech unchanged');
select is((select code from cap_e where label = 'q_direct_upd_gm'), '42501', 'GM direct UPDATE of mech is denied (no table privilege)');
select is((select mech from snap where label = 'q_direct_upd_gm'), '{"model":"GM edit"}'::jsonb, 'denied GM direct UPDATE leaves mech unchanged');
select is((select code from cap_e where label = 'r_insert_string'), '23514', 'direct INSERT of non-object mech is rejected by CHECK');
select is((select count(*) from snap where label = 'r_insert_string'), 0::bigint, 'rejected direct INSERT creates no row');
select is((select code from cap_e where label = 's_insert_object'), 'NOERROR', 'direct INSERT of object mech is allowed (shape-checked)');
select is((select mech from snap where label = 's_insert_object'), '{"model":"Direct"}'::jsonb, 'direct INSERT stores the object mech');
select is((select code from cap_e where label = 't_insert_oversize'), '23514', 'direct INSERT of oversize mech is rejected by CHECK');
select is((select count(*) from snap where label = 't_insert_oversize'), 0::bigint, 'rejected oversize direct INSERT creates no row');

-- detach + mech in one call
select is((select code from cap_e where label = 'u_detach_with_mech'), 'NOERROR', 'owner detaches and sets mech in one update_character call');
select is((select campaign_id from snap where label = 'u_detach_with_mech'), null::uuid, 'combined call detaches the character');
select is((select mech from snap where label = 'u_detach_with_mech'), '{"model":"Detached"}'::jsonb, 'combined call stores mech');
select is((select version from snap where label = 'u_detach_with_mech'), 3, 'combined call increments version exactly once');

select * from finish();
rollback;

-- Issue #66: self-contained, authenticated trust-boundary tests. No persistent fixtures.
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions, pg_temp;
select no_plan();

select col_type_is('public','characters','mech_damage','jsonb','damage is a separate jsonb column');
select col_is_null('public','characters','mech_damage','damage is nullable');
select ok(not has_table_privilege('authenticated','public.characters','UPDATE')
  and not has_column_privilege('authenticated','public.characters','mech_damage','UPDATE'),
  'authenticated cannot directly UPDATE damage');
select ok((select prosecdef from pg_proc where oid = 'public.update_character_mech_damage(uuid,integer,jsonb)'::regprocedure),
  'damage RPC is SECURITY DEFINER');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.update_character_mech_damage(uuid,integer,jsonb)'::regprocedure),
  'damage RPC search_path is empty');
select ok((select provolatile = 'i' and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.mech_damage_is_valid(jsonb,jsonb)'::regprocedure),
  'validator is IMMUTABLE with empty search_path');
select ok(has_function_privilege('authenticated','public.update_character_mech_damage(uuid,integer,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.update_character_mech_damage(uuid,integer,jsonb)','EXECUTE'),
  'RPC is granted only to authenticated, not anon');
select ok(has_function_privilege('authenticated','public.mech_damage_is_valid(jsonb,jsonb)','EXECUTE'),
  'authenticated can execute validator for INSERT CHECK');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.characters'::regclass
  and conname = 'characters_mech_damage_check' and contype = 'c'), 'damage CHECK exists');

insert into auth.users(id,email) values
  ('61616161-6161-6161-6161-616161616161','damage-owner@test.local'),
  ('62626262-6262-6262-6262-626262626262','damage-gm@test.local'),
  ('63636363-6363-6363-6363-636363636363','damage-stranger@test.local');
insert into public.campaigns(id,gm_id,name,invite_code) values
  ('64646464-6464-6464-6464-646464646464','62626262-6262-6262-6262-626262626262','Damage campaign','DAMAGET1');
insert into public.campaign_members(campaign_id,user_id,role) values
  ('64646464-6464-6464-6464-646464646464','61616161-6161-6161-6161-616161616161','player');
create temp table fixture as select
  '{"model":"Base","armor":[{"location":"LA","value":10}],"criticalSlots":[{"location":"Odd","slots":["-Empty-","Laser"]}]}'::jsonb as mech,
  '{"armor":[{"index":0,"lost":4}],"structure":[{"index":0,"max":10,"lost":3}],"criticals":[{"section":0,"slot":0}],"heat":7,"pilotHits":2}'::jsonb as damage,
  '{"armor":[],"structure":[],"criticals":[],"heat":0,"pilotHits":2}'::jsonb as pilot_only,
  '{"armor":[],"structure":[],"criticals":[],"heat":0,"pilotHits":0}'::jsonb as empty_damage;
insert into public.characters(id,owner_id,campaign_id,name,mech)
select '65656565-6565-6565-6565-656565656565','61616161-6161-6161-6161-616161616161',
  '64646464-6464-6464-6464-646464646464','Damage subject',mech from fixture;

-- Execute actual DML/RPC under authenticated, capture only SQLSTATE, restore role.
create function pg_temp.actor_sql(actor uuid, stmt text) returns text language plpgsql as $$
declare code text := 'NOERROR';
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  begin execute stmt; exception when others then code := sqlstate; end;
  execute 'reset role';
  return code;
end $$;
create function pg_temp.damage_sql(damage jsonb, expected integer default null,
  actor uuid default '61616161-6161-6161-6161-616161616161',
  id uuid default '65656565-6565-6565-6565-656565656565') returns text language plpgsql as $$
begin
  return pg_temp.actor_sql(actor,format('select public.update_character_mech_damage(%L,%s,%L::jsonb)',
    id,coalesce(expected,(select version from public.characters where characters.id = damage_sql.id)),damage));
end $$;
create function pg_temp.base_sql(payload jsonb) returns text language plpgsql as $$
begin
  return pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
    format('select public.update_character(%L,%s,%L::jsonb)','65656565-6565-6565-6565-656565656565',
      (select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),payload));
end $$;

select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  $s$insert into public.characters(owner_id,name,mech_damage) values
  ('61616161-6161-6161-6161-616161616161','Direct null',null)$s$), 'NOERROR','authenticated INSERT with NULL damage succeeds');
select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  format('insert into public.characters(owner_id,name,mech,mech_damage) values (%L,%L,%L::jsonb,%L::jsonb)',
    '61616161-6161-6161-6161-616161616161','Direct valid',mech,damage)),
  'NOERROR','authenticated INSERT with valid damage succeeds') from fixture;
select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  $s$insert into public.characters(owner_id,name,mech_damage) values
  ('61616161-6161-6161-6161-616161616161','Direct invalid','{"heat":1}')$s$),
  '23514','authenticated INSERT invalid damage is rejected by CHECK');
select is((select count(*) from public.characters where name = 'Direct invalid'),0::bigint,'invalid INSERT creates no row');
select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  $s$update public.characters set mech_damage = null where id = '65656565-6565-6565-6565-656565656565'$s$),
  '42501','direct authenticated UPDATE denied');
select is(pg_temp.damage_sql(damage), 'NOERROR','owner applies damage') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'owner damage persisted') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),2,'damage write bumps version exactly once');
select is(pg_temp.damage_sql(damage,null,'62626262-6262-6262-6262-626262626262'),'NOERROR','campaign GM applies damage') from fixture;
select is(pg_temp.damage_sql(damage,null,'63636363-6363-6363-6363-636363636363'),'PT409','stranger gets opaque conflict') from fixture;
select is(pg_temp.damage_sql('{"extra":true}',null,'63636363-6363-6363-6363-636363636363'),'PT409','unauthorized object never reaches CHECK');
select is(pg_temp.damage_sql(damage,1),'PT409','stale version conflicts') from fixture;
select is(pg_temp.damage_sql(damage,1,'61616161-6161-6161-6161-616161616161','66666666-6666-6666-6666-666666666666'),'PT409','missing id conflicts') from fixture;
select is(pg_temp.actor_sql(null,$s$select public.update_character_mech_damage('65656565-6565-6565-6565-656565656565',3,null)$s$),'42501','missing JWT rejected');
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),3,'failed authorization/stale writes leave version unchanged');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'failed writes leave damage unchanged') from fixture;

create temp table invalid_cases(label text,damage jsonb);
insert into invalid_cases select 'extra root key',damage || '{"extra":0}' from fixture;
insert into invalid_cases select 'missing root key',damage - 'heat' from fixture;
insert into invalid_cases values ('string','"bad"'),('boolean','true'),('array','[]'),('number','1');
insert into invalid_cases select 'counter ' || v::text,jsonb_set(damage,'{heat}',v)
from fixture cross join (values ('"1"'::jsonb),('true'::jsonb),('1.5'::jsonb),('-1'::jsonb),('1000'::jsonb),('1e400'::jsonb),('null'::jsonb)) x(v);
insert into invalid_cases select 'pilot overflow',jsonb_set(damage,'{pilotHits}','1e400') from fixture;
insert into invalid_cases select 'array shape ' || field,jsonb_set(damage,array[field],'{}')
from fixture cross join unnest(array['armor','structure','criticals']) field;
insert into invalid_cases select label,jsonb_set(damage,array[field],v)
from fixture cross join (values
  ('extra armor key','armor','[{"index":0,"lost":1,"x":0}]'::jsonb),
  ('missing armor key','armor','[{"index":0}]'::jsonb),
  ('primitive armor','armor','[true]'::jsonb),
  ('duplicate armor','armor','[{"index":0,"lost":1},{"index":0,"lost":2}]'::jsonb),
  ('armor zero lost','armor','[{"index":0,"lost":0}]'::jsonb),
  ('armor exceeds value','armor','[{"index":0,"lost":11}]'::jsonb),
  ('armor index beyond array','armor','[{"index":1,"lost":1}]'::jsonb),
  ('armor huge index','armor','[{"index":1e400,"lost":1}]'::jsonb),
  ('armor fractional lost','armor','[{"index":0,"lost":1.5}]'::jsonb),
  ('extra structure key','structure','[{"index":0,"max":10,"lost":0,"x":0}]'::jsonb),
  ('missing structure key','structure','[{"index":0,"max":10}]'::jsonb),
  ('duplicate structure','structure','[{"index":0,"max":10,"lost":0},{"index":0,"max":10,"lost":0}]'::jsonb),
  ('structure lost exceeds max','structure','[{"index":0,"max":1,"lost":2}]'::jsonb),
  ('structure zero max','structure','[{"index":0,"max":0,"lost":0}]'::jsonb),
  ('structure index beyond array','structure','[{"index":1,"max":10,"lost":0}]'::jsonb),
  ('structure huge max','structure','[{"index":0,"max":1e400,"lost":0}]'::jsonb),
  ('extra critical key','criticals','[{"section":0,"slot":0,"x":0}]'::jsonb),
  ('missing critical key','criticals','[{"section":0}]'::jsonb),
  ('duplicate critical','criticals','[{"section":0,"slot":0},{"section":0,"slot":0}]'::jsonb),
  ('critical section beyond array','criticals','[{"section":1,"slot":0}]'::jsonb),
  ('critical slot beyond section','criticals','[{"section":0,"slot":2}]'::jsonb),
  ('critical huge slot','criticals','[{"section":0,"slot":1e400}]'::jsonb)
) x(label,field,v);
insert into invalid_cases select 'too many ' || field,jsonb_set(damage,array[field],
  (select jsonb_agg(damage->field->0 order by ord) from generate_series(1,case when field = 'criticals' then 257 else 17 end) ord))
from fixture cross join unnest(array['armor','structure','criticals']) field;
insert into invalid_cases select 'oversize',damage || jsonb_build_object('blob',repeat('x',16385)) from fixture;
select is(pg_temp.damage_sql(damage),'PT422','hostile input rejected safely: ' || label) from invalid_cases;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),3,'all invalid RPC calls are atomic');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'all invalid RPC calls preserve damage') from fixture;

-- Exercise the pure validator with raw mech shapes that cannot be stored by the mech CHECK.
select is(public.mech_damage_is_valid('{"armor":{},"criticalSlots":false}',damage),false,'non-array mech fields return false, never raise') from fixture;
select is(public.mech_damage_is_valid('[]',damage),false,'raw non-object mech returns false') from fixture;
select is(public.mech_damage_is_valid(null,pilot_only),true,'no mech accepts pilot-only damage') from fixture;
select is(public.mech_damage_is_valid(null,jsonb_set(empty_damage,'{heat}','1')),false,'no mech rejects heat') from fixture;
select is(public.mech_damage_is_valid('{}',empty_damage),true,'zero-track mech accepts empty damage') from fixture;
select is(public.mech_damage_is_valid('{"armor":[{"value":"10"}]}',jsonb_set(empty_damage,'{armor}','[{"index":0,"lost":1}]')),false,'armor value must be numeric') from fixture;
select is(public.mech_damage_is_valid('{"criticalSlots":[{"slots":{}}]}',jsonb_set(empty_damage,'{criticals}','[{"section":0,"slot":0}]')),false,'non-array slots return false') from fixture;
select is(public.mech_damage_is_valid(null,null),true,'SQL NULL damage is always valid');
select is(public.mech_damage_is_valid(null,'null'),false,'JSON null is not a stored object');

select is(pg_temp.base_sql('{"name":"Renamed","mech_damage":null}'),'NOERROR','full save omitting mech ignores supplied mech_damage');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'omitted mech preserves damage') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),4,'omitted mech save bumps once');
select is(pg_temp.base_sql('{"mech":{"criticalSlots":[{"slots":["-Empty-","Laser"],"location":"Odd"}],"armor":[{"value":10,"location":"LA"}],"model":"Base"}}'),
  'NOERROR','reordered identical mech saves');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'jsonb-equal mech preserves damage') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),5,'equal mech save bumps once');
select is(pg_temp.base_sql(jsonb_build_object('mech',mech || '{"model":"Changed"}')),'NOERROR','distinct mech edit saves') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),pilot_only,'edit clears damage, maxima, criticals and heat, preserving pilot') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),6,'distinct mech save bumps once');
select is(pg_temp.damage_sql(damage),'NOERROR','reapply damage before removal') from fixture;
select is(pg_temp.base_sql('{"mech":null}'),'NOERROR','mech removal saves');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),pilot_only,'removal preserves pilot and clears mech state') from fixture;
select is(pg_temp.damage_sql(jsonb_set(pilot_only,'{heat}','1')),'PT422','RPC rejects nonzero heat without mech') from fixture;
select is(pg_temp.base_sql(jsonb_build_object('mech',mech)),'NOERROR','mech addition saves') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),pilot_only,'addition preserves pilot') from fixture;
select is(pg_temp.damage_sql(jsonb_set(damage,'{pilotHits}','0')),'NOERROR','damage with zero pilot applies') from fixture;
select is(pg_temp.base_sql('{"mech":{}}'),'NOERROR','distinct replacement with zero pilot saves');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),null::jsonb,'reset with zero pilot becomes SQL NULL');
select is(pg_temp.damage_sql('null'),'NOERROR','RPC canonicalizes JSON null to SQL NULL');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),null::jsonb,'JSON null stored as SQL NULL');
select is(pg_temp.damage_sql(null),'NOERROR','RPC accepts SQL NULL');

-- Numeric integers with decimal scale are valid JSON numbers, not text integers.
select is(pg_temp.damage_sql(jsonb_set(pilot_only,'{pilotHits}','1.0')),'NOERROR','RPC accepts pilotHits 1.0') from fixture;
select is((select mech_damage->>'pilotHits' from public.characters where id = '65656565-6565-6565-6565-656565656565'),'1.0','RPC stores decimal-scale integer unchanged');
select is(pg_temp.base_sql('{"mech":{"model":"Decimal one"}}'),'NOERROR','distinct mech save after pilotHits 1.0 succeeds');
select is((select mech_damage->>'pilotHits' from public.characters where id = '65656565-6565-6565-6565-656565656565'),'1','reset retains pilotHits as numeric integer 1');
select is(pg_temp.damage_sql(jsonb_set(pilot_only,'{pilotHits}','2.00')),'NOERROR','RPC accepts pilotHits 2.00') from fixture;
select is((select mech_damage->>'pilotHits' from public.characters where id = '65656565-6565-6565-6565-656565656565'),'2.00','RPC stores two-decimal integer unchanged');
select is(pg_temp.base_sql('{"mech":{"model":"Decimal two"}}'),'NOERROR','distinct mech save after pilotHits 2.00 succeeds');
select is((select mech_damage->>'pilotHits' from public.characters where id = '65656565-6565-6565-6565-656565656565'),'2','reset retains pilotHits as numeric integer 2');
select is(pg_temp.damage_sql(jsonb_set(empty_damage,'{pilotHits}','0.00')),'NOERROR','RPC accepts pilotHits 0.00') from fixture;
select is(pg_temp.base_sql('{"mech":{"model":"Decimal zero"}}'),'NOERROR','distinct mech save after pilotHits 0.00 succeeds');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),null::jsonb,'decimal zero pilot resets to SQL NULL');

select * from finish();
rollback;

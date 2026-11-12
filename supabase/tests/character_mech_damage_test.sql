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
  '{"model":"Base","armor":[{"location":"LA","value":10}],"criticalSlots":[{"location":"Odd","slots":["-Empty-","Laser"]}],"weapons":[{"name":"Laser","location":"LA"},{"name":"Laser","location":"RA"}]}'::jsonb as mech,
  '{"armor":[{"index":0,"lost":4}],"structure":[{"index":0,"max":10,"lost":3}],"criticals":[{"section":0,"slot":0}],"heat":7,"pilotHits":2,"firedWeapons":[0]}'::jsonb as damage,
  '{"armor":[],"structure":[],"criticals":[],"heat":0,"pilotHits":2,"firedWeapons":[]}'::jsonb as pilot_only,
  '{"armor":[],"structure":[],"criticals":[],"heat":0,"pilotHits":0,"firedWeapons":[]}'::jsonb as empty_damage;
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
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'GM damage and firing locks persisted') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),3,'GM damage write bumps version exactly once');
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
insert into invalid_cases select 'fired missing key',damage - 'firedWeapons' from fixture;
insert into invalid_cases select 'fired ' || label,jsonb_set(damage,'{firedWeapons}',v)
from fixture cross join (values
  ('null array','null'::jsonb),
  ('object array','{}'::jsonb),
  ('string array','"0"'::jsonb),
  ('number array','0'::jsonb),
  ('boolean array','true'::jsonb),
  ('string entry','["0"]'::jsonb),
  ('boolean entry','[true]'::jsonb),
  ('null entry','[null]'::jsonb),
  ('object entry','[{}]'::jsonb),
  ('array entry','[[]]'::jsonb),
  ('negative index','[-1]'::jsonb),
  ('fractional index','[0.5]'::jsonb),
  ('duplicate index','[0,0]'::jsonb),
  ('decimal duplicate index','[0,0.0]'::jsonb),
  ('index beyond weapons','[2]'::jsonb),
  ('in-range index beyond weapons','[63]'::jsonb),
  ('index beyond limit','[64]'::jsonb),
  ('huge index','[1e400]'::jsonb),
  ('huge negative index','[-1e400]'::jsonb)
) x(label,v);
insert into invalid_cases select 'fired more than 64 entries',jsonb_set(damage,'{firedWeapons}',
  (select jsonb_agg(i order by i) from generate_series(0,64) i)) from fixture;
select is(pg_temp.damage_sql(damage),'PT422','hostile input rejected safely: ' || label) from invalid_cases;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),3,'all invalid RPC calls are atomic');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'all invalid RPC calls preserve damage') from fixture;
select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  format('insert into public.characters(owner_id,name,mech,mech_damage) values (%L,%L,%L::jsonb,%L::jsonb)',
    '61616161-6161-6161-6161-616161616161','Direct invalid ' || c.label,f.mech,c.damage)),
  '23514','authenticated INSERT rejects ' || c.label)
from invalid_cases c cross join fixture f where c.label like 'fired %';
select is((select count(*) from public.characters where name like 'Direct invalid fired %'),0::bigint,
  'invalid firing INSERTs create no rows');

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
select is(public.mech_damage_is_valid(raw.mech,empty_damage),true,
  'empty firing array accepted for raw mech: ' || raw.label)
from fixture cross join (values
  ('SQL null',null::jsonb),('JSON null','null'::jsonb),('array','[]'::jsonb),
  ('string','"bad"'::jsonb),('boolean','false'::jsonb),('number','1'::jsonb),
  ('missing weapons','{}'::jsonb),('null weapons','{"weapons":null}'::jsonb),
  ('object weapons','{"weapons":{}}'::jsonb),('boolean weapons','{"weapons":false}'::jsonb),
  ('empty weapons','{"weapons":[]}'::jsonb)
) raw(label,mech);
select is(public.mech_damage_is_valid(raw.mech,jsonb_set(empty_damage,'{firedWeapons}','[0]')),false,
  'nonempty firing array rejected safely for raw mech: ' || raw.label)
from fixture cross join (values
  ('SQL null',null::jsonb),('JSON null','null'::jsonb),('array','[]'::jsonb),
  ('string','"bad"'::jsonb),('boolean','false'::jsonb),('number','1'::jsonb),
  ('missing weapons','{}'::jsonb),('null weapons','{"weapons":null}'::jsonb),
  ('object weapons','{"weapons":{}}'::jsonb),('boolean weapons','{"weapons":false}'::jsonb),
  ('empty weapons','{"weapons":[]}'::jsonb)
) raw(label,mech);

select is(pg_temp.base_sql('{"name":"Renamed","mech_damage":null}'),'NOERROR','full save omitting mech ignores supplied mech_damage');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'omitted mech preserves damage and firing locks') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),4,'omitted mech save bumps once');
select is(pg_temp.base_sql('{"mech":{"weapons":[{"location":"LA","name":"Laser"},{"location":"RA","name":"Laser"}],"criticalSlots":[{"slots":["-Empty-","Laser"],"location":"Odd"}],"armor":[{"value":10,"location":"LA"}],"model":"Base"}}'),
  'NOERROR','reordered identical mech saves');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),damage,'jsonb-equal mech preserves damage and firing locks') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),5,'equal mech save bumps once');
select is(pg_temp.base_sql(jsonb_build_object('mech',mech || '{"model":"Changed"}')),'NOERROR','distinct mech edit saves') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),pilot_only,'edit clears damage, maxima, criticals, heat and firing locks, preserving pilot') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),6,'distinct mech save bumps once');
select is(pg_temp.damage_sql(damage),'NOERROR','reapply damage before removal') from fixture;
select is(pg_temp.base_sql('{"mech":null}'),'NOERROR','mech removal saves');
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),pilot_only,'removal preserves pilot and clears mech state and firing locks') from fixture;
create temp table before_no_mech_failure as
  select version,mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565';
select is(pg_temp.damage_sql(jsonb_set(pilot_only,'{heat}','1')),'PT422','RPC rejects nonzero heat without mech') from fixture;
select is(pg_temp.damage_sql(jsonb_set(pilot_only,'{firedWeapons}','[0]')),'PT422','RPC rejects firing locks without mech') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version,'no-mech rejected writes preserve version') from before_no_mech_failure;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  mech_damage,'no-mech rejected writes preserve pilot and empty firing state') from before_no_mech_failure;
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

-- Isolate successful firing writes after the fixed-version regression assertions.
select is(pg_temp.base_sql(jsonb_build_object('mech',mech)),'NOERROR','restore two-weapon mech for firing writes') from fixture;
create temp table before_firing_writes as
  select version from public.characters where id = '65656565-6565-6565-6565-656565656565';
select is(pg_temp.damage_sql(empty_damage),'NOERROR','RPC accepts empty firing array') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  empty_damage,'empty firing array is persisted') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version + 1,'empty firing write bumps version exactly once') from before_firing_writes;
select is(pg_temp.damage_sql(jsonb_set(damage,'{firedWeapons}','[1,0]')),'NOERROR','RPC accepts multiple independent firing indices') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  jsonb_set(damage,'{firedWeapons}','[1,0]'),'multiple firing indices and other damage persist unchanged') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version + 2,'multiple firing write bumps version exactly once') from before_firing_writes;
select is(pg_temp.damage_sql(jsonb_set(damage,'{firedWeapons}','[0.0,1.00]')),'NOERROR','RPC accepts decimal-scale firing integers') from fixture;
select is((select (mech_damage->'firedWeapons')::text from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  '[0.0, 1.00]','decimal-scale firing integers are stored unchanged');
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version + 3,'decimal firing write bumps version exactly once') from before_firing_writes;
select is(pg_temp.damage_sql(jsonb_set(empty_damage,'{firedWeapons}','[0]')),'NOERROR','RPC accepts fired-only zero-heat state') from fixture;
select is((select mech_damage from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  jsonb_set(empty_damage,'{firedWeapons}','[0]'),'fired-only state remains non-NULL') from fixture;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version + 4,'fired-only write bumps version exactly once') from before_firing_writes;

select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  format('insert into public.characters(owner_id,name,mech,mech_damage) values (%L,%L,%L::jsonb,%L::jsonb)',
    '61616161-6161-6161-6161-616161616161','Direct firing ' || x.label,mech,jsonb_set(empty_damage,'{firedWeapons}',x.indices))),
  'NOERROR','authenticated INSERT accepts firing ' || x.label)
from fixture cross join (values ('empty','[]'::jsonb),('multiple','[0,1]'::jsonb),('decimal','[0.0,1.00]'::jsonb)) x(label,indices);
select is((select mech_damage from public.characters where name = 'Direct firing ' || x.label),
  jsonb_set(empty_damage,'{firedWeapons}',x.indices),'direct INSERT persists firing ' || x.label)
from fixture cross join (values ('empty','[]'::jsonb),('multiple','[0,1]'::jsonb),('decimal','[0.0,1.00]'::jsonb)) x(label,indices);
select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  format('insert into public.characters(owner_id,name,mech_damage) values (%L,%L,%L::jsonb)',
    '61616161-6161-6161-6161-616161616161','Direct firing without mech',jsonb_set(empty_damage,'{firedWeapons}','[0]'))),
  '23514','authenticated INSERT rejects firing without mech') from fixture;
select is((select count(*) from public.characters where name = 'Direct firing without mech'),0::bigint,
  'firing INSERT without mech creates no row');

-- Exercise both global bounds and the maximum array length independently of the two-row fixture.
create temp table firing_limit_fixture as select
  jsonb_build_object('weapons',(select jsonb_agg(jsonb_build_object('name','Laser','location','LA')) from generate_series(1,64))) as mech,
  (select jsonb_agg(i order by i) from generate_series(0,63) i) as indices;
select is(public.mech_damage_is_valid(l.mech,jsonb_set(f.empty_damage,'{firedWeapons}','[0,63]')),true,
  'global boundary indices 0 and 63 are valid for 64 weapons') from fixture f cross join firing_limit_fixture l;
select is(public.mech_damage_is_valid(l.mech,jsonb_set(f.empty_damage,'{firedWeapons}',l.indices)),true,
  '64 unique firing indices are valid for 64 weapons') from fixture f cross join firing_limit_fixture l;
select is(public.mech_damage_is_valid(l.mech,jsonb_set(f.empty_damage,'{firedWeapons}',l.indices || '[0]')),false,
  '65 firing entries rejected with all indices within mech bounds') from fixture f cross join firing_limit_fixture l;
select is(public.mech_damage_is_valid(jsonb_set(l.mech,'{weapons}',(l.mech->'weapons') || '[{"name":"Laser","location":"LA"}]'),
  jsonb_set(f.empty_damage,'{firedWeapons}','[64]')),false,
  'index 64 rejected even when raw mech contains 65 weapons') from fixture f cross join firing_limit_fixture l;

-- Keep decimal padding in PostgreSQL: JavaScript number parsing erases this boundary.
create temp table damage_size_fixture as
with base as (select empty_damage - 'firedWeapons' as damage from fixture),
legacy as (
  select target_bytes,jsonb_set(damage,'{heat}',
    ('0.' || repeat('0',target_bytes - octet_length(damage::text) - 1))::jsonb) as damage
  from base cross join (values (16375),(16384),(16385)) targets(target_bytes)
)
select target_bytes,damage as legacy_damage,damage || '{"firedWeapons":[]}'::jsonb as damage from legacy;
select is(octet_length(legacy_damage::text),target_bytes,
  'legacy damage has exactly ' || target_bytes || ' bytes') from damage_size_fixture;
select is(octet_length(damage::text) - octet_length(legacy_damage::text),20,
  'empty firedWeapons adds exactly 20 bytes at legacy size ' || target_bytes) from damage_size_fixture;
select is(public.mech_damage_is_valid('{}',damage),target_bytes <= 16384,
  'valid-shape damage size boundary: ' || (target_bytes + 20) || ' bytes') from damage_size_fixture;

create temp table before_size_write as
  select version from public.characters where id = '65656565-6565-6565-6565-656565656565';
select is(pg_temp.damage_sql(damage),'NOERROR','RPC accepts exactly 16404 bytes')
from damage_size_fixture where target_bytes = 16384;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version + 1,'maximum-size RPC write bumps version exactly once') from before_size_write;
select is((select mech_damage::text from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  damage::text,'maximum-size RPC write preserves text including decimal scale')
from damage_size_fixture where target_bytes = 16384;
create temp table before_oversize_write as
  select version,mech_damage::text as damage_text from public.characters where id = '65656565-6565-6565-6565-656565656565';
select is(pg_temp.damage_sql(damage),'PT422','RPC rejects 16405 bytes with current version')
from damage_size_fixture where target_bytes = 16385;
select is((select version from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  version,'oversize RPC rejection preserves version') from before_oversize_write;
select is((select mech_damage::text from public.characters where id = '65656565-6565-6565-6565-656565656565'),
  damage_text,'oversize RPC rejection preserves stored text') from before_oversize_write;

select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  format('insert into public.characters(owner_id,name,mech,mech_damage) values (%L,%L,%L::jsonb,%L::jsonb)',
    '61616161-6161-6161-6161-616161616161','Direct size 16404','{}',damage)),
  'NOERROR','authenticated INSERT accepts exactly 16404 bytes')
from damage_size_fixture where target_bytes = 16384;
select is((select mech_damage::text from public.characters where name = 'Direct size 16404'),
  damage::text,'maximum-size INSERT preserves text including decimal scale')
from damage_size_fixture where target_bytes = 16384;
select is(pg_temp.actor_sql('61616161-6161-6161-6161-616161616161',
  format('insert into public.characters(owner_id,name,mech,mech_damage) values (%L,%L,%L::jsonb,%L::jsonb)',
    '61616161-6161-6161-6161-616161616161','Direct size 16405','{}',damage)),
  '23514','authenticated INSERT rejects 16405 bytes by CHECK')
from damage_size_fixture where target_bytes = 16385;
select is((select count(*) from public.characters where name = 'Direct size 16405'),0::bigint,
  'oversize INSERT creates no row');

select * from finish();
rollback;

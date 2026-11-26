begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions, pg_temp;
select no_plan();

\set owner '78000000-0000-0000-0000-000000000001'
\set gm '78000000-0000-0000-0000-000000000002'
\set stranger '78000000-0000-0000-0000-000000000003'
\set campaign '78000000-0000-0000-0000-000000000004'
\set subject '78000000-0000-0000-0000-000000000005'
\set missing '78000000-0000-0000-0000-000000000006'
\set saved '{"damage":3,"conditions":["Dazed","Limping","Dazed"]}'
insert into auth.users(id,email) values (:'owner','pc-owner@test.local'),
  (:'gm','pc-gm@test.local'), (:'stranger','pc-stranger@test.local');
insert into public.campaigns(id,gm_id,name,invite_code) values (:'campaign',:'gm','Combat campaign','COMBATT1');
insert into public.campaign_members(campaign_id,user_id,role) values (:'campaign',:'owner','player');
set local role authenticated;
select throws_ok(format('select public.update_character_personal_combat(%L,1,%L)', :'subject', :'saved'),
  '42501',null,'RPC rejects an authenticated role without a user identity');
select set_config('request.jwt.claim.sub', :'owner', true);
insert into public.characters(id,owner_id,campaign_id,name) values (:'subject',:'owner',:'campaign','Combat subject');
select is(personal_combat,'{"damage":0,"conditions":[]}'::jsonb,'omitted status defaults to empty')
from public.characters where id = :'subject';

select is(personal_combat, :'saved'::jsonb, 'owner without mech can store ordered duplicate labels')
from public.update_character_personal_combat(:'subject',1,:'saved');
select set_config('request.jwt.claim.sub', :'gm', true);
select is(version,3,'campaign GM removes one duplicate by position with a versioned save')
from public.update_character_personal_combat(:'subject',2,(:'saved'::jsonb #- '{conditions,0}'));
select set_config('request.jwt.claim.sub', :'stranger', true);
select throws_ok(format('select public.update_character_personal_combat(%L,3,%L)', :'subject', :'saved'),
  'PT409',null,'inaccessible character returns conflict');
select set_config('request.jwt.claim.sub', :'owner', true);
select throws_ok(format('select public.update_character_personal_combat(%L,2,%L)', :'subject', :'saved'),
  'PT409',null,'stale write returns conflict');
select throws_ok(format('select public.update_character_personal_combat(%L,3,%L)', :'missing', :'saved'),
  'PT409',null,'missing character returns conflict');
select throws_ok(format('update public.characters set personal_combat = %L where id = %L', :'saved', :'subject'),
  '42501',null,'owner cannot update status directly');
select ok(not has_table_privilege('anon','public.characters','UPDATE'),
  'anonymous role has no direct character UPDATE grant');
select ok(not has_function_privilege('anon','public.update_character_personal_combat(uuid,integer,jsonb)','execute'),
  'anonymous role cannot execute the RPC');

create temp table invalid_cases(label text, status jsonb);
insert into invalid_cases values ('SQL null',null),('JSON null','null'),('array','[]'),
  ('missing damage','{"conditions":[]}'),('missing conditions','{"damage":0}'),
  ('extra key','{"damage":0,"conditions":[],"extra":1}');
insert into invalid_cases select 'damage ' || d,jsonb_build_object('damage',d::jsonb,'conditions','[]'::jsonb)
from unnest(array['-1','1.5','1000','1e400','"3"','null']) d;
insert into invalid_cases select 'conditions ' || c,jsonb_build_object('damage',0,'conditions',c::jsonb)
from unnest(array['{}','null','[null]','[1]','[""]','["  "]','[" a"]','["a "]']) c;
insert into invalid_cases select 'label ' || description,jsonb_build_object('damage',0,'conditions',jsonb_build_array(label))
from (values ('control',E'a\tb'),('newline',E'a\nb'),('DEL',chr(127)),('line separator',chr(8232)),
  ('blank unicode',chr(160)),('too long',repeat('🩹',65))) v(description,label);
insert into invalid_cases values ('13 labels',jsonb_build_object('damage',0,'conditions',array_fill('a'::text,array[13])));
select throws_ok(format('select public.update_character_personal_combat(%L,3,%L::jsonb)', :'subject',status),
  'PT422',null,'invalid RPC rejects ' || label) from invalid_cases;
select throws_ok(format('insert into public.characters(owner_id,name,personal_combat) values (%L,%L,%L::jsonb)',
  :'owner','Bad insert',status),case when status is null then '23502' else '23514' end,null,
  'invalid INSERT rejects ' || label) from invalid_cases;
select is(version,3,'rejections preserve version') from public.characters where id = :'subject';
select is(personal_combat, :'saved'::jsonb #- '{conditions,0}', 'rejections preserve exact status')
from public.characters where id = :'subject';

select jsonb_build_object('damage',999,'conditions',array_fill(repeat('🩹',64),array[12])) as maximum \gset
select is(personal_combat, :'maximum'::jsonb, 'upper bounds accepted including 64 supplementary code points')
from public.update_character_personal_combat(:'subject',3,:'maximum');
select is(personal_combat, :'maximum'::jsonb,'sheet save preserves status')
from public.update_character(:'subject',4,'{"name":"Updated","personal_combat":null}');
select is(personal_combat, :'maximum'::jsonb,'attaching mech preserves status')
from public.update_character(:'subject',5,'{"mech":{"model":"Base"}}');
select is(personal_combat, :'maximum'::jsonb,'mech damage save preserves status')
from public.update_character_mech_damage(:'subject',6,'{"armor":[],"structure":[],"criticals":[],"heat":2,"pilotHits":1,"firedWeapons":[]}');
select is(personal_combat, :'maximum'::jsonb,'mech replacement and damage reset preserve status')
from public.update_character(:'subject',7,'{"mech":{"model":"Other"}}');
select is(personal_combat, :'maximum'::jsonb,'mech removal preserves status')
from public.update_character(:'subject',8,'{"mech":null}');

reset role;
select * from finish();
rollback;

-- EXECUTABLE REAL DATABASE TESTS, not run by the web/mock suites.
-- Only against an explicitly provisioned disposable Supabase database with
-- 0001 and reviewed 0004 applied. 0002/A06 is neither required nor permitted.
-- psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -v NIRMOL_F06_DISPOSABLE=1 -f supabase/tests/reporting.sql
\if :{?NIRMOL_F06_DISPOSABLE}
\if :NIRMOL_F06_DISPOSABLE
\else
\echo 'STOP: disposable target flag must be true/1.'
\quit 3
\endif
\else
\echo 'STOP: explicit disposable target flag is required.'
\quit 3
\endif
begin;
reset role;
select set_config('request.jwt.claims','{}',true);
create temp table f06_assertions(label text);
create temp table f06_fixture(key text primary key, value jsonb);
grant select,insert,update on pg_temp.f06_assertions,pg_temp.f06_fixture to anon,authenticated,service_role;
create function pg_temp.f06_ok(condition boolean,label text) returns void language plpgsql as $$ begin
 if condition is distinct from true then raise exception 'F06 assertion failed: %',label; end if;
 insert into pg_temp.f06_assertions values(label);
end $$;
create function pg_temp.f06_error(command text,expected_code text,label text) returns void language plpgsql as $$
declare code text;
begin
 begin execute command; exception when others then
   get stacked diagnostics code=returned_sqlstate;
   if code=expected_code then perform pg_temp.f06_ok(true,label); return; end if;
   raise exception 'Unexpected SQLSTATE % in %',code,label;
 end;
 raise exception 'Expected rejection in %',label;
end $$;
insert into auth.users(id,email) values
 ('a0000000-0000-4000-8000-000000000001','f06-a@example.invalid'),
 ('b0000000-0000-4000-8000-000000000002','f06-b@example.invalid'),
 ('c0000000-0000-4000-8000-000000000003','f06-moderator@example.invalid');
insert into public.profiles(user_id,is_moderator) values
 ('a0000000-0000-4000-8000-000000000001',false),('b0000000-0000-4000-8000-000000000002',false),('c0000000-0000-4000-8000-000000000003',true);
insert into pg_temp.f06_fixture values('payload',jsonb_build_object(
 'requestId','10000000-0000-4000-8000-000000000001','category','uncertain','description','Synthetic private description; never public',
 'observedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'incident',jsonb_build_object('lat',23.815923456,'lon',90.371084567,'source','manual',
   'confirmedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'capturedAt',null,'accuracyM',null,'consent',true),
 'imageId',null,'suggestionId',null,'categoryConfirmed',true,'publicConsent',true));

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
insert into pg_temp.f06_fixture select 'receipt',public.f06_submit(value) from pg_temp.f06_fixture where key='payload';
select pg_temp.f06_ok((select value->>'status'='submitted' from pg_temp.f06_fixture where key='receipt'),'A creates pending report');
select pg_temp.f06_ok(jsonb_array_length(public.f06_own_reports())=1,'A sees own pending report');
select pg_temp.f06_ok((public.f06_submit((select value from pg_temp.f06_fixture where key='payload')))->>'id'=(select value->>'id' from pg_temp.f06_fixture where key='receipt'),'retry returns same receipt');
select pg_temp.f06_error(format('select public.f06_submit(%L::jsonb)',(select jsonb_set(value,'{category}','"other"')::text from pg_temp.f06_fixture where key='payload')),'P0001','same key changed payload conflicts');
select pg_temp.f06_error('select location from public.pollution_reports','42501','raw exact coordinate column is not readable');
select pg_temp.f06_error('update public.pollution_reports set status=''approved''','42501','ordinary user cannot self-approve');
select pg_temp.f06_error('delete from public.pollution_reports','42501','ordinary raw delete blocked');
select pg_temp.f06_error('insert into public.report_reviews(report_id,reviewer,from_status,to_status) values(gen_random_uuid(),auth.uid(),''submitted'',''approved'')','42501','review metadata cannot be forged');
select pg_temp.f06_error('update public.profiles set is_moderator=true where user_id=auth.uid()','42501','ordinary user cannot promote own moderator flag');
select pg_temp.f06_error('select public.f06_moderation_queue()','42501','ordinary queue access rejected');
select pg_temp.f06_error('select public.f06_finish_image(gen_random_uuid(),auth.uid(),gen_random_uuid(),repeat(''a'',64),1,1,1)','42501','worker image finalization cannot be called by reporter');
select pg_temp.f06_error(format('select public.f06_submit(%L::jsonb)',(select jsonb_set(jsonb_set(value,'{requestId}',to_jsonb(gen_random_uuid()::text)),'{incident,lon}','91.2868')||jsonb_build_object('incident',value->'incident'||'{"lat":23.8315,"lon":91.2868}'::jsonb) from pg_temp.f06_fixture where key='payload')::text),'P0001','foreign territory inside old rectangle rejected by DB');
select pg_temp.f06_error(format('select public.f06_submit(%L::jsonb)',(select value||jsonb_build_object('requestId',gen_random_uuid(),'isModerator',true) from pg_temp.f06_fixture where key='payload')::text),'P0001','extra role fields rejected by DB');

select set_config('request.jwt.claims','{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f06_ok(jsonb_array_length(public.f06_own_reports())=0,'B cannot read A private history');
select pg_temp.f06_ok((select count(id)=0 from public.pollution_reports),'B raw allowed columns obey RLS');
select pg_temp.f06_error(format('select public.f06_withdraw(%L::uuid)',(select value->>'id' from pg_temp.f06_fixture where key='receipt')),'P0001','B cannot withdraw A report');
select pg_temp.f06_error('update public.pollution_reports set description=''changed''','42501','B cannot change A report');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.f06_error('select id from public.pollution_reports','42501','anon raw reports denied');
select pg_temp.f06_error('select public.f06_submit(''{}''::jsonb)','42501','anon cannot submit');
select pg_temp.f06_error('select * from public.public_reports','42501','inherited public view is no longer a raw bypass');
select pg_temp.f06_ok(jsonb_array_length(public.f06_public_reports())=0,'pending reports are not public');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f06_ok(jsonb_array_length(public.f06_moderation_queue())=1,'trusted DB moderator can read queue');
select public.f06_review((select (value->>'id')::uuid from pg_temp.f06_fixture where key='receipt'),'approve','Synthetic observation reviewed; not proof of causation',0);
select pg_temp.f06_error(format('select public.f06_review(%L::uuid,''approve'',''Another review attempt'',0)',(select value->>'id' from pg_temp.f06_fixture where key='receipt')),'P0001','stale moderation revision rejected');
reset role;
select pg_temp.f06_ok((select reviewer='c0000000-0000-4000-8000-000000000003'::uuid and from_status='submitted' and to_status='approved' from public.report_reviews where report_id=(select (value->>'id')::uuid from pg_temp.f06_fixture where key='receipt')),'reviewer, transition and time are database-owned');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
insert into pg_temp.f06_fixture values('public',public.f06_public_reports());
select pg_temp.f06_ok((select jsonb_array_length(value)=1 from pg_temp.f06_fixture where key='public'),'approved report is public');
select pg_temp.f06_ok((select (value->0)-array['id','category','observedDate','submittedDate','status','suspected','location']='{}'::jsonb from pg_temp.f06_fixture where key='public'),'public output strict allowlist');
select pg_temp.f06_ok((select value->0->'location'='{"lat":23.825,"lon":90.375,"cellDegrees":0.05}'::jsonb from pg_temp.f06_fixture where key='public'),'public cell centre, never exact incident point');
select pg_temp.f06_ok((select value::text not like '%Synthetic private%' and value::text not like '%23.815923456%' and value::text not like '%reporter%' from pg_temp.f06_fixture where key='public'),'description, precise location and reporter do not leak');

-- A broad existing Storage policy must not defeat restrictive bucket isolation.
reset role;
create policy f06_fixture_broad_storage on storage.objects for all to authenticated using(true) with check(true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f06_error('insert into storage.objects(bucket_id,name) values(''nirmol-report-images'',''unprocessed.html'')','42501','raw Storage insert denied even with broad permissive policy');
insert into pg_temp.f06_fixture values('image',public.f06_reserve_image('20000000-0000-4000-8000-000000000001',repeat('a',64),'30000000-0000-4000-8000-000000000001'));
select pg_temp.f06_error('select public.f06_reserve_image(''20000000-0000-4000-8000-000000000001'',repeat(''a'',64),gen_random_uuid())','P0001','concurrent photo lease blocks another processor');
select pg_temp.f06_error('select public.f06_access_image(''20000000-0000-4000-8000-000000000001'',true)','P0001','active photo processing cannot be removed by another attempt');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f06_error('select public.f06_access_image(''20000000-0000-4000-8000-000000000001'',false)','P0001','B cannot read A image handle');
select pg_temp.f06_error('select public.f06_access_image(''20000000-0000-4000-8000-000000000001'',true)','P0001','B cannot remove A image');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.f06_finish_image('20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',repeat('b',64),100,4,3);
reset role;
insert into storage.objects(bucket_id,name) select 'nirmol-report-images',value->>'path' from pg_temp.f06_fixture where key='image';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f06_ok((select count(*)=0 from storage.objects where bucket_id='nirmol-report-images'),'private Storage direct reads denied, even to reporter');
select pg_temp.f06_ok((public.f06_access_image('20000000-0000-4000-8000-000000000001',false))->>'state'='ready','A gets own processed image through guarded contract');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f06_error('select public.f06_access_image(''20000000-0000-4000-8000-000000000001'',false)','P0001','moderator cannot inspect an unattached draft photo');

-- Deleted accounts immediately lose public eligibility and queue private objects.
reset role;
delete from auth.users where id='a0000000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.f06_ok(jsonb_array_length(public.f06_public_reports())=0,'account deletion immediately removes public eligibility');
reset role;
select pg_temp.f06_ok((select state='deleting' and owner_id is null from nirmol_reporting.images where id='20000000-0000-4000-8000-000000000001'),'orphan retains cleanup tombstone without owner identity');
delete from auth.users where id='c0000000-0000-4000-8000-000000000003';
select pg_temp.f06_ok((select reviewer is null from public.report_reviews where report_id=(select (value->>'id')::uuid from pg_temp.f06_fixture where key='receipt')),'deleted moderator identity is redacted while audit transition remains');
select count(*) as assertions_passed from pg_temp.f06_assertions;
rollback;

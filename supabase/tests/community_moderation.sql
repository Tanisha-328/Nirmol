-- Real PostgreSQL checks. UNEXECUTED unless explicitly run on a disposable target.
-- Requires reviewed 0001 + 0004 + 0005, never bulk-apply 0002/A06.
\if :{?NIRMOL_F06_DISPOSABLE}
\if :NIRMOL_F06_DISPOSABLE
\else
\quit 3
\endif
\else
\echo 'STOP: explicit disposable target flag is required.'
\quit 3
\endif
begin;
reset role;
select set_config('request.jwt.claims','{}',true);
create temp table p03_fixture(key text primary key,value jsonb);
grant select,insert,update on pg_temp.p03_fixture to anon,authenticated;
create function pg_temp.p03_ok(condition boolean,label text) returns void language plpgsql as $$ begin
  if condition is distinct from true then raise exception 'P03 assertion failed: %',label; end if;
end $$;
create function pg_temp.p03_denied(command text,label text) returns void language plpgsql as $$ begin
  begin execute command; exception when insufficient_privilege then return; end;
  raise exception 'P03 authorization unexpectedly succeeded: %',label;
end $$;
insert into auth.users(id,email) values
 ('03030000-0000-4000-8000-000000000001','p03-a@example.invalid'),
 ('03030000-0000-4000-8000-000000000002','p03-b@example.invalid'),
 ('03030000-0000-4000-8000-000000000003','p03-reviewer@example.invalid');
insert into public.profiles(user_id,is_moderator) values
 ('03030000-0000-4000-8000-000000000001',false),('03030000-0000-4000-8000-000000000002',false),('03030000-0000-4000-8000-000000000003',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03030000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"user_metadata":{"is_moderator":true}}',true);
insert into pg_temp.p03_fixture values('report',public.f06_submit(jsonb_build_object(
 'requestId','03030000-0000-4000-8000-000000000010','category','uncertain','description','Synthetic private description',
 'observedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'incident',jsonb_build_object('lat',23.815923456,'lon',90.371084567,'source','manual',
 'confirmedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'capturedAt',null,'accuracyM',null,'consent',true),
 'imageId',null,'suggestionId',null,'categoryConfirmed',true,'publicConsent',true)));
select pg_temp.p03_denied('select public.f06_moderation_reports()','forged metadata grants no role');
select pg_temp.p03_denied(format('select public.f06_moderation_detail(%L)',(select value->>'id' from pg_temp.p03_fixture where key='report')),'owner has no moderator detail');
select pg_temp.p03_denied('update public.profiles set is_moderator=true where user_id=auth.uid()','self promotion');
select pg_temp.p03_denied('select nirmol_reporting.f06_incident_json(null::public.pollution_reports)','private helper not granted');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.p03_denied('select public.f06_moderation_reports()','anonymous queue');
select pg_temp.p03_ok(jsonb_array_length(public.f06_public_reports())=0,'pending is private');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03030000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',true);
select pg_temp.p03_ok(jsonb_array_length(public.f06_own_reports())=0,'cross-account owner list');
select pg_temp.p03_denied(format('select public.f06_moderation_detail(%L)',(select value->>'id' from pg_temp.p03_fixture where key='report')),'B has no detail');
select set_config('request.jwt.claims','{"sub":"03030000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',true);
insert into pg_temp.p03_fixture select 'detail',public.f06_moderation_detail((value->>'id')::uuid) from pg_temp.p03_fixture where key='report';
select pg_temp.p03_ok((select (value->'incident'->>'lat')::double precision=23.815923456 and value->>'canReview'='true' from pg_temp.p03_fixture where key='detail'),'moderator precise detail');
select pg_temp.p03_ok((select value-array['report','incident','suggestion','reviews','canReview']='{}'::jsonb from pg_temp.p03_fixture where key='detail'),'detail allowlist');
select pg_temp.p03_ok(jsonb_array_length(public.f06_moderation_reports('submitted','uncertain'))=1,'filtered queue');
select public.f06_review((select (value->>'id')::uuid from pg_temp.p03_fixture where key='report'),'approve','Synthetic incident reviewed for eligibility',0);
select pg_temp.p03_ok(jsonb_array_length(public.f06_moderation_reports('submitted'))=0,'decision leaves pending queue');
select pg_temp.p03_ok(jsonb_array_length(public.f06_moderation_reports('approved'))=1,'decision enters approved queue');
insert into pg_temp.p03_fixture select 'audit',public.f06_moderation_detail((value->>'id')::uuid) from pg_temp.p03_fixture where key='report';
select pg_temp.p03_ok((select value->'reviews'->0->>'reviewerId'='03030000-0000-4000-8000-000000000003' and value->'reviews'->0->>'from'='submitted' and value->'reviews'->0->>'to'='approved' from pg_temp.p03_fixture where key='audit'),'trusted reviewer and transition');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
insert into pg_temp.p03_fixture values('public',public.f06_public_reports());
select pg_temp.p03_ok((select jsonb_array_length(value)=1 and (value->0)-array['id','category','observedDate','submittedDate','status','location','suspected']='{}'::jsonb from pg_temp.p03_fixture where key='public'),'public allowlist');
select pg_temp.p03_ok((select value->0->'location'->>'lat'='23.825' from pg_temp.p03_fixture where key='public'),'public coarse centre');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03030000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select public.f06_withdraw((select (value->>'id')::uuid from pg_temp.p03_fixture where key='report'));
select pg_temp.p03_ok(jsonb_array_length(public.f06_public_reports())=0,'withdrawal unpublishes');
reset role;
update public.profiles set is_moderator=false where user_id='03030000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03030000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',true);
select pg_temp.p03_denied('select public.f06_moderation_reports()','revocation applies immediately');
rollback;

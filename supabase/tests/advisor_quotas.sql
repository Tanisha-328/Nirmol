-- Real SQL authorization/quota tests; NOT part of mock tests. Disposable only.
-- Requires reviewed 0006 (and existing Auth schemas); no A06 migration is needed.
\if :{?NIRMOL_F08_DISPOSABLE}
\if :NIRMOL_F08_DISPOSABLE
\else
\quit 3
\endif
\else
\echo 'STOP: explicit disposable target flag required.'
\quit 3
\endif
begin;
reset role;
select set_config('request.jwt.claims','{}',true);
create function pg_temp.f08_ok(condition boolean,label text) returns void language plpgsql as $$ begin
  if condition is distinct from true then raise exception 'F08 assertion failed: %',label; end if;
end $$;
create function pg_temp.f08_error(command text,expected text) returns void language plpgsql as $$
declare message text; begin
  begin execute command; exception when others then get stacked diagnostics message=message_text;
    if message=expected or (expected='permission' and sqlstate='42501') then return; end if;
    raise exception 'Unexpected failure type in disposable F08 check';
  end;
  raise exception 'F08 operation unexpectedly succeeded: %',expected;
end $$;
insert into auth.users(id,email) values ('04040000-0000-4000-8000-000000000001','f08-a@example.invalid'),('04040000-0000-4000-8000-000000000002','f08-b@example.invalid');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.f08_error('select public.f08_status()','permission');
select pg_temp.f08_error('select public.f08_guest_status(''g:''||repeat(''a'',64))','permission');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"04040000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f08_ok(public.f08_status()->>'remaining'='20','initial allowance');
select public.f08_reserve('04040000-0000-4000-8000-000000000010',repeat('a',64),'04040000-0000-4000-8000-000000000011');
select pg_temp.f08_ok(public.f08_status()->>'remaining'='19' and public.f08_status()->>'busy'='true','reservation consumes allowance and lease');
select pg_temp.f08_error('select public.f08_reserve(''04040000-0000-4000-8000-000000000012'',repeat(''a'',64),''04040000-0000-4000-8000-000000000013'')','advisor_busy');
select pg_temp.f08_error('select public.f08_finish(''04040000-0000-4000-8000-000000000011'')','permission');
select pg_temp.f08_error('select nirmol_advisor.status(''u:04040000-0000-4000-8000-000000000002'')','permission');
select pg_temp.f08_error('select * from nirmol_advisor.counts','permission');
select set_config('request.jwt.claims','{"sub":"04040000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"user_metadata":{"is_moderator":true}}',true);
select pg_temp.f08_ok(public.f08_status()->>'remaining'='20','B cannot read A usage');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.f08_finish('04040000-0000-4000-8000-000000000011');
select public.f08_guest_reserve('g:'||repeat('b',64),'04040000-0000-4000-8000-000000000014',repeat('c',64),'04040000-0000-4000-8000-000000000015');
select pg_temp.f08_ok(public.f08_guest_status('g:'||repeat('b',64))->>'remaining'='19','trusted guest ledger');
select public.f08_finish('04040000-0000-4000-8000-000000000015');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"04040000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f08_error('select public.f08_reserve(''04040000-0000-4000-8000-000000000010'',repeat(''a'',64),''04040000-0000-4000-8000-000000000016'')','attempt_spent');
select pg_temp.f08_error('select public.f08_reserve(''04040000-0000-4000-8000-000000000010'',repeat(''d'',64),''04040000-0000-4000-8000-000000000016'')','request_conflict');
reset role;
-- Set only synthetic actor counters to exercise day limits without expensive AI.
insert into nirmol_advisor.counts(actor,window_start,window_kind,used)
values('u:04040000-0000-4000-8000-000000000001',date_trunc('day',clock_timestamp() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka','day',20)
on conflict(actor,window_start,window_kind) do update set used=20;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"04040000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select pg_temp.f08_ok(public.f08_status()->>'remaining'='0','exact twenty ceiling');
select pg_temp.f08_error('select public.f08_reserve(''04040000-0000-4000-8000-000000000017'',repeat(''e'',64),''04040000-0000-4000-8000-000000000018'')','quota_exceeded');
select pg_temp.f08_ok(public.f08_status()->>'remaining'='0','failed extra attempt cannot increase allowance');
select pg_temp.f08_ok((public.f08_status()->>'resetAt')::timestamptz=(date_trunc('day',now() at time zone 'Asia/Dhaka')+interval '1 day') at time zone 'Asia/Dhaka','Dhaka midnight reset');
rollback;

-- DISPOSABLE DATABASE ONLY, after reviewing/applying the account table in 0003.
-- Never bulk-apply pending migrations: unverified A06 migration 0002 stays unapplied.
-- Never execute against production.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/account_settings.sql
-- All fixtures and writes roll back. Requires a Supabase-compatible auth schema/roles.
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'account-a@example.invalid'),
  ('b0000000-0000-0000-0000-000000000002', 'account-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}', true);
insert into public.account_settings (user_id, locations, default_location_id, revision) values (
  'a0000000-0000-0000-0000-000000000001',
  '[{"id":"10000000-0000-0000-0000-000000000001","name":"Dhaka","lat":23.7808,"lon":90.4067}]',
  '10000000-0000-0000-0000-000000000001', 42);
do $$
begin
  if (select revision from public.account_settings) <> 1 then raise exception 'insert revision not forced'; end if;
  begin
    update public.account_settings set locations = '[]';
    raise exception 'dangling default accepted';
  exception when check_violation then null; end;
  begin
    update public.account_settings set locations = '[{"id":"10000000-0000-0000-0000-000000000001","name":"Outside","lat":0,"lon":90}]';
    raise exception 'invalid coordinates accepted';
  exception when check_violation then null; end;
  begin
    update public.account_settings set locations = '[{"id":"10000000-0000-0000-0000-000000000001","name":"Health","lat":23,"lon":90,"symptoms":["cough"]}]';
    raise exception 'unexpected sensitive field accepted';
  exception when check_violation then null; end;
  begin
    update public.account_settings set locations = locations || locations;
    raise exception 'duplicate location IDs accepted';
  exception when check_violation then null; end;
  begin
    update public.account_settings set default_location_id = null,
      locations = (select jsonb_agg(jsonb_build_object(
        'id', '10000000-0000-0000-0000-' || lpad(n::text, 12, '0'),
        'name', 'Place ' || n::text, 'lat', 23, 'lon', 90)) from generate_series(1, 11) as n);
    raise exception 'eleventh location accepted';
  exception when check_violation then null; end;
  begin
    insert into public.account_settings (user_id) values ('b0000000-0000-0000-0000-000000000002');
    raise exception 'cross-owner insert accepted';
  exception when insufficient_privilege then null; end;
end;
$$;

update public.account_settings set language = 'en', revision = 400
  where user_id = 'a0000000-0000-0000-0000-000000000001' and revision = 1;
do $$
declare n integer;
begin
  if (select revision from public.account_settings) <> 2 then raise exception 'update revision not forced'; end if;
  update public.account_settings set language = 'bn'
    where user_id = 'a0000000-0000-0000-0000-000000000001' and revision = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'stale compare-and-swap overwrote row'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}', true);
do $$
declare n integer;
begin
  if exists (select 1 from public.account_settings) then raise exception 'cross-owner select exposed row'; end if;
  update public.account_settings set language = 'bn';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cross-owner update changed row'; end if;
  delete from public.account_settings;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cross-owner delete erased row'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
do $$ begin
  if exists (select 1 from public.account_settings) then raise exception 'anonymous identity read private settings'; end if;
end; $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}', true);
delete from public.account_settings where user_id = 'a0000000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.account_settings) then raise exception 'owner deletion failed'; end if;
end; $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.account_settings;
    raise exception 'anon table privileges exposed account data';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;

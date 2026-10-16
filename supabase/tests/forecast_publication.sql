-- DESTRUCTIVE TEST ENVIRONMENT ONLY: fresh nirmol_a06_test database in a
-- disposable cluster. No production/staging connection is permitted.
\set ON_ERROR_STOP on
select current_database() = 'nirmol_a06_test'
  and to_regclass('public.forecast_runs') is null
  and to_regclass('public.forecast_points') is null as fresh \gset
\if :fresh
\else
  \echo 'Refusing non-test or non-fresh database'
  \quit 3
\endif

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table public.forecast_runs (
  id bigint generated always as identity primary key,
  model text not null, area text not null, issued_at timestamptz not null default now(), metrics jsonb
);
create table public.forecast_points (
  run_id bigint not null references public.forecast_runs on delete cascade,
  valid_at timestamptz not null, pm25_ugm3 numeric(7,2) not null,
  pm25_low numeric(7,2), pm25_high numeric(7,2), top_factors jsonb,
  primary key (run_id, valid_at)
);
alter table public.forecast_runs enable row level security;
alter table public.forecast_points enable row level security;
create policy "public runs readable" on public.forecast_runs for select using (true);
create policy "public points readable" on public.forecast_points for select using (true);
grant usage on schema public to anon, authenticated, service_role;
grant select on public.forecast_runs, public.forecast_points to anon, authenticated;
grant select, insert on public.forecast_runs, public.forecast_points to service_role;
grant update on public.forecast_runs to service_role;
grant usage on sequence public.forecast_runs_id_seq to service_role;
insert into public.forecast_runs(model, area, issued_at, metrics)
  values ('legacy-other-model', 'another-area', '2020-01-01T00:00:00Z', '{"historical":true}');
insert into public.forecast_points(run_id, valid_at, pm25_ugm3, top_factors)
  values (1, '2020-01-01T00:00:00Z', 20, '{"original":"retained"}');
create table public.a06_original_history as
  select to_jsonb(r) as original_run, to_jsonb(p) as original_point
  from public.forecast_runs r join public.forecast_points p on p.run_id = r.id;

\ir ../migrations/0002_forecast_publication.sql

create function public.a06_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'A06 test failed: %', message; end if; end $$;
create function public.a06_fixture(shift_hours integer default 0) returns jsonb language sql set timezone = 'UTC' as $$
  select jsonb_build_object('model','nirmol-xgb-v1','area','dhaka','issued_at',statement_timestamp(),
    'forecast_start',date_trunc('hour',statement_timestamp()) + shift_hours * interval '1 hour',
    'metrics',jsonb_build_object('test_mae',1,'cams_test_mae',2,'interval_coverage',0.8,
      'trained_at',statement_timestamp()-interval '1 day'),
    'points',(select jsonb_agg(jsonb_build_object('valid_at',date_trunc('hour',statement_timestamp()) + (shift_hours+i)*interval '1 hour',
      'pm25_ugm3',40,'pm25_low',30,'pm25_high',50,
      'top_factors',jsonb_build_object('cams_pm25',25,'factors',jsonb_build_array(
        jsonb_build_object('feature','hour','value',i,'effect',0.1),
        jsonb_build_object('feature','cams_pm2_5','value',25,'effect',-0.2),
        jsonb_build_object('feature','temperature_2m','value',28,'effect',0.3)))) order by i)
      from generate_series(0,24) i))
$$;
create function public.a06_reject(p jsonb) returns void language plpgsql as $$
declare nr bigint; np bigint; rejected boolean := false;
begin
  select count(*) into nr from public.forecast_runs;
  select count(*) into np from public.forecast_points;
  begin perform public.publish_nirmol_forecast(p); exception when others then rejected := true; end;
  perform public.a06_assert(rejected, 'invalid publication accepted');
  perform public.a06_assert((select count(*)=nr from public.forecast_runs), 'failed publication left a run');
  perform public.a06_assert((select count(*)=np from public.forecast_points), 'failed publication left points');
end $$;
create function public.a06_injected_failure() returns trigger language plpgsql as $$
begin
  if current_setting('nirmol.a06_inject',true) = 'after_run'
     or (current_setting('nirmol.a06_inject',true) = 'during_points' and new.top_factors#>>'{factors,0,value}' = '5') then
    raise exception 'Controlled failure after run creation';
  end if;
  return new;
end $$;
create trigger a06_fail_points before insert on public.forecast_points for each row execute function public.a06_injected_failure();

begin;
set local timezone = 'UTC';
do $$
declare p jsonb; bad jsonb; response jsonb; replay jsonb; n integer; stamp text;
begin
  p := public.a06_fixture();
  -- Positive smoke first: rejection tests must not hide a broken RPC behind
  -- arbitrary SQL errors. Roll this smoke back so injection tests still insert.
  begin
    response := public.publish_nirmol_forecast(p);
    perform public.a06_assert((response->>'run_id')::bigint > 0, 'valid manifest smoke failed');
    raise exception 'Rollback positive smoke only' using errcode = 'Z0001';
  exception when sqlstate 'Z0001' then null;
  end;
  foreach n in array array[0,12,24,26] loop
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into bad
      from jsonb_array_elements((p->'points') || (p->'points')) with ordinality as a(value,ord) where ord <= n;
    perform public.a06_reject(jsonb_set(p,'{points}',bad));
  end loop;
  perform public.a06_reject(jsonb_set(p,'{points,5,valid_at}',p#>'{points,4,valid_at}'));
  perform public.a06_reject(jsonb_set(p,'{points,5,valid_at}',p#>'{points,6,valid_at}'));
  perform public.a06_reject(jsonb_set(p,'{points,0,run_id}','999'));
  perform public.a06_reject(jsonb_set(p,'{points,0,pm25_ugm3}','-0.01'));
  perform public.a06_reject(jsonb_set(p,'{points,0,pm25_ugm3}','2000.01'));
  perform public.a06_reject(jsonb_set(p,'{points,0,pm25_ugm3}','"40"'));
  perform public.a06_reject(jsonb_set(p,'{points,0,pm25_ugm3}','40.001'));
  perform public.a06_reject(jsonb_set(p,'{points,0,pm25_high}','null'));
  perform public.a06_reject(jsonb_set(p,'{points,0,top_factors,factors,0,effect}','"NaN"'));
  perform public.a06_reject(jsonb_set(p,'{points,0,top_factors,factors,1,feature}','"hour"'));
  perform public.a06_reject(jsonb_set(p,'{model}','"nirmol-unknown"'));
  perform public.a06_reject(jsonb_set(p,'{area}','"other"'));
  perform public.a06_reject(p - 'metrics');
  foreach stamp in array array['2026-10-17T24:00:00Z','2026-02-30T06:00:00Z','2026-10-17T06:00:00','infinity'] loop
    perform public.a06_reject(jsonb_set(p,'{issued_at}',to_jsonb(stamp)));
    perform public.a06_reject(jsonb_set(p,'{points,0,valid_at}',to_jsonb(stamp)));
  end loop;
  perform public.a06_reject(jsonb_set(p,'{issued_at}',to_jsonb(statement_timestamp()+interval '61 seconds')));
  perform public.a06_reject(jsonb_set(p,'{issued_at}',to_jsonb(statement_timestamp()-interval '4 hours')));
  perform set_config('nirmol.a06_inject','after_run',true);
  perform public.a06_reject(p);
  perform set_config('nirmol.a06_inject','during_points',true);
  perform public.a06_reject(p);
  perform set_config('nirmol.a06_inject','off',true);

  response := public.publish_nirmol_forecast(p);
  replay := public.publish_nirmol_forecast(p);
  perform public.a06_assert((response->>'replayed')::boolean = false and (replay->>'replayed')::boolean,
    'identical publication must acknowledge replay');
  perform public.a06_assert(response->'run_id' = replay->'run_id' and response->'published_at' = replay->'published_at', 'immutable replay changed identity/time');
  perform public.a06_assert((select count(*)=25 from public.forecast_points where run_id=(response->>'run_id')::bigint), 'wrong point count');
  perform public.a06_assert((select top_factors=p#>'{points,12,top_factors}' from public.forecast_points
    where run_id=(response->>'run_id')::bigint and valid_at=(p#>>'{points,12,valid_at}')::timestamptz), 'hourly SHAP provenance changed');
  perform public.a06_reject(jsonb_set(p,'{points,0,pm25_ugm3}','41'));
  perform public.a06_assert((select (to_jsonb(r)-array['forecast_start','published_at'])=h.original_run and to_jsonb(fp)=h.original_point
    from public.forecast_runs r join public.forecast_points fp on fp.run_id=r.id cross join public.a06_original_history h where r.id=1), 'historical rows changed');
  perform public.a06_assert(not has_function_privilege('anon','public.publish_nirmol_forecast(jsonb)','EXECUTE'), 'anon can publish');
  perform public.a06_assert(not has_function_privilege('authenticated','public.publish_nirmol_forecast(jsonb)','EXECUTE'), 'authenticated can publish');
  perform public.a06_assert(has_function_privilege('service_role','public.publish_nirmol_forecast(jsonb)','EXECUTE'), 'job cannot publish');
end $$;
set local role anon;
do $$ begin
  begin perform public.publish_nirmol_forecast(public.a06_fixture(1));
    raise exception 'Anonymous publication unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select public.publish_nirmol_forecast(public.a06_fixture(1));
reset role;
rollback;

select public.a06_assert((select count(*)=1 from public.forecast_runs), 'test rollback retained new runs');
select public.a06_assert((select count(*)=1 from public.forecast_points), 'test rollback retained new points');
\echo 'A06 SQL validation, rollback, replay, SHAP and role assertions completed'

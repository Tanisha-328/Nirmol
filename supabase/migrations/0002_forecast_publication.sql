-- LOCAL REVIEW ONLY. Apply only after catalog/grant verification and approval.
-- Additive: no historical backfill, deletion, policy replacement or role changes.
begin;

do $preflight$
declare
  relation text;
  privilege text;
  identity_sequence text;
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls)
     or not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Forecast migration requires verified Supabase access roles';
  end if;
  foreach relation in array array['public.forecast_runs', 'public.forecast_points'] loop
    if to_regclass(relation) is null then
      raise exception 'Forecast migration requires existing forecast tables';
    end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(relation)) then
      raise exception 'Forecast migration requires enabled forecast RLS';
    end if;
    foreach privilege in array array['SELECT', 'INSERT'] loop
      if not has_table_privilege('service_role', relation, privilege) then
        raise exception 'Forecast job table grants require operator verification';
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.forecast_runs', 'UPDATE') then
    raise exception 'Forecast replay row-lock privilege requires operator verification';
  end if;
  identity_sequence := pg_get_serial_sequence('public.forecast_runs', 'id');
  if identity_sequence is null or not has_sequence_privilege('service_role', identity_sequence, 'USAGE') then
    raise exception 'Forecast identity sequence grant requires operator verification';
  end if;
end
$preflight$;

alter table public.forecast_runs
  add column forecast_start timestamptz,
  add column published_at timestamptz,
  add constraint forecast_publication_metadata check (
    (forecast_start is null and published_at is null) or
    (forecast_start is not null and published_at is not null and
     isfinite(forecast_start) and isfinite(published_at) and isfinite(issued_at) and
     forecast_start = date_trunc('hour', forecast_start at time zone 'UTC') at time zone 'UTC')
  );

create unique index forecast_publication_identity
  on public.forecast_runs (model, area, forecast_start) where forecast_start is not null;
create index forecast_candidate_order on public.forecast_runs (model, area, issued_at desc, id desc);

create function public.publish_nirmol_forecast(payload jsonb) returns jsonb
language plpgsql volatile security invoker
set search_path = ''
set timezone = 'UTC'
set lock_timeout = '5s'
as $function$
declare
  issued timestamptz;
  first_hour timestamptz;
  trained timestamptz;
  clock_now timestamptz := clock_timestamp();
  timestamp_text text;
  iso_pattern constant text := '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$';
  point jsonb;
  factor jsonb;
  ordinal bigint;
  pm numeric;
  low_pm numeric;
  high_pm numeric;
  field text;
  candidate public.forecast_runs%rowtype;
  inserted boolean := false;
  canonical_points jsonb;
  stored_points jsonb;
  canonical_metrics jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object'
     or payload - array['model','area','issued_at','forecast_start','metrics','points'] <> '{}'::jsonb
     or payload->>'model' is distinct from 'nirmol-xgb-v1'
     or payload->>'area' is distinct from 'dhaka'
     or jsonb_typeof(payload->'points') is distinct from 'array'
     or jsonb_typeof(payload->'metrics') is distinct from 'object' then
    raise exception 'Invalid forecast publication manifest' using errcode = '22023';
  end if;
  if jsonb_array_length(payload->'points') <> 25
     or (payload->'metrics') - array['test_mae','cams_test_mae','interval_coverage','trained_at'] <> '{}'::jsonb then
    raise exception 'Forecast publication requires the complete original window' using errcode = '22023';
  end if;
  foreach timestamp_text in array array[payload->>'issued_at', payload->>'forecast_start', payload#>>'{metrics,trained_at}'] loop
    if timestamp_text is null or timestamp_text !~ iso_pattern then
      raise exception 'Explicit absolute publication timestamps required' using errcode = '22023';
    end if;
  end loop;
  -- Cast only after checking explicit zones and hours 00..23. PostgreSQL rejects
  -- impossible calendar dates; nonfinite values cannot match the ISO grammar.
  issued := (payload->>'issued_at')::timestamptz;
  first_hour := (payload->>'forecast_start')::timestamptz;
  trained := (payload#>>'{metrics,trained_at}')::timestamptz;
  if first_hour <> date_trunc('hour', first_hour) or trained > issued + interval '1 minute' then
    raise exception 'Invalid publication start or training timestamp' using errcode = '22023';
  end if;
  foreach field in array array['test_mae','cams_test_mae','interval_coverage'] loop
    if jsonb_typeof(payload->'metrics'->field) is distinct from 'number' then
      raise exception 'Numeric publication metrics required' using errcode = '22023';
    end if;
    if not (abs((payload->'metrics'->>field)::double precision) < 'Infinity'::double precision)
       or (payload->'metrics'->>field)::numeric < 0 then
      raise exception 'Invalid publication metrics' using errcode = '22023';
    end if;
  end loop;
  if (payload#>>'{metrics,interval_coverage}')::numeric > 1 then
    raise exception 'Invalid interval coverage' using errcode = '22023';
  end if;
  for point, ordinal in select value, ordinality from jsonb_array_elements(payload->'points') with ordinality loop
    if jsonb_typeof(point) is distinct from 'object'
       or point - array['valid_at','pm25_ugm3','pm25_low','pm25_high','top_factors'] <> '{}'::jsonb
       or point->>'valid_at' is null or point->>'valid_at' !~ iso_pattern then
      raise exception 'Invalid forecast publication point' using errcode = '22023';
    end if;
    if (point->>'valid_at')::timestamptz <> first_hour + (ordinal - 1) * interval '1 hour' then
      raise exception 'Forecast hours must exactly match the manifest' using errcode = '22023';
    end if;
    foreach field in array array['pm25_ugm3','pm25_low','pm25_high'] loop
      if jsonb_typeof(point->field) is distinct from 'number' then
        raise exception 'Numeric forecast concentrations required' using errcode = '22023';
      end if;
      pm := (point->>field)::numeric;
      if pm < 0 or pm > 2000 or pm <> round(pm, 2) then
        raise exception 'Invalid forecast concentration or storage precision' using errcode = '22023';
      end if;
    end loop;
    pm := (point->>'pm25_ugm3')::numeric;
    low_pm := (point->>'pm25_low')::numeric;
    high_pm := (point->>'pm25_high')::numeric;
    if low_pm > pm or pm > high_pm then
      raise exception 'Invalid forecast prediction range' using errcode = '22023';
    end if;
    if jsonb_typeof(point->'top_factors') is distinct from 'object'
       or (point->'top_factors') - array['factors','cams_pm25'] <> '{}'::jsonb
       or jsonb_typeof(point#>'{top_factors,cams_pm25}') is distinct from 'number'
       or jsonb_typeof(point#>'{top_factors,factors}') is distinct from 'array' then
      raise exception 'Missing forecast SHAP provenance' using errcode = '22023';
    end if;
    if (point#>>'{top_factors,cams_pm25}')::numeric < 0 or (point#>>'{top_factors,cams_pm25}')::numeric > 2000
       or jsonb_array_length(point#>'{top_factors,factors}') <> 3 then
      raise exception 'Invalid forecast SHAP provenance' using errcode = '22023';
    end if;
    for factor in select value from jsonb_array_elements(point#>'{top_factors,factors}') loop
      if jsonb_typeof(factor) is distinct from 'object'
         or factor - array['feature','value','effect'] <> '{}'::jsonb
         or jsonb_typeof(factor->'feature') is distinct from 'string'
         or factor->>'feature' !~ '^[a-z][a-z0-9_]{0,79}$'
         or jsonb_typeof(factor->'value') is distinct from 'number'
         or jsonb_typeof(factor->'effect') is distinct from 'number' then
        raise exception 'Invalid SHAP factor' using errcode = '22023';
      end if;
      if not (abs((factor->>'value')::double precision) < 'Infinity'::double precision)
         or not (abs((factor->>'effect')::double precision) < 'Infinity'::double precision) then
        raise exception 'Nonfinite SHAP factor' using errcode = '22023';
      end if;
    end loop;
    if (select count(distinct value->>'feature') from jsonb_array_elements(point#>'{top_factors,factors}')) <> 3 then
      raise exception 'Duplicate SHAP factors' using errcode = '22023';
    end if;
  end loop;
  canonical_metrics := jsonb_set(payload->'metrics', '{trained_at}', to_jsonb(trained));
  select jsonb_agg(jsonb_build_object('valid_at', (p->>'valid_at')::timestamptz,
    'pm25_ugm3', (p->>'pm25_ugm3')::numeric, 'pm25_low', (p->>'pm25_low')::numeric,
    'pm25_high', (p->>'pm25_high')::numeric, 'top_factors', p->'top_factors') order by ord)
    into canonical_points from jsonb_array_elements(payload->'points') with ordinality as pts(p, ord);

  -- Replay lookup precedes the freshness check: an old committed publication
  -- may be acknowledged, but never reinserted or refreshed after retention.
  select * into candidate from public.forecast_runs
    where model = 'nirmol-xgb-v1' and area = 'dhaka' and forecast_start = first_hour for update;
  if not found then
    if issued > clock_now + interval '1 minute' or clock_now - issued > interval '3 hours' then
      raise exception 'Forecast issuance is expired or future' using errcode = '22023';
    end if;
    insert into public.forecast_runs(model, area, issued_at, metrics, forecast_start, published_at)
      values ('nirmol-xgb-v1', 'dhaka', issued, canonical_metrics, first_hour, clock_now)
      on conflict (model, area, forecast_start) where forecast_start is not null do nothing
      returning * into candidate;
    inserted := found;
    if inserted then
      if candidate.id <= 0 or candidate.id > 9007199254740991 then
        raise exception 'Forecast identity exceeds the consumer contract' using errcode = '22023';
      end if;
      insert into public.forecast_points(run_id, valid_at, pm25_ugm3, pm25_low, pm25_high, top_factors)
        select candidate.id, (p->>'valid_at')::timestamptz, (p->>'pm25_ugm3')::numeric,
          (p->>'pm25_low')::numeric, (p->>'pm25_high')::numeric, p->'top_factors'
        from jsonb_array_elements(payload->'points') as pts(p);
    else
      -- A concurrent inserter won. This statement sees its committed row under
      -- READ COMMITTED; no overwrite or new issuance is allowed.
      select * into candidate from public.forecast_runs
        where model = 'nirmol-xgb-v1' and area = 'dhaka' and forecast_start = first_hour for update;
      if not found then
        raise exception 'Concurrent publication must be retried with the same payload' using errcode = '40001';
      end if;
    end if;
  end if;
  if not inserted then
    select jsonb_agg(jsonb_build_object('valid_at', valid_at, 'pm25_ugm3', pm25_ugm3,
      'pm25_low', pm25_low, 'pm25_high', pm25_high, 'top_factors', top_factors) order by valid_at)
      into stored_points from public.forecast_points where run_id = candidate.id;
    if candidate.published_at is null or candidate.issued_at <> issued
       or candidate.metrics is distinct from canonical_metrics or stored_points is distinct from canonical_points then
      raise exception 'Conflicting immutable forecast publication' using errcode = '23505';
    end if;
  end if;
  return jsonb_build_object('run_id', candidate.id, 'issued_at', candidate.issued_at,
    'forecast_start', candidate.forecast_start, 'published_at', candidate.published_at, 'replayed', not inserted);
end
$function$;

revoke all on function public.publish_nirmol_forecast(jsonb) from public, anon, authenticated;
grant execute on function public.publish_nirmol_forecast(jsonb) to service_role;
-- service_role remains a trusted, privileged writer. This RPC does not remove
-- its existing direct DML rights; the reader independently verifies every run.
notify pgrst, 'reload schema';
commit;

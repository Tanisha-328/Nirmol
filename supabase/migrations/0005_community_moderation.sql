-- Phase 03. Additive F06 review reads only. REVIEW LOCALLY; NOT APPLIED by the app.
-- Requires 0001 + 0004. Does not use/enable the A06 migration or publisher.
begin;

create index if not exists f06_moderation_order on public.pollution_reports(created_at,id)
  where f06_version=2 and deleted_at is null;

-- Keep the no-argument Phase 2 queue intact. All pages use keyset pagination.
create or replace function nirmol_reporting.f06_moderation_reports(
  p_status text default 'submitted',p_category text default null,p_after uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cursor_row public.pollution_reports;
begin
  perform nirmol_reporting.f06_user();
  if not nirmol_reporting.f06_is_moderator() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_status is null or p_status not in ('submitted','approved','rejected','all') or
    (p_category is not null and p_category not in ('waste_burning','construction_dust','vehicle_smoke','industrial_smoke','brick_kiln','other','uncertain')) then
    raise exception 'invalid_filter';
  end if;
  if p_after is not null then
    -- A cursor stays usable after a concurrent decision/withdrawal, but cannot
    -- reference legacy or deleted-account data. It reveals no cursor details.
    select * into cursor_row from public.pollution_reports where id=p_after and f06_version=2 and reporter is not null;
    if not found then raise exception 'invalid_filter'; end if;
  end if;
  return (select coalesce(jsonb_agg(nirmol_reporting.f06_own_json(r) order by r.created_at,r.id),'[]'::jsonb)
    from (select * from public.pollution_reports where f06_version=2 and deleted_at is null and reporter is not null
      and (p_status='all' or status::text=p_status) and (p_category is null or category::text=p_category)
      and (p_after is null or (created_at,id)>(cursor_row.created_at,cursor_row.id))
      order by created_at,id limit 50) r);
end $$;

-- Resolve the project's actual PostGIS schema without depending on search_path.
do $point$
declare extension_schema text;
begin
  select n.nspname into strict extension_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='postgis';
  execute format($sql$
    create or replace function nirmol_reporting.f06_incident_json(r public.pollution_reports) returns jsonb
    language sql stable security invoker set search_path='' as $body$
    select jsonb_build_object('lat',%1$I.st_y(r.location::%1$I.geometry),'lon',%1$I.st_x(r.location::%1$I.geometry),
      'source',r.location_source,'confirmedAt',to_char(r.location_confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'capturedAt',to_char(r.location_captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'accuracyM',r.location_accuracy_m)
    $body$
  $sql$,extension_schema);
end $point$;

create or replace function nirmol_reporting.f06_moderation_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=nirmol_reporting.f06_user(); r public.pollution_reports; audit jsonb; suggestion jsonb;
begin
  if not nirmol_reporting.f06_is_moderator() then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from public.pollution_reports where id=p_id and f06_version=2 and deleted_at is null and reporter is not null;
  if not found then raise exception 'not_found'; end if;
  -- These immutable enum snapshots survive classification retention. Provider
  -- prose/prompts, reporter identity and photo object paths are never returned.
  if r.ai_category is not null and r.ai_evidence in ('visible_smoke','visible_dust','ambiguous','no_clear_source','image_unusable') then
    suggestion:=jsonb_build_object('category',r.ai_category,'evidence',r.ai_evidence,
      'uncertainty',case when r.ai_category::text='uncertain' then 'uncertain' else 'suggestion' end);
  end if;
  select coalesce(jsonb_agg(a.row order by a.created_at,a.id),'[]'::jsonb) into audit from
    (select id,created_at,jsonb_build_object('id',id::text,'reviewerId',reviewer,'from',from_status,'to',to_status,
      'reason',coalesce(note,''),'reviewedAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as row
      from public.report_reviews where report_id=r.id order by created_at,id limit 50) a;
  return jsonb_build_object('report',nirmol_reporting.f06_own_json(r),'incident',nirmol_reporting.f06_incident_json(r),
    'suggestion',suggestion,'reviews',audit,'canReview',r.reporter<>u and r.status in ('submitted','approved'));
end $$;

create or replace function public.f06_moderation_reports(p_status text default 'submitted',p_category text default null,p_after uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select nirmol_reporting.f06_moderation_reports(p_status,p_category,p_after)
$$;
create or replace function public.f06_moderation_detail(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select nirmol_reporting.f06_moderation_detail(p_id) $$;

revoke all on function nirmol_reporting.f06_incident_json(public.pollution_reports) from public,anon,authenticated,service_role;
revoke all on function nirmol_reporting.f06_moderation_reports(text,text,uuid),nirmol_reporting.f06_moderation_detail(uuid),
  public.f06_moderation_reports(text,text,uuid),public.f06_moderation_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function nirmol_reporting.f06_moderation_reports(text,text,uuid),nirmol_reporting.f06_moderation_detail(uuid),
  public.f06_moderation_reports(text,text,uuid),public.f06_moderation_detail(uuid) to authenticated;

commit;

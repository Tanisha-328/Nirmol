"""Refresh only generated F06 SQL sections from the pinned Phase 1 geometry.
No database/network access. Run from the repository root after reviewed changes.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "web/src/lib/data/bangladesh.ts").read_text(encoding="utf-8")
coordinates = json.loads(re.search(r"= (\[.*\]);", source, re.S).group(1))
geometry = json.dumps({"type": "MultiPolygon", "coordinates": coordinates}, separators=(",", ":"))
target = ROOT / "supabase/migrations/0004_reporting.sql"
text = target.read_text(encoding="utf-8")

country = """-- BEGIN PINNED F06 GEOMETRY
-- geoBoundaries BGD-ADM0-71232402, CC0, same unsimplified coordinates as Phase 1.
-- Country approximation, not a cadastral/legal border guarantee.
do $country$
declare extension_schema text;
begin
 select n.nspname into extension_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='postgis';
 if extension_schema is null then raise exception 'F06 requires reviewed existing PostGIS'; end if;
 execute format($sql$
 create or replace function nirmol_reporting.f06_in_bangladesh(lat double precision,lon double precision) returns boolean
 language sql immutable set search_path='' as $body$
 select coalesce(lat between 20.5 and 26.7 and lon between 88 and 92.7 and
 %1$I.st_covers(%1$I.st_setsrid(%1$I.st_geomfromgeojson(%2$L),4326),%1$I.st_setsrid(%1$I.st_makepoint(lon,lat),4326)),false)
 $body$ $sql$,extension_schema,'GEOMETRY');
 execute format($sql$
 create or replace function nirmol_reporting.f06_point(lat double precision,lon double precision) returns %1$I.geography
 language sql immutable strict set search_path='' as $body$ select %1$I.st_setsrid(%1$I.st_makepoint(lon,lat),4326)::%1$I.geography $body$
 $sql$,extension_schema);
 execute format($sql$
 create or replace function nirmol_reporting.f06_report_guard() returns trigger
 language plpgsql security definer set search_path='' as $body$
 declare lat double precision; lon double precision;
 begin
   if new.f06_version=2 and new.deleted_at is null then
     lat:=%1$I.st_y(new.location::%1$I.geometry);lon:=%1$I.st_x(new.location::%1$I.geometry);
     if new.location is null or not nirmol_reporting.f06_in_bangladesh(lat,lon) then raise exception 'unsupported_location'; end if;
     new.public_location:=nirmol_reporting.f06_point((floor(lat*20)+0.5)/20,(floor(lon*20)+0.5)/20);
   end if;
   return new;
 end $body$ $sql$,extension_schema);
end $country$;
drop trigger if exists f06_report_location on public.pollution_reports;
create trigger f06_report_location before insert or update of location,public_location on public.pollution_reports for each row execute function nirmol_reporting.f06_report_guard();
-- END PINNED F06 GEOMETRY""".replace("'GEOMETRY'", "'" + geometry.replace("'", "''") + "'")

public_json = """-- BEGIN F06 PUBLIC JSON
do $projection$
declare extension_schema text;
begin
 select n.nspname into extension_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='postgis';
 execute format($sql$
 create or replace function nirmol_reporting.f06_public_json(r public.pollution_reports) returns jsonb
 language sql stable security invoker set search_path='' as $body$
 select jsonb_build_object('id',r.id,'category',r.category,'observedDate',(r.observed_at at time zone 'Asia/Dhaka')::date,
   'submittedDate',(r.created_at at time zone 'Asia/Dhaka')::date,'status',r.status,'suspected',true,
   'location',jsonb_build_object('lat',%1$I.st_y(r.public_location::%1$I.geometry),'lon',%1$I.st_x(r.public_location::%1$I.geometry),'cellDegrees',0.05))
 $body$ $sql$,extension_schema);
end $projection$;
-- END F06 PUBLIC JSON"""

# Public-schema wrappers are invokers; all privileged code lives in an unexposed
# schema and performs its own identity/role checks before selecting private rows.
functions = [
 ("reserve_image", "p_id uuid,p_raw_digest text,p_lease uuid", "jsonb", "authenticated"),
 ("finish_image", "p_id uuid,p_owner uuid,p_lease uuid,p_digest text,p_size integer,p_width integer,p_height integer", "jsonb", "service_role"),
 ("fail_image", "p_id uuid,p_owner uuid,p_lease uuid", "jsonb", "service_role"),
 ("access_image", "p_id uuid,p_delete boolean default false", "jsonb", "authenticated"),
 ("deleted_image", "p_id uuid,p_path text", "void", "service_role"),
 ("reserve_classification", "p_id uuid,p_image uuid,p_digest text", "jsonb", "authenticated"),
 ("finish_classification", "p_id uuid,p_owner uuid,p_result jsonb", "void", "service_role"),
 ("submit", "payload jsonb", "jsonb", "authenticated"),
 ("own_reports", "p_id uuid default null,p_after uuid default null", "jsonb", "authenticated"),
 ("withdraw", "p_id uuid", "jsonb", "authenticated"),
 ("public_reports", "p_id uuid default null,p_category text default null,p_after uuid default null,p_from date default null,p_to date default null,p_limit integer default 50", "jsonb", "anon,authenticated"),
 ("moderation_queue", "", "jsonb", "authenticated"),
 ("review", "p_id uuid,p_decision text,p_reason text,p_revision integer", "jsonb", "authenticated"),
 ("cleanup", "p_limit integer default 50", "jsonb", "service_role"),
]
wrappers = ["-- BEGIN F06 RPC WRAPPERS", "revoke all on all functions in schema nirmol_reporting from public,anon,authenticated,service_role;"]
for name, signature, returns, roles in functions:
    args = [part.strip().split() for part in signature.split(",") if part.strip()]
    types = ",".join(part[1] for part in args)
    values = ",".join(part[0] for part in args)
    name = "f06_" + name
    wrappers.extend([
        f"create or replace function public.{name}({signature}) returns {returns}",
        f"language sql security invoker set search_path='' as $rpc$ select nirmol_reporting.{name}({values}) $rpc$;",
        f"revoke all on function public.{name}({types}) from public,anon,authenticated,service_role;",
        f"grant execute on function public.{name}({types}),nirmol_reporting.{name}({types}) to {roles};",
    ])
wrappers.extend([
    "revoke all on function public.is_moderator() from public,anon,authenticated;",
    "grant execute on function public.is_moderator(),nirmol_reporting.f06_is_moderator() to authenticated,service_role;",
    "-- END F06 RPC WRAPPERS",
])
for marker, label, content in [
    ("-- F06_COUNTRY_FUNCTION", "PINNED F06 GEOMETRY", country),
    ("-- F06_PUBLIC_JSON_FUNCTION", "F06 PUBLIC JSON", public_json),
    ("-- F06_RPC_WRAPPERS_AND_GRANTS", "F06 RPC WRAPPERS", "\n".join(wrappers)),
]:
    if marker in text:
        text = text.replace(marker, content)
    else:
        text, count = re.subn(r"-- BEGIN " + label + r"\n.*?-- END " + label, lambda _: content, text, flags=re.S)
        if count != 1:
            raise RuntimeError("Missing/duplicate generated section: " + label)
target.write_text(text, encoding="utf-8")
print("Refreshed F06 geometry/projection/wrappers; no database or network accessed.")

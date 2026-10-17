-- Additive, unapplied account convenience storage. No diary/health/report/model fields.
-- Verify against a disposable Supabase-compatible database before deployment.
-- One owner row bounds locations atomically, including concurrent edits.
create function public.valid_account_locations(locations jsonb, default_id uuid)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  item jsonb;
  item_id text;
  ids text[] := array[]::text[];
  location_name text;
begin
  if locations is null or jsonb_typeof(locations) is distinct from 'array'
     or jsonb_array_length(locations) > 10 then return false; end if;
  for item in select value from jsonb_array_elements(locations) loop
    if jsonb_typeof(item) is distinct from 'object'
       or not (item ?& array['id', 'name', 'lat', 'lon'])
       or item - array['id', 'name', 'lat', 'lon'] <> '{}'::jsonb
       or jsonb_typeof(item->'id') is distinct from 'string'
       or jsonb_typeof(item->'name') is distinct from 'string'
       or jsonb_typeof(item->'lat') is distinct from 'number'
       or jsonb_typeof(item->'lon') is distinct from 'number' then return false; end if;
    item_id := item->>'id';
    location_name := item->>'name';
    if item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or item_id = any(ids)
       or char_length(location_name) not between 1 and 80
       or location_name <> btrim(location_name)
       or location_name ~ '[[:cntrl:]]'
       or (item->>'lat')::numeric not between 20.5 and 26.7
       or (item->>'lon')::numeric not between 88.0 and 92.7 then return false; end if;
    ids := array_append(ids, item_id);
  end loop;
  return default_id is null or default_id::text = any(ids);
exception when others then
  -- Bad JSON/numeric shapes must fail the check rather than bypass validation.
  return false;
end;
$$;
revoke all on function public.valid_account_locations(jsonb, uuid) from public, anon;
grant execute on function public.valid_account_locations(jsonb, uuid) to authenticated;

create table public.account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'bn' check (language in ('bn', 'en')),
  locations jsonb not null default '[]'::jsonb,
  default_location_id uuid,
  revision integer not null default 1 check (revision between 1 and 2147483646),
  updated_at timestamptz not null default now(),
  constraint valid_saved_locations check (public.valid_account_locations(locations, default_location_id))
);

create function public.advance_account_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
  else
    NEW.revision := OLD.revision + 1;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function public.advance_account_revision() from public, anon, authenticated;
create trigger account_revision before insert or update on public.account_settings
  for each row execute function public.advance_account_revision();

alter table public.account_settings enable row level security;
alter table public.account_settings force row level security;
revoke all on public.account_settings from public, anon, authenticated;
grant select, insert, update, delete on public.account_settings to authenticated;
create policy "account owner only" on public.account_settings for all to authenticated
  using (user_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true')
  with check (user_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');

comment on table public.account_settings is
  'Owner-only non-sensitive preferences and up to ten saved locations; no diary or alert synchronization.';

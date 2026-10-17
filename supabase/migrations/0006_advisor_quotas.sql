-- F08 atomic cost/parallelism control only. No transcripts, prompts, locations or answers.
-- Authenticated wrappers derive auth.uid(); guest/finish wrappers require service_role.
-- REVIEW ONLY: not applied by the application or local tests. A06 is unrelated.
begin;
create schema if not exists nirmol_advisor;
revoke all on schema nirmol_advisor from public,anon,authenticated;
grant usage on schema nirmol_advisor to authenticated,service_role;
create table if not exists nirmol_advisor.counts (
  actor text not null, window_start timestamptz not null, window_kind text not null check(window_kind in ('day','minute')),
  used integer not null check(used>=0), primary key(actor,window_start,window_kind)
);
create table if not exists nirmol_advisor.attempts (
  actor text not null, request_id uuid not null, digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  lease uuid not null unique, expires_at timestamptz not null, state text not null check(state in ('running','finished')),
  created_at timestamptz not null default clock_timestamp(), primary key(actor,request_id)
);
alter table nirmol_advisor.counts enable row level security;
alter table nirmol_advisor.counts force row level security;
alter table nirmol_advisor.attempts enable row level security;
alter table nirmol_advisor.attempts force row level security;
revoke all on all tables in schema nirmol_advisor from public,anon,authenticated,service_role;
create index if not exists f08_running on nirmol_advisor.attempts(expires_at) where state='running';

create or replace function nirmol_advisor.actor() returns text
language plpgsql stable security definer set search_path='' as $$ begin
  if auth.uid() is null or auth.role()<>'authenticated' or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  return 'u:'||auth.uid()::text;
end $$;
create or replace function nirmol_advisor.guest(p_actor text) returns text
language plpgsql stable security definer set search_path='' as $$ begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if p_actor is null or p_actor !~ '^g:[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  return p_actor;
end $$;
create or replace function nirmol_advisor.status(p_actor text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('remaining',greatest(0,20-coalesce((select used from nirmol_advisor.counts where actor=p_actor and window_kind='day' and
      window_start=date_trunc('day',now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka'),0)),
    'resetAt',to_char(((date_trunc('day',now() at time zone 'Asia/Dhaka')+interval '1 day') at time zone 'Asia/Dhaka') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'busy',exists(select 1 from nirmol_advisor.attempts where actor=p_actor and state='running' and expires_at>now()))
$$;
create or replace function nirmol_advisor.reserve(p_actor text,p_request uuid,p_digest text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp(); previous nirmol_advisor.attempts; actor_name text; kind text; w timestamptz; limit_count integer; usage_count integer;
begin
  if p_request is null or p_lease is null or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  -- Shared project lock serializes both guest/user budgets and concurrent leases.
  perform pg_catalog.pg_advisory_xact_lock(60080001);
  select * into previous from nirmol_advisor.attempts where actor=p_actor and request_id=p_request;
  if found then
    if previous.digest<>p_digest then raise exception 'request_conflict'; end if;
    if previous.state='running' and previous.expires_at>t then raise exception 'request_in_progress'; end if;
    raise exception 'attempt_spent'; -- no stored response; retries need a new explicitly charged UUID
  end if;
  if exists(select 1 from nirmol_advisor.attempts where actor=p_actor and state='running' and expires_at>t) or
    (select count(*) from nirmol_advisor.attempts where state='running' and expires_at>t)>=4 then raise exception 'advisor_busy'; end if;
  foreach actor_name in array array[p_actor,'project'] loop
    foreach kind in array array['day','minute'] loop
      w:=case when kind='day' then date_trunc('day',t at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka' else date_trunc('minute',t) end;
      limit_count:=case when actor_name='project' then case when kind='day' then 200 else 20 end else case when kind='day' then 20 else 3 end end;
      insert into nirmol_advisor.counts(actor,window_start,window_kind,used) values(actor_name,w,kind,1)
        on conflict(actor,window_start,window_kind) do update set used=nirmol_advisor.counts.used+1 returning used into usage_count;
      if usage_count>limit_count then raise exception 'quota_exceeded'; end if;
    end loop;
  end loop;
  insert into nirmol_advisor.attempts(actor,request_id,digest,lease,expires_at,state) values(p_actor,p_request,p_digest,p_lease,t+interval '120 seconds','running');
  -- Bound retention without keeping any conversation content. A daily maintenance
  -- operator should also prune if traffic stops; no schedule is activated here.
  delete from nirmol_advisor.attempts where created_at<t-interval '2 days';
  delete from nirmol_advisor.counts where window_start<t-interval '2 days';
  return nirmol_advisor.status(p_actor);
end $$;
-- Prevent authenticated direct invocation with another actor by putting checks in
-- separate definer entrypoints; the general helpers remain ungranted.
create or replace function nirmol_advisor.user_status() returns jsonb language sql stable security definer set search_path='' as $$
  select nirmol_advisor.status(nirmol_advisor.actor())
$$;
create or replace function nirmol_advisor.user_reserve(p_request uuid,p_digest text,p_lease uuid) returns jsonb language sql security definer set search_path='' as $$
  select nirmol_advisor.reserve(nirmol_advisor.actor(),p_request,p_digest,p_lease)
$$;
create or replace function public.f08_status() returns jsonb language sql stable security invoker set search_path='' as $$ select nirmol_advisor.user_status() $$;
create or replace function public.f08_reserve(p_request uuid,p_digest text,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select nirmol_advisor.user_reserve(p_request,p_digest,p_lease) $$;
create or replace function public.f08_guest_status(p_actor text) returns jsonb language sql stable security definer set search_path='' as $$ select nirmol_advisor.status(nirmol_advisor.guest(p_actor)) $$;
create or replace function public.f08_guest_reserve(p_actor text,p_request uuid,p_digest text,p_lease uuid) returns jsonb language sql security definer set search_path='' as $$ select nirmol_advisor.reserve(nirmol_advisor.guest(p_actor),p_request,p_digest,p_lease) $$;
create or replace function public.f08_finish(p_lease uuid) returns void language plpgsql security definer set search_path='' as $$ begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  update nirmol_advisor.attempts set state='finished' where lease=p_lease;
end $$;
revoke all on all functions in schema nirmol_advisor from public,anon,authenticated,service_role;
revoke all on function public.f08_status(),public.f08_reserve(uuid,text,uuid),public.f08_guest_status(text),public.f08_guest_reserve(text,uuid,text,uuid),public.f08_finish(uuid) from public,anon,authenticated,service_role;
grant execute on function public.f08_status(),public.f08_reserve(uuid,text,uuid),nirmol_advisor.user_status(),nirmol_advisor.user_reserve(uuid,text,uuid) to authenticated;
grant execute on function public.f08_guest_status(text),public.f08_guest_reserve(text,uuid,text,uuid),public.f08_finish(uuid) to service_role;
commit;

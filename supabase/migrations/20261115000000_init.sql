-- Laree P1 schema. See docs/roadmap/mvp.md ("Schema sketch", "Access rules") and docs/dev/backend.md.
--
-- Shape: people and links are plain tables. Training records are "synced documents": typed key
-- columns that the access rules and queries use, plus a jsonb body that holds the app's own record
-- with real dates. Every table has row-level security; a table with no policy returns nothing.

-- Nothing in public is open to signed-out visitors. Signed-in users get only what is granted below.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------------------------

create type public.user_role as enum ('coach', 'athlete');
create type public.user_plan as enum ('free', 'premium');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'athlete',
  plan public.user_plan not null default 'free',
  display_name text not null default '' check (char_length(display_name) <= 80),
  focus text not null default '' check (char_length(focus) <= 80),
  sports text[] not null default '{}'
    check (sports <@ array['swim', 'bike', 'run', 'strength', 'other']::text[]),
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 20 and 300),
  baselines jsonb not null default '{"restingHr": 0, "hrvMs": 0}'::jsonb
    check (jsonb_typeof(baselines) = 'object' and pg_column_size(baselines) < 2048),
  locale text not null default 'en-MY' check (char_length(locale) <= 20),
  time_zone text not null default 'Asia/Kuala_Lumpur' check (char_length(time_zone) <= 60),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Coaching is a premium feature (owner decision, docs/dev/backend.md "Tiers").
  constraint coaches_are_premium check (role <> 'coach' or plan = 'premium')
);
comment on column public.profiles.plan is 'free or premium. Set by the owner (runbook); users cannot change it.';

create table public.coach_athletes (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  -- The coach decides whether a coached athlete gets AI (owner decision).
  ai_access boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (coach_id, athlete_id, started_at),
  check (coach_id <> athlete_id)
);
-- One active coach per athlete.
create unique index coach_athletes_one_active on public.coach_athletes (athlete_id) where status = 'active';
create index coach_athletes_coach on public.coach_athletes (coach_id) where status = 'active';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  -- Null for a coach invitation, which only the owner creates (runbook).
  coach_id uuid references public.profiles (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role public.user_role not null default 'athlete',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  check ((role = 'athlete') = (coach_id is not null))
);
create unique index invitations_one_pending on public.invitations (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'::uuid), email)
  where accepted_at is null;

-- Append-only: a withdrawal is a new row with granted = false, never an edit.
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('health_data', 'coach_sharing', 'cross_border', 'ai')),
  granted boolean not null,
  text_version text not null check (char_length(text_version) between 1 and 20),
  at timestamptz not null default now()
);
create index consents_user_purpose on public.consents (user_id, purpose, at desc);

-- ---------------------------------------------------------------------------------------------
-- Access helpers. security definer so policies can read the link table without recursion.
-- ---------------------------------------------------------------------------------------------

create function public.is_coach_of(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coach_athletes l
    where l.coach_id = (select auth.uid()) and l.athlete_id = athlete and l.status = 'active'
  )
$$;

-- The athlete themself, or their active coach.
create function public.can_read_athlete(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select athlete = (select auth.uid()) or public.is_coach_of(athlete)
$$;

-- Only for the athlete or their coach: anyone else learns nothing (false).
create function public.has_active_coach(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_athlete(athlete)
     and exists (select 1 from public.coach_athletes l where l.athlete_id = athlete and l.status = 'active')
$$;

-- Who writes an athlete's plan: their active coach, or the athlete when they have no coach.
create function public.can_plan_for(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_coach_of(athlete)
      or (athlete = (select auth.uid()) and not public.has_active_coach(athlete))
$$;

-- The latest answer a person gave for one consent purpose. Only for them or their coach.
create function public.has_consent(person uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_athlete(person) and coalesce((
    select c.granted from public.consents c
    where c.user_id = person and c.purpose = what
    order by c.at desc, c.id desc limit 1
  ), false)
$$;

-- AI for an athlete (owner decision): a coached athlete needs the coach's grant, a self-coached
-- athlete needs the premium plan, and every athlete needs their own AI consent. Only the athlete
-- or their coach may ask.
create function public.ai_allowed(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_athlete(athlete)
     and public.has_consent(athlete, 'ai')
     and case
       when public.has_active_coach(athlete) then exists (
         select 1 from public.coach_athletes l
         where l.athlete_id = athlete and l.status = 'active' and l.ai_access
       )
       else exists (select 1 from public.profiles p where p.id = athlete and p.plan = 'premium')
     end
$$;

grant execute on function public.is_coach_of(uuid), public.has_active_coach(uuid), public.can_read_athlete(uuid),
  public.can_plan_for(uuid), public.has_consent(uuid, text), public.ai_allowed(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Policies on people and links
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.invitations enable row level security;
alter table public.consents enable row level security;

grant select on public.profiles to authenticated;
-- role and plan are not in this list: nobody promotes themself.
grant update (display_name, focus, sports, weight_kg, baselines, locale, time_zone, onboarded_at)
  on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.is_coach_of(id)
  or exists (
    select 1 from public.coach_athletes l
    where l.coach_id = profiles.id and l.athlete_id = (select auth.uid()) and l.status = 'active'
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.coach_athletes to authenticated;
grant update (ai_access, status) on public.coach_athletes to authenticated;
create policy links_read on public.coach_athletes for select to authenticated
  using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));
create policy links_update on public.coach_athletes for update to authenticated
  using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));

-- Rules for people using the app. The owner (no signed-in user, e.g. the SQL editor) is not bound.
create function private.guard_link_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.ai_access is distinct from old.ai_access and (select auth.uid()) is distinct from old.coach_id then
    raise exception 'Only the coach changes AI access' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'active' or new.status <> 'ended' then
      raise exception 'A link can only end' using errcode = '42501';
    end if;
    new.ended_at := now();
  end if;
  return new;
end $$;
create trigger coach_athletes_guard before update on public.coach_athletes
  for each row execute function private.guard_link_update();

grant select, insert, delete on public.invitations to authenticated;
create policy invitations_read on public.invitations for select to authenticated using (
  coach_id = (select auth.uid()) or email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
);
create policy invitations_create on public.invitations for insert to authenticated with check (
  coach_id = (select auth.uid())
  and role = 'athlete'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
);
create policy invitations_withdraw on public.invitations for delete to authenticated
  using (coach_id = (select auth.uid()) and accepted_at is null);

grant select on public.consents to authenticated;
-- When is the server's. The person may name themself (the policy below refuses anyone else), so a
-- client can bind a row to the account that made the choice even if the session changes meanwhile.
grant insert (user_id, purpose, granted, text_version) on public.consents to authenticated;
create policy consents_read on public.consents for select to authenticated
  using (user_id = (select auth.uid()) or public.is_coach_of(user_id));
create policy consents_add on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- New accounts and invitations
-- ---------------------------------------------------------------------------------------------

-- Every new sign-in gets a profile: a self-coached athlete on the free plan until an invitation
-- says otherwise.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New athlete'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accept one invitation addressed to the signed-in email. An athlete invitation links the athlete
-- to the coach (ending any earlier coach). A coach invitation makes the account a premium coach.
create function public.accept_invitation(invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  my_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  inv public.invitations;
begin
  select * into inv from public.invitations i
  where i.id = invitation and i.email = my_email and i.accepted_at is null and i.expires_at > now()
  for update;
  if not found then
    raise exception 'No open invitation for this account' using errcode = 'P0002';
  end if;
  if inv.role = 'coach' then
    update public.profiles set role = 'coach', plan = 'premium', updated_at = now() where id = me;
  else
    if inv.coach_id = me then
      raise exception 'You cannot coach yourself' using errcode = '22023';
    end if;
    update public.coach_athletes set status = 'ended', ended_at = now()
    where athlete_id = me and status = 'active';
    insert into public.coach_athletes (coach_id, athlete_id) values (inv.coach_id, me);
  end if;
  update public.invitations set accepted_at = now() where id = inv.id;
end $$;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- Open invitations to the signed-in email, with the inviting coach's name (which the invitee
-- cannot read from profiles before accepting).
create function public.my_invitations()
returns table (id uuid, role public.user_role, coach_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.role, coalesce(p.display_name, ''), i.expires_at
  from public.invitations i left join public.profiles p on p.id = i.coach_id
  where i.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and i.accepted_at is null and i.expires_at > now()
  order by i.created_at
$$;
grant execute on function public.my_invitations() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Synced documents
-- ---------------------------------------------------------------------------------------------

-- Server time stamps every write, and the audit log records who did what (never the body).
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_key text not null,
  at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
-- No policies: only the owner reads it, through the dashboard or the service role.

create function private.stamp_and_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_col text := tg_argv[0];
  key text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.updated_at := now();
    new.updated_by := (select auth.uid());
    key := (to_jsonb(new) ->> owner_col) || '/' || new.id;
  else
    key := (to_jsonb(old) ->> owner_col) || '/' || old.id;
  end if;
  insert into public.audit_log (actor_id, action, table_name, row_key)
  values ((select auth.uid()), lower(tg_op), tg_table_name, key);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- One athlete-scoped document table. writer: 'athlete' (the athlete's own record), 'planner'
-- (the coach, or a self-coached athlete) or 'both' (kudos: the coach sends, the athlete marks seen).
create function private.create_athlete_docs(tbl text, writer text) returns void
language plpgsql set search_path = '' as $$
declare
  can_write text := case writer
    when 'athlete' then 'athlete_id = (select auth.uid())'
    when 'planner' then 'public.can_plan_for(athlete_id)'
    when 'both' then '(athlete_id = (select auth.uid()) or public.can_plan_for(athlete_id))'
  end;
begin
  if can_write is null then raise exception 'unknown writer %', writer; end if;
  execute format($f$
    create table public.%1$I (
      athlete_id uuid not null references public.profiles (id) on delete cascade,
      id text not null check (char_length(id) between 1 and 120),
      day date,
      body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) < 262144),
      updated_at timestamptz not null default now(),
      updated_by uuid,
      deleted_at timestamptz,
      primary key (athlete_id, id)
    );
    create index %2$I on public.%1$I (athlete_id, day);
    create index %3$I on public.%1$I (athlete_id, updated_at);
    alter table public.%1$I enable row level security;
    grant select, insert, update, delete on public.%1$I to authenticated;
    create policy docs_read on public.%1$I for select to authenticated using (public.can_read_athlete(athlete_id));
    create policy docs_add on public.%1$I for insert to authenticated with check (%4$s);
    create policy docs_change on public.%1$I for update to authenticated using (%4$s) with check (%4$s);
    create policy docs_remove on public.%1$I for delete to authenticated using (%4$s);
    create trigger stamp before insert or update or delete on public.%1$I
      for each row execute function private.stamp_and_audit('athlete_id');
  $f$, tbl, tbl || '_day', tbl || '_changed', can_write);
end $$;

select private.create_athlete_docs('planned_workouts', 'planner');
select private.create_athlete_docs('races', 'planner');
select private.create_athlete_docs('phases', 'planner');
select private.create_athlete_docs('thresholds', 'planner');
select private.create_athlete_docs('excuses', 'planner');
select private.create_athlete_docs('activity_notes', 'planner');
select private.create_athlete_docs('flag_states', 'planner');
select private.create_athlete_docs('activities', 'athlete');
select private.create_athlete_docs('check_ins', 'athlete');
select private.create_athlete_docs('check_in_skips', 'athlete');
select private.create_athlete_docs('badges', 'athlete');
select private.create_athlete_docs('badge_seen', 'athlete');
-- Kudos are the coach's words: only the planner writes them. The athlete marks them seen in a
-- record of their own, so they can never change or remove the coach's message.
select private.create_athlete_docs('kudos', 'planner');
select private.create_athlete_docs('kudos_seen', 'athlete');

-- One check-in per athlete and day, whichever device sends it.
create unique index check_ins_one_per_day on public.check_ins (athlete_id, day) where deleted_at is null;

-- One owner-scoped document table: a person's own library or settings. With coach_reads, the
-- owner's active coach can read it too (settings carry the athlete's AI switch).
create function private.create_owner_docs(tbl text, coach_reads boolean) returns void
language plpgsql set search_path = '' as $$
begin
  execute format($f$
    create table public.%1$I (
      owner_id uuid not null references public.profiles (id) on delete cascade,
      id text not null check (char_length(id) between 1 and 120),
      body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) < 262144),
      updated_at timestamptz not null default now(),
      updated_by uuid,
      deleted_at timestamptz,
      primary key (owner_id, id)
    );
    create index %2$I on public.%1$I (owner_id, updated_at);
    alter table public.%1$I enable row level security;
    grant select, insert, update, delete on public.%1$I to authenticated;
    create policy docs_read on public.%1$I for select to authenticated using (%3$s);
    create policy docs_add on public.%1$I for insert to authenticated with check (owner_id = (select auth.uid()));
    create policy docs_change on public.%1$I for update to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
    create policy docs_remove on public.%1$I for delete to authenticated using (owner_id = (select auth.uid()));
    create trigger stamp before insert or update or delete on public.%1$I
      for each row execute function private.stamp_and_audit('owner_id');
  $f$, tbl, tbl || '_changed',
    case when coach_reads then 'owner_id = (select auth.uid()) or public.is_coach_of(owner_id)'
         else 'owner_id = (select auth.uid())' end);
end $$;

select private.create_owner_docs('workout_templates', false);
select private.create_owner_docs('settings', true);

-- ---------------------------------------------------------------------------------------------
-- AI runs and client errors
-- ---------------------------------------------------------------------------------------------

create table public.ai_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature in ('recap', 'checkin', 'suggest')),
  -- Empty while the request holds its place and no provider has answered yet.
  provider text not null check (char_length(provider) <= 40),
  model text not null check (char_length(model) <= 120),
  status text not null check (status in ('reserved', 'ok', 'declined', 'invalid', 'unavailable', 'failed')),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index ai_runs_user_day on public.ai_runs (user_id, created_at desc);
alter table public.ai_runs enable row level security;
grant select on public.ai_runs to authenticated;
-- Written only by the ai Edge Function with the service role. People read their own runs.
create policy ai_runs_read on public.ai_runs for select to authenticated using (user_id = (select auth.uid()));

-- One AI request's place in the person's allowance for the last 24 hours. The ai Edge Function
-- calls this before it calls any provider, and fills the row in afterwards. Null: no place left.
-- The lock makes "count, then insert" one step per person, so two requests cannot both take the
-- last place. A request counts whether or not a provider answered it.
create function public.reserve_ai_run(p_user uuid, p_athlete uuid, p_feature text, p_limit integer) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  run_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('laree.ai_runs:' || p_user::text, 0));
  if (
    select count(*) from public.ai_runs r
    where r.user_id = p_user and r.created_at > clock_timestamp() - interval '24 hours'
  ) >= p_limit then
    return null;
  end if;
  insert into public.ai_runs (user_id, athlete_id, feature, provider, model, status, created_at)
  values (p_user, p_athlete, p_feature, '', '', 'reserved', clock_timestamp())
  returning id into run_id;
  return run_id;
end $$;

create table public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 4000),
  path text check (char_length(path) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  app_version text check (char_length(app_version) <= 40),
  at timestamptz not null default now()
);
create index client_errors_user_at on public.client_errors (user_id, at desc);
alter table public.client_errors enable row level security;
grant insert (message, stack, path, user_agent, app_version) on public.client_errors to authenticated;
create policy client_errors_add on public.client_errors for insert to authenticated
  with check (user_id = (select auth.uid()));

-- At most 50 reports per person per day; the rest are dropped quietly.
create function private.cap_client_errors() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.client_errors e
      where e.user_id = new.user_id and e.at > now() - interval '1 day') >= 50 then
    return null;
  end if;
  return new;
end $$;
create trigger client_errors_cap before insert on public.client_errors
  for each row execute function private.cap_client_errors();

-- Retention: AI runs 90 days, client errors 30 days, the audit log 1 year.
create function private.purge_old_rows() returns void
language sql security definer set search_path = '' as $$
  delete from public.ai_runs where created_at < now() - interval '90 days';
  delete from public.client_errors where at < now() - interval '30 days';
  delete from public.audit_log where at < now() - interval '1 year';
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('laree-purge', '17 3 * * *', 'select private.purge_old_rows()');
  end if;
end $$;

-- The daily keep-alive (.github/workflows/keepalive.yml) calls this: a free project pauses after
-- a week without requests. It reads nothing.
create function public.ping() returns integer language sql immutable as $$ select 1 $$;

-- The sync's clock (src/live/sync). A device asks for the server's time when a pull begins and
-- starts its next pull 30 seconds before that time. updated_at is the time a write began, so the
-- 30 seconds must stay above the longest a write can take. Writes from the app are one statement
-- each: this timeout is that bound. A long hand-made transaction in the SQL editor that changes
-- synced rows is outside it; devices pick such rows up on their next visit, which reads everything.
create function public.server_now() returns timestamptz language sql volatile as $$ select clock_timestamp() $$;
alter role authenticated set statement_timeout = '8s';
-- The API reads role settings when it loads its configuration: tell it to load them again.
-- scripts/check-api-timeout.ts checks, through the API, that the timeout is in effect.
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------------------------------
-- Who may call which function
-- ---------------------------------------------------------------------------------------------
-- PostgreSQL lets everyone (PUBLIC) execute a new function, and default privileges set for one
-- schema cannot take that away. So it is taken away here, from every function made above, and
-- each role gets back exactly what it needs. A new migration that adds a function must do the same.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_coach_of(uuid), public.has_active_coach(uuid), public.can_read_athlete(uuid),
  public.can_plan_for(uuid), public.has_consent(uuid, text), public.ai_allowed(uuid),
  public.accept_invitation(uuid), public.my_invitations(), public.server_now() to authenticated;
grant execute on function public.ping() to anon, authenticated;
-- The server side only: a person must not hand out or use up places in anyone's allowance.
grant execute on function public.reserve_ai_run(uuid, uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Activity files: a private bucket, one folder per athlete ({athlete_id}/{activity_id}.{ext}).
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('activity-files', 'activity-files', false, 41943040,
            array['application/octet-stream', 'application/gpx+xml', 'application/vnd.garmin.tcx+xml',
                  'application/xml', 'text/xml'])
    on conflict (id) do nothing;

    execute $p$
      create policy activity_files_read on storage.objects for select to authenticated using (
        bucket_id = 'activity-files' and public.can_read_athlete(((storage.foldername(name))[1])::uuid)
      )$p$;
    execute $p$
      create policy activity_files_add on storage.objects for insert to authenticated with check (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
        -- {athlete id}/{file name}, nothing else: the backup and restore scripts rely on this shape.
        and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
      )$p$;
    execute $p$
      create policy activity_files_replace on storage.objects for update to authenticated using (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
      ) with check (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
        and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
      )$p$;
    execute $p$
      create policy activity_files_remove on storage.objects for delete to authenticated using (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
      )$p$;
  end if;
end $$;

-- Row-level access rules (docs/roadmap/mvp.md "Access rules"). Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(76);

-- People: coach A coaches athlete A1; coach B coaches athlete B1; S1 is self-coached on free;
-- S2 is self-coached on premium.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'coach.a@example.test'),
  ('00000000-0000-4000-a000-00000000000b', 'coach.b@example.test'),
  ('00000000-0000-4000-a000-0000000000a1', 'a1@example.test'),
  ('00000000-0000-4000-a000-0000000000b1', 'b1@example.test'),
  ('00000000-0000-4000-a000-0000000000c1', 's1@example.test'),
  ('00000000-0000-4000-a000-0000000000c2', 's2@example.test'),
  ('00000000-0000-4000-a000-0000000000d1', 'new@example.test');

select is((select count(*)::int from profiles), 7, 'every new account gets a profile');
select is((select role::text || '/' || plan::text from profiles where id = '00000000-0000-4000-a000-0000000000c1'),
  'athlete/free', 'a new account is a self-coached athlete on the free plan');

update profiles set role = 'coach', plan = 'premium'
  where id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');
update profiles set plan = 'premium' where id = '00000000-0000-4000-a000-0000000000c2';
insert into coach_athletes (coach_id, athlete_id) values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000a1'),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-0000000000b1');

select throws_ok(
  $$update profiles set plan = 'free' where id = '00000000-0000-4000-a000-00000000000a'$$,
  '23514', null, 'a coach must stay on premium');
select lives_ok(
  $$update coach_athletes set ai_access = false where coach_id = '00000000-0000-4000-a000-00000000000b'$$,
  'the owner (no signed-in user) may change a link');

-- One row for A1 in every athlete table, written as the owner (bypasses access rules).
do $$
declare t text;
begin
  foreach t in array array['planned_workouts', 'races', 'phases', 'thresholds', 'excuses', 'activity_notes',
    'flag_states', 'activities', 'check_ins', 'check_in_skips', 'badges', 'badge_seen', 'kudos', 'kudos_seen'] loop
    execute format('insert into public.%I (athlete_id, id, day, body) values (%L, %L, current_date, %L)',
      t, '00000000-0000-4000-a000-0000000000a1', 'row-1', '{"x": 1}');
  end loop;
end $$;
insert into consents (user_id, purpose, granted, text_version)
  values ('00000000-0000-4000-a000-0000000000a1', 'health_data', true, '2026-11');
insert into settings (owner_id, id, body) values ('00000000-0000-4000-a000-0000000000a1', 'settings', '{"aiConsent": true}');
insert into workout_templates (owner_id, id, body) values ('00000000-0000-4000-a000-00000000000a', 't-1', '{"name": "Tempo"}');

create function pg_temp.login(uid text, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
$$;

-- ---- The second-coach test: coach B sees none of A1's rows, in any table. ----
select pg_temp.login('00000000-0000-4000-a000-00000000000b', 'coach.b@example.test');
set local role authenticated;
select is((select count(*)::int from planned_workouts), 0, 'coach B: planned_workouts hidden');
select is((select count(*)::int from races), 0, 'coach B: races hidden');
select is((select count(*)::int from phases), 0, 'coach B: phases hidden');
select is((select count(*)::int from thresholds), 0, 'coach B: thresholds hidden');
select is((select count(*)::int from excuses), 0, 'coach B: excuses hidden');
select is((select count(*)::int from activity_notes), 0, 'coach B: activity_notes hidden');
select is((select count(*)::int from flag_states), 0, 'coach B: flag_states hidden');
select is((select count(*)::int from activities), 0, 'coach B: activities hidden');
select is((select count(*)::int from check_ins), 0, 'coach B: check_ins hidden');
select is((select count(*)::int from check_in_skips), 0, 'coach B: check_in_skips hidden');
select is((select count(*)::int from badges), 0, 'coach B: badges hidden');
select is((select count(*)::int from badge_seen), 0, 'coach B: badge_seen hidden');
select is((select count(*)::int from kudos), 0, 'coach B: kudos hidden');
select is((select count(*)::int from kudos_seen), 0, 'coach B: kudos_seen hidden');
select is(has_consent('00000000-0000-4000-a000-0000000000a1', 'health_data'), false, 'coach B cannot probe A1''s consents');
select is(has_active_coach('00000000-0000-4000-a000-0000000000a1'), false, 'coach B cannot probe whether A1 has a coach');
select is((select count(*)::int from settings), 0, 'coach B: settings hidden');
select is((select count(*)::int from workout_templates), 0, 'coach B: coach A''s library hidden');
select is((select count(*)::int from profiles where id = '00000000-0000-4000-a000-0000000000a1'), 0,
  'coach B: A1''s profile hidden');
select is((select count(*)::int from consents), 0, 'coach B: consents hidden');
select is(ai_allowed('00000000-0000-4000-a000-0000000000a1'), false, 'coach B cannot ask for A1''s AI');
select throws_ok(
  $$insert into planned_workouts (athlete_id, id, body) values ('00000000-0000-4000-a000-0000000000a1', 'x', '{}')$$,
  '42501', null, 'coach B cannot plan for A1');
reset role;

-- ---- Coach A: reads A1, writes the plan, never the athlete's own record. ----
select pg_temp.login('00000000-0000-4000-a000-00000000000a', 'coach.a@example.test');
set local role authenticated;
select is((select count(*)::int from activities), 1, 'coach A reads A1''s activities');
select is((select count(*)::int from settings), 1, 'coach A reads A1''s settings');
select lives_ok(
  $$insert into planned_workouts (athlete_id, id, day, body) values ('00000000-0000-4000-a000-0000000000a1', 'pw-2', current_date, '{}')$$,
  'coach A plans for A1');
select throws_ok(
  $$insert into activities (athlete_id, id, body) values ('00000000-0000-4000-a000-0000000000a1', 'act-2', '{}')$$,
  '42501', null, 'coach A cannot write A1''s activities');
select throws_ok(
  $$insert into check_ins (athlete_id, id, body) values ('00000000-0000-4000-a000-0000000000a1', 'ci-2', '{}')$$,
  '42501', null, 'coach A cannot write A1''s check-ins');
select is((select updated_by::text from planned_workouts where id = 'pw-2'), '00000000-0000-4000-a000-00000000000a',
  'the server stamps who wrote a row');
select lives_ok(
  $$update coach_athletes set ai_access = true where athlete_id = '00000000-0000-4000-a000-0000000000a1'$$,
  'coach A grants A1 AI access');
select lives_ok(
  $$insert into invitations (coach_id, email) values ('00000000-0000-4000-a000-00000000000a', 'b1@example.test')$$,
  'coach A invites an athlete');
select throws_ok(
  $$insert into invitations (coach_id, email, role) values (null, 'x@example.test', 'coach')$$,
  '42501', null, 'a coach cannot invite another coach');
reset role;

-- ---- Athlete A1: own record yes, plan no. ----
select pg_temp.login('00000000-0000-4000-a000-0000000000a1', 'a1@example.test');
set local role authenticated;
select is((select count(*)::int from planned_workouts), 2, 'A1 reads their plan');
select throws_ok(
  $$insert into planned_workouts (athlete_id, id, body) values ('00000000-0000-4000-a000-0000000000a1', 'mine', '{}')$$,
  '42501', null, 'a coached athlete cannot write their plan');
select lives_ok(
  $$insert into check_ins (athlete_id, id, day, body) values ('00000000-0000-4000-a000-0000000000a1', 'ci-3', current_date + 1, '{}')$$,
  'A1 checks in');
select throws_ok(
  $$insert into check_ins (athlete_id, id, day, body) values ('00000000-0000-4000-a000-0000000000a1', 'ci-4', current_date + 1, '{}')$$,
  '23505', null, 'one check-in per athlete and day');
update kudos set body = '{"message": "changed"}' where id = 'row-1';
select is((select body from kudos where id = 'row-1'), '{"x": 1}'::jsonb, 'an athlete cannot change a coach''s kudos');
select lives_ok(
  $$update kudos_seen set body = '{"ids": ["row-1"]}' where id = 'row-1'$$, 'A1 marks kudos seen in their own record');
-- lives_ok alone also passes when the access rules filter the row out and nothing changes.
select is((select body from kudos_seen where id = 'row-1'), '{"ids": ["row-1"]}'::jsonb, 'the kudos-seen record did change');
select lives_ok(
  $$insert into consents (user_id, purpose, granted, text_version) values ('00000000-0000-4000-a000-0000000000a1', 'ai', false, '2026-11')$$,
  'A1 may name themself in a consent row');
select throws_ok(
  $$insert into consents (user_id, purpose, granted, text_version) values ('00000000-0000-4000-a000-0000000000b1', 'ai', true, '2026-11')$$,
  '42501', null, 'nobody records a consent for someone else');
select throws_ok(
  $$select public.reserve_ai_run('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a1', 'recap', 40)$$,
  '42501', null, 'a signed-in person cannot take places in an AI allowance');
select throws_ok(
  $$insert into consents (purpose, granted, text_version, at) values ('ai', true, '2026-11', now() + interval '1 day')$$,
  '42501', null, 'the consent time is the server''s');
select throws_ok(
  $$update profiles set plan = 'premium' where id = '00000000-0000-4000-a000-0000000000a1'$$,
  '42501', null, 'nobody changes their own plan');
select throws_ok(
  $$update coach_athletes set ai_access = false where athlete_id = '00000000-0000-4000-a000-0000000000a1'$$,
  '42501', null, 'only the coach changes an athlete''s AI access');
select is(ai_allowed('00000000-0000-4000-a000-0000000000a1'), false, 'no AI before the athlete agrees');
select lives_ok(
  $$insert into consents (purpose, granted, text_version) values ('ai', true, '2026-11')$$, 'A1 agrees to AI');
select is(ai_allowed('00000000-0000-4000-a000-0000000000a1'), true, 'AI once coach grant and consent are both there');
select throws_ok($$update consents set granted = false$$, '42501', null, 'consents cannot be edited');
select throws_ok($$delete from consents$$, '42501', null, 'consents cannot be deleted');
reset role;

-- ---- Self-coached athletes: they plan for themselves; AI needs premium. ----
select pg_temp.login('00000000-0000-4000-a000-0000000000c1', 's1@example.test');
set local role authenticated;
select lives_ok(
  $$insert into planned_workouts (athlete_id, id, body) values ('00000000-0000-4000-a000-0000000000c1', 'own', '{}')$$,
  'a self-coached athlete plans for themself');
insert into consents (purpose, granted, text_version) values ('ai', true, '2026-11');
select is(ai_allowed('00000000-0000-4000-a000-0000000000c1'), false, 'free plan: no AI even with consent');
reset role;

select pg_temp.login('00000000-0000-4000-a000-0000000000c2', 's2@example.test');
set local role authenticated;
insert into consents (purpose, granted, text_version) values ('ai', true, '2026-11');
select is(ai_allowed('00000000-0000-4000-a000-0000000000c2'), true, 'premium self-coached athlete with consent: AI');
insert into consents (purpose, granted, text_version) values ('ai', false, '2026-11');
select is(ai_allowed('00000000-0000-4000-a000-0000000000c2'), false, 'a later withdrawal turns AI off');
reset role;

-- ---- Invitations: accepting links the athlete and ends their old coach. ----
select pg_temp.login('00000000-0000-4000-a000-0000000000b1', 'b1@example.test');
set local role authenticated;
select is((select count(*)::int from invitations), 1, 'the invitee sees the invitation to their email');
select is((select coach_name from my_invitations()), 'coach.a', 'the invitee sees who invited them');
select lives_ok(
  $$select accept_invitation((select id from invitations limit 1))$$, 'B1 accepts coach A''s invitation');
select is((select coach_id::text from coach_athletes where status = 'active'), '00000000-0000-4000-a000-00000000000a',
  'B1 is now coached by A');
reset role;

select is((select status from coach_athletes where coach_id = '00000000-0000-4000-a000-00000000000b'), 'ended',
  'the old link ended');

-- ---- Activity files: one folder per athlete. ----
select pg_temp.login('00000000-0000-4000-a000-0000000000a1', 'a1@example.test');
set local role authenticated;
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('activity-files', '00000000-0000-4000-a000-0000000000a1/act-1.fit')$$,
  'an athlete uploads into their own folder');
reset role;
select pg_temp.login('00000000-0000-4000-a000-00000000000a', 'coach.a@example.test');
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'activity-files'), 1, 'their coach can read the file');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('activity-files', '00000000-0000-4000-a000-0000000000a1/x.fit')$$,
  '42501', null, 'a coach cannot upload into an athlete''s folder');
reset role;

-- ---- Signed-out visitors get nothing. ----
set local role anon;
select throws_ok($$select count(*) from activities$$, '42501', null, 'anon cannot read synced tables');
reset role;

-- ---- Who may call which function: the privileges as they are, not as the migration means them. ----
reset role;
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
   from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'ping()', 'a signed-out visitor can call ping and nothing else');
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
   from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
  'accept_invitation(uuid), ai_allowed(uuid), can_plan_for(uuid), can_read_athlete(uuid), has_active_coach(uuid), has_consent(uuid,text), is_coach_of(uuid), my_invitations(), ping(), server_now()',
  'a signed-in person can call exactly the functions granted to them');
select ok(has_function_privilege('service_role', 'public.reserve_ai_run(uuid, uuid, text, integer)', 'execute'),
  'the server can take a place in an AI allowance');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'private'::regnamespace
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
     and has_schema_privilege('authenticated', 'private', 'usage')),
  0, 'nothing in the private schema is reachable');

-- The sync re-reads 30 seconds before its cursor: no write through the API may stay open that long.
select is(
  (select c from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'authenticated' and c like 'statement_timeout=%'),
  'statement_timeout=8s', 'a write through the API is bounded well below the sync''s overlap window');

-- ---- The AI allowance: a place is taken before any provider is called, and never over the limit. ----
select isnt(public.reserve_ai_run('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-0000000000c2', 'recap', 2),
  null, 'the first request takes a place');
select isnt(public.reserve_ai_run('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-0000000000c2', 'recap', 2),
  null, 'the second request takes the last place');
select is(public.reserve_ai_run('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-0000000000c2', 'recap', 2),
  null, 'the third request is refused');
select is((select count(*)::int from ai_runs where user_id = '00000000-0000-4000-a000-0000000000c2' and status = 'reserved'),
  2, 'each place is a row, whether or not a provider answers');
select isnt(public.reserve_ai_run('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-0000000000c1', 'recap', 2),
  null, 'one person''s allowance does not use up another''s');

select * from finish();
rollback;

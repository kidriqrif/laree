-- Free coaches (owner decision, 2026-11-17). Anyone may choose to coach when they start. A coach on
-- the free plan has at most 3 athletes at a time, and their athletes get no AI. Premium lifts both
-- limits. The owner still sets the plan (runbook); nobody changes their own.

alter table public.profiles drop constraint coaches_are_premium;

-- The number of athletes a free coach may have at once.
create function private.free_coach_limit() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;

-- A free coach with no room left can neither invite nor take on another athlete. An open invitation
-- takes a place too, so a free coach cannot hand out invitations without end. Error code LA001, so
-- the app can say what happened. The owner (no signed-in user) is not limited.
create function private.check_coach_room() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  taken bigint;
begin
  if (select auth.uid()) is null or new.coach_id is null then
    return new;
  end if;
  -- One at a time per coach, so two athletes accepting at once cannot both take the last place.
  perform 1 from public.profiles p where p.id = new.coach_id for update;
  if exists (select 1 from public.profiles p where p.id = new.coach_id and p.plan = 'premium') then
    return new;
  end if;
  taken := (select count(*) from public.coach_athletes l where l.coach_id = new.coach_id and l.status = 'active');
  if tg_table_name = 'invitations' then
    taken := taken + (
      select count(*) from public.invitations i
      where i.coach_id = new.coach_id and i.accepted_at is null and i.expires_at > now()
    );
  end if;
  if taken >= private.free_coach_limit() then
    raise exception 'The free coach plan has room for % athletes', private.free_coach_limit()
      using errcode = 'LA001';
  end if;
  return new;
end $$;
create trigger coach_athletes_room before insert on public.coach_athletes
  for each row execute function private.check_coach_room();
create trigger invitations_room before insert on public.invitations
  for each row execute function private.check_coach_room();

-- AI for a coached athlete now also needs their coach on premium.
create or replace function public.ai_allowed(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_athlete(athlete)
     and public.has_consent(athlete, 'ai')
     and case
       when public.has_active_coach(athlete) then exists (
         select 1 from public.coach_athletes l join public.profiles c on c.id = l.coach_id
         where l.athlete_id = athlete and l.status = 'active' and l.ai_access and c.plan = 'premium'
       )
       else exists (select 1 from public.profiles p where p.id = athlete and p.plan = 'premium')
     end
$$;

-- The role is chosen once, when the person starts, and only while nobody is linked to them: an
-- athlete with a coach, or a coach with athletes, keeps their role. Choosing the role one already
-- has changes nothing and always succeeds. The plan does not change.
create function public.choose_role(chosen public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = me and p.role = chosen) then
    return;
  end if;
  if exists (select 1 from public.profiles p where p.id = me and p.onboarded_at is not null) then
    raise exception 'The role is chosen once, when you start' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.coach_athletes l where (l.coach_id = me or l.athlete_id = me) and l.status = 'active'
  ) then
    raise exception 'An account with a coach or athletes keeps its role' using errcode = '42501';
  end if;
  update public.profiles set role = chosen, updated_at = now() where id = me;
end $$;

-- As before, and a coach account cannot join another coach as their athlete.
create or replace function public.accept_invitation(invitation uuid) returns void
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
    if exists (select 1 from public.profiles p where p.id = me and p.role = 'coach') then
      raise exception 'A coach account cannot train with another coach' using errcode = '22023';
    end if;
    update public.coach_athletes set status = 'ended', ended_at = now()
    where athlete_id = me and status = 'active';
    insert into public.coach_athletes (coach_id, athlete_id) values (inv.coach_id, me);
  end if;
  update public.invitations set accepted_at = now() where id = inv.id;
end $$;

-- A new function is executable by everyone until this (see the init migration's note).
revoke execute on function public.choose_role(public.user_role) from public, anon, authenticated;
grant execute on function public.choose_role(public.user_role) to authenticated;

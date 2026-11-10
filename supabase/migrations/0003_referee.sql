-- Referee: one volunteer per match who runs the clock and records goals and cards.
-- Everyone can read what the referee records; only the referee writes it.

alter table public.matches
  add column referee_id uuid references public.players on delete set null,
  -- { running, elapsed: ms banked before `since`, since: epoch ms the clock last started, or null }
  add column clock jsonb not null default '{"running": false, "elapsed": 0, "since": null}';

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  at timestamptz not null default now(),
  minute smallint check (minute between 1 and 300),  -- null when the clock was never started
  kind text not null check (kind in ('goal', 'yellow', 'red')),
  side text check (side in ('a', 'b')),               -- the team a goal counts for
  player_id uuid references public.players on delete set null,
  check (kind <> 'goal' or side is not null),
  check (kind = 'goal' or player_id is not null)
);
create index match_events_match_at on public.match_events (match_id, at);

-- The host edits the match row directly, but must not be able to name a referee or
-- touch the clock: those two columns change only through the functions below.
revoke insert, update on public.matches from authenticated;
grant insert (id, host_id, title, venue, datetime, per_side, max_players, min_players, fee, visibility,
              invite_code, status, odd_mode, minutes, rotate_every, adjustments)
  on public.matches to authenticated;
grant update (id, host_id, title, venue, datetime, per_side, max_players, min_players, fee, visibility,
              invite_code, status, odd_mode, minutes, rotate_every, adjustments)
  on public.matches to authenticated;

-- ---------------------------------------------------------------- functions

create function public.is_referee(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where id = m and referee_id = my_player_id())
$$;

-- A player volunteers. In an open match a squad member gives up their place to do it;
-- the host always plays, so they can't.
create function public.become_referee(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_player_id();
  mt matches;
  was text;
begin
  if me is null then raise exception 'Create a profile first'; end if;
  select * into mt from matches where id = m for update;
  if not found or mt.status not in ('open', 'locked') then raise exception 'This match is not taking a referee'; end if;
  if mt.referee_id = me then return; end if;
  if mt.referee_id is not null then raise exception 'This match already has a referee'; end if;
  if mt.host_id = me then raise exception 'The host plays in their own match, so they cannot referee it'; end if;
  select status into was from match_participants where match_id = m and player_id = me;
  if found then
    if mt.status = 'locked' then raise exception 'You are in the locked teams. Ask the host to unlock them first'; end if;
    delete from match_participants where match_id = m and player_id = me;
    update matches set adjustments = adjustments - me::text where id = m;
    if was = 'joined' then
      perform promote_waitlist(m);
      perform squad_changed(m);
    end if;
  end if;
  update matches set referee_id = me where id = m;
end $$;

-- The referee steps down, or the host takes the role off them. The clock and events stay.
create function public.clear_referee(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_player_id();
  mt matches;
begin
  select * into mt from matches where id = m for update;
  if not found or mt.referee_id is null then return; end if;
  if me is distinct from mt.referee_id and me is distinct from mt.host_id then
    raise exception 'Only the referee or the host can do that';
  end if;
  update matches set referee_id = null where id = m;
end $$;

-- The referee's phone works out the new clock (so its own display never jumps) and stores it here.
create function public.set_match_clock(m uuid, c jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_referee(m) then raise exception 'Only the referee runs the clock'; end if;
  if jsonb_typeof(c->'running') is distinct from 'boolean'
     or jsonb_typeof(c->'elapsed') is distinct from 'number'
     or (c->>'elapsed')::numeric < 0
     or coalesce(jsonb_typeof(c->'since'), 'null') not in ('number', 'null') then
    raise exception 'That clock value is not valid';
  end if;
  update matches
     set clock = jsonb_build_object('running', c->'running', 'elapsed', c->'elapsed',
                                    'since', coalesce(c->'since', 'null'::jsonb))
   where id = m;
end $$;

-- Same as before, except the referee can't also join as a player.
create or replace function public.join_match(m uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_player_id();
  mt matches;
  st text;
begin
  if me is null then raise exception 'Create a profile first'; end if;
  select * into mt from matches where id = m for update;
  if not found or mt.status <> 'open' then raise exception 'This match is not open'; end if;
  if mt.referee_id = me then raise exception 'You are refereeing this match. Step down as referee to play'; end if;
  if exists (select 1 from match_participants where match_id = m and player_id = me) then return 'already'; end if;
  st := case when (select count(*) from match_participants where match_id = m and status = 'joined') < mt.max_players
             then 'joined' else 'waitlist' end;
  insert into match_participants (match_id, player_id, status) values (m, me, st);
  if st = 'joined' then perform squad_changed(m); end if;
  return st;
end $$;

revoke execute on function public.become_referee(uuid), public.clear_referee(uuid), public.set_match_clock(uuid, jsonb)
  from public, anon;
grant execute on function public.become_referee(uuid), public.clear_referee(uuid), public.set_match_clock(uuid, jsonb)
  to authenticated;
grant execute on function public.is_referee(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.match_events enable row level security;
grant select on public.match_events to anon, authenticated;
grant insert, delete on public.match_events to authenticated;

create policy "events are public" on public.match_events for select using (true);
-- Goals and cards need teams, so only once they are locked, and only for people in the squad.
create policy "the referee records events" on public.match_events for insert to authenticated
  with check (
    exists (select 1 from public.matches mt
             where mt.id = match_events.match_id and mt.referee_id = my_player_id() and mt.status = 'locked')
    and (match_events.player_id is null
         or exists (select 1 from public.match_participants p
                     where p.match_id = match_events.match_id and p.player_id = match_events.player_id))
  );
create policy "the referee removes events" on public.match_events for delete to authenticated
  using (is_referee(match_id));

alter publication supabase_realtime add table public.match_events;
alter table public.match_events replica identity full;

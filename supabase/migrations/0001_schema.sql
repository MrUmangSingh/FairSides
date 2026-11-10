-- Fairsides schema: profiles, matches, squads, teams and the host's change log.
-- Applied by `node scripts/migrate.mjs`.

-- ---------------------------------------------------------------- tables

-- One row per person, plus the built-in sample players (owner is null).
create table public.players (
  id uuid primary key default gen_random_uuid(),
  owner uuid unique references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  stats jsonb not null,               -- { pace, stamina, shooting, passing, dribbling, defending }
  gk smallint not null default 35 check (gk between 1 and 99),
  primary_pos text not null check (primary_pos in ('GK', 'DEF', 'MID', 'FWD')),
  secondary_pos text check (secondary_pos in ('GK', 'DEF', 'MID', 'FWD')),
  foot text not null check (foot in ('left', 'right', 'both')),
  can_gk boolean not null default false,
  playstyle text not null check (playstyle in ('attacking', 'balanced', 'defensive')),
  sample boolean not null default false,
  sample_order smallint,
  updated_at timestamptz not null default now(),
  check (sample = (owner is null))
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.players,
  title text not null check (char_length(title) between 1 and 80),
  venue text not null check (char_length(venue) between 1 and 80),
  datetime text not null,             -- local kick-off time as entered, e.g. 2026-11-12T20:00
  per_side smallint not null check (per_side between 3 and 15),
  max_players smallint not null check (max_players <= 60),
  min_players smallint not null,
  fee integer not null default 0 check (fee >= 0),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  invite_code text not null,
  status text not null default 'open' check (status in ('open', 'locked', 'completed', 'cancelled')),
  odd_mode text not null default 'sub' check (odd_mode in ('sub', 'uneven', 'joker')),
  minutes smallint not null default 60,
  rotate_every smallint not null default 10,
  -- Host's per-match ratings: { player_id: { stats, gk } }. Public on purpose (plan 5.1).
  adjustments jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (max_players >= per_side * 2)
);

create table public.match_participants (
  match_id uuid not null references public.matches on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  status text not null default 'joined' check (status in ('joined', 'waitlist')),
  joined_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- Kept apart from matches so a draft stays private to the host until it is locked.
create table public.match_teams (
  match_id uuid primary key references public.matches on delete cascade,
  teams jsonb,                        -- { a: [], b: [], subs: [], joker, version } or null
  pins jsonb not null default '{}'    -- { player_id: 'a' | 'b' }
);

create table public.match_log (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  detail text not null check (char_length(detail) <= 300)
);
create index match_log_match_at on public.match_log (match_id, at desc);

-- ---------------------------------------------------------------- helpers

create function public.my_player_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where owner = auth.uid()
$$;

create function public.is_host(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where id = m and host_id = my_player_id())
$$;

-- Draft teams and pins only make sense for the squad they were made from.
create function public.squad_changed(m uuid) returns void
language sql security definer set search_path = public as $$
  update match_teams t
     set teams = null,
         pins = coalesce(
           (select jsonb_object_agg(e.key, e.value)
              from jsonb_each(t.pins) e
             where exists (select 1 from match_participants p
                            where p.match_id = m and p.player_id::text = e.key and p.status = 'joined')),
           '{}'::jsonb)
   where t.match_id = m
$$;

-- Moves waitlisted players into free places, oldest first.
create function public.promote_waitlist(m uuid) returns void
language sql security definer set search_path = public as $$
  update match_participants p
     set status = 'joined'
   where p.match_id = m
     and p.player_id in (
       select w.player_id from match_participants w
        where w.match_id = m and w.status = 'waitlist'
        order by w.joined_at
        limit greatest(0, (select max_players from matches where id = m)
                          - (select count(*) from match_participants j where j.match_id = m and j.status = 'joined')))
$$;

-- ---------------------------------------------------------------- actions players call

create function public.join_match(m uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_player_id();
  mt matches;
  st text;
begin
  if me is null then raise exception 'Create a profile first'; end if;
  select * into mt from matches where id = m for update;
  if not found or mt.status <> 'open' then raise exception 'This match is not open'; end if;
  if exists (select 1 from match_participants where match_id = m and player_id = me) then return 'already'; end if;
  st := case when (select count(*) from match_participants where match_id = m and status = 'joined') < mt.max_players
             then 'joined' else 'waitlist' end;
  insert into match_participants (match_id, player_id, status) values (m, me, st);
  if st = 'joined' then perform squad_changed(m); end if;
  return st;
end $$;

create function public.leave_match(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_player_id();
  mt matches;
begin
  select * into mt from matches where id = m for update;
  if not found or mt.status <> 'open' then raise exception 'This match is not open'; end if;
  if mt.host_id = me then raise exception 'The host cannot leave their own match'; end if;
  delete from match_participants where match_id = m and player_id = me;
  if not found then return; end if;
  update matches set adjustments = adjustments - me::text where id = m;
  perform promote_waitlist(m);
  perform squad_changed(m);
end $$;

-- Lets a host try team generation without a full squad.
create function public.add_sample_players(m uuid, n integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  mt matches;
  taken integer;
  s record;
begin
  select * into mt from matches where id = m for update;
  if not found or mt.status <> 'open' or mt.host_id is distinct from my_player_id() then
    raise exception 'Only the host of an open match can add sample players';
  end if;
  select count(*) into taken from match_participants where match_id = m and status = 'joined';
  for s in
    select id from players
     where sample and id not in (select player_id from match_participants where match_id = m)
     order by sample_order
     limit least(greatest(n, 0), 40)
  loop
    insert into match_participants (match_id, player_id, status, joined_at)
    values (m, s.id, case when taken < mt.max_players then 'joined' else 'waitlist' end, clock_timestamp());
    taken := taken + 1;
  end loop;
  perform squad_changed(m);
end $$;

revoke execute on function public.squad_changed(uuid), public.promote_waitlist(uuid) from public, anon, authenticated;
revoke execute on function public.join_match(uuid), public.leave_match(uuid), public.add_sample_players(uuid, integer) from public, anon;
grant execute on function public.join_match(uuid), public.leave_match(uuid), public.add_sample_players(uuid, integer) to authenticated;
grant execute on function public.my_player_id(), public.is_host(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_log enable row level security;

grant select on public.players, public.matches, public.match_participants, public.match_teams, public.match_log
  to anon, authenticated;
grant insert, update on public.players, public.matches to authenticated;
grant insert, update, delete on public.match_participants, public.match_teams to authenticated;
grant insert, update on public.match_log to authenticated;

-- Profiles: anyone can read them (they are the player cards); you write only your own.
create policy "players are public" on public.players for select using (true);
create policy "create your own profile" on public.players for insert to authenticated
  with check (owner = auth.uid() and not sample);
create policy "edit your own profile" on public.players for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid() and not sample);

-- Matches: readable by anyone who has the id; the app keeps private ones out of the list.
create policy "matches are readable" on public.matches for select using (true);
create policy "host a match as yourself" on public.matches for insert to authenticated
  with check (host_id = my_player_id());
create policy "hosts edit their match" on public.matches for update to authenticated
  using (host_id = my_player_id()) with check (host_id = my_player_id());

-- Squads: readable; players join and leave through join_match / leave_match,
-- the host can add, move and remove anyone in their own match.
create policy "squads are readable" on public.match_participants for select using (true);
create policy "hosts manage the squad" on public.match_participants for all to authenticated
  using (is_host(match_id)) with check (is_host(match_id));

-- Teams: the host always; everyone else once the match is locked.
create policy "teams visible to host, or to all once locked" on public.match_teams for select
  using (is_host(match_id) or exists (select 1 from public.matches m
                                       where m.id = match_id and m.status in ('locked', 'completed')));
create policy "only the host writes teams" on public.match_teams for all to authenticated
  using (is_host(match_id)) with check (is_host(match_id));

-- The log is public; only the host adds to it. No delete: it is the audit trail.
create policy "the log is public" on public.match_log for select using (true);
create policy "only the host logs" on public.match_log for insert to authenticated
  with check (is_host(match_id));
create policy "the host can reword their latest entry" on public.match_log for update to authenticated
  using (is_host(match_id)) with check (is_host(match_id));

-- ---------------------------------------------------------------- live updates

alter publication supabase_realtime
  add table public.players, public.matches, public.match_participants, public.match_teams, public.match_log;
alter table public.match_participants replica identity full;
alter table public.match_teams replica identity full;
alter table public.match_log replica identity full;

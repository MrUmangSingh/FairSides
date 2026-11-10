-- Fairsides, Phase 1 schema (plan section 11, MVP subset).
-- Not applied yet: the app currently stores data in the browser (src/lib/store.ts).
-- Run this in a Supabase project when moving to shared accounts.

create type position as enum ('GK', 'DEF', 'MID', 'FWD');
create type match_status as enum ('open', 'locked', 'completed', 'cancelled');
create type participant_status as enum ('joined', 'waitlist', 'left', 'no_show');
create type team_slot as enum ('A', 'B', 'sub', 'joker');

create table player_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null,
  mode text not null default 'simple' check (mode in ('simple', 'advanced')),
  stats jsonb not null,               -- { pace, stamina, shooting, passing, dribbling, defending }
  gk smallint not null default 35 check (gk between 1 and 99),
  primary_pos position not null,
  secondary_pos position,
  foot text not null check (foot in ('left', 'right', 'both')),
  can_gk boolean not null default false,
  playstyle text not null check (playstyle in ('attacking', 'balanced', 'defensive')),
  verified boolean not null default false,
  updated_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users,
  title text not null,
  venue text not null,
  lat double precision,
  lng double precision,
  datetime timestamptz not null,
  players_per_side smallint not null check (players_per_side between 3 and 15),
  max_players smallint not null,
  min_players smallint not null,
  odd_mode text not null default 'sub' check (odd_mode in ('sub', 'uneven', 'joker')),
  extra_player_factor real not null default 0.6,
  fee integer not null default 0 check (fee >= 0),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  invite_code text not null unique,
  status match_status not null default 'open',
  created_at timestamptz not null default now(),
  check (max_players >= players_per_side * 2)
);

create table match_participants (
  match_id uuid not null references matches on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status participant_status not null default 'joined',
  joined_at timestamptz not null default now(),
  paid boolean not null default false,
  primary key (match_id, user_id)
);

create table team_assignments (
  match_id uuid not null references matches on delete cascade,
  version integer not null,
  user_id uuid not null references auth.users on delete cascade,
  team team_slot not null,
  slot smallint,
  x real,
  y real,
  pinned boolean not null default false,
  primary key (match_id, version, user_id)
);

alter table player_profiles enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table team_assignments enable row level security;

create policy "profiles are readable by signed-in users" on player_profiles
  for select to authenticated using (true);
create policy "players manage their own profile" on player_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "public matches are readable; private ones by host and participants" on matches
  for select to authenticated using (
    visibility = 'public' or host_id = auth.uid()
    or exists (select 1 from match_participants p where p.match_id = id and p.user_id = auth.uid())
  );
create policy "hosts manage their matches" on matches
  for all to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "participants are readable by signed-in users" on match_participants
  for select to authenticated using (true);
create policy "players join and leave for themselves" on match_participants
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Draft teams are host-only; everyone in the match sees them once it is locked.
create policy "teams visible to host, or to all once locked" on team_assignments
  for select to authenticated using (
    exists (select 1 from matches m where m.id = match_id
            and (m.host_id = auth.uid() or m.status in ('locked', 'completed')))
  );
create policy "only the host writes teams" on team_assignments
  for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and m.host_id = auth.uid()))
  with check (exists (select 1 from matches m where m.id = match_id and m.host_id = auth.uid()));

-- Host ratings: each host keeps their own rating for the players they have hosted.
-- When one of those players is in a match the same host runs, the match starts them on
-- that rating instead of the one on their profile. Only the host who wrote a rating can
-- read or change it, so nobody else's matches are affected and the player can't undo it.

create table public.host_ratings (
  host_id uuid not null references public.players on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  stats jsonb not null check (jsonb_typeof(stats) = 'object'),
  gk smallint not null check (gk between 1 and 99),
  updated_at timestamptz not null default now(),
  primary key (host_id, player_id)
);

-- ---------------------------------------------------------------- functions

-- Gives everyone in the squad who has no rating for this match yet the host's saved one.
-- Ratings the host already set in this match are left alone.
create function public.apply_host_ratings(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  fill jsonb;
begin
  select jsonb_object_agg(r.player_id::text, jsonb_build_object('stats', r.stats, 'gk', r.gk))
    into fill
    from matches mt
    join host_ratings r on r.host_id = mt.host_id
    join match_participants p on p.match_id = mt.id and p.player_id = r.player_id
   where mt.id = m and mt.status = 'open' and not (mt.adjustments ? r.player_id::text);
  if fill is not null then
    update matches set adjustments = fill || adjustments where id = m;
  end if;
end $$;

-- Same as 0003, plus the host's saved rating for whoever just joined.
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
  perform apply_host_ratings(m);
  if st = 'joined' then perform squad_changed(m); end if;
  return st;
end $$;

-- Same as 0001, plus the host's saved ratings for the sample players.
create or replace function public.add_sample_players(m uuid, n integer) returns void
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
  perform apply_host_ratings(m);
  perform squad_changed(m);
end $$;

revoke execute on function public.apply_host_ratings(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.host_ratings enable row level security;
grant select, insert, update, delete on public.host_ratings to authenticated;

create policy "hosts see their own ratings" on public.host_ratings for select to authenticated
  using (host_id = my_player_id());
create policy "hosts write their own ratings" on public.host_ratings for insert to authenticated
  with check (host_id = my_player_id());
create policy "hosts change their own ratings" on public.host_ratings for update to authenticated
  using (host_id = my_player_id()) with check (host_id = my_player_id());
create policy "hosts remove their own ratings" on public.host_ratings for delete to authenticated
  using (host_id = my_player_id());

alter publication supabase_realtime add table public.host_ratings;
alter table public.host_ratings replica identity full;

-- ---------------------------------------------------------------- existing data

-- Every rating a host already set becomes their saved rating; the latest match wins.
insert into public.host_ratings (host_id, player_id, stats, gk, updated_at)
select distinct on (m.host_id, a.key)
       m.host_id, a.key::uuid, a.value->'stats',
       greatest(1, least(99, round((a.value->>'gk')::numeric)))::smallint, m.created_at
  from public.matches m
 cross join jsonb_each(m.adjustments) a
 where m.status <> 'cancelled'
   and jsonb_typeof(a.value->'stats') = 'object'
   and a.value->>'gk' is not null
   and coalesce(a.value->>'once', 'false') <> 'true'
   and exists (select 1 from public.players p where p.id::text = a.key)
 order by m.host_id, a.key, m.created_at desc;

-- Open matches pick those up for anyone already in the squad.
select public.apply_host_ratings(id) from public.matches where status = 'open';

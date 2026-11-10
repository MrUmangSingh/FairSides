"use client";

import Link from "next/link";
import { use } from "react";
import { BalanceMeter, TEAM_NAMES } from "@/components/balance-meter";
import { TeamStage } from "@/components/team-stage";
import { balanceTeams } from "@/lib/domain/balance";
import { ovr } from "@/lib/domain/ratings";
import type { Match, Player } from "@/lib/domain/types";
import { formatFee, formatSize, formatWhen } from "@/lib/format";
import { actions, joinedOf, useHydrated, useStore, waitlistOf } from "@/lib/store";

export function MatchScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { userId, players, matches } = useStore();

  if (!hydrated) return <div className="mx-auto max-w-6xl px-5 py-10" aria-busy="true" />;

  const match = matches.find((m) => m.id === id);
  if (!match) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-3xl">This match isn&apos;t on this device</h1>
        <p className="mt-4 text-chalk-dim">
          Matches are stored in the browser they were created in for now, so a link opened
          somewhere else won&apos;t find it.
        </p>
        <Link href="/matches" className="btn mt-6">
          Browse matches
        </Link>
      </div>
    );
  }

  const lookup = (ids: string[]) => ids.map((pid) => players[pid]).filter(Boolean) as Player[];
  const joined = lookup(joinedOf(match).map((p) => p.userId));
  const waiting = lookup(waitlistOf(match).map((p) => p.userId));
  const isHost = match.hostId === userId;
  const mine = match.participants.find((p) => p.userId === userId);
  const locked = match.status === "locked";
  const cancelled = match.status === "cancelled";
  const placesLeft = match.maxPlayers - joined.length;
  const showTeams = match.teams && (locked || isHost);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm text-chalk-dim">
            {cancelled ? "Cancelled" : locked ? "Teams locked" : "Open for players"}
            {match.visibility === "private" ? ", private" : ""}
            {isHost ? ", you're the host" : ""}
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{match.title}</h1>
          <p className="mt-3 text-lg">
            {formatWhen(match.datetime)} at {match.venue}
          </p>
          <p className="text-chalk-dim">
            {formatSize(match.perSide)}, {formatFee(match.fee).toLowerCase()}
          </p>
        </div>
        {cancelled ? null : <JoinControl match={match} userId={userId} mine={mine?.status} placesLeft={placesLeft} />}
      </header>

      <PlaceCounter joined={joined.length} max={match.maxPlayers} needed={match.minPlayers} />

      {isHost && !cancelled ? <HostBar match={match} joined={joined} /> : null}

      <div className="mt-12 grid gap-12">
        <section aria-labelledby="teams-heading">
          <h2 id="teams-heading" className="text-2xl">
            Teams
          </h2>
          {showTeams && match.teams ? (
            <>
              {!locked ? (
                <p className="mt-2 text-sm text-chalk-dim">
                  Draft. Players see the teams once you lock them.
                </p>
              ) : null}
              <div className="mt-5">
                <TeamStage
                  a={lookup(match.teams.a)}
                  b={lookup(match.teams.b)}
                  label={`${TEAM_NAMES.a} against ${TEAM_NAMES.b}, ${match.teams.a.length} a side`}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 max-w-sm text-chalk-dim">
              {match.teams
                ? "The host is still working on the teams. They appear here once locked."
                : isHost
                  ? joined.length < 2
                    ? "Teams need at least two players. Share the match, or add sample players to try it out."
                    : "Press Generate teams when you're ready. You can shuffle as often as you like before locking."
                  : "The host hasn't picked teams yet."}
            </p>
          )}
        </section>

        <section aria-labelledby="squad-heading" className={showTeams ? "grid gap-12 lg:grid-cols-[minmax(0,22rem)_1fr]" : undefined}>
          {showTeams && match.teams ? (
            <div className="panel self-start p-5">
              <BalanceMeter a={lookup(match.teams.a)} b={lookup(match.teams.b)} />
            </div>
          ) : null}
          <div>
          {showTeams && match.teams ? (
            <div className="grid gap-8 sm:grid-cols-2">
              <TeamList title={TEAM_NAMES.a} swatch="bg-bib-a" players={lookup(match.teams.a)} meId={userId} />
              <TeamList title={TEAM_NAMES.b} swatch="bg-bib-b" players={lookup(match.teams.b)} meId={userId} />
              {match.teams.subs.length > 0 ? (
                <div className="sm:col-span-2">
                  <TeamList title="Subs" players={lookup(match.teams.subs)} meId={userId} />
                </div>
              ) : null}
            </div>
          ) : (
            <TeamList
              id="squad-heading"
              title={`Squad (${joined.length})`}
              players={joined}
              meId={userId}
              hostId={match.hostId}
              empty="Nobody has joined yet."
            />
          )}
          {waiting.length > 0 ? (
            <div className="mt-8">
              <TeamList title={`Waitlist (${waiting.length})`} players={waiting} meId={userId} ordered />
              <p className="field-hint">First in line gets the next place that opens up.</p>
            </div>
          ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function JoinControl({
  match,
  userId,
  mine,
  placesLeft,
}: {
  match: Match;
  userId: string | null;
  mine: "joined" | "waitlist" | undefined;
  placesLeft: number;
}) {
  if (!userId) {
    return (
      <Link href="/profile" className="btn">
        Create a profile to join
      </Link>
    );
  }
  if (match.status === "locked") {
    return <p className="text-sm text-chalk-dim">{mine === "joined" ? "You're playing." : "Teams are locked."}</p>;
  }
  if (mine) {
    const isHost = match.hostId === userId;
    return (
      <div className="flex items-center gap-4">
        <span className="font-semibold">{mine === "joined" ? "You're in" : "You're on the waitlist"}</span>
        {isHost ? null : (
          <button type="button" className="btn btn-line" onClick={() => actions.leave(match.id, userId)}>
            {mine === "joined" ? "Leave match" : "Leave waitlist"}
          </button>
        )}
      </div>
    );
  }
  return (
    <button type="button" className="btn" onClick={() => actions.join(match.id, userId)}>
      {placesLeft > 0 ? "Join match" : "Join waitlist"}
    </button>
  );
}

function PlaceCounter({ joined, max, needed }: { joined: number; max: number; needed: number }) {
  const short = needed - joined;
  return (
    <div className="chalk-rule mt-8 pt-6" aria-live="polite">
      <p>
        <span className="font-display text-4xl font-bold tabular-nums">{joined}</span>
        <span className="text-lg text-chalk-dim"> of {max} places taken</span>
        {short > 0 ? <span className="text-chalk-dim">. {short} more for full sides.</span> : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`size-3.5 rounded-full border border-chalk/70 ${i < joined ? "bg-glow border-glow shadow-[0_0_10px_var(--color-glow)]" : ""} ${
              i === needed - 1 ? "mr-2.5" : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function HostBar({ match, joined }: { match: Match; joined: Player[] }) {
  const locked = match.status === "locked";
  const emptyPlaces = match.maxPlayers - joined.length;

  function generate() {
    const result = balanceTeams(joined, { perSide: match.perSide, current: match.teams });
    actions.setTeams(match.id, result);
  }

  return (
    <div className="panel mt-8 p-5">
      <h2 className="font-sans text-sm font-semibold text-chalk-dim">Host controls</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {locked ? (
          <button type="button" className="btn" onClick={() => actions.unlock(match.id)}>
            Unlock teams
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={generate} disabled={joined.length < 2}>
              {match.teams ? "Shuffle teams" : "Generate teams"}
            </button>
            <button type="button" className="btn btn-line" onClick={() => actions.lock(match.id)} disabled={!match.teams}>
              Lock teams
            </button>
            {emptyPlaces > 0 ? (
              <button
                type="button"
                className="btn btn-line"
                onClick={() => actions.addSamplePlayers(match.id, emptyPlaces)}
              >
                Fill {emptyPlaces} {emptyPlaces === 1 ? "place" : "places"} with sample players
              </button>
            ) : null}
          </>
        )}
        <button
          type="button"
          className="btn btn-line ml-auto"
          onClick={() => {
            if (window.confirm("Cancel this match for everyone?")) actions.cancel(match.id);
          }}
        >
          Cancel match
        </button>
      </div>
      {match.visibility === "private" ? (
        <p className="field-hint">
          Invite code <span className="font-semibold tracking-wider text-chalk">{match.inviteCode}</span>
        </p>
      ) : null}
    </div>
  );
}

function TeamList({
  id,
  title,
  swatch,
  players,
  meId,
  hostId,
  ordered,
  empty,
}: {
  id?: string;
  title: string;
  swatch?: string;
  players: Player[];
  meId: string | null;
  hostId?: string;
  ordered?: boolean;
  empty?: string;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <h3 id={id} className="flex items-center gap-2.5 text-xl">
        {swatch ? <span aria-hidden className={`size-3.5 rounded-full ${swatch}`} /> : null}
        {title}
      </h3>
      {players.length === 0 && empty ? <p className="mt-3 text-chalk-dim">{empty}</p> : null}
      <List className="mt-3">
        {players.map((p, i) => (
          <li key={p.id} className="chalk-rule flex items-center gap-3 py-2.5">
            {ordered ? <span className="w-5 text-sm text-chalk-dim tabular-nums">{i + 1}</span> : null}
            <span className="w-9 font-display text-xl font-bold tabular-nums">{Math.round(ovr(p))}</span>
            <span className="min-w-0 flex-1 truncate">
              {p.name}
              {p.id === meId ? <span className="text-chalk-dim"> (you)</span> : null}
              {p.id === hostId ? <span className="text-chalk-dim"> (host)</span> : null}
              {p.sample ? <span className="text-chalk-dim"> (sample)</span> : null}
            </span>
            <span className="text-sm text-chalk-dim">
              {p.primaryPos}
              {p.canGk && p.primaryPos !== "GK" ? " / GK" : ""}
            </span>
          </li>
        ))}
      </List>
    </div>
  );
}

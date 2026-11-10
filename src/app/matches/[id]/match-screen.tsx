"use client";

import Link from "next/link";
import { use, useState } from "react";
import { BalanceMeter, TEAM_NAMES } from "@/components/balance-meter";
import { MatchSettings } from "@/components/match-settings";
import { RatingPanel } from "@/components/rating-panel";
import { RefereeSection } from "@/components/referee-bits";
import { TeamEditor } from "@/components/team-editor";
import { TeamStage } from "@/components/team-stage";
import { balanceTeams } from "@/lib/domain/balance";
import { ovr, withAdjustment } from "@/lib/domain/ratings";
import { rotationSchedule } from "@/lib/domain/rotation";
import { ODD_MODES, type LogEntry, type Match, type OddMode, type Player } from "@/lib/domain/types";
import { formatFee, formatSize, formatWhen } from "@/lib/format";
import { actions, joinedOf, useHydrated, useStore, waitlistOf } from "@/lib/store";

export function MatchScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { userId, players, matches, cloud } = useStore();

  if (!hydrated) return <div className="mx-auto max-w-6xl px-5 py-10" aria-busy="true" />;

  const match = matches.find((m) => m.id === id);
  if (!match) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-3xl">{cloud ? "We can't find this match" : "This match isn't on this device"}</h1>
        <p className="mt-4 text-chalk-dim">
          {cloud
            ? "The link may be mistyped, or the match was removed."
            : "Matches are stored in the browser they were created in, so a link opened somewhere else won't find it."}
        </p>
        <Link href="/matches" className="btn mt-6">
          Browse matches
        </Link>
      </div>
    );
  }

  const profiles = (ids: string[]) => ids.map((pid) => players[pid]).filter(Boolean) as Player[];
  // Everything on this page uses the host's rating for this match where there is one.
  const lookup = (ids: string[]) => profiles(ids).map((p) => withAdjustment(p, match.adjustments[p.id]));
  const joinedIds = joinedOf(match).map((p) => p.userId);
  const joined = lookup(joinedIds);
  const waiting = lookup(waitlistOf(match).map((p) => p.userId));
  const adjusted = new Set(Object.keys(match.adjustments));
  const isHost = match.hostId === userId;
  const mine = match.participants.find((p) => p.userId === userId);
  const locked = match.status === "locked";
  const cancelled = match.status === "cancelled";
  const placesLeft = match.maxPlayers - joined.length;
  const teams = match.teams && (locked || isHost) ? match.teams : null;
  const editing = Boolean(teams) && isHost && !locked && !cancelled;
  const joker = teams?.joker ? (lookup([teams.joker])[0] ?? null) : null;
  const tags = { meId: userId, hostId: match.hostId, adjusted };

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
        {cancelled ? null : match.refereeId && match.refereeId === userId ? (
          <p className="font-semibold">You&apos;re refereeing</p>
        ) : (
          <JoinControl match={match} userId={userId} mine={mine?.status} placesLeft={placesLeft} />
        )}
      </header>

      <PlaceCounter joined={joined.length} max={match.maxPlayers} needed={match.minPlayers} />

      {isHost && !cancelled ? <HostBar match={match} joined={joined} players={players} /> : null}

      <RefereeSection match={match} players={players} userId={userId} />

      <div className="mt-12 grid gap-12">
        <section aria-labelledby="teams-heading">
          <h2 id="teams-heading" className="text-2xl">
            Teams
          </h2>
          {teams ? (
            <>
              {!locked ? (
                <p className="mt-2 text-sm text-chalk-dim">Draft. Players see the teams once you lock them.</p>
              ) : null}
              <div className="mt-5">
                <TeamStage
                  a={lookup(teams.a)}
                  b={lookup(teams.b)}
                  joker={joker}
                  subs={lookup(teams.subs)}
                  label={`${TEAM_NAMES.a} against ${TEAM_NAMES.b}, ${teams.a.length} v ${teams.b.length}${joker ? `, with ${joker.name} as joker` : ""}`}
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
                    : "Press Generate teams when you're ready. You can shuffle, swap and pin as much as you like before locking."
                  : "The host hasn't picked teams yet."}
            </p>
          )}
        </section>

        {teams ? (
          <section aria-label="Balance and line-ups" className="grid gap-10 lg:grid-cols-[minmax(0,21rem)_1fr]">
            <div className="grid content-start gap-6 lg:sticky lg:top-24 lg:self-start">
              <div className="panel p-5">
                <BalanceMeter
                  a={lookup(teams.a)}
                  b={lookup(teams.b)}
                  fix={editing ? "try Suggest best swap, or shuffle" : undefined}
                />
              </div>
              <Rotation match={match} lookup={lookup} editable={editing} />
            </div>
            <div>
              {editing ? (
                <TeamEditor matchId={match.id} teams={teams} lookup={lookup} pins={match.pins} adjusted={adjusted} />
              ) : (
                <div className="grid gap-8 sm:grid-cols-2">
                  <TeamList title={TEAM_NAMES.a} swatch="bg-bib-a" players={lookup(teams.a)} {...tags} />
                  <TeamList title={TEAM_NAMES.b} swatch="bg-bib-b" players={lookup(teams.b)} {...tags} />
                  {joker ? (
                    <div className="sm:col-span-2">
                      <TeamList title="Joker" swatch="bg-[#7fd8ff]" players={[joker]} {...tags} />
                      <p className="field-hint">Plays for whichever side has the ball.</p>
                    </div>
                  ) : null}
                  {teams.subs.length > 0 ? (
                    <div className="sm:col-span-2">
                      <TeamList title="Subs" swatch="bg-[#93a4a8]" players={lookup(teams.subs)} {...tags} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section>
            <TeamList
              title={`Squad (${joined.length})`}
              players={joined}
              {...tags}
              empty="Nobody has joined yet."
              onRemove={isHost && match.status === "open" ? (p) => actions.removePlayer(match.id, p.id) : undefined}
            />
          </section>
        )}

        {waiting.length > 0 ? (
          <section>
            <TeamList title={`Waitlist (${waiting.length})`} players={waiting} {...tags} ordered />
            <p className="field-hint">First in line gets the next place that opens up.</p>
          </section>
        ) : null}

        {isHost && match.status === "open" && joined.length > 0 ? (
          <RatingPanel matchId={match.id} players={profiles(joinedIds)} adjustments={match.adjustments} />
        ) : null}

        {match.log.length > 0 ? <ChangeLog log={match.log} isHost={isHost} /> : null}
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

function HostBar({ match, joined, players }: { match: Match; joined: Player[]; players: Record<string, Player> }) {
  const [editing, setEditing] = useState(false);
  const locked = match.status === "locked";
  const emptyPlaces = match.maxPlayers - joined.length;
  const pinned = Object.keys(match.pins).length;
  const odd = joined.length % 2 === 1;

  function generate() {
    const result = balanceTeams(joined, {
      perSide: match.perSide,
      mode: match.oddMode,
      pins: match.pins,
      current: match.teams,
    });
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
          className="btn btn-line"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close settings" : `Edit match (${match.perSide}v${match.perSide})`}
        </button>
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
      {match.teams && pinned > 0 && !locked ? (
        <p className="field-hint">
          {pinned} pinned {pinned === 1 ? "player stays" : "players stay"} put when you shuffle.
        </p>
      ) : null}

      {editing ? <MatchSettings match={match} players={players} onDone={() => setEditing(false)} /> : null}

      {locked ? null : (
        <div className="chalk-rule mt-5 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold" id="odd-mode-label">
              If the numbers are odd
            </span>
            <div className="seg" role="group" aria-labelledby="odd-mode-label">
              {(Object.keys(ODD_MODES) as OddMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={match.oddMode === mode}
                  onClick={() => actions.setOddMode(match.id, mode)}
                >
                  {ODD_MODES[mode].label}
                </button>
              ))}
            </div>
          </div>
          <p className="field-hint">
            {ODD_MODES[match.oddMode].hint}
            {odd
              ? ` There are ${joined.length} players, so this applies now.`
              : ` There are ${joined.length} players, an even number, so it isn't needed yet.`}
            {match.oddMode === "uneven" && odd && joined.length > match.perSide * 2
              ? " Both sides are already full, so the spare player is a sub."
              : ""}
          </p>
        </div>
      )}

      {match.visibility === "private" ? (
        <p className="field-hint">
          Invite code <span className="font-semibold tracking-wider text-chalk">{match.inviteCode}</span>
        </p>
      ) : null}
    </div>
  );
}

const LENGTHS = [40, 50, 60, 90];
const INTERVALS = [5, 10, 15, 20];

function Rotation({
  match,
  lookup,
  editable,
}: {
  match: Match;
  lookup: (ids: string[]) => Player[];
  editable: boolean;
}) {
  const teams = match.teams;
  if (!teams || teams.subs.length === 0) return null;
  const changes = rotationSchedule(lookup(teams.a), lookup(teams.b), lookup(teams.subs), match.minutes, match.rotateEvery);

  return (
    <div className="panel p-5">
      <h3 className="text-xl">Sub rotation</h3>
      {editable ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-chalk-dim">
            Match length
            <select
              className="input mt-1"
              value={match.minutes}
              onChange={(e) => actions.setRotation(match.id, Number(e.target.value), match.rotateEvery)}
            >
              {LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-chalk-dim">
            Change every
            <select
              className="input mt-1"
              value={match.rotateEvery}
              onChange={(e) => actions.setRotation(match.id, match.minutes, Number(e.target.value))}
            >
              {INTERVALS.map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="mt-1 text-sm text-chalk-dim">
          {match.minutes} minutes, changes every {match.rotateEvery}.
        </p>
      )}
      {changes.length === 0 ? (
        <p className="mt-4 text-sm text-chalk-dim">No changes fit in a match this short.</p>
      ) : (
        <ol className="mt-4 thin-scroll max-h-80 overflow-y-auto pr-2" data-lenis-prevent>
          {changes.map((c, i) => (
            <li key={i} className="chalk-rule flex items-baseline gap-3 py-2 text-sm">
              <span className="w-9 shrink-0 font-display text-base font-bold tabular-nums">{c.minute}&prime;</span>
              <span aria-hidden className={`size-2.5 shrink-0 translate-y-[-1px] rounded-full ${c.side === "a" ? "bg-bib-a" : "bg-bib-b"}`} />
              <span className="min-w-0">
                <span className="sr-only">{TEAM_NAMES[c.side]}: </span>
                {c.on.name} on <span className="text-chalk-dim">for {c.off.name}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="field-hint">Keepers stay in goal and nobody changes sides: each sub rotates within one team.</p>
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function ChangeLog({ log, isHost }: { log: LogEntry[]; isHost: boolean }) {
  return (
    <details className="panel group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-xl">Host changes</h2>
        <span className="text-sm text-chalk-dim">
          {log.length} so far. Latest: {log[0].detail}
        </span>
        <span className="ml-auto text-sm font-semibold text-chalk-dim group-open:hidden">Open</span>
        <span className="ml-auto hidden text-sm font-semibold text-chalk-dim group-open:inline">Close</span>
      </summary>
      <div className="px-5 pb-5">
        <p className="text-sm text-chalk-dim">
          {isHost
            ? "Everything you change is listed here for the players to see."
            : "Everything the host changes is listed here, so nothing happens in secret."}
        </p>
        <ol className="mt-3 thin-scroll max-h-96 overflow-y-auto pr-2" data-lenis-prevent>
          {log.map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="chalk-rule flex flex-wrap items-baseline gap-x-4 py-2 text-sm">
              <time className="w-36 shrink-0 text-chalk-dim tabular-nums" dateTime={new Date(entry.at).toISOString()}>
                {timeFmt.format(entry.at)}
              </time>
              <span className="min-w-0 flex-1">{entry.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function TeamList({
  title,
  swatch,
  players,
  meId,
  hostId,
  adjusted,
  ordered,
  empty,
  onRemove,
}: {
  title: string;
  swatch?: string;
  players: Player[];
  meId: string | null;
  hostId: string;
  adjusted: Set<string>;
  ordered?: boolean;
  empty?: string;
  onRemove?: (p: Player) => void;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <h3 className="flex items-center gap-2.5 text-xl">
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
              {adjusted.has(p.id) ? <span className="text-warn"> (host adjusted)</span> : null}
            </span>
            <span className="text-sm text-chalk-dim">
              {p.primaryPos}
              {p.canGk && p.primaryPos !== "GK" ? " / GK" : ""}
            </span>
            {onRemove && p.id !== hostId ? (
              <button
                type="button"
                className="text-sm text-chalk-dim underline underline-offset-4 hover:text-chalk"
                onClick={() => {
                  if (window.confirm(`Remove ${p.name} from this match?`)) onRemove(p);
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </List>
    </div>
  );
}

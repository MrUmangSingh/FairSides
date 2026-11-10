"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TEAM_NAMES } from "@/components/balance-meter";
import { clockMs, formatClock, hasStarted, isSecondYellow, summarise } from "@/lib/domain/referee";
import type { Clock, EventKind, Match, MatchEvent, Player, Side } from "@/lib/domain/types";
import { actions, canReferee } from "@/lib/store";

/** The current time, ticking while `active`. */
export function useNow(active: boolean, every = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

export function CardIcon({ kind, className = "" }: { kind: "yellow" | "red"; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-2.5 shrink-0 rotate-6 rounded-[2px] ${
        kind === "red" ? "bg-card-red" : "bg-card-yellow"
      } shadow-[0_1px_4px_rgb(0_0_0/0.5)] ${className}`}
    />
  );
}

export function BallIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-3.5 shrink-0 ${className}`}>
      {/* currentColor, so it shows on light buttons and dark rows alike */}
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6l3.1 2.3-1.2 3.6H6.1L4.9 6.9z" fill="currentColor" />
    </svg>
  );
}

export function EventIcon({ kind, secondYellow = false }: { kind: EventKind; secondYellow?: boolean }) {
  if (kind === "goal") return <BallIcon />;
  if (!secondYellow) return <CardIcon kind={kind} />;
  return (
    <span className="flex">
      <CardIcon kind="yellow" />
      <CardIcon kind="red" className="-ml-1" />
    </span>
  );
}

export function describeEvent(e: MatchEvent, events: MatchEvent[], name: (id: string) => string): string {
  const who = e.playerId ? name(e.playerId) : null;
  if (e.kind === "goal") return `Goal for ${TEAM_NAMES[e.side ?? "a"]}${who ? `, ${who}` : ""}`;
  if (e.kind === "red") return `Red card for ${who}`;
  return isSecondYellow(events, e) ? `Second yellow for ${who}, sent off` : `Yellow card for ${who}`;
}

export const minuteLabel = (m: number | null) => (m === null ? "–" : `${m}′`);

/** "Not started", "34:12 of 60 min", "Paused at 30:00". */
export function clockStatus(c: Clock, ms: number, minutes: number) {
  if (!hasStarted(c)) return "Not started";
  const over = ms - minutes * 60_000;
  const tail = over > 0 ? `${Math.ceil(over / 60_000)} min over ${minutes}` : `of ${minutes} min`;
  return c.running ? tail : `Paused, ${tail}`;
}

/**
 * The score, scorers, cards and clock, for everyone on the match page. Only shown
 * once the referee has started the clock or recorded something.
 */
export function LiveBoard({ match, players }: { match: Match; players: Record<string, Player> }) {
  const now = useNow(match.clock.running, 1000);
  const { score } = summarise(match.events);
  const ms = clockMs(match.clock, now);
  const name = (id: string) => players[id]?.name ?? "A player";
  const goals = (side: Side) => match.events.filter((e) => e.kind === "goal" && e.side === side);
  const cards = match.events.filter((e) => e.kind !== "goal");

  return (
    <div className="chalk-rule mt-5 pt-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
        {(["a", "b"] as const).map((side, i) => (
          <div key={side} className={i === 0 ? "text-right" : "order-3"}>
            <p className={`flex items-center gap-2 text-sm font-semibold ${i === 0 ? "justify-end" : ""}`}>
              <span aria-hidden className={`size-3 rounded-full ${side === "a" ? "bg-bib-a" : "bg-bib-b"}`} />
              {TEAM_NAMES[side]}
            </p>
            <ul className="mt-2 text-sm text-chalk-dim">
              {goals(side).map((g) => (
                <li key={g.id}>
                  {g.playerId ? name(g.playerId) : "Goal"} {minuteLabel(g.minute)}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="order-2 text-center">
          <p className="font-display text-5xl font-bold tabular-nums" aria-label={`${score.a} to ${score.b}`}>
            {score.a}
            <span className="px-2 text-chalk-dim">–</span>
            {score.b}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm tabular-nums text-chalk-dim">
            {match.clock.running ? (
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-glow shadow-[0_0_8px_var(--color-glow)]" />
            ) : null}
            {hasStarted(match.clock) ? formatClock(ms) : "Not started"}
          </p>
        </div>
      </div>
      {cards.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <CardIcon kind={c.kind === "red" || isSecondYellow(match.events, c) ? "red" : "yellow"} />
              {name(c.playerId ?? "")} <span className="text-chalk-dim">{minuteLabel(c.minute)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Who is refereeing, the buttons to take it on or hand it back, and the live board. */
export function RefereeSection({
  match,
  players,
  userId,
}: {
  match: Match;
  players: Record<string, Player>;
  userId: string | null;
}) {
  const referee = match.refereeId ? players[match.refereeId] : null;
  const isRef = Boolean(userId) && match.refereeId === userId;
  const isHost = match.hostId === userId;
  const active = match.status === "open" || match.status === "locked";
  const showBoard = hasStarted(match.clock) || match.events.length > 0;
  if (!active && !showBoard) return null;

  const inSquad = match.participants.some((p) => p.userId === userId);
  const volunteer = userId && active && canReferee(match, userId);

  return (
    <section className="panel mt-6 p-5" aria-labelledby="referee-heading">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 id="referee-heading" className="text-xl">
            Referee
          </h2>
          <p className="mt-1 text-sm text-chalk-dim">
            {isRef
              ? "You're refereeing. Open the referee view on your phone at the ground."
              : referee
              ? `${referee.name} is refereeing.`
              : "Nobody yet. Someone who isn't playing can run the clock and show the cards."}
          </p>
        </div>
        {isRef ? (
          <div className="flex flex-wrap gap-3">
            <Link href={`/matches/${match.id}/referee`} className="btn">
              Open referee view
            </Link>
            <button type="button" className="btn btn-line" onClick={() => actions.clearReferee(match.id)}>
              Step down
            </button>
          </div>
        ) : referee && isHost ? (
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              if (window.confirm(`Take the referee role off ${referee.name}?`)) actions.clearReferee(match.id);
            }}
          >
            Remove referee
          </button>
        ) : volunteer ? (
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              if (!inSquad || window.confirm("Refereeing means giving up your place in the squad. Go ahead?")) {
                actions.becomeReferee(match.id);
              }
            }}
          >
            Referee this match
          </button>
        ) : null}
      </div>
      {!referee && volunteer && inSquad ? (
        <p className="field-hint">You&apos;ll give up your place in the squad to referee.</p>
      ) : null}
      {showBoard ? <LiveBoard match={match} players={players} /> : null}
    </section>
  );
}

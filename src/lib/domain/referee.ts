import type { Clock, MatchEvent, Side, Teams } from "./types";

export const STOPPED: Clock = { running: false, elapsed: 0, since: null };

/** Milliseconds on the clock at `now`. */
export function clockMs(c: Clock, now: number): number {
  return c.elapsed + (c.running && c.since !== null ? Math.max(0, now - c.since) : 0);
}

export function startClock(c: Clock, now: number): Clock {
  return c.running ? c : { running: true, elapsed: c.elapsed, since: now };
}

export function pauseClock(c: Clock, now: number): Clock {
  return c.running ? { running: false, elapsed: clockMs(c, now), since: null } : c;
}

export const hasStarted = (c: Clock) => c.running || c.elapsed > 0;

/** The minute a referee would write down: 0:00 to 0:59 is the 1st minute. Null before kick-off. */
export function matchMinute(c: Clock, now: number): number | null {
  return hasStarted(c) ? Math.floor(clockMs(c, now) / 60_000) + 1 : null;
}

/** 7:05, or 63:20. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface Tally {
  goals: number;
  yellows: number;
  red: boolean;
  /** A straight red, or a second yellow. */
  sentOff: boolean;
}

const BLANK: Tally = { goals: 0, yellows: 0, red: false, sentOff: false };

export interface Summary {
  score: { [S in Side]: number };
  players: Record<string, Tally>;
}

/** The score and each player's goals and cards, from the referee's events. */
export function summarise(events: MatchEvent[]): Summary {
  const score = { a: 0, b: 0 };
  const players: Summary["players"] = {};
  for (const e of events) {
    if (e.kind === "goal" && e.side) score[e.side]++;
    if (!e.playerId) continue;
    const r = { ...(players[e.playerId] ?? BLANK) };
    if (e.kind === "goal") r.goals++;
    else if (e.kind === "yellow") r.yellows++;
    else r.red = true;
    r.sentOff = r.red || r.yellows >= 2;
    players[e.playerId] = r;
  }
  return { score, players };
}

export const tallyOf = (s: Summary, id: string): Tally => s.players[id] ?? BLANK;

/** Which team a player is on, or null for subs and the joker. */
export function sideOf(t: Teams, id: string): Side | null {
  if (t.a.includes(id)) return "a";
  if (t.b.includes(id)) return "b";
  return null;
}

/** True when this yellow is the player's second, which sends them off. */
export function isSecondYellow(events: MatchEvent[], event: MatchEvent): boolean {
  if (event.kind !== "yellow" || !event.playerId) return false;
  const yellows = events.filter((e) => e.kind === "yellow" && e.playerId === event.playerId);
  return yellows.indexOf(event) === 1;
}

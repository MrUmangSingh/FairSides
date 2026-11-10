export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Foot = "left" | "right" | "both";
export type Playstyle = "attacking" | "balanced" | "defensive";

export const STAT_KEYS = [
  "pace",
  "stamina",
  "shooting",
  "passing",
  "dribbling",
  "defending",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  pace: "Pace",
  stamina: "Stamina",
  shooting: "Shooting",
  passing: "Passing",
  dribbling: "Dribbling",
  defending: "Defending",
};

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
};

export interface Player {
  id: string;
  name: string;
  stats: Stats;
  /** Single goalkeeping rating, used when the player keeps goal. */
  gk: number;
  primaryPos: Position;
  secondaryPos: Position | null;
  foot: Foot;
  canGk: boolean;
  playstyle: Playstyle;
  /** Sample players exist only to try the app without a full squad. */
  sample?: boolean;
}

export type MatchStatus = "open" | "locked" | "completed" | "cancelled";

export interface Participant {
  userId: string;
  status: "joined" | "waitlist";
  joinedAt: number;
}

export type OddMode = "sub" | "uneven" | "joker";
export type Side = "a" | "b";
export type Zone = Side | "subs";

export const ODD_MODES: Record<OddMode, { label: string; hint: string }> = {
  sub: {
    label: "Rolling sub",
    hint: "Equal teams. The spare player rotates in every few minutes.",
  },
  uneven: {
    label: "Uneven teams",
    hint: "Everyone plays. The bigger team gets the weaker players to make up for it.",
  },
  joker: {
    label: "Joker",
    hint: "Equal teams, plus one neutral player who plays for whichever side has the ball.",
  },
};

export interface Teams {
  a: string[];
  b: string[];
  subs: string[];
  /** Neutral player in joker mode. */
  joker: string | null;
  version: number;
}

/** The host's rating for one player, for this match only. */
export interface Adjustment {
  stats: Stats;
  gk: number;
}

export interface LogEntry {
  /** Stable id, so an entry reworded in place is the same row in the database. */
  id?: string;
  at: number;
  action: "generate" | "shuffle" | "move" | "swap" | "pin" | "lock" | "rating" | "mode" | "remove" | "settings";
  detail: string;
}

/** The referee's match clock. Times are in milliseconds. */
export interface Clock {
  running: boolean;
  /** Time banked before `since`. */
  elapsed: number;
  /** When the clock last started (epoch ms), or null while it is stopped. */
  since: number | null;
}

export type EventKind = "goal" | "yellow" | "red";

/** A goal or card the referee recorded. */
export interface MatchEvent {
  id: string;
  at: number;
  /** Match minute, or null if the clock was never started. */
  minute: number | null;
  kind: EventKind;
  /** The team a goal counts for. */
  side: Side | null;
  /** The scorer or the booked player; null for a goal with no scorer named. */
  playerId: string | null;
}

export interface Match {
  id: string;
  hostId: string;
  title: string;
  venue: string;
  datetime: string;
  perSide: number;
  maxPlayers: number;
  minPlayers: number;
  fee: number;
  visibility: "public" | "private";
  inviteCode: string;
  status: MatchStatus;
  participants: Participant[];
  teams: Teams | null;
  oddMode: OddMode;
  /** Players the host has fixed to a side; they stay put on shuffle. */
  pins: Record<string, Side>;
  adjustments: Record<string, Adjustment>;
  log: LogEntry[];
  /** Match length and how often subs rotate, in minutes. */
  minutes: number;
  rotateEvery: number;
  /** A player who referees instead of playing. */
  refereeId: string | null;
  clock: Clock;
  /** Oldest first. */
  events: MatchEvent[];
}

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

export interface Teams {
  a: string[];
  b: string[];
  subs: string[];
  version: number;
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
}

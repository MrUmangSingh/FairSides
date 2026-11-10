import { attack, defense, ovr } from "./ratings";
import type { Player, Teams } from "./types";

/** Cost weights from plan §7.2. Tune from real matches later. */
export const WEIGHTS = { strength: 1.0, attack: 0.5, defense: 0.5, stamina: 0.3, position: 5, noKeeper: 60 };

const RESTARTS = 200;
const FAIR_TOLERANCE = 0.03;

interface Rated {
  id: string;
  ovr: number;
  attack: number;
  defense: number;
  stamina: number;
  pos: Player["primaryPos"];
  canGk: boolean;
}

const rate = (p: Player): Rated => ({
  id: p.id,
  ovr: ovr(p),
  attack: attack(p),
  defense: defense(p),
  stamina: p.stats.stamina,
  pos: p.primaryPos,
  canGk: p.canGk || p.primaryPos === "GK",
});

const sum = (xs: Rated[], f: (r: Rated) => number) => xs.reduce((s, x) => s + f(x), 0);
const count = (xs: Rated[], pos: Rated["pos"]) => xs.filter((x) => x.pos === pos).length;

function cost(a: Rated[], b: Rated[], keepersAvailable: number): number {
  let c =
    WEIGHTS.strength * Math.abs(sum(a, (r) => r.ovr) - sum(b, (r) => r.ovr)) +
    WEIGHTS.attack * Math.abs(sum(a, (r) => r.attack) - sum(b, (r) => r.attack)) +
    WEIGHTS.defense * Math.abs(sum(a, (r) => r.defense) - sum(b, (r) => r.defense)) +
    WEIGHTS.stamina * Math.abs(sum(a, (r) => r.stamina) - sum(b, (r) => r.stamina));
  for (const pos of ["DEF", "MID", "FWD"] as const) {
    c += WEIGHTS.position * Math.abs(count(a, pos) - count(b, pos));
  }
  const keepersA = a.filter((r) => r.canGk).length;
  const keepersB = b.filter((r) => r.canGk).length;
  if (keepersAvailable >= 2) {
    if (keepersA === 0) c += WEIGHTS.noKeeper;
    if (keepersB === 0) c += WEIGHTS.noKeeper;
  }
  return c;
}

function hillClimb(a: Rated[], b: Rated[], keepers: number): number {
  let best = cost(a, b, keepers);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        [a[i], b[j]] = [b[j], a[i]];
        const c = cost(a, b, keepers);
        if (c < best - 1e-9) {
          best = c;
          improved = true;
        } else {
          [a[i], b[j]] = [b[j], a[i]];
        }
      }
    }
  }
  return best;
}

/** Snake draft by rating: A, B, B, A, A, B… A solid deterministic start. */
function snakeSplit(pool: Rated[]): [Rated[], Rated[]] {
  const sorted = pool.toSorted((x, y) => y.ovr - x.ovr);
  const a: Rated[] = [];
  const b: Rated[] = [];
  sorted.forEach((r, i) => ((i % 4 === 0 || i % 4 === 3) ? a : b).push(r));
  return [a, b];
}

function randomSplit(pool: Rated[], rng: () => number): [Rated[], Rated[]] {
  const xs = pool.slice();
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  const half = xs.length / 2;
  return [xs.slice(0, half), xs.slice(half)];
}

const splitKey = (a: string[], b: string[]) => {
  const ka = a.toSorted().join(",");
  const kb = b.toSorted().join(",");
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export interface BalanceOptions {
  perSide: number;
  /** Current teams; shuffle returns a different fair split when one exists. */
  current?: Pick<Teams, "a" | "b"> | null;
  rng?: () => number;
}

export interface BalanceResult {
  a: string[];
  b: string[];
  subs: string[];
}

/**
 * Splits players (in join order) into two fair teams. Anyone beyond two full
 * sides, and the odd one out, goes to the subs list — latest joiners first.
 * Phase 2 adds the other odd-player modes.
 */
export function balanceTeams(players: Player[], opts: BalanceOptions): BalanceResult {
  const rng = opts.rng ?? Math.random;
  const size = Math.min(opts.perSide, Math.floor(players.length / 2));
  const onPitch = players.slice(0, size * 2).map(rate);
  const subs = players.slice(size * 2).map((p) => p.id);
  if (size === 0) return { a: [], b: [], subs };

  const keepers = onPitch.filter((r) => r.canGk).length;
  const found = new Map<string, { a: string[]; b: string[]; cost: number }>();

  for (let restart = 0; restart < RESTARTS; restart++) {
    const [a, b] = restart === 0 ? snakeSplit(onPitch) : randomSplit(onPitch, rng);
    const c = hillClimb(a, b, keepers);
    const ids = { a: a.map((r) => r.id), b: b.map((r) => r.id) };
    found.set(splitKey(ids.a, ids.b), { ...ids, cost: c });
  }

  const all = [...found.values()];
  const best = Math.min(...all.map((r) => r.cost));
  // "Fair" = within 3% of one team's total strength of the best split found.
  const slack = FAIR_TOLERANCE * (sum(onPitch, (r) => r.ovr) / 2);
  let fair = all.filter((r) => r.cost <= best + slack);

  if (opts.current) {
    const currentKey = splitKey(opts.current.a, opts.current.b);
    const others = fair.filter((r) => splitKey(r.a, r.b) !== currentKey);
    if (others.length > 0) fair = others;
  }

  const pick = fair[Math.floor(rng() * fair.length)];
  // Randomise which bib colour each side gets so "Team A" isn't always the snake-draft leader.
  return rng() < 0.5 ? { a: pick.a, b: pick.b, subs } : { a: pick.b, b: pick.a, subs };
}

export interface TeamSummary {
  size: number;
  strength: number;
  avgOvr: number;
  attack: number;
  defense: number;
  stamina: number;
}

export function summarize(team: Player[]): TeamSummary {
  const r = team.map(rate);
  const strength = sum(r, (x) => x.ovr);
  return {
    size: r.length,
    strength,
    avgOvr: r.length ? strength / r.length : 0,
    attack: sum(r, (x) => x.attack),
    defense: sum(r, (x) => x.defense),
    stamina: sum(r, (x) => x.stamina),
  };
}

/** Percentage by which the stronger team leads; 0 when level. */
export function strengthGap(a: TeamSummary, b: TeamSummary): { leader: "a" | "b" | null; pct: number } {
  const lo = Math.min(a.strength, b.strength);
  if (lo === 0) return { leader: null, pct: 0 };
  const pct = (Math.abs(a.strength - b.strength) / lo) * 100;
  if (pct < 0.05) return { leader: null, pct: 0 };
  return { leader: a.strength > b.strength ? "a" : "b", pct };
}

import { attack, defense, ovr } from "./ratings";
import type { OddMode, Player, Side, Teams } from "./types";

/** Cost weights from plan §7.2. Tune from real matches later. */
export const WEIGHTS = { strength: 1.0, attack: 0.5, defense: 0.5, stamina: 0.3, position: 5, noKeeper: 60 };

/**
 * Plan §6.3: one extra player is worth about 60% of an average player in a
 * 7-a-side game. Raw totals count the extra body as a whole player and
 * averages count it as nothing; the truth is in between, so the bigger team's
 * totals are marked down by the part of an average player the extra body is
 * NOT worth. (The plan's literal "bigger total + bonus = smaller total" cannot
 * be met by a normal squad: it needs the six best to outscore the other seven.)
 */
export const EXTRA_PLAYER_FACTOR = 0.6;

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

/** The extra-player factor grows as the game gets smaller: one extra in 4v4 is huge, in 10v10 small. */
export function extraPlayerFactor(smallerSide: number): number {
  if (smallerSide <= 0) return 0;
  return Math.max(0.3, Math.min(1, (EXTRA_PLAYER_FACTOR * 7) / smallerSide));
}

/** Everything the cost needs that does not change while players are swapped around. */
interface Context {
  keepers: number;
  /** Marked off the bigger team's totals for each extra body, per measure. */
  discount: { ovr: number; attack: number; defense: number; stamina: number };
}

function context(a: Rated[], b: Rated[]): Context {
  const all = [...a, ...b];
  const off = a.length === b.length ? 0 : 1 - extraPlayerFactor(Math.min(a.length, b.length));
  const avg = (f: (r: Rated) => number) => (all.length ? sum(all, f) / all.length : 0);
  return {
    keepers: all.filter((r) => r.canGk).length,
    discount: {
      ovr: off * avg((r) => r.ovr),
      attack: off * avg((r) => r.attack),
      defense: off * avg((r) => r.defense),
      stamina: off * avg((r) => r.stamina),
    },
  };
}

function cost(a: Rated[], b: Rated[], ctx: Context): number {
  // Positive when A has more players: A's totals are marked down, so A ends up weaker per player.
  const extra = a.length - b.length;
  const d = ctx.discount;
  let c =
    WEIGHTS.strength * Math.abs(sum(a, (r) => r.ovr) - sum(b, (r) => r.ovr) - extra * d.ovr) +
    WEIGHTS.attack * Math.abs(sum(a, (r) => r.attack) - sum(b, (r) => r.attack) - extra * d.attack) +
    WEIGHTS.defense * Math.abs(sum(a, (r) => r.defense) - sum(b, (r) => r.defense) - extra * d.defense) +
    // The smaller team gets no rest, so stamina counts double when the sides are uneven.
    WEIGHTS.stamina *
      (extra === 0 ? 1 : 2) *
      Math.abs(sum(a, (r) => r.stamina) - sum(b, (r) => r.stamina) - extra * d.stamina);
  for (const pos of ["DEF", "MID", "FWD"] as const) {
    c += WEIGHTS.position * Math.abs(count(a, pos) - count(b, pos));
  }
  if (ctx.keepers >= 2) {
    if (!a.some((r) => r.canGk)) c += WEIGHTS.noKeeper;
    if (!b.some((r) => r.canGk)) c += WEIGHTS.noKeeper;
  }
  return c;
}

function hillClimb(a: Rated[], b: Rated[], ctx: Context, fixed: Set<string>): number {
  let best = cost(a, b, ctx);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < a.length; i++) {
      if (fixed.has(a[i].id)) continue;
      for (let j = 0; j < b.length; j++) {
        if (fixed.has(b[j].id)) continue;
        [a[i], b[j]] = [b[j], a[i]];
        const c = cost(a, b, ctx);
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

const splitKey = (a: string[], b: string[]) => {
  const ka = a.toSorted().join(",");
  const kb = b.toSorted().join(",");
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export interface BalanceOptions {
  perSide: number;
  /** What to do with an odd player out. Defaults to a rolling sub. */
  mode?: OddMode;
  /** Players fixed to a side. They are always on the pitch and never swapped. */
  pins?: Record<string, Side>;
  /** Current teams; shuffle returns a different fair split when one exists. */
  current?: Pick<Teams, "a" | "b"> | null;
  rng?: () => number;
}

export type BalanceResult = Omit<Teams, "version">;

/** A mid-rated player with good lungs makes the best neutral: they play the whole match for both sides. */
function pickJoker(pool: Rated[], pinned: Set<string>): Rated {
  const free = pool.filter((r) => !pinned.has(r.id));
  const from = free.length ? free : pool;
  const sorted = pool.map((r) => r.ovr).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  return from.reduce((best, r) => {
    const score = (x: Rated) => -Math.abs(x.ovr - median) + 0.15 * x.stamina;
    return score(r) > score(best) ? r : best;
  });
}

/**
 * Splits players (in join order) into two fair teams.
 *
 * With an odd count the mode decides: "sub" keeps teams equal and benches the
 * spare, "uneven" plays N v N+1 with the bigger team weaker on paper, "joker"
 * names one neutral player. Anyone beyond two full sides is a sub, latest
 * joiners first.
 */
export function balanceTeams(players: Player[], opts: BalanceOptions): BalanceResult {
  const rng = opts.rng ?? Math.random;
  const mode = opts.mode ?? "sub";
  const size = Math.min(opts.perSide, Math.floor(players.length / 2));
  if (size === 0) return { a: [], b: [], subs: players.map((p) => p.id), joker: null };

  const ids = new Set(players.map((p) => p.id));
  const pins = Object.fromEntries(Object.entries(opts.pins ?? {}).filter(([id]) => ids.has(id)));
  // Pinned players go first so they are never the ones left on the bench.
  const ordered = [...players.filter((p) => pins[p.id]), ...players.filter((p) => !pins[p.id])].map(rate);
  const odd = players.length % 2 === 1;

  let joker: Rated | null = null;
  let pitch = ordered.slice(0, size * 2);
  let bench = ordered.slice(size * 2);
  if (odd && mode === "uneven" && size < opts.perSide) {
    pitch = ordered.slice(0, size * 2 + 1);
    bench = ordered.slice(size * 2 + 1);
  } else if (odd && mode === "joker") {
    const pool = ordered.slice(0, size * 2 + 1);
    const picked = pickJoker(pool, new Set(Object.keys(pins)));
    joker = picked;
    pitch = pool.filter((r) => r !== picked);
    bench = ordered.slice(size * 2 + 1);
  }

  const wantA = pitch.filter((r) => pins[r.id] === "a");
  const wantB = pitch.filter((r) => pins[r.id] === "b");
  let capA = size;
  let capB = size;
  if (pitch.length > size * 2) {
    // The side with more pinned players takes the extra body; otherwise it is a coin toss.
    const bigA = wantA.length !== wantB.length ? wantA.length > wantB.length : rng() < 0.5;
    if (bigA) capA++;
    else capB++;
  }
  // More pins than places on a side: the overflow is treated as unpinned.
  const fixedA = wantA.slice(0, capA);
  const fixedB = wantB.slice(0, capB);
  const fixed = new Set([...fixedA, ...fixedB].map((r) => r.id));
  const free = pitch.filter((r) => !fixed.has(r.id));

  const ctx = context(pitch.slice(0, capA), pitch.slice(capA));
  const found = new Map<string, { a: string[]; b: string[]; cost: number }>();

  for (let restart = 0; restart < RESTARTS; restart++) {
    const a = fixedA.slice();
    const b = fixedB.slice();
    if (restart === 0) {
      // Deterministic start: strongest first, each to whichever side is behind.
      for (const r of free.toSorted((x, y) => y.ovr - x.ovr)) {
        const toA = b.length >= capB || (a.length < capA && sum(a, (x) => x.ovr) <= sum(b, (x) => x.ovr));
        (toA ? a : b).push(r);
      }
    } else {
      const xs = free.slice();
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [xs[i], xs[j]] = [xs[j], xs[i]];
      }
      for (const r of xs) (a.length < capA ? a : b).push(r);
    }
    const c = hillClimb(a, b, ctx, fixed);
    const split = { a: a.map((r) => r.id), b: b.map((r) => r.id) };
    found.set(splitKey(split.a, split.b), { ...split, cost: c });
  }

  const all = [...found.values()];
  const best = Math.min(...all.map((r) => r.cost));
  // "Fair" = within 3% of one team's total strength of the best split found.
  const slack = FAIR_TOLERANCE * (sum(pitch, (r) => r.ovr) / 2);
  let fair = all.filter((r) => r.cost <= best + slack);

  if (opts.current) {
    const currentKey = splitKey(opts.current.a, opts.current.b);
    const others = fair.filter((r) => splitKey(r.a, r.b) !== currentKey);
    if (others.length > 0) fair = others;
  }

  const pick = fair[Math.floor(rng() * fair.length)];
  const rest = { subs: bench.map((r) => r.id), joker: joker?.id ?? null };
  // With no pins, randomise which bib colour each side gets so "Team A" isn't always the same lot.
  return fixed.size === 0 && rng() < 0.5 ? { a: pick.b, b: pick.a, ...rest } : { a: pick.a, b: pick.b, ...rest };
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
export function strengthGap(a: { strength: number }, b: { strength: number }): { leader: Side | null; pct: number } {
  const lo = Math.min(a.strength, b.strength);
  if (lo === 0) return { leader: null, pct: 0 };
  const pct = (Math.abs(a.strength - b.strength) / lo) * 100;
  if (pct < 0.05) return { leader: null, pct: 0 };
  return { leader: a.strength > b.strength ? "a" : "b", pct };
}

export interface Comparison {
  a: TeamSummary;
  b: TeamSummary;
  /** The bigger side, and the share of an average player each of its extra bodies counts as. */
  extra: { side: Side; players: number; factor: number } | null;
  gap: { leader: Side | null; pct: number };
}

/**
 * The balance meter's numbers. When one side has more players its totals are
 * the marked-down ones the balancer compares, so level bars mean a fair game.
 */
export function compareTeams(teamA: Player[], teamB: Player[]): Comparison {
  const a = summarize(teamA);
  const b = summarize(teamB);
  if (a.size === b.size || a.size === 0 || b.size === 0) return { a, b, extra: null, gap: strengthGap(a, b) };
  const ctx = context(teamA.map(rate), teamB.map(rate));
  const players = Math.abs(a.size - b.size);
  const side: Side = a.size > b.size ? "a" : "b";
  const big = side === "a" ? a : b;
  big.strength -= players * ctx.discount.ovr;
  big.attack -= players * ctx.discount.attack;
  big.defense -= players * ctx.discount.defense;
  big.stamina -= players * ctx.discount.stamina;
  const factor = extraPlayerFactor(Math.min(a.size, b.size));
  return { a, b, extra: { side, players, factor }, gap: strengthGap(a, b) };
}

export interface SwapSuggestion {
  /** Player leaving team A for team B, and the one coming the other way. */
  fromA: string;
  fromB: string;
}

/** The single swap that improves the balance most, or null when no swap helps. */
export function bestSwap(teamA: Player[], teamB: Player[], pins: Record<string, Side> = {}): SwapSuggestion | null {
  const a = teamA.map(rate);
  const b = teamB.map(rate);
  const ctx = context(a, b);
  let best = cost(a, b, ctx) - 1e-6;
  let found: SwapSuggestion | null = null;
  for (let i = 0; i < a.length; i++) {
    if (pins[a[i].id]) continue;
    for (let j = 0; j < b.length; j++) {
      if (pins[b[j].id]) continue;
      [a[i], b[j]] = [b[j], a[i]];
      const c = cost(a, b, ctx);
      [a[i], b[j]] = [b[j], a[i]];
      if (c < best) {
        best = c;
        found = { fromA: a[i].id, fromB: b[j].id };
      }
    }
  }
  return found;
}

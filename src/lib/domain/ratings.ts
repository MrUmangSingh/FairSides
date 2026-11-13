import { STAT_KEYS, type Adjustment, type Player, type Position, type RatingBook, type Stats } from "./types";

const mean = (...xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Overall-rating weights per outfield position (plan §3). Every stat counts for
 * every position, so no slider is dead; the position's key stats just count more.
 * Each row adds up to 1. A keeper's overall is their goalkeeping rating alone.
 */
export const OVR_WEIGHTS: Record<Exclude<Position, "GK">, Stats> = {
  FWD: { shooting: 0.28, dribbling: 0.22, pace: 0.2, passing: 0.14, stamina: 0.1, defending: 0.06 },
  MID: { passing: 0.26, dribbling: 0.18, stamina: 0.16, shooting: 0.14, defending: 0.13, pace: 0.13 },
  DEF: { defending: 0.36, stamina: 0.18, pace: 0.16, passing: 0.14, dribbling: 0.1, shooting: 0.06 },
};

export function ovrFor(stats: Stats, gk: number, pos: Position): number {
  if (pos === "GK") return gk;
  const w = OVR_WEIGHTS[pos];
  // Rounded off so float noise can't tip a .5 the wrong way when it is displayed.
  return Math.round(STAT_KEYS.reduce((s, k) => s + w[k] * stats[k], 0) * 1000) / 1000;
}

export const ovr = (p: Player) => ovrFor(p.stats, p.gk, p.primaryPos);
export const attack = (p: Player) => mean(p.stats.shooting, p.stats.dribbling, p.stats.pace);
/** Defending leads; stamina also has its own term in the balancer, so it is not counted twice here. */
export const defense = (p: Player) => mean(p.stats.defending, p.stats.defending, p.stats.stamina);

export const clampStat = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/** The player as the host rates them for this match; the profile itself is untouched. */
export function withAdjustment(p: Player, adj: Adjustment | undefined): Player {
  return adj ? { ...p, stats: adj.stats, gk: adj.gk } : p;
}

/**
 * Moves every stat by the same whole number so the displayed (rounded) overall lands
 * on the target. The weights add up to 1, so moving every stat by d moves the overall
 * by exactly d: one pass is exact unless a stat hits 1 or 99. (Aiming at the raw
 * overall instead overshoots by one whenever it sits on a .5.)
 */
export function shiftToOvr(p: Player, target: number): Adjustment {
  let stats = { ...p.stats };
  let gk = p.gk;
  for (let pass = 0; pass < 4; pass++) {
    const delta = Math.round(target) - Math.round(ovrFor(stats, gk, p.primaryPos));
    if (delta === 0) break;
    const next = {} as Stats;
    for (const k of STAT_KEYS) next[k] = clampStat(stats[k] + delta);
    stats = next;
    gk = clampStat(gk + delta);
  }
  return { stats, gk };
}

/** Same stats and keeping, whatever the `once` flag says. */
export const sameRating = (a: Adjustment, b: Adjustment) =>
  a.gk === b.gk && STAT_KEYS.every((k) => a.stats[k] === b.stats[k]);

/** The part of an adjustment that goes into the host's saved ratings. */
export const toSaved = (a: Adjustment): Adjustment => ({ stats: { ...a.stats }, gk: a.gk });

/**
 * Players in this match whose saved rating isn't in use here: they have none for
 * this match, or one that came from an older saved rating. One-off ratings stay.
 */
export function savedNotUsed(ids: string[], adjustments: Record<string, Adjustment>, book: RatingBook): string[] {
  return ids.filter((id) => {
    const saved = book[id];
    const here = adjustments[id];
    return saved && (!here || (!here.once && !sameRating(here, saved)));
  });
}

/** Fills in the host's saved rating for every listed player who has none for this match yet. */
export function withSaved(ids: string[], adjustments: Record<string, Adjustment>, book: RatingBook) {
  const missing = ids.filter((id) => book[id] && !adjustments[id]);
  if (missing.length === 0) return adjustments;
  return { ...adjustments, ...Object.fromEntries(missing.map((id) => [id, toSaved(book[id])])) };
}

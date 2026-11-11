import { STAT_KEYS, type Adjustment, type Player, type Position, type RatingBook, type Stats } from "./types";

const mean = (...xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Position-weighted overall rating (plan §3). In simple mode "Physical" is
 * the same number as Stamina, so DEF gets 0.30 on stamina in total.
 */
export function ovrFor(stats: Stats, gk: number, pos: Position): number {
  const s = stats;
  switch (pos) {
    case "FWD":
      return (
        0.3 * s.shooting + 0.25 * s.dribbling + 0.2 * s.pace + 0.15 * s.passing + 0.1 * s.stamina
      );
    case "MID":
      return (
        0.3 * s.passing + 0.2 * s.dribbling + 0.2 * s.stamina + 0.15 * s.defending + 0.15 * s.shooting
      );
    case "DEF":
      return 0.4 * s.defending + 0.2 * s.stamina + 0.15 * s.pace + 0.15 * s.passing + 0.1 * s.stamina;
    case "GK":
      return gk;
  }
}

export const ovr = (p: Player) => ovrFor(p.stats, p.gk, p.primaryPos);
export const attack = (p: Player) => mean(p.stats.shooting, p.stats.dribbling, p.stats.pace);
export const defense = (p: Player) => mean(p.stats.defending, p.stats.stamina, p.stats.stamina);

export const clampStat = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/** The player as the host rates them for this match; the profile itself is untouched. */
export function withAdjustment(p: Player, adj: Adjustment | undefined): Player {
  return adj ? { ...p, stats: adj.stats, gk: adj.gk } : p;
}

/**
 * Moves every stat by the same amount so the overall lands on the target.
 * The position weights add up to 1, so one pass is exact unless a stat hits 1 or 99.
 */
export function shiftToOvr(p: Player, target: number): Adjustment {
  let stats = { ...p.stats };
  let gk = p.gk;
  for (let pass = 0; pass < 4; pass++) {
    const delta = target - ovrFor(stats, gk, p.primaryPos);
    if (Math.abs(delta) < 0.5) break;
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

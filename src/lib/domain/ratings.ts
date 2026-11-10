import type { Player, Position, Stats } from "./types";

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

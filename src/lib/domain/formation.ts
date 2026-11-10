import { ovr } from "./ratings";
import type { Player } from "./types";

export interface Spot {
  player: Player;
  /** 0–100 across the pitch width. */
  x: number;
  /** 0 = own goal line, 100 = halfway line. */
  y: number;
  keeper: boolean;
}

/**
 * Lays out any number of players: one keeper if someone can play there, then
 * defence, midfield and attack lines built from each player's own position.
 */
export function formation(team: Player[]): Spot[] {
  if (team.length === 0) return [];
  const rest = team.slice();
  const spots: Spot[] = [];

  const keeperIdx = pickKeeper(rest);
  if (keeperIdx >= 0) {
    const [keeper] = rest.splice(keeperIdx, 1);
    spots.push({ player: keeper, x: 50, y: 0, keeper: true });
  }

  const lines: Player[][] = [
    rest.filter((p) => p.primaryPos === "DEF" || p.primaryPos === "GK"),
    rest.filter((p) => p.primaryPos === "MID"),
    rest.filter((p) => p.primaryPos === "FWD"),
  ];

  // Nobody should stand five-wide in a line while another line is empty.
  const maxPerLine = Math.max(1, Math.ceil(rest.length / 2));
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < 3; i++) {
      while (lines[i].length > maxPerLine) {
        const to = i === 1 ? (lines[0].length <= lines[2].length ? 0 : 2) : 1;
        lines[to].push(lines[i].pop()!);
      }
    }
  }

  const used = lines.filter((l) => l.length > 0);
  const ys = used.length === 1 ? [56] : used.length === 2 ? [32, 78] : [26, 56, 86];
  used.forEach((line, li) => {
    line.forEach((player, i) => {
      spots.push({ player, x: ((i + 1) / (line.length + 1)) * 100, y: ys[li], keeper: false });
    });
  });
  return spots;
}

function pickKeeper(team: Player[]): number {
  let best = -1;
  let bestScore = -Infinity;
  team.forEach((p, i) => {
    if (!(p.canGk || p.primaryPos === "GK")) return;
    // Prefer natural keepers; among stand-ins, the one whose outfield rating we lose least.
    const score = p.primaryPos === "GK" ? 1000 + p.gk : p.gk - ovr(p);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Shorthand like "3-2-1" for the outfield lines. */
export function formationLabel(spots: Spot[]): string {
  const rows = new Map<number, number>();
  for (const s of spots) if (!s.keeper) rows.set(s.y, (rows.get(s.y) ?? 0) + 1);
  return [...rows.entries()].sort((p, q) => p[0] - q[0]).map(([, n]) => n).join("-");
}

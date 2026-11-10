import { formation } from "./formation";
import type { Player, Side } from "./types";

export interface Change {
  minute: number;
  side: Side;
  on: Player;
  off: Player;
}

const stamina = (team: Player[]) => team.reduce((s, p) => s + p.stats.stamina, 0);

/**
 * Shares the subs between the two benches. Nobody changes sides mid-match, so
 * with an odd number the spare goes to the team with less stamina to spend.
 */
export function benches(a: Player[], b: Player[], subs: Player[]): Record<Side, Player[]> {
  const bench: Record<Side, Player[]> = { a: [], b: [] };
  for (const sub of subs) {
    const side: Side =
      bench.a.length !== bench.b.length
        ? bench.a.length < bench.b.length ? "a" : "b"
        : stamina(a) <= stamina(b) ? "a" : "b";
    bench[side].push(sub);
  }
  return bench;
}

/**
 * Rolling-sub schedule (plan §7.5). Every `every` minutes each team's bench
 * comes on. Whoever has rested least goes off, preferring the sub's own
 * position, then whoever has played longest. Keepers stay in goal.
 */
export function rotationSchedule(a: Player[], b: Player[], subs: Player[], minutes: number, every: number): Change[] {
  if (subs.length === 0 || every <= 0 || a.length + b.length === 0) return [];
  const on: Record<Side, Player[]> = { a: a.slice(), b: b.slice() };
  const bench = benches(a, b, subs);
  const keepers = new Set(
    [a, b].flatMap((team) => formation(team).filter((s) => s.keeper).map((s) => s.player.id)),
  );
  const played = new Map<string, number>();
  // Starting on the bench counts as a rest already.
  const rests = new Map<string, number>(subs.map((p) => [p.id, 1]));
  const changes: Change[] = [];

  for (let minute = every; minute < minutes; minute += every) {
    for (const p of [...on.a, ...on.b]) played.set(p.id, (played.get(p.id) ?? 0) + every);
    for (const side of ["a", "b"] as const) {
      const fresh = new Set<string>();
      for (let k = bench[side].length; k > 0; k--) {
        const sub = bench[side][0];
        const options = on[side].filter((p) => !keepers.has(p.id) && !fresh.has(p.id));
        if (options.length === 0) break;
        const key = (x: Player) =>
          -(rests.get(x.id) ?? 0) * 1000 + (x.primaryPos === sub.primaryPos ? 500 : 0) + (played.get(x.id) ?? 0);
        const off = options.reduce((best, p) => (key(p) > key(best) ? p : best));
        bench[side].shift();
        bench[side].push(off);
        on[side] = on[side].map((p) => (p === off ? sub : p));
        fresh.add(sub.id);
        rests.set(off.id, (rests.get(off.id) ?? 0) + 1);
        changes.push({ minute, side, on: sub, off });
      }
    }
  }
  return changes;
}

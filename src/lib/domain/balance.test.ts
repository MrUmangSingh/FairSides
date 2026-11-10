import { describe, expect, it } from "vitest";
import { balanceTeams, bestSwap, compareTeams, strengthGap, summarize } from "./balance";
import { formation } from "./formation";
import { ovrFor, shiftToOvr, withAdjustment } from "./ratings";
import { rotationSchedule } from "./rotation";
import { SAMPLE_PLAYERS } from "./samples";

const byId = new Map(SAMPLE_PLAYERS.map((p) => [p.id, p]));
const team = (ids: string[]) => ids.map((id) => byId.get(id)!);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("ovrFor", () => {
  const stats = { pace: 80, stamina: 70, shooting: 90, passing: 60, dribbling: 80, defending: 30 };
  it("weights by position", () => {
    expect(ovrFor(stats, 40, "FWD")).toBeCloseTo(27 + 20 + 16 + 9 + 7);
    expect(ovrFor(stats, 40, "GK")).toBe(40);
  });
});

describe("balanceTeams", () => {
  for (const [n, perSide] of [[6, 3], [10, 5], [12, 6], [16, 8], [18, 9], [22, 11]]) {
    it(`splits ${n} players into fair ${perSide}-a-side teams`, () => {
      const r = balanceTeams(SAMPLE_PLAYERS.slice(0, n), { perSide, rng: seeded(n) });
      expect(r.a).toHaveLength(perSide);
      expect(r.b).toHaveLength(perSide);
      expect(r.subs).toHaveLength(0);
      expect(new Set([...r.a, ...r.b]).size).toBe(n);
      const gap = strengthGap(summarize(team(r.a)), summarize(team(r.b)));
      // Six players leave very few possible splits, so allow a wider gap there.
      expect(gap.pct).toBeLessThan(n <= 6 ? 10 : 4);
    });
  }

  it("sends the odd player and overflow to subs, latest joiners first", () => {
    const r = balanceTeams(SAMPLE_PLAYERS.slice(0, 13), { perSide: 5, rng: seeded(1) });
    expect(r.a).toHaveLength(5);
    expect(r.b).toHaveLength(5);
    expect(r.subs).toEqual(["sample-11", "sample-12", "sample-13"]);
  });

  it("shrinks the sides when too few players have joined", () => {
    const r = balanceTeams(SAMPLE_PLAYERS.slice(0, 7), { perSide: 7, rng: seeded(2) });
    expect(r.a).toHaveLength(3);
    expect(r.b).toHaveLength(3);
    expect(r.subs).toHaveLength(1);
  });

  it("gives each team a keeper when two are available", () => {
    for (let s = 1; s <= 10; s++) {
      const r = balanceTeams(SAMPLE_PLAYERS.slice(0, 12), { perSide: 6, rng: seeded(s) });
      for (const side of [r.a, r.b]) {
        expect(team(side).some((p) => p.canGk)).toBe(true);
      }
    }
  });

  it("shuffle returns a different split from the current one", () => {
    const players = SAMPLE_PLAYERS.slice(0, 14);
    let current = balanceTeams(players, { perSide: 7, rng: seeded(3) });
    for (let s = 4; s < 12; s++) {
      const next = balanceTeams(players, { perSide: 7, current, rng: seeded(s) });
      const same = (x: string[], y: string[]) => x.toSorted().join() === y.toSorted().join();
      expect(same(next.a, current.a) || same(next.a, current.b)).toBe(false);
      current = next;
    }
  });

  it("handles empty and single-player matches", () => {
    expect(balanceTeams([], { perSide: 5 })).toEqual({ a: [], b: [], subs: [], joker: null });
    expect(balanceTeams(SAMPLE_PLAYERS.slice(0, 1), { perSide: 5 }).subs).toEqual(["sample-1"]);
  });
});

describe("formation", () => {
  it("places every player once, with one keeper", () => {
    for (const n of [1, 3, 5, 8, 11, 15]) {
      const spots = formation(SAMPLE_PLAYERS.slice(0, n));
      expect(spots).toHaveLength(n);
      expect(spots.filter((s) => s.keeper).length).toBeLessThanOrEqual(1);
      for (const s of spots) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(100);
      }
    }
  });
});

describe("odd-player modes", () => {
  const thirteen = SAMPLE_PLAYERS.slice(0, 13);

  it("uneven: plays 6 v 7 and makes the bigger team weaker on paper", () => {
    for (let s = 1; s <= 8; s++) {
      const r = balanceTeams(thirteen, { perSide: 7, mode: "uneven", rng: seeded(s) });
      expect(r.subs).toHaveLength(0);
      expect(r.joker).toBeNull();
      expect([r.a.length, r.b.length].toSorted()).toEqual([6, 7]);
      const [big, small] = r.a.length > r.b.length ? [r.a, r.b] : [r.b, r.a];
      expect(summarize(team(big)).avgOvr).toBeLessThan(summarize(team(small)).avgOvr);
      const cmp = compareTeams(team(r.a), team(r.b));
      expect(cmp.extra?.players).toBe(1);
      expect(cmp.gap.pct).toBeLessThan(5);
    }
  });

  it("uneven: falls back to a sub when both sides are already full", () => {
    const r = balanceTeams(thirteen, { perSide: 6, mode: "uneven", rng: seeded(1) });
    expect(r.a).toHaveLength(6);
    expect(r.b).toHaveLength(6);
    expect(r.subs).toHaveLength(1);
  });

  it("joker: equal teams plus one neutral player", () => {
    const r = balanceTeams(thirteen, { perSide: 6, mode: "joker", rng: seeded(1) });
    expect(r.a).toHaveLength(6);
    expect(r.b).toHaveLength(6);
    expect(r.subs).toHaveLength(0);
    expect(r.joker).not.toBeNull();
    expect([...r.a, ...r.b]).not.toContain(r.joker);
  });

  it("uses no odd mode when the count is even", () => {
    const r = balanceTeams(SAMPLE_PLAYERS.slice(0, 12), { perSide: 6, mode: "joker", rng: seeded(1) });
    expect(r.joker).toBeNull();
    expect(r.subs).toHaveLength(0);
  });
});

describe("pins and swaps", () => {
  const players = SAMPLE_PLAYERS.slice(0, 14);

  it("keeps pinned players on their side through every shuffle", () => {
    const pins = { "sample-1": "a", "sample-16": "a", "sample-10": "b", "sample-14": "b" } as const;
    let current = balanceTeams(SAMPLE_PLAYERS.slice(0, 16), { perSide: 8, pins, rng: seeded(1) });
    for (let s = 2; s < 10; s++) {
      current = balanceTeams(SAMPLE_PLAYERS.slice(0, 16), { perSide: 8, pins, current, rng: seeded(s) });
      expect(current.a).toEqual(expect.arrayContaining(["sample-1", "sample-16"]));
      expect(current.b).toEqual(expect.arrayContaining(["sample-10", "sample-14"]));
    }
  });

  it("puts a pinned late joiner on the pitch instead of the bench", () => {
    const r = balanceTeams(players.slice(0, 13), { perSide: 5, pins: { "sample-13": "b" }, rng: seeded(1) });
    expect(r.b).toContain("sample-13");
    expect(r.subs).toHaveLength(3);
  });

  it("suggests the swap that repairs a lopsided split, and nothing once it is fair", () => {
    const sorted = players.toSorted((x, y) => ovrFor(y.stats, y.gk, y.primaryPos) - ovrFor(x.stats, x.gk, x.primaryPos));
    let a = sorted.slice(0, 7);
    let b = sorted.slice(7);
    const before = compareTeams(a, b).gap.pct;
    const swap = bestSwap(a, b)!;
    expect(swap).not.toBeNull();
    const out = a.find((p) => p.id === swap.fromA)!;
    const into = b.find((p) => p.id === swap.fromB)!;
    a = a.map((p) => (p === out ? into : p));
    b = b.map((p) => (p === into ? out : p));
    expect(compareTeams(a, b).gap.pct).toBeLessThan(before);

    const fair = balanceTeams(players, { perSide: 7, rng: seeded(5) });
    for (let i = 0, ta = team(fair.a), tb = team(fair.b); i < 20; i++) {
      const s = bestSwap(ta, tb);
      if (!s) break;
      expect(i).toBeLessThan(19);
      const x = ta.find((p) => p.id === s.fromA)!;
      const y = tb.find((p) => p.id === s.fromB)!;
      ta = ta.map((p) => (p === x ? y : p));
      tb = tb.map((p) => (p === y ? x : p));
    }
  });

  it("never suggests moving a pinned player", () => {
    const sorted = players.toSorted((x, y) => ovrFor(y.stats, y.gk, y.primaryPos) - ovrFor(x.stats, x.gk, x.primaryPos));
    const pins = Object.fromEntries(sorted.slice(0, 7).map((p) => [p.id, "a" as const]));
    expect(bestSwap(sorted.slice(0, 7), sorted.slice(7), pins)).toBeNull();
  });
});

describe("host rating adjustment", () => {
  it("moves the overall to the target without touching the profile", () => {
    const p = SAMPLE_PLAYERS[0];
    const adj = shiftToOvr(p, 60);
    expect(Math.round(ovrFor(adj.stats, adj.gk, p.primaryPos))).toBe(60);
    expect(withAdjustment(p, adj).stats).not.toEqual(p.stats);
    expect(withAdjustment(p, undefined)).toBe(p);
    const keeper = SAMPLE_PLAYERS[3];
    expect(shiftToOvr(keeper, 66).gk).toBe(66);
  });
});

describe("rotationSchedule", () => {
  const r = balanceTeams(SAMPLE_PLAYERS.slice(0, 14), { perSide: 6, rng: seeded(1) });
  const changes = rotationSchedule(team(r.a), team(r.b), team(r.subs), 60, 10);

  it("brings the whole bench on at every interval, alternating sides", () => {
    expect(changes).toHaveLength(5 * 2);
    expect(changes.map((c) => c.minute)).toEqual([10, 10, 20, 20, 30, 30, 40, 40, 50, 50]);
    expect(changes[0].side).not.toBe(changes[1].side);
  });

  it("never takes a keeper off and rests a different player each time", () => {
    const keepers = [r.a, r.b].flatMap((ids) => formation(team(ids)).filter((s) => s.keeper).map((s) => s.player.id));
    const off = changes.map((c) => c.off.id);
    for (const id of keepers) expect(off).not.toContain(id);
    expect(new Set(off).size).toBe(off.length);
  });

  it("keeps every player on the side they started with", () => {
    const one = balanceTeams(SAMPLE_PLAYERS.slice(0, 13), { perSide: 6, rng: seeded(2) });
    const side = new Map<string, string>([...one.a.map((id) => [id, "a"] as const), ...one.b.map((id) => [id, "b"] as const)]);
    for (const c of rotationSchedule(team(one.a), team(one.b), team(one.subs), 60, 10)) {
      if (!side.has(c.on.id)) side.set(c.on.id, c.side);
      expect(side.get(c.on.id)).toBe(c.side);
      expect(side.get(c.off.id)).toBe(c.side);
    }
  });

  it("is empty without subs", () => {
    expect(rotationSchedule(team(r.a), team(r.b), [], 60, 10)).toEqual([]);
  });
});

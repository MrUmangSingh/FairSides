import { describe, expect, it } from "vitest";
import { balanceTeams, strengthGap, summarize } from "./balance";
import { formation } from "./formation";
import { ovrFor } from "./ratings";
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
    expect(balanceTeams([], { perSide: 5 })).toEqual({ a: [], b: [], subs: [] });
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

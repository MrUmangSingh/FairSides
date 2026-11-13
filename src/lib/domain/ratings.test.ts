import { describe, expect, it } from "vitest";
import { defense, OVR_WEIGHTS, ovrFor, sameRating, savedNotUsed, shiftToOvr, toSaved, withSaved } from "./ratings";
import { STAT_KEYS, type Adjustment, type Player, type Position } from "./types";

const OUTFIELD: Position[] = ["FWD", "MID", "DEF"];
const base = { pace: 77, stamina: 74, shooting: 52, passing: 76, dribbling: 68, defending: 63 };
const player = (pos: Position, stats = base): Player => ({
  id: "p",
  name: "P",
  stats,
  gk: 35,
  primaryPos: pos,
  secondaryPos: null,
  foot: "right",
  canGk: false,
  playstyle: "balanced",
});

describe("overall rating", () => {
  it("weights each outfield position to a total of 1", () => {
    for (const pos of OUTFIELD) {
      const w = OVR_WEIGHTS[pos as keyof typeof OVR_WEIGHTS];
      expect(STAT_KEYS.reduce((s, k) => s + w[k], 0)).toBeCloseTo(1);
    }
  });

  it("goes up with every stat, for every outfield position", () => {
    for (const pos of OUTFIELD) {
      for (const k of STAT_KEYS) {
        expect(ovrFor({ ...base, [k]: base[k] + 10 }, 35, pos), `${pos} ${k}`).toBeGreaterThan(ovrFor(base, 35, pos));
      }
    }
  });

  it("gives a keeper their goalkeeping rating", () => {
    expect(ovrFor(base, 81, "GK")).toBe(81);
  });

  it("leads the defense score with defending, not stamina", () => {
    const tackler = defense(player("DEF", { ...base, defending: 90, stamina: 40 }));
    const runner = defense(player("DEF", { ...base, defending: 40, stamina: 90 }));
    expect(tackler).toBeGreaterThan(runner);
  });

  it("lands the overall slider exactly where it is dragged", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 3000; i++) {
      const pos = OUTFIELD[i % 3];
      const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 20 + Math.floor(rnd() * 70)])) as Player["stats"];
      const p = player(pos, stats);
      const now = Math.round(ovrFor(stats, 35, pos));
      for (const target of [now - 1, now + 1, now + 7]) {
        const adj = shiftToOvr(p, target);
        expect(Math.round(ovrFor(adj.stats, adj.gk, pos))).toBe(target);
      }
    }
  });
});

const r = (n: number, extra: Partial<Adjustment> = {}): Adjustment => ({
  stats: { pace: n, stamina: n, shooting: n, passing: n, dribbling: n, defending: n },
  gk: 35,
  ...extra,
});

describe("saved ratings", () => {
  it("compares ratings by their numbers, ignoring the one-off flag", () => {
    expect(sameRating(r(60), r(60, { once: true }))).toBe(true);
    expect(sameRating(r(60), r(61))).toBe(false);
    expect(sameRating(r(60), r(60, { gk: 70 }))).toBe(false);
  });

  it("saves only the numbers", () => {
    expect(toSaved(r(60, { once: true }))).toEqual(r(60));
  });

  it("fills in the saved rating for players who have none in this match", () => {
    const book = { a: r(50), b: r(70) };
    const here = { b: r(65) };
    expect(withSaved(["a", "b", "c"], here, book)).toEqual({ a: r(50), b: r(65) });
  });

  it("leaves the match alone when nothing is missing", () => {
    const here = { a: r(40) };
    expect(withSaved(["a", "c"], here, { a: r(50) })).toBe(here);
  });

  it("finds players not on their saved rating, but leaves one-offs alone", () => {
    const book = { a: r(50), b: r(60), c: r(70), d: r(80) };
    const here = { b: r(60), c: r(65), d: r(75, { once: true }) };
    expect(savedNotUsed(["a", "b", "c", "d", "e"], here, book)).toEqual(["a", "c"]);
  });
});

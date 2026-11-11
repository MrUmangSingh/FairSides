import { describe, expect, it } from "vitest";
import { sameRating, savedNotUsed, toSaved, withSaved } from "./ratings";
import type { Adjustment } from "./types";

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

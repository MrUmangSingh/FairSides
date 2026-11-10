import { describe, expect, it } from "vitest";
import {
  STOPPED,
  clockMs,
  formatClock,
  isSecondYellow,
  matchMinute,
  pauseClock,
  tallyOf,
  sideOf,
  startClock,
  summarise,
} from "./referee";
import type { MatchEvent } from "./types";

const ev = (kind: MatchEvent["kind"], playerId: string | null, side: MatchEvent["side"] = null): MatchEvent => ({
  id: Math.random().toString(36),
  at: 0,
  minute: 1,
  kind,
  side,
  playerId,
});

describe("match clock", () => {
  it("runs, pauses and resumes without losing time", () => {
    let c = startClock(STOPPED, 1_000);
    expect(clockMs(c, 61_000)).toBe(60_000);
    c = pauseClock(c, 91_000);
    expect(clockMs(c, 500_000)).toBe(90_000);
    c = startClock(c, 600_000);
    expect(clockMs(c, 610_000)).toBe(100_000);
  });

  it("ignores start while running and pause while stopped", () => {
    const running = startClock(STOPPED, 5);
    expect(startClock(running, 99)).toBe(running);
    expect(pauseClock(STOPPED, 99)).toBe(STOPPED);
  });

  it("counts minutes the way a referee writes them down", () => {
    expect(matchMinute(STOPPED, 0)).toBeNull();
    const c = startClock(STOPPED, 0);
    expect(matchMinute(c, 0)).toBe(1);
    expect(matchMinute(c, 59_999)).toBe(1);
    expect(matchMinute(c, 60_000)).toBe(2);
  });

  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(425_000)).toBe("7:05");
    expect(formatClock(3_800_999)).toBe("63:20");
  });
});

describe("summarise", () => {
  it("adds up the score, including goals with no scorer", () => {
    const s = summarise([ev("goal", "p1", "a"), ev("goal", null, "b"), ev("goal", "p1", "a")]);
    expect(s.score).toEqual({ a: 2, b: 1 });
    expect(tallyOf(s, "p1").goals).toBe(2);
  });

  it("sends a player off for two yellows or one red", () => {
    const s = summarise([ev("yellow", "p1"), ev("yellow", "p2"), ev("yellow", "p1"), ev("red", "p3")]);
    expect(tallyOf(s, "p1")).toMatchObject({ yellows: 2, sentOff: true });
    expect(tallyOf(s, "p2")).toMatchObject({ yellows: 1, sentOff: false });
    expect(tallyOf(s, "p3")).toMatchObject({ red: true, sentOff: true });
    expect(tallyOf(s, "nobody")).toMatchObject({ goals: 0, yellows: 0, sentOff: false });
  });

  it("spots the second yellow", () => {
    const first = ev("yellow", "p1");
    const second = ev("yellow", "p1");
    const events = [first, ev("yellow", "p2"), second];
    expect(isSecondYellow(events, first)).toBe(false);
    expect(isSecondYellow(events, second)).toBe(true);
  });
});

it("finds a player's team", () => {
  const t = { a: ["x"], b: ["y"], subs: ["z"], joker: "j", version: 1 };
  expect(sideOf(t, "x")).toBe("a");
  expect(sideOf(t, "y")).toBe("b");
  expect(sideOf(t, "z")).toBeNull();
  expect(sideOf(t, "j")).toBeNull();
});

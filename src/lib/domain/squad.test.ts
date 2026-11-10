import { describe, expect, it } from "vitest";
import { fitSquad, squadMoves } from "./squad";
import type { Participant } from "./types";

const p = (userId: string, joinedAt: number, status: Participant["status"] = "joined"): Participant => ({
  userId,
  joinedAt,
  status,
});

// host joined first, then a..d; w1 and w2 are waiting.
const squad = [p("host", 0), p("a", 1), p("b", 2), p("c", 3), p("d", 4), p("w1", 5, "waitlist"), p("w2", 6, "waitlist")];
const joined = (ps: Participant[]) => ps.filter((x) => x.status === "joined").map((x) => x.userId);

describe("fitSquad", () => {
  it("leaves the squad alone when the size is unchanged", () => {
    expect(fitSquad(squad, 5, "host")).toBe(squad);
  });

  it("moves the waitlist up, oldest first, when places are added", () => {
    expect(joined(fitSquad(squad, 6, "host"))).toEqual(["host", "a", "b", "c", "d", "w1"]);
    expect(joined(fitSquad(squad, 20, "host"))).toHaveLength(7);
  });

  it("sends the latest to join back to the waitlist when places are removed", () => {
    const after = fitSquad(squad, 3, "host");
    expect(joined(after)).toEqual(["host", "a", "b"]);
    expect(squadMoves(squad, 3, "host")).toEqual({ toWaitlist: ["c", "d"], promoted: [] });
  });

  it("never moves the host, even if they joined last", () => {
    const late = [p("a", 1), p("b", 2), p("host", 9)];
    expect(joined(fitSquad(late, 1, "host"))).toEqual(["host"]);
  });

  it("keeps the order of the list it was given", () => {
    const shuffled = [squad[3], squad[0], squad[6], squad[1]];
    expect(fitSquad(shuffled, 2, "host").map((x) => x.userId)).toEqual(["c", "host", "w2", "a"]);
  });
});

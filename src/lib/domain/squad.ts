import type { Participant } from "./types";

export const MIN_SIDE = 3;
export const MAX_SIDE = 15;
export const MAX_PLACES = 40;

/**
 * Fits the squad to a new number of places. With more places the waitlist moves
 * up, oldest first. With fewer, the most recent players to join go back to the
 * waitlist; they joined before anyone already waiting, so they are first in line
 * for the next free place. The host always keeps their place.
 */
export function fitSquad(participants: Participant[], places: number, hostId: string): Participant[] {
  const byTime = participants.toSorted((x, y) => x.joinedAt - y.joinedAt);
  const joined = byTime.filter((p) => p.status === "joined");
  let change = places - joined.length;
  if (change === 0) return participants;

  const moved = new Set<string>();
  if (change > 0) {
    for (const p of byTime) if (p.status === "waitlist" && change-- > 0) moved.add(p.userId);
  } else {
    for (const p of joined.toReversed()) if (p.userId !== hostId && change++ < 0) moved.add(p.userId);
  }
  if (moved.size === 0) return participants;
  const flip = (s: Participant["status"]) => (s === "joined" ? "waitlist" : "joined");
  return participants.map((p) => (moved.has(p.userId) ? { ...p, status: flip(p.status) } : p));
}

/** The players whose place changes when the squad is fitted to `places`. */
export function squadMoves(participants: Participant[], places: number, hostId: string) {
  const after = new Map(fitSquad(participants, places, hostId).map((p) => [p.userId, p.status]));
  const changed = participants.filter((p) => after.get(p.userId) !== p.status);
  return {
    toWaitlist: changed.filter((p) => p.status === "joined").map((p) => p.userId),
    promoted: changed.filter((p) => p.status === "waitlist").map((p) => p.userId),
  };
}

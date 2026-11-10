"use client";

import { useSyncExternalStore } from "react";
import { SAMPLE_PLAYERS } from "./domain/samples";
import type { Match, Player, Teams } from "./domain/types";

/**
 * Phase 1 data layer. Everything lives in this browser's localStorage so the
 * app runs with no accounts or keys; tabs stay in sync through the storage
 * event. The action names mirror the tables in supabase/migrations, so
 * swapping this file for Supabase calls does not touch the screens.
 */
const KEY = "fairsides:v1";

export interface State {
  userId: string | null;
  players: Record<string, Player>;
  matches: Match[];
}

const EMPTY: State = { userId: null, players: {}, matches: [] };

let cache: State = EMPTY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

function read(): State {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache;
  }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as State) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: State) {
  cache = next;
  cacheRaw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, cacheRaw);
  } catch {
    // Storage blocked or full: keep working in memory for this tab.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** False during server render and hydration, true once localStorage is readable. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function updateMatch(id: string, fn: (m: Match) => Match) {
  const s = read();
  write({ ...s, matches: s.matches.map((m) => (m.id === id ? fn(m) : m)) });
}

/** Moves waitlisted players into free places, oldest first. */
function promote(m: Match): Match {
  let free = m.maxPlayers - m.participants.filter((p) => p.status === "joined").length;
  if (free <= 0) return m;
  const participants = m.participants
    .toSorted((x, y) => x.joinedAt - y.joinedAt)
    .map((p) => (p.status === "waitlist" && free-- > 0 ? { ...p, status: "joined" as const } : p));
  return { ...m, participants };
}

export const actions = {
  saveProfile(profile: Omit<Player, "id">, id?: string): string {
    const s = read();
    const playerId = id ?? s.userId ?? uid();
    write({
      ...s,
      userId: s.userId ?? playerId,
      players: { ...s.players, [playerId]: { ...profile, id: playerId } },
    });
    return playerId;
  },

  signIn(id: string) {
    const s = read();
    if (s.players[id]) write({ ...s, userId: id });
  },

  signOut() {
    write({ ...read(), userId: null });
  },

  createMatch(input: Omit<Match, "id" | "hostId" | "inviteCode" | "status" | "participants" | "teams">): string {
    const s = read();
    if (!s.userId) throw new Error("Create a profile first");
    const match: Match = {
      ...input,
      id: uid(),
      hostId: s.userId,
      inviteCode: code(),
      status: "open",
      participants: [{ userId: s.userId, status: "joined", joinedAt: Date.now() }],
      teams: null,
    };
    write({ ...s, matches: [...s.matches, match] });
    return match.id;
  },

  join(matchId: string, userId: string) {
    updateMatch(matchId, (m) => {
      if (m.status !== "open" || m.participants.some((p) => p.userId === userId)) return m;
      const joined = m.participants.filter((p) => p.status === "joined").length;
      const status = joined < m.maxPlayers ? "joined" : "waitlist";
      return {
        ...m,
        teams: status === "joined" ? null : m.teams,
        participants: [...m.participants, { userId, status, joinedAt: Date.now() }],
      };
    });
  },

  leave(matchId: string, userId: string) {
    updateMatch(matchId, (m) => {
      if (m.status !== "open") return m;
      const next = promote({ ...m, participants: m.participants.filter((p) => p.userId !== userId) });
      // The squad changed, so any draft teams are out of date.
      return { ...next, teams: null };
    });
  },

  /** Adds sample players so a host can try team generation without a full squad. */
  addSamplePlayers(matchId: string, count: number) {
    const s = read();
    const match = s.matches.find((m) => m.id === matchId);
    if (!match || match.status !== "open") return;
    const taken = new Set(match.participants.map((p) => p.userId));
    const picks = SAMPLE_PLAYERS.filter((p) => !taken.has(p.id)).slice(0, count);
    if (picks.length === 0) return;
    const players = { ...s.players };
    let joined = match.participants.filter((p) => p.status === "joined").length;
    const now = Date.now();
    const added = picks.map((p, i) => {
      players[p.id] = p;
      const status = joined++ < match.maxPlayers ? ("joined" as const) : ("waitlist" as const);
      return { userId: p.id, status, joinedAt: now + i };
    });
    write({
      ...s,
      players,
      matches: s.matches.map((m) =>
        m.id === matchId ? { ...m, participants: [...m.participants, ...added], teams: null } : m,
      ),
    });
  },

  setTeams(matchId: string, teams: Omit<Teams, "version">) {
    updateMatch(matchId, (m) =>
      m.status === "open" ? { ...m, teams: { ...teams, version: (m.teams?.version ?? 0) + 1 } } : m,
    );
  },

  lock(matchId: string) {
    updateMatch(matchId, (m) => (m.status === "open" && m.teams ? { ...m, status: "locked" } : m));
  },

  unlock(matchId: string) {
    updateMatch(matchId, (m) => (m.status === "locked" ? { ...m, status: "open" } : m));
  },

  cancel(matchId: string) {
    updateMatch(matchId, (m) => ({ ...m, status: "cancelled" }));
  },
};

export const joinedOf = (m: Match) =>
  m.participants.filter((p) => p.status === "joined").toSorted((x, y) => x.joinedAt - y.joinedAt);
export const waitlistOf = (m: Match) =>
  m.participants.filter((p) => p.status === "waitlist").toSorted((x, y) => x.joinedAt - y.joinedAt);

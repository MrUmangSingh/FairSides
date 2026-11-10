"use client";

import { useSyncExternalStore } from "react";
import * as cloud from "./cloud";
import { SAMPLE_PLAYERS } from "./domain/samples";
import { ovr, withAdjustment } from "./domain/ratings";
import { STOPPED, matchMinute, pauseClock, startClock, summarise, tallyOf } from "./domain/referee";
import { MAX_PLACES, MAX_SIDE, MIN_SIDE, fitSquad } from "./domain/squad";
import { formatFee, formatWhen } from "./format";
import type {
  Adjustment,
  EventKind,
  LogEntry,
  Match,
  OddMode,
  Participant,
  Player,
  Side,
  Teams,
  Zone,
} from "./domain/types";

/** What the host can change after creating a match. */
export type MatchSettings = Pick<Match, "title" | "venue" | "datetime" | "perSide" | "maxPlayers" | "fee" | "visibility">;

/**
 * The app's data layer. Screens read one State object and call actions; every
 * action is a plain function from the old match to the new one.
 *
 * Two places can hold the data. With Supabase configured (see cloud.ts) the
 * state is fetched from the database, kept live through realtime, and each
 * change is applied here first and then written behind the scenes. Without it
 * everything lives in this browser's localStorage, synced across tabs.
 */
const KEY = "fairsides:v1";
const CLOUD = cloud.cloudEnabled;

export interface State {
  userId: string | null;
  players: Record<string, Player>;
  matches: Match[];
  /** True when accounts and shared matches are on. */
  cloud: boolean;
  /** Cloud only: someone is signed in (they may not have made a profile yet). */
  signedIn: boolean;
  /** False until the first load from the database has finished. */
  ready: boolean;
  /** The last thing that failed to save, in plain words. */
  error: string | null;
}

const EMPTY: State = {
  userId: null,
  players: {},
  matches: [],
  cloud: CLOUD,
  signedIn: false,
  ready: !CLOUD,
  error: null,
};

let cache: State = EMPTY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

function read(): State {
  if (CLOUD) return cache;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache;
  }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const saved = raw ? { ...EMPTY, ...(JSON.parse(raw) as State) } : EMPTY;
    cache = { ...saved, cloud: false, ready: true, error: null, matches: saved.matches.map(upgrade) };
  } catch {
    cache = EMPTY;
  }
  return cache;
}

/** Matches saved before Phase 2 lack the host-control fields. */
function upgrade(m: Match): Match {
  return {
    ...m,
    oddMode: m.oddMode ?? "sub",
    pins: m.pins ?? {},
    adjustments: m.adjustments ?? {},
    log: m.log ?? [],
    minutes: m.minutes ?? 60,
    rotateEvery: m.rotateEvery ?? 10,
    teams: m.teams ? { ...m.teams, joker: m.teams.joker ?? null } : null,
    refereeId: m.refereeId ?? null,
    clock: m.clock ?? STOPPED,
    events: m.events ?? [],
  };
}

const notify = () => listeners.forEach((l) => l());

function write(next: State) {
  cache = next;
  if (CLOUD) return notify();
  cacheRaw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, cacheRaw);
  } catch {
    // Storage blocked or full: keep working in memory for this tab.
  }
  notify();
}

// ---------------------------------------------------------------- cloud sync

let authId: string | null = null;
/** Each match as the database last confirmed it; changes are written as a diff against this. */
const persisted = new Map<string, Match>();
const dirty = new Set<string>();
let writing = 0;
let generation = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");

function refreshSoon(ms = 150) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, ms);
}

async function refresh() {
  // Fresh data must not overwrite changes that are still on their way out.
  if (writing > 0 || dirty.size > 0) return refreshSoon(400);
  const mine = ++generation;
  try {
    const snap = await cloud.fetchAll();
    if (mine !== generation) return;
    if (writing > 0 || dirty.size > 0) return refreshSoon(400);
    authId = snap.authId;
    persisted.clear();
    for (const m of snap.matches) persisted.set(m.id, m);
    write({
      userId: snap.userId,
      players: snap.players,
      matches: snap.matches,
      cloud: true,
      signedIn: Boolean(snap.authId),
      ready: true,
      error: cache.error,
    });
  } catch (e) {
    write({ ...cache, ready: true, error: `Could not load matches: ${message(e)}` });
  }
}

/** Shows what went wrong and puts the screen back to what the database has. */
function fail(e: unknown) {
  dirty.clear();
  write({ ...cache, error: message(e) });
  refreshSoon(0);
}

/** Runs one write; a refresh follows so the screen ends up on the saved truth. */
function send(work: Promise<unknown>) {
  writing++;
  work.then(
    () => {
      writing--;
      refreshSoon();
    },
    (e) => {
      writing--;
      fail(e);
    },
  );
}

/**
 * The referee's writes go out one at a time, in order, so a quick start then
 * pause can't arrive the wrong way round.
 */
let refereeQueue: Promise<unknown> = Promise.resolve();
function sendInOrder(work: () => Promise<unknown>) {
  const next = refereeQueue.then(work);
  refereeQueue = next.catch(() => {});
  send(next);
}

function markDirty(matchId: string) {
  dirty.add(matchId);
  clearTimeout(flushTimer);
  // A short pause gathers a burst (a dragged slider) into one write.
  flushTimer = setTimeout(flush, 250);
}

function flush() {
  if (writing > 0) {
    flushTimer = setTimeout(flush, 200);
    return;
  }
  const ids = [...dirty];
  dirty.clear();
  send(
    (async () => {
      for (const id of ids) {
        const before = persisted.get(id);
        const after = cache.matches.find((m) => m.id === id);
        if (!before || !after) continue;
        await cloud.syncMatch(before, after);
        persisted.set(id, after);
      }
    })(),
  );
}

function startCloud() {
  if (started) return;
  started = true;
  cloud.watch(() => refreshSoon());
  refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (CLOUD) {
    startCloud();
    return () => {
      listeners.delete(listener);
    };
  }
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

/** False during server render and hydration, and until the data has loaded. */
export function useHydrated(): boolean {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return useStore().ready && mounted;
}

// The database wants real uuids; local matches keep short ids for tidy links.
const uid = () => (CLOUD ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const logId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined);
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/**
 * Applies a change to one match. In cloud mode the change shows at once and is
 * saved in the background; pass `save: false` when a database function does
 * the real work and this is only the instant preview.
 */
function updateMatch(id: string, fn: (m: Match, players: Record<string, Player>) => Match, save = true) {
  const s = read();
  const before = s.matches.find((m) => m.id === id);
  if (!before) return;
  const after = fn(before, s.players);
  if (after === before) return;
  write({ ...s, matches: s.matches.map((m) => (m === before ? after : m)) });
  if (CLOUD && save) markDirty(id);
}

const LOG_LIMIT = 80;
const logged = (m: Match, action: LogEntry["action"], detail: string): Match => ({
  ...m,
  log: [{ id: logId(), at: Date.now(), action, detail }, ...m.log].slice(0, LOG_LIMIT),
});

const ZONE_NAMES: Record<Zone | "joker", string> = { a: "Yellow bibs", b: "Pink bibs", subs: "the subs", joker: "joker" };

function zoneOf(t: Teams, id: string): Zone | "joker" | null {
  if (t.a.includes(id)) return "a";
  if (t.b.includes(id)) return "b";
  if (t.subs.includes(id)) return "subs";
  return t.joker === id ? "joker" : null;
}

/** Draft teams and pins only make sense for the squad they were made from. */
function squadChanged(m: Match): Match {
  const here = new Set(m.participants.filter((p) => p.status === "joined").map((p) => p.userId));
  return {
    ...m,
    teams: null,
    pins: Object.fromEntries(Object.entries(m.pins).filter(([id]) => here.has(id))),
  };
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
    if (CLOUD) {
      if (!authId) {
        write({ ...s, error: "Sign in before saving your profile." });
        return "";
      }
      send(cloud.saveProfile({ ...profile, id: playerId }, authId));
    }
    write({
      ...s,
      userId: s.userId ?? playerId,
      players: { ...s.players, [playerId]: { ...profile, id: playerId } },
    });
    return playerId;
  },

  /** Local mode only: switch between the profiles made in this browser. */
  signIn(id: string) {
    const s = read();
    if (!CLOUD && s.players[id]) write({ ...s, userId: id });
  },

  signOut() {
    if (CLOUD) send(cloud.supabase().auth.signOut());
    write({ ...read(), userId: null, signedIn: false });
  },

  clearError() {
    write({ ...read(), error: null });
  },

  createMatch(
    input: Pick<Match, "title" | "venue" | "datetime" | "perSide" | "maxPlayers" | "minPlayers" | "fee" | "visibility" | "oddMode">,
  ): string {
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
      pins: {},
      adjustments: {},
      log: [],
      minutes: 60,
      rotateEvery: 10,
      refereeId: null,
      clock: STOPPED,
      events: [],
    };
    write({ ...s, matches: [...s.matches, match] });
    if (CLOUD) send(cloud.insertMatch(match).then(() => persisted.set(match.id, match)));
    return match.id;
  },

  join(matchId: string, userId: string) {
    updateMatch(matchId, (m) => {
      if (m.status !== "open" || m.refereeId === userId || m.participants.some((p) => p.userId === userId)) return m;
      const joined = m.participants.filter((p) => p.status === "joined").length;
      const status = joined < m.maxPlayers ? "joined" : "waitlist";
      const next: Match = { ...m, participants: [...m.participants, { userId, status, joinedAt: Date.now() }] };
      return status === "joined" ? squadChanged(next) : next;
    }, false);
    // The database decides who got the last place when two people join at once.
    if (CLOUD) send(cloud.rpc.join(matchId));
  },

  leave(matchId: string, userId: string) {
    updateMatch(matchId, (m) => {
      if (m.status !== "open") return m;
      const next = promote({ ...m, participants: m.participants.filter((p) => p.userId !== userId) });
      // The squad changed, so any draft teams are out of date.
      return squadChanged(next);
    }, false);
    if (CLOUD) send(cloud.rpc.leave(matchId));
  },

  /** Host only: takes a player out of the match and promotes the waitlist. */
  removePlayer(matchId: string, userId: string) {
    updateMatch(matchId, (m, players) => {
      if (m.status !== "open" || userId === m.hostId) return m;
      const adjustments = { ...m.adjustments };
      delete adjustments[userId];
      const next = promote({ ...m, adjustments, participants: m.participants.filter((p) => p.userId !== userId) });
      return logged(squadChanged(next), "remove", `Removed ${players[userId]?.name ?? "a player"} from the match`);
    });
  },

  /** Adds sample players so a host can try team generation without a full squad. */
  addSamplePlayers(matchId: string, count: number) {
    if (CLOUD) return send(cloud.rpc.addSamplePlayers(matchId, count));
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
        m.id === matchId ? squadChanged({ ...m, participants: [...m.participants, ...added] }) : m,
      ),
    });
  },

  /** Stores a split from the balancer. */
  setTeams(matchId: string, teams: Omit<Teams, "version">) {
    updateMatch(matchId, (m) => {
      if (m.status !== "open") return m;
      const pinned = Object.keys(m.pins).length;
      const detail = m.teams
        ? `Shuffled the teams${pinned ? `, keeping ${pinned} pinned` : ""}`
        : `Generated teams, ${teams.a.length} v ${teams.b.length}`;
      return logged(
        { ...m, teams: { ...teams, version: (m.teams?.version ?? 0) + 1 } },
        m.teams ? "shuffle" : "generate",
        detail,
      );
    });
  },

  /** Moves one player to a team or to the subs. */
  movePlayer(matchId: string, playerId: string, to: Zone) {
    updateMatch(matchId, (m, players) => {
      const t = m.teams;
      if (m.status !== "open" || !t) return m;
      const from = zoneOf(t, playerId);
      if (!from || from === to) return m;
      const without = (ids: string[]) => ids.filter((id) => id !== playerId);
      const teams: Teams = {
        a: without(t.a),
        b: without(t.b),
        subs: without(t.subs),
        joker: t.joker === playerId ? null : t.joker,
        version: t.version + 1,
      };
      teams[to] = [...teams[to], playerId];
      const pins = { ...m.pins };
      if (pins[playerId]) {
        if (to === "subs") delete pins[playerId];
        else pins[playerId] = to;
      }
      return logged(
        { ...m, teams, pins },
        "move",
        `Moved ${players[playerId]?.name ?? "a player"} from ${ZONE_NAMES[from]} to ${ZONE_NAMES[to]}`,
      );
    });
  },

  /** Two players trade places, wherever they are. */
  swapPlayers(matchId: string, first: string, second: string) {
    updateMatch(matchId, (m, players) => {
      const t = m.teams;
      if (m.status !== "open" || !t || first === second) return m;
      const za = zoneOf(t, first);
      const zb = zoneOf(t, second);
      if (!za || !zb || za === zb) return m;
      const trade = (id: string) => (id === first ? second : id === second ? first : id);
      const teams: Teams = {
        a: t.a.map(trade),
        b: t.b.map(trade),
        subs: t.subs.map(trade),
        joker: t.joker ? trade(t.joker) : null,
        version: t.version + 1,
      };
      const pins = { ...m.pins };
      for (const [id, zone] of [[first, zb], [second, za]] as const) {
        if (!pins[id]) continue;
        if (zone === "a" || zone === "b") pins[id] = zone;
        else delete pins[id];
      }
      const name = (id: string) => players[id]?.name ?? "a player";
      return logged(
        { ...m, teams, pins },
        "swap",
        `Swapped ${name(first)} (${ZONE_NAMES[za]}) with ${name(second)} (${ZONE_NAMES[zb]})`,
      );
    });
  },

  /** Pins a player to the team they are on, or releases them. */
  togglePin(matchId: string, playerId: string) {
    updateMatch(matchId, (m, players) => {
      if (m.status !== "open" || !m.teams) return m;
      const zone = zoneOf(m.teams, playerId);
      const pins = { ...m.pins };
      const name = players[playerId]?.name ?? "a player";
      if (pins[playerId]) {
        delete pins[playerId];
        return logged({ ...m, pins }, "pin", `Unpinned ${name}`);
      }
      if (zone !== "a" && zone !== "b") return m;
      pins[playerId] = zone;
      return logged({ ...m, pins }, "pin", `Pinned ${name} to ${ZONE_NAMES[zone]}`);
    });
  },

  /** The host's rating for one player in this match; null puts the profile rating back. */
  adjustRating(matchId: string, playerId: string, adjustment: Adjustment | null) {
    updateMatch(matchId, (m, players) => {
      const player = players[playerId];
      if (m.status !== "open" || !player) return m;
      const adjustments = { ...m.adjustments };
      if (adjustment) adjustments[playerId] = adjustment;
      else delete adjustments[playerId];
      const after = Math.round(ovr(withAdjustment(player, adjustment ?? undefined)));
      const next = { ...m, adjustments };
      const detail = adjustment
        ? `Rated ${player.name} ${after} for this match (profile says ${Math.round(ovr(player))})`
        : `Reset ${player.name} to their profile rating of ${after}`;
      // Dragging a slider fires many changes; keep one log line per player per burst.
      const last = m.log[0];
      if (last?.action === "rating" && last.detail.includes(` ${player.name} `) && Date.now() - last.at < 20_000) {
        return { ...next, log: [{ ...last, at: Date.now(), detail }, ...m.log.slice(1)] };
      }
      return logged(next, "rating", detail);
    });
  },

  setOddMode(matchId: string, oddMode: OddMode) {
    updateMatch(matchId, (m) => {
      if (m.status !== "open" || m.oddMode === oddMode) return m;
      const names: Record<OddMode, string> = { sub: "rolling sub", uneven: "uneven teams", joker: "joker" };
      // The old split was built for the other mode.
      return logged({ ...m, oddMode, teams: null }, "mode", `Odd-player rule set to ${names[oddMode]}`);
    });
  },

  /**
   * Host only: changes the match after it was created. The size can change while
   * the teams are open; the details (name, venue, time, fee, who can join) any
   * time before the match is cancelled.
   */
  editMatch(matchId: string, changes: MatchSettings) {
    updateMatch(matchId, (m, players) => {
      if (m.status === "cancelled" || m.status === "completed") return m;
      const sizeOk = m.status === "open";
      const perSide = sizeOk ? Math.min(MAX_SIDE, Math.max(MIN_SIDE, changes.perSide)) : m.perSide;
      const maxPlayers = sizeOk ? Math.min(MAX_PLACES, Math.max(perSide * 2, changes.maxPlayers)) : m.maxPlayers;
      let next: Match = {
        ...m,
        title: changes.title.trim() || m.title,
        venue: changes.venue.trim() || m.venue,
        datetime: changes.datetime || m.datetime,
        fee: Math.max(0, Math.round(changes.fee)),
        visibility: changes.visibility,
        perSide,
        maxPlayers,
        minPlayers: perSide * 2,
        participants: fitSquad(m.participants, maxPlayers, m.hostId),
      };

      const said: string[] = [];
      if (perSide !== m.perSide) said.push(`made it ${perSide}v${perSide}`);
      if (maxPlayers !== m.maxPlayers) said.push(`set ${maxPlayers} places`);
      const moved = next.participants.filter((p, i) => p !== m.participants[i]);
      const names = (st: Participant["status"]) =>
        moved.filter((p) => p.status === st).map((p) => players[p.userId]?.name ?? "a player");
      if (names("waitlist").length) said.push(`moved ${names("waitlist").join(", ")} to the waitlist`);
      if (names("joined").length) said.push(`gave ${names("joined").join(", ")} a place from the waitlist`);
      if (next.title !== m.title) said.push(`renamed it "${next.title}"`);
      if (next.venue !== m.venue) said.push(`moved it to ${next.venue}`);
      if (next.datetime !== m.datetime) said.push(`moved kick-off to ${formatWhen(next.datetime)}`);
      if (next.fee !== m.fee) said.push(`set the fee to ${formatFee(next.fee).toLowerCase()}`);
      if (next.visibility !== m.visibility) said.push(next.visibility === "private" ? "made it private" : "made it public");
      if (said.length === 0) return m;

      // A split made for another size, or another squad, no longer fits.
      if (moved.length) next = squadChanged(next);
      else if (perSide !== m.perSide) next = { ...next, teams: null };
      const detail = said.join(", ");
      return logged(next, "settings", (detail[0].toUpperCase() + detail.slice(1)).slice(0, 300));
    });
  },

  setRotation(matchId: string, minutes: number, rotateEvery: number) {
    updateMatch(matchId, (m) => ({ ...m, minutes, rotateEvery }));
  },

  lock(matchId: string) {
    updateMatch(matchId, (m) =>
      m.status === "open" && m.teams ? logged({ ...m, status: "locked" }, "lock", "Locked the teams") : m,
    );
  },

  unlock(matchId: string) {
    updateMatch(matchId, (m) =>
      m.status === "locked" ? logged({ ...m, status: "open" }, "lock", "Unlocked the teams") : m,
    );
  },

  cancel(matchId: string) {
    updateMatch(matchId, (m) => ({ ...m, status: "cancelled" }));
  },

  /**
   * The signed-in player referees this match. A squad member gives up their
   * place to do it (only while the teams are open); the host always plays.
   */
  becomeReferee(matchId: string) {
    const me = read().userId;
    if (!me) return;
    updateMatch(matchId, (m) => {
      if (!canReferee(m, me)) return m;
      const mine = m.participants.find((p) => p.userId === me);
      if (!mine) return { ...m, refereeId: me };
      const adjustments = { ...m.adjustments };
      delete adjustments[me];
      const next: Match = { ...m, refereeId: me, adjustments, participants: m.participants.filter((p) => p !== mine) };
      return mine.status === "joined" ? squadChanged(promote(next)) : next;
    }, false);
    if (CLOUD) send(cloud.rpc.becomeReferee(matchId));
  },

  /** The referee steps down, or the host removes them. Goals, cards and the clock stay. */
  clearReferee(matchId: string) {
    updateMatch(matchId, (m) => (m.refereeId ? { ...m, refereeId: null } : m), false);
    if (CLOUD) sendInOrder(() => cloud.rpc.clearReferee(matchId));
  },

  clock(matchId: string, action: "start" | "pause" | "reset") {
    const now = Date.now();
    const before = read().matches.find((m) => m.id === matchId);
    if (!before) return;
    const clock =
      action === "start" ? startClock(before.clock, now) : action === "pause" ? pauseClock(before.clock, now) : STOPPED;
    if (clock === before.clock) return;
    updateMatch(matchId, (m) => ({ ...m, clock }), false);
    if (CLOUD) sendInOrder(() => cloud.rpc.setClock(matchId, clock));
  },

  /** Records a goal or card at the current minute on the clock. */
  recordEvent(matchId: string, kind: EventKind, side: Side | null, playerId: string | null) {
    const before = read().matches.find((m) => m.id === matchId);
    if (!before || before.status !== "locked" || (kind === "goal" && !side) || (kind !== "goal" && !playerId)) return;
    // A player who has been sent off can't score or be booked again.
    if (playerId && tallyOf(summarise(before.events), playerId).sentOff) return;
    const now = Date.now();
    const event = {
      id: logId() ?? uid(),
      at: now,
      minute: matchMinute(before.clock, now),
      kind,
      side: kind === "goal" ? side : null,
      playerId,
    };
    updateMatch(matchId, (m) => ({ ...m, events: [...m.events, event] }), false);
    if (CLOUD) sendInOrder(() => cloud.addEvent(matchId, event));
  },

  removeEvent(matchId: string, eventId: string) {
    updateMatch(matchId, (m) => ({ ...m, events: m.events.filter((e) => e.id !== eventId) }), false);
    if (CLOUD) sendInOrder(() => cloud.removeEvent(eventId));
  },
};

/** Whether this player may volunteer as referee right now (the database checks the same). */
export function canReferee(m: Match, playerId: string): boolean {
  if (m.refereeId || m.hostId === playerId) return false;
  if (m.status === "open") return true;
  return m.status === "locked" && !m.participants.some((p) => p.userId === playerId);
}

export const joinedOf = (m: Match) =>
  m.participants.filter((p) => p.status === "joined").toSorted((x, y) => x.joinedAt - y.joinedAt);
export const waitlistOf = (m: Match) =>
  m.participants.filter((p) => p.status === "waitlist").toSorted((x, y) => x.joinedAt - y.joinedAt);

"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LogEntry, Match, Participant, Player, Teams } from "./domain/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * True when the app talks to Supabase: accounts, shared matches, live updates.
 * Without the two env vars (or with NEXT_PUBLIC_FAIRSIDES_LOCAL=1) everything
 * stays in this browser's localStorage instead.
 */
export const cloudEnabled = Boolean(url && key) && process.env.NEXT_PUBLIC_FAIRSIDES_LOCAL !== "1";

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  return (client ??= createClient(url!, key!));
}

export interface Snapshot {
  /** Supabase auth user, or null when signed out. */
  authId: string | null;
  /** The signed-in person's player id, once they have made a profile. */
  userId: string | null;
  players: Record<string, Player>;
  matches: Match[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- rows arrive untyped from PostgREST */
type Row = Record<string, any>;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const toPlayer = (r: Row): Player => ({
  id: r.id,
  name: r.name,
  stats: r.stats,
  gk: r.gk,
  primaryPos: r.primary_pos,
  secondaryPos: r.secondary_pos,
  foot: r.foot,
  canGk: r.can_gk,
  playstyle: r.playstyle,
  ...(r.sample ? { sample: true } : {}),
});

const playerRow = (p: Player, owner: string) => ({
  id: p.id,
  owner,
  name: p.name,
  stats: p.stats,
  gk: p.gk,
  primary_pos: p.primaryPos,
  secondary_pos: p.secondaryPos,
  foot: p.foot,
  can_gk: p.canGk,
  playstyle: p.playstyle,
  updated_at: new Date().toISOString(),
});

const matchRow = (m: Match) => ({
  id: m.id,
  host_id: m.hostId,
  title: m.title,
  venue: m.venue,
  datetime: m.datetime,
  per_side: m.perSide,
  max_players: m.maxPlayers,
  min_players: m.minPlayers,
  fee: m.fee,
  visibility: m.visibility,
  invite_code: m.inviteCode,
  status: m.status,
  odd_mode: m.oddMode,
  minutes: m.minutes,
  rotate_every: m.rotateEvery,
  adjustments: m.adjustments,
});

const participantRow = (matchId: string, p: Participant) => ({
  match_id: matchId,
  player_id: p.userId,
  status: p.status,
  joined_at: new Date(p.joinedAt).toISOString(),
});

const logRow = (matchId: string, e: LogEntry) => ({
  id: e.id,
  match_id: matchId,
  at: new Date(e.at).toISOString(),
  action: e.action,
  detail: e.detail,
});

const LOG_PER_MATCH = 80;

/** Everything the screens need, in the same shape the local store uses. */
export async function fetchAll(): Promise<Snapshot> {
  const sb = supabase();
  const { data: auth } = await sb.auth.getSession();
  const authId = auth.session?.user.id ?? null;
  const [players, matches, participants, teams, log] = await Promise.all([
    sb.from("players").select("*"),
    sb.from("matches").select("*").order("created_at"),
    sb.from("match_participants").select("*"),
    sb.from("match_teams").select("*"),
    sb.from("match_log").select("*").order("at", { ascending: false }).limit(2000),
  ]);

  const group = <T,>(rows: Row[], make: (r: Row) => T) => {
    const by = new Map<string, T[]>();
    for (const r of rows) by.set(r.match_id, [...(by.get(r.match_id) ?? []), make(r)]);
    return by;
  };
  const squad = group<Participant>(check(participants) as Row[], (r) => ({
    userId: r.player_id,
    status: r.status,
    joinedAt: Date.parse(r.joined_at),
  }));
  const logs = group<LogEntry>(check(log) as Row[], (r) => ({
    id: r.id,
    at: Date.parse(r.at),
    action: r.action,
    detail: r.detail,
  }));
  const drafts = new Map((check(teams) as Row[]).map((r) => [r.match_id as string, r]));
  const playerRows = check(players) as Row[];

  return {
    authId,
    userId: authId ? (playerRows.find((r) => r.owner === authId)?.id ?? null) : null,
    players: Object.fromEntries(playerRows.map((r) => [r.id, toPlayer(r)])),
    matches: (check(matches) as Row[]).map((r) => {
      const draft = drafts.get(r.id);
      const t = draft?.teams as Teams | null | undefined;
      return {
        id: r.id,
        hostId: r.host_id,
        title: r.title,
        venue: r.venue,
        datetime: r.datetime,
        perSide: r.per_side,
        maxPlayers: r.max_players,
        minPlayers: r.min_players,
        fee: r.fee,
        visibility: r.visibility,
        inviteCode: r.invite_code,
        status: r.status,
        participants: squad.get(r.id) ?? [],
        teams: t ? { a: t.a ?? [], b: t.b ?? [], subs: t.subs ?? [], joker: t.joker ?? null, version: t.version ?? 1 } : null,
        oddMode: r.odd_mode,
        pins: draft?.pins ?? {},
        adjustments: r.adjustments ?? {},
        log: (logs.get(r.id) ?? []).slice(0, LOG_PER_MATCH),
        minutes: r.minutes,
        rotateEvery: r.rotate_every,
      } satisfies Match;
    }),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function saveProfile(player: Player, authId: string) {
  check(await supabase().from("players").upsert(playerRow(player, authId), { onConflict: "id" }));
}

export async function insertMatch(m: Match) {
  const sb = supabase();
  check(await sb.from("matches").insert(matchRow(m)));
  check(await sb.from("match_participants").insert(m.participants.map((p) => participantRow(m.id, p))));
  check(await sb.from("match_teams").insert({ match_id: m.id, teams: null, pins: {} }));
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** Writes whatever the host changed between two versions of a match. */
export async function syncMatch(before: Match, after: Match) {
  const sb = supabase();
  const id = after.id;

  const was = new Map(before.participants.map((p) => [p.userId, p]));
  const now = new Map(after.participants.map((p) => [p.userId, p]));
  const gone = [...was.keys()].filter((pid) => !now.has(pid));
  if (gone.length) check(await sb.from("match_participants").delete().eq("match_id", id).in("player_id", gone));
  const changed = after.participants.filter((p) => !same(was.get(p.userId), p));
  if (changed.length) {
    check(
      await sb
        .from("match_participants")
        .upsert(changed.map((p) => participantRow(id, p)), { onConflict: "match_id,player_id" }),
    );
  }

  const row = matchRow(after);
  if (!same(matchRow(before), row)) check(await sb.from("matches").update(row).eq("id", id));

  if (!same(before.teams, after.teams) || !same(before.pins, after.pins)) {
    check(await sb.from("match_teams").upsert({ match_id: id, teams: after.teams, pins: after.pins }));
  }

  const known = new Map(before.log.map((e) => [e.id, e]));
  const entries = after.log.filter((e) => e.id && !same(known.get(e.id), e));
  if (entries.length) check(await sb.from("match_log").upsert(entries.map((e) => logRow(id, e))));
}

export const rpc = {
  async join(matchId: string) {
    check(await supabase().rpc("join_match", { m: matchId }));
  },
  async leave(matchId: string) {
    check(await supabase().rpc("leave_match", { m: matchId }));
  },
  async addSamplePlayers(matchId: string, count: number) {
    check(await supabase().rpc("add_sample_players", { m: matchId, n: count }));
  },
};

/** Calls back whenever anything changes in the database or the session. */
export function watch(onChange: () => void) {
  const sb = supabase();
  // Never call Supabase from inside this callback: it runs while the auth lock is held.
  sb.auth.onAuthStateChange(() => setTimeout(onChange, 0));
  sb.channel("fairsides").on("postgres_changes", { event: "*", schema: "public" }, onChange).subscribe();
}

export interface SignInMethods {
  google: boolean;
  guest: boolean;
  email: boolean;
}

/** Which sign-in methods the Supabase project has switched on. */
export async function signInMethods(): Promise<SignInMethods> {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
    const s = await res.json();
    return {
      google: Boolean(s.external?.google),
      guest: Boolean(s.external?.anonymous_users),
      email: Boolean(s.external?.email),
    };
  } catch {
    return { google: false, guest: false, email: true };
  }
}

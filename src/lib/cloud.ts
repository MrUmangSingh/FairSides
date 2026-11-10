"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STOPPED } from "./domain/referee";
import type { Clock, LogEntry, Match, MatchEvent, Participant, Player, Teams } from "./domain/types";

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

/** How the signed-in person got in, for the account menu. */
export interface Account {
  /** True for "Continue as a guest": the profile lives on this device until they link Google. */
  guest: boolean;
  google: boolean;
  email: string | null;
  /** Google profile picture, once Google is linked. */
  avatar: string | null;
}

export interface Snapshot {
  /** Supabase auth user, or null when signed out. */
  authId: string | null;
  account: Account | null;
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
  const user = auth.session?.user ?? null;
  const authId = user?.id ?? null;
  const [players, matches, participants, teams, log, events] = await Promise.all([
    sb.from("players").select("*"),
    sb.from("matches").select("*").order("created_at"),
    sb.from("match_participants").select("*"),
    sb.from("match_teams").select("*"),
    sb.from("match_log").select("*").order("at", { ascending: false }).limit(2000),
    sb.from("match_events").select("*").order("at"),
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
  const goalsAndCards = group<MatchEvent>(check(events) as Row[], (r) => ({
    id: r.id,
    at: Date.parse(r.at),
    minute: r.minute,
    kind: r.kind,
    side: r.side,
    playerId: r.player_id,
  }));
  const drafts = new Map((check(teams) as Row[]).map((r) => [r.match_id as string, r]));
  const playerRows = check(players) as Row[];

  const google = Boolean(user?.identities?.some((i) => i.provider === "google"));
  return {
    authId,
    account: user
      ? {
          guest: Boolean(user.is_anonymous) && !google,
          google,
          email: user.email || null,
          avatar: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        }
      : null,
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
        refereeId: r.referee_id ?? null,
        clock: (r.clock as Clock | null) ?? STOPPED,
        events: goalsAndCards.get(r.id) ?? [],
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
  async becomeReferee(matchId: string) {
    check(await supabase().rpc("become_referee", { m: matchId }));
  },
  async clearReferee(matchId: string) {
    check(await supabase().rpc("clear_referee", { m: matchId }));
  },
  async setClock(matchId: string, clock: Clock) {
    check(await supabase().rpc("set_match_clock", { m: matchId, c: clock }));
  },
};

export async function addEvent(matchId: string, e: MatchEvent) {
  check(
    await supabase()
      .from("match_events")
      .insert({
        id: e.id,
        match_id: matchId,
        at: new Date(e.at).toISOString(),
        minute: e.minute,
        kind: e.kind,
        side: e.side,
        player_id: e.playerId,
      }),
  );
}

export async function removeEvent(eventId: string) {
  check(await supabase().from("match_events").delete().eq("id", eventId));
}

/** Calls back whenever anything changes in the database or the session. */
export function watch(onChange: () => void) {
  const sb = supabase();
  // Never call Supabase from inside this callback: it runs while the auth lock is held.
  sb.auth.onAuthStateChange(() => setTimeout(onChange, 0));
  sb.channel("fairsides").on("postgres_changes", { event: "*", schema: "public" }, onChange).subscribe();
}

/**
 * Turns a guest into a Google account without changing their user id, so the
 * profile and matches they already have stay theirs. Needs "Allow manual
 * linking" switched on under Authentication > Sign In / Providers in Supabase.
 * The browser leaves for Google and comes back to `returnTo`.
 */
export async function linkGoogle(returnTo: string) {
  const { error } = await supabase().auth.linkIdentity({ provider: "google", options: { redirectTo: returnTo } });
  if (error) throw new Error(error.message);
}

/** Reads the error Supabase puts on the URL when a Google link bounces back, then tidies the URL. */
export function takeAuthError(): string | null {
  const params = (raw: string) => new URLSearchParams(raw.replace(/^[#?]/, ""));
  const q = params(window.location.search);
  const h = params(window.location.hash);
  const code = q.get("error_code") ?? h.get("error_code");
  const text = q.get("error_description") ?? h.get("error_description");
  if (!code && !text) return null;
  window.history.replaceState(null, "", window.location.pathname);
  if (code === "identity_already_exists") {
    return "That Google account already has its own Fairsides profile. Sign out and continue with Google to use it, or pick a different Google account.";
  }
  if (code === "manual_linking_disabled") {
    return 'Linking accounts is switched off. In Supabase, turn on "Allow manual linking" under Authentication > Sign In / Providers.';
  }
  return text || "Connecting Google didn't finish. Try again.";
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

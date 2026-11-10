// Exercises the row-level security rules and database functions as two pretend users.
// Everything runs in one transaction that is rolled back, so nothing is left behind.
const root = require("path").join(__dirname, "..");
const pg = require(root + "/node_modules/pg");
const fs = require("fs");
const env = Object.fromEntries(
  fs.readFileSync(root + "/.env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]; }),
);
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", P2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const M = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const stats = JSON.stringify({ pace: 60, stamina: 60, shooting: 60, passing: 60, dribbling: 60, defending: 60 });
let pass = 0, failN = 0;

(async () => {
  const c = new pg.Client({ host: env.SUPABASE_DB_HOST, user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, database: "postgres", port: 5432, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const as = async (uid) => {
    await c.query("reset role");
    if (!uid) { await c.query("set local role anon"); await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`); return; }
    await c.query("set local role authenticated");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
  };
  let n = 0;
  // Runs a statement inside a savepoint so a refused one doesn't end the test.
  const run = async (sql, params) => {
    const sp = "s" + ++n;
    await c.query("savepoint " + sp);
    try { const r = await c.query(sql, params); await c.query("release savepoint " + sp); return { ok: true, rows: r.rows, count: r.rowCount }; }
    catch (e) { await c.query("rollback to savepoint " + sp); return { ok: false, error: e.message }; }
  };
  const expect = (label, cond, detail) => { cond ? pass++ : failN++; console.log(`${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : "  -> " + JSON.stringify(detail)}`); };
  const player = (id, owner, name) => [`insert into players (id, owner, name, stats, primary_pos, foot, playstyle) values ($1,$2,$3,$4,'MID','right','balanced')`, [id, owner, name, stats]];

  await c.query("begin");
  try {
    await c.query(`insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','rls-a@example.invalid'), ($2,'authenticated','authenticated','rls-b@example.invalid')`, [U1, U2]);

    await as(U1);
    let r = await run(...player(P1, U1, "Host"));
    expect("user creates their own profile", r.ok, r);
    r = await run(...player(P2, U2, "Imposter"));
    expect("user cannot create a profile for someone else", !r.ok, r);
    r = await run(`insert into matches (id, host_id, title, venue, datetime, per_side, max_players, min_players, invite_code) values ($1,$2,'T','V','2026-12-01T20:00',3,6,6,'ABC123')`, [M, P1]);
    expect("host creates a match", r.ok, r);
    r = await run(`insert into match_participants (match_id, player_id) values ($1,$2)`, [M, P1]);
    expect("host adds themself to the squad", r.ok, r);
    r = await run(`insert into match_teams (match_id) values ($1)`, [M]);
    expect("host creates the teams row", r.ok, r);
    r = await run(`select add_sample_players($1, 3)`, [M]);
    expect("host adds 3 sample players", r.ok, r);
    r = await run(`select count(*)::int n from match_participants where match_id=$1`, [M]);
    expect("squad is now 4", r.rows?.[0].n === 4, r);
    r = await run(`update match_teams set teams='{"a":[],"b":[],"subs":[],"joker":null,"version":1}', pins=$2 where match_id=$1`, [M, JSON.stringify({ [P1]: "a", "00000000-0000-4000-8000-000000000001": "b" })]);
    expect("host saves a draft and pins", r.ok && r.count === 1, r);
    r = await run(`insert into match_log (match_id, action, detail) values ($1,'generate','Generated teams')`, [M]);
    expect("host writes the log", r.ok, r);

    await as(U2);
    r = await run(...player(P2, U2, "Guest"));
    expect("second user creates a profile", r.ok, r);
    r = await run(`insert into matches (id, host_id, title, venue, datetime, per_side, max_players, min_players, invite_code) values (gen_random_uuid(),$1,'T','V','x',3,6,6,'ZZZ')`, [P1]);
    expect("cannot host a match as someone else", !r.ok, r);
    r = await run(`select * from match_teams where match_id=$1`, [M]);
    expect("player cannot see the draft teams", r.ok && r.rows.length === 0, r);
    r = await run(`update matches set status='locked', adjustments='{"x":1}' where id=$1`, [M]);
    expect("player cannot edit the match", r.ok && r.count === 0, r);
    r = await run(`update match_teams set teams=null where match_id=$1`, [M]);
    expect("player cannot edit the teams", r.ok && r.count === 0, r);
    r = await run(`insert into match_log (match_id, action, detail) values ($1,'move','forged')`, [M]);
    expect("player cannot write the log", !r.ok, r);
    r = await run(`insert into match_participants (match_id, player_id) values ($1,$2)`, [M, P2]);
    expect("player cannot insert into the squad directly", !r.ok, r);
    r = await run(`delete from match_participants where match_id=$1 and player_id=$2`, [M, P1]);
    expect("player cannot remove others", r.ok && r.count === 0, r);
    r = await run(`select add_sample_players($1, 2)`, [M]);
    expect("player cannot add sample players", !r.ok, r);
    r = await run(`update players set name='hacked' where id=$1`, [P1]);
    expect("player cannot edit another profile", r.ok && r.count === 0, r);
    r = await run(`select squad_changed($1)`, [M]);
    expect("internal helpers are not callable", !r.ok, r);
    r = await run(`select join_match($1) s`, [M]);
    expect("player joins through join_match", r.ok && r.rows[0].s === "joined", r);

    await as(U1);
    r = await run(`select teams, pins from match_teams where match_id=$1`, [M]);
    expect("joining clears the draft but keeps pins of players still in", r.rows?.[0].teams === null && Object.keys(r.rows[0].pins).length === 2, r);
    r = await run(`select add_sample_players($1, 5)`, [M]);
    r = await run(`select status, count(*)::int n from match_participants where match_id=$1 group by status order by status`, [M]);
    expect("places cap at 6, the rest wait", r.rows?.[0].n === 6 && r.rows?.[1].n === 4, r);
    r = await run(`update match_teams set teams='{"a":[],"b":[],"subs":[],"joker":null,"version":2}' where match_id=$1`, [M]);
    r = await run(`update matches set status='locked' where id=$1`, [M]);
    expect("host locks the match", r.ok && r.count === 1, r);

    await as(U2);
    r = await run(`select * from match_teams where match_id=$1`, [M]);
    expect("player sees teams once locked", r.rows?.length === 1, r);
    r = await run(`select leave_match($1)`, [M]);
    expect("nobody leaves a locked match", !r.ok, r);

    await as(null);
    r = await run(`select count(*)::int n from match_participants where match_id=$1`, [M]);
    expect("signed-out visitors can read the squad", r.rows?.[0].n === 10, r);
    r = await run(`select join_match($1)`, [M]);
    expect("signed-out visitors cannot join", !r.ok, r);

    await as(U1);
    await run(`update matches set status='open' where id=$1`, [M]);
    r = await run(`select leave_match($1)`, [M]);
    expect("the host cannot leave their own match", !r.ok, r);
    await as(U2);
    r = await run(`select leave_match($1)`, [M]);
    expect("player leaves", r.ok, r);
    await as(U1);
    r = await run(`select status, count(*)::int n from match_participants where match_id=$1 group by status order by status`, [M]);
    expect("the first in the waitlist takes the free place", r.rows?.[0].n === 6 && r.rows?.[1].n === 3, r);
    r = await run(`select teams from match_teams where match_id=$1`, [M]);
    expect("leaving clears the teams", r.rows?.[0].teams === null, r);
  } finally {
    await c.query("rollback");
    const left = await c.query("select (select count(*) from auth.users where email like 'rls-%@example.invalid')::int u, (select count(*) from public.matches)::int m");
    console.log(`\n${pass} passed, ${failN} failed. Left behind: ${left.rows[0].u} test users, ${left.rows[0].m} matches.`);
    await c.end();
  }
})().catch((e) => { console.error("crashed:", e.message); process.exit(1); });

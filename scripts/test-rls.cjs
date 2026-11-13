// Exercises the row-level security rules and database functions as two pretend users.
// Everything runs in one transaction that is rolled back, so nothing is left behind.
// With --pending, migrations not yet applied to the database are run inside that
// transaction first, so a new migration can be tested before it goes live.
const root = require("path").join(__dirname, "..");
const pg = require(root + "/node_modules/pg");
const fs = require("fs");
const env = Object.fromEntries(
  fs.readFileSync(root + "/.env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]; }),
);
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222", U3 = "33333333-3333-4333-8333-333333333333";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", P2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", P3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
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
    if (process.argv.includes("--pending")) {
      const dir = root + "/supabase/migrations";
      const done = new Set((await c.query("select name from public._migrations")).rows.map((x) => x.name));
      for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
        if (done.has(name)) continue;
        await c.query(fs.readFileSync(dir + "/" + name, "utf8"));
        console.log(`(trying ${name} inside the test; it is rolled back with everything else)`);
      }
    }

    await c.query(`insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','rls-a@example.invalid'), ($2,'authenticated','authenticated','rls-b@example.invalid'), ($3,'authenticated','authenticated','rls-c@example.invalid')`, [U1, U2, U3]);

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

    // ------------------------------------------------------------ changing the size
    // The same writes the app makes when the host edits the match.
    r = await run(`select player_id from match_participants where match_id=$1 and status='waitlist'`, [M]);
    const waiting = r.rows.map((x) => x.player_id);
    r = await run(`update matches set per_side=4, max_players=10, min_players=8, title='Bigger', fee=100 where id=$1`, [M]);
    expect("host changes the match to 4v4 with 10 places", r.ok && r.count === 1, r);
    r = await run(`update match_participants set status='joined' where match_id=$1 and player_id = any($2)`, [M, waiting]);
    expect("host moves the waitlist into the new places", r.ok && r.count === 3, r);
    r = await run(`update matches set per_side=4, max_players=7 where id=$1`, [M]);
    expect("places can't drop below both full sides", !r.ok, r);
    await as(U2);
    r = await run(`update matches set per_side=8, max_players=16 where id=$1`, [M]);
    expect("a player cannot change the size", r.ok && r.count === 0, r);
    r = await run(`update match_participants set status='waitlist' where match_id=$1`, [M]);
    expect("a player cannot move people to the waitlist", r.ok && r.count === 0, r);
    await as(U1);
    r = await run(`update matches set per_side=3, max_players=6, min_players=6, title='T', fee=0 where id=$1`, [M]);
    r = await run(`update match_participants set status='waitlist' where match_id=$1 and player_id = any($2)`, [M, waiting]);
    expect("host shrinks it back and sends the extra players to the waitlist", r.ok && r.count === 3, r);

    // ------------------------------------------------------------ referee
    const ev = (kind, side, pid) => [`insert into match_events (match_id, kind, side, player_id, minute) values ($1,$2,$3,$4,5)`, [M, kind, side, pid]];
    r = await run(`select become_referee($1)`, [M]);
    expect("the host cannot referee their own match", !r.ok, r);
    r = await run(`update matches set referee_id=$2 where id=$1`, [M, P1]);
    expect("the host cannot name a referee directly", !r.ok, r);
    r = await run(`update matches set clock='{"running":true,"elapsed":0,"since":null}' where id=$1`, [M]);
    expect("the host cannot set the clock directly", !r.ok, r);
    r = await run(`update matches set minutes=50 where id=$1`, [M]);
    expect("the host can still edit the match", r.ok && r.count === 1, r);

    await as(U2);
    r = await run(`select become_referee($1)`, [M]);
    expect("a player who isn't in the squad volunteers as referee", r.ok, r);
    r = await run(`select referee_id from matches where id=$1`, [M]);
    expect("they are now the referee", r.rows?.[0].referee_id === P2, r);
    r = await run(`select join_match($1)`, [M]);
    expect("the referee cannot also join as a player", !r.ok, r);
    r = await run(`select set_match_clock($1, '{"running":true,"elapsed":0,"since":1700000000000}')`, [M]);
    expect("the referee starts the clock", r.ok, r);
    r = await run(`select set_match_clock($1, '{"running":"yes","elapsed":-4}')`, [M]);
    expect("a broken clock value is refused", !r.ok, r);
    r = await run(...ev("goal", "a", P1));
    expect("no goals before the teams are locked", !r.ok, r);

    await as(U3);
    r = await run(...player(P3, U3, "Third"));
    expect("third user creates a profile", r.ok, r);
    r = await run(`select become_referee($1)`, [M]);
    expect("a match has only one referee", !r.ok, r);
    r = await run(`select set_match_clock($1, '{"running":false,"elapsed":0,"since":null}')`, [M]);
    expect("only the referee runs the clock", !r.ok, r);

    await as(U1);
    await run(`update match_teams set teams='{"a":[],"b":[],"subs":[],"joker":null,"version":3}' where match_id=$1`, [M]);
    r = await run(`update matches set status='locked' where id=$1`, [M]);
    expect("host locks the teams again", r.ok && r.count === 1, r);
    r = await run(...ev("yellow", null, P1));
    expect("the host cannot record cards", !r.ok, r);

    await as(U2);
    r = await run(...ev("goal", "a", P1));
    expect("the referee records a goal", r.ok, r);
    r = await run(...ev("yellow", null, P1));
    expect("the referee shows a yellow card", r.ok, r);
    r = await run(...ev("red", null, P3));
    expect("cards only go to people in the squad", !r.ok, r);
    r = await run(...ev("goal", null, null));
    expect("a goal must say which team it counts for", !r.ok, r);

    await as(U3);
    r = await run(`delete from match_events where match_id=$1`, [M]);
    expect("others cannot delete events", r.ok && r.count === 0, r);
    await as(null);
    r = await run(`select count(*)::int n from match_events where match_id=$1`, [M]);
    expect("everyone can read goals and cards", r.rows?.[0].n === 2, r);
    r = await run(`select clock->>'running' running from matches where id=$1`, [M]);
    expect("everyone can read the clock", r.rows?.[0].running === "true", r);

    await as(U2);
    r = await run(`delete from match_events where match_id=$1 and kind='yellow'`, [M]);
    expect("the referee removes a mistaken card", r.ok && r.count === 1, r);

    await as(U1);
    r = await run(`select clear_referee($1)`, [M]);
    expect("the host can remove the referee", r.ok, r);
    await run(`update matches set status='open' where id=$1`, [M]);
    await as(U3);
    r = await run(`select join_match($1) s`, [M]);
    expect("third user joins the squad", r.ok, r);
    r = await run(`select become_referee($1)`, [M]);
    expect("a squad member can switch to referee while teams are open", r.ok, r);
    r = await run(`select (select referee_id from matches where id=$1) ref, (select count(*)::int from match_participants where match_id=$1 and player_id=$2) n`, [M, P3]);
    expect("and gives up their place to do it", r.rows?.[0].ref === P3 && r.rows[0].n === 0, r);
    r = await run(`select clear_referee($1)`, [M]);
    expect("the referee can step down", r.ok, r);

    // ------------------------------------------------------------ host ratings
    const rated = (gk) => [stats, gk];
    const adjGk = async (pid) => (await run(`select adjustments->$2->>'gk' gk from matches where id=$1`, [M, pid])).rows?.[0]?.gk ?? null;
    await as(U1);
    r = await run(`insert into host_ratings (host_id, player_id, stats, gk) values ($1,$2,$3,$4)`, [P1, P2, ...rated(41)]);
    expect("a host saves their rating of a player", r.ok, r);
    r = await run(`insert into host_ratings (host_id, player_id, stats, gk) values ($1,$2,$3,$4)`, [P2, P3, ...rated(41)]);
    expect("nobody saves ratings in another host's name", !r.ok, r);
    r = await run(`select apply_host_ratings($1)`, [M]);
    expect("the fill-in helper is not callable", !r.ok, r);

    await as(U2);
    r = await run(`select * from host_ratings`);
    expect("a player cannot see what hosts rated them", r.ok && r.rows.length === 0, r);
    r = await run(`update host_ratings set gk=99 where player_id=$1`, [P2]);
    expect("a player cannot change a host's rating of them", r.ok && r.count === 0, r);
    r = await run(`delete from host_ratings where player_id=$1`, [P2]);
    expect("a player cannot delete a host's rating of them", r.ok && r.count === 0, r);
    r = await run(`select join_match($1) s`, [M]);
    expect("player joins again", r.ok, r);
    expect("they start on the host's saved rating", (await adjGk(P2)) === "41", await adjGk(P2));
    r = await run(`select leave_match($1)`, [M]);
    expect("leaving takes their match rating away", (await adjGk(P2)) === null, await adjGk(P2));
    await run(`select join_match($1)`, [M]);
    expect("and rejoining brings the saved rating back", (await adjGk(P2)) === "41", await adjGk(P2));

    await as(U1);
    r = await run(`update matches set adjustments = adjustments || jsonb_build_object($2::text, jsonb_build_object('stats', $3::jsonb, 'gk', 50, 'once', true)) where id=$1`, [M, P3, stats]);
    r = await run(`insert into host_ratings (host_id, player_id, stats, gk) values ($1,$2,$3,$4)`, [P1, P3, ...rated(60)]);
    await as(U3);
    r = await run(`select join_match($1)`, [M]);
    expect("a rating the host already set in this match wins over the saved one", (await adjGk(P3)) === "50", await adjGk(P3));

    await as(U2);
    r = await run(`insert into matches (id, host_id, title, venue, datetime, per_side, max_players, min_players, invite_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',$1,'T2','V','2026-12-02T20:00',3,6,6,'XYZ789')`, [P2]);
    expect("another host creates a match", r.ok, r);
    await as(U3);
    r = await run(`select join_match('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')`);
    r = await run(`select adjustments from matches where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'`);
    expect("one host's ratings don't follow players into another host's match", r.ok && Object.keys(r.rows[0].adjustments).length === 0, r);

    await as(U1);
    r = await run(`delete from host_ratings where host_id=$1 and player_id=$2`, [P1, P2]);
    expect("a host forgets their rating of a player", r.ok && r.count === 1, r);
  } finally {
    await c.query("rollback");
    const left = await c.query("select (select count(*) from auth.users where email like 'rls-%@example.invalid')::int u, (select count(*) from public.matches where id = $1)::int m", [M]);
    console.log(`\n${pass} passed, ${failN} failed. Left behind: ${left.rows[0].u} test users, ${left.rows[0].m} test matches.`);
    await c.end();
  }
})().catch((e) => { console.error("crashed:", e.message); process.exit(1); });

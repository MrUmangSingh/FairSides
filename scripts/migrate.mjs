// Applies supabase/migrations/*.sql to the project's database, once each, in name order.
// Usage: node scripts/migrate.mjs            apply pending migrations
//        node scripts/migrate.mjs --check    only test the connection
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD from .env.local.
// Set SUPABASE_DB_HOST there too (the "Session pooler" host from the dashboard's
// Connect button) if the automatic search below can't find your region.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2")];
    }),
);

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const password = env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error("SUPABASE_DB_PASSWORD is missing from .env.local");

// The direct host is IPv6-only on Supabase's free plan; the session pooler works over IPv4.
const REGIONS = [
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-west-1", "eu-west-2", "eu-west-3",
  "eu-central-1", "eu-central-2", "eu-north-1", "ca-central-1", "sa-east-1",
];
const targets = env.SUPABASE_DB_HOST
  ? [{ host: env.SUPABASE_DB_HOST, user: `postgres.${ref}` }]
  : [
      { host: `db.${ref}.supabase.co`, user: "postgres" },
      ...REGIONS.flatMap((r) => [0, 1].map((n) => ({ host: `aws-${n}-${r}.pooler.supabase.com`, user: `postgres.${ref}` }))),
    ];

async function connect() {
  const errors = [];
  for (const t of targets) {
    const client = new pg.Client({
      ...t,
      port: 5432,
      database: "postgres",
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
    });
    try {
      await client.connect();
      console.log(`Connected through ${t.host}`);
      return client;
    } catch (e) {
      errors.push(`${t.host}: ${e.message}`);
      await client.end().catch(() => {});
    }
  }
  throw new Error(`Could not reach the database.\n${errors.join("\n")}`);
}

const client = await connect();
try {
  if (process.argv.includes("--check")) {
    const { rows } = await client.query("select current_user, version()");
    console.log(rows[0]);
  } else {
    await client.query(
      "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await client.query("alter table public._migrations enable row level security");
    const done = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));
    const dir = join(root, "supabase", "migrations");
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(name)) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, name), "utf8"));
        await client.query("insert into public._migrations (name) values ($1)", [name]);
        await client.query("commit");
        console.log(`Applied ${name}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`${name} failed and was rolled back: ${e.message}`);
      }
    }
    console.log("Database is up to date.");
  }
} finally {
  await client.end();
}

# Fairsides

Fair teams for pickup football. Players rate themselves, a host creates a match of any size,
and the app splits the squad into two balanced teams.

Built in phases from `docs/football_team_balancer_plan.md`.

## Run it

```bash
npm install
npm run dev         # http://localhost:3000
npm test            # balancing, odd-player modes, pins, rotation and formation tests
npm run db:migrate  # apply supabase/migrations to the database
npm run db:test     # check the database's access rules (runs in a rolled-back transaction)
```

## Accounts and shared matches (Supabase)

`.env.local` (not committed) holds:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_DB_PASSWORD=...     # only used by the two db scripts
SUPABASE_DB_HOST=...         # session pooler host, e.g. aws-1-ap-southeast-2.pooler.supabase.com
```

With the first two set, profiles and matches live in Supabase and update live for everyone.
Without them (or with `NEXT_PUBLIC_FAIRSIDES_LOCAL=1`) the app keeps everything in the
browser's localStorage, which is handy for demos.

Sign-in methods are read from the Supabase project. Turn them on in the dashboard under
Authentication → Sign In / Providers:

- **Anonymous sign-ins**: one switch; gives the "Continue as a guest" button.
- **Google**: needs an OAuth client ID and secret from Google Cloud; add
  `http://localhost:3000` and the deployed URL under Authentication → URL Configuration.
- **Email link** is on by default, but Supabase's built-in mail only delivers to the project's
  own team members and is rate-limited, so it is for testing only.

## Where things are

| Path | What |
|---|---|
| `src/lib/domain/` | Pure logic: ratings, the balancing algorithm, odd-player modes, best swap, sub rotation, formations |
| `src/lib/store.ts` | The data layer the screens use: state, actions, and background saving |
| `src/lib/cloud.ts` | Everything that talks to Supabase |
| `src/components/` | 3D pitch, team editor (drag and drop), rating panel, balance meter, player card |
| `src/app/` | Screens: landing, profile, matches, create match, match page |
| `supabase/migrations/` | Database schema, access rules and the sample players |
| `scripts/` | `migrate.mjs` and `test-rls.cjs` |

## Phase status

- **Phase 1 (done):** profile, create/join/leave with any team size, waitlist with auto-promotion,
  live place counter, balancing (hill climbing, 200 restarts), host Generate / Shuffle / Lock,
  accounts and shared matches through Supabase.
- **Phase 2 (done):** host rating adjustments (match-only, logged, visible to players),
  drag-and-drop and tap-to-swap team editing, pins that survive a shuffle, suggest-best-swap,
  the list of host changes, odd-player modes (rolling sub, uneven teams, joker), sub rotation
  schedule, remove a player.
- **Brought forward from Phase 3 (done):** dark cinematic design, 3D hero with a scroll-driven
  camera, 3D ground for the team view (joker on the centre spot, subs on the touchline), player
  card with a radar chart. Card image export is still to do.
- **Not done from the plan's Phase 2 list:** dragging players in the 3D view (the editor below it
  does the moving), transferring the host role, editing match details after creating.
- **Next, Phase 4:** advanced mode, match results, peer ratings, Verified badge, reliability score.

## Where the code departs from the plan

- **Uneven teams (plan §6.3).** The plan says "bigger team's total + bonus = smaller team's
  total". A normal squad can't satisfy that: it needs the best six to outscore the other seven.
  The code keeps the plan's idea that an extra body is worth about 60% of an average player
  (scaled by team size) and marks the bigger team's totals down by the other 40%, which gives
  the intended result: the bigger team is weaker per player. See `EXTRA_PLAYER_FACTOR` in
  `src/lib/domain/balance.ts`.
- **Rolling subs (plan §7.5).** Each sub is attached to one team's bench so nobody changes
  sides mid-match; with an odd number of subs the spare goes to the team with less stamina.
- **Balancing runs in the host's browser**, not on the server. The database only accepts team
  changes from the host, so players can't tamper, but a host could bypass the algorithm (they
  are allowed to edit teams by hand anyway).
- **Private matches** are hidden from the list but readable by anyone who has the link.

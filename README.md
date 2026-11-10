# Fairsides

Fair teams for pickup football. Players rate themselves, a host creates a match of any size,
and the app splits the squad into two balanced teams.

Built in phases from `docs/football_team_balancer_plan.md`.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # balancing, ratings and formation tests
```

## Where things are

| Path | What |
|---|---|
| `src/lib/domain/` | Pure logic: ratings (OVR), the balancing algorithm, formations, sample players |
| `src/lib/store.ts` | Phase 1 data layer (browser localStorage, synced across tabs) |
| `src/components/` | Pitch, balance meter, header |
| `src/app/` | Screens: landing, profile, matches, create match, match page |
| `supabase/migrations/` | Database schema, ready for when accounts are switched on |

## Phase status

- **Phase 1 (done):** profile, create/join/leave with any team size, waitlist with auto-promotion,
  live place counter, balancing (snake draft + hill climbing, 200 restarts), 2D lineup,
  host Generate / Shuffle / Lock.
- **Not yet in Phase 1:** Google login and shared matches across devices. These need a Supabase
  project; until then every match lives in the browser it was created in.
- **Brought forward from Phase 3 (done):** dark cinematic redesign, full-screen 3D hero with a
  scroll-driven camera, 3D ground for the team view (React Three Fiber, `src/components/pitch-3d-scene.tsx`),
  and a player card with a radar chart shown after registering. Card image export is still to do.
- **Phase 2 next:** host rating adjustments, drag-and-drop editing, pins, suggest-best-swap,
  edit log, odd-player modes, rotation schedule.

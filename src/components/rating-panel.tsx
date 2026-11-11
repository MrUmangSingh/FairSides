"use client";

import { ovr, sameRating, savedNotUsed, shiftToOvr, toSaved, withAdjustment } from "@/lib/domain/ratings";
import { STAT_KEYS, STAT_LABELS, type Adjustment, type Player, type RatingBook } from "@/lib/domain/types";
import { actions } from "@/lib/store";

const fill = (v: number) => ({ ["--fill" as string]: `${((v - 1) / 98) * 100}%` });

/**
 * Says where a player's rating in this match comes from. The host sees whether it is
 * their saved rating or a one-off; everyone else sees only that the host changed it.
 */
export function RatingTag({ adjustment, host }: { adjustment?: Adjustment; host: boolean }) {
  if (!adjustment) return null;
  if (!host) return <span className="text-warn"> (host adjusted)</span>;
  return adjustment.once ? (
    <span className="text-warn"> (this match only)</span>
  ) : (
    <span className="text-chalk-dim"> (rated by you)</span>
  );
}

/**
 * Host-only. A rating set here counts for this match and is saved as the host's
 * rating for that player: the next time they join a match this host runs, they start
 * on it instead of their profile rating. "Only this match" keeps a change to this match.
 * The profile itself is never touched, and every change is logged.
 */
export function RatingPanel({
  matchId,
  players,
  adjustments,
  book,
  locked,
}: {
  matchId: string;
  /** Profile versions of everyone in the squad. */
  players: Player[];
  adjustments: Record<string, Adjustment>;
  /** The host's saved ratings. */
  book: RatingBook;
  /** Teams are locked: ratings no longer move anyone, but are still saved for next time. */
  locked: boolean;
}) {
  const saved = players.filter((p) => adjustments[p.id] && !adjustments[p.id].once).length;
  const once = players.filter((p) => adjustments[p.id]?.once).length;
  const own = players.length - saved - once;
  const unused = savedNotUsed(
    players.map((p) => p.id),
    adjustments,
    book,
  );
  const summary = [
    saved ? `${saved} on your rating` : "",
    once ? `${once} for this match only` : "",
    own ? `${own} on their own rating` : "",
    unused.length ? `${unused.length} not on your saved rating` : "",
  ].filter(Boolean);

  return (
    <details className="panel group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-xl">{locked ? "Rate how they played" : "Adjust ratings"}</h2>
        <span className="text-sm text-chalk-dim">{summary.join(", ")}</span>
        <span className="ml-auto text-sm font-semibold text-chalk-dim group-open:hidden">Open</span>
        <span className="ml-auto hidden text-sm font-semibold text-chalk-dim group-open:inline">Close</span>
      </summary>
      <div className="px-5 pb-5">
        <p className="max-w-2xl text-sm text-chalk-dim">
          {locked
            ? "The teams are locked, so changes here won't move anyone. Rate people on how they actually played. "
            : "Know someone is better or worse than they say? Set what you think here. "}
          Your rating is saved, and they start on it the next time they join a match you host. Tick{" "}
          <span className="text-chalk">Only this match</span> first for a one-off. Their profile is never changed,
          and every change shows in the list of host changes.
        </p>

        {unused.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-glow/40 bg-glow/8 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm">
              {unused.length === 1
                ? "1 player has a saved rating from you that this match isn't using."
                : `${unused.length} players have a saved rating from you that this match isn't using.`}
            </p>
            <button type="button" className="btn btn-sm" onClick={() => actions.applySavedRatings(matchId)}>
              Use saved {unused.length === 1 ? "rating" : "ratings"}
            </button>
          </div>
        ) : null}

        <ul className="mt-4 grid gap-x-10 lg:grid-cols-2">
          {players.map((p) => (
            <RatingRow key={p.id} matchId={matchId} player={p} adjustment={adjustments[p.id]} saved={book[p.id]} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function RatingRow({
  matchId,
  player,
  adjustment,
  saved,
}: {
  matchId: string;
  player: Player;
  adjustment?: Adjustment;
  saved?: Adjustment;
}) {
  const now = withAdjustment(player, adjustment);
  const own = Math.round(ovr(player));
  const rated = Math.round(ovr(now));
  const keeps = player.canGk || player.primaryPos === "GK";
  const once = Boolean(adjustment?.once);
  // Every change keeps the row's "only this match" choice.
  const set = (next: Adjustment) =>
    actions.adjustRating(matchId, player.id, once ? { ...toSaved(next), once: true } : toSaved(next));
  const savedOvr = saved ? Math.round(ovr(withAdjustment(player, saved))) : null;
  const offSaved = saved && (!adjustment || !sameRating(adjustment, saved));
  const source = !adjustment ? "Their own rating" : once ? "This match only" : "Your saved rating";

  return (
    <li className="chalk-rule py-3">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate font-medium">
          {player.name} <span className="text-sm font-normal text-chalk-dim">{player.primaryPos}</span>
        </span>
        {adjustment ? (
          <span className="text-sm text-chalk-dim">
            profile <span className="tabular-nums line-through">{own}</span>
          </span>
        ) : null}
        <output
          className={`w-9 text-right font-display text-xl font-bold tabular-nums ${once ? "text-warn" : adjustment ? "text-glow" : ""}`}
        >
          {rated}
        </output>
      </div>
      <p className={`text-xs ${once ? "text-warn" : "text-chalk-dim"}`}>{source}</p>
      <input
        type="range"
        className="stat"
        min={1}
        max={99}
        value={rated}
        aria-label={`Overall rating for ${player.name}`}
        style={fill(rated)}
        onChange={(e) => set(shiftToOvr(now, Number(e.target.value)))}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-warn)]"
            checked={once}
            onChange={(e) =>
              actions.adjustRating(
                matchId,
                player.id,
                e.target.checked ? { ...toSaved(now), once: true } : toSaved(now),
              )
            }
          />
          Only this match
        </label>
        {offSaved ? (
          <button
            type="button"
            className="text-sm font-semibold underline underline-offset-4 hover:text-glow"
            onClick={() => actions.adjustRating(matchId, player.id, toSaved(saved))}
          >
            Use your saved {savedOvr}
          </button>
        ) : null}
        {adjustment || saved ? (
          <button
            type="button"
            className="ml-auto text-sm text-chalk-dim underline underline-offset-4 hover:text-chalk"
            title="Puts them back on their profile rating and forgets your saved rating for them"
            onClick={() => actions.adjustRating(matchId, player.id, null)}
          >
            Use their own {own}
          </button>
        ) : null}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-chalk-dim hover:text-chalk">Individual stats</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1">
          {STAT_KEYS.map((k) => (
            <label key={k} className="block text-xs text-chalk-dim">
              <span className="flex justify-between">
                {STAT_LABELS[k]} <span className="tabular-nums text-chalk">{now.stats[k]}</span>
              </span>
              <input
                type="range"
                className="stat"
                min={1}
                max={99}
                value={now.stats[k]}
                style={fill(now.stats[k])}
                onChange={(e) => set({ gk: now.gk, stats: { ...now.stats, [k]: Number(e.target.value) } })}
              />
            </label>
          ))}
          {keeps ? (
            <label className="block text-xs text-chalk-dim">
              <span className="flex justify-between">
                Goalkeeping <span className="tabular-nums text-chalk">{now.gk}</span>
              </span>
              <input
                type="range"
                className="stat"
                min={1}
                max={99}
                value={now.gk}
                style={fill(now.gk)}
                onChange={(e) => set({ stats: now.stats, gk: Number(e.target.value) })}
              />
            </label>
          ) : null}
        </div>
      </details>
    </li>
  );
}

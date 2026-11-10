"use client";

import { ovr, shiftToOvr, withAdjustment } from "@/lib/domain/ratings";
import { STAT_KEYS, STAT_LABELS, type Adjustment, type Player } from "@/lib/domain/types";
import { actions } from "@/lib/store";

const fill = (v: number) => ({ ["--fill" as string]: `${((v - 1) / 98) * 100}%` });

/**
 * Host-only. Ratings set here apply to this match alone: the player's profile
 * is untouched, the change is logged, and everyone sees which players were adjusted.
 */
export function RatingPanel({
  matchId,
  players,
  adjustments,
}: {
  matchId: string;
  /** Profile versions of everyone in the squad. */
  players: Player[];
  adjustments: Record<string, Adjustment>;
}) {
  const changed = players.filter((p) => adjustments[p.id]).length;

  return (
    <details className="panel group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-xl">Adjust ratings</h2>
        <span className="text-sm text-chalk-dim">
          {changed === 0 ? "Everyone is on their own rating" : `${changed} adjusted for this match`}
        </span>
        <span className="ml-auto text-sm font-semibold text-chalk-dim group-open:hidden">Open</span>
        <span className="ml-auto hidden text-sm font-semibold text-chalk-dim group-open:inline">Close</span>
      </summary>
      <div className="px-5 pb-5">
        <p className="max-w-2xl text-sm text-chalk-dim">
          Know someone is better or worse than they say? Set what you think here. It only counts for this match,
          it shows in the list of host changes, and the player sees that they were adjusted.
        </p>
        <ul className="mt-4 grid gap-x-10 lg:grid-cols-2">
          {players.map((p) => (
            <RatingRow key={p.id} matchId={matchId} player={p} adjustment={adjustments[p.id]} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function RatingRow({ matchId, player, adjustment }: { matchId: string; player: Player; adjustment?: Adjustment }) {
  const now = withAdjustment(player, adjustment);
  const own = Math.round(ovr(player));
  const rated = Math.round(ovr(now));
  const keeps = player.canGk || player.primaryPos === "GK";
  const set = (next: Adjustment) => actions.adjustRating(matchId, player.id, next);

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
        <output className={`w-9 text-right font-display text-xl font-bold tabular-nums ${adjustment ? "text-warn" : ""}`}>
          {rated}
        </output>
      </div>
      <input
        type="range"
        className="stat"
        min={1}
        max={99}
        value={rated}
        aria-label={`Overall rating for ${player.name} in this match`}
        style={fill(rated)}
        onChange={(e) => set(shiftToOvr(now, Number(e.target.value)))}
      />
      <div className="flex items-start justify-between gap-4">
        <details className="min-w-0 flex-1">
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
        {adjustment ? (
          <button
            type="button"
            className="text-sm font-semibold underline underline-offset-4 hover:text-glow"
            onClick={() => actions.adjustRating(matchId, player.id, null)}
          >
            Reset to profile rating
          </button>
        ) : null}
      </div>
    </li>
  );
}

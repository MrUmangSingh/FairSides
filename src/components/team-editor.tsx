"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { bestSwap, compareTeams, type SwapSuggestion } from "@/lib/domain/balance";
import { ovr } from "@/lib/domain/ratings";
import type { Adjustment, Player, Side, Teams, Zone } from "@/lib/domain/types";
import { actions } from "@/lib/store";
import { TEAM_NAMES } from "./balance-meter";
import { RatingTag } from "./rating-panel";

const ZONES: Record<Zone, { name: string; swatch: string; glow: string }> = {
  a: { name: TEAM_NAMES.a, swatch: "bg-bib-a", glow: "rgb(245 213 71 / 0.55)" },
  b: { name: TEAM_NAMES.b, swatch: "bg-bib-b", glow: "rgb(255 92 154 / 0.55)" },
  subs: { name: "Subs", swatch: "bg-[#93a4a8]", glow: "rgb(147 164 168 / 0.5)" },
};

// A player under the pointer wins over the column behind them: that drop is a swap.
const preferPlayers: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const players = hits.filter((h) => String(h.id).startsWith("player:"));
  return players.length ? players : hits;
};

const gapAfter = (a: Player[], b: Player[], s: SwapSuggestion) => {
  const out = a.find((p) => p.id === s.fromA)!;
  const into = b.find((p) => p.id === s.fromB)!;
  return compareTeams(
    a.map((p) => (p === out ? into : p)),
    b.map((p) => (p === into ? out : p)),
  ).gap.pct;
};

interface Props {
  matchId: string;
  teams: Teams;
  /** Players as rated for this match. */
  lookup: (ids: string[]) => Player[];
  pins: Record<string, Side>;
  adjustments: Record<string, Adjustment>;
}

/** The host's draft: drag players between sides, tap two to swap, pin, or ask for the best swap. */
export function TeamEditor({ matchId, teams, lookup, pins, adjustments }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short hold starts a drag on touch screens, so a plain swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [asked, setAsked] = useState<{ version: number; swap: SwapSuggestion | null } | null>(null);

  const rosters: Record<Zone, Player[]> = { a: lookup(teams.a), b: lookup(teams.b), subs: lookup(teams.subs) };
  const joker = teams.joker ? (lookup([teams.joker])[0] ?? null) : null;
  const everyone = [...rosters.a, ...rosters.b, ...rosters.subs, ...(joker ? [joker] : [])];
  const byId = new Map(everyone.map((p) => [p.id, p]));
  const zoneOf = (id: string): Zone | "joker" | null =>
    teams.joker === id ? "joker" : ((["a", "b", "subs"] as const).find((z) => teams[z].includes(id)) ?? null);

  // A selection or suggestion only holds for the split it was made on.
  const picked = selected && byId.has(selected) ? selected : null;
  const suggestion = asked?.version === teams.version ? asked : null;
  const hinted = new Set(suggestion?.swap ? [suggestion.swap.fromA, suggestion.swap.fromB] : []);

  function tap(id: string) {
    if (!picked || picked === id || zoneOf(picked) === zoneOf(id)) {
      setSelected(picked === id ? null : id);
      return;
    }
    actions.swapPlayers(matchId, picked, id);
    setSelected(null);
  }

  function drop(e: DragEndEvent) {
    setDragging(null);
    const id = String(e.active.id).slice("player:".length);
    const over = e.over ? String(e.over.id) : "";
    if (over.startsWith("player:")) actions.swapPlayers(matchId, id, over.slice("player:".length));
    else if (over.startsWith("zone:")) actions.movePlayer(matchId, id, over.slice("zone:".length) as Zone);
    setSelected(null);
  }

  const before = compareTeams(rosters.a, rosters.b).gap.pct;
  const pickedPlayer = picked ? byId.get(picked) : null;
  const held = dragging ? byId.get(dragging) : null;

  const row = (p: Player, zone: Zone | "joker") => (
    <PlayerRow
      key={p.id}
      player={p}
      selected={picked === p.id}
      hinted={hinted.has(p.id)}
      pinned={Boolean(pins[p.id])}
      canPin={zone === "a" || zone === "b"}
      adjustment={adjustments[p.id]}
      onTap={() => tap(p.id)}
      onPin={() => actions.togglePin(matchId, p.id)}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferPlayers}
      onDragStart={(e) => setDragging(String(e.active.id).slice("player:".length))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={drop}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-xl text-sm text-chalk-dim" aria-live="polite">
          {pickedPlayer
            ? `${pickedPlayer.name} is selected. Tap a player on another side to swap them, or choose where to move them.`
            : "Drag a player onto a side to move them, or onto another player to swap. Tapping two players swaps them too."}
        </p>
        <button
          type="button"
          className="btn btn-line btn-sm"
          disabled={rosters.a.length === 0 || rosters.b.length === 0}
          onClick={() => setAsked({ version: teams.version, swap: bestSwap(rosters.a, rosters.b, pins) })}
        >
          Suggest best swap
        </button>
      </div>

      {suggestion ? (
        <div className="panel mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-glow/40 p-4" role="status">
          {suggestion.swap ? (
            <>
              <p className="min-w-0 flex-1">
                Swap <strong>{byId.get(suggestion.swap.fromA)?.name}</strong> with{" "}
                <strong>{byId.get(suggestion.swap.fromB)?.name}</strong>
                <span className="text-chalk-dim">
                  {" "}
                  — the strength gap goes from {before.toFixed(1)}% to{" "}
                  {gapAfter(rosters.a, rosters.b, suggestion.swap).toFixed(1)}%, with attack, defence and positions
                  closer too.
                </span>
              </p>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  actions.swapPlayers(matchId, suggestion.swap!.fromA, suggestion.swap!.fromB);
                  setAsked(null);
                }}
              >
                Make this swap
              </button>
            </>
          ) : (
            <p className="min-w-0 flex-1">No single swap makes these teams fairer.</p>
          )}
          <button type="button" className="btn btn-line btn-sm" onClick={() => setAsked(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {(["a", "b", "subs"] as const).map((zone) => (
          <ZoneColumn
            key={zone}
            zone={zone}
            players={rosters[zone]}
            wide={zone === "subs"}
            moveLabel={pickedPlayer && zoneOf(pickedPlayer.id) !== zone ? `Move ${pickedPlayer.name} here` : null}
            onMove={() => {
              if (picked) actions.movePlayer(matchId, picked, zone);
              setSelected(null);
            }}
            footer={
              zone === "subs" && joker ? (
                <div className="mt-4">
                  <h4 className="flex items-center gap-2 font-sans text-sm font-semibold text-chalk-dim">
                    <span aria-hidden className="size-3 rounded-full bg-[#7fd8ff]" />
                    Joker, plays for whichever side has the ball
                  </h4>
                  <ul className="mt-2">{row(joker, "joker")}</ul>
                </div>
              ) : null
            }
          >
            {rosters[zone].map((p) => row(p, zone))}
          </ZoneColumn>
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {held ? (
          <div className="flex cursor-grabbing items-center gap-3 rounded-xl border border-glow bg-panel px-3 py-2.5 shadow-[0_18px_50px_-10px_rgb(70_240_160/0.7)]">
            <span className="w-9 font-display text-xl font-bold tabular-nums">{Math.round(ovr(held))}</span>
            <span className="font-medium">{held.name}</span>
            <span className="ml-auto text-sm text-chalk-dim">{held.primaryPos}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ZoneColumn({
  zone,
  players,
  wide,
  moveLabel,
  onMove,
  footer,
  children,
}: {
  zone: Zone;
  players: Player[];
  wide: boolean;
  moveLabel: string | null;
  onMove: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone}` });
  const z = ZONES[zone];
  const avg = players.length ? Math.round(players.reduce((s, p) => s + ovr(p), 0) / players.length) : null;

  return (
    <section
      ref={setNodeRef}
      aria-label={z.name}
      className={`panel p-4 transition-[box-shadow,border-color] duration-200 ${wide ? "sm:col-span-2" : ""}`}
      style={isOver ? { borderColor: z.glow, boxShadow: `0 0 0 1px ${z.glow}, 0 0 44px -12px ${z.glow}` } : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-2.5 text-xl">
          <span aria-hidden className={`size-3.5 rounded-full ${z.swatch}`} />
          {z.name}
        </h3>
        <span className="text-sm text-chalk-dim tabular-nums">
          {players.length}
          {avg !== null ? `, average ${avg}` : ""}
        </span>
        {moveLabel ? (
          <button type="button" className="btn btn-sm ml-auto" onClick={onMove}>
            {moveLabel}
          </button>
        ) : null}
      </div>
      {players.length === 0 ? (
        <p className="mt-3 text-sm text-chalk-dim">
          {zone === "subs" ? "Nobody on the bench. Drop a player here to rest them." : "Empty. Drop players here."}
        </p>
      ) : (
        <ul className={`mt-2 ${wide ? "grid gap-x-6 sm:grid-cols-2" : ""}`}>{children}</ul>
      )}
      {footer}
    </section>
  );
}

function PlayerRow({
  player,
  selected,
  hinted,
  pinned,
  canPin,
  adjustment,
  onTap,
  onPin,
}: {
  player: Player;
  selected: boolean;
  hinted: boolean;
  pinned: boolean;
  canPin: boolean;
  adjustment?: Adjustment;
  onTap: () => void;
  onPin: () => void;
}) {
  const id = `player:${player.id}`;
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  const target = drop.isOver && !drag.isDragging;

  return (
    <li
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      className={`chalk-rule flex cursor-grab touch-manipulation select-none items-center gap-1 rounded-lg transition-[background-color,box-shadow,opacity] duration-150 ${
        drag.isDragging ? "opacity-35" : ""
      } ${
        selected || target
          ? "bg-glow/12 shadow-[inset_0_0_0_1px_var(--color-glow)]"
          : hinted
            ? "bg-warn/10 shadow-[inset_0_0_0_1px_var(--color-warn)]"
            : "hover:bg-chalk/5"
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onTap}
        className="flex min-w-0 flex-1 cursor-[inherit] items-center gap-3 rounded-lg px-2 py-2.5 text-left"
      >
        <span className="w-9 font-display text-xl font-bold tabular-nums">{Math.round(ovr(player))}</span>
        <span className="min-w-0 flex-1 truncate">
          {player.name}
          <RatingTag adjustment={adjustment} host />
        </span>
        <span className="text-sm text-chalk-dim">
          {player.primaryPos}
          {player.canGk && player.primaryPos !== "GK" ? " / GK" : ""}
        </span>
      </button>
      {canPin ? (
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${player.name}` : `Pin ${player.name} to this team`}
          title={pinned ? "Pinned: stays here when you shuffle" : "Pin to this team"}
          onClick={onPin}
          className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${
            pinned ? "text-glow drop-shadow-[0_0_8px_var(--color-glow)]" : "text-chalk-dim/60 hover:text-chalk"
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
            <path d="M9 3h6l-1 6 3.5 3.5v1.5h-11v-1.5L10 9 9 3zM12 14v7" />
          </svg>
        </button>
      ) : (
        <span className="size-10 shrink-0" aria-hidden />
      )}
    </li>
  );
}

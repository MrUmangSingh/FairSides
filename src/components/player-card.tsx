"use client";

import { useRef } from "react";
import { ovrFor } from "@/lib/domain/ratings";
import { POSITION_LABELS, STAT_KEYS, STAT_LABELS, type Player } from "@/lib/domain/types";

export type CardPlayer = Pick<
  Player,
  "name" | "stats" | "gk" | "primaryPos" | "secondaryPos" | "foot" | "canGk" | "playstyle"
>;

const C = 110;
const R = 62;

function point(i: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (i * Math.PI * 2) / STAT_KEYS.length;
  return [C + Math.cos(angle) * radius, C + Math.sin(angle) * radius];
}
const ring = (scale: number) =>
  STAT_KEYS.map((_, i) => point(i, R * scale).map((n) => n.toFixed(1)).join(",")).join(" ");

/** Gold for the best, green for good, blue for the rest. */
export const tierColor = (overall: number) => (overall >= 80 ? "#ffd980" : overall >= 65 ? "#46f0a0" : "#8fd0ff");

/** The card a player gets for their profile. It leans toward the pointer. */
export function PlayerCard({ player, className = "" }: { player: CardPlayer; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const overall = Math.round(ovrFor(player.stats, player.gk, player.primaryPos));
  const tier = tierColor(overall);
  const shape = STAT_KEYS.map((key, i) =>
    point(i, R * Math.max(0.08, player.stats[key] / 99))
      .map((n) => n.toFixed(1))
      .join(","),
  ).join(" ");

  function lean(e: React.PointerEvent) {
    const node = el.current;
    if (!node || e.pointerType !== "mouse") return;
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    node.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    node.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    node.style.setProperty("--gx", `${x * 100}%`);
    node.style.setProperty("--gy", `${y * 100}%`);
  }
  function settle() {
    const node = el.current;
    if (!node) return;
    node.style.setProperty("--ry", "0deg");
    node.style.setProperty("--rx", "0deg");
  }

  const role = [
    POSITION_LABELS[player.primaryPos],
    player.secondaryPos ? `or ${POSITION_LABELS[player.secondaryPos].toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`card-tilt ${className}`}>
      <div
        ref={el}
        className="player-card"
        style={{ ["--tier" as string]: tier }}
        onPointerMove={lean}
        onPointerLeave={settle}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-[3.5rem] font-extrabold leading-[0.85] tabular-nums text-[var(--tier)]">
              {overall}
            </div>
            <div className="mt-2 text-sm font-semibold">{player.primaryPos}</div>
          </div>
          <span aria-hidden className="mt-1 flex">
            <span className="size-3 rounded-full bg-bib-a" />
            <span className="-ml-1 size-3 rounded-full bg-bib-b" />
          </span>
        </div>

        <svg viewBox="0 0 220 220" className="mx-auto -my-1 w-full max-w-[15rem]" role="img" aria-label={`Stats: ${STAT_KEYS.map((k) => `${STAT_LABELS[k]} ${player.stats[k]}`).join(", ")}`}>
          {[1 / 3, 2 / 3, 1].map((s) => (
            <polygon key={s} points={ring(s)} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          ))}
          {STAT_KEYS.map((key, i) => {
            const [x, y] = point(i, R);
            return <line key={key} x1={C} y1={C} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
          })}
          <polygon
            points={shape}
            fill="color-mix(in srgb, var(--tier) 28%, transparent)"
            stroke="var(--tier)"
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 6px var(--tier))" }}
          />
          {STAT_KEYS.map((key, i) => {
            const [x, y] = point(i, R + 24);
            return (
              <text key={key} x={x} y={y} textAnchor="middle" fill="currentColor">
                <tspan x={x} dy="-0.15em" fontSize="15" fontWeight="700">
                  {player.stats[key]}
                </tspan>
                <tspan x={x} dy="1.15em" fontSize="9.5" opacity="0.65">
                  {STAT_LABELS[key]}
                </tspan>
              </text>
            );
          })}
        </svg>

        <div>
          <div className="truncate font-display text-[1.6rem] font-extrabold leading-none">
            {player.name.trim() || "Your name"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.8rem] text-chalk-dim">
            <span>{role}</span>
            <span className="capitalize">{player.foot === "both" ? "Both feet" : `${player.foot} foot`}</span>
            <span className="capitalize">{player.playstyle}</span>
            {player.canGk && player.primaryPos !== "GK" ? <span>Keeps goal {player.gk}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

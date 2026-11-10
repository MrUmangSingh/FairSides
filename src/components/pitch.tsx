import { formation } from "@/lib/domain/formation";
import { ovr } from "@/lib/domain/ratings";
import type { Player } from "@/lib/domain/types";

interface Placed {
  player: Player;
  left: number;
  top: number;
  team: "a" | "b" | "joker";
  keeper: boolean;
}

const DISC = { a: "bg-bib-a", b: "bg-bib-b", joker: "bg-[#7fd8ff]" } as const;

/**
 * Top-down pitch. Yellow bibs defend the top goal, pink bibs the bottom.
 * Tokens keep a stable DOM order so they glide to their new spot on shuffle.
 */
export function Pitch({ a, b, joker, label }: { a: Player[]; b: Player[]; joker?: Player | null; label: string }) {
  const placed: Placed[] = [
    ...formation(a).map((s) => ({
      player: s.player,
      left: s.x,
      top: 6 + s.y * 0.43,
      team: "a" as const,
      keeper: s.keeper,
    })),
    ...formation(b).map((s) => ({
      player: s.player,
      left: 100 - s.x,
      top: 94 - s.y * 0.43,
      team: "b" as const,
      keeper: s.keeper,
    })),
    // The joker plays for both sides, so they stand on the centre spot.
    ...(joker ? [{ player: joker, left: 50, top: 50, team: "joker" as const, keeper: false }] : []),
  ].sort((p, q) => (p.player.id < q.player.id ? -1 : 1));

  const perSide = Math.max(a.length, b.length);
  // Disc size follows the pitch width (cqw) and shrinks as the sides get bigger.
  const [k, max] = perSide <= 6 ? [10.5, "2.75rem"] : perSide <= 9 ? [9, "2.375rem"] : [7.5, "2rem"];
  const disc = `clamp(1.4rem, ${k}cqw, ${max})`;

  return (
    <div className="pitch" role="img" aria-label={label} style={{ ["--disc" as string]: disc }}>
      <div className="pitch-mark inset-x-0 top-1/2 border-0 border-t-2" />
      <div className="pitch-mark left-1/2 top-1/2 aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="pitch-mark left-1/2 top-0 h-[13%] w-[52%] -translate-x-1/2 border-t-0" />
      <div className="pitch-mark bottom-0 left-1/2 h-[13%] w-[52%] -translate-x-1/2 border-b-0" />
      <div className="pitch-mark left-1/2 top-0 h-[5%] w-[24%] -translate-x-1/2 border-t-0" />
      <div className="pitch-mark bottom-0 left-1/2 h-[5%] w-[24%] -translate-x-1/2 border-b-0" />

      {placed.map(({ player, left, top, team, keeper }) => (
        <div key={player.id} className="pitch-token" style={{ left: `${left}%`, top: `${top}%` }}>
          <span
            className={`pitch-disc ${DISC[team]} ${
              keeper ? "outline-2 outline-offset-2 outline-chalk" : ""
            }`}
          >
            {Math.round(ovr(player))}
          </span>
          <span className="max-w-full truncate rounded-sm bg-turf-deep/70 px-1 text-[0.72rem] font-medium leading-tight">
            {player.name}
          </span>
        </div>
      ))}
    </div>
  );
}

import { compareTeams } from "@/lib/domain/balance";
import type { Player } from "@/lib/domain/types";

export const TEAM_NAMES = { a: "Yellow bibs", b: "Pink bibs" } as const;

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  const total = a + b || 1;
  return (
    <div className="grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-3 text-sm">
      <span className="text-right font-display text-lg font-semibold tabular-nums">{Math.round(a)}</span>
      <div>
        <div className="mb-1 text-center text-xs text-chalk-dim">{label}</div>
        <div className="relative flex h-2 overflow-hidden rounded-full">
          <div className="bg-bib-a transition-[width] duration-500" style={{ width: `${(a / total) * 100}%` }} />
          <div className="flex-1 bg-bib-b" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-turf-deep" />
        </div>
      </div>
      <span className="font-display text-lg font-semibold tabular-nums">{Math.round(b)}</span>
    </div>
  );
}

/**
 * Both teams side by side. `fix` names what the viewer can do about an
 * unfair split ("try another shuffle"), and is left out for people who can't.
 */
export function BalanceMeter({ a, b, fix }: { a: Player[]; b: Player[]; fix?: string }) {
  const { a: sa, b: sb, gap, extra } = compareTeams(a, b);
  const verdict =
    gap.leader === null ? "Dead level" : `${TEAM_NAMES[gap.leader]} are ${gap.pct.toFixed(1)}% stronger`;
  const uneven = gap.pct >= 5;

  return (
    <div>
      <p className={`mb-3 font-display text-xl font-semibold ${uneven ? "text-warn" : ""}`} aria-live="polite">
        {verdict}
        {uneven && fix ? ` — ${fix}` : ""}
      </p>
      <div className="space-y-2.5">
        <Row label="Overall strength" a={sa.strength} b={sb.strength} />
        <Row label="Attack" a={sa.attack} b={sb.attack} />
        <Row label="Defence" a={sa.defense} b={sb.defense} />
        <Row label="Stamina" a={sa.stamina} b={sb.stamina} />
      </div>
      {extra ? (
        <p className="field-hint mt-4">
          {sa.size} v {sb.size}. {TEAM_NAMES[extra.side]} have{" "}
          {extra.players === 1 ? "an extra player" : `${extra.players} extra players`}, counted here as{" "}
          {Math.round(extra.factor * 100)}% of an average player, so level bars mean a fair game.
        </p>
      ) : null}
    </div>
  );
}

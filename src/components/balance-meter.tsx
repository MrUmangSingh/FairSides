import { strengthGap, summarize } from "@/lib/domain/balance";
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

export function BalanceMeter({ a, b }: { a: Player[]; b: Player[] }) {
  const sa = summarize(a);
  const sb = summarize(b);
  const gap = strengthGap(sa, sb);
  const verdict =
    gap.leader === null
      ? "Dead level"
      : `${TEAM_NAMES[gap.leader]} are ${gap.pct.toFixed(1)}% stronger`;
  const uneven = gap.pct >= 5;

  return (
    <div>
      <p className={`mb-3 font-display text-xl font-semibold ${uneven ? "text-warn" : ""}`} aria-live="polite">
        {verdict}
        {uneven ? " — try another shuffle" : ""}
      </p>
      <div className="space-y-2.5">
        <Row label="Overall strength" a={sa.strength} b={sb.strength} />
        <Row label="Attack" a={sa.attack} b={sb.attack} />
        <Row label="Defence" a={sa.defense} b={sb.defense} />
        <Row label="Stamina" a={sa.stamina} b={sb.stamina} />
      </div>
    </div>
  );
}

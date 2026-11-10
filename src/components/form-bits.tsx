"use client";

import { MAX_SIDE, MIN_SIDE } from "@/lib/domain/squad";

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-2 text-sm text-warn" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

/** The − 6v6 + control for players per side. */
export function SideStepper({
  value,
  onChange,
  disabled = false,
  labelId,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  labelId: string;
}) {
  return (
    <div className="flex items-center gap-5">
      <button
        type="button"
        className="btn btn-line size-11 px-0 text-xl"
        onClick={() => onChange(Math.max(MIN_SIDE, value - 1))}
        disabled={disabled || value <= MIN_SIDE}
        aria-label="One fewer player per side"
      >
        −
      </button>
      <output
        className={`min-w-28 text-center font-display text-4xl font-bold tabular-nums ${disabled ? "text-chalk-dim" : ""}`}
        aria-labelledby={labelId}
        aria-live="polite"
      >
        {value}v{value}
      </output>
      <button
        type="button"
        className="btn btn-line size-11 px-0 text-xl"
        onClick={() => onChange(Math.min(MAX_SIDE, value + 1))}
        disabled={disabled || value >= MAX_SIDE}
        aria-label="One more player per side"
      >
        +
      </button>
    </div>
  );
}

/** "12 on the pitch and 2 subs. Anyone after that joins the waitlist." */
export function placesHint(perSide: number, max: number): string | undefined {
  const subs = max - perSide * 2;
  if (subs > 0) {
    return `${perSide * 2} on the pitch and ${subs} ${subs === 1 ? "sub" : "subs"}. Anyone after that joins the waitlist.`;
  }
  return subs === 0 ? "No subs. Anyone after that joins the waitlist." : undefined;
}

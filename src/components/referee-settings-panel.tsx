"use client";

import { setRefereeSettings, useRefereeSettings, whistle, type RefereeSettings } from "@/lib/referee-settings";

export function WhistleIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`size-5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 9.5h9.5l1.6-2.5H21v4.5l-4 1A6.5 6.5 0 1 1 5 12.5" />
      <circle cx="11.5" cy="14.5" r="2" fill="currentColor" stroke="none" />
      <path d="M2.5 9.5v3" />
    </svg>
  );
}

export function GearIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`size-5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function Switch({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`chalk-rule flex items-center gap-4 py-3 ${disabled ? "opacity-45" : ""}`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {hint ? <p className="text-sm text-chalk-dim">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
          checked
            ? "border-glow bg-glow/80 shadow-[0_0_14px_rgb(70_240_160/0.55)]"
            : "border-white/20 bg-white/10"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 size-[22px] rounded-full bg-chalk shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

/** The referee's sound and timing preferences, saved on this phone. */
export function RefereeSettingsPanel({ minutes, onClose }: { minutes: number; onClose: () => void }) {
  const s = useRefereeSettings();
  const set = (patch: Partial<RefereeSettings>) => setRefereeSettings(patch);
  const anyCue = s.sound || s.vibrate;
  const half = Math.round(minutes / 2);

  return (
    <section aria-labelledby="ref-settings-heading" className="panel mt-6 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <h2 id="ref-settings-heading" className="flex-1 text-xl">
          Referee settings
        </h2>
        <button type="button" className="btn btn-line btn-sm" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="mt-1 text-sm text-chalk-dim">Saved on this phone only.</p>

      <div className="mt-4">
        <Switch id="ref-sound" label="Whistle sound" checked={s.sound} onChange={(sound) => set({ sound })} />
        <div className={`chalk-rule py-3 ${s.sound ? "" : "opacity-45"}`}>
          <div className="flex items-center justify-between">
            <label htmlFor="ref-volume" className="font-semibold">
              Volume
            </label>
            <span className="text-sm tabular-nums text-chalk-dim">{Math.round(s.volume * 100)}%</span>
          </div>
          <input
            id="ref-volume"
            type="range"
            className="stat mt-1"
            min={0.1}
            max={1}
            step={0.05}
            value={s.volume}
            disabled={!s.sound}
            style={{ "--fill": `${((s.volume - 0.1) / 0.9) * 100}%` } as React.CSSProperties}
            onChange={(e) => set({ volume: Number(e.target.value) })}
            onPointerUp={() => whistle("short")}
            onKeyUp={() => whistle("short")}
          />
        </div>
        <Switch
          id="ref-vibrate"
          label="Vibrate"
          hint="Buzzes in the same rhythm, on phones that support it."
          checked={s.vibrate}
          onChange={(vibrate) => set({ vibrate })}
        />
      </div>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-chalk-dim">When to whistle</h3>
      <div className="mt-1">
        <Switch
          id="ref-on-clock"
          label="Kick-off and stoppages"
          hint="One blast when the clock starts, two when you pause it."
          checked={s.onClock}
          disabled={!anyCue}
          onChange={(onClock) => set({ onClock })}
        />
        <Switch
          id="ref-half"
          label="Half time"
          hint={`At ${half}:00.`}
          checked={s.halfTime}
          disabled={!anyCue}
          onChange={(halfTime) => set({ halfTime })}
        />
        <Switch
          id="ref-full"
          label="Full time"
          hint={`At ${minutes}:00.`}
          checked={s.fullTime}
          disabled={!anyCue}
          onChange={(fullTime) => set({ fullTime })}
        />
        <Switch
          id="ref-events"
          label="Goals and cards"
          hint="A long blast when you record one."
          checked={s.onEvents}
          disabled={!anyCue}
          onChange={(onEvents) => set({ onEvents })}
        />
      </div>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-chalk-dim">Clock</h3>
      <div className="mt-1">
        <Switch
          id="ref-pause-half"
          label="Pause at half time"
          hint="Stops the clock at the break. Tap Resume for the second half."
          checked={s.pauseAtHalf}
          onChange={(pauseAtHalf) => set({ pauseAtHalf })}
        />
      </div>

      <div className="chalk-rule mt-2 flex flex-wrap gap-3 pt-4">
        <button type="button" className="btn btn-line btn-sm gap-2" onClick={() => whistle("short", { ...s, sound: true })}>
          <WhistleIcon /> Test whistle
        </button>
        <button type="button" className="btn btn-line btn-sm gap-2" onClick={() => whistle("final", { ...s, sound: true })}>
          <WhistleIcon /> Test full time
        </button>
      </div>
    </section>
  );
}

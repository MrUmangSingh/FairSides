"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NeedsProfile } from "@/components/needs-profile";
import { actions, useHydrated, useStore } from "@/lib/store";

const MIN_SIDE = 3;
const MAX_SIDE = 15;

export function NewMatchScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { userId } = useStore();

  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [datetime, setDatetime] = useState("");
  const [perSide, setPerSide] = useState(6);
  // Subs default to two; the host can change the total freely.
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
  const [fee, setFee] = useState(0);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!hydrated) return <div className="mx-auto max-w-2xl px-5 py-10" aria-busy="true" />;
  if (!userId) return <NeedsProfile action="host a match" />;

  const max = maxPlayers ?? perSide * 2 + 2;
  const subs = max - perSide * 2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the match a name your group will recognise.";
    if (!venue.trim()) next.venue = "Enter where you're playing.";
    if (!datetime) next.datetime = "Pick a date and kick-off time.";
    if (max < perSide * 2) next.max = `A ${perSide}-a-side match needs at least ${perSide * 2} places.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const id = actions.createMatch({
      title: title.trim(),
      venue: venue.trim(),
      datetime,
      perSide,
      maxPlayers: max,
      minPlayers: perSide * 2,
      fee,
      visibility,
    });
    router.push(`/matches/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-3xl sm:text-4xl">Create a match</h1>
      <p className="mt-4 text-chalk-dim">You join as the first player and run the teams as host.</p>

      <form onSubmit={submit} className="mt-10 space-y-8" noValidate>
        <Field id="title" label="Match name" error={errors.title}>
          <input
            id="title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Thursday night football"
          />
        </Field>

        <div className="grid gap-8 sm:grid-cols-2">
          <Field id="venue" label="Venue" error={errors.venue}>
            <input
              id="venue"
              className="input"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Turf or ground name"
            />
          </Field>
          <Field id="datetime" label="Date and kick-off" error={errors.datetime}>
            <input
              id="datetime"
              type="datetime-local"
              className="input"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
            />
          </Field>
        </div>

        <div className="chalk-rule pt-8">
          <span className="field-label" id="side-label">
            Players per side
          </span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              className="btn btn-line size-11 px-0 text-xl"
              onClick={() => setPerSide((n) => Math.max(MIN_SIDE, n - 1))}
              disabled={perSide <= MIN_SIDE}
              aria-label="One fewer player per side"
            >
              −
            </button>
            <output
              className="min-w-28 text-center font-display text-4xl font-bold tabular-nums"
              aria-labelledby="side-label"
              aria-live="polite"
            >
              {perSide}v{perSide}
            </output>
            <button
              type="button"
              className="btn btn-line size-11 px-0 text-xl"
              onClick={() => setPerSide((n) => Math.min(MAX_SIDE, n + 1))}
              disabled={perSide >= MAX_SIDE}
              aria-label="One more player per side"
            >
              +
            </button>
          </div>
          <p className="field-hint">Any size from 3-a-side to 15-a-side.</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <Field
            id="max"
            label="Total places"
            error={errors.max}
            hint={
              subs > 0
                ? `${perSide * 2} on the pitch and ${subs} ${subs === 1 ? "sub" : "subs"}. Anyone after that joins the waitlist.`
                : subs === 0
                  ? "No subs. Anyone after that joins the waitlist."
                  : undefined
            }
          >
            <input
              id="max"
              type="number"
              inputMode="numeric"
              className="input"
              min={perSide * 2}
              max={40}
              value={max}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
          </Field>
          <Field id="fee" label="Fee per player (₹)" hint="Leave at 0 if the game is free.">
            <input
              id="fee"
              type="number"
              inputMode="numeric"
              className="input"
              min={0}
              step={10}
              value={fee}
              onChange={(e) => setFee(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>

        <div>
          <span className="field-label" id="vis-label">
            Who can join
          </span>
          <div className="choice" role="radiogroup" aria-labelledby="vis-label">
            <label>
              <input type="radio" name="vis" checked={visibility === "public"} onChange={() => setVisibility("public")} />
              Anyone
            </label>
            <label>
              <input type="radio" name="vis" checked={visibility === "private"} onChange={() => setVisibility("private")} />
              Only people with the link
            </label>
          </div>
        </div>

        <button type="submit" className="btn">
          Create match
        </button>
      </form>
    </div>
  );
}

function Field({
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

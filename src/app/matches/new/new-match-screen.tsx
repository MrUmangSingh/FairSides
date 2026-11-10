"use client";

import { PageLoader } from "@/components/page-loader";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, SideStepper, placesHint } from "@/components/form-bits";
import { NeedsProfile } from "@/components/needs-profile";
import { MAX_PLACES } from "@/lib/domain/squad";
import { ODD_MODES, type OddMode } from "@/lib/domain/types";
import { actions, useHydrated, useStore } from "@/lib/store";

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
  const [oddMode, setOddMode] = useState<OddMode>("sub");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!hydrated) return <PageLoader label="Getting ready" />;
  if (!userId) return <NeedsProfile action="host a match" />;

  const max = maxPlayers ?? perSide * 2 + 2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the match a name your group will recognise.";
    if (!venue.trim()) next.venue = "Enter where you're playing.";
    if (!datetime) next.datetime = "Pick a date and kick-off time.";
    if (max < perSide * 2) next.max = `A ${perSide}-a-side match needs at least ${perSide * 2} places.`;
    if (max > MAX_PLACES) next.max = `A match can have up to ${MAX_PLACES} places.`;
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
      oddMode,
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
          <SideStepper value={perSide} onChange={setPerSide} labelId="side-label" />
          <p className="field-hint">Any size from 3-a-side to 15-a-side. You can change it later.</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <Field
            id="max"
            label="Total places"
            error={errors.max}
            hint={placesHint(perSide, max)}
          >
            <input
              id="max"
              type="number"
              inputMode="numeric"
              className="input"
              min={perSide * 2}
              max={MAX_PLACES}
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

        <div>
          <span className="field-label" id="odd-label">
            If the numbers are odd
          </span>
          <div className="choice" role="radiogroup" aria-labelledby="odd-label">
            {(Object.keys(ODD_MODES) as OddMode[]).map((mode) => (
              <label key={mode}>
                <input type="radio" name="odd" checked={oddMode === mode} onChange={() => setOddMode(mode)} />
                {ODD_MODES[mode].label}
              </label>
            ))}
          </div>
          <p className="field-hint">{ODD_MODES[oddMode].hint} You can change this later.</p>
        </div>

        <button type="submit" className="btn">
          Create match
        </button>
      </form>
    </div>
  );
}

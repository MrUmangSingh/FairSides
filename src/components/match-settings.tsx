"use client";

import { useState } from "react";
import { Field, SideStepper, placesHint } from "@/components/form-bits";
import { MAX_PLACES, squadMoves } from "@/lib/domain/squad";
import type { Match, Player } from "@/lib/domain/types";
import { formatList as list } from "@/lib/format";
import { actions } from "@/lib/store";

/**
 * The host's form for changing a match after creating it. Mounted only while
 * open, so it starts from the match as it is now.
 */
export function MatchSettings({
  match,
  players,
  onDone,
}: {
  match: Match;
  players: Record<string, Player>;
  onDone: () => void;
}) {
  const sizeOpen = match.status === "open";
  const [title, setTitle] = useState(match.title);
  const [venue, setVenue] = useState(match.venue);
  const [datetime, setDatetime] = useState(match.datetime);
  const [perSide, setPerSide] = useState(match.perSide);
  const [max, setMax] = useState(match.maxPlayers);
  const [fee, setFee] = useState(match.fee);
  const [visibility, setVisibility] = useState(match.visibility);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Changing the side size keeps the same number of subs.
  const changeSide = (next: number) => {
    setMax((m) => Math.min(MAX_PLACES, Math.max(next * 2, m + (next - perSide) * 2)));
    setPerSide(next);
  };

  const validMax = max >= perSide * 2 && max <= MAX_PLACES;
  const moves = validMax ? squadMoves(match.participants, max, match.hostId) : { toWaitlist: [], promoted: [] };
  const name = (id: string) => players[id]?.name ?? "A player";
  const effects: string[] = [];
  if (moves.toWaitlist.length) {
    const n = moves.toWaitlist.length;
    effects.push(`${list(moves.toWaitlist.map(name))} ${n === 1 ? "was" : "were"} the last to join, so ${n === 1 ? "goes" : "go"} to the front of the waitlist.`);
  }
  if (moves.promoted.length) {
    effects.push(`${list(moves.promoted.map(name))} ${moves.promoted.length === 1 ? "gets a place" : "get places"} from the waitlist.`);
  }
  if (match.teams && (perSide !== match.perSide || moves.toWaitlist.length || moves.promoted.length)) {
    effects.push("Your draft teams will be cleared; generate them again after saving.");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the match a name your group will recognise.";
    if (!venue.trim()) next.venue = "Enter where you're playing.";
    if (!datetime) next.datetime = "Pick a date and kick-off time.";
    if (max < perSide * 2) next.max = `A ${perSide}-a-side match needs at least ${perSide * 2} places.`;
    if (max > MAX_PLACES) next.max = `A match can have up to ${MAX_PLACES} places.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    actions.editMatch(match.id, { title, venue, datetime, perSide, maxPlayers: max, fee, visibility });
    onDone();
  }

  return (
    <form onSubmit={save} className="chalk-rule mt-5 space-y-7 pt-5" noValidate aria-labelledby="settings-heading">
      <h3 id="settings-heading" className="text-xl">
        Match settings
      </h3>

      <div className="grid gap-7 sm:grid-cols-[auto_1fr] sm:items-start">
        <div>
          <span className="field-label" id="edit-side-label">
            Players per side
          </span>
          <SideStepper value={perSide} onChange={changeSide} disabled={!sizeOpen} labelId="edit-side-label" />
        </div>
        <Field
          id="edit-max"
          label="Total places"
          error={errors.max}
          hint={sizeOpen ? placesHint(perSide, max) : undefined}
        >
          <input
            id="edit-max"
            type="number"
            inputMode="numeric"
            className="input"
            min={perSide * 2}
            max={MAX_PLACES}
            value={max}
            disabled={!sizeOpen}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </Field>
      </div>
      {sizeOpen ? (
        effects.length > 0 ? (
          <ul className="-mt-3 space-y-1 text-sm text-warn" aria-live="polite">
            {effects.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null
      ) : (
        <p className="field-hint -mt-3">The teams are locked. Unlock them to change the size.</p>
      )}

      <Field id="edit-title" label="Match name" error={errors.title}>
        <input id="edit-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </Field>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field id="edit-venue" label="Venue" error={errors.venue}>
          <input id="edit-venue" className="input" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={80} />
        </Field>
        <Field id="edit-datetime" label="Date and kick-off" error={errors.datetime}>
          <input
            id="edit-datetime"
            type="datetime-local"
            className="input"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field id="edit-fee" label="Fee per player (₹)">
          <input
            id="edit-fee"
            type="number"
            inputMode="numeric"
            className="input"
            min={0}
            step={10}
            value={fee}
            onChange={(e) => setFee(Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <div>
          <span className="field-label" id="edit-vis-label">
            Who can join
          </span>
          <div className="choice" role="radiogroup" aria-labelledby="edit-vis-label">
            <label>
              <input type="radio" name="edit-vis" checked={visibility === "public"} onChange={() => setVisibility("public")} />
              Anyone
            </label>
            <label>
              <input type="radio" name="edit-vis" checked={visibility === "private"} onChange={() => setVisibility("private")} />
              Only people with the link
            </label>
          </div>
        </div>
      </div>

      <p className="text-sm text-chalk-dim">Players see what you changed in the list of host changes.</p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn">
          Save changes
        </button>
        <button type="button" className="btn btn-line" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { PageLoader } from "@/components/page-loader";
import Link from "next/link";
import { useState } from "react";
import type { Match } from "@/lib/domain/types";
import { formatFee, formatWhen } from "@/lib/format";
import { joinedOf, useHydrated, useStore, waitlistOf } from "@/lib/store";

type Filter = "all" | "mine" | "small" | "large";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "My matches" },
  { id: "small", label: "Up to 6-a-side" },
  { id: "large", label: "7-a-side and up" },
];

export function MatchesScreen() {
  const hydrated = useHydrated();
  const { userId, matches } = useStore();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = matches
    .filter((m) => m.status !== "cancelled")
    // Private matches only show to people already in them; others need the link.
    .filter((m) => m.visibility === "public" || m.participants.some((p) => p.userId === userId))
    .filter((m) => {
      if (filter === "mine") return m.participants.some((p) => p.userId === userId);
      if (filter === "small") return m.perSide <= 6;
      if (filter === "large") return m.perSide >= 7;
      return true;
    })
    .toSorted((x, y) => x.datetime.localeCompare(y.datetime));

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl sm:text-4xl">Matches</h1>
        <Link href="/matches/new" className="btn">
          Create a match
        </Link>
      </div>

      <div className="choice mt-8" role="radiogroup" aria-label="Filter matches">
        {FILTERS.map((f) => (
          <label key={f.id}>
            <input type="radio" name="filter" checked={filter === f.id} onChange={() => setFilter(f.id)} />
            {f.label}
          </label>
        ))}
      </div>

      {!hydrated ? (
        <div className="mt-8">
          <PageLoader label="Loading matches" compact />
        </div>
      ) : visible.length === 0 ? (
        <div className="chalk-rule mt-8 pt-8">
          <p className="font-display text-2xl font-semibold">
            {matches.length === 0 ? "No matches yet" : "No matches fit this filter"}
          </p>
          <p className="mt-2 max-w-md text-chalk-dim">
            {matches.length === 0
              ? "Create the first one — pick a venue, a time and a team size, then share it with your group."
              : "Try a different filter, or create a match of your own."}
          </p>
        </div>
      ) : (
        <ul className="mt-8">
          {visible.map((m) => (
            <MatchRow key={m.id} match={m} userId={userId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchRow({ match: m, userId }: { match: Match; userId: string | null }) {
  const joined = joinedOf(m).length;
  const waiting = waitlistOf(m).length;
  const mine = m.participants.find((p) => p.userId === userId);
  const state =
    m.status === "locked"
      ? "Teams locked"
      : joined >= m.maxPlayers
        ? waiting > 0
          ? `Full, ${waiting} waiting`
          : "Full"
        : `${m.maxPlayers - joined} ${m.maxPlayers - joined === 1 ? "place" : "places"} left`;

  return (
    <li className="chalk-rule">
      <Link
        href={`/matches/${m.id}`}
        className="grid gap-x-6 gap-y-1 py-5 hover:bg-chalk/5 sm:grid-cols-[5.5rem_1fr_auto] sm:items-center sm:px-3"
      >
        <span className="font-display text-3xl font-bold leading-none">
          {m.perSide}v{m.perSide}
        </span>
        <span>
          <span className="block text-lg font-semibold">{m.title}</span>
          <span className="block text-sm text-chalk-dim">
            {formatWhen(m.datetime)} at {m.venue}. {formatFee(m.fee)}.
          </span>
        </span>
        <span className="text-sm sm:text-right">
          <span className="block font-semibold tabular-nums">
            {joined} of {m.maxPlayers} joined
          </span>
          <span className="block text-chalk-dim">
            {mine ? (mine.status === "joined" ? "You're in" : "You're on the waitlist") : state}
          </span>
        </span>
      </Link>
    </li>
  );
}

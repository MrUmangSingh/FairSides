"use client";

import { PageLoader } from "@/components/page-loader";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { TEAM_NAMES } from "@/components/balance-meter";
import { GearIcon, RefereeSettingsPanel, WhistleIcon } from "@/components/referee-settings-panel";
import {
  BallIcon,
  CardIcon,
  EventIcon,
  clockStatus,
  describeEvent,
  minuteLabel,
  useNow,
} from "@/components/referee-bits";
import { clockMs, formatClock, hasStarted, isSecondYellow, sideOf, summarise, tallyOf, type Summary } from "@/lib/domain/referee";
import type { EventKind, Match, Player, Side } from "@/lib/domain/types";
import { useRefereeSettings, whistle } from "@/lib/referee-settings";
import { actions, useHydrated, useStore } from "@/lib/store";
import { unlockWhistle } from "@/lib/whistle";

export function RefereeScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { userId, players, matches } = useStore();
  const match = matches.find((m) => m.id === id);

  if (!hydrated) return <PageLoader label="Loading referee view" />;

  if (!match || match.refereeId !== userId || !userId) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-3xl">{match ? "This is the referee's screen" : "We can't find this match"}</h1>
        <p className="mt-4 text-chalk-dim">
          {match
            ? "Only the match referee can run the clock and show cards. Volunteer on the match page if nobody is refereeing yet."
            : "The link may be mistyped, or the match was removed."}
        </p>
        <Link href={match ? `/matches/${match.id}` : "/matches"} className="btn mt-6">
          {match ? "Go to the match" : "Browse matches"}
        </Link>
      </div>
    );
  }

  return <RefereeDesk match={match} players={players} />;
}

function RefereeDesk({ match, players }: { match: Match; players: Record<string, Player> }) {
  const summary = summarise(match.events);
  const name = (pid: string) => players[pid]?.name ?? "A player";
  const teams = match.status === "locked" ? match.teams : null;
  const [announce, setAnnounce] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const settings = useRefereeSettings();

  function record(kind: EventKind, side: Side | null, playerId: string | null) {
    actions.recordEvent(match.id, kind, side, playerId);
    if (settings.onEvents) whistle("long", settings);
    const who = playerId ? name(playerId) : null;
    setAnnounce(
      kind === "goal"
        ? `Goal for ${TEAM_NAMES[side ?? "a"]}${who ? `, ${who}` : ""}`
        : `${kind === "red" ? "Red" : "Yellow"} card for ${who}`,
    );
  }

  const roster = (ids: string[]) => ids.map((pid) => players[pid]).filter(Boolean) as Player[];

  return (
    // Browsers only allow sound after a tap; any tap here lets the half- and full-time whistles play later.
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8" onPointerDown={unlockWhistle}>
      <Link
        href={`/matches/${match.id}`}
        className="text-sm text-chalk-dim underline underline-offset-4 hover:text-chalk"
      >
        Back to the match
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="flex-1 text-3xl sm:text-4xl">Referee</h1>
        <button
          type="button"
          className="btn btn-line btn-sm gap-2"
          aria-expanded={showSettings}
          aria-controls="ref-settings"
          onClick={() => setShowSettings((v) => !v)}
        >
          <GearIcon className="size-4" /> Settings
        </button>
      </div>
      <p className="mt-1 text-chalk-dim">
        {match.title}, {match.venue}
      </p>

      {showSettings ? (
        <div id="ref-settings">
          <RefereeSettingsPanel minutes={match.minutes} onClose={() => setShowSettings(false)} />
        </div>
      ) : null}

      <MatchClock match={match} />

      {teams ? (
        <>
          <section aria-label="Score" className="mt-4 grid grid-cols-2 gap-3">
            {(["a", "b"] as const).map((side) => (
              <div
                key={side}
                className={`panel border-t-4 p-4 text-center ${side === "a" ? "border-t-bib-a" : "border-t-bib-b"}`}
              >
                <p className="text-sm font-semibold">{TEAM_NAMES[side]}</p>
                <p className="font-display text-6xl font-bold tabular-nums">{summary.score[side]}</p>
                <button
                  type="button"
                  className="btn btn-line btn-sm mt-2 w-full"
                  onClick={() => record("goal", side, null)}
                  aria-label={`Add a goal for ${TEAM_NAMES[side]} without naming the scorer`}
                >
                  Add goal
                </button>
              </div>
            ))}
          </section>
          <p className="field-hint">Tap a player to name the scorer or show a card.</p>
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>

          <div className="mt-8 grid gap-8">
            <Roster title={TEAM_NAMES.a} swatch="bg-bib-a" players={roster(teams.a)} match={match} summary={summary} onRecord={record} />
            <Roster title={TEAM_NAMES.b} swatch="bg-bib-b" players={roster(teams.b)} match={match} summary={summary} onRecord={record} />
            {teams.joker ? (
              <Roster title="Joker" swatch="bg-[#7fd8ff]" players={roster([teams.joker])} match={match} summary={summary} onRecord={record} />
            ) : null}
            {teams.subs.length > 0 ? (
              <Roster title="Subs" swatch="bg-[#93a4a8]" players={roster(teams.subs)} match={match} summary={summary} onRecord={record} />
            ) : null}
          </div>
        </>
      ) : (
        <div className="panel mt-4 p-5">
          <h2 className="text-xl">Waiting for the teams</h2>
          <p className="mt-2 text-chalk-dim">
            Goals and cards open once the host locks the teams. You can start the clock already.
          </p>
        </div>
      )}

      <Timeline match={match} name={name} />
    </div>
  );
}

function MatchClock({ match }: { match: Match }) {
  const { clock, minutes } = match;
  const now = useNow(clock.running);
  const ms = clockMs(clock, now);
  const progress = Math.min(1, ms / (minutes * 60_000));
  const over = ms > minutes * 60_000;
  const settings = useRefereeSettings();

  // Half- and full-time whistles fire as the running clock crosses the mark,
  // never on opening the page past it.
  const lastMs = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastMs.current;
    lastMs.current = ms;
    if (prev === null || !clock.running || ms <= prev) return;
    const crossed = (mark: number) => prev < mark && ms >= mark;
    if (crossed(minutes * 60_000)) {
      if (settings.fullTime) whistle("final", settings);
    } else if (crossed(minutes * 30_000)) {
      if (settings.halfTime) whistle("final", settings);
      if (settings.pauseAtHalf) actions.clock(match.id, "pause");
    }
  }, [ms, clock.running, minutes, match.id, settings]);

  const start = () => {
    actions.clock(match.id, "start");
    if (settings.onClock) whistle("short", settings);
  };
  const pause = () => {
    actions.clock(match.id, "pause");
    if (settings.onClock) whistle("double", settings);
  };

  // Keep the phone's screen on while the clock runs.
  useEffect(() => {
    if (!clock.running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (gone) l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});
    return () => {
      gone = true;
      lock?.release().catch(() => {});
    };
  }, [clock.running]);

  return (
    <section aria-label="Match clock" className="panel mt-6 p-5 text-center sm:p-6">
      <p
        className={`font-display text-7xl font-bold tabular-nums sm:text-8xl ${over ? "text-warn" : ""} ${
          clock.running ? "" : hasStarted(clock) ? "opacity-60" : ""
        }`}
      >
        {formatClock(ms)}
      </p>
      <p className="mt-1 text-sm text-chalk-dim">{clockStatus(clock, ms, minutes)}</p>
      <div className="mx-auto mt-4 h-1 max-w-sm overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div
          className={`h-full rounded-full ${over ? "bg-warn" : "bg-glow shadow-[0_0_10px_var(--color-glow)]"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-5 flex justify-center gap-3">
        {clock.running ? (
          <button type="button" className="btn min-w-36" onClick={pause}>
            Pause
          </button>
        ) : (
          <button type="button" className="btn min-w-36" onClick={start}>
            {hasStarted(clock) ? "Resume" : "Kick off"}
          </button>
        )}
        {hasStarted(clock) ? (
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              if (window.confirm("Reset the clock to 0:00? Goals and cards stay.")) actions.clock(match.id, "reset");
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      {/* Tapping the whistle is a deliberate blow, so it sounds even with automatic whistles muted. */}
      <button
        type="button"
        className="btn btn-line mt-3 w-full max-w-sm gap-2"
        onClick={() => whistle("long", { ...settings, sound: true })}
      >
        <WhistleIcon /> Blow whistle
      </button>
    </section>
  );
}

function Roster({
  title,
  swatch,
  players,
  match,
  summary,
  onRecord,
}: {
  title: string;
  swatch: string;
  players: Player[];
  match: Match;
  summary: Summary;
  onRecord: (kind: EventKind, side: Side | null, playerId: string | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const teams = match.teams!;

  return (
    <section>
      <h2 className="flex items-center gap-2.5 text-xl">
        <span aria-hidden className={`size-3.5 rounded-full ${swatch}`} />
        {title}
      </h2>
      <ul className="mt-2">
        {players.map((p) => {
          const tally = tallyOf(summary, p.id);
          const expanded = open === p.id;
          const side = sideOf(teams, p.id);
          const act = (kind: EventKind, goalSide: Side | null = side) => {
            onRecord(kind, kind === "goal" ? goalSide : null, p.id);
            setOpen(null);
          };
          return (
            <li key={p.id} className="chalk-rule">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : p.id)}
                className={`flex min-h-14 w-full items-center gap-3 py-2 text-left ${tally.sentOff ? "opacity-50" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {p.name}
                  <span className="ml-2 text-sm font-normal text-chalk-dim">{p.primaryPos}</span>
                </span>
                <Tallies goals={tally.goals} yellows={tally.yellows} red={tally.red} />
                {tally.sentOff ? <span className="text-sm text-card-red">Sent off</span> : null}
                <span aria-hidden className={`text-chalk-dim transition-transform ${expanded ? "rotate-90" : ""}`}>
                  ›
                </span>
              </button>
              {expanded ? (
                <div className="pb-4">
                  {tally.sentOff ? (
                    <p className="text-sm text-chalk-dim">
                      {p.name} has been sent off. To undo it, remove the card from the match events below.
                    </p>
                  ) : (
                    <div className={`grid gap-2 ${side ? "grid-cols-3" : "grid-cols-2"}`}>
                      {side ? (
                        <button type="button" className="btn btn-sm gap-2" onClick={() => act("goal")}>
                          <BallIcon /> Goal
                        </button>
                      ) : (
                        <div className="col-span-2 grid grid-cols-2 gap-2">
                          {(["a", "b"] as const).map((s) => (
                            <button key={s} type="button" className="btn btn-sm gap-2" onClick={() => act("goal", s)}>
                              <BallIcon /> Goal for {TEAM_NAMES[s]}
                            </button>
                          ))}
                        </div>
                      )}
                      <button type="button" className="btn btn-line btn-sm gap-2" onClick={() => act("yellow")}>
                        <CardIcon kind="yellow" /> {tally.yellows ? "Second yellow" : "Yellow"}
                      </button>
                      <button type="button" className="btn btn-line btn-sm gap-2" onClick={() => act("red")}>
                        <CardIcon kind="red" /> Red
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tallies({ goals, yellows, red }: { goals: number; yellows: number; red: boolean }) {
  const parts = [
    goals ? `${goals} ${goals === 1 ? "goal" : "goals"}` : "",
    yellows ? `${yellows} ${yellows === 1 ? "yellow" : "yellows"}` : "",
    red ? "red card" : "",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5" aria-label={parts.join(", ")}>
      {Array.from({ length: goals }, (_, i) => (
        <BallIcon key={`g${i}`} />
      ))}
      {Array.from({ length: yellows }, (_, i) => (
        <CardIcon key={`y${i}`} kind="yellow" />
      ))}
      {red ? <CardIcon kind="red" /> : null}
    </span>
  );
}

function Timeline({ match, name }: { match: Match; name: (id: string) => string }) {
  const newestFirst = match.events.toReversed();
  return (
    <section className="mt-10" aria-labelledby="events-heading">
      <h2 id="events-heading" className="text-xl">
        Match events
      </h2>
      {newestFirst.length === 0 ? (
        <p className="mt-2 text-chalk-dim">Goals and cards appear here as you record them. Everyone in the match sees them live.</p>
      ) : (
        <ol className="mt-2">
          {newestFirst.map((e) => (
            <li key={e.id} className="chalk-rule flex items-center gap-3 py-2.5 text-sm">
              <span className="w-10 shrink-0 font-display text-base font-bold tabular-nums">{minuteLabel(e.minute)}</span>
              <EventIcon kind={e.kind} secondYellow={isSecondYellow(match.events, e)} />
              <span className="min-w-0 flex-1">{describeEvent(e, match.events, name)}</span>
              <button
                type="button"
                className="text-chalk-dim underline underline-offset-4 hover:text-chalk"
                onClick={() => actions.removeEvent(match.id, e.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { balanceTeams } from "@/lib/domain/balance";
import { SAMPLE_PLAYERS } from "@/lib/domain/samples";
import { BalanceMeter } from "./balance-meter";
import { Pitch3D, type View } from "./pitch-3d";

const SQUAD = SAMPLE_PLAYERS.slice(0, 12);
const BY_ID = new Map(SQUAD.map((p) => [p.id, p]));

// A fixed generator keeps the first render identical on server and client.
function fixedRng() {
  let seed = 11;
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const INITIAL = balanceTeams(SQUAD, { perSide: 6, rng: fixedRng() });

/** When each block of copy is on screen, as a share of the scroll through the story. */
const RANGES: [number, number][] = [
  [-1, 0.13],
  [0.2, 0.42],
  [0.49, 0.7],
  [0.77, 2],
];

/** Camera path: a low sweep past the players, rising to a tactical view for the split. */
const WIDE: (View & { p: number })[] = [
  { p: 0, az: 0.62, pol: 1.2, zoom: 0.88 },
  { p: 0.31, az: -0.55, pol: 1.3, zoom: 0.46 },
  { p: 0.6, az: 0.3, pol: 0.98, zoom: 0.78 },
  { p: 0.9, az: 0, pol: 0.52, zoom: 1.5 },
];
const TALL: (View & { p: number })[] = [
  { p: 0, az: 0.75, pol: 1.2, zoom: 0.5 },
  { p: 0.31, az: -0.4, pol: 1.3, zoom: 0.34 },
  { p: 0.6, az: 0.9, pol: 1.0, zoom: 0.6 },
  { p: 0.9, az: Math.PI / 2, pol: 0.5, zoom: 1.7 },
];

function along(keys: (View & { p: number })[], p: number): View {
  if (p <= keys[0].p) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i].p) {
      const from = keys[i - 1];
      const to = keys[i];
      let t = (p - from.p) / (to.p - from.p);
      t = t * t * (3 - 2 * t);
      return {
        az: from.az + (to.az - from.az) * t,
        pol: from.pol + (to.pol - from.pol) * t,
        zoom: from.zoom + (to.zoom - from.zoom) * t,
      };
    }
  }
  return keys[keys.length - 1];
}


export function HeroStory() {
  const [teams, setTeams] = useState(INITIAL);
  const [count, setCount] = useState(0);
  const story = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [shift] = useState(() => (aspect: number): [number, number] => (aspect < 1 ? [0, 0.25] : [0.27 - progress.current * 0.07, 0]));
  const [view] = useState(() => (aspect: number) => along(aspect < 1 ? TALL : WIDE, progress.current));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = story.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
      progress.current = p;
      el.querySelectorAll<HTMLElement>("[data-beat]").forEach((beat, i) => {
        const [from, to] = RANGES[i];
        const shown = Math.min(1, Math.max(0, Math.min((p - from) / 0.07, (to - p) / 0.07)));
        beat.style.opacity = String(shown);
        beat.style.transform = `translateY(${(1 - shown) * 28}px)`;
        beat.inert = shown < 0.5;
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const a = teams.a.map((id) => BY_ID.get(id)!);
  const b = teams.b.map((id) => BY_ID.get(id)!);
  const beat = "absolute inset-x-0 bottom-0 will-change-transform";
  const hidden = { opacity: 0 };

  return (
    <section ref={story} className="relative -mt-[4.5rem] h-[420vh]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <Pitch3D
          a={a}
          b={b}
          label="Twelve sample players on a 3D pitch, split into two six-a-side teams"
          view={view}
          parallax
          shift={shift}
          className="absolute inset-0"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgb(5_9_11/0.97)_34%,transparent_66%)] lg:bg-[linear-gradient(90deg,rgb(5_9_11/0.96)_18%,transparent_62%)]"
        />

        <div className="pointer-events-none absolute inset-0 mx-auto max-w-7xl px-5">
          <div className="relative h-full [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
            <div data-beat className={`${beat} pb-[11svh] lg:pb-[16svh]`}>
              <h1 className="max-w-[12ch] text-[clamp(2.6rem,6.4vw,5.25rem)] leading-[0.95]">
                Pick teams nobody argues about.
              </h1>
              <p className="mt-6 max-w-[30rem] text-lg text-chalk-dim">
                Fairsides splits your pickup football squad into two balanced teams, by skill and
                by position. No captains, no last pick, no 9–2 scorelines.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/matches/new" className="btn">
                  Create a match
                </Link>
                <Link href="/matches" className="btn btn-line">
                  Browse matches
                </Link>
              </div>
              <p className="mt-10 hidden text-sm text-chalk-dim sm:block">Scroll to walk the pitch</p>
            </div>

            <div data-beat className={`${beat} pb-[14svh] lg:pb-[24svh]`} style={hidden}>
              <h2 className="max-w-[14ch] text-[clamp(2rem,4.6vw,3.75rem)]">Everyone rates their own game</h2>
              <p className="mt-5 max-w-[28rem] text-lg text-chalk-dim">
                Six sliders: pace, stamina, shooting, passing, dribbling and defending. Add your
                position and whether you can go in goal, and you get a player card.
              </p>
            </div>

            <div data-beat className={`${beat} pb-[14svh] lg:pb-[24svh]`} style={hidden}>
              <h2 className="max-w-[14ch] text-[clamp(2rem,4.6vw,3.75rem)]">The host sets up the match</h2>
              <p className="mt-5 max-w-[28rem] text-lg text-chalk-dim">
                Any size from 3-a-side to 15-a-side. Players join until it fills, then the rest
                queue on the waitlist.
              </p>
            </div>

            <div data-beat className={`${beat} pb-[7svh] lg:pb-[13svh]`} style={hidden}>
              <h2 className="max-w-[14ch] text-[clamp(2rem,4.6vw,3.75rem)]">One tap splits the squad</h2>
              <p className="mt-4 max-w-[28rem] text-chalk-dim lg:text-lg">
                Level on strength, attack, defence and stamina, with a keeper each. Try it on these
                twelve.
              </p>
              <div className="panel pointer-events-auto mt-6 max-w-[26rem] p-5">
                <BalanceMeter a={a} b={b} />
                <button
                  type="button"
                  className="btn mt-5 w-full"
                  onClick={() => {
                    setTeams((current) => balanceTeams(SQUAD, { perSide: 6, current }));
                    setCount((n) => n + 1);
                  }}
                >
                  Shuffle teams
                </button>
                <p className="field-hint" aria-live="polite">
                  {count === 0
                    ? "Every shuffle is a different split, and still fair."
                    : `${count} ${count === 1 ? "shuffle" : "shuffles"} so far. Still fair.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

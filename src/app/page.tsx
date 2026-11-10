import Link from "next/link";
import { HeroStory } from "@/components/hero-story";
import { PlayerCard } from "@/components/player-card";
import { SAMPLE_PLAYERS } from "@/lib/domain/samples";

const CARDS = [SAMPLE_PLAYERS[11], SAMPLE_PLAYERS[15], SAMPLE_PLAYERS[3]];
const FAN = ["lg:rotate-[-5deg] lg:translate-y-6", "lg:-translate-y-4", "lg:rotate-[5deg] lg:translate-y-6"];

export default function Home() {
  return (
    <>
      <HeroStory />

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:py-40">
        <div className="reveal">
          <h2 className="text-[clamp(2rem,4.6vw,3.75rem)]">Every player gets a card</h2>
          <p className="mt-6 max-w-[30rem] text-lg text-chalk-dim">
            Your overall rating is worked out for the position you play, so a keeper isn&apos;t
            marked down for shooting and a striker isn&apos;t marked down for tackling. The shape
            in the middle is your game at a glance.
          </p>
          <Link href="/profile" className="btn mt-8">
            Make your card
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {CARDS.map((player, i) => (
            <div key={player.id} className={`reveal mx-auto w-full max-w-[17rem] ${FAN[i]}`}>
              <PlayerCard player={player} />
            </div>
          ))}
        </div>
      </section>

      <section className="reveal mx-auto max-w-7xl px-5 pb-16 pt-10 text-center lg:pb-28">
        <h2 className="mx-auto max-w-[16ch] text-[clamp(2.2rem,6vw,5rem)] leading-[0.98]">
          Next game, skip the argument.
        </h2>
        <p className="mx-auto mt-6 max-w-[32rem] text-lg text-chalk-dim">
          Set up a match in under a minute, fill it with sample players, and watch the teams form.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/matches/new" className="btn">
            Create a match
          </Link>
          <Link href="/matches" className="btn btn-line">
            Browse matches
          </Link>
        </div>
      </section>
    </>
  );
}

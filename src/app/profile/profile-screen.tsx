"use client";

import { toPng } from "html-to-image";
import { PageLoader } from "@/components/page-loader";
import Link from "next/link";
import { useRef, useState } from "react";
import { AccountPanel } from "@/components/account";
import { PlayerCard } from "@/components/player-card";
import { SignIn } from "@/components/sign-in";
import { ovrFor } from "@/lib/domain/ratings";
import {
  POSITION_LABELS,
  STAT_KEYS,
  STAT_LABELS,
  type Foot,
  type Player,
  type Playstyle,
  type Position,
  type Stats,
} from "@/lib/domain/types";
import { actions, useHydrated, useStore } from "@/lib/store";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const DEFAULT_STATS: Stats = { pace: 60, stamina: 60, shooting: 60, passing: 60, dribbling: 60, defending: 60 };

const STAT_HELP: Record<keyof Stats, string> = {
  pace: "How quick you are over a few metres and in a sprint",
  stamina: "How long you keep running before you fade",
  shooting: "Finishing and striking the ball",
  passing: "Short and long passing, and spotting the pass",
  dribbling: "Close control and beating a player",
  defending: "Tackling, marking and reading the game",
};

export function ProfileScreen() {
  const hydrated = useHydrated();
  const { userId, players, cloud, signedIn } = useStore();
  const [revealed, setRevealed] = useState(false);
  if (!hydrated) return <PageLoader label="Loading your profile" />;
  if (cloud && !signedIn) return <SignIn />;

  const me = userId ? players[userId] : null;
  // Switching between profiles is a local-only convenience; with accounts you sign out instead.
  const others = cloud ? [] : Object.values(players).filter((p) => !p.sample && p.id !== userId);
  // Remount the form when the signed-in player changes so it starts from their numbers.
  if (revealed && me) return <CardReveal me={me} onEdit={() => setRevealed(false)} />;
  return <ProfileForm key={userId ?? "new"} me={me} others={others} cloud={cloud} onSaved={() => setRevealed(true)} />;
}

function CardReveal({ me, onEdit }: { me: Player; onEdit: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  async function saveCardImage() {
    const card = cardRef.current?.querySelector<HTMLElement>(".player-card");
    if (!card || saving) return;
    setSaving(true);
    // Capture the settled card: no hover tilt, no entrance flip.
    const previous = card.style.cssText;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.style.animation = "none";
    try {
      const dataUrl = await toPng(card, { pixelRatio: 3 });
      const slug = me.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const link = document.createElement("a");
      link.download = `fairsides-card-${slug || "player"}.png`;
      link.href = dataUrl;
      link.click();
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    } finally {
      card.style.cssText = previous;      setSaving(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-12 px-5 py-12 md:grid-cols-[20rem_1fr] lg:py-20">
      <div ref={cardRef} className="card-tilt card-reveal mx-auto w-full max-w-[20rem]">
        <PlayerCard player={me} />
      </div>
      <div role="status">
        <h1 className="text-[clamp(2.2rem,5vw,4rem)]">{me.name}, you&apos;re in the squad.</h1>
        <p className="mt-5 max-w-[30rem] text-lg text-chalk-dim">
          This is your player card. Hosts use these numbers to split teams fairly, so update it
          whenever your game changes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/matches" className="btn">
            Find a match
          </Link>
          <button type="button" className="btn btn-line" onClick={onEdit}>
            Edit profile
          </button>
          <button type="button" className="btn btn-line" onClick={saveCardImage} disabled={saving}>
            {saving ? "Saving image…" : "Save card as image"}
          </button>
          {saveFailed ? <p role="alert" className="field-hint w-full">Couldn&apos;t save the image. Try again.</p> : null}
        </div>
      </div>
    </div>
  );
}

function ProfileForm({
  me,
  others,
  cloud,
  onSaved,
}: {
  me: Player | null;
  others: Player[];
  cloud: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(me?.name ?? "");
  const [stats, setStats] = useState<Stats>(me?.stats ?? DEFAULT_STATS);
  const [gk, setGk] = useState(me?.gk ?? 50);
  const [primaryPos, setPrimaryPos] = useState<Position>(me?.primaryPos ?? "MID");
  const [secondaryPos, setSecondaryPos] = useState<Position | "">(me?.secondaryPos ?? "");
  const [foot, setFoot] = useState<Foot>(me?.foot ?? "right");
  const [canGk, setCanGk] = useState(me?.canGk ?? false);
  const [playstyle, setPlaystyle] = useState<Playstyle>(me?.playstyle ?? "balanced");
  const [error, setError] = useState("");

  const keeps = canGk || primaryPos === "GK";
  const overall = Math.round(ovrFor(stats, gk, primaryPos));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter the name your teammates know you by.");
      return;
    }
    actions.saveProfile({
      name: name.trim(),
      stats,
      gk: keeps ? gk : 35,
      primaryPos,
      secondaryPos: secondaryPos && secondaryPos !== primaryPos ? secondaryPos : null,
      foot,
      canGk: keeps,
      playstyle,
    });
    onSaved();
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <aside className="mx-auto w-full max-w-[17rem] lg:sticky lg:top-28 lg:order-2 lg:max-w-none lg:self-start" aria-label="Your player card">
        <PlayerCard
          player={{ name, stats, gk: keeps ? gk : 35, primaryPos, secondaryPos: secondaryPos && secondaryPos !== primaryPos ? secondaryPos : null, foot, canGk: keeps, playstyle }}
        />
        <p className="field-hint text-center">Your card updates as you move the sliders.</p>
        {cloud ? (
          <div className="mt-6">
            <AccountPanel readRedirect />
          </div>
        ) : null}
      </aside>
      <div className="min-w-0">
      <h1 className="text-3xl sm:text-4xl">{me ? "Your player profile" : "Create your player profile"}</h1>
      <p className="mt-4 max-w-[36rem] text-chalk-dim">
        Rate yourself honestly — these numbers decide which team you land on. 50 is an average
        player in your group; 80 is the one everybody wants.
      </p>

      <form onSubmit={save} className="mt-10 space-y-10" noValidate>
        <div>
          <label htmlFor="name" className="field-label">
            Name
          </label>
          <input
            id="name"
            className="input max-w-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            autoComplete="nickname"
            aria-describedby={error ? "name-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p id="name-error" className="mt-2 text-sm text-warn">
              {error}
            </p>
          ) : null}
        </div>

        <fieldset className="chalk-rule pt-6">
          <legend className="float-left mb-5 w-full font-display text-2xl font-bold">Where you play</legend>
          <div className="clear-both grid gap-6 sm:grid-cols-2">
            <div>
              <span className="field-label" id="pos-label">
                Main position
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="pos-label">
                {POSITIONS.map((p) => (
                  <label key={p}>
                    <input type="radio" name="primaryPos" checked={primaryPos === p} onChange={() => setPrimaryPos(p)} />
                    {POSITION_LABELS[p]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="secondary" className="field-label">
                Second position
              </label>
              <select
                id="secondary"
                className="input"
                value={secondaryPos}
                onChange={(e) => setSecondaryPos(e.target.value as Position | "")}
              >
                <option value="">None</option>
                {POSITIONS.filter((p) => p !== primaryPos).map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="field-label" id="foot-label">
                Preferred foot
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="foot-label">
                {(["left", "right", "both"] as Foot[]).map((f) => (
                  <label key={f} className="capitalize">
                    <input type="radio" name="foot" checked={foot === f} onChange={() => setFoot(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="field-label" id="style-label">
                Playstyle
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="style-label">
                {(["attacking", "balanced", "defensive"] as Playstyle[]).map((s) => (
                  <label key={s} className="capitalize">
                    <input type="radio" name="playstyle" checked={playstyle === s} onChange={() => setPlaystyle(s)} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {primaryPos !== "GK" ? (
            <label className="mt-6 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-chalk)]"
                checked={canGk}
                onChange={(e) => setCanGk(e.target.checked)}
              />
              <span>I can go in goal if the team needs a keeper</span>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="chalk-rule pt-6">
          <legend className="float-left mb-5 flex w-full items-end justify-between font-display text-2xl font-bold">
            Your game
            <span className="text-right">
              <span className="block font-sans text-xs font-medium text-chalk-dim">
                Overall as a {POSITION_LABELS[primaryPos].toLowerCase()}
              </span>
              <output className="text-4xl leading-none tabular-nums text-glow" aria-live="polite">
                {overall}
              </output>
            </span>
          </legend>
          <div className="clear-both grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {STAT_KEYS.map((key) => (
              <StatSlider
                key={key}
                id={key}
                label={STAT_LABELS[key]}
                help={STAT_HELP[key]}
                value={stats[key]}
                onChange={(v) => {
                  setStats((s) => ({ ...s, [key]: v }));
                }}
              />
            ))}
            {keeps ? (
              <StatSlider
                id="gk"
                label="Goalkeeping"
                help="Shot-stopping, handling and distribution"
                value={gk}
                onChange={setGk}
              />
            ) : null}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn">
            Save profile
          </button>
          {me || cloud ? (
            <button type="button" className="btn btn-line" onClick={() => actions.signOut()}>
              {cloud ? "Sign out" : "Switch player"}
            </button>
          ) : null}
        </div>
      </form>

      {!me && others.length > 0 ? (
        <section className="chalk-rule mt-12 pt-6">
          <h2 className="text-2xl">Or continue as</h2>
          <p className="mt-2 text-sm text-chalk-dim">Players already created in this browser.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {others.map((p) => (
              <button key={p.id} type="button" className="btn btn-line btn-sm" onClick={() => actions.signIn(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      </div>
    </div>
  );
}

function StatSlider({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <span className="font-display text-xl font-bold tabular-nums">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="stat"
        min={1}
        max={99}
        value={value}
        style={{ ["--fill" as string]: `${((value - 1) / 98) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="text-xs text-chalk-dim">
        {help}
      </p>
    </div>
  );
}

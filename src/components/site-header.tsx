"use client";

import Link from "next/link";
import { AccountMenu } from "@/components/account";
import { useStore } from "@/lib/store";

export function SiteHeader() {
  const { userId, players, cloud, signedIn, ready } = useStore();
  const me = userId ? players[userId] : null;

  return (
    <header className="sticky top-0 z-40 h-[4.5rem] border-b border-white/5 bg-turf/55 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-4 px-5">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Fairsides home">
        <span aria-hidden className="flex">
          <span className="size-4 rounded-full bg-bib-a" />
          <span className="-ml-1.5 size-4 rounded-full bg-bib-b" />
        </span>
        <span className="font-display text-lg font-extrabold leading-none tracking-tight">Fairsides</span>
      </Link>
      <nav className="flex items-center gap-1 whitespace-nowrap text-sm font-medium sm:gap-3">
        <Link href="/matches" className="rounded px-2 py-2 hover:underline underline-offset-4">
          Matches
        </Link>
        <Link href="/matches/new" className="hidden rounded px-2 py-2 hover:underline underline-offset-4 sm:block">
          Create match
        </Link>
        {me ? (
          <AccountMenu me={me} />
        ) : (
          <Link href="/profile" className="btn btn-line btn-sm">
            {cloud && ready && !signedIn ? "Sign in" : "Create profile"}
          </Link>
        )}
      </nav>
      </div>
    </header>
  );
}

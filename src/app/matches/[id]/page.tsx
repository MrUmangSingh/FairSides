import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchScreen } from "./match-screen";

export const metadata: Metadata = { title: "Match" };

export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-10" aria-busy="true" />}>
      <MatchScreen params={params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { RefereeScreen } from "./referee-screen";

export const metadata: Metadata = { title: "Referee" };

export default function RefereePage({ params }: PageProps<"/matches/[id]/referee">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10" aria-busy="true" />}>
      <RefereeScreen params={params} />
    </Suspense>
  );
}

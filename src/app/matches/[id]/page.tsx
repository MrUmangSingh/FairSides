import { PageLoader } from "@/components/page-loader";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchScreen } from "./match-screen";

export const metadata: Metadata = { title: "Match" };

export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
  return (
    <Suspense fallback={<PageLoader label="Loading match" />}>
      <MatchScreen params={params} />
    </Suspense>
  );
}

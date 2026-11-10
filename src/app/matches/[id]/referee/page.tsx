import { PageLoader } from "@/components/page-loader";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RefereeScreen } from "./referee-screen";

export const metadata: Metadata = { title: "Referee" };

export default function RefereePage({ params }: PageProps<"/matches/[id]/referee">) {
  return (
    <Suspense fallback={<PageLoader label="Loading referee view" />}>
      <RefereeScreen params={params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { MatchesScreen } from "./matches-screen";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
  return <MatchesScreen />;
}

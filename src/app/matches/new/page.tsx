import type { Metadata } from "next";
import { NewMatchScreen } from "./new-match-screen";

export const metadata: Metadata = { title: "Create a match" };

export default function NewMatchPage() {
  return <NewMatchScreen />;
}

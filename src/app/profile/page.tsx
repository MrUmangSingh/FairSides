import type { Metadata } from "next";
import { ProfileScreen } from "./profile-screen";

export const metadata: Metadata = { title: "Your player profile" };

export default function ProfilePage() {
  return <ProfileScreen />;
}

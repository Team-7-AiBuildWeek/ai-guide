import type { Metadata } from "next";
import Profile from "@/components/Profile";

export const metadata: Metadata = {
  title: "Account — Walk",
  description: "Your account, language and support.",
};

/**
 * A real route rather than another sheet on the map.
 *
 * Everything it shows lives in localStorage, so leaving the map and coming
 * back costs nothing — the walk in progress is exactly where it was.
 */
export default function ProfilePage() {
  return <Profile />;
}

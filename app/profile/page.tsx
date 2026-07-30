import type { Metadata } from "next";
import Profile from "@/components/Profile";

export const metadata: Metadata = {
  title: "My profile — Walk",
  description: "The walks you have built, and the settings every new one starts from.",
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

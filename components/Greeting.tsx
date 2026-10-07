"use client";

/** "Hi, Juraj" over the first card, for a walker who told us their name. */

import { useUser } from "@clerk/nextjs";
import { profileOf } from "@/lib/accounts/profile";

export default function Greeting() {
  const { user } = useUser();
  const name = profileOf(user).name;
  return name ? <p className="u-eyebrow mb-1">Hi, {name}</p> : null;
}

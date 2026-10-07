/** "Hi, Juraj" over the first card, for a walker who told us their name. */

import { useUser } from "@clerk/expo";
import { profileOf } from "@/lib/profile";
import { Eyebrow } from "./ui";

export default function Greeting() {
  const { user } = useUser();
  const name = profileOf(user).name;
  return name ? <Eyebrow style={{ marginBottom: 4 }}>Hi, {name}</Eyebrow> : null;
}

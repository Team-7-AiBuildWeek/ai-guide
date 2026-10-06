import type { Metadata } from "next";
import Welcome from "@/components/Welcome";

export const metadata: Metadata = {
  title: "Welcome — Walk",
  description: "Audio tours anywhere. Start walking.",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <Welcome openSheet={params.sheet === "1"} />;
}

import type { Metadata } from "next";
import Tours from "@/components/Tours";

export const metadata: Metadata = {
  title: "Tours — Walk",
  description: "The walk you are on, and every walk you have built.",
};

export default function ToursPage() {
  return <Tours />;
}

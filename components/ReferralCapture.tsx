"use client";

/** Remembers an invitation code from a shared link (?ref=CODE), on whichever page it lands. */

import { useEffect } from "react";
import { captureReferral } from "@/lib/billing/referral";

export default function ReferralCapture() {
  useEffect(() => {
    captureReferral();
  }, []);
  return null;
}

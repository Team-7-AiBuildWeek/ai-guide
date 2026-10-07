"use client";

/**
 * The front door: nobody reaches the map, Tours or Account without passing
 * the welcome screen.
 *
 *  - Signed in: straight in.
 *  - Signed out: the welcome screen on every visit, and again after signing
 *    out. "Continue without an account" there lets them in for that visit —
 *    Apple does not allow an app to demand an account its features do not need.
 *  - No accounts at all (no Clerk key): the welcome screen once.
 *
 * Nothing behind the door is drawn until it is decided, so the map is not
 * started only to be thrown away; the splash covers the moment it takes.
 */

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { accountsEnabled, welcomed } from "@/lib/accounts/client";
import { useLoadOnce } from "@/lib/useLoadOnce";

/** Pages anyone may open directly: the door itself, and the privacy policy. */
const OPEN = ["/welcome", "/privacy"];

function useDoor(signedIn: boolean | null): boolean | null {
  const path = usePathname();
  const router = useRouter();
  // Browser storage only exists after hydration; from then on it is read on
  // every render, so passing the door a moment ago counts at once.
  const hydrated = useLoadOnce(() => {});
  const passed = hydrated && welcomed();
  const open = OPEN.includes(path);
  // Unknown until both the browser storage and the sign-in state are in.
  const allowed = open ? true : !hydrated || signedIn === null ? null : signedIn || passed;
  useEffect(() => {
    if (allowed === false) router.replace("/welcome");
  }, [allowed, router]);
  return allowed;
}

function WithAccounts({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const allowed = useDoor(isLoaded ? !!isSignedIn : null);
  return allowed ? <>{children}</> : null;
}

function WithoutAccounts({ children }: { children: React.ReactNode }) {
  const allowed = useDoor(false);
  return allowed ? <>{children}</> : null;
}

export default function WelcomeGate({ children }: { children: React.ReactNode }) {
  return accountsEnabled ? <WithAccounts>{children}</WithAccounts> : <WithoutAccounts>{children}</WithoutAccounts>;
}

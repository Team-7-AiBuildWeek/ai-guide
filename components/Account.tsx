"use client";

/**
 * The account card on the profile: who is signed in, and the ways out.
 *
 * Signing in only keeps walks in step between this browser and the iPhone app;
 * nothing else needs it. Deleting the account deletes what was kept for it,
 * then the account — Apple asks for this in the app, and the privacy policy
 * promises it here.
 */

import { useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import SignInSheet from "./SignInSheet";
import { deleteAccount, forgetWelcome, syncWalks } from "@/lib/accounts/client";
import { loadWalks, type WalkRecord } from "@/lib/tour/history";

export default function Account({ onWalks }: { onWalks: (walks: WalkRecord[]) => void }) {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  /** Out, and back through the front door. */
  const leave = () => {
    forgetWelcome();
    return signOut({ redirectUrl: "/welcome" });
  };
  const [confirming, setConfirming] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in: bring this browser's walks and the account's together, once.
  const synced = useRef(false);
  useEffect(() => {
    if (!isSignedIn || synced.current) return;
    synced.current = true;
    void syncWalks(loadWalks()).then((walks) => walks && onWalks(walks));
  }, [isSignedIn, onWalks]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-[length:var(--text-h3)]">Account</h2>
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Sign in to keep your walks on this browser and the iPhone app alike. Everything else works without it.
        </p>
        <button type="button" onClick={() => setSigningIn(true)} className="btn btn--primary w-full">
          Sign in with email
        </button>
        {signingIn ? (
          <>
            {/* The welcome screen's own sheet, over the Account tab; signing in keeps you here. */}
            <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/30" onClick={() => setSigningIn(false)} />
            <div className="welcome-sheet welcome-sheet--shown z-50" role="dialog" aria-modal="true" aria-label="Sign in">
              <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--line-strong)]" />
              <SignInSheet onDone={() => setSigningIn(false)} onClose={() => setSigningIn(false)} />
            </div>
          </>
        ) : null}
      </section>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await deleteAccount())) throw new Error();
      await leave();
    } catch {
      setError("The account could not be deleted. Try again, or write to the address on the privacy page.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-[length:var(--text-h3)]">Account</h2>
      <div>
        <p className="u-eyebrow">Signed in as</p>
        <p className="mt-1 truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
          {user.primaryEmailAddress?.emailAddress}
        </p>
      </div>
      <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
        Your walks are kept with your account, so they are here and in the iPhone app.
      </p>
      <button type="button" onClick={() => void leave()} className="btn btn--quiet w-full">
        Sign out
      </button>
      {confirming ? (
        <div className="rounded-[var(--radius-control)] bg-[#fef2f2] p-3">
          <p className="text-[length:var(--text-caption)] text-[color:var(--ink-soft)]">
            This deletes your account and the walks kept with it, everywhere. Walks on this browser stay until you
            delete them here.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="btn btn--quiet min-w-0 flex-1">
              Keep it
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="btn min-w-0 flex-1 bg-[color:var(--danger)] text-white"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-[44px] self-start text-[length:var(--text-caption)] font-semibold text-[color:var(--danger)] underline underline-offset-4"
        >
          Delete account
        </button>
      )}
      {error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{error}</p> : null}
    </section>
  );
}

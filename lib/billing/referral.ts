"use client";

/**
 * Invitations: a shared link carries ?ref=CODE. The code is remembered on this
 * browser until the newcomer signs in, then handed to the server once
 * (app/api/me/referral), which decides whether it counts.
 */

const KEY = "wd:ref";

/** Remembers a ?ref= code from the address, if there is one. */
export function captureReferral(): void {
  try {
    const code = new URLSearchParams(location.search).get("ref");
    if (code && /^[A-Z0-9]{4,16}$/i.test(code)) localStorage.setItem(KEY, code.toUpperCase());
  } catch {
    /* private mode */
  }
}

/** Hands a remembered code to the server once, when signed in. */
export async function claimReferralIfAny(): Promise<void> {
  let code: string | null = null;
  try {
    code = localStorage.getItem(KEY);
  } catch {
    return;
  }
  if (!code) return;
  try {
    const res = await fetch("/api/me/referral", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    // Counted or not, it has been decided; only an offline failure keeps it.
    if (res.status !== 401) localStorage.removeItem(KEY);
  } catch {
    /* offline: try next time */
  }
}

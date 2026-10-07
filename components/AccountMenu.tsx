"use client";

/**
 * The Account tab's menu: one card, two sections, a row for everything that
 * can be done here — laid out like a settings sidebar (small grey section
 * headings, an icon and a label per row, a soft highlight under the finger).
 *
 * Only rows that do something: Walk has no billing, notifications or themes,
 * and a row that leads nowhere is worse than no row.
 *
 *   Account   Profile (or Sign in) · Language · Sign out · Delete account
 *   Support   Contact us · Privacy policy
 */

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import GetToKnowYou from "./GetToKnowYou";
import OverlaySheet from "./OverlaySheet";
import SignInSheet from "./SignInSheet";
import { accountsEnabled, deleteAccount, forgetWelcome, syncWalks } from "@/lib/accounts/client";
import { profileOf } from "@/lib/accounts/profile";
import { LANGUAGES, languageName } from "@/lib/i18n/languages";
import { loadWalks, type WalkRecord } from "@/lib/tour/history";

const CONTACT = "jurajkolesar1976@gmail.com";

// ------------------------------------------------------------------ icons --

const ICONS = {
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-3.5 4.4-5 8-5s6.5 1.5 8 5" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z" />
    </>
  ),
  signOut: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />,
  delete: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  contact: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  privacy: <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {ICONS[name]}
    </svg>
  );
}

// ------------------------------------------------------------------- rows --

const ROW =
  "flex min-h-[48px] w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left font-[family-name:var(--font-display)] text-[length:var(--text-body)] font-medium transition-colors hover:bg-[color:var(--canvas)] active:bg-[color:var(--line)]";

function Row({
  icon,
  label,
  detail,
  danger,
  onClick,
  href,
}: {
  icon: keyof typeof ICONS;
  label: string;
  detail?: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <Icon name={icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="max-w-[45%] truncate text-[length:var(--text-caption)] font-normal text-[color:var(--ink-mute)]">
          {detail}
        </span>
      ) : null}
    </>
  );
  const tone = danger ? "text-[color:var(--danger)]" : "text-[color:var(--ink)]";
  if (href) {
    const external = href.startsWith("mailto:");
    return external ? (
      <a href={href} className={`${ROW} ${tone}`}>
        {body}
      </a>
    ) : (
      <Link href={href} className={`${ROW} ${tone}`}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${ROW} ${tone}`}>
      {body}
    </button>
  );
}

/** Language opens the browser's own picker: an invisible <select> over the row. */
function LanguageRow({ lang, onLang }: { lang: string; onLang: (code: string) => void }) {
  return (
    <label className={`${ROW} relative cursor-pointer text-[color:var(--ink)]`}>
      <Icon name="language" />
      <span className="min-w-0 flex-1">Language</span>
      <span className="text-[length:var(--text-caption)] font-normal text-[color:var(--ink-mute)]">{languageName(lang)}</span>
      <select
        value={lang}
        onChange={(e) => onLang(e.target.value)}
        aria-label="Language"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.endonym === l.english ? l.endonym : `${l.endonym} — ${l.english}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-2 text-[length:var(--text-caption)] font-medium text-[color:var(--ink-mute)]">{title}</p>
      {children}
    </div>
  );
}

function Card({ account }: { account: ReactNode }) {
  return (
    <nav aria-label="Account" className="card flex flex-col gap-2 p-2">
      <Section title="Account">
        {account}
      </Section>
      <hr className="mx-3 border-[color:var(--line)]" />
      <Section title="Support">
        <Row icon="contact" label="Contact us" href={`mailto:${CONTACT}?subject=Walk`} />
        <Row icon="privacy" label="Privacy policy" href="/privacy" />
      </Section>
    </nav>
  );
}

// ----------------------------------------------------------- with account --

function WithAccount({ language, onWalks }: { language: ReactNode; onWalks: (walks: WalkRecord[]) => void }) {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [sheet, setSheet] = useState<"signIn" | "profile" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in: bring this browser's walks and the account's together, once.
  const synced = useRef(false);
  useEffect(() => {
    if (!isSignedIn || synced.current) return;
    synced.current = true;
    void syncWalks(loadWalks()).then((walks) => walks && onWalks(walks));
  }, [isSignedIn, onWalks]);

  /** Out, and back through the front door. */
  const leave = () => {
    forgetWelcome();
    return signOut({ redirectUrl: "/welcome" });
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await deleteAccount())) throw new Error();
      await leave();
    } catch {
      setError("The account could not be deleted. Try again, or write to us from Contact us.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => setSheet(null);
  const name = profileOf(user).name;
  const email = user?.primaryEmailAddress?.emailAddress;

  const account = !isLoaded ? null : isSignedIn ? (
    <>
      <Row icon="profile" label="Profile" detail={name ?? email} onClick={() => setSheet("profile")} />
      {language}
      <Row icon="signOut" label="Sign out" onClick={() => void leave()} />
      <Row icon="delete" label="Delete account" danger onClick={() => setSheet("delete")} />
    </>
  ) : (
    <>
      <Row icon="profile" label="Sign in" onClick={() => setSheet("signIn")} />
      {language}
    </>
  );

  return (
    <>
      <Card account={account} />

      <OverlaySheet open={sheet === "signIn"} onClose={close} label="Sign in">
        <SignInSheet onDone={close} onClose={close} />
      </OverlaySheet>
      <OverlaySheet open={sheet === "profile"} onClose={close} label="Profile">
        {/* Remounted on each open, so it starts from what the account holds now. */}
        {sheet === "profile" ? <GetToKnowYou onDone={close} /> : null}
      </OverlaySheet>
      <OverlaySheet open={sheet === "delete"} onClose={close} label="Delete account">
        <div className="flex flex-col gap-3">
          <h2 className="text-[length:var(--text-h3)]">Delete your account?</h2>
          <p>
            This deletes your account and the walks kept with it, everywhere. Walks on this browser stay until you delete
            them on the Tours tab.
          </p>
          {error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="btn btn--lg w-full bg-[color:var(--danger)] text-white"
          >
            {busy ? "Deleting…" : "Delete account"}
          </button>
          <button type="button" onClick={close} className="btn btn--quiet w-full">
            Keep it
          </button>
        </div>
      </OverlaySheet>
    </>
  );
}

// ------------------------------------------------------------------- menu --

export default function AccountMenu({
  lang,
  onLang,
  onWalks,
}: {
  lang: string;
  onLang: (code: string) => void;
  /** The account's walks, merged in after signing in, for the totals above. */
  onWalks: (walks: WalkRecord[]) => void;
}) {
  const language = <LanguageRow lang={lang} onLang={onLang} />;
  return accountsEnabled ? <WithAccount language={language} onWalks={onWalks} /> : <Card account={language} />;
}

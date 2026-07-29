/**
 * The site's nav and footer, shared by every marketing page. The landing page
 * carries its own copy inline because its markup came over wholesale.
 */

import Link from "next/link";

const LOGO = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3a7 7 0 0 0-7 7v4a4 4 0 0 0 4 4h1v-7H7v-1a5 5 0 0 1 10 0v1h-3v7h2a1 1 0 0 1 0 2h-3v2h3a3 3 0 0 0 3-3v-9a7 7 0 0 0-7-7Z" />
  </svg>
);

export function SiteNav() {
  return (
    <header className="nav-wrap">
      <nav className="nav container">
        <Link className="logo" href="/">
          {LOGO}
          <span>Narro</span>
        </Link>
        <ul className="nav-links">
          <li>
            <Link href="/cities">Cities</Link>
          </li>
          <li>
            <Link href="/plan">Plan a trip</Link>
          </li>
          <li>
            <Link href="/#how">How it works</Link>
          </li>
          <li>
            <Link href="/#stories">Reviews</Link>
          </li>
        </ul>
        <div className="nav-actions">
          <Link href="/walk" className="btn btn-dark">
            Open the app
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Link className="logo" href="/">
            {LOGO}
            <span>Narro</span>
          </Link>
          <p className="footer-note">
            <em>Narro</em> — Latin for &ldquo;I tell the story.&rdquo; An AI guide for people
            who&apos;d rather walk alone, and still hear all of it.
          </p>
        </div>
        <div className="footer-col">
          <h4>App</h4>
          <Link href="/walk">Open the app</Link>
          <Link href="/cities">Cities</Link>
          <Link href="/plan">Plan a trip</Link>
        </div>
        <div className="footer-col">
          <h4>Company</h4>
          <a href="#">About</a>
          <a href="#">Careers</a>
          <a href="#">Press kit</a>
        </div>
        <div className="footer-col">
          <h4>Support</h4>
          <a href="#">Help centre</a>
          <a href="#">Offline guide</a>
          <a href="#">Privacy</a>
        </div>
      </div>
      <div className="container footer-base">
        <span>© 2026 Narro. All rights reserved.</span>
        <span>Made for people who walk slowly.</span>
      </div>
    </footer>
  );
}

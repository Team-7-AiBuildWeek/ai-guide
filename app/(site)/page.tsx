import type { Metadata } from "next";
import LandingScripts from "@/components/site/LandingScripts";

export const metadata: Metadata = {
  title: "Narro — the city tells its own story, out loud",
  description:
    "An AI guide that narrates the street you're standing on, in real time, in your ear.",
};

/**
 * The marketing page. Static markup, so it stays a server component; the
 * hero's dotted route and the "How it works" tabs are the only moving parts
 * and they live in LandingScripts.
 */
export default function LandingPage() {
  return (
    <div className="narro">
      {/* ============ NAV ============ */}
        <header className="nav-wrap">
          <nav className="nav container">
            <a className="logo" href="#">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path  d="M12 3a7 7 0 0 0-7 7v4a4 4 0 0 0 4 4h1v-7H7v-1a5 5 0 0 1 10 0v1h-3v7h2a1 1 0 0 1 0 2h-3v2h3a3 3 0 0 0 3-3v-9a7 7 0 0 0-7-7Z" /></svg>
              <span>Narro</span>
            </a>

            <ul className="nav-links">
              <li><a href="/cities">Cities</a></li>
              <li><a href="/plan">Plan a trip</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#voice">The voice</a></li>
              <li><a href="#stories">Reviews</a></li>
            </ul>

            <div className="nav-actions">
              <a href="/walk" className="btn btn-dark">Open the app</a>
            </div>
          </nav>
        </header>

        {/* ============ HERO ============ */}
        <section className="hero container">
          <div className="hero-floats" aria-hidden="true">
            <svg className="route-map"></svg>

            <figure className="float float-1">
              <img  src="/narro/roman-forum.jpeg" alt="" />
              <span className="audio-tag">
                <span className="audio-play"><svg viewBox="0 0 24 24"><path  d="M8 5v14l11-7z" /></svg></span>
                <span className="audio-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                <em>2:14</em>
              </span>
            </figure>
            <figure className="float float-2">
              <img  src="/narro/piazza-venezia.jpeg" alt="" />
              <span className="audio-tag">
                <span className="audio-play"><svg viewBox="0 0 24 24"><path  d="M8 5v14l11-7z" /></svg></span>
                <span className="audio-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                <em>1:38</em>
              </span>
            </figure>
            <figure className="float float-3">
              <img  src="/narro/trevi-fountain.jpeg" alt="" />
              <span className="audio-tag">
                <span className="audio-play"><svg viewBox="0 0 24 24"><path  d="M8 5v14l11-7z" /></svg></span>
                <span className="audio-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                <em>3:02</em>
              </span>
            </figure>
            <figure className="float float-4">
              <img  src="/narro/colosseum.jpeg" alt="" />
              <span className="audio-tag">
                <span className="audio-play"><svg viewBox="0 0 24 24"><path  d="M8 5v14l11-7z" /></svg></span>
                <span className="audio-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                <em>2:47</em>
              </span>
            </figure>
          </div>

          <div className="trust">
            <div className="avatars">
              <img  src="https://i.pravatar.cc/80?img=12" alt="" />
              <img  src="https://i.pravatar.cc/80?img=32" alt="" />
              <img  src="https://i.pravatar.cc/80?img=45" alt="" />
            </div>
            <div className="trust-text">
              <span className="stars">★★★★★</span>
              <span>4.9 from walkers · 10k+ walks narrated</span>
            </div>
          </div>

          <h1 className="hero-title">Stories of the city,<br /><em>told as you walk</em></h1>

          <p className="hero-sub">
            An AI guide that narrates the street you're standing on — in real time,
            in your ear, at your pace. No app to install: it runs right in your
            browser. Press play and start walking.
          </p>

          <div className="hero-cta">
            <a href="/walk" className="btn btn-primary">Start walking — it's free</a>
            <a href="/cities" className="btn btn-dark">Browse 140 cities</a>
          </div>
        </section>

        {/* ============ APP SHOWCASE ============ */}
        <section className="showcase">
          <div className="container showcase-panel">
            <div className="chip chip-a">
              <span className="dot"></span> Now narrating · Trevi Fountain
            </div>
            <div className="chip chip-b">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path  d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /></svg>
              You stopped walking — so did the story
            </div>
            <div className="chip chip-c">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path  d="M4 12h16M12 4v16" /></svg>
              “Who built this?” — ask out loud, anytime
            </div>

            <div className="phone">
              <div className="phone-screen">
                <img  className="phone-map" src="/narro/map.svg" alt="" />
                <span className="notch"></span>

                <div className="app-top">
                  <span className="app-city">Rome · Baroque Loop</span>
                  <span className="app-progress">Stop 4 of 12</span>
                </div>

                <div className="app-player">
                  <div className="app-player-head">
                    <span className="live"><i></i> Live</span>
                    <span>02:14</span>
                  </div>
                  <strong>The fountain that ate a whole aqueduct</strong>
                  <div className="wave" aria-hidden="true">
                    <span></span><span></span><span></span><span></span><span></span>
                    <span></span><span></span><span></span><span></span><span></span>
                    <span></span><span></span><span></span><span></span><span></span>
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <div className="app-controls">
                    <button type="button" aria-label="Back 15 seconds"><svg viewBox="0 0 24 24"><path  d="M11 4 7 8l4 4" /><path  d="M7 8h6a5 5 0 1 1 0 10h-2" /></svg></button>
                    <button type="button" className="app-pause" aria-label="Pause"><svg viewBox="0 0 24 24"><path  d="M9 5v14M15 5v14" /></svg></button>
                    <button type="button" aria-label="Ask a question"><svg viewBox="0 0 24 24"><rect  x="9" y="3" width="6" height="11" rx="3" /><path  d="M5 11a7 7 0 0 0 14 0" /><path  d="M12 18v3" /></svg></button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container">
            <div className="stats">
              <div className="stat"><strong>140+</strong><span>Cities narrated</span></div>
              <div className="stat"><strong>32</strong><span>Languages, one voice</span></div>
              <div className="stat"><strong>4.9</strong><span>Average rating</span></div>
              <div className="stat"><strong>0</strong><span>Group tours joined</span></div>
            </div>
          </div>
        </section>

        {/* ============ PRESS STRIP ============ */}
        <section className="logos">
          <div className="container logo-row">
            <span className="brand"><svg viewBox="0 0 24 24"><path  d="M12 2 2 12l10 10 10-10z" /></svg>Wanderlight</span>
            <span className="brand"><svg viewBox="0 0 24 24"><path  d="m12 2 2.9 6.3 6.8.8-5 4.6 1.3 6.8L12 17.2 6 20.5l1.3-6.8-5-4.6 6.8-.8Z" /></svg>Nomad Weekly</span>
            <span className="brand"><svg viewBox="0 0 24 24"><circle  cx="12" cy="12" r="9" /></svg>Citylore</span>
            <span className="brand"><svg viewBox="0 0 24 24"><path  d="M3 18 12 4l9 14z" /></svg>Everpeak</span>
            <span className="brand"><svg viewBox="0 0 24 24"><rect  x="4" y="4" width="16" height="16" rx="5" /></svg>Latitude</span>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="section" id="how">
          <div className="container how-grid">
            <div className="how-media" id="how-panel" role="tabpanel" aria-labelledby="how-tab-0">
              <img  className="how-photo" src="https://picsum.photos/seed/voxapickcity/1000/1100" alt="Rooftops of a city at first light" />

              <div className="chip chip-tl">
                <span className="dot"></span> <span className="chip-text">12 routes nearby</span>
              </div>

              <div className="chip-card">
                <span className="chip-card-icon">
                  <svg viewBox="0 0 24 24"><path  d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle  cx="12" cy="10" r="2.6" /></svg>
                </span>
                <div>
                  <strong className="chip-card-title">Rome</strong>
                  <span className="chip-card-meta">9 walks · from 45 min</span>
                </div>
              </div>
            </div>

            <div className="steps" role="tablist" aria-orientation="vertical" aria-label="How it works">
              <div className="step is-active" role="tab" id="how-tab-0" aria-controls="how-panel" aria-selected="true" tabIndex={0}>
                <span className="step-icon"><svg viewBox="0 0 24 24"><path  d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle  cx="12" cy="10" r="2.6" /></svg></span>
                <h3>Pick your city</h3>
                <p>Open the app anywhere and it already knows which streets are around you.</p>
              </div>

              <div className="step" role="tab" id="how-tab-1" aria-controls="how-panel" aria-selected="false" tabIndex={-1}>
                <span className="step-icon"><svg viewBox="0 0 24 24"><path  d="M8 5v14l11-7z" /></svg></span>
                <h3>Press play, start walking</h3>
                <p>Your guide reads the city aloud, triggering each story the moment you arrive.</p>
              </div>

              <div className="step" role="tab" id="how-tab-2" aria-controls="how-panel" aria-selected="false" tabIndex={-1}>
                <span className="step-icon"><svg viewBox="0 0 24 24"><rect  x="9" y="3" width="6" height="11" rx="3" /><path  d="M5 11a7 7 0 0 0 14 0" /><path  d="M12 18v3" /></svg></span>
                <h3>Talk back to it</h3>
                <p>Interrupt with a question out loud and get an answer before the next corner.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ VOICE FEATURES ============ */}
        <section className="section voice-section" id="voice">
          <div className="container">
            <div className="section-head">
              <h2 className="section-title">A guide, not an audiobook</h2>
              <p className="section-sub">The narration reacts to where you are, how fast you move, and what you ask</p>
            </div>

            <div className="feature-grid">
              <article className="feature">
                <span className="feature-icon"><svg viewBox="0 0 24 24"><path  d="M3 12h3l2.5-6 3 13L14 9l2 3h5" /></svg></span>
                <h3>Live, not pre-recorded</h3>
                <p>Every story is generated for the exact spot you're standing on, the day you're standing there.</p>
              </article>

              <article className="feature">
                <span className="feature-icon"><svg viewBox="0 0 24 24"><rect  x="9" y="3" width="6" height="11" rx="3" /><path  d="M5 11a7 7 0 0 0 14 0" /><path  d="M12 18v3" /></svg></span>
                <h3>Interrupt it anytime</h3>
                <p>Say “wait, who was she?” and the guide stops, answers, then picks the thread back up.</p>
              </article>

              <article className="feature">
                <span className="feature-icon"><svg viewBox="0 0 24 24"><circle  cx="12" cy="12" r="9" /><path  d="M12 7v5l3 2" /></svg></span>
                <h3>Keeps your pace</h3>
                <p>Linger at a doorway and it goes deeper. Walk fast and it gets to the point.</p>
              </article>

              <article className="feature">
                <span className="feature-icon"><svg viewBox="0 0 24 24"><path  d="M5 12a7 7 0 0 1 14 0" /><path  d="M2 12a10 10 0 0 1 20 0" /><circle  cx="12" cy="17" r="2" /></svg></span>
                <h3>Works underground</h3>
                <p>Download a city before you land. No signal, no data, no silence.</p>
              </article>

              <article className="feature">
                <span className="feature-icon"><svg viewBox="0 0 24 24"><path  d="M4 6h16M4 12h10M4 18h7" /></svg></span>
                <h3>32 languages, one voice</h3>
                <p>Switch mid-walk. The same guide, the same tone, a different tongue.</p>
              </article>

              <article className="feature">
                <span className="feature-icon"><svg viewBox="0 0 24 24"><path  d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle  cx="12" cy="10" r="2.6" /></svg></span>
                <h3>No umbrella to follow</h3>
                <p>No meeting point, no start time, no group of forty. Leave when you feel like it.</p>
              </article>
            </div>
          </div>
        </section>

        {/* ============ REVIEWS ============ */}
        <section className="section" id="stories">
          <div className="container">
            <div className="section-head">
              <h2 className="section-title">What walkers say</h2>
              <p className="section-sub">From our walkers, unedited</p>
            </div>

            <div className="quote-grid">
              <figure className="quote">
                <span className="stars">★★★★★</span>
                <blockquote>I asked it why the street was named that. It answered, then tied it back to the church we'd passed ten minutes earlier.</blockquote>
                <figcaption><img  src="https://i.pravatar.cc/80?img=5" alt="" /><span><strong>Amara Okafor</strong>Walked Lisbon · 6 routes</span></figcaption>
              </figure>

              <figure className="quote">
                <span className="stars">★★★★★</span>
                <blockquote>I stopped to buy coffee and the narration just waited for me. First audio guide that didn't leave me behind.</blockquote>
                <figcaption><img  src="https://i.pravatar.cc/80?img=15" alt="" /><span><strong>Jonas Weber</strong>Walked Rome · 3 routes</span></figcaption>
              </figure>

              <figure className="quote">
                <span className="stars">★★★★★</span>
                <blockquote>Used it in Tokyo with zero signal for four hours straight. It never once stopped talking.</blockquote>
                <figcaption><img  src="https://i.pravatar.cc/80?img=24" alt="" /><span><strong>Priya Nair</strong>Walked Tokyo · 11 routes</span></figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="cta-wrap container" id="get">
          <div className="cta">
            <img  src="https://picsum.photos/seed/nightwalk/1600/700" alt="" />
            <div className="cta-inner">
              <h2>Your next walk has a voice</h2>
              <p>Nothing to download. First route in every city is on us.</p>
              <div className="hero-cta">
                <a href="/walk" className="store store-light">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path  d="M8 5v14l11-7z" /></svg>
                  <span><small>Open Narro</small><strong>In your browser</strong></span>
                </a>
                <a href="/plan" className="store store-light">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path  d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle  cx="12" cy="10" r="2.6" /></svg>
                  <span><small>Let Narro</small><strong>Plan your trip</strong></span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FOOTER ============ */}
        <footer className="footer">
          <div className="container footer-grid">
            <div>
              <a className="logo" href="#">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path  d="M12 3a7 7 0 0 0-7 7v4a4 4 0 0 0 4 4h1v-7H7v-1a5 5 0 0 1 10 0v1h-3v7h2a1 1 0 0 1 0 2h-3v2h3a3 3 0 0 0 3-3v-9a7 7 0 0 0-7-7Z" /></svg>
                <span>Narro</span>
              </a>
              <p className="footer-note"><em>Narro</em> — Latin for “I tell the story.” An AI guide for people who'd rather walk alone, and still hear all of it.</p>
            </div>

            <div className="footer-col">
              <h4>App</h4>
              <a href="/walk">Open the app</a><a href="/cities">Cities</a><a href="/plan">Plan a trip</a><a href="#how">How it works</a><a href="#voice">The voice</a>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <a href="#">About</a><a href="#">Careers</a><a href="#">Press kit</a>
            </div>
            <div className="footer-col">
              <h4>Support</h4>
              <a href="#">Help centre</a><a href="#">Offline guide</a><a href="#">Privacy</a>
            </div>
          </div>
          <div className="container footer-base">
            <span>© 2026 Narro. All rights reserved.</span>
            <span>Made for people who walk slowly.</span>
          </div>
        </footer>
      <LandingScripts />
    </div>
  );
}

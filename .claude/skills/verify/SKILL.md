---
name: verify
description: How to run and drive the Walk website (Next.js) and iPhone app (Expo) to verify a change at its surface.
---

# Verifying Walk

## Website (Next.js, repo root)

1. Clerk + DB keys live only on Vercel. Pull them to a temp file, never over `.env.local`:
   `vercel env pull "$TMP/vercel-dev.env" --environment=development --yes`
2. Start on a free port with those keys:
   `rm -rf .next/dev; (set -a; . "$TMP/vercel-dev.env"; set +a; npx next dev -p 3123 > "$TMP/next.log" 2>&1 &)`
   then poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:3123/` until 200.
3. Drive it in Chrome (claude-in-chrome) at phone size: `resize_window 420x880`.

Gotchas:
- **iCloud offloads files** (the project is on the Desktop). Hangs in tsc/git/next = offloaded files.
  Check `ls -lOR app components lib | grep -c dataless`; fetch with `brctl download <file>`.
  `.next/dev` cache corrupts the same way: "Failed to open database … meta file" → `rm -rf .next/dev`.
- The Next.js dev-tools "N" button sits over the **Explore** tab (bottom-left). Hide it before clicking:
  `document.querySelectorAll('nextjs-portal').forEach(p => p.style.display = 'none')`.
- Click right after a navigation can land before hydration and do nothing; wait ~5s or click by coordinates.
- First visit (no `btour:welcome:v1` in localStorage) redirects `/` → `/welcome`.
- State is localStorage: `btour:tour:v2` (walk in progress), `btour:welcome:v1`, `btour:history:v1`.
  Snapshot before seeding test data and remove it after. Use localhost, not the live site — the live
  origin in this Chrome holds the user's real walks.
- Opening a walk triggers `/api/stops/script` (a real Gemini call). Seeded test walks cost a little.
- Sign-in: Clerk dev instance accepts `anything+clerk_test@example.com` with code `424242`, but its
  bot check may show a CAPTCHA checkbox — that blocks automation; stop there.
- SVG/CSS animations (splash): pause with `svg.pauseAnimations(); svg.setCurrentTime(t)` to capture frames.

## iPhone app (Expo, `mobile/`)

- `node_modules` is a link to `node_modules.nosync`; `npm install` replaces it — relink after.
- Start: `cd mobile && npx expo start --port 8081` (background), then bundle check:
  `curl -s -o /dev/null -w "%{http_code}" "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true&hot=false&lazy=false&transform.engine=hermes&transform.routerRoot=src%2Fapp"`
- The app itself can only be driven on the user's phone (Expo Go, QR from `exp://<mac-ip>:8081`).
  A bundle 200 proves it builds, not that it works — report the app part as not observed.

## Live site

https://ai-guide-phi.vercel.app — wait for a deploy by polling for something the change adds.

# Deploying

`netlify.env` holds the production values. It is a **reference file** — Next.js
never loads it, so nothing in it can affect a local build. Gitignored, because
it contains a real key.

## Netlify

1. **Register the domain with Stadia first.** Client dashboard → *Manage
   Properties* → *Authentication Configuration* → add the site's domain. Skip
   this and `STADIA_DOMAIN_AUTH=true` makes every tile request 401.
2. Copy each line of `netlify.env` into *Site configuration → Environment
   variables*. Set the scope to **all deploy contexts**, not just Production,
   or deploy previews render a blank map.
3. Redeploy. Saving a variable does not trigger a build.

## Why `STADIA_DOMAIN_AUTH=true` in production

Tiles are fetched by the browser, so a key in the style URL is readable by
anyone — inherent to client-side maps. With domain auth the style URL carries
no key at all and Stadia authorises by the `Origin` header instead.

Geocoding and routing are unaffected: they run in server components and keep
using `STADIA_API_KEY`, which never reaches the browser.

Locally, leave `STADIA_DOMAIN_AUTH=false` in `.env.local` — localhost is not a
registered domain.

## If the deployed site "doesn't work with Gemini"

Open **`/dev/providers` on the deployed URL**. It prints which provider is live
for each of LLM, TTS and maps, and the exact error from each — including
"google provider selected but GEMINI_API_KEY is not set". That page answers
this question in one look; guessing from the app's behaviour does not, because
every provider degrades quietly to a mock rather than erroring.

Three things it will usually be:

1. **The variables were never set.** Without `LLM_PROVIDER=google`,
   `TTS_PROVIDER=google` and `GEMINI_API_KEY`, the app runs on mocks by
   design — a canned tour, a beep instead of narration, and "I can't answer
   that without a real language model". It looks broken; it is switched off.
2. **They were set but not redeployed.** Netlify does not rebuild when a
   variable is saved.
3. **They were scoped to Production only**, so deploy previews still run mocks.

## Netlify cannot host tour generation — measured

Against the deployed site, with Gemini enabled:

```
POST /api/tours
  ended after 30.22s with HTTP 200
  events received: 1
  data: {"phase":"stops","message":"Choosing your stops"}
```

The function is cut at **30 seconds**, mid-stream, with a 200 already sent.
Generation needs 30–120s. Everything short still works — geocoding, a single
TTS call, tiles, routing — so the site looks alive while the one thing that
matters hangs.

Two ways out:

1. **Deploy to Vercel** — long-running routes and streaming are native there,
   `maxDuration` is honoured, and it is what the project spec assumes. Nothing
   in the code changes.
2. **Split generation into calls that each fit in 30s** — the skeleton (stops,
   coordinates, cues) in one request, then each stop's scripts in its own. More
   work, but it would run on any host and would let the map appear before the
   narration is written.

## Function timeouts — the one that will bite next

Tour generation takes 30–120 seconds and speech synthesis 5–30. Netlify's
*background* functions are documented at 15 minutes, but ordinary synchronous
functions are far shorter, and `export const maxDuration` in the route files is
a Vercel convention that Netlify's adapter may not honour.

So even with every key set, `/api/tours` may time out on Netlify while working
locally. If the map and the landing screen work but building a tour hangs or
502s, this is why — not the key. Vercel is the safer target and is what the
project spec assumes.

## Known risk

Next 16 is very new and Netlify's Next runtime can lag a major release. A build
failure that has nothing to do with this code is probably that. Vercel is the
safer target and is what the project spec assumes.

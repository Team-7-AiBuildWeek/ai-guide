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

## Known risk

Next 16 is very new and Netlify's Next runtime can lag a major release. A build
failure that has nothing to do with this code is probably that. Vercel is the
safer target and is what the project spec assumes.

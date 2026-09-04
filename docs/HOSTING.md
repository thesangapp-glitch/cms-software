# Hosting: sangapp.in and events.sangapp.in

Two sites live in this repo and deploy to **two separate Cloudflare Pages projects**:

| Site | Source | Build output | Pages project | Domain |
|---|---|---|---|---|
| Sang app marketing site | `app-site/` | `app-site/dist` | `cms-software` | `www.sangapp.in` (apex) |
| Sang Event CRM | `web/` | `web/dist` | `sang-event-crm` | `events.sangapp.in` |

Both build at base `/` and own the root of their host, so neither needs a path prefix.

> **History:** these used to be one Pages project serving the CRM at `/` and the marketing
> site at `/app`. That was split so the marketing site owns the apex. `/app` and
> `/app/privacy` still 301 to `/` and `/privacy` — see `app-site/public/_redirects`.

- **Domain:** `sangapp.in`, registered at **Wix**. Wix keeps its domains on Wix
  nameservers, so **DNS records are managed in Wix**, not Cloudflare.
- **Cloudflare account:** `122aae71dbcbdaed878614d8cb2ad080`

---

## Everyday deploys

From the repo root:

```bash
npm run build          # builds both sites
npm run deploy         # deploys both

# or one at a time
npm run build:app && npm run deploy:app     # marketing site → www.sangapp.in
npm run build:crm && npm run deploy:crm     # CRM → events.sangapp.in
```

The deploy scripts `cd` into `app-site/` or `web/` first. That is deliberate: `wrangler
pages deploy` looks for a `functions/` directory next to the working directory, and the
repo root has one — but it holds **Firebase** Cloud Functions, which wrangler then tries
(and fails) to build as Pages Functions.

Preview a production build locally with real Pages semantics — `_redirects` rules,
asset resolution, 404 fallback — which `vite preview` does not reproduce:

```bash
cd app-site && npx wrangler pages dev dist
```

---

## `_redirects` gotchas

Both sites carry a `public/_redirects`. Three rules learned the hard way:

1. **Rules run BEFORE static-asset lookup.** A catch-all `/*  /  200` swallows
   `/assets/*`, `/logo.png` and `/robots.txt`, returning the HTML shell for all of them.
   Never add a bare `/*` rule.
2. **`/*  /index.html  200` is rejected**, not honoured. Pages detects an infinite loop
   (it strips `/index`, re-matches the rule) and silently ignores the whole line.
3. **You don't need a SPA fallback anyway.** Unknown paths already fall back to
   `index.html` with a 200.

So list client-side routes explicitly, and rewrite each to the **directory** `/` rather
than to `/index.html` — `/` is already normalized, so Pages serves `index.html` with a 200
and the URL is preserved for the router:

```
/privacy   /   200
```

Add a line there whenever the marketing site gains a route. The CRM is hash-routed
(`#/dashboard`, …), so its `_redirects` is intentionally comment-only.

---

## One-time setup: events.sangapp.in

The CRM's Pages project and custom domain are created once.

**1. Create the Pages project and push the first deploy.**

```bash
npm run build:crm
npm run deploy:crm     # wrangler creates the `sang-event-crm` project if missing
```

Confirm it works on the generated `https://sang-event-crm.pages.dev` URL first.

**2. Attach the custom domain.** Cloudflare Dashboard → Workers & Pages →
`sang-event-crm` → **Custom domains** → **Set up a domain** → `events.sangapp.in`, using
the **"My DNS provider"** method. Pages will ask for this record:

| Type | Name | Value |
|---|---|---|
| CNAME | `events` | `sang-event-crm.pages.dev` |

**3. Add that record in Wix.** Account → **Domains** → `sangapp.in` → **⋯ → Manage DNS
records** → under **CNAME (Aliases)** → add `events` → `sang-event-crm.pages.dev` → Save.

**4. Verify.** Back in Cloudflare Pages → Custom domains → **Check DNS records**.
Propagation takes minutes to a few hours; TLS is issued automatically.

**5. Authorize the new host in Firebase.** Firebase Console → project `sang-d8b93` →
**Authentication → Settings → Authorized domains** → add `events.sangapp.in`. Sign-in
breaks on the new host until this is done. If Google sign-in uses a custom OAuth client,
add `https://events.sangapp.in` to its authorized JavaScript origins in Google Cloud
Console too.

---

## The apex (already live)

`www.sangapp.in` is a custom domain on the `cms-software` Pages project, with a `www`
CNAME in Wix pointing at `cms-software.pages.dev`, and the bare apex `sangapp.in`
forwarding to `https://www.sangapp.in`. Nothing about the apex changes in this split —
only the content deployed to that project does.

> The Pages project is still named `cms-software` from when it served the CRM. Renaming a
> Pages project means recreating it and re-attaching the domain, so the name stays.

---

## Post-launch checklist

- [ ] `https://sangapp.in` and `https://www.sangapp.in` load the marketing site over HTTPS.
- [ ] `https://www.sangapp.in/app` and `/app/privacy` 301 to `/` and `/privacy`.
- [ ] `https://events.sangapp.in` loads the CRM, and sign-in works end to end.
- [ ] Submit `https://www.sangapp.in/sitemap.xml` and `https://events.sangapp.in/sitemap.xml`
      in Google Search Console, and request removal/recrawl of the old `/app` URLs.
- [ ] Update any App Store / Play Store privacy-policy links to `https://www.sangapp.in/privacy`
      (the `/app/privacy` 301 keeps the old ones working meanwhile).
- [ ] Update the App Store link in `app-site/src/site.js` once the iOS listing is live.

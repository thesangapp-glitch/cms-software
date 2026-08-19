# Deploying Sang to Cloudflare Pages (with CI/CD)

This site deploys to **Cloudflare Pages**, connected directly to the GitHub repo. Once set up,
**every push to `main` automatically builds and deploys** — that is the CI/CD. Pull requests get
their own preview URL.

- **Repo:** https://github.com/thesangapp-glitch/sang-website
- **Domain:** `sangapp.in` (registered at Wix)
- **Host / CI-CD:** Cloudflare Pages (account `122aae71dbcbdaed878614d8cb2ad080`)

---

## 1. Create the Cloudflare Pages project (one time, ~3 min)

1. Go to **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Click **Connect GitHub**, authorize Cloudflare, and grant it access to the
   `thesangapp-glitch/sang-website` repo.
3. Select the `sang-website` repo → **Begin setup**.
4. Build settings:
   | Field | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `Vite` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
5. Click **Save and Deploy**. Cloudflare installs deps, runs the build, and publishes to a
   `*.pages.dev` URL. From now on, **every `git push` to `main` redeploys automatically.**

> SPA routing (`/privacy` on refresh) is already handled by `public/_redirects`
> (`/* /index.html 200`), which Cloudflare Pages reads automatically.

---

## 2. Connect the domain (www.sangapp.in)

The domain is registered at **Wix**. Wix keeps domains registered with it on Wix's own
nameservers, so we keep DNS at Wix and point **www.sangapp.in** at Pages with a CNAME. The site's
canonical URL is `https://www.sangapp.in`.

**A. In Cloudflare Pages** (already done): Workers & Pages → `sang-website` → **Custom domains** →
added `www.sangapp.in` via the **"My DNS provider"** method. Pages is waiting for this DNS record:

| Type | Name | Value / Target |
|---|---|---|
| CNAME | `www` | `sang-website.pages.dev` |

**B. In Wix** — Account → **Domains** → `sangapp.in` → **⋯ → Manage DNS records** → under
**CNAME (Aliases)**, edit the existing `www` record and change its value from `cdn1.wixdns.net`
to **`sang-website.pages.dev`** → **Save**.

**C. Back in Cloudflare Pages** → Custom domains → **Check DNS records**. Once it verifies (minutes
to a few hours), `https://www.sangapp.in` goes live with an automatic TLS certificate.

**D. Redirect the bare apex** `sangapp.in` → `www.sangapp.in`: in Wix, Domains → `sangapp.in` set up
domain forwarding/redirect to `https://www.sangapp.in` (or point the apex at your preferred redirect).
Optional but recommended so visitors typing `sangapp.in` land on the site.

> A pending Cloudflare zone for `sangapp.in` may exist from setup; it's harmless (Wix stays
> authoritative). You can remove it from the Cloudflare dashboard if you like.

---

## 3. Everyday workflow (the CI/CD loop)

```bash
# make changes locally
npm run dev            # preview at http://localhost:5173
git add -A
git commit -m "Update hero copy"
git push               # → Cloudflare auto-builds & deploys to www.sangapp.in
```

- **`main`** → production (`www.sangapp.in`).
- **any other branch / PR** → automatic **preview deployment** with its own URL.

---

## 4. Optional: deploy from the CLI (manual)

Only needed for one-off manual deploys; the Git integration above is the normal path.

```bash
npm run build
npx wrangler pages deploy dist --project-name sang-website
```

---

## Post-launch checklist
- [ ] Confirm `https://sangapp.in` and `https://www.sangapp.in` both load with valid HTTPS.
- [ ] In Cloudflare Pages → set a redirect so `www` → root (or root → `www`), pick one canonical.
- [ ] Submit `https://www.sangapp.in/sitemap.xml` in Google Search Console.
- [ ] Update the App Store link in `src/site.js` once the iOS listing is live.

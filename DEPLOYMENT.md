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

## 2. Point `sangapp.in` at Cloudflare

The domain is registered at **Wix**, but DNS is easiest to manage on Cloudflare. Two options:

### Option A — Move DNS to Cloudflare (recommended)
1. Cloudflare Dashboard → **Add a site** → enter `sangapp.in` → pick the **Free** plan.
2. Cloudflare scans existing records and gives you **two nameservers** (e.g. `xxx.ns.cloudflare.com`).
3. In **Wix**: Domains → `sangapp.in` → **Advanced / Nameservers** → *Connect to another host* /
   *Use custom nameservers* → replace Wix's nameservers with the two from Cloudflare → save.
4. Nameserver changes take anywhere from a few minutes to ~24 h to propagate. Cloudflare emails you
   when the domain is **Active**.
5. Then go to **Workers & Pages → sang-website → Custom domains → Set up a custom domain** and add
   both `sangapp.in` and `www.sangapp.in`. Cloudflare creates the DNS records and TLS certificate
   automatically.

### Option B — Keep DNS at Wix (only if you can't change nameservers)
1. In Pages → **Custom domains**, add `sangapp.in`. Cloudflare shows a target like
   `sang-website.pages.dev`.
2. In Wix DNS, add a **CNAME** for `www` → `sang-website.pages.dev`, and use Wix's
   forwarding / ALIAS for the root `@` to the same target.
   *(Root CNAME/ALIAS support at Wix is limited — Option A is cleaner and gives real HTTPS + CDN.)*

---

## 3. Everyday workflow (the CI/CD loop)

```bash
# make changes locally
npm run dev            # preview at http://localhost:5173
git add -A
git commit -m "Update hero copy"
git push               # → Cloudflare auto-builds & deploys to sangapp.in
```

- **`main`** → production (`sangapp.in`).
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
- [ ] Submit `https://sangapp.in/sitemap.xml` in Google Search Console.
- [ ] Update the App Store link in `src/site.js` once the iOS listing is live.

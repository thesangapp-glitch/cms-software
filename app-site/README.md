# Sang — Marketing Website

The official marketing website for **Sang**, the free, smart, paperless digital business card app.
Share your profile instantly with a QR code or NFC tap.

Built with **React + Vite + React Router**. Fully responsive, SEO-optimized (meta tags,
Open Graph, JSON-LD structured data for `MobileApplication` + `FAQPage`, sitemap & robots),
with a light/dark theme toggle in a blue→white gradient design.

## Getting started

```bash
npm install
npm run dev       # local dev server (http://localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview the production build
```

## Structure

```
index.html            SEO meta tags + JSON-LD structured data
src/
  main.jsx            app entry (Router + ThemeProvider)
  App.jsx             routes: /  and  /privacy
  theme.jsx           light/dark theme context (persists + respects OS)
  site.js             shared links & nav config
  index.css           full design system (blue gradient, light/dark, responsive)
  pages/
    Home.jsx          landing page (composed of the sections below)
    Privacy.jsx       Privacy Policy & Terms of Service
  components/         Navbar, Hero, Features, HowItWorks, UseCases,
                      WhySang, FAQ, CTA, Footer, PhoneMockup, etc.
public/               logo/icons, robots.txt, sitemap.xml, SPA redirects
```

## Deploying

This site owns the apex, `https://www.sangapp.in/`, and deploys to the `cms-software`
Cloudflare Pages project. Run from the **repo root**, not from here:

```bash
npm run build:app
npm run deploy:app
```

The Sang Event CRM (`../web`) is a separate site on `events.sangapp.in` with its own Pages
project. Custom-domain setup, deploy details, and the `_redirects` gotchas are in
[`../docs/HOSTING.md`](../docs/HOSTING.md).

`public/_redirects` handles `/privacy` on refresh and 301s the legacy `/app` paths (this
site used to be served under `/app`) to their new locations. Add a line there for every
new route.

The canonical URL / Open Graph domain in `index.html` is `https://www.sangapp.in`. Update
the store links in `src/site.js` when the App Store listing goes live.

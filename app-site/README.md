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

Hosted on **Cloudflare Pages** with CI/CD: every push to `main` auto-builds (`npm run build`) and
deploys to `sangapp.in`; pull requests get preview URLs. Full setup + custom-domain steps are in
[`DEPLOYMENT.md`](./DEPLOYMENT.md). SPA fallback (`/privacy` on refresh) is handled by
`public/_redirects`.

The canonical URL / Open Graph domain in `index.html` is set to `https://sangapp.in`. Update the
store links in `src/site.js` when the App Store listing goes live.

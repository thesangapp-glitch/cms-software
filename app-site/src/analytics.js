import { GA_MEASUREMENT_ID } from './site.js'

// Google Analytics 4 loader — privacy-first. gtag.js is injected only when this
// is called (i.e. after cookie consent), never on first paint. IP anonymisation
// is on. If the Measurement ID is still the placeholder, it no-ops.
let loaded = false

export function isConfigured() {
  return GA_MEASUREMENT_ID && !GA_MEASUREMENT_ID.includes('XXXX')
}

export function loadAnalytics() {
  if (loaded || !isConfigured()) return
  loaded = true

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(s)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true,
  })
}

// Manual SPA page-view (react-router changes the URL without a full reload).
export function trackPageview(path) {
  if (!loaded || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

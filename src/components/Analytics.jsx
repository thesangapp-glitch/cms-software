import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { loadAnalytics, trackPageview } from '../analytics.js'
import { hasConsent } from './CookieConsent.jsx'

// Loads Google Analytics only once the visitor has consented (either previously,
// stored in localStorage, or via the "Accept all" button which fires the
// `sang-consent-accepted` event), then reports a page_view on every route change.
export default function Analytics() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (hasConsent()) loadAnalytics()
    const onAccept = () => loadAnalytics()
    window.addEventListener('sang-consent-accepted', onAccept)
    return () => window.removeEventListener('sang-consent-accepted', onAccept)
  }, [])

  useEffect(() => {
    trackPageview(pathname)
  }, [pathname])

  return null
}

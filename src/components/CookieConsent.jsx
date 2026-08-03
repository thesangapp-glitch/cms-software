import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const KEY = 'sang-cookie-consent'

// GDPR/ePrivacy-friendly consent. Non-essential cookies (e.g. analytics) stay
// OFF until the visitor explicitly accepts. The choice is remembered locally.
export function hasConsent() {
  try { return localStorage.getItem(KEY) === 'accepted' } catch { return false }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let stored = null
    try { stored = localStorage.getItem(KEY) } catch { /* ignore */ }
    if (stored !== 'accepted' && stored !== 'rejected') {
      // slight delay so it animates in after first paint
      const t = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(t)
    }
  }, [])

  const choose = (value) => {
    try { localStorage.setItem(KEY, value) } catch { /* ignore */ }
    if (value === 'accepted') {
      // Place to initialise analytics/marketing scripts once allowed.
      window.dispatchEvent(new CustomEvent('sang-consent-accepted'))
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <div className="cookie__inner">
        <div className="cookie__icon" aria-hidden="true">🍪</div>
        <div className="cookie__text">
          <strong>We value your privacy</strong>
          <p>
            We use essential cookies to make Sang work. With your consent, we’d also use analytics
            cookies to understand how the site is used. You can change your mind anytime. Read our{' '}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </div>
        <div className="cookie__actions">
          <button className="btn cookie__btn cookie__btn--ghost" onClick={() => choose('rejected')}>
            Reject non-essential
          </button>
          <button className="btn btn--primary cookie__btn" onClick={() => choose('accepted')}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}

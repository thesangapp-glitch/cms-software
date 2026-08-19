import { Link } from 'react-router-dom'
import { HashLink } from './HashLink.jsx'
import Logo from './Logo.jsx'
import { LINKS, NAV_ITEMS } from '../site.js'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo footer />
          <p className="footer__tag">
            The smart, paperless way to share who you are. Ditch paper business cards and make every
            connection count.
          </p>
        </div>

        <div className="footer__col">
          <h4>Product</h4>
          {NAV_ITEMS.map((item) => (
            <HashLink key={item.href} to={item.href}>
              {item.label}
            </HashLink>
          ))}
        </div>

        <div className="footer__col">
          <h4>Get Sang</h4>
          <a href={LINKS.appStore} target="_blank" rel="noopener">App Store</a>
          <a href={LINKS.playStore} target="_blank" rel="noopener">Google Play</a>
        </div>

        <div className="footer__col">
          <h4>Company</h4>
          {/* Absolute path leaves this /app-mounted app for the CMS at the domain root. */}
          <a href="/">Event CRM</a>
          <Link to="/privacy">Privacy & Terms</Link>
          <a href={`mailto:${LINKS.email}`}>Contact</a>
        </div>
      </div>

      <div className="container footer__bottom">
        <span>© {year} Sang. All rights reserved.</span>
        <span>Made for real-world connections.</span>
      </div>
    </footer>
  )
}

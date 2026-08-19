import { useState, useEffect } from 'react'
import { HashLink } from './HashLink.jsx'
import Logo from './Logo.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { NAV_ITEMS, LINKS } from '../site.js'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="nav__inner container">
        <Logo />

        <nav className={`nav__links${open ? ' nav__links--open' : ''}`}>
          {NAV_ITEMS.map((item) => (
            <HashLink key={item.href} to={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </HashLink>
          ))}
          <a
            className="btn btn--primary nav__cta"
            href={LINKS.appStore}
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
          >
            Get the app
          </a>
        </nav>

        <div className="nav__actions">
          <ThemeToggle />
          <button
            className="nav__burger"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  )
}

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Menu, Sparkles, X } from 'lucide-react'
import { motion } from './motion'

const links = [
  { label: 'Platform', href: '#platform' },
  { label: 'SANG', href: '#sang-story' },
  { label: 'Scanner', href: '#platform' },
  { label: 'Organizer CRM', href: '#crowd' },
  { label: 'Solutions', href: '#use-cases' },
  { label: 'Pricing', href: '#pricing' },
]

export function Navbar({ onSignIn, onGetStarted }: { onSignIn: () => void; onGetStarted: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <header className={scrolled || open ? 'eos-nav scrolled' : 'eos-nav'}>
      <div className="eos-shell eos-nav-inner">
        <button className="eos-logo" onClick={scrollTop} type="button">
          <span className="eos-logo-mark"><Sparkles size={17} /></span>
          EventOS
        </button>

        <nav className="eos-nav-links" aria-label="Primary">
          {links.map((link) => (
            <a href={link.href} key={link.label}>{link.label}</a>
          ))}
        </nav>

        <div className="eos-nav-actions">
          <button className="eos-nav-signin" onClick={onSignIn} type="button">Sign In</button>
          <button className="eos-btn primary small" onClick={onGetStarted} type="button">Get Started</button>
          <button aria-label="Open menu" className="eos-burger" onClick={() => setOpen((v) => !v)} type="button">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="eos-mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="eos-mobile-menu-inner">
              {links.map((link) => (
                <a href={link.href} key={link.label} onClick={() => setOpen(false)}>{link.label}</a>
              ))}
              <div className="eos-mobile-actions">
                <button className="eos-btn ghost" onClick={() => { setOpen(false); onSignIn() }} type="button">Sign In</button>
                <button className="eos-btn primary" onClick={() => { setOpen(false); onGetStarted() }} type="button">Get Started</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

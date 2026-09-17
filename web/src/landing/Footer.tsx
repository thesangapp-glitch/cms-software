import { Reveal } from './primitives'
import { motion, useReducedMotion } from './motion'
import { HostwellMark } from '../brand'
import { sangAppStoreUrl, sangPlayStoreUrl, StoreLinks } from './StoreLinks'

type FooterLink = string | { label: string; href: string; external?: boolean }

const columns: { title: string; links: FooterLink[] }[] = [
  { title: 'Platform', links: [{ label: 'SANG', href: '#sang-story' }, { label: 'Scanner', href: '#platform' }, { label: 'Organizer CRM', href: '#crowd' }, 'Analytics', 'Networking'] },
  { title: 'Get SANG', links: [{ label: 'App Store (iPhone)', href: sangAppStoreUrl, external: true }, { label: 'Google Play (Android)', href: sangPlayStoreUrl, external: true }] },
  { title: 'Solutions', links: ['College Events', 'Corporate Events', 'Conferences', 'Exhibitions', 'Concerts', 'Sports Events'] },
  { title: 'Company', links: ['About', 'Careers', 'Contact', 'Enterprise'] },
  { title: 'Resources', links: ['Documentation', 'Help Center', 'Privacy', 'Terms'] },
  { title: 'Connect', links: ['LinkedIn', 'Instagram', 'X'] },
]

export function Footer() {
  const reduce = useReducedMotion()
  return (
    <footer className="eos-footer">
      <div className="eos-grid-bg" style={{ maskImage: 'radial-gradient(ellipse 80% 80% at 50% 100%, #000 30%, transparent 100%)' }} />
      <motion.div
        className="eos-orb"
        style={{ width: 500, height: 500, left: '50%', bottom: '-260px', transform: 'translateX(-50%)', background: 'radial-gradient(circle,#6366f1,transparent 70%)', opacity: 0.4 }}
        animate={reduce ? undefined : { opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="eos-shell" style={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div className="eos-footer-brand"><HostwellMark className="eos-footer-mark" size={72} />Hostwell</div>
          <div className="eos-footer-tag">Run every live event, end to end.</div>
          <StoreLinks label="Attendees use the SANG app" />
        </Reveal>

        <div className="eos-footer-cols">
          {columns.map((col) => (
            <div className="eos-footer-col" key={col.title}>
              <h5>{col.title}</h5>
              {col.links.map((link) => {
                if (typeof link === 'string') return <a href="#top" key={link}>{link}</a>
                return link.external
                  ? <a href={link.href} key={link.label} rel="noopener noreferrer" target="_blank">{link.label}</a>
                  : <a href={link.href} key={link.label}>{link.label}</a>
              })}
            </div>
          ))}
        </div>

        <div className="eos-footer-bottom">
          <span>© 2026 Hostwell. All rights reserved.</span>
          <span>One identity. One platform. One event ecosystem.</span>
        </div>
      </div>
    </footer>
  )
}

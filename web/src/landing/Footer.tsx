import { Reveal } from './primitives'
import { motion, useReducedMotion } from './motion'

const columns = [
  { title: 'Platform', links: ['SANG', 'Scanner', 'Organizer CRM', 'Analytics', 'Networking'] },
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
          <div className="eos-footer-brand">EventOS</div>
          <div className="eos-footer-tag">The Operating System for Live Events.</div>
        </Reveal>

        <div className="eos-footer-cols">
          {columns.map((col) => (
            <div className="eos-footer-col" key={col.title}>
              <h5>{col.title}</h5>
              {col.links.map((link) => (
                <a href="#top" key={link}>{link}</a>
              ))}
            </div>
          ))}
        </div>

        <div className="eos-footer-bottom">
          <span>© 2026 EventOS. All rights reserved.</span>
          <span>One identity. One platform. One event ecosystem.</span>
        </div>
      </div>
    </footer>
  )
}

import { ArrowRight, LayoutDashboard, ScanLine, Server, Smartphone } from 'lucide-react'
import { motion, useReducedMotion } from './motion'
import { AnimatedNumber, Reveal } from './primitives'

const metrics = [
  { value: 5420, label: 'Registered' },
  { value: 3821, label: 'Checked In' },
  { value: 3712, label: 'Inside' },
  { value: 184, label: 'VIP' },
  { value: 142, label: 'Volunteers' },
]

function ArchNode({
  icon,
  label,
  sub,
  tint,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  tint: string
}) {
  return (
    <div className="eos-arch-node">
      <span className="eos-arch-ico" style={{ background: tint }}>{icon}</span>
      <span className="eos-arch-txt">
        <small>{sub}</small>
        <strong>{label}</strong>
      </span>
    </div>
  )
}

function Architecture() {
  const reduce = useReducedMotion()
  return (
    <Reveal className="eos-arch" delay={0.2} immediate>
      <ArchNode icon={<LayoutDashboard size={19} />} sub="Command" label="Organizer CRM" tint="linear-gradient(135deg,#a855f7,#6366f1)" />
      <div className="eos-arch-conn" />
      <ArchNode icon={<Server size={19} />} sub="Core" label="EventOS Core" tint="linear-gradient(135deg,#6366f1,#22d3ee)" />
      <svg className="eos-arch-branch" viewBox="0 0 380 40" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="eos-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M190,2 C190,24 95,14 95,38" className={reduce ? undefined : 'eos-dash-flow'} />
        <path d="M190,2 C190,24 285,14 285,38" className={reduce ? undefined : 'eos-dash-flow'} />
      </svg>
      <div className="eos-arch-row">
        <ArchNode icon={<Smartphone size={19} />} sub="Identity" label="SANG App" tint="linear-gradient(135deg,#22d3ee,#34d399)" />
        <ArchNode icon={<ScanLine size={19} />} sub="Access" label="Scanner App" tint="linear-gradient(135deg,#fbbf24,#f0637a)" />
      </div>
    </Reveal>
  )
}

export function Hero({ onGetStarted, onExplore }: { onGetStarted: () => void; onExplore: () => void }) {
  const reduce = useReducedMotion()
  return (
    <section className="eos-hero" id="top">
      <div className="eos-grid-bg" />
      <motion.div
        className="eos-orb"
        style={{ width: 520, height: 520, left: '-10%', top: '-140px', background: 'radial-gradient(circle,#6366f1,transparent 70%)' }}
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="eos-orb"
        style={{ width: 460, height: 460, right: '-8%', top: '40px', background: 'radial-gradient(circle,#22d3ee,transparent 70%)' }}
        animate={reduce ? undefined : { x: [0, -36, 0], y: [0, 26, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="eos-shell" style={{ position: 'relative', zIndex: 1 }}>
        <Reveal immediate><span className="eos-eyebrow">Event operations, reimagined</span></Reveal>
        <Reveal immediate delay={0.08} as="div">
          <h1>The <span className="eos-gradient-text">Operating System</span> for Live Events.</h1>
        </Reveal>
        <Reveal immediate delay={0.16}>
          <p className="eos-lead center">
            Manage identity, registration, secure entry, crowd intelligence and networking
            from one connected platform.
          </p>
        </Reveal>
        <Reveal immediate delay={0.24}>
          <div className="eos-hero-cta">
            <button className="eos-btn primary" onClick={onGetStarted} type="button">
              Get Started <ArrowRight size={17} />
            </button>
            <button className="eos-btn ghost" onClick={onExplore} type="button">Explore Platform</button>
          </div>
        </Reveal>

        <Architecture />

        <Reveal delay={0.1} className="eos-hero-dash" immediate>
          <motion.div
            animate={reduce ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="eos-dash-bar">
              <span className="eos-dash-dot" /><span className="eos-dash-dot" /><span className="eos-dash-dot" />
              <span className="eos-dash-title">Organizer CRM · Flagship Program · Live</span>
              <span className="eos-dash-live"><i />LIVE</span>
            </div>
            <div className="eos-metric-grid">
              {metrics.map((m) => (
                <div className="eos-metric" key={m.label}>
                  <AnimatedNumber className="eos-metric-val" value={m.value} />
                  <div className="eos-metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  )
}

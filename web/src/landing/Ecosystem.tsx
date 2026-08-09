import {
  Check,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  IdCard,
  Link2Off,
  ScanLine,
  Users,
  UserX,
  XCircle,
} from 'lucide-react'
import { Reveal, Stagger } from './primitives'
import { QrMock, StatusBar } from './mockups'

const problems = [
  { icon: <Clock size={18} />, label: 'Long entry queues' },
  { icon: <UserX size={18} />, label: 'Manual verification' },
  { icon: <IdCard size={18} />, label: 'Physical ID cards' },
  { icon: <FileSpreadsheet size={18} />, label: 'Excel attendee lists' },
  { icon: <Users size={18} />, label: 'No live headcount' },
  { icon: <ScanLine size={18} />, label: 'No real-time crowd visibility' },
  { icon: <Link2Off size={18} />, label: 'Disconnected event systems' },
  { icon: <UserX size={18} />, label: 'Poor networking' },
]

function Problem() {
  return (
    <section className="eos-section" id="problem">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">The old way</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">Events shouldn't run on spreadsheets.</h2></Reveal>
        </div>
        <Stagger className="eos-problem-grid">
          {problems.map((p) => (
            <Stagger.Item key={p.label}>
              <div className="eos-problem-chip">{p.icon}<span>{p.label}</span></div>
            </Stagger.Item>
          ))}
        </Stagger>
        <Reveal delay={0.1} className="eos-better">
          <h3>There is a better way. <span className="eos-gradient-text">EventOS.</span></h3>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Product mockups ---------- */

function SangPhone() {
  return (
    <div className="eos-phone">
      <div className="eos-phone-screen">
        <StatusBar />
        <div className="eos-phone-brand">SANG</div>
        <div className="eos-phone-greet">Good morning, Raghav</div>
        <div style={{ fontSize: 12, color: 'var(--eos-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>My Events</div>
        <div className="eos-pass">
          <div className="eos-pass-row">
            <span className="eos-pass-title">Flagship Program</span>
            <span className="eos-badge vip">VIP</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--eos-muted)' }}>12 September · Gate 01</div>
          <QrMock />
        </div>
        <div className="eos-phone-cta">View Event</div>
      </div>
    </div>
  )
}

function ScannerPhone() {
  return (
    <div className="eos-phone">
      <div className="eos-phone-screen">
        <StatusBar />
        <div className="eos-phone-brand">Scanner</div>
        <div className="eos-scan ok">
          <div className="eos-scan-ring"><CheckCircle2 size={30} /></div>
          <h4>VERIFIED</h4>
          <div className="eos-scan-name">Raghav Sharma</div>
          <span className="eos-badge mint">SANG Verified</span>
          <div className="eos-scan-meta">VIP · Committee Member</div>
          <div className="eos-scan-meta">Flagship Program</div>
          <div className="eos-scan-status">Entry Allowed</div>
        </div>
        <div className="eos-scan blocked" style={{ minHeight: 96, flex: 'none' }}>
          <div className="eos-scan-ring"><XCircle size={26} /></div>
          <div className="eos-scan-status">Entry Blocked · Already Checked In</div>
          <div className="eos-scan-meta">09:42 AM · Gate 01</div>
        </div>
      </div>
    </div>
  )
}

function CrmDesktop() {
  return (
    <div className="eos-desktop">
      <div className="eos-desktop-top"><i /><i /><i /></div>
      <div className="eos-desktop-body">
        <div className="eos-mini"><div className="v">5,420</div><div className="l">Registered</div></div>
        <div className="eos-mini"><div className="v">3,712</div><div className="l">Inside</div></div>
        <div className="eos-mini wide">
          <div className="l">Venue occupancy · 74%</div>
          <div className="eos-bar-track"><div className="eos-bar-fill" style={{ width: '74%' }} /></div>
        </div>
        <div className="eos-mini"><div className="v">184</div><div className="l">VIP</div></div>
        <div className="eos-mini"><div className="v">4</div><div className="l">Active gates</div></div>
      </div>
    </div>
  )
}

const products = [
  {
    label: 'Attendee Identity',
    title: 'Your identity. Your events. Your network.',
    glow: 'rgba(34,211,238,0.28)',
    blurb: 'SANG is the attendee-facing digital identity layer — one profile that carries across every event.',
    features: ['Verified digital identity', 'Digital business card', 'Event passes & QR identity', 'Networking & schedule', 'Notifications & event history'],
    mock: <SangPhone />,
  },
  {
    label: 'Security & Entry',
    title: 'Don’t just scan the QR. Verify the person.',
    glow: 'rgba(251,191,36,0.24)',
    blurb: 'The Scanner App gives guards and staff real identity verification at the gate — not just a code check.',
    features: ['SANG identity verification', 'Event & category checks', 'Gate permissions', 'Duplicate detection', 'Check-in / out · offline scanning'],
    mock: <ScannerPhone />,
  },
  {
    label: 'Event Command Center',
    title: 'Your event. One command center.',
    glow: 'rgba(168,85,247,0.26)',
    blurb: 'The Organizer CRM runs the whole operation — registration, roles, gates and live analytics.',
    features: ['Event creation & CSV upload', 'Attendee management', 'Role-based permissions', 'Gate management & live occupancy', 'Notifications, reports & analytics'],
    mock: <CrmDesktop />,
  },
]

function Platform() {
  return (
    <section className="eos-section" id="platform">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">The ecosystem</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">One platform. Every event operation.</h2></Reveal>
          <Reveal delay={0.12}>
            <p className="eos-lead center">
              SANG is identity. Scanner is access. CRM is operations. One identity, one platform,
              one connected event ecosystem.
            </p>
          </Reveal>
        </div>

        <div className="eos-platform-grid">
          {products.map((p, i) => (
            <Reveal key={p.label} delay={i * 0.08}>
              <div className="eos-product-card" style={{ '--card-glow': p.glow } as React.CSSProperties}>
                <span className="eos-product-label">{p.label}</span>
                <h3>{p.title}</h3>
                <p className="eos-lead" style={{ fontSize: 14.5, margin: 0 }}>{p.blurb}</p>
                <div style={{ padding: '10px 0 4px' }}>{p.mock}</div>
                <ul className="eos-feature-list">
                  {p.features.map((f) => (
                    <li key={f}><Check size={15} />{f}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Ecosystem() {
  return (
    <>
      <Problem />
      <Platform />
    </>
  )
}

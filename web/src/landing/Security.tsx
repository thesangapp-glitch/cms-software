import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Check,
  Cloud,
  Database,
  Eye,
  FunctionSquare,
  GraduationCap,
  Image,
  Music,
  ScanLine,
  Shield,
  ShieldCheck,
  Store,
  Trophy,
  UserCog,
} from 'lucide-react'
import { Reveal } from './primitives'

const checks = [
  'Verified SANG account',
  'Event registration',
  'Active event pass',
  'Category permission',
  'Gate permission',
  'Entry status',
  'Duplicate status',
  'Real-time revocation',
]

const stack = [
  { icon: <ShieldCheck size={16} />, label: 'Firebase Authentication' },
  { icon: <Database size={16} />, label: 'Cloud Firestore' },
  { icon: <FunctionSquare size={16} />, label: 'Cloud Functions' },
  { icon: <Cloud size={16} />, label: 'Firebase Storage' },
  { icon: <Bell size={16} />, label: 'Cloud Messaging' },
  { icon: <BarChart3 size={16} />, label: 'Firebase Analytics' },
]

function SecuritySection() {
  return (
    <section className="eos-section" id="security">
      <div className="eos-shell">
        <div className="eos-sec">
          <div>
            <Reveal><span className="eos-eyebrow">Security</span></Reveal>
            <Reveal delay={0.06}><h2 className="eos-h2">Built around verified identity.</h2></Reveal>
            <Reveal delay={0.12}>
              <p className="eos-lead">
                Every entry is checked against real identity — not just a QR image. If any check
                fails, the gate stays closed.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <div className="eos-check-list">
                {checks.map((c) => (
                  <div key={c}><Check size={15} />{c}</div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="eos-stack">
              <div className="eos-stack-top">
                <span>SANG</span><span>Scanner</span><span>CRM</span>
              </div>
              <div style={{ textAlign: 'center', color: 'var(--eos-faint)', margin: '4px 0 14px' }}>
                <Shield size={18} />
              </div>
              <div className="eos-stack-list">
                {stack.map((s) => (
                  <div key={s.label}>{s.icon}{s.label}</div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

const roles = [
  { icon: <Shield size={18} />, name: 'Super Admin', desc: 'Full platform access' },
  { icon: <UserCog size={18} />, name: 'Event Admin', desc: 'Event management' },
  { icon: <Briefcase size={18} />, name: 'Committee Head', desc: 'Volunteers + attendees' },
  { icon: <Building2 size={18} />, name: 'Gate Manager', desc: 'Gate operations' },
  { icon: <ScanLine size={18} />, name: 'Guard', desc: 'Scanning only' },
  { icon: <Eye size={18} />, name: 'Analytics', desc: 'Read-only reports' },
]

function Roles() {
  return (
    <section className="eos-section tight" id="roles">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Role-based access</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">Everyone sees what they need.</h2></Reveal>
        </div>
        <div className="eos-roles-grid">
          {roles.map((r, i) => (
            <Reveal key={r.name} delay={(i % 3) * 0.06}>
              <div className="eos-role">
                <div className="eos-role-ico">{r.icon}</div>
                <strong>{r.name}</strong>
                <span>{r.desc}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const useCases = [
  { icon: <GraduationCap size={22} />, tint: 'linear-gradient(135deg,#6366f1,#22d3ee)', title: 'College Festivals', desc: 'Manage thousands of students, VIPs, committee members and volunteers.' },
  { icon: <Briefcase size={22} />, tint: 'linear-gradient(135deg,#a855f7,#6366f1)', title: 'Corporate Conferences', desc: 'Digital identity, secure entry and professional networking.' },
  { icon: <Store size={22} />, tint: 'linear-gradient(135deg,#22d3ee,#34d399)', title: 'Exhibitions', desc: 'Attendee tracking and sponsor lead generation.' },
  { icon: <Image size={22} />, tint: 'linear-gradient(135deg,#fbbf24,#f0637a)', title: 'Startup Events', desc: 'Networking plus verified professional identity.' },
  { icon: <Music size={22} />, tint: 'linear-gradient(135deg,#f0637a,#a855f7)', title: 'Concerts', desc: 'Fast entry and real-time crowd visibility.' },
  { icon: <Trophy size={22} />, tint: 'linear-gradient(135deg,#34d399,#22d3ee)', title: 'Sports Events', desc: 'Staff, players, VIP and audience management.' },
]

function UseCases() {
  return (
    <section className="eos-section" id="use-cases">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Solutions</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">One platform, every kind of event.</h2></Reveal>
        </div>
        <div className="eos-use-grid">
          {useCases.map((u, i) => (
            <Reveal key={u.title} delay={(i % 3) * 0.07}>
              <div className="eos-use">
                <div className="eos-use-ico" style={{ background: u.tint }}>{u.icon}</div>
                <h4>{u.title}</h4>
                <p>{u.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Security() {
  return (
    <>
      <SecuritySection />
      <Roles />
      <UseCases />
    </>
  )
}

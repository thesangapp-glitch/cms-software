import { ArrowLeftRight } from 'lucide-react'
import { AnimatedNumber, Parallax, Reveal, Stagger } from './primitives'
import { QrMock, StatusBar } from './mockups'

const steps = [
  { n: '01', t: 'Upload', d: 'Organizer uploads a CSV of attendees — name, phone, email and category — straight into the CRM.' },
  { n: '02', t: 'Match', d: 'EventOS matches each phone and email against existing SANG identities in real time.' },
  { n: '03', t: 'Event Pass', d: 'If the person already has SANG, the event appears automatically in their app. If not, they get an invite.' },
  { n: '04', t: 'Verify', d: 'At the gate, the attendee shows their SANG QR. The Scanner verifies identity, event, category, gate and status.' },
  { n: '05', t: 'Check In', d: 'Entry is recorded instantly, with duplicate and permission checks applied before the gate opens.' },
  { n: '06', t: 'Live Data', d: 'The CRM updates live — registered, checked in, inside, exited, VIP and no-shows — as it happens.' },
]

function CoreWorkflow() {
  return (
    <section className="eos-section" id="workflow">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Core workflow</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">From spreadsheet to live event intelligence.</h2></Reveal>
        </div>
        <Stagger className="eos-flow">
          {steps.map((s) => (
            <Stagger.Item key={s.n}>
              <div className="eos-flow-step">
                <div className="eos-flow-num">{s.n}</div>
                <div>
                  <h4>{s.t}</h4>
                  <p>{s.d}</p>
                </div>
              </div>
            </Stagger.Item>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

const chain = [
  { k: '1', t: 'Organizer uploads CSV' },
  { k: '2', t: 'EventOS matches phone / email' },
  { k: '3', t: 'Existing SANG account?' },
  { k: '✓', t: 'Yes → event appears automatically in SANG' },
  { k: '+', t: 'No → attendee is invited to SANG' },
]

function SangStory() {
  return (
    <section className="eos-section" id="sang-story">
      <div className="eos-grid-bg" />
      <div className="eos-shell">
        <div className="eos-split">
          <div>
            <Reveal><span className="eos-eyebrow">The identity layer</span></Reveal>
            <Reveal delay={0.06}><h2 className="eos-h2">One identity. Every event.</h2></Reveal>
            <Reveal delay={0.12}>
              <p className="eos-lead">
                SANG is already a digital business card and identity app. EventOS simply adds an
                events layer on top — so the moment an organizer uploads their list, the event
                shows up inside the attendee's existing SANG profile.
              </p>
            </Reveal>
            <Stagger className="eos-chain">
              {chain.map((c) => (
                <Stagger.Item key={c.t}>
                  <div className="eos-chain-item"><span className="k">{c.k}</span>{c.t}</div>
                </Stagger.Item>
              ))}
            </Stagger>
          </div>

          <Parallax distance={40}>
            <Reveal delay={0.1}>
              <div className="eos-phone">
                <div className="eos-phone-screen">
                  <StatusBar />
                  <div className="eos-phone-brand">SANG</div>
                  <div className="eos-phone-greet">A new event just appeared</div>
                  <div className="eos-pass">
                    <div className="eos-pass-row">
                      <span className="eos-pass-title">THOMSO 2027</span>
                      <span className="eos-badge vip">VIP</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--eos-muted)' }}>Added from Organizer CRM · 12 Sep</div>
                    <QrMock />
                  </div>
                  <div className="eos-phone-cta">Open pass</div>
                </div>
              </div>
            </Reveal>
          </Parallax>
        </div>
      </div>
    </section>
  )
}

const crowd = [
  { value: 5420, label: 'Registered' },
  { value: 3821, label: 'Checked In' },
  { value: 3712, label: 'Inside' },
  { value: 108, label: 'Exited' },
  { value: 184, label: 'VIP' },
  { value: 142, label: 'Volunteers' },
]

const gates = [
  { name: 'Gate 01', value: 1204, pct: 100 },
  { name: 'Gate 02', value: 932, pct: 77 },
  { name: 'Gate 03', value: 876, pct: 73 },
  { name: 'Gate 04', value: 809, pct: 67 },
]

function CrowdIntelligence() {
  return (
    <section className="eos-section" id="crowd">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Live crowd intelligence</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">Know who's inside. In real time.</h2></Reveal>
        </div>

        <div className="eos-crowd">
          <Reveal>
            <div className="eos-crowd-metrics">
              {crowd.map((m) => (
                <div className="eos-crowd-metric" key={m.label}>
                  <AnimatedNumber className="v" value={m.value} />
                  <div className="l">{m.label}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="eos-capacity">
              <span className="eos-dash-live" style={{ marginLeft: 0, marginBottom: 8 }}><i />Venue capacity</span>
              <div className="eos-cap-big"><AnimatedNumber value={3712} /> / 5,000</div>
              <div style={{ color: 'var(--eos-muted)', fontSize: 13, marginTop: 2 }}>74% occupancy</div>
              <div className="eos-bar-track" style={{ height: 10, marginTop: 14 }}>
                <div className="eos-bar-fill" style={{ width: '74%' }} />
              </div>
              <div style={{ marginTop: 8, borderTop: '1px solid var(--eos-line)', paddingTop: 14 }}>
                {gates.map((g) => (
                  <div className="eos-gate-row" key={g.name}>
                    <span>{g.name}</span>
                    <div className="eos-bar-track" style={{ flex: 1, marginTop: 0 }}>
                      <div className="eos-bar-fill" style={{ width: `${g.pct}%` }} />
                    </div>
                    <strong><AnimatedNumber value={g.value} /></strong>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Networking() {
  return (
    <section className="eos-section" id="networking">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Beyond the gate</span></Reveal>
          <Reveal delay={0.06}>
            <h2 className="eos-h2 center">Entry gets people inside. Networking makes it valuable.</h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="eos-lead center">
              SANG's digital business card stays useful long after check-in — attendees exchange
              cards, discover people, and connect with sponsors and speakers.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="eos-net">
            <div className="eos-net-card">
              <div className="eos-net-avatar" style={{ background: 'linear-gradient(135deg,#6366f1,#22d3ee)' }}>R</div>
              <strong>Raghav</strong>
              <span>Product Manager · SANG</span>
            </div>
            <div className="eos-net-link"><ArrowLeftRight size={20} /></div>
            <div className="eos-net-card">
              <div className="eos-net-avatar" style={{ background: 'linear-gradient(135deg,#a855f7,#fbbf24)' }}>A</div>
              <strong>Aman</strong>
              <span>Founder · SANG</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const phases = [
  { tag: 'Before', items: ['Registration', 'CSV upload', 'Identity matching', 'Event pass', 'Notifications'] },
  { tag: 'During', items: ['QR verification', 'Identity verification', 'Check-in', 'Live occupancy', 'Networking'] },
  { tag: 'After', items: ['Attendance report', 'Networking insights', 'Certificates', 'Feedback', 'Event history'] },
]

function Lifecycle() {
  return (
    <section className="eos-section" id="lifecycle">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Event lifecycle</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">One platform, start to finish.</h2></Reveal>
        </div>
        <div className="eos-timeline">
          {phases.map((p, i) => (
            <Reveal key={p.tag} delay={i * 0.1}>
              <div className="eos-phase">
                <span className="eos-phase-tag">{p.tag}</span>
                <h4>{i === 0 ? 'Plan & prepare' : i === 1 ? 'Run the event' : 'Measure & follow up'}</h4>
                <ul>
                  {p.items.map((it) => (
                    <li key={it}><i />{it}</li>
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

export function Workflow() {
  return (
    <>
      <CoreWorkflow />
      <SangStory />
      <CrowdIntelligence />
      <Networking />
      <Lifecycle />
    </>
  )
}

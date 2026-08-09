import { ArrowRight, Check } from 'lucide-react'
import { Reveal } from './primitives'

const tiers = [
  {
    name: 'Starter',
    cost: '₹4,999',
    unit: '/ event',
    desc: 'For smaller events getting started with connected operations.',
    features: [
      'Up to 500 attendees',
      'Event dashboard',
      'CSV upload',
      'SANG event passes',
      'QR verification',
      'Basic attendance',
      'Basic reports',
      'Limited scanner devices',
    ],
    cta: 'Get Started',
    featured: false,
  },
  {
    name: 'Professional',
    cost: '₹14,999',
    unit: '/ event',
    desc: 'For serious events that need live operations and analytics.',
    features: [
      'Up to 5,000 attendees',
      'Everything in Starter',
      'Unlimited gates',
      'Live occupancy',
      'Advanced analytics',
      'Role-based access',
      'Multiple scanners',
      'Notifications',
      'Networking analytics',
      'Priority support',
    ],
    cta: 'Choose Professional',
    featured: true,
  },
  {
    name: 'Enterprise',
    cost: 'Custom',
    unit: '',
    desc: 'For organizations running events at scale across teams.',
    features: [
      'Unlimited attendees',
      'Multiple organizations',
      'Multi-event management',
      'Advanced permissions',
      'SSO',
      'API access',
      'Custom branding',
      'Custom integrations',
      'Advanced analytics',
      'Dedicated support · SLA',
      'Custom onboarding',
    ],
    cta: 'Talk to Sales',
    featured: false,
  },
]

function PricingSection({ onGetStarted, onTalkToSales }: { onGetStarted: () => void; onTalkToSales: () => void }) {
  return (
    <section className="eos-section" id="pricing">
      <div className="eos-shell">
        <div className="eos-section-head center">
          <Reveal><span className="eos-eyebrow">Pricing</span></Reveal>
          <Reveal delay={0.06}><h2 className="eos-h2 center">Simple pricing. Built to scale with your events.</h2></Reveal>
        </div>
        <div className="eos-price-grid">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <div className={t.featured ? 'eos-price featured' : 'eos-price'}>
                {t.featured && <span className="eos-price-tag">Most Popular</span>}
                <span className="eos-price-name">{t.name}</span>
                <div className="eos-price-cost">{t.cost}{t.unit && <small> {t.unit}</small>}</div>
                <p className="eos-price-desc">{t.desc}</p>
                <ul className="eos-feature-list">
                  {t.features.map((f) => (
                    <li key={f}><Check size={15} />{f}</li>
                  ))}
                </ul>
                <button
                  className={t.featured ? 'eos-btn primary' : 'eos-btn ghost'}
                  onClick={t.name === 'Enterprise' ? onTalkToSales : onGetStarted}
                  type="button"
                >
                  {t.cta}
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const entCaps = [
  'Organization-level management',
  'Multi-event operations',
  'Centralized identity',
  'Advanced permissions',
  'Custom branding',
  'API integrations',
  'SSO',
  'Dedicated support',
  'Advanced analytics',
  'Custom workflows',
]

function EnterpriseSection({ onTalkToSales }: { onTalkToSales: () => void }) {
  return (
    <section className="eos-section tight" id="enterprise">
      <div className="eos-shell">
        <Reveal>
          <div className="eos-ent">
            <span className="eos-eyebrow">Enterprise</span>
            <h2 className="eos-h2" style={{ marginTop: 18 }}>Built for organizations that run events at scale.</h2>
            <p className="eos-lead">
              Enterprise customers manage hundreds of events, thousands of attendees and multiple
              teams — all under one centralized identity and permission model.
            </p>
            <div className="eos-ent-grid">
              {entCaps.map((c) => (
                <div key={c}><Check size={16} />{c}</div>
              ))}
            </div>
            <button className="eos-btn primary" onClick={onTalkToSales} type="button">
              Talk to Sales <ArrowRight size={17} />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function FinalCTA({ onGetStarted, onTalkToSales }: { onGetStarted: () => void; onTalkToSales: () => void }) {
  return (
    <section className="eos-final" id="get-started">
      <div className="eos-grid-bg" />
      <div className="eos-orb" style={{ width: 560, height: 560, left: '50%', top: '-40%', transform: 'translateX(-50%)', background: 'radial-gradient(circle,#6366f1,transparent 70%)' }} />
      <div className="eos-shell" style={{ position: 'relative', zIndex: 1 }}>
        <Reveal><span className="eos-eyebrow">Get started</span></Reveal>
        <Reveal delay={0.06}>
          <h2>Ready to run events <span className="eos-gradient-text">differently?</span></h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="eos-lead center">
            Bring identity, entry, operations and networking into one connected platform.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="eos-hero-cta">
            <button className="eos-btn primary" onClick={onGetStarted} type="button">
              Get Started <ArrowRight size={17} />
            </button>
            <button className="eos-btn ghost" onClick={onTalkToSales} type="button">Talk to Sales</button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Pricing({ onGetStarted, onTalkToSales }: { onGetStarted: () => void; onTalkToSales: () => void }) {
  return (
    <>
      <PricingSection onGetStarted={onGetStarted} onTalkToSales={onTalkToSales} />
      <EnterpriseSection onTalkToSales={onTalkToSales} />
      <FinalCTA onGetStarted={onGetStarted} onTalkToSales={onTalkToSales} />
    </>
  )
}
